/**
 * ExtractionPreviewModal — review AI-extracted SoW sections before applying.
 *
 * Rendered after a successful call to `aiClient.extractFromDocument()`.
 * Shows one card per section with the current value (if any) on the left
 * and the AI's proposed value on the right, plus a checkbox the author
 * uses to opt sections in or out before applying.
 *
 * Sections where the AI returned `value: null` are listed but disabled —
 * the rationale field explains *why* (e.g. "Document didn't mention a
 * Team Structure section") so the author understands the blank instead
 * of guessing the AI silently dropped it.
 *
 * On Apply the modal calls `onApply(selectedSections)` with hydrated IDs
 * applied (so AttachmentManager can pass it straight to the backend's
 * apply-extraction endpoint, then forward the response upstream so the
 * draft page can refresh `sowData` without an auto-save echo).
 *
 * Props
 * -----
 *   open          boolean   — When false the modal is unmounted.
 *   extracted     object    — { sectionKey: { value, confidence, rationale } }
 *   currentContent object   — Current sow.content for the side-by-side diff.
 *   notes         string    — 1-2 sentence summary from the ML service.
 *   onApply       fn        — Called with { [sectionKey]: hydratedValue }.
 *   onClose       fn        — Cancel or backdrop click.
 *   applying      boolean   — Disables the Apply button while the parent
 *                             POSTs to apply-extraction.
 *   error         string|null — Inline error from the parent (e.g. 409 hash
 *                               mismatch).
 */

import { useMemo, useState } from 'react';
import Modal from './Modal';
import { hydrateIds, renderStructured, isStructuredSection } from '../lib/sectionSchemas';
import { confidenceBadge } from '../lib/confidence';

// Sections the AI knows how to extract, in the order they appear in the
// modal. Mirrors the list in backend/utils/section_schemas.py — keep in
// lockstep when adding sections.
const SECTION_ORDER = [
  'executiveSummary',
  'projectScope',
  'deliverables',
  'teamStructure',
  'assumptionsRisks',
  'agileApproach',
];

const SECTION_LABELS = {
  executiveSummary: 'Executive Summary',
  projectScope: 'Project Scope',
  deliverables: 'Deliverables',
  teamStructure: 'Team Structure',
  assumptionsRisks: 'Assumptions & Risks',
  agileApproach: 'Agile Approach',
};

// Default-on threshold: above this the section's checkbox is pre-checked.
// Adjust after smoke tests if the LLM's self-reported confidence proves
// poorly calibrated.
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;

function isEmptyValue(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
}

