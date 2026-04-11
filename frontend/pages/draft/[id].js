import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';
import AttachmentManager from '../../components/AttachmentManager';
import WorkflowProgress from '../../components/WorkflowProgress';
import WorkflowReadOnlySummary from '../../components/sow/WorkflowReadOnlySummary';
import ReviewerAssignmentPanel from '../../components/sow/ReviewerAssignmentPanel';
import ActivityLog from '../../components/ActivityLog';
import { getTabConfig } from '../../lib/draftTabs';
import { STAGE_KEYS } from '../../lib/workflowStages';

// ─── Methodology badge colours ────────────────────────────────────────────────

const METHODOLOGY_BADGE = {
  'Agile Sprint Delivery': { bg: '#1e3a5f', color: '#60a5fa' },
  'Sure Step 365': { bg: '#1e3a2e', color: '#4ade80' },
  Waterfall: { bg: '#2d2014', color: '#fbbf24' },
  'Cloud Adoption': { bg: '#2d1b4e', color: '#c084fc' },
};

// ─── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ savedAt }) {
  if (!savedAt) return null;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <motion.span
      key={savedAt}
      initial={{ opacity: 0.5, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="text-xs text-secondary"
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
      <span style={{ color: 'var(--color-success)' }}>●</span> Saved {time}
    </motion.span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const router = useRouter();
  const { id } = router.query;
  const { authFetch } = useAuth();

  const [sowData, setSowData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Persistence: load from backend on mount, debounced auto-save on edit.
  // The previous implementation used localStorage as the primary store,
  // which silently lost changes on browser switch / tab refresh and made
  // multi-user editing impossible.  Now we go straight to /api/sow/{id}.
  //
  // - lastServerContentRef holds the JSON string of the last content
  //   value the server is known to hold; the auto-save effect short-
  //   circuits when sowData matches it (avoiding the load → save echo).
  // - debounceTimerRef holds the in-flight debounce so handleSubmitForReview
  //   can cancel it before its own PATCH to prevent a save race.
  const lastServerContentRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // Load SoW from backend
  useEffect(() => {
    if (!id || !authFetch) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/sow/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          // Treat any non-OK as not-found for UI purposes; log so a
          // developer can distinguish a network error from a 404.
          console.warn(`Failed to load SoW ${id}: ${res.status}`);
          setNotFound(true);
          return;
        }
        const data = await res.json();
        const content = data.content || {};
        // Snapshot the loaded content so the auto-save effect can detect
        // that the next sowData change came from the server (not the user)
        // and skip the redundant PATCH-back.
        lastServerContentRef.current = JSON.stringify(content);
        setSowData(content);
        if (data.updated_at) setSavedAt(data.updated_at);
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load SoW:', err);
          setNotFound(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authFetch]);

  // Debounced auto-save: 750ms after the last edit, PATCH the SoW content
  // to /api/sow/{id}.  Skips when the current state already matches the
  // last value the server is known to hold (covers the load → set echo
  // and any redundant re-renders that don't actually change content).
  useEffect(() => {
    if (!sowData || !id || !authFetch) return;
    const serialized = JSON.stringify(sowData);
    if (serialized === lastServerContentRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      try {
        const res = await authFetch(`/api/sow/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: sowData }),
        });
        if (res.ok) {
          lastServerContentRef.current = serialized;
          setSavedAt(new Date().toISOString());
        }
      } catch {
        // Silent fail — the user can re-trigger by editing again.
      }
    }, 750);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [sowData, id, authFetch]);

  // Update a top-level section of the SoW data
  const updateSection = (section, value) => {
    setSowData((prev) => ({ ...prev, [section]: value }));
  };

  const [showConfirm, setShowConfirm] = useState(false);
  const [similarSows, setSimilarSows] = useState([]);
  const [showActivity, setShowActivity] = useState(false);

  // Fetch similar SoWs from AI proxy (non-blocking, silent fail)
  useEffect(() => {
    if (!id || !authFetch) return;
    authFetch(`/api/ai/sow/${id}/similar`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSimilarSows(data))
      .catch(() => {});
  }, [id, authFetch]);

  // ── Methodology-aware readiness checks ────────────────────────────────────
  const methodology = sowData?.deliveryMethodology;

  const hasExecutiveSummary = !!(
    sowData?.executiveSummary &&
    Object.keys(sowData.executiveSummary).some((k) => sowData.executiveSummary[k])
  );

  // Scope: Cloud Adoption uses cloudAdoptionScope, others use projectScope
  const scopeKey = methodology === 'Cloud Adoption' ? 'cloudAdoptionScope' : 'projectScope';
  const scopeLabel = methodology === 'Cloud Adoption' ? 'Cloud Adoption Scope' : 'Project Scope';
  const hasScope = !!(
    sowData?.[scopeKey] && Object.keys(sowData[scopeKey]).some((k) => sowData[scopeKey][k])
  );

  // Deliverables: Sure Step 365 uses phasesDeliverables, others use deliverables
  const deliverablesKey = methodology === 'Sure Step 365' ? 'phasesDeliverables' : 'deliverables';
  const deliverablesLabel =
    methodology === 'Sure Step 365'
      ? 'Phases & deliverables defined'
      : 'At least one deliverable added';
  const hasDeliverables = (() => {
    const val = sowData?.[deliverablesKey];
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    return Object.keys(val).some((k) => val[k]);
  })();

  const allRequiredMet = hasExecutiveSummary && hasScope && hasDeliverables;

  // Submit the SoW for review.  The backend resolves the SoW's workflow to
  // figure out which stage actually follows draft (it isn't always
  // ai_review — custom workflows may skip the AI review entirely), so we
  // inspect the returned status here to decide where to send the user.
  // Routing to /ai-review for a SoW that's already past ai_review breaks
  // that page, so we only go there when the backend says we landed in
  // ai_review.
  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    // Cancel any in-flight auto-save debounce so it can't race with the
    // submit PATCH below (and a stale auto-save can't fire after the SoW
    // has already transitioned out of draft).
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    try {
      // First, auto-save current content to backend
      await authFetch(`/api/sow/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sowData }),
      });

      // Then submit for review
      const res = await authFetch(`/api/sow/${id}/submit-for-review`, {
        method: 'POST',
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server error ${res.status}`);
      }

      const updated = await res.json().catch(() => ({}));
      if (updated?.status === STAGE_KEYS.AI_REVIEW) {
        router.push(`/ai-review?sowId=${id}`);
      } else {
        // The workflow doesn't have an AI review immediately after draft —
        // the SoW is now sitting in whatever stage the workflow points at
        // (e.g. an internal review). Drop the author at the SoW management
        // page so they can see the new stage and any reviewer assignments.
        router.push(`/sow/${id}/manage`);
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  };

  if (notFound) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p className="text-2xl font-semibold mb-md">SoW not found</p>
          <p className="text-secondary mb-xl">This SoW doesn't exist or may have been removed.</p>
          <Link href="/all-sows" className="btn btn-primary">
            Back to All SoWs
          </Link>
        </div>
      </div>
    );
  }

  if (!sowData) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner message="Loading SoW…" />
      </div>
    );
  }

  const tabs = getTabConfig(sowData.deliveryMethodology);
  const isLastTab = activeTab === tabs.length - 1;
  const badgeStyle = METHODOLOGY_BADGE[sowData.deliveryMethodology] ?? {
    bg: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };

  return (
    <>
      <Head>
        <title>{sowData.sowTitle || 'Untitled SoW'} – Draft – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {/* Page header */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-lg) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <Link
                href="/all-sows"
                style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              >
                All SoWs
              </Link>
              <span>›</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {sowData.sowTitle || 'Untitled SoW'}
              </span>
            </div>

            {/* Title row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-lg)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-xs)',
                    flexWrap: 'wrap',
                  }}
                >
                  <h1
                    className="text-2xl font-bold"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '600px',
                    }}
                  >
                    {sowData.sowTitle || 'Untitled SoW'}
                  </h1>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: badgeStyle.bg,
                      color: badgeStyle.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sowData.deliveryMethodology}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'rgba(251,191,36,0.12)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    ● Draft
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-xl)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    flexWrap: 'wrap',
                  }}
                >
                  {sowData.customerName && (
                    <span>
                      Customer:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.customerName}
                      </strong>
                    </span>
                  )}
                  {sowData.opportunityId && (
                    <span>
                      Opp ID:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.opportunityId}
                      </strong>
                    </span>
                  )}
                  {sowData.dealValue && (
                    <span>
                      Value:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        ${Number(sowData.dealValue).toLocaleString()}
                      </strong>
                    </span>
                  )}
                  <span
                    style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}
                  >
                    ID: {id}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  flexShrink: 0,
                }}
              >
                <SaveIndicator savedAt={savedAt} />
                {sowData.status && sowData.status !== 'draft' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => router.push(`/sow/${id}/manage`)}
                  >
                    Manage workflow
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => router.push('/all-sows')}>
                  All SoWs
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow progress */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: 'var(--spacing-md) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            <WorkflowProgress
              sowId={id}
              currentStage={sowData.status || 'draft'}
              reviewAssignments={[]}
            />
            <div style={{ marginTop: 'var(--spacing-sm)' }}>
              <WorkflowReadOnlySummary sowId={id} />
            </div>
            <div style={{ marginTop: 'var(--spacing-md)' }}>
              <ReviewerAssignmentPanel
                sowId={id}
                readOnly={(sowData.status || 'draft') !== 'draft'}
              />
              {sowData.status && sowData.status !== 'draft' && (
                <div
                  style={{
                    marginTop: 'var(--spacing-xs)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontStyle: 'italic',
                  }}
                >
                  Live edits available on{' '}
                  <a
                    href={`/sow/${id}/manage`}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/sow/${id}/manage`);
                    }}
                    style={{
                      color: 'var(--color-accent-blue)',
                      textDecoration: 'underline',
                    }}
                  >
                    /sow/{id}/manage
                  </a>
                  .
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: '0 var(--spacing-xl)',
            overflowX: 'auto',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto', display: 'flex' }}>
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight:
                    activeTab === idx ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                  color:
                    activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)',
                  borderBottom:
                    activeTab === idx
                      ? '2px solid var(--color-accent-blue)'
                      : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--transition-base), border-color var(--transition-base)',
                  marginBottom: '-1px',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== idx) e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== idx)
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor:
                      activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-bg-tertiary)',
                    color: activeTab === idx ? '#fff' : 'var(--color-text-tertiary)',
                    fontSize: '11px',
                    fontWeight: 'var(--font-weight-bold)',
                    marginRight: 'var(--spacing-xs)',
                  }}
                >
                  {idx + 1}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-2xl) var(--spacing-xl)',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {tabs.length > 0 && tabs[activeTab] ? (
                tabs[activeTab].render(sowData, updateSection)
              ) : (
                <p className="text-secondary">No content configured for this methodology.</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom navigation */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-sm)',
          }}
        >
          {submitError && (
            <p
              style={{
                textAlign: 'right',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
              }}
            >
              {submitError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
              disabled={activeTab === 0}
              style={{ opacity: activeTab === 0 ? 0.4 : 1 }}
            >
              ← Previous
            </button>

            <span className="text-sm text-secondary">
              {activeTab + 1} of {tabs.length}
            </span>

            {isLastTab ? (
              <button
                className="btn btn-primary"
                onClick={() => setShowConfirm(true)}
                disabled={isSubmitting || !allRequiredMet}
                style={{ opacity: isSubmitting || !allRequiredMet ? 0.6 : 1 }}
              >
                {isSubmitting ? 'Submitting…' : 'Submit for Review →'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setActiveTab((t) => Math.min(tabs.length - 1, t + 1))}
              >
                Next →
              </button>
            )}
          </div>
        </div>

        {/* Attachments Panel */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-lg)',
          }}
        >
          <AttachmentManager
            sowId={id}
            stageKey="draft"
            readOnly={false}
            showRequirements={true}
            authFetch={authFetch}
          />
        </div>

        {/* Submit Panel — Readiness checklist */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
          }}
        >
          <div
            className="card"
            style={{
              padding: 'var(--spacing-lg) var(--spacing-xl)',
              borderLeft: `3px solid ${allRequiredMet ? 'var(--color-success)' : 'var(--color-warning)'}`,
            }}
          >
            <h3 className="text-base font-semibold" style={{ marginBottom: 'var(--spacing-md)' }}>
              Ready to submit for review?
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasExecutiveSummary ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasExecutiveSummary ? '✓' : '✗'} Executive Summary completed
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasScope ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasScope ? '✓' : '✗'} {scopeLabel} defined
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasDeliverables ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasDeliverables ? '✓' : '✗'} {deliverablesLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Similar SoWs Panel */}
        {similarSows.length > 0 && (
          <div
            style={{
              maxWidth: 'var(--container-xl)',
              margin: '0 auto',
              padding: '0 var(--spacing-xl) var(--spacing-lg)',
            }}
          >
            <div className="card">
              <h3
                className="text-base font-semibold"
                style={{
                  marginBottom: 'var(--spacing-md)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-sm)',
                }}
              >
                <span style={{ color: 'var(--color-accent-purple-light)' }}>&#128279;</span>
                Similar SoWs
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {similarSows.map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                    }}
                  >
                    <div>
                      <p className="text-sm font-medium">{s.title}</p>
                      {s.methodology && <p className="text-xs text-tertiary">{s.methodology}</p>}
                      {s.overlap_areas?.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            gap: 'var(--spacing-xs)',
                            marginTop: 2,
                            flexWrap: 'wrap',
                          }}
                        >
                          {s.overlap_areas.map((a) => (
                            <span
                              key={a}
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                padding: '1px 6px',
                                borderRadius: 'var(--radius-full)',
                                backgroundColor: 'rgba(139,92,246,0.1)',
                                color: 'var(--color-accent-purple-light)',
                              }}
                            >
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        fontWeight: 600,
                        color: 'var(--color-accent-purple-light)',
                        whiteSpace: 'nowrap',
                        marginLeft: 'var(--spacing-md)',
                      }}
                    >
                      {Math.round(s.similarity * 100)}% match
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Activity Log Panel */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
          }}
        >
          <div className="card">
            <button
              onClick={() => setShowActivity((v) => !v)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              <h3 className="text-base font-semibold">Activity Log</h3>
              <span className="text-sm text-tertiary">{showActivity ? '▲ Hide' : '▼ Show'}</span>
            </button>
            {showActivity && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <ActivityLog sowId={id} />
              </div>
            )}
          </div>
        </div>

        {/* Confirmation modal */}
        {showConfirm && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowConfirm(false)}
          >
            <div
              className="card"
              style={{
                maxWidth: '480px',
                width: '90%',
                padding: 'var(--spacing-xl)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold" style={{ marginBottom: 'var(--spacing-md)' }}>
                Submit for Review
              </h3>
              <p
                className="text-secondary"
                style={{
                  marginBottom: 'var(--spacing-lg)',
                  lineHeight: 'var(--line-height-relaxed)',
                }}
              >
                This will submit the SoW for AI analysis. After reviewing the AI recommendations,
                you can proceed to internal review by the Solution Architect and SQA team.
              </p>
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}
              >
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
