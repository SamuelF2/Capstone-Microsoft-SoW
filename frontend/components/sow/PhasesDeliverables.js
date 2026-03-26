function genId() {
  return `phase-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const PHASE_STATUSES = ['Not Started', 'In Progress', 'Complete'];
const STATUS_COLORS = {
  'Not Started': 'var(--color-text-secondary)',
  'In Progress': 'var(--color-warning)',
  Complete: 'var(--color-success)',
};

const SURE_STEP_PHASES = ['Analyse', 'Design', 'Develop', 'Deploy', 'Operate'];

const emptyPhase = () => ({
  id: genId(),
  name: '',
  description: '',
  deliverables: '',
  duration: '',
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
    </div>
  );
}

export default function PhasesDeliverables({ data, onChange }) {
  const phases = data ?? [];

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Phases & Deliverables</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the Sure Step implementation phases and the key deliverables produced in each.
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
