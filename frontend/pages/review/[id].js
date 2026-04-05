/**
 * pages/review/[id].js
 *
 * Unified, stage-aware review page. Replaces the hard-coded
 * /internal-review/[id] and /drm-review/[id] pages with a single surface that
 * adapts to whatever non-terminal stage the SoW is currently in — including
 * user-defined custom stages from the workflow snapshot.
 *
 * Terminal stages (e.g. finalize, rejected) remain on their own pages; this
 * one covers only the review/approval phases in between.
 *
 * Behavior notes
 * ──────────────
 * • The phase tracker, header chip, and reviewer-matching all derive from the
 *   workflow snapshot (GET /api/workflow/sow/{id}), so custom stages render
 *   automatically.
 * • The page reacts to `user.role` from auth context (which honors the
 *   localStorage role override). Reviewers see their own checklist and action
 *   buttons; non-reviewers see a read-only observer view.
 * • A "System Admin" role is treated as elevated — it bypasses gating and
 *   exposes all review controls. (Full backend support lands with Phase 1.)
 * • "Save Progress" persists the current reviewer's checklist WITHOUT
 *   refetching, so authors with multiple assignments no longer appear to
 *   cycle through them on each save.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';
import ReviewChecklist from '../../components/ReviewChecklist';
import AISuggestionsPanel from '../../components/AISuggestionsPanel';
import WorkflowProgress from '../../components/WorkflowProgress';
import COATracker from '../../components/COATracker';
import AttachmentManager from '../../components/AttachmentManager';
import ActivityLog from '../../components/ActivityLog';
import { formatDeal, esapBadgeStyle } from '../../lib/format';

// ─── Constants ──────────────────────────────────────────────────────────────

const CONTENT_LABELS = {
  executiveSummary: 'Executive Summary',
  projectScope: 'Project Scope',
  scope: 'Project Scope',
  deliverables: 'Deliverables',
  assumptions: 'Assumptions',
  risks: 'Risks',
  pricing: 'Pricing',
  teamStructure: 'Team Structure',
  supportTransition: 'Support & Transition',
  agileApproach: 'Agile Approach',
  productBacklog: 'Product Backlog',
  sureStepMethodology: 'Sure Step Methodology',
  phasesDeliverables: 'Phases & Deliverables',
  dataMigration: 'Data Migration',
  testingStrategy: 'Testing Strategy',
  supportHypercare: 'Support & Hypercare',
  waterfallApproach: 'Waterfall Approach',
  phasesMilestones: 'Phases & Milestones',
  cloudAdoptionScope: 'Cloud Adoption Scope',
  migrationStrategy: 'Migration Strategy',
  workloadAssessment: 'Workload Assessment',
  securityCompliance: 'Security & Compliance',
  supportOperations: 'Support & Operations',
};

const CONTENT_TAB_GROUPS = [
  { label: 'Overview', keys: ['executiveSummary'] },
  { label: 'Scope', keys: ['projectScope', 'scope', 'cloudAdoptionScope'] },
  {
    label: 'Approach',
    keys: [
      'agileApproach',
      'productBacklog',
      'sureStepMethodology',
      'waterfallApproach',
      'migrationStrategy',
      'workloadAssessment',
    ],
  },
  {
    label: 'Deliverables',
    keys: [
      'deliverables',
      'phasesDeliverables',
      'phasesMilestones',
      'dataMigration',
      'testingStrategy',
    ],
  },
  {
    label: 'Team & Support',
    keys: [
      'teamStructure',
      'supportTransition',
      'supportHypercare',
      'supportOperations',
      'securityCompliance',
    ],
  },
  { label: 'Pricing', keys: ['pricing', 'assumptions', 'risks'] },
];

const ROLE_LABELS = {
  consultant: 'Consultant',
  'solution-architect': 'Solution Architect',
  'sqa-reviewer': 'SQA Reviewer',
  cpl: 'Customer Practice Lead',
  cdp: 'Customer Delivery Partner',
  'delivery-manager': 'Delivery Manager',
  'system-admin': 'System Admin',
};

// Terminal statuses that should live on their own dedicated pages.
const TERMINAL_STATUSES_REDIRECT = {
  approved: (id) => `/finalize/${id}`,
  finalized: (id) => `/finalize/${id}`,
  draft: (id) => `/draft/${id}`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Which review_assignments.stage keys belong to this workflow stage? Custom
 * stages can opt-in via `config.assignment_stage_keys`; for default stages we
 * fall back to the stage_key itself and its hyphenated form so legacy
 * assignments still match. (Same logic as WorkflowProgress uses.)
 */
