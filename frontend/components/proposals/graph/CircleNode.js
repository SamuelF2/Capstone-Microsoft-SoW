/**
 * CircleNode — Neo4j-style filled circle for a schema proposal.
 *
 * The wrapper div is sized tightly to the visible circle so that hover
 * detection only fires when the cursor is actually over the node. The
 * visual SVG is positioned absolutely on top of the wrapper with a
 * fixed 100×100 viewport (and overflow: visible) so the confidence
 * ring, hover glow, and pin badge can extend outside the hit area
 * without enlarging it. The SVG itself has pointer-events: none so it
 * doesn't intercept events — the wrapper div is the only hit target.
 *
 * The outer ring is a confidence indicator (the filled arc represents
 * `confidence`); the inner filled circle is colored by `kind`; the
 * inner stroke encodes status (solid green = accepted, solid blue =
 * pending, dashed red = rejected). Hover state thickens the stroke
 * and brightens the circle; the dim state drops opacity so the focused
 * neighborhood pops.
 *
 * Edge proposals that couldn't be inferred as a real edge fall back
 * to a diamond polygon (same color/status semantics) so they're still
 * surfaced visually.
 *
 * Custom memo comparator compares only `data` (and `selected`) so the
 * common case during drag — every node receiving a re-render because
 * the parent recomputed `flowNodes` — only triggers actual repaint for
 * the node whose data actually changed.
 */

import { memo } from 'react';
import { Handle, Position } from 'reactflow';

const VISUAL_BOX = 100;
const VISUAL_CENTER = VISUAL_BOX / 2;
const HIT_PADDING = 6;

export function circleNodeHitSize(data) {
  const radius = Math.max(12, Math.min(42, data?.radius ?? 22));
  return Math.round(radius * 2 + HIT_PADDING * 2);
}

const STATUS_STROKE = {
  accepted: { color: '#4ade80', width: 3, dash: undefined },
  pending: { color: '#3b82f6', width: 2, dash: undefined },
  rejected: { color: '#ef4444', width: 2, dash: '5 3' },
};

const KIND_ICON = {
  node: '◆',
  edge: '↣',
  section_type: '§',
};

function fontSizeForLabel(label, radius) {
  const len = label?.length || 1;
  if (len <= 3) return Math.min(radius * 0.9, 18);
  if (len <= 6) return Math.min(radius * 0.7, 15);
  if (len <= 10) return Math.min(radius * 0.55, 13);
  return Math.min(radius * 0.45, 11);
}

