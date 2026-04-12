/**
 * SectionImproveModal — per-section "improve with AI" dialog.
 *
 * Sends the current section text plus an optional instruction to
 * /api/ai/assist (the ML "improve" route is not yet shipped, so we reuse
 * the assist endpoint with a structured prompt). Shows the suggestion
 * side-by-side with the original and lets the user accept or discard.
 */

import { useEffect, useState } from 'react';
import Modal from '../Modal';
import AIUnavailableBanner from '../AIUnavailableBanner';
import { aiClient } from '../../lib/ai';

const PROMPTS = [
  { key: 'tighten', label: 'Tighten wording' },
  { key: 'compliance', label: 'Make compliant' },
  { key: 'clarity', label: 'Improve clarity' },
  { key: 'formal', label: 'More formal tone' },
];

function buildQuery(sectionLabel, original, intent, custom) {
  const intentLabel = PROMPTS.find((p) => p.key === intent)?.label || intent;
  const extra = custom?.trim() ? `\nExtra instructions: ${custom.trim()}` : '';
  return `Rewrite the following SoW section "${sectionLabel}" with the goal: ${intentLabel}.${extra}\n\n---\n${original}\n---\n\nReturn only the rewritten section text.`;
}

export default function SectionImproveModal({
  open,
  onClose,
  onAccept,
  authFetch,
  sowId,
  sectionLabel,
  originalText,
}) {
  const [intent, setIntent] = useState('tighten');
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) {
      setSuggestion('');
      setError(null);
      setLoading(false);
      setCustom('');
      setIntent('tighten');
    }
  }, [open]);

  const run = async () => {
    if (!originalText?.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestion('');
    const query = buildQuery(sectionLabel || 'this section', originalText, intent, custom);
    const result = await aiClient.assist(authFetch, query, sowId, []);
    setLoading(false);
    if (result.ok) {
      setSuggestion(result.data?.answer || result.data?.response || '');
    } else {
      setError(result.error);
    }
  };

  const handleAccept = () => {
    if (!suggestion.trim()) return;
    onAccept?.(suggestion.trim());
    onClose?.();
  };

  return (
    <Modal
      open={open}
      onClose={loading ? null : onClose}
      maxWidth="720px"
      ariaLabel="Improve section with AI"
    >
      <h3
        style={{
          margin: '0 0 var(--spacing-sm)',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
        }}
      >
        Improve with AI
      </h3>
      {sectionLabel && (
        <p
          style={{
            margin: '0 0 var(--spacing-md)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Section: {sectionLabel}
        </p>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-xs)',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        {PROMPTS.map((p) => {
          const active = intent === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setIntent(p.key)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${active ? 'var(--color-accent-blue, #2563eb)' : 'var(--color-border-default)'}`,
                background: active
                  ? 'var(--color-accent-blue, #2563eb)'
                  : 'var(--color-bg-secondary)',
                color: active ? '#fff' : 'var(--color-text-primary)',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <textarea
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        rows={2}
        placeholder="Optional extra instructions…"
        style={{
          width: '100%',
          padding: 'var(--spacing-sm)',
          marginBottom: 'var(--spacing-md)',
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

      {error && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <AIUnavailableBanner error={error} context="assist" onRetry={run} />
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '11px',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Original
          </p>
          <div
            style={{
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-primary)',
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflowY: 'auto',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            {originalText || '(empty)'}
          </div>
        </div>
        <div>
          <p
            style={{
              margin: '0 0 4px',
              fontSize: '11px',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Suggested
          </p>
          <div
            style={{
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-tertiary)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-primary)',
              whiteSpace: 'pre-wrap',
              maxHeight: 240,
              overflowY: 'auto',
              lineHeight: 'var(--line-height-relaxed)',
              fontStyle: suggestion ? 'normal' : 'italic',
              opacity: suggestion ? 1 : 0.7,
            }}
          >
            {loading ? 'Generating…' : suggestion || 'Click "Generate" to get an AI rewrite.'}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={run}
          disabled={loading || !originalText?.trim()}
        >
          {suggestion ? 'Regenerate' : 'Generate'}
        </button>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleAccept}
            disabled={loading || !suggestion.trim()}
          >
            Accept
          </button>
        </div>
      </div>
    </Modal>
  );
}
