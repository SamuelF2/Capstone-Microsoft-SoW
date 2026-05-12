/**
 * SourceHubNode — small neutral hub representing a source document.
 *
 * Hubs are non-interactive: they exist so the force simulation can
 * anchor each cluster around a single point (the document's "centroid")
 * and so the user can read which proposals came from which document.
 * Clicking a hub does nothing — only proposal nodes open the drawer.
 *
 * Rendered into an 80×80 viewport with the circle drawn at the center.
 * The parent applies a (-40, -40) position offset so the visual center
 * matches the simulation coordinate.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';

const BOX = 80;
const CENTER = BOX / 2;
const RADIUS = 14;

function SourceHubNodeBase({ data }) {
  const dimmed = !!data.dimmed;
  const highlighted = !!data.highlighted;
  const opacity = dimmed ? 0.4 : 1;

  return (
    <div
      title={data.fullLabel || data.source || 'Unknown source'}
      style={{
        width: BOX,
        height: BOX,
        position: 'relative',
        pointerEvents: 'none',
        opacity,
        transition: 'opacity 200ms ease-out, filter 200ms ease-out',
        filter: highlighted
          ? 'drop-shadow(0 0 8px rgba(156,163,175,0.5))'
          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.4))',
      }}
    >
      <svg width={BOX} height={BOX} style={{ overflow: 'visible' }}>
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
          fill={data.color || '#6b7280'}
          fillOpacity={highlighted ? 0.95 : 0.7}
          stroke="#9ca3af"
          strokeWidth={highlighted ? 2 : 1.25}
          style={{ transition: 'fill-opacity 200ms ease-out, stroke-width 200ms ease-out' }}
        />
        {/* Inner dot */}
        <circle cx={CENTER} cy={CENTER} r={3} fill="#0a0a0a" opacity={0.6} />
        {/* Source filename caption under the hub — paint-order halo for
            legibility against the dark canvas dot pattern. */}
        <text
          x={CENTER}
          y={CENTER + RADIUS + 14}
          textAnchor="middle"
          fontSize={10}
          fontWeight={500}
          fill="var(--color-text-secondary, #a0a0a0)"
          stroke="rgba(10,10,10,0.7)"
          strokeWidth={2.5}
          paintOrder="stroke"
          style={{ pointerEvents: 'none' }}
        >
          {data.label}
        </text>
      </svg>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          left: CENTER,
          top: CENTER,
          width: 1,
          height: 1,
          background: 'transparent',
          border: 'none',
          pointerEvents: 'none',
        }}
        isConnectable={false}
      />
      <Handle
        type="target"
        position={Position.Top}
        style={{
          left: CENTER,
          top: CENTER,
          width: 1,
          height: 1,
          background: 'transparent',
          border: 'none',
          pointerEvents: 'none',
        }}
        isConnectable={false}
      />
    </div>
  );
}

const SourceHubNode = memo(SourceHubNodeBase);
SourceHubNode.BOX = BOX;
export default SourceHubNode;
