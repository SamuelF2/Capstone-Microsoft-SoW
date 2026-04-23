/**
 * MSAL.js configuration for Microsoft Entra ID authentication.
 *
 * Uses Authorization Code flow with PKCE (MSAL.js default for SPAs).
 * Only one PublicClientApplication instance should exist per app.
 */
import { PublicClientApplication, LogLevel } from '@azure/msal-browser';

const clientId = process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || '';

export const msalConfig = {
  auth: {
    clientId,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    postLogoutRedirectUri:
      typeof window !== 'undefined'
        ? `${window.location.origin}/login`
        : 'http://localhost:3000/login',
  },
  cache: {
    // Tradeoff: localStorage persists the token cache across tabs so the user
    // gets single sign-on when they open the app in a new tab — sessionStorage
    // is tab-scoped and forces a fresh auth dance on every new tab, which
    // showed up in user testing as the top friction point.
    //
    // The cost is a larger XSS blast radius: any script that runs on the
    // page can read the cached tokens. MSAL's own guidance frames this as
    // an explicit tradeoff rather than a recommendation — the compensating
    // control is a strict Content-Security-Policy that keeps third-party
    // script out of the page. That CSP is a Sprint 6 follow-up; until it
    // lands, treat the frontend as XSS-sensitive and review any new raw-HTML
    // rendering or third-party embed carefully.
    cacheLocation: 'localStorage',
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
  },
};

/** Scopes requested during the login popup (ID token). */
export const loginRequest = {
  scopes: ['openid', 'profile', 'email'],
};

/** Singleton MSAL instance — lazy-initialized, null if client ID is not set. */
let _msalInstance = null;

export function getMsalInstance() {
  if (!_msalInstance && clientId) {
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}
