import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const PHASE_STATUSES = ['Not Started', 'In Progress', 'Complete'];
const STATUS_COLORS = {
  'Not Started': 'var(--color-text-secondary)',
  'In Progress': 'var(--color-warning)',
  Complete: 'var(--color-success)',
};

const SURE_STEP_PHASES = ['Analyse', 'Design', 'Develop', 'Deploy', 'Operate'];

const emptyPhase = () => ({
  id: genId('phase'),
  name: '',
  description: '',
  deliverables: '',
  duration: '',
  status: 'Not Started',
});

function PhaseCard({ item, onChange, onRemove }) {
  const statusBadge = (
    <span
      style={{
        fontSize: 'var(--font-size-xs)',
        color: STATUS_COLORS[item.status],
        fontWeight: 'var(--font-weight-medium)',
      }}
    >
      ● {item.status}
    </span>
  );

  return (
    <ListCard width="320px" onRemove={onRemove} headerExtras={statusBadge}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Phase Name
        </label>
        <select
          className="form-select"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          <option value="">Select phase...</option>
          {SURE_STEP_PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value="Custom">Custom</option>
        </select>
        {item.name === 'Custom' && (
          <input
            type="text"
            className="form-input"
            value={item.customName || ''}
            onChange={(e) => onChange({ ...item, customName: e.target.value })}
            placeholder="Enter phase name"
            style={{ fontSize: 'var(--font-size-sm)', marginTop: 'var(--spacing-xs)' }}
          />
        )}
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
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Key Deliverables
        </label>
        <textarea
          className="form-textarea"
          value={item.deliverables}
          onChange={(e) => onChange({ ...item, deliverables: e.target.value })}
          placeholder="List the deliverables produced in this phase..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Duration
          </label>
          <input
            type="text"
            className="form-input"
            value={item.duration}
            onChange={(e) => onChange({ ...item, duration: e.target.value })}
            placeholder="e.g. 3 weeks"
            style={{ fontSize: 'var(--font-size-sm)' }}
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
      </div>
    </ListCard>
  );
}

export default function PhasesDeliverables({ data, onChange }) {
  const phases = data ?? [];

  return (
    <div>
      <SectionHeader
        title="Phases & Deliverables"
        description="Define the Sure Step implementation phases and the key deliverables produced in each."
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
