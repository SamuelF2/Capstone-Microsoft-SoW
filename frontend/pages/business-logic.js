import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';

const TABS = [
  { key: 'quality', label: 'Quality Rules' },
  { key: 'esap', label: 'ESAP Workflow' },
  { key: 'risk', label: 'Risk Classification' },
];

const SEVERITY_STYLES = {
  error: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' },
  warning: { bg: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
};

const TIER_COLORS = {
  'type-1': { accent: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)' },
  'type-2': { accent: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)' },
  'type-3': { accent: '#4ade80', bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.3)' },
};

// ── Quality Rules Tab ───────────────────────────────────────────────────────

function BannedPhrasesTable({ phrases }) {
  if (!phrases || phrases.length === 0) return null;
  return (
    <div style={{ marginBottom: 'var(--spacing-xl)' }}>
      <h3 className="text-lg font-semibold mb-md">Banned Phrases</h3>
      <p className="text-sm text-secondary mb-lg">
        These phrases must not appear in any SoW document as they create inappropriate commitments
        or ambiguity.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--font-size-sm)',
          }}
        >
          <thead>
            <tr
              style={{
                borderBottom: '1px solid var(--color-border-default)',
                textAlign: 'left',
              }}
            >
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Phrase
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Severity
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Category
              </th>
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                }}
              >
                Suggested Fix
              </th>
            </tr>
          </thead>
          <tbody>
            {phrases.map((p, i) => {
              const s = SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.warning;
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)',
                  }}
                >
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                    &ldquo;{p.phrase}&rdquo;
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        fontWeight: 600,
                        backgroundColor: s.bg,
                        color: s.color,
                        border: `1px solid ${s.border}`,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {p.severity}
                    </span>
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                    }}
                  >
                    {(p.category || '').replace(/-/g, ' ')}
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '300px',
                    }}
                  >
                    {p.suggestion}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RequiredElementsList({ elements }) {
  if (!elements || elements.length === 0) return null;
  return (
    <div>
      <h3 className="text-lg font-semibold mb-md">Required SoW Sections</h3>
      <p className="text-sm text-secondary mb-lg">
        Every SoW document must include these sections with the specified minimum content.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {elements.map((el, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: '3px solid var(--color-accent-blue)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {el.displayName}
              </span>
              <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                {el.minLength && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(0,120,212,0.12)',
                      color: 'var(--color-accent-blue)',
                    }}
                  >
                    Min {el.minLength} chars
                  </span>
                )}
                {el.minItems && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(0,120,212,0.12)',
                      color: 'var(--color-accent-blue)',
                    }}
                  >
                    Min {el.minItems} items
                  </span>
                )}
                {el.allowNA && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(74,222,128,0.12)',
                      color: '#4ade80',
                    }}
                  >
                    N/A allowed
                  </span>
                )}
              </div>
            </div>
            <p
              className="text-secondary"
              style={{
                fontSize: 'var(--font-size-xs)',
                lineHeight: 'var(--line-height-relaxed)',
                marginTop: 'var(--spacing-xs)',
              }}
            >
              {el.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function QualityTab({ rules }) {
  const banned = rules?.bannedPhrases?.bannedPhrases || [];
  const required = rules?.requiredElements?.requiredSections || [];
  return (
    <div>
      <BannedPhrasesTable phrases={banned} />
      <RequiredElementsList elements={required} />
    </div>
  );
}

// ── ESAP Workflow Tab ────────────────────────────────────────────────────────

function EsapTab({ rules }) {
  const esap = rules?.esapWorkflow || {};
  const levels = esap.esapLevels || {};
  const stages = esap.workflowStages || {};
  const stageOrder = ['draft', 'internal-review', 'drm-approval', 'approved', 'finalized'];

  return (
    <div>
      {/* Deal Tiers */}
      <h3 className="text-lg font-semibold mb-md">Deal Tiers</h3>
      <p className="text-sm text-secondary mb-lg">
        ESAP level is determined by deal value and estimated margin. Each tier requires different
        approvers and checks.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
        }}
      >
        {Object.entries(levels).map(([key, level]) => {
          const tc = TIER_COLORS[key] || TIER_COLORS['type-3'];
          return (
            <div
              key={key}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: tc.bg,
                border: `1px solid ${tc.border}`,
              }}
            >
              <h4
                className="font-semibold mb-md"
                style={{ color: tc.accent, fontSize: 'var(--font-size-base)' }}
              >
                {level.name}
              </h4>

              {/* Triggers */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p
                  className="text-xs font-semibold mb-xs"
                  style={{
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Triggers
                </p>
                {(level.triggers || []).map((t, i) => (
                  <p
                    key={i}
                    className="text-sm"
                    style={{ color: 'var(--color-text-primary)', marginBottom: 2 }}
                  >
                    {t.description}
                  </p>
                ))}
              </div>

              {/* Approvers */}
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <p
                  className="text-xs font-semibold mb-xs"
                  style={{
                    color: 'var(--color-text-secondary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  Required Approvers
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
                  {(level.requiredApprovers || []).map((a, i) => (
                    <span
                      key={i}
                      title={a.reason}
                      style={{
                        padding: '2px 10px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: 'var(--font-size-xs)',
                        backgroundColor: 'var(--color-bg-tertiary)',
                        border: '1px solid var(--color-border-default)',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {a.role.replace(/-/g, ' ').toUpperCase()} ({a.stage.replace(/-/g, ' ')})
                    </span>
                  ))}
                </div>
              </div>

              {/* Additional Checks */}
              {level.additionalChecks && level.additionalChecks.length > 0 && (
                <div>
                  <p
                    className="text-xs font-semibold mb-xs"
                    style={{
                      color: 'var(--color-text-secondary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    Additional Checks
                  </p>
                  <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
                    {level.additionalChecks.map((c, i) => (
                      <li
                        key={i}
                        className="text-sm text-secondary"
                        style={{ lineHeight: 'var(--line-height-relaxed)' }}
                      >
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Workflow Stages */}
      <h3 className="text-lg font-semibold mb-md">Approval Workflow Stages</h3>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--spacing-sm)',
          alignItems: 'center',
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        {stageOrder
          .filter((k) => stages[k])
          .map((key, i) => {
            const stage = stages[key];
            return (
              <span
                key={key}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
              >
                <span
                  style={{
                    padding: '6px 16px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: 500,
                    backgroundColor: 'var(--color-bg-tertiary)',
                    border: '1px solid var(--color-border-default)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {stage.name}
                </span>
                {i < stageOrder.filter((k) => stages[k]).length - 1 && (
                  <span
                    style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-lg)' }}
                  >
                    &#8594;
                  </span>
                )}
              </span>
            );
          })}
      </div>

      {/* Stage Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {stageOrder
          .filter((k) => stages[k])
          .map((key) => {
            const stage = stages[key];
            return (
              <div
                key={key}
                style={{
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderLeft: '3px solid var(--color-accent-blue)',
                }}
              >
                <p className="font-semibold text-sm">{stage.name}</p>
                <p
                  className="text-secondary text-xs"
                  style={{
                    lineHeight: 'var(--line-height-relaxed)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  {stage.description}
                </p>
                {stage.exitCriteria && stage.exitCriteria.length > 0 && (
                  <div>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}
                    >
                      Exit criteria: {stage.exitCriteria.join(' | ')}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ── Risk Classification Tab (Stubbed) ───────────────────────────────────────

const RISK_LEVELS = [
  {
    level: 'Green',
    color: '#4ade80',
    bg: 'rgba(74,222,128,0.08)',
    border: 'rgba(74,222,128,0.3)',
    criteria: [
      'All 8 required sections present and meet minimum length/item requirements',
      'No banned phrases detected in document text',
      'All methodology-specific keywords present',
      'Estimated margin >= 15%',
      'Deal value <= $1M (Type 3 ESAP)',
      'All deliverables have measurable acceptance criteria',
      'Risk register complete with mitigation plans for every risk',
    ],
  },
  {
    level: 'Yellow',
    color: '#fbbf24',
    bg: 'rgba(251,191,36,0.08)',
    border: 'rgba(251,191,36,0.3)',
    criteria: [
      'One or two required sections missing or below minimum thresholds',
      'Warning-level banned phrases detected (e.g., "will ensure")',
      'Some methodology keywords missing from approach section',
      'Estimated margin between 10% and 15%',
      'Deal value between $1M and $5M (Type 2 ESAP)',
      'Some deliverables lack specific acceptance criteria',
      'One or more risks missing mitigation plans',
    ],
  },
  {
    level: 'Red',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.08)',
    border: 'rgba(239,68,68,0.3)',
    criteria: [
      'Three or more required sections missing',
      'Error-level banned phrases detected (e.g., "best effort", "guarantee", "unlimited")',
      'Methodology approach section fundamentally misaligned',
      'Estimated margin below 10%',
      'Deal value exceeds $5M (Type 1 ESAP)',
      'Customer responsibilities not documented',
      'No support transition plan defined',
    ],
  },
];

function RiskTab() {
  return (
    <div>
      <h3 className="text-lg font-semibold mb-md">Risk Classification Criteria (G / Y / R)</h3>
      <p className="text-sm text-secondary mb-lg">
        Each SoW is classified into Green, Yellow, or Red based on the following criteria. The Risk
        Engine evaluates these factors automatically during AI Review.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 'var(--spacing-lg)',
          marginBottom: 'var(--spacing-2xl)',
        }}
      >
        {RISK_LEVELS.map((r) => (
          <div
            key={r.level}
            style={{
              padding: 'var(--spacing-lg)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: r.bg,
              border: `1px solid ${r.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-md)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  backgroundColor: r.color,
                  boxShadow: `0 0 8px ${r.color}`,
                }}
              />
              <span
                className="font-semibold"
                style={{ color: r.color, fontSize: 'var(--font-size-lg)' }}
              >
                {r.level}
              </span>
            </div>
            <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
              {r.criteria.map((c, i) => (
                <li
                  key={i}
                  className="text-sm"
                  style={{
                    color: 'var(--color-text-secondary)',
                    lineHeight: 'var(--line-height-relaxed)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div
        className="card"
        style={{
          padding: 'var(--spacing-lg)',
          backgroundColor: 'rgba(0,120,212,0.06)',
          border: '1px solid rgba(0,120,212,0.2)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--color-accent-blue)', fontWeight: 500 }}>
          Note: The Risk Engine classifier is under active development. These criteria represent the
          target classification logic. Full automated classification will integrate with Azure AI
          Foundry for LLM-based evaluation and Azure ML Workspace for model training.
        </p>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function BusinessLogic() {
  const { user, authFetch } = useAuth();
  const [rules, setRules] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('quality');

  useEffect(() => {
    if (!user) return;
    authFetch('/api/rules')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load rules (${res.status})`);
        return res.json();
      })
      .then(setRules)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user, authFetch]);

  return (
    <>
      <Head>
        <title>Business Logic - Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: 'var(--container-lg)', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">Business Logic</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Quality rules, ESAP approval workflow, and risk classification criteria that drive SoW
              validation and review.
            </p>
          </div>

          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              gap: 'var(--spacing-xs)',
              marginBottom: 'var(--spacing-xl)',
              borderBottom: '1px solid var(--color-border-default)',
              paddingBottom: 'var(--spacing-xs)',
            }}
          >
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                  border: 'none',
                  borderBottom:
                    activeTab === tab.key
                      ? '2px solid var(--color-accent-blue)'
                      : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color:
                    activeTab === tab.key
                      ? 'var(--color-text-primary)'
                      : 'var(--color-text-secondary)',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  fontSize: 'var(--font-size-sm)',
                  cursor: 'pointer',
                  transition: 'all var(--transition-base)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl) 0' }}>
              <Spinner />
            </div>
          )}

          {error && (
            <div
              style={{
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {!loading && !error && rules && (
            <div className="card">
              {activeTab === 'quality' && <QualityTab rules={rules} />}
              {activeTab === 'esap' && <EsapTab rules={rules} />}
              {activeTab === 'risk' && <RiskTab />}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
