import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const STATUS_STYLES = {
  'Pending Review': {
    color: 'var(--color-info)',
    bg: 'rgba(59, 130, 246, 0.1)',
    border: 'rgba(59, 130, 246, 0.3)',
    dot: 'var(--color-info)',
  },
  'In Progress': {
    color: 'var(--color-accent-purple-light)',
    bg: 'rgba(139, 92, 246, 0.1)',
    border: 'rgba(139, 92, 246, 0.3)',
    dot: 'var(--color-accent-purple-light)',
  },
  Completed: {
    color: 'var(--color-success)',
    bg: 'rgba(74, 222, 128, 0.1)',
    border: 'rgba(74, 222, 128, 0.3)',
    dot: 'var(--color-success)',
  },
};

function formatDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function ReviewCard({ review }) {
  const router = useRouter();
  const statusStyle = STATUS_STYLES[review.status] || STATUS_STYLES['Pending Review'];

  return (
    <div
      onClick={() => router.push(`/review/${review.id}`)}
      style={{
        display: 'flex',
        alignItems: 'stretch',
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        cursor: 'pointer',
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
      {/* Left accent stripe */}
      <div
        style={{
          width: '5px',
          flexShrink: 0,
          backgroundColor: statusStyle.dot,
        }}
      />

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
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-md)',
          }}
        >
          <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
            {review.title}
          </h3>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: statusStyle.color,
              backgroundColor: statusStyle.bg,
              border: `1px solid ${statusStyle.border}`,
              whiteSpace: 'nowrap',
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
            {review.status}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Methodology:</strong>{' '}
            {review.methodology}
          </span>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Uploaded:</strong>{' '}
            {formatDate(review.uploadedAt)}
          </span>
          {review.score != null && (
            <span className="text-sm text-secondary">
              <strong style={{ color: 'var(--color-text-primary)' }}>Score:</strong> {review.score}
            </span>
          )}
        </div>
      </div>

      {/* Right panel */}
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
            router.push(`/review/${review.id}`);
          }}
          className="btn btn-primary btn-sm"
        >
          Review →
        </button>
      </div>
    </div>
  );
}

export default function MyReviews() {
  const router = useRouter();
  const [reviews, setReviews] = useState([]);

  useEffect(() => {
    try {
      const registry = JSON.parse(localStorage.getItem('review-registry') || '[]');
      // My Reviews shows only non-completed reviews
      setReviews(registry.filter((r) => r.status !== 'Completed'));
    } catch {
      setReviews([]);
    }
  }, []);

  const pending = reviews.filter((r) => r.status === 'Pending Review');
  const inProgress = reviews.filter((r) => r.status === 'In Progress');

  return (
    <>
      <Head>
        <title>My Reviews – Cocoon</title>
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
              <h1 className="text-4xl font-bold mb-sm">My Reviews</h1>
              <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
                SoWs uploaded for AI review that need your attention.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/ai-review')}>
              + Upload for Review
            </button>
          </div>

          {/* Summary chips */}
          {reviews.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-2xl)',
                flexWrap: 'wrap',
              }}
            >
              {Object.entries(
                reviews.reduce((acc, r) => {
                  acc[r.status] = (acc[r.status] || 0) + 1;
                  return acc;
                }, {})
              ).map(([status, count]) => {
                const st = STATUS_STYLES[status] || STATUS_STYLES['Pending Review'];
                return (
                  <span
                    key={status}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: st.color,
                      backgroundColor: st.bg,
                      border: `1px solid ${st.border}`,
                    }}
                  >
                    {count} {status}
                  </span>
                );
              })}
            </div>
          )}

          {/* Pending Review */}
          {pending.length > 0 && (
            <section style={{ marginBottom: 'var(--spacing-2xl)' }}>
              <h2
                className="text-xl font-semibold mb-lg"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
              >
                <span style={{ color: 'var(--color-info)' }}>&#9679;</span> Pending Review
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {pending.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            </section>
          )}

          {/* In Progress */}
          {inProgress.length > 0 && (
            <section>
              <h2
                className="text-xl font-semibold mb-lg"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                In Progress
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {inProgress.map((r) => (
                  <ReviewCard key={r.id} review={r} />
                ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {reviews.length === 0 && (
            <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📄</div>
              <h3 className="text-xl font-semibold mb-sm">No reviews yet</h3>
              <p className="text-secondary" style={{ marginBottom: 'var(--spacing-lg)' }}>
                Upload a SoW for AI review to get started.
              </p>
              <button className="btn btn-primary" onClick={() => router.push('/ai-review')}>
                Upload for Review
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
