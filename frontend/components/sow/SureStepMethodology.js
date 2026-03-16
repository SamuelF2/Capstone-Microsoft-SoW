export default function SureStepMethodology({ data, onChange }) {
  const methodologyOverview = data?.methodologyOverview ?? '';
  const approachDetails = data?.approachDetails ?? '';
  const governanceModel = data?.governanceModel ?? '';
  const qualityAssurance = data?.qualityAssurance ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Sure Step Methodology</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the Sure Step methodology approach for this Dynamics 365 implementation, including
          governance, quality assurance, and risk management practices.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-xl)',
        }}
      >
        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Delivery Approach & Methodology
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Ensure your approach aligns with the Sure Step methodology and includes how you'll
            manage risks and quality throughout the implementation.
          </p>
          <textarea
            className="form-textarea"
            value={methodologyOverview}
            onChange={(e) => update({ methodologyOverview: e.target.value })}
            placeholder="Describe how Sure Step phases will be applied — Analyse, Design, Develop, Deploy, and Operate. Include how you'll conduct fit-gap analysis, solution design, and configuration..."
            rows={8}
          />
        </div>

        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Support Transition Plan
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Describe how the solution will be transitioned to the customer's operations team after
            go-live.
          </p>
          <textarea
            className="form-textarea"
            value={approachDetails}
            onChange={(e) => update({ approachDetails: e.target.value })}
            placeholder="Outline the go-live support window, knowledge transfer to the customer's team, hypercare period, and transition to BAU support..."
            rows={8}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
        }}
      >
        <div className="card">
          <h3 className="text-lg font-semibold mb-md">Governance Model</h3>
          <textarea
            className="form-textarea"
            value={governanceModel}
            onChange={(e) => update({ governanceModel: e.target.value })}
            placeholder="Describe the project governance structure — steering committee, project board, change control process, and decision-making authority..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-md">Quality Assurance</h3>
          <textarea
            className="form-textarea"
            value={qualityAssurance}
            onChange={(e) => update({ qualityAssurance: e.target.value })}
            placeholder="Describe the QA approach — review gates, acceptance criteria process, defect tracking, and sign-off procedures..."
            rows={6}
          />
        </div>
      </div>
    </div>
  );
}
