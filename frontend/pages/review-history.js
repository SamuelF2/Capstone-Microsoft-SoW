import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

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

export default function ReviewHistory() {
  const router = useRouter();
  const [reviews, setReviews] = useState([]);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');

  useEffect(() => {
    try {
      const registry = JSON.parse(localStorage.getItem('review-registry') || '[]');
      setReviews(registry.filter((r) => r.status === 'Completed'));
    } catch {
      setReviews([]);
    }
  }, []);

  const filtered = reviews.filter((r) => {
    const q = search.toLowerCase();
    const matchSearch = (r.title ?? '').toLowerCase().includes(q);
    const matchMethod = filterMethod === 'All' || r.methodology === filterMethod;
    return matchSearch && matchMethod;
  });

  return (
    <>
      <Head>
        <title>Review History – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <h1 className="text-4xl font-bold mb-sm">Review History</h1>
          <p className="text-lg text-secondary mb-lg">Completed AI reviews of your SoW documents</p>

          {/* Filters */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-md)',
            }}
          >
            <input
              type="text"
              placeholder="Search by title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ flex: '2', minWidth: '250px' }}
            />
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '150px' }}
            >
              <option value="All">All Methodologies</option>
              <option>Agile Sprint Delivery</option>
              <option>Sure Step 365</option>
              <option>Waterfall</option>
              <option>Cloud Adoption</option>
            </select>
          </div>

          <p className="text-sm text-tertiary mb-md">
            {filtered.length} review{filtered.length !== 1 ? 's' : ''} found
          </p>

          {/* Review list */}
          {filtered.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
              {filtered.map((r) => (
                <div
                  key={r.id}
                  onClick={() => router.push(`/review/${r.id}`)}
                  className="card"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition:
                      'border-color var(--transition-base), transform var(--transition-base)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-accent-blue)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border-default)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <div>
                    <h3 className="text-lg font-semibold" style={{ marginBottom: 4 }}>
                      {r.title}
                    </h3>
                    <div style={{ display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap' }}>
                      <span className="text-sm text-secondary">{r.methodology}</span>
                      <span className="text-sm text-secondary">
                        Completed {formatDate(r.completedAt || r.uploadedAt)}
                      </span>
                      {r.score != null && (
                        <span className="text-sm" style={{ color: 'var(--color-success)' }}>
                          Score: {r.score}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      color: 'var(--color-accent-blue)',
                      fontSize: 'var(--font-size-sm)',
                      flexShrink: 0,
                    }}
                  >
                    View →
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {reviews.length === 0 && (
            <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📋</div>
              <h3 className="text-xl font-semibold mb-sm">No completed reviews</h3>
              <p className="text-secondary" style={{ marginBottom: 'var(--spacing-lg)' }}>
                Reviews will appear here after you mark them complete from the review page.
              </p>
              <button className="btn btn-primary" onClick={() => router.push('/my-reviews')}>
                Go to My Reviews
              </button>
            </div>
          )}

          {filtered.length === 0 && reviews.length > 0 && (
            <div style={{ padding: 'var(--spacing-3xl)', textAlign: 'center' }}>
              <p className="text-secondary">No reviews match your search.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
