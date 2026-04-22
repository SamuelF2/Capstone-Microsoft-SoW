/**
 * HandoffPackageBuilder — form for building the delivery handoff package.
 *
 * Props
 * -----
 * sowData         object    — SoW summary (title, customer, deliverables, etc.)
 * existingPackage object|null — previously saved handoff package
 * onSave          (data) => void — called with payload on save
 * saving          boolean   — save in progress
 * readOnly        boolean   — true after SoW is finalized
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useUnsavedChangesWarning from '../lib/hooks/useUnsavedChangesWarning';
import useDraftAutosave from '../lib/hooks/useDraftAutosave';
import UnsavedChangesModal from './UnsavedChangesModal';
import RestoreDraftModal from './RestoreDraftModal';

// Normalized signature used for dirty detection + draft/server diff.
// Rows with no meaningful content are dropped so a lone empty placeholder row
// doesn't flag the form as dirty.
function handoffSignature(state) {
  const team = (state?.deliveryTeam || [])
    .filter((m) => m.role || m.name || m.email || m.allocation)
    .map((m) => [m.role || '', m.name || '', m.email || '', m.allocation || '']);
  const contacts = (state?.keyContacts || [])
    .filter((c) => c.name || c.role || c.email || c.phone)
    .map((c) => [c.name || '', c.role || '', c.email || '', c.phone || '']);
  return JSON.stringify({
    team,
    contacts,
    kickoffDate: state?.kickoffDate || '',
    specialInstructions: state?.specialInstructions || '',
    notes: state?.notes || '',
  });
}

function signatureFromPackage(pkg) {
  return handoffSignature({
    deliveryTeam: pkg?.delivery_team || [],
    keyContacts: pkg?.key_contacts || [],
    kickoffDate: pkg?.kickoff_date || '',
    specialInstructions: pkg?.special_instructions || '',
    notes: pkg?.notes || '',
  });
}

const TEAM_ROLE_OPTIONS = [
  'Project Manager',
  'Delivery Lead',
  'Solution Architect',
  'Senior Developer',
  'Developer',
  'QA Engineer',
  'Business Analyst',
  'Change Manager',
  'Cloud Engineer',
  'Data Engineer',
  'DevOps Engineer',
  'Other',
];

function SectionHeader({ title }) {
  return (
    <div
      style={{
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--color-text-tertiary)',
        marginBottom: 'var(--spacing-sm)',
        paddingBottom: '6px',
        borderBottom: '1px solid var(--color-border-default)',
      }}
    >
      {title}
    </div>
  );
}

function InputCell({ value, onChange, placeholder, type = 'text', readOnly }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      style={{
        width: '100%',
        padding: '5px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border-default)',
        backgroundColor: readOnly ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
        color: 'var(--color-text-primary)',
        fontSize: 'var(--font-size-xs)',
        boxSizing: 'border-box',
      }}
    />
  );
}

function RemoveButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--color-error)',
        fontSize: '18px',
        lineHeight: 1,
        padding: '0 4px',
        flexShrink: 0,
      }}
    >
      ×
    </button>
  );
}

// ── Delivery Team ─────────────────────────────────────────────────────────────

function DeliveryTeamTable({ team, onChange, readOnly }) {
  function addMember() {
    onChange([...team, { role: '', name: '', email: '', allocation: '' }]);
  }
  function updateMember(i, field, val) {
    onChange(team.map((m, j) => (j === i ? { ...m, [field]: val } : m)));
  }
  function removeMember(i) {
    onChange(team.filter((_, j) => j !== i));
  }

  const colWidths = ['22%', '22%', '30%', '16%', '10%'];

  return (
    <div>
      {/* Header row */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        {['Role', 'Name', 'Email', 'Allocation %', ''].map((h, i) => (
          <div
            key={i}
            style={{
              width: colWidths[i],
              fontSize: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {team.map((member, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}
        >
          <div style={{ width: colWidths[0] }}>
            {readOnly ? (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-primary)' }}>
                {member.role}
              </span>
            ) : (
              <select
                value={member.role || ''}
                onChange={(e) => updateMember(i, 'role', e.target.value)}
                style={{
                  width: '100%',
                  padding: '5px 8px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                <option value="">Select…</option>
                {TEAM_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div style={{ width: colWidths[1] }}>
            <InputCell
              value={member.name}
              onChange={(v) => updateMember(i, 'name', v)}
              placeholder="Full name"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[2] }}>
            <InputCell
              value={member.email}
              onChange={(v) => updateMember(i, 'email', v)}
              placeholder="email@example.com"
              type="email"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[3] }}>
            <InputCell
              value={member.allocation}
              onChange={(v) => updateMember(i, 'allocation', v)}
              placeholder="100"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[4] }}>
            {!readOnly && <RemoveButton onClick={() => removeMember(i)} />}
          </div>
        </div>
      ))}

      {!readOnly && (
        <button
          onClick={addMember}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent-purple, #7c3aed)',
            fontSize: 'var(--font-size-xs)',
            padding: '4px 0',
          }}
        >
          + Add Team Member
        </button>
      )}
    </div>
  );
}

