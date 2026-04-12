/**
 * BannedPhrasesAccordion — banned phrase matches from /api/ai/context.
 * Each item shows the phrase, why it's flagged, and the suggested
 * replacement (when ML provides one).
 */

import Accordion from './Accordion';

const SEVERITY_COLOR = {
  high: 'var(--color-error)',
  medium: 'var(--color-warning)',
  low: 'var(--color-success)',
};

export default function BannedPhrasesAccordion({ phrases = [], defaultOpen = true }) {
  return (
    <Accordion
      title="Banned Phrases"
      count={phrases.length}
      defaultOpen={defaultOpen}
      accent="var(--color-error)"
    >
      {phrases.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          No banned phrases detected.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {phrases.map((p, i) => {
            const color = SEVERITY_COLOR[p.severity] || SEVERITY_COLOR.low;
            return (
              <div
                key={`${p.phrase}-${i}`}
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  borderLeft: `3px solid ${color}`,
                  backgroundColor: 'var(--color-bg-tertiary)',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  &ldquo;{p.phrase}&rdquo;
                </p>
                {p.reason && (
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '11px',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 'var(--line-height-relaxed)',
                    }}
                  >
                    {p.reason}
                  </p>
                )}
                {p.suggestion && (
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                      fontStyle: 'italic',
                    }}
                  >
                    Try: {p.suggestion}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Accordion>
  );
}
