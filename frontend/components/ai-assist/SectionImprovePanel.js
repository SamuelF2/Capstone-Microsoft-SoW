/**
 * SectionImprovePanel — inline side-by-side diff panel for "Improve with AI".
 *
 * Replaces the section editor in-place when active. Shows original text on
 * the left and the AI suggestion on the right, styled like a file-diff
 * viewer with line numbers and change highlighting.
 */

import { useEffect, useRef, useState } from 'react';
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

// ── Simple line-diff ─────────────────────────────────────────────────────────

/**
 * Compute a simple line-level diff between original and suggested text.
 * Returns an array of { left, right, type } where type is:
 *   'same'     — lines match
 *   'changed'  — lines differ
 *   'added'    — line only on the right
 *   'removed'  — line only on the left
 */
function computeLineDiff(originalText, suggestedText) {
  const origLines = (originalText || '').split('\n');
  const sugLines = (suggestedText || '').split('\n');
  const maxLen = Math.max(origLines.length, sugLines.length);
  const result = [];

  for (let i = 0; i < maxLen; i++) {
    const left = i < origLines.length ? origLines[i] : null;
    const right = i < sugLines.length ? sugLines[i] : null;

    if (left === null) {
      result.push({ left: null, right, type: 'added' });
    } else if (right === null) {
      result.push({ left, right: null, type: 'removed' });
    } else if (left === right) {
      result.push({ left, right, type: 'same' });
    } else {
      result.push({ left, right, type: 'changed' });
    }
  }

  return result;
}

const LINE_BG = {
  same: 'transparent',
  changed: 'rgba(59, 130, 246, 0.08)',
  added: 'rgba(34, 197, 94, 0.10)',
  removed: 'rgba(239, 68, 68, 0.08)',
};

const LINE_GUTTER = {
  same: 'transparent',
  changed: 'rgba(59, 130, 246, 0.3)',
  added: 'rgba(34, 197, 94, 0.35)',
  removed: 'rgba(239, 68, 68, 0.3)',
};

// ── Diff Viewer ──────────────────────────────────────────────────────────────

