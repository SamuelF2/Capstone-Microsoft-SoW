/**
 * Neo4j-inspired palette + label helpers for the schema proposals graph.
 *
 * The 10 colors are the signature pastels used by Neo4j Browser / Bloom
 * to color nodes by label. They sit on a dark canvas (--color-bg-secondary)
 * with good contrast and recognizable saturation. We map them by `kind`
 * for proposal nodes and by a deterministic hash for source-document
 * hubs so the same source always gets the same color across renders.
 */

export const NEO4J_PALETTE = [
  '#4C8EDA', // blue
  '#F79767', // orange
  '#57C7E3', // cyan
  '#8DCC93', // green
  '#FFC454', // yellow
  '#F16667', // coral
  '#ECB5C9', // pink
  '#D9C8AE', // tan
  '#DA7194', // rose
  '#569480', // slate green
];

const KIND_COLOR = {
  node: '#4C8EDA',
  edge: '#DA7194',
  section_type: '#8DCC93',
};

const HUB_COLOR = '#6b7280';

export function colorForKind(kind) {
  return KIND_COLOR[kind] || NEO4J_PALETTE[0];
}

export function hubColor() {
  return HUB_COLOR;
}

/** Deterministic hash → palette index. Same source always returns the same color. */
export function colorForSource(source) {
  if (!source) return HUB_COLOR;
  let h = 0;
  for (let i = 0; i < source.length; i++) {
    h = (h << 5) - h + source.charCodeAt(i);
    h |= 0;
  }
  return NEO4J_PALETTE[Math.abs(h) % NEO4J_PALETTE.length];
}

/**
 * Truncate or abbreviate a label so it fits inside a circular node.
 *
 *  - If the label is short enough, return it unchanged.
 *  - If it has multiple uppercase-prefixed segments (CamelCase / PascalCase
 *    or words separated by space / underscore / hyphen), return the initials
 *    of each segment (e.g. "ProjectManagerEntity" -> "PME", "in_scope_item"
 *    -> "ISI").
 *  - Otherwise, hard-truncate with an ellipsis.
 */
export function truncateLabel(text, max = 16) {
  if (!text) return '';
  if (text.length <= max) return text;

  const camelSegments = text.match(/[A-Z][a-z0-9]*|[a-z0-9]+/g) || [];
  const splitSegments = text.split(/[\s_\-./]+/).filter(Boolean);
  const segments = splitSegments.length > 1 ? splitSegments : camelSegments;

  if (segments.length >= 2) {
    const initials = segments.map((s) => s[0]?.toUpperCase() || '').join('');
    if (initials.length >= 2 && initials.length <= max) return initials;
  }

  return `${text.slice(0, Math.max(1, max - 1))}…`;
}

/** Node radius scales with `uses` count, clamped so even popular nodes fit. */
export function radiusForUses(uses) {
  const u = Math.max(0, Number(uses) || 0);
  return Math.max(18, Math.min(42, 18 + Math.sqrt(u) * 4));
}
