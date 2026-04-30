import { useState } from 'react';
import SectionHeader from './ui/SectionHeader';
import FormCard from './ui/FormCard';
import { SHARED_SERVICES_GROUPS, OTHER_PREFIX } from '../../lib/microsoftWorkflowGroups';

/**
 * MicrosoftWorkflowFlags — author-input section that drives which conditional
 * branches activate in the Microsoft Default Workflow.
 *
 * Reads/writes `metadata.microsoft_workflow`:
 *   has_sensitive_ai           bool
 *   has_global_dev_staffing    bool
 *   shared_services_groups     string[]   (named groups + free-text "Other:" entries)
 *
 * Renders nothing useful when readOnly is true beyond a static summary, since
 * once the SoW has fanned out past the gateway, flag changes have no effect.
 */
export default function MicrosoftWorkflowFlags({ data, onChange, readOnly = false }) {
  const flags = data || {};
  const groups = Array.isArray(flags.shared_services_groups) ? flags.shared_services_groups : [];
  const [otherDraft, setOtherDraft] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

  const update = (patch) => {
    if (readOnly) return;
    onChange({ ...flags, ...patch });
  };

  const toggleGroup = (group) => {
    if (readOnly) return;
    const next = groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group];
    update({ shared_services_groups: next });
  };

  const removeGroup = (group) => {
    if (readOnly) return;
    update({ shared_services_groups: groups.filter((g) => g !== group) });
  };

  const addOther = () => {
    if (readOnly) return;
    const trimmed = otherDraft.trim();
    if (!trimmed) return;
    const entry = `${OTHER_PREFIX}${trimmed}`;
    if (groups.includes(entry)) {
      setOtherDraft('');
      setShowOtherInput(false);
      return;
    }
    update({ shared_services_groups: [...groups, entry] });
    setOtherDraft('');
    setShowOtherInput(false);
  };

  const isOtherEntry = (g) => g.startsWith(OTHER_PREFIX);
  const namedSelected = groups.filter((g) => SHARED_SERVICES_GROUPS.includes(g));
  const otherEntries = groups.filter(isOtherEntry);

  return (
    <div data-section="microsoftWorkflow">
      <SectionHeader
        title="Microsoft Workflow Routing"
        description="Author selections that control which review branches run when this SoW enters the parallel gateway. Branches whose condition is not met are recorded as Skipped in the workflow timeline."
      />

      <FormCard
        title="Conditional review triggers"
        description="Each option below routes to a parallel review branch. Leaving them all unchecked sends the SoW straight from Solution Review to Deal Review."
      >
        <div className="form-group" style={{ marginBottom: 'var(--spacing-md)' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-sm)',
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!!flags.has_sensitive_ai}
              onChange={(e) => update({ has_sensitive_ai: e.target.checked })}
              disabled={readOnly}
              style={{ marginTop: '4px' }}
            />
            <span>
              <span className="font-semibold">Contains sensitive or generative AI capability</span>
              <span className="block text-sm text-secondary">
                Routes to Responsible AI Lead review.
              </span>
            </span>
          </label>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-sm)',
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={!!flags.has_global_dev_staffing}
              onChange={(e) => update({ has_global_dev_staffing: e.target.checked })}
              disabled={readOnly}
              style={{ marginTop: '4px' }}
            />
            <span>
              <span className="font-semibold">
                Includes global development center / offshore staffing
              </span>
              <span className="block text-sm text-secondary">
                Routes to Global Dev Lead review.
              </span>
            </span>
          </label>
        </div>
      </FormCard>

      <FormCard
        title="Shared services groups involved"
        description="Select every shared consulting service group staffed on this engagement. Each named group adds a required sub-reviewer to the Shared Services Review branch. Free-text 'Other' entries keep the branch active but only require the Shared Services Lead."
        style={{ marginTop: 'var(--spacing-lg)' }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-md)',
          }}
        >
          {SHARED_SERVICES_GROUPS.map((group) => {
            const selected = groups.includes(group);
            return (
              <button
                key={group}
                type="button"
                onClick={() => toggleGroup(group)}
                disabled={readOnly}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: '999px',
                  border: `1px solid ${selected ? 'var(--color-accent-blue, #1967d2)' : 'var(--color-border-default)'}`,
                  background: selected ? 'var(--color-accent-blue, #1967d2)' : 'transparent',
                  color: selected ? 'white' : 'var(--color-text-primary)',
                  cursor: readOnly ? 'default' : 'pointer',
                  fontSize: '14px',
                }}
              >
                {selected ? '✓ ' : '+ '}
                {group}
              </button>
            );
          })}
        </div>

        {otherEntries.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-md)',
            }}
          >
            {otherEntries.map((entry) => (
              <span
                key={entry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: '999px',
                  border: '1px solid var(--color-border-default)',
                  background: 'var(--color-surface-subtle, #f1f3f4)',
                  fontSize: '14px',
                }}
              >
                {entry}
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => removeGroup(entry)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-text-tertiary)',
                      cursor: 'pointer',
                      fontSize: '16px',
                      lineHeight: 1,
                      padding: 0,
                    }}
                    title={`Remove ${entry}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>
        )}

        {!readOnly && !showOtherInput && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowOtherInput(true)}
            style={{ fontSize: '14px' }}
          >
            + Add Other...
          </button>
        )}

        {!readOnly && showOtherInput && (
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. SecureScore Analytics"
              value={otherDraft}
              onChange={(e) => setOtherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOther();
                }
              }}
              style={{ flex: 1 }}
              autoFocus
            />
            <button type="button" className="btn btn-primary" onClick={addOther}>
              Add
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setOtherDraft('');
                setShowOtherInput(false);
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {namedSelected.length === 0 && otherEntries.length === 0 && (
          <p
            className="text-sm text-secondary"
            style={{ marginTop: 'var(--spacing-sm)', marginBottom: 0 }}
          >
            No groups selected — Shared Services Review will be skipped.
          </p>
        )}
      </FormCard>
    </div>
  );
}
