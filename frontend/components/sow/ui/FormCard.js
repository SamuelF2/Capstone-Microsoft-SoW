/**
 * FormCard — a <div class="card"> wrapper with an h3 title (with bottom border)
 * and an optional description paragraph above its children. Used throughout the
 * SoW sub-components (AgileApproach, WaterfallApproach, SupportTransition, etc.).
 */
export default function FormCard({ title, description, children, style }) {
  return (
    <div className="card" style={style}>
      <h3
        className="text-lg font-semibold mb-md"
        style={{
          paddingBottom: 'var(--spacing-md)',
          borderBottom: '1px solid var(--color-border-default)',
        }}
      >
        {title}
      </h3>
      {description && (
        <p
          className="text-sm text-secondary mb-md"
          style={{ lineHeight: 'var(--line-height-relaxed)' }}
        >
          {description}
        </p>
      )}
      {children}
    </div>
  );
}