function matchingAssignmentKeys(stage) {
  const keys = new Set();
  const mapped = stage?.config?.assignment_stage_keys;
  if (Array.isArray(mapped)) mapped.forEach((k) => keys.add(k));
  if (stage?.stage_key) {
    keys.add(stage.stage_key);
    keys.add(stage.stage_key.replace(/_/g, '-'));
  }
  return keys;
}

function isTerminalStage(stage) {
  return stage?.stage_type === 'terminal';
}

function isFailureBranch(stage) {
  if (!stage) return false;
  if (stage.config?.is_failure === true) return true;
  if (stage.stage_type === 'terminal' && (stage.stage_order ?? 1) <= 0) return true;
  return false;
}

function renderValue(val, depth = 0) {
  if (val == null) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  if (typeof val === 'string') {
    return (
      <p
        style={{
          margin: '0 0 8px',
          lineHeight: 'var(--line-height-relaxed)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {val}
      </p>
    );
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
    return (
      <ul style={{ margin: '0 0 8px', paddingLeft: '20px' }}>
        {val.map((item, i) => (
          <li key={i} style={{ marginBottom: '4px' }}>
            {typeof item === 'object' ? renderValue(item, depth + 1) : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof val === 'object') {
    return (
      <div style={{ paddingLeft: depth > 0 ? '12px' : '0' }}>
        {Object.entries(val).map(([k, v]) => (
          <div key={k} style={{ marginBottom: '8px' }}>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'capitalize',
                display: 'block',
                marginBottom: '2px',
              }}
            >
              {k.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            {renderValue(v, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}

// ─── SoW content panel (read-only, tabbed) ──────────────────────────────────

function SoWContentPanel({ sow, activeTab, onTabChange }) {
  const content = sow?.content || {};
  const tabs = CONTENT_TAB_GROUPS.filter((g) => g.keys.some((k) => content[k] != null));

  if (tabs.length === 0) {
    return (
      <div style={{ padding: 'var(--spacing-xl)', color: 'var(--color-text-tertiary)' }}>
        No structured content available for this SoW.
      </div>
    );
  }

  const currentTab = tabs.find((t) => t.label === activeTab) || tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: '1px solid var(--color-border-default)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const active = currentTab.label === tab.label;
          return (
            <button
              key={tab.label}
              onClick={() => onTabChange(tab.label)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 14px',
                fontSize: 'var(--font-size-sm)',
                fontWeight: active ? 'var(--font-weight-semibold)' : 'normal',
                color: active
                  ? 'var(--color-accent-purple, #7c3aed)'
                  : 'var(--color-text-secondary)',
                borderBottom: active
                  ? '2px solid var(--color-accent-purple, #7c3aed)'
                  : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-xl)' }}>
        {currentTab.keys
          .filter((k) => content[k] != null)
          .map((k) => (
            <div key={k} style={{ marginBottom: 'var(--spacing-xl)' }}>
              <h4
                style={{
                  margin: '0 0 var(--spacing-sm)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-primary)',
                  borderBottom: '1px solid var(--color-border-default)',
                  paddingBottom: '6px',
                }}
              >
                {CONTENT_LABELS[k] || k}
              </h4>
              <div
                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}
              >
                {renderValue(content[k])}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

// ─── Decision modal (approve / reject / conditional) ────────────────────────

function DecisionModal({ type, onClose, onSubmit, submitting }) {
  const [comments, setComments] = useState('');
  const [conditions, setConditions] = useState(['']);

  const isReject = type === 'rejected';
  const isConditional = type === 'approved-with-conditions';
  const title = isReject
    ? 'Reject SoW'
    : isConditional
      ? 'Approve with Conditions'
      : 'Confirm Approval';

  function handleSubmit() {
    if (isReject && !comments.trim()) return;
    if (isConditional && conditions.every((c) => !c.trim())) return;
    onSubmit({
      comments: comments.trim() || null,
      conditions: isConditional ? conditions.filter((c) => c.trim()) : null,
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--spacing-xl)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--spacing-2xl)',
          maxWidth: '480px',
          width: '100%',
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 var(--spacing-md)', fontSize: 'var(--font-size-lg)' }}>
          {title}
        </h3>

        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              marginBottom: 'var(--spacing-xs)',
            }}
          >
            {isReject ? 'Reason for rejection *' : 'Comments'}
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder={
              isReject
                ? 'Describe the issues that need to be addressed…'
                : 'Optional comments for the author…'
            }
            rows={4}
            style={{
              width: '100%',
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {isConditional && (
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label
              style={{
                display: 'block',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-semibold)',
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              Conditions *
            </label>
            {conditions.map((cond, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-xs)',
                  marginBottom: 'var(--spacing-xs)',
                }}
              >
                <input
                  type="text"
                  value={cond}
                  onChange={(e) =>
                    setConditions((c) => c.map((x, j) => (j === i ? e.target.value : x)))
                  }
                  placeholder={`Condition ${i + 1}`}
                  style={{
                    flex: 1,
                    padding: 'var(--spacing-xs) var(--spacing-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    fontFamily: 'inherit',
                  }}
                />
                {conditions.length > 1 && (
                  <button
                    onClick={() => setConditions((c) => c.filter((_, j) => j !== i))}
                    style={{
                      background: 'none',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-md)',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--color-error)',
                      fontSize: 'var(--font-size-xs)',
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => setConditions((c) => [...c, ''])}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 0',
                cursor: 'pointer',
                color: 'var(--color-accent-purple, #7c3aed)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              + Add condition
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className={`btn btn-sm ${isReject ? 'btn-danger' : 'btn-primary'}`}
            style={
              isReject
                ? { backgroundColor: 'var(--color-error)', color: '#fff', border: 'none' }
                : {}
            }
            onClick={handleSubmit}
            disabled={
              submitting ||
              (isReject && !comments.trim()) ||
              (isConditional && conditions.every((c) => !c.trim()))
            }
          >
            {submitting ? 'Submitting…' : isReject ? 'Reject' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Send-back modal (return to a specific earlier stage) ───────────────────

function SendBackModal({ availableStages, onClose, onSubmit, submitting }) {
  const [targetStage, setTargetStage] = useState(availableStages[0]?.stage_key || 'draft');
  const [comments, setComments] = useState('');
  const [actionItems, setActionItems] = useState(['']);

  function handleSubmit() {
    if (!comments.trim()) return;
    onSubmit({
      target_stage: targetStage,
      comments: comments.trim(),
      action_items: actionItems.filter((x) => x.trim()),
    });
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-xl)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-xl)',
          width: '100%',
          maxWidth: '520px',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-md)',
        }}
      >
        <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
          Send Back SoW
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Return this SoW to an earlier stage for revision.
        </p>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Return to
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
            {availableStages.map(({ stage_key, display_name }) => {
              const active = targetStage === stage_key;
              return (
                <button
                  key={stage_key}
                  onClick={() => setTargetStage(stage_key)}
                  style={{
                    flex: '1 1 140px',
                    padding: 'var(--spacing-sm)',
                    borderRadius: 'var(--radius-md)',
                    border: '2px solid',
                    borderColor: active
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-border-default)',
                    backgroundColor: active ? 'rgba(124,58,237,0.08)' : 'var(--color-bg-secondary)',
                    color: active
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: active ? 'var(--font-weight-semibold)' : 'normal',
                    transition: 'all 0.15s',
                  }}
                >
                  {display_name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Reason <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Explain why this SoW is being sent back…"
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: 'var(--spacing-sm)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontSize: 'var(--font-size-sm)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'block',
              fontSize: 'var(--font-size-sm)',
              marginBottom: '6px',
              color: 'var(--color-text-secondary)',
            }}
          >
            Action items (optional)
          </label>
          {actionItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                value={item}
                onChange={(e) =>
                  setActionItems((a) => a.map((x, j) => (j === i ? e.target.value : x)))
                }
                placeholder={`Action item ${i + 1}`}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-sm)',
                }}
              />
              {actionItems.length > 1 && (
                <button
                  onClick={() => setActionItems((a) => a.filter((_, j) => j !== i))}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-error)',
                    fontSize: '16px',
                    padding: '0 4px',
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => setActionItems((a) => [...a, ''])}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-accent-purple, #7c3aed)',
              fontSize: 'var(--font-size-xs)',
            }}
          >
            + Add action item
          </button>
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting || !comments.trim()}
            style={{ backgroundColor: 'var(--color-warning)', borderColor: 'var(--color-warning)' }}
          >
            {submitting ? 'Sending back…' : 'Send Back'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Observer banner (shown when the viewer has no role at current stage) ──

function ObserverBanner({ actingRole, currentStage, isSystemAdmin }) {
  const requiredRoles = (currentStage?.roles || [])
    .filter((r) => r.is_required)
    .map((r) => ROLE_LABELS[r.role_key] || r.role_key);

  return (
    <div
      style={{
        padding: 'var(--spacing-md) var(--spacing-lg)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid rgba(59,130,246,0.3)',
        backgroundColor: 'rgba(59,130,246,0.08)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--spacing-sm)',
        marginBottom: 'var(--spacing-lg)',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-lg)' }}>👁️</span>
      <div style={{ flex: 1 }}>
        <p
          style={{
            margin: '0 0 4px',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-info)',
          }}
        >
          Read-only view
        </p>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
          }}
        >
          You are viewing as <strong>{ROLE_LABELS[actingRole] || actingRole || 'Guest'}</strong>.
          {requiredRoles.length > 0 && (
            <>
              {' '}
              This stage requires one of: <strong>{requiredRoles.join(', ')}</strong>.
            </>
          )}{' '}
          {!isSystemAdmin && (
            <>
              To review as another role, switch in{' '}
              <Link
                href="/account"
                style={{ color: 'var(--color-accent-purple, #7c3aed)', textDecoration: 'none' }}
              >
                Account → Settings
              </Link>
              .
            </>
          )}
        </p>
      </div>
    </div>
  );
}

// ─── Review status footer ───────────────────────────────────────────────────
//
// Shows the current stage as a *milestone*: a set of parallel reviews (some
// required, some optional) that all gate the transition to the next stage.
// When every required review is complete, the "advance" edge lights up.

function ReviewStatusFooter({ currentStage, reviewStatus, onAdvance, advancing }) {
  if (!reviewStatus || !currentStage) return null;

  const stageKeys = matchingAssignmentKeys(currentStage);
  const stageAssignments = (reviewStatus.assignments || []).filter((a) => stageKeys.has(a.stage));

  if (stageAssignments.length === 0 && !reviewStatus.gating_rules_met) return null;

  // Required vs optional is driven by the workflow snapshot — each stage role
  // carries an `is_required` flag. An assignment is required iff its reviewer
  // role is flagged required on this stage.
  const requiredRoleKeys = new Set(
    (currentStage.roles || []).filter((r) => r.is_required).map((r) => r.role_key)
  );
  const isRequired = (assignment) => requiredRoleKeys.has(assignment.reviewer_role);
  const isComplete = (assignment) =>
    assignment.decision === 'approved' ||
    assignment.decision === 'approved-with-conditions' ||
    assignment.status === 'completed';

  const requiredAssignments = stageAssignments.filter(isRequired);
  const optionalAssignments = stageAssignments.filter((a) => !isRequired(a));
  const requiredComplete = requiredAssignments.filter(isComplete).length;
  const requiredTotal = requiredAssignments.length;
  const progressPct = requiredTotal > 0 ? (requiredComplete / requiredTotal) * 100 : 0;

  return (
    <div className="card" style={{ padding: 'var(--spacing-lg) var(--spacing-xl)' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 'var(--spacing-sm)',
          gap: 'var(--spacing-md)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h4
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            {currentStage.display_name}{' '}
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-normal)',
                color: 'var(--color-text-tertiary)',
                marginLeft: '6px',
              }}
            >
              milestone
            </span>
          </h4>
          {requiredTotal > 0 ? (
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {requiredComplete} of {requiredTotal} required review
              {requiredTotal === 1 ? '' : 's'} complete
              {optionalAssignments.length > 0 && (
                <>
                  {' '}
                  · {optionalAssignments.length} optional review
                  {optionalAssignments.length === 1 ? '' : 's'}
                </>
              )}
            </p>
          ) : (
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
              }}
            >
              No required reviews on this stage.
            </p>
          )}
        </div>
        {reviewStatus.gating_rules_met && (
          <button className="btn btn-primary btn-sm" onClick={onAdvance} disabled={advancing}>
            {advancing ? 'Advancing…' : 'Advance to next stage →'}
          </button>
        )}
      </div>

      {/* Progress bar for required reviews */}
      {requiredTotal > 0 && (
        <div
          style={{
            height: '4px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-bg-tertiary)',
            overflow: 'hidden',
            marginBottom: 'var(--spacing-md)',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              backgroundColor:
                progressPct === 100
                  ? 'var(--color-success)'
                  : 'var(--color-accent-purple, #7c3aed)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      )}

      {/* Assignment pills, grouped as required then optional */}
      {stageAssignments.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-sm)',
            flexWrap: 'wrap',
          }}
        >
          {[...requiredAssignments, ...optionalAssignments].map((a, i) => {
            const required = isRequired(a);
            const decisionColor =
              a.decision === 'approved' || a.decision === 'approved-with-conditions'
                ? 'var(--color-success)'
                : a.decision === 'rejected'
                  ? 'var(--color-error)'
                  : a.status === 'in_progress'
                    ? 'var(--color-warning)'
                    : 'var(--color-text-tertiary)';
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: `1px solid ${
                    required ? 'var(--color-border-default)' : 'var(--color-border-subtle)'
                  }`,
                  backgroundColor: required ? 'transparent' : 'var(--color-bg-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  opacity: required ? 1 : 0.85,
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: decisionColor,
                    flexShrink: 0,
                  }}
                />
                <span style={{ color: 'var(--color-text-primary)' }}>{a.display_name}</span>
                <span style={{ color: 'var(--color-text-tertiary)' }}>
                  {a.decision ? a.decision.replace(/-/g, ' ') : a.status.replace(/_/g, ' ')}
                </span>
                <span
                  style={{
                    fontSize: '9px',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-full)',
                    marginLeft: '2px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                    fontWeight: 'var(--font-weight-semibold)',
                    backgroundColor: required ? 'rgba(124,58,237,0.1)' : 'var(--color-bg-tertiary)',
                    color: required
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-text-tertiary)',
                  }}
                >
                  {required ? 'required' : 'optional'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!reviewStatus.gating_rules_met && reviewStatus.outstanding_requirements?.length > 0 && (
        <div
          style={{
            marginTop: 'var(--spacing-md)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Outstanding: {reviewStatus.outstanding_requirements.join(' · ')}
        </div>
      )}
    </div>
  );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  const [sow, setSow] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [checklist, setChecklist] = useState(null);
  const [responses, setResponses] = useState([]);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [comments, setComments] = useState('');
  const [contentTab, setContentTab] = useState('Overview');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [runningAI, setRunningAI] = useState(false);
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions' | 'send-back'
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  // Bumped after any action that could mutate workflow progression. Passed to
  // <WorkflowProgress> so it re-fetches its internal workflow snapshot / COA
  // summary / attachment requirements. Stays away from checklist state.
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Re-pulls the SoW record + review status so the phase tracker reflects the
  // latest progression. CRITICAL: does NOT touch checklist or responses — that
  // was the source of the old "save cycles to next reviewer" bug. Bumps
  // progressRefreshKey so <WorkflowProgress> re-fetches its internal snapshot,
  // COA summary, and attachment requirements.
  const refreshProgress = useCallback(async () => {
    if (!id) return;
    try {
      const [sowRes, statusRes] = await Promise.all([
        authFetch(`/api/sow/${id}`),
        authFetch(`/api/review/${id}/status`),
      ]);
      if (sowRes.ok) {
        const fresh = await sowRes.json();
        setSow(fresh);
        // If the backend auto-advanced us into a terminal state, bounce to the
        // dedicated page instead of sitting on a stale review surface.
        const redirect = TERMINAL_STATUSES_REDIRECT[fresh.status];
        if (redirect) {
          router.replace(redirect(id));
          return;
        }
      }
      if (statusRes.ok) setReviewStatus(await statusRes.json());
      setProgressRefreshKey((k) => k + 1);
    } catch {
      // Non-fatal — the user can still act; the tracker will catch up on the
      // next action or manual refresh.
    }
  }, [id, authFetch, router]);

  // ── Resolve the current workflow stage ─────────────────────────────────
  const currentStage = useMemo(() => {
    if (!workflow || !sow) return null;
    const stages = workflow.workflow_data?.stages || [];
    return stages.find((s) => s.stage_key === sow.status) || null;
  }, [workflow, sow]);

  // ── Role & assignment gating ───────────────────────────────────────────
  const actingRole = user?.role || null;
  const isSystemAdmin = actingRole === 'system-admin';

  const stageAssignments = useMemo(() => {
    if (!currentStage || !reviewStatus) return [];
    const keys = matchingAssignmentKeys(currentStage);
    return (reviewStatus.assignments || []).filter((a) => keys.has(a.stage));
  }, [currentStage, reviewStatus]);

  const myAssignment = useMemo(() => {
    if (!actingRole) return null;
    return (
      stageAssignments.find((a) => a.reviewer_role === actingRole && a.status !== 'completed') ||
      stageAssignments.find((a) => a.reviewer_role === actingRole) ||
      null
    );
  }, [stageAssignments, actingRole]);

  const canReview = isSystemAdmin || !!myAssignment;
  const isMyReviewDone = myAssignment?.status === 'completed';

  // Send-back target options: any earlier non-failure stage + draft.
  const sendBackTargets = useMemo(() => {
    if (!workflow || !currentStage) return [{ stage_key: 'draft', display_name: 'Draft' }];
    const stages = workflow.workflow_data?.stages || [];
    const earlier = stages
      .filter((s) => !isFailureBranch(s) && !isTerminalStage(s))
      .filter((s) => (s.stage_order ?? 0) < (currentStage.stage_order ?? 0))
      .sort((a, b) => b.stage_order - a.stage_order);
    const seen = new Set(earlier.map((s) => s.stage_key));
    const targets = earlier.map((s) => ({
      stage_key: s.stage_key,
      display_name: s.display_name,
    }));
    if (!seen.has('draft')) targets.push({ stage_key: 'draft', display_name: 'Draft' });
    return targets;
  }, [workflow, currentStage]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!id || !user) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sowRes, workflowRes, checklistRes, statusRes] = await Promise.all([
          authFetch(`/api/sow/${id}`),
          authFetch(`/api/workflow/sow/${id}`),
          authFetch(`/api/review/${id}/checklist`),
          authFetch(`/api/review/${id}/status`),
        ]);

        if (cancelled) return;

        if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
        const sowData = await sowRes.json();

        // Terminal statuses belong on dedicated pages.
        const redirect = TERMINAL_STATUSES_REDIRECT[sowData.status];
        if (redirect) {
          router.replace(redirect(id));
          return;
        }

        setSow(sowData);

        if (workflowRes.ok) {
          setWorkflow(await workflowRes.json());
        }

        if (checklistRes.ok) {
          const checkData = await checklistRes.json();
          setChecklist(checkData);
          setResponses(checkData.saved_responses || []);
        } else if (checklistRes.status !== 403 && checklistRes.status !== 404) {
          throw new Error(`Checklist load failed (${checklistRes.status})`);
        }

        if (statusRes.ok) {
          setReviewStatus(await statusRes.json());
        }

        if (sowData.ai_suggestion_id) {
          const aiRes = await authFetch(`/api/sow/${id}/ai-analyze`);
          if (aiRes.ok) setAiAnalysis(await aiRes.json());
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id, user, authFetch, router]);

  // ── Save progress ─────────────────────────────────────────────────────
  // Does NOT touch local checklist/responses (the old cycling-bug fix), but
  // DOES refresh the SoW status + assignments so the phase tracker reflects
  // the reviewer transitioning from pending → in_progress.
  async function handleSaveProgress() {
    if (!canReview) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/review/${id}/save-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist_responses: responses,
          comments,
          // Sent so the backend can scope the save to this specific role once
          // Phase 1 lands. Harmless today — backend currently ignores it.
          role: actingRole,
        }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Progress saved');
      await refreshProgress();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Submit decision (refreshes review status only — never checklist) ───
  async function handleSubmitDecision(decision, extras = {}) {
    if (!canReview) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          checklist_responses: responses,
          comments: extras.comments || comments || null,
          conditions: extras.conditions || null,
          role: actingRole,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Submission failed (${res.status})`);
      }
      setModal(null);
      showToast(
        decision === 'rejected' ? 'SoW returned to draft' : 'Review submitted successfully'
      );

      // Refresh SoW + status so the phase tracker advances / shows the new
      // decision. Deliberately leaves checklist/responses alone.
      await refreshProgress();

      if (decision === 'rejected') {
        setTimeout(() => router.push('/my-reviews'), 1500);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Send back to an earlier stage ──────────────────────────────────────
  async function handleSendBack({ target_stage, comments: sendComments, action_items }) {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/${id}/send-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_stage,
          comments: sendComments,
          action_items,
          role: actingRole,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Send-back failed (${res.status})`);
      }
      setModal(null);
      showToast('SoW sent back for revision');
      setTimeout(() => router.push('/my-reviews'), 1200);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Advance to next stage ──────────────────────────────────────────────
  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await authFetch(`/api/review/${id}/advance`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Advance failed (${res.status})`);
      }
      showToast('Advanced to next stage');
      // Targeted refresh instead of a full page reload — keeps the checklist
      // panel state intact and just moves the phase tracker forward.
      await refreshProgress();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAdvancing(false);
    }
  }

  // ── Run AI analysis ─────────────────────────────────────────────────────
  async function handleRunAI() {
    setRunningAI(true);
    try {
      const res = await authFetch(`/api/sow/${id}/ai-analyze`, { method: 'POST' });
      if (!res.ok) throw new Error('AI analysis failed');
      setAiAnalysis(await res.json());
      showToast('AI analysis complete');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRunningAI(false);
    }
  }

  // ── Approval gating ─────────────────────────────────────────────────────
  const requiredItems = checklist?.items?.filter((i) => i.required) || [];
  const checkedRequired = requiredItems.filter((i) =>
    responses.find((r) => r.id === i.id && r.checked)
  );
  const canApprove = requiredItems.length === 0 || checkedRequired.length === requiredItems.length;

  // ── Loading / error states ──────────────────────────────────────────────
  if (!user || loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-error)', marginBottom: 'var(--spacing-md)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => router.push('/my-reviews')}>
          ← Back to My Reviews
        </button>
      </div>
    );
  }

  const esapStyle = esapBadgeStyle(sow?.esap_level);
  const stageLabel = currentStage?.display_name || sow?.status?.replace(/_/g, ' ') || 'Review';
  const stageType = currentStage?.stage_type || 'review';
  const showChecklist =
    canReview && checklist && (stageType === 'review' || stageType === 'approval');

  return (
    <>
      <Head>
        <title>
          {stageLabel} — {sow?.title || 'SoW'} · Cocoon
        </title>
      </Head>

      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 2000,
            padding: 'var(--spacing-sm) var(--spacing-xl)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: toast.type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
            color: '#fff',
            fontWeight: 'var(--font-weight-semibold)',
            fontSize: 'var(--font-size-sm)',
            boxShadow: 'var(--shadow-xl)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {modal === 'rejected' && (
        <DecisionModal
          type="rejected"
          onClose={() => setModal(null)}
          onSubmit={(extras) => handleSubmitDecision('rejected', extras)}
          submitting={submitting}
        />
      )}
      {modal === 'approved-with-conditions' && (
        <DecisionModal
          type="approved-with-conditions"
          onClose={() => setModal(null)}
          onSubmit={(extras) => handleSubmitDecision('approved-with-conditions', extras)}
          submitting={submitting}
        />
      )}
      {modal === 'send-back' && (
        <SendBackModal
          availableStages={sendBackTargets}
          onClose={() => setModal(null)}
          onSubmit={handleSendBack}
          submitting={submitting}
        />
      )}

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          <Link
            href="/my-reviews"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
              marginBottom: 'var(--spacing-lg)',
            }}
          >
            ← Back to My Reviews
          </Link>

          {/* Header card */}
          <div
            className="card"
            style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-lg) var(--spacing-xl)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                flexWrap: 'wrap',
                gap: 'var(--spacing-sm)',
              }}
            >
              <div>
                <h1
                  style={{
                    margin: '0 0 var(--spacing-xs)',
                    fontSize: 'var(--font-size-2xl)',
                    fontWeight: 'var(--font-weight-bold)',
                  }}
                >
                  {sow?.title}
                </h1>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-lg)',
                    flexWrap: 'wrap',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {sow?.customer_name && <span>Customer: {sow.customer_name}</span>}
                  {sow?.methodology && <span>Methodology: {sow.methodology}</span>}
                  {sow?.deal_value && <span>Deal: {formatDeal(sow.deal_value)}</span>}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                {sow?.esap_level && (
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      ...esapStyle,
                    }}
                  >
                    {sow.esap_level.toUpperCase()}
                  </span>
                )}
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    backgroundColor: 'rgba(124,58,237,0.1)',
                    color: 'var(--color-accent-purple, #7c3aed)',
                    textTransform: 'capitalize',
                  }}
                  title={`Stage type: ${stageType}`}
                >
                  {stageLabel}
                </span>
              </div>
            </div>
          </div>

          {/* Phase tracker — dynamic, driven by workflow snapshot */}
          <div
            className="card"
            style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-md) var(--spacing-xl)',
            }}
          >
            <WorkflowProgress
              sowId={sow?.id}
              currentStage={sow?.status}
              reviewAssignments={reviewStatus?.assignments || []}
              refreshKey={progressRefreshKey}
            />
          </div>

          {/* Observer banner for users without an assignment at this stage */}
          {!canReview && (
            <ObserverBanner
              actingRole={actingRole}
              currentStage={currentStage}
              isSystemAdmin={isSystemAdmin}
            />
          )}

          {/* Two-column body */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: showChecklist ? '3fr 2fr' : '1fr',
              gap: 'var(--spacing-lg)',
              alignItems: 'start',
              marginBottom: 'var(--spacing-lg)',
            }}
          >
            {/* Left: SoW content (read-only) */}
            <div
              className="card"
              style={{
                padding: 0,
                overflow: 'hidden',
                minHeight: '500px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  padding: 'var(--spacing-md) var(--spacing-xl)',
                  borderBottom: '1px solid var(--color-border-default)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-secondary)',
                  flexShrink: 0,
                }}
              >
                SoW Content{' '}
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'normal',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  (read-only)
                </span>
              </div>
              <div style={{ flex: 1 }}>
                <SoWContentPanel sow={sow} activeTab={contentTab} onTabChange={setContentTab} />
              </div>
            </div>

            {/* Right: review panel (only if the viewer can review) */}
            {showChecklist && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {/* Role card */}
                <div className="card" style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                  <p
                    style={{
                      margin: '0 0 2px',
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Your role
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 'var(--font-weight-semibold)',
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {checklist.display_name || ROLE_LABELS[actingRole] || actingRole}
                    {isSystemAdmin && (
                      <span
                        style={{
                          marginLeft: 8,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'rgba(124,58,237,0.1)',
                          color: 'var(--color-accent-purple, #7c3aed)',
                          fontSize: '10px',
                          fontWeight: 'var(--font-weight-semibold)',
                          letterSpacing: '0.3px',
                          textTransform: 'uppercase',
                        }}
                      >
                        ★ Admin
                      </span>
                    )}
                  </p>
                  {checklist.focus_areas?.length > 0 && (
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px',
                        marginTop: 'var(--spacing-xs)',
                      }}
                    >
                      {checklist.focus_areas.map((fa, i) => (
                        <span
                          key={i}
                          style={{
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: 'var(--color-bg-tertiary)',
                            border: '1px solid var(--color-border-default)',
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          {fa}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Checklist */}
                <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                  <h4
                    style={{
                      margin: '0 0 var(--spacing-md)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    Review Checklist
                  </h4>
                  <ReviewChecklist
                    items={checklist.items}
                    responses={responses}
                    onChange={setResponses}
                    readOnly={isMyReviewDone}
                  />
                </div>

                {/* AI suggestions */}
                <AISuggestionsPanel
                  analysisResult={aiAnalysis}
                  collapsed={true}
                  showRunButton={true}
                  onRunAnalysis={handleRunAI}
                  loading={runningAI}
                />

                {/* Comments — editable only before submission */}
                {!isMyReviewDone && (
                  <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 'var(--font-weight-semibold)',
                        marginBottom: 'var(--spacing-xs)',
                      }}
                    >
                      Comments
                    </label>
                    <textarea
                      value={comments}
                      onChange={(e) => setComments(e.target.value)}
                      placeholder="Add overall comments for this review…"
                      rows={3}
                      style={{
                        width: '100%',
                        padding: 'var(--spacing-sm)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-default)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--font-size-sm)',
                        fontFamily: 'inherit',
                        resize: 'vertical',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Action buttons */}
                {!isMyReviewDone ? (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacing-sm)',
                    }}
                  >
                    <button
                      className="btn btn-secondary"
                      onClick={handleSaveProgress}
                      disabled={saving}
                      title="Saves your current checklist without submitting your decision"
                    >
                      {saving ? 'Saving…' : 'Save Progress'}
                    </button>

                    <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                      <button
                        className="btn btn-primary"
                        style={{ flex: 1 }}
                        onClick={() => handleSubmitDecision('approved')}
                        disabled={!canApprove || submitting}
                        title={
                          !canApprove
                            ? `Check all required items first (${checkedRequired.length}/${requiredItems.length})`
                            : ''
                        }
                      >
                        Approve ✓
                      </button>
                      <button
                        className="btn btn-secondary"
                        style={{
                          flex: 1,
                          color: 'var(--color-error)',
                          borderColor: 'var(--color-error)',
                        }}
                        onClick={() => setModal('rejected')}
                        disabled={submitting}
                      >
                        Reject ✗
                      </button>
                    </div>

                    <button
                      className="btn btn-secondary"
                      onClick={() => setModal('approved-with-conditions')}
                      disabled={!canApprove || submitting}
                    >
                      Approve with Conditions
                    </button>

                    {sendBackTargets.length > 0 && (
                      <button
                        className="btn btn-sm"
                        onClick={() => setModal('send-back')}
                        disabled={submitting}
                        style={{
                          backgroundColor: 'rgba(245,158,11,0.1)',
                          color: 'var(--color-warning)',
                          border: '1px solid rgba(245,158,11,0.3)',
                          borderRadius: 'var(--radius-md)',
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        Send Back to Earlier Stage
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    style={{
                      padding: 'var(--spacing-md)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(74,222,128,0.1)',
                      border: '1px solid rgba(74,222,128,0.3)',
                      textAlign: 'center',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-success)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    ✓ Your review is complete
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Review status footer — always visible */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <ReviewStatusFooter
              currentStage={currentStage}
              reviewStatus={reviewStatus}
              onAdvance={handleAdvance}
              advancing={advancing}
            />
          </div>

          {/* Attachments for the current stage */}
          {sow && currentStage && (
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
              <AttachmentManager
                sowId={sow.id}
                stageKey={currentStage.stage_key}
                readOnly={!canReview}
                showRequirements={true}
                authFetch={authFetch}
              />
            </div>
          )}

          {/* Conditions of Approval */}
          {sow && (
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 0 }}>
                Conditions of Approval
              </h3>
              <COATracker
                sowId={sow.id}
                authFetch={authFetch}
                readOnly={!canReview}
                onStatusChange={() => {}}
              />
            </div>
          )}

          {/* Activity Log */}
          {sow && (
            <div className="card">
              <h3
                style={{
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 600,
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                Activity Log
              </h3>
              <ActivityLog sowId={sow.id} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
