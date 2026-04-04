/**
 * WorkflowProgress — dynamic horizontal workflow stepper that replaces the
 * hard-coded ReviewStatusTracker.
 *
 * Fetches stage definitions from GET /api/workflow/sow/{sowId} so the steps
 * are driven by the SoW's actual workflow snapshot rather than a static list.
 *
 * Props
 * -----
 * sowId             number|string   — SoW integer ID
 * currentStage      string          — current stage key (e.g. "internal_review")
 * reviewAssignments array           — from GET /api/review/{sowId}/status assignments
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';

export default function WorkflowProgress({ sowId, currentStage, reviewAssignments = [] }) {
  const { authFetch } = useAuth();
  const [workflowData, setWorkflowData] = useState(null);
  const [coaSummary, setCoaSummary] = useState(null);
  const [attachmentReqs, setAttachmentReqs] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    if (!sowId) return;
    let cancelled = false;

    authFetch(`/api/workflow/sow/${sowId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setWorkflowData(data.workflow_data);
      })
      .catch(() => {});

    authFetch(`/api/coa/sow/${sowId}/summary`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCoaSummary(data);
      })
      .catch(() => {});

    authFetch(`/api/attachments/sow/${sowId}/requirements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setAttachmentReqs(data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sowId, authFetch]);

  // Close tooltip on outside click
  useEffect(() => {
    if (!activeTooltip) return;
    const handler = (e) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target)) {
        setActiveTooltip(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeTooltip]);

  // Fall back to static display while loading workflow data
  if (!workflowData) {
    return <FallbackTracker currentStage={currentStage} reviewAssignments={reviewAssignments} />;
  }

  const isRejected = currentStage === 'rejected';

  // Filter out the rejected stage from the main timeline
  const stages = (workflowData.stages || [])
    .filter((s) => s.stage_key !== 'rejected')
    .sort((a, b) => a.stage_order - b.stage_order);

  const currentStageObj = stages.find((s) => s.stage_key === currentStage);
  const currentOrder = currentStageObj?.stage_order ?? 0;

  return (
    <div>
      {/* Rejected banner */}
      {isRejected && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--spacing-xs)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'rgba(220,38,38,0.1)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: 'var(--color-error)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          ✗ Rejected — revisions required
        </div>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '0',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
        ref={tooltipRef}
      >
        {stages.map((stage, i) => {
          const isDone = !isRejected && stage.stage_order < currentOrder;
          const isCurrent = !isRejected && stage.stage_key === currentStage;
          const isFuture = !isDone && !isCurrent;

          // Reviewer info for this stage (support both underscore and hyphen stage keys)
          const stageAssignments = reviewAssignments.filter(
            (a) => a.stage === stage.stage_key || a.stage === stage.stage_key.replace(/_/g, '-')
          );

          // COA badge — only for review/approval stages
          const showCoa =
            coaSummary &&
            ['review', 'approval'].includes(stage.stage_type) &&
            (isDone || isCurrent);
          const coaAllResolved =
            coaSummary &&
            coaSummary.total > 0 &&
            coaSummary.open === 0 &&
            coaSummary.in_progress === 0;

          // Attachment requirement badge
          const stageDocReqs = (attachmentReqs?.requirements || []).filter(
            (r) => r.stage_key === stage.stage_key
          );
          const reqRequired = stageDocReqs.filter((r) => r.is_required);
          const reqMet = reqRequired.filter((r) => r.fulfilled).length;
          const showDocBadge = reqRequired.length > 0 && (isDone || isCurrent);

          // Tooltip data
          const isTooltipOpen = activeTooltip === stage.stage_key;

          return (
            <div
              key={stage.stage_key}
              style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }}
            >
              {/* Step */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1,
                  minWidth: 0,
                  position: 'relative',
                  cursor: 'pointer',
                }}
                onClick={() => setActiveTooltip(isTooltipOpen ? null : stage.stage_key)}
              >
                {/* Circle */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'var(--font-weight-semibold)',
                    border: '2px solid',
                    borderColor: isDone
                      ? 'var(--color-success)'
                      : isCurrent
                        ? 'var(--color-accent-purple, #7c3aed)'
                        : 'var(--color-border-default)',
                    backgroundColor: isDone
                      ? 'var(--color-success)'
                      : isCurrent
                        ? 'var(--color-accent-purple, #7c3aed)'
                        : 'var(--color-bg-primary)',
                    color: isDone || isCurrent ? '#fff' : 'var(--color-text-tertiary)',
                    boxShadow: isCurrent ? '0 0 0 3px rgba(124,58,237,0.2)' : 'none',
                    transition: 'all 0.2s',
                  }}
                >
                  {isDone ? '✓' : i + 1}
                </div>

                {/* Label */}
                <span
                  style={{
                    marginTop: '6px',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: isCurrent ? 'var(--font-weight-semibold)' : 'normal',
                    color: isDone
                      ? 'var(--color-success)'
                      : isCurrent
                        ? 'var(--color-accent-purple, #7c3aed)'
                        : 'var(--color-text-tertiary)',
                    textAlign: 'center',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '90px',
                  }}
                >
                  {stage.display_name}
                </span>

                {/* Reviewer avatars */}
                {stageAssignments.length > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '2px',
                      marginTop: '4px',
                    }}
                  >
                    {stageAssignments.map((a, j) => {
                      const decisionColor =
                        a.decision === 'approved' || a.decision === 'approved-with-conditions'
                          ? 'var(--color-success)'
                          : a.decision === 'rejected'
                            ? 'var(--color-error)'
                            : a.status === 'in_progress'
                              ? 'var(--color-warning)'
                              : 'var(--color-text-tertiary)';
                      return (
                        <span
                          key={j}
                          title={`${a.display_name}: ${a.decision || a.status}`}
                          style={{
                            fontSize: '10px',
                            color: decisionColor,
                            whiteSpace: 'nowrap',
                            maxWidth: '80px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {a.decision === 'approved' || a.decision === 'approved-with-conditions'
                            ? '✓'
                            : a.decision === 'rejected'
                              ? '✗'
                              : '●'}{' '}
                          {a.display_name}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Badges row */}
                {(showDocBadge || showCoa) && (
                  <div
                    style={{
                      display: 'flex',
                      gap: '4px',
                      marginTop: '4px',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}
                  >
                    {showDocBadge && (
                      <span
                        title={`${reqMet}/${reqRequired.length} required docs uploaded`}
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor:
                            reqMet >= reqRequired.length
                              ? 'rgba(74,222,128,0.15)'
                              : 'rgba(251,191,36,0.15)',
                          color:
                            reqMet >= reqRequired.length
                              ? 'var(--color-success)'
                              : 'var(--color-warning)',
                          border: `1px solid ${
                            reqMet >= reqRequired.length
                              ? 'rgba(74,222,128,0.3)'
                              : 'rgba(251,191,36,0.3)'
                          }`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {reqMet >= reqRequired.length ? '✓' : `${reqMet}/${reqRequired.length}`}{' '}
                        docs
                      </span>
                    )}
                    {showCoa && coaSummary.total > 0 && (
                      <span
                        title={`${coaSummary.total} conditions of approval (${coaSummary.open} open)`}
                        style={{
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: 'var(--radius-full)',
                          backgroundColor: coaAllResolved
                            ? 'rgba(74,222,128,0.15)'
                            : 'rgba(251,191,36,0.15)',
                          color: coaAllResolved ? 'var(--color-success)' : 'var(--color-warning)',
                          border: `1px solid ${
                            coaAllResolved ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'
                          }`,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {coaAllResolved ? '✓' : `${coaSummary.open} open`} COA
                      </span>
                    )}
                  </div>
                )}

                {/* Tooltip / popover */}
                {isTooltipOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      marginTop: '8px',
                      zIndex: 100,
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-lg)',
                      padding: 'var(--spacing-md)',
                      minWidth: '200px',
                      maxWidth: '260px',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      textAlign: 'left',
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p
                      style={{
                        margin: '0 0 6px',
                        fontWeight: 'var(--font-weight-semibold)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {stage.display_name}
                    </p>
                    <p
                      style={{
                        margin: '0 0 8px',
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-secondary)',
                        textTransform: 'capitalize',
                      }}
                    >
                      Type: {stage.stage_type.replace(/_/g, ' ')}
                    </p>
                    {stage.roles && stage.roles.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <p
                          style={{
                            margin: '0 0 4px',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                          }}
                        >
                          Required roles
                        </p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
                          {stage.roles
                            .filter((r) => r.is_required)
                            .map((r, k) => (
                              <span
                                key={k}
                                style={{
                                  fontSize: '10px',
                                  padding: '1px 7px',
                                  borderRadius: 'var(--radius-full)',
                                  backgroundColor: 'var(--color-bg-tertiary)',
                                  border: '1px solid var(--color-border-default)',
                                }}
                              >
                                {r.role_key.replace(/-/g, ' ')}
                              </span>
                            ))}
                        </div>
                      </div>
                    )}
                    {reqRequired.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <p
                          style={{
                            margin: '0 0 4px',
                            fontSize: 'var(--font-size-xs)',
                            color: 'var(--color-text-tertiary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                          }}
                        >
                          Documents ({reqMet}/{reqRequired.length} met)
                        </p>
                        {stageDocReqs.map((req, k) => (
                          <p
                            key={k}
                            style={{
                              margin: '2px 0',
                              fontSize: '10px',
                              color: req.fulfilled
                                ? 'var(--color-success)'
                                : req.is_required
                                  ? 'var(--color-warning)'
                                  : 'var(--color-text-secondary)',
                            }}
                          >
                            {req.fulfilled ? '✓' : req.is_required ? '○' : '–'}{' '}
                            {req.document_type.replace(/-/g, ' ')}
                            {req.is_required ? '' : ' (optional)'}
                          </p>
                        ))}
                      </div>
                    )}
                    {showCoa && coaSummary.total > 0 && (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        COA: {coaSummary.total} total — {coaSummary.open} open,{' '}
                        {coaSummary.resolved} resolved
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Connector line (not after last stage) */}
              {i < stages.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    marginTop: '13px',
                    backgroundColor: isDone
                      ? 'var(--color-success)'
                      : 'var(--color-border-default)',
                    borderTop: isFuture ? '2px dashed var(--color-border-default)' : 'none',
                    minWidth: '16px',
                    transition: 'background-color 0.2s',
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Static fallback while workflow data loads ────────────────────────────────

const FALLBACK_STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'internal_review', label: 'Internal Review' },
  { key: 'drm_review', label: 'DRM Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'finalized', label: 'Finalized' },
];

const FALLBACK_ORDER = [
  'draft',
  'ai_review',
  'internal_review',
  'drm_review',
  'approved',
  'finalized',
];

function FallbackTracker({ currentStage, reviewAssignments = [] }) {
  const currentIdx = FALLBACK_ORDER.indexOf(currentStage);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0',
        overflowX: 'auto',
        paddingBottom: '4px',
      }}
    >
      {FALLBACK_STAGES.map((stage, i) => {
        const stageIdx = FALLBACK_ORDER.indexOf(stage.key);
        const isDone = currentIdx > stageIdx;
        const isCurrent =
          stage.key === currentStage || (currentStage === 'ai_review' && stage.key === 'draft');
        const isFuture = !isDone && !isCurrent;

        const stageKey = stage.key === 'internal_review' ? 'internal-review' : 'drm-approval';
        const stageAssignments = reviewAssignments.filter((a) => a.stage === stageKey);

        return (
          <div
            key={stage.key}
            style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'var(--font-weight-semibold)',
                  border: '2px solid',
                  borderColor: isDone
                    ? 'var(--color-success)'
                    : isCurrent
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-border-default)',
                  backgroundColor: isDone
                    ? 'var(--color-success)'
                    : isCurrent
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-bg-primary)',
                  color: isDone || isCurrent ? '#fff' : 'var(--color-text-tertiary)',
                  boxShadow: isCurrent ? '0 0 0 3px rgba(124,58,237,0.2)' : 'none',
                }}
              >
                {isDone ? '✓' : i + 1}
              </div>
              <span
                style={{
                  marginTop: '6px',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: isCurrent ? 'var(--font-weight-semibold)' : 'normal',
                  color: isDone
                    ? 'var(--color-success)'
                    : isCurrent
                      ? 'var(--color-accent-purple, #7c3aed)'
                      : 'var(--color-text-tertiary)',
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '90px',
                }}
              >
                {stage.label}
              </span>
              {stageAssignments.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                    marginTop: '4px',
                  }}
                >
                  {stageAssignments.map((a, j) => {
                    const decisionColor =
                      a.decision === 'approved' || a.decision === 'approved-with-conditions'
                        ? 'var(--color-success)'
                        : a.decision === 'rejected'
                          ? 'var(--color-error)'
                          : a.status === 'in_progress'
                            ? 'var(--color-warning)'
                            : 'var(--color-text-tertiary)';
                    return (
                      <span
                        key={j}
                        title={`${a.display_name}: ${a.decision || a.status}`}
                        style={{
                          fontSize: '10px',
                          color: decisionColor,
                          whiteSpace: 'nowrap',
                          maxWidth: '80px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {a.decision === 'approved' || a.decision === 'approved-with-conditions'
                          ? '✓'
                          : a.decision === 'rejected'
                            ? '✗'
                            : '●'}{' '}
                        {a.display_name}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
            {i < FALLBACK_STAGES.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  marginTop: '13px',
                  backgroundColor: isDone ? 'var(--color-success)' : 'var(--color-border-default)',
                  borderTop: isFuture ? '2px dashed var(--color-border-default)' : 'none',
                  minWidth: '16px',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
