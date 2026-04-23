import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import TwoColumnGrid from './ui/TwoColumnGrid';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const SPRINT_DURATIONS = ['1 week', '2 weeks', '3 weeks', '4 weeks'];

const emptySprint = () => ({
  id: genId('sprint'),
  name: '',
  goal: '',
  duration: '2 weeks',
  stories: '',
});

function SprintCard({ item, onChange, onRemove }) {
  return (
    <ListCard width="300px" onRemove={onRemove}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Sprint Name
        </label>
        <input
          type="text"
          className="form-input"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="e.g. Sprint 1 – Foundation"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Sprint Goal
        </label>
        <textarea
          className="form-textarea"
          value={item.goal}
          onChange={(e) => onChange({ ...item, goal: e.target.value })}
          placeholder="What should this sprint achieve?"
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Duration
        </label>
        <select
          className="form-select"
          value={item.duration}
          onChange={(e) => onChange({ ...item, duration: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          {SPRINT_DURATIONS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Key Stories / Features
        </label>
        <textarea
          className="form-textarea"
          value={item.stories}
          onChange={(e) => onChange({ ...item, stories: e.target.value })}
          placeholder="List the key user stories or features planned for this sprint..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </ListCard>
  );
}

export default function AgileApproach({ data, onChange }) {
  const deliveryApproach = data?.deliveryApproach ?? '';
  const supportTransitionPlan = data?.supportTransitionPlan ?? '';
  const sprints = data?.sprints ?? [];

  const update = (patch) => onChange({ ...data, ...patch });

  const addSprint = () => update({ sprints: [...sprints, emptySprint()] });
  const removeSprint = (id) => update({ sprints: sprints.filter((s) => s.id !== id) });
  const changeSprint = (updated) =>
    update({ sprints: sprints.map((s) => (s.id === updated.id ? updated : s)) });

  return (
    <div>
      <SectionHeader
        title="Agile Approach & Sprints"
        description="Describe the Agile delivery methodology and plan the sprint structure for this engagement."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <div data-subsection="agileApproach:deliveryApproach">
          <FormCard
            title="Delivery Approach & Methodology"
            description="Ensure your approach aligns with the Agile methodology and includes how you'll manage risks and quality across sprints."
          >
            <textarea
              className="form-textarea"
              value={deliveryApproach}
              onChange={(e) => update({ deliveryApproach: e.target.value })}
              placeholder="Describe the Agile delivery approach — ceremonies (stand-ups, reviews, retrospectives), tooling (Azure DevOps, Jira), sprint cadence, and quality gates..."
              rows={8}
            />
          </FormCard>
        </div>

        <div data-subsection="agileApproach:supportTransitionPlan">
          <FormCard
            title="Support Transition Plan"
            description="Describe how the solution will be transitioned to the customer's operations team after go-live."
          >
            <textarea
              className="form-textarea"
              value={supportTransitionPlan}
              onChange={(e) => update({ supportTransitionPlan: e.target.value })}
              placeholder="Outline the transition activities — knowledge transfer sessions, runbook handover, training plan, and the support window post-go-live..."
              rows={8}
            />
          </FormCard>
        </div>
      </TwoColumnGrid>

      {/* Sprint Planning */}
      <div data-subsection="agileApproach:sprints">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-md)',
          }}
        >
          <div>
            <h3 className="text-xl font-semibold mb-xs">Sprint Planning</h3>
            <p className="text-sm text-secondary">
              Define the sprint breakdown for the delivery. Add one card per sprint.
            </p>
          </div>
        </div>
        <HorizontalCardList>
          {sprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              item={sprint}
              onChange={changeSprint}
              onRemove={() => removeSprint(sprint.id)}
            />
          ))}
          <AddCardButton label="Add Sprint" onClick={addSprint} />
        </HorizontalCardList>
      </div>
    </div>
  );
}
