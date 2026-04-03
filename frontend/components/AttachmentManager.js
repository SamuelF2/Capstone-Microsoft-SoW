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
        fontSize: '11px',
        fontWeight: 600,
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

function formatBytes(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(originalName) {
  const ext = (originalName || '').split('.').pop()?.toLowerCase();
  const icons = {
    pdf: '\u{1F4C4}',
    docx: '\u{1F4DD}',
    xlsx: '\u{1F4CA}',
    csv: '\u{1F4CA}',
    pptx: '\u{1F4CA}',
    png: '\u{1F5BC}',
    jpg: '\u{1F5BC}',
    jpeg: '\u{1F5BC}',
  };
  return icons[ext] || '\u{1F4CE}';
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
  const [selectedDocType, setSelectedDocType] = useState('other');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef(null);

  // ── Load attachments & requirements ────────────────────────────────────

  const load = useCallback(async () => {
    if (!sowId || !authFetch) return;
    try {
      setLoading(true);
      const fetches = [authFetch(`/api/attachments/sow/${sowId}`)];
      if (showRequirements) {
        fetches.push(authFetch(`/api/attachments/sow/${sowId}/requirements`));
      }

      const results = await Promise.all(fetches);

      if (results[0].ok) {
        setAttachments(await results[0].json());
      }
      if (showRequirements && results[1] && results[1].ok) {
        setRequirements(await results[1].json());
      }
      setError(null);
    } catch (err) {
      setError('Failed to load attachments');
    } finally {
      setLoading(false);
    }
  }, [sowId, authFetch, showRequirements]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Upload handler ─────────────────────────────────────────────────────

  const handleUpload = async (file) => {
    if (!file || !authFetch) return;
    try {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('document_type', selectedDocType);
      if (stageKey) formData.append('stage_key', stageKey);
      if (description.trim()) formData.append('description', description.trim());

      const res = await authFetch(`/api/attachments/sow/${sowId}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }

      setDescription('');
      setSelectedDocType('other');
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
    if (file) handleUpload(file);
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
    if (file) handleUpload(file);
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
      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
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
      style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}
    >
      {/* Header */}
      <div
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--color-border)',
          backgroundColor: 'var(--color-surface, #f8f9fa)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{'\u{1F4CE}'}</span>
          <strong style={{ fontSize: '14px' }}>Attachments</strong>
          <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
            ({attachments.length} file{attachments.length !== 1 ? 's' : ''})
          </span>
        </div>
        {showRequirements && reqsTotal > 0 && (
          <Badge
            label={`${reqsMet}/${reqsTotal} required`}
            color={
              reqsMet === reqsTotal
                ? 'var(--color-success, #16a34a)'
                : 'var(--color-error, #dc2626)'
            }
          />
        )}
      </div>

      {error && (
        <div
          style={{
            padding: '8px 16px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            fontSize: '13px',
            borderBottom: '1px solid var(--color-border)',
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
              color: '#dc2626',
              fontWeight: 600,
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
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: '#fafbfc',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
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
                fontSize: '13px',
              }}
            >
              {req.fulfilled ? (
                <span style={{ color: 'var(--color-success, #16a34a)', fontWeight: 700 }}>
                  {'\u2713'}
                </span>
              ) : req.is_required ? (
                <span style={{ color: 'var(--color-error, #dc2626)', fontWeight: 700 }}>
                  {'\u2717'}
                </span>
              ) : (
                <span style={{ color: 'var(--color-text-muted)', fontWeight: 700 }}>
                  {'\u25CB'}
                </span>
              )}
              <span>{DOCUMENT_TYPE_LABELS[req.document_type] || req.document_type}</span>
              {req.is_required && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--color-error, #dc2626)',
                    fontWeight: 600,
                  }}
                >
                  REQUIRED
                </span>
              )}
              {req.description && (
                <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                  — {req.description}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Upload area */}
      {!readOnly && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
          {/* Document type + description row */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <select
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value)}
              style={{
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                fontSize: '13px',
                backgroundColor: 'white',
                flex: '0 0 200px',
              }}
            >
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              style={{
                flex: 1,
                padding: '6px 10px',
                borderRadius: '6px',
                border: '1px solid var(--color-border)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Drop zone */}
          <div
            onDragEnter={handleDragIn}
            onDragLeave={handleDragOut}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragActive ? 'var(--color-primary, #1967d2)' : 'var(--color-border)'}`,
              borderRadius: '8px',
              padding: '20px',
              textAlign: 'center',
              cursor: 'pointer',
              backgroundColor: dragActive ? '#eff6ff' : 'transparent',
              transition: 'all 0.15s ease',
            }}
          >
            {uploading ? (
              <span style={{ color: 'var(--color-text-muted)', fontSize: '13px' }}>
                Uploading...
              </span>
            ) : (
              <>
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>{'\u{2B06}\u{FE0F}'}</div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '13px' }}>
                  Drag & drop a file here, or{' '}
                  <span style={{ color: 'var(--color-primary, #1967d2)', fontWeight: 600 }}>
                    browse
                  </span>
                </div>
                <div
                  style={{ color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '4px' }}
                >
                  PDF, DOCX, XLSX, CSV, PPTX, PNG, JPG — max 25 MB
                </div>
              </>
            )}
          </div>
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
            color: 'var(--color-text-muted)',
            fontSize: '13px',
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
                  borderBottom: '1px solid var(--color-border)',
                  fontSize: '13px',
                }}
              >
                <span style={{ fontSize: '18px', flexShrink: 0 }}>
                  {fileIcon(att.original_name)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
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
                    <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
                      {formatBytes(att.file_size)}
                    </span>
                    {att.stage_key && (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '11px' }}>
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
                      border: '1px solid var(--color-border)',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                    }}
                    title="Download"
                  >
                    {'\u{2B07}'} Download
                  </button>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(att.id)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        border: '1px solid #fecaca',
                        background: '#fef2f2',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#dc2626',
                      }}
                      title="Delete"
                    >
                      {'\u{1F5D1}'}
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
