/**
 * SectionHeader — the standard h2 + description preamble used at the top of
 * every SoW sub-section. Extracted from ~20 inline copies.
 */
export default function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
      <h2 className="text-2xl font-semibold mb-sm">{title}</h2>
      {description && (
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          {description}
        </p>
      )}
    </div>
  );
}
