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
    cacheLocation: 'sessionStorage',
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

/**
 * Scopes for acquiring an access token to call the backend API.
 * Must match the scope exposed in Azure Portal > App Registration > Expose an API.
 */
export const apiTokenRequest = {
  scopes: [process.env.NEXT_PUBLIC_AZURE_API_SCOPE || `api://${clientId}/SoW.Read`],
};

/** Singleton MSAL instance — lazy-initialized, null if client ID is not set. */
let _msalInstance = null;

export function getMsalInstance() {
  if (!_msalInstance && clientId) {
    _msalInstance = new PublicClientApplication(msalConfig);
  }
  return _msalInstance;
}
