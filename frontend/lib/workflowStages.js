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

// ── Stage key constants ─────────────────────────────────────────────────────

/**
 * Canonical map of stage_key string literals.  Use these constants instead
 * of inline strings like ``'drm-approval'`` so a workflow rename in one
 * place can't break routing in another.
 *
 * Anchor stage keys (draft/approved/finalized/rejected) appear here for
 * symmetry but are also exported individually via ``ANCHOR_STAGES``.  Legacy
 * hyphenated assignment-stage keys (``drm-approval``, ``internal-review``)
 * coexist with the underscore status keys (``drm_review``, ``internal_review``)
 * — both are needed because review_assignments.stage uses the legacy keys
 * while sow_documents.status uses the modern ones.
 */
export const STAGE_KEYS = Object.freeze({
  // Anchor (status + assignment.stage are the same)
  DRAFT: 'draft',
  APPROVED: 'approved',
  FINALIZED: 'finalized',
  REJECTED: 'rejected',

  // Status keys (sow_documents.status, snake_case)
  AI_REVIEW: 'ai_review',
  INTERNAL_REVIEW: 'internal_review',
  DRM_REVIEW: 'drm_review',

  // Assignment stage keys (review_assignments.stage, legacy hyphenated)
  ASSIGNMENT_INTERNAL_REVIEW: 'internal-review',
  ASSIGNMENT_DRM_APPROVAL: 'drm-approval',
  ASSIGNMENT_SQA_REVIEW: 'sqa-review',
});

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

// on_condition_met still exists in the backend (used by coa.py) but is no
// longer exposed in the graph editor UI.

// ── Pipeline-first implicit transition helpers ─────────────────────────────

/**
 * The rejected anchor is kept in the data model but hidden from the canvas.
 * A small indicator pill is rendered instead.
 */
export function isHiddenAnchor(stageKey) {
  return stageKey === 'rejected';
}

/**
 * Default send-back target options shown in the stage settings dropdown.
 * Dynamic options (preceding stages) are appended at render time.
 */
export const SEND_BACK_TARGETS = [
  { value: 'previous', label: 'Previous stage' },
  { value: 'draft', label: 'Draft (start)' },
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
  parallel_gateway: 'var(--color-accent-teal, #0d9488)',
};

// ── Parallel gateway & join configuration ──────────────────────────────────

/**
 * Join modes determine how a stage with multiple incoming transitions waits
 * for predecessor stages to complete before activating.
 *
 *   all_required → every incoming predecessor must complete (AND-join)
 *   any_required → first completed predecessor activates the stage (OR-join)
 *   custom       → user picks specific predecessors from the incoming set
 */
export const JOIN_MODES = [
  {
    value: 'default',
    label: 'Default (single predecessor)',
    description: 'Standard single-source transition',
  },
  {
    value: 'all_required',
    label: 'All predecessors required',
    description: 'Wait for every incoming branch to complete',
  },
  {
    value: 'any_required',
    label: 'Any predecessor sufficient',
    description: 'Activate when the first branch completes',
  },
  {
    value: 'custom',
    label: 'Custom selection',
    description: 'Choose which predecessors are required',
  },
];

/**
 * Helper — returns true if a stage_type represents a parallel gateway node.
 */
export function isParallelGateway(stageType) {
  return stageType === 'parallel_gateway';
}

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

// ── Parallel group detection for WorkflowProgress ─────────────────────────

/**
 * A stage is a failure branch if explicitly flagged or if it's a terminal
 * stage with stage_order <= 0. Matches the logic in WorkflowProgress.
 */
function _isFailureBranch(stage) {
  if (!stage) return false;
  if (stage.config?.is_failure === true) return true;
  if (stage.stage_type === 'terminal' && (stage.stage_order ?? 1) <= 0) return true;
  return false;
}

/**
 * Analyze workflow_data and return an ordered "display timeline" where
 * parallel gateway + branch stages are collapsed into group objects.
 *
 * Returns: Array of items, each either:
 *   { type: 'stage', stage: {...} }
 *   { type: 'parallel_group', gateway: {...},
 *     branches: [{ stage: {...} }], joinTarget: string|null }
 *
 * For linear workflows (no gateways), every item is type: 'stage' — zero
 * regressions from the old flat rendering.
 */
