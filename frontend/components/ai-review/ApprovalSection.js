/**
 * components/ai-review/ApprovalSection — ESAP approval status + chain card.
 */

import { APPROVAL_STYLES } from './RecommendationStyles';

export default function ApprovalSection({ approval }) {
  const style = APPROVAL_STYLES[approval.level] || APPROVAL_STYLES.Yellow;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-info)' }}>&#9745;</span> ESAP Approval Status
      </h3>
      <div
        style={{
          padding: 'var(--spacing-lg)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-sm)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: style.color,
              boxShadow: `0 0 8px ${style.color}`,
            }}
          />
          <span
            className="font-semibold"
            style={{ fontSize: 'var(--font-size-xl)', color: style.color }}
          >
            {approval.level} — {approval.esapType}
          </span>
        </div>
        <p
          className="text-secondary"
          style={{ fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}
        >
          {approval.reason}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold mb-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Required Approval Chain
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-sm)',
            alignItems: 'center',
          }}
        >
          {approval.chain.map((person, i) => (
            <span
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
            >
              <span
                style={{
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-sm)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {person}
              </span>
              {i < approval.chain.length - 1 && (
                <span
                  style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}
                >
                  &#8594;
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
