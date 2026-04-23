/**
 * useLocalStoragePref — useState that persists to localStorage.
 *
 * Intended for per-user UI preferences that survive reloads and new tabs:
 * filter selections, sort order, column widths, dismissed-banner flags,
 * "last viewed" ids, etc.
 *
 * Not for auth tokens, form drafts, or anything the backend needs to see —
 * localStorage is client-only and reachable from any JS on the page (XSS
 * surface). Don't put PII, pricing, or credentials here.
 *
 * Usage:
 *
 *   const [filterMethod, setFilterMethod] =
 *     useLocalStoragePref('prefs:all-sows:filterMethod', 'All');
 */

import { useEffect, useState } from 'react';

export default function useLocalStoragePref(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);

  // Rehydrate once on mount — or when `key` changes, which is rare but
  // handled for completeness.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw));
    } catch {
      // Corrupt stored value — fall back to default.
    }
  }, [key]);

  // Persist on change. Skipped on the initial render when there's nothing
  // meaningful to persist (value === defaultValue and no user interaction
  // has happened yet) — but writing the default back is harmless anyway.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota exceeded or private mode — just drop the write.
    }
  }, [key, value]);

  return [value, setValue];
}
