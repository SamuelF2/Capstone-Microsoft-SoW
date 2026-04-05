/**
 * workflowStages — shared helpers for treating a SoW workflow as a graph of
 * stages with a fixed set of anchor nodes (draft, approved, finalized, rejected)
 * and user-defined middle stages in between.
 *
 * Design model
 * ────────────
 * Think of the workflow as a directed graph:
 *
 *   [draft] ──▶ … user-defined stages … ──▶ [approved] ──▶ [finalized]
 *                                    │
 *                                    └──────▶ [rejected]   (failure branch)
 *
 * The four anchor stages are immutable — every workflow must include them
 * and they cannot be renamed, deleted, or have their stage_key changed. The
 * middle section is fully editable: authors can add/rename/reorder custom
 * stages via the workflow customizer.
 *
 * Transitions between stages carry a `condition` hint so the editor can model
 * branching ("on approve go here, on reject go there") without changing the
 * backend schema — the condition is stored inline in the workflow_data JSONB
 * snapshot and the backend passes it through untouched.
 */

// ── Anchor stage definitions ────────────────────────────────────────────────

/**
 * Anchors, keyed by stage_key. Each anchor has a role that dictates where it
 * can sit in the graph:
 *   - entry    → only at the start; no incoming edges, outgoing to any middle
 *   - success  → one or more "happy-path" terminals (approved, finalized)
 *   - failure  → failure-branch terminals (rejected)
 */
export const ANCHOR_STAGES = {
  draft: {
    stage_key: 'draft',
    display_name: 'Draft',
    stage_type: 'draft',
    role: 'entry',
    color: 'var(--color-text-secondary)',
    description: 'Entry point — authors compose the SoW here before submitting for review.',
  },
  approved: {
    stage_key: 'approved',
    display_name: 'Approved',
    stage_type: 'terminal',
    role: 'success',
    color: 'var(--color-success)',
    description: 'All required reviews passed. Ready for finalization.',
  },
  finalized: {
    stage_key: 'finalized',
    display_name: 'Finalized',
    stage_type: 'terminal',
    role: 'success',
    color: 'var(--color-accent-blue, #3f51b5)',
    description: 'Exit point — SoW is locked and handed off.',
  },
  rejected: {
    stage_key: 'rejected',
    display_name: 'Rejected',
    stage_type: 'terminal',
    role: 'failure',
    color: 'var(--color-error)',
    description: 'Failure branch — SoW was rejected during review.',
  },
};

export const ANCHOR_KEYS = Object.keys(ANCHOR_STAGES);

export function isAnchorStage(stageKey) {
  return stageKey in ANCHOR_STAGES;
}

export function anchorRole(stageKey) {
  return ANCHOR_STAGES[stageKey]?.role || null;
}

export function isEntryAnchor(stageKey) {
  return anchorRole(stageKey) === 'entry';
}

export function isSuccessAnchor(stageKey) {
  return anchorRole(stageKey) === 'success';
}

export function isFailureAnchor(stageKey) {
  return anchorRole(stageKey) === 'failure';
}

// ── Transition conditions (DAG-ready) ───────────────────────────────────────

/**
 * Conditions that can annotate a transition. Stored in workflow_data JSONB
 * alongside from_stage/to_stage so a future graph editor can honor them.
 *
 *   default     → follow this edge when advancing without a specific decision
 *   on_approve  → follow on an approve decision from a review/approval stage
 *   on_reject   → follow on a reject decision (usually points at `rejected`)
 *   on_send_back→ follow when a reviewer sends the SoW back
 */
export const TRANSITION_CONDITIONS = [
  { value: 'default', label: 'Default', description: 'Normal advance' },
  { value: 'on_approve', label: 'On approve', description: 'Review was approved' },
  { value: 'on_reject', label: 'On reject', description: 'Review was rejected' },
  { value: 'on_send_back', label: 'On send-back', description: 'Reviewer requested revisions' },
];

export function transitionConditionLabel(cond) {
  return TRANSITION_CONDITIONS.find((c) => c.value === cond)?.label || 'Default';
}

// ── Display helpers ─────────────────────────────────────────────────────────

/**
 * Humanize a stage_key like "internal_review" → "Internal Review". Kept
 * deliberately simple — prefer `stage.display_name` from the workflow snapshot
 * when available.
 */
export function prettifyStageKey(key) {
  if (!key) return '';
  return String(key)
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Resolve a CSS color for a stage. Anchor stages have fixed colors; custom
 * stages fall back to a palette derived from stage_type. Unknown types get a
 * neutral secondary color.
 */
const STAGE_TYPE_COLORS = {
  draft: 'var(--color-text-secondary)',
  ai_analysis: 'var(--color-accent-blue, #1967d2)',
  review: 'var(--color-warning)',
  approval: 'var(--color-accent-purple, #7c3aed)',
  terminal: 'var(--color-success)',
};

export function stageColor(stageKey, stageType) {
  if (isAnchorStage(stageKey)) return ANCHOR_STAGES[stageKey].color;
  return STAGE_TYPE_COLORS[stageType] || 'var(--color-text-secondary)';
}

/**
 * Pick the right frontend route for a SoW given its current stage. Draft-ish
 * anchors go to the draft editor; success anchors go to the finalize surface;
 * everything else (including user-defined stages and failure branches) lives
 * on the unified review page.
 */
export function routeForStage(stageKey, sowId) {
  if (stageKey === 'draft' || stageKey === 'rejected') return `/draft/${sowId}`;
  if (stageKey === 'approved' || stageKey === 'finalized') return `/finalize/${sowId}`;
  if (stageKey === 'ai_review') return `/ai-review?sowId=${sowId}`;
  return `/review/${sowId}`;
}

/**
 * Legacy display overrides for `review_assignments.stage` values (hyphenated
 * keys from the old default workflow). Used only as a prettier fallback when
 * we can't pull the label from a workflow snapshot.
 */
const LEGACY_ASSIGNMENT_STAGE_LABELS = {
  'internal-review': 'Internal Review',
  'drm-approval': 'DRM Approval',
};

export function assignmentStageLabel(assignmentStageKey) {
  if (!assignmentStageKey) return '';
  return LEGACY_ASSIGNMENT_STAGE_LABELS[assignmentStageKey] || prettifyStageKey(assignmentStageKey);
}
