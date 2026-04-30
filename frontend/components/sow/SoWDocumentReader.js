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
import CommentSidePanel from './CommentSidePanel';
import { useAuth } from '../../lib/auth';
import { findSectionElement, offsetsToRange, rangeToOffsets } from '../../lib/sowText';

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

export default function SoWDocumentReader({ sow, sowId, enableComments = true, onContentChange }) {
  const content = sow?.content || {};
  const sections = useMemo(() => buildSectionList(content), [content]);
  const metadata = useMemo(() => buildMetadata(content), [content]);
  const effectiveSowId = sowId ?? sow?.id ?? null;
  const commentsEnabled = enableComments && effectiveSowId != null;
  const { user, authFetch } = useAuth();

  // ── Reader controls ────────────────────────────────────────────────────
  const [fontIndex, setFontIndex] = useState(DEFAULT_FONT_INDEX);
  const [widthMode, setWidthMode] = useState('comfortable'); // 'comfortable' | 'wide'
  const [search, setSearch] = useState('');
  const [activeAnchor, setActiveAnchor] = useState(sections[0]?.anchor || null);

  // ── Comments state ─────────────────────────────────────────────────────
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [busyThreadId, setBusyThreadId] = useState(null);
  const [pendingSelection, setPendingSelection] = useState(null); // {section_key, offsets, anchor_text, x, y, rects}
  const [composerBody, setComposerBody] = useState('');
  const [composerKind, setComposerKind] = useState('comment'); // 'comment' | 'suggestion'
  const [composerReplacement, setComposerReplacement] = useState('');
  const [composerSubmitting, setComposerSubmitting] = useState(false);
  // Persistent overlay rendered when the user clicks a thread in the
  // sidebar. The native selection that ``jumpToThread`` sets fades the
  // moment the user clicks anywhere, so we mirror it with overlay rects
  // and let the rendering loop hold the highlight steady for ~3.5s.
  const [focusedHighlight, setFocusedHighlight] = useState(null); // {rects, kind}
  // Server-resolved tier on this SoW (view < comment < suggest). Drives
  // which composer toggles and Accept/Reject affordances we expose.
  const [permissionTier, setPermissionTier] = useState('view');
  const canComment = permissionTier === 'comment' || permissionTier === 'suggest';
  const canSuggest = permissionTier === 'suggest';

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

  // ── Comments — fetch on mount ──────────────────────────────────────────
  const reloadComments = useCallback(async () => {
    if (!commentsEnabled) return;
    setCommentsLoading(true);
    try {
      const res = await authFetch(`/api/sow/${effectiveSowId}/comments`);
      if (res.ok) {
        const data = await res.json();
        // Backend wraps the threads with the caller's effective tier.
        if (Array.isArray(data)) {
          // Defensive: tolerate the legacy bare-array shape.
          setComments(data);
        } else {
          setComments(Array.isArray(data?.threads) ? data.threads : []);
          if (typeof data?.tier === 'string') setPermissionTier(data.tier);
        }
      }
    } catch {
      // Network errors are non-fatal — comments are auxiliary.
    } finally {
      setCommentsLoading(false);
    }
  }, [authFetch, commentsEnabled, effectiveSowId]);

  useEffect(() => {
    reloadComments();
  }, [reloadComments]);

  // ── Comments — capture text selection within the document ─────────────
  const articleRef = useRef(null);
  useEffect(() => {
    if (!commentsEnabled || !canComment) return undefined;
    const root = articleRef.current;
    if (!root) return undefined;

    const onMouseUp = (e) => {
      // The composer is rendered inside the article, so mouseups on
      // its toggle pills, textareas, or close button bubble up here
      // too. Those clicks collapse the native selection, which would
      // make the block below clear ``pendingSelection`` and tear down
      // the composer mid-interaction. Bailing out keeps the composer
      // (and its persistent highlight overlay) intact when the user is
      // working inside it.
      const composerEl = document.getElementById('sow-comment-composer');
      if (composerEl && e?.target instanceof Node && composerEl.contains(e.target)) {
        return;
      }
      // Defer one frame so the selection has settled.
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
          setPendingSelection(null);
          return;
        }
        const range = sel.getRangeAt(0);
        const sectionInfo = findSectionElement(range.startContainer);
        const endSectionInfo = findSectionElement(range.endContainer);
        // Reject multi-section selections — keeps anchors deterministic.
        if (
          !sectionInfo ||
          !endSectionInfo ||
          sectionInfo[0] !== endSectionInfo[0] ||
          !root.contains(range.startContainer) ||
          !root.contains(range.endContainer)
        ) {
          setPendingSelection(null);
          return;
        }
        const [sectionEl, sectionKey] = sectionInfo;
        const offsets = rangeToOffsets(sectionEl, range);
        if (!offsets) {
          setPendingSelection(null);
          return;
        }
        const rect = range.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        // Capture every client-rect of the range so the persistent
        // highlight overlay can reproduce the selection visually after
        // the textarea steals focus and the native ::selection
        // collapses. ``getClientRects`` returns one rect per visual line
        // for multi-line selections, which is what we want.
        const rects = Array.from(range.getClientRects()).map((r) => ({
          left: r.left - rootRect.left,
          top: r.top - rootRect.top,
          width: r.width,
          height: r.height,
        }));
        setPendingSelection({
          section_key: sectionKey,
          offset_start: offsets.offset_start,
          offset_end: offsets.offset_end,
          anchor_text: offsets.anchor_text,
          // Position relative to the article container so the pill scrolls with content.
          x: rect.right - rootRect.left + 4,
          y: rect.bottom - rootRect.top + 4,
          rects,
        });
      });
    };
    root.addEventListener('mouseup', onMouseUp);
    return () => root.removeEventListener('mouseup', onMouseUp);
  }, [commentsEnabled, canComment]);

  // Dismiss the pill / composer when the user clicks elsewhere.
  useEffect(() => {
    if (!pendingSelection) return undefined;
    function onDocClick(e) {
      if (!articleRef.current) return;
      // The composer popover is rendered inside the article. The native
      // browser selection collapses the moment focus moves to the
      // textarea; that used to silently kill our pending state. With
      // the persistent overlay we no longer rely on the live selection,
      // so dismissal is purely "did the user click outside the
      // composer?".
      const composer = document.getElementById('sow-comment-composer');
      if (composer && composer.contains(e.target)) return;
      // Clicks back inside the article that produce a fresh selection
      // are handled by the mouseup listener — let those through.
      if (articleRef.current.contains(e.target)) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;
      }
      setPendingSelection(null);
      setComposerBody('');
      setComposerReplacement('');
      setComposerKind('comment');
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pendingSelection]);

  const handleCreateThread = useCallback(async () => {
    if (!pendingSelection || !composerBody.trim()) return;
    if (composerKind === 'suggestion' && !composerReplacement.trim()) return;
    setComposerSubmitting(true);
    try {
      const payload = {
        section_key: pendingSelection.section_key,
        offset_start: pendingSelection.offset_start,
        offset_end: pendingSelection.offset_end,
        anchor_text: pendingSelection.anchor_text,
        body: composerBody.trim(),
        kind: composerKind,
      };
      if (composerKind === 'suggestion') {
        payload.replacement_text = composerReplacement;
      }
      const res = await authFetch(`/api/sow/${effectiveSowId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const fresh = await res.json();
        setComments((prev) => [...prev, fresh]);
        setComposerBody('');
        setComposerReplacement('');
        setComposerKind('comment');
        setPendingSelection(null);
        setCommentsOpen(true);
      }
    } finally {
      setComposerSubmitting(false);
    }
  }, [
    authFetch,
    composerBody,
    composerKind,
    composerReplacement,
    effectiveSowId,
    pendingSelection,
  ]);

  const dismissComposer = useCallback(() => {
    setPendingSelection(null);
    setComposerBody('');
    setComposerReplacement('');
    setComposerKind('comment');
  }, []);

  // Keyboard shortcuts while the composer is open: Escape cancels,
  // Cmd/Ctrl+Enter submits. Bound at document level so the shortcuts
  // work whether the textarea or any of the composer's other controls
  // currently has focus.
  useEffect(() => {
    if (!pendingSelection) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismissComposer();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleCreateThread();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pendingSelection, dismissComposer, handleCreateThread]);

  // Hold time for the focused-thread highlight after a sidebar jump.
  // Long enough that the eye lands on it, short enough that it doesn't
  // become visual noise once the reader starts reading.
  const FOCUSED_HIGHLIGHT_MS = 3500;
  const focusedHighlightTimerRef = useRef(null);

  const jumpToThread = useCallback(
    (thread) => {
      // Find the section element, scroll to it, and pin a persistent
      // highlight overlay over the anchor text.
      const sectionEl = articleRef.current?.querySelector(
        `[data-section-key="${thread.section_key}"]`
      );
      const anchor = `sow-section-${thread.section_key}`;
      if (sectionEl && scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({
          top: sectionEl.offsetTop - 12,
          behavior: 'smooth',
        });
      }
      setActiveAnchor(anchor);
      // Close any in-flight composer first — a sidebar click means the
      // user is shifting focus, and stacking two highlight tints on
      // different ranges is more confusing than helpful.
      dismissComposer();
      // After the smooth scroll settles we resolve the anchor's offsets
      // back to a Range, capture every visual line's rect, and hand
      // those to the overlay renderer. The native selection still gets
      // set as a courtesy (screen readers + Find In Page benefit) but
      // it's no longer load-bearing — the overlay is. The same ref
      // tracks both the post-scroll timer and the auto-clear timer so
      // clicking a second thread mid-pulse cancels the in-flight render
      // cleanly.
      if (focusedHighlightTimerRef.current) {
        clearTimeout(focusedHighlightTimerRef.current);
        focusedHighlightTimerRef.current = null;
      }
      setFocusedHighlight(null);
      focusedHighlightTimerRef.current = setTimeout(() => {
        focusedHighlightTimerRef.current = null;
        if (!sectionEl || !articleRef.current) return;
        const range = offsetsToRange(sectionEl, thread.offset_start, thread.offset_end);
        if (!range) return;
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        const rootRect = articleRef.current.getBoundingClientRect();
        const rects = Array.from(range.getClientRects()).map((r) => ({
          left: r.left - rootRect.left,
          top: r.top - rootRect.top,
          width: r.width,
          height: r.height,
        }));
        setFocusedHighlight({ rects, kind: thread.kind || 'comment' });
        focusedHighlightTimerRef.current = setTimeout(() => {
          setFocusedHighlight(null);
          focusedHighlightTimerRef.current = null;
        }, FOCUSED_HIGHLIGHT_MS);
      }, 320);
    },
    [dismissComposer]
  );

  // Tear down the focused-highlight timer if the component unmounts
  // mid-pulse — otherwise we'd setState on an unmounted component.
  useEffect(() => {
    return () => {
      if (focusedHighlightTimerRef.current) {
        clearTimeout(focusedHighlightTimerRef.current);
        focusedHighlightTimerRef.current = null;
      }
    };
  }, []);

  const handleReply = useCallback(
    async (threadId, body) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}/replies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          await reloadComments();
        }
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId, reloadComments]
  );

  const handleResolveThread = useCallback(
    async (threadId) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}/resolve`, {
          method: 'POST',
        });
        if (res.ok) await reloadComments();
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId, reloadComments]
  );

  const handleReopenThread = useCallback(
    async (threadId) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}/reopen`, {
          method: 'POST',
        });
        if (res.ok) await reloadComments();
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId, reloadComments]
  );

  const handleDeleteThread = useCallback(
    async (threadId) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setComments((prev) => prev.filter((t) => t.id !== threadId));
        }
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId]
  );

  const handleApplySuggestion = useCallback(
    async (threadId) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}/apply`, {
          method: 'POST',
        });
        if (res.ok) {
          // Reload threads and signal consumers that the SoW content
          // changed; the parent page may want to refetch the SoW.
          await reloadComments();
          if (typeof onContentChange === 'function') {
            onContentChange();
          }
        } else {
          const body = await res.json().catch(() => ({}));
          const detail = body?.detail;
          const msg =
            typeof detail === 'string' ? detail : detail?.message || 'Could not apply suggestion';
          // Lightweight feedback — alert keeps the surface minimal.
          if (typeof window !== 'undefined') window.alert(msg);
        }
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId, reloadComments, onContentChange]
  );

  const handleRejectSuggestion = useCallback(
    async (threadId) => {
      setBusyThreadId(threadId);
      try {
        const res = await authFetch(`/api/sow/${effectiveSowId}/comments/${threadId}/reject`, {
          method: 'POST',
        });
        if (res.ok) {
          await reloadComments();
        }
      } finally {
        setBusyThreadId(null);
      }
    },
    [authFetch, effectiveSowId, reloadComments]
  );

  const visibleCommentCount = useMemo(
    () => comments.filter((t) => !t.resolved_at).length,
    [comments]
  );

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

        {/* Comments toggle */}
        {commentsEnabled && (
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
              onClick={() => setCommentsOpen((v) => !v)}
              title="Show comments"
              style={readerToggleButtonStyle(commentsOpen)}
            >
              💬 Comments{visibleCommentCount > 0 ? ` (${visibleCommentCount})` : ''}
            </button>
          </div>
        )}
      </div>

      {/* Body: TOC sidebar + scrollable document (+ optional comments panel) */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns:
            commentsEnabled && commentsOpen
              ? 'minmax(180px, 220px) 1fr minmax(280px, 340px)'
              : 'minmax(180px, 220px) 1fr',
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
            ref={articleRef}
            style={{
              maxWidth,
              margin: '0 auto',
              padding: '32px clamp(20px, 4vw, 56px) 64px',
              fontSize: `${fontPx}px`,
              color: 'var(--color-text-primary)',
              position: 'relative',
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
                data-section-key={s.key}
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

            {/* Persistent highlight overlay — kept up while the composer
                or the focused-thread pulse is active. Renders one
                absolutely-positioned div per visual line of the anchor
                so multi-line selections look right.

                The tint follows what the user is doing: blue while
                composing a comment, green while composing a suggestion,
                amber for a focused-thread pulse from the sidebar. We
                set ``pointerEvents: none`` so the overlay never steals
                clicks meant for the underlying text. */}
            {pendingSelection?.rects?.map((r, i) => {
              const isSuggest = composerKind === 'suggestion';
              return (
                <div
                  key={`pending-hl-${i}`}
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    backgroundColor: isSuggest
                      ? 'rgba(22, 163, 74, 0.22)'
                      : 'rgba(37, 99, 235, 0.22)',
                    boxShadow: isSuggest
                      ? 'inset 0 0 0 1px rgba(22, 163, 74, 0.45)'
                      : 'inset 0 0 0 1px rgba(37, 99, 235, 0.45)',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    zIndex: 40,
                    transition: 'background-color 120ms ease, box-shadow 120ms ease',
                  }}
                />
              );
            })}

            {/* Focused-thread pulse — same overlay shape, distinct
                color so it's not confused with the active composer. */}
            {focusedHighlight?.rects?.map((r, i) => {
              const isSuggest = focusedHighlight.kind === 'suggestion';
              return (
                <div
                  key={`focus-hl-${i}`}
                  aria-hidden="true"
                  className="sow-focused-thread-pulse"
                  style={{
                    position: 'absolute',
                    left: r.left,
                    top: r.top,
                    width: r.width,
                    height: r.height,
                    backgroundColor: isSuggest
                      ? 'rgba(22, 163, 74, 0.18)'
                      : 'rgba(245, 158, 11, 0.22)',
                    boxShadow: isSuggest
                      ? 'inset 0 0 0 1px rgba(22, 163, 74, 0.45)'
                      : 'inset 0 0 0 1px rgba(245, 158, 11, 0.5)',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    zIndex: 39,
                    animationDuration: `${FOCUSED_HIGHLIGHT_MS}ms`,
                  }}
                />
              );
            })}

            {/* Animations + the small tail/arrow that points at the
                highlight live in this style block. Kept inline so the
                file is self-contained — no global stylesheet edits. */}
            <style>{`
              @keyframes sow-composer-in {
                from { opacity: 0; transform: translateY(-4px) scale(0.97); }
                to   { opacity: 1; transform: translateY(0)    scale(1); }
              }
              @keyframes sow-focused-pulse {
                0%   { opacity: 0;    transform: scale(1.06); }
                10%  { opacity: 1;    transform: scale(1.04); }
                40%  { opacity: 0.95; transform: scale(1); }
                100% { opacity: 0;    transform: scale(1); }
              }
              .sow-focused-thread-pulse {
                animation-name: sow-focused-pulse;
                animation-timing-function: ease-out;
                animation-fill-mode: forwards;
                transform-origin: center;
              }
            `}</style>

            {/* Selection-anchored composer popover (comment or suggestion) */}
            {commentsEnabled && canComment && pendingSelection && (
              <div
                id="sow-comment-composer"
                role="dialog"
                aria-label={composerKind === 'suggestion' ? 'Suggest an edit' : 'Add a comment'}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  left: Math.min(
                    Math.max(0, pendingSelection.x),
                    Math.max(0, (articleRef.current?.clientWidth || 800) - 320)
                  ),
                  top: pendingSelection.y + 8,
                  zIndex: 50,
                  width: '320px',
                  padding: '12px 12px 10px',
                  borderRadius: '10px',
                  border: `1px solid ${
                    composerKind === 'suggestion'
                      ? 'rgba(22, 163, 74, 0.45)'
                      : 'rgba(37, 99, 235, 0.45)'
                  }`,
                  backgroundColor: 'var(--color-bg-primary)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)',
                  fontSize: '12px',
                  animation: 'sow-composer-in 120ms ease-out',
                  transformOrigin: 'top left',
                }}
              >
                {/* Tail/arrow — a 10px square rotated 45deg, anchored to
                    the top-left of the composer and offset upward so its
                    upper-left edge points at the highlight. The two
                    visible borders match the composer's own border so
                    the tail reads as part of the same shape. */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: '-6px',
                    left: '14px',
                    width: '10px',
                    height: '10px',
                    backgroundColor: 'var(--color-bg-primary)',
                    borderTop: `1px solid ${
                      composerKind === 'suggestion'
                        ? 'rgba(22, 163, 74, 0.45)'
                        : 'rgba(37, 99, 235, 0.45)'
                    }`,
                    borderLeft: `1px solid ${
                      composerKind === 'suggestion'
                        ? 'rgba(22, 163, 74, 0.45)'
                        : 'rgba(37, 99, 235, 0.45)'
                    }`,
                    transform: 'rotate(45deg)',
                  }}
                />

                {/* Top-right close button. Replaces the older bottom
                    "Cancel" so the layout reads more like a Google-Docs
                    or Notion comment popover. Esc still cancels. */}
                <button
                  type="button"
                  onClick={dismissComposer}
                  aria-label="Close (Esc)"
                  title="Close (Esc)"
                  style={{
                    position: 'absolute',
                    top: '6px',
                    right: '6px',
                    width: '22px',
                    height: '22px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    color: 'var(--color-text-tertiary)',
                    fontSize: '16px',
                    lineHeight: 1,
                    padding: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--color-bg-secondary)';
                    e.currentTarget.style.color = 'var(--color-text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--color-text-tertiary)';
                  }}
                >
                  ×
                </button>

                {/* Comment / Suggest toggle (only when reviewer can suggest) */}
                {canSuggest && (
                  <div
                    role="tablist"
                    style={{
                      display: 'inline-flex',
                      border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden',
                      fontSize: '11px',
                      marginBottom: '6px',
                    }}
                  >
                    {[
                      { key: 'comment', label: '💬 Comment' },
                      { key: 'suggestion', label: '✎ Suggest edit' },
                    ].map(({ key, label }) => {
                      const active = composerKind === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setComposerKind(key)}
                          style={{
                            padding: '3px 10px',
                            border: 'none',
                            backgroundColor: active
                              ? key === 'suggestion'
                                ? '#16a34a'
                                : 'var(--color-accent-blue, #2563eb)'
                              : 'transparent',
                            color: active ? 'white' : 'var(--color-text-secondary)',
                            cursor: 'pointer',
                            fontWeight: 600,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div
                  style={{
                    fontSize: '11px',
                    fontStyle: 'italic',
                    color: 'var(--color-text-tertiary)',
                    marginBottom: '6px',
                    paddingLeft: '6px',
                    borderLeft: `3px solid ${
                      composerKind === 'suggestion'
                        ? '#16a34a'
                        : 'var(--color-accent-blue, #2563eb)'
                    }`,
                  }}
                >
                  “{pendingSelection.anchor_text.slice(0, 160)}
                  {pendingSelection.anchor_text.length > 160 ? '…' : ''}”
                </div>

                {composerKind === 'suggestion' && (
                  <textarea
                    value={composerReplacement}
                    onChange={(e) => setComposerReplacement(e.target.value)}
                    placeholder="Replacement text…"
                    rows={3}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px',
                      fontSize: '12px',
                      fontFamily: 'inherit',
                      border: '1px solid #16a34a55',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(22,163,74,0.04)',
                      color: '#15803d',
                      resize: 'vertical',
                      marginBottom: '6px',
                    }}
                  />
                )}

                <textarea
                  value={composerBody}
                  onChange={(e) => setComposerBody(e.target.value)}
                  placeholder={composerKind === 'suggestion' ? 'Why this edit?' : 'Add a comment…'}
                  autoFocus
                  rows={composerKind === 'suggestion' ? 2 : 3}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '6px',
                    fontSize: '12px',
                    fontFamily: 'inherit',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: '4px',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    resize: 'vertical',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    justifyContent: 'space-between',
                    marginTop: '8px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      color: 'var(--color-text-tertiary)',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {/* Tiny shortcut hint — useful but not loud. */}
                    Esc to close ·{' '}
                    {typeof navigator !== 'undefined' &&
                    /Mac|iPhone|iPad/i.test(navigator.platform || '')
                      ? '⌘'
                      : 'Ctrl'}
                    +Enter to submit
                  </span>
                  <button
                    type="button"
                    onClick={handleCreateThread}
                    disabled={
                      composerSubmitting ||
                      !composerBody.trim() ||
                      (composerKind === 'suggestion' && !composerReplacement.trim())
                    }
                    style={{
                      border: `1px solid ${
                        composerKind === 'suggestion'
                          ? '#16a34a'
                          : 'var(--color-accent-blue, #2563eb)'
                      }`,
                      backgroundColor:
                        composerKind === 'suggestion'
                          ? '#16a34a'
                          : 'var(--color-accent-blue, #2563eb)',
                      color: 'white',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 12px',
                      cursor:
                        composerSubmitting ||
                        !composerBody.trim() ||
                        (composerKind === 'suggestion' && !composerReplacement.trim())
                          ? 'default'
                          : 'pointer',
                      fontSize: '11px',
                      fontWeight: 600,
                      opacity:
                        composerSubmitting ||
                        !composerBody.trim() ||
                        (composerKind === 'suggestion' && !composerReplacement.trim())
                          ? 0.6
                          : 1,
                    }}
                  >
                    {composerSubmitting
                      ? 'Posting…'
                      : composerKind === 'suggestion'
                        ? 'Suggest'
                        : 'Comment'}
                  </button>
                </div>
              </div>
            )}
          </article>
        </div>

        {/* Comments side panel */}
        {commentsEnabled && commentsOpen && (
          <CommentSidePanel
            threads={comments}
            currentUserId={user?.id ?? null}
            loading={commentsLoading}
            busyThreadId={busyThreadId}
            showResolved={showResolved}
            onToggleResolved={() => setShowResolved((v) => !v)}
            onJump={jumpToThread}
            onReply={handleReply}
            onResolve={handleResolveThread}
            onReopen={handleReopenThread}
            onDelete={handleDeleteThread}
            onApply={handleApplySuggestion}
            onReject={handleRejectSuggestion}
          />
        )}
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
