/**
 * pages/drm-dashboard.js
 *
 * Landing page for DRM reviewers (CPL, CDP, Delivery Manager).
 * Shows all SoWs in drm-approval stage assigned to the current user.
 * Data from GET /api/review/assigned?stage=drm-approval
 */

import { useState, useEffect, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';
import { formatDate, formatDeal } from '../lib/format';
import { roleLabel } from '../lib/workflowStages';

const ESAP_STYLES = {
  'type-1': { bg: 'rgba(239,68,68,0.1)', color: 'var(--color-error)', label: 'TYPE-1' },
  'type-2': { bg: 'rgba(245,158,11,0.1)', color: 'var(--color-warning)', label: 'TYPE-2' },
  'type-3': { bg: 'rgba(74,222,128,0.1)', color: 'var(--color-success)', label: 'TYPE-3' },
};

const STATUS_STYLES = {
  pending: {
    color: 'var(--color-info)',
    bg: 'rgba(59,130,246,0.1)',
    dot: 'var(--color-info)',
    label: 'Pending',
  },
  in_progress: {
    color: 'var(--color-accent-purple-light)',
    bg: 'rgba(139,92,246,0.1)',
    dot: 'var(--color-accent-purple-light)',
    label: 'In Progress',
  },
  completed: {
    color: 'var(--color-success)',
    bg: 'rgba(74,222,128,0.1)',
    dot: 'var(--color-success)',
    label: 'Completed',
  },
};

// ── DRM SoW Card ──────────────────────────────────────────────────────────────

function DrmCard({ assignment }) {
  const router = useRouter();
  const esapStyle = ESAP_STYLES[assignment.esap_level] || {};
  const statusStyle = STATUS_STYLES[assignment.status] || STATUS_STYLES.pending;
  const deal = formatDeal(assignment.deal_value, null);

  return (
    <div
      onClick={() => router.push(`/drm-review/${assignment.sow_id}`)}
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'stretch',
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
      {/* Status stripe */}
      <div style={{ width: '5px', flexShrink: 0, backgroundColor: statusStyle.dot }} />

      {/* Main content */}
      <div
        style={{
          flex: 1,
          padding: 'var(--spacing-lg) var(--spacing-xl)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
        }}
      >
        {/* Title row */}
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
                {esapStyle.label || assignment.esap_level.toUpperCase()}
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
                color: statusStyle.color,
                backgroundColor: statusStyle.bg,
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: statusStyle.dot,
                  flexShrink: 0,
                }}
              />
              {statusStyle.label}
            </span>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
          {assignment.customer_name && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Customer:</strong>{' '}
              {assignment.customer_name}
            </span>
          )}
          {deal && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Deal:</strong> {deal}
            </span>
          )}
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Your Role:</strong>{' '}
            {roleLabel(assignment.reviewer_role)}
          </span>
          {assignment.methodology && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Methodology:</strong>{' '}
              {assignment.methodology}
            </span>
          )}
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Assigned:</strong>{' '}
            {formatDate(assignment.assigned_at)}
          </span>
        </div>
      </div>

      {/* CTA */}
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
            router.push(`/drm-review/${assignment.sow_id}`);
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

export default function DrmDashboard() {
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [esapFilter, setEsapFilter] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setLoading(true);
    setError(null);
    authFetch('/api/review/assigned?stage=drm-approval', { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load DRM assignments (${res.status})`);
        return res.json();
      })
      .then((data) => {
        if (signal.aborted) return;
        setAssignments(data);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return;
        setError(err.message);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [user, authFetch]);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (esapFilter !== 'all' && a.esap_level !== esapFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (a.sow_title || '').toLowerCase().includes(q) ||
          (a.customer_name || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [assignments, statusFilter, esapFilter, search]);

  const pendingCount = assignments.filter((a) => a.status === 'pending').length;
  const inProgressCount = assignments.filter((a) => a.status === 'in_progress').length;
  const completedCount = assignments.filter((a) => a.status === 'completed').length;

  return (
    <>
      <Head>
        <title>DRM Dashboard – Cocoon</title>
      </Head>
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">Deal Review Meeting Dashboard</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              SoWs awaiting your DRM approval.
            </p>
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
              {/* Stats bar */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-xl)',
                  flexWrap: 'wrap',
                }}
              >
                {[
                  { label: 'Pending', count: pendingCount, color: 'var(--color-info)' },
                  {
                    label: 'In Progress',
                    count: inProgressCount,
                    color: 'var(--color-accent-purple-light)',
                  },
                  { label: 'Completed', count: completedCount, color: 'var(--color-success)' },
                ].map(({ label, count, color }) => (
                  <div
                    key={label}
                    style={{
                      flex: '1 1 120px',
                      padding: 'var(--spacing-md) var(--spacing-lg)',
                      borderRadius: 'var(--radius-lg)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-default)',
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '1.75rem',
                        fontWeight: 'var(--font-weight-bold)',
                        color,
                        lineHeight: 1,
                      }}
                    >
                      {count}
                    </div>
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        marginTop: '4px',
                      }}
                    >
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  marginBottom: 'var(--spacing-xl)',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>

                <select
                  value={esapFilter}
                  onChange={(e) => setEsapFilter(e.target.value)}
                  style={{
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: 'pointer',
                  }}
                >
                  <option value="all">All ESAP Levels</option>
                  <option value="type-1">Type-1</option>
                  <option value="type-2">Type-2</option>
                  <option value="type-3">Type-3</option>
                </select>

                <input
                  type="text"
                  placeholder="Search by title or customer…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '6px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                />
              </div>

              {/* Cards */}
              {filtered.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                  {filtered.map((a) => (
                    <DrmCard key={a.id} assignment={a} />
                  ))}
                </div>
              ) : (
                <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📋</div>
                  <h3 className="text-xl font-semibold mb-sm">No DRM reviews found</h3>
                  <p className="text-secondary">
                    {assignments.length === 0
                      ? 'No SoWs are currently assigned to you for DRM review.'
                      : 'No results match the current filters.'}
                  </p>
                  {assignments.length > 0 && (
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ marginTop: 'var(--spacing-md)' }}
                      onClick={() => {
                        setStatusFilter('all');
                        setEsapFilter('all');
                        setSearch('');
                      }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
