/**
 * components/ai-review/RecommendationStyles — shared visual constants and the
 * SeverityBadge atom used across the AI recommendation panels.
 */

export const SEVERITY_STYLES = {
  high: {
    bg: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: 'rgba(239,68,68,0.3)',
    label: 'High',
  },
  medium: {
    bg: 'rgba(251,191,36,0.12)',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.3)',
    label: 'Medium',
  },
  low: {
    bg: 'rgba(74,222,128,0.12)',
    color: '#4ade80',
    border: 'rgba(74,222,128,0.3)',
    label: 'Low',
  },
};

export const APPROVAL_STYLES = {
  Green: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', border: 'rgba(74,222,128,0.4)' },
  Yellow: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: 'rgba(251,191,36,0.4)' },
  Red: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
};

export const SUGGESTION_TYPE_STYLES = {
  rewrite: { label: 'Rewrite', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  add: { label: 'Add', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  flag: { label: 'Flag', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
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
