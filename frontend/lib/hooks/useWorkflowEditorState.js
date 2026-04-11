/**
 * useWorkflowEditorState — shared state machine for the React-Flow workflow
 * editor surfaces.  Used by `LiveWorkflowEditor` (live SoW snapshot) and
 * `pages/workflows/[id]/edit.js` (template editor) so they share identical
 * load / dirty / save semantics without copy-pasting the lifecycle code.
 *
 * What it owns
 * ────────────
 *  - Initial fetch with cancellation (handles unmount mid-flight).
 *  - The ``workflow`` object plus a stable ``loaded_at`` so the underlying
 *    `WorkflowFlowEditor` doesn't reset its internal graph state on every
 *    parent re-render.
 *  - ``getWorkflowDataRef`` — synchronous accessor injected into the editor
 *    so saves can read the freshest graph state instead of relying on the
 *    async ``onChange`` propagation.
 *  - Loading / save error / savedAt timestamps for the surface to render.
 *  - ``hasChanges`` (dirty detection) computed against a baseline signature
 *    that updates after every load and successful save.
 *
 * Caller responsibilities
 * ───────────────────────
 *  - Provide a ``loader`` function: ``() => Promise<workflow>``.  Return any
 *    object — only ``workflow_data`` is read by this hook.  ``null`` is also
 *    valid for "new / empty" surfaces.
 *  - Provide a ``persist`` function: ``({ workflowData, workflow }) =>
 *    Promise<workflow>``.  This is called by ``save`` with the freshest graph
 *    state plus the current workflow object so the caller can build whatever
 *    payload its API needs (template POST/PUT vs SoW PUT).
 *  - Optionally provide a ``preserveLoadedAt: true`` flag in the save call to
 *    keep the editor's existing internal state instead of re-keying it.
 *
 * The hook deliberately does NOT handle authoring concerns like "save as
 * copy" or read-only banners — those are owned by the caller.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * Compute a stable signature for dirty detection.  Only the parts of the
 * workflow that the editor actually mutates are hashed — the surrounding
 * metadata (id, name, created_by) is irrelevant for "did the graph change".
 */
export function workflowSignature(workflow) {
  if (!workflow?.workflow_data) return '';
  return JSON.stringify({
    stages: workflow.workflow_data.stages || [],
    transitions: workflow.workflow_data.transitions || [],
  });
}

/**
 * Wrap a freshly-loaded or freshly-saved workflow with a ``loaded_at`` so
 * the React-Flow editor knows when to reset its internal state.  Pass
 * ``preserveLoadedAt`` to keep the previous value, which is what the
 * template editor wants after a successful save (the user is still editing
 * the same logical workflow).
 */
function wrap(workflow, { preservedLoadedAt = null } = {}) {
  if (!workflow) return null;
  return { ...workflow, loaded_at: preservedLoadedAt ?? Date.now() };
}

export default function useWorkflowEditorState({ loader, persist, deps = [] }) {
  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // Snapshot of the last loaded/saved server state — used to detect dirty.
  const baselineRef = useRef('');
  // Synchronous accessor for the freshest graph state from the editor.
  const getWorkflowDataRef = useRef(null);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!loader) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setLoadError(null);

    Promise.resolve()
      .then(() => loader())
      .then((data) => {
        if (cancelled) return;
        // ``null`` means "not ready to load yet" (e.g. router.query hasn't
        // resolved).  Keep ``loading`` true so the surface shows its
        // spinner instead of trying to render an undefined workflow.
        if (data == null) return;
        const wrapped = wrap(data);
        setWorkflow(wrapped);
        baselineRef.current = workflowSignature(wrapped);
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(e?.message || 'Failed to load workflow');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  // ── Dirty detection ─────────────────────────────────────────────────────
  const hasChanges = useMemo(() => {
    if (!workflow) return false;
    return workflowSignature(workflow) !== baselineRef.current;
  }, [workflow]);

  // ── Save ────────────────────────────────────────────────────────────────
  const save = useCallback(
    async ({ preserveLoadedAt = false, ...callerOpts } = {}) => {
      if (!workflow || !persist) return null;
      setSaveError(null);

      // Read the freshest graph state directly from the editor — the async
      // onChange propagation may not have flushed yet, especially for
      // rapid-fire keyboard edits.
      const freshData = getWorkflowDataRef.current?.() ?? workflow.workflow_data;

      setSaving(true);
      try {
        const updated = await persist({
          workflowData: freshData,
          workflow,
          options: callerOpts,
        });
        const wrapped = wrap(updated, {
          preservedLoadedAt: preserveLoadedAt ? workflow.loaded_at : null,
        });
        setWorkflow(wrapped);
        baselineRef.current = workflowSignature(wrapped);
        setSavedAt(new Date());
        return updated;
      } catch (e) {
        setSaveError(e?.message || 'Save failed');
        return null;
      } finally {
        setSaving(false);
      }
    },
    [workflow, persist]
  );

  return {
    workflow,
    setWorkflow,
    loading,
    loadError,
    saving,
    saveError,
    setSaveError,
    savedAt,
    hasChanges,
    getWorkflowDataRef,
    save,
  };
}
