import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';
import AttachmentManager from '../../components/AttachmentManager';
import WorkflowProgress from '../../components/WorkflowProgress';
import WorkflowReadOnlySummary from '../../components/sow/WorkflowReadOnlySummary';
import ReviewerAssignmentPanel from '../../components/sow/ReviewerAssignmentPanel';
import MicrosoftWorkflowFlags from '../../components/sow/MicrosoftWorkflowFlags';
import ActivityLog from '../../components/ActivityLog';
import ContextSidebar from '../../components/ai-context/ContextSidebar';
import AssistChat from '../../components/ai-assist/AssistChat';
import SectionImproveModal from '../../components/ai-assist/SectionImproveModal';
import SidebarConnector from '../../components/ai-assist/SidebarConnector';
import { getTabConfig } from '../../lib/draftTabs';
import { STAGE_KEYS } from '../../lib/workflowStages';
import {
  hydrateIds,
  getSubSectionLabel,
  getSubSectionFieldKey,
  extractSubSectionText,
} from '../../lib/sectionSchemas';
import { BannedPhrasesProvider } from '../../contexts/BannedPhrasesContext';

// Map a tab key (from draftTabs registry) to the sowData fields the AI
// context sidebar should query against. Falls back to the tab key itself.
const TAB_KEY_TO_SOW_FIELDS = {
  overview: ['executiveSummary'],
  scope: ['projectScope', 'cloudAdoptionScope'],
  approach: ['agileApproach', 'productBacklog'],
  deliverables: ['deliverables', 'phasesDeliverables'],
  phases: ['phasesDeliverables'],
  backlog: ['productBacklog'],
  team: ['teamStructure'],
  pricing: ['pricing'],
  assumptions: ['assumptionsRisks'],
  'assumptions-risks': ['assumptionsRisks'],
  support: ['supportTransition'],
  'support-transition': ['supportTransition'],
  migration: ['migrationStrategy', 'workloadAssessment'],
};

/**
 * Extract human-readable text from a structured section value.
 * Avoids JSON.stringify, which produces garbage for objects and confuses
 * the AI prompt / "Original" panel in the improve modal.
 */
function sectionToText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;

  // executiveSummary: { content: "..." }
  if (typeof value.content === 'string') return value.content;

  const lines = [];

  // projectScope / cloudAdoptionScope: { inScope: [{text}], outOfScope: [{text}] }
  if (Array.isArray(value.inScope) || Array.isArray(value.outOfScope)) {
    if (value.inScope?.length) {
      lines.push('In Scope:');
      value.inScope.forEach((item) => lines.push(`- ${item.text || ''}`));
    }
    if (value.outOfScope?.length) {
      lines.push('Out of Scope:');
      value.outOfScope.forEach((item) => lines.push(`- ${item.text || ''}`));
    }
    return lines.join('\n');
  }

  // deliverables: [{ name, description, acceptanceCriteria, ... }]
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item;
        const parts = [];
        if (item.name) parts.push(item.name);
        if (item.description) parts.push(item.description);
        if (item.acceptanceCriteria) parts.push(`Acceptance: ${item.acceptanceCriteria}`);
        if (item.text) parts.push(item.text);
        return parts.join('\n') || JSON.stringify(item);
      })
      .join('\n\n');
  }

  // teamStructure: { members: [...], supportTransitionPlan: "..." }
  if (Array.isArray(value.members)) {
    value.members.forEach((m) => {
      lines.push(
        `${m.role || 'Role'}: ${m.assignedPerson || 'TBD'} (${m.onshore || 0} onshore, ${m.offshore || 0} offshore)`
      );
    });
    if (value.supportTransitionPlan)
      lines.push(`\nSupport Transition Plan:\n${value.supportTransitionPlan}`);
    return lines.join('\n');
  }

  // assumptionsRisks: { assumptions: [...], customerResponsibilities: [...], risks: [...] }
  if (Array.isArray(value.assumptions) || Array.isArray(value.risks)) {
    if (value.assumptions?.length) {
      lines.push('Assumptions:');
      value.assumptions.forEach((a) =>
        lines.push(`- [${a.label || 'Assumption'}] ${a.text || ''}`)
      );
    }
    if (value.customerResponsibilities?.length) {
      lines.push('Customer Responsibilities:');
      value.customerResponsibilities.forEach((r) => lines.push(`- ${r.text || ''}`));
    }
    if (value.risks?.length) {
      lines.push('Risks:');
      value.risks.forEach((r) =>
        lines.push(
          `- [${r.severity || 'Medium'}] ${r.description || ''}${r.mitigation ? ` — Mitigation: ${r.mitigation}` : ''}`
        )
      );
    }
    return lines.join('\n');
  }

  // Fallback: walk string properties (avoids numeric-key garbage from corrupted objects)
  const textFields = Object.entries(value)
    .filter(([k, v]) => typeof v === 'string' && !/^\d+$/.test(k))
    .map(([, v]) => v);
  return textFields.join('\n\n') || JSON.stringify(value);
}

