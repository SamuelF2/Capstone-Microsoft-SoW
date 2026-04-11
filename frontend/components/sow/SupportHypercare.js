import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';

const HYPERCARE_WINDOWS = ['2 weeks', '30 days', '45 days', '60 days', '90 days', 'Custom'];

export default function SupportHypercare({ data, onChange }) {
  const supportPlan = data?.supportPlan ?? '';
  const hypercareDescription = data?.hypercareDescription ?? '';
  const hypercareWindow = data?.hypercareWindow ?? '30 days';
  const customWindow = data?.customWindow ?? '';
  const escalationPath = data?.escalationPath ?? '';
  const bauTransition = data?.bauTransition ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Support & Hypercare"
        description="Define the hypercare support model for the period immediately following go-live, and the transition to business-as-usual (BAU) support."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <FormCard
          title="Go-Live Support Plan"
          description="Describe the support provided to the customer during the go-live period."
        >
          <textarea
            className="form-textarea"
            value={supportPlan}
            onChange={(e) => update({ supportPlan: e.target.value })}
            placeholder="Describe the go-live support activities — war room setup, on-site/remote support team, monitoring activities, and daily check-in process..."
            rows={7}
          />
        </FormCard>

        <FormCard title="Hypercare Period">
          <div className="form-group">
            <label className="form-label">Hypercare Window</label>
            <select
              className="form-select"
              value={hypercareWindow}
              onChange={(e) => update({ hypercareWindow: e.target.value })}
            >
              {HYPERCARE_WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            {hypercareWindow === 'Custom' && (
              <input
                type="text"
                className="form-input"
                value={customWindow}
                onChange={(e) => update({ customWindow: e.target.value })}
                placeholder="e.g. 6 weeks"
                style={{ marginTop: 'var(--spacing-sm)' }}
              />
            )}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Hypercare Description</label>
            <textarea
              className="form-textarea"
              value={hypercareDescription}
              onChange={(e) => update({ hypercareDescription: e.target.value })}
              placeholder="Describe the hypercare support — response times, support hours, team composition, and the types of issues covered..."
              rows={4}
            />
          </div>
        </FormCard>
      </TwoColumnGrid>

      <TwoColumnGrid>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Escalation Path</h3>
          <textarea
            className="form-textarea"
            value={escalationPath}
            onChange={(e) => update({ escalationPath: e.target.value })}
            placeholder="Define the escalation path for critical issues — L1, L2, L3 support tiers, contacts, and SLAs at each level..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Transition to BAU</h3>
          <textarea
            className="form-textarea"
            value={bauTransition}
            onChange={(e) => update({ bauTransition: e.target.value })}
            placeholder="Describe how support transitions from hypercare to BAU — knowledge transfer to the customer's IT team, documentation handover, and exit criteria..."
            rows={6}
          />
        </div>
      </TwoColumnGrid>
    </div>
  );
}
