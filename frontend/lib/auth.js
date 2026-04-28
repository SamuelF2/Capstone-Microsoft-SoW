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

// Module-level constant — not inside the component.
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// sessionStorage key used to persist the testing-only role override.
const ROLE_OVERRIDE_KEY = 'role-override';

function readStoredRoleOverride() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(ROLE_OVERRIDE_KEY) || null;
  } catch {
    return null;
  }
}

function writeStoredRoleOverride(role) {
  if (typeof window === 'undefined') return;
  try {
    if (role) window.sessionStorage.setItem(ROLE_OVERRIDE_KEY, role);
    else window.sessionStorage.removeItem(ROLE_OVERRIDE_KEY);
  } catch {
    // Ignore storage errors (private mode, quota, etc.)
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const roleOverrideRef = useRef(null);
  const msalRef = useRef(getMsalInstance());
  const tokenRef = useRef(null);
  const tokenPromiseRef = useRef(null);

  // Apply the stored role override to a freshly loaded user object.
  const applyRoleOverride = useCallback((rawUser) => {
    if (!rawUser) return rawUser;
    const override = roleOverrideRef.current;
    return override ? { ...rawUser, role: override, _baseRole: rawUser.role } : rawUser;
  }, []);

  const _acquireTokenInner = async (msal) => {
    const account = msal.getActiveAccount();
    if (!account) return tokenRef.current;

    try {
      const response = await msal.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      tokenRef.current = response.idToken;
      return response.idToken;
    } catch (err) {
      if (err instanceof InteractionRequiredAuthError || err instanceof BrowserAuthError) {
        try {
          const response = await msal.acquireTokenPopup(loginRequest);
          tokenRef.current = response.idToken;
          return response.idToken;
        } catch {
          return tokenRef.current;
        }
      }
      return tokenRef.current;
    }
  };

  const _acquireToken = (msal) => {
    if (tokenPromiseRef.current) return tokenPromiseRef.current;
    const p = _acquireTokenInner(msal).finally(() => {
      tokenPromiseRef.current = null;
    });
    tokenPromiseRef.current = p;
    return p;
  };

  useEffect(() => {
    roleOverrideRef.current = readStoredRoleOverride();

    const init = async () => {
      const msal = msalRef.current;
      if (!msal) {
        setLoading(false);
        return;
      }

      try {
        await msal.initialize();
        await msal.handleRedirectPromise();

        const accounts = msal.getAllAccounts();
        if (accounts.length > 0) {
          msal.setActiveAccount(accounts[0]);
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

  const getAccessToken = useCallback(async () => {
    const msal = msalRef.current;
    if (!msal) return tokenRef.current;
    return _acquireToken(msal);
  }, []);

  const login = useCallback(async () => {
    const msal = msalRef.current;
    if (!msal) throw new Error('MSAL not initialized — is NEXT_PUBLIC_AZURE_CLIENT_ID set?');

    const response = await msal.loginPopup(loginRequest);
    msal.setActiveAccount(response.account);
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

  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = await getAccessToken();
      const doFetch = (t) =>
        fetch(url, {
          ...options,
          headers: {
            ...options.headers,
            ...(t ? { Authorization: `Bearer ${t}` } : {}),
          },
        });

      let res = await doFetch(token);
      if (res.status !== 401) return res;

      tokenRef.current = null;
      tokenPromiseRef.current = null;
      let fresh = null;
      try {
        fresh = await getAccessToken();
      } catch {
        fresh = null;
      }
      if (fresh && fresh !== token) {
        res = await doFetch(fresh);
        if (res.status !== 401) return res;
      }

      try {
        tokenRef.current = null;
        roleOverrideRef.current = null;
        writeStoredRoleOverride(null);
        setUser(null);
      } catch {
        // ignore
      }
      if (typeof window !== 'undefined') {
        const here = window.location.pathname + window.location.search;
        if (!here.startsWith('/login')) {
          window.location.assign(`/login?next=${encodeURIComponent(here)}`);
        }
      }
      return res;
    },
    [getAccessToken]
  );

  const overrideRole = useCallback(async (role) => {
    roleOverrideRef.current = role || null;
    writeStoredRoleOverride(role || null);
    setUser((prev) => {
      if (!prev) return prev;
      if (!role) {
        const base = prev._baseRole ?? prev.role;
        const { _baseRole, ...rest } = prev;
        return { ...rest, role: base };
      }
      const base = prev._baseRole ?? prev.role;
      return { ...prev, role, _baseRole: base };
    });

    if (role) {
      try {
        const token = await getAccessToken();
        await fetch(`${API}/api/users/me/role`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ role }),
        });
      } catch {
        console.warn('overrideRole: failed to sync role to backend');
      }
    }
  }, [getAccessToken]);

  const clearRoleOverride = useCallback(async () => {
    roleOverrideRef.current = null;
    writeStoredRoleOverride(null);

    const baseRole = user?._baseRole;
    setUser((prev) => {
      if (!prev) return prev;
      const base = prev._baseRole ?? prev.role;
      const { _baseRole, ...rest } = prev;
      return { ...rest, role: base };
    });

    if (baseRole) {
      try {
        const token = await getAccessToken();
        await fetch(`${API}/api/users/me/role`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ role: baseRole }),
        });
      } catch {
        console.warn('clearRoleOverride: failed to sync role to backend');
      }
    }
  }, [getAccessToken, user]);

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
