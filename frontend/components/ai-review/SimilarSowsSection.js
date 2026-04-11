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
        <span style={{ color: 'var(--color-accent-purple-light)' }}>&#128279;</span> Similar SoWs in
        Knowledge Graph
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
                backgroundColor: 'rgba(139,92,246,0.12)',
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
