/**
 * ProposalsFilters — kind / status / sort selects + label search.
 *
 * Persists kind, status, and sort via `useLocalStoragePref` (search stays
 * transient). Mirrors the inline filter row used by drm-dashboard and
 * all-sows so the visual rhythm of admin pages is consistent.
 */

const SELECT_STYLE = {
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-size-sm)',
  cursor: 'pointer',
};

const INPUT_STYLE = {
  flex: 1,
  minWidth: '220px',
  padding: '6px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border-default)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  fontSize: 'var(--font-size-sm)',
};

export default function ProposalsFilters({
  kind,
  setKind,
  status,
  setStatus,
  sort,
  setSort,
  search,
  setSearch,
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-lg)',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      <select value={kind} onChange={(e) => setKind(e.target.value)} style={SELECT_STYLE}>
        <option value="all">All types</option>
        <option value="node">Node</option>
        <option value="edge">Edge</option>
        <option value="section_type">Section type</option>
      </select>

      <select value={status} onChange={(e) => setStatus(e.target.value)} style={SELECT_STYLE}>
        <option value="pending">Pending</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
        <option value="all">All statuses</option>
      </select>

      <select value={sort} onChange={(e) => setSort(e.target.value)} style={SELECT_STYLE}>
        <option value="confidence-desc">Confidence (high → low)</option>
        <option value="confidence-asc">Confidence (low → high)</option>
        <option value="date-desc">Date (newest)</option>
        <option value="date-asc">Date (oldest)</option>
        <option value="uses-desc">Usage count</option>
      </select>

      <input
        type="text"
        placeholder="Search labels and sources…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={INPUT_STYLE}
      />
    </div>
  );
}
