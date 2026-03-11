import { useState } from 'react';

function genId() {
  return `del-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const emptyDeliverable = () => ({
  id: genId(),
  name: '',
  description: '',
  acceptanceCriteria: '',
  milestonePhase: '',
  dueDate: '',
});

function DeliverableCard({ item, onChange, onRemove }) {
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
        title="Remove deliverable"
      >
        ×
      </button>

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
    </div>
  );
}

export default function Deliverables({ data, onChange }) {
  const items = data ?? [];

  const handleAdd = () => onChange([...items, emptyDeliverable()]);

  const handleRemove = (id) => onChange(items.filter((i) => i.id !== id));

  const handleChange = (updated) => onChange(items.map((i) => (i.id === updated.id ? updated : i)));

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Deliverables & Acceptance</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the specific deliverables for this engagement, including acceptance criteria that
          must be met before sign-off.
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
        {items.map((item) => (
          <DeliverableCard
            key={item.id}
            item={item}
            onChange={handleChange}
            onRemove={() => handleRemove(item.id)}
          />
        ))}
        <div
          style={{
            minWidth: '220px',
            maxWidth: '220px',
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
          onClick={handleAdd}
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
            <div style={{ fontSize: '28px', marginBottom: 'var(--spacing-sm)' }}>+</div>
            <div className="text-sm">Add Deliverable</div>
          </div>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-sm text-secondary" style={{ marginTop: 'var(--spacing-md)' }}>
          No deliverables added yet. Click "+ Add Deliverable" to get started.
        </p>
      )}
    </div>
  );
}
