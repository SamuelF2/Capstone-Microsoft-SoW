/**
 * pages/all-sows.js
 *
 * Lists every SoW the authenticated user is a collaborator on.
 * Data comes from GET /api/sow which enforces the collaboration filter
 * server-side — no seed data, no localStorage reads.
 *
 * Unauthenticated users will see an empty list (the useEffect guard skips
 * the fetch if no token is present, and the app-level auth redirects them).
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';
import { formatDeal as formatDealValue, formatDate } from '../lib/format';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLOR = {
  draft: 'var(--color-text-secondary)',
  ai_review: 'var(--color-accent-blue, #1967d2)',
  internal_review: 'var(--color-warning)',
  drm_review: 'var(--color-accent-purple, #7c3aed)',
  approved: 'var(--color-success)',
  finalized: 'var(--color-accent-blue, #3f51b5)',
  rejected: 'var(--color-error)',
  // legacy
  in_review: 'var(--color-warning)',
};

// ── Status-aware action buttons ───────────────────────────────────────────────

function SoWActions({ sow, router }) {
  const { status, id } = sow;

  const btn = (label, href, variant = 'secondary') => (
    <button
      key={label}
      className={`btn btn-${variant} btn-sm`}
      style={{ whiteSpace: 'nowrap' }}
      onClick={(e) => {
        e.stopPropagation();
        router.push(href);
      }}
    >
      {label}
    </button>
  );

  switch (status) {
    case 'draft':
    case 'rejected':
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('Edit →', `/draft/${id}`, 'secondary')}
        </div>
      );

    case 'ai_review':
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('View AI Results →', `/ai-review?sowId=${id}`, 'secondary')}
        </div>
      );

    case 'internal_review':
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('Review Status →', `/internal-review/${id}`, 'secondary')}
        </div>
      );

    case 'drm_review':
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('DRM Status →', `/drm-review/${id}`, 'secondary')}
        </div>
      );

    case 'approved':
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('Finalize →', `/finalize/${id}`, 'primary')}
        </div>
      );

    case 'finalized':
      return (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {btn('View →', `/finalize/${id}`, 'secondary')}
        </div>
      );

    default:
      return (
        <div style={{ display: 'flex', gap: '6px' }}>
          {btn('View →', `/draft/${id}`, 'secondary')}
        </div>
      );
  }
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AllSoWs() {
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const [sows, setSows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchResults, setSearchResults] = useState(null); // null = not searching
  const debounceTimer = useRef(null);

  useEffect(() => {
    if (!user) return;
    setFetchError(null);
    authFetch('/api/sow')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load SoWs (${res.status})`);
        return res.json();
      })
      .then((data) => {
        setSows(data);
        setLoading(false);
      })
      .catch((err) => {
        setFetchError(err.message || 'Could not load SoWs. Please try again.');
        setLoading(false);
      });
  }, [user, authFetch]);

  // Debounced server-side full-text search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!user || search.length < 2) {
      setSearchResults(null);
      return;
    }
    debounceTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: search });
        if (filterMethod !== 'All') params.set('methodology', filterMethod);
        if (filterStatus !== 'All') params.set('status', filterStatus);
        const res = await authFetch(`/api/sow/search?${params}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        // Fall back to client-side filter on error
        setSearchResults(null);
      }
    }, 300);
    return () => clearTimeout(debounceTimer.current);
  }, [search, filterMethod, filterStatus, user, authFetch]);

  // Dynamically build the stage filter from loaded SoWs, so custom workflow
  // stages surface automatically. Uses stage_display_name from the workflow
  // snapshot (falls back to the raw status key with basic prettification).
  const stageOptions = useMemo(() => {
    const seen = new Map();
    const prettify = (s) =>
      s
        .split(/[-_]/)
        .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
        .join(' ');
    for (const sow of sows) {
      const key = sow.status || '';
      if (!key || seen.has(key)) continue;
      seen.set(key, sow.stage_display_name || prettify(key));
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [sows]);

  // Client-side filter used when search is short or server search is unavailable
  const filtered = useMemo(
    () =>
      sows.filter((s) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          (s.title ?? '').toLowerCase().includes(q) ||
          (s.customer_name ?? '').toLowerCase().includes(q) ||
          (s.opportunity_id ?? '').toLowerCase().includes(q);
        const matchMethod = filterMethod === 'All' || s.methodology === filterMethod;
        const matchStatus = filterStatus === 'All' || s.status === filterStatus;
        return matchSearch && matchMethod && matchStatus;
      }),
    [sows, search, filterMethod, filterStatus]
  );

  // What to display: server search results (if active) or client-side filtered list
  const displayedSows = searchResults !== null ? searchResults : filtered;

  const handleRowClick = (sow) => {
    switch (sow.status) {
      case 'draft':
      case 'rejected':
        router.push(`/draft/${sow.id}`);
        break;
      case 'ai_review':
        router.push(`/ai-review?sowId=${sow.id}`);
        break;
      case 'internal_review':
        router.push(`/internal-review/${sow.id}`);
        break;
      case 'drm_review':
        router.push(`/drm-review/${sow.id}`);
        break;
      case 'approved':
        router.push(`/finalize/${sow.id}`);
        break;
      case 'finalized':
        router.push(`/finalize/${sow.id}`);
        break;
      default:
        // Unknown stage key — route to draft as fallback
        router.push(`/draft/${sow.id}`);
    }
  };

  if (loading) {
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
        <Spinner message="Loading your SoWs…" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>All SoWs – Cocoon</title>
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
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 'var(--spacing-2xl)',
            }}
          >
            <div>
              <h1 className="text-4xl font-bold mb-sm">All SoWs</h1>
              <p className="text-secondary">
                Browse and manage all Statements of Work you are a collaborator on.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/create-new')}>
              + Create New
            </button>
          </div>

          {/* Error banner */}
          {fetchError && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>{fetchError}</span>
              <button
                className="btn btn-ghost btn-sm"
                style={{ color: 'var(--color-error)' }}
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          )}

          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-md)',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Search by title, customer, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ flex: '2', minWidth: '240px' }}
            />
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '160px' }}
            >
              <option value="All">All Methodologies</option>
              <option>Agile Sprint Delivery</option>
              <option>Sure Step 365</option>
              <option>Waterfall</option>
              <option>Cloud Adoption</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '140px' }}
            >
              <option value="All">All Stages</option>
              {stageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <p className="text-sm text-tertiary mb-md">
            {searchResults !== null
              ? `${searchResults.length} search result${searchResults.length !== 1 ? 's' : ''}`
              : `${filtered.length} SoW${filtered.length !== 1 ? 's' : ''} found`}
          </p>

          {/* Empty state */}
          {sows.length === 0 && (
            <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📄</div>
              <h3 className="text-xl font-semibold mb-sm">No SoWs yet</h3>
              <p className="text-secondary" style={{ marginBottom: 'var(--spacing-lg)' }}>
                You haven't been added as a collaborator on any SoW.
              </p>
              <button className="btn btn-primary" onClick={() => router.push('/create-new')}>
                Create New SoW
              </button>
            </div>
          )}

          {/* Table */}
          {(sows.length > 0 || searchResults !== null) && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border-default)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                    }}
                  >
                    {[
                      'Title',
                      'Customer',
                      'Methodology',
                      'Cycle',
                      'Value',
                      'Status',
                      'Updated',
                      '',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: 'var(--spacing-md) var(--spacing-lg)',
                          textAlign: 'left',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 'var(--font-weight-semibold)',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {displayedSows.map((sow, i) => (
                    <motion.tr
                      key={sow.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.2 }}
                      onClick={() => handleRowClick(sow)}
                      style={{
                        borderBottom:
                          i < displayedSows.length - 1
                            ? '1px solid var(--color-border-default)'
                            : 'none',
                        cursor: 'pointer',
                        backgroundColor: i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent',
                        transition: 'background-color var(--transition-base)',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor =
                          i % 2 === 1 ? 'rgba(255,255,255,0.02)' : 'transparent')
                      }
                    >
                      <td style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                        <p className="font-medium" style={{ marginBottom: '2px' }}>
                          {sow.title}
                        </p>
                        {sow.snippet && (
                          <p
                            className="text-xs text-tertiary"
                            style={{ marginTop: '2px' }}
                            dangerouslySetInnerHTML={{ __html: sow.snippet }}
                          />
                        )}
                        {sow.opportunity_id && (
                          <p className="text-xs text-tertiary">{sow.opportunity_id}</p>
                        )}
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        className="text-sm text-secondary"
                      >
                        {sow.customer_name ?? '—'}
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        className="text-sm text-secondary"
                      >
                        {sow.methodology ?? '—'}
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        className="text-sm text-secondary"
                      >
                        {sow.cycle != null ? `Cycle ${sow.cycle}` : '—'}
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        className="text-sm font-medium"
                      >
                        {formatDealValue(sow.deal_value)}
                      </td>

                      <td style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                        <span
                          style={{
                            color: STATUS_COLOR[sow.status] ?? 'var(--color-text-secondary)',
                            fontWeight: 'var(--font-weight-medium)',
                            fontSize: 'var(--font-size-sm)',
                          }}
                        >
                          ● {sow.stage_display_name ?? sow.status ?? '—'}
                        </span>
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        className="text-sm text-secondary"
                      >
                        {formatDate(sow.updated_at)}
                      </td>

                      <td
                        style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <SoWActions sow={sow} router={router} />
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>

              {displayedSows.length === 0 && (sows.length > 0 || searchResults !== null) && (
                <div style={{ padding: 'var(--spacing-3xl)', textAlign: 'center' }}>
                  <p className="text-secondary">
                    {searchResults !== null
                      ? 'No SoWs match your search.'
                      : 'No SoWs match your filters.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
