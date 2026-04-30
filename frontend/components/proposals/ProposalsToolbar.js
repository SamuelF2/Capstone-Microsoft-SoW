/**
 * ProposalsToolbar — bulk-action bar, only visible when ≥ 1 row is selected.
 *
 * Sits between the filters and the table. Approve all goes through a
 * confirm dialog (handled by the parent); Reject all opens
 * RejectProposalModal so the admin can attach an optional shared note.
 */

export default function ProposalsToolbar({
  selectedCount,
  onBulkApprove,
  onBulkReject,
  onClear,
  busy = false,
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-md)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        marginBottom: 'var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'rgba(0,120,212,0.08)',
        border: '1px solid rgba(0,120,212,0.25)',
      }}
    >
      <span
        style={{
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-primary)',
          fontWeight: 'var(--font-weight-medium)',
        }}
      >
        {selectedCount} selected
      </span>
      <button
        type="button"
        className="btn btn-success btn-sm"
        onClick={onBulkApprove}
        disabled={busy}
      >
        ✓ Approve all
      </button>
      <button
        type="button"
        className="btn btn-danger btn-sm"
        onClick={onBulkReject}
        disabled={busy}
      >
        ✗ Reject all
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onClear}
        disabled={busy}
        style={{ marginLeft: 'auto' }}
      >
        Clear
      </button>
    </div>
  );
}
