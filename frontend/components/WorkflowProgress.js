/**
 * WorkflowProgress — dynamic horizontal workflow stepper driven by the SoW's
 * workflow snapshot (GET /api/workflow/sow/{sowId}).
 *
 * Renders two visual primitives:
 *   • Circle — sequential stage (draft, review, approval, terminal)
 *   • Beveled square — parallel group (gateway + branches collapsed)
 *
 * Props
 * -----
 * sowId             number|string   — SoW integer ID (required)
 * currentStage      string          — current stage key (e.g. "internal_review")
 * reviewAssignments array           — from GET /api/review/{sowId}/status assignments
 * refreshKey        any             — change this to force re-fetch of workflow/coa/doc data
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { buildTimelineWithGroups } from '../lib/workflowStages';

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function isFailureBranch(stage) {
  if (!stage) return false;
  if (stage.config?.is_failure === true) return true;
  if (stage.stage_type === 'terminal' && (stage.stage_order ?? 1) <= 0) return true;
  return false;
}

// ── Main component ──────────────────────────────────────────────────────────

export default function WorkflowProgress({
  sowId,
  currentStage,
  reviewAssignments = [],
  refreshKey = 0,
}) {
  const { authFetch } = useAuth();
  const [workflowData, setWorkflowData] = useState(null);
  const [parallelBranches, setParallelBranches] = useState(null);
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
        if (!cancelled && data) {
          setWorkflowData(data.workflow_data);
          setParallelBranches(data.parallel_branches || null);
        }
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

  // Build the grouped timeline.
  const timeline = useMemo(() => buildTimelineWithGroups(workflowData), [workflowData]);

  // All stages for reference lookups.
  const allStages = useMemo(() => {
    if (!workflowData) return [];
    return [...(workflowData.stages || [])].sort(
      (a, b) => (a.stage_order || 0) - (b.stage_order || 0)
    );
  }, [workflowData]);

  if (!workflowData) {
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
        Loading workflow...
      </div>
    );
  }

  const currentStageObj = allStages.find((s) => s.stage_key === currentStage);
  const currentIsBranch = currentStageObj ? isFailureBranch(currentStageObj) : false;
  const currentOrder = currentStageObj?.stage_order ?? 0;

  const transitionsFromCurrent = (workflowData.transitions || [])
    .filter((t) => (t.from_stage || t.from) === currentStage)
    .map((t) => t.to_stage || t.to);

  /**
   * Determine the effective stage_order for a timeline item.
   * For parallel groups, use the gateway's stage_order.
   */
  function itemOrder(item) {
    return item.type === 'parallel_group'
      ? (item.gateway.stage_order ?? 0)
      : (item.stage.stage_order ?? 0);
  }

  /**
   * Check if a timeline item is "done" (before the current stage).
   */
  function isItemDone(item) {
    if (currentIsBranch) return false;
    if (item.type === 'parallel_group') {
      // Group is done if current stage is past the gateway AND past all branches.
      const maxBranchOrder = Math.max(
        item.gateway.stage_order ?? 0,
        ...item.branches.map((b) => b.stage.stage_order ?? 0)
      );
      return currentOrder > maxBranchOrder;
    }
    return item.stage.stage_order < currentOrder;
  }

  /**
   * Check if a timeline item is "current".
   */
  function isItemCurrent(item) {
    if (currentIsBranch) return false;
    if (item.type === 'parallel_group') {
      if (item.gateway.stage_key === currentStage) return true;
      return item.branches.some((b) => b.stage.stage_key === currentStage);
    }
    return item.stage.stage_key === currentStage;
  }

  return (
    <div>
      {/* Branch banner */}
      {currentIsBranch && currentStageObj && (
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
          flexWrap: 'wrap',
          rowGap: 'var(--spacing-xl)',
          paddingBottom: '4px',
        }}
        ref={tooltipRef}
      >
        {timeline.map((item, i) => {
          const isDone = isItemDone(item);
          const isCurrent = isItemCurrent(item);
          const isFuture = !isDone && !isCurrent;

          return (
            <div
              key={item.type === 'parallel_group' ? item.gateway.stage_key : item.stage.stage_key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                flex: item.type === 'parallel_group' ? '1.5 1 180px' : '1 1 140px',
                minWidth: item.type === 'parallel_group' ? '160px' : '120px',
              }}
            >
              {item.type === 'parallel_group' ? (
                <ParallelGroupNode
                  group={item}
                  isDone={isDone}
                  isCurrent={isCurrent}
                  parallelBranches={parallelBranches}
                  reviewAssignments={reviewAssignments}
                  attachmentReqs={attachmentReqs}
                  coaSummary={coaSummary}
                  activeTooltip={activeTooltip}
                  onTooltipToggle={(key) => setActiveTooltip(activeTooltip === key ? null : key)}
                  allStages={allStages}
                  workflowData={workflowData}
                  currentStage={currentStage}
                />
              ) : (
                <StageCircleNode
                  stage={item.stage}
                  index={i}
                  isDone={isDone}
                  isCurrent={isCurrent}
                  reviewAssignments={reviewAssignments}
                  attachmentReqs={attachmentReqs}
                  coaSummary={coaSummary}
                  activeTooltip={activeTooltip}
                  onTooltipToggle={(key) => setActiveTooltip(activeTooltip === key ? null : key)}
                  allStages={allStages}
                  transitionsFromCurrent={isCurrent ? transitionsFromCurrent : null}
                />
              )}

              {/* Connector line */}
              {i < timeline.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: '2px',
                    marginTop: item.type === 'parallel_group' ? '17px' : '13px',
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

      {/* Branch stages sidebar */}
      {currentIsBranch && currentStageObj && (
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

// ── StageCircleNode ─────────────────────────────────────────────────────────

function StageCircleNode({
  stage,
  index,
  isDone,
  isCurrent,
  reviewAssignments,
  attachmentReqs,
  coaSummary,
  activeTooltip,
  onTooltipToggle,
  allStages,
  transitionsFromCurrent,
}) {
  const assignMatch = matchingAssignmentKeys(stage);
  const stageAssignments = reviewAssignments.filter((a) => assignMatch.has(a.stage));

  const stageDocReqs = (attachmentReqs?.requirements || []).filter(
    (r) => r.stage_key === stage.stage_key
  );
  const reqRequired = stageDocReqs.filter((r) => r.is_required);
  const reqMet = reqRequired.filter((r) => r.fulfilled).length;
  const showDocBadge = reqRequired.length > 0 && (isDone || isCurrent);

  const showCoa = coaSummary && coaSummary.total > 0 && (isDone || isCurrent);
  const coaAllResolved = coaSummary && coaSummary.open === 0 && coaSummary.in_progress === 0;

  const isTooltipOpen = activeTooltip === stage.stage_key;

  return (
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
      onClick={() => onTooltipToggle(stage.stage_key)}
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
        {isDone ? '✓' : index + 1}
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
                  reqMet >= reqRequired.length ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
                color:
                  reqMet >= reqRequired.length ? 'var(--color-success)' : 'var(--color-warning)',
                border: `1px solid ${
                  reqMet >= reqRequired.length ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'
                }`,
                whiteSpace: 'nowrap',
              }}
            >
              {reqMet >= reqRequired.length ? '✓' : `${reqMet}/${reqRequired.length}`} docs
            </span>
          )}
          {showCoa && (
            <span
              title={`${coaSummary.total} conditions of approval (${coaSummary.open} open)`}
              style={{
                fontSize: '9px',
                padding: '1px 5px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: coaAllResolved ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)',
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

      {/* Tooltip */}
      {isTooltipOpen && (
        <StageTooltip
          stage={stage}
          isCurrent={isCurrent}
          reqRequired={reqRequired}
          stageDocReqs={stageDocReqs}
          reqMet={reqMet}
          coaSummary={showCoa ? coaSummary : null}
          transitionsFromCurrent={transitionsFromCurrent}
          allStages={allStages}
          stageAssignments={stageAssignments}
        />
      )}
    </div>
  );
}

// ── ParallelGroupNode (beveled square) ──────────────────────────────────────

const TEAL = '#0d9488';
const TEAL_BG = 'rgba(13,148,136,0.1)';

function ParallelGroupNode({
  group,
  isDone,
  isCurrent,
  parallelBranches,
  reviewAssignments,
  attachmentReqs,
  coaSummary,
  activeTooltip,
  onTooltipToggle,
  allStages,
  workflowData,
  currentStage,
}) {
  const tooltipKey = `pg-${group.gateway.stage_key}`;
  const isTooltipOpen = activeTooltip === tooltipKey;

  // Per-branch runtime status from parallel_branches JSONB.
  const branchStatuses = group.branches.map((b) => ({
    ...b,
    runtime: parallelBranches?.[b.stage.stage_key] || (isDone ? 'completed' : 'pending'),
  }));

  // Collect all reviewer assignments across branches.
  const allBranchAssignments = group.branches.flatMap((b) => {
    const keys = matchingAssignmentKeys(b.stage);
    return reviewAssignments.filter((a) => keys.has(a.stage));
  });

  return (
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
      onClick={() => onTooltipToggle(tooltipKey)}
    >
      {/* Beveled square */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '4px 12px 4px 12px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '11px',
          fontWeight: 'var(--font-weight-bold)',
          letterSpacing: '1.5px',
          border: '2px solid',
          borderColor: isDone
            ? 'var(--color-success)'
            : isCurrent
              ? 'var(--color-accent-purple, #7c3aed)'
              : TEAL,
          backgroundColor: isDone
            ? 'var(--color-success)'
            : isCurrent
              ? 'var(--color-accent-purple, #7c3aed)'
              : TEAL_BG,
          color: isDone || isCurrent ? '#fff' : TEAL,
          boxShadow: isCurrent ? '0 0 0 3px rgba(124,58,237,0.2)' : 'none',
          transition: 'all 0.2s',
        }}
      >
        {isDone ? '✓' : '|||'}
      </div>

      {/* Gateway label */}
      <span
        style={{
          marginTop: '6px',
          fontSize: 'var(--font-size-xs)',
          fontWeight: isCurrent ? 'var(--font-weight-semibold)' : 'normal',
          color: isDone
            ? 'var(--color-success)'
            : isCurrent
              ? 'var(--color-accent-purple, #7c3aed)'
              : TEAL,
          textAlign: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '120px',
        }}
      >
        {group.gateway.display_name || 'Parallel'}
      </span>

      {/* Branch list (at a glance) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          marginTop: '4px',
        }}
      >
        {branchStatuses.map((b, j) => {
          const rt = b.runtime;
          const branchAssignKeys = matchingAssignmentKeys(b.stage);
          const branchAssigns = reviewAssignments.filter((a) => branchAssignKeys.has(a.stage));

          // Pick a single summary indicator for the branch.
          const hasApproval = branchAssigns.some(
            (a) => a.decision === 'approved' || a.decision === 'approved-with-conditions'
          );
          const hasRejection = branchAssigns.some((a) => a.decision === 'rejected');
          const branchColor =
            rt === 'completed' || hasApproval
              ? 'var(--color-success)'
              : hasRejection
                ? 'var(--color-error)'
                : rt === 'active'
                  ? TEAL
                  : 'var(--color-text-tertiary)';
          const branchIcon = rt === 'completed' || hasApproval ? '✓' : hasRejection ? '✗' : '●';

          return (
            <span
              key={j}
              title={`${b.stage.display_name}: ${rt}`}
              style={{
                fontSize: '10px',
                color: branchColor,
                whiteSpace: 'nowrap',
                maxWidth: '110px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontWeight: b.stage.stage_key === currentStage ? 700 : 400,
              }}
            >
              {branchIcon} {b.stage.display_name}
            </span>
          );
        })}
      </div>

      {/* Tooltip */}
      {isTooltipOpen && (
        <ParallelGroupTooltip
          group={group}
          branchStatuses={branchStatuses}
          isCurrent={isCurrent}
          reviewAssignments={reviewAssignments}
          attachmentReqs={attachmentReqs}
          coaSummary={coaSummary}
          allStages={allStages}
          workflowData={workflowData}
        />
      )}
    </div>
  );
}

// ── StageTooltip (unchanged from original) ──────────────────────────────────

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

// ── ParallelGroupTooltip ────────────────────────────────────────────────────

function ParallelGroupTooltip({
  group,
  branchStatuses,
  isCurrent,
  reviewAssignments,
  attachmentReqs,
  coaSummary,
  allStages,
  workflowData,
}) {
  const stageByKey = new Map(allStages.map((s) => [s.stage_key, s]));
  const joinStage = group.joinTarget ? stageByKey.get(group.joinTarget) : null;
  const joinMode = joinStage?.config?.join_mode || 'default';

  const JOIN_MODE_LABELS = {
    default: 'Single predecessor',
    all_required: 'All branches required',
    any_required: 'Any branch sufficient',
    custom: 'Custom selection',
  };

  // Transitions from the join target (next stages after this parallel group).
  const nextFromJoin = group.joinTarget
    ? (workflowData.transitions || [])
        .filter((t) => t.from_stage === group.joinTarget)
        .filter((t) => {
          const c = t.condition || 'default';
          return c === 'default' || c === 'on_approve';
        })
        .map((t) => t.to_stage)
    : [];

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
        minWidth: '260px',
        maxWidth: '340px',
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
        {group.gateway.display_name || 'Parallel Gateway'}
      </p>
      <p
        style={{
          margin: '0 0 8px',
          fontSize: 'var(--font-size-xs)',
          color: TEAL,
          fontWeight: 600,
        }}
      >
        Parallel Group — {group.branches.length} branches
      </p>

      {/* Per-branch details */}
      {branchStatuses.map((b, j) => {
        const branchRoles = (b.stage.roles || []).filter((r) => r.is_required);
        const branchAssignKeys = matchingAssignmentKeys(b.stage);
        const branchAssigns = reviewAssignments.filter((a) => branchAssignKeys.has(a.stage));
        const rt = b.runtime;
        const rtColor =
          rt === 'completed'
            ? 'var(--color-success)'
            : rt === 'active'
              ? TEAL
              : 'var(--color-text-tertiary)';

        return (
          <div
            key={j}
            style={{
              marginBottom: '8px',
              padding: '6px 8px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border-subtle, var(--color-border-default))',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '4px',
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: rtColor,
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: '11px', fontWeight: 600 }}>{b.stage.display_name}</span>
              <span
                style={{
                  fontSize: '9px',
                  padding: '1px 6px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor:
                    rt === 'completed'
                      ? 'rgba(74,222,128,0.15)'
                      : rt === 'active'
                        ? 'rgba(13,148,136,0.15)'
                        : 'var(--color-bg-secondary)',
                  color: rtColor,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.3px',
                  marginLeft: 'auto',
                }}
              >
                {rt}
              </span>
            </div>

            {branchRoles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px', marginBottom: '3px' }}>
                {branchRoles.map((r, k) => (
                  <span
                    key={k}
                    style={{
                      fontSize: '9px',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border-default)',
                    }}
                  >
                    {r.role_key.replace(/-/g, ' ')}
                  </span>
                ))}
              </div>
            )}

            {branchAssigns.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                {branchAssigns.map((a, k) => {
                  const decColor =
                    a.decision === 'approved' || a.decision === 'approved-with-conditions'
                      ? 'var(--color-success)'
                      : a.decision === 'rejected'
                        ? 'var(--color-error)'
                        : 'var(--color-text-tertiary)';
                  return (
                    <span key={k} style={{ fontSize: '9px', color: decColor }}>
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
        );
      })}

      {/* Join info */}
      {joinStage && (
        <TooltipSection title="Converges to">
          <p style={{ margin: 0, fontSize: '10px', color: 'var(--color-text-secondary)' }}>
            → {joinStage.display_name}
          </p>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '9px',
              color: 'var(--color-text-tertiary)',
              fontStyle: 'italic',
            }}
          >
            Join mode: {JOIN_MODE_LABELS[joinMode] || joinMode}
          </p>
        </TooltipSection>
      )}

      {/* Next stages after join */}
      {isCurrent && nextFromJoin.length > 0 && (
        <TooltipSection title="After convergence">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
            {nextFromJoin.map((t, k) => (
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

// ── TooltipSection ──────────────────────────────────────────────────────────

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
