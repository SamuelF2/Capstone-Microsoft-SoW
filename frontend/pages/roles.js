import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ── Available permissions ─────────────────────────────────────────────────────

const ALL_PERMISSIONS = [
  { key: 'sow.read',        label: 'SoW: Read',        group: 'SoW' },
  { key: 'sow.create',      label: 'SoW: Create',      group: 'SoW' },
  { key: 'sow.write',       label: 'SoW: Edit',        group: 'SoW' },
  { key: 'sow.delete',      label: 'SoW: Delete',      group: 'SoW' },
  { key: 'review.read',     label: 'Review: Read',     group: 'Review' },
  { key: 'review.submit',   label: 'Review: Submit',   group: 'Review' },
  { key: 'review.approve',  label: 'Review: Approve',  group: 'Review' },
  { key: 'workflow.read',   label: 'Workflow: Read',   group: 'Workflow' },
  { key: 'workflow.edit',   label: 'Workflow: Edit',   group: 'Workflow' },
  { key: 'users.read',      label: 'Users: Read',      group: 'Admin' },
  { key: 'roles.manage',    label: 'Roles: Manage',    group: 'Admin' },
  { key: '*',               label: 'Full Access (*)',   group: 'Admin' },
];

const PERMISSION_GROUPS = [...new Set(ALL_PERMISSIONS.map((p) => p.group))];

// ── Helpers ───────────────────────────────────────────────────────────────────

function PermissionBadge({ permission }) {
  const colors = {
    'SoW':      { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa',  border: 'rgba(59,130,246,0.3)'  },
    'Review':   { bg: 'rgba(139,92,246,0.12)', color: '#c084fc',  border: 'rgba(139,92,246,0.3)'  },
    'Workflow': { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24',  border: 'rgba(251,191,36,0.3)'  },
    'Admin':    { bg: 'rgba(239,68,68,0.12)',  color: '#f87171',  border: 'rgba(239,68,68,0.3)'   },
  };
  const perm = ALL_PERMISSIONS.find((p) => p.key === permission);
  const group = perm?.group || 'SoW';
  const style = colors[group] || colors['SoW'];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-medium)',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {perm?.label || permission}
    </span>
  );
}

