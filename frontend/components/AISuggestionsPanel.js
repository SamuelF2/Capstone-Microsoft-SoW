/**
 * AISuggestionsPanel — displays AI analysis results (violations, risks,
 * approval routing, overall score). Shows provenance (generated_at +
 * model_version) and a "Recompute" link when results are present.
 *
 * Props
 * -----
 * analysisResult   { violations, risks, approval, checklist, suggestions, overall_score, summary, generated_at, model_version }
 * collapsed        boolean — start collapsed (default false)
 * showRunButton    boolean — show "Run AI Analysis" button when no data yet
 * onRunAnalysis    () => void — called when run / recompute is clicked
 * loading          boolean — show spinner while analysis is running
 */

import { useEffect, useRef, useState } from 'react';

function formatGeneratedAt(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

const SEVERITY_STYLES = {
  high: { color: 'var(--color-error)', bg: 'rgba(239,68,68,0.1)', label: 'High' },
  medium: { color: 'var(--color-warning)', bg: 'rgba(245,158,11,0.1)', label: 'Medium' },
  low: { color: 'var(--color-success)', bg: 'rgba(74,222,128,0.1)', label: 'Low' },
};

const LEVEL_STYLES = {
  Green: { color: '#137333', bg: '#e6f4ea', dot: '#137333' },
  Yellow: { color: '#e37400', bg: '#fef7e0', dot: '#e37400' },
  Red: { color: '#c5221f', bg: '#fce8e6', dot: '#c5221f' },
};

function ScoreBadge({ score }) {
  const color =
    score >= 80
      ? 'var(--color-success)'
      : score >= 60
        ? 'var(--color-warning)'
        : 'var(--color-error)';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        border: `3px solid ${color}`,
        color,
        fontWeight: 'var(--font-weight-bold)',
        fontSize: 'var(--font-size-sm)',
        flexShrink: 0,
      }}
    >
      {Math.round(score)}
    </div>
  );
}

