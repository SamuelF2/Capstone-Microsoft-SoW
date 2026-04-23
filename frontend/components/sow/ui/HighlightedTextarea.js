/**
 * HighlightedTextarea — drop-in <textarea> replacement that highlights
 * banned phrases using a mirror-div overlay technique.
 *
 * The component renders a transparent textarea on top of a backdrop div
 * that shows the same text with <mark> elements around matched phrases.
 * Scroll positions are synced between the two layers.
 *
 * Consumes banned-phrase data from BannedPhrasesContext by default. An
 * explicit `bannedPhrases` prop overrides the context value.
 */

import { useRef, useCallback, useMemo } from 'react';
import { useBannedPhrases } from '../../../contexts/BannedPhrasesContext';

const SEVERITY_BG = {
  high: 'rgba(239, 68, 68, 0.25)',
  medium: 'rgba(245, 158, 11, 0.25)',
  low: 'rgba(34, 197, 94, 0.20)',
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split text into alternating plain / matched segments for rendering.
 * Returns an array of { text, phrase? } objects.
 */
function segmentText(text, phrases) {
  if (!text || !phrases || phrases.length === 0) return [{ text }];

  // Build a single regex that matches any banned phrase (case-insensitive)
  const escaped = phrases.map((p) => escapeRegex(p.phrase)).filter(Boolean);
  if (escaped.length === 0) return [{ text }];

  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const segments = [];
  let lastIndex = 0;
  let match;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index) });
    }
    // Find the matching phrase definition (case-insensitive)
    const matchedLower = match[0].toLowerCase();
    const phraseDef = phrases.find((p) => p.phrase.toLowerCase() === matchedLower);
    segments.push({ text: match[0], phrase: phraseDef });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }

  return segments;
}

export default function HighlightedTextarea({
  bannedPhrases: propPhrases,
  value = '',
  className = 'form-textarea',
  style = {},
  ...textareaProps
}) {
  const { phrases: ctxPhrases } = useBannedPhrases();
  const phrases = propPhrases || ctxPhrases || [];

  const textareaRef = useRef(null);
  const backdropRef = useRef(null);

  // Sync scroll from textarea → backdrop
  const handleScroll = useCallback(() => {
    if (backdropRef.current && textareaRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const segments = useMemo(() => segmentText(value, phrases), [value, phrases]);

  // Shared text styling that must match between textarea and backdrop
  const sharedStyle = {
    fontSize: style.fontSize || 'var(--font-size-sm)',
    fontFamily: style.fontFamily || 'inherit',
    lineHeight: style.lineHeight || 'var(--line-height-relaxed)',
    padding: style.padding || 'var(--spacing-sm) var(--spacing-md)',
    boxSizing: 'border-box',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    wordBreak: 'break-word',
  };

  const hasHighlights = phrases.length > 0;

  return (
    <div
      style={{
        position: 'relative',
        ...style,
        padding: 0,
        fontSize: undefined,
        fontFamily: undefined,
      }}
    >
      {/* Backdrop — renders highlighted text behind the textarea */}
      {hasHighlights && (
        <div
          ref={backdropRef}
          aria-hidden="true"
          style={{
            ...sharedStyle,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
            color: 'transparent',
            pointerEvents: 'none',
            borderRadius: style.borderRadius || 'var(--radius-md)',
            border: '1px solid transparent',
          }}
        >
          {segments.map((seg, i) =>
            seg.phrase ? (
              <mark
                key={i}
                title={`${seg.phrase.reason || 'Banned phrase'}${seg.phrase.suggestion ? ` — Replace with: ${seg.phrase.suggestion}` : ''}`}
                style={{
                  backgroundColor: SEVERITY_BG[seg.phrase.severity] || SEVERITY_BG.medium,
                  color: 'transparent',
                  borderRadius: '2px',
                  padding: '0 1px',
                }}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            )
          )}
        </div>
      )}

      {/* Actual textarea — transparent background so highlights show through */}
      <textarea
        ref={textareaRef}
        className={className}
        value={value}
        onScroll={handleScroll}
        style={{
          ...sharedStyle,
          width: '100%',
          background: hasHighlights ? 'transparent' : undefined,
          position: 'relative',
          zIndex: 1,
          resize: style.resize || 'none',
          border: style.border,
          borderRadius: style.borderRadius || 'var(--radius-md)',
          color: style.color,
        }}
        {...textareaProps}
      />
    </div>
  );
}
