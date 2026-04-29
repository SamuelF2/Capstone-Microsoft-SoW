/**
 * ProposalDetailDrawer — modal showing the full proposal record.
 *
 * Opened from a row click in the queue or a node click in the graph view.
 * Surfaces the long-form description, all timestamps + reviewed_by, source
 * doc & section, tags, the reviewer note, and a confidence progress bar.
 *
 * The same Approve / Reject handlers passed down to the table are reused
 * here so the action surface is consistent. When a write is in flight the
 * buttons disable and the spinner is implicit (parent owns the busy set).
 */

import Modal from '../Modal';
import { confidenceBadge, AUTO_ACCEPT_THRESHOLD } from '../../lib/confidence';
import { KIND_STYLES, STATUS_STYLES, proposalStatus, formatRelative } from './proposalUtils';

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-primary)' }}>
        {children ?? <em style={{ color: 'var(--color-text-tertiary)' }}>—</em>}
      </span>
    </div>
  );
}

export default function ProposalDetailDrawer({
  proposal,
  open,
  onClose,
  onApprove,
  onReject,
  busy,
}) {
  if (!proposal) return null;
  const status = proposalStatus(proposal);
  const kindStyle = KIND_STYLES[proposal.kind] || KIND_STYLES.node;
  const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.pending;
  const badge = confidenceBadge(proposal.confidence);
  const autoAccepted = proposal.accepted && proposal.confidence >= AUTO_ACCEPT_THRESHOLD;

  return (
    <Modal open={open} onClose={onClose} maxWidth="720px" ariaLabel="Proposal details">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              backgroundColor: kindStyle.bg,
              color: kindStyle.color,
            }}
          >
            {kindStyle.icon} {kindStyle.label}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--font-size-2xl)',
              fontFamily: proposal.kind === 'edge' ? 'var(--font-family-mono)' : undefined,
              color: 'var(--color-text-primary)',
            }}
          >
            {proposal.label}
          </h2>
          <span
            style={{
              marginLeft: 'auto',
              padding: '3px 12px',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              backgroundColor: statusStyle.bg,
              color: statusStyle.color,
            }}
          >
            {statusStyle.label}
          </span>
        </div>

        {/* Confidence bar */}
        {badge && (
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 'var(--font-size-xs)',
                color: 'var(--color-text-secondary)',
                marginBottom: 4,
              }}
            >
              <span>Confidence</span>
              <span style={{ color: badge.color, fontWeight: 'var(--font-weight-semibold)' }}>
                {Math.round(proposal.confidence * 100)}%{autoAccepted ? ' · auto-accepted' : ''}
              </span>
            </div>
            <div
              className="progress"
              style={{ height: 6, backgroundColor: 'var(--color-bg-tertiary)' }}
            >
              <div
                style={{
                  width: `${Math.round(proposal.confidence * 100)}%`,
                  height: '100%',
                  backgroundColor: badge.color,
                  borderRadius: 'var(--radius-full)',
                  transition: 'width var(--transition-base)',
                }}
              />
            </div>
          </div>
        )}

        {/* Description */}
        {proposal.description && (
          <Field label="Description">
            <p
              style={{
                margin: 0,
                lineHeight: 1.5,
                color: 'var(--color-text-primary)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {proposal.description}
            </p>
          </Field>
        )}

        {/* Two-column meta grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 'var(--spacing-md)',
          }}
        >
          <Field label="Source document">{proposal.source}</Field>
          <Field label="Source section">{proposal.source_section}</Field>
          <Field label="Usage count">{proposal.uses ?? 0}</Field>
          <Field label="Proposed">
            {proposal.proposed_at
              ? `${formatRelative(proposal.proposed_at)} · ${new Date(proposal.proposed_at).toLocaleString()}`
              : null}
          </Field>
          {proposal.reviewed_at && (
            <>
              <Field label="Reviewed by">{proposal.reviewed_by}</Field>
              <Field label="Reviewed at">
                {`${formatRelative(proposal.reviewed_at)} · ${new Date(proposal.reviewed_at).toLocaleString()}`}
              </Field>
            </>
          )}
        </div>

        {/* Tags */}
        {proposal.tags && proposal.tags.length > 0 && (
          <Field label="Tags">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {proposal.tags.map((t) => (
                <span
                  key={t}
                  style={{
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border-default)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </Field>
        )}

        {/* Note */}
        {proposal.note && <Field label="Reviewer note">{proposal.note}</Field>}

        {/* Footer actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--spacing-sm)',
            paddingTop: 'var(--spacing-md)',
            borderTop: '1px solid var(--color-border-default)',
          }}
        >
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => onReject(proposal.id)}
            disabled={busy || status === 'rejected'}
          >
            ✗ Reject
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            onClick={() => onApprove(proposal.id)}
            disabled={busy || status === 'accepted'}
          >
            ✓ Approve
          </button>
        </div>
      </div>
    </Modal>
  );
}
