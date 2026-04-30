import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import { STAGE_KEYS } from '../lib/workflowStages';
import { aiClient } from '../lib/ai';
import AIUnavailableBanner from '../components/AIUnavailableBanner';
import ExtractionPreviewModal from '../components/ExtractionPreviewModal';
import SkipAIReviewModal from '../components/SkipAIReviewModal';
import {
  ViolationsSection,
  RisksSection,
  ApprovalSection,
  ChecklistSection,
  SuggestionsSection,
  SectionAnalysisSection,
  SimilarSowsSection,
} from '../components/ai-review';

// Convert the backend ai-analyze envelope into the shape the on-page
// section components expect.
function mapAnalysisToRecommendations(data) {
  return {
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
    overall_score: data.overall_score,
    summary: data.summary,
    generated_at: data.generated_at,
    model_version: data.model_version || data.generation_meta?.model_version,
  };
}

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

// Replaces the previous 📄 / ✅ / ❌ emoji glyphs in the drop zone. Inline
// SVG keeps the visual hierarchy but renders in the theme stroke color so
// the icon never clashes with the dark background, matching how the rest
// of the app (AttachmentManager, etc.) draws its icons.
function DropZoneIcon({ state }) {
  const stroke =
    state === 'success'
      ? 'var(--color-success)'
      : state === 'error'
        ? 'var(--color-error)'
        : 'var(--color-text-tertiary)';
  const props = {
    width: 40,
    height: 40,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (state === 'success') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    );
  }
  if (state === 'error') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="13" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  // idle: a clean upload glyph (tray + arrow up) — reads as "drop here"
  // without the cartoon-y feel of the old emoji.
  return (
    <svg {...props}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
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
  const [aiError, setAiError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [currentSowId, setCurrentSowId] = useState(null);
  const [isProceeding, setIsProceeding] = useState(false);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [similarSows, setSimilarSows] = useState([]);
  // Display name of the stage that follows ai_review in this SoW's workflow
  // snapshot.  Hardcoding "Internal Review" was wrong for any custom workflow
  // that renames or replaces that stage — we now look it up live so the
  // "Proceed" button label matches whatever the workflow actually does.
  const [nextStageLabel, setNextStageLabel] = useState(null);
  const [isReturningToDraft, setIsReturningToDraft] = useState(false);
  // AI auto-fill state — opt-in by default. When enabled, the upload
  // path inserts a preview-modal step between /api/sow/upload and
  // submit-for-review so the author can populate the SoW from the
  // uploaded document before AI analysis runs against it.
  const [autoFill, setAutoFill] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState(null);
  const [extractionApplying, setExtractionApplying] = useState(false);
  const [extractionError, setExtractionError] = useState(null);

  // If arriving from draft submit-for-review (Path A), auto-trigger AI analysis
  useEffect(() => {
    if (!sowId || !authFetch) return;
    const ctrl = new AbortController();
    const { signal } = ctrl;
    setCurrentSowId(sowId);
    setIsAnalyzing(true);
    setAiError(null);
    setError(null);

    (async () => {
      const result = await aiClient.runAnalysis(authFetch, sowId, { signal });
      if (signal.aborted) return;
      if (!result.ok) {
        setAiError(result.error);
        setIsAnalyzing(false);
        return;
      }
      setRecommendations(mapAnalysisToRecommendations(result.data));
      setIsAnalyzing(false);
      setShowResults(true);

      const sim = await aiClient.similar(authFetch, sowId, { signal });
      if (!signal.aborted && sim.ok) setSimilarSows(sim.data || []);
    })();

    return () => ctrl.abort();
  }, [sowId, authFetch]);

  // Retry handler for the AI unavailable banner — re-runs analysis without
  // re-triggering the upload flow.
  const handleRetryAnalysis = async () => {
    const id = currentSowId || sowId;
    if (!id) return;
    setAiError(null);
    setError(null);
    setIsAnalyzing(true);
    const result = await aiClient.runAnalysis(authFetch, id);
    if (!result.ok) {
      setAiError(result.error);
      setIsAnalyzing(false);
      return;
    }
    setRecommendations(mapAnalysisToRecommendations(result.data));
    setIsAnalyzing(false);
    setShowResults(true);
    const sim = await aiClient.similar(authFetch, id);
    if (sim.ok) setSimilarSows(sim.data || []);
  };

  // Confirm-skip handler from SkipAIReviewModal — POSTs the reason and
  // forwards the user to all-sows.
  const handleConfirmSkip = async (reason) => {
    const id = currentSowId || sowId;
    if (!id) return;
    setSkipping(true);
    const result = await aiClient.skipReview(authFetch, id, reason);
    setSkipping(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setShowSkipModal(false);
    router.push('/all-sows');
  };

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

  // Return to draft for further editing
  const handleReturnToDraft = async () => {
    const id = currentSowId;
    if (!id) return;
    setIsReturningToDraft(true);
    setError(null);
    try {
      const res = await authFetch(`/api/sow/${id}/return-to-draft`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Failed to return to draft (${res.status})`);
      }
      router.push(`/draft/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsReturningToDraft(false);
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

  // Continue from "SoW exists in draft" → submit for review → AI analysis.
  // Factored out so the auto-fill path can call this *after* the preview
  // modal is dismissed without duplicating the analysis pipeline.
  const proceedToAnalysis = async (sowId) => {
    try {
      // submit-for-review transitions the SoW out of draft into ai_review.
      // It must happen *after* any apply-extraction call because that
      // endpoint refuses to mutate content once the SoW leaves draft.
      await authFetch(`/api/sow/${sowId}/submit-for-review`, { method: 'POST' });

      setIsAnalyzing(true);

      const aiResult = await aiClient.runAnalysis(authFetch, sowId);
      if (!aiResult.ok) {
        setAiError(aiResult.error);
        setIsAnalyzing(false);
        return;
      }

      // Parse is an optional companion call — adds section detection +
      // missing-keyword data to the recommendations panel.
      let parseData = { sections: [], missingKeywords: [] };
      try {
        const parseRes = await authFetch(`/api/sow/${sowId}/parse`, { method: 'POST' });
        if (parseRes.ok) {
          parseData = await parseRes.json();
        }
      } catch {
        // Parse is optional
      }

      const merged = mapAnalysisToRecommendations(aiResult.data);
      merged.sections = parseData.sections || [];
      merged.missingKeywords = parseData.missingKeywords || [];

      setRecommendations(merged);
      setIsAnalyzing(false);
      setShowResults(true);

      const sim = await aiClient.similar(authFetch, sowId);
      if (sim.ok) setSimilarSows(sim.data || []);
    } catch (err) {
      setError(err.message);
      setIsAnalyzing(false);
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

    let sow;
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

      sow = await res.json();
      setCurrentSowId(sow.id);
    } catch (err) {
      setError(err.message);
      setIsUploading(false);
      return;
    }

    setIsUploading(false);

    if (!autoFill) {
      await proceedToAnalysis(sow.id);
      return;
    }

    // Auto-fill path: try the extraction endpoint. If it returns useful
    // results, hand off to the preview modal — analysis only continues
    // after the modal closes (apply OR cancel). If extraction fails or
    // returns nothing, continue straight to analysis so a flaky ML
    // service can't strand the user.
    setIsExtracting(true);
    const result = await aiClient.extractFromDocument(authFetch, sow.id);
    setIsExtracting(false);
    if (result.ok && result.data && Object.keys(result.data.extracted || {}).length > 0) {
      setExtractionResult(result.data);
      // Modal handlers below drive the rest of the flow.
      return;
    }

    if (!result.ok) {
      // Non-blocking notice — the SoW exists, the file is on disk, the
      // analysis still runs.
      setError(`Auto-fill unavailable: ${result.error.message}`);
    }
    await proceedToAnalysis(sow.id);
  };

  const handleApplyExtraction = async (selectedSections) => {
    if (!extractionResult || !currentSowId) return;
    setExtractionApplying(true);
    setExtractionError(null);
    const apply = await aiClient.applyExtraction(authFetch, currentSowId, {
      sections: selectedSections,
      expectedContentHash: extractionResult.content_hash,
    });
    setExtractionApplying(false);
    if (!apply.ok) {
      if (apply.error.status === 409) {
        setExtractionError('The SoW changed since extraction. Cancel and re-upload to try again.');
      } else {
        setExtractionError(apply.error.message || 'Could not apply changes.');
      }
      return;
    }
    setExtractionResult(null);
    setExtractionError(null);
    await proceedToAnalysis(currentSowId);
  };

  const handleSkipExtraction = async () => {
    const sowId = currentSowId;
    setExtractionResult(null);
    setExtractionError(null);
    if (sowId) await proceedToAnalysis(sowId);
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
          {aiError && (
            <AIUnavailableBanner
              error={aiError}
              context="analysis"
              onRetry={handleRetryAnalysis}
              onSkip={() => setShowSkipModal(true)}
            />
          )}

          {/* Error banner — uses the global ``.alert.alert-error`` so its
              tint, border-left rail, and color match every other error
              banner in the app. */}
          {error && !aiError && (
            <div
              role="alert"
              className="alert alert-error"
              style={{ fontSize: 'var(--font-size-sm)' }}
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

                {/* Drop Zone — border + tinted background change with
                    state. Tints are derived from the theme palette via
                    the ``--color-*-rgb`` channel tokens so the tint
                    stays in sync with the canonical hex if it ever
                    moves. */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${
                      isDragging
                        ? 'var(--color-accent-blue)'
                        : file
                          ? 'var(--color-success)'
                          : errors.file
                            ? 'var(--color-error)'
                            : 'var(--color-border-default)'
                    }`,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-3xl) var(--spacing-xl)',
                    textAlign: 'center',
                    marginBottom: 'var(--spacing-xl)',
                    backgroundColor: isDragging
                      ? 'rgba(var(--color-accent-blue-rgb), 0.05)'
                      : file
                        ? 'rgba(var(--color-success-rgb), 0.05)'
                        : errors.file
                          ? 'rgba(var(--color-error-rgb), 0.05)'
                          : 'var(--color-bg-tertiary)',
                    transition: 'all var(--transition-base)',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      marginBottom: 'var(--spacing-md)',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <DropZoneIcon state={file ? 'success' : errors.file ? 'error' : 'idle'} />
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

                {/* AI auto-fill toggle. The extraction step is decoupled
                    from analysis: turning this off skips the preview
                    modal, leaving the SoW empty for the user to draft
                    manually but otherwise running the same AI Review
                    pipeline. */}
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginTop: 'var(--spacing-md)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={autoFill}
                    onChange={(e) => setAutoFill(e.target.checked)}
                    disabled={isUploading || isExtracting || isAnalyzing}
                    style={{ marginTop: '2px' }}
                  />
                  <span>
                    Use AI to pre-fill SoW sections from this document
                    <span
                      style={{
                        display: 'block',
                        color: 'var(--color-text-tertiary)',
                        fontSize: 'var(--font-size-xs)',
                        marginTop: '2px',
                      }}
                    >
                      You&apos;ll review the proposed changes before anything is applied. Sections
                      the AI can&apos;t find stay blank.
                    </span>
                  </span>
                </label>
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
                  disabled={!isValid || isUploading || isExtracting}
                  style={{
                    opacity: isValid && !isUploading && !isExtracting ? 1 : 0.6,
                  }}
                >
                  {isUploading
                    ? 'Uploading…'
                    : isExtracting
                      ? 'Reading document…'
                      : autoFill
                        ? 'Upload & Review AI Fill'
                        : 'Upload & Analyze'}
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
              {/* Success banner — same global ``.alert.alert-success``
                  pattern used elsewhere; flex layout is layered on so
                  the "Analyze Another" button still hugs the right
                  edge. */}
              <div
                role="status"
                className="alert alert-success"
                style={{
                  marginBottom: 'var(--spacing-xl)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                }}
              >
                <div>
                  <p className="font-semibold">Analysis Complete</p>
                  <p className="text-sm text-secondary" style={{ margin: 'var(--spacing-xs) 0 0' }}>
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
                      className="btn btn-secondary"
                      onClick={handleReturnToDraft}
                      disabled={isReturningToDraft || isProceeding}
                      style={{ opacity: isReturningToDraft ? 0.6 : 1 }}
                    >
                      {isReturningToDraft ? 'Returning…' : '← Back to Draft'}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleProceedToReview}
                      disabled={isProceeding || isReturningToDraft}
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

      <SkipAIReviewModal
        open={showSkipModal}
        onClose={() => setShowSkipModal(false)}
        onConfirm={handleConfirmSkip}
        submitting={skipping}
      />

      <ExtractionPreviewModal
        open={!!extractionResult}
        extracted={extractionResult?.extracted}
        currentContent={null}
        notes={extractionResult?.notes}
        onApply={handleApplyExtraction}
        onClose={handleSkipExtraction}
        applying={extractionApplying}
        error={extractionError}
      />
    </>
  );
}