// ── Key Contacts ──────────────────────────────────────────────────────────────

function KeyContactsTable({ contacts, onChange, readOnly }) {
  function addContact() {
    onChange([...contacts, { name: '', role: '', email: '', phone: '' }]);
  }
  function updateContact(i, field, val) {
    onChange(contacts.map((c, j) => (j === i ? { ...c, [field]: val } : c)));
  }
  function removeContact(i) {
    onChange(contacts.filter((_, j) => j !== i));
  }

  const colWidths = ['22%', '22%', '30%', '16%', '10%'];

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
        {['Name', 'Role', 'Email', 'Phone', ''].map((h, i) => (
          <div
            key={i}
            style={{
              width: colWidths[i],
              fontSize: '10px',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
            }}
          >
            {h}
          </div>
        ))}
      </div>

      {contacts.map((contact, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' }}
        >
          <div style={{ width: colWidths[0] }}>
            <InputCell
              value={contact.name}
              onChange={(v) => updateContact(i, 'name', v)}
              placeholder="Full name"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[1] }}>
            <InputCell
              value={contact.role}
              onChange={(v) => updateContact(i, 'role', v)}
              placeholder="e.g. Executive Sponsor"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[2] }}>
            <InputCell
              value={contact.email}
              onChange={(v) => updateContact(i, 'email', v)}
              placeholder="email@example.com"
              type="email"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[3] }}>
            <InputCell
              value={contact.phone}
              onChange={(v) => updateContact(i, 'phone', v)}
              placeholder="+1 555 0100"
              readOnly={readOnly}
            />
          </div>
          <div style={{ width: colWidths[4] }}>
            {!readOnly && <RemoveButton onClick={() => removeContact(i)} />}
          </div>
        </div>
      ))}

      {!readOnly && (
        <button
          onClick={addContact}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--color-accent-purple, #7c3aed)',
            fontSize: 'var(--font-size-xs)',
            padding: '4px 0',
          }}
        >
          + Add Contact
        </button>
      )}
    </div>
  );
}

// ── Auto-included data summary ────────────────────────────────────────────────

function AutoIncludedSummary({ sowData, existingPackage }) {
  const pkg = existingPackage?.package_data || {};

  const inScopeCount = (pkg.approved_scope?.in_scope || []).length || sowData?.scope_in_count || 0;
  const delivCount = (pkg.deliverables || []).length || 0;
  const resourceCount = (pkg.resource_plan || []).length || 0;
  const riskCount = (pkg.risk_register || []).length || 0;
  const reviewCount = (pkg.review_decisions || []).length || 0;
  const custRespCount = (pkg.customer_responsibilities || []).length || 0;
  const condCount = (pkg.conditions_to_address || []).length || 0;

  const rows = [
    {
      label: 'Approved scope and deliverables',
      detail: `${inScopeCount} in-scope items, ${delivCount} deliverables`,
    },
    {
      label: 'Resource plan',
      detail: resourceCount > 0 ? `${resourceCount} team members` : 'from SoW content',
    },
    {
      label: 'Risk register',
      detail: riskCount > 0 ? `${riskCount} risk${riskCount !== 1 ? 's' : ''}` : 'from SoW content',
    },
    {
      label: `Review decisions and conditions`,
      detail: `${reviewCount} reviewer${reviewCount !== 1 ? 's' : ''}${condCount > 0 ? `, ${condCount} condition${condCount !== 1 ? 's' : ''}` : ''}`,
    },
    {
      label: 'Customer responsibilities',
      detail:
        custRespCount > 0
          ? `${custRespCount} item${custRespCount !== 1 ? 's' : ''}`
          : 'from SoW scope',
    },
  ];

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--spacing-md)',
        backgroundColor: 'var(--color-bg-tertiary)',
      }}
    >
      <p
        style={{
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--color-text-secondary)',
          margin: '0 0 var(--spacing-xs)',
        }}
      >
        Auto-included from SoW (read-only):
      </p>
      {rows.map(({ label, detail }, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '3px 0',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          <span style={{ color: 'var(--color-text-primary)' }}>
            <span style={{ color: 'var(--color-success)', marginRight: '6px' }}>✓</span>
            {label}
          </span>
          <span style={{ color: 'var(--color-text-tertiary)' }}>{detail}</span>
        </div>
      ))}
    </div>
  );
}

