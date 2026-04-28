/**
 * useUnsavedChangesWarning — block navigation away from a dirty editor.
 *
 * Wires two separate layers:
 *
 *  1. `beforeunload` — fires on tab close, refresh, and navigation to an
 *     external origin. Browsers force their OWN confirm dialog here and
 *     ignore any custom message text (anti-phishing behavior since ~2016),
 *     so we only get to say "yes, prompt them" by returning a string.
 *
 *  2. Next.js `routeChangeStart` — fires on in-app navigation (router.push,
 *     <Link> clicks, back button). We cancel the transition by throwing,
 *     remember the target URL, and surface a custom modal so the caller can
 *     offer a branded Stay / Leave UX. Once the user confirms, we flip a
 *     bypass flag and re-trigger the navigation.
 *
 * Usage:
 *
 *   const { showModal, confirmLeave, cancelLeave } =
 *     useUnsavedChangesWarning(hasChanges);
 *
 *   <UnsavedChangesModal open={showModal} onStay={cancelLeave} onLeave={confirmLeave} />
 *
 * Pass `hasChanges=false` to disable without unmounting — the hook reattaches
 * cleanly when it flips back to true.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';

export default function useUnsavedChangesWarning(hasChanges) {
  const router = useRouter();
  const [pendingUrl, setPendingUrl] = useState(null);
  // Set true after the user confirms "Leave"; lets the next routeChangeStart
  // slip through without re-triggering the modal. Cleared after the
  // navigation completes.
  const bypassRef = useRef(false);

  // ── Tab close / refresh / external navigation ───────────────────────────
  useEffect(() => {
    if (!hasChanges) return undefined;
    const handler = (e) => {
      // preventDefault + returnValue is the cross-browser incantation for
      // "show the native Leave site? prompt".
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // ── In-app navigation ───────────────────────────────────────────────────
  useEffect(() => {
    if (!hasChanges) return undefined;

    const handler = (url, { shallow } = {}) => {
      // Allow the "confirmed leave" path through.
      if (bypassRef.current) return;
      // Shallow replaces (e.g. the workflow editor page swapping /new for
      // the real id after a first save) are URL-only updates, not real
      // navigation — let them through.
      if (shallow) return;
      // Same-URL edge case — also not real navigation.
      if (url === router.asPath) return;

      setPendingUrl(url);
      // Emit routeChangeError first so Next.js' internal error logger stays
      // quiet — then throw to abort the transition.
      router.events.emit('routeChangeError');
      // eslint-disable-next-line no-throw-literal
      throw 'Route change aborted by useUnsavedChangesWarning';
    };

    router.events.on('routeChangeStart', handler);
    return () => router.events.off('routeChangeStart', handler);
  }, [hasChanges, router]);

  // Clear the bypass flag once navigation actually finishes (or aborts), so
  // a previously-granted `allowNextNavigation` can't silently stay hot for
  // an unrelated later click. Installed unconditionally — it's a no-op
  // until `allowNextNavigation` flips the ref on.
  useEffect(() => {
    const clear = () => {
      bypassRef.current = false;
    };
    router.events.on('routeChangeComplete', clear);
    router.events.on('routeChangeError', clear);
    return () => {
      router.events.off('routeChangeComplete', clear);
      router.events.off('routeChangeError', clear);
    };
  }, [router]);

  const confirmLeave = useCallback(() => {
    if (!pendingUrl) return;
    bypassRef.current = true;
    const target = pendingUrl;
    setPendingUrl(null);
    // Use replace-or-push based on whether it's the same pathname — but
    // router.push handles both fine, and keeps history consistent with
    // what the user originally clicked.
    router.push(target).finally(() => {
      bypassRef.current = false;
    });
  }, [pendingUrl, router]);

  const cancelLeave = useCallback(() => {
    setPendingUrl(null);
  }, []);

  // Imperative escape hatch for programmatic navigation that already "consumed"
  // the dirty state (e.g., after a successful submit that redirects). Flip the
  // bypass flag; the routeChangeComplete listener above clears it once the
  // triggered navigation actually finishes, which avoids racing a 0ms timer
  // against the browser's actual nav-event timing.
  const allowNextNavigation = useCallback(() => {
    bypassRef.current = true;
  }, []);

  return {
    showModal: pendingUrl !== null,
    confirmLeave,
    cancelLeave,
    allowNextNavigation,
  };
}
