/**
 * components/ai-review/RisksSection — delivery risk grid.
 */

import { SEVERITY_STYLES, SeverityBadge } from './RecommendationStyles';

export default function RisksSection({ risks }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-warning)' }}>&#9873;</span> Delivery Risks
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--spacing-md)',
        }}
      >
        {risks.map((r, i) => {
          const s = SEVERITY_STYLES[r.level] || SEVERITY_STYLES.low;
          return (
            <div
              key={i}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: `1px solid ${s.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-sm)',
                }}
              >
                <span
                  className="font-semibold"
                  style={{ fontSize: 'var(--font-size-sm)', color: s.color }}
                >
                  {r.category}
                </span>
                <SeverityBadge severity={r.level} />
              </div>
              <p
                className="text-secondary"
                style={{
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: 'var(--line-height-relaxed)',
                }}
              >
                {r.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
