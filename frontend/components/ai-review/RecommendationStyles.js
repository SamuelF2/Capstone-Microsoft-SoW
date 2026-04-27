/**
 * components/ai-review/RecommendationStyles — shared visual constants and the
 * SeverityBadge atom used across the AI recommendation panels.
 *
 * All colors thread through the design tokens in ``frontend/styles/shared.css``.
 * The ``--color-*-rgb`` channel tokens let us tint backgrounds and borders at
 * varying opacities without forking the palette — change a hex once and every
 * tinted state follows.
 */

// Helpers so the per-state object literals stay readable.
const tint = (rgbVar, alpha) => `rgba(var(${rgbVar}), ${alpha})`;
const tone = (cssVar) => `var(${cssVar})`;

export const SEVERITY_STYLES = {
  high: {
    bg: tint('--color-error-rgb', 0.12),
    color: tone('--color-error'),
    border: tint('--color-error-rgb', 0.3),
    label: 'High',
  },
  medium: {
    bg: tint('--color-warning-rgb', 0.12),
    color: tone('--color-warning'),
    border: tint('--color-warning-rgb', 0.3),
    label: 'Medium',
  },
  low: {
    bg: tint('--color-success-rgb', 0.12),
    color: tone('--color-success'),
    border: tint('--color-success-rgb', 0.3),
    label: 'Low',
  },
};

export const APPROVAL_STYLES = {
  Green: {
    bg: tint('--color-success-rgb', 0.15),
    color: tone('--color-success'),
    border: tint('--color-success-rgb', 0.4),
  },
  Yellow: {
    bg: tint('--color-warning-rgb', 0.15),
    color: tone('--color-warning'),
    border: tint('--color-warning-rgb', 0.4),
  },
  Red: {
    bg: tint('--color-error-rgb', 0.15),
    color: tone('--color-error'),
    border: tint('--color-error-rgb', 0.4),
  },
};

export const SUGGESTION_TYPE_STYLES = {
  rewrite: {
    label: 'Rewrite',
    color: tone('--color-warning'),
    bg: tint('--color-warning-rgb', 0.12),
  },
  add: {
    label: 'Add',
    color: tone('--color-success'),
    bg: tint('--color-success-rgb', 0.12),
  },
  flag: {
    label: 'Flag',
    color: tone('--color-error'),
    bg: tint('--color-error-rgb', 0.12),
  },
};

export function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 600,
        backgroundColor: s.bg,
        color: s.color,
        border: `1px solid ${s.border}`,
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
      }}
    >
      {s.label}
    </span>
  );
}
