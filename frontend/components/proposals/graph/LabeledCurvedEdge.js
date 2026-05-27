/**
 * LabeledCurvedEdge — Neo4j-style relationship edge.
 *
 * Renders an SVG cubic bezier path between two proposal nodes with a
 * pill-shaped relationship label at the midpoint and a small arrowhead
 * pointing at the target. Inferred edges (the only kind that use this
 * component) draw with a dashed stroke and a tooltip note so it's clear
 * they were synthesized from co-occurrence in a source_section, not
 * derived from an explicit endpoint pair in the SchemaProposal data.
 */

import { memo } from 'react';
import { EdgeLabelRenderer, getBezierPath, BaseEdge } from 'reactflow';
import { STATUS_STYLES } from '../proposalUtils';

function LabeledCurvedEdgeBase({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data = {},
  markerEnd,
}) {
  const status = data.status || 'pending';
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const dimmed = !!data.dimmed;
  const highlighted = !!data.highlighted;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.3,
  });

  const stroke = statusStyle.dot;
  const baseOpacity = dimmed ? 0.22 : highlighted ? 1 : 0.7;
  const strokeWidth = highlighted ? 2.6 : 1.6;
  const labelOpacity = dimmed ? 0.3 : 1;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray: data.inferred ? '5 4' : undefined,
          opacity: baseOpacity,
          transition: 'opacity 120ms ease-out, stroke-width 120ms ease-out',
        }}
      />
      <EdgeLabelRenderer>
        <div
          title={
            data.inferred
              ? `Inferred edge: ${data.label}\n(Endpoints chosen from highest-confidence node proposals in the same source section.)`
              : data.label
          }
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            background: 'var(--color-bg-secondary, #141414)',
            color: stroke,
            border: `1px solid ${stroke}`,
            borderRadius: 'var(--radius-full, 9999px)',
            padding: '2px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-family-mono, monospace)',
            fontWeight: 600,
            letterSpacing: '0.02em',
            opacity: labelOpacity,
            whiteSpace: 'nowrap',
            maxWidth: 160,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'opacity 120ms ease-out',
          }}
        >
          {data.label}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

export default memo(LabeledCurvedEdgeBase);
