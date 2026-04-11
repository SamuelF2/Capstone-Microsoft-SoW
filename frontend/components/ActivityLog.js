import { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth';

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const EVENT_CONFIG = {
  status_change: { icon: '→', color: 'var(--color-accent-blue)' },
  review_submit: { icon: '✓', color: 'var(--color-success)' },
  coa_update: { icon: '◉', color: 'var(--color-warning)' },
  attachment_upload: { icon: '⊕', color: 'var(--color-accent-purple-light)' },
};

function EventIcon({ eventType }) {
  const cfg = EVENT_CONFIG[eventType] ?? { icon: '•', color: 'var(--color-text-secondary)' };
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: '50%',
        backgroundColor: 'var(--color-bg-tertiary)',
        border: `2px solid ${cfg.color}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: cfg.color,
        fontSize: '0.85rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {cfg.icon}
    </div>
  );
}

function MetadataDetails({ metadata }) {
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return (
    <pre
      style={{
        marginTop: 'var(--spacing-xs)',
        padding: 'var(--spacing-xs) var(--spacing-sm)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-bg-primary)',
        fontSize: 'var(--font-size-xs)',
        color: 'var(--color-text-tertiary)',
        overflowX: 'auto',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {JSON.stringify(metadata, null, 2)}
    </pre>
  );
}

function ActivityEntry({ entry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = entry.metadata && Object.keys(entry.metadata).length > 0;

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacing-md)',
        paddingBottom: 'var(--spacing-md)',
      }}
    >
      <EventIcon eventType={entry.event_type} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-sm)',
          }}
        >
          <p
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-primary)',
              lineHeight: 'var(--line-height-normal)',
            }}
          >
            {entry.description}
          </p>
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {timeAgo(entry.timestamp)}
          </span>
        </div>

        {entry.actor_name && (
          <p
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '2px',
            }}
          >
            by {entry.actor_name}
          </p>
        )}

        {hasDetails && (
          <button
            onClick={() => setExpanded((v) => !v)}
            style={{
              marginTop: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-accent-blue)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
        {expanded && <MetadataDetails metadata={entry.metadata} />}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ActivityLog({ sowId }) {
  const { authFetch } = useAuth();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const LIMIT = 20;

  const loadEntries = async (reset = false, signal) => {
    if (!sowId || !authFetch) return;
    const currentOffset = reset ? 0 : offset;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch(
        `/api/audit/sow/${sowId}?limit=${LIMIT}&offset=${currentOffset}`,
        { signal }
      );
      if (!res.ok) throw new Error(`Failed to load activity (${res.status})`);
      const data = await res.json();
      if (signal?.aborted) return;
      setEntries((prev) => (reset ? data : [...prev, ...data]));
      setOffset(currentOffset + data.length);
      setHasMore(data.length === LIMIT);
    } catch (err) {
      if (err?.name === 'AbortError' || signal?.aborted) return;
      setError(err.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    setEntries([]);
    setOffset(0);
    setHasMore(true);
    loadEntries(true, ctrl.signal);
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sowId]);

  if (loading && entries.length === 0) {
    return (
      <p className="text-sm text-tertiary" style={{ padding: 'var(--spacing-md) 0' }}>
        Loading activity…
      </p>
    );
  }

  if (error) {
    return (
      <p
        className="text-sm"
        style={{ color: 'var(--color-error)', padding: 'var(--spacing-md) 0' }}
      >
        Could not load activity log.
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-tertiary" style={{ padding: 'var(--spacing-md) 0' }}>
        No activity recorded yet.
      </p>
    );
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
        }}
      >
        {entries.map((entry, i) => (
          <div key={`${entry.event_type}-${entry.id}-${i}`}>
            <ActivityEntry entry={entry} />
            {i < entries.length - 1 && (
              <div
                style={{
                  marginLeft: 15,
                  width: 2,
                  height: 'var(--spacing-sm)',
                  backgroundColor: 'var(--color-border-default)',
                  marginBottom: 'var(--spacing-sm)',
                }}
              />
            )}
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => loadEntries(false)}
          disabled={loading}
          className="btn btn-ghost btn-sm"
          style={{ marginTop: 'var(--spacing-md)', width: '100%' }}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
