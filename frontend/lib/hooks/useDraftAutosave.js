/**
 * useDraftAutosave — periodically snapshot editor state to localStorage so
 * work survives browser crashes, accidental tab closes, and the OS killing
 * the process. Paired with a "Restore unsaved changes?" prompt on mount.
 *
 * Complements useUnsavedChangesWarning: that hook protects INTENTIONAL
 * navigation, this one protects UNINTENTIONAL loss.
 *
 * Security note:
 *   localStorage is reachable from any JavaScript on the page, so anything
 *   written here inherits the app's XSS exposure. Use the following rule
 *   of thumb:
 *
 *     OK — data the authenticated user can already see in the page they're
 *          editing. Workflow structure, handoff team rosters (names,
 *          roles, work emails), SoW titles, opportunity IDs. Its XSS risk
 *          is already bounded by "the attacker ran JS in this session", in
 *          which case the DOM itself leaks the same data.
 *
 *     NOT  — secrets, auth tokens, API keys, regulated data (PHI, SSN,
 *     OK     bank details), and anything the session owner wouldn't
 *            themselves see on the page (e.g. another user's pricing).
 *            Also avoid storing customer-identity PII and deal economics
 *            in autosave when the natural UX ("retype four fields")
 *            wouldn't meaningfully hurt on restore — storing them
 *            needlessly widens the blast radius of any XSS find.
 *
 * Current autosave sites for auditing:
 *   - `draft:sow:new` (create-new.js): non-PII form subset only (title,
 *     opportunity id, work order, methodology, cycle). Pricing and
 *     customer names are deliberately excluded.
 *   - `draft:handoff:sow:{id}` (HandoffPackageBuilder): includes handoff
 *     team + key contacts (names, work emails, phones). Acceptable under
 *     the OK rule above — same data is in the surrounding page DOM.
 *   - `draft:workflow:sow:{id}` and `draft:workflow:template:{id}`:
 *     structural stages + transitions only.
 *
 * Usage:
 *
 *   const { loadDraft, clearDraft, lastSavedAt } = useDraftAutosave({
 *     key: `workflow:sow:${sowId}`,
 *     data: workflow?.workflow_data,
 *     enabled: hasChanges,
 *   });
 *
 *   // After initial load:
 *   const draft = loadDraft();
 *   if (draft && signatureDiffers(draft.data, workflow.workflow_data)) {
 *     // offer to restore
 *   }
 *
 *   // After successful save:
 *   clearDraft();
 */

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_PREFIX = 'draft:';

function storageKey(key) {
  return `${STORAGE_PREFIX}${key}`;
}

export default function useDraftAutosave({ key, data, enabled, debounceMs = 3000 }) {
  const [lastSavedAt, setLastSavedAt] = useState(null);
  // Guards against writing the same serialized payload twice in a row.
  const lastWrittenRef = useRef('');

  useEffect(() => {
    if (!enabled || !key || data == null) return undefined;
    if (typeof window === 'undefined') return undefined;

    const t = setTimeout(() => {
      try {
        const serialized = JSON.stringify(data);
        if (serialized === lastWrittenRef.current) return;
        const payload = JSON.stringify({ savedAt: Date.now(), data });
        window.localStorage.setItem(storageKey(key), payload);
        lastWrittenRef.current = serialized;
        setLastSavedAt(new Date());
      } catch {
        // Quota exceeded, private mode, serialization error — autosave is
        // best-effort. Fail silently rather than block the editor.
      }
    }, debounceMs);

    return () => clearTimeout(t);
  }, [key, data, enabled, debounceMs]);

  const loadDraft = useCallback(() => {
    if (!key || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(storageKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
      return {
        data: parsed.data,
        savedAt: typeof parsed.savedAt === 'number' ? new Date(parsed.savedAt) : null,
      };
    } catch {
      return null;
    }
  }, [key]);

  const clearDraft = useCallback(() => {
    if (!key || typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(storageKey(key));
      lastWrittenRef.current = '';
      setLastSavedAt(null);
    } catch {
      // ignore
    }
  }, [key]);

  return { loadDraft, clearDraft, lastSavedAt };
}
