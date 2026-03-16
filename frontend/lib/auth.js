/**
 * Auth context — wraps the entire app so any component can access the current
 * user, token, and auth actions (login / register / logout / authFetch).
 *
 * Session is persisted to localStorage so it survives page refreshes.
 * Token is sent as a Bearer header on every authFetch() call.
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  // true while we're rehydrating from localStorage on first mount
  const [loading, setLoading] = useState(true);

  // ── Rehydrate session from localStorage ────────────────────────────────────
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem('auth-token');
      const storedUser = localStorage.getItem('auth-user');
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // corrupted storage — start fresh
      localStorage.removeItem('auth-token');
      localStorage.removeItem('auth-user');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Persist session ─────────────────────────────────────────────────────────
  const _saveSession = (accessToken, userRecord) => {
    setToken(accessToken);
    setUser(userRecord);
    localStorage.setItem('auth-token', accessToken);
    localStorage.setItem('auth-user', JSON.stringify(userRecord));
  };

  const _clearSession = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-user');
  };

  // ── Auth actions ────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/login — returns the Token response and saves the session.
   * Throws a human-readable Error on failure.
   */
  const login = useCallback(async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail || `Login failed (${res.status})`);
    }

    const data = await res.json();
    _saveSession(data.access_token, data.user);
    return data;
  }, []);

  /**
   * POST /api/auth/register — creates a new account, then auto-logs in.
   * Throws a human-readable Error on failure.
   */
  const register = useCallback(
    async (email, password, fullName) => {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName || null }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Registration failed (${res.status})`);
      }

      // Auto-login after successful registration
      return login(email, password);
    },
    [login]
  );

  /**
   * POST /api/auth/logout — fires the server-side signal then clears the
   * local session regardless of the response (JWT is stateless).
   */
  const logout = useCallback(async () => {
    if (token) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {}); // fire and forget
    }
    _clearSession();
  }, [token]);

  /**
   * Convenience wrapper around fetch() that automatically attaches the
   * Authorization header when a token is present.
   */
  const authFetch = useCallback(
    (url, options = {}) =>
      fetch(url, {
        ...options,
        headers: {
          ...options.headers,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      }),
    [token]
  );

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, authFetch }}>
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
