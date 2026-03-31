import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../../lib/auth';

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

export default function ReviewDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [activeTab, setActiveTab] = useState('overview');
  const [reviewEntry, setReviewEntry] = useState(null);
  const [isComplete, setIsComplete] = useState(false);
  const { getToken } = useAuth();

  // Load review metadata from registry
  useEffect(() => {
    if (!id) return;
    async function load() {
      try {
        const token = await getToken();
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/sow/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 404) {
          router.replace('/my-reviews');
          return;
        }
        if (!res.ok) throw new Error('Failed to load');
        const data = await res.json();
        setReviewEntry({
          sow_title: data.title,
          sow_methodology: data.methodology,
          reviewed_at: data.updated_at,
          score: data.content?.score ?? null,
          findings: data.content?.findings ?? {},
        });
        setIsComplete(data.status === 'approved' || data.status === 'rejected');
      } catch {
        router.replace('/my-reviews');
      }
    }
    load();
  }, [id]);

  const handleMarkComplete = async () => {
    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/reviews/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ findings: { ...reviewEntry?.findings, status: 'Completed' } }),
      });
      setIsComplete(true);
      setReviewEntry((prev) => prev ? { ...prev, findings: { ...prev.findings, status: 'Completed' } } : prev);
    } catch {
      // handle error
    }
  };

  // Use registry data if available, fall back to generic sample data
  const reviewData = {
    id: id,
    title: reviewEntry?.sow_title || `SOW Review ${id}`,
    methodology: reviewEntry?.sow_methodology || 'Agile',
    uploadDate: formatDate(reviewEntry?.reviewed_at) || '—',
    status: reviewEntry?.findings?.status || 'Pending Review',
    score: reviewEntry?.score || 72,
    tabs: {
      overview: {
        summary: `This Statement of Work has been analyzed for compliance with ${reviewEntry?.methodology || 'Agile'} methodology standards. The AI review identified areas of strength and sections that need improvement before approval.`,
        strengths: [
          'Clear project scope with defined boundaries',
          'Deliverables have measurable acceptance criteria',
          'Risk register includes severity ratings',
          'Customer responsibilities are documented',
        ],
        improvements: [
          'Add SLA terms to the support transition section',
          'Replace vague language ("best effort") with measurable commitments',
          'Include RACI matrix for customer resource commitments',
          'Add mitigation strategies for all identified risks',
        ],
      },
      details: {
        sections: [
          { name: 'Executive Summary', score: 88, status: 'Pass' },
          { name: 'Project Scope', score: 90, status: 'Pass' },
          { name: 'Deliverables', score: 82, status: 'Pass' },
          { name: 'Assumptions & Risks', score: 65, status: 'Warning' },
          { name: 'Pricing & Budget', score: 70, status: 'Warning' },
          { name: 'Support Transition', score: 45, status: 'Fail' },
        ],
      },
      recommendations: [
        'Define explicit SLA terms with response time commitments per MCEM guidelines',
        'Add a 30-day hypercare period with named support resources',
        'Include change order process and rate card for scope modifications',
        'Add mitigation plans for the 2 unmitigated risks in section 7',
        'Specify customer resource commitments with hours/week and named POC',
      ],
    },
  };

  return (
    <>
      <Head>
        <title>{reviewData.title} – Review – Cocoon</title>
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
          <button
            onClick={() => router.push('/my-reviews')}
            className="btn btn-ghost mb-md"
            style={{ padding: 'var(--spacing-sm) 0' }}
          >
            ← Back to My Reviews
          </button>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 'var(--spacing-lg)',
            }}
          >
            <h1 className="text-4xl font-bold">{reviewData.title}</h1>
            {!isComplete ? (
              <button className="btn btn-primary" onClick={handleMarkComplete}>
                Mark Complete
              </button>
            ) : (
              <span
                style={{
                  padding: '6px 16px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  color: 'var(--color-success)',
                  backgroundColor: 'rgba(74,222,128,0.1)',
                  border: '1px solid rgba(74,222,128,0.3)',
                }}
              >
                ✓ Review Complete
              </span>
            )}
          </div>

          <div className="tabs">
            <button
              className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button
              className={`tab ${activeTab === 'details' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('details')}
            >
              Details
            </button>
            <button
              className={`tab ${activeTab === 'recommendations' ? 'tab-active' : ''}`}
              onClick={() => setActiveTab('recommendations')}
            >
              Recommendations
            </button>
          </div>

          <div className="card">
            {activeTab === 'overview' && (
              <div>
                <div
                  className="card mb-xl"
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-xl)',
                    alignItems: 'center',
                    backgroundColor: 'var(--color-bg-primary)',
                  }}
                >
                  <div
                    style={{
                      width: '120px',
                      height: '120px',
                      borderRadius: 'var(--radius-full)',
                      background: 'var(--gradient-blue)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <span className="text-4xl font-bold">{reviewData.score}</span>
                    <span className="text-sm" style={{ color: '#a0c4ff' }}>
                      Score
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="mb-sm">
                      <strong>Methodology:</strong> {reviewData.methodology}
                    </p>
                    <p className="mb-sm">
                      <strong>Status:</strong> {reviewData.status}
                    </p>
                    <p>
                      <strong>Uploaded:</strong> {reviewData.uploadDate}
                    </p>
                  </div>
                </div>

                <div className="mb-xl">
                  <h3 className="text-xl font-semibold mb-md">Summary</h3>
                  <p
                    className="text-secondary"
                    style={{ lineHeight: 'var(--line-height-relaxed)' }}
                  >
                    {reviewData.tabs.overview.summary}
                  </p>
                </div>

                <div className="mb-xl">
                  <h3 className="text-xl font-semibold mb-md">Strengths</h3>
                  {reviewData.tabs.overview.strengths.map((item, i) => (
                    <p key={i} className="text-secondary" style={{ marginBottom: 6 }}>
                      ✓ {item}
                    </p>
                  ))}
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-md">Areas for Improvement</h3>
                  {reviewData.tabs.overview.improvements.map((item, i) => (
                    <p key={i} className="text-secondary" style={{ marginBottom: 6 }}>
                      ⚠ {item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'details' && (
              <div>
                <h3 className="text-xl font-semibold mb-lg">Section Analysis</h3>
                <div className="grid grid-cols-2 gap-lg">
                  {reviewData.tabs.details.sections.map((section, i) => {
                    const barColor =
                      section.score >= 80
                        ? 'var(--color-success)'
                        : section.score >= 60
                          ? 'var(--color-warning)'
                          : 'var(--color-error)';
                    return (
                      <div
                        key={i}
                        className="card"
                        style={{ backgroundColor: 'var(--color-bg-primary)' }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 'var(--spacing-md)',
                          }}
                        >
                          <span className="font-semibold">{section.name}</span>
                          <span className="text-sm" style={{ color: barColor }}>
                            {section.status}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 6,
                            backgroundColor: 'var(--color-bg-tertiary)',
                            borderRadius: 3,
                            marginBottom: 'var(--spacing-sm)',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${section.score}%`,
                              backgroundColor: barColor,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span className="text-sm text-secondary">{section.score}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'recommendations' && (
              <div>
                <h3 className="text-xl font-semibold mb-lg">AI Recommendations</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                  {reviewData.tabs.recommendations.map((rec, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 'var(--spacing-md)',
                        padding: 'var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-bg-primary)',
                      }}
                    >
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: 'var(--color-accent-blue)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 'bold',
                          flexShrink: 0,
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        {i + 1}
                      </div>
                      <p
                        className="text-secondary"
                        style={{ lineHeight: 'var(--line-height-relaxed)', margin: 0 }}
                      >
                        {rec}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
