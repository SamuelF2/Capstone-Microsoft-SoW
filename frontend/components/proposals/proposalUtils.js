/**
 * Shared style maps and small helpers for the schema-proposals dashboard.
 *
 * Kept in a sibling module (rather than inlined in each component) so the
 * stats bar, table, graph view, and detail drawer all read the same color
 * for "node-kind" or "rejected status" — drift would be confusing.
 */

export const KIND_STYLES = {
  node: {
    bg: 'rgba(59,130,246,0.12)',
    color: 'var(--color-info)',
    label: 'node',
    icon: '◆',
  },
  edge: {
    bg: 'rgba(139,92,246,0.12)',
    color: 'var(--color-accent-purple-light)',
    label: 'edge',
    icon: '↣',
  },
  section_type: {
    bg: 'rgba(20,184,166,0.12)',
    color: '#5eead4',
    label: 'section',
    icon: '§',
  },
};

export const STATUS_STYLES = {
  pending: {
    bg: 'rgba(59,130,246,0.10)',
    color: 'var(--color-info)',
    dot: 'var(--color-info)',
    label: 'Pending',
  },
  accepted: {
    bg: 'rgba(74,222,128,0.10)',
    color: 'var(--color-success)',
    dot: 'var(--color-success)',
    label: 'Accepted',
  },
  rejected: {
    bg: 'rgba(239,68,68,0.10)',
    color: 'var(--color-error)',
    dot: 'var(--color-error)',
    label: 'Rejected',
  },
};

/** Resolve a proposal's status from its boolean flags. */
export function proposalStatus(p) {
  if (p?.rejected) return 'rejected';
  if (p?.accepted) return 'accepted';
  return 'pending';
}

/** Start of today in the user's local timezone. */
export function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Start of the current week (Monday 00:00) in the user's local timezone.
 * Monday is the convention for delivery teams; switch to Sunday if that
 * ever causes confusion.
 */
export function startOfWeek() {
  const d = startOfToday();
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

/**
 * Compact relative time formatter — "12 minutes ago" / "3 days ago".
 * Tolerates null/undefined input and bad ISO strings.
 */
export function formatRelative(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return 'in the future';
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return date.toLocaleDateString();
}
