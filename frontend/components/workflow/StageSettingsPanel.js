/**
 * StageSettingsPanel — side panel that edits the currently-selected node.
 *
 * When no node is selected the panel shows workflow-level settings (name,
 * description) plus any graph validation warnings. When a middle stage node
 * is selected it shows the stage's display name, stage_key, stage_type, and
 * per-role assignment table. Anchors are read-only — they have fixed keys
 * and no editable settings.
 *
 * Props
 * ─────
 * workflow            { name, description }
 * onWorkflowChange    (patch) => void   — merge into workflow
 * selectedNode        Node | null       — currently selected React Flow node
 * onStageChange       (stage) => void   — replace selected node's data.stage
 * onDeleteStage       () => void
 * warnings            string[]           — from validateGraph
 */

import { useEffect, useState } from 'react';
import { ANCHOR_STAGES, isAnchorStage } from '../../lib/workflowStages';

const MIDDLE_STAGE_TYPES = [
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'ai_analysis', label: 'AI Analysis' },
];

const KNOWN_ROLES = ['solution-architect', 'sqa-reviewer', 'cpl', 'cdp', 'delivery-manager'];

const ESAP_LEVELS = [
  { key: 'type-1', color: '#ef4444' },
  { key: 'type-2', color: '#fbbf24' },
  { key: 'type-3', color: '#4ade80' },
];

export default function StageSettingsPanel({
  workflow,
  onWorkflowChange,
  selectedNode,
  onStageChange,
  onDeleteStage,
  warnings,
}) {
  return (
    <aside
      style={{
        width: '340px',
        flexShrink: 0,
        backgroundColor: 'var(--color-bg-secondary)',
        borderLeft: '1px solid var(--color-border-default)',
        overflowY: 'auto',
        padding: 'var(--spacing-lg)',
      }}
    >
      {selectedNode ? (
        <StageForm node={selectedNode} onChange={onStageChange} onDelete={onDeleteStage} />
      ) : (
        <WorkflowForm workflow={workflow} onChange={onWorkflowChange} warnings={warnings} />
      )}
    </aside>
  );
}

// ── Workflow-level form (shown when nothing is selected) ────────────────────

function WorkflowForm({ workflow, onChange, warnings }) {
  return (
    <div>
      <SectionTitle>Workflow</SectionTitle>
      <Field label="Name">
        <input
          type="text"
          className="form-input"
          value={workflow.name || ''}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="e.g. Fast-Track Review"
        />
      </Field>
      <Field label="Description">
        <textarea
          className="form-input"
          rows={3}
          value={workflow.description || ''}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Optional — describe when to use this workflow"
        />
      </Field>

      {warnings && warnings.length > 0 && (
        <>
          <SectionTitle style={{ marginTop: 'var(--spacing-xl)' }}>Validation</SectionTitle>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-xs)',
            }}
          >
            {warnings.map((w, i) => (
              <div
                key={i}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-sm)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(251,191,36,0.08)',
                  border: '1px solid rgba(251,191,36,0.25)',
                  color: 'var(--color-warning)',
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 1.4,
                }}
              >
                {w}
              </div>
            ))}
          </div>
        </>
      )}

      <p
        className="text-xs text-tertiary"
        style={{ marginTop: 'var(--spacing-xl)', lineHeight: 1.5 }}
      >
        Select a stage on the canvas to edit its details. Drag from a stage's right edge to another
        stage's left edge to create a transition.
      </p>
    </div>
  );
}

// ── Stage form (shown when a node is selected) ──────────────────────────────

