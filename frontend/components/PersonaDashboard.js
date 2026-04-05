/**
 * PersonaDashboard — role-specific summary panels for DRM review.
 *
 * Props
 * -----
 * role        "cpl" | "cdp" | "delivery-manager"
 * summaryData object — from GET /api/review/{sow_id}/drm-summary
 * loading     boolean
 */

import { formatDeal as sharedFormatDeal } from '../lib/format';

// DataRow renders the returned value as-is, so missing values must come back
// as null (to be displayed as '—' by the caller) rather than the default '—'.
const formatDeal = (v) => sharedFormatDeal(v, null);

function Card({ title, children, warning }) {
  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        marginBottom: 'var(--spacing-md)',
        backgroundColor: 'var(--color-bg-primary)',
      }}
    >
      <div
        style={{
          padding: 'var(--spacing-sm) var(--spacing-md)',
          borderBottom: '1px solid var(--color-border-default)',
          backgroundColor: 'var(--color-bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            fontWeight: 'var(--font-weight-semibold)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {title}
        </span>
        {warning && (
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-warning)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            ⚠ {warning}
          </span>
        )}
      </div>
      <div style={{ padding: 'var(--spacing-md)' }}>{children}</div>
    </div>
  );
}

function DataRow({ label, value, highlight }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '4px 0',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          color: highlight || 'var(--color-text-primary)',
        }}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

function StatusRow({ label, ok, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 0' }}>
      <span
        style={{ color: ok ? 'var(--color-success)' : 'var(--color-warning)', fontSize: '12px' }}
      >
        {ok ? '✓' : '⚠'}
      </span>
      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
        <strong style={{ color: 'var(--color-text-primary)' }}>{label}</strong>
        {text ? ': ' + text : ''}
      </span>
    </div>
  );
}

// ── CPL panels ────────────────────────────────────────────────────────────────

function CplDashboard({ data }) {
  const fin = data.financials || {};
  const comp = data.standards_compliance || {};
  const scope = data.scope_summary || {};

  const margin = fin.estimated_margin != null ? parseFloat(fin.estimated_margin) : null;
  const marginWarning = margin != null && margin < 18 ? `${margin}% below 18% target` : null;

  return (
    <>
      <Card title="Financial Summary" warning={marginWarning}>
        <DataRow label="Deal Value" value={formatDeal(fin.deal_value)} />
        <DataRow
          label="Estimated Margin"
          value={margin != null ? `${margin}%` : '—'}
          highlight={marginWarning ? 'var(--color-warning)' : undefined}
        />
        {fin.pricing_breakdown?.type && (
          <DataRow label="Contract Type" value={fin.pricing_breakdown.type} />
        )}
      </Card>

      <Card title="Standards Compliance">
        <StatusRow
          label="Methodology"
          ok={!!comp.methodology}
          text={comp.methodology || 'Not specified'}
        />
        {(comp.high_violations || []).length === 0 ? (
          <StatusRow label="No high-severity violations" ok={true} />
        ) : (
          <div style={{ marginTop: 'var(--spacing-xs)' }}>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-error)',
                fontWeight: 'var(--font-weight-semibold)',
              }}
            >
              {comp.high_violations.length} high-severity violation
              {comp.high_violations.length !== 1 ? 's' : ''}
            </span>
            {comp.high_violations.map((v, i) => (
              <div
                key={i}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  padding: '2px 0 2px 12px',
                }}
              >
                • {v.rule}: {v.message}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Scope Overview">
        <DataRow label="In-Scope Items" value={scope.in_scope_count ?? '—'} />
        <DataRow label="Out-of-Scope Items" value={scope.out_scope_count ?? '—'} />
        <DataRow
          label="Customer Responsibilities"
          value={scope.customer_responsibilities_count ?? '—'}
        />
      </Card>
    </>
  );
}

// ── CDP panels ────────────────────────────────────────────────────────────────

