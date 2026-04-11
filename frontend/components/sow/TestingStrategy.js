import SectionHeader from './ui/SectionHeader';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function TestingStrategy({ data, onChange }) {
  const overview = data?.overview ?? '';
  const unitTesting = data?.unitTesting ?? '';
  const integrationTesting = data?.integrationTesting ?? '';
  const uatPlan = data?.uatPlan ?? '';
  const defectManagement = data?.defectManagement ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Testing Strategy"
        description="Define the end-to-end testing approach for this Dynamics 365 implementation, covering all test phases from unit testing through to user acceptance."
      />

      <div className="card" style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h3 className="text-lg font-semibold mb-sm">Testing Overview</h3>
        <p className="text-sm text-secondary mb-md">
          Provide a high-level summary of the testing strategy and the phases of testing planned.
        </p>
        <textarea
          className="form-textarea"
          value={overview}
          onChange={(e) => update({ overview: e.target.value })}
          placeholder="Describe the overall testing approach — test phases, tooling, entry/exit criteria, and the customer's role in the testing process..."
          rows={5}
        />
      </div>

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Unit & System Testing</h3>
          <textarea
            className="form-textarea"
            value={unitTesting}
            onChange={(e) => update({ unitTesting: e.target.value })}
            placeholder="Describe unit and system testing activities — who performs them, what is tested, and the acceptance criteria..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Integration Testing</h3>
          <textarea
            className="form-textarea"
            value={integrationTesting}
            onChange={(e) => update({ integrationTesting: e.target.value })}
            placeholder="Describe integration testing — interfaces tested, test environments, tooling, and pass/fail criteria..."
            rows={6}
          />
        </div>
      </TwoColumnGrid>

      <TwoColumnGrid>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">User Acceptance Testing (UAT)</h3>
          <textarea
            className="form-textarea"
            value={uatPlan}
            onChange={(e) => update({ uatPlan: e.target.value })}
            placeholder="Describe the UAT plan — test scripts, customer test team, timeline, and sign-off process..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Defect Management</h3>
          <textarea
            className="form-textarea"
            value={defectManagement}
            onChange={(e) => update({ defectManagement: e.target.value })}
            placeholder="Describe how defects will be logged, prioritised, tracked, and resolved — tooling, severity classifications, and SLAs..."
            rows={6}
          />
        </div>
      </TwoColumnGrid>
    </div>
  );
}
