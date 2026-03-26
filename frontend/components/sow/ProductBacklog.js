function genId() {
  return `pb-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITY_COLORS = {
  Critical: 'var(--color-error)',
  High: '#f97316',
  Medium: 'var(--color-warning)',
  Low: 'var(--color-success)',
};

const emptyItem = () => ({
  id: genId(),
  epic: '',
  userStory: '',
  storyPoints: '',
  priority: 'Medium',
  sprint: '',
});

function BacklogCard({ item, onChange, onRemove }) {
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
            fontWeight: 'var(--font-weight-semibold)',
            color: PRIORITY_COLORS[item.priority],
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${PRIORITY_COLORS[item.priority]}`,
          }}
        >
          {item.priority}
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
          Epic / Feature
        </label>
        <input
          type="text"
          className="form-input"
          value={item.epic}
          onChange={(e) => onChange({ ...item, epic: e.target.value })}
          placeholder="e.g. User Authentication"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          User Story
        </label>
        <textarea
          className="form-textarea"
          value={item.userStory}
          onChange={(e) => onChange({ ...item, userStory: e.target.value })}
          placeholder="As a [user], I want to [action], so that [benefit]..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Story Points
          </label>
          <input
            type="number"
            className="form-input"
            value={item.storyPoints}
            onChange={(e) => onChange({ ...item, storyPoints: e.target.value })}
            placeholder="e.g. 5"
            min="0"
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Priority
          </label>
          <select
            className="form-select"
            value={item.priority}
            onChange={(e) => onChange({ ...item, priority: e.target.value })}
            style={{ fontSize: 'var(--font-size-sm)', color: PRIORITY_COLORS[item.priority] }}
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p} style={{ color: PRIORITY_COLORS[p] }}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Target Sprint
        </label>
        <input
          type="text"
          className="form-input"
          value={item.sprint}
          onChange={(e) => onChange({ ...item, sprint: e.target.value })}
          placeholder="e.g. Sprint 2"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>
    </div>
  );
}

export default function ProductBacklog({ data, onChange }) {
  const items = data ?? [];

  const totalPoints = items.reduce((sum, i) => sum + (parseInt(i.storyPoints) || 0), 0);

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Product Backlog</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the initial product backlog for this engagement. Each item represents a user story
          or feature to be delivered.
        </p>
      </div>

      {/* Stats bar */}
      {items.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-xl)',
            marginBottom: 'var(--spacing-lg)',
            padding: 'var(--spacing-md) var(--spacing-lg)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <div>
            <span className="text-sm text-secondary">Total Items: </span>
            <span className="font-semibold">{items.length}</span>
          </div>
          <div>
            <span className="text-sm text-secondary">Total Story Points: </span>
            <span className="font-semibold" style={{ color: 'var(--color-accent-blue)' }}>
              {totalPoints}
            </span>
          </div>
          {PRIORITIES.map((p) => {
            const count = items.filter((i) => i.priority === p).length;
            return count > 0 ? (
              <div key={p}>
                <span className="text-sm text-secondary">{p}: </span>
                <span className="font-semibold" style={{ color: PRIORITY_COLORS[p] }}>
                  {count}
                </span>
              </div>
            ) : null;
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        {items.map((item) => (
          <BacklogCard
            key={item.id}
            item={item}
            onChange={(updated) => onChange(items.map((i) => (i.id === updated.id ? updated : i)))}
            onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
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
          onClick={() => onChange([...items, emptyItem()])}
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
            <div className="text-sm">Add Story</div>
          </div>
        </div>
      </div>
    </div>
  );
}