function diamondPoints(cx, cy, r) {
  return `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
}

function CircleNodeBase({ data }) {
  const radius = Math.max(12, Math.min(42, data.radius ?? 22));
  const color = data.color || '#4C8EDA';
  const status = data.status || 'pending';
  const stroke = STATUS_STROKE[status] || STATUS_STROKE.pending;
  const isDiamond = data.shape === 'diamond';
  const dimmed = !!data.dimmed;
  const highlighted = !!data.highlighted;
  const confidence = Math.max(0, Math.min(1, data.confidence || 0));
  const ringR = radius + 5;
  const ringCirc = 2 * Math.PI * ringR;
  const fontSize = fontSizeForLabel(data.label, radius);

  const fillOpacity = dimmed ? 0.22 : highlighted ? 1 : 0.94;
  const strokeWidth = highlighted ? stroke.width + 1.5 : stroke.width;
  const labelOpacity = dimmed ? 0.35 : 1;

  // Wrapper is tight to the visible shape so hover only fires within
  // the node itself. The visual SVG is centered on the wrapper but has
  // its own fixed 100×100 viewport with overflow: visible so glow,
  // confidence ring, and pin badge can render outside the hit area.
  const hitSize = circleNodeHitSize(data);
  const visualOffset = (hitSize - VISUAL_BOX) / 2;
  const wrapperCenter = hitSize / 2;

  return (
    <div
      title={
        `${data.fullLabel || data.label}` +
        (data.confidence != null ? `\nConfidence: ${Math.round(confidence * 100)}%` : '') +
        (data.uses != null ? `\nUsed by ${data.uses} extractions` : '') +
        (data.source ? `\nSource: ${data.source}` : '') +
        (isDiamond ? `\n(Edge proposal — no inferable endpoints in this source section)` : '')
      }
      style={{
        width: hitSize,
        height: hitSize,
        position: 'relative',
        cursor: 'pointer',
        transition:
          'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), filter 180ms ease-out, opacity 200ms ease-out',
        transform: highlighted ? 'scale(1.08)' : 'scale(1)',
        filter: highlighted
          ? `drop-shadow(0 0 12px ${color}aa) drop-shadow(0 0 4px ${color}88)`
          : 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
        opacity: dimmed ? 0.55 : 1,
        willChange: 'transform, filter, opacity',
      }}
    >
      <svg
        width={VISUAL_BOX}
        height={VISUAL_BOX}
        style={{
          position: 'absolute',
          left: visualOffset,
          top: visualOffset,
          overflow: 'visible',
          // SVG is purely decorative — the wrapper div is the hit target.
          // Without this, hovering on SVG content outside the wrapper's
          // bounding box would still fire mouseenter on the wrapper.
          pointerEvents: 'none',
        }}
      >
        {/* Confidence ring track */}
        {!isDiamond && (
          <circle
            cx={VISUAL_CENTER}
            cy={VISUAL_CENTER}
            r={ringR}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={2}
            opacity={dimmed ? 0.4 : 1}
          />
        )}
        {/* Confidence ring fill (clockwise from 12 o'clock) */}
        {!isDiamond && confidence > 0 && (
          <circle
            cx={VISUAL_CENTER}
            cy={VISUAL_CENTER}
            r={ringR}
            fill="none"
            stroke={color}
            strokeWidth={2}
            strokeDasharray={`${confidence * ringCirc} ${ringCirc}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${VISUAL_CENTER} ${VISUAL_CENTER})`}
            opacity={dimmed ? 0.3 : 0.85}
          />
        )}

        {/* Main shape */}
        {isDiamond ? (
          <polygon
            points={diamondPoints(VISUAL_CENTER, VISUAL_CENTER, radius)}
            fill={color}
            fillOpacity={fillOpacity}
            stroke={stroke.color}
            strokeWidth={strokeWidth}
            strokeDasharray={stroke.dash}
            style={{
              transition: 'fill-opacity 200ms ease-out, stroke-width 180ms ease-out',
            }}
          />
        ) : (
          <circle
            cx={VISUAL_CENTER}
            cy={VISUAL_CENTER}
            r={radius}
            fill={color}
            fillOpacity={fillOpacity}
            stroke={stroke.color}
            strokeWidth={strokeWidth}
            strokeDasharray={stroke.dash}
            style={{
              transition: 'fill-opacity 200ms ease-out, stroke-width 180ms ease-out',
            }}
          />
        )}

        {/* Glow on highlight */}
        {highlighted && !isDiamond && (
          <circle
            cx={VISUAL_CENTER}
            cy={VISUAL_CENTER}
            r={radius + 1}
            fill="none"
            stroke={color}
            strokeWidth={1}
            opacity={0.5}
          />
        )}

        {/* Centered label — paint-order trick gives a subtle dark halo
            around the white text so it stays legible against any fill. */}
        <text
          x={VISUAL_CENTER}
          y={VISUAL_CENTER}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight={600}
          fill="#ffffff"
          stroke="rgba(0,0,0,0.55)"
          strokeWidth={3}
          paintOrder="stroke"
          opacity={labelOpacity}
          style={{
            transition: 'opacity 200ms ease-out',
            fontFamily:
              data.kind === 'edge' ? 'var(--font-family-mono)' : 'var(--font-family-base)',
            letterSpacing: '0.01em',
          }}
        >
          {data.label}
        </text>

        {/* Kind icon in the top-left for non-diamond nodes (subtle) */}
        {!isDiamond && KIND_ICON[data.kind] && (
          <text
            x={VISUAL_CENTER - radius * 0.65}
            y={VISUAL_CENTER - radius * 0.55}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.min(10, radius * 0.4)}
            fill="rgba(255,255,255,0.7)"
            opacity={dimmed ? 0.3 : 0.85}
          >
            {KIND_ICON[data.kind]}
          </text>
        )}
      </svg>

      {/* Invisible handles at the wrapper's center so edges attach cleanly
          regardless of node radius. */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          left: wrapperCenter,
          top: wrapperCenter,
          width: 1,
          height: 1,
          background: 'transparent',
          border: 'none',
          pointerEvents: 'none',
        }}
        isConnectable={false}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          left: wrapperCenter,
          top: wrapperCenter,
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

// memo with a custom comparator so re-renders triggered by the parent
// re-computing `flowNodes` (which produces a new node object every time)
// bail out as long as the data reference is unchanged. The parent stabilizes
// data refs via a per-id cache, so unaffected nodes truly skip re-render
// during drag.
const CircleNode = memo(
  CircleNodeBase,
  (prev, next) => prev.data === next.data && prev.selected === next.selected
);

export default CircleNode;
