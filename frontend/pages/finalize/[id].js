/**
 * pages/finalize/[id].js
 *
 * Phase 4 — Finalization page for approved SoWs.
 *
 * Three sequential steps:
 *   1. Generate Document  — POST /api/finalize/{id}/generate-document
 *   2. Handoff Package    — POST /api/finalize/{id}/handoff
 *   3. Finalize & Lock    — POST /api/finalize/{id}/lock
 */

import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';
import WorkflowProgress from '../../components/WorkflowProgress';
import HandoffPackageBuilder from '../../components/HandoffPackageBuilder';
import COATracker from '../../components/COATracker';
import AttachmentManager from '../../components/AttachmentManager';
import {
  formatDeal,
  formatDate,
  formatDateTime,
  formatBytes,
  esapBadgeStyle,
} from '../../lib/format';
import { aiClient } from '../../lib/ai';
import AIUnavailableBanner from '../../components/AIUnavailableBanner';

// ── Step card wrapper ─────────────────────────────────────────────────────────

function StepCard({ number, title, children, done }) {
  return (
    <div
      style={{
        border: '1px solid',
        borderColor: done ? 'rgba(74,222,128,0.4)' : 'var(--color-border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)',
          padding: 'var(--spacing-md) var(--spacing-xl)',
          borderBottom: '1px solid var(--color-border-default)',
          backgroundColor: done ? 'rgba(74,222,128,0.05)' : 'var(--color-bg-tertiary)',
        }}
      >
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            backgroundColor: done ? 'var(--color-success)' : 'var(--color-accent-purple, #7c3aed)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '13px',
            fontWeight: 'var(--font-weight-bold)',
            flexShrink: 0,
          }}
        >
          {done ? '✓' : number}
        </div>
        <span
          style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)' }}
        >
          {title}
        </span>
      </div>
      <div style={{ padding: 'var(--spacing-xl)' }}>{children}</div>
    </div>
  );
}

// ── Approval Summary table ────────────────────────────────────────────────────

