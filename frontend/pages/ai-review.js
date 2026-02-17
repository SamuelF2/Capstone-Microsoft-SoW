import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function AIReview() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [methodology, setMethodology] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) {
      alert('Please upload a SoW document first');
      return;
    }
    if (!methodology) {
      alert('Please select a methodology');
      return;
    }
    // In production: upload file and redirect to the resulting review ID
    router.push('/review/1');
  };

  const methodologies = ['Agile Sprint Delivery', 'Sure Step 365', 'Waterfall', 'Cloud Adoption'];

  const isValid = file && methodology;

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
                border: `2px dashed ${isDragging ? 'var(--color-accent-blue)' : file ? 'var(--color-success)' : 'var(--color-border-default)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-3xl) var(--spacing-xl)',
                textAlign: 'center',
                marginBottom: 'var(--spacing-xl)',
                backgroundColor: isDragging
                  ? 'rgba(0,120,212,0.05)'
                  : file
                    ? 'rgba(74,222,128,0.05)'
                    : 'var(--color-bg-tertiary)',
                transition: 'all var(--transition-base)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-md)' }}>
                {file ? '✅' : '📄'}
              </div>

              {file ? (
                <>
                  <p className="font-semibold mb-sm" style={{ color: 'var(--color-success)' }}>
                    {file.name}
                  </p>
                  <p className="text-sm text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
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
                    Supported: .pdf, .doc, .docx
                  </p>
                </>
              )}

              <input
                id="file-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            {/* Methodology */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">
                SoW Methodology <span style={{ color: 'var(--color-error)' }}>*</span>
              </label>
              <select
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                className="form-select"
              >
                <option value="">Select a methodology…</option>
                {methodologies.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
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
