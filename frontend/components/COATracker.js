/**
 * COATracker — displays and manages Conditions of Approval for a SoW.
 *
 * Shows a summary bar (open / resolved / waived counts), a filterable list
 * of conditions, and inline Resolve / Waive / Edit actions.
 *
 * Props
 * -----
 * sowId        integer                   — the SoW being tracked
 * readOnly     boolean                   — hide action buttons (for non-authors)
 * authFetch    function                  — authenticated fetch from useAuth()
 * onStatusChange () => void              — called after any status change
 */

import { useState, useEffect, useCallback } from 'react';

const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_COLOR = {
  critical: 'var(--color-error)',
  high: '#f97316',
  medium: '#eab308',
  low: 'var(--color-text-muted)',
};
const STATUS_COLOR = {
  open: 'var(--color-error)',
  in_progress: '#f97316',
  resolved: 'var(--color-success, #16a34a)',
  waived: 'var(--color-text-muted)',
};

function Badge({ label, color }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        color,
        border: `1px solid ${color}`,
        backgroundColor: `${color}18`,
      }}
    >
      {label.replace('_', ' ')}
    </span>
  );
}

export default function COATracker({ sowId, readOnly = false, authFetch, onStatusChange }) {
  const [coas, setCoas] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [resolving, setResolving] = useState(null); // coa_id being resolved
  const [waiving, setWaiving] = useState(null); // coa_id being waived
  const [resolutionNote, setResolutionNote] = useState('');

  // ``signal`` is optional — when called manually after a mutation we don't
  // need to cancel.  When invoked from the mount effect we pass the
  // controller's signal so unmount or filter-change cancels the in-flight
  // network request and discards stale state writes.
  const load = useCallback(
    async (signal) => {
      if (!sowId || !authFetch) return;
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (filterStatus) params.set('status', filterStatus);
        if (filterCategory) params.set('category', filterCategory);

        const [listRes, summaryRes] = await Promise.all([
          authFetch(`/api/coa/sow/${sowId}?${params}`, { signal }),
          authFetch(`/api/coa/sow/${sowId}/summary`, { signal }),
        ]);

        if (signal?.aborted) return;
        if (listRes.ok) {
          const data = await listRes.json();
          data.sort(
            (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
          );
          if (signal?.aborted) return;
          setCoas(data);
        }
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          if (signal?.aborted) return;
          setSummary(summaryData);
        }
      } catch (e) {
        if (e?.name === 'AbortError' || signal?.aborted) return;
        setError(e.message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sowId, authFetch, filterStatus, filterCategory]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const handleResolve = async (coaId) => {
    if (!resolutionNote.trim()) return;
    try {
      const res = await authFetch(`/api/coa/${coaId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: resolutionNote }),
      });
      if (res.ok) {
        setResolving(null);
        setResolutionNote('');
        await load();
        onStatusChange?.();
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const handleWaive = async (coaId) => {
    if (!resolutionNote.trim()) return;
    try {
      const res = await authFetch(`/api/coa/${coaId}/waive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_notes: resolutionNote }),
      });
      if (res.ok) {
        setWaiving(null);
        setResolutionNote('');
        await load();
        onStatusChange?.();
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const openModal = (type, coaId) => {
    setResolutionNote('');
    if (type === 'resolve') {
      setResolving(coaId);
      setWaiving(null);
    } else {
      setWaiving(coaId);
      setResolving(null);
    }
  };

  const closeModal = () => {
    setResolving(null);
    setWaiving(null);
    setResolutionNote('');
  };

  if (loading) {
    return (
      <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>Loading conditions…</p>
    );
  }

  return (
    <div style={{ marginTop: 'var(--spacing-lg)' }}>
      {/* Summary bar */}
      {summary && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-md)',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 'var(--spacing-md)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            background: summary.blocks_finalization
              ? 'rgba(220,38,38,0.06)'
              : 'rgba(22,163,74,0.06)',
            border: `1px solid ${summary.blocks_finalization ? 'rgba(220,38,38,0.25)' : 'rgba(22,163,74,0.25)'}`,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '13px' }}>
            Conditions of Approval ({summary.total})
          </span>
          <span style={{ color: STATUS_COLOR.open, fontSize: '12px' }}>{summary.open} open</span>
          <span style={{ color: STATUS_COLOR.in_progress, fontSize: '12px' }}>
            {summary.in_progress} in progress
          </span>
          <span style={{ color: STATUS_COLOR.resolved, fontSize: '12px' }}>
            {summary.resolved} resolved
          </span>
          <span style={{ color: STATUS_COLOR.waived, fontSize: '12px' }}>
            {summary.waived} waived
          </span>
          {summary.blocks_finalization && (
            <span
              style={{
                marginLeft: 'auto',
                color: 'var(--color-error)',
                fontWeight: 600,
                fontSize: '12px',
              }}
            >
              ⛔ Blocks finalization
            </span>
          )}
        </div>
      )}

      {error && (
        <p
          style={{
            color: 'var(--color-error)',
            fontSize: '12px',
            marginBottom: 'var(--spacing-sm)',
          }}
        >
          {error}
        </p>
      )}

      {/* Filters */}
      {coas.length > 2 && (
        <div
          style={{ display: 'flex', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}
        >
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
            <option value="waived">Waived</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            style={{
              fontSize: '12px',
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
              background: 'var(--color-bg-secondary)',
            }}
          >
            <option value="">All categories</option>
            <option value="technical">Technical</option>
            <option value="commercial">Commercial</option>
            <option value="legal">Legal</option>
            <option value="staffing">Staffing</option>
            <option value="general">General</option>
          </select>
        </div>
      )}

      {/* COA list */}
      {coas.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
          No conditions of approval recorded.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {coas.map((coa) => (
            <div
              key={coa.id}
              style={{
                padding: 'var(--spacing-md)',
                border: '1px solid var(--color-border-default)',
                borderLeft: `3px solid ${PRIORITY_COLOR[coa.priority] || 'var(--color-border-default)'}`,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 'var(--spacing-sm)',
                }}
              >
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 500, flex: 1 }}>
                  {coa.condition_text}
                </p>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <Badge label={coa.status} color={STATUS_COLOR[coa.status] || '#888'} />
                  <Badge label={coa.priority} color={PRIORITY_COLOR[coa.priority] || '#888'} />
                </div>
              </div>

              <div
                style={{
                  marginTop: '6px',
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    color: 'var(--color-text-muted)',
                    textTransform: 'capitalize',
                  }}
                >
                  {coa.category}
                </span>
                {coa.due_date && (
                  <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    Due: {coa.due_date}
                  </span>
                )}
                {coa.resolution_notes && (
                  <span style={{ fontSize: '11px', color: STATUS_COLOR.resolved }}>
                    ✓ {coa.resolution_notes}
                  </span>
                )}
              </div>

              {/* Actions */}
              {!readOnly && coa.status !== 'resolved' && coa.status !== 'waived' && (
                <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => openModal('resolve', coa.id)}
                    className="btn btn-sm btn-primary"
                    style={{ fontSize: '11px', padding: '3px 10px' }}
                  >
                    Resolve
                  </button>
                  <button
                    onClick={() => openModal('waive', coa.id)}
                    className="btn btn-sm btn-secondary"
                    style={{ fontSize: '11px', padding: '3px 10px' }}
                  >
                    Waive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Resolve / Waive modal */}
      {(resolving || waiving) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div
            style={{
              background: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-xl)',
              width: '100%',
              maxWidth: '480px',
              boxShadow: 'var(--shadow-xl, 0 20px 40px rgba(0,0,0,0.3))',
            }}
          >
            <h3 style={{ margin: '0 0 var(--spacing-md)' }}>
              {resolving ? 'Resolve Condition' : 'Waive Condition'}
            </h3>
            <p
              style={{
                fontSize: '13px',
                color: 'var(--color-text-muted)',
                marginBottom: 'var(--spacing-md)',
              }}
            >
              {resolving
                ? 'Provide notes describing how this condition was resolved.'
                : 'Provide justification for waiving this condition.'}
            </p>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder={
                resolving
                  ? 'e.g. Architecture review completed, signed off by SA on 2026-04-15'
                  : 'e.g. Waived per CPL approval — low risk given deal size'
              }
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: 'var(--spacing-sm)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                background: 'var(--color-bg-secondary)',
                color: 'inherit',
                fontSize: '13px',
                resize: 'vertical',
              }}
            />
            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-sm)',
                marginTop: 'var(--spacing-md)',
                justifyContent: 'flex-end',
              }}
            >
              <button onClick={closeModal} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => (resolving ? handleResolve(resolving) : handleWaive(waiving))}
                className={`btn ${resolving ? 'btn-primary' : 'btn-secondary'}`}
                disabled={!resolutionNote.trim()}
              >
                {resolving ? 'Mark Resolved' : 'Waive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
