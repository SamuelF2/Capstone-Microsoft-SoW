/**
 * LiveWorkflowEditor — author dashboard wrapper around `WorkflowFlowEditor`
 * for live-editing a SoW's workflow snapshot mid-lifecycle.
 *
 * Behavior
 * ────────
 * - Loads `GET /api/workflow/sow/{sowId}` on mount and feeds the snapshot
 *   into `WorkflowFlowEditor` with full edit access.
 * - Tracks a `hasChanges` dirty flag by comparing the current graph state
 *   against the last loaded snapshot.
 * - "Save" PUTs `/api/workflow/sow/{sowId}` with the freshest workflow_data
 *   (read synchronously via the editor's `getWorkflowDataRef`).
 * - On 409 (e.g. "cannot delete the current stage"), shows the backend
 *   error message inline. On success, refreshes from the response and
 *   fires `onSaved(updatedWorkflow)` so the parent can refresh its
 *   status pill / timeline.
 *
 * Props
 * ─────
 *   sowId    number|string  — required
 *   onSaved  (workflow)=>void  — fired after a successful PUT
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import WorkflowFlowEditor from '../workflow/WorkflowFlowEditor';

function stageTransitionSignature(workflow) {
  if (!workflow?.workflow_data) return '';
  return JSON.stringify({
    stages: workflow.workflow_data.stages || [],
    transitions: workflow.workflow_data.transitions || [],
  });
}

export default function LiveWorkflowEditor({ sowId, onSaved }) {
  const { authFetch } = useAuth();

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

  // ── Load on mount / sowId change ────────────────────────────────────────
  useEffect(() => {
    if (!sowId) return;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);
    authFetch(`/api/workflow/sow/${sowId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(text || `Failed to load workflow (${r.status})`);
        }
        const data = await r.json();
        const wrapped = {
          ...data,
          // WorkflowFlowEditor uses `loaded_at` as part of its signature to
          // know when to reset internal graph state.  Setting it once on
          // load (and again after each successful save) prevents the editor
          // from blowing away in-progress edits on every parent re-render.
          loaded_at: Date.now(),
        };
        if (!cancelled) {
          setWorkflow(wrapped);
          baselineRef.current = stageTransitionSignature(wrapped);
        }
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message || 'Failed to load workflow');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sowId, authFetch]);

  // ── Dirty detection ─────────────────────────────────────────────────────
  // The editor calls `onChange` on every graph mutation, which updates
  // `workflow` here.  We compare its current signature against the baseline
  // to derive `hasChanges` without an extra effect.
  const hasChanges = useMemo(() => {
    if (!workflow) return false;
    return stageTransitionSignature(workflow) !== baselineRef.current;
  }, [workflow]);

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!workflow || !sowId) return;
    setSaveError(null);

    // Read the freshest graph state directly from the editor — the async
    // onChange propagation may not have flushed yet.
    const freshData = getWorkflowDataRef.current?.() ?? workflow.workflow_data;
    const payload = {
      stages: freshData.stages || [],
      transitions: freshData.transitions || [],
    };

    setSaving(true);
    try {
      const res = await authFetch(`/api/workflow/sow/${sowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        let detail = `Save failed (${res.status})`;
        try {
          const body = await res.json();
          if (body?.detail) detail = body.detail;
        } catch {
          const text = await res.text().catch(() => '');
          if (text) detail = text;
        }
        throw new Error(detail);
      }
      const updated = await res.json();
      const wrapped = { ...updated, loaded_at: Date.now() };
      setWorkflow(wrapped);
      baselineRef.current = stageTransitionSignature(wrapped);
      setSavedAt(new Date());
      if (typeof onSaved === 'function') onSaved(updated);
    } catch (e) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [workflow, sowId, authFetch, onSaved]);

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-sm text-tertiary" style={{ padding: 'var(--spacing-md) 0' }}>
        Loading workflow…
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(220,38,38,0.25)',
          backgroundColor: 'rgba(220,38,38,0.08)',
          color: 'var(--color-error)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        {loadError}
      </div>
    );
  }

  if (!workflow) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)',
      }}
    >
      {/* Header row: title + dirty indicator + save */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-sm)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-primary)',
            }}
          >
            Workflow structure
          </h3>
          <p className="text-xs text-tertiary" style={{ margin: '2px 0 0', lineHeight: 1.4 }}>
            Add or remove stages, change roles, or tweak approval modes. Saving re-checks gating
            rules and may auto-advance the SoW immediately.
          </p>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            flexShrink: 0,
          }}
        >
          {savedAt && !hasChanges && !saving && (
            <span className="text-xs text-tertiary">
              Saved {savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {hasChanges && !saving && (
            <span className="text-xs" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
              ● Unsaved changes
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '4px 14px',
              opacity: saving || !hasChanges ? 0.6 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save workflow'}
          </button>
        </div>
      </div>

      {/* Save error banner — dismissable */}
      {saveError && (
        <div
          style={{
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)',
            color: 'var(--color-error)',
            fontSize: 'var(--font-size-xs)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 'var(--spacing-sm)',
          }}
        >
          <span style={{ flex: 1, lineHeight: 1.4 }}>{saveError}</span>
          <button
            type="button"
            onClick={() => setSaveError(null)}
            aria-label="Dismiss error"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-error)',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'var(--font-size-sm)',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Editor canvas — fixed height so the dashboard scrolls cleanly */}
      <div
        style={{
          display: 'flex',
          minHeight: '560px',
          height: '60vh',
        }}
      >
        <WorkflowFlowEditor
          workflow={workflow}
          onChange={setWorkflow}
          readOnly={false}
          getWorkflowDataRef={getWorkflowDataRef}
        />
      </div>
    </div>
  );
}
