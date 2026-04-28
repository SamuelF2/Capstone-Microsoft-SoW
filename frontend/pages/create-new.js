import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import useUnsavedChangesWarning from '../lib/hooks/useUnsavedChangesWarning';
import useDraftAutosave from '../lib/hooks/useDraftAutosave';
import WorkflowTemplateSelector from '../components/WorkflowTemplateSelector';
import UnsavedChangesModal from '../components/UnsavedChangesModal';
import RestoreDraftModal from '../components/RestoreDraftModal';

const INITIAL_FORM = {
  sowTitle: '',
  opportunityId: '',
  workOrderNumber: '',
  dealValue: '',
  estimatedMargin: '',
  customerName: '',
  customerLegalName: '',
  deliveryMethodology: '',
  cycle: '1',
};

function formSignature(form) {
  return JSON.stringify({
    sowTitle: form.sowTitle || '',
    opportunityId: form.opportunityId || '',
    workOrderNumber: form.workOrderNumber || '',
    dealValue: form.dealValue || '',
    estimatedMargin: form.estimatedMargin || '',
    customerName: form.customerName || '',
    customerLegalName: form.customerLegalName || '',
    deliveryMethodology: form.deliveryMethodology || '',
    cycle: form.cycle || '1',
  });
}

// Subset we're willing to write to localStorage. Pricing (dealValue,
// estimatedMargin) and customer identity (customerName, customerLegalName)
// are deliberately excluded — they're either regulated-adjacent (deal
// economics) or PII (legal entity names) and don't belong in a store that
// any page-level JS can read. The user just retypes them on restore; the
// high-value protection is not losing the title / opportunity id / chosen
// methodology after a crash.
function draftFromForm(form) {
  return {
    sowTitle: form.sowTitle || '',
    opportunityId: form.opportunityId || '',
    workOrderNumber: form.workOrderNumber || '',
    deliveryMethodology: form.deliveryMethodology || '',
    cycle: form.cycle || '1',
  };
}

const INITIAL_FORM_SIG = formSignature(INITIAL_FORM);
const INITIAL_DRAFT_SIG = JSON.stringify(draftFromForm(INITIAL_FORM));

function FieldError({ message }) {
  if (!message) return null;
  return (
    <motion.p
      className="form-error"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      style={{ overflow: 'hidden' }}
    >
      {message}
    </motion.p>
  );
}

