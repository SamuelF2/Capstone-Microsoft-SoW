/**
 * pages/internal-review/[id].js
 *
 * Step 2 — Internal Review page for Solution Architects and SQA reviewers.
 *
 * Layout: two-column split
 *   Left  (60%) — read-only SoW content with tab navigation
 *   Right (40%) — review panel: checklist, AI recommendations, comments, decision buttons
 *
 * Below both columns: Review Status footer showing all reviewer progress.
 */

import { useState, useCallback } from 'react';
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
import DecisionModal from '../../components/review/DecisionModal';
import SoWContentPanel from '../../components/sow/SoWContentPanel';
import useAutoRefreshFetch from '../../lib/hooks/useAutoRefreshFetch';
import { formatDeal, esapBadgeStyle } from '../../lib/format';
import { STAGE_KEYS } from '../../lib/workflowStages';

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InternalReview() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  // User-mutated state — re-seeded from the loaded payload on every refresh.
  const [responses, setResponses] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [comments, setComments] = useState('');
  const [contentTab, setContentTab] = useState('Overview');

  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [runningAI, setRunningAI] = useState(false);
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions'
  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load SoW, checklist, review status ───────────────────────────────────
  const load = useCallback(
    async (signal) => {
      const [sowRes, checkRes, statusRes] = await Promise.all([
        authFetch(`/api/sow/${id}`, { signal }),
        authFetch(`/api/review/${id}/checklist`, { signal }),
        authFetch(`/api/review/${id}/status`, { signal }),
      ]);

      if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
      // Checklist 403 is fine — some roles don't have one for this stage.
      if (!checkRes.ok && checkRes.status !== 403)
        throw new Error(`Checklist load failed (${checkRes.status})`);

      const sowData = await sowRes.json();
      let checkData = null;
      if (checkRes.ok) {
        checkData = await checkRes.json();
        setResponses(checkData.saved_responses || []);
      }
      const statusData = statusRes.ok ? await statusRes.json() : null;

      // Load AI analysis if linked — fire it from inside the loader so the
      // hook tracks it under the same loading flag.
      if (sowData.ai_suggestion_id) {
        const aiRes = await authFetch(`/api/sow/${id}/ai-analyze`, { signal });
        if (aiRes.ok) setAiAnalysis(await aiRes.json());
      }

      return { sow: sowData, checklist: checkData, reviewStatus: statusData };
    },
    [id, authFetch]
  );

  const { data, loading, error, refresh } = useAutoRefreshFetch({
    load,
    enabled: Boolean(id && user),
    deps: [id, user],
  });

  const sow = data?.sow ?? null;
  const checklist = data?.checklist ?? null;
  const reviewStatus = data?.reviewStatus ?? null;

  // ── Save progress ─────────────────────────────────────────────────────────

  async function handleSaveProgress() {
    setSaving(true);
    try {
      const res = await authFetch(`/api/review/${id}/save-progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist_responses: responses, comments }),
      });
      if (!res.ok) throw new Error('Save failed');
      showToast('Progress saved');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // ── Submit decision ───────────────────────────────────────────────────────

  async function handleSubmitDecision(decision, extras = {}) {
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
      // Reload everything (sow, checklist, status) so the UI reflects the
      // server's view — the assignment may have flipped to "completed".
      await refresh();
      if (decision === 'rejected') {
        setTimeout(() => router.push('/my-reviews'), 1500);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Advance to DRM ────────────────────────────────────────────────────────

  async function handleAdvance() {
    setAdvancing(true);
    try {
      const res = await authFetch(`/api/review/${id}/advance`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Advance failed (${res.status})`);
      }
      showToast('Advanced to DRM Review');
      setTimeout(() => router.push('/all-sows'), 1500);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setAdvancing(false);
    }
  }

  // ── Run AI analysis ───────────────────────────────────────────────────────

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

  // ── Approval button gating ────────────────────────────────────────────────

  const requiredItems = checklist?.items?.filter((i) => i.required) || [];
  const checkedRequired = requiredItems.filter((i) =>
    responses.find((r) => r.id === i.id && r.checked)
  );
  const canApprove = requiredItems.length === 0 || checkedRequired.length === requiredItems.length;
  const isMyReviewDone = reviewStatus?.assignments?.some(
    (a) => a.status === 'completed' && a.stage === STAGE_KEYS.ASSIGNMENT_INTERNAL_REVIEW
  );

  // ── Loading / error states ────────────────────────────────────────────────

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

  return (
    <>
      <Head>
        <title>Internal Review — {sow?.title || 'SoW'} – Cocoon</title>
      </Head>

      {/* Toast */}
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

      {/* Decision modal */}
      {modal && (
        <DecisionModal
          type={modal}
          onClose={() => setModal(null)}
          onSubmit={(extras) => handleSubmitDecision(modal, extras)}
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
          {/* Back link */}
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

          {/* Header */}
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
                    backgroundColor: 'rgba(245,158,11,0.1)',
                    color: 'var(--color-warning)',
                  }}
                >
                  Internal Review
                </span>
              </div>
            </div>
          </div>

          {/* Status tracker */}
          <div
            className="card"
            style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-md) var(--spacing-xl)',
            }}
          >
            <WorkflowProgress
              sowId={sow?.id}
              currentStage={sow?.status || STAGE_KEYS.INTERNAL_REVIEW}
              reviewAssignments={reviewStatus?.assignments || []}
            />
          </div>

          {/* Two-column layout */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 'var(--spacing-lg)',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: checklist ? '3fr 2fr' : '1fr',
                gap: 'var(--spacing-lg)',
                alignItems: 'start',
              }}
            >
              {/* Left: SoW Content */}
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

              {/* Right: Review panel */}
              {checklist && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                  {/* Role badge */}
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
                      {checklist.display_name}
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

                  {/* AI Panel */}
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
                      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}
                    >
                      <button
                        className="btn btn-secondary"
                        onClick={handleSaveProgress}
                        disabled={saving}
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
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Review Status Footer */}
            {reviewStatus && (
              <div className="card" style={{ padding: 'var(--spacing-lg) var(--spacing-xl)' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-md)',
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    Review Status
                  </h4>
                  {reviewStatus.gating_rules_met && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleAdvance}
                      disabled={advancing}
                    >
                      {advancing ? 'Advancing...' : 'Advance to DRM →'}
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
                  {reviewStatus.assignments
                    .filter((a) => a.stage === STAGE_KEYS.ASSIGNMENT_INTERNAL_REVIEW)
                    .map((a, i) => {
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
                            border: '1px solid var(--color-border-default)',
                            fontSize: 'var(--font-size-sm)',
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
                          <span style={{ color: 'var(--color-text-primary)' }}>
                            {a.display_name}
                          </span>
                          <span style={{ color: 'var(--color-text-tertiary)' }}>
                            {a.decision
                              ? a.decision.replace(/-/g, ' ')
                              : a.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      );
                    })}
                </div>

                {!reviewStatus.gating_rules_met &&
                  reviewStatus.outstanding_requirements.length > 0 && (
                    <div
                      style={{
                        marginTop: 'var(--spacing-sm)',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      Outstanding: {reviewStatus.outstanding_requirements.join(' · ')}
                    </div>
                  )}
              </div>
            )}

            {/* Attachments */}
            {sow && (
              <div style={{ marginTop: 'var(--spacing-xl)', padding: '0 var(--spacing-xl)' }}>
                <AttachmentManager
                  sowId={sow.id}
                  stageKey={STAGE_KEYS.INTERNAL_REVIEW}
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
                  marginTop: 'var(--spacing-xl)',
                  padding: '0 var(--spacing-xl) var(--spacing-xl)',
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
                  marginTop: 'var(--spacing-xl)',
                  padding: '0 var(--spacing-xl) var(--spacing-xl)',
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
      </div>
    </>
  );
}