export function buildTimelineWithGroups(workflowData) {
  if (!workflowData) return [];
  const stages = [...(workflowData.stages || [])].sort(
    (a, b) => (a.stage_order || 0) - (b.stage_order || 0)
  );
  const transitions = workflowData.transitions || [];

  // Filter to non-failure stages for the main timeline.
  const timelineStages = stages.filter((s) => !_isFailureBranch(s));

  // Detect gateway → branch-target mappings (same pattern as workflowEditor.js:180-194).
  const gatewayTargetsMap = new Map(); // gateway_key → [target_key, ...]
  const branchTargetSet = new Set();

  for (const t of transitions) {
    const fromStage = stages.find((s) => s.stage_key === t.from_stage);
    if (fromStage && isParallelGateway(fromStage.stage_type)) {
      // Only explicit forward transitions (not reject/send-back/condition_met)
      const cond = t.condition || 'default';
      if (cond === 'default' || cond === 'on_approve') {
        if (!gatewayTargetsMap.has(t.from_stage)) gatewayTargetsMap.set(t.from_stage, []);
        gatewayTargetsMap.get(t.from_stage).push(t.to_stage);
        branchTargetSet.add(t.to_stage);
      }
    }
  }

  // Detect join target for each gateway group: the common outgoing target of all branch stages.
  const gatewayJoinMap = new Map(); // gateway_key → join_target_key | null
  for (const [gatewayKey, branchKeys] of gatewayTargetsMap) {
    const joinTargets = new Set();
    for (const bk of branchKeys) {
      for (const t of transitions) {
        if (t.from_stage === bk) {
          const cond = t.condition || 'default';
          if (cond === 'default' || cond === 'on_approve') {
            joinTargets.add(t.to_stage);
          }
        }
      }
    }
    // All branches should converge to the same target (enforced by editor validation).
    gatewayJoinMap.set(gatewayKey, joinTargets.size === 1 ? [...joinTargets][0] : null);
  }

  // Build the timeline array.
  const timeline = [];
  for (const stage of timelineStages) {
    // Skip stages consumed as branch targets of a gateway.
    if (branchTargetSet.has(stage.stage_key)) continue;

    if (isParallelGateway(stage.stage_type) && gatewayTargetsMap.has(stage.stage_key)) {
      const branchKeys = gatewayTargetsMap.get(stage.stage_key);
      const branches = branchKeys
        .map((bk) => {
          const branchStage = stages.find((s) => s.stage_key === bk);
          return branchStage ? { stage: branchStage } : null;
        })
        .filter(Boolean);

      timeline.push({
        type: 'parallel_group',
        gateway: stage,
        branches,
        joinTarget: gatewayJoinMap.get(stage.stage_key) || null,
      });
    } else {
      timeline.push({ type: 'stage', stage });
    }
  }

  return timeline;
}

/**
 * Returns true if a stage_key appears in any parallel group (as gateway or branch).
 */
export function isInParallelGroup(stageKey, timeline) {
  return !!findParallelGroupForStage(stageKey, timeline);
}

/**
 * Find the parallel_group item that contains a given stage_key.
 */
export function findParallelGroupForStage(stageKey, timeline) {
  if (!timeline) return null;
  for (const item of timeline) {
    if (item.type !== 'parallel_group') continue;
    if (item.gateway.stage_key === stageKey) return item;
    if (item.branches.some((b) => b.stage.stage_key === stageKey)) return item;
  }
  return null;
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

// ── Role display names ─────────────────────────────────────────────────────

/**
 * Canonical map from role_key → human-readable label, mirroring
 * `backend/utils/role_labels.py`. Keep these in sync — backend payloads use the
 * keys; the UI uses these labels.
 */
export const ROLE_DISPLAY_NAMES = {
  'solution-architect': 'Solution Architect',
  'sqa-reviewer': 'SQA Reviewer',
  cpl: 'Customer Practice Lead',
  cdp: 'Customer Delivery Partner',
  'delivery-manager': 'Delivery Manager',
  consultant: 'Consultant',
  'system-admin': 'System Admin',
};

/**
 * The reduced set of "reviewer roles" that may be required on a stage. Excludes
 * `consultant` and `system-admin` because those are not designable as required
 * stage reviewers in the workflow editor.
 */
export const KNOWN_REVIEWER_ROLES = [
  'solution-architect',
  'sqa-reviewer',
  'cpl',
  'cdp',
  'delivery-manager',
];

/**
 * Friendly label for a role key. Falls back to a Title-Cased version with
 * hyphens replaced by spaces, so brand-new roles still render reasonably
 * without code changes.
 */
export function roleLabel(roleKey) {
  if (!roleKey) return '';
  return (
    ROLE_DISPLAY_NAMES[roleKey] ||
    String(roleKey)
      .split(/[-_]/)
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(' ')
  );
}
