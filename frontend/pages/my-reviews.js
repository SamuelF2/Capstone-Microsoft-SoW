import Head from 'next/head';
import { useRouter } from 'next/router';

const STATUS_STYLES = {
  'Needs Your Input': {
    color: 'var(--color-warning)',
    bg: 'rgba(251, 191, 36, 0.1)',
    border: 'rgba(251, 191, 36, 0.3)',
    dot: 'var(--color-warning)',
  },
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
  'Action Required': {
    color: 'var(--color-error)',
    bg: 'rgba(239, 68, 68, 0.1)',
    border: 'rgba(239, 68, 68, 0.3)',
    dot: 'var(--color-error)',
  },
};

// Sample SoWs assigned to / needing attention from the current user
const MY_SOWS = [
  {
    id: 1,
    title: 'Contoso Cloud Migration Phase 1',
    opportunityId: 'OPP-20240112',
    customer: 'Contoso Ltd.',
    methodology: 'Cloud Adoption',
    dealValue: '$240,000',
    status: 'Needs Your Input',
    dueDate: 'Feb 20, 2026',
    actionNote: 'Risk section is incomplete. Please review and add mitigation details.',
    assignedRole: 'Solution Architect',
  },
  {
    id: 2,
    title: 'Fabrikam Agile Transformation',
    opportunityId: 'OPP-20240098',
    customer: 'Fabrikam Inc.',
    methodology: 'Agile Sprint Delivery',
    dealValue: '$185,000',
    status: 'Action Required',
    dueDate: 'Feb 18, 2026',
    actionNote: 'Approval deadline in 2 days. Sign off on deliverables section.',
    assignedRole: 'CPI Reviewer',
  },
  {
    id: 3,
    title: 'Northwind ERP Sure Step Implementation',
    opportunityId: 'OPP-20240077',
    customer: 'Northwind Traders',
    methodology: 'Sure Step 365',
    dealValue: '$310,000',
    status: 'Pending Review',
    dueDate: 'Feb 25, 2026',
    actionNote: 'Waiting for your compliance review. No blockers at this time.',
    assignedRole: 'CDP Reviewer',
  },
  {
    id: 4,
    title: 'Alpine Ski House Waterfall Deployment',
    opportunityId: 'OPP-20240055',
    customer: 'Alpine Ski House',
    methodology: 'Waterfall',
    dealValue: '$95,000',
    status: 'In Progress',
    dueDate: 'Mar 3, 2026',
    actionNote: 'You are the primary author. 3 sections still need content.',
    assignedRole: 'Author',
  },
];

function SoWCard({ sow }) {
  const router = useRouter();
  const statusStyle = STATUS_STYLES[sow.status] || STATUS_STYLES['In Progress'];

  return (
    <div
      onClick={() => router.push(`/review/${sow.id}`)}
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
          borderRadius: 'var(--radius-xl) 0 0 var(--radius-xl)',
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
        {/* Top row: title + status badge */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 'var(--spacing-md)',
          }}
        >
          <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
            {sow.title}
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
            {sow.status}
          </span>
        </div>

        {/* Meta row */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-xl)',
            flexWrap: 'wrap',
          }}
        >
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Customer:</strong> {sow.customer}
          </span>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>ID:</strong> {sow.opportunityId}
          </span>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Value:</strong> {sow.dealValue}
          </span>
          <span className="text-sm text-secondary">
            <strong style={{ color: 'var(--color-text-primary)' }}>Method:</strong>{' '}
            {sow.methodology}
          </span>
        </div>

        {/* Action note */}
        <p
          className="text-sm"
          style={{
            color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-bg-tertiary)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            borderLeft: `3px solid ${statusStyle.dot}`,
            margin: 0,
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          {sow.actionNote}
        </p>
      </div>

      {/* Right panel */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          padding: 'var(--spacing-lg)',
          gap: 'var(--spacing-md)',
          borderLeft: '1px solid var(--color-border-default)',
          minWidth: '180px',
          flexShrink: 0,
        }}
      >
        <div style={{ textAlign: 'right' }}>
          <p className="text-xs text-secondary" style={{ marginBottom: '2px' }}>
            Due date
          </p>
          <p
            className="text-sm font-semibold"
            style={{
              color:
                sow.status === 'Action Required'
                  ? 'var(--color-error)'
                  : 'var(--color-text-primary)',
            }}
          >
            {sow.dueDate}
          </p>
        </div>

        <div style={{ textAlign: 'right' }}>
          <p className="text-xs text-secondary" style={{ marginBottom: '2px' }}>
            Your role
          </p>
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
            {sow.assignedRole}
          </p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/review/${sow.id}`);
          }}
          className="btn btn-primary btn-sm"
        >
          Open SoW →
        </button>
      </div>
    </div>
  );
}

export default function MyReviews() {
  const actionItems = MY_SOWS.filter(
    (s) => s.status === 'Action Required' || s.status === 'Needs Your Input'
  );
  const otherItems = MY_SOWS.filter(
    (s) => s.status !== 'Action Required' && s.status !== 'Needs Your Input'
  );

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
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">My Reviews</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              SoWs that are assigned to you or waiting on your action.
            </p>
          </div>

          {/* Summary chips */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-2xl)',
              flexWrap: 'wrap',
            }}
          >
            {Object.entries(
              MY_SOWS.reduce((acc, s) => {
                acc[s.status] = (acc[s.status] || 0) + 1;
                return acc;
              }, {})
            ).map(([status, count]) => {
              const st = STATUS_STYLES[status];
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

          {/* Needs Attention */}
          {actionItems.length > 0 && (
            <section style={{ marginBottom: 'var(--spacing-2xl)' }}>
              <h2
                className="text-xl font-semibold mb-lg"
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
              >
                <span style={{ color: 'var(--color-error)' }}>⚠</span> Needs Your Attention
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {actionItems.map((sow) => (
                  <SoWCard key={sow.id} sow={sow} />
                ))}
              </div>
            </section>
          )}

          {/* Other assigned */}
          {otherItems.length > 0 && (
            <section>
              <h2
                className="text-xl font-semibold mb-lg"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Other Assigned SoWs
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {otherItems.map((sow) => (
                  <SoWCard key={sow.id} sow={sow} />
                ))}
              </div>
            </section>
          )}

          {MY_SOWS.length === 0 && (
            <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🎉</div>
              <h3 className="text-xl font-semibold mb-sm">All caught up!</h3>
              <p className="text-secondary">You have no SoWs that need your attention right now.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
