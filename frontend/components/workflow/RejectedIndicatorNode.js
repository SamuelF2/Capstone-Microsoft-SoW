/**
 * RejectedIndicatorNode — small non-interactive pill that serves as the
 * visual termination point for implicit reject ghost edges.
 *
 * The full "rejected" anchor stage is hidden from the canvas in the
 * pipeline-first model, but we still need a visual cue showing where
 * rejection leads.  This node is positioned below the main chain and
 * cannot be dragged, selected, or connected to.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';

function RejectedIndicatorNode() {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 14px',
        borderRadius: 20,
        backgroundColor: 'rgba(220, 38, 38, 0.10)',
        border: '1px solid rgba(220, 38, 38, 0.30)',
        fontSize: 11,
        fontWeight: 600,
        color: '#ef4444',
        opacity: 0.7,
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      {/* Hidden target handle so ghost reject edges can terminate here */}
      <Handle
        id="tgt-in"
        type="target"
        position={Position.Left}
        style={{ opacity: 0, width: 1, height: 1, border: 'none', background: 'transparent' }}
        isConnectable={false}
      />
      <span style={{ fontSize: 12 }}>&#10007;</span>
      Rejected
    </div>
  );
}

export default memo(RejectedIndicatorNode);
