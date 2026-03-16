function genId() {
  return `item-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const ASSUMPTION_LABELS = ['Assumption', 'Technical', 'Customer Responsibility', 'Other'];
const SEVERITY_LEVELS = ['Low', 'Medium', 'High', 'Critical'];

const SEVERITY_COLORS = {
  Low: 'var(--color-success)',
  Medium: 'var(--color-warning)',
  High: 'var(--color-error)',
  Critical: '#9b1c1c',
};

function AssumptionCard({ item, onChange, onRemove }) {
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
          Label
        </label>
        <select
          className="form-select"
          value={item.label}
          onChange={(e) => onChange({ ...item, label: e.target.value })}
          style={{ fontSize: 'var(--font-size-sm)' }}
        >
          {ASSUMPTION_LABELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Description
        </label>
        <textarea
          className="form-textarea"
          value={item.text}
          onChange={(e) => onChange({ ...item, text: e.target.value })}
          placeholder="Describe this assumption..."
          rows={4}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </div>
  );
}

function ResponsibilityCard({ item, onChange, onRemove }) {
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
          Responsibility
        </label>
        <textarea
          className="form-textarea"
          value={item.text}
          onChange={(e) => onChange({ ...item, text: e.target.value })}
          placeholder="Describe the customer's responsibility..."
          rows={4}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </div>
  );
}

function RiskCard({ item, onChange, onRemove }) {
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
      >
        ×
      </button>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Risk Description <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <textarea
          className="form-textarea"
          value={item.description}
          onChange={(e) => onChange({ ...item, description: e.target.value })}
          placeholder="Describe the risk..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Severity
        </label>
        <select
          className="form-select"
          value={item.severity}
          onChange={(e) => onChange({ ...item, severity: e.target.value })}
          style={{
            fontSize: 'var(--font-size-sm)',
            color: SEVERITY_COLORS[item.severity],
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {SEVERITY_LEVELS.map((s) => (
            <option key={s} value={s} style={{ color: SEVERITY_COLORS[s] }}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Risk Owner (Role)
        </label>
        <input
          type="text"
          className="form-input"
          value={item.owner}
          onChange={(e) => onChange({ ...item, owner: e.target.value })}
          placeholder="e.g. Project Manager"
          style={{ fontSize: 'var(--font-size-sm)' }}
        />
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Mitigation Strategy
        </label>
        <textarea
          className="form-textarea"
          value={item.mitigation}
          onChange={(e) => onChange({ ...item, mitigation: e.target.value })}
          placeholder="Describe how this risk will be mitigated..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </div>
  );
}

function AddCard({ label, onClick }) {
  return (
    <div
      style={{
        minWidth: '200px',
        maxWidth: '200px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: '2px dashed var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        cursor: 'pointer',
        color: 'var(--color-text-tertiary)',
        transition: 'border-color var(--transition-base), color var(--transition-base)',
        minHeight: '160px',
      }}
      onClick={onClick}
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
        <div className="text-sm">{label}</div>
      </div>
    </div>
  );
}

function SectionDivider({ title, description }) {
  return (
    <div style={{ marginBottom: 'var(--spacing-lg)', marginTop: 'var(--spacing-2xl)' }}>
      <h3 className="text-xl font-semibold mb-xs">{title}</h3>
      {description && (
        <p className="text-sm text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          {description}
        </p>
      )}
    </div>
  );
}

export default function AssumptionsRisks({ data, onChange }) {
  const assumptions = data?.assumptions ?? [];
  const customerResponsibilities = data?.customerResponsibilities ?? [];
  const risks = data?.risks ?? [];

  const update = (patch) => onChange({ ...data, ...patch });

  // Assumptions
  const addAssumption = () =>
    update({ assumptions: [...assumptions, { id: genId(), text: '', label: 'Assumption' }] });
  const removeAssumption = (id) => update({ assumptions: assumptions.filter((i) => i.id !== id) });
  const changeAssumption = (item) =>
    update({ assumptions: assumptions.map((i) => (i.id === item.id ? item : i)) });

  // Customer responsibilities
  const addResponsibility = () =>
    update({ customerResponsibilities: [...customerResponsibilities, { id: genId(), text: '' }] });
  const removeResponsibility = (id) =>
    update({ customerResponsibilities: customerResponsibilities.filter((i) => i.id !== id) });
  const changeResponsibility = (item) =>
    update({
      customerResponsibilities: customerResponsibilities.map((i) => (i.id === item.id ? item : i)),
    });

  // Risks
  const addRisk = () =>
    update({
      risks: [
        ...risks,
        { id: genId(), description: '', severity: 'Medium', owner: '', mitigation: '' },
      ],
    });
  const removeRisk = (id) => update({ risks: risks.filter((i) => i.id !== id) });
  const changeRisk = (item) => update({ risks: risks.map((i) => (i.id === item.id ? item : i)) });

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Assumptions, Responsibilities & Risks</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Document project assumptions, define customer responsibilities, and identify risks with
          mitigation strategies.
        </p>
      </div>

      {/* Assumptions */}
      <SectionDivider
        title="Assumptions"
        description="List all assumptions underpinning the scope, timeline, and cost of this engagement."
      />
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        {assumptions.map((item) => (
          <AssumptionCard
            key={item.id}
            item={item}
            onChange={changeAssumption}
            onRemove={() => removeAssumption(item.id)}
          />
        ))}
        <AddCard label="Add Assumption" onClick={addAssumption} />
      </div>

      {/* Customer Responsibilities */}
      <SectionDivider
        title="Customer Responsibilities"
        description="Define the actions and obligations the customer must fulfil for the project to succeed."
      />
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        {customerResponsibilities.map((item) => (
          <ResponsibilityCard
            key={item.id}
            item={item}
            onChange={changeResponsibility}
            onRemove={() => removeResponsibility(item.id)}
          />
        ))}
        <AddCard label="Add Responsibility" onClick={addResponsibility} />
      </div>

      {/* Risks */}
      <SectionDivider
        title="Risks"
        description="Identify potential risks to project delivery along with their severity and mitigation plans."
      />
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-lg)',
          overflowX: 'auto',
          paddingBottom: 'var(--spacing-md)',
        }}
      >
        {risks.map((item) => (
          <RiskCard
            key={item.id}
            item={item}
            onChange={changeRisk}
            onRemove={() => removeRisk(item.id)}
          />
        ))}
        <AddCard label="Add Risk" onClick={addRisk} />
      </div>
    </div>
  );
}
