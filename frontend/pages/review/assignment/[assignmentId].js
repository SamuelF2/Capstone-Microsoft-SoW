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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import SendBackModal from '../../../components/review/SendBackModal';
import SoWDocumentReader from '../../../components/sow/SoWDocumentReader';
import useAutoRefreshFetch from '../../../lib/hooks/useAutoRefreshFetch';
import { formatDeal, esapBadgeStyle } from '../../../lib/format';
import { aiClient } from '../../../lib/ai';
import AIUnavailableBanner from '../../../components/AIUnavailableBanner';

// ─── Constants ──────────────────────────────────────────────────────────────

const TERMINAL_STATUSES_REDIRECT = {
  approved: (id) => `/finalize/${id}`,
  finalized: (id) => `/finalize/${id}`,
  draft: (id) => `/draft/${id}`,
};

// Resizable split-pane defaults. The reviewer can drag the divider between
// the SoW reader and the review controls; that ratio is persisted to
// localStorage so the next visit picks up where they left off.
const SPLIT_DEFAULT_LEFT_PCT = 66.67;
const SPLIT_MIN_LEFT_PCT = 30;
const SPLIT_MAX_LEFT_PCT = 80;
const SPLIT_DIVIDER_PX = 12;
const SPLIT_STORAGE_KEY = 'reviewAssignment.splitLeftPct';

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
  const [aiError, setAiError] = useState(null);
  const [comments, setComments] = useState('');

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [runningAI, setRunningAI] = useState(false);
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions' | 'send-back'
  const [toast, setToast] = useState(null);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [activeReviewTab, setActiveReviewTab] = useState('review');
  const [coaSummary, setCoaSummary] = useState(null);

  // ── Resizable split (SoW reader | review panel) ────────────────────────
  // ``leftPct`` is the percentage of the split row given to the SoW reader.
  // We initialize with the default and overwrite from localStorage in an
  // effect so SSR and the first client render agree.
  //
  // The layout uses a CSS grid (`${leftPct}fr ${dividerPx}px ${100-leftPct}fr`)
  // so the divider's pixel width never overflows the container — that
  // overflow is what was causing the right column to twitch during drag.
  // The grid template lives in a ref-tracked latest-leftPct so the mousemove
  // handler can update layout without re-binding the listener every frame.
  const [leftPct, setLeftPct] = useState(SPLIT_DEFAULT_LEFT_PCT);
  const leftPctRef = useRef(SPLIT_DEFAULT_LEFT_PCT);
  const splitContainerRef = useRef(null);
  const dragStateRef = useRef(null);

  useEffect(() => {
    leftPctRef.current = leftPct;
  }, [leftPct]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SPLIT_STORAGE_KEY);
      if (stored != null) {
        const n = Number(stored);
        if (!Number.isNaN(n)) {
          setLeftPct(Math.max(SPLIT_MIN_LEFT_PCT, Math.min(SPLIT_MAX_LEFT_PCT, n)));
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  const startResize = useCallback((e) => {
    e.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragStateRef.current = {
      rectLeft: rect.left,
      // Available space is the container width minus the fixed divider; the
      // fr columns split *that* number, not the whole container, so the
      // percentage we compute has to use the same denominator.
      avail: rect.width - SPLIT_DIVIDER_PX,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  // Re-bound only on mount: the move/up handlers read from refs so a state
  // change to leftPct doesn't tear down and re-add window listeners mid-drag.
  useEffect(() => {
    let raf = null;
    let pending = null;
    function flush() {
      raf = null;
      if (pending != null) {
        setLeftPct(pending);
        pending = null;
      }
    }
    function onMove(ev) {
      const drag = dragStateRef.current;
      if (!drag) return;
      // Cursor sits over the *middle* of the divider, so subtract half its
      // width to get the desired left-column edge.
      const leftEdge = ev.clientX - drag.rectLeft - SPLIT_DIVIDER_PX / 2;
      const pct = (leftEdge / drag.avail) * 100;
      const clamped = Math.max(SPLIT_MIN_LEFT_PCT, Math.min(SPLIT_MAX_LEFT_PCT, pct));
      // Coalesce mousemove → at most one setState per animation frame so a
      // fast drag never produces a backlog of renders mid-flight.
      pending = clamped;
      if (raf == null) raf = window.requestAnimationFrame(flush);
    }
    function onUp() {
      if (!dragStateRef.current) return;
      dragStateRef.current = null;
      if (raf != null) {
        window.cancelAnimationFrame(raf);
        raf = null;
        if (pending != null) setLeftPct(pending);
        pending = null;
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem(SPLIT_STORAGE_KEY, String(leftPctRef.current));
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, []);

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
        const cached = await aiClient.cachedAnalysis(authFetch, loadedSowId, { signal });
        if (cached.ok) {
          setAiAnalysis(cached.data || null);
          setAiError(null);
        } else {
          setAiError(cached.error);
        }
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

  // ── Compute send-back targets from workflow on_send_back transitions ───
  const sendBackTargets = useMemo(() => {
    if (!workflow || !sow) return null;
    const transitions = workflow.workflow_data?.transitions || [];
    const stages = workflow.workflow_data?.stages || [];
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
  }, [workflow, sow]);

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
    setAiError(null);
    const result = await aiClient.runAnalysis(authFetch, sowId);
    setRunningAI(false);
    if (result.ok) {
      setAiAnalysis(result.data);
      showToast('AI analysis complete');
    } else {
      setAiError(result.error);
      showToast(result.error.message, 'error');
    }
  }

  // ── Send back (workflow-driven) ──────────────────────────────────────────
  async function handleSendBack({ target_stage, comments: sbComments, action_items }) {
    if (!sowId) return;
    setSubmitting(true);
    try {
      const res = await authFetch(`/api/review/${sowId}/send-back`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_stage, comments: sbComments, action_items }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Send-back failed (${res.status})`);
      }
      setModal(null);
      showToast('SoW sent back for revision');
      setTimeout(() => router.push('/my-reviews'), 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
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
      {modal === 'send-back' && (
        <SendBackModal
          onClose={() => setModal(null)}
          onSubmit={handleSendBack}
          submitting={submitting}
          availableStages={sendBackTargets}
        />
      )}

      {/* The page is bound to the viewport (no outer scroll) so the SoW
          reader and review panel can each manage their own scroll within
          the space that's actually available. The split row uses
          `flex: 1; min-height: 0`, which lets it shrink to whatever
          remains after the header + banners, eliminating the need for the
          old hardcoded `calc(100vh - 320px)` height that miscounted when
          banners were visible. */}
      <div
        style={{
          height: 'calc(100vh - 80px)',
          minHeight: '600px',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* ── Top section (header, progress, tabs) ─────────────────────── */}
        <div
          style={{
            flexShrink: 0,
            backgroundColor: 'var(--color-bg-primary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-md) var(--spacing-xl) 0',
          }}
        >
          <div style={{ width: '100%' }}>
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
        {/* The tab content area is a flex column that consumes the rest of
            the viewport. Each tab decides how to use that space — the
            review tab puts the split row in `flex: 1` so it shrinks/grows
            with the available height; the others wrap their content in
            an internally-scrolling container. */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            padding: 'var(--spacing-md) var(--spacing-xl) var(--spacing-md)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* ── Review tab ─────────────────────────────────────────── */}
          {activeReviewTab === 'review' && (
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Out-of-stage banner: assignment is for an earlier stage that
                  has already been advanced past. The user can still see what
                  they did but can't make changes. `flex-shrink: 0` so it
                  always shows at full height and the split row absorbs the
                  remaining space. */}
              {!isStageCurrent && checklist && currentStage && (
                <div
                  style={{
                    flexShrink: 0,
                    padding: 'var(--spacing-sm) var(--spacing-lg)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    marginBottom: 'var(--spacing-md)',
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
                    flexShrink: 0,
                    display: 'flex',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    marginBottom: 'var(--spacing-md)',
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

              {/* Resizable split: SoW reader (left) | review controls (right).
                  Uses CSS grid with fr units so the divider's pixel width
                  is subtracted from the available space *before* the ratio
                  is applied — this is what stops the right column from
                  twitching as the user drags. The row is `flex: 1; min-height: 0`
                  in the surrounding flex column, so it always fills the
                  remaining viewport space below any banners and never gets
                  cut off the bottom of the screen. Each column has its own
                  internal scroll so the reader and checklist scroll
                  independently, and `scrollbar-gutter: stable` reserves
                  scrollbar space so a scrollbar appearing mid-drag doesn't
                  reflow the content. */}
              <div
                ref={splitContainerRef}
                style={{
                  display: 'grid',
                  gridTemplateColumns: showChecklist
                    ? `${leftPct}fr ${SPLIT_DIVIDER_PX}px ${100 - leftPct}fr`
                    : '1fr',
                  alignItems: 'stretch',
                  flex: 1,
                  minHeight: 0,
                }}
              >
                {/* Left: SoW reader */}
                <div
                  className="card"
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    minHeight: 0,
                  }}
                >
                  <SoWDocumentReader sow={sow} />
                </div>

                {/* Drag handle */}
                {showChecklist && (
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize panels"
                    onMouseDown={startResize}
                    onDoubleClick={() => {
                      setLeftPct(SPLIT_DEFAULT_LEFT_PCT);
                      try {
                        localStorage.setItem(SPLIT_STORAGE_KEY, String(SPLIT_DEFAULT_LEFT_PCT));
                      } catch {
                        /* ignore */
                      }
                    }}
                    title="Drag to resize · double-click to reset"
                    style={{
                      cursor: 'col-resize',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      // Disable text selection within the divider so the
                      // user can't accidentally highlight the page while
                      // grabbing it.
                      userSelect: 'none',
                    }}
                  >
                    <div
                      style={{
                        width: '4px',
                        height: '44px',
                        borderRadius: '2px',
                        backgroundColor: 'var(--color-border-default)',
                        transition: 'background-color 0.15s',
                      }}
                    />
                  </div>
                )}

                {/* Right: review panel — encapsulated as a card so it
                    visually mirrors the SoW reader on the left and clearly
                    bounds its own scroll area. The wrapper itself is the
                    scroll container, so the AI Recommendations section,
                    checklist, and comments can all expand to whatever
                    height they need and the column scrolls inside its
                    own border instead of pushing the page. */}
                {showChecklist && (
                  <div
                    className="custom-scrollbar"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacing-md)',
                      minWidth: 0,
                      minHeight: 0,
                      overflowY: 'auto',
                      // Reserve scrollbar space so the scrollbar
                      // appearing/disappearing during a resize drag never
                      // reflows the content (the source of the jitter).
                      scrollbarGutter: 'stable',
                      padding: 'var(--spacing-md)',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--color-bg-primary)',
                    }}
                  >
                    {/* Role card */}
                    <div
                      className="card"
                      style={{ padding: 'var(--spacing-md) var(--spacing-lg)', flexShrink: 0 }}
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
                    <div className="card" style={{ padding: 'var(--spacing-lg)', flexShrink: 0 }}>
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
                    {aiError && (
                      <AIUnavailableBanner
                        error={aiError}
                        context="analysis"
                        onRetry={handleRunAI}
                      />
                    )}
                    <div style={{ flexShrink: 0 }}>
                      <AISuggestionsPanel
                        analysisResult={aiAnalysis}
                        collapsed={true}
                        showRunButton={true}
                        onRunAnalysis={handleRunAI}
                        loading={runningAI}
                      />
                    </div>

                    {/* Comments */}
                    {!isMyReviewDone && (
                      <div className="card" style={{ padding: 'var(--spacing-lg)', flexShrink: 0 }}>
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
                          flexShrink: 0,
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

                        <button
                          className="btn btn-sm"
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
                          onClick={() => setModal('send-back')}
                          disabled={submitting}
                        >
                          Send Back
                        </button>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--spacing-sm)',
                          flexShrink: 0,
                        }}
                      >
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
                        <button
                          className="btn btn-sm"
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
                          onClick={() => setModal('send-back')}
                          disabled={submitting}
                        >
                          Send Back
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Attachments tab ────────────────────────────────────── */}
          {/* Non-review tabs each get their own scroll container so the
              page-level layout (which is locked to the viewport height)
              doesn't push content off the bottom of the screen. */}
          {activeReviewTab === 'attachments' && sow && currentStage && (
            <div
              className="custom-scrollbar"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                scrollbarGutter: 'stable',
              }}
            >
              <AttachmentManager
                sowId={sow.id}
                stageKey={currentStage.stage_key}
                readOnly={!canReview}
                showRequirements={true}
                authFetch={authFetch}
              />
            </div>
          )}

          {/* ── Conditions tab ─────────────────────────────────────── */}
          {activeReviewTab === 'conditions' && sow && (
            <div
              className="custom-scrollbar"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                scrollbarGutter: 'stable',
              }}
            >
              <COATracker
                sowId={sow.id}
                authFetch={authFetch}
                readOnly={!canReview}
                onStatusChange={() => setProgressRefreshKey((k) => k + 1)}
              />
            </div>
          )}

          {/* ── Activity tab ───────────────────────────────────────── */}
          {activeReviewTab === 'activity' && sow && (
            <div
              className="custom-scrollbar"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                scrollbarGutter: 'stable',
              }}
            >
              <div className="card" style={{ padding: 'var(--spacing-lg)' }}>
                <ActivityLog sowId={sow.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
