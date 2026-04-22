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

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';
import useWorkflowEditorState, { workflowSignature } from '../../lib/hooks/useWorkflowEditorState';
import useUnsavedChangesWarning from '../../lib/hooks/useUnsavedChangesWarning';
import useDraftAutosave from '../../lib/hooks/useDraftAutosave';
import WorkflowFlowEditor from '../workflow/WorkflowFlowEditor';
import UnsavedChangesModal from '../UnsavedChangesModal';
import RestoreDraftModal from '../RestoreDraftModal';

export default function LiveWorkflowEditor({ sowId, onSaved }) {
  const { authFetch } = useAuth();

  // Stable loader/persist refs — useCallback so they only change when sowId
  // does, which is what drives a re-load.
  const loader = useCallback(async () => {
    if (!sowId) return null;
    const r = await authFetch(`/api/workflow/sow/${sowId}`);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(text || `Failed to load workflow (${r.status})`);
    }
    return r.json();
  }, [sowId, authFetch]);

  const persist = useCallback(
    async ({ workflowData }) => {
      const payload = {
        stages: workflowData.stages || [],
        transitions: workflowData.transitions || [],
      };
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
      return res.json();
    },
    [sowId, authFetch]
  );

  const {
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
  } = useWorkflowEditorState({ loader, persist, deps: [sowId] });

  const handleSave = useCallback(async () => {
    const updated = await save();
    if (updated && typeof onSaved === 'function') onSaved(updated);
  }, [save, onSaved]);

  // Warn before leaving when there are unsaved changes (tab close or in-app nav).
  const {
    showModal: showUnsavedModal,
    confirmLeave: confirmUnsavedLeave,
    cancelLeave: cancelUnsavedLeave,
  } = useUnsavedChangesWarning(hasChanges);

  // Auto-save the graph structure to localStorage so unexpected crashes
  // don't lose work between manual saves. Only the stages/transitions
  // shape is persisted — no deal values, no customer data.
  const { loadDraft, clearDraft } = useDraftAutosave({
    key: sowId ? `workflow:sow:${sowId}` : null,
    data: workflow?.workflow_data ?? null,
    enabled: hasChanges,
  });

  // Offer to restore a draft from a previous session if it differs from the
  // freshly-loaded server state. Runs once per mount, after load completes.
  const draftCheckedRef = useRef(false);
  const [pendingDraft, setPendingDraft] = useState(null);

  // If the caller swaps sowId without unmounting, re-arm the draft check
  // against the new key. Next.js dynamic-segment navigation usually remounts,
  // so this is belt-and-suspenders for code paths that swap the prop
  // imperatively.
  useEffect(() => {
    draftCheckedRef.current = false;
    setPendingDraft(null);
  }, [sowId]);

  useEffect(() => {
    if (draftCheckedRef.current || loading || !workflow) return;
    draftCheckedRef.current = true;
    const draft = loadDraft();
    if (!draft) return;
    const draftSig = workflowSignature({ workflow_data: draft.data });
    const serverSig = workflowSignature(workflow);
    if (draftSig && draftSig !== serverSig) {
      setPendingDraft(draft);
    } else {
      // Draft matches what the server returned — stale; clear it.
      clearDraft();
    }
  }, [loading, workflow, loadDraft, clearDraft]);

  // Clear the draft after any successful save.
  const prevSavedAtRef = useRef(null);
  useEffect(() => {
    if (savedAt && savedAt !== prevSavedAtRef.current) {
      clearDraft();
    }
    prevSavedAtRef.current = savedAt;
  }, [savedAt, clearDraft]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft) return;
    // Bump loaded_at so WorkflowFlowEditor's init effect (keyed on id:loaded_at)
    // re-seeds its internal nodes/edges from the draft — without this, patching
    // only workflow_data leaves the canvas showing the server state.
    setWorkflow((prev) =>
      prev ? { ...prev, workflow_data: pendingDraft.data, loaded_at: Date.now() } : prev
    );
    setPendingDraft(null);
  }, [pendingDraft, setWorkflow]);

  const handleDiscardDraft = useCallback(() => {
    setPendingDraft(null);
    clearDraft();
  }, [clearDraft]);

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
          readOnly={saving}
          getWorkflowDataRef={getWorkflowDataRef}
          hideWorkflowMeta
        />
      </div>

      <UnsavedChangesModal
        open={showUnsavedModal}
        onStay={cancelUnsavedLeave}
        onLeave={confirmUnsavedLeave}
      />
      <RestoreDraftModal
        open={pendingDraft !== null}
        savedAt={pendingDraft?.savedAt ?? null}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />
    </div>
  );
}
