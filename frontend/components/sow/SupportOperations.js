import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function SupportOperations({ data, onChange }) {
  const operationalModel = data?.operationalModel ?? '';
  const monitoring = data?.monitoring ?? '';
  const supportTiers = data?.supportTiers ?? '';
  const runbook = data?.runbook ?? '';
  const hypercare = data?.hypercare ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Support & Operations"
        description="Define the operational model, monitoring strategy, and support structure for the post-migration steady state."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <FormCard
          title="Operational Model"
          description="Describe how the solution will be transitioned to the customer's operations team after go-live."
        >
          <textarea
            className="form-textarea"
            value={operationalModel}
            onChange={(e) => update({ operationalModel: e.target.value })}
            placeholder="Describe the cloud operating model — who manages the Azure environment, how changes are approved, cost management processes, and the division of responsibility between customer and partner..."
            rows={8}
          />
        </FormCard>

        <FormCard
          title="Delivery Approach"
          description="Ensure your approach aligns with the Cloud Adoption Framework and includes how you'll manage risks and quality throughout the migration."
        >
          <textarea
            className="form-textarea"
            value={monitoring}
            onChange={(e) => update({ monitoring: e.target.value })}
            placeholder="Describe the monitoring and observability approach — Azure Monitor, Log Analytics, Application Insights, dashboards, alert rules, and incident response processes..."
            rows={8}
          />
        </FormCard>
      </TwoColumnGrid>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--spacing-xl)',
        }}
      >
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Support Tiers</h3>
          <textarea
            className="form-textarea"
            value={supportTiers}
            onChange={(e) => update({ supportTiers: e.target.value })}
            placeholder="Define L1/L2/L3 support responsibilities, contacts, SLAs, and escalation criteria..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Runbook Handover</h3>
          <textarea
            className="form-textarea"
            value={runbook}
            onChange={(e) => update({ runbook: e.target.value })}
            placeholder="Describe the runbooks and operational documentation that will be delivered — architecture diagrams, deployment guides, DR procedures..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Post Go-Live Hypercare</h3>
          <textarea
            className="form-textarea"
            value={hypercare}
            onChange={(e) => update({ hypercare: e.target.value })}
            placeholder="Describe the hypercare support model — duration, team composition, response times, and transition to steady-state support..."
            rows={6}
          />
        </div>
      </div>
    </div>
  );
}
