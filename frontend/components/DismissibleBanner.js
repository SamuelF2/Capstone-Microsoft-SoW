/**
 * DismissibleBanner — info/warning/success banner that the user can dismiss
 * permanently via the × button. Dismissal is per-user, per-key, and
 * persisted to localStorage so it survives reloads and new tabs.
 *
 * Why localStorage and not a cookie:
 *   Dismissals are a purely client-side UX preference — the backend has no
 *   business knowing which banners a user has closed. localStorage keeps
 *   the data out of every request's Cookie header (smaller payloads) and
 *   makes ownership obvious.
 *
 * Usage:
 *
 *   <DismissibleBanner dismissKey="all-sows-filters-persist-v1" variant="info">
 *     Your filter selections now save automatically across sessions.
 *   </DismissibleBanner>
 *
 * Versioning the key (e.g. `…-v1`, `…-v2`) lets you re-surface a message
 * if the wording changes materially — users who dismissed the old message
 * will see the new one.
 *
 * Props
 * ─────
 *   dismissKey  string   — required; the localStorage namespace for this banner
 *   variant     string   — 'info' (default) | 'warning' | 'success' | 'error'
 *   icon        node     — optional leading icon/emoji
 *   children    node     — banner content
 */
import { useEffect, useState } from 'react';

const STORAGE_PREFIX = 'banner-dismissed:';

const VARIANT_STYLES = {
  info: {
    bg: 'rgba(59,130,246,0.08)',
    border: 'rgba(59,130,246,0.25)',
    color: 'var(--color-info, #3b82f6)',
  },
  warning: {
    bg: 'rgba(234,179,8,0.08)',
    border: 'rgba(234,179,8,0.25)',
    color: 'var(--color-warning, #eab308)',
  },
  success: {
    bg: 'rgba(34,197,94,0.08)',
    border: 'rgba(34,197,94,0.25)',
    color: 'var(--color-success, #22c55e)',
  },
  error: {
    bg: 'rgba(220,38,38,0.08)',
    border: 'rgba(220,38,38,0.25)',
    color: 'var(--color-error, #dc2626)',
  },
};

export default function DismissibleBanner({ dismissKey, variant = 'info', icon = null, children }) {
  // Start dismissed=true so the banner never briefly flashes during SSR or
  // the first client render — once we've checked localStorage we flip it.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (!dismissKey || typeof window === 'undefined') return;
    try {
      const flag = window.localStorage.getItem(STORAGE_PREFIX + dismissKey);
      setDismissed(flag === '1');
    } catch {
      setDismissed(false);
    }
  }, [dismissKey]);

  const handleDismiss = () => {
    setDismissed(true);
    if (!dismissKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_PREFIX + dismissKey, '1');
    } catch {
      // ignore quota/private-mode errors
    }
  };

  if (dismissed) return null;

  const palette = VARIANT_STYLES[variant] || VARIANT_STYLES.info;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--spacing-sm)',
        padding: 'var(--spacing-xs) var(--spacing-md)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontSize: 'var(--font-size-xs)',
        lineHeight: 1.5,
      }}
    >
      {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
      <div style={{ flex: 1, color: 'var(--color-text-primary)' }}>{children}</div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          color: palette.color,
          cursor: 'pointer',
          padding: 0,
          fontSize: 'var(--font-size-sm)',
          lineHeight: 1,
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}
