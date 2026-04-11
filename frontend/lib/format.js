/**
 * Shared formatting helpers used across pages and components.
 *
 * Consolidated from per-file copies of formatDeal, formatDate, formatDateTime,
 * formatBytes, and esapBadgeStyle. All accept an optional `fallback` for
 * missing/invalid input — pass `null` if the caller renders nothing on missing.
 */

export function formatDeal(v, fallback = '—') {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return isNaN(n) ? fallback : '$' + n.toLocaleString('en-US');
}

export function formatDate(iso, fallback = '—') {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso, fallback = '—') {
  if (!iso) return fallback;
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function formatBytes(bytes, fallback = '—') {
  if (!bytes) return fallback;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Single source of truth for ESAP type → badge color mapping.  Exported so
 * the ``<EsapBadge>`` component and any tooling can derive consistent
 * colors without re-inventing the palette.
 */
export const ESAP_COLORS = Object.freeze({
  'type-1': { bg: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' },
  'type-2': { bg: 'rgba(245,158,11,0.1)', color: 'var(--color-warning)' },
  'type-3': { bg: 'rgba(74,222,128,0.1)', color: 'var(--color-success)' },
});

export function esapBadgeStyle(level) {
  if (!level) return {};
  return ESAP_COLORS[level] || {};
}

/**
 * Human label for an ESAP level.  Mirrors the backend label map.
 */
export function formatEsapType(level) {
  if (!level) return '';
  return String(level).toUpperCase();
}
