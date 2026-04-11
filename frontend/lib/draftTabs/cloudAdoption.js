/**
 * draftTabs/cloudAdoption.js — tab definitions for the Cloud Adoption methodology.
 */

import ExecutiveSummary from '../../components/sow/ExecutiveSummary';
import Deliverables from '../../components/sow/Deliverables';
import AssumptionsRisks from '../../components/sow/AssumptionsRisks';
import Pricing from '../../components/sow/Pricing';
import CloudAdoptionScope from '../../components/sow/CloudAdoptionScope';
import MigrationStrategy from '../../components/sow/MigrationStrategy';
import WorkloadAssessment from '../../components/sow/WorkloadAssessment';
import SecurityCompliance from '../../components/sow/SecurityCompliance';
import SupportOperations from '../../components/sow/SupportOperations';

const CLOUD_ADOPTION_TABS = [
  {
    label: 'Overview',
    key: 'overview',
    render: (data, update) => (
      <ExecutiveSummary
        data={data.executiveSummary}
        onChange={(v) => update('executiveSummary', v)}
      />
    ),
  },
  {
    label: 'Scope',
    key: 'scope',
    render: (data, update) => (
      <CloudAdoptionScope
        data={data.cloudAdoptionScope}
        onChange={(v) => update('cloudAdoptionScope', v)}
      />
    ),
  },
  {
    label: 'Migration',
    key: 'migration',
    render: (data, update) => (
      <>
        <MigrationStrategy
          data={data.migrationStrategy}
          onChange={(v) => update('migrationStrategy', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <WorkloadAssessment
            data={data.workloadAssessment}
            onChange={(v) => update('workloadAssessment', v)}
          />
        </div>
      </>
    ),
  },
  {
    label: 'Deliverables & Security',
    key: 'deliverables',
    render: (data, update) => (
      <>
        <Deliverables data={data.deliverables} onChange={(v) => update('deliverables', v)} />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <SecurityCompliance
            data={data.securityCompliance}
            onChange={(v) => update('securityCompliance', v)}
          />
        </div>
      </>
    ),
  },
  {
    label: 'Responsibilities & Risks',
    key: 'risks',
    render: (data, update) => (
      <AssumptionsRisks
        data={data.assumptionsRisks}
        onChange={(v) => update('assumptionsRisks', v)}
      />
    ),
  },
  {
    label: 'Support & Pricing',
    key: 'support',
    render: (data, update) => (
      <>
        <SupportOperations
          data={data.supportOperations}
          onChange={(v) => update('supportOperations', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
        </div>
      </>
    ),
  },
];

export default CLOUD_ADOPTION_TABS;
