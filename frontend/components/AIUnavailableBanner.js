/**
 * AIUnavailableBanner — uniform "AI is down" message used everywhere an
 * AI surface can fail. Displays the upstream message, an optional Retry
 * (only when the error is retryable), and an optional Skip CTA for the
 * authoring flow that wants to let the user proceed manually.
 *
 * Props
 * -----
 * error    { message, retryable, status } — from aiClient
 * onRetry  () => void — shown when error.retryable is true
 * onSkip   () => void — optional, opens the skip-confirmation modal
 * context  'analysis' | 'context' | 'assist' | 'insights' | 'prose' — copy hint
 * compact  boolean — render a small pill instead of a full banner
 */

const COPY = {
  analysis: 'AI analysis is unavailable.',
  context: 'AI context lookup is unavailable.',
  assist: 'AI assistant is unavailable.',
  insights: 'AI insights are unavailable.',
  prose: 'Document prose generation is unavailable.',
};

function WarningIcon({ size = 16 }) {
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
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export default function AIUnavailableBanner({
  error,
  onRetry,
  onSkip,
  context = 'analysis',
  compact = false,
}) {
  if (!error) return null;
  const headline = COPY[context] || COPY.analysis;
  const retryable = error.retryable !== false;

  if (compact) {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '2px 10px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'rgba(251,191,36,0.1)',
          color: 'var(--color-warning)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
        }}
        title={error.message}
      >
        <WarningIcon size={12} />
        {headline}
      </span>
    );
  }

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--spacing-md)',
        padding: 'var(--spacing-md) var(--spacing-lg)',
        marginBottom: 'var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'rgba(251,191,36,0.08)',
        border: '1px solid rgba(251,191,36,0.3)',
        color: 'var(--color-warning)',
      }}
    >
      <span style={{ flexShrink: 0, marginTop: 2 }}>
        <WarningIcon />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
          }}
        >
          {headline}
        </p>
        {error.message && (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            {error.message}
          </p>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-xs)',
          flexShrink: 0,
          alignItems: 'center',
        }}
      >
        {retryable && onRetry && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
            Retry
          </button>
        )}
        {onSkip && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onSkip}>
            Skip AI Review
          </button>
        )}
      </div>
    </div>
  );
}
