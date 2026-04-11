/**
 * pages/review/assignment/[assignmentId].js
 *
 * Assignment-scoped review page. Mirrors /review/[id].js but is keyed by
 * `review_assignments.id` instead of by SoW id.  This is the surface that
 * lets a single user holding *multiple* role assignments on the same SoW
 * (e.g. a system-admin walking the pipeline solo, or a user designated for
 * two roles) review each one independently — every assignment has its own
 * URL, its own checklist, and its own status.
 *
 * Key differences vs /review/[id].js
 * ──────────────────────────────────
 *  • The route param is the assignment id.
 *  • The first fetch is `/api/review/assignment/{assignmentId}/checklist`,
 *    which returns the SoW id, the reviewer role, and the assignment status.
 *  • `actingRole` comes from the assignment, not from `user.role`.  This is
 *    the central fix: a user with multiple roles on the same SoW now sees
 *    a different acting role per URL even though `user.role` never changes.
 *  • Save/submit POST to `/api/review/assignment/{assignmentId}/...`, which
 *    keys all writes off the assignment row id (no more `(sow_id, user_id)`
 *    LIMIT 1 lookups).
 *  • `canReview` is true iff the assignment belongs to the user OR the user
 *    is a system-admin.  Read-only when `assignment_status === 'completed'`.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../../lib/auth';
import Spinner from '../../../components/Spinner';
import ReviewChecklist from '../../../components/ReviewChecklist';
import AISuggestionsPanel from '../../../components/AISuggestionsPanel';
import WorkflowProgress from '../../../components/WorkflowProgress';
import COATracker from '../../../components/COATracker';
import AttachmentManager from '../../../components/AttachmentManager';
import ActivityLog from '../../../components/ActivityLog';
import { formatDeal, esapBadgeStyle } from '../../../lib/format';

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

const TERMINAL_STATUSES_REDIRECT = {
  approved: (id) => `/finalize/${id}`,
  finalized: (id) => `/finalize/${id}`,
  draft: (id) => `/draft/${id}`,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── Decision modal ─────────────────────────────────────────────────────────

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

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AssignmentReviewPage() {
  const router = useRouter();
  const { assignmentId } = router.query;
  const { user, authFetch } = useAuth();

  // The full checklist response also acts as our "assignment" record — it
  // carries assignment_id, sow_id, user_id, reviewer_role, stage, status.
  const [checklist, setChecklist] = useState(null);
  const [sow, setSow] = useState(null);
  const [workflow, setWorkflow] = useState(null);
  const [responses, setResponses] = useState([]);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [comments, setComments] = useState('');
  const [contentTab, setContentTab] = useState('Overview');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningAI, setRunningAI] = useState(false);
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions'
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [activeReviewTab, setActiveReviewTab] = useState('review');
  const [coaSummary, setCoaSummary] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const sowId = checklist?.sow_id;

  // Re-pull SoW + review status without touching checklist state.
  const refreshProgress = useCallback(async () => {
    if (!sowId) return;
    try {
      const [sowRes, statusRes] = await Promise.all([
        authFetch(`/api/sow/${sowId}`),
        authFetch(`/api/review/${sowId}/status`),
      ]);
      if (sowRes.ok) {
        const fresh = await sowRes.json();
        setSow(fresh);
        const redirect = TERMINAL_STATUSES_REDIRECT[fresh.status];
        if (redirect) {
          router.replace(redirect(sowId));
          return;
        }
      }
      if (statusRes.ok) setReviewStatus(await statusRes.json());
      setProgressRefreshKey((k) => k + 1);
    } catch {
      // Non-fatal
    }
  }, [sowId, authFetch, router]);

  // ── COA summary for tab badge ──────────────────────────────────────────
  useEffect(() => {
    if (!sowId) return;
    let cancelled = false;
    authFetch(`/api/coa/sow/${sowId}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCoaSummary(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sowId, progressRefreshKey, authFetch]);

  // ── Initial load: checklist (assignment-scoped) → sow + workflow + status ─
  useEffect(() => {
    if (!assignmentId || !user) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        // Load the assignment-scoped checklist first.  Its response includes
        // sow_id, user_id, reviewer_role, stage, and status — everything we
        // need to drive the rest of the page.
        const checklistRes = await authFetch(`/api/review/assignment/${assignmentId}/checklist`);
        if (cancelled) return;

        if (checklistRes.status === 404) {
          throw new Error('Assignment not found or you do not have access.');
        }
        if (!checklistRes.ok) {
          throw new Error(`Checklist load failed (${checklistRes.status})`);
        }
        const checkData = await checklistRes.json();
        setChecklist(checkData);
        setResponses(checkData.saved_responses || []);

        const loadedSowId = checkData.sow_id;

        // Now fan out to the SoW, workflow snapshot, and review status.
        const [sowRes, workflowRes, statusRes] = await Promise.all([
          authFetch(`/api/sow/${loadedSowId}`),
          authFetch(`/api/workflow/sow/${loadedSowId}`),
          authFetch(`/api/review/${loadedSowId}/status`),
        ]);
        if (cancelled) return;

        if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
        const sowData = await sowRes.json();

        const redirect = TERMINAL_STATUSES_REDIRECT[sowData.status];
        if (redirect) {
          router.replace(redirect(loadedSowId));
          return;
        }

        setSow(sowData);

        if (workflowRes.ok) {
          setWorkflow(await workflowRes.json());
        }
        if (statusRes.ok) {
          setReviewStatus(await statusRes.json());
        }

        if (sowData.ai_suggestion_id) {
          const aiRes = await authFetch(`/api/sow/${loadedSowId}/ai-analyze`);
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
  }, [assignmentId, user, authFetch, router]);

  // ── Resolve the current workflow stage from the SoW status ─────────────
  //
  // When the SoW sits on a ``parallel_gateway``, ``sow.status`` points at
  // the gateway — not the branch this assignment is actually reviewing. In
  // that case we reverse-map ``checklist.stage`` (the hyphenated assignment
  // stage) to the matching branch in the workflow and return **that**
  // stage config so the UI reads reviewer instructions, checklist keys,
  // and the out-of-stage banner from the correct branch.
  const currentStage = useMemo(() => {
    if (!workflow || !sow) return null;
    const stages = workflow.workflow_data?.stages || [];
    const gatewayStage = stages.find((s) => s.stage_key === sow.status) || null;
    if (gatewayStage?.stage_type === 'parallel_gateway' && checklist?.stage) {
      const branchMatch = stages.find((s) => matchingAssignmentKeys(s).has(checklist.stage));
      if (branchMatch) return branchMatch;
    }
    return gatewayStage;
  }, [workflow, sow, checklist]);

  // ── Role & assignment gating (assignment-scoped) ───────────────────────
  // The "acting role" is the role on this specific assignment, NOT the
  // user's logged-in role.  This is the central fix that lets one user
  // hold multiple roles on the same SoW without state collisions.
  const actingRole = checklist?.reviewer_role || null;
  const isSystemAdmin = user?.role === 'system-admin';
  const ownsAssignment = checklist?.user_id === user?.id;
  const canReview = isSystemAdmin || ownsAssignment;
  const isMyReviewDone = checklist?.assignment_status === 'completed';
  const isStageCurrent =
    currentStage && checklist && matchingAssignmentKeys(currentStage).has(checklist.stage);

  // ── Save progress (assignment-scoped) ──────────────────────────────────
  async function handleSaveProgress() {
    if (!canReview) return;
    setSaving(true);
    try {
      const res = await authFetch(`/api/review/assignment/${assignmentId}/save-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist_responses: responses,
          comments,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || 'Save failed');
      }
      showToast('Progress saved');
      await refreshProgress();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Submit decision (assignment-scoped) ────────────────────────────────
  async function handleSubmitDecision(decision, extras = {}) {
    if (!canReview) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/assignment/${assignmentId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          checklist_responses: responses,
          comments: extras.comments || comments || null,
          conditions: extras.conditions || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Submission failed (${res.status})`);
      }
      const resBody = await res.json().catch(() => ({}));
      setModal(null);

      // Mark this assignment as completed locally so the UI immediately
      // flips to read-only and shows the success card.
      setChecklist((prev) => (prev ? { ...prev, assignment_status: 'completed', decision } : prev));

      if (resBody.auto_advanced) {
        showToast('Review submitted — automatically advanced to next stage');
        setTimeout(() => router.push('/my-reviews'), 1500);
        return;
      }

      if (resBody.parallel_branch_completed) {
        showToast('Your branch review is complete. Waiting for other parallel branches.');
        await refreshProgress();
        return;
      }

      showToast(
        decision === 'rejected' ? 'SoW returned to draft' : 'Review submitted successfully'
      );

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

  // ── Run AI analysis ─────────────────────────────────────────────────────
  async function handleRunAI() {
    if (!sowId) return;
    setRunningAI(true);
    try {
      const res = await authFetch(`/api/sow/${sowId}/ai-analyze`, { method: 'POST' });
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

  // Tab definitions with dynamic badge counts.
  const coaOpen = coaSummary?.open ?? 0;
  const coaTotal = coaSummary?.total ?? 0;
  const REVIEW_TABS = [
    { key: 'review', label: 'Review' },
    { key: 'attachments', label: 'Attachments' },
    {
      key: 'conditions',
      label: 'Conditions',
      badge: coaTotal > 0 ? `${coaOpen} open` : null,
    },
    { key: 'activity', label: 'Activity' },
  ];

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

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Sticky top section ──────────────────────────────────────── */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            backgroundColor: 'var(--color-bg-primary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-md) var(--spacing-xl) 0',
          }}
        >
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Compact header row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  minWidth: 0,
                }}
              >
                <Link
                  href="/my-reviews"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-tertiary)',
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  ←
                </Link>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-lg)',
                    fontWeight: 'var(--font-weight-bold)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {sow?.title}
                </h1>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-sm)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    flexShrink: 0,
                  }}
                >
                  {sow?.customer_name && <span>{sow.customer_name}</span>}
                  {sow?.deal_value && <span>· {formatDeal(sow.deal_value)}</span>}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-sm)',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                {sow?.esap_level && (
                  <span
                    style={{
                      padding: '3px 10px',
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
                    padding: '3px 10px',
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

            {/* Phase tracker */}
            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <WorkflowProgress
                sowId={sow?.id}
                currentStage={sow?.status}
                reviewAssignments={reviewStatus?.assignments || []}
                refreshKey={progressRefreshKey}
              />
            </div>

            {/* Tab bar */}
            <div
              style={{
                display: 'flex',
                gap: '2px',
                marginTop: 'var(--spacing-sm)',
              }}
            >
              {REVIEW_TABS.map((tab) => {
                const active = activeReviewTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveReviewTab(tab.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 16px',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: active ? 'var(--font-weight-semibold)' : 'normal',
                      color: active
                        ? 'var(--color-accent-purple, #7c3aed)'
                        : 'var(--color-text-secondary)',
                      borderBottom: active
                        ? '2px solid var(--color-accent-purple, #7c3aed)'
                        : '2px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {tab.label}
                    {tab.badge && (
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: active
                            ? 'rgba(124,58,237,0.1)'
                            : 'var(--color-bg-tertiary)',
                          color: active
                            ? 'var(--color-accent-purple, #7c3aed)'
                            : 'var(--color-text-tertiary)',
                          fontWeight: 'var(--font-weight-semibold)',
                        }}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Tab content ──────────────────────────────────────────────── */}
        <div style={{ flex: 1, padding: 'var(--spacing-xl)' }}>
          <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* ── Review tab ─────────────────────────────────────────── */}
            {activeReviewTab === 'review' && (
              <>
                {/* Out-of-stage banner: assignment is for an earlier stage that
                    has already been advanced past. The user can still see what
                    they did but can't make changes. */}
                {!isStageCurrent && checklist && currentStage && (
                  <div
                    style={{
                      padding: 'var(--spacing-md) var(--spacing-lg)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      backgroundColor: 'rgba(245,158,11,0.08)',
                      marginBottom: 'var(--spacing-lg)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    This assignment is for the <strong>{checklist.stage}</strong> stage. The SoW has
                    since moved to <strong>{currentStage.display_name}</strong>.
                  </div>
                )}

                {/* Reviewer instructions */}
                {currentStage?.config?.reviewer_instructions && (
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--spacing-sm)',
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      marginBottom: 'var(--spacing-lg)',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--color-info-border, #93c5fd)',
                      backgroundColor: 'var(--color-info-bg, #eff6ff)',
                      color: 'var(--color-info-text, #1e40af)',
                      fontSize: 'var(--text-sm)',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>ℹ</span>
                    <span>{currentStage.config.reviewer_instructions}</span>
                  </div>
                )}

                {/* Two-column body */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: showChecklist ? '3fr 2fr' : '1fr',
                    gap: 'var(--spacing-lg)',
                    alignItems: 'start',
                  }}
                >
                  {/* Left: SoW content */}
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
                      <SoWContentPanel
                        sow={sow}
                        activeTab={contentTab}
                        onTabChange={setContentTab}
                      />
                    </div>
                  </div>

                  {/* Right: review panel */}
                  {showChecklist && (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--spacing-md)',
                      }}
                    >
                      {/* Role card */}
                      <div
                        className="card"
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                      >
                        <p
                          style={{
                            margin: '0 0 2px',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-tertiary)',
                          }}
                        >
                          Reviewing as
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
                            {checklist.focus_areas.map((fa, idx) => (
                              <span
                                key={idx}
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

                      {/* Comments */}
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
                            placeholder="Add overall comments for this review..."
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
                            {saving ? 'Saving...' : 'Save Progress'}
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
                          {checklist?.decision && (
                            <div
                              style={{
                                marginTop: '4px',
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'normal',
                                color: 'var(--color-text-tertiary)',
                              }}
                            >
                              Decision: {checklist.decision.replace(/-/g, ' ')}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Attachments tab ────────────────────────────────────── */}
            {activeReviewTab === 'attachments' && sow && currentStage && (
              <AttachmentManager
                sowId={sow.id}
                stageKey={currentStage.stage_key}
                readOnly={!canReview}
                showRequirements={true}
                authFetch={authFetch}
              />
            )}

            {/* ── Conditions tab ─────────────────────────────────────── */}
            {activeReviewTab === 'conditions' && sow && (
              <COATracker
                sowId={sow.id}
                authFetch={authFetch}
                readOnly={!canReview}
                onStatusChange={() => setProgressRefreshKey((k) => k + 1)}
              />
            )}

            {/* ── Activity tab ───────────────────────────────────────── */}
            {activeReviewTab === 'activity' && sow && (
              <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                <ActivityLog sowId={sow.id} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
