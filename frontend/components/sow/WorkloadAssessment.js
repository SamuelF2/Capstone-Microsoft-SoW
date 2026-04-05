import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';

const COMPLEXITY_LEVELS = ['Low', 'Medium', 'High'];
const COMPLEXITY_COLORS = {
  Low: 'var(--color-success)',
  Medium: 'var(--color-warning)',
  High: 'var(--color-error)',
};

const MIGRATION_PATTERNS = [
  'Rehost (Lift & Shift)',
  'Refactor',
  'Rearchitect',
  'Rebuild',
  'Replace (SaaS)',
  'Retire',
];

const emptyWorkload = () => ({
  id: genId('wl'),
  name: '',
  currentState: '',
  targetState: '',
  complexity: 'Medium',
  migrationPattern: 'Rehost (Lift & Shift)',
});

function WorkloadCard({ item, onChange, onRemove }) {
  return (
    <ListCard
      width="320px"
      onRemove={onRemove}
      headerExtras={
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: COMPLEXITY_COLORS[item.complexity],
            fontWeight: 'var(--font-weight-medium)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            border: `1px solid ${COMPLEXITY_COLORS[item.complexity]}`,
          }}
        >
          {item.complexity}
        </span>
      }
    >
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Workload Name
        </label>
        <input
          type="text"
          className="form-input"
          value={item.name}
          onChange={(e) => onChange({ ...item, name: e.target.value })}
          placeholder="e.g. Customer Portal (IIS)"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Current State
        </label>
        <textarea
          className="form-textarea"
          value={item.currentState}
          onChange={(e) => onChange({ ...item, currentState: e.target.value })}
          placeholder="Describe the current on-premises environment..."
          rows={2}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Target State
        </label>
        <textarea
          className="form-textarea"
          value={item.targetState}
          onChange={(e) => onChange({ ...item, targetState: e.target.value })}
          placeholder="Describe the target Azure architecture..."
          rows={2}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Migration Pattern
        </label>
        <select
          className="form-select"
          value={item.migrationPattern}
          onChange={(e) => onChange({ ...item, migrationPattern: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          {MIGRATION_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Complexity
        </label>
        <select
          className="form-select"
          value={item.complexity}
          onChange={(e) => onChange({ ...item, complexity: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)', color: COMPLEXITY_COLORS[item.complexity] }}
        >
          {COMPLEXITY_LEVELS.map((c) => (
            <option key={c} value={c} style={{ color: COMPLEXITY_COLORS[c] }}>
              {c}
            </option>
          ))}
        </select>
      </div>
    </ListCard>
  );
}

export default function WorkloadAssessment({ data, onChange }) {
  const workloads = data ?? [];

  const patternCounts = MIGRATION_PATTERNS.reduce((acc, p) => {
    acc[p] = workloads.filter((w) => w.migrationPattern === p).length;
    return acc;
  }, {});

  return (
    <div>
      <SectionHeader
        title="Workload Assessment"
        description="Assess each workload to be migrated, identifying the current state, target architecture, migration pattern, and complexity."
      />

      {/* Summary stats */}
      {workloads.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-lg)',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              backgroundColor: 'var(--color-bg-secondary)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <span className="text-sm text-secondary">Total Workloads: </span>
            <span className="font-semibold">{workloads.length}</span>
          </div>
          {Object.entries(patternCounts)
            .filter(([, count]) => count > 0)
            .map(([pattern, count]) => (
              <div
                key={pattern}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  backgroundColor: 'var(--color-bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-default)',
                }}
              >
                <span className="text-sm text-secondary">{pattern.split(' ')[0]}: </span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
        </div>
      )}

      <HorizontalCardList>
        {workloads.map((wl) => (
          <WorkloadCard
            key={wl.id}
            item={wl}
            onChange={(updated) =>
              onChange(workloads.map((w) => (w.id === updated.id ? updated : w)))
            }
            onRemove={() => onChange(workloads.filter((w) => w.id !== wl.id))}
          />
        ))}
        <AddCardButton
          label="Add Workload"
          onClick={() => onChange([...workloads, emptyWorkload()])}
        />
      </HorizontalCardList>
    </div>
  );
}
