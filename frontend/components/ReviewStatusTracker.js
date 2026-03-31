/**
 * ReviewStatusTracker — horizontal step indicator showing SoW workflow progress.
 *
 * Props
 * -----
 * currentStatus      string     — SoW status (e.g. "internal_review")
 * reviewAssignments  array      — from GET /api/review/{sow_id}/status assignments field
 */

const STAGES = [
  { key: 'draft', label: 'Draft' },
  { key: 'internal_review', label: 'Internal Review' },
  { key: 'drm_review', label: 'DRM Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'finalized', label: 'Finalized' },
];

const STATUS_ORDER = [
  'draft',
  'ai_review',
  'internal_review',
  'drm_review',
  'approved',
  'finalized',
];

function stageIndex(status) {
  // ai_review is between draft and internal_review for ordering purposes
  return STATUS_ORDER.indexOf(status);
}

export default function ReviewStatusTracker({ currentStatus, reviewAssignments = [] }) {
  const currentIdx = stageIndex(currentStatus);

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
      {STAGES.map((stage, i) => {
        const stageIdx = stageIndex(stage.key);
        const isDone = currentIdx > stageIdx;
        const isCurrent =
          stage.key === currentStatus || (currentStatus === 'ai_review' && stage.key === 'draft');
        const isFuture = !isDone && !isCurrent;

        // Reviewer info for this stage
        const stageKey = stage.key === 'internal_review' ? 'internal-review' : 'drm-approval';
        const stageAssignments = reviewAssignments.filter((a) => a.stage === stageKey);

        return (
          <div
            key={stage.key}
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
              }}
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
                {stage.label}
              </span>

              {/* Reviewer avatars for review stages */}
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

            {/* Connector line (not after last stage) */}
            {i < STAGES.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '2px',
                  marginTop: '13px',
                  backgroundColor: isDone ? 'var(--color-success)' : 'var(--color-border-default)',
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
  );
}
