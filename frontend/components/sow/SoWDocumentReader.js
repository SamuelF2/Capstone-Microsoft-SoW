/**
 * SoWDocumentReader — document-style reader for ``sow.content``.
 *
 * Renders the SoW as a single continuous document (rather than the tabbed
 * panel view used elsewhere) so reviewers can read top-to-bottom the way
 * the SoW would actually be delivered. Includes a sticky table-of-contents
 * sidebar, in-document search, font-size control, and reading-width control.
 *
 * Designed for the assignment review page where the reviewer is spending
 * extended time reading the SoW carefully — readability features matter.
 *
 * Props
 * -----
 *   sow      object  The SoW record (only ``content`` is read).
 */

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { CONTENT_LABELS } from './SoWContentPanel';

// ─── Document section order ─────────────────────────────────────────────────
// Mirrors a real SoW's natural reading order rather than the tab grouping.
// Any keys present in ``content`` but not listed here are appended at the
// end so we never silently drop a section.

const DOCUMENT_SECTION_ORDER = [
  'executiveSummary',
  'projectScope',
  'scope',
  'cloudAdoptionScope',
  'agileApproach',
  'sureStepMethodology',
  'waterfallApproach',
  'migrationStrategy',
  'workloadAssessment',
  'productBacklog',
  'phasesDeliverables',
  'phasesMilestones',
  'deliverables',
  'dataMigration',
  'testingStrategy',
  'teamStructure',
  'supportTransition',
  'supportHypercare',
  'supportOperations',
  'securityCompliance',
  'assumptions',
  'assumptionsRisks',
  'risks',
  'pricing',
];

// Field names that are internal IDs and should never be rendered as labels.
const HIDDEN_FIELDS = new Set(['id', '_id', 'uid']);

// Metadata fields that belong in the summary card at the top of the document
// rather than as numbered content sections at the bottom.
const METADATA_FIELDS = new Set([
  'status',
  'sowTitle',
  'customerName',
  'opportunityId',
  'dealValue',
  'deliveryMethodology',
]);

const METADATA_LABELS = {
  status: 'Status',
  sowTitle: 'Title',
  customerName: 'Customer',
  opportunityId: 'Opportunity ID',
  dealValue: 'Deal Value',
  deliveryMethodology: 'Delivery Methodology',
};

// Field names that, when present in an object, should be used as the
// "primary text" for that object instead of being shown as a labelled row.
// We try these in order — first match wins.
const PRIMARY_TEXT_FIELDS = ['text', 'title', 'name', 'item', 'story', 'role'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Convert a camelCase or snake_case key to a human-readable label. */
function humanizeKey(key) {
  return key
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^\s+/, '')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * Wrap occurrences of ``term`` in ``text`` with <mark> elements.
 * Returns an array of strings and <mark> nodes suitable for rendering.
 * If ``term`` is empty, returns the original string.
 */
function highlightText(text, term) {
  if (!term || typeof text !== 'string') return text;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  if (!lower.includes(needle)) return text;

  const parts = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      parts.push(text.slice(i));
      break;
    }
    if (idx > i) parts.push(text.slice(i, idx));
    parts.push(
      <mark
        key={`m-${idx}`}
        style={{
          backgroundColor: 'rgba(250, 204, 21, 0.55)',
          color: 'inherit',
          padding: '0 1px',
          borderRadius: '2px',
        }}
      >
        {text.slice(idx, idx + needle.length)}
      </mark>
    );
    i = idx + needle.length;
  }
  return parts;
}

/** True if a value is empty (null, "", [], {}). */
function isEmpty(val) {
  if (val == null) return true;
  if (typeof val === 'string') return val.trim() === '';
  if (Array.isArray(val)) return val.length === 0;
  if (typeof val === 'object') return Object.keys(val).length === 0;
  return false;
}

// ─── Renderer ───────────────────────────────────────────────────────────────

/**
 * Render a SoW value as document-style JSX.
 *
 *  - Strings render as paragraphs with preserved newlines.
 *  - Arrays of plain strings render as bulleted lists.
 *  - Arrays of objects render as a list of items, each item using the
 *    object's "primary text" field as the lead and any other fields as
 *    a small definition list underneath.
 *  - Plain objects render as a definition list.
 *
 * The recursive depth controls heading sizing for nested object keys.
 */
