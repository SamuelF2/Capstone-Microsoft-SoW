/**
 * sectionSchemas.js — Maps SoW section keys to JSON schemas, display
 * renderers, and ID-hydration functions for structured AI rewrites.
 *
 * When the AI "Improve" flow targets a section listed here, the ML layer
 * receives the schema so it returns structured JSON instead of flat text.
 * The frontend then renders a readable preview in the modal and hydrates
 * IDs before writing back to sowData.
 */

import { genId } from './ids';

// ── JSON Schemas (sent to ML in the prompt) ──────────────────────────────────

const SCHEMAS = {
  executiveSummary: {
    description: 'Executive summary with a single content string.',
    schema: {
      content: 'string',
    },
  },
  projectScope: {
    description:
      'Project scope with in-scope and out-of-scope item lists. Each item has a "text" field.',
    schema: {
      inScope: [{ text: 'string' }],
      outOfScope: [{ text: 'string' }],
    },
  },
  deliverables: {
    description:
      'Array of deliverables. Each has name, description, acceptanceCriteria, milestonePhase, and dueDate (YYYY-MM-DD or empty string).',
    schema: [
      {
        name: 'string',
        description: 'string',
        acceptanceCriteria: 'string',
        milestonePhase: 'string',
        dueDate: 'string',
      },
    ],
  },
  teamStructure: {
    description:
      'Team structure with a members array and a supportTransitionPlan string. Each member has role, assignedPerson, onshore (number of days), offshore (number of days).',
    schema: {
      members: [
        {
          role: 'string',
          assignedPerson: 'string',
          onshore: 'number',
          offshore: 'number',
        },
      ],
      supportTransitionPlan: 'string',
    },
  },
  assumptionsRisks: {
    description:
      'Assumptions, customer responsibilities, and risks. Each assumption has text and label (one of: Assumption, Technical, Customer Responsibility, Other). Each responsibility has text. Each risk has description, severity (Low/Medium/High/Critical), owner, mitigation.',
    schema: {
      assumptions: [{ text: 'string', label: 'string' }],
      customerResponsibilities: [{ text: 'string' }],
      risks: [
        {
          description: 'string',
          severity: 'string',
          owner: 'string',
          mitigation: 'string',
        },
      ],
    },
  },
  agileApproach: {
    description:
      'Agile delivery approach with sprint planning. Each sprint has name, goal, duration (one of: "1 week", "2 weeks", "3 weeks", "4 weeks"), and stories (multi-line text of key user stories or features). Also includes deliveryApproach and supportTransitionPlan text fields.',
    schema: {
      deliveryApproach: 'string',
      supportTransitionPlan: 'string',
      sprints: [
        {
          name: 'string',
          goal: 'string',
          duration: 'string',
          stories: 'string',
        },
      ],
    },
  },
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the JSON schema definition for a section key, or null if the
 * section should use flat-text mode.
 */
export function getSchema(sectionKey) {
  return SCHEMAS[sectionKey] || null;
}

/**
 * Returns a JSON string representation of the schema for inclusion in LLM
 * prompts.
 */
export function getSchemaPrompt(sectionKey) {
  const entry = SCHEMAS[sectionKey];
  if (!entry) return null;
  return JSON.stringify(entry.schema, null, 2);
}

/**
 * Returns true if the section key has a structured schema.
 */
export function isStructuredSection(sectionKey) {
  return sectionKey in SCHEMAS && sectionKey !== 'executiveSummary';
}

// ── Hydrators (add client-side IDs) ─────────────────────────────────────────

const HYDRATORS = {
  executiveSummary: (data) => ({
    content: data?.content ?? '',
  }),

  projectScope: (data) => ({
    ...data,
    inScope: (data?.inScope ?? []).map((item) => ({
      ...item,
      id: genId('item'),
    })),
    outOfScope: (data?.outOfScope ?? []).map((item) => ({
      ...item,
      id: genId('item'),
    })),
  }),

  deliverables: (data) => {
    const items = Array.isArray(data) ? data : [];
    return items.map((item) => ({
      name: item.name ?? '',
      description: item.description ?? '',
      acceptanceCriteria: item.acceptanceCriteria ?? '',
      milestonePhase: item.milestonePhase ?? '',
      dueDate: item.dueDate ?? '',
      id: genId('del'),
    }));
  },

  teamStructure: (data) => ({
    ...data,
    members: (data?.members ?? []).map((m) => ({
      role: m.role ?? '',
      assignedPerson: m.assignedPerson ?? '',
      onshore: m.onshore ?? '',
      offshore: m.offshore ?? '',
      id: genId('mem'),
    })),
    supportTransitionPlan: data?.supportTransitionPlan ?? '',
  }),

  assumptionsRisks: (data) => ({
    ...data,
    assumptions: (data?.assumptions ?? []).map((a) => ({
      text: a.text ?? '',
      label: a.label ?? 'Assumption',
      id: genId('item'),
    })),
    customerResponsibilities: (data?.customerResponsibilities ?? []).map((r) => ({
      text: r.text ?? '',
      id: genId('item'),
    })),
    risks: (data?.risks ?? []).map((r) => ({
      description: r.description ?? '',
      severity: r.severity ?? 'Medium',
      owner: r.owner ?? '',
      mitigation: r.mitigation ?? '',
      id: genId('item'),
    })),
  }),

  agileApproach: (data) => ({
    ...data,
    deliveryApproach: data?.deliveryApproach ?? '',
    supportTransitionPlan: data?.supportTransitionPlan ?? '',
    sprints: (data?.sprints ?? []).map((s) => ({
      name: s.name ?? '',
      goal: s.goal ?? '',
      duration: s.duration ?? '2 weeks',
      stories: s.stories ?? '',
      id: genId('sprint'),
    })),
  }),
};

/**
 * Hydrate a structured AI response with client-side IDs and defaults.
 * Returns the hydrated value ready to write into sowData, or the raw value
 * if no hydrator is registered.
 */
export function hydrateIds(sectionKey, data) {
  const fn = HYDRATORS[sectionKey];
  return fn ? fn(data) : data;
}

// ── Display Renderers (JSX for the modal suggestion panel) ──────────────────

function renderBulletList(label, items) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      <strong>{label}</strong>
      <ul style={{ margin: 'var(--spacing-xs) 0 0 var(--spacing-lg)', padding: 0 }}>
        {items.map((item, i) => (
          <li key={i} style={{ marginBottom: 'var(--spacing-xs)' }}>
            {typeof item === 'string'
              ? item
              : item.text || item.description || JSON.stringify(item)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const RENDERERS = {
  executiveSummary: (data) => <div style={{ whiteSpace: 'pre-wrap' }}>{data?.content || ''}</div>,

  projectScope: (data) => (
    <div>
      {renderBulletList('In Scope', data?.inScope)}
      {renderBulletList('Out of Scope', data?.outOfScope)}
    </div>
  ),

  deliverables: (data) => {
    const items = Array.isArray(data) ? data : [];
    return (
      <div>
        {items.map((d, i) => (
          <div
            key={i}
            style={{
              marginBottom: 'var(--spacing-md)',
              padding: 'var(--spacing-sm)',
              borderLeft: '3px solid var(--color-accent-blue)',
              paddingLeft: 'var(--spacing-md)',
            }}
          >
            <strong>{d.name || `Deliverable ${i + 1}`}</strong>
            {d.description && (
              <p className="text-sm" style={{ margin: 'var(--spacing-xs) 0' }}>
                {d.description}
              </p>
            )}
            {d.acceptanceCriteria && (
              <p className="text-sm text-secondary" style={{ margin: 'var(--spacing-xs) 0' }}>
                <em>Acceptance:</em> {d.acceptanceCriteria}
              </p>
            )}
            {(d.milestonePhase || d.dueDate) && (
              <p className="text-sm text-secondary">
                {d.milestonePhase && <span>Phase: {d.milestonePhase}</span>}
                {d.milestonePhase && d.dueDate && ' | '}
                {d.dueDate && <span>Due: {d.dueDate}</span>}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  },

  teamStructure: (data) => (
    <div>
      {data?.members?.length > 0 && (
        <div style={{ marginBottom: 'var(--spacing-md)' }}>
          <strong>Team Members</strong>
          <table
            style={{
              width: '100%',
              marginTop: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              borderCollapse: 'collapse',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: 'var(--spacing-xs)' }}>Role</th>
                <th style={{ textAlign: 'left', padding: 'var(--spacing-xs)' }}>Person</th>
                <th style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>Onshore</th>
                <th style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>Offshore</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: 'var(--spacing-xs)' }}>{m.role}</td>
                  <td style={{ padding: 'var(--spacing-xs)' }}>{m.assignedPerson}</td>
                  <td style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>
                    {m.onshore ?? 0}
                  </td>
                  <td style={{ textAlign: 'right', padding: 'var(--spacing-xs)' }}>
                    {m.offshore ?? 0}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data?.supportTransitionPlan && (
        <div>
          <strong>Support Transition Plan</strong>
          <p className="text-sm" style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--spacing-xs)' }}>
            {data.supportTransitionPlan}
          </p>
        </div>
      )}
    </div>
  ),

  assumptionsRisks: (data) => (
    <div>
      {renderBulletList(
        'Assumptions',
        (data?.assumptions ?? []).map((a) => `[${a.label || 'Assumption'}] ${a.text}`)
      )}
      {renderBulletList('Customer Responsibilities', data?.customerResponsibilities)}
      {renderBulletList(
        'Risks',
        (data?.risks ?? []).map(
          (r) =>
            `[${r.severity}] ${r.description}${r.mitigation ? ` — Mitigation: ${r.mitigation}` : ''}`
        )
      )}
    </div>
  ),

  agileApproach: (data) => (
    <div>
      {(data?.sprints ?? []).length > 0 && (
        <div>
          <strong>Sprints</strong>
          {data.sprints.map((s, i) => (
            <div
              key={i}
              style={{
                marginBottom: 'var(--spacing-md)',
                padding: 'var(--spacing-sm)',
                borderLeft: '3px solid var(--color-accent-blue)',
                paddingLeft: 'var(--spacing-md)',
              }}
            >
              <strong>{s.name || `Sprint ${i + 1}`}</strong>
              {s.duration && (
                <span
                  className="text-sm text-secondary"
                  style={{ marginLeft: 'var(--spacing-xs)' }}
                >
                  ({s.duration})
                </span>
              )}
              {s.goal && (
                <p className="text-sm" style={{ margin: 'var(--spacing-xs) 0' }}>
                  {s.goal}
                </p>
              )}
              {s.stories && (
                <p
                  className="text-sm text-secondary"
                  style={{ margin: 'var(--spacing-xs) 0', whiteSpace: 'pre-wrap' }}
                >
                  <em>Stories:</em> {s.stories}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {data?.deliveryApproach && (
        <div style={{ marginTop: 'var(--spacing-md)' }}>
          <strong>Delivery Approach</strong>
          <p className="text-sm" style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--spacing-xs)' }}>
            {data.deliveryApproach}
          </p>
        </div>
      )}
      {data?.supportTransitionPlan && (
        <div style={{ marginTop: 'var(--spacing-md)' }}>
          <strong>Support Transition Plan</strong>
          <p className="text-sm" style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--spacing-xs)' }}>
            {data.supportTransitionPlan}
          </p>
        </div>
      )}
    </div>
  ),
};

/**
 * Render structured AI data as readable JSX for the suggestion panel.
 * Returns null if no renderer is registered (caller should fall back to
 * plain text display).
 */
export function renderStructured(sectionKey, data) {
  const fn = RENDERERS[sectionKey];
  return fn ? fn(data) : null;
}

// ── Sub-section definitions ────────────────────────────────────────────────

const SUB_SECTION_LABELS = {
  'executiveSummary:content': 'Executive Summary',
  'projectScope:inScope': 'In Scope',
  'projectScope:outOfScope': 'Out of Scope',
  'deliverables:items': 'Deliverables',
  'teamStructure:members': 'Team Members',
  'teamStructure:supportTransitionPlan': 'Support Transition Plan',
  'assumptionsRisks:assumptions': 'Assumptions',
  'assumptionsRisks:customerResponsibilities': 'Customer Responsibilities',
  'assumptionsRisks:risks': 'Risks',
  'agileApproach:deliveryApproach': 'Delivery Approach & Methodology',
  'agileApproach:supportTransitionPlan': 'Support Transition Plan',
  'agileApproach:sprints': 'Sprint Planning',
  'productBacklog:items': 'Product Backlog',
  'supportTransition:transitionPlan': 'Transition Plan',
  'supportTransition:supportModel': 'Ongoing Support Model',
};

/**
 * Get the human-readable label for a sub-section ID (e.g. "assumptionsRisks:risks" → "Risks").
 */
export function getSubSectionLabel(subSectionId) {
  return SUB_SECTION_LABELS[subSectionId] || null;
}

/**
 * Extract the sowData field key from a sub-section ID (e.g. "assumptionsRisks:risks" → "assumptionsRisks").
 */
export function getSubSectionFieldKey(subSectionId) {
  if (!subSectionId) return null;
  return subSectionId.split(':')[0];
}

/**
 * Extract human-readable text for a specific sub-section from sowData.
 * Used to send focused text to the AI improve flow.
 */
export function extractSubSectionText(subSectionId, sowData) {
  if (!subSectionId || !sowData) return '';
  const fieldKey = subSectionId.split(':')[0];
  const value = sowData[fieldKey];
  if (!value) return '';

  switch (subSectionId) {
    case 'executiveSummary:content':
      return typeof value === 'string' ? value : value.content || '';

    case 'projectScope:inScope':
      return (value.inScope || []).map((i) => `- ${i.text || ''}`).join('\n');
    case 'projectScope:outOfScope':
      return (value.outOfScope || []).map((i) => `- ${i.text || ''}`).join('\n');

    case 'deliverables:items': {
      const items = Array.isArray(value) ? value : [];
      return items
        .map((d) => {
          const parts = [];
          if (d.name) parts.push(d.name);
          if (d.description) parts.push(d.description);
          if (d.acceptanceCriteria) parts.push(`Acceptance: ${d.acceptanceCriteria}`);
          return parts.join('\n') || '';
        })
        .join('\n\n');
    }

    case 'teamStructure:members':
      return (value.members || [])
        .map(
          (m) =>
            `${m.role || 'Role'}: ${m.assignedPerson || 'TBD'} (${m.onshore || 0} onshore, ${m.offshore || 0} offshore)`
        )
        .join('\n');
    case 'teamStructure:supportTransitionPlan':
      return value.supportTransitionPlan || '';

    case 'assumptionsRisks:assumptions':
      return (value.assumptions || [])
        .map((a) => `[${a.label || 'Assumption'}] ${a.text || ''}`)
        .join('\n');
    case 'assumptionsRisks:customerResponsibilities':
      return (value.customerResponsibilities || []).map((r) => `- ${r.text || ''}`).join('\n');
    case 'assumptionsRisks:risks':
      return (value.risks || [])
        .map(
          (r) =>
            `[${r.severity || 'Medium'}] ${r.description || ''}${r.mitigation ? ` — Mitigation: ${r.mitigation}` : ''}`
        )
        .join('\n');

    case 'agileApproach:deliveryApproach':
      return value.deliveryApproach || '';
    case 'agileApproach:supportTransitionPlan':
      return value.supportTransitionPlan || '';
    case 'agileApproach:sprints':
      return (value.sprints || [])
        .map(
          (s) =>
            `${s.name || 'Sprint'}${s.duration ? ` (${s.duration})` : ''}: ${s.goal || '(no goal)'}${s.stories ? `\n  Stories: ${s.stories}` : ''}`
        )
        .join('\n\n');

    case 'productBacklog:items': {
      const backlogItems = Array.isArray(value) ? value : [];
      return backlogItems
        .map(
          (i) =>
            `[${i.priority || 'Medium'}] ${i.epic || 'Item'}${i.storyPoints ? ` (${i.storyPoints} pts)` : ''}${i.userStory ? `\n  ${i.userStory}` : ''}${i.sprint ? `\n  Sprint: ${i.sprint}` : ''}`
        )
        .join('\n\n');
    }

    case 'supportTransition:transitionPlan':
      return value.transitionPlan || '';
    case 'supportTransition:supportModel':
      return value.supportModel || '';

    default:
      return '';
  }
}
