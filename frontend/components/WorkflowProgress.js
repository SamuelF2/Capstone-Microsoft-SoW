/**
 * WorkflowProgress — dynamic horizontal workflow stepper driven by the SoW's
 * workflow snapshot (GET /api/workflow/sow/{sowId}).
 *
 * Unlike the legacy ReviewStatusTracker, this component does not assume any
 * particular set of stages, stage names, or stage types. Everything it
 * renders — stages, ordering, roles, COA/document badges, rejected/failure
 * branches — is derived from the snapshot.
 *
 * Props
 * -----
 * sowId             number|string   — SoW integer ID (required)
 * currentStage      string          — current stage key (e.g. "internal_review")
 * reviewAssignments array           — from GET /api/review/{sowId}/status assignments
 * refreshKey        any             — change this to force re-fetch of workflow/coa/doc data
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../lib/auth';

/**
 * Return the set of assignment stage keys that correspond to a workflow
 * stage. Custom stages can opt in via `config.assignment_stage_keys`; for
 * legacy default stages we also try the stage_key itself and the
 * underscore→hyphen form so reviews created under the old naming are picked
 * up.
 */
function matchingAssignmentKeys(stage) {
  const keys = new Set();
  const mapped = stage?.config?.assignment_stage_keys;
  if (Array.isArray(mapped)) mapped.forEach((k) => keys.add(k));
  if (stage?.stage_key) {
    keys.add(stage.stage_key);
    keys.add(stage.stage_key.replace(/_/g, '-'));
  }
  return keys;
}

/**
 * A stage is considered a failure/branch terminal if it's explicitly flagged
 * in config, or has stage_type=terminal with stage_order <= 0. These are
 * rendered as a side branch instead of inline on the main timeline.
 */
function isFailureBranch(stage) {
  if (!stage) return false;
  if (stage.config?.is_failure === true) return true;
  if (stage.stage_type === 'terminal' && (stage.stage_order ?? 1) <= 0) return true;
  return false;
}

