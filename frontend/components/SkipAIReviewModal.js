/**
 * SkipAIReviewModal — confirmation dialog shown when the AI service is
 * unavailable and the user wants to bypass the AI review stage manually.
 *
 * Lists what they're foregoing, requires an acknowledgement checkbox plus
 * a free-text reason, then POSTs to /api/sow/{id}/skip-ai-review via the
 * provided ``onConfirm`` callback.
 *
 * Props
 * -----
 * open       boolean
 * onClose    () => void
 * onConfirm  (reason: string) => Promise<void>
 * submitting boolean
 */

import { useState } from 'react';
import Modal from './Modal';

const FOREGONE = [
  'Compliance and banned-phrase validation',
  'Risk surfacing and mitigation prompts',
  'ESAP routing recommendation',
  'Similar-SoW retrieval',
];

export default function SkipAIReviewModal({ open, onClose, onConfirm, submitting = false }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState('');

  const canSubmit = acknowledged && reason.trim().length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await onConfirm(reason.trim());
  };

  return (
    <Modal
      open={open}
      onClose={submitting ? null : onClose}
      maxWidth="520px"
      ariaLabel="Skip AI review"
    >
      <h3
        style={{
          margin: '0 0 var(--spacing-md)',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
        }}
      >
        Skip AI Review
      </h3>
      <p
        style={{
          margin: '0 0 var(--spacing-md)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          lineHeight: 'var(--line-height-relaxed)',
        }}
      >
        The AI service is currently unavailable. If you proceed without analysis, the following
        AI-generated information will be missing for downstream reviewers:
      </p>
      <ul
        style={{
          margin: '0 0 var(--spacing-lg)',
          paddingLeft: 'var(--spacing-lg)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-secondary)',
          lineHeight: 'var(--line-height-relaxed)',
        }}
      >
        {FOREGONE.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-md)',
          fontSize: 'var(--font-size-sm)',
          color: 'var(--color-text-primary)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          style={{ marginTop: 3 }}
        />
        <span>I understand the AI service is unavailable and I'm proceeding without analysis.</span>
      </label>

      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <label
          style={{
            display: 'block',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          Reason for skipping <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. ML service is offline, cannot retry before customer deadline"
          style={{
            width: '100%',
            padding: 'var(--spacing-sm)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'inherit',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--spacing-sm)',
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          style={{ opacity: canSubmit ? 1 : 0.6 }}
        >
          {submitting ? 'Skipping…' : 'Skip & Continue'}
        </button>
      </div>
    </Modal>
  );
}
