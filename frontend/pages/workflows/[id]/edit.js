/**
 * pages/workflows/[id]/edit.js
 *
 * Dedicated React Flow editor page for a single workflow template. The `id`
 * query param is either a numeric template ID (edit existing) or the literal
 * string "new" (create a blank workflow). On save we PUT/POST to
 * /api/workflow/templates and route back to /business-logic.
 *
 * SoWs never reach this page — they just follow whichever template they were
 * assigned at creation time. This editor owns templates, not instances.
 *
 * Ownership rules (enforced client-side for now — backend lacks ownership):
 *   - System templates are view-only (backend 403s on PUT).
 *   - Templates whose created_by matches the current user are "mine" and
 *     fully editable.
 *   - Templates created by others are shared-library and view-only here;
 *     the user can clone them into their own template via "Save as copy".
 */

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useAuth } from '../../../lib/auth';
import Spinner from '../../../components/Spinner';
import WorkflowFlowEditor from '../../../components/workflow/WorkflowFlowEditor';
import { emptyWorkflowData } from '../../../lib/workflowEditor';

export default function WorkflowEditPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  const [workflow, setWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);

  // Load the template (or initialize a blank one for "new"). We set a stable
  // `loaded_at` so the editor only resets its internal graph state on the
  // initial load, not on every re-render.
  useEffect(() => {
    if (!id || !user) return;
    if (id === 'new') {
      setWorkflow({
        id: null,
        name: '',
        description: '',
        is_system: false,
        created_by: user.id,
        workflow_data: emptyWorkflowData(),
        loaded_at: Date.now(),
      });
      setLoading(false);
      return;
    }

    const numericId = Number(id);
    if (!Number.isFinite(numericId)) {
      setLoadError('Invalid workflow id.');
      setLoading(false);
      return;
    }

    authFetch(`/api/workflow/templates/${numericId}`)
      .then(async (r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404 ? 'Workflow not found.' : `Failed to load workflow (${r.status})`
          );
        }
        const data = await r.json();
        setWorkflow({ ...data, loaded_at: Date.now() });
        setLoading(false);
      })
      .catch((e) => {
        setLoadError(e.message || 'Failed to load workflow.');
        setLoading(false);
      });
  }, [id, user, authFetch]);

  // ── Permission derivation ─────────────────────────────────────────────────
  // Backend enforces is_system; ownership mismatch is surfaced client-side
  // as a "view only — save as copy" hint until the backend grows per-user ACLs.

  const isSystem = !!workflow?.is_system;
  const isOwnTemplate =
    workflow &&
    (workflow.id == null || workflow.created_by == null || workflow.created_by === user?.id);
  const readOnly = isSystem || !isOwnTemplate;

  // ── Save / Save as copy ───────────────────────────────────────────────────

  const save = async ({ asCopy = false } = {}) => {
    if (!workflow) return;
    setSaveError(null);
    if (!workflow.name?.trim()) {
      setSaveError('Workflow name is required.');
      return;
    }
    const payload = {
      name: asCopy ? `${workflow.name} (copy)` : workflow.name.trim(),
      description: workflow.description?.trim() || null,
      workflow_data: workflow.workflow_data,
    };
    setSaving(true);
    try {
      const isNew = workflow.id == null || asCopy;
      const url = isNew ? '/api/workflow/templates' : `/api/workflow/templates/${workflow.id}`;
      const res = await authFetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Save failed (${res.status})`);
      }
      const saved = await res.json();
      // Preserve loaded_at so the editor's internal state doesn't reset on
      // the post-save refresh.
      setWorkflow({ ...saved, loaded_at: workflow.loaded_at });
      setSavedAt(new Date());
      if (isNew) {
        // Route to the canonical URL once we have an id.
        router.replace(`/workflows/${saved.id}/edit`, undefined, { shallow: true });
      }
    } catch (e) {
      setSaveError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner message="Loading workflow…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl)',
          textAlign: 'center',
        }}
      >
        <h1 className="text-2xl font-semibold mb-md">Unable to open workflow</h1>
        <p className="text-secondary mb-xl">{loadError}</p>
        <button className="btn btn-primary" onClick={() => router.push('/business-logic')}>
          Back to Business Logic
        </button>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{workflow.name || 'Workflow Editor'} – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 'var(--spacing-lg) var(--spacing-xl)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
          }}
        >
          <div
            style={{
              maxWidth: 'var(--container-xl)',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--spacing-lg)',
              flexWrap: 'wrap',
            }}
          >
            {/* Left: breadcrumb + title */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-sm)',
                  marginBottom: 'var(--spacing-xs)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <button
                  onClick={() => router.push('/business-logic')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 'inherit',
                  }}
                >
                  Business Logic
                </button>
                <span>›</span>
                <span style={{ color: 'var(--color-text-primary)' }}>
                  {workflow.id == null ? 'New workflow' : 'Edit workflow'}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  flexWrap: 'wrap',
                }}
              >
                <h1
                  className="text-2xl font-bold"
                  style={{
                    margin: 0,
                    maxWidth: '520px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {workflow.name || 'Untitled workflow'}
                </h1>
                {isSystem && <Badge color="blue">System</Badge>}
                {!isSystem && !isOwnTemplate && <Badge color="grey">Shared library</Badge>}
                {!isSystem && isOwnTemplate && workflow.id != null && (
                  <Badge color="purple">Mine</Badge>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                flexShrink: 0,
              }}
            >
              {savedAt && !saving && (
                <span className="text-xs text-tertiary">Saved {savedAt.toLocaleTimeString()}</span>
              )}
              {readOnly ? (
                <button
                  className="btn btn-primary"
                  onClick={() => save({ asCopy: true })}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save as copy'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => save()} disabled={saving}>
                  {saving ? 'Saving…' : workflow.id == null ? 'Create workflow' : 'Save changes'}
                </button>
              )}
              <button className="btn btn-secondary" onClick={() => router.push('/business-logic')}>
                Close
              </button>
            </div>
          </div>

          {/* Read-only banner */}
          {readOnly && (
            <div
              style={{
                maxWidth: 'var(--container-xl)',
                margin: 'var(--spacing-md) auto 0',
                padding: 'var(--spacing-xs) var(--spacing-md)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.25)',
                color: 'var(--color-info)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {isSystem
                ? 'This is a system workflow and cannot be edited directly. Use "Save as copy" to create an editable version.'
                : 'This workflow belongs to another user. Use "Save as copy" to create your own editable version.'}
            </div>
          )}

          {/* Save error */}
          {saveError && (
            <div
              style={{
                maxWidth: 'var(--container-xl)',
                margin: 'var(--spacing-md) auto 0',
                padding: 'var(--spacing-xs) var(--spacing-md)',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.25)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-xs)',
              }}
            >
              {saveError}
            </div>
          )}
        </div>

        {/* Editor canvas fills remaining height */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            padding: 'var(--spacing-lg) var(--spacing-xl) var(--spacing-xl)',
            minHeight: 0,
          }}
        >
          <div
            style={{
              maxWidth: 'var(--container-xl)',
              width: '100%',
              margin: '0 auto',
              display: 'flex',
              minHeight: '600px',
            }}
          >
            <WorkflowFlowEditor workflow={workflow} onChange={setWorkflow} readOnly={readOnly} />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Small badge helper ────────────────────────────────────────────────────────

function Badge({ color, children }) {
  const palette = {
    blue: {
      bg: 'rgba(0,120,212,0.1)',
      color: 'var(--color-accent-blue)',
      border: 'rgba(0,120,212,0.25)',
    },
    purple: {
      bg: 'rgba(124,58,237,0.1)',
      color: 'var(--color-accent-purple, #7c3aed)',
      border: 'rgba(124,58,237,0.25)',
    },
    grey: {
      bg: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-secondary)',
      border: 'var(--color-border-default)',
    },
  };
  const p = palette[color] || palette.grey;
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        backgroundColor: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
      }}
    >
      {children}
    </span>
  );
}
