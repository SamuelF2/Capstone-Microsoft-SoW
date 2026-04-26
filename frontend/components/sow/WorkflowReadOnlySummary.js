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

/**
 * Mirror of backend `evaluate_skip_condition` — kept tiny on purpose. Used to
 * predict which Microsoft-workflow branches will run BEFORE the SoW reaches
 * the gateway, so the author sees the consequence of their flag selections
 * in the workflow summary.
 */
function evaluateSkipCondition(condition, sowMeta) {
  if (!condition || typeof condition !== 'object') return false;
  const { field, op, value } = condition;
  if (!field || !op) return false;
  const v = sowMeta && typeof sowMeta === 'object' ? sowMeta[field] : undefined;
  if (op === 'eq') return v === value;
  if (op === 'is_empty') {
    if (v == null) return true;
    if (Array.isArray(v) || typeof v === 'string') return v.length === 0;
    return false;
  }
  if (op === 'contains') {
    if (Array.isArray(v)) return v.includes(value);
    if (typeof v === 'string') return typeof value === 'string' && v.includes(value);
    return false;
  }
  return false;
}

export default function WorkflowReadOnlySummary({ sowId }) {
  const router = useRouter();
  const { authFetch } = useAuth();
  const [state, setState] = useState({ loading: true, instance: null, error: null });
  const [microsoftMeta, setMicrosoftMeta] = useState(null);

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

  // Pull metadata.microsoft_workflow alongside the workflow snapshot so we
  // can show predicted branch outcomes before the SoW has fanned out.
  useEffect(() => {
    if (!sowId) return;
    const ctrl = new AbortController();
    authFetch(`/api/sow/${sowId}`, { signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json();
        setMicrosoftMeta(data?.metadata?.microsoft_workflow || null);
      })
      .catch(() => {
        // Non-fatal — branches summary just won't render.
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

  // Microsoft Default Workflow: predict (or report) per-branch state.
  const isMicrosoftWorkflow = stages.some((s) => s.stage_key === 'microsoft_parallel_branches');
  const microsoftBranchSummary = (() => {
    if (!isMicrosoftWorkflow) return null;
    const transitions = instance.workflow_data?.transitions || [];
    const branchKeys = transitions
      .filter((t) => t.from_stage === 'microsoft_parallel_branches')
      .map((t) => t.to_stage);
    const stageByKey = new Map(stages.map((s) => [s.stage_key, s]));
    const runtimeBranches = instance.parallel_branches || null;
    return branchKeys.map((bk) => {
      const stage = stageByKey.get(bk);
      const transition = transitions.find(
        (t) => t.from_stage === 'microsoft_parallel_branches' && t.to_stage === bk
      );
      // Once fanned out, prefer the actual runtime state. Before fan-out,
      // predict via the skip_condition + author flags.
      let runtime = runtimeBranches?.[bk];
      if (!runtime) {
        runtime = evaluateSkipCondition(transition?.skip_condition, microsoftMeta || {})
          ? 'will-skip'
          : 'will-run';
      }
      return { key: bk, name: stage?.display_name || bk, runtime };
    });
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
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

      {microsoftBranchSummary && microsoftBranchSummary.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
            fontSize: '11px',
            color: 'var(--color-text-secondary)',
          }}
        >
          <span
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 600,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Branches
          </span>
          {microsoftBranchSummary.map((b) => {
            const live = b.runtime === 'active' || b.runtime === 'completed';
            const skipped = b.runtime === 'skipped' || b.runtime === 'will-skip';
            const predicted = b.runtime === 'will-run' || b.runtime === 'will-skip';
            const color = skipped
              ? 'var(--color-text-tertiary)'
              : b.runtime === 'completed'
                ? 'var(--color-success)'
                : 'var(--color-accent-teal, #0d9488)';
            const label = skipped ? `${b.name} (skipped)` : b.name;
            return (
              <span
                key={b.key}
                title={
                  predicted
                    ? `Predicted from current author selections — locks in once SoW reaches the gateway`
                    : `Live state: ${b.runtime}`
                }
                style={{
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${skipped ? 'var(--color-border-default)' : color}`,
                  color,
                  fontWeight: live ? 600 : 400,
                  fontStyle: predicted ? 'italic' : 'normal',
                  opacity: skipped ? 0.7 : 1,
                  background: skipped ? 'var(--color-bg-secondary)' : 'transparent',
                }}
              >
                {label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
