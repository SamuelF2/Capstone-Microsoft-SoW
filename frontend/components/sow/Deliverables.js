import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const emptyDeliverable = () => ({
  id: genId('del'),
  name: '',
  description: '',
  acceptanceCriteria: '',
  milestonePhase: '',
  dueDate: '',
});

function DeliverableCard({ item, onChange, onRemove }) {
  return (
    <ListCard width="320px" onRemove={onRemove} removeTitle="Remove deliverable">
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Deliverable Name <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <input
          type="text"
          className="form-input"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="e.g. Azure Landing Zone Setup"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Description
        </label>
        <textarea
          className="form-textarea"
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          placeholder="Describe what this deliverable entails..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Acceptance Criteria <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <textarea
          className="form-textarea"
          value={item.acceptanceCriteria}
          onChange={(e) => onChange({ ...item, acceptanceCriteria: e.target.value })}
          placeholder="Define measurable criteria for acceptance..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Milestone / Phase
          </label>
          <input
            type="text"
            className="form-input"
            value={item.milestonePhase}
            onChange={(e) => onChange({ ...item, milestonePhase: e.target.value })}
            placeholder="e.g. Phase 1"
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Due Date
          </label>
          <input
            type="date"
            className="form-input"
            value={item.dueDate}
            onChange={(e) => onChange({ ...item, dueDate: e.target.value })}
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
      </div>
    </ListCard>
  );
}

export default function Deliverables({ data, onChange }) {
  const items = data ?? [];

  const handleAdd = () => onChange([...items, emptyDeliverable()]);
  const handleRemove = (id) => onChange(items.filter((i) => i.id !== id));
  const handleChange = (updated) => onChange(items.map((i) => (i.id === updated.id ? updated : i)));

  return (
    <div>
      <SectionHeader
        title="Deliverables & Acceptance"
        description="Define the specific deliverables for this engagement, including acceptance criteria that must be met before sign-off."
      />

      <HorizontalCardList>
        {items.map((item) => (
          <DeliverableCard
            key={item.id}
            item={item}
            onChange={handleChange}
            onRemove={() => handleRemove(item.id)}
          />
        ))}
        <AddCardButton label="Add Deliverable" width="220px" onClick={handleAdd} />
      </HorizontalCardList>

      {items.length === 0 && (
        <p className="text-sm text-secondary" style={{ marginTop: 'var(--spacing-md)' }}>
          No deliverables added yet. Click "+ Add Deliverable" to get started.
        </p>
      )}
    </div>
  );
}
