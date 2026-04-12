import { genId } from '../../lib/ids';
import SectionHeader from './ui/SectionHeader';
import { HorizontalCardList, ListCard, AddCardButton } from './ui/HorizontalCardList';
import HighlightedTextarea from './ui/HighlightedTextarea';

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
    <ListCard width="300px" onRemove={onRemove}>
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
        <HighlightedTextarea
          className="form-textarea"
          value={item.text}
          onChange={(e) => onChange({ ...item, text: e.target.value })}
          placeholder="Describe this assumption..."
          rows={4}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </ListCard>
  );
}

function ResponsibilityCard({ item, onChange, onRemove }) {
  return (
    <ListCard width="280px" onRemove={onRemove}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Responsibility
        </label>
        <HighlightedTextarea
          className="form-textarea"
          value={item.text}
          onChange={(e) => onChange({ ...item, text: e.target.value })}
          placeholder="Describe the customer's responsibility..."
          rows={4}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </ListCard>
  );
}

function RiskCard({ item, onChange, onRemove }) {
  return (
    <ListCard width="320px" onRemove={onRemove}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label" style={{ fontSize: 'var(--font-size-xs)' }}>
          Risk Description <span style={{ color: 'var(--color-error)' }}>*</span>
        </label>
        <HighlightedTextarea
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
        <HighlightedTextarea
          className="form-textarea"
          value={item.mitigation}
          onChange={(e) => onChange({ ...item, mitigation: e.target.value })}
          placeholder="Describe how this risk will be mitigated..."
          rows={3}
          style={{ fontSize: 'var(--font-size-sm)', resize: 'none' }}
        />
      </div>
    </ListCard>
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
    update({ assumptions: [...assumptions, { id: genId('item'), text: '', label: 'Assumption' }] });
  const removeAssumption = (id) => update({ assumptions: assumptions.filter((i) => i.id !== id) });
  const changeAssumption = (item) =>
    update({ assumptions: assumptions.map((i) => (i.id === item.id ? item : i)) });

  // Customer responsibilities
  const addResponsibility = () =>
    update({
      customerResponsibilities: [...customerResponsibilities, { id: genId('item'), text: '' }],
    });
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
        { id: genId('item'), description: '', severity: 'Medium', owner: '', mitigation: '' },
      ],
    });
  const removeRisk = (id) => update({ risks: risks.filter((i) => i.id !== id) });
  const changeRisk = (item) => update({ risks: risks.map((i) => (i.id === item.id ? item : i)) });

  return (
    <div>
      <SectionHeader
        title="Assumptions, Responsibilities & Risks"
        description="Document project assumptions, define customer responsibilities, and identify risks with mitigation strategies."
      />

      {/* Assumptions */}
      <SectionDivider
        title="Assumptions"
        description="List all assumptions underpinning the scope, timeline, and cost of this engagement."
      />
      <HorizontalCardList>
        {assumptions.map((item) => (
          <AssumptionCard
            key={item.id}
            item={item}
            onChange={changeAssumption}
            onRemove={() => removeAssumption(item.id)}
          />
        ))}
        <AddCardButton
          label="Add Assumption"
          onClick={addAssumption}
          width="200px"
          minHeight="160px"
        />
      </HorizontalCardList>

      {/* Customer Responsibilities */}
      <SectionDivider
        title="Customer Responsibilities"
        description="Define the actions and obligations the customer must fulfil for the project to succeed."
      />
      <HorizontalCardList>
        {customerResponsibilities.map((item) => (
          <ResponsibilityCard
            key={item.id}
            item={item}
            onChange={changeResponsibility}
            onRemove={() => removeResponsibility(item.id)}
          />
        ))}
        <AddCardButton
          label="Add Responsibility"
          onClick={addResponsibility}
          width="200px"
          minHeight="160px"
        />
      </HorizontalCardList>

      {/* Risks */}
      <SectionDivider
        title="Risks"
        description="Identify potential risks to project delivery along with their severity and mitigation plans."
      />
      <HorizontalCardList>
        {risks.map((item) => (
          <RiskCard
            key={item.id}
            item={item}
            onChange={changeRisk}
            onRemove={() => removeRisk(item.id)}
          />
        ))}
        <AddCardButton label="Add Risk" onClick={addRisk} width="200px" minHeight="160px" />
      </HorizontalCardList>
    </div>
  );
}
