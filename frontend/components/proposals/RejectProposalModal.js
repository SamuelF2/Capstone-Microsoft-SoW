/**
 * RejectProposalModal — captures an optional note + tags before rejecting.
 *
 * Used for both single rejects (from a row's ✗ button or the detail drawer)
 * and bulk rejects (from the toolbar). The parent passes the list of ids
 * to the modal, and the same note/tags are applied to every id in one
 * server transaction.
 *
 * Approve has no equivalent dialog — admins approve frequently and a
 * confirm step on each click is friction.
 */

import { useEffect, useState } from 'react';
import Modal from '../Modal';

export default function RejectProposalModal({ open, ids, onClose, onConfirm, busy = false }) {
  const [note, setNote] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  // Reset on open so a previous reject's text doesn't leak.
  useEffect(() => {
    if (open) {
      setNote('');
      setTagsInput('');
    }
  }, [open]);

  if (!open) return null;
  const count = ids?.length || 0;
  const isBulk = count > 1;

  const handleConfirm = () => {
    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    onConfirm({
      ids,
      tags: tags.length > 0 ? tags : undefined,
      note: note.trim() || undefined,
    });
  };

  return (
    <Modal open={open} onClose={busy ? null : onClose} maxWidth="520px" ariaLabel="Reject proposal">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xl)',
            color: 'var(--color-text-primary)',
          }}
        >
          {isBulk ? `Reject ${count} proposals?` : 'Reject proposal?'}
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            lineHeight: 1.5,
          }}
        >
          Rejected proposals stay in the queue (status filter "Rejected") so the decision can be
          revisited. The optional reviewer note and tags below are saved with each proposal.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="reject-note"
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Note (optional)
          </label>
          <textarea
            id="reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Why is this being rejected?"
            disabled={busy}
            className="form-textarea"
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 'var(--font-size-sm)',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            htmlFor="reject-tags"
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Tags (optional, comma-separated)
          </label>
          <input
            id="reject-tags"
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="duplicate, low-quality, off-topic"
            disabled={busy}
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 12px',
              fontSize: 'var(--font-size-sm)',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacing-sm)',
            paddingTop: 'var(--spacing-md)',
            borderTop: '1px solid var(--color-border-default)',
          }}
        >
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={handleConfirm}
            disabled={busy}
          >
            {busy ? 'Rejecting…' : isBulk ? `Reject ${count}` : 'Reject'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