// ── Root export ───────────────────────────────────────────────────────────────

export default function HandoffPackageBuilder({
  sowId,
  sowData,
  existingPackage,
  onSave,
  saving = false,
  readOnly = false,
}) {
  const pkg = existingPackage?.package_data || {};

  const [deliveryTeam, setDeliveryTeam] = useState(
    pkg.delivery_team?.length
      ? pkg.delivery_team
      : [{ role: '', name: '', email: '', allocation: '' }]
  );
  const [keyContacts, setKeyContacts] = useState(
    pkg.key_contacts?.length ? pkg.key_contacts : [{ name: '', role: '', email: '', phone: '' }]
  );
  const [kickoffDate, setKickoffDate] = useState(pkg.kickoff_date || '');
  const [specialInstructions, setSpecialInstructions] = useState(pkg.special_instructions || '');
  const [notes, setNotes] = useState(pkg.notes || '');

  // Sync if package is loaded async
  useEffect(() => {
    if (existingPackage?.package_data) {
      const d = existingPackage.package_data;
      if (d.delivery_team?.length) setDeliveryTeam(d.delivery_team);
      if (d.key_contacts?.length) setKeyContacts(d.key_contacts);
      if (d.kickoff_date) setKickoffDate(d.kickoff_date);
      if (d.special_instructions) setSpecialInstructions(d.special_instructions);
      if (d.notes) setNotes(d.notes);
    }
  }, [existingPackage]);

  // ── Unsaved-changes guard + draft autosave ─────────────────────────────
  // Dirty when the current local state diverges from the last-saved server
  // package. Suppressed while the page is read-only (nothing to lose) or
  // while a save is in flight (so the in-flight post-save state update
  // doesn't briefly flash the modal).
  const currentSig = useMemo(
    () =>
      handoffSignature({
        deliveryTeam,
        keyContacts,
        kickoffDate,
        specialInstructions,
        notes,
      }),
    [deliveryTeam, keyContacts, kickoffDate, specialInstructions, notes]
  );
  const serverSig = useMemo(
    () => signatureFromPackage(existingPackage?.package_data),
    [existingPackage]
  );
  const hasChanges = !readOnly && !saving && currentSig !== serverSig;

  const {
    showModal: showUnsavedModal,
    confirmLeave: confirmUnsavedLeave,
    cancelLeave: cancelUnsavedLeave,
  } = useUnsavedChangesWarning(hasChanges);

  const draftData = useMemo(
    () => ({ deliveryTeam, keyContacts, kickoffDate, specialInstructions, notes }),
    [deliveryTeam, keyContacts, kickoffDate, specialInstructions, notes]
  );
  const { loadDraft, clearDraft } = useDraftAutosave({
    key: sowId ? `handoff:sow:${sowId}` : null,
    data: draftData,
    enabled: hasChanges,
  });

  // Offer to restore a draft on mount if it differs from server state.
  // Parent already gates the whole page on its loading flag, so by the time
  // we mount the handoff fetch has resolved (to a package or to null).
  const draftCheckedRef = useRef(false);
  const [pendingDraft, setPendingDraft] = useState(null);

  // Re-arm the draft check if the sowId changes without an unmount. Parent
  // usually remounts per-id, but this keeps us correct if it ever swaps in
  // place.
  useEffect(() => {
    draftCheckedRef.current = false;
    setPendingDraft(null);
  }, [sowId]);

  useEffect(() => {
    if (draftCheckedRef.current || !sowId) return;
    draftCheckedRef.current = true;
    const draft = loadDraft();
    if (!draft) return;
    const draftSig = handoffSignature(draft.data || {});
    if (draftSig && draftSig !== serverSig) {
      setPendingDraft(draft);
    } else {
      clearDraft();
    }
  }, [sowId, serverSig, loadDraft, clearDraft]);

  // Clear the draft whenever the server package content changes — covers
  // both fresh loads and post-save refreshes.
  const prevServerSigRef = useRef(serverSig);
  useEffect(() => {
    if (prevServerSigRef.current !== serverSig) {
      prevServerSigRef.current = serverSig;
      // Only clear if we aren't sitting on a restored draft the user hasn't
      // decided about yet — otherwise we'd wipe it from storage mid-prompt.
      if (!pendingDraft) clearDraft();
    }
  }, [serverSig, clearDraft, pendingDraft]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft?.data) return;
    const d = pendingDraft.data;
    if (Array.isArray(d.deliveryTeam)) setDeliveryTeam(d.deliveryTeam);
    if (Array.isArray(d.keyContacts)) setKeyContacts(d.keyContacts);
    if (typeof d.kickoffDate === 'string') setKickoffDate(d.kickoffDate);
    if (typeof d.specialInstructions === 'string') setSpecialInstructions(d.specialInstructions);
    if (typeof d.notes === 'string') setNotes(d.notes);
    setPendingDraft(null);
  }, [pendingDraft]);

  const handleDiscardDraft = useCallback(() => {
    setPendingDraft(null);
    clearDraft();
  }, [clearDraft]);

  function handleSave() {
    const validTeam = deliveryTeam.filter((m) => m.role || m.name || m.email);
    if (validTeam.length === 0) {
      alert('Add at least one delivery team member before saving.');
      return;
    }
    onSave({
      delivery_team: validTeam,
      key_contacts: keyContacts.filter((c) => c.name || c.email),
      kickoff_date: kickoffDate || null,
      special_instructions: specialInstructions || null,
      notes: notes || null,
    });
  }

  const textareaStyle = {
    width: '100%',
    padding: 'var(--spacing-sm)',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--color-border-default)',
    backgroundColor: readOnly ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--font-size-sm)',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
      {/* Delivery Team */}
      <div>
        <SectionHeader title="Delivery Team" />
        <DeliveryTeamTable team={deliveryTeam} onChange={setDeliveryTeam} readOnly={readOnly} />
      </div>

      {/* Key Contacts */}
      <div>
        <SectionHeader title="Key Contacts" />
        <KeyContactsTable contacts={keyContacts} onChange={setKeyContacts} readOnly={readOnly} />
      </div>

      {/* Kickoff Date */}
      <div>
        <SectionHeader title="Target Kickoff Date" />
        <input
          type="date"
          value={kickoffDate}
          onChange={(e) => setKickoffDate(e.target.value)}
          readOnly={readOnly}
          style={{
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: readOnly ? 'var(--color-bg-tertiary)' : 'var(--color-bg-primary)',
            color: 'var(--color-text-primary)',
            fontSize: 'var(--font-size-sm)',
          }}
        />
      </div>

      {/* Special Instructions */}
      <div>
        <SectionHeader title="Special Instructions" />
        <textarea
          value={specialInstructions}
          onChange={(e) => setSpecialInstructions(e.target.value)}
          placeholder="Any delivery-specific requirements or considerations…"
          rows={3}
          readOnly={readOnly}
          style={textareaStyle}
        />
      </div>

      {/* Notes */}
      <div>
        <SectionHeader title="Additional Notes" />
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional context for the delivery team…"
          rows={2}
          readOnly={readOnly}
          style={textareaStyle}
        />
      </div>

      {/* Auto-included data */}
      <AutoIncludedSummary sowData={sowData} existingPackage={existingPackage} />

      {/* Save button + dirty indicator */}
      {!readOnly && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            alignSelf: 'flex-start',
          }}
        >
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !hasChanges}
            style={{ opacity: saving || !hasChanges ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Save Handoff Package'}
          </button>
          {hasChanges && !saving && (
            <span className="text-xs" style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
              ● Unsaved changes
            </span>
          )}
        </div>
      )}

      <UnsavedChangesModal
        open={showUnsavedModal}
        onStay={cancelUnsavedLeave}
        onLeave={confirmUnsavedLeave}
      />
      <RestoreDraftModal
        open={pendingDraft !== null}
        savedAt={pendingDraft?.savedAt ?? null}
        onRestore={handleRestoreDraft}
        onDiscard={handleDiscardDraft}
      />
    </div>
  );
}
