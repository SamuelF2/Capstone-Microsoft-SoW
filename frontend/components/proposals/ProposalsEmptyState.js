/**
 * ProposalsEmptyState — shown when the filtered proposal list is empty.
 *
 * Distinguishes "queue is empty in absolute terms" from "filters hid
 * everything" so the admin knows whether to clear filters or wait for
 * the next ingestion to discover something new.
 */

export default function ProposalsEmptyState({ totalCount, onClearFilters }) {
  const isAbsolutelyEmpty = totalCount === 0;
  return (
    <div
      className="card text-center"
      style={{
        padding: 'var(--spacing-3xl)',
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>
        {isAbsolutelyEmpty ? '✨' : '🔍'}
      </div>
      <h3 className="text-xl font-semibold mb-sm" style={{ marginBottom: 'var(--spacing-sm)' }}>
        {isAbsolutelyEmpty ? 'No schema proposals yet' : 'No proposals match these filters'}
      </h3>
      <p
        className="text-secondary"
        style={{ marginBottom: isAbsolutelyEmpty ? 0 : 'var(--spacing-md)', lineHeight: 1.5 }}
      >
        {isAbsolutelyEmpty
          ? 'Schema proposals are generated when documents are ingested into the knowledge graph. Check back after the next ingestion run.'
          : 'Adjust the kind, status, or search to find what you’re looking for.'}
      </p>
      {!isAbsolutelyEmpty && onClearFilters && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClearFilters}>
          Clear filters
        </button>
      )}
    </div>
  );
}
