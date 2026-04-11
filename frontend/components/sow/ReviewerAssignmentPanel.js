/**
 * ReviewerAssignmentPanel — author-facing picker for designating
 * which user fills which role at which stage of a SoW's review pipeline.
 *
 * Behavior
 * ────────
 * - Loads `GET /api/sow/{sowId}/reviewers` on mount, which returns one slot
 *   per (stage, required role) for every review/approval stage in the SoW's
 *   workflow snapshot. Each slot includes the currently designated user
 *   (or null).
 * - Renders one card per stage. Inside each card, one row per required role
 *   with a `<select>` populated by `GET /api/users?role={role_key}` (lazy-
 *   loaded the first time the dropdown is opened for a given role_key).
 * - "Save" issues a single `PUT /api/sow/{sowId}/reviewers` containing every
 *   slot's current selection (so the backend can upsert/delete in one shot).
 * - The panel is read-only when `readOnly` is true.  In that case the
 *   dropdowns become plain text labels and the Save button is hidden.
 * - When `readOnly={false}` and `sowStatus !== 'draft'`, the panel shows a
 *   yellow live-edit warning banner because swapping a reviewer mid-review
 *   cancels their in-flight assignment and re-creates a fresh one for the
 *   new reviewer (see `PUT /api/sow/{id}/reviewers` swap semantics).
 * - On a successful save, the panel calls `onSaved()` so a parent dashboard
 *   can refresh its status pill / workflow timeline (the backend may
 *   auto-advance the SoW after the swap recheck).
 *
 * Slots whose role can't be filled (because no active user has that role) get
 * an "(no users with this role)" hint. Submission of the SoW will be blocked
 * by the backend if any required slot on a stage flagged
 * `requires_designated_reviewer` is left empty.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../lib/auth';

export default function ReviewerAssignmentPanel({
  sowId,
  readOnly = false,
  sowStatus = 'draft',
  onSaved,
}) {
  const { authFetch } = useAuth();

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  // Cache of role_key → list of users (lazy-loaded per role)
  const [usersByRole, setUsersByRole] = useState({});
  const [usersLoading, setUsersLoading] = useState({});
  // Roles we've already requested (fetched or in-flight).  Held as a ref so
  // re-renders don't re-trigger the preload effect after every state update.
  const requestedRolesRef = useRef(new Set());

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sowId) return undefined;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setLoading(true);
    setError(null);
    authFetch(`/api/sow/${sowId}/reviewers`, { signal })
      .then(async (r) => {
        if (signal.aborted) return;
        if (!r.ok) {
          const text = await r.text().catch(() => '');
          throw new Error(text || `Failed to load reviewers (${r.status})`);
        }
        const data = await r.json();
        if (signal.aborted) return;
        setSlots(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (e?.name === 'AbortError' || signal.aborted) return;
        setError(e.message || 'Failed to load reviewers');
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [sowId, authFetch]);

  const loadUsersForRole = useCallback(
    async (roleKey) => {
      // Mark as requested before kicking off the fetch so concurrent calls
      // for the same role short-circuit at the ref check below.
      requestedRolesRef.current.add(roleKey);
      setUsersLoading((m) => ({ ...m, [roleKey]: true }));
      try {
        const r = await authFetch(`/api/users?role=${encodeURIComponent(roleKey)}`);
        if (!r.ok) throw new Error(`Failed (${r.status})`);
        const list = await r.json();
        setUsersByRole((m) => ({ ...m, [roleKey]: Array.isArray(list) ? list : [] }));
      } catch {
        setUsersByRole((m) => ({ ...m, [roleKey]: [] }));
        // Allow a retry on next render if the fetch fails.
        requestedRolesRef.current.delete(roleKey);
      } finally {
        setUsersLoading((m) => ({ ...m, [roleKey]: false }));
      }
    },
    [authFetch]
  );

  // ── Eagerly preload the user list for every distinct role on mount ─────
  // (Small payloads, and the dropdown selected-value lookup is cleaner if
  //  we have the user list available even before the user opens the menu.)
  //
  // Dedup against ``requestedRolesRef`` rather than ``usersByRole`` /
  // ``usersLoading`` so the effect doesn't re-fire every time those state
  // maps are updated by the in-flight fetches it just kicked off — that
  // pattern was the reason this previously needed an ``eslint-disable``.
  useEffect(() => {
    if (loading || error) return;
    const distinctRoles = Array.from(new Set(slots.map((s) => s.role_key)));
    distinctRoles.forEach((roleKey) => {
      if (requestedRolesRef.current.has(roleKey)) return;
      loadUsersForRole(roleKey);
    });
  }, [loading, error, slots, loadUsersForRole]);

  // ── Group slots by stage for rendering ──────────────────────────────────
  const stageGroups = useMemo(() => {
    const order = [];
    const map = new Map();
    for (const slot of slots) {
      if (!map.has(slot.stage_key)) {
        map.set(slot.stage_key, {
          stage_key: slot.stage_key,
          stage_display_name: slot.stage_display_name,
          slots: [],
        });
        order.push(slot.stage_key);
      }
      map.get(slot.stage_key).slots.push(slot);
    }
    return order.map((k) => map.get(k));
  }, [slots]);

  const unfilledCount = useMemo(() => slots.filter((s) => !s.user_id).length, [slots]);

  // ── Mutators ────────────────────────────────────────────────────────────
  const updateSlot = (stage_key, role_key, user_id) => {
    setSaveMessage(null);
    setSlots((prev) =>
      prev.map((s) => {
        if (s.stage_key !== stage_key || s.role_key !== role_key) return s;
        if (!user_id) {
          return { ...s, user_id: null, user_email: null, user_full_name: null };
        }
        const u = (usersByRole[role_key] || []).find((x) => x.id === user_id);
        return {
          ...s,
          user_id,
          user_email: u?.email || null,
          user_full_name: u?.full_name || null,
        };
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload = {
        selections: slots.map((s) => ({
          stage_key: s.stage_key,
          role_key: s.role_key,
          user_id: s.user_id || null,
        })),
      };
      const r = await authFetch(`/api/sow/${sowId}/reviewers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => '');
        throw new Error(text || `Save failed (${r.status})`);
      }
      const updated = await r.json();
      setSlots(Array.isArray(updated) ? updated : []);
      setSaveMessage({ kind: 'ok', text: 'Reviewers saved.' });
      if (typeof onSaved === 'function') onSaved();
    } catch (e) {
      setSaveMessage({ kind: 'err', text: e.message || 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="text-xs text-tertiary" style={{ padding: 'var(--spacing-sm) 0' }}>
        Loading reviewers…
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-xs" style={{ color: 'var(--color-error)' }}>
        {error}
      </div>
    );
  }
  if (slots.length === 0) {
    return (
      <div
        className="text-xs text-tertiary"
        style={{
          padding: 'var(--spacing-sm)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--color-bg-tertiary)',
          border: '1px dashed var(--color-border-default)',
          fontStyle: 'italic',
        }}
      >
        This SoW's workflow has no review or approval stages requiring designated reviewers.
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 'var(--spacing-md)',
        borderRadius: 'var(--radius-md)',
        backgroundColor: 'var(--color-bg-primary)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-sm)',
          gap: 'var(--spacing-sm)',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-primary)',
            }}
          >
            Reviewers
          </h3>
          <p className="text-xs text-tertiary" style={{ margin: '2px 0 0', lineHeight: 1.4 }}>
            Pick the user who will fill each role at each review stage. Required for stages flagged
            "Requires designated reviewer" in the workflow editor.
          </p>
        </div>
        {!readOnly && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ fontSize: 'var(--font-size-xs)', padding: '4px 14px' }}
          >
            {saving ? 'Saving…' : 'Save reviewers'}
          </button>
        )}
      </div>

      {!readOnly && sowStatus && sowStatus !== 'draft' && (
        <div
          style={{
            marginBottom: 'var(--spacing-sm)',
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(251,191,36,0.10)',
            border: '1px solid rgba(251,191,36,0.35)',
            color: 'var(--color-warning)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.4,
          }}
        >
          <strong>Live edit:</strong> swapping a reviewer will cancel their current work and create
          a fresh assignment for the new reviewer.
        </div>
      )}

      {unfilledCount > 0 && (
        <div
          style={{
            marginBottom: 'var(--spacing-sm)',
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(251,191,36,0.08)',
            border: '1px solid rgba(251,191,36,0.25)',
            color: 'var(--color-warning)',
            fontSize: 'var(--font-size-xs)',
            lineHeight: 1.4,
          }}
        >
          {unfilledCount} role{unfilledCount === 1 ? '' : 's'} still need a designated reviewer.
          Submission will be blocked for any stage that requires designation.
        </div>
      )}

      {saveMessage && (
        <div
          style={{
            marginBottom: 'var(--spacing-sm)',
            padding: 'var(--spacing-xs) var(--spacing-sm)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor:
              saveMessage.kind === 'ok' ? 'rgba(34,197,94,0.08)' : 'rgba(220,38,38,0.08)',
            border: `1px solid ${saveMessage.kind === 'ok' ? 'rgba(34,197,94,0.25)' : 'rgba(220,38,38,0.25)'}`,
            color: saveMessage.kind === 'ok' ? 'var(--color-success)' : 'var(--color-error)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          {saveMessage.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {stageGroups.map((group) => (
          <div
            key={group.stage_key}
            style={{
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border-subtle)',
              backgroundColor: 'var(--color-bg-secondary)',
              padding: 'var(--spacing-sm)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--color-text-primary)',
                marginBottom: 'var(--spacing-xs)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {group.stage_display_name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {group.slots.map((slot) => {
                const users = usersByRole[slot.role_key] || [];
                const isLoadingUsers = usersLoading[slot.role_key];
                const noUsers = !isLoadingUsers && users.length === 0;
                return (
                  <div
                    key={`${slot.stage_key}::${slot.role_key}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-sm)',
                    }}
                  >
                    <div
                      style={{
                        flex: '0 0 38%',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      {slot.role_display_name || slot.role_key}
                      <span
                        style={{
                          display: 'block',
                          fontSize: '10px',
                          color: 'var(--color-text-tertiary)',
                          fontFamily: 'monospace',
                        }}
                      >
                        {slot.role_key}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      {readOnly ? (
                        <span
                          className="text-xs"
                          style={{
                            color: slot.user_id
                              ? 'var(--color-text-primary)'
                              : 'var(--color-text-tertiary)',
                            fontStyle: slot.user_id ? 'normal' : 'italic',
                          }}
                        >
                          {slot.user_id
                            ? slot.user_full_name || slot.user_email
                            : '(not designated)'}
                        </span>
                      ) : (
                        <select
                          className="form-select"
                          value={slot.user_id || ''}
                          disabled={isLoadingUsers || noUsers}
                          onChange={(e) =>
                            updateSlot(
                              slot.stage_key,
                              slot.role_key,
                              e.target.value ? parseInt(e.target.value, 10) : null
                            )
                          }
                          style={{ fontSize: 'var(--font-size-xs)', width: '100%' }}
                        >
                          <option value="">
                            {isLoadingUsers
                              ? 'Loading users…'
                              : noUsers
                                ? '(no users with this role)'
                                : 'Select reviewer…'}
                          </option>
                          {users.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name ? `${u.full_name} (${u.email})` : u.email}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
