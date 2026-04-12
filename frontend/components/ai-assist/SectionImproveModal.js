/**
 * SectionImproveModal — centred "Improve with AI" dialog.
 *
 * Layout (top → bottom):
 *   1. Header with title + close button
 *   2. Intent pills row
 *   3. Custom-instructions textarea + Generate button (same row)
 *   4. Side-by-side: Original (left) | Suggested (right, plain text)
 *   5. Footer: Cancel + Accept
 *
 * When a sectionKey with a registered schema is provided, the ML layer
 * returns structured JSON; the modal renders a formatted preview and
 * passes structured data through onAccept.
 */

import { useEffect, useState } from 'react';
import Modal from '../Modal';
import AIUnavailableBanner from '../AIUnavailableBanner';
import { aiClient } from '../../lib/ai';
import { getSchema, renderStructured } from '../../lib/sectionSchemas';

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
  sectionKey,
}) {
  const [intent, setIntent] = useState('tighten');
  const [custom, setCustom] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [structuredSuggestion, setStructuredSuggestion] = useState(null);
  const [error, setError] = useState(null);

  const hasSchema = !!getSchema(sectionKey);

  useEffect(() => {
    if (!open) {
      setSuggestion('');
      setStructuredSuggestion(null);
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
    setStructuredSuggestion(null);
    const query = buildQuery(sectionLabel || 'this section', originalText, intent, custom);
    const result = await aiClient.assist(authFetch, query, sowId, [], {
      sectionKey: hasSchema ? sectionKey : undefined,
    });
    setLoading(false);
    if (result.ok) {
      if (result.data?.structured) {
        setStructuredSuggestion(result.data.structured);
        setSuggestion('[structured]');
      } else {
        setSuggestion(result.data?.answer || result.data?.response || '');
      }
    } else {
      setError(result.error);
    }
  };

  const handleAccept = () => {
    if (structuredSuggestion) {
      onAccept?.(structuredSuggestion);
    } else if (suggestion.trim()) {
      onAccept?.(suggestion.trim());
    } else {
      return;
    }
    onClose?.();
  };

  const hasSuggestion = !!(structuredSuggestion || (suggestion && suggestion !== '[structured]'));

  // Render the right-column content
  const renderSuggested = () => {
    if (loading) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              border: '2px solid var(--color-border-default)',
              borderTopColor: 'var(--color-accent-blue, #2563eb)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
          <span>Generating&hellip;</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      );
    }
    if (structuredSuggestion) {
      const rendered = renderStructured(sectionKey, structuredSuggestion);
      if (rendered) return rendered;
      return JSON.stringify(structuredSuggestion, null, 2);
    }
    if (suggestion && suggestion !== '[structured]') return suggestion;
    return (
      <span style={{ fontStyle: 'italic', opacity: 0.5 }}>
        Click &ldquo;Generate&rdquo; to see AI suggestions
      </span>
    );
  };

  return (
    <Modal
      open={open}
      onClose={loading ? null : onClose}
      maxWidth="920px"
      ariaLabel="Improve section with AI"
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-xs)' }}>
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--font-size-lg)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            Improve with AI
          </h3>
          {sectionLabel && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              &mdash; {sectionLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={loading}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            fontSize: '20px',
            lineHeight: 1,
            padding: '2px 4px',
          }}
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* ── Intent pills ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px',
          marginBottom: 'var(--spacing-sm)',
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
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${active ? 'var(--color-accent-blue, #2563eb)' : 'var(--color-border-default)'}`,
                background: active
                  ? 'var(--color-accent-blue, #2563eb)'
                  : 'var(--color-bg-secondary)',
                color: active ? '#fff' : 'var(--color-text-primary)',
                fontSize: 'var(--font-size-xs)',
                cursor: 'pointer',
                lineHeight: '20px',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* ── Instructions + Generate (same row) ─────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-sm)',
          alignItems: 'stretch',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          rows={1}
          placeholder="Optional extra instructions\u2026"
          style={{
            flex: 1,
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-sm)',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={run}
          disabled={loading || !originalText?.trim()}
          style={{ whiteSpace: 'nowrap', alignSelf: 'center' }}
        >
          {loading ? 'Generating\u2026' : hasSuggestion ? 'Regenerate' : 'Generate'}
        </button>
      </div>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <AIUnavailableBanner error={error} context="assist" onRetry={run} />
        </div>
      )}

      {/* ── Side-by-side: Original | Suggested ─────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        {/* Original */}
        <div>
          <p
            style={{
              margin: '0 0 6px',
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
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-primary)',
              whiteSpace: 'pre-wrap',
              maxHeight: 340,
              overflowY: 'auto',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            {originalText || '(empty)'}
          </div>
        </div>

        {/* Suggested */}
        <div>
          <p
            style={{
              margin: '0 0 6px',
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
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-primary)',
              whiteSpace: structuredSuggestion ? 'normal' : 'pre-wrap',
              maxHeight: 340,
              overflowY: 'auto',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            {renderSuggested()}
          </div>
        </div>
      </div>

      {/* ── Footer: Cancel + Accept ────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAccept}
          disabled={loading || !hasSuggestion}
        >
          Accept
        </button>
      </div>
    </Modal>
  );
}
