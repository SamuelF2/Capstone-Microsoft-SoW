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
import { roleLabel } from '../../../lib/workflowStages';
import Spinner from '../../../components/Spinner';
import ReviewChecklist from '../../../components/ReviewChecklist';
import AISuggestionsPanel from '../../../components/AISuggestionsPanel';
import WorkflowProgress from '../../../components/WorkflowProgress';
import COATracker from '../../../components/COATracker';
import AttachmentManager from '../../../components/AttachmentManager';
import ActivityLog from '../../../components/ActivityLog';
import DecisionModal from '../../../components/review/DecisionModal';
import SoWContentPanel from '../../../components/sow/SoWContentPanel';
import useAutoRefreshFetch from '../../../lib/hooks/useAutoRefreshFetch';
import { formatDeal, esapBadgeStyle } from '../../../lib/format';

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── Main page ──────────────────────────────────────────────────────────────

export default function AssignmentReviewPage() {
  const router = useRouter();
  const { assignmentId } = router.query;
  const { user, authFetch } = useAuth();

  // User-mutated state — re-seeded from the loaded payload on every refresh.
  const [responses, setResponses] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [comments, setComments] = useState('');
  const [contentTab, setContentTab] = useState('Overview');

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningAI, setRunningAI] = useState(false);
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions'
  const [toast, setToast] = useState(null);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [activeReviewTab, setActiveReviewTab] = useState('review');
  const [coaSummary, setCoaSummary] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Loader: assignment checklist → sow + workflow + status ──────────────
  // The two-stage shape lives inside the loader so the hook only sees one
  // function.  The signal is forwarded through every fetch so cancellation
  // (unmount, refresh, deps change) aborts whichever request is in flight.
  const load = useCallback(
    async (signal) => {
      // Stage 1: assignment-scoped checklist.  Its response carries
      // sow_id, user_id, reviewer_role, stage, and status — everything we
      // need to drive the rest of the page.
      const checklistRes = await authFetch(`/api/review/assignment/${assignmentId}/checklist`, {
        signal,
      });
      if (checklistRes.status === 404) {
        throw new Error('Assignment not found or you do not have access.');
      }
      if (!checklistRes.ok) {
        throw new Error(`Checklist load failed (${checklistRes.status})`);
      }
      const checkData = await checklistRes.json();
      setResponses(checkData.saved_responses || []);

      const loadedSowId = checkData.sow_id;

      // Stage 2: fan out to the SoW, workflow snapshot, and review status.
      const [sowRes, workflowRes, statusRes] = await Promise.all([
        authFetch(`/api/sow/${loadedSowId}`, { signal }),
        authFetch(`/api/workflow/sow/${loadedSowId}`, { signal }),
        authFetch(`/api/review/${loadedSowId}/status`, { signal }),
      ]);

      if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
      const sowData = await sowRes.json();

      // Terminal-state redirect — the assignment review page only makes
      // sense while the SoW is mid-pipeline.  Throwing a sentinel here
      // would muddy error rendering, so route imperatively and return a
      // null payload that the render path treats as "still loading".
      const redirect = TERMINAL_STATUSES_REDIRECT[sowData.status];
      if (redirect) {
        router.replace(redirect(loadedSowId));
        return null;
      }

      const workflowData = workflowRes.ok ? await workflowRes.json() : null;
      const statusData = statusRes.ok ? await statusRes.json() : null;

      if (sowData.ai_suggestion_id) {
        const aiRes = await authFetch(`/api/sow/${loadedSowId}/ai-analyze`, { signal });
        if (aiRes.ok) setAiAnalysis(await aiRes.json());
      }

      return {
        checklist: checkData,
        sow: sowData,
        workflow: workflowData,
        reviewStatus: statusData,
      };
    },
    [assignmentId, authFetch, router]
  );

  const { data, loading, error, refresh, setData } = useAutoRefreshFetch({
    load,
    enabled: Boolean(assignmentId && user),
    deps: [assignmentId, user],
  });

  const checklist = data?.checklist ?? null;
  const sow = data?.sow ?? null;
  const workflow = data?.workflow ?? null;
  const reviewStatus = data?.reviewStatus ?? null;
  const sowId = checklist?.sow_id;

  // Light refresh after a save: re-pull sow + status without re-fetching the
  // checklist (which would clobber the user's in-flight checklist edits).
  // Uses the hook's `setData` to splice fresh values into the loaded payload.
  const refreshProgress = useCallback(async () => {
    if (!sowId) return;
    try {
      const [sowRes, statusRes] = await Promise.all([
        authFetch(`/api/sow/${sowId}`),
        authFetch(`/api/review/${sowId}/status`),
      ]);
      if (sowRes.ok) {
        const fresh = await sowRes.json();
        const redirect = TERMINAL_STATUSES_REDIRECT[fresh.status];
        if (redirect) {
          router.replace(redirect(sowId));
          return;
        }
        const freshStatus = statusRes.ok ? await statusRes.json() : null;
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sow: fresh,
            // Only overwrite when the status fetch actually returned data;
            // a transient 5xx shouldn't blank out the visible status pill.
            ...(freshStatus !== null ? { reviewStatus: freshStatus } : null),
          };
        });
      }
      setProgressRefreshKey((k) => k + 1);
    } catch {
      // Non-fatal
    }
  }, [sowId, authFetch, router, setData]);

  // ── COA summary for tab badge ──────────────────────────────────────────
  useEffect(() => {
    if (!sowId) return;
    const ctrl = new AbortController();
    authFetch(`/api/coa/sow/${sowId}/summary`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ctrl.signal.aborted) setCoaSummary(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [sowId, progressRefreshKey, authFetch]);

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
      // flips to read-only and shows the success card.  Optimistic update
      // through the hook's setData — refreshProgress() below will reconcile.
      setData((prev) =>
        prev?.checklist
          ? {
              ...prev,
              checklist: { ...prev.checklist, assignment_status: 'completed', decision },
            }
          : prev
      );

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
                          {checklist.display_name || roleLabel(actingRole)}
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
