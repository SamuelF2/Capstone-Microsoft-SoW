/**
 * pages/my-reviews.js
 *
 * Displays SoWs assigned to the current user for review.
 * Data comes from GET /api/review/assigned — no localStorage.
 */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';

const ASSIGNMENT_STATUS_STYLES = {
  pending: {
    color: 'var(--color-info)',
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    dot: 'var(--color-info)',
    label: 'Pending',
  },
  in_progress: {
    color: 'var(--color-accent-purple-light)',
    bg: 'rgba(139, 92, 246, 0.1)',
    border: 'rgba(139, 92, 246, 0.3)',
    dot: 'var(--color-accent-purple-light)',
    label: 'In Progress',
  },
  completed: {
    color: 'var(--color-success)',
    bg: 'rgba(74, 222, 128, 0.1)',
    border: 'rgba(74, 222, 128, 0.3)',
    dot: 'var(--color-success)',
    label: 'Completed',
  },
};

const ESAP_STYLES = {
  'type-1': { bg: 'rgba(239,68,68,0.1)', color: 'var(--color-error)' },
  'type-2': { bg: 'rgba(245,158,11,0.1)', color: 'var(--color-warning)' },
  'type-3': { bg: 'rgba(74,222,128,0.1)', color: 'var(--color-success)' },
};

const ROLE_DISPLAY = {
  'solution-architect': 'Solution Architect',
  'sqa-reviewer': 'SQA Reviewer',
  cpl: 'Customer Practice Lead',
  cdp: 'Customer Delivery Partner',
  'delivery-manager': 'Delivery Manager',
};

const STAGE_DISPLAY = {
  'internal-review': 'Internal Review',
  'drm-approval': 'DRM Approval',
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDeal(v) {
  if (v == null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : '$' + n.toLocaleString('en-US');
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

function ReviewCard({ assignment }) {
  const router = useRouter();
  const style = ASSIGNMENT_STATUS_STYLES[assignment.status] || ASSIGNMENT_STATUS_STYLES.pending;
  const esapStyle = ESAP_STYLES[assignment.esap_level] || {};
  const deal = formatDeal(assignment.deal_value);
  const reviewPath =
    assignment.stage === 'drm-approval'
      ? `/drm-review/${assignment.sow_id}`
      : `/internal-review/${assignment.sow_id}`;

  return (
    <div
      onClick={() => router.push(reviewPath)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color var(--transition-base), transform var(--transition-base)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-accent-blue)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-default)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div style={{ width: '5px', flexShrink: 0, backgroundColor: style.dot }} />
      <div
        style={{
          flex: 1,
          padding: 'var(--spacing-lg) var(--spacing-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-md)',
          }}
        >
          <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
            {assignment.sow_title}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexShrink: 0 }}>
            {assignment.esap_level && (
              <span
                style={{
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  ...esapStyle,
                }}
              >
                {assignment.esap_level.toUpperCase()}
              </span>
            )}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: style.color,
                backgroundColor: style.bg,
                border: `1px solid ${style.border}`,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: style.dot,
                  flexShrink: 0,
                }}
              />
              {style.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
          {assignment.customer_name && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Customer:</strong>{' '}
              {assignment.customer_name}
            </span>
          )}
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Your Role:</strong>{' '}
            {ROLE_DISPLAY[assignment.reviewer_role] || assignment.reviewer_role}
          </span>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Stage:</strong>{' '}
            {STAGE_DISPLAY[assignment.stage] || assignment.stage}
          </span>
          {deal && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Deal:</strong> {deal}
            </span>
          )}
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Assigned:</strong>{' '}
            {formatDate(assignment.assigned_at)}
          </span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: 'var(--spacing-lg)',
          borderLeft: '1px solid var(--color-border-default)',
          minWidth: '120px',
          justifyContent: 'center',
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(reviewPath);
          }}
          className="btn btn-primary btn-sm"
        >
          Review →
        </button>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MyReviews() {
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);
    authFetch('/api/review/assigned')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load reviews (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setAssignments(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user, authFetch]);

  const pending = assignments.filter((a) => a.status === 'pending');
  const inProgress = assignments.filter((a) => a.status === 'in_progress');
  const completed = assignments.filter((a) => a.status === 'completed');
  const tabItems = [
    { key: 'pending', label: 'Pending', count: pending.length },
    { key: 'in_progress', label: 'In Progress', count: inProgress.length },
    { key: 'completed', label: 'Completed', count: completed.length },
  ];
  const visibleAssignments =
    activeTab === 'pending' ? pending : activeTab === 'in_progress' ? inProgress : completed;

  return (
    <>
      <Head>
        <title>My Reviews – Cocoon</title>
      </Head>
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 'var(--spacing-2xl)',
            }}
          >
            <div>
              <h1 className="text-4xl font-bold mb-sm">My Reviews</h1>
              <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
                SoWs assigned to you for review.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/ai-review')}>
              + Upload for Review
            </button>
          </div>

          {loading && (
            <div
              style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-3xl)' }}
            >
              <Spinner />
            </div>
          )}

          {error && !loading && (
            <div
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(239,68,68,0.1)',
                color: 'var(--color-error)',
                marginBottom: 'var(--spacing-xl)',
              }}
            >
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-xs)',
                  marginBottom: 'var(--spacing-xl)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                {tabItems.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '8px 16px',
                      cursor: 'pointer',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: activeTab === tab.key ? 'var(--font-weight-semibold)' : 'normal',
                      color:
                        activeTab === tab.key
                          ? 'var(--color-accent-purple, #7c3aed)'
                          : 'var(--color-text-secondary)',
                      borderBottom:
                        activeTab === tab.key
                          ? '2px solid var(--color-accent-purple, #7c3aed)'
                          : '2px solid transparent',
                      marginBottom: '-1px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span
                        style={{
                          padding: '1px 7px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '11px',
                          backgroundColor:
                            activeTab === tab.key
                              ? 'var(--color-accent-purple, #7c3aed)'
                              : 'var(--color-bg-tertiary)',
                          color: activeTab === tab.key ? '#fff' : 'var(--color-text-secondary)',
                        }}
                      >
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {visibleAssignments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                  {visibleAssignments.map((a) => (
                    <ReviewCard key={a.id} assignment={a} />
                  ))}
                </div>
              ) : (
                <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📋</div>
                  <h3 className="text-xl font-semibold mb-sm">
                    No {tabItems.find((t) => t.key === activeTab)?.label.toLowerCase()} reviews
                  </h3>
                  <p className="text-secondary">
                    {activeTab === 'pending'
                      ? 'No reviews are waiting for you right now.'
                      : activeTab === 'in_progress'
                        ? 'No reviews currently in progress.'
                        : 'No completed reviews yet.'}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