function DocValue({ value, search, depth = 0, sectionKey, sectionRefs, sectionNumber }) {
  if (value == null || isEmpty(value)) return null;

  if (typeof value === 'string') {
    return (
      <p
        style={{
          margin: '0 0 0.85em',
          lineHeight: 1.7,
          whiteSpace: 'pre-wrap',
        }}
      >
        {highlightText(value, search)}
      </p>
    );
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return <p style={{ margin: '0 0 0.85em' }}>{String(value)}</p>;
  }

  if (Array.isArray(value)) {
    // All-string array → simple bullets.
    if (value.every((v) => typeof v === 'string')) {
      return (
        <ul style={{ margin: '0 0 1em', paddingLeft: '1.4em', lineHeight: 1.7 }}>
          {value.map((v, i) => (
            <li key={i} style={{ marginBottom: '0.35em' }}>
              {highlightText(v, search)}
            </li>
          ))}
        </ul>
      );
    }
    // Array of objects → list of "items" with primary text + sub-fields.
    return (
      <div style={{ margin: '0 0 1em' }}>
        {value.map((item, i) => (
          <DocItem key={i} item={item} index={i} search={search} depth={depth} />
        ))}
      </div>
    );
  }

  if (typeof value === 'object') {
    // Object → sub-sections with vertical layout (label above, content below).
    const entries = Object.entries(value).filter(([k, v]) => !HIDDEN_FIELDS.has(k) && !isEmpty(v));
    if (entries.length === 0) return null;
    return (
      <div style={{ margin: '0 0 1em' }}>
        {entries.map(([k, v], index) => (
          <DocField
            key={k}
            fieldKey={k}
            label={humanizeKey(k)}
            value={v}
            search={search}
            depth={depth + 1}
            sectionKey={sectionKey}
            sectionRefs={sectionRefs}
            sectionNumber={sectionNumber}
            number={index}
          />
        ))}
      </div>
    );
  }

  return <p style={{ margin: '0 0 0.85em' }}>{String(value)}</p>;
}

/** A single object inside an array — rendered as a "card" item. */
function DocItem({ item, index, search, depth }) {
  if (item == null || typeof item !== 'object') {
    return (
      <p style={{ margin: '0 0 0.6em', lineHeight: 1.7 }}>{highlightText(String(item), search)}</p>
    );
  }

  // Find a "primary text" field — the first non-empty match in the
  // priority list. This becomes the bold lead-in for the item.
  const primaryKey = PRIMARY_TEXT_FIELDS.find(
    (k) => item[k] != null && typeof item[k] === 'string' && item[k].trim() !== ''
  );

  // The remaining fields render as a definition list under the lead-in.
  const remainingEntries = Object.entries(item).filter(
    ([k, v]) => k !== primaryKey && !HIDDEN_FIELDS.has(k) && !isEmpty(v)
  );

  return (
    <div
      style={{
        margin: '0 20px 0.85em',
        padding: '0.7em 0.95em',
        borderLeft: '3px solid var(--color-border-default)',
        backgroundColor: 'var(--color-bg-secondary)',
        borderRadius: '0 6px 6px 0',
      }}
    >
      {primaryKey && (
        <div
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
            lineHeight: 1.55,
            marginBottom: remainingEntries.length > 0 ? '0.4em' : 0,
          }}
        >
          {highlightText(item[primaryKey], search)}
        </div>
      )}
      {!primaryKey && (
        <div
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-tertiary)',
            fontSize: '0.85em',
            marginBottom: '0.4em',
          }}
        >
          Item {index + 1}
        </div>
      )}
      {remainingEntries.length > 0 && (
        <dl
          style={{
            margin: 0,
            display: 'grid',
            gridTemplateColumns: 'max-content 1fr',
            columnGap: '0.9em',
            rowGap: '0.25em',
            fontSize: '0.95em',
          }}
        >
          {remainingEntries.map(([k, v]) => (
            <FieldRow key={k} label={humanizeKey(k)} value={v} search={search} depth={depth + 1} />
          ))}
        </dl>
      )}
    </div>
  );
}

/**
 * One row in a `<dl>` definition list. Strings/numbers render inline; nested
 * arrays or objects render in a flowing block underneath.
 */
