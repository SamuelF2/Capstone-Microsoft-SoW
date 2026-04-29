/**
 * ProposalsStatsBar — five KPI tiles across the top of the dashboard.
 *
 * Counts are derived client-side from the full proposal list because the
 * dataset is small (one node per (kind, label) across all docs). "Today"
 * and "this week" use the user's local timezone via `startOfToday` /
 * `startOfWeek` helpers — a proposal whose `reviewed_at` falls on or
 * after the boundary counts.
 */

import { useMemo } from 'react';
import { proposalStatus, startOfToday, startOfWeek } from './proposalUtils';

function StatTile({ label, count, color }) {
  return (
    <div
      style={{
        flex: '1 1 140px',
        padding: 'var(--spacing-md) var(--spacing-lg)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border-default)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          fontSize: '1.75rem',
          fontWeight: 'var(--font-weight-bold)',
          color,
          lineHeight: 1,
        }}
      >
        {count}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-xs)',
          color: 'var(--color-text-secondary)',
          marginTop: '4px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export default function ProposalsStatsBar({ proposals }) {
  const counts = useMemo(() => {
    const today = startOfToday();
    const week = startOfWeek();
    let pending = 0;
    let approvedToday = 0;
    let rejectedToday = 0;
    let approvedWeek = 0;
    let rejectedWeek = 0;
    for (const p of proposals) {
      const status = proposalStatus(p);
      if (status === 'pending') pending += 1;
      if (!p.reviewed_at) continue;
      const reviewedAt = new Date(p.reviewed_at);
      if (Number.isNaN(reviewedAt.getTime())) continue;
      if (status === 'accepted') {
        if (reviewedAt >= today) approvedToday += 1;
        if (reviewedAt >= week) approvedWeek += 1;
      } else if (status === 'rejected') {
        if (reviewedAt >= today) rejectedToday += 1;
        if (reviewedAt >= week) rejectedWeek += 1;
      }
    }
    return { pending, approvedToday, rejectedToday, approvedWeek, rejectedWeek };
  }, [proposals]);

  return (
    <div
      style={{
        display: 'flex',
        gap: 'var(--spacing-md)',
        marginBottom: 'var(--spacing-xl)',
        flexWrap: 'wrap',
      }}
    >
      <StatTile label="Pending" count={counts.pending} color="var(--color-info)" />
      <StatTile label="Approved today" count={counts.approvedToday} color="var(--color-success)" />
      <StatTile label="Rejected today" count={counts.rejectedToday} color="var(--color-error)" />
      <StatTile
        label="Approved this week"
        count={counts.approvedWeek}
        color="rgba(74,222,128,0.75)"
      />
      <StatTile
        label="Rejected this week"
        count={counts.rejectedWeek}
        color="rgba(239,68,68,0.75)"
      />
    </div>
  );
}
