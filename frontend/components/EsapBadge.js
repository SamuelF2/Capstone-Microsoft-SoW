/**
 * EsapBadge — small pill that renders an ESAP type label with the canonical
 * color from ``frontend/lib/format.js``.
 *
 * Used wherever an ESAP level needs to be displayed: review pages, all-sows
 * list, AI suggestion panel.  Replaces ~6 inline badge implementations that
 * had drifted in subtle ways (different padding, different fonts).
 *
 * Props
 * -----
 *   level   string   ESAP type key, e.g. ``'type-1'``.  Returns ``null`` if
 *                    falsy so callers can render unconditionally.
 *   size    'sm' | 'md'  Optional size.  ``'md'`` (default) uses the standard
 *                        4px/12px padding; ``'sm'`` is the slightly smaller
 *                        variant the assignment review page used.
 *   className string  Optional extra classes.
 *   style    object   Optional style overrides (merged last).
 */
import { ESAP_COLORS, formatEsapType } from '../lib/format';

const SIZE_STYLES = {
  sm: { padding: '3px 10px' },
  md: { padding: '4px 12px' },
};

export default function EsapBadge({ level, size = 'md', className, style }) {
  if (!level) return null;
  const palette = ESAP_COLORS[level] || {};
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        backgroundColor: palette.bg,
        color: palette.color,
        ...SIZE_STYLES[size],
        ...style,
      }}
    >
      {formatEsapType(level)}
    </span>
  );
}
