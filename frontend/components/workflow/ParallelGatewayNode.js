/**
 * ParallelGatewayNode — parallel fork/join gateway with dynamic branches.
 *
 * Starts with 1 branch. When that branch gets a connection, a new empty
 * branch appears automatically. Only branches with actual connections are
 * used at runtime.
 *
 *   ┌──────────────────────────────┐
 *   │  ⑃  Parallel Gateway         │  teal header
 *   ├──────────────────────────────┤
 *   │ ● from prev                  │  single input
 *   ├──────────────────────────────┤
 *   │  ◆ parallel_fork             │  diamond icon + stage key
 *   │  fan-out gateway             │  hint text
 *   ├──────────────────────────────┤
 *   │  BRANCHES                    │
 *   │                   branch 1 ● │  connected (has edge)
 *   │                   branch 2 ● │  next available slot
 *   └──────────────────────────────┘
 *
 * data.connectedBranches is injected by the canvas (WorkflowFlowEditor)
 * and lists which src-branch-N handles have outgoing edges.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';

const NODE_W = 220;
const DOT = 12;
const ACCENT = '#0d9488';

const PORT = {
  in: '#3b82f6',
  connected: '#0d9488',
  available: '#475569',
};

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

function ParallelGatewayNode({ id, data, selected }) {
  const stage = data.stage || {};
  const label = stage.display_name || 'Parallel Gateway';

  // connectedBranches is a Set of handle IDs that have outgoing edges,
  // injected by the canvas. e.g. new Set(['src-branch-1', 'src-branch-2'])
  const connected = data.connectedBranches || new Set();

  // Build the branch list: all connected branches + one empty slot for
  // the next connection.
  const branches = [];
  let n = 1;
  while (true) {
    const handleId = `src-branch-${n}`;
    const isConnected = connected.has(handleId);
    branches.push({
      id: handleId,
      label: `branch ${n}`,
      color: isConnected ? PORT.connected : PORT.available,
      isConnected,
    });
    // Stop once we've added one unconnected branch (the "next slot")
    if (!isConnected) break;
    n++;
  }

  return (
    <div
      style={{
        width: NODE_W,
        borderRadius: 8,
        backgroundColor: '#1e293b',
        border: `2px solid ${selected ? '#2dd4bf' : '#334155'}`,
        boxShadow: selected
          ? '0 0 0 2px rgba(13,148,136,0.25), 0 4px 12px rgba(0,0,0,0.3)'
          : '0 2px 8px rgba(0,0,0,0.25)',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────────── */}
      <div
        style={{
          backgroundColor: ACCENT,
          padding: '7px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ fontSize: 13 }}>⑃</span>
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
          {label}
        </span>
      </div>

      {/* ── INPUT ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '6px 12px 6px 4px',
        }}
      >
        <PortDot id="tgt-in" type="target" position={Position.Left} color={PORT.in} />
        <span style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 500 }}>from prev</span>
      </div>

      {/* ── INFO SECTION ───────────────────────────────────────────── */}
      <div
        style={{
          padding: '6px 10px 8px',
          borderTop: '1px solid #334155',
          borderBottom: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            transform: 'rotate(45deg)',
            borderRadius: 3,
            backgroundColor: selected ? 'rgba(13,148,136,0.15)' : 'transparent',
            border: `2px solid ${ACCENT}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              transform: 'rotate(-45deg)',
              fontSize: 11,
              fontWeight: 900,
              color: ACCENT,
              letterSpacing: 1.5,
              userSelect: 'none',
            }}
          >
            |||
          </div>
        </div>
        {stage.stage_key && (
          <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
            {stage.stage_key}
          </span>
        )}
        <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>fan-out gateway</span>
      </div>

      {/* ── BRANCHES ───────────────────────────────────────────────── */}
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '1px',
          color: '#64748b',
          textTransform: 'uppercase',
          padding: '6px 10px 2px',
        }}
      >
        Branches
      </div>
      {branches.map((b) => (
        <div
          key={b.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            justifyContent: 'flex-end',
            padding: '4px 4px 4px 12px',
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: b.isConnected ? PORT.connected : '#64748b',
              fontWeight: 500,
              fontStyle: b.isConnected ? 'normal' : 'italic',
            }}
          >
            {b.label}
          </span>
          <PortDot id={b.id} type="source" position={Position.Right} color={b.color} />
        </div>
      ))}

      <div style={{ height: 4 }} />
    </div>
  );
}

export default memo(ParallelGatewayNode);