function CdpDashboard({ data }) {
  const account = data.account_info || {};
  const cs = data.customer_success || {};

  return (
    <>
      <Card title="Account Info">
        <DataRow label="Customer" value={account.customer_name} />
        <DataRow label="Deal Value" value={formatDeal(account.deal_value)} />
      </Card>

      <Card title="Customer Success">
        <DataRow label="Deliverables" value={cs.deliverables_count ?? '—'} />
        <StatusRow
          label="Support & Transition"
          ok={!!cs.support_transition_defined}
          text={cs.support_transition_defined ? 'Defined' : 'Not defined'}
        />
        {Array.isArray(cs.customer_responsibilities) && cs.customer_responsibilities.length > 0 && (
          <div style={{ marginTop: 'var(--spacing-xs)' }}>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                display: 'block',
                marginBottom: '4px',
              }}
            >
              Customer responsibilities:
            </span>
            {cs.customer_responsibilities.slice(0, 5).map((r, i) => (
              <div
                key={i}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  padding: '1px 0 1px 8px',
                }}
              >
                • {typeof r === 'string' ? r : JSON.stringify(r)}
              </div>
            ))}
            {cs.customer_responsibilities.length > 5 && (
              <div
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  paddingLeft: '8px',
                }}
              >
                + {cs.customer_responsibilities.length - 5} more
              </div>
            )}
          </div>
        )}
      </Card>
    </>
  );
}

// ── Delivery Manager panels ───────────────────────────────────────────────────

function DmDashboard({ data }) {
  const plan = data.delivery_plan || {};
  const risks = data.risk_register || {};
  const timeline = data.timeline || {};

  const phases = timeline.phases || [];
  const milestones = timeline.milestones || [];

  return (
    <>
      <Card title="Delivery Plan">
        <DataRow label="Methodology" value={plan.methodology || '—'} />
        <DataRow label="Team Members" value={plan.resource_count ?? '—'} />
        {Array.isArray(plan.team_structure) && plan.team_structure.length > 0 && (
          <div style={{ marginTop: 'var(--spacing-xs)' }}>
            {plan.team_structure.slice(0, 4).map((r, i) => (
              <div
                key={i}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  padding: '1px 0 1px 8px',
                }}
              >
                • {typeof r === 'string' ? r : r.role || r.name || JSON.stringify(r)}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Risk Register"
        warning={
          risks.high_risks?.length > 0
            ? `${risks.high_risks.length} high risk${risks.high_risks.length !== 1 ? 's' : ''}`
            : null
        }
      >
        <DataRow label="Total Risks" value={risks.total_risks ?? '—'} />
        <StatusRow
          label="Mitigations"
          ok={!!risks.mitigations_defined}
          text={risks.mitigations_defined ? 'Defined' : 'Missing'}
        />
        {risks.high_risks?.length > 0 && (
          <div style={{ marginTop: 'var(--spacing-xs)' }}>
            {risks.high_risks.map((r, i) => (
              <div
                key={i}
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-error)',
                  padding: '1px 0 1px 8px',
                }}
              >
                • {r.description || r.category || JSON.stringify(r)}
              </div>
            ))}
          </div>
        )}
      </Card>

      {(phases.length > 0 || milestones.length > 0) && (
        <Card title="Timeline">
          {phases.length > 0 && (
            <div style={{ marginBottom: 'var(--spacing-xs)' }}>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Phases:
              </span>
              {phases.map((p, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    padding: '1px 0 1px 8px',
                  }}
                >
                  • {typeof p === 'string' ? p : p.name || JSON.stringify(p)}
                </div>
              ))}
            </div>
          )}
          {milestones.length > 0 && (
            <div>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  display: 'block',
                  marginBottom: '4px',
                }}
              >
                Milestones:
              </span>
              {milestones.map((m, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    padding: '1px 0 1px 8px',
                  }}
                >
                  • {typeof m === 'string' ? m : m.name || JSON.stringify(m)}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function PersonaDashboard({ role, summaryData, loading = false }) {
  if (loading) {
    return (
      <div style={{ padding: 'var(--spacing-lg)', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-block',
            width: '20px',
            height: '20px',
            border: '3px solid var(--color-border-default)',
            borderTop: '3px solid var(--color-accent-purple, #7c3aed)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <p
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            marginTop: '8px',
          }}
        >
          Loading summary…
        </p>
      </div>
    );
  }

  if (!summaryData) {
    return (
      <div
        style={{
          padding: 'var(--spacing-md)',
          color: 'var(--color-text-secondary)',
          fontSize: 'var(--font-size-sm)',
        }}
      >
        No summary data available.
      </div>
    );
  }

  if (role === 'cpl') return <CplDashboard data={summaryData} />;
  if (role === 'cdp') return <CdpDashboard data={summaryData} />;
  if (role === 'delivery-manager') return <DmDashboard data={summaryData} />;

  return (
    <div
      style={{
        padding: 'var(--spacing-md)',
        color: 'var(--color-text-secondary)',
        fontSize: 'var(--font-size-sm)',
      }}
    >
      No persona dashboard available for role: {role}
    </div>
  );
}
