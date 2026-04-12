/**
 * AssistChat — collapsible chat panel that talks to /api/ai/assist.
 *
 * Maintains a per-mount conversation history, sends each turn through
 * aiClient.assist (non-streaming for now — the streaming endpoint always
 * 503s until ML ships it), and renders the running transcript with a
 * compact AIUnavailableBanner on failure.
 */

import { useEffect, useRef, useState } from 'react';
import { aiClient } from '../../lib/ai';
import AIUnavailableBanner from '../AIUnavailableBanner';

function ChatIcon({ size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MessageBubble({ role, text, onInsert, onCopy }) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '85%',
          padding: '6px 10px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: isUser
            ? 'var(--color-accent-blue, #2563eb)'
            : 'var(--color-bg-tertiary)',
          color: isUser ? '#fff' : 'var(--color-text-primary)',
          fontSize: 'var(--font-size-xs)',
          lineHeight: 'var(--line-height-relaxed)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
      {!isUser && (onInsert || onCopy) && (
        <div
          style={{
            display: 'flex',
            gap: '6px',
            marginTop: '3px',
          }}
        >
          {onInsert && (
            <button
              type="button"
              onClick={() => onInsert(text)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                color: 'var(--color-accent-blue, #2563eb)',
                padding: '1px 4px',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Insert
            </button>
          )}
          {onCopy && (
            <button
              type="button"
              onClick={() => onCopy(text)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '10px',
                color: 'var(--color-text-tertiary)',
                padding: '1px 4px',
                borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Copy
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AssistChat({ authFetch, sowId, defaultOpen = false, onInsert }) {
  const [open, setOpen] = useState(defaultOpen);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending, open]);

  const send = async () => {
    const query = input.trim();
    if (!query || pending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    const next = [...messages, { role: 'user', text: query }];
    setMessages(next);
    setInput('');
    setPending(true);
    setError(null);

    const result = await aiClient.assist(authFetch, query, sowId, history);
    setPending(false);
    if (result.ok) {
      const answer = result.data?.answer || result.data?.response || '(no response)';
      setMessages((cur) => [...cur, { role: 'assistant', text: answer }]);
    } else {
      setError(result.error);
      // Roll the user message back so retry resends it
      setMessages((cur) => cur.slice(0, -1));
      setInput(query);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <ChatIcon />
        Ask AI
      </button>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-primary)',
        minHeight: 320,
        maxHeight: 520,
      }}
      aria-label="AI assistant chat"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          borderBottom: '1px solid var(--color-border-default)',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          <ChatIcon />
          AI Assistant
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close assistant"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          ×
        </button>
      </div>

      <div
        ref={scrollerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--spacing-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-xs)',
        }}
      >
        {messages.length === 0 && !error && (
          <p
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Ask about rules, similar SoWs, or pricing guidance.
          </p>
        )}
        {messages.map((m, i) => (
          <MessageBubble
            key={i}
            role={m.role}
            text={m.text}
            onInsert={m.role === 'assistant' ? onInsert : undefined}
            onCopy={
              m.role === 'assistant'
                ? (txt) => {
                    if (navigator.clipboard) navigator.clipboard.writeText(txt);
                  }
                : undefined
            }
          />
        ))}
        {pending && (
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Thinking…
          </p>
        )}
        {error && <AIUnavailableBanner error={error} context="assist" compact />}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-xs)',
          padding: 'var(--spacing-xs) var(--spacing-sm)',
          borderTop: '1px solid var(--color-border-default)',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask the AI assistant…"
          disabled={pending}
          style={{
            flex: 1,
            resize: 'none',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-secondary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-xs)',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={send}
          disabled={pending || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
