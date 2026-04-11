/**
 * useAutoRefreshFetch — load-on-mount + refresh-after-mutation hook for review
 * surfaces.  Replaces the boilerplate pattern of:
 *
 *   - useState for data/loading/error
 *   - useEffect with a `cancelled` flag
 *   - a separate useCallback for "loadAll()" / "refreshProgress()"
 *
 * with a single hook that handles both initial load and explicit refresh
 * through one ``load`` function.
 *
 * Why this hook exists
 * ────────────────────
 * Before the refactor, internal-review, drm-review, and assignment-review all
 * shipped the same skeleton:
 *
 *   useEffect(() => {
 *     if (!id || !user) return;
 *     let cancelled = false;
 *     async function load() { ... try { setSow(...); } catch { setError(...); } finally { setLoading(false); } }
 *     load();
 *     return () => { cancelled = true; };
 *   }, [id, user, authFetch]);
 *
 * Each surface diverged in subtle ways (some forgot the cancelled flag, some
 * forgot to call setLoading(false) on cancellation, some had a separate
 * loadAll/refreshProgress with its own race-window bugs).  This hook fixes
 * all of those at once and gives every caller the same shape.
 *
 * Cancellation
 * ────────────
 * The hook hands the loader an `AbortSignal` from a fresh AbortController on
 * every run.  The controller is aborted when:
 *
 *   - the component unmounts
 *   - any value in `deps` changes (re-run replaces the previous in-flight load)
 *   - `refresh()` is called (a manual refresh aborts the previous one)
 *
 * The loader is expected to forward the signal into its `fetch()` calls so
 * the network request itself is cancelled.  Even if it doesn't, the hook
 * will swallow the result of an aborted run so React state never thrashes.
 *
 * The `enabled` flag
 * ──────────────────
 * Pass `enabled: false` to keep the hook in "waiting" mode — typically while
 * `router.query` hasn't resolved or `user` is still loading.  The hook will
 * neither call the loader nor flip `loading` to true.  The moment `enabled`
 * becomes true (and it's in `deps`), the load runs.
 *
 * Caller responsibilities
 * ───────────────────────
 *  - Provide a `load(signal)` function that returns the full page payload.
 *    Multiple endpoints?  Resolve them in the same loader with `Promise.all`.
 *  - Wrap `load` in `useCallback` with the same dependency array as `deps`
 *    so React doesn't see a "new" function on every render.
 *  - Pass `setData` if you need to optimistically update the loaded data
 *    without refetching (e.g. immediately mark the assignment as completed
 *    after a successful submit so the UI flips to read-only).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export default function useAutoRefreshFetch({ load, deps = [], enabled = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // Track the in-flight controller so we can cancel it on re-run/unmount.
  const abortRef = useRef(null);
  // Stash the latest loader so `refresh()` always calls the freshest closure
  // even if React hasn't re-rendered yet (e.g. submit handler firing back-to-back).
  const loadRef = useRef(load);
  loadRef.current = load;

  const run = useCallback(async () => {
    if (!enabled) return null;

    // Cancel any previous in-flight load before starting a new one.
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const result = await loadRef.current(ctrl.signal);
      if (ctrl.signal.aborted) return null;
      setData(result);
      return result;
    } catch (e) {
      // AbortError from a cancelled fetch is expected — swallow it.
      if (e?.name === 'AbortError' || ctrl.signal.aborted) return null;
      setError(e?.message || 'Load failed');
      return null;
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  }, [enabled]);

  // Initial load + reload when deps change.  We also reset to "loading"
  // when `enabled` is false so callers can render a spinner without flicker.
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return undefined;
    }
    run();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  return { data, loading, error, refresh: run, setData };
}
