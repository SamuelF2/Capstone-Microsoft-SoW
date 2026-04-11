/**
 * StageSettingsPanel — side panel for the pipeline-first workflow editor.
 *
 * Shows context-aware forms:
 *   - Nothing selected → workflow name/description + implicit rules summary
 *   - Stage selected   → stage settings including send-back target dropdown
 *   - Edge selected    → explicit (override) edge condition picker
 *   - Anchor selected  → read-only anchor info
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ANCHOR_STAGES,
  isAnchorStage,
  TRANSITION_CONDITIONS,
  JOIN_MODES,
  isParallelGateway,
  SEND_BACK_TARGETS,
  KNOWN_REVIEWER_ROLES,
  roleLabel,
} from '../../lib/workflowStages';

const MIDDLE_STAGE_TYPES = [
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'ai_analysis', label: 'AI Analysis' },
  { value: 'parallel_gateway', label: 'Parallel Gateway' },
];

const APPROVAL_MODES = [
  { value: 'all_must_approve', label: 'All required must approve' },
  { value: 'any_can_approve', label: 'Any one can approve' },
  { value: 'majority', label: 'Majority vote' },
  { value: 'threshold', label: 'Custom threshold' },
];

const ESAP_LEVELS = [
  { key: 'type-1', color: '#ef4444' },
  { key: 'type-2', color: '#fbbf24' },
  { key: 'type-3', color: '#4ade80' },
];

export default function StageSettingsPanel({
  workflow,
  onWorkflowChange,
  selectedNode,
  onStageChange,
  onDeleteStage,
  selectedEdge,
  onEdgeChange,
  onDeleteEdge,
  nodes,
  edges,
  warnings,
}) {
  let content;
  if (selectedEdge) {
    content = (
      <EdgeForm
        edge={selectedEdge}
        onChange={onEdgeChange}
        onDelete={onDeleteEdge}
        nodes={nodes || []}
      />
    );
  } else if (selectedNode) {
    content = (
      <StageForm
        node={selectedNode}
        onChange={onStageChange}
        onDelete={onDeleteStage}
        nodes={nodes || []}
        edges={edges || []}
      />
    );
  } else {
    content = <WorkflowForm workflow={workflow} onChange={onWorkflowChange} warnings={warnings} />;
  }

  return (
    <aside
      style={{
        width: '340px',
        flexShrink: 0,
        backgroundColor: 'var(--color-bg-secondary)',
        borderLeft: '1px solid var(--color-border-default)',
        overflowY: 'auto',
        padding: 'var(--spacing-lg)',
      }}
    >
      {content}
    </aside>
  );
}

// ── Workflow-level form ────────────────────────────────────────────────────

function WorkflowForm({ workflow, onChange, warnings }) {
  return (
    <div>
      <SectionTitle>Workflow</SectionTitle>
      <Field label="Name">
        <input
          type="text"
          className="form-input"
          value={workflow.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Fast-Track Review"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="form-input"
          rows={3}
          value={workflow.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional — describe when to use this workflow"
        />
      </Field>

      {/* Pipeline model explanation */}
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <SectionTitle>Pipeline Rules</SectionTitle>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <RuleBadge color="#475569" label="Forward">
            Each stage advances to the next in order
          </RuleBadge>
          <RuleBadge color="#ef4444" label="Reject">
            Review/approval stages reject to Rejected
          </RuleBadge>
          <RuleBadge color="#f59e0b" label="Send back">
            Configured per-stage (default: previous stage)
          </RuleBadge>
        </div>
        <p
          className="text-xs text-tertiary"
          style={{ marginTop: 'var(--spacing-sm)', lineHeight: 1.4 }}
        >
          These transitions are automatic. Draw an edge between stages only to override the default
          pipeline flow.
        </p>
      </div>

      {warnings && warnings.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: 'var(--spacing-xl)' }}>Validation</SectionTitle>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-xs)',
            }}
          >
            {warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  color: 'var(--color-warning)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 1.4,
                }}
              >
                {w}
              </div>
            ))}
          </div>
        </>
      )}

      <p
        className="text-xs text-tertiary"
        style={{ marginTop: 'var(--spacing-xl)', lineHeight: 1.5 }}
      >
        Select a stage on the canvas to edit its details.
      </p>
    </div>
  );
}

function RuleBadge({ color, label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          backgroundColor: color,
          opacity: 0.6,
          marginTop: 4,
          flexShrink: 0,
        }}
      />
      <div>
        <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}:</span>{' '}
        {children}
      </div>
    </div>
  );
}

// ── Stage form ────────────────────────────────────────────────────────────

