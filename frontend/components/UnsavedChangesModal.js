/**
 * UnsavedChangesModal — confirmation dialog shown when the user tries to
 * navigate away from a dirty editor.  Paired with useUnsavedChangesWarning.
 *
 * The destructive action uses `btn-danger` (red background). The safe default
 * ("Stay") is the outlined secondary button and the focused action.  Escape
 * key and backdrop click both resolve to Stay — the non-destructive path.
 */
import Modal from './Modal';

export default function UnsavedChangesModal({ open, onStay, onLeave }) {
  return (
    <Modal open={open} onClose={onStay} ariaLabel="Unsaved changes warning" maxWidth="460px">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            flexShrink: 0,
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'rgba(234,179,8,0.12)',
            color: 'var(--color-warning, #eab308)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 'var(--font-size-lg)',
            fontWeight: 'var(--font-weight-bold)',
          }}
        >
          !
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2
            style={{
              margin: 0,
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-primary)',
              lineHeight: 1.3,
            }}
          >
            Unsaved changes
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.5,
            }}
          >
            You have unsaved changes on this page. If you leave now, those changes will be lost.
          </p>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--spacing-sm)',
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={onStay} autoFocus>
          Stay and keep editing
        </button>
        <button type="button" className="btn btn-danger" onClick={onLeave}>
          Leave without saving
        </button>
      </div>
    </Modal>
  );
}
