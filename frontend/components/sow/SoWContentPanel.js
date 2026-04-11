/**
 * SoWContentPanel — read-only, tabbed renderer for ``sow.content``.
 *
 * Used by every reviewer surface (internal review, DRM review, assignment
 * review) to display the same SoW sections in the same order with the same
 * formatting.  Tabs are derived from the SoW's content keys, so empty
 * sections are hidden and the panel only shows tabs that have data.
 *
 * Props
 * -----
 *   sow         object   The SoW record (only ``content`` is read).
 *   activeTab   string   Currently selected tab label.
 *   onTabChange fn       Called with the new tab label when the user clicks.
 *
 * The tab state is owned by the parent so reviewer pages can deep-link to
 * a specific tab or restore it from session storage.
 */

const CONTENT_LABELS = {
  executiveSummary: 'Executive Summary',
  projectScope: 'Project Scope',
  scope: 'Project Scope',
  deliverables: 'Deliverables',
  assumptions: 'Assumptions',
  risks: 'Risks',
  pricing: 'Pricing',
  teamStructure: 'Team Structure',
  supportTransition: 'Support & Transition',
  agileApproach: 'Agile Approach',
  productBacklog: 'Product Backlog',
  sureStepMethodology: 'Sure Step Methodology',
  phasesDeliverables: 'Phases & Deliverables',
  dataMigration: 'Data Migration',
  testingStrategy: 'Testing Strategy',
  supportHypercare: 'Support & Hypercare',
  waterfallApproach: 'Waterfall Approach',
  phasesMilestones: 'Phases & Milestones',
  cloudAdoptionScope: 'Cloud Adoption Scope',
  migrationStrategy: 'Migration Strategy',
  workloadAssessment: 'Workload Assessment',
  securityCompliance: 'Security & Compliance',
  supportOperations: 'Support & Operations',
};

const CONTENT_TAB_GROUPS = [
  { label: 'Overview', keys: ['executiveSummary'] },
  { label: 'Scope', keys: ['projectScope', 'scope', 'cloudAdoptionScope'] },
  {
    label: 'Approach',
    keys: [
      'agileApproach',
      'productBacklog',
      'sureStepMethodology',
      'waterfallApproach',
      'migrationStrategy',
      'workloadAssessment',
    ],
  },
  {
    label: 'Deliverables',
    keys: [
      'deliverables',
      'phasesDeliverables',
      'phasesMilestones',
      'dataMigration',
      'testingStrategy',
    ],
  },
  {
    label: 'Team & Support',
    keys: [
      'teamStructure',
      'supportTransition',
      'supportHypercare',
      'supportOperations',
      'securityCompliance',
    ],
  },
  { label: 'Pricing', keys: ['pricing', 'assumptions', 'risks'] },
];

/**
 * Recursively render a content value (string, array, or object).  Strings
 * preserve newlines, arrays become bullet lists, and objects render as
 * key→value rows with indentation per nesting level.
 */
function renderValue(val, depth = 0) {
  if (val == null) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  if (typeof val === 'string') {
    return (
      <p
        style={{
          margin: '0 0 8px',
          lineHeight: 'var(--line-height-relaxed)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {val}
      </p>
    );
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
    return (
      <ul style={{ margin: '0 0 8px', paddingLeft: '20px' }}>
        {val.map((item, i) => (
          <li key={i} style={{ marginBottom: '4px' }}>
            {typeof item === 'object' ? renderValue(item, depth + 1) : String(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof val === 'object') {
    return (
      <div style={{ paddingLeft: depth > 0 ? '12px' : '0' }}>
        {Object.entries(val).map(([k, v]) => (
          <div key={k} style={{ marginBottom: '8px' }}>
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'capitalize',
                display: 'block',
                marginBottom: '2px',
              }}
            >
              {k.replace(/([A-Z])/g, ' $1').trim()}
            </span>
            {renderValue(v, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(val)}</span>;
}

export default function SoWContentPanel({ sow, activeTab, onTabChange }) {
  const content = sow?.content || {};
  const tabs = CONTENT_TAB_GROUPS.filter((g) => g.keys.some((k) => content[k] != null));

  if (tabs.length === 0) {
    return (
      <div style={{ padding: 'var(--spacing-xl)', color: 'var(--color-text-tertiary)' }}>
        No structured content available for this SoW.
      </div>
    );
  }

  const currentTab = tabs.find((t) => t.label === activeTab) || tabs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          borderBottom: '1px solid var(--color-border-default)',
          overflowX: 'auto',
          flexShrink: 0,
        }}
      >
        {tabs.map((tab) => {
          const active = currentTab.label === tab.label;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => onTabChange(tab.label)}
              style={{
                background: 'none',
                border: 'none',
                padding: '8px 14px',
                fontSize: 'var(--font-size-sm)',
                fontWeight: active ? 'var(--font-weight-semibold)' : 'normal',
                color: active
                  ? 'var(--color-accent-purple, #7c3aed)'
                  : 'var(--color-text-secondary)',
                borderBottom: active
                  ? '2px solid var(--color-accent-purple, #7c3aed)'
                  : '2px solid transparent',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Section content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-xl)' }}>
        {currentTab.keys
          .filter((k) => content[k] != null)
          .map((k) => (
            <div key={k} style={{ marginBottom: 'var(--spacing-xl)' }}>
              <h4
                style={{
                  margin: '0 0 var(--spacing-sm)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 'var(--font-weight-semibold)',
                  color: 'var(--color-text-primary)',
                  borderBottom: '1px solid var(--color-border-default)',
                  paddingBottom: '6px',
                }}
              >
                {CONTENT_LABELS[k] || k}
              </h4>
              <div
                style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}
              >
                {renderValue(content[k])}
              </div>
            </div>
          ))}
        {currentTab.keys.filter((k) => content[k] != null).length === 0 && (
          <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
            No content for this section yet.
          </p>
        )}
      </div>
    </div>
  );
}

export { CONTENT_LABELS, CONTENT_TAB_GROUPS, renderValue };
