function genId() {
  return `mem-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const emptyMember = () => ({
  id: genId(),
  role: '',
  onshore: '',
  offshore: '',
  assignedPerson: '',
});

function MemberCard({ item, onChange, onRemove }) {
  return (
    <div
      className="card"
      style={{
        minWidth: '280px',
        maxWidth: '280px',
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
          Role
        </label>
        <input
          type="text"
          className="form-input"
          value={item.role}
          onChange={(e) => onChange({ ...item, role: e.target.value })}
          placeholder="e.g. Solution Architect"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Assigned Person
        </label>
        <input
          type="text"
          className="form-input"
          value={item.assignedPerson}
          onChange={(e) => onChange({ ...item, assignedPerson: e.target.value })}
          placeholder="e.g. Jane Smith"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Onshore (days)
          </label>
          <input
            type="number"
            className="form-input"
            value={item.onshore}
            onChange={(e) => onChange({ ...item, onshore: e.target.value })}
            placeholder="0"
            min="0"
            step="0.5"
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
            Offshore (days)
          </label>
          <input
            type="number"
            className="form-input"
            value={item.offshore}
            onChange={(e) => onChange({ ...item, offshore: e.target.value })}
            placeholder="0"
            min="0"
            step="0.5"
            style={{ fontSize: 'var(--font-size-sm)' }}
          />
        </div>
      </div>
    </div>
  );
}

export default function TeamStructure({ data, onChange }) {
  const members = data?.members ?? [];
  const supportTransitionPlan = data?.supportTransitionPlan ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  const addMember = () => update({ members: [...members, emptyMember()] });
  const removeMember = (id) => update({ members: members.filter((m) => m.id !== id) });
  const changeMember = (updated) =>
    update({ members: members.map((m) => (m.id === updated.id ? updated : m)) });

  const totalOnshore = members.reduce((sum, m) => sum + (parseFloat(m.onshore) || 0), 0);
  const totalOffshore = members.reduce((sum, m) => sum + (parseFloat(m.offshore) || 0), 0);
  const totalDays = totalOnshore + totalOffshore;
  const offshorePercent = totalDays > 0 ? ((totalOffshore / totalDays) * 100).toFixed(1) : '0.0';

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Team Structure & Resources</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the project team, effort allocation, and support transition plan.
        </p>
      </div>

      {/* Team Members */}
      <h3 className="text-lg font-semibold mb-md">Team Members</h3>
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        {members.map((member) => (
          <MemberCard
            key={member.id}
            item={member}
            onChange={changeMember}
            onRemove={() => removeMember(member.id)}
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
          onClick={addMember}
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
            <div className="text-sm">Add Member</div>
          </div>
        </div>
      </div>

      {/* Totals */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--spacing-xl)',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 'var(--spacing-lg)',
        }}
      >
        {[
          {
            label: 'Total Onshore',
            value: `${totalOnshore.toFixed(1)} days`,
            color: 'var(--color-accent-blue)',
          },
          {
            label: 'Total Offshore',
            value: `${totalOffshore.toFixed(1)} days`,
            color: 'var(--color-accent-purple)',
          },
          { label: 'Offshore %', value: `${offshorePercent}%`, color: 'var(--color-success)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: 'center' }}>
            <p className="text-sm text-secondary mb-xs">{label}</p>
            <p className="text-2xl font-bold" style={{ color }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Support Transition Plan */}
      <div>
        <h3 className="text-lg font-semibold mb-xs">Support Transition Plan</h3>
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
          placeholder="Describe the handover process, training provided, documentation deliverables, and ongoing support model..."
          rows={6}
        />
      </div>
    </div>
  );
}
