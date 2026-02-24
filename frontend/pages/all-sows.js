import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';

const ALL_SOWS = [
  {
    id: 1,
    title: 'Contoso Cloud Migration Phase 1',
    opportunityId: 'OPP-20240112',
    customer: 'Contoso Ltd.',
    methodology: 'Cloud Adoption',
    dealValue: '$240,000',
    status: 'In Review',
    updatedAt: 'Feb 15, 2026',
  },
  {
    id: 2,
    title: 'Fabrikam Agile Transformation',
    opportunityId: 'OPP-20240098',
    customer: 'Fabrikam Inc.',
    methodology: 'Agile Sprint Delivery',
    dealValue: '$185,000',
    status: 'Approved',
    updatedAt: 'Feb 10, 2026',
  },
  {
    id: 3,
    title: 'Northwind ERP Implementation',
    opportunityId: 'OPP-20240077',
    customer: 'Northwind Traders',
    methodology: 'Sure Step 365',
    dealValue: '$310,000',
    status: 'In Review',
    updatedAt: 'Feb 8, 2026',
  },
  {
    id: 4,
    title: 'Alpine Ski House Deployment',
    opportunityId: 'OPP-20240055',
    customer: 'Alpine Ski House',
    methodology: 'Waterfall',
    dealValue: '$95,000',
    status: 'Draft',
    updatedAt: 'Feb 3, 2026',
  },
  {
    id: 5,
    title: 'Tailspin Toys Cloud Adoption',
    opportunityId: 'OPP-20240041',
    customer: 'Tailspin Toys',
    methodology: 'Cloud Adoption',
    dealValue: '$175,000',
    status: 'Approved',
    updatedAt: 'Jan 29, 2026',
  },
];

const STATUS_COLOR = {
  Draft: 'var(--color-text-secondary)',
  'In Review': 'var(--color-warning)',
  Approved: 'var(--color-success)',
  Rejected: 'var(--color-error)',
};

export default function AllSoWs() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');

  const filtered = ALL_SOWS.filter((s) => {
    const matchSearch =
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.customer.toLowerCase().includes(search.toLowerCase()) ||
      s.opportunityId.toLowerCase().includes(search.toLowerCase());
    const matchMethod = filterMethod === 'All' || s.methodology === filterMethod;
    const matchStatus = filterStatus === 'All' || s.status === filterStatus;
    return matchSearch && matchMethod && matchStatus;
  });

  return (
    <>
      <Head>
        <title>All SoWs – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: 'var(--spacing-2xl)',
            }}
          >
            <div>
              <h1 className="text-4xl font-bold mb-sm">All SoWs</h1>
              <p className="text-secondary">
                Browse and manage all Statements of Work across your organisation.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => router.push('/create-new')}>
              + Create New
            </button>
          </div>

          {/* Filters */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-md)',
              flexWrap: 'wrap',
            }}
          >
            <input
              type="text"
              placeholder="Search by title, customer, or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ flex: '2', minWidth: '240px' }}
            />
            <select
              value={filterMethod}
              onChange={(e) => setFilterMethod(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '160px' }}
            >
              <option value="All">All Methodologies</option>
              <option>Agile Sprint Delivery</option>
              <option>Sure Step 365</option>
              <option>Waterfall</option>
              <option>Cloud Adoption</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select"
              style={{ flex: '1', minWidth: '140px' }}
            >
              <option value="All">All Statuses</option>
              <option>Draft</option>
              <option>In Review</option>
              <option>Approved</option>
              <option>Rejected</option>
            </select>
          </div>

          <p className="text-sm text-tertiary mb-md">
            {filtered.length} SoW{filtered.length !== 1 ? 's' : ''} found
          </p>

          {/* Table */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                  }}
                >
                  {['Title', 'Customer', 'Methodology', 'Value', 'Status', 'Updated', ''].map(
                    (h) => (
                      <th
                        key={h}
                        style={{
                          padding: 'var(--spacing-md) var(--spacing-lg)',
                          textAlign: 'left',
                          fontSize: 'var(--font-size-sm)',
                          fontWeight: 'var(--font-weight-semibold)',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((sow, i) => (
                  <tr
                    key={sow.id}
                    onClick={() => router.push(`/review/${sow.id}`)}
                    style={{
                      borderBottom:
                        i < filtered.length - 1 ? '1px solid var(--color-border-default)' : 'none',
                      cursor: 'pointer',
                      transition: 'background-color var(--transition-base)',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                      <p className="font-medium" style={{ marginBottom: '2px' }}>
                        {sow.title}
                      </p>
                      <p className="text-xs text-tertiary">{sow.opportunityId}</p>
                    </td>
                    <td
                      style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                      className="text-sm text-secondary"
                    >
                      {sow.customer}
                    </td>
                    <td
                      style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                      className="text-sm text-secondary"
                    >
                      {sow.methodology}
                    </td>
                    <td
                      style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                      className="text-sm font-medium"
                    >
                      {sow.dealValue}
                    </td>
                    <td style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                      <span
                        style={{
                          color: STATUS_COLOR[sow.status],
                          fontWeight: 'var(--font-weight-medium)',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        ● {sow.status}
                      </span>
                    </td>
                    <td
                      style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}
                      className="text-sm text-secondary"
                    >
                      {sow.updatedAt}
                    </td>
                    <td style={{ padding: 'var(--spacing-md) var(--spacing-lg)' }}>
                      <span
                        style={{
                          color: 'var(--color-accent-blue)',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        View →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 && (
              <div style={{ padding: 'var(--spacing-3xl)', textAlign: 'center' }}>
                <p className="text-secondary">No SoWs match your search.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
