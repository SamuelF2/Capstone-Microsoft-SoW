/**
 * draftTabs/sureStep.js — tab definitions for the Sure Step 365 methodology.
 */

import ExecutiveSummary from '../../components/sow/ExecutiveSummary';
import ProjectScope from '../../components/sow/ProjectScope';
import AssumptionsRisks from '../../components/sow/AssumptionsRisks';
import Pricing from '../../components/sow/Pricing';
import SureStepMethodology from '../../components/sow/SureStepMethodology';
import PhasesDeliverables from '../../components/sow/PhasesDeliverables';
import DataMigration from '../../components/sow/DataMigration';
import TestingStrategy from '../../components/sow/TestingStrategy';
import SupportHypercare from '../../components/sow/SupportHypercare';

const SURE_STEP_TABS = [
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
      <ProjectScope data={data.projectScope} onChange={(v) => update('projectScope', v)} />
    ),
  },
  {
    label: 'Methodology',
    key: 'methodology',
    render: (data, update) => (
      <>
        <SureStepMethodology
          data={data.sureStepMethodology}
          onChange={(v) => update('sureStepMethodology', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <PhasesDeliverables
            data={data.phasesDeliverables}
            onChange={(v) => update('phasesDeliverables', v)}
          />
        </div>
      </>
    ),
  },
  {
    label: 'Technical',
    key: 'technical',
    render: (data, update) => (
      <>
        <DataMigration data={data.dataMigration} onChange={(v) => update('dataMigration', v)} />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <TestingStrategy
            data={data.testingStrategy}
            onChange={(v) => update('testingStrategy', v)}
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
        <SupportHypercare
          data={data.supportHypercare}
          onChange={(v) => update('supportHypercare', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
        </div>
      </>
    ),
  },
];

export default SURE_STEP_TABS;