function FieldRow({ label, value, search, depth }) {
  const isInline =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

  if (isInline) {
    return (
      <>
        <dt
          style={{
            color: 'var(--color-text-tertiary)',
            fontSize: '0.85em',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            paddingTop: '0.15em',
          }}
        >
          {label}
        </dt>
        <dd
          style={{
            margin: 0,
            color: 'var(--color-text-primary)',
            lineHeight: 1.55,
            whiteSpace: 'pre-wrap',
          }}
        >
          {highlightText(String(value), search)}
        </dd>
      </>
    );
  }

  // Nested complex value — break out of the grid to give it room.
  return (
    <div style={{ gridColumn: '1 / -1' }}>
      <div
        style={{
          color: 'var(--color-text-tertiary)',
          fontSize: '0.85em',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: '0.3em',
          marginTop: '0.4em',
        }}
      >
        {label}
      </div>
      <DocValue value={value} search={search} depth={depth} />
    </div>
  );
}

/**
 * Used by DocValue when rendering an object's fields as sub-sections.
 * Always renders vertically: label on top, content below (never side-by-side).
 * When this is a top-level sub-section (depth === 1), registers an anchor
 * ref so the TOC scroll-spy and jump navigation work for sub-headers.
 */
function DocField({
  fieldKey,
  label,
  value,
  search,
  depth,
  sectionKey,
  sectionRefs,
  sectionNumber,
  number,
}) {
  // Build an anchor id when this is a direct child of a top-level section,
  // matching the anchor format used in buildSectionList().
  const anchorId = depth === 1 && sectionKey ? `sow-section-${sectionKey}-${fieldKey}` : null;

  return (
    <div
      id={anchorId || undefined}
      ref={
        anchorId && sectionRefs
          ? (el) => {
              sectionRefs.current[anchorId] = el;
            }
          : undefined
      }
      style={{
        marginBottom: '0.9em',
        scrollMarginTop: '12px',
      }}
    >
      <h4
        style={{
          margin: '30px 10px 0.4em',
          fontSize: '1.15em',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {sectionNumber ? `${sectionNumber}.${number + 1}` : null} {label}
      </h4>
      {typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? (
        <p
          style={{
            margin: '0px 20px 0.85em',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            color: 'var(--color-text-primary)',
          }}
        >
          {highlightText(String(value), search)}
        </p>
      ) : (
        <DocValue value={value} search={search} depth={depth} />
      )}
    </div>
  );
}

// ─── Main reader ────────────────────────────────────────────────────────────

/**
 * Build the ordered list of (key, label) pairs the document will render.
 * Honors DOCUMENT_SECTION_ORDER first, then appends any unlisted keys at
 * the bottom so unfamiliar templates aren't silently truncated.
 */
function buildSectionList(content) {
  const present = Object.keys(content || {}).filter(
    (k) => !isEmpty(content[k]) && !METADATA_FIELDS.has(k)
  );
  const seen = new Set();
  const ordered = [];
  for (const k of DOCUMENT_SECTION_ORDER) {
    if (present.includes(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const k of present) {
    if (!seen.has(k)) ordered.push(k);
  }
  return ordered.map((k) => {
    // Build sub-section list for object-typed content so the TOC can
    // render nested entries.
    const val = content[k];
    let children = [];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      children = Object.entries(val)
        .filter(([sk, sv]) => !HIDDEN_FIELDS.has(sk) && !isEmpty(sv))
        .map(([sk]) => ({
          key: sk,
          label: humanizeKey(sk),
          anchor: `sow-section-${k}-${sk}`,
        }));
    }
    return {
      key: k,
      label: CONTENT_LABELS[k] || humanizeKey(k),
      anchor: `sow-section-${k}`,
      children,
    };
  });
}

/** Extract metadata entries present in content for the summary card. */
function buildMetadata(content) {
  if (!content) return [];
  return [...METADATA_FIELDS]
    .filter((k) => content[k] != null && !isEmpty(content[k]))
    .map((k) => ({
      key: k,
      label: METADATA_LABELS[k] || humanizeKey(k),
      value: content[k],
    }));
}

const FONT_SIZES = [13, 14, 15, 16, 18, 20];
const DEFAULT_FONT_INDEX = 2; // 15px
const STORAGE_KEY_FONT = 'sowReader.fontIndex';
const STORAGE_KEY_WIDTH = 'sowReader.widthMode';

export default function SoWDocumentReader({ sow }) {
  const content = sow?.content || {};
  const sections = useMemo(() => buildSectionList(content), [content]);
  const metadata = useMemo(() => buildMetadata(content), [content]);

  // ── Reader controls ────────────────────────────────────────────────────
  const [fontIndex, setFontIndex] = useState(DEFAULT_FONT_INDEX);
  const [widthMode, setWidthMode] = useState('comfortable'); // 'comfortable' | 'wide'
  const [search, setSearch] = useState('');
  const [activeAnchor, setActiveAnchor] = useState(sections[0]?.anchor || null);

  // Restore persisted reader prefs.
  useEffect(() => {
    try {
      const f = localStorage.getItem(STORAGE_KEY_FONT);
      if (f != null && !Number.isNaN(Number(f))) {
        const idx = Math.max(0, Math.min(FONT_SIZES.length - 1, Number(f)));
        setFontIndex(idx);
      }
      const w = localStorage.getItem(STORAGE_KEY_WIDTH);
      if (w === 'wide' || w === 'comfortable') setWidthMode(w);
    } catch {
      // localStorage may be unavailable (SSR, privacy mode) — ignore.
    }
  }, []);

  const persistFont = useCallback((idx) => {
    setFontIndex(idx);
    try {
      localStorage.setItem(STORAGE_KEY_FONT, String(idx));
    } catch {
      /* ignore */
    }
  }, []);

  const persistWidth = useCallback((mode) => {
    setWidthMode(mode);
    try {
      localStorage.setItem(STORAGE_KEY_WIDTH, mode);
    } catch {
      /* ignore */
    }
  }, []);

  // ── Section scroll spy ────────────────────────────────────────────────
  // Track which section is currently in view so the TOC can highlight it.
  const scrollContainerRef = useRef(null);
  const sectionRefs = useRef({});

  useEffect(() => {
    const root = scrollContainerRef.current;
    if (!root || sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry that is most visible near the top of the viewport.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveAnchor(visible[0].target.id);
        }
      },
      {
        root,
        // Trigger when the section header crosses the top third of the panel.
        rootMargin: '0px 0px -70% 0px',
        threshold: 0,
      }
    );

    sections.forEach((s) => {
      const el = sectionRefs.current[s.anchor];
      if (el) observer.observe(el);
      // Also observe sub-section anchors so the TOC highlights them too.
      (s.children || []).forEach((c) => {
        const cel = sectionRefs.current[c.anchor];
        if (cel) observer.observe(cel);
      });
    });

    return () => observer.disconnect();
  }, [sections]);

  const handleJump = useCallback((anchor) => {
    const el = sectionRefs.current[anchor];
    const root = scrollContainerRef.current;
    if (!el || !root) return;
    // Manual scroll within the panel — `scrollIntoView` would also scroll
    // the outer page on some browsers, which we don't want.
    const top = el.offsetTop - 12;
    root.scrollTo({ top, behavior: 'smooth' });
    setActiveAnchor(anchor);
  }, []);

  // Match counts per section, used to badge the TOC during a search.
  const matchCounts = useMemo(() => {
    if (!search) return {};
    const term = search.toLowerCase();
    const counts = {};
    const countInValue = (v) => {
      if (v == null) return 0;
      if (typeof v === 'string') {
        const lower = v.toLowerCase();
        let n = 0;
        let i = 0;
        while ((i = lower.indexOf(term, i)) !== -1) {
          n += 1;
          i += term.length;
        }
        return n;
      }
      if (Array.isArray(v)) return v.reduce((acc, x) => acc + countInValue(x), 0);
      if (typeof v === 'object') {
        return Object.entries(v).reduce(
          (acc, [k, x]) => (HIDDEN_FIELDS.has(k) ? acc : acc + countInValue(x)),
          0
        );
      }
      return 0;
    };
    sections.forEach((s) => {
      counts[s.key] = countInValue(content[s.key]);
    });
    return counts;
  }, [search, sections, content]);

  const totalMatches = useMemo(
    () => Object.values(matchCounts).reduce((a, b) => a + b, 0),
    [matchCounts]
  );

  // ── Empty state ────────────────────────────────────────────────────────
  if (sections.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--spacing-2xl)',
          textAlign: 'center',
          color: 'var(--color-text-tertiary)',
        }}
      >
        No structured content available for this SoW.
      </div>
    );
  }

  const fontPx = FONT_SIZES[fontIndex];
  const maxWidth = widthMode === 'wide' ? '100%' : '760px';

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      {/* Reader toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)',
          padding: '10px 16px',
          borderBottom: '1px solid var(--color-border-default)',
          backgroundColor: 'var(--color-bg-secondary)',
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this document..."
            style={{
              width: '100%',
              padding: '6px 28px 6px 30px',
              borderRadius: '6px',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-primary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
              boxSizing: 'border-box',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '10px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-text-tertiary)',
              fontSize: '14px',
              pointerEvents: 'none',
            }}
          >
            ⌕
          </span>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              title="Clear search"
              style={{
                position: 'absolute',
                right: '6px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
                fontSize: '14px',
                padding: '2px 6px',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          )}
        </div>

        {search && (
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
            }}
          >
            {totalMatches} match{totalMatches === 1 ? '' : 'es'}
          </span>
        )}

        {/* Font size */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderLeft: '1px solid var(--color-border-default)',
            paddingLeft: 'var(--spacing-md)',
          }}
        >
          <button
            type="button"
            onClick={() => persistFont(Math.max(0, fontIndex - 1))}
            disabled={fontIndex === 0}
            title="Decrease font size"
            style={readerControlButtonStyle(fontIndex === 0)}
          >
            A−
          </button>
          <button
            type="button"
            onClick={() => persistFont(Math.min(FONT_SIZES.length - 1, fontIndex + 1))}
            disabled={fontIndex === FONT_SIZES.length - 1}
            title="Increase font size"
            style={readerControlButtonStyle(fontIndex === FONT_SIZES.length - 1)}
          >
            A+
          </button>
        </div>

        {/* Reading width */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            borderLeft: '1px solid var(--color-border-default)',
            paddingLeft: 'var(--spacing-md)',
          }}
        >
          <button
            type="button"
            onClick={() => persistWidth('comfortable')}
            title="Comfortable reading width"
            style={readerToggleButtonStyle(widthMode === 'comfortable')}
          >
            Narrow
          </button>
          <button
            type="button"
            onClick={() => persistWidth('wide')}
            title="Fill panel width"
            style={readerToggleButtonStyle(widthMode === 'wide')}
          >
            Wide
          </button>
        </div>
      </div>

      {/* Body: TOC sidebar + scrollable document */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 220px) 1fr',
        }}
      >
        {/* TOC */}
        <nav
          aria-label="Document sections"
          className="custom-scrollbar"
          style={{
            borderRight: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            overflowY: 'auto',
            scrollbarGutter: 'stable',
            padding: '12px 8px',
            minHeight: 0,
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '0 10px 8px',
            }}
          >
            Contents
          </div>
          {sections.map((s) => {
            const isActive = activeAnchor === s.anchor;
            const matchCount = search ? matchCounts[s.key] || 0 : 0;
            const dimmed = search && matchCount === 0;
            return (
              <div key={s.key}>
                <button
                  type="button"
                  onClick={() => handleJump(s.anchor)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    marginBottom: '2px',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: isActive
                      ? 'var(--font-weight-semibold)'
                      : 'var(--font-weight-regular)',
                    color: isActive
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : dimmed
                        ? 'var(--color-text-tertiary)'
                        : 'var(--color-text-secondary)',
                    backgroundColor: isActive ? 'rgba(124,58,237,0.10)' : 'transparent',
                    borderLeft: isActive
                      ? '3px solid var(--color-accent-purple, #7c3aed)'
                      : '3px solid transparent',
                    paddingLeft: '10px',
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {s.label}
                  </span>
                  {matchCount > 0 && (
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: '10px',
                        padding: '1px 6px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(250, 204, 21, 0.25)',
                        color: '#92400e',
                        fontWeight: 'var(--font-weight-semibold)',
                      }}
                    >
                      {matchCount}
                    </span>
                  )}
                </button>
                {/* Sub-headers for object-typed sections */}
                {s.children &&
                  s.children.length > 0 &&
                  s.children.map((c) => {
                    const isChildActive = activeAnchor === c.anchor;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => handleJump(c.anchor)}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '4px 10px 4px 24px',
                          borderRadius: '4px',
                          border: 'none',
                          marginBottom: '1px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: isChildActive
                            ? 'var(--font-weight-semibold)'
                            : 'var(--font-weight-regular)',
                          color: isChildActive
                            ? 'var(--color-accent-purple, #7c3aed)'
                            : 'var(--color-text-tertiary)',
                          backgroundColor: isChildActive ? 'rgba(124,58,237,0.06)' : 'transparent',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {c.label}
                      </button>
                    );
                  })}
              </div>
            );
          })}
        </nav>

        {/* Document */}
        <div
          ref={scrollContainerRef}
          className="custom-scrollbar"
          style={{
            overflowY: 'auto',
            scrollbarGutter: 'stable',
            backgroundColor: 'var(--color-bg-primary)',
            minHeight: 0,
            minWidth: 0,
          }}
        >
          <article
            style={{
              maxWidth,
              margin: '0 auto',
              padding: '32px clamp(20px, 4vw, 56px) 64px',
              fontSize: `${fontPx}px`,
              color: 'var(--color-text-primary)',
            }}
          >
            {/* Document header — title + metadata summary card */}
            <header style={{ marginBottom: '2em' }}>
              {sow?.title && (
                <>
                  <div
                    style={{
                      fontSize: '0.75em',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--color-text-tertiary)',
                      marginBottom: '0.4em',
                    }}
                  >
                    Statement of Work
                  </div>
                  <h1
                    style={{
                      margin: 0,
                      fontSize: '1.85em',
                      lineHeight: 1.2,
                      fontWeight: 'var(--font-weight-bold)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {sow.title}
                  </h1>
                </>
              )}

              {/* Metadata summary card */}
              {metadata.length > 0 && (
                <div
                  style={{
                    marginTop: '1.2em',
                    padding: '0.9em 1.1em',
                    borderRadius: '8px',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '0.75em 1.5em',
                  }}
                >
                  {metadata.map((m) => (
                    <div key={m.key}>
                      <div
                        style={{
                          fontSize: '0.7em',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          color: 'var(--color-text-tertiary)',
                          marginBottom: '0.2em',
                        }}
                      >
                        {m.label}
                      </div>
                      <div
                        style={{
                          fontSize: '0.9em',
                          color: 'var(--color-text-primary)',
                          fontWeight: 'var(--font-weight-medium)',
                        }}
                      >
                        {typeof m.value === 'number' ? m.value.toLocaleString() : String(m.value)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </header>

            {sections.map((s, idx) => (
              <section
                key={s.key}
                id={s.anchor}
                ref={(el) => {
                  sectionRefs.current[s.anchor] = el;
                }}
                style={{
                  marginBottom: '2.4em',
                  scrollMarginTop: '12px',
                }}
              >
                <h2
                  style={{
                    margin: '0 0 0.7em',
                    fontSize: '1.3em',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-text-primary)',
                    paddingBottom: '0.35em',
                    borderBottom: '2px solid var(--color-border-default)',
                  }}
                >
                  <span
                    style={{
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 'var(--font-weight-regular)',
                      marginRight: '0.55em',
                      fontSize: '0.85em',
                    }}
                  >
                    {idx + 1}.
                  </span>
                  {s.label}
                </h2>
                <DocValue
                  value={content[s.key]}
                  search={search}
                  sectionKey={s.key}
                  sectionRefs={sectionRefs}
                  sectionNumber={idx + 1}
                />
              </section>
            ))}
          </article>
        </div>
      </div>
    </div>
  );
}

// ─── Inline button styles ───────────────────────────────────────────────────

function readerControlButtonStyle(disabled) {
  return {
    background: 'var(--color-bg-primary)',
    border: '1px solid var(--color-border-default)',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 'var(--font-size-sm)',
    color: disabled ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
    fontWeight: 'var(--font-weight-medium)',
  };
}

function readerToggleButtonStyle(active) {
  return {
    background: active ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-bg-primary)',
    border: '1px solid',
    borderColor: active ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-border-default)',
    borderRadius: '6px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 'var(--font-size-sm)',
    color: active ? '#ffffff' : 'var(--color-text-secondary)',
    fontWeight: 'var(--font-weight-medium)',
  };
}