export default function WorkflowProgress({
  sowId,
  currentStage,
  reviewAssignments = [],
  refreshKey = 0,
}) {
  const { authFetch } = useAuth();
  const [workflowData, setWorkflowData] = useState(null);
  const [coaSummary, setCoaSummary] = useState(null);
  const [attachmentReqs, setAttachmentReqs] = useState(null);
  const [activeTooltip, setActiveTooltip] = useState(null);
  const tooltipRef = useRef(null);

  // Re-fetch whenever the SoW, the stage, or an explicit refreshKey changes.
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
  }, [sowId, currentStage, refreshKey, authFetch]);

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

  if (!workflowData) {
    // Lightweight skeleton — no hard-coded stages.
    return (
      <div
        style={{
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--font-size-xs)',
        }}
      >
        Loading workflow…
      </div>
    );
  }

  // Partition stages into the inline timeline and any failure branches.
  const allStages = [...(workflowData.stages || [])].sort((a, b) => a.stage_order - b.stage_order);
  const timelineStages = allStages.filter((s) => !isFailureBranch(s));
  const branchStages = allStages.filter(isFailureBranch);

  const currentStageObj = allStages.find((s) => s.stage_key === currentStage);
  const currentIsBranch = currentStageObj ? isFailureBranch(currentStageObj) : false;
  const currentOrder = currentStageObj?.stage_order ?? 0;

  const transitionsFromCurrent = (workflowData.transitions || [])
    .filter((t) => (t.from_stage || t.from) === currentStage)
    .map((t) => t.to_stage || t.to);

  return (
    <div>
      {/* Branch banner — shown when the SoW is currently in a failure stage */}
      {currentIsBranch && (
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
          ✗ {currentStageObj.display_name} — revisions required
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
        {timelineStages.map((stage, i) => {
          const isDone = !currentIsBranch && stage.stage_order < currentOrder;
          const isCurrent = !currentIsBranch && stage.stage_key === currentStage;
          const isFuture = !isDone && !isCurrent;

          // Match review assignments using the config mapping.
          const assignMatch = matchingAssignmentKeys(stage);
          const stageAssignments = reviewAssignments.filter((a) => assignMatch.has(a.stage));

          // Document requirements for this stage.
          const stageDocReqs = (attachmentReqs?.requirements || []).filter(
            (r) => r.stage_key === stage.stage_key
          );
          const reqRequired = stageDocReqs.filter((r) => r.is_required);
          const reqMet = reqRequired.filter((r) => r.fulfilled).length;
          const showDocBadge = reqRequired.length > 0 && (isDone || isCurrent);

          // COA badge — any stage with non-zero COAs shown on current/completed stages.
          // (Dropped stage_type gating so custom workflows still surface COAs.)
          const showCoa = coaSummary && coaSummary.total > 0 && (isDone || isCurrent);
          const coaAllResolved =
            coaSummary && coaSummary.open === 0 && coaSummary.in_progress === 0;

          const isTooltipOpen = activeTooltip === stage.stage_key;

          return (
            <div
              key={stage.stage_key}
              style={{ display: 'flex', alignItems: 'flex-start', flex: 1, minWidth: 0 }}
            >
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

                {/* Reviewer list */}
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
                    {showCoa && (
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
                  <StageTooltip
                    stage={stage}
                    isCurrent={isCurrent}
                    reqRequired={reqRequired}
                    stageDocReqs={stageDocReqs}
                    reqMet={reqMet}
                    coaSummary={showCoa ? coaSummary : null}
                    transitionsFromCurrent={isCurrent ? transitionsFromCurrent : null}
                    branchStages={branchStages}
                    allStages={allStages}
                    stageAssignments={stageAssignments}
                  />
                )}
              </div>

              {/* Connector line */}
              {i < timelineStages.length - 1 && (
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

      {/* Branch stages sidebar — only shown when the SoW is currently on one */}
      {currentIsBranch && branchStages.length > 0 && (
        <div
          style={{
            marginTop: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Branch stage:{' '}
          <strong style={{ color: 'var(--color-error)' }}>{currentStageObj.display_name}</strong>
        </div>
      )}
    </div>
  );
}

// ── Tooltip ──────────────────────────────────────────────────────────────────

function StageTooltip({
  stage,
  isCurrent,
  reqRequired,
  stageDocReqs,
  reqMet,
  coaSummary,
  transitionsFromCurrent,
  allStages,
  stageAssignments,
}) {
  const requiredRoles = (stage.roles || []).filter((r) => r.is_required);
  const pendingAssignments = stageAssignments.filter(
    (a) => !a.decision && a.status !== 'completed'
  );
  const stageByKey = new Map(allStages.map((s) => [s.stage_key, s]));

  return (
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
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        textAlign: 'left',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <p
        style={{
          margin: '0 0 4px',
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
        Type: {(stage.stage_type || 'review').replace(/_/g, ' ')}
      </p>

      {requiredRoles.length > 0 && (
        <TooltipSection title="Required roles">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {requiredRoles.map((r, k) => (
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
        </TooltipSection>
      )}

      {reqRequired.length > 0 && (
        <TooltipSection title={`Documents (${reqMet}/${reqRequired.length} met)`}>
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
        </TooltipSection>
      )}

      {coaSummary && (
        <TooltipSection title="Conditions of approval">
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-text-secondary)' }}>
            {coaSummary.total} total — {coaSummary.open} open, {coaSummary.in_progress} in progress,{' '}
            {coaSummary.resolved} resolved
          </p>
        </TooltipSection>
      )}

      {isCurrent && pendingAssignments.length > 0 && (
        <TooltipSection title="Waiting on">
          {pendingAssignments.map((a, k) => (
            <p key={k} style={{ margin: '2px 0', fontSize: '10px', color: 'var(--color-warning)' }}>
              ● {a.display_name}
            </p>
          ))}
        </TooltipSection>
      )}

      {isCurrent && transitionsFromCurrent && transitionsFromCurrent.length > 0 && (
        <TooltipSection title="Next possible stages">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {transitionsFromCurrent.map((t, k) => (
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
                → {stageByKey.get(t)?.display_name || t}
              </span>
            ))}
          </div>
        </TooltipSection>
      )}
    </div>
  );
}

function TooltipSection({ title, children }) {
  return (
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
        {title}
      </p>
      {children}
    </div>
  );
}
