import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const emptyMember = () => ({
  id: genId('mem'),
  role: '',
  onshore: '',
  offshore: '',
  assignedPerson: '',
});

function MemberCard({ item, onChange, onRemove }) {
  return (
    <ListCard width="280px" onRemove={onRemove}>
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
    </ListCard>
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
      <SectionHeader
        title="Team Structure & Resources"
        description="Define the project team, effort allocation, and support transition plan."
      />

      {/* Team Members */}
      <h3 className="text-lg font-semibold mb-md">Team Members</h3>
      <HorizontalCardList style={{ marginBottom: 'var(--spacing-lg)' }}>
        {members.map((member) => (
          <MemberCard
            key={member.id}
            item={member}
            onChange={changeMember}
            onRemove={() => removeMember(member.id)}
          />
        ))}
        <AddCardButton label="Add Member" onClick={addMember} />
      </HorizontalCardList>

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
