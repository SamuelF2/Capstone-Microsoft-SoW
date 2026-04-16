/**
 * AttachmentManager — upload, view, and manage file attachments for a SoW.
 *
 * Shows a document requirements checklist (if any), a drag-and-drop upload
 * area, and a list of existing attachments with download/delete actions.
 *
 * Props
 * -----
 * sowId            integer           — the SoW being managed
 * stageKey         string|null       — current workflow stage key (for filtering/defaults)
 * readOnly         boolean           — hide upload/delete controls
 * showRequirements boolean           — show document requirements section
 * authFetch        function          — authenticated fetch from useAuth()
 * onUpload         () => void        — called after a successful upload
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatBytes } from '../lib/format';

const DOCUMENT_TYPE_LABELS = {
  'solution-architecture': 'Solution Architecture',
  'staffing-plan': 'Staffing Plan',
  'risk-register': 'Risk Register',
  'test-plan': 'Test Plan',
  'security-assessment': 'Security Assessment',
  'data-migration-plan': 'Data Migration Plan',
  'training-plan': 'Training Plan',
  'srm-presentation': 'SRM Presentation',
  other: 'Other',
};

const DOC_TYPE_COLOR = {
  'solution-architecture': '#1967d2',
  'staffing-plan': '#7c3aed',
  'risk-register': '#dc2626',
  'test-plan': '#059669',
  'security-assessment': '#d97706',
  'data-migration-plan': '#2563eb',
  'training-plan': '#0891b2',
  'srm-presentation': '#7c3aed',
  other: '#6b7280',
};

function Badge({ label, color }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        letterSpacing: '0.04em',
        color,
        border: `1px solid ${color}`,
        backgroundColor: `${color}18`,
      }}
    >
      {label}
    </span>
  );
}

function FileIcon({ name, size = 18 }) {
  const ext = (name || '').split('.').pop()?.toLowerCase();
  const props = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.75',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
    style: { flexShrink: 0 },
  };

  if (ext === 'pdf') {
    return (
      <svg {...props}>
        <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <line x1="10" y1="9" x2="8" y2="9" />
      </svg>
    );
  }

  if (ext === 'docx') {
    return (
      <svg {...props}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }

  if (['xlsx', 'csv', 'pptx'].includes(ext)) {
    return (
      <svg {...props}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    );
  }

  if (['png', 'jpg', 'jpeg'].includes(ext)) {
    return (
      <svg {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.49" />
    </svg>
  );
}

function UploadIcon({ size = 28 }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      <line x1="12" y1="11" x2="12" y2="17" />
      <polyline points="9 14 12 11 15 14" />
    </svg>
  );
}

export default function AttachmentManager({
  sowId,
  stageKey = null,
  readOnly = false,
  showRequirements = false,
  authFetch,
  onUpload,
}) {
  const [attachments, setAttachments] = useState([]);
  const [requirements, setRequirements] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  // Staged-but-not-yet-uploaded file. Holds the File plus the doc-type and
  // description the user is filling in. The actual POST only fires when the
  // user clicks the Upload button on the staging card.
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingDocType, setPendingDocType] = useState('other');
  const [pendingDescription, setPendingDescription] = useState('');
  const fileInputRef = useRef(null);

  // ── Load attachments & requirements ────────────────────────────────────

  // ``signal`` is optional — passed by the mount effect for cancellation,
  // omitted by manual refresh callers (after upload/delete) where we want
  // the new state regardless.
  const load = useCallback(
    async (signal) => {
      if (!sowId || !authFetch) return;
      try {
        setLoading(true);
        const fetches = [authFetch(`/api/attachments/sow/${sowId}`, { signal })];
        if (showRequirements) {
          fetches.push(authFetch(`/api/attachments/sow/${sowId}/requirements`, { signal }));
        }

        const results = await Promise.all(fetches);
        if (signal?.aborted) return;

        if (results[0].ok) {
          const data = await results[0].json();
          if (signal?.aborted) return;
          setAttachments(data);
        }
        if (showRequirements && results[1] && results[1].ok) {
          const reqs = await results[1].json();
          if (signal?.aborted) return;
          setRequirements(reqs);
        }
        setError(null);
      } catch (err) {
        if (err?.name === 'AbortError' || signal?.aborted) return;
        setError('Failed to load attachments');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [sowId, authFetch, showRequirements]
  );

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // ── Staging + upload ───────────────────────────────────────────────────

  // Try to guess the most likely document type from a filename so the
  // staging card lands on a sensible default instead of always "Other".
  const guessDocType = useCallback((filename) => {
    const lower = (filename || '').toLowerCase();
    if (lower.includes('arch')) return 'solution-architecture';
    if (lower.includes('staff')) return 'staffing-plan';
    if (lower.includes('risk')) return 'risk-register';
    if (lower.includes('test')) return 'test-plan';
    if (lower.includes('security') || lower.includes('compliance')) return 'security-assessment';
    if (lower.includes('migration')) return 'data-migration-plan';
    if (lower.includes('training')) return 'training-plan';
    if (lower.includes('srm') || lower.includes('presentation')) return 'srm-presentation';
    return 'other';
  }, []);

  const stageFile = useCallback(
    (file) => {
      if (!file) return;
      setError(null);
      setPendingFile(file);
      setPendingDocType(guessDocType(file.name));
      setPendingDescription('');
    },
    [guessDocType]
  );

  const cancelStaged = useCallback(() => {
    setPendingFile(null);
    setPendingDocType('other');
    setPendingDescription('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const confirmUpload = async () => {
    if (!pendingFile || !authFetch) return;
    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', pendingFile);
      formData.append('document_type', pendingDocType);
      if (stageKey) formData.append('stage_key', stageKey);
      if (pendingDescription.trim()) formData.append('description', pendingDescription.trim());

      const res = await authFetch(`/api/attachments/sow/${sowId}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }

      cancelStaged();
      await load();
      if (onUpload) onUpload();
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) stageFile(file);
  };

  // ── Drag & drop ────────────────────────────────────────────────────────

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragIn = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragOut = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) stageFile(file);
  };

  // ── Download ───────────────────────────────────────────────────────────

  const handleDownload = async (attachment) => {
    try {
      const res = await authFetch(`/api/attachments/${attachment.id}/download`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = attachment.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed');
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────

  const handleDelete = async (attachmentId) => {
    if (!confirm('Delete this attachment?')) return;
    try {
      const res = await authFetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Delete failed');
      }
      await load();
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        Loading attachments...
      </div>
    );
  }

  const reqsMet = requirements
    ? requirements.requirements.filter((r) => r.is_required && r.fulfilled).length
    : 0;
  const reqsTotal = requirements
    ? requirements.requirements.filter((r) => r.is_required).length
    : 0;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: '8px',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <strong style={{ fontSize: 'var(--font-size-sm)' }}>Attachments</strong>
          <span style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
            ({attachments.length} file{attachments.length !== 1 ? 's' : ''})
          </span>
        </div>
        {showRequirements && reqsTotal > 0 && (
          <Badge
            label={`${reqsMet}/${reqsTotal} required`}
            color={reqsMet === reqsTotal ? 'var(--color-success)' : 'var(--color-error)'}
          />
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: 'var(--color-error-bg, #fef2f2)',
            color: 'var(--color-error)',
            fontSize: 'var(--font-size-sm)',
            borderBottom: '1px solid var(--color-border-default)',
          }}
        >
          {error}
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: '12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-error)',
              fontWeight: 'var(--font-weight-semibold)',
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Requirements checklist */}
      {showRequirements && requirements && requirements.requirements.length > 0 && (
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--color-border-default)',
            // backgroundColor: 'var(--color-bg-secondary, #000000)',
          }}
        >
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--color-text-tertiary)',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Document Requirements
          </div>
          {requirements.requirements.map((req, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 0',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {req.fulfilled ? (
                <span
                  style={{
                    color: 'var(--color-success)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  {'\u2713'}
                </span>
              ) : req.is_required ? (
                <span
                  style={{ color: 'var(--color-error)', fontWeight: 'var(--font-weight-semibold)' }}
                >
                  {'\u2717'}
                </span>
              ) : (
                <span
                  style={{
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  {'\u25CB'}
                </span>
              )}
              <span>{DOCUMENT_TYPE_LABELS[req.document_type] || req.document_type}</span>
              {req.is_required && (
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-error)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  REQUIRED
                </span>
              )}
              {req.description && (
                <span
                  style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-xs)' }}
                >
                  — {req.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {!readOnly && (
        <div
          style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-default)' }}
        >
          {/* No file staged yet → show dropzone. Once a file is dropped or
              chosen we swap in the staging card so the user can confirm what
              kind of document it is before anything is sent. */}
          {!pendingFile ? (
            <>
              <div
                onDragEnter={handleDragIn}
                onDragLeave={handleDragOut}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed ${dragActive ? 'var(--color-primary)' : 'var(--color-border-default)'}`,
                  borderRadius: '8px',
                  padding: '24px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: dragActive ? 'var(--color-primary-bg, #eff6ff)' : 'transparent',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                  <UploadIcon size={28} />
                </div>
                <div
                  style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 'var(--font-weight-medium)',
                  }}
                >
                  Drag & drop a document here, or{' '}
                  <span
                    style={{
                      color: 'var(--color-primary)',
                      fontWeight: 'var(--font-weight-semibold)',
                    }}
                  >
                    browse
                  </span>
                </div>
                <div
                  style={{
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--font-size-xs)',
                    marginTop: '4px',
                  }}
                >
                  You'll choose the document type before uploading. PDF, DOCX, XLSX, CSV, PPTX, PNG,
                  JPG — max 25 MB
                </div>
              </div>
            </>
          ) : (
            <div
              style={{
                border: '1px solid var(--color-border-default)',
                borderRadius: '8px',
                padding: '14px 16px',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              {/* File header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  marginBottom: '12px',
                }}
              >
                <FileIcon name={pendingFile.name} size={22} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 'var(--font-weight-semibold)',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {pendingFile.name}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      color: 'var(--color-text-tertiary)',
                      marginTop: '2px',
                    }}
                  >
                    {formatBytes(pendingFile.size)} · ready to upload
                  </div>
                </div>
                <button
                  type="button"
                  onClick={cancelStaged}
                  disabled={uploading}
                  title="Discard this file"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: uploading ? 'not-allowed' : 'pointer',
                    color: 'var(--color-text-tertiary)',
                    fontSize: '20px',
                    lineHeight: 1,
                    padding: '4px 8px',
                  }}
                >
                  ×
                </button>
              </div>

              {/* Document type — required field */}
              <div style={{ marginBottom: '10px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '4px',
                  }}
                >
                  Document type
                </label>
                <select
                  value={pendingDocType}
                  onChange={(e) => setPendingDocType(e.target.value)}
                  disabled={uploading}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-default)',
                    fontSize: 'var(--font-size-sm)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description — optional */}
              <div style={{ marginBottom: '12px' }}>
                <label
                  style={{
                    display: 'block',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    marginBottom: '4px',
                  }}
                >
                  Description{' '}
                  <span
                    style={{
                      color: 'var(--color-text-tertiary)',
                      fontWeight: 'var(--font-weight-regular)',
                      textTransform: 'none',
                      letterSpacing: 0,
                    }}
                  >
                    (optional)
                  </span>
                </label>
                <input
                  type="text"
                  value={pendingDescription}
                  onChange={(e) => setPendingDescription(e.target.value)}
                  disabled={uploading}
                  placeholder="Short note about this document..."
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border-default)',
                    fontSize: 'var(--font-size-sm)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={cancelStaged}
                  disabled={uploading}
                  className="btn btn-secondary"
                  style={{ padding: '6px 14px', fontSize: 'var(--font-size-sm)' }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUpload}
                  disabled={uploading}
                  className="btn btn-primary"
                  style={{ padding: '6px 14px', fontSize: 'var(--font-size-sm)' }}
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileSelect}
            accept=".pdf,.docx,.xlsx,.csv,.pptx,.png,.jpg,.jpeg"
            style={{ display: 'none' }}
          />
        </div>
      )}

      {/* Attachment list */}
      {attachments.length === 0 ? (
        <div
          style={{
            padding: '20px 16px',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          No attachments yet
        </div>
      ) : (
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {attachments.map((att) => {
            const typeColor = DOC_TYPE_COLOR[att.document_type] || '#6b7280';
            return (
              <div
                key={att.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--color-border-default)',
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <FileIcon name={att.original_name} size={18} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 'var(--font-weight-medium)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {att.original_name}
                  </div>
                  <div
                    style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '2px' }}
                  >
                    <Badge
                      label={DOCUMENT_TYPE_LABELS[att.document_type] || att.document_type}
                      color={typeColor}
                    />
                    <span
                      style={{
                        color: 'var(--color-text-tertiary)',
                        fontSize: 'var(--font-size-xs)',
                      }}
                    >
                      {formatBytes(att.file_size)}
                    </span>
                    {att.stage_key && (
                      <span
                        style={{
                          color: 'var(--color-text-tertiary)',
                          fontSize: 'var(--font-size-xs)',
                        }}
                      >
                        Stage: {att.stage_key}
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button
                    onClick={() => handleDownload(att)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border-default)',
                      background: 'var(--color-bg-secondary)',
                      cursor: 'pointer',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-medium)',
                      color: 'var(--color-primary)',
                    }}
                    title="Download"
                  >
                    Download
                  </button>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(att.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid var(--color-error-border, #fecaca)',
                        background: 'var(--color-error-bg, #fef2f2)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--color-error)',
                      }}
                      title="Delete"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
