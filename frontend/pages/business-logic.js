import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';

// ── Workflow Templates Tab ───────────────────────────────────────────────────
// ── Helpers ──────────────────────────────────────────────────────────────────

function _wfId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

function toStageKey(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function emptyStage() {
  return { id: _wfId(), displayName: '', stageType: 'review', roles: [] };
}

function emptyRole() {
  return { id: _wfId(), roleKey: '', isRequired: true, esapLevels: [] };
}

const NON_TERMINAL_TYPE_OPTIONS = [
  { value: 'review', label: 'Review' },
  { value: 'approval', label: 'Approval' },
  { value: 'ai_analysis', label: 'AI Analysis' },
];

const KNOWN_ROLES = ['solution-architect', 'cpl', 'cdp', 'delivery-manager', 'sqa-reviewer'];

const ESAP_LEVEL_KEYS = ['type-1', 'type-2', 'type-3'];
const ESAP_LEVEL_COLORS = { 'type-1': '#ef4444', 'type-2': '#fbbf24', 'type-3': '#4ade80' };
const RESERVED_STAGE_KEYS = new Set(['draft', 'approved', 'finalized', 'rejected']);

const STAGE_TYPE_ACCENT = {
  review: 'var(--color-accent-blue)',
  approval: 'var(--color-accent-purple, #7c3aed)',
  ai_analysis: '#4ade80',
};

// ── RoleRow ───────────────────────────────────────────────────────────────────

function RoleRow({ role, onUpdate, onRemove }) {
  const [showCustom, setShowCustom] = useState(
    !KNOWN_ROLES.includes(role.roleKey) && role.roleKey !== ''
  );

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(160px,1fr) auto auto auto',
        gap: 'var(--spacing-xs)',
        alignItems: 'center',
        padding: 'var(--spacing-xs) var(--spacing-sm)',
        borderRadius: 'var(--radius-sm)',
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Role selector */}
      <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center' }}>
        {!showCustom ? (
          <select
            value={role.roleKey || ''}
            onChange={(e) => {
              if (e.target.value === '__custom__') {
                setShowCustom(true);
                onUpdate('roleKey', '');
              } else {
                onUpdate('roleKey', e.target.value);
              }
            }}
            style={{
              flex: 1,
              fontSize: 'var(--font-size-xs)',
              padding: '3px 6px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-primary)',
            }}
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
          <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
            <input
              type="text"
              placeholder="role-key (e.g. dba)"
              value={role.roleKey}
              onChange={(e) =>
                onUpdate('roleKey', e.target.value.toLowerCase().replace(/\s+/g, '-'))
              }
              style={{
                flex: 1,
                fontSize: 'var(--font-size-xs)',
                padding: '3px 6px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border-default)',
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-primary)',
              }}
            />
            <button
              onClick={() => {
                setShowCustom(false);
                onUpdate('roleKey', '');
              }}
              title="Back to presets"
              style={{
                fontSize: '10px',
                padding: '2px 6px',
                background: 'none',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--color-text-tertiary)',
                cursor: 'pointer',
              }}
            >
              ↩
            </button>
          </div>
        )}
      </div>

      {/* Required toggle */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          cursor: 'pointer',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          checked={role.isRequired}
          onChange={(e) => onUpdate('isRequired', e.target.checked)}
        />
        Required
      </label>

      {/* ESAP level pills */}
      <div
        style={{ display: 'flex', gap: '3px', alignItems: 'center' }}
        title={role.esapLevels.length === 0 ? 'Applies to all ESAP levels' : undefined}
      >
        {ESAP_LEVEL_KEYS.map((lvl) => {
          const active = role.esapLevels.includes(lvl);
          const c = ESAP_LEVEL_COLORS[lvl];
          return (
            <button
              key={lvl}
              title={active ? `Remove ${lvl}` : `Restrict to ${lvl}`}
              onClick={() =>
                onUpdate(
                  'esapLevels',
                  active ? role.esapLevels.filter((l) => l !== lvl) : [...role.esapLevels, lvl]
                )
              }
              style={{
                padding: '1px 6px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${active ? c : 'var(--color-border-subtle)'}`,
                backgroundColor: active ? `${c}22` : 'transparent',
                color: active ? c : 'var(--color-text-tertiary)',
                fontSize: '9px',
                fontWeight: 600,
                cursor: 'pointer',
                lineHeight: '1.4',
              }}
            >
              {lvl.replace('type-', 'T')}
            </button>
          );
        })}
        {role.esapLevels.length === 0 && (
          <span style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', marginLeft: 2 }}>
            all
          </span>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        title="Remove role"
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          fontSize: 'var(--font-size-sm)',
          padding: '2px 6px',
          borderRadius: 'var(--radius-sm)',
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── StageCard (editable) ──────────────────────────────────────────────────────

function StageCard({
  stage,
  index,
  total,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  onAddRole,
  onUpdateRole,
  onRemoveRole,
}) {
  const accent = STAGE_TYPE_ACCENT[stage.stageType] || 'var(--color-accent-blue)';

  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-default)',
        backgroundColor: 'var(--color-bg-secondary)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          backgroundColor: `${accent}0f`,
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        {/* Order badge */}
        <span
          style={{
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
            fontWeight: 600,
            minWidth: 20,
            textAlign: 'center',
          }}
        >
          {index + 2}
        </span>

        {/* Display name */}
        <input
          type="text"
          placeholder="Stage display name (e.g. Technical Review)"
          value={stage.displayName}
          onChange={(e) => onUpdate('displayName', e.target.value)}
          style={{
            flex: 1,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 500,
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
          }}
        />

        {/* Stage type */}
        <select
          value={stage.stageType}
          onChange={(e) => onUpdate('stageType', e.target.value)}
          style={{
            fontSize: 'var(--font-size-xs)',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-primary)',
            color: accent,
            fontWeight: 500,
          }}
        >
          {NON_TERMINAL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Up / Down */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Move up"
            style={{
              background: 'none',
              border: 'none',
              cursor: index === 0 ? 'default' : 'pointer',
              color: index === 0 ? 'var(--color-border-default)' : 'var(--color-text-secondary)',
              fontSize: '10px',
              padding: '0 4px',
              lineHeight: 1.2,
            }}
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Move down"
            style={{
              background: 'none',
              border: 'none',
              cursor: index === total - 1 ? 'default' : 'pointer',
              color:
                index === total - 1 ? 'var(--color-border-default)' : 'var(--color-text-secondary)',
              fontSize: '10px',
              padding: '0 4px',
              lineHeight: 1.2,
            }}
          >
            ▼
          </button>
        </div>

        {/* Remove stage */}
        <button
          onClick={onRemove}
          title="Remove stage"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--font-size-base)',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Stage key preview */}
      {stage.displayName && (
        <div
          style={{
            padding: '2px var(--spacing-md)',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            fontFamily: 'monospace',
          }}
        >
          key:{' '}
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {toStageKey(stage.displayName) || '…'}
          </span>
        </div>
      )}

      {/* Roles */}
      <div style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          <span
            style={{
              fontSize: '10px',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontWeight: 600,
            }}
          >
            Reviewer Roles
          </span>
          <button
            onClick={onAddRole}
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
            + Add Role
          </button>
        </div>

        {stage.roles.length === 0 ? (
          <p
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
              margin: 0,
            }}
          >
            No roles required — any user can progress this stage.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
            {stage.roles.map((role) => (
              <RoleRow
                key={role.id}
                role={role}
                onUpdate={(field, value) => onUpdateRole(role.id, field, value)}
                onRemove={() => onRemoveRole(role.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FlowPreview ───────────────────────────────────────────────────────────────

function FlowPreview({ stages }) {
  const pills = [
    { label: 'Draft', isSystem: true },
    ...stages.map((s) => ({
      label: s.displayName || '…',
      isSystem: false,
      accent: STAGE_TYPE_ACCENT[s.stageType] || 'var(--color-accent-blue)',
    })),
    { label: 'Approved', isSystem: true },
    { label: 'Finalized', isSystem: true },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--spacing-xs)',
        alignItems: 'center',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      {pills.map((p, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 500,
              color: p.isSystem ? 'var(--color-text-tertiary)' : p.accent,
              backgroundColor: p.isSystem ? 'var(--color-bg-secondary)' : `${p.accent}18`,
              border: `1px solid ${p.isSystem ? 'var(--color-border-subtle)' : `${p.accent}44`}`,
              fontStyle: p.isSystem ? 'italic' : 'normal',
            }}
          >
            {p.label}
          </span>
          {i < pills.length - 1 && (
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}>
              →
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

// ── WorkflowTab ───────────────────────────────────────────────────────────────

function WorkflowTab({ authFetch }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', stages: [emptyStage()] });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Load template list on mount
  useEffect(() => {
    authFetch('/api/workflow/templates')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load templates (${r.status})`);
        return r.json();
      })
      .then(setTemplates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authFetch]);

  // ── Table selection ─────────────────────────────────────────────────────────

  const handleSelect = async (tmpl) => {
    if (selectedTemplate?.id === tmpl.id) {
      setSelectedTemplate(null);
      setTemplateDetail(null);
      return;
    }
    setSelectedTemplate(tmpl);
    setTemplateDetail(null);
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/workflow/templates/${tmpl.id}`);
      if (res.ok) setTemplateDetail(await res.json());
    } catch {
      /* detail is optional — fail silently */
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Create form helpers ─────────────────────────────────────────────────────

  const openCreateForm = () => {
    setShowCreateForm(true);
    setSelectedTemplate(null);
    setTemplateDetail(null);
    setCreateError(null);
    setForm({ name: '', description: '', stages: [emptyStage()] });
  };

  const updateStage = (stageId, field, value) =>
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s) => (s.id === stageId ? { ...s, [field]: value } : s)),
    }));

  const removeStage = (stageId) =>
    setForm((f) => ({ ...f, stages: f.stages.filter((s) => s.id !== stageId) }));

  const moveStage = (index, dir) =>
    setForm((f) => {
      const arr = [...f.stages];
      const target = index + dir;
      if (target < 0 || target >= arr.length) return f;
      [arr[index], arr[target]] = [arr[target], arr[index]];
      return { ...f, stages: arr };
    });

  const addRole = (stageId) =>
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s) =>
        s.id === stageId ? { ...s, roles: [...s.roles, emptyRole()] } : s
      ),
    }));

  const updateRole = (stageId, roleId, field, value) =>
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s) =>
        s.id === stageId
          ? { ...s, roles: s.roles.map((r) => (r.id === roleId ? { ...r, [field]: value } : r)) }
          : s
      ),
    }));

  const removeRole = (stageId, roleId) =>
    setForm((f) => ({
      ...f,
      stages: f.stages.map((s) =>
        s.id === stageId ? { ...s, roles: s.roles.filter((r) => r.id !== roleId) } : s
      ),
    }));

  // ── Validate + submit ───────────────────────────────────────────────────────

  const handleCreate = async () => {
    setCreateError(null);

    if (!form.name.trim()) {
      setCreateError('Template name is required.');
      return;
    }
    if (form.stages.length === 0) {
      setCreateError('Add at least one stage.');
      return;
    }
    if (form.stages.some((s) => !s.displayName.trim())) {
      setCreateError('All stages must have a display name.');
      return;
    }

    const stageKeys = form.stages.map((s) => toStageKey(s.displayName));
    if (new Set(stageKeys).size !== stageKeys.length) {
      setCreateError('Stage names must produce unique keys — rename duplicates.');
      return;
    }
    for (const k of stageKeys) {
      if (RESERVED_STAGE_KEYS.has(k)) {
        setCreateError(`"${k}" is a reserved stage key. Please rename that stage.`);
        return;
      }
    }
    for (const stage of form.stages) {
      for (const role of stage.roles) {
        if (!role.roleKey.trim()) {
          setCreateError(
            `Stage "${stage.displayName}" has a role with no key. Select a role or remove it.`
          );
          return;
        }
      }
    }

    // Build user stages with auto-assigned order (1 = Draft, so user stages start at 2)
    const userStages = form.stages.map((s, i) => ({
      stage_key: toStageKey(s.displayName),
      display_name: s.displayName.trim(),
      stage_order: i + 2,
      stage_type: s.stageType,
      roles: s.roles.map((r) => ({
        role_key: r.roleKey.trim(),
        is_required: r.isRequired,
        esap_levels: r.esapLevels.length > 0 ? r.esapLevels : null,
      })),
      config: {},
    }));

    const terminalBase = userStages.length + 2;
    const allStages = [
      {
        stage_key: 'draft',
        display_name: 'Draft',
        stage_order: 1,
        stage_type: 'draft',
        roles: [],
        config: {},
      },
      ...userStages,
      {
        stage_key: 'approved',
        display_name: 'Approved',
        stage_order: terminalBase,
        stage_type: 'terminal',
        roles: [],
        config: {},
      },
      {
        stage_key: 'finalized',
        display_name: 'Finalized',
        stage_order: terminalBase + 1,
        stage_type: 'terminal',
        roles: [],
        config: {},
      },
      {
        stage_key: 'rejected',
        display_name: 'Rejected',
        stage_order: 0,
        stage_type: 'terminal',
        roles: [],
        config: {},
      },
    ];

    // Linear forward chain: draft → s1 → … → approved → finalized
    const chain = ['draft', ...userStages.map((s) => s.stage_key), 'approved'];
    const transitions = chain
      .slice(0, -1)
      .map((from, i) => ({ from_stage: from, to_stage: chain[i + 1] }));
    transitions.push({ from_stage: 'approved', to_stage: 'finalized' });

    // Review / approval stages can reject
    userStages
      .filter((s) => ['review', 'approval'].includes(s.stage_type))
      .forEach((s) => transitions.push({ from_stage: s.stage_key, to_stage: 'rejected' }));

    // Rejection sends back to draft for rework
    transitions.push({ from_stage: 'rejected', to_stage: 'draft' });

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      workflow_data: { stages: allStages, transitions },
    };

    setCreating(true);
    try {
      const res = await authFetch('/api/workflow/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }
      const created = await res.json();
      setTemplates((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          description: created.description,
          is_system: false,
          stage_count: created.workflow_data.stages.length,
          created_at: created.created_at,
        },
      ]);
      setShowCreateForm(false);
      setForm({ name: '', description: '', stages: [emptyStage()] });
    } catch (e) {
      setCreateError(e.message);
    } finally {
      setCreating(false);
    }
  };

  // ── Delete ──────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!selectedTemplate || selectedTemplate.is_system) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${selectedTemplate.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/workflow/templates/${selectedTemplate.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }
      setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id));
      setSelectedTemplate(null);
      setTemplateDetail(null);
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return <Spinner />;
  if (error)
    return (
      <p className="text-sm" style={{ color: 'var(--color-error)' }}>
        {error}
      </p>
    );

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-lg)',
          gap: 'var(--spacing-md)',
        }}
      >
        <div>
          <h3 className="text-lg font-semibold mb-xs">Workflow Templates</h3>
          <p className="text-sm text-secondary">
            All available review workflow templates. Click a row to inspect stages and transitions.
          </p>
        </div>
        {!showCreateForm && (
          <button
            onClick={openCreateForm}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              backgroundColor: 'var(--color-accent-purple, #7c3aed)',
              color: '#fff',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            + New Template
          </button>
        )}
      </div>

      {/* Template table */}
      <div style={{ overflowX: 'auto', marginBottom: 'var(--spacing-xl)' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
        >
          <thead>
            <tr
              style={{ borderBottom: '1px solid var(--color-border-default)', textAlign: 'left' }}
            >
              {['Name', 'Description', 'Stages', 'Type'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {templates.map((tmpl, i) => {
              const isActive = selectedTemplate?.id === tmpl.id;
              return (
                <tr
                  key={tmpl.id}
                  onClick={() => {
                    setShowCreateForm(false);
                    handleSelect(tmpl);
                  }}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    backgroundColor: isActive
                      ? 'rgba(124,58,237,0.05)'
                      : i % 2 === 0
                        ? 'transparent'
                        : 'var(--color-bg-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                    {tmpl.name}
                    {isActive && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-accent-purple, #7c3aed)',
                        }}
                      >
                        ▾
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '320px',
                    }}
                  >
                    {tmpl.description || '—'}
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    {tmpl.stage_count ?? '—'}
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    {tmpl.is_system ? (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--font-size-xs)',
                          backgroundColor: 'rgba(0,120,212,0.1)',
                          color: 'var(--color-accent-blue)',
                          border: '1px solid rgba(0,120,212,0.2)',
                          fontWeight: 500,
                        }}
                      >
                        System
                      </span>
                    ) : (
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--font-size-xs)',
                          backgroundColor: 'rgba(124,58,237,0.1)',
                          color: 'var(--color-accent-purple, #7c3aed)',
                          border: '1px solid rgba(124,58,237,0.2)',
                          fontWeight: 500,
                        }}
                      >
                        Custom
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {templates.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 'var(--spacing-xl)',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  No templates found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Create Form ──────────────────────────────────────────────────────── */}
      {showCreateForm && (
        <div
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-tertiary)',
            marginBottom: 'var(--spacing-xl)',
          }}
        >
          <h4 className="font-semibold mb-lg" style={{ fontSize: 'var(--font-size-base)' }}>
            New Workflow Template
          </h4>

          {/* Name + description */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 2fr',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-lg)',
            }}
          >
            {[
              {
                label: 'Template Name *',
                key: 'name',
                placeholder: 'e.g. Fast-Track Review',
              },
              {
                label: 'Description',
                key: 'description',
                placeholder: 'Optional — describe when to use this template',
              },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                    marginBottom: 'var(--spacing-xs)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {label}
                </label>
                <input
                  type="text"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  style={{
                    width: '100%',
                    fontSize: 'var(--font-size-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Stage builder */}
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <div style={{ marginBottom: 'var(--spacing-sm)' }}>
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                Custom Stages
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                  marginLeft: 'var(--spacing-sm)',
                }}
              >
                These sit between the auto-added <em>Draft</em> (start) and{' '}
                <em>Approved → Finalized</em> (end) stages.
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
              {form.stages.map((stage, idx) => (
                <StageCard
                  key={stage.id}
                  stage={stage}
                  index={idx}
                  total={form.stages.length}
                  onUpdate={(field, value) => updateStage(stage.id, field, value)}
                  onRemove={() => removeStage(stage.id)}
                  onMoveUp={() => moveStage(idx, -1)}
                  onMoveDown={() => moveStage(idx, 1)}
                  onAddRole={() => addRole(stage.id)}
                  onUpdateRole={(roleId, field, value) =>
                    updateRole(stage.id, roleId, field, value)
                  }
                  onRemoveRole={(roleId) => removeRole(stage.id, roleId)}
                />
              ))}

              <button
                onClick={() => setForm((f) => ({ ...f, stages: [...f.stages, emptyStage()] }))}
                style={{
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px dashed var(--color-border-default)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                  textAlign: 'center',
                }}
              >
                + Add Stage
              </button>
            </div>
          </div>

          {/* Flow preview */}
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <p
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 600,
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              Workflow Preview
            </p>
            <FlowPreview stages={form.stages} />
          </div>

          {/* Error */}
          {createError && (
            <div
              style={{
                padding: 'var(--spacing-sm) var(--spacing-md)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
                marginBottom: 'var(--spacing-md)',
              }}
            >
              {createError}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
            <button
              onClick={() => {
                setShowCreateForm(false);
                setCreateError(null);
              }}
              disabled={creating}
              style={{
                padding: 'var(--spacing-sm) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                backgroundColor: 'var(--color-bg-secondary)',
                color: 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-sm)',
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating}
              style={{
                padding: 'var(--spacing-sm) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                backgroundColor: creating
                  ? 'var(--color-border-default)'
                  : 'var(--color-accent-purple, #7c3aed)',
                color: '#fff',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
                cursor: creating ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creating…' : 'Create Template'}
            </button>
          </div>
        </div>
      )}

      {/* ── Detail View ──────────────────────────────────────────────────────── */}
      {selectedTemplate && (
        <div
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-tertiary)',
          }}
        >
          {/* Detail header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--spacing-md)',
              gap: 'var(--spacing-md)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <h4 className="font-semibold" style={{ fontSize: 'var(--font-size-base)' }}>
                {selectedTemplate.name}
              </h4>
              {selectedTemplate.is_system && (
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'rgba(0,120,212,0.1)',
                    color: 'var(--color-accent-blue)',
                    border: '1px solid rgba(0,120,212,0.2)',
                    fontWeight: 500,
                  }}
                >
                  System
                </span>
              )}
            </div>
            {!selectedTemplate.is_system && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(220,38,38,0.4)',
                  backgroundColor: 'rgba(220,38,38,0.06)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete Template'}
              </button>
            )}
          </div>

          {detailLoading && <p className="text-sm text-secondary">Loading…</p>}

          {templateDetail && (
            <>
              {/* Stage flow pills */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-sm)',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                {(templateDetail.workflow_data?.stages || [])
                  .filter((s) => s.stage_key !== 'rejected')
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .map((s, idx, arr) => (
                    <span
                      key={s.stage_key}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
                    >
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 500,
                          backgroundColor: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border-default)',
                        }}
                      >
                        {s.display_name}
                      </span>
                      {idx < arr.length - 1 && (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>→</span>
                      )}
                    </span>
                  ))}
              </div>

              {/* Stage cards (read-only) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {(templateDetail.workflow_data?.stages || [])
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .map((s) => (
                    <div
                      key={s.stage_key}
                      style={{
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className="font-semibold"
                        style={{ fontSize: 'var(--font-size-sm)', minWidth: '140px' }}
                      >
                        {s.display_name}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-tertiary)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s.stage_type.replace(/_/g, ' ')}
                      </span>
                      {s.roles && s.roles.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {s.roles
                            .filter((r) => r.is_required)
                            .map((r, k) => (
                              <span
                                key={k}
                                style={{
                                  padding: '1px 7px',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '10px',
                                  backgroundColor: 'rgba(0,120,212,0.08)',
                                  color: 'var(--color-accent-blue)',
                                  border: '1px solid rgba(0,120,212,0.15)',
                                }}
                              >
                                {r.role_key.replace(/-/g, ' ')}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'quality', label: 'Quality Rules' },
  { key: 'esap', label: 'ESAP Workflow' },
  { key: 'risk', label: 'Risk Classification' },
  { key: 'workflow', label: 'Workflow Templates' },
];

const SEVERITY_STYLES = {
  error: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  warning: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
};

const TIER_COLORS = {
  'type-1': { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)' },
  'type-2': { accent: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)' },
  'type-3': { accent: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.3)' },
};

// ── Quality Rules Tab ───────────────────────────────────────────────────────

function BannedPhrasesTable({ phrases }) {
  if (!phrases || phrases.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
      <h3 className="text-lg font-semibold mb-md">Banned Phrases</h3>
      <p className="text-sm text-secondary mb-lg">
        These phrases must not appear in any SoW document as they create inappropriate commitments
        or ambiguity.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--color-border-default)',
                textAlign: 'left',
              }}
            >
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Phrase
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Severity
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Category
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Suggested Fix
              </th>
            </tr>
          </thead>
          <tbody>
            {phrases.map((p, i) => {
              const s = SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.warning;
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)',
                  }}
                >
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                    &ldquo;{p.phrase}&rdquo;
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        backgroundColor: s.bg,
                        color: s.color,
                        border: `1px solid ${s.border}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {p.severity}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {(p.category || '').replace(/-/g, ' ')}
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '300px',
                    }}
                  >
                    {p.suggestion}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequiredElementsList({ elements }) {
  if (!elements || elements.length === 0) return null;
  return (
    <div>
      <h3 className="text-lg font-semibold mb-md">Required SoW Sections</h3>
      <p className="text-sm text-secondary mb-lg">
        Every SoW document must include these sections with the specified minimum content.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {elements.map((el, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: '3px solid var(--color-accent-blue)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {el.displayName}
              </span>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                {el.minLength && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(0,120,212,0.12)',
                      color: 'var(--color-accent-blue)',
                    }}
                  >
                    Min {el.minLength} chars
                  </span>
                )}
                {el.minItems && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(0,120,212,0.12)',
                      color: 'var(--color-accent-blue)',
                    }}
                  >
                    Min {el.minItems} items
                  </span>
                )}
                {el.allowNA && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(74,222,128,0.12)',
                      color: '#4ade80',
                    }}
                  >
                    N/A allowed
                  </span>
                )}
              </div>
            </div>
            <p
              className="text-secondary"
              style={{
                fontSize: 'var(--font-size-xs)',
                lineHeight: 'var(--line-height-relaxed)',
                marginTop: 'var(--spacing-xs)',
              }}
            >
              {el.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityTab({ rules }) {
  const banned = rules?.bannedPhrases?.bannedPhrases || [];
  const required = rules?.requiredElements?.requiredSections || [];
  return (
    <div>
      <BannedPhrasesTable phrases={banned} />
      <RequiredElementsList elements={required} />
    </div>
  );
}

// ── ESAP Workflow Tab ────────────────────────────────────────────────────────

function EsapTab({ rules }) {
  const esap = rules?.esapWorkflow || {};
  const levels = esap.esapLevels || {};
  const stages = esap.workflowStages || {};
  const stageOrder = ['draft', 'internal-review', 'drm-approval', 'approved', 'finalized'];

  return (
    <div>
      {/* Deal Tiers */}
      <h3 className="text-lg font-semibold mb-md">Deal Tiers</h3>
      <p className="text-sm text-secondary mb-lg">
        ESAP level is determined by deal value and estimated margin. Each tier requires different
        approvers and checks.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
        }}
      >
        {Object.entries(levels).map(([key, level]) => {
          const tc = TIER_COLORS[key] || TIER_COLORS['type-3'];
          return (
            <div
              key={key}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: tc.bg,
                border: `1px solid ${tc.border}`,
              }}
            >
              <h4
                className="font-semibold mb-md"
                style={{ color: tc.accent, fontSize: 'var(--font-size-base)' }}
              >
                {level.name}
              </h4>

              {/* Triggers */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p
                  className="text-xs font-semibold mb-xs"
                  style={{
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Triggers
                </p>
                {(level.triggers || []).map((t, i) => (
                  <p
                    key={i}
                    className="text-sm"
                    style={{ color: 'var(--color-text-primary)', marginBottom: 2 }}
                  >
                    {t.description}
                  </p>
                ))}
              </div>

              {/* Approvers */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p
                  className="text-xs font-semibold mb-xs"
                  style={{
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Required Approvers
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                  {(level.requiredApprovers || []).map((a, i) => (
                    <span
                      key={i}
                      title={a.reason}
                      style={{
                        padding: '2px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border-default)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {a.role.replace(/-/g, ' ').toUpperCase()} ({a.stage.replace(/-/g, ' ')})
                    </span>
                  ))}
                </div>
              </div>

              {/* Additional Checks */}
              {level.additionalChecks && level.additionalChecks.length > 0 && (
                <div>
                  <p
                    className="text-xs font-semibold mb-xs"
                    style={{
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Additional Checks
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
                    {level.additionalChecks.map((c, i) => (
                      <li
                        key={i}
                        className="text-sm text-secondary"
                        style={{ lineHeight: 'var(--line-height-relaxed)' }}
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Workflow Stages */}
      <h3 className="text-lg font-semibold mb-md">Approval Workflow Stages</h3>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-sm)',
          alignItems: 'center',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        {stageOrder
          .filter((k) => stages[k])
          .map((key, i) => {
            const stage = stages[key];
            return (
              <span
                key={key}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
              >
                <span
                  style={{
                    padding: '6px 16px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {stage.name}
                </span>
                {i < stageOrder.filter((k) => stages[k]).length - 1 && (
                  <span
                    style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-lg)' }}
                  >
                    &#8594;
                  </span>
                )}
              </span>
            );
          })}
      </div>

      {/* Stage Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {stageOrder
          .filter((k) => stages[k])
          .map((key) => {
            const stage = stages[key];
            return (
              <div
                key={key}
                style={{
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderLeft: '3px solid var(--color-accent-blue)',
                }}
              >
                <p className="font-semibold text-sm">{stage.name}</p>
                <p
                  className="text-secondary text-xs"
                  style={{
                    lineHeight: 'var(--line-height-relaxed)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  {stage.description}
                </p>
                {stage.exitCriteria && stage.exitCriteria.length > 0 && (
                  <div>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}
                    >
                      Exit criteria: {stage.exitCriteria.join(' | ')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Risk Classification Tab (Stubbed) ───────────────────────────────────────

const RISK_LEVELS = [
  {
    level: 'Green',
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.3)',
    criteria: [
      'All 8 required sections present and meet minimum length/item requirements',
      'No banned phrases detected in document text',
      'All methodology-specific keywords present',
      'Estimated margin >= 15%',
      'Deal value <= $1M (Type 3 ESAP)',
      'All deliverables have measurable acceptance criteria',
      'Risk register complete with mitigation plans for every risk',
    ],
  },
  {
    level: 'Yellow',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.3)',
    criteria: [
      'One or two required sections missing or below minimum thresholds',
      'Warning-level banned phrases detected (e.g., "will ensure")',
      'Some methodology keywords missing from approach section',
      'Estimated margin between 10% and 15%',
      'Deal value between $1M and $5M (Type 2 ESAP)',
      'Some deliverables lack specific acceptance criteria',
      'One or more risks missing mitigation plans',
    ],
  },
  {
    level: 'Red',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
    criteria: [
      'Three or more required sections missing',
      'Error-level banned phrases detected (e.g., "best effort", "guarantee", "unlimited")',
      'Methodology approach section fundamentally misaligned',
      'Estimated margin below 10%',
      'Deal value exceeds $5M (Type 1 ESAP)',
      'Customer responsibilities not documented',
      'No support transition plan defined',
    ],
  },
];

function RiskTab() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-md">Risk Classification Criteria (G / Y / R)</h3>
      <p className="text-sm text-secondary mb-lg">
        Each SoW is classified into Green, Yellow, or Red based on the following criteria. The Risk
        Engine evaluates these factors automatically during AI Review.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
        }}
      >
        {RISK_LEVELS.map((r) => (
          <div
            key={r.level}
            style={{
              padding: 'var(--spacing-lg)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: r.bg,
              border: `1px solid ${r.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: r.color,
                  boxShadow: `0 0 8px ${r.color}`,
                }}
              />
              <span
                className="font-semibold"
                style={{ color: r.color, fontSize: 'var(--font-size-lg)' }}
              >
                {r.level}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
              {r.criteria.map((c, i) => (
                <li
                  key={i}
                  className="text-sm"
                  style={{
                    color: 'var(--color-text-secondary)',
                    lineHeight: 'var(--line-height-relaxed)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          padding: 'var(--spacing-lg)',
          backgroundColor: 'rgba(0,120,212,0.06)',
          border: '1px solid rgba(0,120,212,0.2)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--color-accent-blue)', fontWeight: 500 }}>
          Note: The Risk Engine classifier is under active development. These criteria represent the
          target classification logic. Full automated classification will integrate with Azure AI
          Foundry for LLM-based evaluation and Azure ML Workspace for model training.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BusinessLogic() {
  const { user, authFetch } = useAuth();
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('quality');

  useEffect(() => {
    if (!user) return;
    authFetch('/api/rules')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load rules (${res.status})`);
        return res.json();
      })
      .then(setRules)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, authFetch]);

  return (
    <>
      <Head>
        <title>Business Logic - Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">Business Logic</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Quality rules, ESAP approval workflow, and risk classification criteria that drive SoW
              validation and review.
            </p>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-xs)',
              marginBottom: 'var(--spacing-xl)',
              borderBottom: '1px solid var(--color-border-default)',
              paddingBottom: 'var(--spacing-xs)',
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  border: 'none',
                  borderBottom:
                    activeTab === tab.key
                      ? '2px solid var(--color-accent-blue)'
                      : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color:
                    activeTab === tab.key
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-base)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl) 0' }}>
              <Spinner />
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && rules && activeTab !== 'workflow' && (
            <div className="card">
              {activeTab === 'quality' && <QualityTab rules={rules} />}
              {activeTab === 'esap' && <EsapTab rules={rules} />}
              {activeTab === 'risk' && <RiskTab />}
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="card">
              <WorkflowTab authFetch={authFetch} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
