/**
 * Auth context — Microsoft Entra ID via MSAL.js.
 *
 * Wraps the entire app so any component can access the current user and
 * auth actions (login / logout / authFetch).
 *
 * Token storage is managed by MSAL internally (sessionStorage).
 * Access tokens are treated as opaque — only the backend validates them.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { InteractionRequiredAuthError, BrowserAuthError } from '@azure/msal-browser';
import { getMsalInstance, loginRequest } from './msalConfig';

const AuthContext = createContext(null);

// localStorage key used to persist the testing-only role override.
// Cleared on logout or via the "Clear override" button in Account settings.
const ROLE_OVERRIDE_KEY = 'role-override';

function readStoredRoleOverride() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ROLE_OVERRIDE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredRoleOverride(role) {
  if (typeof window === 'undefined') return;
  try {
    if (role) window.localStorage.setItem(ROLE_OVERRIDE_KEY, role);
    else window.localStorage.removeItem(ROLE_OVERRIDE_KEY);
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Kept as a ref so it's preserved across re-renders and applied to every
  // user load (even after relogin).
  const roleOverrideRef = useRef(null);
  const msalRef = useRef(getMsalInstance());
  const tokenRef = useRef(null);

  // Apply the stored role override to a freshly loaded user object.
  const applyRoleOverride = useCallback((rawUser) => {
    if (!rawUser) return rawUser;
    const override = roleOverrideRef.current;
    return override ? { ...rawUser, role: override, _baseRole: rawUser.role } : rawUser;
  }, []);

  // ── Token acquisition (silent with interactive fallback) ──────────────────
  // Uses the ID token (not a custom API access token) for backend auth.
  // The ID token contains all claims the backend needs (oid, name, email, roles)
  // and avoids the need to configure "Expose an API" scopes in the App Registration.
  const _acquireToken = async (msal) => {
    const account = msal.getActiveAccount();
    if (!account) return tokenRef.current; // fallback to cached token

    try {
      const response = await msal.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      tokenRef.current = response.idToken;
      return response.idToken;
    } catch (err) {
      // If silent fails, try popup — but if that also fails (COOP, blocked),
      // fall back to the last known good token
      if (err instanceof InteractionRequiredAuthError || err instanceof BrowserAuthError) {
        try {
          const response = await msal.acquireTokenPopup(loginRequest);
          tokenRef.current = response.idToken;
          return response.idToken;
        } catch {
          // Popup blocked or COOP issue — use cached token if still valid
          return tokenRef.current;
        }
      }
      return tokenRef.current;
    }
  };

  // ── Initialize MSAL and rehydrate session ─────────────────────────────────
  useEffect(() => {
    // Rehydrate the stored role override before we load the user so it's
    // applied to the very first render.
    roleOverrideRef.current = readStoredRoleOverride();

    const init = async () => {
      const msal = msalRef.current;
      if (!msal) {
        setLoading(false);
        return;
      }

      try {
        await msal.initialize();
        // Required on every page load to complete any in-progress redirect flows
        await msal.handleRedirectPromise();

        const accounts = msal.getAllAccounts();
        if (accounts.length > 0) {
          msal.setActiveAccount(accounts[0]);
          // Fetch user profile from backend
          const token = await _acquireToken(msal);
          if (token) {
            const res = await fetch('/api/auth/me', {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) setUser(applyRoleOverride(await res.json()));
          }
        }
      } catch (err) {
        console.error('MSAL init error:', err);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [applyRoleOverride]);

  /** Get a token for API calls. */
  const getAccessToken = useCallback(async () => {
    const msal = msalRef.current;
    if (!msal) return tokenRef.current;
    return _acquireToken(msal);
  }, []);

  /** Sign in via Microsoft popup. */
  const login = useCallback(async () => {
    const msal = msalRef.current;
    if (!msal) throw new Error('MSAL not initialized — is NEXT_PUBLIC_AZURE_CLIENT_ID set?');

    const response = await msal.loginPopup(loginRequest);
    msal.setActiveAccount(response.account);

    // Cache the ID token
    tokenRef.current = response.idToken;

    const meRes = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${response.idToken}` },
    });
    if (meRes.ok) {
      setUser(applyRoleOverride(await meRes.json()));
    } else {
      const body = await meRes.json().catch(() => ({}));
      throw new Error(body.detail || `Authentication failed (${meRes.status})`);
    }
  }, [applyRoleOverride]);

  /** Sign out via Microsoft popup. Also clears the role override. */
  const logout = useCallback(async () => {
    const msal = msalRef.current;
    if (msal) {
      try {
        await msal.logoutPopup();
      } catch {
        // User may have closed the popup — clear local state anyway
      }
    }
    tokenRef.current = null;
    roleOverrideRef.current = null;
    writeStoredRoleOverride(null);
    setUser(null);
  }, []);

  /**
   * Fetch wrapper that automatically acquires and attaches the Entra
   * ID token as a Bearer header.
   */
  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = await getAccessToken();
      return fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
    },
    [getAccessToken]
  );

  /**
   * Override the user's role locally for testing purposes. Persists to
   * localStorage so the override survives reloads. The original role is kept
   * as `user._baseRole` so the UI can show both if needed.
   */
  const overrideRole = useCallback((role) => {
    roleOverrideRef.current = role || null;
    writeStoredRoleOverride(role || null);
    setUser((prev) => {
      if (!prev) return prev;
      if (!role) {
        // Clearing: revert to the original role if we stashed one.
        const base = prev._baseRole ?? prev.role;
        const { _baseRole, ...rest } = prev;
        return { ...rest, role: base };
      }
      const base = prev._baseRole ?? prev.role;
      return { ...prev, role, _baseRole: base };
    });
  }, []);

  /** Clear any active role override and revert to the user's real role. */
  const clearRoleOverride = useCallback(() => {
    overrideRole(null);
  }, [overrideRole]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        authFetch,
        getAccessToken,
        overrideRole,
        clearRoleOverride,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/** Access the auth context from any component. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
