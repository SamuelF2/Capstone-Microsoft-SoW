/**
 * draftTabs/waterfall.js — tab definitions for the Waterfall methodology.
 */

import ExecutiveSummary from '../../components/sow/ExecutiveSummary';
import ProjectScope from '../../components/sow/ProjectScope';
import Deliverables from '../../components/sow/Deliverables';
import AssumptionsRisks from '../../components/sow/AssumptionsRisks';
import TeamStructure from '../../components/sow/TeamStructure';
import Pricing from '../../components/sow/Pricing';
import SupportTransition from '../../components/sow/SupportTransition';
import WaterfallApproach from '../../components/sow/WaterfallApproach';
import PhasesMilestones from '../../components/sow/PhasesMilestones';

const WATERFALL_TABS = [
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
    label: 'Approach',
    key: 'approach',
    render: (data, update) => (
      <>
        <WaterfallApproach
          data={data.waterfallApproach}
          onChange={(v) => update('waterfallApproach', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <PhasesMilestones
            data={data.phasesMilestones}
            onChange={(v) => update('phasesMilestones', v)}
          />
        </div>
      </>
    ),
  },
  {
    label: 'Deliverables',
    key: 'deliverables',
    render: (data, update) => (
      <Deliverables data={data.deliverables} onChange={(v) => update('deliverables', v)} />
    ),
  },
  {
    label: 'Team & Responsibilities',
    key: 'team',
    render: (data, update) => (
      <>
        <TeamStructure data={data.teamStructure} onChange={(v) => update('teamStructure', v)} />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <AssumptionsRisks
            data={data.assumptionsRisks}
            onChange={(v) => update('assumptionsRisks', v)}
          />
        </div>
      </>
    ),
  },
  {
    label: 'Support & Pricing',
    key: 'support',
    render: (data, update) => (
      <>
        <SupportTransition
          data={data.supportTransition}
          onChange={(v) => update('supportTransition', v)}
        />
        <div style={{ marginTop: 'var(--spacing-3xl)' }}>
          <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
        </div>
      </>
    ),
  },
];

export default WATERFALL_TABS;
