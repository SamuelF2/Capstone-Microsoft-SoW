/**
 * GraphLegend — Neo4j-style legend / status bar overlaid on the canvas.
 *
 * Sits in a ReactFlow <Panel> (top-right). Shows:
 *   - One row per kind with a swatch (the kind's color), the count of
 *     visible proposals of that kind, and the kind icon.
 *   - One row per status with a stroke swatch (solid green / solid blue
 *     / dashed red) and count.
 *   - A short summary line with source and inferred-edge counts.
 *
 * Pure presentational — receives counts from the parent.
 */

import { Panel } from 'reactflow';
import { KIND_STYLES, STATUS_STYLES } from '../proposalUtils';
import { colorForKind } from './neo4jPalette';

const STATUS_STROKE_PREVIEW = {
  accepted: { color: '#4ade80', dash: undefined, width: 3 },
  pending: { color: '#3b82f6', dash: undefined, width: 2 },
  rejected: { color: '#ef4444', dash: '4 3', width: 2 },
};

function LegendRow({ swatch, label, count, mono = false }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-sm, 8px)',
        padding: '4px 0',
        fontSize: 'var(--font-size-xs, 12px)',
        color: 'var(--color-text-secondary, #a0a0a0)',
      }}
    >
      {swatch}
      <span
        style={{
          flex: 1,
          color: 'var(--color-text-primary, #ffffff)',
          fontFamily: mono ? 'var(--font-family-mono, monospace)' : undefined,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--color-text-secondary, #a0a0a0)',
        }}
      >
        {count}
      </span>
    </div>
  );
}

export default function GraphLegend({ kindCounts, statusCounts, sourceCount, edgeCount }) {
  return (
    <Panel
      position="top-right"
      style={{
        margin: 'var(--spacing-md, 16px)',
        background: 'rgba(20,20,20,0.92)',
        border: '1px solid var(--color-border-default, #333)',
        borderRadius: 'var(--radius-lg, 8px)',
        padding: 'var(--spacing-md, 16px)',
        minWidth: 200,
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      }}
    >
      <div
        style={{
          fontSize: 'var(--font-size-xs, 12px)',
          fontWeight: 'var(--font-weight-semibold, 600)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-secondary, #a0a0a0)',
          marginBottom: 'var(--spacing-sm, 8px)',
        }}
      >
        Labels
      </div>
      {['node', 'section_type', 'edge'].map((kind) => (
        <LegendRow
          key={kind}
          swatch={
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: colorForKind(kind),
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          }
          label={KIND_STYLES[kind]?.label || kind}
          count={kindCounts[kind] || 0}
        />
      ))}

      <div
        style={{
          height: 1,
          background: 'var(--color-border-default, #333)',
          margin: 'var(--spacing-sm, 8px) 0',
        }}
      />

      <div
        style={{
          fontSize: 'var(--font-size-xs, 12px)',
          fontWeight: 'var(--font-weight-semibold, 600)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--color-text-secondary, #a0a0a0)',
          marginBottom: 'var(--spacing-sm, 8px)',
        }}
      >
        Status (stroke)
      </div>
      {['pending', 'accepted', 'rejected'].map((status) => {
        const s = STATUS_STROKE_PREVIEW[status];
        return (
          <LegendRow
            key={status}
            swatch={
              <svg width={14} height={14} style={{ flexShrink: 0 }}>
                <circle
                  cx={7}
                  cy={7}
                  r={5}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={s.width}
                  strokeDasharray={s.dash}
                />
              </svg>
            }
            label={STATUS_STYLES[status]?.label || status}
            count={statusCounts[status] || 0}
          />
        );
      })}

      <div
        style={{
          height: 1,
          background: 'var(--color-border-default, #333)',
          margin: 'var(--spacing-sm, 8px) 0',
        }}
      />

      <div
        style={{
          fontSize: 'var(--font-size-xs, 12px)',
          color: 'var(--color-text-secondary, #a0a0a0)',
        }}
      >
        <span style={{ color: 'var(--color-text-primary, #fff)' }}>{sourceCount}</span> source
        {sourceCount === 1 ? '' : 's'} ·{' '}
        <span style={{ color: 'var(--color-text-primary, #fff)' }}>{edgeCount}</span> inferred edge
        {edgeCount === 1 ? '' : 's'}
      </div>
    </Panel>
  );
}
