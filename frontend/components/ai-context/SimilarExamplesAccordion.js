/**
 * SimilarExamplesAccordion — collapsible list of similar prior-SoW sections
 * returned by /api/ai/context. Each example shows the source SoW, a short
 * snippet, and a copy-to-clipboard button so authors can lift wording.
 */

import { useState } from 'react';
import Accordion from './Accordion';

function CopyIcon({ size = 12 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function ExampleCard({ example }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const text = example.text || example.snippet || '';
  const long = text.length > 220;
  const visible = expanded || !long ? text : `${text.slice(0, 220)}…`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silently ignore
    }
  };

  return (
    <div
      style={{
        padding: '6px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border-default)',
        backgroundColor: 'var(--color-bg-tertiary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-xs)',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={example.source_title || example.source_sow_id || 'Prior SoW'}
        >
          {example.source_title || `SoW #${example.source_sow_id ?? '?'}`}
          {example.section_label ? ` · ${example.section_label}` : ''}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy to clipboard"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '2px 6px',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-primary)',
            color: 'var(--color-text-secondary)',
            fontSize: '10px',
            cursor: 'pointer',
          }}
        >
          <CopyIcon />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '11px',
          color: 'var(--color-text-primary)',
          lineHeight: 'var(--line-height-relaxed)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {visible}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            marginTop: 4,
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--color-accent-blue, #2563eb)',
            fontSize: '10px',
            cursor: 'pointer',
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

export default function SimilarExamplesAccordion({ examples = [], defaultOpen = false }) {
  return (
    <Accordion
      title="Similar Examples"
      count={examples.length}
      defaultOpen={defaultOpen}
      accent="var(--color-accent-blue, #2563eb)"
    >
      {examples.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          No similar examples found.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {examples.map((ex, i) => (
            <ExampleCard key={`${ex.source_sow_id ?? 'ex'}-${i}`} example={ex} />
          ))}
        </div>
      )}
    </Accordion>
  );
}
