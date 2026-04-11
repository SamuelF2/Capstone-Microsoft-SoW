import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import { STAGE_KEYS } from '../lib/workflowStages';
import {
  ViolationsSection,
  RisksSection,
  ApprovalSection,
  ChecklistSection,
  SuggestionsSection,
  SectionAnalysisSection,
  SimilarSowsSection,
} from '../components/ai-review';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AIReview() {
  const router = useRouter();
  const { sowId } = router.query; // set when coming from draft submit-for-review
  const { authFetch } = useAuth();
  const [file, setFile] = useState(null);
  const [methodology, setMethodology] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({ file: '', methodology: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [currentSowId, setCurrentSowId] = useState(null);
  const [isProceeding, setIsProceeding] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [similarSows, setSimilarSows] = useState([]);
  // Display name of the stage that follows ai_review in this SoW's workflow
  // snapshot.  Hardcoding "Internal Review" was wrong for any custom workflow
  // that renames or replaces that stage — we now look it up live so the
  // "Proceed" button label matches whatever the workflow actually does.
  const [nextStageLabel, setNextStageLabel] = useState(null);

  // If arriving from draft submit-for-review (Path A), auto-trigger AI analysis
  useEffect(() => {
    if (!sowId || !authFetch) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setCurrentSowId(sowId);
    setIsAnalyzing(true);
    setAiUnavailable(false);
    setError(null);

    authFetch(`/api/sow/${sowId}/ai-analyze`, { method: 'POST', signal })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.detail || `AI analysis failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (signal.aborted) return;
        // Map API response to component format
        setRecommendations({
          violations: data.violations || [],
          risks: data.risks || [],
          approval: {
            level: data.approval?.level || 'Yellow',
            esapType: data.approval?.esap_type || 'Type-2',
            reason: data.approval?.reason || '',
            chain: data.approval?.chain || [],
          },
          checklist: (data.checklist || []).map((c) => ({
            item: c.text,
            required: c.required,
            checked: false,
          })),
          suggestions: (data.suggestions || []).map((s) => ({
            section: s.section,
            line: '',
            type: s.rationale?.includes('missing') ? 'add' : 'rewrite',
            original: s.current_text || '',
            suggested: s.suggested_text || '',
            reason: s.rationale || '',
          })),
          sections: [],
          missingKeywords: [],
        });
        setIsAnalyzing(false);
        setShowResults(true);

        // Fetch similar SoWs from the AI proxy (non-blocking)
        authFetch(`/api/ai/sow/${sowId}/similar`, { signal })
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => {
            if (!signal.aborted) setSimilarSows(data);
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return;
        setAiUnavailable(true);
        setError(err.message);
        setIsAnalyzing(false);
      });

    return () => ctrl.abort();
  }, [sowId, authFetch]);

  // Resolve the *actual* next stage out of ai_review from this SoW's
  // workflow snapshot so we can render an accurate button label.  Prefers
  // an on_approve transition (the "happy path" out of AI review) and falls
  // back to a default transition.  Silent on failure — the button just
  // shows a generic "Next Stage" label.
  useEffect(() => {
    if (!currentSowId || !authFetch) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    authFetch(`/api/workflow/sow/${currentSowId}`, { signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (signal.aborted || !data?.workflow_data) return;
        const { stages = [], transitions = [] } = data.workflow_data;
        const out = transitions.filter((t) => t.from_stage === STAGE_KEYS.AI_REVIEW);
        const picked =
          out.find((t) => t.condition === 'on_approve') ||
          out.find((t) => t.condition === 'default') ||
          out[0];
        if (!picked) return;
        const target = stages.find((s) => s.stage_key === picked.to_stage);
        if (target?.display_name) setNextStageLabel(target.display_name);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [currentSowId, authFetch]);

  // Proceed to next stage (after AI review)
  const handleProceedToReview = async () => {
    const id = currentSowId;
    if (!id) return;
    setIsProceeding(true);
    setError(null);
    try {
      const res = await authFetch(`/api/sow/${id}/proceed-to-review`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Failed to proceed (${res.status})`);
      }
      router.push('/all-sows');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProceeding(false);
    }
  };

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

  const handleUpload = async () => {
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

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('methodology', methodology);

      const res = await authFetch('/api/sow/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Upload failed (${res.status})`);
      }

      const sow = await res.json();
      setCurrentSowId(sow.id);

      // Upload succeeded — now submit for review (transitions to ai_review)
      await authFetch(`/api/sow/${sow.id}/submit-for-review`, { method: 'POST' });

      // Run AI analysis
      setIsUploading(false);
      setIsAnalyzing(true);

      const aiRes = await authFetch(`/api/sow/${sow.id}/ai-analyze`, { method: 'POST' });
      if (!aiRes.ok) {
        const detail = await aiRes.json().catch(() => ({}));
        throw new Error(detail?.detail || `AI analysis failed (${aiRes.status})`);
      }
      const aiData = await aiRes.json();

      // Also parse for section analysis
      let parseData = { sections: [], missingKeywords: [], violations: [] };
      try {
        const parseRes = await authFetch(`/api/sow/${sow.id}/parse`, { method: 'POST' });
        if (parseRes.ok) {
          parseData = await parseRes.json();
        }
      } catch {
        // Parse is optional, AI analysis is the primary
      }

      // Merge AI analysis with parse results
      const data = {
        sections: parseData.sections || [],
        missingKeywords: parseData.missingKeywords || [],
        violations: aiData.violations || [],
        risks: aiData.risks || [],
        approval: {
          level: aiData.approval?.level || 'Yellow',
          esapType: aiData.approval?.esap_type || 'Type-2',
          reason: aiData.approval?.reason || '',
          chain: aiData.approval?.chain || [],
        },
        checklist: (aiData.checklist || []).map((c) => ({
          item: c.text,
          required: c.required,
          checked: false,
        })),
        suggestions: (aiData.suggestions || []).map((s) => ({
          section: s.section,
          line: '',
          type: s.rationale?.includes('missing') ? 'add' : 'rewrite',
          original: s.current_text || '',
          suggested: s.suggested_text || '',
          reason: s.rationale || '',
        })),
      };

      setRecommendations(data);
      setIsAnalyzing(false);
      setShowResults(true);

      // Fetch similar SoWs from the AI proxy (non-blocking)
      authFetch(`/api/ai/sow/${sow.id}/similar`)
        .then((r) => (r.ok ? r.json() : []))
        .then((similar) => setSimilarSows(similar))
        .catch(() => {});
    } catch (err) {
      setAiUnavailable(true);
      setError(err.message);
      setIsUploading(false);
      setIsAnalyzing(false);
    }
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

          {/* AI unavailable banner */}
          {aiUnavailable && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.3)',
                color: 'var(--color-warning)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              AI analysis is temporarily unavailable. You can continue with manual review.
            </div>
          )}

          {/* Error banner */}
          {error && !aiUnavailable && (
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
              <strong>Upload failed:</strong> {error}
            </div>
          )}

          {/* Upload Card */}
          {!showResults && (
            <>
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
                      <p className="text-secondary mb-md">
                        Drag and drop your SoW document here, or
                      </p>
                      <label
                        htmlFor="file-upload"
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: 'pointer' }}
                      >
                        Browse Files
                      </label>
                      <p
                        className="text-sm text-tertiary"
                        style={{ marginTop: 'var(--spacing-md)' }}
                      >
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
                <strong>How AI Review Works:</strong> Our model checks your SoW against MCEM
                compliance standards, flags missing sections, scores delivery risk, and generates
                actionable recommendations — typically in under 30 seconds.
              </div>

              {/* Actions */}
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}
              >
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="btn btn-primary btn-lg"
                  disabled={!isValid || isUploading}
                  style={{ opacity: isValid && !isUploading ? 1 : 0.6 }}
                >
                  {isUploading ? 'Uploading…' : 'Upload & Analyze'}
                </button>
              </div>
            </>
          )}

          {/* Analyzing spinner */}
          {isAnalyzing && (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--spacing-3xl) 0',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: 48,
                  height: 48,
                  border: '3px solid var(--color-border-default)',
                  borderTopColor: 'var(--color-accent-blue)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p
                className="text-secondary font-semibold"
                style={{ marginTop: 'var(--spacing-lg)', fontSize: 'var(--font-size-lg)' }}
              >
                Analyzing SoW against MCEM standards…
              </p>
              <p className="text-tertiary" style={{ marginTop: 'var(--spacing-sm)' }}>
                Checking compliance rules, risk patterns, and approval requirements
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Recommendations */}
          {showResults && recommendations && (
            <div>
              {/* Success banner */}
              <div
                style={{
                  marginBottom: 'var(--spacing-xl)',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
                    Analysis Complete
                  </p>
                  <p className="text-sm text-secondary">
                    {file?.name} — {methodology}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowResults(false);
                    setRecommendations(null);
                    setFile(null);
                    setMethodology('');
                  }}
                >
                  Analyze Another
                </button>
              </div>

              {recommendations.sections && recommendations.sections.length > 0 && (
                <SectionAnalysisSection
                  sections={recommendations.sections}
                  missingKeywords={recommendations.missingKeywords}
                />
              )}
              <ApprovalSection approval={recommendations.approval} />
              <ViolationsSection violations={recommendations.violations} />
              <SuggestionsSection suggestions={recommendations.suggestions} />
              <RisksSection risks={recommendations.risks} />
              <ChecklistSection checklist={recommendations.checklist} />
              {similarSows.length > 0 && <SimilarSowsSection similarSows={similarSows} />}

              {/* Action Bar — Proceed to next workflow stage */}
              {currentSowId && (
                <div
                  className="card"
                  style={{
                    padding: 'var(--spacing-lg) var(--spacing-xl)',
                    borderLeft: '3px solid var(--color-accent-blue)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  <div>
                    {recommendations.approval && (
                      <p className="text-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>
                        <strong>ESAP Level:</strong> {recommendations.approval.esapType} (
                        {recommendations.approval.level})
                      </p>
                    )}
                    {recommendations.approval?.chain && (
                      <p className="text-sm text-secondary">
                        <strong>Required Reviewers:</strong>{' '}
                        {recommendations.approval.chain.join(', ')}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={() => router.push('/all-sows')}>
                      Back to All SoWs
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleProceedToReview}
                      disabled={isProceeding}
                      style={{ opacity: isProceeding ? 0.6 : 1 }}
                    >
                      {isProceeding
                        ? 'Proceeding…'
                        : `Proceed to ${nextStageLabel || 'Next Stage'} →`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
