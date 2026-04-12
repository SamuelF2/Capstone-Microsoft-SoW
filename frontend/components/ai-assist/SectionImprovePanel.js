/**
 * SectionImprovePanel — sidebar-anchored "Improve with AI" panel.
 *
 * Opens as a floating panel anchored to the right sidebar. Contains a
 * side-by-side diff viewer with IntelliJ-style SVG connector lines in a
 * central gutter. The section editor underneath remains visible.
 *
 * Structured section support: when a sectionKey with a registered schema is
 * provided, the ML layer returns structured JSON; the panel renders a
 * formatted preview and passes structured data through onAccept.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
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

// ── Line-level diff ─────────────────────────────────────────────────────────

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

// Group consecutive lines of same type into blocks for connector rendering.
function groupIntoBlocks(diff) {
  const blocks = [];
  let current = null;
  diff.forEach((row, i) => {
    if (!current || current.type !== row.type) {
      if (current) blocks.push(current);
      current = { type: row.type, startIndex: i, count: 1 };
    } else {
      current.count++;
    }
  });
  if (current) blocks.push(current);
  return blocks;
}

const LINE_H = 22;
const GUTTER_W = 28;

const LINE_BG = {
  same: 'transparent',
  changed: 'rgba(59, 130, 246, 0.08)',
  added: 'rgba(34, 197, 94, 0.10)',
  removed: 'rgba(239, 68, 68, 0.08)',
};

const CONNECTOR_FILL = {
  changed: 'rgba(59, 130, 246, 0.18)',
  added: 'rgba(34, 197, 94, 0.18)',
  removed: 'rgba(239, 68, 68, 0.18)',
};

const CONNECTOR_STROKE = {
  changed: 'rgba(59, 130, 246, 0.45)',
  added: 'rgba(34, 197, 94, 0.45)',
  removed: 'rgba(239, 68, 68, 0.45)',
};

// ── Diff viewer with IntelliJ-style gutter connectors ───────────────────────

function DiffViewer({ originalText, suggestedText }) {
  const leftRef = useRef(null);
  const rightRef = useRef(null);
  const gutterRef = useRef(null);
  const syncing = useRef(false);

  const diff = useMemo(
    () => computeLineDiff(originalText, suggestedText),
    [originalText, suggestedText]
  );

  const blocks = useMemo(() => groupIntoBlocks(diff), [diff]);

  const syncScroll = (source) => {
    if (syncing.current) return;
    syncing.current = true;
    const top = source.current.scrollTop;
    if (leftRef.current) leftRef.current.scrollTop = top;
    if (rightRef.current) rightRef.current.scrollTop = top;
    if (gutterRef.current) gutterRef.current.scrollTop = top;
    requestAnimationFrame(() => {
      syncing.current = false;
    });
  };

  const totalHeight = diff.length * LINE_H;

  const renderLine = (text, lineNum, type, side) => {
    const isEmpty = text === null;
    return (
      <div
        key={`${side}-${lineNum}-${type}`}
        style={{
          display: 'flex',
          height: `${LINE_H}px`,
          lineHeight: `${LINE_H}px`,
          backgroundColor: LINE_BG[type],
        }}
      >
        <span
          style={{
            width: '28px',
            flexShrink: 0,
            textAlign: 'right',
            paddingRight: '6px',
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            userSelect: 'none',
            opacity: isEmpty ? 0.3 : 0.6,
          }}
        >
          {isEmpty ? '' : lineNum}
        </span>
        <span
          style={{
            flex: 1,
            paddingLeft: '4px',
            paddingRight: '6px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontSize: '11px',
            color: isEmpty ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {isEmpty ? '' : text || '\u00A0'}
        </span>
      </div>
    );
  };

  // Build connector SVG paths
  const connectorPaths = blocks
    .filter((b) => b.type !== 'same')
    .map((block, i) => {
      const y = block.startIndex * LINE_H;
      const h = block.count * LINE_H;
      const r = Math.min(4, h / 2); // corner radius
      // Curved connector shape
      return (
        <path
          key={i}
          d={`M 0 ${y + r}
              Q 0 ${y} ${r} ${y}
              L ${GUTTER_W - r} ${y}
              Q ${GUTTER_W} ${y} ${GUTTER_W} ${y + r}
              L ${GUTTER_W} ${y + h - r}
              Q ${GUTTER_W} ${y + h} ${GUTTER_W - r} ${y + h}
              L ${r} ${y + h}
              Q 0 ${y + h} 0 ${y + h - r}
              Z`}
          fill={CONNECTOR_FILL[block.type]}
          stroke={CONNECTOR_STROKE[block.type]}
          strokeWidth="1"
        />
      );
    });

  let leftLineNum = 0;
  let rightLineNum = 0;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: `1fr ${GUTTER_W}px 1fr` }}>
        <div
          style={{
            padding: '4px 8px',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-default)',
            fontSize: '10px',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Original
        </div>
        <div
          style={{
            backgroundColor: 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-default)',
          }}
        />
        <div
          style={{
            padding: '4px 8px',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-default)',
            fontSize: '10px',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-tertiary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Suggested
        </div>
      </div>

      {/* Diff content with gutter */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `1fr ${GUTTER_W}px 1fr`,
          maxHeight: '360px',
          overflowY: 'auto',
        }}
        onScroll={(e) => {
          // Sync all three panes from the grid container scroll
          if (leftRef.current) leftRef.current.scrollTop = e.target.scrollTop;
          if (rightRef.current) rightRef.current.scrollTop = e.target.scrollTop;
        }}
      >
        {/* Left pane */}
        <div ref={leftRef} style={{ paddingTop: '2px', paddingBottom: '2px' }}>
          {diff.map((row) => {
            if (row.left !== null) leftLineNum++;
            return renderLine(row.left, leftLineNum, row.type, 'L');
          })}
        </div>

        {/* Center gutter with SVG connectors */}
        <div
          ref={gutterRef}
          style={{
            position: 'relative',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderLeft: '1px solid var(--color-border-default)',
            borderRight: '1px solid var(--color-border-default)',
          }}
        >
          <svg
            width={GUTTER_W}
            height={totalHeight + 4}
            style={{ display: 'block', marginTop: '2px' }}
          >
            {connectorPaths}
          </svg>
        </div>

        {/* Right pane */}
        <div ref={rightRef} style={{ paddingTop: '2px', paddingBottom: '2px' }}>
          {(() => {
            let rn = 0;
            return diff.map((row) => {
              if (row.right !== null) rn++;
              return renderLine(row.right, rn, row.type, 'R');
            });
          })()}
        </div>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

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

  // Structured suggestion text fallback for diff viewer
  const suggestedDisplayText = (() => {
    if (structuredSuggestion) {
      const rendered = renderStructured(sectionKey, structuredSuggestion);
      if (rendered) return null; // will use structured renderer instead
      return JSON.stringify(structuredSuggestion, null, 2);
    }
    return suggestion && suggestion !== '[structured]' ? suggestion : '';
  })();

  return (
    <div
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.15))',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 160px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          backgroundColor: 'var(--color-bg-secondary)',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          <span
            style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-primary)',
            }}
          >
            Improve with AI
          </span>
          {sectionLabel && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              — {sectionLabel}
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
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px',
          }}
          title="Close"
        >
          ×
        </button>
      </div>

      {/* Intent pills */}
      <div
        style={{
          padding: 'var(--spacing-xs) var(--spacing-md)',
          display: 'flex',
          gap: '4px',
          flexWrap: 'wrap',
          borderBottom: '1px solid var(--color-border-subtle, var(--color-border-default))',
          flexShrink: 0,
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

      {/* Custom instructions */}
      <div style={{ padding: 'var(--spacing-xs) var(--spacing-md)', flexShrink: 0 }}>
        <textarea
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          rows={1}
          placeholder="Optional extra instructions…"
          style={{
            width: '100%',
            padding: '4px var(--spacing-sm)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: '11px',
            fontFamily: 'inherit',
            resize: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {error && (
        <div style={{ padding: '0 var(--spacing-md) var(--spacing-xs)', flexShrink: 0 }}>
          <AIUnavailableBanner error={error} context="assist" onRetry={run} />
        </div>
      )}

      {/* Diff view */}
      <div style={{ padding: '0 var(--spacing-md)', flex: 1, overflow: 'auto', minHeight: 0 }}>
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
                width: 16,
                height: 16,
                border: '2px solid var(--color-border-default)',
                borderTopColor: 'var(--color-accent-blue, #2563eb)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                marginRight: 'var(--spacing-xs)',
                verticalAlign: 'middle',
              }}
            />
            Generating…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : hasSuggestion && suggestedDisplayText !== null ? (
          <DiffViewer originalText={originalText || ''} suggestedText={suggestedDisplayText} />
        ) : hasSuggestion && structuredSuggestion ? (
          /* Structured data: side-by-side original text vs rendered output */
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
                maxHeight: 360,
                overflowY: 'auto',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                lineHeight: 'var(--line-height-relaxed)',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
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
                maxHeight: 360,
                overflowY: 'auto',
                fontSize: '11px',
                lineHeight: 'var(--line-height-relaxed)',
                backgroundColor: 'rgba(34, 197, 94, 0.04)',
              }}
            >
              <div
                style={{
                  fontSize: '10px',
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
              fontSize: 'var(--font-size-xs)',
              fontStyle: 'italic',
            }}
          >
            Click &ldquo;Generate&rdquo; to get an AI rewrite.
          </div>
        )}
      </div>

      {/* Action bar */}
      <div
        style={{
          padding: 'var(--spacing-xs) var(--spacing-md)',
          borderTop: '1px solid var(--color-border-default)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: 'var(--color-bg-secondary)',
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={run}
          disabled={loading || !originalText?.trim()}
          style={{ fontSize: '11px', padding: '4px 10px' }}
        >
          {hasSuggestion ? 'Regenerate' : 'Generate'}
        </button>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={loading}
            style={{ fontSize: '11px', padding: '4px 10px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleAccept}
            disabled={loading || !hasSuggestion}
            style={{ fontSize: '11px', padding: '4px 10px' }}
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