function StageForm({ node, onChange, onDelete, nodes, edges }) {
  const stage = node.data.stage || {};
  const locked = isAnchorStage(node.id);
  const isGateway = isParallelGateway(stage.stage_type);

  const [draftKey, setDraftKey] = useState(stage.stage_key || '');
  useEffect(() => {
    setDraftKey(stage.stage_key || '');
  }, [node.id, stage.stage_key]);

  // Compute incoming predecessors for join config
  const incomingPredecessors = useMemo(() => {
    if (!edges || !nodes) return [];
    const incoming = edges.filter((e) => e.target === node.id && !e.data?.isGhost);
    const sourceIds = [...new Set(incoming.map((e) => e.source))];
    return sourceIds.map((sid) => {
      const srcNode = nodes.find((n) => n.id === sid);
      return {
        stage_key: sid,
        display_name: srcNode?.data?.stage?.display_name || sid,
      };
    });
  }, [edges, nodes, node.id]);

  const hasMultiplePredecessors = incomingPredecessors.length >= 2;

  // Compute preceding stages for send-back dropdown
  const precedingStages = useMemo(() => {
    if (!nodes) return [];
    const currentX = node.position?.x ?? 0;
    return nodes
      .filter(
        (n) =>
          n.type !== 'rejected_indicator' &&
          !isAnchorStage(n.id) &&
          n.id !== node.id &&
          (n.position?.x ?? 0) < currentX
      )
      .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0))
      .map((n) => ({
        stage_key: n.id,
        display_name: n.data?.stage?.display_name || n.id,
      }));
  }, [nodes, node.id, node.position]);

  if (locked) {
    return (
      <div>
        <SectionTitle>Anchor Stage 🔒</SectionTitle>
        <Field label="Display name">
          <input type="text" className="form-input" value={stage.display_name || ''} disabled />
        </Field>
        <Field label="Stage key">
          <input type="text" className="form-input" value={stage.stage_key || ''} disabled />
        </Field>
        <p
          className="text-xs text-tertiary"
          style={{ marginTop: 'var(--spacing-md)', lineHeight: 1.5 }}
        >
          {ANCHOR_STAGES[node.id]?.description || 'Locked anchor stage.'}
        </p>
      </div>
    );
  }

  const patch = (p) => onChange({ ...stage, ...p });

  // Role list mutators
  const addRole = () =>
    patch({
      roles: [...(stage.roles || []), { role_key: '', is_required: true, esap_levels: null }],
    });

  const updateRole = (idx, p) =>
    patch({
      roles: (stage.roles || []).map((r, i) => (i === idx ? { ...r, ...p } : r)),
    });

  const removeRole = (idx) => patch({ roles: (stage.roles || []).filter((_, i) => i !== idx) });

  const isReviewable = stage.stage_type === 'review' || stage.stage_type === 'approval';
  const isAI = stage.stage_type === 'ai_analysis';
  const showSendBack = isReviewable || isAI;

  // ── Parallel Gateway form ─────────────────────────────────────────────

  if (isGateway) {
    return (
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-md)',
          }}
        >
          <SectionTitle style={{ margin: 0 }}>
            <span style={{ color: 'var(--color-accent-teal, #0d9488)' }}>|||</span> Parallel Gateway
          </SectionTitle>
          <button
            type="button"
            onClick={onDelete}
            title="Delete this gateway"
            style={{
              background: 'none',
              border: '1px solid rgba(220,38,38,0.3)',
              color: 'var(--color-error)',
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--font-size-xs)',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>

        <div
          style={{
            padding: 'var(--spacing-sm)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(13,148,136,0.06)',
            border: '1px solid rgba(13,148,136,0.2)',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.5,
            marginBottom: 'var(--spacing-md)',
          }}
        >
          When this gateway is reached, <strong>all outgoing stages</strong> are activated
          simultaneously. Connect multiple stages from this node to create parallel branches.
        </div>

        <Field label="Display name">
          <input
            type="text"
            className="form-input"
            value={stage.display_name || ''}
            onChange={(e) => patch({ display_name: e.target.value })}
          />
        </Field>
        <Field label="Gateway key" hint="Lowercase, underscores. Must be unique.">
          <input
            type="text"
            className="form-input"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onBlur={() => patch({ stage_key: draftKey })}
            style={{ fontFamily: 'monospace' }}
          />
        </Field>

        {edges && (
          <div style={{ marginTop: 'var(--spacing-lg)' }}>
            <SectionTitle>Outgoing Branches</SectionTitle>
            {(() => {
              const outEdges = edges.filter((e) => e.source === node.id && !e.data?.isGhost);
              if (outEdges.length === 0) {
                return (
                  <p className="text-xs text-tertiary" style={{ fontStyle: 'italic', margin: 0 }}>
                    No branches yet. Connect this gateway to 2+ stages.
                  </p>
                );
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {outEdges.map((e) => {
                    const tgt = nodes.find((n) => n.id === e.target);
                    return (
                      <div
                        key={e.id}
                        style={{
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--color-bg-primary)',
                          border: '1px solid var(--color-border-subtle)',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        <span style={{ color: 'var(--color-accent-teal, #0d9488)' }}>→</span>{' '}
                        {tgt?.data?.stage?.display_name || e.target}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    );
  }

  // ── Standard stage form ───────────────────────────────────────────────

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <SectionTitle style={{ margin: 0 }}>Stage</SectionTitle>
        <button
          type="button"
          onClick={onDelete}
          title="Delete this stage"
          style={{
            background: 'none',
            border: '1px solid rgba(220,38,38,0.3)',
            color: 'var(--color-error)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      <Field label="Display name">
        <input
          type="text"
          className="form-input"
          value={stage.display_name || ''}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </Field>
      <Field label="Stage key" hint="Lowercase, underscores. Must be unique.">
        <input
          type="text"
          className="form-input"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onBlur={() => patch({ stage_key: draftKey })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>
      <Field label="Stage type">
        <select
          className="form-select"
          value={stage.stage_type || 'review'}
          onChange={(e) => patch({ stage_type: e.target.value })}
        >
          {MIDDLE_STAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {/* ── Join Configuration ─────────────────────────────────────────── */}
      {hasMultiplePredecessors && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <SectionTitle>Join Configuration</SectionTitle>
          <div
            style={{
              padding: 'var(--spacing-xs) var(--spacing-sm)',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(13,148,136,0.06)',
              border: '1px solid rgba(13,148,136,0.2)',
              color: 'var(--color-text-secondary)',
              fontSize: '10px',
              lineHeight: 1.4,
              marginBottom: 'var(--spacing-sm)',
            }}
          >
            This stage has {incomingPredecessors.length} predecessors. Configure which must complete
            before this stage activates.
          </div>
          <Field label="Join mode" hint="How to wait for predecessor stages">
            <select
              className="form-select"
              value={(stage.config || {}).join_mode || 'default'}
              onChange={(e) =>
                patch({
                  config: {
                    ...stage.config,
                    join_mode: e.target.value,
                    ...(e.target.value !== 'custom' ? { required_predecessors: undefined } : {}),
                  },
                })
              }
            >
              {JOIN_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          {(stage.config || {}).join_mode === 'custom' && (
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-secondary)',
                  marginBottom: '6px',
                }}
              >
                Required predecessors
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {incomingPredecessors.map((pred) => {
                  const selected = ((stage.config || {}).required_predecessors || []).includes(
                    pred.stage_key
                  );
                  return (
                    <label
                      key={pred.stage_key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        borderRadius: 'var(--radius-sm)',
                        backgroundColor: selected
                          ? 'rgba(13,148,136,0.08)'
                          : 'var(--color-bg-primary)',
                        border: `1px solid ${selected ? 'rgba(13,148,136,0.3)' : 'var(--color-border-subtle)'}`,
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const cur = (stage.config || {}).required_predecessors || [];
                          const next = e.target.checked
                            ? [...cur, pred.stage_key]
                            : cur.filter((k) => k !== pred.stage_key);
                          patch({
                            config: { ...stage.config, required_predecessors: next },
                          });
                        }}
                      />
                      {pred.display_name}
                      <span
                        style={{
                          fontSize: '9px',
                          fontFamily: 'monospace',
                          color: 'var(--color-text-tertiary)',
                        }}
                      >
                        ({pred.stage_key})
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-tertiary" style={{ margin: '4px 0 0', fontSize: '10px' }}>
                Only checked predecessors must complete before this stage activates.
              </p>
            </div>
          )}

          {(stage.config || {}).join_mode === 'all_required' && (
            <div
              style={{
                fontSize: '10px',
                color: 'var(--color-accent-teal, #0d9488)',
                fontWeight: 600,
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              AND join: all {incomingPredecessors.length} predecessors must complete
            </div>
          )}
          {(stage.config || {}).join_mode === 'any_required' && (
            <div
              style={{
                fontSize: '10px',
                color: 'var(--color-accent-teal, #0d9488)',
                fontWeight: 600,
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              OR join: first predecessor to complete activates this stage
            </div>
          )}
        </div>
      )}

      {/* ── Stage behavior (review/approval) ──────────────────────────── */}
      {isReviewable && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <SectionTitle>Stage Behavior</SectionTitle>
          <Field label="Approval gating">
            <select
              className="form-select"
              value={(stage.config || {}).approval_mode || 'all_must_approve'}
              onChange={(e) =>
                patch({ config: { ...stage.config, approval_mode: e.target.value } })
              }
            >
              {APPROVAL_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          {(stage.config || {}).approval_mode === 'threshold' && (
            <Field
              label="Minimum approvals required"
              hint={`${(stage.config || {}).approval_threshold || 1} of ${(stage.roles || []).filter((r) => r.is_required !== false).length} roles`}
            >
              <input
                type="number"
                className="form-input"
                min={1}
                value={(stage.config || {}).approval_threshold || 1}
                onChange={(e) =>
                  patch({
                    config: {
                      ...stage.config,
                      approval_threshold: parseInt(e.target.value, 10) || 1,
                    },
                  })
                }
                style={{ width: '80px' }}
              />
            </Field>
          )}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              marginBottom: 'var(--spacing-sm)',
            }}
          >
            <input
              type="checkbox"
              checked={(stage.config || {}).auto_advance !== false}
              onChange={(e) =>
                patch({ config: { ...stage.config, auto_advance: e.target.checked } })
              }
            />
            Auto-advance when gating rules are met (on by default)
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '6px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              marginBottom: 'var(--spacing-sm)',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              checked={(stage.config || {}).requires_designated_reviewer !== false}
              onChange={(e) =>
                patch({
                  config: {
                    ...stage.config,
                    requires_designated_reviewer: e.target.checked,
                  },
                })
              }
              style={{ marginTop: '2px' }}
            />
            <span>
              Requires designated reviewer
              <span
                style={{
                  display: 'block',
                  fontSize: '10px',
                  color: 'var(--color-text-tertiary)',
                  marginTop: '2px',
                }}
              >
                Block submission until each required role has a reviewer chosen on the SoW.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── Send-back target (review/approval/ai_analysis) ────────────── */}
      {showSendBack && (
        <div style={{ marginTop: isReviewable ? 0 : 'var(--spacing-lg)' }}>
          {!isReviewable && <SectionTitle>Stage Behavior</SectionTitle>}
          <Field
            label="Send back to"
            hint="Where this stage sends the SoW when requesting revisions"
          >
            <select
              className="form-select"
              value={(stage.config || {}).send_back_target || 'previous'}
              onChange={(e) =>
                patch({ config: { ...stage.config, send_back_target: e.target.value } })
              }
            >
              {SEND_BACK_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
              {precedingStages
                .filter((s) => s.stage_key !== 'draft') // already in SEND_BACK_TARGETS
                .map((s) => (
                  <option key={s.stage_key} value={s.stage_key}>
                    {s.display_name}
                  </option>
                ))}
            </select>
          </Field>
        </div>
      )}

      {/* Failure stage toggle */}
      <div style={{ marginTop: 'var(--spacing-sm)' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            marginBottom: 'var(--spacing-sm)',
          }}
        >
          <input
            type="checkbox"
            checked={!!(stage.config || {}).is_failure}
            onChange={(e) => patch({ config: { ...stage.config, is_failure: e.target.checked } })}
          />
          Failure / revision stage
        </label>
      </div>

      {/* Reviewer instructions */}
      <Field label="Reviewer instructions" hint="Shown to reviewers on the review page">
        <textarea
          className="form-input"
          rows={3}
          value={(stage.config || {}).reviewer_instructions || ''}
          onChange={(e) =>
            patch({ config: { ...stage.config, reviewer_instructions: e.target.value } })
          }
          placeholder="Describe what reviewers should focus on..."
        />
      </Field>

      {/* ── Reviewer Roles ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          <SectionTitle style={{ margin: 0 }}>Reviewer Roles</SectionTitle>
          <button
            type="button"
            onClick={addRole}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px dashed var(--color-border-default)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
        {(stage.roles || []).length === 0 ? (
          <p className="text-xs text-tertiary" style={{ margin: 0, fontStyle: 'italic' }}>
            No roles assigned.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
            {(stage.roles || []).map((role, idx) => (
              <RoleRow
                key={idx}
                role={role}
                onUpdate={(p) => updateRole(idx, p)}
                onRemove={() => removeRole(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RoleRow ───────────────────────────────────────────────────────────────

function RoleRow({ role, onUpdate, onRemove }) {
  const [custom, setCustom] = useState(
    !!role.role_key && !KNOWN_REVIEWER_ROLES.includes(role.role_key)
  );

  return (
    <div
      style={{
        padding: 'var(--spacing-xs) var(--spacing-sm)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {!custom ? (
          <select
            className="form-select"
            value={role.role_key || ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustom(true);
                onUpdate({ role_key: '' });
              } else {
                onUpdate({ role_key: e.target.value });
              }
            }}
            style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
          >
            <option value="">Select role…</option>
            {KNOWN_REVIEWER_ROLES.map((k) => (
              <option key={k} value={k}>
                {roleLabel(k)}
              </option>
            ))}
            <option value="__custom__">Custom role…</option>
          </select>
        ) : (
          <>
            <input
              type="text"
              className="form-input"
              value={role.role_key || ''}
              placeholder="role-key"
              onChange={(e) =>
                onUpdate({ role_key: e.target.value.toLowerCase().replace(/\s+/g, '-') })
              }
              style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
            />
            <button
              type="button"
              onClick={() => {
                setCustom(false);
                onUpdate({ role_key: '' });
              }}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                border: '1px solid var(--color-border-subtle)',
                background: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ↩
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove role"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={role.is_required !== false}
            onChange={(e) => onUpdate({ is_required: e.target.checked })}
          />
          Required
        </label>
        <div style={{ display: 'flex', gap: '3px' }}>
          {ESAP_LEVELS.map(({ key, color }) => {
            const active = Array.isArray(role.esap_levels) && role.esap_levels.includes(key);
            return (
              <button
                key={key}
                type="button"
                title={active ? `Remove ${key}` : `Restrict to ${key}`}
                onClick={() => {
                  const cur = Array.isArray(role.esap_levels) ? role.esap_levels : [];
                  const next = active ? cur.filter((l) => l !== key) : [...cur, key];
                  onUpdate({ esap_levels: next.length > 0 ? next : null });
                }}
                style={{
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${active ? color : 'var(--color-border-subtle)'}`,
                  backgroundColor: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--color-text-tertiary)',
                  fontSize: '9px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {key.replace('type-', 'T')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Edge form (explicit override edges only) ────────────────────────────

const CONDITION_COLORS = {
  default: 'var(--color-text-secondary)',
  on_approve: 'var(--color-success, #22c55e)',
  on_reject: 'var(--color-error)',
  on_send_back: 'var(--color-warning)',
};

function EdgeForm({ edge, onChange, onDelete, nodes }) {
  const condition = edge.data?.condition || 'default';
  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceName = sourceNode?.data?.stage?.display_name || edge.source;
  const targetName = targetNode?.data?.stage?.display_name || edge.target;

  return (
    <div>
      {/* Color accent stripe */}
      <div
        style={{
          height: '4px',
          borderRadius: '2px',
          backgroundColor: CONDITION_COLORS[condition] || CONDITION_COLORS.default,
          marginBottom: 'var(--spacing-md)',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <SectionTitle style={{ margin: 0 }}>Override Transition</SectionTitle>
        <button
          type="button"
          onClick={onDelete}
          title="Delete this transition"
          style={{
            background: 'none',
            border: '1px solid rgba(220,38,38,0.3)',
            color: 'var(--color-error)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      {/* Info banner */}
      <div
        style={{
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(251,191,36,0.06)',
          border: '1px solid rgba(251,191,36,0.2)',
          color: 'var(--color-text-secondary)',
          fontSize: '10px',
          lineHeight: 1.4,
          marginBottom: 'var(--spacing-md)',
        }}
      >
        This is a custom transition that overrides the default pipeline flow. Delete it to restore
        implicit routing.
      </div>

      <Field label="From">
        <input type="text" className="form-input" value={sourceName} disabled />
      </Field>
      <Field label="To">
        <input type="text" className="form-input" value={targetName} disabled />
      </Field>
      <Field label="Condition" hint="When this transition is followed">
        <select
          className="form-select"
          value={condition}
          onChange={(e) => onChange({ condition: e.target.value })}
        >
          {TRANSITION_CONDITIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <p
        className="text-xs text-tertiary"
        style={{ marginTop: 'var(--spacing-xs)', lineHeight: 1.4, fontStyle: 'italic' }}
      >
        {TRANSITION_CONDITIONS.find((c) => c.value === condition)?.description || ''}
      </p>
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function SectionTitle({ children, style }) {
  return (
    <h4
      style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        margin: '0 0 var(--spacing-sm)',
        ...style,
      }}
    >
      {children}
    </h4>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
          marginBottom: '4px',
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-tertiary" style={{ margin: '3px 0 0', fontSize: '10px' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
