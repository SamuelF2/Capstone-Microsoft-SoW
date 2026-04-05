/**
 * HorizontalCardList, ListCard, AddCardButton
 * -------------------------------------------
 * Horizontal scrolling row of cards with a dashed "+ Add" tile at the end.
 * Used in Deliverables, AgileApproach (sprints), ProductBacklog, TeamStructure,
 * Pricing, PhasesDeliverables, PhasesMilestones, WorkloadAssessment, etc.
 */

import RemoveButton from './RemoveButton';

export function HorizontalCardList({ children, style }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacing-lg)',
        overflowX: 'auto',
        paddingBottom: 'var(--spacing-md)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * ListCard — the card shell for an item in a HorizontalCardList. Provides
 * consistent sizing, vertical layout, and an optional RemoveButton.
 * Pass `headerExtras` to render additional elements next to the remove button.
 */
export function ListCard({
  width = '300px',
  onRemove,
  removeTitle,
  headerExtras,
  children,
  style,
}) {
  return (
    <div
      className="card"
      style={{
        minWidth: width,
        maxWidth: width,
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
        ...style,
      }}
    >
      {headerExtras ? (
        <div
          style={{
            position: 'absolute',
            top: 'var(--spacing-md)',
            right: 'var(--spacing-md)',
            display: 'flex',
            gap: 'var(--spacing-xs)',
            alignItems: 'center',
          }}
        >
          {headerExtras}
          {onRemove && (
            <button
              onClick={onRemove}
              title={removeTitle}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
                fontSize: '18px',
                lineHeight: 1,
                padding: '2px',
              }}
            >
              ×
            </button>
          )}
        </div>
      ) : (
        onRemove && <RemoveButton onClick={onRemove} title={removeTitle} />
      )}
      {children}
    </div>
  );
}

/**
 * AddCardButton — the dashed bordered "+ Add X" tile placed at the end of a
 * HorizontalCardList. Identical hover behaviour across all callers.
 */
export function AddCardButton({ label, onClick, width = '180px', minHeight = '200px' }) {
  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent-blue)';
        e.currentTarget.style.color = 'var(--color-accent-blue)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.color = 'var(--color-text-tertiary)';
      }}
      style={{
        minWidth: width,
        maxWidth: width,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px dashed var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        color: 'var(--color-text-tertiary)',
        transition: 'border-color var(--transition-base), color var(--transition-base)',
        minHeight,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: 'var(--spacing-xs)' }}>+</div>
        <div className="text-sm">{label}</div>
      </div>
    </div>
  );
}