export default function AISuggestionsPanel({
  analysisResult,
  collapsed: initialCollapsed = false,
  showRunButton = false,
  onRunAnalysis,
  loading = false,
  autoRun = false,
}) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [activeTab, setActiveTab] = useState('violations');

  const hasData = analysisResult != null;

  // Auto-run analysis on first mount when no cached result is present.
  // Reviewers land with risks/violations already populated instead of
  // hunting for the "Run AI Analysis" button.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (!autoRun) return;
    if (autoRanRef.current) return;
    if (hasData || loading) return;
    if (typeof onRunAnalysis !== 'function') return;
    autoRanRef.current = true;
    onRunAnalysis();
  }, [autoRun, hasData, loading, onRunAnalysis]);
  const highCount = hasData
    ? (analysisResult.violations || []).filter((v) => v.severity === 'high').length
    : 0;
  const riskCount = hasData ? (analysisResult.risks || []).length : 0;

  return (
    <div
      style={{
        border: '1px solid var(--color-border-default)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-secondary)',
      }}
    >
      {/* Header / toggle */}
      <div
        onClick={() => setCollapsed((c) => !c)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid var(--color-border-default)',
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--color-text-primary)',
          }}
        >
          AI Recommendations
        </span>

        {hasData && (
          <div style={{ display: 'flex', gap: 'var(--spacing-xs)', alignItems: 'center' }}>
            {highCount > 0 && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(239,68,68,0.1)',
                  color: 'var(--color-error)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                {highCount} high
              </span>
            )}
            {riskCount > 0 && (
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(245,158,11,0.1)',
                  color: 'var(--color-warning)',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {riskCount} risk{riskCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        )}

        <span
          style={{
            fontSize: '10px',
            color: 'var(--color-text-tertiary)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          ▼
        </span>
      </div>

      {!collapsed && (
        <div style={{ padding: 'var(--spacing-md)' }}>
          {/* No data state */}
          {!hasData && !loading && (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
              <p
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 'var(--font-size-sm)',
                  marginBottom: showRunButton ? 'var(--spacing-md)' : 0,
                }}
              >
                No AI analysis available for this SoW.
              </p>
              {showRunButton && onRunAnalysis && (
                <button className="btn btn-secondary btn-sm" onClick={onRunAnalysis}>
                  Run AI Analysis
                </button>
              )}
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
              <div
                style={{
                  display: 'inline-block',
                  width: '24px',
                  height: '24px',
                  border: '3px solid var(--color-border-default)',
                  borderTop: '3px solid var(--color-accent-purple, #7c3aed)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  marginBottom: 'var(--spacing-sm)',
                }}
              />
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                Running AI analysis...
              </p>
            </div>
          )}

          {/* Results */}
          {hasData && !loading && (
            <>
              {/* Provenance row */}
              {(analysisResult.generated_at ||
                analysisResult.model_version ||
                analysisResult.generation_meta?.model_version ||
                onRunAnalysis) && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--spacing-sm)',
                    marginBottom: 'var(--spacing-xs)',
                  }}
                >
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--color-text-tertiary)',
                    }}
                  >
                    {formatGeneratedAt(analysisResult.generated_at) &&
                      `Generated ${formatGeneratedAt(analysisResult.generated_at)}`}
                    {(analysisResult.model_version ||
                      analysisResult.generation_meta?.model_version) &&
                      ` · ${analysisResult.model_version || analysisResult.generation_meta?.model_version}`}
                  </span>
                  {onRunAnalysis && (
                    <button
                      type="button"
                      onClick={onRunAnalysis}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--color-accent-blue, #2563eb)',
                        fontSize: '11px',
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Recompute
                    </button>
                  )}
                </div>
              )}

              {/* Summary row */}
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--spacing-md)',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-md)',
                  padding: 'var(--spacing-sm)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                }}
              >
                {analysisResult.overall_score != null && (
                  <ScoreBadge score={analysisResult.overall_score} />
                )}
                <div style={{ flex: 1 }}>
                  {analysisResult.summary && (
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-primary)',
                        margin: 0,
                        lineHeight: 'var(--line-height-relaxed)',
                      }}
                    >
                      {analysisResult.summary}
                    </p>
                  )}
                  {analysisResult.approval && (
                    <div style={{ marginTop: '4px' }}>
                      {(() => {
                        const lvl =
                          LEVEL_STYLES[analysisResult.approval.level] || LEVEL_STYLES.Yellow;
                        return (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-full)',
                              backgroundColor: lvl.bg,
                              color: lvl.color,
                              fontSize: 'var(--font-size-xs)',
                              fontWeight: 'var(--font-weight-semibold)',
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor: lvl.dot,
                              }}
                            />
                            {analysisResult.approval.level} · {analysisResult.approval.esap_type}
                          </span>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Tab bar */}
              <div
                style={{
                  display: 'flex',
                  gap: '2px',
                  marginBottom: 'var(--spacing-sm)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                {['violations', 'risks', 'routing'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: '6px 10px',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: activeTab === tab ? 'var(--font-weight-semibold)' : 'normal',
                      color:
                        activeTab === tab
                          ? 'var(--color-accent-purple, #7c3aed)'
                          : 'var(--color-text-secondary)',
                      borderBottom:
                        activeTab === tab
                          ? '2px solid var(--color-accent-purple, #7c3aed)'
                          : '2px solid transparent',
                      cursor: 'pointer',
                      marginBottom: '-1px',
                      textTransform: 'capitalize',
                    }}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Violations tab */}
              {activeTab === 'violations' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                  {(analysisResult.violations || []).length === 0 ? (
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No violations detected.
                    </p>
                  ) : (
                    (analysisResult.violations || []).map((v, i) => {
                      const sev = SEVERITY_STYLES[v.severity] || SEVERITY_STYLES.low;
                      return (
                        <div
                          key={i}
                          style={{
                            padding: 'var(--spacing-xs) var(--spacing-sm)',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: sev.bg,
                            borderLeft: `3px solid ${sev.color}`,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: 'var(--spacing-xs)',
                              alignItems: 'center',
                              marginBottom: '2px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: sev.color,
                                textTransform: 'uppercase',
                              }}
                            >
                              {sev.label}
                            </span>
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                              }}
                            >
                              {v.rule}
                            </span>
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                              lineHeight: 'var(--line-height-relaxed)',
                            }}
                          >
                            {v.message}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Risks tab */}
              {activeTab === 'risks' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                  {(analysisResult.risks || []).length === 0 ? (
                    <p
                      style={{
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)',
                      }}
                    >
                      No risks identified.
                    </p>
                  ) : (
                    (analysisResult.risks || []).map((r, i) => {
                      const sev = SEVERITY_STYLES[r.level] || SEVERITY_STYLES.low;
                      return (
                        <div
                          key={i}
                          style={{
                            padding: 'var(--spacing-xs) var(--spacing-sm)',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-default)',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: '2px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: 'var(--color-text-primary)',
                              }}
                            >
                              {r.category}
                            </span>
                            <span
                              style={{
                                fontSize: '10px',
                                fontWeight: 'var(--font-weight-semibold)',
                                color: sev.color,
                                textTransform: 'uppercase',
                              }}
                            >
                              {r.level}
                            </span>
                          </div>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                              lineHeight: 'var(--line-height-relaxed)',
                            }}
                          >
                            {r.description}
                          </p>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Routing tab */}
              {activeTab === 'routing' && analysisResult.approval && (
                <div>
                  {(() => {
                    const ap = analysisResult.approval;
                    const lvl = LEVEL_STYLES[ap.level] || LEVEL_STYLES.Yellow;
                    return (
                      <>
                        <div
                          style={{
                            padding: 'var(--spacing-sm)',
                            borderRadius: 'var(--radius-md)',
                            backgroundColor: lvl.bg,
                            marginBottom: 'var(--spacing-sm)',
                          }}
                        >
                          <p
                            style={{
                              margin: '0 0 4px',
                              fontSize: 'var(--font-size-xs)',
                              fontWeight: 'var(--font-weight-semibold)',
                              color: lvl.color,
                            }}
                          >
                            {ap.esap_type} — {ap.level} routing
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: 'var(--font-size-xs)',
                              color: 'var(--color-text-secondary)',
                            }}
                          >
                            {ap.reason}
                          </p>
                        </div>
                        {ap.chain && ap.chain.length > 0 && (
                          <div>
                            <p
                              style={{
                                fontSize: 'var(--font-size-xs)',
                                color: 'var(--color-text-tertiary)',
                                marginBottom: 'var(--spacing-xs)',
                              }}
                            >
                              Approval chain:
                            </p>
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 'var(--spacing-xs)',
                              }}
                            >
                              {ap.chain.map((role, i) => (
                                <span
                                  key={i}
                                  style={{
                                    padding: '3px 8px',
                                    borderRadius: 'var(--radius-full)',
                                    backgroundColor: 'var(--color-bg-tertiary)',
                                    border: '1px solid var(--color-border-default)',
                                    fontSize: 'var(--font-size-xs)',
                                    color: 'var(--color-text-secondary)',
                                  }}
                                >
                                  {i + 1}. {role}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
