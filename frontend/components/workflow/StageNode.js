/**
 * StageNode — custom React Flow node for a workflow stage.
 *
 * A single component handles every stage type (draft / review / approval /
 * ai_analysis / terminal) by switching icon, accent color, and label hints
 * based on the stage record carried in `data.stage`. Keeping it in one file
 * avoids five near-duplicate components for what amounts to a pill with a
 * coloured stripe.
 *
 * The node exposes two React Flow handles (left = target, right = source) so
 * authors can wire edges by dragging from one node's right edge to another
 * node's left edge. Anchors (draft/approved/finalized/rejected) show a lock
 * badge and hide their inline inputs — their display_name is immutable.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { ANCHOR_STAGES, isAnchorStage, stageColor } from '../../lib/workflowStages';

// Icon + short hint per stage type. Anchors override the icon so Draft always
// looks like an entry card and Approved/Finalized/Rejected always look like
// terminals, regardless of what stage_type the backend assigned to them.
const TYPE_META = {
  draft: { icon: '✎', hint: 'Entry' },
  ai_analysis: { icon: '🤖', hint: 'AI Analysis' },
  review: { icon: '👁', hint: 'Review' },
  approval: { icon: '✔', hint: 'Approval' },
  terminal: { icon: '⏹', hint: 'Terminal' },
};

function StageNode({ id, data, selected }) {
  const stage = data.stage || {};
  const isAnchor = isAnchorStage(id);
  const accent = stageColor(id, stage.stage_type);
  const meta = isAnchor
    ? { icon: iconForAnchor(id), hint: anchorHint(id) }
    : TYPE_META[stage.stage_type] || TYPE_META.review;

  const roleCount = Array.isArray(stage.roles) ? stage.roles.length : 0;
  const requiredRoleCount = Array.isArray(stage.roles)
    ? stage.roles.filter((r) => r.is_required).length
    : 0;

  return (
    <div
      style={{
        minWidth: '190px',
        maxWidth: '220px',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-secondary)',
        border: `2px solid ${selected ? 'var(--color-accent-blue)' : 'var(--color-border-default)'}`,
        boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
        overflow: 'hidden',
        transition: 'border-color var(--transition-base), box-shadow var(--transition-base)',
      }}
    >
      {/* Left target handle — where incoming edges connect */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: accent, width: 10, height: 10, border: '2px solid white' }}
      />

      {/* Accent stripe uses stageColor so anchors and middle stages read at
          a glance — green for approved, red for rejected, purple for approval
          stages, etc. */}
      <div style={{ height: '4px', backgroundColor: accent }} />

      <div style={{ padding: '10px 12px' }}>
        {/* Top row: icon + type hint + lock (for anchors) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            fontWeight: 'var(--font-weight-semibold)',
            textTransform: 'uppercase',
            letterSpacing: '0.4px',
          }}
        >
          <span style={{ fontSize: '14px' }}>{meta.icon}</span>
          <span>{meta.hint}</span>
          {isAnchor && (
            <span
              title={ANCHOR_STAGES[id]?.description || 'Anchor stage — locked'}
              style={{ marginLeft: 'auto', fontSize: '11px' }}
            >
              🔒
            </span>
          )}
        </div>

        {/* Display name */}
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
            lineHeight: 1.3,
            wordBreak: 'break-word',
          }}
        >
          {stage.display_name || id}
        </div>

        {/* stage_key subline (monospace) only for middle stages — anchors
            always have well-known keys that don't need to be shown. */}
        {!isAnchor && stage.stage_key && (
          <div
            style={{
              fontSize: '10px',
              color: 'var(--color-text-tertiary)',
              fontFamily: 'monospace',
              marginTop: '2px',
            }}
          >
            {stage.stage_key}
          </div>
        )}

        {/* Role chips — show required count for review/approval stages so it's
            obvious at a glance whether a stage has any reviewers assigned. */}
        {!isAnchor && roleCount > 0 && (
          <div
            style={{
              marginTop: '6px',
              fontSize: '10px',
              color: 'var(--color-text-secondary)',
            }}
          >
            {requiredRoleCount > 0 && (
              <span
                style={{
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: `${accent}22`,
                  color: accent,
                  fontWeight: 600,
                  marginRight: '4px',
                }}
              >
                {requiredRoleCount} req
              </span>
            )}
            {roleCount - requiredRoleCount > 0 && (
              <span style={{ color: 'var(--color-text-tertiary)' }}>
                +{roleCount - requiredRoleCount} optional
              </span>
            )}
          </div>
        )}

        {/* Empty state for middle stages with no roles — quietly nudge the
            author that reviewers still need to be assigned. */}
        {!isAnchor &&
          roleCount === 0 &&
          (stage.stage_type === 'review' || stage.stage_type === 'approval') && (
            <div
              style={{
                marginTop: '6px',
                fontSize: '10px',
                color: 'var(--color-warning)',
                fontStyle: 'italic',
              }}
            >
              no reviewers
            </div>
          )}
      </div>

      {/* Right source handle — where outgoing edges originate */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: accent, width: 10, height: 10, border: '2px solid white' }}
      />
    </div>
  );
}

// ── Anchor-specific helpers ─────────────────────────────────────────────────

function iconForAnchor(key) {
  switch (key) {
    case 'draft':
      return '✎';
    case 'approved':
      return '✔';
    case 'finalized':
      return '🔒';
    case 'rejected':
      return '✗';
    default:
      return '●';
  }
}

function anchorHint(key) {
  switch (key) {
    case 'draft':
      return 'Entry';
    case 'approved':
      return 'Success';
    case 'finalized':
      return 'Exit';
    case 'rejected':
      return 'Failure';
    default:
      return '';
  }
}

// React Flow re-renders heavily during drag; memo avoids re-rendering every
// stage on every pointer move.
export default memo(StageNode);
