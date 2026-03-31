import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '../../lib/auth';
import Spinner from '../../components/Spinner';

// Shared components
import ExecutiveSummary from '../../components/sow/ExecutiveSummary';
import ProjectScope from '../../components/sow/ProjectScope';
import Deliverables from '../../components/sow/Deliverables';
import AssumptionsRisks from '../../components/sow/AssumptionsRisks';
import TeamStructure from '../../components/sow/TeamStructure';
import Pricing from '../../components/sow/Pricing';
import SupportTransition from '../../components/sow/SupportTransition';

// Agile
import AgileApproach from '../../components/sow/AgileApproach';
import ProductBacklog from '../../components/sow/ProductBacklog';

// Sure Step 365
import SureStepMethodology from '../../components/sow/SureStepMethodology';
import PhasesDeliverables from '../../components/sow/PhasesDeliverables';
import DataMigration from '../../components/sow/DataMigration';
import TestingStrategy from '../../components/sow/TestingStrategy';
import SupportHypercare from '../../components/sow/SupportHypercare';

// Waterfall
import WaterfallApproach from '../../components/sow/WaterfallApproach';
import PhasesMilestones from '../../components/sow/PhasesMilestones';

// Cloud Adoption
import CloudAdoptionScope from '../../components/sow/CloudAdoptionScope';
import MigrationStrategy from '../../components/sow/MigrationStrategy';
import WorkloadAssessment from '../../components/sow/WorkloadAssessment';
import SecurityCompliance from '../../components/sow/SecurityCompliance';
import SupportOperations from '../../components/sow/SupportOperations';

// ─── Tab definitions per methodology ─────────────────────────────────────────

