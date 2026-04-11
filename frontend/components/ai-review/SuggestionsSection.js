/**
 * components/ai-review/SuggestionsSection — section-by-section AI suggestions.
 */

import { SUGGESTION_TYPE_STYLES } from './RecommendationStyles';

export default function SuggestionsSection({ suggestions }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-blue)' }}>&#9998;</span> Section Suggestions
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {suggestions.length} suggestions
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {suggestions.map((s, i) => {
          const typeStyle = SUGGESTION_TYPE_STYLES[s.type] || SUGGESTION_TYPE_STYLES.flag;
          return (
            <div
              key={i}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {s.section}
                  <span className="text-tertiary" style={{ fontWeight: 400, marginLeft: 6 }}>
                    Line {s.line}
                  </span>
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    backgroundColor: typeStyle.bg,
                    color: typeStyle.color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {typeStyle.label}
                </span>
              </div>

              {s.original && (
                <div
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(239,68,68,0.06)',
                    borderLeft: '3px solid rgba(239,68,68,0.4)',
                    marginBottom: 'var(--spacing-sm)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                      textDecoration: 'line-through',
                      lineHeight: 'var(--line-height-relaxed)',
                      margin: 0,
                    }}
                  >
                    {s.original}
                  </p>
                </div>
              )}

              <div
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(74,222,128,0.06)',
                  borderLeft: '3px solid rgba(74,222,128,0.4)',
                  marginBottom: 'var(--spacing-sm)',
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    lineHeight: 'var(--line-height-relaxed)',
                    margin: 0,
                  }}
                >
                  {s.suggested}
                </p>
              </div>

              <p
                className="text-secondary"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 'var(--line-height-relaxed)',
                  margin: 0,
                  fontStyle: 'italic',
                }}
              >
                {s.reason}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
