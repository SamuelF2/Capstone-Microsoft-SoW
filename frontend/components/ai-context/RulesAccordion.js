/**
 * RulesAccordion — applicable compliance rules retrieved by /api/ai/context
 * for the focused draft section. Each rule has a category-tinted stripe
 * and a one-line description.
 */

import Accordion from './Accordion';

const CATEGORY_COLORS = {
  compliance: 'var(--color-error)',
  delivery: 'var(--color-warning)',
  legal: 'var(--color-accent-purple, #7c3aed)',
  pricing: 'var(--color-accent-blue, #2563eb)',
};

export default function RulesAccordion({ rules = [], defaultOpen = true }) {
  return (
    <Accordion
      title="Applicable Rules"
      count={rules.length}
      defaultOpen={defaultOpen}
      accent="var(--color-accent-purple, #7c3aed)"
    >
      {rules.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          No rules apply to this section.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {rules.map((r, i) => {
            const color = CATEGORY_COLORS[r.category] || 'var(--color-text-secondary)';
            return (
              <div
                key={`${r.name}-${i}`}
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
                  {r.name}
                </p>
                {r.description && (
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: '11px',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 'var(--line-height-relaxed)',
                    }}
                  >
                    {r.description}
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
