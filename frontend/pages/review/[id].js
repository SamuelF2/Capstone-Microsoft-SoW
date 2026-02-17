import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function ReviewDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [activeTab, setActiveTab] = useState('overview');

  // Sample data - in a real app, this would be fetched based on the ID
  const reviewData = {
    id: id,
    title: `SOW Review ${id}`,
    methodology: 'Agile',
    uploadDate: '2024-02-15',
    status: 'Completed',
    score: 85,
    tabs: {
      overview: {
        summary:
          'This Statement of Work has been analyzed for compliance with Agile methodology standards.',
        strengths: [
          'Clear sprint planning structure',
          'Well-defined user stories',
          'Proper retrospective planning',
        ],
        improvements: [
          'Add more detail to acceptance criteria',
          'Include velocity tracking metrics',
          'Define definition of done',
        ],
      },
      details: {
        sections: [
          { name: 'Project Scope', score: 90, status: 'Pass' },
          { name: 'Deliverables', score: 85, status: 'Pass' },
          { name: 'Timeline', score: 75, status: 'Warning' },
          { name: 'Resources', score: 80, status: 'Pass' },
        ],
      },
      recommendations: [
        'Consider adding bi-weekly sprint reviews',
        'Implement automated testing in the CI/CD pipeline',
        'Add stakeholder feedback sessions',
      ],
    },
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
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
                  <strong>Upload Date:</strong> {reviewData.uploadDate}
                </p>
              </div>
            </div>

            <div className="mb-xl">
              <h3 className="text-xl font-semibold mb-md">Summary</h3>
              <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
                {reviewData.tabs.overview.summary}
              </p>
            </div>

            <div className="mb-xl">
              <h3 className="text-xl font-semibold mb-md">Strengths</h3>
              <ul className="list-unstyled">
                {reviewData.tabs.overview.strengths.map((item, index) => (
                  <li key={index} className="list-item text-secondary">
                    ✓ {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xl font-semibold mb-md">Areas for Improvement</h3>
              <ul className="list-unstyled">
                {reviewData.tabs.overview.improvements.map((item, index) => (
                  <li key={index} className="list-item text-secondary">
                    ⚠ {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );

      case 'details':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-lg">Section Analysis</h3>
            <div className="grid grid-cols-2 gap-lg">
              {reviewData.tabs.details.sections.map((section, index) => (
                <div
                  key={index}
                  className="card"
                  style={{ backgroundColor: 'var(--color-bg-primary)' }}
                >
                  <div className="flex items-center justify-between mb-md">
                    <span className="font-semibold">{section.name}</span>
                    <span className="badge badge-success">{section.status}</span>
                  </div>
                  <div className="progress mb-sm">
                    <div
                      className={`progress-bar ${section.score >= 80 ? 'progress-bar-success' : 'progress-bar-warning'}`}
                      style={{ width: `${section.score}%` }}
                    />
                  </div>
                  <span className="text-sm text-secondary">{section.score}%</span>
                </div>
              ))}
            </div>
          </div>
        );

      case 'recommendations':
        return (
          <div>
            <h3 className="text-xl font-semibold mb-lg">AI Recommendations</h3>
            <div className="flex flex-col gap-md">
              {reviewData.tabs.recommendations.map((rec, index) => (
                <div
                  key={index}
                  className="flex gap-md card"
                  style={{ backgroundColor: 'var(--color-bg-primary)' }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-accent-blue)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
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
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>{reviewData.title} - Review Details</title>
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
            onClick={() => router.back()}
            className="btn btn-ghost mb-md"
            style={{ padding: 'var(--spacing-sm) 0' }}
          >
            ← Back to Reviews
          </button>

          <h1 className="text-4xl font-bold mb-xl">{reviewData.title}</h1>

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

          <div className="card">{renderTabContent()}</div>
        </div>
      </div>
    </>
  );
}