function StageForm({ node, onChange, onDelete }) {
  const stage = node.data.stage || {};
  const locked = isAnchorStage(node.id);

  // Local draft state for the stage_key so the user can type freely without
  // triggering a re-slug on every keystroke. We commit on blur.
  const [draftKey, setDraftKey] = useState(stage.stage_key || '');
  useEffect(() => {
    setDraftKey(stage.stage_key || '');
  }, [node.id, stage.stage_key]);

  if (locked) {
    return (
      <div>
        <SectionTitle>Anchor Stage 🔒</SectionTitle>
        <Field label="Display name">
          <input type="text" className="form-input" value={stage.display_name || ''} disabled />
        </Field>
        <Field label="Stage key">
          <input type="text" className="form-input" value={stage.stage_key || ''} disabled />
        </Field>
        <p
          className="text-xs text-tertiary"
          style={{ marginTop: 'var(--spacing-md)', lineHeight: 1.5 }}
        >
          {ANCHOR_STAGES[node.id]?.description || 'Locked anchor stage.'}
        </p>
      </div>
    );
  }

  const patch = (p) => onChange({ ...stage, ...p });

  // ── Role list mutators ────────────────────────────────────────────────────

  const addRole = () =>
    patch({
      roles: [...(stage.roles || []), { role_key: '', is_required: true, esap_levels: null }],
    });

  const updateRole = (idx, p) =>
    patch({
      roles: (stage.roles || []).map((r, i) => (i === idx ? { ...r, ...p } : r)),
    });

  const removeRole = (idx) => patch({ roles: (stage.roles || []).filter((_, i) => i !== idx) });

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <SectionTitle style={{ margin: 0 }}>Stage</SectionTitle>
        <button
          type="button"
          onClick={onDelete}
          title="Delete this stage"
          style={{
            background: 'none',
            border: '1px solid rgba(220,38,38,0.3)',
            color: 'var(--color-error)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 'var(--font-size-xs)',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>

      <Field label="Display name">
        <input
          type="text"
          className="form-input"
          value={stage.display_name || ''}
          onChange={(e) => patch({ display_name: e.target.value })}
        />
      </Field>
      <Field label="Stage key" hint="Lowercase, underscores. Must be unique.">
        <input
          type="text"
          className="form-input"
          value={draftKey}
          onChange={(e) => setDraftKey(e.target.value)}
          onBlur={() => patch({ stage_key: draftKey })}
          style={{ fontFamily: 'monospace' }}
        />
      </Field>
      <Field label="Stage type">
        <select
          className="form-select"
          value={stage.stage_type || 'review'}
          onChange={(e) => patch({ stage_type: e.target.value })}
        >
          {MIDDLE_STAGE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      {/* Roles — only meaningful for review / approval stages, but we always
          show the editor so authors can configure ai_analysis stages too (e.g.
          attaching a notification role). */}
      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          <SectionTitle style={{ margin: 0 }}>Reviewer Roles</SectionTitle>
          <button
            type="button"
            onClick={addRole}
            style={{
              fontSize: 'var(--font-size-xs)',
              padding: '2px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px dashed var(--color-border-default)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
            }}
          >
            + Add
          </button>
        </div>
        {(stage.roles || []).length === 0 ? (
          <p className="text-xs text-tertiary" style={{ margin: 0, fontStyle: 'italic' }}>
            No roles assigned.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
            {(stage.roles || []).map((role, idx) => (
              <RoleRow
                key={idx}
                role={role}
                onUpdate={(p) => updateRole(idx, p)}
                onRemove={() => removeRole(idx)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── RoleRow — compact editor for a single role on a stage ───────────────────

function RoleRow({ role, onUpdate, onRemove }) {
  const [custom, setCustom] = useState(!!role.role_key && !KNOWN_ROLES.includes(role.role_key));

  return (
    <div
      style={{
        padding: 'var(--spacing-xs) var(--spacing-sm)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        {!custom ? (
          <select
            className="form-select"
            value={role.role_key || ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setCustom(true);
                onUpdate({ role_key: '' });
              } else {
                onUpdate({ role_key: e.target.value });
              }
            }}
            style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
          >
            <option value="">Select role…</option>
            {KNOWN_ROLES.map((k) => (
              <option key={k} value={k}>
                {k.replace(/-/g, ' ')}
              </option>
            ))}
            <option value="__custom__">Custom role…</option>
          </select>
        ) : (
          <>
            <input
              type="text"
              className="form-input"
              value={role.role_key || ''}
              placeholder="role-key"
              onChange={(e) =>
                onUpdate({ role_key: e.target.value.toLowerCase().replace(/\s+/g, '-') })
              }
              style={{ flex: 1, fontSize: 'var(--font-size-xs)' }}
            />
            <button
              type="button"
              onClick={() => {
                setCustom(false);
                onUpdate({ role_key: '' });
              }}
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                border: '1px solid var(--color-border-subtle)',
                background: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: 'var(--color-text-tertiary)',
              }}
            >
              ↩
            </button>
          </>
        )}
        <button
          type="button"
          onClick={onRemove}
          title="Remove role"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-tertiary)',
            cursor: 'pointer',
            fontSize: 'var(--font-size-sm)',
            padding: '0 4px',
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '6px',
        }}
      >
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={role.is_required !== false}
            onChange={(e) => onUpdate({ is_required: e.target.checked })}
          />
          Required
        </label>
        <div style={{ display: 'flex', gap: '3px' }}>
          {ESAP_LEVELS.map(({ key, color }) => {
            const active = Array.isArray(role.esap_levels) && role.esap_levels.includes(key);
            return (
              <button
                key={key}
                type="button"
                title={active ? `Remove ${key}` : `Restrict to ${key}`}
                onClick={() => {
                  const cur = Array.isArray(role.esap_levels) ? role.esap_levels : [];
                  const next = active ? cur.filter((l) => l !== key) : [...cur, key];
                  onUpdate({ esap_levels: next.length > 0 ? next : null });
                }}
                style={{
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  border: `1px solid ${active ? color : 'var(--color-border-subtle)'}`,
                  backgroundColor: active ? `${color}22` : 'transparent',
                  color: active ? color : 'var(--color-text-tertiary)',
                  fontSize: '9px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {key.replace('type-', 'T')}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Small presentational helpers ────────────────────────────────────────────

function SectionTitle({ children, style }) {
  return (
    <h4
      style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        color: 'var(--color-text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        margin: '0 0 var(--spacing-sm)',
        ...style,
      }}
    >
      {children}
    </h4>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 'var(--spacing-md)' }}>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
          marginBottom: '4px',
        }}
      >
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs text-tertiary" style={{ margin: '3px 0 0', fontSize: '10px' }}>
          {hint}
        </p>
      )}
    </div>
  );
}
