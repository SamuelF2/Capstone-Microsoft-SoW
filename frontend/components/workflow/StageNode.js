/**
 * StageNode — React Flow node for workflow stages (pipeline-first model).
 *
 * Simplified layout (1 input, 1 output):
 *   ┌──────────────────────────────┐
 *   │  ✎  Internal Review     🔒  │  colored header
 *   ├──────────────────────────────┤
 *   │ ● in               default ●│  single input + output
 *   ├──────────────────────────────┤
 *   │  internal_review        AND  │  info (stage key, join badge)
 *   │  2 req · 1 opt              │  role summary
 *   │  ↩ send back: Draft         │  send-back target badge
 *   └──────────────────────────────┘
 *
 * Forward progression, rejection, and send-back are all implicit in the
 * pipeline model — only the single "default" output port is available for
 * drawing explicit override edges.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { isAnchorStage } from '../../lib/workflowStages';
import { PORT_COLORS, STAGE_TYPE_COLORS } from '../../lib/workflowColors';

// ── Constants ───────────────────────────────────────────────────────────────

const NODE_W = 220;
const DOT = 12;

const TYPE_META = {
  draft: { icon: '✎', hint: 'Entry' },
  ai_analysis: { icon: '🤖', hint: 'AI' },
  review: { icon: '👁', hint: 'Review' },
  approval: { icon: '✔', hint: 'Approval' },
  terminal: { icon: '⏹', hint: 'Terminal' },
  parallel_gateway: { icon: '⑃', hint: 'Parallel' },
};

const HEADER_BG = STAGE_TYPE_COLORS;

const PORT = {
  in: PORT_COLORS.in,
  default: PORT_COLORS.out,
};

// ── Handle definitions (single source + single target) ──────────────────────

const SOURCE_HANDLES = [{ id: 'src-default', condition: 'default', position: Position.Right }];

const TARGET_HANDLES = [{ id: 'tgt-in', position: Position.Left }];

// ── Port dot + invisible Handle ─────────────────────────────────────────────

function PortDot({ id, type, position, color }) {
  return (
    <div style={{ position: 'relative', width: DOT, height: DOT, flexShrink: 0 }}>
      <div
        style={{
          width: DOT,
          height: DOT,
          borderRadius: '50%',
          backgroundColor: color,
          border: '2px solid rgba(255,255,255,0.15)',
          boxShadow: `0 0 6px ${color}50`,
        }}
      />
      <Handle
        id={id}
        type={type}
        position={position}
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: DOT + 8,
          height: DOT + 8,
          opacity: 0,
          background: 'transparent',
          border: 'none',
          cursor: 'crosshair',
        }}
      />
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

function StageNode({ id, data, selected }) {
  const stage = data.stage || {};
  const isAnchor = isAnchorStage(id);
  const sType = stage.stage_type || 'review';
  const meta = isAnchor
    ? { icon: iconForAnchor(id), hint: anchorHint(id) }
    : TYPE_META[sType] || TYPE_META.review;

  const isReviewable = sType === 'review' || sType === 'approval';
  const isAI = sType === 'ai_analysis';
  const headerBg = isAnchor ? anchorHeaderBg(id) : HEADER_BG[sType] || HEADER_BG.review;

  const roleCount = Array.isArray(stage.roles) ? stage.roles.length : 0;
  const requiredRoleCount = Array.isArray(stage.roles)
    ? stage.roles.filter((r) => r.is_required).length
    : 0;

  const joinMode = stage.config?.join_mode;
  const showJoinBadge = joinMode && joinMode !== 'default';
  const sendBackTarget = stage.config?.send_back_target;
  const showSendBack = (isReviewable || isAI) && !isAnchor;

  return (
    <div
      style={{
        width: NODE_W,
        borderRadius: 8,
        backgroundColor: '#1e293b',
        border: `2px solid ${selected ? '#60a5fa' : '#334155'}`,
        boxShadow: selected
          ? '0 0 0 2px rgba(96,165,250,0.25), 0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: headerBg,
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>{meta.icon}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stage.display_name || id}
        </span>
        {isAnchor && <span style={{ fontSize: 10, opacity: 0.7 }}>🔒</span>}
      </div>

      {/* ── PORTS (single row: input left, output right) ──────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 4px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 0 }}>
          <PortDot id="tgt-in" type="target" position={Position.Left} color={PORT.in} />
          <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>from prev</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingRight: 0 }}>
          <span style={{ fontSize: 10, color: PORT.default, fontWeight: 500 }}>
            {isReviewable ? 'on approve' : 'next'}
          </span>
          <PortDot id="src-default" type="source" position={Position.Right} color={PORT.default} />
        </div>
      </div>

      {/* ── INFO SECTION ───────────────────────────────────────────── */}
      {(!isAnchor || showJoinBadge || roleCount > 0) && (
        <div
          style={{
            padding: '4px 10px 6px',
            borderTop: '1px solid #334155',
          }}
        >
          {/* Stage key + join badge */}
          {!isAnchor && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: roleCount > 0 || showSendBack ? 3 : 0,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: '#64748b',
                  fontFamily: 'monospace',
                }}
              >
                {stage.stage_key}
              </span>
              {showJoinBadge && (
                <span
                  style={{
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '1px 4px',
                    borderRadius: 3,
                    backgroundColor: '#0d9488',
                    color: '#fff',
                  }}
                >
                  {joinMode === 'all_required'
                    ? 'AND'
                    : joinMode === 'any_required'
                      ? 'OR'
                      : 'JOIN'}
                </span>
              )}
            </div>
          )}

          {/* Role summary */}
          {!isAnchor && roleCount > 0 && (
            <div style={{ fontSize: 10, color: '#94a3b8' }}>
              <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{requiredRoleCount}</span>
              <span> req</span>
              {roleCount - requiredRoleCount > 0 && (
                <span> · {roleCount - requiredRoleCount} opt</span>
              )}
            </div>
          )}

          {/* No reviewers warning */}
          {!isAnchor && roleCount === 0 && isReviewable && (
            <div style={{ fontSize: 10, color: '#f59e0b', fontStyle: 'italic' }}>no reviewers</div>
          )}

          {/* Send-back target badge */}
          {showSendBack && (
            <div
              style={{
                fontSize: 9,
                color: '#f59e0b',
                marginTop: 3,
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              <span style={{ fontSize: 10 }}>&#8617;</span>
              send back: {_sendBackLabel(sendBackTarget)}
            </div>
          )}
        </div>
      )}

      {/* Bottom padding */}
      <div style={{ height: 4 }} />
    </div>
  );
}

function _sendBackLabel(target) {
  if (!target || target === 'previous') return 'previous';
  if (target === 'draft') return 'Draft';
  return target.replace(/_/g, ' ');
}

// ── Anchor helpers ──────────────────────────────────────────────────────────

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

function anchorHeaderBg(key) {
  switch (key) {
    case 'draft':
      return '#475569';
    case 'approved':
      return '#059669';
    case 'finalized':
      return '#2563eb';
    case 'rejected':
      return '#dc2626';
    default:
      return '#475569';
  }
}

const HANDLE_COLORS = {
  default: PORT.default,
  target: PORT.in,
};

export default memo(StageNode);
export { SOURCE_HANDLES, TARGET_HANDLES, HANDLE_COLORS };
