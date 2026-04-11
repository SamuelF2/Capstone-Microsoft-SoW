/**
 * RemoveButton — the × button positioned in the top-right of a list card.
 * Used to remove items from horizontal card lists (deliverables, sprints,
 * team members, backlog items, etc.).
 */
export default function RemoveButton({ onClick, title, style }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        position: 'absolute',
        top: 'var(--spacing-md)',
        right: 'var(--spacing-md)',
        background: 'none',
        border: 'none',
        color: 'var(--color-text-tertiary)',
        cursor: 'pointer',
        fontSize: '18px',
        lineHeight: 1,
        padding: '2px',
        ...style,
      }}
    >
      ×
    </button>
  );
}
