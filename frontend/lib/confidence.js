/**
 * Confidence-band helper shared by AI surfaces.
 *
 * Bands match the LLM self-reported confidence ranges used by both the
 * SoW field extraction modal and the schema-proposal queue:
 *   ≥ 0.7  → High   (green)
 *   ≥ 0.4  → Medium (amber)
 *   <  0.4 → Low    (gray)
 *
 * The auto-accept threshold for schema proposals is 0.80 (see
 * ml/sow_kg/schema_evolution.py); callers that care about that boundary
 * can read it from AUTO_ACCEPT_THRESHOLD.
 */

export const AUTO_ACCEPT_THRESHOLD = 0.8;

export function confidenceBadge(score) {
  if (score == null) return null;
  let label = 'Low';
  let color = '#6b7280';
  if (score >= 0.7) {
    label = 'High';
    color = '#059669';
  } else if (score >= 0.4) {
    label = 'Medium';
    color = '#d97706';
  }
  return { label: `${label} confidence (${Math.round(score * 100)}%)`, color };
}
