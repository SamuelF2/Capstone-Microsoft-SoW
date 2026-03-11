function genId() {
  return `phase-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const PHASE_STATUSES = ['Not Started', 'In Progress', 'Complete'];
const STATUS_COLORS = {
  'Not Started': 'var(--color-text-secondary)',
  'In Progress': 'var(--color-warning)',
  Complete: 'var(--color-success)',
};

const emptyPhase = () => ({
  id: genId(),
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
    <div
      className="card"
      style={{
        minWidth: '320px',
        maxWidth: '320px',
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 'var(--spacing-md)',
          right: 'var(--spacing-md)',
          display: 'flex',
          gap: 'var(--spacing-xs)',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: STATUS_COLORS[item.status],
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          ● {item.status}
        </span>
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            fontSize: '18px',
            lineHeight: 1,
            padding: '2px',
          }}
        >
          ×
        </button>
      </div>

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
    </div>
  );
}

export default function PhasesMilestones({ data, onChange }) {
  const phases = data ?? [];

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Phases & Milestones</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the project phases, key milestones, and deliverables for each stage of the
          Waterfall delivery.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        {phases.map((phase) => (
          <PhaseCard
            key={phase.id}
            item={phase}
            onChange={(updated) => onChange(phases.map((p) => (p.id === updated.id ? updated : p)))}
            onRemove={() => onChange(phases.filter((p) => p.id !== phase.id))}
          />
        ))}
        <div
          style={{
            minWidth: '180px',
            maxWidth: '180px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px dashed var(--color-border-default)',
            borderRadius: 'var(--radius-lg)',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            transition: 'border-color var(--transition-base), color var(--transition-base)',
            minHeight: '200px',
          }}
          onClick={() => onChange([...phases, emptyPhase()])}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-accent-blue)';
            e.currentTarget.style.color = 'var(--color-accent-blue)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: 'var(--spacing-xs)' }}>+</div>
            <div className="text-sm">Add Phase</div>
          </div>
        </div>
      </div>
    </div>
  );
}
