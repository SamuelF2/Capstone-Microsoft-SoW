/**
 * components/ai-review/SimilarSowsSection — Neo4j similarity matches list.
 */

export default function SimilarSowsSection({ similarSows }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        {/* Inline SVG link icon (was 🔗 emoji) — picks up the purple
            accent so the heading reads as part of the dark theme,
            matching the line-art glyphs in the sibling sections. */}
        <span
          style={{
            color: 'var(--color-accent-purple-light)',
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
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </span>{' '}
        Similar SoWs in Knowledge Graph
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {similarSows.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
            }}
          >
            <div>
              <p className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {s.title}
              </p>
              <p className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)' }}>
                {s.methodology}
              </p>
            </div>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(var(--color-accent-purple-light-rgb), 0.12)',
                color: 'var(--color-accent-purple-light)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
              }}
            >
              {Math.round(s.similarity * 100)}% match
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
