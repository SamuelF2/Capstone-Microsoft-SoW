function genId() {
  return `sprint-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const SPRINT_DURATIONS = ['1 week', '2 weeks', '3 weeks', '4 weeks'];

const emptySprint = () => ({
  id: genId(),
  name: '',
  goal: '',
  duration: '2 weeks',
  stories: '',
});

function SprintCard({ item, onChange, onRemove }) {
  return (
    <div
      className="card"
      style={{
        minWidth: '300px',
        maxWidth: '300px',
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-md)',
      }}
    >
      <button
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: 'var(--spacing-md)',
          right: 'var(--spacing-md)',
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
    </div>
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
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Agile Approach & Sprints</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Describe the Agile delivery methodology and plan the sprint structure for this engagement.
        </p>
      </div>

      {/* Two approach cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-2xl)',
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
            Ensure your approach aligns with the Agile methodology and includes how you'll manage
            risks and quality across sprints.
          </p>
          <textarea
            className="form-textarea"
            value={deliveryApproach}
            onChange={(e) => update({ deliveryApproach: e.target.value })}
            placeholder="Describe the Agile delivery approach — ceremonies (stand-ups, reviews, retrospectives), tooling (Azure DevOps, Jira), sprint cadence, and quality gates..."
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
            value={supportTransitionPlan}
            onChange={(e) => update({ supportTransitionPlan: e.target.value })}
            placeholder="Outline the transition activities — knowledge transfer sessions, runbook handover, training plan, and the support window post-go-live..."
            rows={8}
          />
        </div>
      </div>

      {/* Sprint Planning */}
      <div>
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
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-lg)',
            overflowX: 'auto',
            paddingBottom: 'var(--spacing-md)',
          }}
        >
          {sprints.map((sprint) => (
            <SprintCard
              key={sprint.id}
              item={sprint}
              onChange={changeSprint}
              onRemove={() => removeSprint(sprint.id)}
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
            onClick={addSprint}
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
              <div className="text-sm">Add Sprint</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
