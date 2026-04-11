/**
 * pages/sow/[id]/manage.js
 *
 * Author dashboard for live-editing an in-flight SoW.  Lets the author (or a
 * system-admin) modify reviewer designations, stage configuration, and the
 * workflow structure on a SoW that has already left draft.
 *
 * Sections (top to bottom):
 *   1. Header  — back button, title, status pill, ESAP badge
 *   2. Workflow timeline (`WorkflowProgress`)
 *   3. Reviewer assignments (`ReviewerAssignmentPanel`, live-edit mode)
 *   4. Workflow structure + stage config (`LiveWorkflowEditor`)
 *   5. Recent activity (`ActivityLog`)
 *
 * Access control
 * ──────────────
 * On mount we call `GET /api/sow/{id}/my-role`:
 *   - role === 'author' or 'admin'  → render the dashboard
 *   - any other role                → redirect to `/review/{id}` (read-only
 *                                     reviewer surface)
 *   - 404                           → redirect to `/all-sows`
 *
 * Live edit → save → refresh
 * ──────────────────────────
 * Both the reviewer panel and the workflow editor accept `onSaved` callbacks.
 * On save success we bump `refreshKey` (which forces `WorkflowProgress` to
 * re-fetch its workflow snapshot) and re-fetch `GET /api/sow/{id}` so the
 * status pill reflects any auto-advance triggered by the backend's gating
 * recheck.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { useAuth } from '../../../lib/auth';
import Spinner from '../../../components/Spinner';
import WorkflowProgress from '../../../components/WorkflowProgress';
import ReviewerAssignmentPanel from '../../../components/sow/ReviewerAssignmentPanel';
import LiveWorkflowEditor from '../../../components/sow/LiveWorkflowEditor';
import ActivityLog from '../../../components/ActivityLog';

const STATUS_PILL_STYLE = {
  draft: { bg: 'rgba(251,191,36,0.12)', color: 'var(--color-warning)' },
  ai_review: { bg: 'rgba(59,130,246,0.12)', color: 'var(--color-accent-blue)' },
  internal_review: { bg: 'rgba(124,58,237,0.12)', color: 'var(--color-accent-purple-light)' },
  drm_approval: { bg: 'rgba(124,58,237,0.12)', color: 'var(--color-accent-purple-light)' },
  approved: { bg: 'rgba(34,197,94,0.12)', color: 'var(--color-success)' },
  finalized: { bg: 'rgba(34,197,94,0.12)', color: 'var(--color-success)' },
  rejected: { bg: 'rgba(220,38,38,0.12)', color: 'var(--color-error)' },
};

function humanizeStatus(status) {
  if (!status) return '—';
  return status
    .split(/[_-]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export default function ManageSoWPage() {
  const router = useRouter();
  const { id } = router.query;
  const { user, authFetch } = useAuth();

  const [sow, setSow] = useState(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showActivity, setShowActivity] = useState(true);

  const fetchSow = useCallback(async () => {
    if (!id) return null;
    const res = await authFetch(`/api/sow/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to load SoW (${res.status})`);
    }
    return res.json();
  }, [id, authFetch]);

  // ── Initial gate: my-role + SoW metadata ───────────────────────────────
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;

    (async () => {
      try {
        const roleRes = await authFetch(`/api/sow/${id}/my-role`);
        if (cancelled) return;

        if (roleRes.status === 404) {
          // No access at all — bounce to the SoW list.
          router.replace('/all-sows');
          return;
        }
        if (!roleRes.ok) {
          throw new Error(`Failed to verify access (${roleRes.status})`);
        }
        const { role } = await roleRes.json();

        // Only authors and admins can manage. Other collaborators
        // (approver/reviewer) get redirected to their read-only surface.
        if (role !== 'author' && role !== 'admin') {
          router.replace(`/review/${id}`);
          return;
        }

        setAccessChecked(true);
        const data = await fetchSow();
        if (!cancelled && data) setSow(data);
      } catch (err) {
        if (!cancelled) {
          setAccessDenied(true);
          setLoadError(err.message || 'Failed to load SoW');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, user, authFetch, router, fetchSow]);

  // ── Save callbacks: bump refreshKey and re-fetch SoW for status pill ───
  const handleChildSaved = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    try {
      const data = await fetchSow();
      if (data) setSow(data);
    } catch {
      // Silent — the children already surface their own errors.
    }
  }, [fetchSow]);

  // ── Loading / error states ──────────────────────────────────────────────
  if (!user) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <Spinner message="Loading…" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          padding: 'var(--spacing-2xl)',
          textAlign: 'center',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <h1 className="text-2xl font-semibold mb-md">Unable to open manage view</h1>
        <p className="text-secondary mb-xl">{loadError || 'You do not have access to this SoW.'}</p>
        <Link href="/all-sows" className="btn btn-primary">
          Back to All SoWs
        </Link>
      </div>
    );
  }

  if (!accessChecked || !sow) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <Spinner message="Loading SoW…" />
      </div>
    );
  }

  const pill = STATUS_PILL_STYLE[sow.status] || {
    bg: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };

  return (
    <>
      <Head>
        <title>{sow.title || 'Untitled SoW'} – Manage – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-lg) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            {/* Breadcrumb + back */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <button
                onClick={() => router.back()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  padding: 0,
                  fontSize: 'inherit',
                }}
              >
                ← Back
              </button>
              <span>·</span>
              <Link
                href="/all-sows"
                style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              >
                All SoWs
              </Link>
              <span>›</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {sow.title || 'Untitled SoW'}
              </span>
              <span>›</span>
              <span style={{ color: 'var(--color-text-tertiary)' }}>Manage</span>
            </div>

            {/* Title + status pills */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-md)',
                flexWrap: 'wrap',
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              <h1
                className="text-2xl font-bold"
                style={{
                  margin: 0,
                  maxWidth: '600px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {sow.title || 'Untitled SoW'}
              </h1>
              <span
                style={{
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: pill.bg,
                  color: pill.color,
                  whiteSpace: 'nowrap',
                }}
              >
                ● {humanizeStatus(sow.status)}
              </span>
              {sow.esap_level && (
                <span
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor: 'rgba(59,130,246,0.12)',
                    color: 'var(--color-accent-blue)',
                    whiteSpace: 'nowrap',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {sow.esap_level.replace('-', ' ')}
                </span>
              )}
            </div>

            {/* Subtitle / meta */}
            <p className="text-sm text-secondary" style={{ margin: 0, lineHeight: 1.5 }}>
              Manage live workflow — changes take effect immediately. Saving a reviewer swap or
              workflow edit re-checks gating rules and may auto-advance the SoW.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 'var(--spacing-xl)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-text-secondary)',
                flexWrap: 'wrap',
                marginTop: 'var(--spacing-sm)',
              }}
            >
              {sow.customer_name && (
                <span>
                  Customer:{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>
                    {sow.customer_name}
                  </strong>
                </span>
              )}
              {sow.opportunity_id && (
                <span>
                  Opp ID:{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>
                    {sow.opportunity_id}
                  </strong>
                </span>
              )}
              {sow.methodology && (
                <span>
                  Methodology:{' '}
                  <strong style={{ color: 'var(--color-text-primary)' }}>{sow.methodology}</strong>
                </span>
              )}
              <span style={{ color: 'var(--color-text-tertiary)' }}>ID: {sow.id}</span>
            </div>
          </div>
        </div>

        {/* ── Section 1: Workflow timeline ─────────────────────────────── */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-subtle)',
            padding: 'var(--spacing-md) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            <WorkflowProgress
              sowId={sow.id}
              currentStage={sow.status}
              reviewAssignments={[]}
              refreshKey={refreshKey}
            />
          </div>
        </div>

        {/* ── Section 2: Reviewer assignments ──────────────────────────── */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-xl) var(--spacing-xl) var(--spacing-md)',
          }}
        >
          <ReviewerAssignmentPanel
            sowId={sow.id}
            readOnly={false}
            sowStatus={sow.status}
            onSaved={handleChildSaved}
          />
        </div>

        {/* ── Section 3: Workflow structure + stage config ─────────────── */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-md) var(--spacing-xl)',
          }}
        >
          <div
            style={{
              padding: 'var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-primary)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <LiveWorkflowEditor sowId={sow.id} onSaved={handleChildSaved} />
          </div>
        </div>

        {/* ── Section 4: Recent activity ───────────────────────────────── */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-md) var(--spacing-xl) var(--spacing-2xl)',
          }}
        >
          <div className="card">
            <button
              onClick={() => setShowActivity((v) => !v)}
              style={{
                width: '100%',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 0,
                color: 'var(--color-text-primary)',
              }}
            >
              <h3 className="text-base font-semibold">Recent activity</h3>
              <span className="text-sm text-tertiary">{showActivity ? '▲ Hide' : '▼ Show'}</span>
            </button>
            {showActivity && (
              <div style={{ marginTop: 'var(--spacing-lg)' }}>
                <ActivityLog sowId={sow.id} key={refreshKey} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
