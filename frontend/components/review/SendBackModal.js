/**
 * SendBackModal — shared modal for returning a SoW to an earlier stage.
 *
 * Renders the workflow-defined send-back targets as selectable buttons,
 * a required reason textarea, and optional action items. Used by both the
 * assignment-scoped review page and the DRM review page.
 *
 * Props
 * -----
 *   onClose          fn        Cancel / backdrop click handler.
 *   onSubmit         fn        Receives { target_stage, comments, action_items }.
 *   submitting       boolean   Disables buttons while a request is in flight.
 *   availableStages  array     [{ stage_key, display_name }] targets from
 *                              the workflow's on_send_back transitions. Falls
 *                              back to Draft if empty/null.
 */
import { useState } from 'react';

export default function SendBackModal({ onClose, onSubmit, submitting, availableStages }) {
  const targets =
    availableStages && availableStages.length > 0
      ? availableStages
      : [{ stage_key: 'draft', display_name: 'Draft' }];
  const [targetStage, setTargetStage] = useState(targets[0]?.stage_key || 'draft');
  const [comments, setComments] = useState('');
  const [actionItems, setActionItems] = useState(['']);

  function addItem() {
    setActionItems((a) => [...a, '']);
  }
  function updateItem(i, val) {
    setActionItems((a) => a.map((x, j) => (j === i ? val : x)));
  }
  function removeItem(i) {
    setActionItems((a) => a.filter((_, j) => j !== i));
  }

  function handleSubmit() {
    if (!comments.trim()) return;
    onSubmit({
      target_stage: targetStage,
      comments: comments.trim(),
      action_items: actionItems.filter((x) => x.trim()),
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-xl)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-xl)',
          width: '100%',
          maxWidth: '520px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-md)',
        }}
      >
        <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
          Send Back SoW
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Return this SoW to an earlier stage for revision.
        </p>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Return to
          </label>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            {targets.map(({ stage_key: value, display_name: label }) => (
              <button
                key={value}
                onClick={() => setTargetStage(value)}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid',
                  borderColor:
                    targetStage === value
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-border-default)',
                  backgroundColor:
                    targetStage === value ? 'rgba(124,58,237,0.08)' : 'var(--color-bg-secondary)',
                  color:
                    targetStage === value
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: targetStage === value ? 'var(--font-weight-semibold)' : 'normal',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Reason <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Explain why this SoW is being sent back…"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Action Items (optional)
          </label>
          {actionItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
                placeholder={`Action item ${i + 1}`}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              />
              {actionItems.length > 1 && (
                <button
                  onClick={() => removeItem(i)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                    fontSize: '16px',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addItem}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-accent-purple, #7c3aed)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            + Add action item
          </button>
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !comments.trim()}
            style={{ backgroundColor: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
          >
            {submitting ? 'Sending back…' : 'Send Back'}
          </button>
        </div>
      </div>
    </div>
  );
}
