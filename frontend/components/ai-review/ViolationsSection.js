/**
 * components/ai-review/ViolationsSection — compliance violations card.
 */

import { SEVERITY_STYLES, SeverityBadge } from './RecommendationStyles';

export default function ViolationsSection({ violations }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-error)' }}>&#9888;</span> Compliance Violations
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {violations.length} found
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {violations.map((v, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: `3px solid ${(SEVERITY_STYLES[v.severity] || SEVERITY_STYLES.low).color}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {v.rule}
              </span>
              <SeverityBadge severity={v.severity} />
            </div>
            <p
              className="text-secondary"
              style={{ fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}
            >
              {v.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