function getTabConfig(methodology) {
  switch (methodology) {
    case 'Agile Sprint Delivery':
      return [
        {
          label: 'Overview',
          key: 'overview',
          render: (data, update) => (
            <ExecutiveSummary
              data={data.executiveSummary}
              onChange={(v) => update('executiveSummary', v)}
            />
          ),
        },
        {
          label: 'Scope',
          key: 'scope',
          render: (data, update) => (
            <ProjectScope data={data.projectScope} onChange={(v) => update('projectScope', v)} />
          ),
        },
        {
          label: 'Approach',
          key: 'approach',
          render: (data, update) => (
            <>
              <AgileApproach
                data={data.agileApproach}
                onChange={(v) => update('agileApproach', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <ProductBacklog
                  data={data.productBacklog}
                  onChange={(v) => update('productBacklog', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Deliverables',
          key: 'deliverables',
          render: (data, update) => (
            <Deliverables data={data.deliverables} onChange={(v) => update('deliverables', v)} />
          ),
        },
        {
          label: 'Team & Responsibilities',
          key: 'team',
          render: (data, update) => (
            <>
              <TeamStructure
                data={data.teamStructure}
                onChange={(v) => update('teamStructure', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <AssumptionsRisks
                  data={data.assumptionsRisks}
                  onChange={(v) => update('assumptionsRisks', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Support & Pricing',
          key: 'support',
          render: (data, update) => (
            <>
              <SupportTransition
                data={data.supportTransition}
                onChange={(v) => update('supportTransition', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
              </div>
            </>
          ),
        },
      ];

    case 'Sure Step 365':
      return [
        {
          label: 'Overview',
          key: 'overview',
          render: (data, update) => (
            <ExecutiveSummary
              data={data.executiveSummary}
              onChange={(v) => update('executiveSummary', v)}
            />
          ),
        },
        {
          label: 'Scope',
          key: 'scope',
          render: (data, update) => (
            <ProjectScope data={data.projectScope} onChange={(v) => update('projectScope', v)} />
          ),
        },
        {
          label: 'Methodology',
          key: 'methodology',
          render: (data, update) => (
            <>
              <SureStepMethodology
                data={data.sureStepMethodology}
                onChange={(v) => update('sureStepMethodology', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <PhasesDeliverables
                  data={data.phasesDeliverables}
                  onChange={(v) => update('phasesDeliverables', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Technical',
          key: 'technical',
          render: (data, update) => (
            <>
              <DataMigration
                data={data.dataMigration}
                onChange={(v) => update('dataMigration', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <TestingStrategy
                  data={data.testingStrategy}
                  onChange={(v) => update('testingStrategy', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Responsibilities & Risks',
          key: 'risks',
          render: (data, update) => (
            <AssumptionsRisks
              data={data.assumptionsRisks}
              onChange={(v) => update('assumptionsRisks', v)}
            />
          ),
        },
        {
          label: 'Support & Pricing',
          key: 'support',
          render: (data, update) => (
            <>
              <SupportHypercare
                data={data.supportHypercare}
                onChange={(v) => update('supportHypercare', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
              </div>
            </>
          ),
        },
      ];

    case 'Waterfall':
      return [
        {
          label: 'Overview',
          key: 'overview',
          render: (data, update) => (
            <ExecutiveSummary
              data={data.executiveSummary}
              onChange={(v) => update('executiveSummary', v)}
            />
          ),
        },
        {
          label: 'Scope',
          key: 'scope',
          render: (data, update) => (
            <ProjectScope data={data.projectScope} onChange={(v) => update('projectScope', v)} />
          ),
        },
        {
          label: 'Approach',
          key: 'approach',
          render: (data, update) => (
            <>
              <WaterfallApproach
                data={data.waterfallApproach}
                onChange={(v) => update('waterfallApproach', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <PhasesMilestones
                  data={data.phasesMilestones}
                  onChange={(v) => update('phasesMilestones', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Deliverables',
          key: 'deliverables',
          render: (data, update) => (
            <Deliverables data={data.deliverables} onChange={(v) => update('deliverables', v)} />
          ),
        },
        {
          label: 'Team & Responsibilities',
          key: 'team',
          render: (data, update) => (
            <>
              <TeamStructure
                data={data.teamStructure}
                onChange={(v) => update('teamStructure', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <AssumptionsRisks
                  data={data.assumptionsRisks}
                  onChange={(v) => update('assumptionsRisks', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Support & Pricing',
          key: 'support',
          render: (data, update) => (
            <>
              <SupportTransition
                data={data.supportTransition}
                onChange={(v) => update('supportTransition', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
              </div>
            </>
          ),
        },
      ];

    case 'Cloud Adoption':
      return [
        {
          label: 'Overview',
          key: 'overview',
          render: (data, update) => (
            <ExecutiveSummary
              data={data.executiveSummary}
              onChange={(v) => update('executiveSummary', v)}
            />
          ),
        },
        {
          label: 'Scope',
          key: 'scope',
          render: (data, update) => (
            <CloudAdoptionScope
              data={data.cloudAdoptionScope}
              onChange={(v) => update('cloudAdoptionScope', v)}
            />
          ),
        },
        {
          label: 'Migration',
          key: 'migration',
          render: (data, update) => (
            <>
              <MigrationStrategy
                data={data.migrationStrategy}
                onChange={(v) => update('migrationStrategy', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <WorkloadAssessment
                  data={data.workloadAssessment}
                  onChange={(v) => update('workloadAssessment', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Deliverables & Security',
          key: 'deliverables',
          render: (data, update) => (
            <>
              <Deliverables data={data.deliverables} onChange={(v) => update('deliverables', v)} />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <SecurityCompliance
                  data={data.securityCompliance}
                  onChange={(v) => update('securityCompliance', v)}
                />
              </div>
            </>
          ),
        },
        {
          label: 'Responsibilities & Risks',
          key: 'risks',
          render: (data, update) => (
            <AssumptionsRisks
              data={data.assumptionsRisks}
              onChange={(v) => update('assumptionsRisks', v)}
            />
          ),
        },
        {
          label: 'Support & Pricing',
          key: 'support',
          render: (data, update) => (
            <>
              <SupportOperations
                data={data.supportOperations}
                onChange={(v) => update('supportOperations', v)}
              />
              <div style={{ marginTop: 'var(--spacing-3xl)' }}>
                <Pricing data={data.pricing} onChange={(v) => update('pricing', v)} />
              </div>
            </>
          ),
        },
      ];

    default:
      return [];
  }
}

// ─── Methodology badge colours ────────────────────────────────────────────────

const METHODOLOGY_BADGE = {
  'Agile Sprint Delivery': { bg: '#1e3a5f', color: '#60a5fa' },
  'Sure Step 365': { bg: '#1e3a2e', color: '#4ade80' },
  Waterfall: { bg: '#2d2014', color: '#fbbf24' },
  'Cloud Adoption': { bg: '#2d1b4e', color: '#c084fc' },
};

// ─── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ savedAt }) {
  if (!savedAt) return null;
  const time = new Date(savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <motion.span
      key={savedAt}
      initial={{ opacity: 0.5, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className="text-xs text-secondary"
      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
    >
      <span style={{ color: 'var(--color-success)' }}>●</span> Saved {time}
    </motion.span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DraftPage() {
  const router = useRouter();
  const { id } = router.query;
  const { authFetch } = useAuth();

  const [sowData, setSowData] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [savedAt, setSavedAt] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  // Load SoW from localStorage
  useEffect(() => {
    if (!id) return;
    authFetch(`/api/sow/${id}`)
    .then((res) => {
      if (res.status === 404) { setNotFound(true); return null; }
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    })
    .then((data) => {
      if (data) {
        const mapped = {
          ...(data.content ?? {}),
          sowTitle: data.title,
          deliveryMethodology: data.methodology,
          customerName: data.customer_name,
          opportunityId: data.opportunity_id,
          dealValue: data.deal_value,
          status: data.status,
        };
        setSowData(mapped);
      }
    })
    .catch(() => setNotFound(true));
  }, [id]);

  // Auto-save to localStorage whenever sowData changes
  useEffect(() => {
    if (!sowData || !id) return;
    const timer = setTimeout(async () => {
      const res = await authFetch(`/api/sow/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: sowData }),
      });
      if (res.ok) setSavedAt(new Date().toISOString());
    }, 1000); // debounce 1s
    return () => clearTimeout(timer);
  }, [sowData, id]);

  // Update a top-level section of the SoW data
  const updateSection = (section, value) => {
    setSowData((prev) => ({ ...prev, [section]: value }));
  };

  // Submit the SoW for review — sets status to in_review on the backend
  const handleSubmitForReview = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await authFetch(`/api/sow/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_review' }),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Server error ${res.status}`);
      }

      // Reflect new status in localStorage
      const updated = { ...sowData, status: 'in_review', updatedAt: new Date().toISOString() };

      router.push(`/review/${id}`);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (notFound) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p className="text-2xl font-semibold mb-md">SoW not found</p>
          <p className="text-secondary mb-xl">This SoW doesn't exist or may have been removed.</p>
          <Link href="/all-sows" className="btn btn-primary">
            Back to All SoWs
          </Link>
        </div>
      </div>
    );
  }

  if (!sowData) {
    return (
      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner message="Loading SoW…" />
      </div>
    );
  }

  const tabs = getTabConfig(sowData.deliveryMethodology);
  const isLastTab = activeTab === tabs.length - 1;
  const badgeStyle = METHODOLOGY_BADGE[sowData.deliveryMethodology] ?? {
    bg: 'var(--color-bg-tertiary)',
    color: 'var(--color-text-secondary)',
  };

  return (
    <>
      <Head>
        <title>{sowData.sowTitle || 'Untitled SoW'} – Draft – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {/* Page header */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: 'var(--spacing-lg) var(--spacing-xl)',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto' }}>
            {/* Breadcrumb */}
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
              <Link
                href="/all-sows"
                style={{ color: 'var(--color-text-secondary)', textDecoration: 'none' }}
              >
                All SoWs
              </Link>
              <span>›</span>
              <span style={{ color: 'var(--color-text-primary)' }}>
                {sowData.sowTitle || 'Untitled SoW'}
              </span>
            </div>

            {/* Title row */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 'var(--spacing-lg)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    marginBottom: 'var(--spacing-xs)',
                    flexWrap: 'wrap',
                  }}
                >
                  <h1
                    className="text-2xl font-bold"
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '600px',
                    }}
                  >
                    {sowData.sowTitle || 'Untitled SoW'}
                  </h1>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: badgeStyle.bg,
                      color: badgeStyle.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {sowData.deliveryMethodology}
                  </span>
                  <span
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-semibold)',
                      padding: '2px 10px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'rgba(251,191,36,0.12)',
                      color: 'var(--color-warning)',
                    }}
                  >
                    ● Draft
                  </span>
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 'var(--spacing-xl)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)',
                    flexWrap: 'wrap',
                  }}
                >
                  {sowData.customerName && (
                    <span>
                      Customer:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.customerName}
                      </strong>
                    </span>
                  )}
                  {sowData.opportunityId && (
                    <span>
                      Opp ID:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        {sowData.opportunityId}
                      </strong>
                    </span>
                  )}
                  {sowData.dealValue && (
                    <span>
                      Value:{' '}
                      <strong style={{ color: 'var(--color-text-primary)' }}>
                        ${Number(sowData.dealValue).toLocaleString()}
                      </strong>
                    </span>
                  )}
                  <span
                    style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}
                  >
                    ID: {id}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-md)',
                  flexShrink: 0,
                }}
              >
                <SaveIndicator savedAt={savedAt} />
                <button className="btn btn-secondary" onClick={() => router.push('/all-sows')}>
                  All SoWs
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border-default)',
            padding: '0 var(--spacing-xl)',
            overflowX: 'auto',
          }}
        >
          <div style={{ maxWidth: 'var(--container-xl)', margin: '0 auto', display: 'flex' }}>
            {tabs.map((tab, idx) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight:
                    activeTab === idx ? 'var(--font-weight-semibold)' : 'var(--font-weight-normal)',
                  color:
                    activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-text-secondary)',
                  borderBottom:
                    activeTab === idx
                      ? '2px solid var(--color-accent-blue)'
                      : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: 'color var(--transition-base), border-color var(--transition-base)',
                  marginBottom: '-1px',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== idx) e.currentTarget.style.color = 'var(--color-text-primary)';
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== idx)
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '20px',
                    height: '20px',
                    borderRadius: 'var(--radius-full)',
                    backgroundColor:
                      activeTab === idx ? 'var(--color-accent-blue)' : 'var(--color-bg-tertiary)',
                    color: activeTab === idx ? '#fff' : 'var(--color-text-tertiary)',
                    fontSize: '11px',
                    fontWeight: 'var(--font-weight-bold)',
                    marginRight: 'var(--spacing-xs)',
                  }}
                >
                  {idx + 1}
                </span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: 'var(--spacing-2xl) var(--spacing-xl)',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
            >
              {tabs.length > 0 && tabs[activeTab] ? (
                tabs[activeTab].render(sowData, updateSection)
              ) : (
                <p className="text-secondary">No content configured for this methodology.</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Bottom navigation */}
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl) var(--spacing-2xl)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-sm)',
          }}
        >
          {submitError && (
            <p
              style={{
                textAlign: 'right',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
              }}
            >
              {submitError}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setActiveTab((t) => Math.max(0, t - 1))}
              disabled={activeTab === 0}
              style={{ opacity: activeTab === 0 ? 0.4 : 1 }}
            >
              ← Previous
            </button>

            <span className="text-sm text-secondary">
              {activeTab + 1} of {tabs.length}
            </span>

            {isLastTab ? (
              <button
                className="btn btn-primary"
                onClick={handleSubmitForReview}
                disabled={isSubmitting}
                style={{ opacity: isSubmitting ? 0.6 : 1 }}
              >
                {isSubmitting ? 'Submitting…' : 'Submit for Review →'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setActiveTab((t) => Math.min(tabs.length - 1, t + 1))}
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