function RoleCard({ role, isAdmin, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        border: role.is_system
          ? '1px solid var(--color-border-default)'
          : '1px solid rgba(139,92,246,0.3)',
        transition: 'border-color var(--transition-base), transform var(--transition-base)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
      onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <div
          style={{
            width: '4px',
            flexShrink: 0,
            backgroundColor: role.is_system
              ? 'var(--color-accent-blue)'
              : 'var(--color-accent-purple-light)',
          }}
        />

        <div style={{ flex: 1, padding: 'var(--spacing-lg) var(--spacing-xl)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)',
              marginBottom: 'var(--spacing-sm)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                <h3 className="text-lg font-semibold" style={{ margin: 0 }}>
                  {role.display_name}
                </h3>
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    fontFamily: 'monospace',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    padding: '1px 6px',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  {role.role_key}
                </span>
                {role.is_system && (
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-accent-blue)',
                      backgroundColor: 'rgba(59,130,246,0.1)',
                      border: '1px solid rgba(59,130,246,0.3)',
                      padding: '1px 8px',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    System
                  </span>
                )}
              </div>
              {role.description && (
                <p className="text-sm text-secondary" style={{ marginTop: 4, marginBottom: 0 }}>
                  {role.description}
                </p>
              )}
            </div>

            {isAdmin && (
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexShrink: 0 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onEdit(role)}>
                  Edit
                </button>
                {!role.is_system && (
                  <button
                    className="btn btn-sm"
                    style={{
                      backgroundColor: 'rgba(239,68,68,0.1)',
                      color: 'var(--color-error)',
                      border: '1px solid rgba(239,68,68,0.3)',
                    }}
                    onClick={() => onDelete(role)}
                  >
                    Delete
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            {(expanded ? role.permissions : role.permissions.slice(0, 4)).map((p) => (
              <PermissionBadge key={p} permission={p} />
            ))}
            {!expanded && role.permissions.length > 4 && (
              <button
                onClick={() => setExpanded(true)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--color-accent-blue)',
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer', padding: '2px 4px',
                }}
              >
                +{role.permissions.length - 4} more
              </button>
            )}
            {expanded && role.permissions.length > 4 && (
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--font-size-xs)',
                  cursor: 'pointer', padding: '2px 4px',
                }}
              >
                Show less
              </button>
            )}
            {role.permissions.length === 0 && (
              <span className="text-xs text-tertiary">No permissions assigned</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleModal({ role, onClose, onSave }) {
  const isEditing = Boolean(role);
  const [formData, setFormData] = useState({
    role_key: role?.role_key || '',
    display_name: role?.display_name || '',
    description: role?.description || '',
    permissions: role?.permissions || [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const togglePermission = (key) => {
    setFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((p) => p !== key)
        : [...prev.permissions, key],
    }));
  };

  const handleSave = async () => {
    if (!formData.display_name.trim()) { setError('Display name is required'); return; }
    if (!isEditing && !formData.role_key.trim()) { setError('Role key is required'); return; }
    if (!isEditing && !/^[a-z0-9-]+$/.test(formData.role_key)) {
      setError('Role key must be lowercase letters, numbers, and hyphens only');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(formData);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--spacing-xl)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="card"
        style={{
          width: '100%', maxWidth: '580px',
          maxHeight: '85vh', overflowY: 'auto',
          padding: 'var(--spacing-2xl)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--spacing-xl)' }}>
          <h2 className="text-2xl font-bold" style={{ margin: 0 }}>
            {isEditing ? `Edit: ${role.display_name}` : 'Create New Role'}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {error && (
          <div style={{
            marginBottom: 'var(--spacing-lg)',
            padding: 'var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: 'var(--color-error)',
            fontSize: 'var(--font-size-sm)',
          }}>
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Display Name *</label>
          <input
            type="text"
            className="form-input"
            value={formData.display_name}
            onChange={(e) => setFormData((p) => ({ ...p, display_name: e.target.value }))}
            placeholder="e.g. Senior Reviewer"
          />
        </div>

        {!isEditing && (
          <div className="form-group">
            <label className="form-label">Role Key *</label>
            <input
              type="text"
              className="form-input"
              value={formData.role_key}
              onChange={(e) =>
                setFormData((p) => ({
                  ...p,
                  role_key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                }))
              }
              placeholder="e.g. senior-reviewer"
            />
            <p className="text-xs text-tertiary" style={{ marginTop: 4 }}>
              Lowercase letters, numbers, and hyphens only. Cannot be changed after creation.
            </p>
          </div>
        )}

        {isEditing && role.is_system && (
          <div style={{
            marginBottom: 'var(--spacing-lg)',
            padding: 'var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(59,130,246,0.08)',
            border: '1px solid rgba(59,130,246,0.2)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
          }}>
            This is a system role. You can edit its display name, description, and permissions,
            but it cannot be deleted.
          </div>
        )}

        <div className="form-group">
          <label className="form-label">Description</label>
          <textarea
            className="form-input"
            value={formData.description}
            onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
            placeholder="Describe what this role can do…"
            rows={2}
            style={{ resize: 'vertical' }}
          />
        </div>

        <div className="form-group">
          <label className="form-label" style={{ marginBottom: 'var(--spacing-md)' }}>
            Permissions
          </label>
          {PERMISSION_GROUPS.map((group) => (
            <div key={group} style={{ marginBottom: 'var(--spacing-md)' }}>
              <p
                className="text-xs text-tertiary"
                style={{
                  marginBottom: 'var(--spacing-sm)',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {group}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
                {ALL_PERMISSIONS.filter((p) => p.group === group).map((perm) => {
                  const checked = formData.permissions.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        cursor: 'pointer',
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-medium)',
                        border: `1px solid ${checked ? 'var(--color-accent-blue)' : 'var(--color-border-default)'}`,
                        backgroundColor: checked ? 'rgba(59,130,246,0.12)' : 'transparent',
                        color: checked ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)',
                        transition: 'all var(--transition-base)',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePermission(perm.key)}
                        style={{ display: 'none' }}
                      />
                      {checked ? '✓ ' : ''}{perm.label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-xl)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ role, onClose, onConfirm }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 'var(--spacing-xl)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="card" style={{ width: '100%', maxWidth: '420px', padding: 'var(--spacing-2xl)' }}>
        <h2 className="text-xl font-bold mb-md">Delete Role</h2>
        <p className="text-secondary mb-xl">
          Are you sure you want to delete <strong>{role.display_name}</strong> ({role.role_key})?
          This cannot be undone.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={deleting}>
            Cancel
          </button>
          <button
            className="btn"
            style={{ backgroundColor: 'var(--color-error)', color: '#fff' }}
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await onConfirm(role);
              onClose();
            }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const isAdmin = (user?.role || '').toLowerCase() === 'system-admin';

  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [search, setSearch] = useState('');
  const [editingRole, setEditingRole] = useState(null);
  const [deletingRole, setDeletingRole] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadRoles = useCallback(() => {
    if (!user) return;
    setFetchError(null);
    authFetch(`${API}/api/roles`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load roles (${res.status})`);
        return res.json();
      })
      .then((data) => { setRoles(data); setLoading(false); })
      .catch((err) => { setFetchError(err.message); setLoading(false); });
  }, [user, authFetch]);

  useEffect(() => { loadRoles(); }, [loadRoles]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleSave = async (formData) => {
    const isEditing = Boolean(editingRole);
    const res = await authFetch(
      isEditing ? `${API}/api/roles/${editingRole.role_key}` : `${API}/api/roles`,
      {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || `Error ${res.status}`);
    }
    loadRoles();
    showSuccess(isEditing ? `"${formData.display_name}" updated` : `"${formData.display_name}" created`);
  };

  const handleDelete = async (role) => {
    const res = await authFetch(`${API}/api/roles/${role.role_key}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.detail || `Error ${res.status}`);
    }
    loadRoles();
    showSuccess(`"${role.display_name}" deleted`);
  };

  const filtered = roles.filter((r) => {
    const q = search.toLowerCase();
    return (
      r.display_name.toLowerCase().includes(q) ||
      r.role_key.toLowerCase().includes(q) ||
      (r.description || '').toLowerCase().includes(q)
    );
  });

  const systemRoles = filtered.filter((r) => r.is_system);
  const customRoles = filtered.filter((r) => !r.is_system);

  if (!isAdmin) {
    return (
      <div style={{
        minHeight: 'calc(100vh - 80px)',
        backgroundColor: 'var(--color-bg-primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="card text-center" style={{ padding: 'var(--spacing-3xl)', maxWidth: '400px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🔒</div>
          <h3 className="text-xl font-semibold mb-sm">Access Restricted</h3>
          <p className="text-secondary mb-xl">Only system admins can manage roles.</p>
          <button className="btn btn-primary" onClick={() => router.push('/all-sows')}>
            Back to SoWs
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head><title>Roles Management – Cocoon</title></Head>

      {editingRole !== null && (
        <RoleModal
          role={editingRole === false ? null : editingRole}
          onClose={() => setEditingRole(null)}
          onSave={handleSave}
        />
      )}
      {deletingRole && (
        <DeleteConfirmModal
          role={deletingRole}
          onClose={() => setDeletingRole(null)}
          onConfirm={handleDelete}
        />
      )}

      <div style={{
        minHeight: 'calc(100vh - 80px)',
        backgroundColor: 'var(--color-bg-primary)',
        padding: 'var(--spacing-2xl) var(--spacing-xl)',
      }}>
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>

          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'flex-start', marginBottom: 'var(--spacing-2xl)',
          }}>
            <div>
              <h1 className="text-4xl font-bold mb-sm">Roles Management</h1>
              <p className="text-secondary">
                Configure role definitions and permissions. System roles can be edited but not deleted.
              </p>
            </div>
            <button className="btn btn-primary" onClick={() => setEditingRole(false)}>
              + Create Role
            </button>
          </div>

          {successMsg && (
            <div style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.3)',
              color: 'var(--color-success)',
              fontSize: 'var(--font-size-sm)',
            }}>
              ✓ {successMsg}
            </div>
          )}

          {fetchError && (
            <div style={{
              marginBottom: 'var(--spacing-lg)',
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(220,38,38,0.08)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: 'var(--color-error)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{fetchError}</span>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-error)' }} onClick={loadRoles}>
                Retry
              </button>
            </div>
          )}

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <input
              type="text"
              placeholder="Search roles by name, key, or description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-input"
              style={{ maxWidth: '400px' }}
            />
          </div>

          <p className="text-sm text-tertiary mb-md">
            {filtered.length} role{filtered.length !== 1 ? 's' : ''} found
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl)', color: 'var(--color-text-secondary)' }}>
              Loading roles…
            </div>
          ) : (
            <>
              {systemRoles.length > 0 && (
                <section style={{ marginBottom: 'var(--spacing-2xl)' }}>
                  <h2 className="text-xl font-semibold mb-lg" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{ color: 'var(--color-accent-blue)' }}>●</span> System Roles
                    <span className="text-sm text-tertiary" style={{ fontWeight: 'normal' }}>
                      — built-in, editable but not deletable
                    </span>
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {systemRoles.map((role) => (
                      <RoleCard key={role.role_key} role={role} isAdmin={isAdmin} onEdit={setEditingRole} onDelete={setDeletingRole} />
                    ))}
                  </div>
                </section>
              )}

              {customRoles.length > 0 && (
                <section style={{ marginBottom: 'var(--spacing-2xl)' }}>
                  <h2 className="text-xl font-semibold mb-lg" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{ color: 'var(--color-accent-purple-light)' }}>●</span> Custom Roles
                  </h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {customRoles.map((role) => (
                      <RoleCard key={role.role_key} role={role} isAdmin={isAdmin} onEdit={setEditingRole} onDelete={setDeletingRole} />
                    ))}
                  </div>
                </section>
              )}

              {filtered.length === 0 && (
                <div className="card text-center" style={{ padding: 'var(--spacing-3xl)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🔑</div>
                  <h3 className="text-xl font-semibold mb-sm">
                    {search ? 'No roles match your search' : 'No roles found'}
                  </h3>
                  {!search && (
                    <button className="btn btn-primary" onClick={() => setEditingRole(false)}>
                      Create First Role
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
