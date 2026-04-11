/**
 * Modal — portal-style centered card with a fixed dark backdrop, escape-key
 * dismissal, and click-outside-to-close.  Replaces ~6 hand-rolled instances
 * of the same pattern across the review/finalize/draft pages.
 *
 * The component renders nothing when ``open === false`` so callers can use
 * the standard ``{showModal && <Modal />}`` pattern or the ``open`` prop —
 * both work.
 *
 * Props
 * -----
 *   open        boolean   When false the modal is unmounted entirely.
 *   onClose     fn        Called for backdrop click and Escape key.  Set to
 *                         ``null`` for forced/blocking modals.
 *   maxWidth    string    CSS max-width for the card.  Defaults to ``480px``.
 *   ariaLabel   string    Accessible label for the dialog container.
 *   children    node      Modal content.  Caller is responsible for header
 *                         and action buttons; this component only owns the
 *                         backdrop and card chrome.
 */
import { useEffect, useRef } from 'react';

export default function Modal({ open, onClose, maxWidth = '480px', ariaLabel, children }) {
  const cardRef = useRef(null);

  useEffect(() => {
    if (!open || !onClose) return undefined;
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Move focus into the card when it opens so screen readers and keyboard
  // users land in the dialog.  Falls back to a no-op if focus is already
  // somewhere inside.
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    if (card.contains(document.activeElement)) return;
    const focusable = card.querySelector(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable) focusable.focus();
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    // Only close on direct backdrop clicks (ignore clicks bubbling up from
    // the card itself).
    if (e.target === e.currentTarget && onClose) onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || undefined}
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={cardRef}
        style={{
          background: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--spacing-xl)',
          maxWidth,
          width: '90%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
