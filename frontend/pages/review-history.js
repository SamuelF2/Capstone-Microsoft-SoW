import { useState } from 'react';
import Head from 'next/head';
import ReviewCard from '../components/ReviewCard';

export default function ReviewHistory() {
  const [searchTerm, setSearchTerm] = useState('');
  const [methodology, setMethodology] = useState('All');
  const [status, setStatus] = useState('All');

  // Sample data - in a real app, this would come from an API
  const reviews = [
    {
      id: 1,
      title: 'Review 1 Title (should also be a hyperlink to view this specific review)',
      subtitle: 'Review 1 Subtitle',
      details: 'Next Details about the review such as rating the features',
    },
    {
      id: 2,
      title: 'Review 2 Title (should also be a hyperlink to view this specific review)',
      subtitle: 'Review 2 Subtitle',
      details: 'Next Details about the review such as rating the features',
    },
  ];

  const filteredReviews = reviews.filter((review) => {
    const matchesSearch = review.title.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  return (
    <>
      <Head>
        <title>Review History - SOW Reviews</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--container-lg)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl)',
          }}
        >
          <h1 className="text-4xl font-bold mb-sm">Review History</h1>
          <p className="text-lg text-secondary mb-lg">View and manage your past SOW reviews</p>

          {/* Demo banner */}
          <div
            style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-sm) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(59,130,246,0.08)',
              border: '1px solid rgba(59,130,246,0.25)',
              color: 'var(--color-info)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            Showing sample data for demo purposes. This page will display your actual review history
            once the review API is connected.
          </div>

          <div className="flex flex-wrap gap-md mb-lg">
            <input
              type="text"
              placeholder="Search SOW..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input"
              style={{ flex: '2', minWidth: '250px' }}
            />

            <select
              value={methodology}
              onChange={(e) => setMethodology(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '150px' }}
            >
              <option value="All">All Methodologies</option>
              <option value="Agile">Agile</option>
              <option value="Waterfall">Waterfall</option>
            </select>

            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '150px' }}
            >
              <option value="All">All Status</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <p className="text-sm text-tertiary mb-md">Results: {filteredReviews.length} reviews</p>

          <div className="flex flex-col gap-md">
            {filteredReviews.length > 0 ? (
              filteredReviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  id={review.id}
                  title={review.title}
                  subtitle={review.subtitle}
                  details={review.details}
                />
              ))
            ) : (
              <div
                className="text-center"
                style={{
                  padding: 'var(--spacing-3xl) var(--spacing-xl)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                <p className="text-lg">No reviews found matching your filters.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
