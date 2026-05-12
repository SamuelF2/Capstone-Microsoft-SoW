/**
 * components/ai-review/RiskAssessmentSection — full risk-framework view.
 *
 * Renders the per-SoW RiskAssessmentResult (categories, probability x impact
 * heatmap, register table, and rule-triggered violations). Replaces the
 * previous RisksSection card grid.
 */

import { Fragment, useMemo, useState } from 'react';

import { SEVERITY_STYLES, SeverityBadge } from './RecommendationStyles';

export const PRIORITY_BAND_STYLES = {
  'Very Low': {
    bg: 'rgba(156,163,175,0.12)',
    color: '#9ca3af',
    border: 'rgba(156,163,175,0.3)',
    label: 'Very Low',
  },
  Low: {
    bg: 'rgba(74,222,128,0.12)',
    color: '#4ade80',
    border: 'rgba(74,222,128,0.3)',
    label: 'Low',
  },
  Medium: {
    bg: 'rgba(251,191,36,0.12)',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.3)',
    label: 'Medium',
  },
  High: {
    bg: 'rgba(249,115,22,0.12)',
    color: '#f97316',
    border: 'rgba(249,115,22,0.3)',
    label: 'High',
  },
  'Very High': {
    bg: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: 'rgba(239,68,68,0.3)',
    label: 'Very High',
  },
};

const BAND_ACTION_TEXT = {
  'Very Low': 'Accept, minimal monitoring',
  Low: 'Monitor, accept with documentation',
  Medium: 'Active management, regular monitoring',
  High: 'Mitigation plan mandatory, DRC visibility',
  'Very High': 'Immediate escalation and mitigation required',
};

// Category colour cycle (used by the breakdown bar chart when the framework
// API isn't available to resolve real colour tokens).
const CATEGORY_FALLBACK_COLOURS = {
  Financial: '#0078d4',
  Delivery: '#9333ea',
  Technical: '#14b8a6',
  Compliance: '#fbbf24',
  Reputational: '#ec4899',
  Strategic: '#f97316',
};

export function PriorityBandBadge({ band }) {
  const s = PRIORITY_BAND_STYLES[band] || PRIORITY_BAND_STYLES['Very Low'];
  return (
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
      {s.label}
    </span>
  );
}

/** Look up the priority band for a score (mirrors backend _score_to_band). */
function scoreToBand(score) {
  if (score <= 2) return 'Very Low';
  if (score <= 5) return 'Low';
  if (score <= 11) return 'Medium';
  if (score <= 15) return 'High';
  return 'Very High';
}

// ── Header banner ─────────────────────────────────────────────────────────

function Header({ score, band, coverage, totalRisks }) {
  const s = PRIORITY_BAND_STYLES[band] || PRIORITY_BAND_STYLES['Very Low'];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--spacing-lg)',
        padding: 'var(--spacing-lg)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: s.bg,
        border: `1px solid ${s.border}`,
        marginBottom: 'var(--spacing-xl)',
      }}
    >
      <div style={{ flex: '0 0 auto' }}>
        <div
          style={{
            fontSize: '2.25rem',
            fontWeight: 700,
            color: s.color,
            lineHeight: 1,
          }}
        >
          {Number(score || 0).toFixed(0)}
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}> / 25</span>
        </div>
        <div
          style={{
            marginTop: 'var(--spacing-xs)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Overall risk score
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-xs)',
          }}
        >
          <PriorityBandBadge band={band} />
          <span className="text-sm text-secondary">
            {totalRisks} risk{totalRisks === 1 ? '' : 's'} · {Math.round((coverage || 0) * 100)}%
            with mitigation
          </span>
        </div>
        <p className="text-sm" style={{ color: s.color, fontWeight: 500, margin: 0 }}>
          {BAND_ACTION_TEXT[band] || ''}
        </p>
      </div>
    </div>
  );
}

// ── Priority matrix heatmap ───────────────────────────────────────────────

