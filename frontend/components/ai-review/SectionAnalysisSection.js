/**
 * components/ai-review/SectionAnalysisSection — section coverage + missing keywords.
 */

export default function SectionAnalysisSection({ sections, missingKeywords }) {
  const found = sections.filter((s) => s.found).length;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        {/* Inline SVG (instead of the previous 📄 emoji) so the icon
            picks up the theme accent color and matches the line-art
            glyphs used in the other AI-review section headers. */}
        <span
          style={{
            color: 'var(--color-accent-blue)',
            display: 'inline-flex',
            alignItems: 'center',
          }}
          aria-hidden="true"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="8" y1="13" x2="16" y2="13" />
            <line x1="8" y1="17" x2="16" y2="17" />
          </svg>
        </span>{' '}
        Section Analysis
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: found === sections.length ? 'var(--color-success)' : 'var(--color-warning)',
            fontWeight: 400,
          }}
        >
          {found}/{sections.length} sections found
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {sections.map((s, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: `3px solid ${s.found ? 'var(--color-success)' : 'var(--color-error)'}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: s.issues.length > 0 ? 'var(--spacing-xs)' : 0,
              }}
            >
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {s.displayName}
              </span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  backgroundColor: s.found
                    ? 'rgba(var(--color-success-rgb), 0.12)'
                    : 'rgba(var(--color-error-rgb), 0.12)',
                  color: s.found ? 'var(--color-success)' : 'var(--color-error)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {s.found ? 'Found' : 'Missing'}
              </span>
            </div>
            {s.issues.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-xs)' }}>
                {s.issues.map((issue, j) => (
                  <p
                    key={j}
                    className="text-secondary"
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      lineHeight: 'var(--line-height-relaxed)',
                      margin: 0,
                    }}
                  >
                    {issue}
                  </p>
                ))}
              </div>
            )}
            {s.found && s.content && (
              <details style={{ marginTop: 'var(--spacing-sm)' }}>
                <summary
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  Preview extracted content
                </summary>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 'var(--line-height-relaxed)',
                    marginTop: 'var(--spacing-xs)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '120px',
                    overflow: 'auto',
                  }}
                >
                  {s.content}
                </p>
              </details>
            )}
          </div>
        ))}
      </div>

      {missingKeywords && missingKeywords.length > 0 && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <p
            className="text-sm font-semibold mb-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Missing Methodology Keywords
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
            {missingKeywords.map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: 'rgba(var(--color-warning-rgb), 0.12)',
                  color: 'var(--color-warning)',
                  border: '1px solid rgba(var(--color-warning-rgb), 0.3)',
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
