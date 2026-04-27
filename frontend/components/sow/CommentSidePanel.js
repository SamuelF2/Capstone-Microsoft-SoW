/**
 * CommentSidePanel — list of highlight-anchored comment threads.
 *
 * Reviewers post comments by selecting text in the SoW reader; threads
 * appear here grouped by section. Each thread supports replies and
 * resolution. Clicking a thread jumps the reader to its anchor and
 * briefly selects the original highlighted span so the reviewer sees
 * what the comment is about.
 *
 * Stale threads (anchor text no longer matches the live SoW body) are
 * shown with a striped background and a "stale" badge — comments are
 * never deleted on author edits, so the conversation history survives
 * multiple review rounds.
 */

import { useState } from 'react';

const SECTION_LABEL_OVERRIDES = {
  executiveSummary: 'Executive Summary',
  projectScope: 'Project Scope',
  cloudAdoptionScope: 'Cloud Adoption Scope',
};

function humanise(key) {
  if (SECTION_LABEL_OVERRIDES[key]) return SECTION_LABEL_OVERRIDES[key];
  return String(key)
    .replace(/_/g, ' ')
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRelative(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export default function CommentSidePanel({
  threads = [],
  onJump,
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onApply,
  onReject,
  currentUserId,
  busyThreadId = null,
  loading = false,
  showResolved = false,
  onToggleResolved,
}) {
  const visibleThreads = showResolved ? threads : threads.filter((t) => !t.resolved_at);
  const grouped = {};
  for (const t of visibleThreads) {
    if (!grouped[t.section_key]) grouped[t.section_key] = [];
    grouped[t.section_key].push(t);
  }

  const sectionKeys = Object.keys(grouped);
  const resolvedCount = threads.filter((t) => t.resolved_at).length;

  return (
    <aside
      aria-label="Comments"
      className="custom-scrollbar"
      style={{
        borderLeft: '1px solid var(--color-border-default)',
        backgroundColor: 'var(--color-bg-secondary)',
        overflowY: 'auto',
        scrollbarGutter: 'stable',
        padding: '12px 8px',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-sm)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 6px',
          fontSize: '10px',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        <span>Comments ({visibleThreads.length})</span>
        {resolvedCount > 0 && (
          <button
            type="button"
            onClick={onToggleResolved}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--color-accent-blue, #2563eb)',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {showResolved ? 'Hide' : 'Show'} {resolvedCount} resolved
          </button>
        )}
      </div>

      {loading && (
        <p style={{ padding: '0 6px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          Loading comments…
        </p>
      )}

      {!loading && sectionKeys.length === 0 && (
        <p style={{ padding: '0 6px', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
          Highlight any text in the document and click the “+ Comment” button to start a thread.
        </p>
      )}

      {sectionKeys.map((skey) => (
        <div key={skey} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            style={{
              padding: '4px 6px 0',
              fontSize: '10px',
              color: 'var(--color-text-tertiary)',
              fontWeight: 'var(--font-weight-semibold)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {humanise(skey)}
          </div>
          {grouped[skey].map((t) => (
            <ThreadCard
              key={t.id}
              thread={t}
              busy={busyThreadId === t.id}
              currentUserId={currentUserId}
              onJump={onJump}
              onReply={onReply}
              onResolve={onResolve}
              onReopen={onReopen}
              onDelete={onDelete}
              onApply={onApply}
              onReject={onReject}
            />
          ))}
        </div>
      ))}
    </aside>
  );
}

const SUGGESTION_GREEN = '#16a34a';

function ThreadCard({
  thread,
  busy,
  currentUserId,
  onJump,
  onReply,
  onResolve,
  onReopen,
  onDelete,
  onApply,
  onReject,
}) {
  const [replying, setReplying] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const isStale = thread.is_stale;
  const isResolved = !!thread.resolved_at;
  const isAuthor = thread.author_id === currentUserId;
  const isSuggestion = thread.kind === 'suggestion';
  const isApplied = !!thread.applied_at;
  const isRejected = !!thread.rejected_at;
  const isPendingSuggestion = isSuggestion && !isApplied && !isRejected;
  const accentColor = isSuggestion ? SUGGESTION_GREEN : 'var(--color-accent-blue, #2563eb)';

  async function submitReply(e) {
    e.preventDefault();
    if (!replyBody.trim()) return;
    await onReply(thread.id, replyBody.trim());
    setReplyBody('');
    setReplying(false);
  }

  return (
    <div
      style={{
        border: `1px solid ${
          isSuggestion ? `${SUGGESTION_GREEN}55` : 'var(--color-border-default)'
        }`,
        borderLeft: `3px solid ${accentColor}`,
        borderRadius: '6px',
        backgroundColor: isResolved
          ? 'var(--color-bg-tertiary)'
          : isSuggestion
            ? 'rgba(22,163,74,0.04)'
            : 'var(--color-bg-primary)',
        opacity: isResolved ? 0.7 : 1,
        padding: '8px',
        ...(isStale && {
          backgroundImage:
            'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(245,158,11,0.07) 6px, rgba(245,158,11,0.07) 12px)',
        }),
      }}
    >
      {isSuggestion && (
        <div
          style={{
            fontSize: '10px',
            fontWeight: 'var(--font-weight-semibold)',
            color: SUGGESTION_GREEN,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '6px',
            display: 'flex',
            gap: '4px',
            alignItems: 'center',
          }}
        >
          <span>✎ Suggested edit</span>
          {isApplied && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(22,163,74,0.15)',
                color: SUGGESTION_GREEN,
                fontSize: '10px',
              }}
            >
              ✓ Applied
            </span>
          )}
          {isRejected && (
            <span
              style={{
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(239,68,68,0.12)',
                color: 'var(--color-error, #dc2626)',
                fontSize: '10px',
              }}
            >
              ✕ Rejected
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => onJump(thread)}
        title="Scroll to anchor"
        style={{
          width: '100%',
          textAlign: 'left',
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          color: 'inherit',
        }}
      >
        {isSuggestion ? (
          <div
            style={{
              fontSize: '12px',
              lineHeight: 1.5,
              padding: '6px 8px',
              borderRadius: '4px',
              backgroundColor: 'var(--color-bg-secondary)',
              marginBottom: '6px',
              wordBreak: 'break-word',
            }}
          >
            <div
              style={{
                color: 'var(--color-error, #dc2626)',
                textDecoration: 'line-through',
                opacity: 0.85,
              }}
            >
              {(thread.anchor_text || '').slice(0, 200)}
              {(thread.anchor_text || '').length > 200 ? '…' : ''}
            </div>
            <div
              style={{
                color: SUGGESTION_GREEN,
                fontWeight: 'var(--font-weight-medium)',
                marginTop: '2px',
              }}
            >
              {(thread.replacement_text || '').slice(0, 200)}
              {(thread.replacement_text || '').length > 200 ? '…' : ''}
            </div>
          </div>
        ) : (
          <div
            style={{
              fontSize: '11px',
              fontStyle: 'italic',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.45,
              paddingLeft: '8px',
              borderLeft: `3px solid ${
                isStale ? 'var(--color-warning, #f59e0b)' : 'var(--color-accent-blue, #2563eb)'
              }`,
              marginBottom: '6px',
              wordBreak: 'break-word',
            }}
          >
            “{(thread.anchor_text || '').slice(0, 140)}
            {(thread.anchor_text || '').length > 140 ? '…' : ''}”
          </div>
        )}
      </button>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {(thread.messages || []).map((m) => (
          <div key={m.id} style={{ fontSize: '12px', lineHeight: 1.5 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '11px',
                color: 'var(--color-text-tertiary)',
                marginBottom: '2px',
              }}
            >
              <span>{m.author_name || m.author_email || `User ${m.author_id}`}</span>
              <span>{formatRelative(m.created_at)}</span>
            </div>
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.body}</div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: '8px',
          display: 'flex',
          gap: '4px',
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: '11px',
        }}
      >
        {isStale && (
          <span
            style={{
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'rgba(245,158,11,0.15)',
              color: 'var(--color-warning, #d97706)',
              fontSize: '10px',
              fontWeight: 'var(--font-weight-semibold)',
            }}
            title="The highlighted text has changed since this comment was made."
          >
            stale
          </span>
        )}
        {isPendingSuggestion && thread.can_apply && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => onApply && onApply(thread.id)}
              style={{
                ...cardActionStyle(),
                color: 'white',
                backgroundColor: SUGGESTION_GREEN,
                borderColor: SUGGESTION_GREEN,
                fontWeight: 'var(--font-weight-semibold)',
              }}
              title="Apply this edit to the SoW content"
            >
              ✓ Accept
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onReject && onReject(thread.id)}
              style={{
                ...cardActionStyle(),
                color: 'var(--color-error, #dc2626)',
                borderColor: 'var(--color-error, #dc2626)',
              }}
              title="Reject this suggested edit"
            >
              ✕ Reject
            </button>
          </>
        )}
        {isPendingSuggestion && !thread.can_apply && thread.apply_blocked_reason && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
            }}
            title={thread.apply_blocked_reason}
          >
            Awaiting approval
          </span>
        )}
        {isResolved ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onReopen(thread.id)}
            style={cardActionStyle('reopen')}
          >
            ↺ Reopen
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setReplying((v) => !v)}
              style={cardActionStyle('reply')}
            >
              ↩ Reply
            </button>
            {!isPendingSuggestion && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onResolve(thread.id)}
                style={cardActionStyle('resolve')}
              >
                ✓ Resolve
              </button>
            )}
          </>
        )}
        {isAuthor && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (window.confirm('Delete this thread? This cannot be undone.')) {
                onDelete(thread.id);
              }
            }}
            style={{ ...cardActionStyle('delete'), marginLeft: 'auto' }}
          >
            Delete
          </button>
        )}
      </div>

      {replying && !isResolved && (
        <form onSubmit={submitReply} style={{ marginTop: '6px' }}>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            autoFocus
            rows={2}
            style={{
              width: '100%',
              fontSize: '12px',
              padding: '4px 6px',
              borderRadius: '4px',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
              fontFamily: 'inherit',
              resize: 'vertical',
              boxSizing: 'border-box',
            }}
          />
          <div
            style={{ display: 'flex', gap: '4px', marginTop: '4px', justifyContent: 'flex-end' }}
          >
            <button
              type="button"
              onClick={() => {
                setReplyBody('');
                setReplying(false);
              }}
              style={cardActionStyle('cancel')}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !replyBody.trim()}
              style={{
                ...cardActionStyle('reply'),
                color: 'white',
                backgroundColor: 'var(--color-accent-blue, #2563eb)',
                borderColor: 'var(--color-accent-blue, #2563eb)',
                opacity: busy || !replyBody.trim() ? 0.6 : 1,
              }}
            >
              Reply
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function cardActionStyle() {
  return {
    background: 'none',
    border: '1px solid var(--color-border-default)',
    borderRadius: 'var(--radius-sm)',
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: '11px',
    color: 'var(--color-text-secondary)',
  };
}
