/**
 * ReviewChecklist — renders a role-specific review checklist.
 *
 * Items are grouped by category. Each item has a checkbox, required indicator,
 * optional help-text tooltip, and an expandable notes field.
 *
 * Props
 * -----
 * items       [{id, text, required, category, helpText}]
 * responses   [{id, checked, notes}]   — current checked/notes state
 * onChange    (responses) => void      — called on any change
 * readOnly    boolean                  — disable all inputs (for completed reviews)
 * mode        "ai" | "manual" | "legacy" — source of items, drives the badge
 * generatedAt ISO string — when an AI list was generated (header timestamp)
 * sowChanged  boolean — SoW edited since list was cached (offer regen)
 * regenerating boolean — show spinner on the Regenerate button
 * onRegenerate () => void — fires when reviewer clicks Regenerate
 */

import { useState } from 'react';

const MODE_BADGES = {
  ai: { label: 'AI-suggested', color: 'var(--color-accent-purple, #7c3aed)' },
  manual: { label: 'From workflow', color: 'var(--color-accent-blue, #2563eb)' },
  legacy: { label: 'Default', color: 'var(--color-text-tertiary)' },
};

function formatGeneratedAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export default function ReviewChecklist({
  items = [],
  responses = [],
  onChange,
  readOnly = false,
  mode = 'legacy',
  generatedAt = null,
  sowChanged = false,
  regenerating = false,
  onRegenerate,
}) {
  const [expandedNotes, setExpandedNotes] = useState({});
  const [expandedHelp, setExpandedHelp] = useState({});

  function getResponse(id) {
    return responses.find((r) => r.id === id) || { id, checked: false, notes: '' };
  }

  function update(id, patch) {
    const existing = getResponse(id);
    const updated = responses.filter((r) => r.id !== id);
    updated.push({ ...existing, ...patch });
    onChange(updated);
  }

  // Group items by category
  const categories = {};
  for (const item of items) {
    if (!categories[item.category]) categories[item.category] = [];
    categories[item.category].push(item);
  }

  const requiredCount = items.filter((i) => i.required).length;
  const checkedRequired = items.filter((i) => i.required && getResponse(i.id).checked).length;

  const badge = MODE_BADGES[mode] || MODE_BADGES.legacy;
  const generatedLabel = formatGeneratedAt(generatedAt);
  const showRegenerate = mode === 'ai' && typeof onRegenerate === 'function' && !readOnly;

  return (
    <div>
      {/* Source / regen header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)',
          marginBottom: 'var(--spacing-sm)',
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 'var(--font-weight-semibold)',
            color: badge.color,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${badge.color}`,
            backgroundColor: `${badge.color}11`,
          }}
        >
          {badge.label}
        </span>
        {generatedLabel && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
            Generated {generatedLabel}
          </span>
        )}
        {sowChanged && (
          <span
            style={{
              fontSize: '11px',
              color: 'var(--color-warning, #f59e0b)',
            }}
            title="The SoW has been edited since this checklist was generated."
          >
            · SoW updated
          </span>
        )}
        {showRegenerate && (
          <button
            type="button"
            onClick={onRegenerate}
            disabled={regenerating}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px 8px',
              cursor: regenerating ? 'default' : 'pointer',
              fontSize: '11px',
              color: regenerating
                ? 'var(--color-text-tertiary)'
                : 'var(--color-accent-blue, #2563eb)',
            }}
            title="Generate a fresh checklist from the current SoW content"
          >
            {regenerating ? 'Regenerating…' : '↻ Regenerate'}
          </button>
        )}
      </div>

      {/* Progress bar */}
      {requiredCount > 0 && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              marginBottom: '6px',
            }}
          >
            <span>Required items</span>
            <span>
              {checkedRequired} / {requiredCount}
            </span>
          </div>
          <div
            style={{
              height: '4px',
              borderRadius: '2px',
              backgroundColor: 'var(--color-border-default)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${(checkedRequired / requiredCount) * 100}%`,
                backgroundColor:
                  checkedRequired === requiredCount
                    ? 'var(--color-success)'
                    : 'var(--color-accent-purple, #7c3aed)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      )}

      {Object.entries(categories).map(([category, categoryItems]) => (
        <div key={category} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              marginBottom: 'var(--spacing-sm)',
              paddingBottom: '4px',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            {category}
          </div>

          {categoryItems.map((item) => {
            const resp = getResponse(item.id);
            const notesOpen = expandedNotes[item.id];
            const helpOpen = expandedHelp[item.id];

            return (
              <div
                key={item.id}
                style={{
                  marginBottom: 'var(--spacing-sm)',
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: resp.checked ? 'rgba(74, 222, 128, 0.06)' : 'transparent',
                  border: '1px solid',
                  borderColor: resp.checked ? 'rgba(74, 222, 128, 0.2)' : 'transparent',
                  transition: 'background-color 0.15s ease, border-color 0.15s ease',
                }}
              >
                {/* Checkbox row */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--spacing-sm)',
                  }}
                >
                  <input
                    type="checkbox"
                    id={`check-${item.id}`}
                    checked={resp.checked}
                    disabled={readOnly}
                    onChange={(e) => update(item.id, { checked: e.target.checked })}
                    style={{
                      marginTop: '2px',
                      accentColor: 'var(--color-accent-purple, #7c3aed)',
                      cursor: readOnly ? 'default' : 'pointer',
                      flexShrink: 0,
                    }}
                  />
                  <label
                    htmlFor={`check-${item.id}`}
                    style={{
                      flex: 1,
                      fontSize: 'var(--font-size-sm)',
                      lineHeight: 'var(--line-height-relaxed)',
                      cursor: readOnly ? 'default' : 'pointer',
                      color: resp.checked
                        ? 'var(--color-text-secondary)'
                        : 'var(--color-text-primary)',
                      textDecoration: resp.checked ? 'line-through' : 'none',
                    }}
                  >
                    {item.text}
                    {item.required && (
                      <span
                        style={{
                          marginLeft: '4px',
                          color: 'var(--color-error)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                        title="Required"
                      >
                        *
                      </span>
                    )}
                  </label>

                  {/* Help tooltip toggle */}
                  {item.helpText && (
                    <button
                      onClick={() => setExpandedHelp((p) => ({ ...p, [item.id]: !p[item.id] }))}
                      style={{
                        background: 'none',
                        border: '1px solid var(--color-border-default)',
                        borderRadius: '50%',
                        width: '18px',
                        height: '18px',
                        fontSize: '10px',
                        cursor: 'pointer',
                        color: 'var(--color-text-tertiary)',
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                      }}
                      title="Help"
                    >
                      ?
                    </button>
                  )}

                  {/* Notes toggle */}
                  {!readOnly && (
                    <button
                      onClick={() => setExpandedNotes((p) => ({ ...p, [item.id]: !p[item.id] }))}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-xs)',
                        color: resp.notes
                          ? 'var(--color-accent-purple, #7c3aed)'
                          : 'var(--color-text-tertiary)',
                        flexShrink: 0,
                        padding: '0 2px',
                      }}
                      title={notesOpen ? 'Hide notes' : 'Add notes'}
                    >
                      {resp.notes ? '✏️' : '+ note'}
                    </button>
                  )}
                </div>

                {/* Help text */}
                {helpOpen && item.helpText && (
                  <div
                    style={{
                      marginTop: 'var(--spacing-xs)',
                      marginLeft: '22px',
                      padding: 'var(--spacing-xs) var(--spacing-sm)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-secondary)',
                      lineHeight: 'var(--line-height-relaxed)',
                    }}
                  >
                    {item.helpText}
                  </div>
                )}

                {/* Notes field */}
                {(notesOpen || (readOnly && resp.notes)) && (
                  <textarea
                    value={resp.notes || ''}
                    readOnly={readOnly}
                    onChange={(e) => update(item.id, { notes: e.target.value })}
                    placeholder="Add notes..."
                    rows={2}
                    style={{
                      marginTop: 'var(--spacing-xs)',
                      marginLeft: '22px',
                      width: 'calc(100% - 22px)',
                      resize: 'vertical',
                      padding: 'var(--spacing-xs) var(--spacing-sm)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border-default)',
                      backgroundColor: 'var(--color-bg-primary)',
                      color: 'var(--color-text-primary)',
                      fontSize: 'var(--font-size-xs)',
                      fontFamily: 'inherit',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