function HeatmapCell({ probability, impact, risks, isSelected, onSelect }) {
  const score = probability * impact;
  const band = scoreToBand(score);
  const s = PRIORITY_BAND_STYLES[band];
  const count = risks.length;
  return (
    <button
      type="button"
      onClick={() => count > 0 && onSelect({ probability, impact, risks })}
      disabled={count === 0}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        backgroundColor: s.bg,
        border: `1px solid ${isSelected ? s.color : s.border}`,
        borderRadius: 'var(--radius-sm)',
        color: s.color,
        fontWeight: 600,
        fontSize: 'var(--font-size-sm)',
        cursor: count > 0 ? 'pointer' : 'default',
        transition: 'all var(--transition-base)',
        outline: isSelected ? `2px solid ${s.color}` : 'none',
        outlineOffset: '-2px',
      }}
      aria-label={`Probability ${probability}, Impact ${impact}, score ${score}, ${count} risks`}
    >
      <span>{score}</span>
      {count > 0 && (
        <span
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            padding: '0 5px',
            backgroundColor: s.color,
            color: 'var(--color-bg-primary)',
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PriorityMatrixHeatmap({ risks }) {
  const [selected, setSelected] = useState(null);

  // Bin risks into a 5x5 grid keyed by [probability-1][impact-1].
  const cells = useMemo(() => {
    const out = {};
    for (let p = 1; p <= 5; p += 1) {
      for (let i = 1; i <= 5; i += 1) {
        out[`${p}:${i}`] = [];
      }
    }
    risks.forEach((r) => {
      const p = Math.max(1, Math.min(5, r.probability || 3));
      const i = Math.max(1, Math.min(5, r.impact || 3));
      out[`${p}:${i}`].push(r);
    });
    return out;
  }, [risks]);

  // Rows render top→bottom from probability 5 → 1 to match framework §4.3.
  const probRows = [5, 4, 3, 2, 1];
  const impactCols = [1, 2, 3, 4, 5];

  return (
    <div>
      <h4
        className="text-sm font-semibold mb-md"
        style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}
      >
        Priority Matrix
      </h4>
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
        {/* Probability axis label */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            color: 'var(--color-text-secondary)',
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Probability →
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '24px repeat(5, 1fr)',
              gap: 4,
            }}
          >
            {probRows.map((p) => (
              <Fragment key={`row-${p}`}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {p}
                </div>
                {impactCols.map((i) => (
                  <HeatmapCell
                    key={`${p}:${i}`}
                    probability={p}
                    impact={i}
                    risks={cells[`${p}:${i}`]}
                    isSelected={selected && selected.probability === p && selected.impact === i}
                    onSelect={setSelected}
                  />
                ))}
              </Fragment>
            ))}
            {/* Impact axis labels below the grid */}
            <div />
            {impactCols.map((i) => (
              <div
                key={`impact-${i}`}
                style={{
                  textAlign: 'center',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  paddingTop: 4,
                }}
              >
                {i}
              </div>
            ))}
          </div>
          <div
            style={{
              textAlign: 'center',
              marginTop: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: 600,
              color: 'var(--color-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Impact →
          </div>
        </div>
      </div>

      {selected && selected.risks.length > 0 && (
        <div
          style={{
            marginTop: 'var(--spacing-md)',
            padding: 'var(--spacing-md)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--spacing-sm)',
            }}
          >
            <span className="text-sm font-semibold">
              P{selected.probability} × I{selected.impact} ={' '}
              {selected.probability * selected.impact}
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              ✕
            </button>
          </div>
          <ul style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
            {selected.risks.map((r, idx) => (
              <li key={idx} className="text-sm text-secondary" style={{ marginBottom: 4 }}>
                <strong style={{ color: 'var(--color-text-primary)' }}>{r.category}</strong> —{' '}
                {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Category breakdown bars ───────────────────────────────────────────────

function CategoryBreakdown({ breakdown }) {
  const entries = Object.entries(breakdown || {}).sort((a, b) => b[1] - a[1]);
  const max = entries.reduce((m, [, n]) => Math.max(m, n), 0);

  return (
    <div>
      <h4
        className="text-sm font-semibold mb-md"
        style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}
      >
        Category Breakdown
      </h4>
      {entries.length === 0 && <p className="text-sm text-secondary">No risks identified.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {entries.map(([cat, n]) => {
          const colour = CATEGORY_FALLBACK_COLOURS[cat] || '#6b7280';
          const pct = max > 0 ? (n / max) * 100 : 0;
          return (
            <div key={cat}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 4,
                  fontSize: 'var(--font-size-sm)',
                }}
              >
                <span style={{ fontWeight: 500 }}>{cat}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{n}</span>
              </div>
              <div
                style={{
                  height: 8,
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: '100%',
                    backgroundColor: colour,
                    transition: 'width var(--transition-base)',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Risk register table ───────────────────────────────────────────────────

function RiskRegisterTable({ risks }) {
  const [sortKey, setSortKey] = useState('priority_score');
  const [sortDir, setSortDir] = useState('desc');
  const [expanded, setExpanded] = useState(null);

  const sorted = useMemo(() => {
    const arr = [...(risks || [])];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'desc' ? bv - av : av - bv;
      }
      return sortDir === 'desc'
        ? String(bv).localeCompare(String(av))
        : String(av).localeCompare(String(bv));
    });
    return arr;
  }, [risks, sortKey, sortDir]);

  const setSort = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ k, label, width }) => (
    <th
      onClick={() => setSort(k)}
      style={{
        padding: 'var(--spacing-sm) var(--spacing-md)',
        textAlign: 'left',
        cursor: 'pointer',
        color: 'var(--color-text-secondary)',
        fontWeight: 600,
        fontSize: 'var(--font-size-xs)',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
        userSelect: 'none',
        width,
      }}
    >
      {label} {sortKey === k ? (sortDir === 'desc' ? '▼' : '▲') : ''}
    </th>
  );

  if (!risks || risks.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: 'var(--spacing-xl)' }}>
      <h4
        className="text-sm font-semibold mb-md"
        style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}
      >
        Risk Register
      </h4>
      <div style={{ overflowX: 'auto' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border-default)' }}>
              <SortHeader k="category" label="Category" width="14%" />
              <SortHeader k="description" label="Description" />
              <SortHeader k="probability" label="P" width="6%" />
              <SortHeader k="impact" label="I" width="6%" />
              <SortHeader k="priority_score" label="Score" width="8%" />
              <SortHeader k="priority_band" label="Band" width="12%" />
              <th
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  textAlign: 'left',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  width: '12%',
                }}
              >
                Mitigation
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => {
              const isOpen = expanded === i;
              return (
                <Fragment key={i}>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--color-border-subtle)',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)',
                    }}
                  >
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                      {r.category}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {r.description}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {r.probability}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>{r.impact}</td>
                    <td
                      style={{
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        fontWeight: 600,
                      }}
                    >
                      {r.priority_score}
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      <PriorityBandBadge band={r.priority_band} />
                    </td>
                    <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                      {r.has_mitigation && r.mitigation ? (
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : i)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--color-accent-blue)',
                            cursor: 'pointer',
                            fontSize: 'var(--font-size-sm)',
                            padding: 0,
                          }}
                        >
                          {isOpen ? 'Hide' : 'View'}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                      )}
                    </td>
                  </tr>
                  {isOpen && r.mitigation && (
                    <tr
                      style={{
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderBottom: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <td colSpan={7} style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                        <span
                          className="text-xs"
                          style={{
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            fontWeight: 600,
                          }}
                        >
                          Mitigation:
                        </span>{' '}
                        <span className="text-sm">{r.mitigation}</span>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Triggered risks panel ─────────────────────────────────────────────────

function TriggeredRisksPanel({ triggered }) {
  return (
    <div
      style={{
        marginTop: 'var(--spacing-xl)',
        padding: 'var(--spacing-lg)',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--color-bg-tertiary)',
        border: '1px solid var(--color-border-default)',
      }}
    >
      <h4
        className="text-sm font-semibold mb-md"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}
      >
        <span style={{ color: 'var(--color-error)' }}>⚠</span> Banned phrase violations
        <span
          style={{
            marginLeft: 'auto',
            backgroundColor: SEVERITY_STYLES.high.bg,
            color: SEVERITY_STYLES.high.color,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            fontSize: 'var(--font-size-xs)',
          }}
        >
          {triggered.length}
        </span>
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {triggered.map((t, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-primary)',
              border: `1px solid ${SEVERITY_STYLES[t.severity]?.border || SEVERITY_STYLES.medium.border}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 'var(--spacing-xs)',
              }}
            >
              <span className="text-sm font-semibold">{t.section || 'Unknown section'}</span>
              <SeverityBadge severity={t.severity} />
            </div>
            <p className="text-sm" style={{ margin: 0, marginBottom: 4 }}>
              <span style={{ color: 'var(--color-text-secondary)' }}>Trigger:</span>{' '}
              <span style={{ fontFamily: 'monospace' }}>&ldquo;{t.trigger}&rdquo;</span>
            </p>
            <p
              className="text-sm text-secondary"
              style={{ margin: 0, marginBottom: t.suggestion ? 4 : 0 }}
            >
              {t.reason}
            </p>
            {t.suggestion && (
              <p className="text-sm" style={{ margin: 0 }}>
                <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>Suggestion:</span>{' '}
                {t.suggestion}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────

const EMPTY_ASSESSMENT = {
  risks: [],
  triggered: [],
  overall_risk_score: 0,
  risk_band: 'Very Low',
  category_breakdown: {},
  band_breakdown: {},
  has_mitigation_coverage: 0,
};

export default function RiskAssessmentSection({ assessment }) {
  const a = assessment || EMPTY_ASSESSMENT;
  const risks = a.risks || [];

  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-warning)' }}>&#9873;</span> Risk Assessment
      </h3>

      <Header
        score={a.overall_risk_score}
        band={a.risk_band}
        coverage={a.has_mitigation_coverage}
        totalRisks={risks.length}
      />

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 'var(--spacing-xl)',
        }}
      >
        <PriorityMatrixHeatmap risks={risks} />
        <CategoryBreakdown breakdown={a.category_breakdown} />
      </div>

      <RiskRegisterTable risks={risks} />

      {a.triggered && a.triggered.length > 0 && <TriggeredRisksPanel triggered={a.triggered} />}
    </div>
  );
}
