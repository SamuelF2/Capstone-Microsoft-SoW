/**
 * pages/review/[id].js
 *
 * Legacy SoW-id-scoped review URL.  The active surface for reviewers is now
 * /review/assignment/{assignmentId} so a single user can independently
 * review multiple roles on the same SoW.  This page exists only as a
 * redirect shim for old links / email notifications: on mount, it looks up
 * the current user's most-relevant pending assignment for the given SoW
 * and forwards to /review/assignment/{id}.
 *
 * Resolution priority for the user's "current" assignment on this SoW:
 *   1. The first non-completed assignment whose stage matches the SoW's
 *      current stage. (User has work to do here right now.)
 *   2. The first non-completed assignment on any stage. (User has pending
 *      work somewhere on this SoW.)
 *   3. The most recent completed assignment. (Read-only review of past
 *      decisions.)
 *
 * If the user has no assignments at all on this SoW we still try to give
 * them a useful destination:
 *   - Author / system-admin → /sow/{id}/manage  (the live-edit dashboard)
 *   - Anyone else           → /my-reviews
 * Terminal SoW statuses (approved/finalized/draft) bounce to their dedicated
 * pages instead.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';

const TERMINAL_STATUSES_REDIRECT = {
  approved: (id) => `/finalize/${id}`,
  finalized: (id) => `/finalize/${id}`,
  draft: (id) => `/draft/${id}`,
};

export default function LegacyReviewRedirect() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id || !user) return;

    let cancelled = false;
    async function resolve() {
      try {
        // Pull the SoW status first so we can short-circuit terminal states
        // and use it to prefer assignments on the current stage.
        const sowRes = await authFetch(`/api/sow/${id}`);
        if (cancelled) return;
        let sowData = null;
        if (sowRes.ok) {
          sowData = await sowRes.json();
          const terminal = TERMINAL_STATUSES_REDIRECT[sowData.status];
          if (terminal) {
            router.replace(terminal(id));
            return;
          }
        }

        // Find the user's assignments for this SoW. /api/review/assigned
        // already filters by current user, so we just need to scan it.
        const assignedRes = await authFetch('/api/review/assigned');
        if (cancelled) return;
        if (!assignedRes.ok) {
          throw new Error(`Failed to load assignments (${assignedRes.status})`);
        }
        const all = await assignedRes.json();
        const mine = all.filter((a) => a.sow_id === parseInt(id, 10));

        if (mine.length === 0) {
          // No assignments — last-resort destination depends on whether
          // the caller is the SoW author. Authors who haven't designated
          // themselves as reviewers (the common case for someone clicking
          // their own SoW from /all-sows) land on the live-edit dashboard
          // instead of an empty My Reviews page.
          try {
            const roleRes = await authFetch(`/api/sow/${id}/my-role`);
            if (cancelled) return;
            if (roleRes.ok) {
              const { role } = await roleRes.json();
              if (role === 'author' || role === 'admin') {
                router.replace(`/sow/${id}/manage`);
                return;
              }
            }
          } catch {
            // Fall through to /my-reviews on any error.
          }
          router.replace('/my-reviews');
          return;
        }

        // Prefer current-stage pending → any pending → most recent completed.
        const currentStageKey = sowData?.status;

        const matchesCurrentStage = (a) => {
          if (!currentStageKey) return false;
          return (
            a.stage === currentStageKey ||
            a.stage === currentStageKey.replace(/_/g, '-') ||
            a.stage.replace(/-/g, '_') === currentStageKey
          );
        };

        const pickedCurrent = mine.find((a) => a.status !== 'completed' && matchesCurrentStage(a));
        const pickedPending = pickedCurrent || mine.find((a) => a.status !== 'completed');
        const picked =
          pickedPending ||
          mine.slice().sort((a, b) => new Date(b.assigned_at) - new Date(a.assigned_at))[0];

        if (picked?.id) {
          router.replace(`/review/assignment/${picked.id}`);
        } else {
          router.replace('/my-reviews');
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to resolve assignment');
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, [id, user, authFetch, router]);

  if (error) {
    return (
      <div style={{ padding: 'var(--spacing-2xl)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-error)', marginBottom: 'var(--spacing-md)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => router.push('/my-reviews')}>
          ← Back to My Reviews
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <Spinner />
    </div>
  );
}
