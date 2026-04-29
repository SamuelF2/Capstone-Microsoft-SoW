/**
 * pages/schema-proposals.js
 *
 * Admin-only dashboard for reviewing LLM-discovered SchemaProposal nodes.
 *
 * Lifecycle
 * ─────────
 *  • On mount (and whenever the user is loaded), fetch the full proposal
 *    list from /api/ai/schema/proposals. We always pull every status so
 *    the stats bar can show today/week counts client-side without a
 *    second round-trip.
 *  • Filters and sort run client-side (`useMemo`) — the dataset is small
 *    (one proposal per (kind, label) across all docs).
 *  • Approve / reject use optimistic updates: the row's accepted/rejected
 *    flags + reviewed_at are updated locally so the status pill flips
 *    instantly; on success we refetch the canonical list to pick up
 *    server-generated fields. On failure we revert and surface an error.
 *  • Bulk reject uses the same modal as single reject so the admin can
 *    annotate a batch with one shared note.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';
import aiClient from '../lib/ai';
import useLocalStoragePref from '../lib/hooks/useLocalStoragePref';
import {
  ProposalsStatsBar,
  ProposalsFilters,
  ProposalsToolbar,
  ProposalsTable,
  ProposalsGraphView,
  ProposalDetailDrawer,
  RejectProposalModal,
  ProposalsEmptyState,
  proposalStatus,
} from '../components/proposals';

const TAB_QUEUE = 'queue';
const TAB_GRAPH = 'graph';

function ForbiddenPanel() {
  return (
    <div
      style={{
        minHeight: 'calc(100vh - 80px)',
        backgroundColor: 'var(--color-bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-2xl)',
      }}
    >
      <div
        className="card text-center"
        style={{
          padding: 'var(--spacing-3xl)',
          maxWidth: 480,
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border-default)',
          borderRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🔒</div>
        <h2 className="text-xl font-semibold mb-sm">System admin access required</h2>
        <p className="text-secondary">
          The schema-proposal queue is restricted to system administrators because approving a
          proposal mutates the shared knowledge graph schema.
        </p>
      </div>
    </div>
  );
}

function TabButton({ active, label, onClick, badge }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        fontSize: 'var(--font-size-sm)',
        fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
        color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
        borderBottom: `2px solid ${active ? 'var(--color-accent-blue)' : 'transparent'}`,
        cursor: 'pointer',
        position: 'relative',
        transition: 'color var(--transition-base)',
      }}
    >
      {label}
      {badge != null && (
        <span
          style={{
            marginLeft: 8,
            fontSize: 'var(--font-size-xs)',
            backgroundColor: 'var(--color-bg-tertiary)',
            color: 'var(--color-text-secondary)',
            padding: '1px 8px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default function SchemaProposalsPage() {
  const { user, loading: authLoading, authFetch } = useAuth();
  const isSystemAdmin = user?.role === 'system-admin';

  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success'|'error', text }
  const [busyIds, setBusyIds] = useState(new Set());

  const [tab, setTab] = useState(TAB_QUEUE);
  const [kind, setKind] = useLocalStoragePref('prefs:schema-proposals:kind', 'all');
  const [status, setStatus] = useLocalStoragePref('prefs:schema-proposals:status', 'pending');
  const [sort, setSort] = useLocalStoragePref('prefs:schema-proposals:sort', 'confidence-desc');
  const [search, setSearch] = useState('');

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [detailId, setDetailId] = useState(null);
  const [rejectingIds, setRejectingIds] = useState(null); // null | string[]

  // Track whether we've kicked off the first fetch so we don't loop.
  const firstFetchRef = useRef(false);

  const fetchProposals = useCallback(
    async (signal) => {
      const result = await aiClient.schemaProposals(authFetch, { signal });
      if (!result.ok) {
        setError(result.error.message);
        setLoading(false);
        return;
      }
      setProposals(result.data || []);
      setError(null);
      setLoading(false);
    },
    [authFetch]
  );

  useEffect(() => {
    if (!user || !isSystemAdmin) return undefined;
    if (firstFetchRef.current) return undefined;
    firstFetchRef.current = true;
    const ctrl = new AbortController();
    setLoading(true);
    fetchProposals(ctrl.signal);
    return () => ctrl.abort();
  }, [user, isSystemAdmin, fetchProposals]);

  // Clear selection when filters change so an invisible row never gets
  // bulk-actioned by accident.
  useEffect(() => {
    setSelectedIds(new Set());
  }, [kind, status, search]);

  // Auto-dismiss the inline action banner after a few seconds.
  useEffect(() => {
    if (!actionMessage) return undefined;
    const id = setTimeout(() => setActionMessage(null), 3500);
    return () => clearTimeout(id);
  }, [actionMessage]);

  // Apply filters + sort client-side.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = proposals.filter((p) => {
      if (kind !== 'all' && p.kind !== kind) return false;
      const ps = proposalStatus(p);
      if (status !== 'all' && ps !== status) return false;
      if (q) {
        const hay = `${p.label || ''} ${p.source || ''} ${p.description || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    list = [...list].sort((a, b) => {
      const dir = sort.endsWith('-asc') ? 1 : -1;
      if (sort.startsWith('confidence')) {
        return ((a.confidence || 0) - (b.confidence || 0)) * dir;
      }
      if (sort.startsWith('date')) {
        const ta = a.proposed_at ? new Date(a.proposed_at).getTime() : 0;
        const tb = b.proposed_at ? new Date(b.proposed_at).getTime() : 0;
        return (ta - tb) * dir;
      }
      if (sort.startsWith('uses')) {
        return ((a.uses || 0) - (b.uses || 0)) * dir;
      }
      return 0;
    });
    return list;
  }, [proposals, kind, status, search, sort]);

  // Pending count for the queue tab badge.
  const pendingCount = useMemo(
    () => proposals.filter((p) => proposalStatus(p) === 'pending').length,
    [proposals]
  );

  const detailProposal = useMemo(
    () => (detailId ? proposals.find((p) => p.id === detailId) || null : null),
    [proposals, detailId]
  );

  const markBusy = (ids, busy) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (busy) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  // Optimistically flip flags for one or more proposals; returns the prior
  // values so the caller can revert on error.
  const applyOptimistic = (ids, action) => {
    const snapshot = new Map();
    setProposals((prev) =>
      prev.map((p) => {
        if (!ids.includes(p.id)) return p;
        snapshot.set(p.id, {
          accepted: p.accepted,
          rejected: p.rejected,
          reviewed_at: p.reviewed_at,
          reviewed_by: p.reviewed_by,
        });
        return {
          ...p,
          accepted: action === 'approve',
          rejected: action === 'reject',
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.email || user?.full_name || 'admin',
        };
      })
    );
    return snapshot;
  };

  const revertOptimistic = (snapshot) => {
    setProposals((prev) =>
      prev.map((p) => (snapshot.has(p.id) ? { ...p, ...snapshot.get(p.id) } : p))
    );
  };

  const handleApprove = useCallback(
    async (proposalId) => {
      markBusy([proposalId], true);
      const snapshot = applyOptimistic([proposalId], 'approve');
      const result = await aiClient.approveProposal(authFetch, proposalId);
      markBusy([proposalId], false);
      if (!result.ok) {
        revertOptimistic(snapshot);
        setActionMessage({ type: 'error', text: `Approve failed: ${result.error.message}` });
        return;
      }
      setActionMessage({ type: 'success', text: 'Proposal approved.' });
      // Refresh to pick up server-generated reviewed_at + any other fields.
      fetchProposals();
    },
    [authFetch, fetchProposals, user]
  );

  const handleRejectRequest = useCallback((proposalId) => {
    setRejectingIds([proposalId]);
  }, []);

  const handleBulkApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    markBusy(ids, true);
    const snapshot = applyOptimistic(ids, 'approve');
    const result = await aiClient.bulkReviewProposals(authFetch, {
      ids,
      action: 'approve',
    });
    markBusy(ids, false);
    if (!result.ok) {
      revertOptimistic(snapshot);
      setActionMessage({
        type: 'error',
        text: `Bulk approve failed: ${result.error.message}`,
      });
      return;
    }
    setActionMessage({ type: 'success', text: `${ids.length} proposals approved.` });
    setSelectedIds(new Set());
    fetchProposals();
  }, [selectedIds, authFetch, fetchProposals, user]);

  const handleBulkRejectRequest = useCallback(() => {
    if (selectedIds.size === 0) return;
    setRejectingIds(Array.from(selectedIds));
  }, [selectedIds]);

  const handleConfirmReject = useCallback(
    async ({ ids, tags, note }) => {
      if (!ids || ids.length === 0) {
        setRejectingIds(null);
        return;
      }
      markBusy(ids, true);
      const snapshot = applyOptimistic(ids, 'reject');
      const result =
        ids.length === 1
          ? await aiClient.rejectProposal(authFetch, ids[0], { tags, note })
          : await aiClient.bulkReviewProposals(authFetch, {
              ids,
              action: 'reject',
              tags,
              note,
            });
      markBusy(ids, false);
      setRejectingIds(null);
      if (!result.ok) {
        revertOptimistic(snapshot);
        setActionMessage({ type: 'error', text: `Reject failed: ${result.error.message}` });
        return;
      }
      setActionMessage({
        type: 'success',
        text: ids.length === 1 ? 'Proposal rejected.' : `${ids.length} proposals rejected.`,
      });
      if (ids.length > 1) setSelectedIds(new Set());
      fetchProposals();
    },
    [authFetch, fetchProposals, user]
  );

  const handleToggle = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback((visibleIds, shouldSelect) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (shouldSelect) {
        for (const id of visibleIds) next.add(id);
      } else {
        for (const id of visibleIds) next.delete(id);
      }
      return next;
    });
  }, []);

  const handleClearFilters = () => {
    setKind('all');
    setStatus('all');
    setSearch('');
  };

  // ── render ────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner />
      </div>
    );
  }

  if (user && !isSystemAdmin) return <ForbiddenPanel />;

  return (
    <>
      <Head>
        <title>Schema Proposals – Cocoon</title>
      </Head>
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold" style={{ marginBottom: 'var(--spacing-sm)' }}>
              Schema Proposals
            </h1>
            <p className="text-secondary" style={{ lineHeight: 1.5, maxWidth: 720 }}>
              LLM-discovered node types, edge types, and section types awaiting human review.
              Approving a proposal makes the type writable in the knowledge graph; rejecting it
              keeps it filtered out of future ingestion.
            </p>
          </div>

          {loading && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                padding: 'var(--spacing-3xl)',
              }}
            >
              <Spinner message="Loading proposals…" />
            </div>
          )}

          {error && !loading && (
            <div
              className="alert alert-error"
              style={{ marginBottom: 'var(--spacing-lg)' }}
              role="alert"
            >
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              <ProposalsStatsBar proposals={proposals} />

              {/* Tab strip */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <TabButton
                  active={tab === TAB_QUEUE}
                  label="Queue"
                  onClick={() => setTab(TAB_QUEUE)}
                  badge={pendingCount}
                />
                <TabButton
                  active={tab === TAB_GRAPH}
                  label="Graph view"
                  onClick={() => setTab(TAB_GRAPH)}
                />
              </div>

              <ProposalsFilters
                kind={kind}
                setKind={setKind}
                status={status}
                setStatus={setStatus}
                sort={sort}
                setSort={setSort}
                search={search}
                setSearch={setSearch}
              />

              <AnimatePresence mode="wait">
                {actionMessage && (
                  <motion.div
                    key={actionMessage.text}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`alert alert-${actionMessage.type === 'success' ? 'success' : 'error'}`}
                    style={{ marginBottom: 'var(--spacing-md)' }}
                  >
                    {actionMessage.text}
                  </motion.div>
                )}
              </AnimatePresence>

              {tab === TAB_QUEUE && (
                <>
                  <ProposalsToolbar
                    selectedCount={selectedIds.size}
                    onBulkApprove={handleBulkApprove}
                    onBulkReject={handleBulkRejectRequest}
                    onClear={() => setSelectedIds(new Set())}
                    busy={busyIds.size > 0}
                  />

                  {filtered.length === 0 ? (
                    <ProposalsEmptyState
                      totalCount={proposals.length}
                      onClearFilters={handleClearFilters}
                    />
                  ) : (
                    <ProposalsTable
                      proposals={filtered}
                      selectedIds={selectedIds}
                      onToggle={handleToggle}
                      onToggleAll={handleToggleAll}
                      onApprove={handleApprove}
                      onReject={handleRejectRequest}
                      onRowClick={setDetailId}
                      sort={sort}
                      onSortChange={setSort}
                      busyIds={busyIds}
                    />
                  )}
                </>
              )}

              {tab === TAB_GRAPH && (
                <ProposalsGraphView proposals={filtered} onSelectProposal={setDetailId} />
              )}
            </>
          )}
        </div>
      </div>

      <ProposalDetailDrawer
        proposal={detailProposal}
        open={!!detailProposal}
        onClose={() => setDetailId(null)}
        onApprove={async (id) => {
          await handleApprove(id);
          setDetailId(null);
        }}
        onReject={(id) => {
          setDetailId(null);
          handleRejectRequest(id);
        }}
        busy={detailProposal ? busyIds.has(detailProposal.id) : false}
      />

      <RejectProposalModal
        open={!!rejectingIds}
        ids={rejectingIds || []}
        onClose={() => setRejectingIds(null)}
        onConfirm={handleConfirmReject}
        busy={rejectingIds ? rejectingIds.some((id) => busyIds.has(id)) : false}
      />
    </>
  );
}
