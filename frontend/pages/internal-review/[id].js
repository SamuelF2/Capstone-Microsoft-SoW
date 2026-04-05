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

import { useState, useEffect, useCallback } from 'react';
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

// ── SoW content read-only renderer ───────────────────────────────────────────

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

function SoWContentPanel({ sow, activeTab, onTabChange }) {
  const content = sow?.content || {};

  // Filter groups to only those with content
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
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: '1px solid var(--color-border-default)',
          overflowX: 'auto',
          flexShrink: 0,
          paddingBottom: '-1px',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.label}
            onClick={() => onTabChange(tab.label)}
            style={{
              background: 'none',
              border: 'none',
              padding: '8px 14px',
              fontSize: 'var(--font-size-sm)',
              fontWeight: currentTab.label === tab.label ? 'var(--font-weight-semibold)' : 'normal',
              color:
                currentTab.label === tab.label
                  ? 'var(--color-accent-purple, #7c3aed)'
                  : 'var(--color-text-secondary)',
              borderBottom:
                currentTab.label === tab.label
                  ? '2px solid var(--color-accent-purple, #7c3aed)'
                  : '2px solid transparent',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginBottom: '-1px',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
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
        {currentTab.keys.filter((k) => content[k] != null).length === 0 && (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
            No content for this section yet.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Decision modal ────────────────────────────────────────────────────────────

function DecisionModal({ type, onClose, onSubmit, submitting }) {
  const [comments, setComments] = useState('');
  const [conditions, setConditions] = useState(['']);

  const isReject = type === 'rejected';
  const isConditional = type === 'approved-with-conditions';

  function addCondition() {
    setConditions((c) => [...c, '']);
  }
  function updateCondition(i, val) {
    setConditions((c) => c.map((x, j) => (j === i ? val : x)));
  }
  function removeCondition(i) {
    setConditions((c) => c.filter((_, j) => j !== i));
  }

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
          {isReject ? 'Reject SoW' : isConditional ? 'Approve with Conditions' : 'Confirm Approval'}
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
                ? 'Describe the issues that need to be addressed...'
                : 'Optional comments for the author...'
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
                  onChange={(e) => updateCondition(i, e.target.value)}
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
                    onClick={() => removeCondition(i)}
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
              onClick={addCondition}
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
            {submitting ? 'Submitting...' : isReject ? 'Reject' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InternalReview() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  const [sow, setSow] = useState(null);
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
  const [modal, setModal] = useState(null); // null | 'rejected' | 'approved-with-conditions'
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // ── Load SoW, checklist, review status ───────────────────────────────────

  useEffect(() => {
    if (!id || !user) return;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [sowRes, checkRes, statusRes] = await Promise.all([
          authFetch(`/api/sow/${id}`),
          authFetch(`/api/review/${id}/checklist`),
          authFetch(`/api/review/${id}/status`),
        ]);

        if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);
        if (!checkRes.ok && checkRes.status !== 403)
          throw new Error(`Checklist load failed (${checkRes.status})`);

        const sowData = await sowRes.json();
        setSow(sowData);

        if (checkRes.ok) {
          const checkData = await checkRes.json();
          setChecklist(checkData);
          setResponses(checkData.saved_responses || []);
        }

        if (statusRes.ok) {
          const statusData = await statusRes.json();
          setReviewStatus(statusData);
        }

        // Load AI analysis if linked
        if (sowData.ai_suggestion_id) {
          const aiRes = await authFetch(`/api/sow/${id}/ai-analyze`);
          if (aiRes.ok) setAiAnalysis(await aiRes.json());
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, user, authFetch]);

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
      // Reload review status
      const statusRes = await authFetch(`/api/review/${id}/status`);
      if (statusRes.ok) setReviewStatus(await statusRes.json());
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
    (a) => a.status === 'completed' && a.stage === 'internal-review'
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
              currentStage={sow?.status || 'internal_review'}
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
                    .filter((a) => a.stage === 'internal-review')
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
                  stageKey="internal_review"
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
