/**
 * SoWWorkflowCustomizer — minimal form-based editor for a SoW's workflow
 * snapshot. Authors can add/rename/reorder/delete stages and edit
 * transitions, then PUT /api/workflow/sow/{sowId} to persist.
 *
 * Not a drag-and-drop builder — plain inputs + up/down arrows. Scoped to a
 * single SoW's snapshot (not the underlying template).
 *
 * Props
 * -----
 * sowId    number|string   — SoW integer ID
 * onSaved  () => void      — called after successful save (parent can refresh)
 * onClose  () => void      — called when the user closes the customizer
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

const STAGE_TYPES = ['draft', 'ai_analysis', 'review', 'approval', 'terminal'];

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export default function SoWWorkflowCustomizer({ sowId, onSaved, onClose }) {
  const { authFetch } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [stages, setStages] = useState([]);
  const [transitions, setTransitions] = useState([]);

  useEffect(() => {
    if (!sowId) return;
    let cancelled = false;
    authFetch(`/api/workflow/sow/${sowId}`)
      .then(async (r) => {
        if (cancelled) return;
        if (!r.ok) {
          setError(
            r.status === 404
              ? 'No workflow instance exists for this SoW yet. It will be created when the SoW is submitted to the backend.'
              : `Failed to load workflow (${r.status})`
          );
          setLoading(false);
          return;
        }
        const data = await r.json();
        const wd = data.workflow_data || {};
        setStages(
          (wd.stages || [])
            .slice()
            .sort((a, b) => a.stage_order - b.stage_order)
            .map((s) => ({ ...s, roles: s.roles || [], config: s.config || {} }))
        );
        setTransitions(
          (wd.transitions || []).map((t) => ({
            from: t.from_stage || t.from,
            to: t.to_stage || t.to,
          }))
        );
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Failed to load workflow');
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sowId, authFetch]);

  const updateStage = (idx, patch) =>
    setStages((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const moveStage = (idx, dir) => {
    setStages((prev) => {
      const next = prev.slice();
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next.map((s, i) => ({ ...s, stage_order: i + 1 }));
    });
  };

  const removeStage = (idx) => {
    const removed = stages[idx];
    setStages((prev) =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, stage_order: i + 1 }))
    );
    setTransitions((prev) =>
      prev.filter((t) => t.from !== removed.stage_key && t.to !== removed.stage_key)
    );
  };

  const addStage = () => {
    const base = `stage_${stages.length + 1}`;
    setStages((prev) => [
      ...prev,
      {
        stage_key: base,
        display_name: `Stage ${prev.length + 1}`,
        stage_order: prev.length + 1,
        stage_type: 'review',
        roles: [],
        config: {},
      },
    ]);
  };

  const toggleTransition = (from, to) => {
    setTransitions((prev) => {
      const exists = prev.some((t) => t.from === from && t.to === to);
      return exists
        ? prev.filter((t) => !(t.from === from && t.to === to))
        : [...prev, { from, to }];
    });
  };

  const save = async () => {
    setSaving(true);
    setError(null);

    // Ensure stage keys are unique; auto-slug display names if key missing.
    const seen = new Set();
    const normalizedStages = [];
    for (const s of stages) {
      let key = slugify(s.stage_key || s.display_name);
      if (!key) {
        setError('Every stage needs a key or display name');
        setSaving(false);
        return;
      }
      let suffix = 2;
      const base = key;
      while (seen.has(key)) key = `${base}_${suffix++}`;
      seen.add(key);
      normalizedStages.push({
        stage_key: key,
        display_name: s.display_name || key,
        stage_order: s.stage_order,
        stage_type: s.stage_type || 'review',
        roles: s.roles || [],
        config: s.config || {},
      });
    }

    // Rewrite transitions to use normalized keys if they changed.
    const keyMap = new Map(stages.map((s, i) => [s.stage_key, normalizedStages[i].stage_key]));
    const normalizedTransitions = transitions
      .map((t) => ({ from: keyMap.get(t.from) || t.from, to: keyMap.get(t.to) || t.to }))
      .filter((t) => seen.has(t.from) && seen.has(t.to));

    const payload = {
      stages: normalizedStages.map((s) => ({
        stage_key: s.stage_key,
        display_name: s.display_name,
        stage_order: s.stage_order,
        stage_type: s.stage_type,
        roles: s.roles,
        config: s.config,
      })),
      transitions: normalizedTransitions.map((t) => ({ from_stage: t.from, to_stage: t.to })),
    };

    try {
      const res = await authFetch(`/api/workflow/sow/${sowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Save failed (${res.status})`);
      }
      setSaving(false);
      if (onSaved) onSaved();
    } catch (e) {
      setError(e.message || 'Save failed');
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-tertiary text-sm">Loading workflow…</div>;
  }

  return (
    <div
      className="card"
      style={{
        padding: 'var(--spacing-lg)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-md)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>Customize workflow</h3>
        {onClose && (
          <button type="button" onClick={onClose} className="btn-ghost">
            Close
          </button>
        )}
      </div>
      <p className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
        These changes only affect this SoW's workflow snapshot — the underlying template is not
        modified.
      </p>

      {error && (
        <div
          style={{
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: 'var(--color-error)',
            marginBottom: 'var(--spacing-md)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          {error}
        </div>
      )}

      {/* Stages list */}
      <h4 style={{ marginBottom: 'var(--spacing-sm)' }}>Stages</h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {stages.map((stage, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr 1fr 140px auto',
              gap: 'var(--spacing-sm)',
              alignItems: 'center',
              padding: 'var(--spacing-sm)',
              border: '1px solid var(--color-border-subtle)',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span className="text-tertiary text-xs">{i + 1}</span>
            <input
              className="form-input"
              placeholder="Display name"
              value={stage.display_name}
              onChange={(e) => updateStage(i, { display_name: e.target.value })}
            />
            <input
              className="form-input"
              placeholder="stage_key"
              value={stage.stage_key}
              onChange={(e) => updateStage(i, { stage_key: e.target.value })}
            />
            <select
              className="form-select"
              value={stage.stage_type}
              onChange={(e) => updateStage(i, { stage_type: e.target.value })}
            >
              {STAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => moveStage(i, -1)}
                disabled={i === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => moveStage(i, 1)}
                disabled={i === stages.length - 1}
                title="Move down"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => removeStage(i)}
                title="Remove stage"
                style={{ color: 'var(--color-error)' }}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addStage}
        className="btn-secondary"
        style={{ marginTop: 'var(--spacing-sm)' }}
      >
        + Add stage
      </button>

      {/* Transitions matrix */}
      <h4 style={{ margin: 'var(--spacing-lg) 0 var(--spacing-sm)' }}>Transitions</h4>
      <p className="text-xs text-tertiary" style={{ marginBottom: 'var(--spacing-sm)' }}>
        Check which stages each row can advance to.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            fontSize: 'var(--font-size-xs)',
            minWidth: '100%',
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px', whiteSpace: 'nowrap' }}>
                From ↓ / To →
              </th>
              {stages.map((s) => (
                <th key={s.stage_key} style={{ padding: '6px', whiteSpace: 'nowrap' }}>
                  {s.display_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((from) => (
              <tr key={from.stage_key}>
                <td style={{ padding: '6px', fontWeight: 'var(--font-weight-semibold)' }}>
                  {from.display_name}
                </td>
                {stages.map((to) => {
                  const active = transitions.some(
                    (t) => t.from === from.stage_key && t.to === to.stage_key
                  );
                  const self = from.stage_key === to.stage_key;
                  return (
                    <td key={to.stage_key} style={{ padding: '6px', textAlign: 'center' }}>
                      {self ? (
                        <span className="text-tertiary">—</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={active}
                          onChange={() => toggleTransition(from.stage_key, to.stage_key)}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 'var(--spacing-lg)', display: 'flex', gap: 'var(--spacing-sm)' }}>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save workflow'}
        </button>
        {onClose && (
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
