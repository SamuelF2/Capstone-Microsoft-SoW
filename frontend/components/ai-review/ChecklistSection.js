/**
 * components/ai-review/ChecklistSection — interactive review checklist card.
 *
 * Holds local state so the checked/unchecked toggles don't round-trip through
 * the parent. The state lives on the component because the AI-review surface
 * doesn't persist checklist completion — it's a worksheet, not a record.
 */

import { useState } from 'react';

export default function ChecklistSection({ checklist }) {
  const [items, setItems] = useState(checklist);
  const toggle = (idx) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it)));
  };
  const done = items.filter((it) => it.checked).length;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-blue)' }}>&#9776;</span> Review Checklist
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: done === items.length ? 'var(--color-success)' : 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {done}/{items.length} complete
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {items.map((it, i) => (
          <label
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              backgroundColor: it.checked ? 'rgba(74,222,128,0.05)' : 'transparent',
              transition: 'background-color var(--transition-base)',
            }}
          >
            <input
              type="checkbox"
              checked={it.checked}
              onChange={() => toggle(i)}
              style={{
                marginTop: 3,
                accentColor: 'var(--color-accent-blue)',
                width: 16,
                height: 16,
              }}
            />
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                color: it.checked ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                textDecoration: it.checked ? 'line-through' : 'none',
                lineHeight: 'var(--line-height-relaxed)',
              }}
            >
              {it.item}
              {it.required && (
                <span
                  style={{
                    color: 'var(--color-error)',
                    marginLeft: 4,
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  *
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