// Render either via the registered structured renderer or as plain text /
// JSON depending on what shape we got. The current value comes from
// sow.content (which may be a plain string for sections without schemas
// like a freeform text field), so we have to handle both cases.
function ValuePreview({ sectionKey, value, emptyLabel }) {
  if (isEmptyValue(value)) {
    return (
      <em className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
        {emptyLabel}
      </em>
    );
  }
  if (typeof value === 'string') {
    return <div style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--font-size-sm)' }}>{value}</div>;
  }
  if (isStructuredSection(sectionKey) || sectionKey === 'executiveSummary') {
    const rendered = renderStructured(sectionKey, value);
    if (rendered) return <div style={{ fontSize: 'var(--font-size-sm)' }}>{rendered}</div>;
  }
  return (
    <pre
      style={{
        fontSize: 'var(--font-size-xs)',
        whiteSpace: 'pre-wrap',
        margin: 0,
      }}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function ExtractionPreviewModal({
  open,
  extracted,
  currentContent,
  notes,
  onApply,
  onClose,
  applying = false,
  error = null,
}) {
  const rows = useMemo(() => {
    if (!extracted) return [];
    // Iterate SECTION_ORDER so the modal layout is stable regardless of
    // the dict iteration order returned by the ML service.
    return SECTION_ORDER.filter((k) => extracted[k] !== undefined).map((k) => {
      const item = extracted[k] || {};
      return {
        key: k,
        label: SECTION_LABELS[k] || k,
        value: item.value ?? null,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0,
        rationale: item.rationale || null,
      };
    });
  }, [extracted]);

  // Track which sections the user has opted in. Initialize lazily on open
  // so reopening with new extraction data resets the selection.
  const [selected, setSelected] = useState({});
  const [didInit, setDidInit] = useState(false);

  if (open && !didInit) {
    const next = {};
    for (const r of rows) {
      next[r.key] = r.value !== null && r.confidence >= DEFAULT_CONFIDENCE_THRESHOLD;
    }
    setSelected(next);
    setDidInit(true);
  }
  if (!open && didInit) {
    setDidInit(false);
    setSelected({});
  }

  const selectableCount = rows.filter((r) => r.value !== null).length;
  const checkedCount = rows.filter((r) => r.value !== null && selected[r.key]).length;

  const handleApply = () => {
    if (!onApply || checkedCount === 0) return;
    const out = {};
    for (const r of rows) {
      if (r.value === null) continue;
      if (!selected[r.key]) continue;
      out[r.key] = hydrateIds(r.key, r.value);
    }
    onApply(out);
  };

  const toggle = (key) => {
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <Modal
      open={open}
      onClose={applying ? null : onClose}
      maxWidth="900px"
      ariaLabel="Review AI extraction"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        <div>
          <h2 style={{ margin: 0 }}>Review AI-extracted sections</h2>
          <p
            className="text-secondary"
            style={{ margin: 'var(--spacing-xs) 0 0', fontSize: 'var(--font-size-sm)' }}
          >
            Pick the sections to copy into your SoW. Sections the AI couldn&apos;t confidently
            extract are listed for transparency but cannot be applied.
          </p>
          {notes && (
            <p
              style={{
                margin: 'var(--spacing-sm) 0 0',
                padding: 'var(--spacing-sm)',
                background: 'var(--color-bg-secondary, #f4f6fa)',
                borderRadius: 'var(--radius-md)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <strong>AI notes:</strong> {notes}
            </p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              border: '1px solid #dc2626',
              background: '#fee2e2',
              color: '#7f1d1d',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            {error}
          </div>
        )}

        {rows.length === 0 ? (
          <div
            className="text-secondary"
            style={{ padding: 'var(--spacing-xl)', textAlign: 'center' }}
          >
            The AI didn&apos;t extract any structured sections from this document.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {rows.map((row) => {
              const cb = confidenceBadge(row.confidence);
              const disabled = row.value === null;
              return (
                <div
                  key={row.key}
                  style={{
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: 'var(--spacing-md)',
                    background: disabled
                      ? 'var(--color-bg-disabled, #f9fafb)'
                      : 'var(--color-bg-primary)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 'var(--spacing-md)',
                      marginBottom: 'var(--spacing-sm)',
                    }}
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={!!selected[row.key]}
                        onChange={() => toggle(row.key)}
                        disabled={disabled || applying}
                      />
                      <strong>{row.label}</strong>
                    </label>
                    {cb && (
                      <span
                        style={{
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 'var(--font-weight-semibold)',
                          color: cb.color,
                          border: `1px solid ${cb.color}`,
                          backgroundColor: `${cb.color}18`,
                        }}
                      >
                        {cb.label}
                      </span>
                    )}
                  </div>
                  {disabled ? (
                    <div className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
                      <em>Not extracted.</em>{' '}
                      {row.rationale || 'The AI couldn’t confidently extract this section.'}
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 'var(--spacing-md)',
                      }}
                    >
                      <div>
                        <div
                          className="text-secondary"
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            marginBottom: 'var(--spacing-xs)',
                          }}
                        >
                          Current
                        </div>
                        <ValuePreview
                          sectionKey={row.key}
                          value={currentContent?.[row.key]}
                          emptyLabel="(empty)"
                        />
                      </div>
                      <div>
                        <div
                          className="text-secondary"
                          style={{
                            fontSize: 'var(--font-size-xs)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            marginBottom: 'var(--spacing-xs)',
                          }}
                        >
                          Proposed
                        </div>
                        <ValuePreview sectionKey={row.key} value={row.value} emptyLabel="(empty)" />
                        {row.rationale && (
                          <p
                            className="text-secondary"
                            style={{
                              marginTop: 'var(--spacing-xs)',
                              fontSize: 'var(--font-size-xs)',
                              fontStyle: 'italic',
                            }}
                          >
                            {row.rationale}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            paddingTop: 'var(--spacing-sm)',
            borderTop: '1px solid var(--color-border)',
          }}
        >
          <span className="text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {selectableCount === 0
              ? 'No sections to apply.'
              : `${checkedCount} of ${selectableCount} section${selectableCount === 1 ? '' : 's'} selected.`}
          </span>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button type="button" onClick={onClose} disabled={applying} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={applying || checkedCount === 0}
              className="btn-primary"
            >
              {applying
                ? 'Applying…'
                : checkedCount === 0
                  ? 'Apply selected'
                  : `Apply selected (${checkedCount})`}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