function ApprovalSummary({ reviewStatus }) {
  const assignments = (reviewStatus?.assignments || []).filter((a) => a.status === 'completed');
  if (assignments.length === 0) return null;

  const decisionColor = (d) => {
    if (d === 'approved') return 'var(--color-success)';
    if (d === 'approved-with-conditions') return 'var(--color-warning)';
    if (d === 'rejected') return 'var(--color-error)';
    return 'var(--color-text-secondary)';
  };

  const decisionLabel = (d) => {
    if (!d) return '—';
    return d.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-xl)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-secondary)',
        marginBottom: 'var(--spacing-xl)',
      }}
    >
      <div
        style={{
          padding: 'var(--spacing-sm) var(--spacing-xl)',
          borderBottom: '1px solid var(--color-border-default)',
          backgroundColor: 'var(--color-bg-tertiary)',
        }}
      >
        <span
          style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)' }}
        >
          Approval Summary
        </span>
      </div>
      <div style={{ padding: '0 var(--spacing-xl)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              {['Reviewer', 'Decision', 'Stage', 'Date'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: 'var(--spacing-sm) 0',
                    textAlign: 'left',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-tertiary)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a, i) => (
              <tr
                key={i}
                style={{
                  borderBottom:
                    i < assignments.length - 1 ? '1px solid var(--color-border-default)' : 'none',
                }}
              >
                <td style={{ padding: 'var(--spacing-sm) 0', fontSize: 'var(--font-size-sm)' }}>
                  {a.display_name}
                </td>
                <td style={{ padding: 'var(--spacing-sm) 0' }}>
                  <span
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: decisionColor(a.decision),
                      fontWeight: 'var(--font-weight-medium)',
                    }}
                  >
                    {decisionLabel(a.decision)}
                  </span>
                </td>
                <td
                  style={{
                    padding: 'var(--spacing-sm) 0',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    textTransform: 'capitalize',
                  }}
                >
                  {(a.stage || '').replace(/-/g, ' ')}
                </td>
                <td
                  style={{
                    padding: 'var(--spacing-sm) 0',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {a.completed_at ? formatDate(a.completed_at) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Lock confirmation modal ───────────────────────────────────────────────────

function LockConfirmModal({ onClose, onConfirm, locking }) {
  return (
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
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--color-bg-primary)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--color-border-default)',
          padding: 'var(--spacing-xl)',
          maxWidth: '440px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-md)',
        }}
      >
        <div style={{ fontSize: '2rem', textAlign: 'center' }}>🔒</div>
        <h3 className="text-lg font-semibold" style={{ margin: 0, textAlign: 'center' }}>
          Finalize &amp; Lock SoW
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            textAlign: 'center',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          This will permanently lock the SoW. The document and handoff package will become the
          official record. <strong>This cannot be undone.</strong>
        </p>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={locking}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={onConfirm}
            disabled={locking}
            style={{ backgroundColor: 'var(--color-success)', borderColor: 'var(--color-success)' }}
          >
            {locking ? 'Finalizing…' : 'Yes, Finalize'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FinalizePage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  const [sow, setSow] = useState(null);
  const [reviewStatus, setReviewStatus] = useState(null);
  const [handoffPackage, setHandoffPackage] = useState(null);
  const [docInfo, setDocInfo] = useState(null); // { file_name, size_bytes, format, generated_at }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [docFormat, setDocFormat] = useState('docx');
  const [generating, setGenerating] = useState(false);
  const [handoffSaving, setHandoffSaving] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [locking, setLocking] = useState(false);
  const [toast, setToast] = useState(null);
  const [coaSummary, setCoaSummary] = useState(null);
  const [proseLoading, setProseLoading] = useState(false);
  const [proseText, setProseText] = useState(null);
  const [proseError, setProseError] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const loadAll = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    setError(null);
    try {
      const [sowRes, statusRes, coaRes] = await Promise.all([
        authFetch(`/api/sow/${id}`),
        authFetch(`/api/review/${id}/status`),
        authFetch(`/api/coa/sow/${id}/summary`),
      ]);
      if (!sowRes.ok) throw new Error(`SoW load failed (${sowRes.status})`);

      const [sowData, statusData, coaData] = await Promise.all([
        sowRes.json(),
        statusRes.ok ? statusRes.json() : Promise.resolve(null),
        coaRes.ok ? coaRes.json() : Promise.resolve(null),
      ]);

      setSow(sowData);
      setReviewStatus(statusData);
      setCoaSummary(coaData);

      // Load handoff package (optional — may not exist yet)
      const handoffRes = await authFetch(`/api/finalize/${id}/handoff`);
      if (handoffRes.ok) {
        setHandoffPackage(await handoffRes.json());
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id, user, authFetch]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Request AI-generated polished prose. The ML route is not yet shipped,
  // so the proxy currently returns 503 — the AIUnavailableBanner surfaces
  // that and the rest of the finalize flow is unaffected.
  async function handleGenerateProse() {
    setProseLoading(true);
    setProseError(null);
    setProseText(null);
    const result = await aiClient.documentProse(authFetch, id);
    setProseLoading(false);
    if (result.ok) {
      setProseText(result.data?.prose || result.data?.text || '');
      showToast('Polished prose generated');
    } else {
      setProseError(result.error);
    }
  }

  async function handleGenerateDocument() {
    setGenerating(true);
    try {
      const res = await authFetch(`/api/finalize/${id}/generate-document?format=${docFormat}`, {
        method: 'POST',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Generation failed (${res.status})`);
      }
      const data = await res.json();
      setDocInfo({ ...data, generated_at: new Date().toISOString() });
      showToast('Document generated successfully');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setGenerating(false);
    }
  }

  function handleDownload() {
    // Trigger download via anchor — authFetch not needed for streaming file
    // We construct the URL and open it so the browser handles the download
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const token =
      typeof window !== 'undefined'
        ? localStorage.getItem('token') || sessionStorage.getItem('token') || ''
        : '';
    const a = document.createElement('a');
    a.href = `/api/finalize/${id}/download`;
    a.style.display = 'none';
    document.body.appendChild(a);
    // Prefer authFetch streaming download
    authFetch(`/api/finalize/${id}/download`)
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = docInfo?.file_name || `SoW-${id}.docx`;
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch((err) => {
        document.body.removeChild(a);
        showToast(err.message, 'error');
      });
  }

  async function handleSaveHandoff(packageData) {
    setHandoffSaving(true);
    try {
      const res = await authFetch(`/api/finalize/${id}/handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packageData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Save failed (${res.status})`);
      }
      const data = await res.json();
      setHandoffPackage(data);
      showToast('Handoff package saved');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setHandoffSaving(false);
    }
  }

  async function handleLock() {
    setLocking(true);
    try {
      const res = await authFetch(`/api/finalize/${id}/lock`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Lock failed (${res.status})`);
      }
      setShowLockModal(false);
      showToast('SoW finalized and locked!');
      await loadAll();
    } catch (err) {
      setShowLockModal(false);
      showToast(err.message, 'error');
    } finally {
      setLocking(false);
    }
  }

  // ── Prerequisite checks ──────────────────────────────────────────────────
  const isFinalized = sow?.status === 'finalized';
  const docReady = !!docInfo;
  const handoffReady = !!handoffPackage;

  // Outstanding COAs from the COA tracker
  const coaBlocking = coaSummary?.blocks_finalization ?? false;
  const coaOutstanding = coaSummary?.open ?? 0 + (coaSummary?.in_progress ?? 0);

  const prerequisites = [
    { label: 'Document generated', met: docReady },
    { label: 'Handoff package created', met: handoffReady },
    ...(coaSummary && coaSummary.total > 0
      ? [
          {
            label: coaBlocking
              ? `Conditions of Approval: ${coaSummary.open + (coaSummary.in_progress ?? 0)} outstanding — must resolve or waive all before finalizing`
              : `Conditions of Approval: all resolved or waived (${coaSummary.resolved} resolved, ${coaSummary.waived} waived)`,
            met: !coaBlocking,
          },
        ]
      : []),
  ];
  const allPrereqsMet = prerequisites.every((p) => p.met);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--spacing-3xl)' }}>
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 'var(--spacing-2xl)' }}>
        <div
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'rgba(239,68,68,0.1)',
            color: 'var(--color-error)',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  const esapStyle = esapBadgeStyle(sow?.esap_level);

  return (
    <>
      <Head>
        <title>{sow?.title ? `Finalize — ${sow.title}` : 'Finalize SoW'} – Cocoon</title>
      </Head>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 2000,
            padding: 'var(--spacing-sm) var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: toast.type === 'error' ? 'var(--color-error)' : 'var(--color-success)',
            color: '#fff',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          {toast.msg}
        </div>
      )}

      {showLockModal && (
        <LockConfirmModal
          onClose={() => setShowLockModal(false)}
          onConfirm={handleLock}
          locking={locking}
        />
      )}

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          {/* Back link */}
          <Link
            href="/all-sows"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)',
              textDecoration: 'none',
              marginBottom: 'var(--spacing-lg)',
            }}
          >
            ← Back to All SoWs
          </Link>

          {/* Header */}
          <div
            style={{
              backgroundColor: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-xl)',
              padding: 'var(--spacing-lg) var(--spacing-xl)',
              marginBottom: 'var(--spacing-xl)',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 'var(--spacing-sm)',
              }}
            >
              <h1 className="text-2xl font-bold" style={{ margin: 0 }}>
                Finalize: {sow?.title || 'Untitled SoW'}
              </h1>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                {sow?.esap_level && (
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      ...esapStyle,
                    }}
                  >
                    {sow.esap_level.toUpperCase()}
                  </span>
                )}
                <span
                  style={{
                    padding: '4px 12px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    backgroundColor: isFinalized ? 'rgba(59,130,246,0.1)' : 'rgba(74,222,128,0.1)',
                    color: isFinalized ? 'var(--color-info)' : 'var(--color-success)',
                  }}
                >
                  {isFinalized ? 'Finalized' : 'Approved'}
                </span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-xl)',
                flexWrap: 'wrap',
                marginBottom: 'var(--spacing-lg)',
              }}
            >
              {sow?.customer_name && (
                <span className="text-sm text-secondary">
                  <strong style={{ color: 'var(--color-text-primary)' }}>Customer:</strong>{' '}
                  {sow.customer_name}
                </span>
              )}
              <span className="text-sm text-secondary">
                <strong style={{ color: 'var(--color-text-primary)' }}>Deal:</strong>{' '}
                {formatDeal(sow?.deal_value)}
              </span>
              {isFinalized && sow?.finalized_at && (
                <span className="text-sm text-secondary">
                  <strong style={{ color: 'var(--color-text-primary)' }}>Finalized:</strong>{' '}
                  {formatDateTime(sow.finalized_at)}
                </span>
              )}
            </div>

            <WorkflowProgress
              sowId={sow?.id}
              currentStage={sow?.status}
              reviewAssignments={reviewStatus?.assignments || []}
            />
          </div>

          {/* Approval summary */}
          <ApprovalSummary reviewStatus={reviewStatus} />

          {/* COA blocking banner */}
          {coaBlocking && !isFinalized && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                padding: 'var(--spacing-md) var(--spacing-xl)',
                borderRadius: 'var(--radius-xl)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.35)',
                marginBottom: 'var(--spacing-xl)',
              }}
            >
              <span style={{ fontSize: '1.4rem' }}>⛔</span>
              <div>
                <p
                  style={{
                    margin: 0,
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-error)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  Cannot finalize — {(coaSummary?.open ?? 0) + (coaSummary?.in_progress ?? 0)}{' '}
                  condition
                  {(coaSummary?.open ?? 0) + (coaSummary?.in_progress ?? 0) !== 1 ? 's' : ''} of
                  approval still outstanding.
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  Resolve or waive all conditions below before locking the SoW.
                </p>
              </div>
            </div>
          )}

          {/* Conditions of Approval tracker */}
          {!isFinalized && (
            <div
              style={{
                backgroundColor: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border-default)',
                borderRadius: 'var(--radius-xl)',
                padding: 'var(--spacing-lg) var(--spacing-xl)',
                marginBottom: 'var(--spacing-xl)',
              }}
            >
              <h2
                style={{
                  margin: '0 0 var(--spacing-sm)',
                  fontSize: 'var(--font-size-base)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                Conditions of Approval
              </h2>
              <COATracker
                sowId={id}
                readOnly={false}
                authFetch={authFetch}
                onStatusChange={loadAll}
              />
            </div>
          )}

          {/* Attachments — all files collected across the lifecycle */}
          {id && (
            <div style={{ marginBottom: 'var(--spacing-xl)' }}>
              <AttachmentManager
                sowId={id}
                stageKey={null}
                readOnly={true}
                showRequirements={false}
                authFetch={authFetch}
              />
            </div>
          )}

          {/* Step 1: Generate Document */}
          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <StepCard number={1} title="Generate Document" done={docReady}>
              {!docReady && !isFinalized && (
                <>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-secondary)',
                      marginBottom: 'var(--spacing-md)',
                    }}
                  >
                    Generate the official SoW document from the approved content.
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--spacing-lg)',
                      marginBottom: 'var(--spacing-md)',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      Format:
                    </span>
                    {['docx', 'pdf'].map((fmt) => (
                      <label
                        key={fmt}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          cursor: 'pointer',
                          fontSize: 'var(--font-size-sm)',
                        }}
                      >
                        <input
                          type="radio"
                          name="format"
                          value={fmt}
                          checked={docFormat === fmt}
                          onChange={() => setDocFormat(fmt)}
                          style={{ accentColor: 'var(--color-accent-purple, #7c3aed)' }}
                        />
                        {fmt.toUpperCase()}
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-primary"
                      onClick={handleGenerateDocument}
                      disabled={generating}
                    >
                      {generating ? 'Generating…' : 'Generate Document'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleGenerateProse}
                      disabled={proseLoading}
                      title="Use AI to draft polished prose for the document body"
                    >
                      {proseLoading ? 'Generating prose…' : 'Generate polished prose with AI'}
                    </button>
                  </div>

                  {proseError && (
                    <div style={{ marginTop: 'var(--spacing-md)' }}>
                      <AIUnavailableBanner
                        error={proseError}
                        context="prose"
                        onRetry={handleGenerateProse}
                      />
                    </div>
                  )}

                  {proseText && (
                    <div
                      style={{
                        marginTop: 'var(--spacing-md)',
                        padding: 'var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border-default)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        maxHeight: 320,
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-primary)',
                        lineHeight: 'var(--line-height-relaxed)',
                      }}
                    >
                      {proseText}
                    </div>
                  )}
                </>
              )}

              {docReady && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    padding: 'var(--spacing-md)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border-default)',
                    backgroundColor: 'var(--color-bg-primary)',
                  }}
                >
                  <span style={{ fontSize: '2rem' }}>📄</span>
                  <div style={{ flex: 1 }}>
                    <p
                      style={{
                        margin: 0,
                        fontWeight: 'var(--font-weight-semibold)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {docInfo.file_name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      Generated {formatDateTime(docInfo.generated_at)} ·{' '}
                      {formatBytes(docInfo.size_bytes, '')}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                      Download ↓
                    </button>
                    {!isFinalized && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={handleGenerateDocument}
                        disabled={generating}
                      >
                        {generating ? '…' : '↻ Regenerate'}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isFinalized && !docReady && (
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
                  <button className="btn btn-primary btn-sm" onClick={handleDownload}>
                    Download Document ↓
                  </button>
                </div>
              )}
            </StepCard>
          </div>

          {/* Step 2: Handoff Package */}
          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <StepCard number={2} title="Handoff Package" done={handoffReady}>
              <HandoffPackageBuilder
                sowData={sow}
                existingPackage={handoffPackage}
                onSave={handleSaveHandoff}
                saving={handoffSaving}
                readOnly={isFinalized}
              />
            </StepCard>
          </div>

          {/* Step 3: Finalize */}
          <StepCard number={3} title="Finalize & Lock" done={isFinalized}>
            {isFinalized ? (
              <div style={{ textAlign: 'center', padding: 'var(--spacing-md)' }}>
                <div style={{ fontSize: '2rem', marginBottom: '8px' }}>🔒</div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  SoW finalized on {formatDate(sow?.finalized_at)}. This document is now locked.
                </p>
              </div>
            ) : (
              <>
                <div
                  style={{
                    padding: 'var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(245,158,11,0.08)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    marginBottom: 'var(--spacing-md)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-warning)',
                  }}
                >
                  ⚠ This will lock the SoW. No further edits will be possible.
                </div>

                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                      marginBottom: 'var(--spacing-sm)',
                    }}
                  >
                    Prerequisites:
                  </p>
                  {prerequisites.map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 0',
                      }}
                    >
                      <span
                        style={{
                          color: p.met
                            ? p.info
                              ? 'var(--color-info)'
                              : 'var(--color-success)'
                            : 'var(--color-text-tertiary)',
                          fontSize: '14px',
                        }}
                      >
                        {p.met ? '☑' : '☐'}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-sm)',
                          color: p.met ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                        }}
                      >
                        {p.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  className="btn btn-primary"
                  onClick={() => setShowLockModal(true)}
                  disabled={!allPrereqsMet}
                  style={{
                    backgroundColor: allPrereqsMet ? 'var(--color-success)' : undefined,
                    borderColor: allPrereqsMet ? 'var(--color-success)' : undefined,
                    opacity: allPrereqsMet ? 1 : 0.5,
                  }}
                >
                  Finalize &amp; Lock 🔒
                </button>
              </>
            )}
          </StepCard>
        </div>
      </div>
    </>
  );
}
