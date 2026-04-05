import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const PHASE_STATUSES = ['Not Started', 'In Progress', 'Complete'];
const STATUS_COLORS = {
  'Not Started': 'var(--color-text-secondary)',
  'In Progress': 'var(--color-warning)',
  Complete: 'var(--color-success)',
};

const emptyPhase = () => ({
  id: genId('phase'),
  name: '',
  startDate: '',
  endDate: '',
  description: '',
  milestone: '',
  deliverables: '',
  status: 'Not Started',
});

function PhaseCard({ item, onChange, onRemove }) {
  return (
    <ListCard
      width="320px"
      onRemove={onRemove}
      headerExtras={
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: STATUS_COLORS[item.status],
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          ● {item.status}
        </span>
      }
    >
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Phase Name
        </label>
        <input
          type="text"
          className="form-input"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="e.g. Requirements & Design"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Start Date
          </label>
          <input
            type="date"
            className="form-input"
            value={item.startDate}
            onChange={(e) => onChange({ ...item, startDate: e.target.value })}
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            End Date
          </label>
          <input
            type="date"
            className="form-input"
            value={item.endDate}
            onChange={(e) => onChange({ ...item, endDate: e.target.value })}
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Description
        </label>
        <textarea
          className="form-textarea"
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          placeholder="Describe the activities and objectives of this phase..."
          rows={2}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Key Milestone
        </label>
        <input
          type="text"
          className="form-input"
          value={item.milestone}
          onChange={(e) => onChange({ ...item, milestone: e.target.value })}
          placeholder="e.g. Signed-off design document"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Deliverables
        </label>
        <textarea
          className="form-textarea"
          value={item.deliverables}
          onChange={(e) => onChange({ ...item, deliverables: e.target.value })}
          placeholder="List the deliverables produced in this phase..."
          rows={2}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Status
        </label>
        <select
          className="form-select"
          value={item.status}
          onChange={(e) => onChange({ ...item, status: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)', color: STATUS_COLORS[item.status] }}
        >
          {PHASE_STATUSES.map((s) => (
            <option key={s} value={s} style={{ color: STATUS_COLORS[s] }}>
              {s}
            </option>
          ))}
        </select>
      </div>
    </ListCard>
  );
}

export default function PhasesMilestones({ data, onChange }) {
  const phases = data ?? [];

  return (
    <div>
      <SectionHeader
        title="Phases & Milestones"
        description="Define the project phases, key milestones, and deliverables for each stage of the Waterfall delivery."
      />

      <HorizontalCardList>
        {phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            item={phase}
            onChange={(updated) => onChange(phases.map((p) => (p.id === updated.id ? updated : p)))}
            onRemove={() => onChange(phases.filter((p) => p.id !== phase.id))}
          />
        ))}
        <AddCardButton label="Add Phase" onClick={() => onChange([...phases, emptyPhase()])} />
      </HorizontalCardList>
    </div>
  );
}
