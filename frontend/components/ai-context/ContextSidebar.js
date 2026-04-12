/**
 * ContextSidebar — live AI context panel for the draft editor.
 *
 * Watches the focused section text, debounces 500ms, calls aiClient.context,
 * and renders three accordions: applicable rules, banned phrases, and
 * similar examples. Falls back to a compact AIUnavailableBanner on 503.
 */

import { useEffect, useRef, useState } from 'react';
import { aiClient } from '../../lib/ai';
import AIUnavailableBanner from '../AIUnavailableBanner';
import RulesAccordion from './RulesAccordion';
import BannedPhrasesAccordion from './BannedPhrasesAccordion';
import SimilarExamplesAccordion from './SimilarExamplesAccordion';

const DEBOUNCE_MS = 500;

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 36,
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-tertiary)',
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  );
}

function formatAge(ts) {
  if (!ts) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default function ContextSidebar({
  authFetch,
  sowId,
  focusedSectionText,
  focusedSectionLabel,
}) {
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null);
  const [error, setError] = useState(null);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [, setTick] = useState(0);
  const abortRef = useRef(null);

  useEffect(() => {
    const text = (focusedSectionText || '').trim();
    if (!text) {
      setContext(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const handle = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const result = await aiClient.context(authFetch, text, sowId, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        if (result.ok) {
          setContext(result.data);
          setRefreshedAt(Date.now());
        } else {
          setError(result.error);
          setContext(null);
        }
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setError({ message: err?.message || 'Unknown error', retryable: true });
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(handle);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [authFetch, sowId, focusedSectionText]);

  // Tick the "refreshed Xs ago" footer every 10s.
  useEffect(() => {
    if (!refreshedAt) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 10000);
    return () => clearInterval(id);
  }, [refreshedAt]);

  const rules = context?.rules || [];
  const phrases = context?.banned_phrases || context?.bannedPhrases || [];
  const similar = context?.similar_sections || context?.similar || [];

  return (
    <aside
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
        padding: 'var(--spacing-md)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-secondary)',
        minWidth: 280,
      }}
      aria-label="AI context sidebar"
    >
      <div>
        <h3
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          AI Context
        </h3>
        {focusedSectionLabel && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '11px',
              color: 'var(--color-text-tertiary)',
            }}
          >
            Section: {focusedSectionLabel}
          </p>
        )}
      </div>

      {!focusedSectionText?.trim() ? (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          Click into a section to load applicable rules and similar examples.
        </p>
      ) : error ? (
        <AIUnavailableBanner error={error} context="context" compact />
      ) : loading && !context ? (
        <Skeleton />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          <RulesAccordion rules={rules} defaultOpen />
          <BannedPhrasesAccordion phrases={phrases} defaultOpen />
          <SimilarExamplesAccordion examples={similar} />
        </div>
      )}

      {refreshedAt && !error && (
        <p
          style={{
            margin: 0,
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            textAlign: 'right',
          }}
        >
          {loading ? 'Refreshing…' : `Refreshed ${formatAge(refreshedAt)}`}
        </p>
      )}
    </aside>
  );
}
