/**
 * RestoreDraftModal — shown on editor mount when an auto-saved draft from a
 * previous session differs from the server's current state. Paired with
 * useDraftAutosave.
 *
 * UX: non-destructive default is "Discard" (since the user presumably
 * expects the server state to be authoritative), but the visual weight goes
 * on "Restore" — they saw this prompt because they likely want their work
 * back. Escape / backdrop click = dismiss (which is "discard" here; we
 * treat not-choosing as not-restoring).
 */
import Modal from './Modal';

function formatRelative(savedAt) {
  if (!savedAt) return 'recently';
  const diffMs = Date.now() - savedAt.getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export default function RestoreDraftModal({ open, savedAt, onRestore, onDiscard }) {
  return (
    <Modal open={open} onClose={onDiscard} ariaLabel="Restore unsaved draft" maxWidth="460px">
      <h2
        style={{
          margin: 0,
          marginBottom: 'var(--spacing-sm)',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-primary)',
        }}
      >
        Restore unsaved changes?
      </h2>
      <p
        style={{
          margin: 0,
          marginBottom: 'var(--spacing-lg)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
        }}
      >
        We found auto-saved changes from {formatRelative(savedAt)} that weren&apos;t saved to the
        server. Restore them, or discard and start from the latest saved version?
      </p>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--spacing-sm)',
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={onDiscard}>
          Discard draft
        </button>
        <button type="button" className="btn btn-primary" onClick={onRestore}>
          Restore draft
        </button>
      </div>
    </Modal>
  );
}
