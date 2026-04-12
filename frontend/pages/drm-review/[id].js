/**
 * pages/drm-review/[id].js
 *
 * Step 3 — DRM Review page for CPL, CDP, and Delivery Manager reviewers.
 *
 * Layout:
 *   Top:    Back link + SoW header + WorkflowProgress
 *   Banner: Internal Review Results (SA/SQA decisions and conditions)
 *   Body:   Two-column split
 *     Left  (55%) — PersonaDashboard (role-specific summary)
 *     Right (45%) — ReviewChecklist + AISuggestionsPanel + decision actions
 *   Bottom: DRM reviewer status footer
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
import PersonaDashboard from '../../components/PersonaDashboard';
import COATracker from '../../components/COATracker';
import AttachmentManager from '../../components/AttachmentManager';
import ActivityLog from '../../components/ActivityLog';
import DecisionModal from '../../components/review/DecisionModal';
import useAutoRefreshFetch from '../../lib/hooks/useAutoRefreshFetch';
import { formatDeal, esapBadgeStyle } from '../../lib/format';
import { roleLabel, STAGE_KEYS } from '../../lib/workflowStages';
import { aiClient } from '../../lib/ai';
import AIUnavailableBanner from '../../components/AIUnavailableBanner';

const DECISION_COLORS = {
  approved: 'var(--color-success)',
  'approved-with-conditions': 'var(--color-warning)',
  rejected: 'var(--color-error)',
};

const DECISION_ICONS = {
  approved: '✓',
  'approved-with-conditions': '~',
  rejected: '✗',
};

// ── Internal Review Results Banner ────────────────────────────────────────────

function InternalReviewBanner({ reviewStatus }) {
  const [expanded, setExpanded] = useState(false);
  const internal = (reviewStatus?.assignments || []).filter(
    (a) => a.stage === STAGE_KEYS.ASSIGNMENT_INTERNAL_REVIEW && a.status === 'completed'
  );
  if (internal.length === 0) return null;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginBottom: 'var(--spacing-xl)',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: expanded ? '1px solid var(--color-border-default)' : 'none',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          Internal Review Results
        </span>
        <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          {internal.map((a, i) => (
            <span
              key={i}
              style={{
                fontSize: 'var(--font-size-xs)',
                color: DECISION_COLORS[a.decision] || 'var(--color-text-tertiary)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              {DECISION_ICONS[a.decision] || '●'} {a.display_name}
            </span>
          ))}
        </div>
        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </div>

      {expanded && (
        <div
          style={{
            padding: 'var(--spacing-md)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-md)',
          }}
        >
          {internal.map((a, i) => (
            <div
              key={i}
              style={{
                padding: 'var(--spacing-sm) var(--spacing-md)',
                borderRadius: 'var(--radius-md)',
                borderLeft: `3px solid ${DECISION_COLORS[a.decision] || 'var(--color-border-default)'}`,
                backgroundColor: 'var(--color-bg-primary)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  {a.display_name}
                </span>
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: DECISION_COLORS[a.decision] || 'var(--color-text-secondary)',
                    textTransform: 'capitalize',
                  }}
                >
                  {a.decision?.replace(/-/g, ' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Send-Back Modal ───────────────────────────────────────────────────────────

function SendBackModal({ onClose, onSubmit, submitting, availableStages }) {
  const targets =
    availableStages && availableStages.length > 0
      ? availableStages
      : [
          { stage_key: STAGE_KEYS.INTERNAL_REVIEW, display_name: 'Internal Review' },
          { stage_key: STAGE_KEYS.DRAFT, display_name: 'Draft' },
        ];
  const [targetStage, setTargetStage] = useState(
    targets[0]?.stage_key || STAGE_KEYS.INTERNAL_REVIEW
  );
  const [comments, setComments] = useState('');
  const [actionItems, setActionItems] = useState(['']);

  function addItem() {
    setActionItems((a) => [...a, '']);
  }
  function updateItem(i, val) {
    setActionItems((a) => a.map((x, j) => (j === i ? val : x)));
  }
  function removeItem(i) {
    setActionItems((a) => a.filter((_, j) => j !== i));
  }

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
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            {targets.map(({ stage_key: value, display_name: label }) => (
              <button
                key={value}
                onClick={() => setTargetStage(value)}
                style={{
                  flex: 1,
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '2px solid',
                  borderColor:
                    targetStage === value
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-border-default)',
                  backgroundColor:
                    targetStage === value ? 'rgba(124,58,237,0.08)' : 'var(--color-bg-secondary)',
                  color:
                    targetStage === value
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: targetStage === value ? 'var(--font-weight-semibold)' : 'normal',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
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
            Action Items (optional)
          </label>
          {actionItems.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input
                value={item}
                onChange={(e) => updateItem(i, e.target.value)}
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
                  onClick={() => removeItem(i)}
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
            onClick={addItem}
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

// ── DRM Review Status Footer ──────────────────────────────────────────────────

function DrmReviewerStatus({ reviewStatus, currentUserId }) {
  const drm = (reviewStatus?.assignments || []).filter(
    (a) => a.stage === STAGE_KEYS.ASSIGNMENT_DRM_APPROVAL
  );
  if (drm.length === 0) return null;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-md) var(--spacing-xl)',
        backgroundColor: 'var(--color-bg-secondary)',
        marginTop: 'var(--spacing-xl)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          margin: '0 0 var(--spacing-sm)',
        }}
      >
        DRM Review Status
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-lg)' }}>
        {drm.map((a, i) => {
          const color =
            a.decision === 'approved' || a.decision === 'approved-with-conditions'
              ? 'var(--color-success)'
              : a.decision === 'rejected'
                ? 'var(--color-error)'
                : a.status === 'in_progress'
                  ? 'var(--color-warning)'
                  : 'var(--color-text-tertiary)';
          const icon =
            a.decision === 'approved' || a.decision === 'approved-with-conditions'
              ? '✓'
              : a.decision === 'rejected'
                ? '✗'
                : a.status === 'in_progress'
                  ? '●'
                  : '○';
          const statusLabel = a.decision
            ? a.decision.replace(/-/g, ' ')
            : a.status === 'in_progress'
              ? 'In Progress'
              : 'Pending';

          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color, fontSize: '14px' }}>{icon}</span>
              <div>
                <span
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-primary)',
                    fontWeight: 'var(--font-weight-medium)',
                  }}
                >
                  {a.display_name}
                </span>
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color,
                    marginLeft: '6px',
                    textTransform: 'capitalize',
                  }}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DrmReview() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  // Local UI state — checklist responses are mutated by the user, so they
  // live outside the loaded payload (they get re-seeded on every refresh).
  const [responses, setResponses] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [modal, setModal] = useState(null); // null | 'approved' | 'approved-with-conditions' | 'send-back'
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState(null);

  // ── Loader: parallel-fetches sow + checklist + status + workflow ────────
  const load = useCallback(
    async (signal) => {
      const [sowRes, checklistRes, statusRes, wfRes] = await Promise.all([
        authFetch(`/api/sow/${id}`, { signal }),
        authFetch(`/api/review/${id}/checklist`, { signal }),
        authFetch(`/api/review/${id}/status`, { signal }),
        authFetch(`/api/workflow/sow/${id}`, { signal }),
      ]);

      if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
      if (!checklistRes.ok) throw new Error(`Checklist load failed (${checklistRes.status})`);
      if (!statusRes.ok) throw new Error(`Status load failed (${statusRes.status})`);

      const [sowData, checklistData, statusData, wfData] = await Promise.all([
        sowRes.json(),
        checklistRes.json(),
        statusRes.json(),
        wfRes.ok ? wfRes.json() : Promise.resolve(null),
      ]);

      // Reseed checklist responses from the freshly loaded data — this is
      // intentionally outside the returned payload so the hook owns the
      // server state and React owns the user-mutated state.
      setResponses(checklistData.saved_responses || []);

      // Pull cached AI analysis from the canonical endpoint. The previous
      // implementation read sow.ai_suggestion which doesn't exist on the
      // /api/sow/{id} payload, so the panel was always empty.
      const cached = await aiClient.cachedAnalysis(authFetch, id, { signal });
      if (cached.ok) {
        setAiAnalysis(cached.data || null);
        setAiError(null);
      } else {
        setAiError(cached.error);
      }

      return {
        sow: sowData,
        checklistItems: checklistData.items || [],
        checklistRole: checklistData.reviewer_role || '',
        reviewStatus: statusData,
        workflowData: wfData?.workflow_data || null,
      };
    },
    [id, authFetch]
  );

  const {
    data,
    loading,
    error,
    refresh: loadAll,
  } = useAutoRefreshFetch({
    load,
    enabled: Boolean(id && user),
    deps: [id, user],
  });

  const sow = data?.sow ?? null;
  const checklistItems = data?.checklistItems ?? [];
  const checklistRole = data?.checklistRole ?? '';
  const reviewStatus = data?.reviewStatus ?? null;
  const workflowData = data?.workflowData ?? null;

  // Compute send-back targets from workflow on_send_back transitions
  const sendBackTargets = useMemo(() => {
    if (!workflowData || !sow) return null; // null = use modal defaults
    const transitions = workflowData.transitions || [];
    const stages = workflowData.stages || [];
    const stageMap = Object.fromEntries(stages.map((s) => [s.stage_key, s]));
    const targets = transitions
      .filter((t) => t.from_stage === sow.status && t.condition === 'on_send_back')
      .map((t) => ({
        stage_key: t.to_stage,
        display_name: stageMap[t.to_stage]?.display_name || t.to_stage,
      }));
    if (!targets.find((t) => t.stage_key === 'draft')) {
      targets.push({ stage_key: 'draft', display_name: 'Draft' });
    }
    return targets;
  }, [workflowData, sow]);

  // Derive the current workflow stage object
  const currentStage = useMemo(() => {
    if (!workflowData || !sow) return null;
    const stages = workflowData.stages || [];
    return stages.find((s) => s.stage_key === sow.status) || null;
  }, [workflowData, sow]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  // Load DRM summary after initial load — depends on checklistRole being set
  useEffect(() => {
    if (!id || !user || !checklistRole) return;
    const ctrl = new AbortController();
    setSummaryLoading(true);
    authFetch(`/api/review/${id}/drm-summary`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!ctrl.signal.aborted) setSummaryData(d);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setSummaryData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setSummaryLoading(false);
      });
    return () => ctrl.abort();
  }, [id, user, checklistRole, authFetch]);

  async function handleSaveProgress() {
    setSaving(true);
    try {
      const res = await authFetch(`/api/review/${id}/save-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_responses: responses, comments: '' }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Progress saved');
      await loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDecisionSubmit({ decision, comments, conditions }) {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comments, conditions, checklist_responses: responses }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Submit failed (${res.status})`);
      }
      const resBody = await res.json().catch(() => ({}));
      setModal(null);

      if (resBody.auto_advanced) {
        showToast('Review submitted — automatically advanced to next stage');
        setTimeout(() => router.push('/drm-dashboard'), 1500);
        return;
      }

      if (resBody.parallel_branch_completed) {
        showToast('Your branch review is complete. Waiting for other parallel branches.');
        await loadAll();
        return;
      }

      showToast(
        decision === 'approved'
          ? 'Review approved'
          : decision === 'approved-with-conditions'
            ? 'Approved with conditions'
            : 'Decision submitted'
      );
      await loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendBack({ target_stage, comments, action_items }) {
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/${id}/send-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_stage, comments, action_items }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Send-back failed (${res.status})`);
      }
      setModal(null);
      showToast('SoW sent back for revision');
      router.replace('/drm-dashboard');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await authFetch(`/api/review/${id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Advance failed (${res.status})`);
      }
      showToast('SoW approved and advanced!');
      await loadAll();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAdvancing(false);
    }
  }

  async function handleRunAI() {
    setAiLoading(true);
    setAiError(null);
    const result = await aiClient.runAnalysis(authFetch, id);
    setAiLoading(false);
    if (result.ok) {
      setAiAnalysis(result.data);
      showToast('AI analysis complete');
    } else {
      setAiError(result.error);
      showToast(result.error.message, 'error');
    }
  }

  // Derived state
  const myAssignment = (reviewStatus?.assignments || []).find(
    (a) => a.stage === STAGE_KEYS.ASSIGNMENT_DRM_APPROVAL && a.display_name && a.status
  );
  const isMyReviewDone =
    reviewStatus?.assignments?.some(
      (a) => a.stage === STAGE_KEYS.ASSIGNMENT_DRM_APPROVAL && a.status === 'completed'
    ) ?? false;

  // More precise: is the current user's assignment done?
  const myDrmAssignment = (reviewStatus?.assignments || []).find(
    (a) => a.stage === STAGE_KEYS.ASSIGNMENT_DRM_APPROVAL && a.reviewer_role === checklistRole
  );
  const isMyDone = myDrmAssignment?.status === 'completed';

  const requiredIds = checklistItems.filter((i) => i.required).map((i) => i.id);
  const checkedIds = responses.filter((r) => r.checked).map((r) => r.id);
  const allRequiredChecked = requiredIds.every((id) => checkedIds.includes(id));

  const gatingMet = reviewStatus?.gating_rules_met ?? false;
  const canAdvance = gatingMet && sow?.status === STAGE_KEYS.DRM_REVIEW;
  const alreadyApproved = sow?.status === 'approved';

  const aiResult = aiAnalysis;

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-3xl)' }}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--spacing-2xl)' }}>
        <div
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'rgba(239,68,68,0.1)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  const esap = sow?.esap_level;
  const esapStyle = esapBadgeStyle(esap);

  return (
    <>
      <Head>
        <title>{sow?.title ? `DRM Review — ${sow.title}` : 'DRM Review'} – Cocoon</title>
      </Head>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 2000,
            padding: 'var(--spacing-sm) var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: toast.type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
            color: '#fff',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            boxShadow: 'var(--shadow-lg)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          {toast.msg}
        </div>
      )}

      {/* Modals */}
      {(modal === 'approved' || modal === 'approved-with-conditions') && (
        <DecisionModal
          type={modal}
          onClose={() => setModal(null)}
          onSubmit={handleDecisionSubmit}
          submitting={submitting}
        />
      )}
      {modal === 'send-back' && (
        <SendBackModal
          onClose={() => setModal(null)}
          onSubmit={handleSendBack}
          submitting={submitting}
          availableStages={sendBackTargets}
        />
      )}

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-2xl)', margin: '0 auto' }}>
          {/* Back link */}
          <Link
            href="/drm-dashboard"
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
            ← Back to DRM Dashboard
          </Link>

          {/* Header card */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--spacing-lg) var(--spacing-xl)',
              marginBottom: 'var(--spacing-xl)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              <h1 className="text-2xl font-bold" style={{ margin: 0 }}>
                {sow?.title || 'Untitled SoW'}
              </h1>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexShrink: 0 }}>
                {esap && (
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      ...esapStyle,
                    }}
                  >
                    {esap.toUpperCase()}
                  </span>
                )}
                {alreadyApproved && (
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      backgroundColor: 'rgba(74,222,128,0.1)',
                      color: 'var(--color-success)',
                    }}
                  >
                    Approved
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
              {sow?.customer_name && (
                <span className="text-sm text-secondary">
                  <strong style={{ color: 'var(--color-text-primary)' }}>Customer:</strong>{' '}
                  {sow.customer_name}
                </span>
              )}
              <span className="text-sm text-secondary">
                <strong style={{ color: 'var(--color-text-primary)' }}>Deal:</strong>{' '}
                {formatDeal(sow?.deal_value)}
              </span>
              {sow?.methodology && (
                <span className="text-sm text-secondary">
                  <strong style={{ color: 'var(--color-text-primary)' }}>Methodology:</strong>{' '}
                  {sow.methodology}
                </span>
              )}
              <span className="text-sm text-secondary">
                <strong style={{ color: 'var(--color-text-primary)' }}>Your Role:</strong>{' '}
                {roleLabel(checklistRole)}
              </span>
            </div>

            {/* Status tracker */}
            <div style={{ marginTop: 'var(--spacing-lg)' }}>
              <WorkflowProgress
                sowId={sow?.id}
                currentStage={sow?.status}
                reviewAssignments={reviewStatus?.assignments || []}
              />
            </div>
          </div>

          {/* Internal review results banner */}
          <InternalReviewBanner reviewStatus={reviewStatus} />

          {/* Reviewer instructions from workflow stage config */}
          {currentStage?.config?.reviewer_instructions && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-sm)',
                padding: 'var(--spacing-sm) var(--spacing-md)',
                marginBottom: 'var(--spacing-xl)',
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
          <div style={{ display: 'flex', gap: 'var(--spacing-xl)', alignItems: 'flex-start' }}>
            {/* Left: Persona dashboard */}
            <div
              style={{
                flex: '0 0 55%',
                minWidth: 0,
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-xl)',
                backgroundColor: 'var(--color-bg-secondary)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Your Focus Areas
                </span>
                <Link
                  href={`/sow/${id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-accent-purple, #7c3aed)',
                    textDecoration: 'none',
                  }}
                >
                  View Full SoW ↗
                </Link>
              </div>
              <div style={{ padding: 'var(--spacing-md)', overflowY: 'auto', maxHeight: '70vh' }}>
                <PersonaDashboard
                  role={checklistRole}
                  summaryData={summaryData}
                  loading={summaryLoading}
                />
              </div>
            </div>

            {/* Right: Checklist + AI + actions */}
            <div
              style={{
                flex: '0 0 calc(45% - var(--spacing-xl))',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-md)',
              }}
            >
              {/* Checklist card */}
              <div
                style={{
                  border: '1px solid var(--color-border-default)',
                  borderRadius: 'var(--radius-xl)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderBottom: '1px solid var(--color-border-default)',
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    Review Checklist
                  </span>
                </div>
                <div style={{ padding: 'var(--spacing-md)' }}>
                  {checklistItems.length > 0 ? (
                    <ReviewChecklist
                      items={checklistItems}
                      responses={responses}
                      onChange={setResponses}
                      readOnly={isMyDone}
                    />
                  ) : (
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No checklist items for this role.
                    </p>
                  )}
                </div>
              </div>

              {/* AI panel */}
              {aiError && (
                <AIUnavailableBanner error={aiError} context="analysis" onRetry={handleRunAI} />
              )}
              <AISuggestionsPanel
                analysisResult={aiResult}
                collapsed={true}
                showRunButton={!aiResult}
                onRunAnalysis={handleRunAI}
                loading={aiLoading}
              />

              {/* Action buttons */}
              {!isMyDone && !alreadyApproved && (
                <div
                  style={{
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-xl)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: 'var(--spacing-md)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-sm)',
                  }}
                >
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleSaveProgress}
                    disabled={saving}
                    style={{ width: '100%' }}
                  >
                    {saving ? 'Saving…' : 'Save Progress'}
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setModal('approved')}
                    disabled={!allRequiredChecked}
                    style={{ width: '100%' }}
                    title={!allRequiredChecked ? 'Complete all required checklist items first' : ''}
                  >
                    Approve
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setModal('approved-with-conditions')}
                    disabled={!allRequiredChecked}
                    style={{ width: '100%' }}
                  >
                    Approve with Conditions
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={() => setModal('send-back')}
                    style={{
                      width: '100%',
                      backgroundColor: 'rgba(245,158,11,0.1)',
                      color: 'var(--color-warning)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: 'var(--radius-md)',
                      padding: '6px 12px',
                      cursor: 'pointer',
                      fontSize: 'var(--font-size-sm)',
                    }}
                  >
                    Send Back
                  </button>
                </div>
              )}

              {/* Completed state */}
              {isMyDone && !alreadyApproved && (
                <div
                  style={{
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-xl)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    padding: 'var(--spacing-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>✅</div>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      margin: 0,
                    }}
                  >
                    Your review is submitted. Waiting for other DRM reviewers.
                  </p>
                </div>
              )}

              {/* Advance to Approved button */}
              {canAdvance && (
                <button
                  className="btn btn-primary"
                  onClick={handleAdvance}
                  disabled={advancing}
                  style={{
                    width: '100%',
                    padding: 'var(--spacing-sm)',
                    backgroundColor: 'var(--color-success)',
                    borderColor: 'var(--color-success)',
                  }}
                >
                  {advancing ? 'Marking as Approved…' : '✓ Mark as Approved'}
                </button>
              )}

              {alreadyApproved && (
                <div
                  style={{
                    border: '1px solid rgba(74,222,128,0.3)',
                    borderRadius: 'var(--radius-xl)',
                    backgroundColor: 'rgba(74,222,128,0.08)',
                    padding: 'var(--spacing-md)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>🎉</div>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-success)',
                      fontWeight: 'var(--font-weight-semibold)',
                      margin: 0,
                    }}
                  >
                    SoW Approved — ready for finalization.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* DRM reviewer status footer */}
          <DrmReviewerStatus reviewStatus={reviewStatus} />

          {/* Attachments */}
          {sow && (
            <div
              style={{
                padding: 'var(--spacing-xl)',
                borderTop: '1px solid var(--color-border-default)',
              }}
            >
              <AttachmentManager
                sowId={sow.id}
                stageKey={STAGE_KEYS.DRM_REVIEW}
                readOnly={false}
                showRequirements={true}
                authFetch={authFetch}
              />
            </div>
          )}

          {/* Conditions of Approval */}
          {sow && (
            <div
              style={{
                padding: 'var(--spacing-xl)',
                borderTop: '1px solid var(--color-border-default)',
              }}
            >
              <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600, marginBottom: 0 }}>
                Conditions of Approval
              </h3>
              <COATracker
                sowId={sow.id}
                authFetch={authFetch}
                readOnly={false}
                onStatusChange={() => {}}
              />
            </div>
          )}

          {/* Activity Log */}
          {sow && (
            <div
              style={{
                padding: 'var(--spacing-xl)',
                borderTop: '1px solid var(--color-border-default)',
              }}
            >
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
            </div>
          )}
        </div>
      </div>
    </>
  );
}