function DiffViewer({ originalText, suggestedText }) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const syncing = useRef(false);

  const diff = computeLineDiff(originalText, suggestedText);

  const syncScroll = (source, target) => {
    if (syncing.current) return;
    syncing.current = true;
    if (target.current) target.current.scrollTop = source.current.scrollTop;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const renderLine = (text, lineNum, type, side) => {
    const isEmpty = text === null;
    return (
      <div
        key={`${side}-${lineNum}`}
        style={{
          display: 'flex',
          minHeight: '22px',
          lineHeight: '22px',
          backgroundColor: LINE_BG[type],
          borderLeft: isEmpty ? 'none' : `3px solid ${LINE_GUTTER[type]}`,
        }}
      >
        <span
          style={{
            width: '36px',
            flexShrink: 0,
            textAlign: 'right',
            paddingRight: '8px',
            fontSize: '11px',
            color: 'var(--color-text-tertiary)',
            userSelect: 'none',
            opacity: isEmpty ? 0.3 : 0.7,
          }}
        >
          {isEmpty ? '' : lineNum}
        </span>
        <span
          style={{
            flex: 1,
            paddingLeft: '6px',
            paddingRight: '8px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: 'var(--font-size-xs)',
            color: isEmpty ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            fontStyle: isEmpty ? 'italic' : 'normal',
            opacity: isEmpty ? 0.5 : 1,
          }}
        >
          {isEmpty ? '' : text || '\u00A0'}
        </span>
      </div>
    );
  };

  let leftLineNum = 0;
  let rightLineNum = 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      {/* Left header */}
      <div
        style={{
          padding: '6px 10px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border-default)',
          borderRight: '1px solid var(--color-border-default)',
          fontSize: '11px',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Original
      </div>
      {/* Right header */}
      <div
        style={{
          padding: '6px 10px',
          backgroundColor: 'var(--color-bg-tertiary)',
          borderBottom: '1px solid var(--color-border-default)',
          fontSize: '11px',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        Suggested
      </div>

      {/* Left pane */}
      <div
        ref={leftRef}
        onScroll={() => syncScroll(leftRef, rightRef)}
        style={{
          maxHeight: '420px',
          overflowY: 'auto',
          borderRight: '1px solid var(--color-border-default)',
          paddingTop: '4px',
          paddingBottom: '4px',
        }}
      >
        {diff.map((row, i) => {
          if (row.left !== null) leftLineNum++;
          return renderLine(row.left, leftLineNum, row.type, 'L');
        })}
      </div>

      {/* Right pane */}
      <div
        ref={rightRef}
        onScroll={() => syncScroll(rightRef, leftRef)}
        style={{
          maxHeight: '420px',
          overflowY: 'auto',
          paddingTop: '4px',
          paddingBottom: '4px',
        }}
      >
        {(() => {
          let rn = 0;
          return diff.map((row, i) => {
            if (row.right !== null) rn++;
            return renderLine(row.right, rn, row.type, 'R');
          });
        })()}
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function SectionImprovePanel({
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

  if (!open) return null;

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

  // For structured suggestions, produce a text rendering for the diff viewer
  const suggestedDisplayText = (() => {
    if (structuredSuggestion) {
      const rendered = renderStructured(sectionKey, structuredSuggestion);
      if (rendered) return null; // use structured renderer below the diff
      return JSON.stringify(structuredSuggestion, null, 2);
    }
    return suggestion && suggestion !== '[structured]' ? suggestion : '';
  })();

  return (
    <div
      style={{
        border: '1px solid var(--color-accent-blue, #2563eb)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-bg-primary)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: 'var(--spacing-md) var(--spacing-lg)',
          backgroundColor: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
            marginRight: 'var(--spacing-xs)',
          }}
        >
          &#10024; Improve with AI
        </span>
        {sectionLabel && (
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              marginRight: 'auto',
            }}
          >
            — {sectionLabel}
          </span>
        )}

        {/* Intent pills */}
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {PROMPTS.map((p) => {
            const active = intent === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => setIntent(p.key)}
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${active ? 'var(--color-accent-blue, #2563eb)' : 'var(--color-border-default)'}`,
                  background: active
                    ? 'var(--color-accent-blue, #2563eb)'
                    : 'var(--color-bg-primary)',
                  color: active ? '#fff' : 'var(--color-text-secondary)',
                  fontSize: '11px',
                  cursor: 'pointer',
                  lineHeight: '18px',
                }}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom instructions */}
      <div style={{ padding: 'var(--spacing-sm) var(--spacing-lg)' }}>
        <textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          rows={1}
          placeholder="Optional extra instructions…"
          style={{
            width: '100%',
            padding: '6px var(--spacing-sm)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-xs)',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '0 var(--spacing-lg) var(--spacing-sm)' }}>
          <AIUnavailableBanner error={error} context="assist" onRetry={run} />
        </div>
      )}

      {/* Diff view */}
      <div style={{ padding: '0 var(--spacing-lg)' }}>
        {loading ? (
          <div
            style={{
              padding: 'var(--spacing-xl)',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            <div
              style={{
                display: 'inline-block',
                width: 18,
                height: 18,
                border: '2px solid var(--color-border-default)',
                borderTopColor: 'var(--color-accent-blue, #2563eb)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginRight: 'var(--spacing-xs)',
                verticalAlign: 'middle',
              }}
            />
            Generating suggestion…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : hasSuggestion && suggestedDisplayText !== null ? (
          <DiffViewer originalText={originalText || ''} suggestedText={suggestedDisplayText} />
        ) : hasSuggestion && structuredSuggestion ? (
          /* Structured suggestion rendered side-by-side */
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: 'var(--spacing-sm)',
                borderRight: '1px solid var(--color-border-default)',
                maxHeight: 420,
                overflowY: 'auto',
                fontSize: 'var(--font-size-xs)',
                whiteSpace: 'pre-wrap',
                lineHeight: 'var(--line-height-relaxed)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 'var(--spacing-xs)',
                }}
              >
                Original
              </div>
              {originalText || '(empty)'}
            </div>
            <div
              style={{
                padding: 'var(--spacing-sm)',
                maxHeight: 420,
                overflowY: 'auto',
                fontSize: 'var(--font-size-xs)',
                lineHeight: 'var(--line-height-relaxed)',
                backgroundColor: 'rgba(34, 197, 94, 0.04)',
              }}
            >
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 'var(--spacing-xs)',
                }}
              >
                Suggested
              </div>
              {renderStructured(sectionKey, structuredSuggestion)}
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 'var(--spacing-lg)',
              textAlign: 'center',
              color: 'var(--color-text-tertiary)',
              fontSize: 'var(--font-size-sm)',
              fontStyle: 'italic',
            }}
          >
            Click &ldquo;Generate&rdquo; to get an AI rewrite. The diff will appear here.
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        style={{
          padding: 'var(--spacing-md) var(--spacing-lg)',
          borderTop: '1px solid var(--color-border-default)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={run}
          disabled={loading || !originalText?.trim()}
        >
          {hasSuggestion ? 'Regenerate' : 'Generate'}
        </button>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAccept}
            disabled={loading || !hasSuggestion}
          >
            Accept Changes
          </button>
        </div>
      </div>
    </div>
  );
}
