/**
 * DecisionModal — shared modal for reviewer decisions (approve, reject,
 * approve-with-conditions).  Used by every review surface (internal review,
 * DRM review, and the assignment-scoped review page) so the validation rules
 * and styling stay consistent across the app.
 *
 * Props
 * -----
 *   type        'approved' | 'rejected' | 'approved-with-conditions'
 *               Drives the title, gating logic, and button colours.
 *   onClose     fn          Backdrop click / Escape / Cancel button handler.
 *   onSubmit    fn          Receives ``{ decision, comments, conditions }``
 *                           where ``conditions`` is ``null`` unless the
 *                           type is ``approved-with-conditions``.
 *   submitting  boolean     Disables the buttons and switches the label to
 *                           a transient ``Submitting…`` while a request is
 *                           in flight.  Required — every reviewer surface
 *                           tracks this so a double-click can't fire two
 *                           submissions.
 */
import { useState } from 'react';

import Modal from '../Modal';

const TITLES = {
  approved: 'Confirm Approval',
  rejected: 'Reject SoW',
  'approved-with-conditions': 'Approve with Conditions',
};

const SUBMIT_LABELS = {
  approved: 'Confirm',
  rejected: 'Reject',
  'approved-with-conditions': 'Confirm',
};

export default function DecisionModal({ type, onClose, onSubmit, submitting }) {
  const [comments, setComments] = useState('');
  const [conditions, setConditions] = useState(['']);

  const isReject = type === 'rejected';
  const isConditional = type === 'approved-with-conditions';

  const trimmedConditions = conditions.filter((c) => c.trim());
  const canSubmit =
    !submitting &&
    !(isReject && !comments.trim()) &&
    !(isConditional && trimmedConditions.length === 0);

  function addCondition() {
    setConditions((c) => [...c, '']);
  }
  function updateCondition(i, val) {
    setConditions((c) => c.map((x, j) => (j === i ? val : x)));
  }
  function removeCondition(i) {
    setConditions((c) => c.filter((_, j) => j !== i));
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSubmit({
      decision: type,
      comments: comments.trim() || null,
      conditions: isConditional ? trimmedConditions : null,
    });
  }

  return (
    <Modal open onClose={submitting ? null : onClose} ariaLabel={TITLES[type] || 'Decision'}>
      <h3 style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-lg)' }}>
        {TITLES[type] || 'Decision'}
      </h3>

      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <label
          style={{
            display: 'block',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          {isReject ? 'Reason for rejection *' : `Comments${isConditional ? '' : ' (optional)'}`}
        </label>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder={
            isReject
              ? 'Describe the issues that need to be addressed…'
              : 'Optional comments for the author…'
          }
          rows={4}
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

      {isConditional && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-xs)',
            }}
          >
            Conditions <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          {conditions.map((cond, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: 'var(--spacing-xs)',
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              <input
                type="text"
                value={cond}
                onChange={(e) => updateCondition(i, e.target.value)}
                placeholder={`Condition ${i + 1}`}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                  fontFamily: 'inherit',
                }}
              />
              {conditions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeCondition(i)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={addCondition}
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 0',
              cursor: 'pointer',
              color: 'var(--color-accent-purple, #7c3aed)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            + Add condition
          </button>
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`btn btn-sm ${isReject ? 'btn-danger' : 'btn-primary'}`}
          style={
            isReject ? { backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' } : {}
          }
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? 'Submitting…' : SUBMIT_LABELS[type] || 'Confirm'}
        </button>
      </div>
    </Modal>
  );
}
