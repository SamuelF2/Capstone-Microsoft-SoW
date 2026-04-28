import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];
const PRIORITY_COLORS = {
  Critical: 'var(--color-error)',
  High: '#f97316',
  Medium: 'var(--color-warning)',
  Low: 'var(--color-success)',
};

const emptyItem = () => ({
  id: genId('pb'),
  epic: '',
  userStory: '',
  storyPoints: '',
  priority: 'Medium',
  sprint: '',
});

function BacklogCard({ item, onChange, onRemove }) {
  const priorityBadge = (
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
  );

  return (
    <ListCard width="300px" onRemove={onRemove} headerExtras={priorityBadge}>
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
    </ListCard>
  );
}

export default function ProductBacklog({ data, onChange }) {
  const items = data ?? [];

  const totalPoints = items.reduce((sum, i) => sum + (parseInt(i.storyPoints) || 0), 0);

  return (
    <div data-subsection="productBacklog:items">
      <SectionHeader
        title="Product Backlog"
        description="Define the initial product backlog for this engagement. Each item represents a user story or feature to be delivered."
      />

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

      <HorizontalCardList>
        {items.map((item) => (
          <BacklogCard
            key={item.id}
            item={item}
            onChange={(updated) => onChange(items.map((i) => (i.id === updated.id ? updated : i)))}
            onRemove={() => onChange(items.filter((i) => i.id !== item.id))}
          />
        ))}
        <AddCardButton label="Add Story" onClick={() => onChange([...items, emptyItem()])} />
      </HorizontalCardList>
    </div>
  );
}
