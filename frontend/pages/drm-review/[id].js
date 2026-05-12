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

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import SendBackModal from '../../components/review/SendBackModal';
import UnsavedChangesModal from '../../components/UnsavedChangesModal';
import SoWDocumentReader from '../../components/sow/SoWDocumentReader';
import useAutoRefreshFetch from '../../lib/hooks/useAutoRefreshFetch';
import useUnsavedChangesWarning from '../../lib/hooks/useUnsavedChangesWarning';
import { formatDeal, esapBadgeStyle } from '../../lib/format';
import { roleLabel, STAGE_KEYS } from '../../lib/workflowStages';
import { aiClient } from '../../lib/ai';
import AIUnavailableBanner from '../../components/AIUnavailableBanner';

// DRM comments are entered in the DecisionModal at submit time, not at the page
// level — so dirty detection only hashes checklist responses. Sorted by id so
// server-returned order variations don't register as drift.
function responsesSignature(responses) {
  return JSON.stringify(
    (responses || [])
      .map((x) => [x.id, !!x.checked, x.notes || ''])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
}

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

// Resizable split-pane defaults. The reviewer can drag the divider between
// the SoW reader and the review controls; the ratio is persisted to
// localStorage so the next visit picks up where they left off.
const SPLIT_DEFAULT_LEFT_PCT = 66.67;
const SPLIT_MIN_LEFT_PCT = 30;
const SPLIT_MAX_LEFT_PCT = 80;
const SPLIT_DIVIDER_PX = 12;
const SPLIT_STORAGE_KEY = 'drmReview.splitLeftPct';

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
  // Baseline signature of responses as last loaded / saved — used for dirty
  // detection to drive the unsaved-changes modal and Save button state.
  // Kept in state (not a ref) so clearing the baseline on save triggers the
  // `hasChanges` memo to recompute — otherwise the Unsaved-changes indicator
  // would linger with a stale cached value until another state change.
  const [baselineSig, setBaselineSig] = useState('');
  const [summaryData, setSummaryData] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [modal, setModal] = useState(null); // null | 'approved' | 'approved-with-conditions' | 'send-back'
  const [toast, setToast] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [regeneratingChecklist, setRegeneratingChecklist] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiError, setAiError] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // Tab + COA-badge state for the canonical reviewer tab bar.
  const [activeReviewTab, setActiveReviewTab] = useState('review');
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [coaSummary, setCoaSummary] = useState(null);

  // ── Resizable split (SoW reader | review panel) ────────────────────────
  // `leftPct` is the percentage of the split row given to the SoW reader.
  // Initialize with the default and overwrite from localStorage in an effect
  // so SSR and the first client render agree. The grid template uses
  // `${leftPct}fr ${dividerPx}px ${100-leftPct}fr` so the divider's pixel
  // width never overflows the container — that overflow is what was causing
  // the right column to twitch during drag.
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
      const saved = checklistData.saved_responses || [];
      setResponses(saved);
      setBaselineSig(responsesSignature(saved));

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
        checklistFocusAreas: checklistData.focus_areas || [],
        checklistDisplayName: checklistData.display_name || '',
        checklistMode: checklistData.mode || 'legacy',
        checklistGeneratedAt: checklistData.generated_at || null,
        checklistSowChanged: Boolean(checklistData.sow_changed),
        checklistAssignmentId: checklistData.assignment_id || null,
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
  const checklistFocusAreas = data?.checklistFocusAreas ?? [];
  const checklistDisplayName = data?.checklistDisplayName ?? '';
  const checklistMode = data?.checklistMode ?? 'legacy';
  const checklistGeneratedAt = data?.checklistGeneratedAt ?? null;
  const checklistSowChanged = Boolean(data?.checklistSowChanged);
  const checklistAssignmentId = data?.checklistAssignmentId ?? null;
  const reviewStatus = data?.reviewStatus ?? null;
  const workflowData = data?.workflowData ?? null;

  // ── Dirty detection ─────────────────────────────────────────────────────
  // Declared above the save/submit/send-back handlers so `allowNextNavigation`
  // isn't a forward-reference via closure. Skipped when the current user's
  // review is already done (the page is read-only in that branch) and while
  // the initial load is still in flight (baseline hasn't been seeded yet).
  const myDrmAssignment = (reviewStatus?.assignments || []).find(
    (a) => a.stage === STAGE_KEYS.ASSIGNMENT_DRM_APPROVAL && a.reviewer_role === checklistRole
  );
  const isMyDone = myDrmAssignment?.status === 'completed';

  const hasChanges = useMemo(
    () => !isMyDone && !loading && responsesSignature(responses) !== baselineSig,
    [isMyDone, loading, responses, baselineSig]
  );

  const {
    showModal: showUnsavedModal,
    confirmLeave: confirmUnsavedLeave,
    cancelLeave: cancelUnsavedLeave,
    allowNextNavigation,
  } = useUnsavedChangesWarning(hasChanges);

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

  // Load role-specific AI insights (gracefully degrades — returns empty if ML
  // endpoint not yet shipped)
  useEffect(() => {
    if (!id || !user || !checklistRole) return;
    const ctrl = new AbortController();
    setInsightsLoading(true);
    aiClient
      .insights(authFetch, id, checklistRole, { signal: ctrl.signal })
      .then((result) => {
        if (!ctrl.signal.aborted) {
          setInsightsData(result.ok ? result.data : null);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setInsightsData(null);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setInsightsLoading(false);
      });
    return () => ctrl.abort();
  }, [id, user, checklistRole, authFetch]);

  // ── COA summary for tab badge ──────────────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    authFetch(`/api/coa/sow/${id}/summary`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!ctrl.signal.aborted) setCoaSummary(d);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [id, authFetch, progressRefreshKey]);

  async function handleSaveProgress() {
    setSaving(true);
    // Snapshot the signature of what we're ACTUALLY sending — if the user
    // keeps editing during the round-trip, those newer edits stay dirty
    // instead of being silently marked clean on success.
    const payloadSig = responsesSignature(responses);
    try {
      const res = await authFetch(`/api/review/${id}/save-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_responses: responses, comments: '' }),
      });
      if (!res.ok) throw new Error('Save failed');
      // Reset dirty baseline to what we just successfully persisted.  loadAll()
      // below will overwrite it again with the server response, but doing it
      // here first avoids a transient "unsaved" flash while the reload runs.
      setBaselineSig(payloadSig);
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
    const payloadSig = responsesSignature(responses);
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
      // Clear dirty state immediately so the post-submit redirect isn't
      // intercepted by the unsaved-changes modal.
      setBaselineSig(payloadSig);
      const resBody = await res.json().catch(() => ({}));
      setModal(null);

      if (resBody.auto_advanced) {
        showToast('Review submitted — automatically advanced to next stage');
        setTimeout(() => {
          allowNextNavigation();
          router.push('/drm-dashboard');
        }, 1500);
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
      setBaselineSig(responsesSignature(responses));
      showToast('SoW sent back for revision');
      allowNextNavigation();
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

  // ── Regenerate AI-suggested checklist ────────────────────────────────────
  async function handleRegenerateChecklist() {
    if (!checklistAssignmentId) return;
    setRegeneratingChecklist(true);
    try {
      const res = await authFetch(
        `/api/review/assignment/${checklistAssignmentId}/checklist/regenerate`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = typeof body.detail === 'string' ? body.detail : body.detail?.message;
        throw new Error(detail || `Regenerate failed (${res.status})`);
      }
      await loadAll();
      showToast('Checklist regenerated');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setRegeneratingChecklist(false);
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

  const requiredIds = checklistItems.filter((i) => i.required).map((i) => i.id);
  const checkedIds = responses.filter((r) => r.checked).map((r) => r.id);
  const allRequiredChecked = requiredIds.every((id) => checkedIds.includes(id));

  const gatingMet = reviewStatus?.gating_rules_met ?? false;
  const canAdvance = gatingMet && sow?.status === STAGE_KEYS.DRM_REVIEW;
  const alreadyApproved = sow?.status === 'approved';

  // True while the SoW is still at DRM Review. If the SoW has moved past
  // DRM Review the page shows an out-of-stage warning so the reviewer
  // knows their actions on this surface are no longer driving the workflow.
  const isStageCurrent = sow?.status === STAGE_KEYS.DRM_REVIEW;

  // Tab definitions with dynamic Conditions badge.
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

  // Hide the right-side review panel once the SoW is approved — the SoW
  // reader expands to full width and the prominent "Approved" banner above
  // the split conveys the terminal state.  Roles without checklist items
  // still see the right column: it shows the no-items message and the
  // Approve/Send-Back buttons stay reachable (allRequiredChecked is
  // trivially true when there are no required items).
  const showChecklist = !alreadyApproved;

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

      <UnsavedChangesModal
        open={showUnsavedModal}
        onStay={cancelUnsavedLeave}
        onLeave={confirmUnsavedLeave}
      />

      {/* The page is bound to the viewport (no outer scroll) so the SoW
          reader and review panel can each manage their own scroll within
          the space that's actually available. */}
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
                  href="/drm-dashboard"
                  title="Back to DRM Dashboard"
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
                  {sow?.title || 'Untitled SoW'}
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
                  {sow?.methodology && <span>· {sow.methodology}</span>}
                  {checklistRole && <span>· {roleLabel(checklistRole)}</span>}
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
                {esap && (
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      ...esapStyle,
                    }}
                  >
                    {esap.toUpperCase()}
                  </span>
                )}
                {alreadyApproved ? (
                  <span
                    style={{
                      padding: '3px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      backgroundColor: 'rgba(74,222,128,0.1)',
                      color: 'var(--color-success)',
                    }}
                  >
                    Approved
                  </span>
                ) : (
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
                  >
                    {currentStage?.display_name || 'DRM Review'}
                  </span>
                )}
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
              className="custom-scrollbar"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                scrollbarGutter: 'stable',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Out-of-stage banner */}
              {!isStageCurrent && currentStage && !alreadyApproved && (
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
                  This SoW has moved past DRM Review to <strong>{currentStage.display_name}</strong>
                  . Your actions here may no longer affect the workflow.
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

              {/* Internal review results banner */}
              <div style={{ flexShrink: 0 }}>
                <InternalReviewBanner reviewStatus={reviewStatus} />
              </div>

              {/* Approved announcement — hoisted out of the right column so
                  it stays prominent when the right column collapses (showChecklist
                  is false once the SoW is approved). */}
              {alreadyApproved && (
                <div
                  style={{
                    flexShrink: 0,
                    border: '1px solid rgba(74,222,128,0.3)',
                    borderRadius: 'var(--radius-xl)',
                    backgroundColor: 'rgba(74,222,128,0.08)',
                    padding: 'var(--spacing-md)',
                    textAlign: 'center',
                    marginBottom: 'var(--spacing-md)',
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

              {/* Resizable split: SoW reader (left) | review controls (right).
                  Explicit height (not min-height) bounds the SoW reader so its
                  internal scroll engages — without this the row would grow to
                  the SoW's natural height and force the reviewer to scroll
                  past the entire document just to reach the focus area below.
                  The calc() leaves ~320px above (header + progress + tabs +
                  padding) and the minHeight floor keeps the split usable on
                  short viewports. */}
              <div
                ref={splitContainerRef}
                style={{
                  display: 'grid',
                  gridTemplateColumns: showChecklist
                    ? `${leftPct}fr ${SPLIT_DIVIDER_PX}px ${100 - leftPct}fr`
                    : '1fr',
                  alignItems: 'stretch',
                  height: 'calc(100vh - 320px)',
                  minHeight: '450px',
                  flexShrink: 0,
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
                  <SoWDocumentReader sow={sow} onContentChange={loadAll} />
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

                {/* Right: review panel */}
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
                        {checklistDisplayName || roleLabel(checklistRole)}
                      </p>
                      {checklistFocusAreas.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '4px',
                            marginTop: 'var(--spacing-xs)',
                          }}
                        >
                          {checklistFocusAreas.map((fa, idx) => (
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
                      {checklistItems.length > 0 ? (
                        <ReviewChecklist
                          items={checklistItems}
                          responses={responses}
                          onChange={setResponses}
                          readOnly={isMyDone}
                          mode={checklistMode}
                          generatedAt={checklistGeneratedAt}
                          sowChanged={checklistSowChanged}
                          regenerating={regeneratingChecklist}
                          onRegenerate={
                            checklistAssignmentId ? handleRegenerateChecklist : undefined
                          }
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
                        analysisResult={aiResult}
                        collapsed={false}
                        showRunButton={!aiResult}
                        onRunAnalysis={handleRunAI}
                        loading={aiLoading}
                        autoRun
                      />
                    </div>

                    {/* Action buttons — open assignment */}
                    {!isMyDone && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 'var(--spacing-sm)',
                          flexShrink: 0,
                        }}
                      >
                        {hasChanges && !saving && (
                          <span
                            className="text-xs"
                            style={{
                              color: 'var(--color-warning)',
                              fontWeight: 600,
                              textAlign: 'center',
                            }}
                          >
                            ● Unsaved changes
                          </span>
                        )}
                        <button
                          className="btn btn-secondary"
                          onClick={handleSaveProgress}
                          disabled={saving || !hasChanges}
                          title={
                            !hasChanges && !saving
                              ? 'No unsaved changes'
                              : 'Saves your current checklist without submitting your decision'
                          }
                          style={{ opacity: saving || !hasChanges ? 0.6 : 1 }}
                        >
                          {saving ? 'Saving…' : 'Save Progress'}
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => setModal('approved')}
                          disabled={!allRequiredChecked || submitting}
                          title={
                            !allRequiredChecked ? 'Complete all required checklist items first' : ''
                          }
                        >
                          Approve ✓
                        </button>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setModal('approved-with-conditions')}
                          disabled={!allRequiredChecked || submitting}
                        >
                          Approve with Conditions
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => setModal('send-back')}
                          disabled={submitting}
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

                    {/* Completed state — this reviewer done, SoW not yet approved */}
                    {isMyDone && !alreadyApproved && (
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
                          ✓ Your review is submitted. Waiting for other DRM reviewers.
                        </div>
                        <button
                          className="btn btn-sm"
                          onClick={() => setModal('send-back')}
                          disabled={submitting}
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

                    {/* Advance to Approved button — DRM-only gating */}
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
                          flexShrink: 0,
                        }}
                      >
                        {advancing ? 'Marking as Approved…' : '✓ Mark as Approved'}
                      </button>
                    )}

                    {/* Note: the "🎉 SoW Approved" banner is rendered above
                        the split (full-width) since the right column is
                        hidden via showChecklist when alreadyApproved is true. */}
                  </div>
                )}
              </div>

              {/* Focus area — full-width below the split */}
              <div
                style={{
                  marginTop: 'var(--spacing-lg)',
                  flexShrink: 0,
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
                <div style={{ padding: 'var(--spacing-md)' }}>
                  <PersonaDashboard
                    role={checklistRole}
                    summaryData={summaryData}
                    loading={summaryLoading}
                  />
                </div>
              </div>

              {/* AI role-specific insights */}
              {insightsLoading && (
                <div
                  style={{
                    marginTop: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-primary)',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    Loading AI insights…
                  </span>
                </div>
              )}
              {!insightsLoading && insightsData?.summary && (
                <div
                  style={{
                    marginTop: 'var(--spacing-md)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: 'var(--radius-lg)',
                    overflow: 'hidden',
                    backgroundColor: 'var(--color-bg-primary)',
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      borderBottom: '1px solid var(--color-border-default)',
                      backgroundColor: 'var(--color-bg-secondary)',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-semibold)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      AI Insights
                    </span>
                  </div>
                  <div style={{ padding: 'var(--spacing-md)' }}>
                    <p
                      style={{
                        margin: '0 0 var(--spacing-sm)',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-primary)',
                        lineHeight: 'var(--line-height-relaxed)',
                      }}
                    >
                      {insightsData.summary}
                    </p>
                    {Array.isArray(insightsData.flags) && insightsData.flags.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '4px',
                          marginTop: 'var(--spacing-xs)',
                        }}
                      >
                        {insightsData.flags.map((flag, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-warning)',
                              padding: '2px 0 2px 8px',
                            }}
                          >
                            ⚠{' '}
                            {typeof flag === 'string' ? flag : flag.message || JSON.stringify(flag)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* DRM reviewer status footer */}
              <div style={{ flexShrink: 0 }}>
                <DrmReviewerStatus reviewStatus={reviewStatus} currentUserId={user?.id} />
              </div>
            </div>
          )}

          {/* ── Attachments tab ────────────────────────────────────── */}
          {activeReviewTab === 'attachments' && sow && (
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
                stageKey={STAGE_KEYS.DRM_REVIEW}
                readOnly={false}
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
                readOnly={false}
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