export default function CreateNew() {
  const router = useRouter();
  const { user, authFetch } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [touched, setTouched] = useState({});

  // Content template selection
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null); // null = scratch
  const [previewTemplate, setPreviewTemplate] = useState(null); // template being previewed
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Workflow template selection
  const [selectedWorkflowTemplateId, setSelectedWorkflowTemplateId] = useState(null);

  //Group Collaborators
  const [addMyGroup, setAddMyGroup] = useState(false);
  const [userGroups, setUserGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupsLoading, setGroupsLoading] = useState(false);

  // ── Unsaved-changes guard + draft autosave ─────────────────────────────
  // Dirty when any text field diverges from the initial blank form. Template
  // selections are deliberately NOT tracked — they're a one-click choice and
  // the methodology-fetch effect would clobber a restored selectedTemplateId
  // anyway. Suppressed while submitting so the post-create redirect goes
  // through cleanly.
  const hasChanges = useMemo(
    () => !isSubmitting && formSignature(form) !== INITIAL_FORM_SIG,
    [form, isSubmitting]
  );

  const {
    showModal: showUnsavedModal,
    confirmLeave: confirmUnsavedLeave,
    cancelLeave: cancelUnsavedLeave,
  } = useUnsavedChangesWarning(hasChanges);

  // Stable reference so the autosave hook's effect only re-runs when the
  // persisted subset actually changes (not when dealValue etc. are edited).
  const draftData = useMemo(() => draftFromForm(form), [form]);

  const { loadDraft, clearDraft } = useDraftAutosave({
    key: 'sow:new',
    data: draftData,
    enabled: hasChanges,
  });

  const draftCheckedRef = useRef(false);
  const [pendingDraft, setPendingDraft] = useState(null);
  useEffect(() => {
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    const draft = loadDraft();
    if (!draft) return;
    const draftSig = JSON.stringify(draft.data || {});
    if (draftSig && draftSig !== INITIAL_DRAFT_SIG) {
      setPendingDraft(draft);
    } else {
      clearDraft();
    }
  }, [loadDraft, clearDraft]);

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft?.data) return;
    // Merge restored fields over INITIAL_FORM so any missing keys stay blank.
    setForm({ ...INITIAL_FORM, ...pendingDraft.data });
    setPendingDraft(null);
  }, [pendingDraft]);

  const handleDiscardDraft = useCallback(() => {
    setPendingDraft(null);
    clearDraft();
  }, [clearDraft]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleBlur = (e) => {
    setTouched({ ...touched, [e.target.name]: true });
  };

  const fieldError = (name) => {
    if (!touched[name]) return null;
    if (!form[name] || !form[name].trim()) return 'This field is required';
    return null;
  };

  // Fetch templates when methodology changes
  useEffect(() => {
    if (!form.deliveryMethodology) {
      setTemplates([]);
      setSelectedTemplateId(null);
      return undefined;
    }
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setTemplatesLoading(true);
    authFetch(`/api/sow/templates?methodology=${encodeURIComponent(form.deliveryMethodology)}`, {
      signal,
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (signal.aborted) return;
        setTemplates(data);
        setSelectedTemplateId(null); // reset selection on methodology change
      })
      .catch((e) => {
        if (e?.name === 'AbortError' || signal.aborted) return;
        setTemplates([]);
      })
      .finally(() => {
        if (!signal.aborted) setTemplatesLoading(false);
      });
    return () => ctrl.abort();
  }, [form.deliveryMethodology, authFetch]);

  const handlePreview = async (template) => {
    setPreviewTemplate(template);
    setPreviewData(null);
    setPreviewLoading(true);
    try {
      const params = new URLSearchParams();
      if (form.customerName) params.set('customer_name', form.customerName);
      if (form.opportunityId) params.set('opportunity_id', form.opportunityId);
      if (form.sowTitle) params.set('project_name', form.sowTitle);
      const res = await authFetch(`/api/sow/templates/${template.id}/preview?${params}`);
      if (res.ok) setPreviewData(await res.json());
    } catch {
      // preview is optional — silently fail
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // POST to backend — backend generates the canonical integer ID
      const res = await authFetch('/api/sow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.sowTitle,
          cycle: parseInt(form.cycle, 10) || 1,
          methodology: form.deliveryMethodology,
          customer_name: form.customerName,
          opportunity_id: form.opportunityId,
          deal_value: form.dealValue ? parseFloat(form.dealValue) : null,
          estimated_margin: form.estimatedMargin ? parseFloat(form.estimatedMargin) : null,
          content_template_id: selectedTemplateId || null,
          workflow_template_id: selectedWorkflowTemplateId || null,
          metadata: {
            workOrderNumber: form.workOrderNumber,
            customerLegalName: form.customerLegalName,
          },
        }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server error ${res.status}`);
      }

      const sow = await res.json();
      const id = sow.id; // integer PK from PostgreSQL

      // Add group collaborators if selected
      if (selectedGroupId || addMyGroup) {
        try {
          await authFetch(`/api/sow/${id}/collaborators/sync-group`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              group_id: selectedGroupId || null,
              use_creator_group: addMyGroup && !selectedGroupId,
            }),
          });
        } catch {
          // Non-fatal — SoW was created, group sync failed silently
          console.warn('Group collaborator sync failed — add members manually');
        }
      }

      // Cache the SoW record in localStorage for offline auto-save
      const sowRecord = {
        id,
        sowTitle: sow.title,
        opportunityId: sow.opportunity_id || form.opportunityId,
        workOrderNumber: form.workOrderNumber,
        dealValue: sow.deal_value ?? form.dealValue,
        estimatedMargin: form.estimatedMargin,
        customerName: sow.customer_name || form.customerName,
        customerLegalName: form.customerLegalName,
        deliveryMethodology: sow.methodology || form.deliveryMethodology,
        cycle: sow.cycle || parseInt(form.cycle, 10),
        contentId: sow.content_id,
        status: sow.status || 'draft',
        createdAt: sow.uploaded_at || new Date().toISOString(),
        updatedAt: sow.updated_at || new Date().toISOString(),
      };

      localStorage.setItem(`sow-${id}`, JSON.stringify(sowRecord));

      // Registry of all known backend IDs (integers)
      const registry = JSON.parse(localStorage.getItem('sow-registry') || '[]');
      if (!registry.includes(id)) {
        registry.unshift(id);
        localStorage.setItem('sow-registry', JSON.stringify(registry));
      }

      clearDraft();
      router.push(`/draft/${id}`);
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const isValid =
    form.sowTitle && form.opportunityId && form.customerName && form.deliveryMethodology;

  const methodologies = ['Agile Sprint Delivery', 'Sure Step 365', 'Waterfall', 'Cloud Adoption'];

  useEffect(() => {
    if (!user) return;
    // Attempt to read groups from the Entra token via /api/users/me/groups
    // This will return [] if the App Registration hasn't enabled the groups claim
    setGroupsLoading(true);
    authFetch('/api/users/me/groups')
      .then((res) => res.ok ? res.json() : { groups: [] })
      .then((data) => setUserGroups(data.groups || []))
      .catch(() => setUserGroups([]))
      .finally(() => setGroupsLoading(false));
  }, [user, authFetch]);

  return (
    <>
      <Head>
        <title>Create New SoW – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">Create New SoW</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Fill in the details below to generate a new Statement of Work template.
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <strong>Could not create SoW:</strong> {error}
            </div>
          )}

          {/* Form Card */}
          <form onSubmit={handleSubmit}>
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <h2
                className="text-xl font-semibold mb-xl"
                style={{
                  paddingBottom: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                SoW Details
              </h2>

              {/* Row 1: SoW Title (full width) */}
              <div className="form-group">
                <label className="form-label">
                  SoW Title <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="text"
                  name="sowTitle"
                  value={form.sowTitle}
                  onChange={handleChange}
                  onBlur={handleBlur}
                  placeholder="e.g. Contoso Cloud Migration Phase 1"
                  className="form-input"
                  required
                  style={fieldError('sowTitle') ? { borderColor: 'var(--color-error)' } : {}}
                />
                <AnimatePresence>
                  <FieldError message={fieldError('sowTitle')} />
                </AnimatePresence>
              </div>

              {/* Row 2: Opportunity ID + Work Order Number */}
              <div
                className="form-grid-responsive"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Opportunity ID <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="opportunityId"
                    value={form.opportunityId}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="e.g. OPP-20240001"
                    className="form-input"
                    required
                    style={fieldError('opportunityId') ? { borderColor: 'var(--color-error)' } : {}}
                  />
                  <AnimatePresence>
                    <FieldError message={fieldError('opportunityId')} />
                  </AnimatePresence>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Work Order Number</label>
                  <input
                    type="text"
                    name="workOrderNumber"
                    value={form.workOrderNumber}
                    onChange={handleChange}
                    placeholder="e.g. WO-88421"
                    className="form-input"
                  />
                </div>
              </div>

              {/* Row 3: Deal Value + Estimated Margin */}
              <div
                className="form-grid-responsive"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deal Value (USD)</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      name="dealValue"
                      value={form.dealValue}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="form-input"
                      style={{ paddingLeft: '1.75rem' }}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estimated Margin (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      name="estimatedMargin"
                      value={form.estimatedMargin}
                      onChange={handleChange}
                      placeholder="0"
                      className="form-input"
                      style={{ paddingRight: '2.5rem' }}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 4: Customer Name + Customer Legal Name */}
              <div
                className="form-grid-responsive"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Customer Name <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={form.customerName}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    placeholder="e.g. Contoso"
                    className="form-input"
                    required
                    style={fieldError('customerName') ? { borderColor: 'var(--color-error)' } : {}}
                  />
                  <AnimatePresence>
                    <FieldError message={fieldError('customerName')} />
                  </AnimatePresence>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Customer Legal Name</label>
                  <input
                    type="text"
                    name="customerLegalName"
                    value={form.customerLegalName}
                    onChange={handleChange}
                    placeholder="e.g. Contoso Ltd."
                    className="form-input"
                  />
                </div>
              </div>

              {/* Row 5: Delivery Methodology + Deal Cycle */}
              <div
                className="form-grid-responsive"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 0,
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Delivery Methodology <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select
                    name="deliveryMethodology"
                    value={form.deliveryMethodology}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="form-select"
                    required
                    style={
                      fieldError('deliveryMethodology') ? { borderColor: 'var(--color-error)' } : {}
                    }
                  >
                    <option value="">Select a methodology…</option>
                    {methodologies.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                  <AnimatePresence>
                    <FieldError message={fieldError('deliveryMethodology')} />
                  </AnimatePresence>
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Deal Cycle
                    <span
                      className="text-tertiary"
                      style={{ marginLeft: 'var(--spacing-xs)', fontWeight: 'normal' }}
                    >
                      (1–4)
                    </span>
                  </label>
                  <select
                    name="cycle"
                    value={form.cycle}
                    onChange={handleChange}
                    className="form-select"
                  >
                    <option value="1">Cycle 1</option>
                    <option value="2">Cycle 2</option>
                    <option value="3">Cycle 3</option>
                    <option value="4">Cycle 4</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Template selection — shown when a methodology is chosen */}
            {form.deliveryMethodology && (
              <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
                <h2
                  className="text-xl font-semibold mb-xl"
                  style={{
                    paddingBottom: 'var(--spacing-md)',
                    borderBottom: '1px solid var(--color-border-default)',
                  }}
                >
                  Starter Content
                </h2>
                <p className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                  Optionally choose a pre-populated template for{' '}
                  <strong>{form.deliveryMethodology}</strong>. You can edit every section after
                  creation.
                </p>

                {templatesLoading ? (
                  <p className="text-sm text-secondary">Loading templates…</p>
                ) : (
                  <div
                    style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}
                  >
                    {/* Start from scratch option */}
                    <div
                      onClick={() => setSelectedTemplateId(null)}
                      style={{
                        padding: 'var(--spacing-md)',
                        border: `2px solid ${selectedTemplateId === null ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-border-default)'}`,
                        borderRadius: 'var(--radius-lg)',
                        cursor: 'pointer',
                        backgroundColor:
                          selectedTemplateId === null
                            ? 'rgba(124,58,237,0.05)'
                            : 'var(--color-bg-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)',
                      }}
                    >
                      <span style={{ fontSize: '1.5rem' }}>✏️</span>
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontWeight: 'var(--font-weight-semibold)',
                            fontSize: 'var(--font-size-sm)',
                          }}
                        >
                          Start from scratch
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-secondary)',
                          }}
                        >
                          All sections begin empty — fill in your own content
                        </p>
                      </div>
                      {selectedTemplateId === null && (
                        <span
                          style={{
                            marginLeft: 'auto',
                            color: 'var(--color-accent-purple, #7c3aed)',
                            fontWeight: 700,
                          }}
                        >
                          ✓
                        </span>
                      )}
                    </div>

                    {/* Template cards */}
                    {templates.map((tmpl) => (
                      <div
                        key={tmpl.id}
                        style={{
                          padding: 'var(--spacing-md)',
                          border: `2px solid ${selectedTemplateId === tmpl.id ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-border-default)'}`,
                          borderRadius: 'var(--radius-lg)',
                          cursor: 'pointer',
                          backgroundColor:
                            selectedTemplateId === tmpl.id
                              ? 'rgba(124,58,237,0.05)'
                              : 'var(--color-bg-primary)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 'var(--spacing-md)',
                        }}
                        onClick={() => setSelectedTemplateId(tmpl.id)}
                      >
                        <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>📄</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p
                            style={{
                              margin: 0,
                              fontWeight: 'var(--font-weight-semibold)',
                              fontSize: 'var(--font-size-sm)',
                            }}
                          >
                            {tmpl.name}
                          </p>
                          {tmpl.description && (
                            <p
                              style={{
                                margin: '2px 0 0',
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-secondary)',
                              }}
                            >
                              {tmpl.description}
                            </p>
                          )}
                        </div>
                        <div
                          style={{
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: '11px', padding: '3px 10px' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePreview(tmpl);
                            }}
                          >
                            Preview
                          </button>
                          {selectedTemplateId === tmpl.id && (
                            <span
                              style={{
                                color: 'var(--color-accent-purple, #7c3aed)',
                                fontWeight: 700,
                              }}
                            >
                              ✓
                            </span>
                          )}
                        </div>
                      </div>
                    ))}

                    {templates.length === 0 && (
                      <p className="text-sm text-secondary">
                        No templates available for this methodology yet.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Workflow template selection — always shown */}
            <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
              <h2
                className="text-xl font-semibold mb-xl"
                style={{
                  paddingBottom: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                Review Workflow
              </h2>
              <p className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                Choose the review workflow for this SoW. The default ESAP workflow is recommended
                for most deals.
              </p>
              <WorkflowTemplateSelector
                selectedTemplateId={selectedWorkflowTemplateId}
                onSelect={setSelectedWorkflowTemplateId}
                authFetch={authFetch}
              />
            </div>

            {/* Group collaborators section */}
            <div className="card" style={{ marginTop: 'var(--spacing-lg)' }}>
              <h2
                className="text-xl font-semibold mb-xl"
                style={{
                  paddingBottom: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                Team Access
              </h2>
              <p className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-md)' }}>
                Optionally add collaborators from your organization. Added members will have
                read-only access to this SoW.
              </p>

              {userGroups.length > 0 ? (
                // Entra groups are available — show a picker
                <div>
                  <label className="form-label">Select a group to add as viewers</label>
                  <select
                    className="form-select"
                    value={selectedGroupId || ''}
                    onChange={(e) => setSelectedGroupId(e.target.value || null)}
                    style={{ maxWidth: '400px' }}
                  >
                    <option value="">No group — add individually later</option>
                    {userGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.displayName}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-tertiary" style={{ marginTop: 4 }}>
                    All members of the selected group will be added as viewers.
                  </p>
                </div>
              ) : (
                // Groups claim not configured — show checkbox fallback
                <div>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 'var(--spacing-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={addMyGroup}
                      onChange={(e) => setAddMyGroup(e.target.checked)}
                      disabled={true}
                      style={{ marginTop: 3, accentColor: 'var(--color-accent-blue)', opacity: 0.5 }}
                    />
                    <div>
                      <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Add my Entra ID group members as viewers
                      </span>
                      <p className="text-xs text-tertiary" style={{ margin: '2px 0 0' }}>
                        Group sync is not yet available — collaborators can be added manually
                        from the SoW manage page after creation.
                      </p>
                    </div>
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--spacing-lg)',
              }}
            >
              <p className="text-sm text-secondary">
                <span style={{ color: 'var(--color-error)' }}>*</span> Required fields
                {selectedTemplateId && (
                  <span
                    style={{
                      marginLeft: 'var(--spacing-md)',
                      color: 'var(--color-accent-purple, #7c3aed)',
                    }}
                  >
                    · Template selected
                  </span>
                )}
              </p>
              <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => router.back()}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isValid || isSubmitting}
                  style={{ opacity: !isValid || isSubmitting ? 0.6 : 1 }}
                >
                  {isSubmitting ? 'Creating…' : 'Create SoW'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Template preview modal */}
      {previewTemplate && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--spacing-xl)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewTemplate(null);
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--color-bg-primary)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--color-border-default)',
              padding: 'var(--spacing-xl)',
              maxWidth: '640px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-md)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                {previewTemplate.name}
              </h3>
              <button className="btn btn-secondary btn-sm" onClick={() => setPreviewTemplate(null)}>
                Close
              </button>
            </div>
            {previewTemplate.description && (
              <p
                style={{
                  margin: 0,
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {previewTemplate.description}
              </p>
            )}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-default)',
                backgroundColor: 'var(--color-bg-secondary)',
                padding: 'var(--spacing-md)',
              }}
            >
              {previewLoading ? (
                <p className="text-sm text-secondary">Loading preview…</p>
              ) : previewData ? (
                <div
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {JSON.stringify(previewData, null, 2)}
                </div>
              ) : (
                <p className="text-sm text-secondary">Preview unavailable.</p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setSelectedTemplateId(previewTemplate.id);
                  setPreviewTemplate(null);
                }}
              >
                Use This Template
              </button>
            </div>
          </div>
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
    </>
  );
}
