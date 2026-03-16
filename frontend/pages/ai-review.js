import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Invalid file type "${ext}". Only .pdf and .docx files are accepted.`;
  }
  if (file.type && !ALLOWED_MIMES.has(file.type)) {
    return 'File type not recognized. Please upload a genuine PDF or Word (.docx) file.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${formatFileSize(file.size)}). Maximum size is 25 MB.`;
  }
  return '';
}

export default function AIReview() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [methodology, setMethodology] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({ file: '', methodology: '' });

  const processSelectedFile = (selected) => {
    const fileError = validateFile(selected);
    if (fileError) {
      setFile(null);
      setErrors((prev) => ({ ...prev, file: fileError }));
    } else {
      setFile(selected);
      setErrors((prev) => ({ ...prev, file: '' }));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    const newErrors = { file: '', methodology: '' };
    if (!file) {
      newErrors.file = 'Please upload a SoW document.';
    }
    if (!methodology) {
      newErrors.methodology = 'Please select a methodology.';
    }
    if (newErrors.file || newErrors.methodology) {
      setErrors(newErrors);
      return;
    }
    // In production: upload file and redirect to the resulting review ID
    router.push('/review/1');
  };

  const methodologies = ['Agile Sprint Delivery', 'Sure Step 365', 'Waterfall', 'Cloud Adoption'];

  const isValid = file && methodology && !errors.file && !errors.methodology;

  return (
    <>
      <Head>
        <title>AI Review – Cocoon</title>
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
            <h1 className="text-4xl font-bold mb-sm">AI-Powered SoW Review</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Upload an existing Statement of Work document for automated compliance analysis and
              expert AI recommendations.
            </p>
          </div>

          {/* Upload Card */}
          <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <h2
              className="text-xl font-semibold mb-xl"
              style={{
                paddingBottom: 'var(--spacing-md)',
                borderBottom: '1px solid var(--color-border-default)',
              }}
            >
              Upload SoW Document
            </h2>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                border: `2px dashed ${isDragging ? 'var(--color-accent-blue)' : file ? 'var(--color-success)' : errors.file ? 'var(--color-error)' : 'var(--color-border-default)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-3xl) var(--spacing-xl)',
                textAlign: 'center',
                marginBottom: 'var(--spacing-xl)',
                backgroundColor: isDragging
                  ? 'rgba(0,120,212,0.05)'
                  : file
                    ? 'rgba(74,222,128,0.05)'
                    : errors.file
                      ? 'rgba(239,68,68,0.05)'
                      : 'var(--color-bg-tertiary)',
                transition: 'all var(--transition-base)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-md)' }}>
                {file ? '✅' : errors.file ? '❌' : '📄'}
              </div>

              {file ? (
                <>
                  <p className="font-semibold mb-sm" style={{ color: 'var(--color-success)' }}>
                    {file.name}
                  </p>
                  <p className="text-sm text-secondary">{formatFileSize(file.size)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setErrors((prev) => ({ ...prev, file: '' }));
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 'var(--spacing-md)', color: 'var(--color-error)' }}
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <p className="text-secondary mb-md">Drag and drop your SoW document here, or</p>
                  <label
                    htmlFor="file-upload"
                    className="btn btn-secondary btn-sm"
                    style={{ cursor: 'pointer' }}
                  >
                    Browse Files
                  </label>
                  <p className="text-sm text-tertiary" style={{ marginTop: 'var(--spacing-md)' }}>
                    Supported: .pdf, .docx (max 25 MB)
                  </p>
                </>
              )}

              <input
                id="file-upload"
                type="file"
                accept=".pdf,.docx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {errors.file && (
              <p className="form-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                {errors.file}
              </p>
            )}

            {/* Methodology */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                SoW Methodology <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={methodology}
                onChange={(e) => {
                  setMethodology(e.target.value);
                  if (e.target.value) {
                    setErrors((prev) => ({ ...prev, methodology: '' }));
                  }
                }}
                className="form-select"
              >
                <option value="">Select a methodology…</option>
                {methodologies.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              {errors.methodology && <p className="form-error">{errors.methodology}</p>}
            </div>
            <p className="form-helper" style={{ marginTop: 'var(--spacing-sm)' }}>
              Google Docs users: File → Download as PDF or Word (.docx)
            </p>
          </div>

          {/* AI Info Banner */}
          <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-lg)' }}>
            <strong>How AI Review Works:</strong> Our model checks your SoW against MCEM compliance
            standards, flags missing sections, scores delivery risk, and generates actionable
            recommendations — typically in under 30 seconds.
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
              Cancel
            </button>
            <button
              onClick={handleUpload}
              className="btn btn-primary btn-lg"
              disabled={!isValid}
              style={{ opacity: isValid ? 1 : 0.6 }}
            >
              Upload & Analyze
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