function extractFocusedText(sowData, tabKey) {
  if (!sowData || !tabKey) return '';
  const fields = TAB_KEY_TO_SOW_FIELDS[tabKey] || [tabKey];
  const parts = [];
  for (const f of fields) {
    const v = sowData[f];
    if (!v) continue;
    parts.push(sectionToText(v));
  }
  return parts.join('\n\n');
}

// ─── Methodology badge colours ────────────────────────────────────────────────

const METHODOLOGY_BADGE = {
  'Agile Sprint Delivery': { bg: '#1e3a5f', color: '#60a5fa' },
  'Sure Step 365': { bg: '#1e3a2e', color: '#4ade80' },
  Waterfall: { bg: '#2d2014', color: '#fbbf24' },
  'Cloud Adoption': { bg: '#2d1b4e', color: '#c084fc' },
};

// ─── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ savedAt }) {
  if (!savedAt) return null;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <motion.span
      key={savedAt}
      initial={{ opacity: 0.5, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="text-xs text-secondary"
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
      <span style={{ color: 'var(--color-success)' }}>●</span> Saved {time}
    </motion.span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const router = useRouter();
  const { id } = router.query;
  const { authFetch } = useAuth();

  const [sowData, setSowData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  // Microsoft workflow: full SoW metadata (so PATCHes can preserve sibling
  // keys) and a flag indicating the SoW is using the Microsoft template.
  const [sowMetadata, setSowMetadata] = useState(null);
  const [isMicrosoftWorkflow, setIsMicrosoftWorkflow] = useState(false);
  const [sowPermissions, setSowPermissions] = useState([]);
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  // Persistence: load from backend on mount, debounced auto-save on edit.
  // The previous implementation used localStorage as the primary store,
  // which silently lost changes on browser switch / tab refresh and made
  // multi-user editing impossible.  Now we go straight to /api/sow/{id}.
  //
  // - lastServerContentRef holds the JSON string of the last content
  //   value the server is known to hold; the auto-save effect short-
  //   circuits when sowData matches it (avoiding the load → save echo).
  // - debounceTimerRef holds the in-flight debounce so handleSubmitForReview
  //   can cancel it before its own PATCH to prevent a save race.
  const lastServerContentRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const gridRef = useRef(null);
  const sidebarRef = useRef(null);

  // Hydrate a server SoW response into the shape sowData expects: the
  // backend keeps methodology, title, customer, etc. in their own SoW
  // columns (not inside content JSONB), so we mirror them onto
  // top-level keys the tabs and readiness checks already read from. Used
  // by both initial load and the AI-extraction apply callback so a
  // re-hydrate after auto-fill keeps every derived field consistent.
  const hydrateContentFromServer = useCallback((data, prev = null) => {
    const content = { ...(data.content || {}) };
    if (!content.deliveryMethodology && data.methodology) {
      content.deliveryMethodology = data.methodology;
    }
    if (!content.sowTitle && data.title) content.sowTitle = data.title;
    if (!content.customerName && data.customer_name) content.customerName = data.customer_name;
    if (!content.opportunityId && data.opportunity_id) content.opportunityId = data.opportunity_id;
    if (content.dealValue == null && data.deal_value != null) content.dealValue = data.deal_value;
    if (!content.status && data.status) content.status = data.status;
    // Preserve any locally-derived keys the server doesn't echo back
    // (e.g. UI-only flags). The server's content fields take precedence
    // because the apply-extraction call just wrote them, but anything
    // exclusive to the previous in-memory copy survives.
    if (prev) {
      for (const k of Object.keys(prev)) {
        if (content[k] === undefined) content[k] = prev[k];
      }
    }
    return content;
  }, []);

  // Load SoW from backend
  useEffect(() => {
    if (!id || !authFetch) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/sow/${id}`);
        if (cancelled) return;
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          // Treat any non-OK as not-found for UI purposes; log so a
          // developer can distinguish a network error from a 404.
          console.warn(`Failed to load SoW ${id}: ${res.status}`);
          setNotFound(true);
          return;
        }
        const data = await res.json();
        const content = hydrateContentFromServer(data);
        // Snapshot the loaded content so the auto-save effect can detect
        // that the next sowData change came from the server (not the user)
        // and skip the redundant PATCH-back.
        lastServerContentRef.current = JSON.stringify(content);
        setSowData(content);
        // Capture full metadata so MicrosoftWorkflowFlags edits can PATCH
        // back without dropping sibling keys (workOrderNumber etc.).
        setSowMetadata(data.metadata || {});
        authFetch(`/api/sow/${id}/my-permissions`)
          .then((res) => (res.ok ? res.json() : { permissions: [] }))
          .then((data) => setSowPermissions(data.permissions || []))
          .catch(() => setSowPermissions([]))
          .finally(() => setPermissionsLoading(false));
        if (data.updated_at) setSavedAt(data.updated_at);
      } catch (err) {
        if (!cancelled) {
          console.warn('Failed to load SoW:', err);
          setNotFound(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authFetch, hydrateContentFromServer]);

  // Apply an AI-extraction result returned by AttachmentManager. The
  // server has already written the new content, so we update local
  // state in lockstep and prime ``lastServerContentRef`` with the same
  // serialized snapshot — without that, the auto-save effect would
  // immediately PATCH the new content back as if the user had typed it.
  const handleContentExtracted = useCallback(
    (updatedSow) => {
      if (!updatedSow) return;
      const merged = hydrateContentFromServer(updatedSow, sowData);
      lastServerContentRef.current = JSON.stringify(merged);
      setSowData(merged);
      if (updatedSow.metadata) setSowMetadata(updatedSow.metadata || {});
      if (updatedSow.updated_at) setSavedAt(updatedSow.updated_at);
    },
    [hydrateContentFromServer, sowData]
  );

  // Debounced auto-save: 750ms after the last edit, PATCH the SoW content
  // to /api/sow/{id}.  Skips when the current state already matches the
  // last value the server is known to hold (covers the load → set echo
  // and any redundant re-renders that don't actually change content).
  useEffect(() => {
    if (!sowData || !id || !authFetch) return;
    if (!canWrite) return;
    const serialized = JSON.stringify(sowData);
    if (serialized === lastServerContentRef.current) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      try {
        const res = await authFetch(`/api/sow/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: sowData }),
        });
        if (res.ok) {
          lastServerContentRef.current = serialized;
          setSavedAt(new Date().toISOString());
        }
      } catch {
        // Silent fail — the user can re-trigger by editing again.
      }
    }, 750);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [sowData, id, authFetch, canWrite]);

  // Detect whether this SoW uses the Microsoft Default Workflow by inspecting
  // its workflow snapshot for the gateway stage_key. Structural — survives
  // template renames as long as the seed keeps the gateway key.
  useEffect(() => {
    if (!id || !authFetch) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch(`/api/workflow/sow/${id}`);
        if (!res.ok || cancelled) return;
        const wf = await res.json();
        const stages = wf?.workflow_data?.stages || [];
        const isMs = stages.some((s) => s.stage_key === 'microsoft_parallel_branches');
        if (!cancelled) setIsMicrosoftWorkflow(isMs);
      } catch {
        // Snapshot fetch failure is non-fatal — flags section just won't render.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, authFetch]);

  // Update microsoft_workflow flags by PATCHing /api/sow/{id} with the
  // merged metadata. Other metadata keys (workOrderNumber, customerLegalName)
  // are preserved by spreading the prior metadata first.
  const updateMicrosoftWorkflowFlags = useCallback(
    async (next) => {
      if (!id || !authFetch) return;
      const merged = { ...(sowMetadata || {}), microsoft_workflow: next };
      setSowMetadata(merged);
      try {
        const res = await authFetch(`/api/sow/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: merged }),
        });
        if (res.ok) setSavedAt(new Date().toISOString());
      } catch {
        // Silent fail — author can re-edit to retry.
      }
    },
    [id, authFetch, sowMetadata]
  );

  // Update a top-level section of the SoW data
  const updateSection = (section, value) => {
    setSowData((prev) => ({ ...prev, [section]: value }));
  };

  const [showConfirm, setShowConfirm] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [improveModalOpen, setImproveModalOpen] = useState(false);
  const [improveBtnHover, setImproveBtnHover] = useState(false);
  const [bannedPhrases, setBannedPhrases] = useState([]);
  const [focusedSubSection, setFocusedSubSection] = useState(null);

  // Track which sub-section the user last interacted with via focus/click.
  // Reads the closest data-subsection attribute from the event target.
  const handleContentFocus = useCallback((e) => {
    const el = e.target.closest?.('[data-subsection]');
    if (el) setFocusedSubSection(el.getAttribute('data-subsection'));
  }, []);

  // Replace a banned phrase in the focused section's text fields.
  const handleFixPhrase = (phrase, suggestion) => {
    if (!phrase || suggestion == null) return;
    const fields = TAB_KEY_TO_SOW_FIELDS[activeTabConfig?.key] || [];
    if (fields.length === 0) return;
    const fieldKey = fields[0];
    const current = sowData?.[fieldKey];
    if (current == null) return;

    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const replaceInStr = (s) => (typeof s === 'string' ? s.replace(re, suggestion) : s);

    if (typeof current === 'string') {
      updateSection(fieldKey, replaceInStr(current));
    } else if (typeof current === 'object' && !Array.isArray(current)) {
      const updated = { ...current };
      // Walk known text fields in structured sections
      for (const key of Object.keys(updated)) {
        const val = updated[key];
        if (typeof val === 'string') {
          updated[key] = replaceInStr(val);
        } else if (Array.isArray(val)) {
          updated[key] = val.map((item) => {
            if (typeof item === 'string') return replaceInStr(item);
            if (typeof item === 'object' && item !== null) {
              const patched = { ...item };
              for (const ik of Object.keys(patched)) {
                if (typeof patched[ik] === 'string') patched[ik] = replaceInStr(patched[ik]);
              }
              return patched;
            }
            return item;
          });
        }
      }
      updateSection(fieldKey, updated);
    } else if (Array.isArray(current)) {
      updateSection(
        fieldKey,
        current.map((item) => {
          if (typeof item === 'string') return replaceInStr(item);
          if (typeof item === 'object' && item !== null) {
            const patched = { ...item };
            for (const ik of Object.keys(patched)) {
              if (typeof patched[ik] === 'string') patched[ik] = replaceInStr(patched[ik]);
            }
            return patched;
          }
          return item;
        })
      );
    }
  };

  // ── Methodology-aware readiness checks ────────────────────────────────────
  const methodology = sowData?.deliveryMethodology;

  const hasExecutiveSummary = !!(
    sowData?.executiveSummary &&
    Object.keys(sowData.executiveSummary).some((k) => sowData.executiveSummary[k])
  );

  // Scope: Cloud Adoption uses cloudAdoptionScope, others use projectScope
  const scopeKey = methodology === 'Cloud Adoption' ? 'cloudAdoptionScope' : 'projectScope';
  const scopeLabel = methodology === 'Cloud Adoption' ? 'Cloud Adoption Scope' : 'Project Scope';
  const hasScope = !!(
    sowData?.[scopeKey] && Object.keys(sowData[scopeKey]).some((k) => sowData[scopeKey][k])
  );

  // Deliverables: Sure Step 365 uses phasesDeliverables, others use deliverables
  const deliverablesKey = methodology === 'Sure Step 365' ? 'phasesDeliverables' : 'deliverables';
  const deliverablesLabel =
    methodology === 'Sure Step 365'
      ? 'Phases & deliverables defined'
      : 'At least one deliverable added';
  const hasDeliverables = (() => {
    const val = sowData?.[deliverablesKey];
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    return Object.keys(val).some((k) => val[k]);
  })();

  const canWrite =
    !permissionsLoading && (sowPermissions.includes('*') || sowPermissions.includes('sow.write'));

  const canRead = !permissionsLoading && (canWrite || sowPermissions.includes('sow.read'));

  const allRequiredMet = hasExecutiveSummary && hasScope && hasDeliverables;

  // Submit the SoW for review.  The backend resolves the SoW's workflow to
  // figure out which stage actually follows draft (it isn't always
  // ai_review — custom workflows may skip the AI review entirely), so we
  // inspect the returned status here to decide where to send the user.
  // Routing to /ai-review for a SoW that's already past ai_review breaks
  // that page, so we only go there when the backend says we landed in
  // ai_review.
  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    // Cancel any in-flight auto-save debounce so it can't race with the
    // submit PATCH below (and a stale auto-save can't fire after the SoW
    // has already transitioned out of draft).
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    try {
      // First, auto-save current content to backend
      await authFetch(`/api/sow/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sowData }),
      });

      // Then submit for review
      const res = await authFetch(`/api/sow/${id}/submit-for-review`, {
        method: 'POST',
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server error ${res.status}`);
      }

      const updated = await res.json().catch(() => ({}));
      if (updated?.status === STAGE_KEYS.AI_REVIEW) {
        router.push(`/ai-review?sowId=${id}`);
      } else {
        // The workflow doesn't have an AI review immediately after draft —
        // the SoW is now sitting in whatever stage the workflow points at
        // (e.g. an internal review). Drop the author at the SoW management
        // page so they can see the new stage and any reviewer assignments.
        router.push(`/sow/${id}/manage`);
      }
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
      setShowConfirm(false);
    }
  };

  if (notFound) {
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
        <div style={{ textAlign: 'center' }}>
          <p className="text-2xl font-semibold mb-md">SoW not found</p>
          <p className="text-secondary mb-xl">This SoW doesn't exist or may have been removed.</p>
          <Link href="/all-sows" className="btn btn-primary">
            Back to All SoWs
          </Link>
        </div>
      </div>
    );
  }

  if (!sowData) {
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
        <Spinner message="Loading SoW…" />
      </div>
    );
  }

  if (permissionsLoading) {
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
        <Spinner message="Loading permissions…" />
      </div>
    );
  }

  if (!canRead) {
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
        <div
          className="card text-center"
          style={{ padding: 'var(--spacing-3xl)', maxWidth: '440px' }}
        >
          <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>🔒</div>
          <h3 className="text-xl font-semibold mb-sm">{sowData?.sowTitle || 'SoW'}</h3>
          <p className="text-secondary mb-sm">
            Status: <strong>{sowData?.status || 'draft'}</strong>
          </p>
          <p className="text-secondary mb-xl">
            You have been added as a collaborator but do not have permission to view this SoW's
            contents. Contact the SoW manager to request access.
          </p>
          <Link href="/all-sows" className="btn btn-primary">
            Back to All SoWs
          </Link>
        </div>
      </div>
    );
  }

  const tabs = getTabConfig(sowData.deliveryMethodology);
  const isLastTab = activeTab === tabs.length - 1;
  const badgeStyle = METHODOLOGY_BADGE[sowData.deliveryMethodology] ?? {
    bg: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };

  const activeTabConfig = tabs[activeTab] || null;
  const focusedSectionText = extractFocusedText(sowData, activeTabConfig?.key);

  return (
    <>
      <Head>
        <title>{sowData.sowTitle || 'Untitled SoW'} – Draft – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {/* Page header */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-lg) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <Link
                href="/all-sows"
                style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              >
                All SoWs
              </Link>
              <span>›</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {sowData.sowTitle || 'Untitled SoW'}
              </span>
            </div>

            {/* Title row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-lg)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-xs)',
                    flexWrap: 'wrap',
                  }}
                >
                  <h1
                    className="text-2xl font-bold"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '600px',
                    }}
                  >
                    {sowData.sowTitle || 'Untitled SoW'}
                  </h1>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: badgeStyle.bg,
                      color: badgeStyle.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sowData.deliveryMethodology}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'rgba(251,191,36,0.12)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    ● Draft
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-xl)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    flexWrap: 'wrap',
                  }}
                >
                  {sowData.customerName && (
                    <span>
                      Customer:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.customerName}
                      </strong>
                    </span>
                  )}
                  {sowData.opportunityId && (
                    <span>
                      Opp ID:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.opportunityId}
                      </strong>
                    </span>
                  )}
                  {sowData.dealValue && (
                    <span>
                      Value:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        ${Number(sowData.dealValue).toLocaleString()}
                      </strong>
                    </span>
                  )}
                  <span
                    style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}
                  >
                    ID: {id}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  flexShrink: 0,
                }}
              >
                <SaveIndicator savedAt={savedAt} />
                {sowData.status && sowData.status !== 'draft' && (
                  <button
                    className="btn btn-secondary"
                    onClick={() => router.push(`/sow/${id}/manage`)}
                  >
                    Manage workflow
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => router.push('/all-sows')}>
                  All SoWs
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow progress */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: 'var(--spacing-md) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            <WorkflowProgress
              sowId={id}
              currentStage={sowData.status || 'draft'}
              reviewAssignments={[]}
            />
            <div style={{ marginTop: 'var(--spacing-sm)' }}>
              <WorkflowReadOnlySummary sowId={id} />
            </div>
            {isMicrosoftWorkflow && (
              <div style={{ marginTop: 'var(--spacing-md)' }}>
                <MicrosoftWorkflowFlags
                  data={sowMetadata?.microsoft_workflow}
                  onChange={updateMicrosoftWorkflowFlags}
                  readOnly={(sowData.status || 'draft') !== 'draft'}
                />
              </div>
            )}
            <div style={{ marginTop: 'var(--spacing-md)' }}>
              <ReviewerAssignmentPanel
                sowId={id}
                readOnly={(sowData.status || 'draft') !== 'draft'}
              />
              {sowData.status && sowData.status !== 'draft' && (
                <div
                  style={{
                    marginTop: 'var(--spacing-xs)',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontStyle: 'italic',
                  }}
                >
                  Live edits available on{' '}
                  <a
                    href={`/sow/${id}/manage`}
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(`/sow/${id}/manage`);
                    }}
                    style={{
                      color: 'var(--color-accent-blue)',
                      textDecoration: 'underline',
                    }}
                  >
                    /sow/{id}/manage
                  </a>
                  .
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: '0 var(--spacing-xl)',
            overflowX: 'auto',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto', display: 'flex' }}>
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(idx);
                  setFocusedSubSection(null);
                  setImproveModalOpen(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight:
                    activeTab === idx ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                  color:
                    activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)',
                  borderBottom:
                    activeTab === idx
                      ? '2px solid var(--color-accent-blue)'
                      : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--transition-base), border-color var(--transition-base)',
                  marginBottom: '-1px',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== idx) e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== idx)
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor:
                      activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-bg-tertiary)',
                    color: activeTab === idx ? '#fff' : 'var(--color-text-tertiary)',
                    fontSize: '11px',
                    fontWeight: 'var(--font-weight-bold)',
                    marginRight: 'var(--spacing-xs)',
                  }}
                >
                  {idx + 1}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content + AI context sidebar */}
        <div
          ref={gridRef}
          style={{
            position: 'relative',
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-2xl) var(--spacing-xl)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 320px',
            gap: 'var(--spacing-xl)',
            alignItems: 'start',
          }}
        >
          {/* SVG connector lines from subsection to sidebar */}
          <SidebarConnector
            containerRef={gridRef}
            sidebarRef={sidebarRef}
            focusedSubSection={focusedSubSection}
            visible={improveBtnHover && !improveModalOpen}
          />

          {/* Section editor — always visible */}
          <div
            style={{ minWidth: 0 }}
            onFocusCapture={handleContentFocus}
            onClickCapture={handleContentFocus}
          >
            {/* Sub-section highlight when hovering "Improve with AI" */}
            {improveBtnHover && focusedSubSection && (
              <style>{`
                [data-subsection="${focusedSubSection}"] {
                  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.35),
                              0 0 24px rgba(59, 130, 246, 0.12);
                  border-radius: var(--radius-lg);
                  transition: box-shadow 0.2s ease, background-color 0.2s ease;
                  background-color: rgba(59, 130, 246, 0.07);
                }
              `}</style>
            )}
            <BannedPhrasesProvider phrases={bannedPhrases} fixPhrase={handleFixPhrase}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  {tabs.length > 0 && tabs[activeTab] ? (
                    tabs[activeTab].render(sowData, canWrite ? updateSection : () => {}, !canWrite)
                  ) : (
                    <p className="text-secondary">No content configured for this methodology.</p>
                  )}
                </motion.div>
              </AnimatePresence>
            </BannedPhrasesProvider>
          </div>

          {/* Sidebar column */}
          <div
            ref={sidebarRef}
            style={{
              position: 'sticky',
              top: 'clamp(var(--spacing-md), calc(50vh - 300px), 30vh)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-md)',
            }}
          >
            <div style={{ maxHeight: '80vh', overflowY: 'auto' }}>
              <ContextSidebar
                authFetch={authFetch}
                sowId={id}
                focusedSectionText={focusedSectionText}
                focusedSectionLabel={activeTabConfig?.label}
                onBannedPhrasesChange={setBannedPhrases}
                onFixPhrase={handleFixPhrase}
              />
            </div>

            {/* Improve with AI button — below context sidebar */}
            {activeTabConfig && focusedSectionText?.trim() && !improveModalOpen && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setImproveModalOpen(true)}
                onMouseEnter={() => setImproveBtnHover(true)}
                onMouseLeave={() => setImproveBtnHover(false)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  fontSize: 'var(--font-size-sm)',
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  whiteSpace: 'normal',
                  wordBreak: 'break-word',
                  textAlign: 'center',
                }}
              >
                <span style={{ fontSize: '14px' }}>&#10024;</span>
                Improve{focusedSubSection ? ` ${getSubSectionLabel(focusedSubSection)}` : ''} with
                AI
              </button>
            )}
          </div>
        </div>

        {/* Centred "Improve with AI" modal */}
        <SectionImproveModal
          open={improveModalOpen}
          onClose={() => {
            setImproveModalOpen(false);
            setImproveBtnHover(false);
          }}
          onAccept={(value) => {
            const fieldKey = focusedSubSection
              ? getSubSectionFieldKey(focusedSubSection)
              : (TAB_KEY_TO_SOW_FIELDS[activeTabConfig?.key] || [])[0];
            if (!fieldKey) return;

            // When a sub-section is focused (e.g. "agileApproach:sprints"),
            // merge only the improved sub-field into the parent object instead
            // of replacing the entire parent — this preserves sibling fields.
            const subField = focusedSubSection ? focusedSubSection.split(':')[1] : null;

            if (typeof value === 'object' && value !== null) {
              const hydrated = hydrateIds(fieldKey, value);
              if (
                subField &&
                typeof hydrated === 'object' &&
                !Array.isArray(hydrated) &&
                subField in hydrated
              ) {
                setSowData((prev) => ({
                  ...prev,
                  [fieldKey]: { ...prev[fieldKey], [subField]: hydrated[subField] },
                }));
              } else {
                updateSection(fieldKey, hydrated);
              }
            } else if (subField) {
              // Plain text for a sub-section — merge into parent object
              setSowData((prev) => ({
                ...prev,
                [fieldKey]: { ...prev[fieldKey], [subField]: value },
              }));
            } else {
              updateSection(fieldKey, value);
            }
          }}
          authFetch={authFetch}
          sowId={id}
          sectionLabel={
            (focusedSubSection && getSubSectionLabel(focusedSubSection)) || activeTabConfig?.label
          }
          originalText={
            focusedSubSection
              ? extractSubSectionText(focusedSubSection, sowData)
              : focusedSectionText
          }
          sectionKey={
            focusedSubSection
              ? getSubSectionFieldKey(focusedSubSection)
              : (TAB_KEY_TO_SOW_FIELDS[activeTabConfig?.key] || [])[0]
          }
        />

        {/* Bottom navigation */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-sm)',
          }}
        >
          {submitError && (
            <p
              style={{
                textAlign: 'right',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
              }}
            >
              {submitError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
              disabled={activeTab === 0}
              style={{ opacity: activeTab === 0 ? 0.4 : 1 }}
            >
              ← Previous
            </button>

            <span className="text-sm text-secondary">
              {activeTab + 1} of {tabs.length}
            </span>

            {isLastTab ? (
              <button
                className="btn btn-primary"
                onClick={() => setShowConfirm(true)}
                disabled={isSubmitting || !allRequiredMet || !canWrite}
                style={{ opacity: isSubmitting || !allRequiredMet || !canWrite ? 0.6 : 1 }}
              >
                {isSubmitting ? 'Submitting…' : 'Submit for Review →'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setActiveTab((t) => Math.min(tabs.length - 1, t + 1))}
              >
                Next →
              </button>
            )}
          </div>
        </div>

        {/* Attachments Panel */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-lg)',
          }}
        >
          <AttachmentManager
            sowId={id}
            stageKey="draft"
            readOnly={false}
            showRequirements={true}
            authFetch={authFetch}
            currentContent={sowData}
            onContentExtracted={handleContentExtracted}
          />
        </div>

        {/* Submit Panel — Readiness checklist */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
          }}
        >
          <div
            className="card"
            style={{
              padding: 'var(--spacing-lg) var(--spacing-xl)',
              borderLeft: `3px solid ${allRequiredMet ? 'var(--color-success)' : 'var(--color-warning)'}`,
            }}
          >
            <h3 className="text-base font-semibold" style={{ marginBottom: 'var(--spacing-md)' }}>
              Ready to submit for review?
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasExecutiveSummary ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasExecutiveSummary ? '✓' : '✗'} Executive Summary completed
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasScope ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasScope ? '✓' : '✗'} {scopeLabel} defined
              </span>
              <span
                style={{
                  fontSize: 'var(--font-size-sm)',
                  color: hasDeliverables ? 'var(--color-success)' : 'var(--color-error)',
                }}
              >
                {hasDeliverables ? '✓' : '✗'} {deliverablesLabel}
              </span>
            </div>
          </div>
        </div>

        {/* Activity Log Panel */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
          }}
        >
          <div className="card">
            <button
              onClick={() => setShowActivity((v) => !v)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              <h3 className="text-base font-semibold">Activity Log</h3>
              <span className="text-sm text-tertiary">{showActivity ? '▲ Hide' : '▼ Show'}</span>
            </button>
            {showActivity && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <ActivityLog sowId={id} />
              </div>
            )}
          </div>
        </div>

        {/* Docked AI assistant */}
        <div
          style={{
            position: 'fixed',
            right: 'var(--spacing-lg)',
            bottom: 'var(--spacing-lg)',
            width: 360,
            maxWidth: 'calc(100vw - var(--spacing-lg) * 2)',
            zIndex: 900,
          }}
        >
          <AssistChat
            authFetch={authFetch}
            sowId={id}
            onInsert={(text) => {
              const fields = TAB_KEY_TO_SOW_FIELDS[activeTabConfig?.key] || [];
              if (fields.length > 0) {
                updateSection(fields[0], text);
              }
            }}
          />
        </div>

        {/* Confirmation modal */}
        {showConfirm && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
            onClick={() => setShowConfirm(false)}
          >
            <div
              className="card"
              style={{
                maxWidth: '480px',
                width: '90%',
                padding: 'var(--spacing-xl)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold" style={{ marginBottom: 'var(--spacing-md)' }}>
                Submit for Review
              </h3>
              <p
                className="text-secondary"
                style={{
                  marginBottom: 'var(--spacing-lg)',
                  lineHeight: 'var(--line-height-relaxed)',
                }}
              >
                This will submit the SoW for AI analysis. After reviewing the AI recommendations,
                you can proceed to internal review by the Solution Architect and SQA team.
              </p>
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}
              >
                <button className="btn btn-secondary" onClick={() => setShowConfirm(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Submitting…' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
