/**
 * ProposalsTable — schema proposal queue rendered as a table on desktop.
 *
 * Header has a tri-state checkbox that selects every visible row (filtered,
 * not raw — selecting "all" should never select things off-screen). Sort
 * indicators on Confidence / Proposed / Uses headers click to flip
 * direction; other headers are inert.
 *
 * Each row's click handler bubbles to the parent so the parent can open
 * `ProposalDetailDrawer`. Action buttons (✓ / ✗) and the checkbox stop
 * propagation so they don't double-fire as a row click.
 */

import { motion } from 'framer-motion';
import { confidenceBadge, AUTO_ACCEPT_THRESHOLD } from '../../lib/confidence';
import { KIND_STYLES, STATUS_STYLES, proposalStatus, formatRelative } from './proposalUtils';

const TH_STYLE = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-semibold)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-secondary)',
  borderBottom: '1px solid var(--color-border-default)',
  backgroundColor: 'var(--color-bg-secondary)',
};

const TD_STYLE = {
  padding: '12px',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--color-text-primary)',
  borderBottom: '1px solid var(--color-border-default)',
  verticalAlign: 'middle',
};

function SortHeader({ label, sortKey, currentSort, onSortChange }) {
  const isActive = currentSort.startsWith(sortKey + '-');
  const direction = isActive ? currentSort.split('-')[1] : null;
  const handleClick = () => {
    if (!isActive) {
      onSortChange(`${sortKey}-desc`);
    } else {
      onSortChange(`${sortKey}-${direction === 'desc' ? 'asc' : 'desc'}`);
    }
  };
  return (
    <th style={{ ...TH_STYLE, cursor: 'pointer', userSelect: 'none' }} onClick={handleClick}>
      {label}
      {isActive && (
        <span style={{ marginLeft: 6, color: 'var(--color-accent-blue)' }}>
          {direction === 'desc' ? '▼' : '▲'}
        </span>
      )}
    </th>
  );
}

function KindChip({ kind }) {
  const style = KIND_STYLES[kind] || KIND_STYLES.node;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      <span aria-hidden="true">{style.icon}</span>
      {style.label}
    </span>
  );
}

function ConfidencePill({ score, accepted }) {
  const badge = confidenceBadge(score);
  if (!badge) return <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>;
  const autoAccepted = accepted && score >= AUTO_ACCEPT_THRESHOLD;
  return (
    <span
      title={autoAccepted ? 'Auto-accepted (≥ 80%)' : badge.label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        backgroundColor: `${badge.color}1f`, // ~12% alpha
        color: badge.color,
      }}
    >
      {Math.round(score * 100)}%
      {autoAccepted && (
        <span aria-hidden="true" style={{ opacity: 0.85 }}>
          ★
        </span>
      )}
    </span>
  );
}

function StatusPill({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        color: style.color,
        backgroundColor: style.bg,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: style.dot,
        }}
      />
      {style.label}
    </span>
  );
}

function ActionButton({ kind, onClick, disabled }) {
  const palette =
    kind === 'approve'
      ? { bg: 'rgba(74,222,128,0.12)', color: 'var(--color-success)', label: '✓ Approve' }
      : { bg: 'rgba(239,68,68,0.12)', color: 'var(--color-error)', label: '✗ Reject' };
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      disabled={disabled}
      style={{
        padding: '4px 10px',
        borderRadius: 'var(--radius-md)',
        border: `1px solid ${palette.color}`,
        backgroundColor: palette.bg,
        color: palette.color,
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-semibold)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background-color var(--transition-base)',
      }}
    >
      {palette.label}
    </button>
  );
}

export default function ProposalsTable({
  proposals,
  selectedIds,
  onToggle,
  onToggleAll,
  onApprove,
  onReject,
  onRowClick,
  sort,
  onSortChange,
  busyIds,
}) {
  const visibleIds = proposals.map((p) => p.id);
  const visibleSelected = visibleIds.filter((id) => selectedIds.has(id));
  const allChecked = visibleIds.length > 0 && visibleSelected.length === visibleIds.length;
  const someChecked = visibleSelected.length > 0 && !allChecked;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH_STYLE, width: 36 }}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={(el) => {
                  if (el) el.indeterminate = someChecked;
                }}
                onChange={() => onToggleAll(visibleIds, !allChecked)}
                aria-label={allChecked ? 'Deselect all visible' : 'Select all visible'}
              />
            </th>
            <th style={TH_STYLE}>Type</th>
            <th style={TH_STYLE}>Label</th>
            <SortHeader
              label="Confidence"
              sortKey="confidence"
              currentSort={sort}
              onSortChange={onSortChange}
            />
            <th style={TH_STYLE}>Source</th>
            <SortHeader
              label="Uses"
              sortKey="uses"
              currentSort={sort}
              onSortChange={onSortChange}
            />
            <th style={TH_STYLE}>Status</th>
            <SortHeader
              label="Proposed"
              sortKey="date"
              currentSort={sort}
              onSortChange={onSortChange}
            />
            <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {proposals.map((p, idx) => {
            const status = proposalStatus(p);
            const isSelected = selectedIds.has(p.id);
            const isBusy = busyIds?.has?.(p.id);
            return (
              <motion.tr
                key={p.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.15, delay: Math.min(idx * 0.01, 0.2) }}
                onClick={() => onRowClick?.(p.id)}
                style={{
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(0,120,212,0.06)' : 'transparent',
                  transition: 'background-color var(--transition-base)',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = isSelected
                    ? 'rgba(0,120,212,0.06)'
                    : 'transparent';
                }}
              >
                <td style={TD_STYLE} onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggle(p.id)}
                    aria-label={`Select proposal ${p.label}`}
                  />
                </td>
                <td style={TD_STYLE}>
                  <KindChip kind={p.kind} />
                </td>
                <td
                  style={{
                    ...TD_STYLE,
                    fontFamily: p.kind === 'edge' ? 'var(--font-family-mono)' : undefined,
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  {p.label}
                </td>
                <td style={TD_STYLE}>
                  <ConfidencePill score={p.confidence} accepted={p.accepted} />
                </td>
                <td style={{ ...TD_STYLE, color: 'var(--color-text-secondary)' }}>
                  <div
                    style={{
                      maxWidth: 220,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={p.source || ''}
                  >
                    {p.source || '—'}
                  </div>
                  {p.source_section && (
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--color-text-tertiary)',
                      }}
                    >
                      § {p.source_section}
                    </div>
                  )}
                </td>
                <td style={{ ...TD_STYLE, color: 'var(--color-text-secondary)' }}>{p.uses ?? 0}</td>
                <td style={TD_STYLE}>
                  <StatusPill status={status} />
                </td>
                <td style={{ ...TD_STYLE, color: 'var(--color-text-secondary)' }}>
                  {formatRelative(p.proposed_at)}
                </td>
                <td
                  style={{ ...TD_STYLE, textAlign: 'right', whiteSpace: 'nowrap' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: 'inline-flex', gap: 6 }}>
                    <ActionButton
                      kind="approve"
                      onClick={() => onApprove(p.id)}
                      disabled={isBusy || status === 'accepted'}
                    />
                    <ActionButton
                      kind="reject"
                      onClick={() => onReject(p.id)}
                      disabled={isBusy || status === 'rejected'}
                    />
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
