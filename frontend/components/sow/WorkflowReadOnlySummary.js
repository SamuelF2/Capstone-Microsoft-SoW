/**
 * WorkflowReadOnlySummary — compact, read-only preview of the workflow a SoW
 * is currently attached to. Replaces the old inline customizer that let
 * authors edit stages on the draft page; editing now lives exclusively on the
 * /workflows/[id]/edit page and SoWs simply follow whichever template they
 * were assigned.
 *
 * Behavior
 * ────────
 * - Fetches /api/workflow/sow/{sowId} to get the per-SoW snapshot.
 * - If none exists yet (404), shows a friendly notice — the instance is
 *   created server-side when the SoW is first submitted.
 * - Renders the stage chain as pills with the current stage highlighted.
 * - Provides a "View workflow" button that opens the template editor in
 *   read-only mode via /workflows/{template_id}/edit (the editor itself
 *   enforces read-only for non-owners).
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import { isAnchorStage, stageColor } from '../../lib/workflowStages';

export default function WorkflowReadOnlySummary({ sowId }) {
  const router = useRouter();
  const { authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, instance: null, error: null });

  useEffect(() => {
    if (!sowId) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setState({ loading: true, instance: null, error: null });
    authFetch(`/api/workflow/sow/${sowId}`, { signal })
      .then(async (r) => {
        if (signal.aborted) return;
        if (r.status === 404) {
          setState({ loading: false, instance: null, error: 'no-instance' });
          return;
        }
        if (!r.ok) throw new Error(`Failed to load workflow (${r.status})`);
        const data = await r.json();
        if (signal.aborted) return;
        setState({ loading: false, instance: data, error: null });
      })
      .catch((e) => {
        if (e?.name === 'AbortError' || signal.aborted) return;
        setState({ loading: false, instance: null, error: e.message || 'Failed to load' });
      });
    return () => ctrl.abort();
  }, [sowId, authFetch]);

  if (state.loading) {
    return (
      <div className="text-xs text-tertiary" style={{ padding: 'var(--spacing-xs) 0' }}>
        Loading workflow…
      </div>
    );
  }

  if (state.error === 'no-instance') {
    return (
      <div
        className="text-xs text-tertiary"
        style={{
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--color-bg-tertiary)',
          border: '1px dashed var(--color-border-default)',
          fontStyle: 'italic',
        }}
      >
        Workflow instance will be created when this SoW is submitted.
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="text-xs" style={{ color: 'var(--color-error)' }}>
        {state.error}
      </div>
    );
  }

  const { instance } = state;
  const stages = (instance.workflow_data?.stages || [])
    .filter((s) => s.stage_key !== 'rejected')
    .sort((a, b) => (a.stage_order ?? 0) - (b.stage_order ?? 0));
  const currentStageKey = instance.current_stage;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        flexWrap: 'wrap',
      }}
    >
      <span
        className="text-xs text-tertiary"
        style={{
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          fontWeight: 600,
          marginRight: 'var(--spacing-xs)',
        }}
      >
        Workflow
      </span>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexWrap: 'wrap',
        }}
      >
        {stages.map((s, idx) => {
          const isCurrent = s.stage_key === currentStageKey;
          const accent = stageColor(s.stage_key, s.stage_type);
          return (
            <span key={s.stage_key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span
                title={isAnchorStage(s.stage_key) ? 'Anchor stage' : s.stage_type}
                style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '11px',
                  fontWeight: isCurrent ? 600 : 500,
                  backgroundColor: isCurrent ? `${accent}22` : 'var(--color-bg-secondary)',
                  color: isCurrent ? accent : 'var(--color-text-secondary)',
                  border: `1px solid ${isCurrent ? accent : 'var(--color-border-default)'}`,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.display_name}
              </span>
              {idx < stages.length - 1 && (
                <span style={{ color: 'var(--color-text-tertiary)', fontSize: '10px' }}>→</span>
              )}
            </span>
          );
        })}
      </div>

      {instance.template_id != null && (
        <button
          type="button"
          onClick={() => router.push(`/workflows/${instance.template_id}/edit`)}
          className="btn-ghost"
          style={{
            fontSize: 'var(--font-size-xs)',
            padding: '2px 10px',
            marginLeft: 'auto',
            whiteSpace: 'nowrap',
          }}
          title="Open this workflow in the flow editor"
        >
          View workflow →
        </button>
      )}
    </div>
  );
}
