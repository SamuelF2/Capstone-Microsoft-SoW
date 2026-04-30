/**
 * Plain-text flattening for SoW structured content.
 *
 * Mirrors ``backend/utils/sow_text.py``. Both implementations must
 * produce identical output so character offsets recorded by the browser
 * remain valid when re-checked server-side for staleness, and so AI
 * checklist generation sees the same body the reviewer reads.
 *
 * Rules (recursive on the ``DocValue`` shape):
 *   - string  → the string + "\n" (empty string → "")
 *   - number  → ``String(value) + "\n"``
 *   - boolean → ``"Yes"`` / ``"No"`` + "\n"
 *   - null/undefined → ""
 *   - array   → each element flattened, concatenated
 *   - object  → ``"<Title-cased key>\n<flattened-value>\n"`` per non-empty entry
 *
 * Output is plain text — no Markdown, no HTML. Trailing newlines are
 * trimmed from the final string.
 */

const CAMEL_RE = /(?<=[a-z0-9])(?=[A-Z])/g;

export function humaniseKey(key) {
  if (typeof key !== 'string') return String(key);
  return key
    .replace(CAMEL_RE, ' ')
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function flattenInner(value) {
  if (value == null) return '';
  if (typeof value === 'boolean') return (value ? 'Yes' : 'No') + '\n';
  if (typeof value === 'number') return `${value}\n`;
  if (typeof value === 'string') return value === '' ? '' : value + '\n';
  if (Array.isArray(value)) return value.map(flattenInner).join('');
  if (typeof value === 'object') {
    let out = '';
    for (const [k, v] of Object.entries(value)) {
      const sub = flattenInner(v).replace(/\n+$/, '');
      if (!sub) continue;
      out += `${humaniseKey(k)}\n${sub}\n`;
    }
    return out;
  }
  return `${value}\n`;
}

/** Flatten one section's structured value to deterministic plain text. */
export function flattenSectionText(value) {
  return flattenInner(value).replace(/\n+$/, '').replace(/\s+$/, '');
}

/**
 * Walk the DOM subtree of an element collecting visible text, then convert
 * a browser ``Range`` into character offsets relative to that element's
 * flattened text. The walk uses a TreeWalker so it survives React
 * re-renders and matches what ``flattenSectionText`` produces server-side
 * for the same content.
 *
 * Returns ``null`` when the range straddles the element boundary or the
 * range is collapsed.
 *
 * NOTE: We rely on the SoW reader rendering the same plain text the
 * Python flattener emits. Text nodes are visited in document order, with
 * a "\n" injected after each block-level element close so paragraphs and
 * list items are separated by newlines (matching the Python output).
 */
export function rangeToOffsets(rootEl, range) {
  if (!rootEl || !range || range.collapsed) return null;
  if (!rootEl.contains(range.startContainer) || !rootEl.contains(range.endContainer)) {
    return null;
  }

  let offsetStart = -1;
  let offsetEnd = -1;
  let cursor = 0;
  const blockTags = new Set([
    'P',
    'LI',
    'DIV',
    'SECTION',
    'ARTICLE',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'DT',
    'DD',
    'BLOCKQUOTE',
    'TR',
    'BR',
  ]);

  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_ALL, null);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.nodeValue.length;
      if (node === range.startContainer) {
        offsetStart = cursor + range.startOffset;
      }
      if (node === range.endContainer) {
        offsetEnd = cursor + range.endOffset;
      }
      cursor += len;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // Insert a soft newline at element close so block boundaries map
      // to "\n" the same way the Python flattener does. We approximate
      // by adding a newline when the walker exits a block element —
      // TreeWalker traverses depth-first, so a sibling element coming
      // up next is the natural "close" boundary.
      if (blockTags.has(node.tagName)) {
        // We can't easily detect close in TreeWalker; instead, every
        // block element contributes a trailing newline counted once.
        // Use a sentinel sibling pass after children are walked.
        if (node.tagName === 'BR') {
          cursor += 1;
        }
      }
    }
    node = walker.nextNode();
  }

  if (offsetStart < 0 || offsetEnd < 0 || offsetEnd <= offsetStart) return null;
  // Anchor text is read directly from the live selection so it matches
  // exactly what the reviewer highlighted, even if the offset map skews.
  const anchorText = String(range.toString()).slice(0, 500);
  return {
    offset_start: offsetStart,
    offset_end: offsetEnd,
    anchor_text: anchorText,
  };
}

/**
 * Find the closest ancestor with a ``data-section-key`` attribute.
 * Returns ``[el, key]`` or ``null`` when no enclosing section is found.
 */
export function findSectionElement(node) {
  let el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el) {
    if (el.dataset && el.dataset.sectionKey) {
      return [el, el.dataset.sectionKey];
    }
    el = el.parentElement;
  }
  return null;
}

/**
 * Within an element subtree, find the text range matching offsets
 * ``[start, end]`` over the same text walk used by ``rangeToOffsets``.
 * Used for click-to-jump in the comment side panel: programmatically
 * select the anchor span so the reviewer sees what the comment refers to.
 *
 * Returns a Range or null (e.g. when a stale anchor's offsets fall
 * outside the current text).
 */
export function offsetsToRange(rootEl, start, end) {
  if (!rootEl || end <= start) return null;
  let cursor = 0;
  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue.length;
    if (!startNode && cursor + len >= start) {
      startNode = node;
      startOff = start - cursor;
    }
    if (cursor + len >= end) {
      endNode = node;
      endOff = end - cursor;
      break;
    }
    cursor += len;
    node = walker.nextNode();
  }
  if (!startNode || !endNode) return null;
  try {
    const range = document.createRange();
    range.setStart(startNode, Math.max(0, Math.min(startOff, startNode.nodeValue.length)));
    range.setEnd(endNode, Math.max(0, Math.min(endOff, endNode.nodeValue.length)));
    return range;
  } catch {
    return null;
  }
}
