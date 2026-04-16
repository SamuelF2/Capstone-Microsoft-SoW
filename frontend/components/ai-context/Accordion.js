/**
 * Accordion — small collapsible section used by the AI context sidebar.
 * Lightweight and self-contained so the sidebar can stack three of them
 * (rules, banned phrases, similar examples) without depending on a global
 * accordion component.
 */

import { useState } from 'react';

export default function Accordion({ title, count, defaultOpen = false, accent, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)',
          width: '100%',
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--color-text-primary)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
        }}
      >
        {accent && (
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: accent,
              flexShrink: 0,
            }}
          />
        )}
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        {count != null && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'var(--color-bg-tertiary)',
              color: 'var(--color-text-secondary)',
              fontSize: '10px',
            }}
          >
            {count}
          </span>
        )}
        <span
          style={{
            fontSize: '9px',
            color: 'var(--color-text-tertiary)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.15s',
          }}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>
      {open && (
        <div
          style={{
            padding: 'var(--spacing-xs) var(--spacing-sm) var(--spacing-sm)',
            borderTop: '1px solid var(--color-border-subtle, var(--color-border-default))',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
