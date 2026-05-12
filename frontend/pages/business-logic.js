import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../lib/auth';
import Spinner from '../components/Spinner';
import { PRIORITY_BAND_STYLES, PriorityBandBadge } from '../components/ai-review';

// ── Workflow Templates Tab ──────────────────────────────────────────────────
// This tab is now a lightweight list + detail view. All authoring happens on
// the dedicated React Flow editor at /workflows/[id]/edit.

function WorkflowTab({ authFetch, user }) {
  const router = useRouter();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateDetail, setTemplateDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filter, setFilter] = useState('all'); // all | mine | shared | system
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    authFetch('/api/workflow/templates')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load templates (${r.status})`);
        return r.json();
      })
      .then(setTemplates)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [authFetch]);

  // Ownership bucket: system templates, the user's own, or the shared library
  // (anything not system and not theirs). Templates with a null created_by are
  // legacy rows before ownership was tracked — we show them in the shared
  // library so they don't vanish from view.
  const categorize = (t) => {
    if (t.is_system) return 'system';
    if (user && t.created_by != null && t.created_by === user.id) return 'mine';
    return 'shared';
  };

  const filteredTemplates = templates.filter((t) => {
    if (filter === 'all') return true;
    return categorize(t) === filter;
  });

  const counts = {
    all: templates.length,
    mine: templates.filter((t) => categorize(t) === 'mine').length,
    shared: templates.filter((t) => categorize(t) === 'shared').length,
    system: templates.filter((t) => categorize(t) === 'system').length,
  };

  const handleSelect = async (tmpl) => {
    if (selectedTemplate?.id === tmpl.id) {
      setSelectedTemplate(null);
      setTemplateDetail(null);
      return;
    }
    setSelectedTemplate(tmpl);
    setTemplateDetail(null);
    setDetailLoading(true);
    try {
      const res = await authFetch(`/api/workflow/templates/${tmpl.id}`);
      if (res.ok) setTemplateDetail(await res.json());
    } catch {
      /* detail is optional — fail silently */
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedTemplate || selectedTemplate.is_system) return;
    // eslint-disable-next-line no-alert
    if (!window.confirm(`Delete "${selectedTemplate.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/workflow/templates/${selectedTemplate.id}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 204) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Server error ${res.status}`);
      }
      setTemplates((prev) => prev.filter((t) => t.id !== selectedTemplate.id));
      setSelectedTemplate(null);
      setTemplateDetail(null);
    } catch (e) {
      // eslint-disable-next-line no-alert
      window.alert(e.message);
    } finally {
      setDeleting(false);
    }
  };

  const openEditor = (id) => router.push(`/workflows/${id}/edit`);

  if (loading) return <Spinner />;
  if (error)
    return (
      <p className="text-sm" style={{ color: 'var(--color-error)' }}>
        {error}
      </p>
    );

  const selectedCat = selectedTemplate ? categorize(selectedTemplate) : null;
  const canEdit = selectedCat === 'mine';

  return (
    <div>
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 'var(--spacing-lg)',
          gap: 'var(--spacing-md)',
        }}
      >
        <div>
          <h3 className="text-lg font-semibold mb-xs">Workflow Templates</h3>
          <p className="text-sm text-secondary">
            Review workflows you can assign to new SoWs. Click a row to preview, or open the visual
            editor to build a graph of stages and transitions. System and shared templates are
            read-only — use <em>Save as copy</em> in the editor to clone them.
          </p>
        </div>
        <button
          onClick={() => router.push('/workflows/new/edit')}
          style={{
            padding: 'var(--spacing-sm) var(--spacing-lg)',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            backgroundColor: 'var(--color-accent-purple, #7c3aed)',
            color: '#fff',
            fontSize: 'var(--font-size-sm)',
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          + New Workflow
        </button>
      </div>

      {/* Ownership filter */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-xs)',
          marginBottom: 'var(--spacing-md)',
          flexWrap: 'wrap',
        }}
      >
        {[
          { key: 'all', label: 'All' },
          { key: 'mine', label: 'Mine' },
          { key: 'shared', label: 'Shared library' },
          { key: 'system', label: 'System' },
        ].map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setSelectedTemplate(null);
                setTemplateDetail(null);
              }}
              style={{
                padding: '4px 14px',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${
                  active ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-border-default)'
                }`,
                backgroundColor: active ? 'rgba(124,58,237,0.08)' : 'transparent',
                color: active
                  ? 'var(--color-accent-purple, #7c3aed)'
                  : 'var(--color-text-secondary)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {f.label} <span style={{ opacity: 0.6, marginLeft: 2 }}>({counts[f.key]})</span>
            </button>
          );
        })}
      </div>

      {/* Template table */}
      <div style={{ overflowX: 'auto', marginBottom: 'var(--spacing-xl)' }}>
        <table
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}
        >
          <thead>
            <tr
              style={{ borderBottom: '1px solid var(--color-border-default)', textAlign: 'left' }}
            >
              {['Name', 'Description', 'Stages', 'Ownership'].map((h) => (
                <th
                  key={h}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    color: 'var(--color-text-secondary)',
                    fontWeight: 600,
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredTemplates.map((tmpl, i) => {
              const isActive = selectedTemplate?.id === tmpl.id;
              const cat = categorize(tmpl);
              return (
                <tr
                  key={tmpl.id}
                  onClick={() => handleSelect(tmpl)}
                  onDoubleClick={() => openEditor(tmpl.id)}
                  style={{
                    borderBottom: '1px solid var(--color-border-subtle)',
                    backgroundColor: isActive
                      ? 'rgba(124,58,237,0.05)'
                      : i % 2 === 0
                        ? 'transparent'
                        : 'var(--color-bg-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                    {tmpl.name}
                    {isActive && (
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-accent-purple, #7c3aed)',
                        }}
                      >
                        ▾
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      padding: 'var(--spacing-sm) var(--spacing-md)',
                      color: 'var(--color-text-secondary)',
                      maxWidth: '320px',
                    }}
                  >
                    {tmpl.description || '—'}
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    {tmpl.stage_count ?? '—'}
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                    <OwnershipBadge category={cat} />
                  </td>
                </tr>
              );
            })}
            {filteredTemplates.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: 'var(--spacing-xl)',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {templates.length === 0
                    ? 'No workflow templates yet — click "+ New Workflow" to create one.'
                    : 'No templates in this view.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Detail View ──────────────────────────────────────────────────── */}
      {selectedTemplate && (
        <div
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-default)',
            backgroundColor: 'var(--color-bg-tertiary)',
          }}
        >
          {/* Detail header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--spacing-md)',
              gap: 'var(--spacing-md)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
              <h4 className="font-semibold" style={{ fontSize: 'var(--font-size-base)' }}>
                {selectedTemplate.name}
              </h4>
              <OwnershipBadge category={selectedCat} />
            </div>
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexShrink: 0 }}>
              <button
                onClick={() => openEditor(selectedTemplate.id)}
                disabled={detailLoading}
                style={{
                  padding: 'var(--spacing-xs) var(--spacing-md)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(124,58,237,0.4)',
                  backgroundColor: 'rgba(124,58,237,0.06)',
                  color: 'var(--color-accent-purple, #7c3aed)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: detailLoading ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                }}
              >
                {canEdit ? 'Edit in flow editor' : 'Open in viewer'}
              </button>
              {canEdit && (
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    padding: 'var(--spacing-xs) var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid rgba(220,38,38,0.4)',
                    backgroundColor: 'rgba(220,38,38,0.06)',
                    color: 'var(--color-error)',
                    fontSize: 'var(--font-size-sm)',
                    cursor: deleting ? 'not-allowed' : 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          {selectedTemplate.description && (
            <p
              className="text-sm text-secondary"
              style={{ marginBottom: 'var(--spacing-md)', lineHeight: 1.5 }}
            >
              {selectedTemplate.description}
            </p>
          )}

          {detailLoading && <p className="text-sm text-secondary">Loading…</p>}

          {templateDetail && (
            <>
              {/* Stage flow pills */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'var(--spacing-sm)',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                {(templateDetail.workflow_data?.stages || [])
                  .filter((s) => s.stage_key !== 'rejected')
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .map((s, idx, arr) => (
                    <span
                      key={s.stage_key}
                      style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
                    >
                      <span
                        style={{
                          padding: '4px 12px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: 'var(--font-size-xs)',
                          fontWeight: 500,
                          backgroundColor: 'var(--color-bg-secondary)',
                          border: '1px solid var(--color-border-default)',
                        }}
                      >
                        {s.display_name}
                      </span>
                      {idx < arr.length - 1 && (
                        <span style={{ color: 'var(--color-text-tertiary)' }}>→</span>
                      )}
                    </span>
                  ))}
              </div>

              {/* Stage cards (read-only preview) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                {(templateDetail.workflow_data?.stages || [])
                  .sort((a, b) => a.stage_order - b.stage_order)
                  .map((s) => (
                    <div
                      key={s.stage_key}
                      style={{
                        padding: 'var(--spacing-sm) var(--spacing-md)',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border-subtle)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        className="font-semibold"
                        style={{ fontSize: 'var(--font-size-sm)', minWidth: '140px' }}
                      >
                        {s.display_name}
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--font-size-xs)',
                          color: 'var(--color-text-tertiary)',
                          textTransform: 'capitalize',
                        }}
                      >
                        {s.stage_type.replace(/_/g, ' ')}
                      </span>
                      {s.roles && s.roles.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {s.roles
                            .filter((r) => r.is_required)
                            .map((r, k) => (
                              <span
                                key={k}
                                style={{
                                  padding: '1px 7px',
                                  borderRadius: 'var(--radius-full)',
                                  fontSize: '10px',
                                  backgroundColor: 'rgba(0,120,212,0.08)',
                                  color: 'var(--color-accent-blue)',
                                  border: '1px solid rgba(0,120,212,0.15)',
                                }}
                              >
                                {r.role_key.replace(/-/g, ' ')}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Small pill used in the workflow list and detail header.
function OwnershipBadge({ category }) {
  const palette = {
    system: {
      label: 'System',
      bg: 'rgba(0,120,212,0.1)',
      color: 'var(--color-accent-blue)',
      border: 'rgba(0,120,212,0.25)',
    },
    mine: {
      label: 'Mine',
      bg: 'rgba(124,58,237,0.1)',
      color: 'var(--color-accent-purple, #7c3aed)',
      border: 'rgba(124,58,237,0.25)',
    },
    shared: {
      label: 'Shared',
      bg: 'var(--color-bg-tertiary)',
      color: 'var(--color-text-secondary)',
      border: 'var(--color-border-default)',
    },
  };
  const p = palette[category] || palette.shared;
  return (
    <span
      style={{
        padding: '2px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 500,
        backgroundColor: p.bg,
        color: p.color,
        border: `1px solid ${p.border}`,
      }}
    >
      {p.label}
    </span>
  );
}

// ── Risk Assessment Tab ─────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginTop: 'var(--spacing-xl)', marginBottom: 'var(--spacing-md)' }}>
      <h3 className="text-lg font-semibold mb-xs">{title}</h3>
      {subtitle && (
        <p className="text-sm text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function CategoryGrid({ categories }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 'var(--spacing-md)',
      }}
    >
      {categories.map((cat) => {
        const ids = cat.risk_ids || [];
        const idsLabel = ids.length > 1 ? `${ids[0]} – ${ids[ids.length - 1]}` : ids[0] || '';
        return (
          <div
            key={cat.id}
            style={{
              padding: 'var(--spacing-lg)',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--color-bg-tertiary)',
              border: `1px solid var(${cat.color_token || '--color-border-default'})`,
              borderLeftWidth: '4px',
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
              <h4
                className="font-semibold"
                style={{
                  fontSize: 'var(--font-size-base)',
                  color: `var(${cat.color_token || '--color-text-primary'})`,
                }}
              >
                {cat.name}
              </h4>
              {idsLabel && (
                <span
                  style={{
                    fontSize: '10px',
                    fontFamily: 'monospace',
                    color: 'var(--color-text-tertiary)',
                    letterSpacing: '0.5px',
                  }}
                >
                  {idsLabel}
                </span>
              )}
            </div>
            <p
              className="text-sm text-secondary"
              style={{ lineHeight: 'var(--line-height-relaxed)', margin: 0 }}
            >
              {cat.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function PriorityMatrixLegend({ matrix }) {
  const bands = matrix?.bands || [];
  const probRows = [5, 4, 3, 2, 1];
  const impactCols = [1, 2, 3, 4, 5];

  const bandForScore = (score) => {
    for (const b of bands) {
      if (score >= b.min && score <= b.max) return b;
    }
    return null;
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
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
        <div style={{ flex: 1, maxWidth: 400 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '24px repeat(5, 1fr)', gap: 4 }}>
            {probRows.map((p) => (
              <div key={`row-${p}`} style={{ display: 'contents' }}>
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
                {impactCols.map((i) => {
                  const score = p * i;
                  const band = bandForScore(score);
                  return (
                    <div
                      key={`${p}:${i}`}
                      style={{
                        aspectRatio: '1 / 1',
                        backgroundColor: band ? `${band.color}1f` : 'var(--color-bg-tertiary)',
                        border: `1px solid ${band ? `${band.color}55` : 'var(--color-border-default)'}`,
                        borderRadius: 'var(--radius-sm)',
                        color: band ? band.color : 'var(--color-text-secondary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {score}
                    </div>
                  );
                })}
              </div>
            ))}
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

      {/* Band legend */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-md)',
          flexWrap: 'wrap',
          marginTop: 'var(--spacing-lg)',
        }}
      >
        {bands.map((b) => (
          <div
            key={b.id}
            style={{
              flex: '1 1 200px',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: `${b.color}14`,
              border: `1px solid ${b.color}55`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
              }}
            >
              <span style={{ color: b.color, fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>
                {b.id}
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {b.min}–{b.max}
              </span>
            </div>
            <p className="text-xs text-secondary" style={{ margin: 0 }}>
              {b.action}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaybookAccordion({ playbooks }) {
  const [open, setOpen] = useState({});
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
      {playbooks.map((pb) => {
        const isOpen = !!open[pb.category];
        const hasPatterns = pb.patterns && pb.patterns.length > 0;
        return (
          <div
            key={pb.category}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-default)',
              backgroundColor: 'var(--color-bg-tertiary)',
              overflow: 'hidden',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen({ ...open, [pb.category]: !isOpen })}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm) var(--spacing-md)',
                background: 'transparent',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                color: 'var(--color-text-primary)',
              }}
            >
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {pb.category}
                <span
                  style={{
                    marginLeft: 'var(--spacing-sm)',
                    color: 'var(--color-text-tertiary)',
                    fontWeight: 400,
                  }}
                >
                  {hasPatterns ? `${pb.patterns.length} patterns` : 'No patterns'}
                </span>
              </span>
              <span style={{ color: 'var(--color-text-secondary)' }}>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div
                style={{
                  padding: 'var(--spacing-md)',
                  borderTop: '1px solid var(--color-border-subtle)',
                }}
              >
                {!hasPatterns && (
                  <p className="text-sm text-secondary" style={{ margin: 0 }}>
                    {pb.note ||
                      'No mitigation patterns enumerated in the framework for this category.'}
                  </p>
                )}
                {hasPatterns && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--spacing-md)',
                    }}
                  >
                    {pb.patterns.map((p, i) => (
                      <div key={i}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-sm)',
                            marginBottom: 4,
                          }}
                        >
                          <span
                            className="font-semibold"
                            style={{ fontSize: 'var(--font-size-sm)' }}
                          >
                            {p.risk}
                          </span>
                          <span
                            style={{
                              padding: '1px 8px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '10px',
                              fontFamily: 'monospace',
                              backgroundColor: 'var(--color-bg-secondary)',
                              color: 'var(--color-text-tertiary)',
                              border: '1px solid var(--color-border-subtle)',
                            }}
                          >
                            {p.risk_id}
                          </span>
                        </div>
                        <ul
                          style={{
                            margin: 0,
                            paddingLeft: 'var(--spacing-lg)',
                            color: 'var(--color-text-secondary)',
                            fontSize: 'var(--font-size-sm)',
                          }}
                        >
                          {p.mitigations.map((m, j) => (
                            <li key={j} style={{ marginBottom: 2 }}>
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PortfolioKpis({ summary }) {
  const highVeryHigh =
    (summary.band_breakdown?.High || 0) + (summary.band_breakdown?.['Very High'] || 0);
  const coveragePct = Math.round((summary.avg_mitigation_coverage || 0) * 100);
  const tiles = [
    { label: 'SoWs analysed', value: summary.total_sows_analysed },
    { label: 'Total risks', value: summary.total_risks },
    { label: 'Mitigation coverage', value: `${coveragePct}%` },
    {
      label: 'High + Very High SoWs',
      value: highVeryHigh,
      accent: highVeryHigh > 0 ? PRIORITY_BAND_STYLES.High.color : null,
    },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 'var(--spacing-md)',
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            padding: 'var(--spacing-lg)',
            borderRadius: 'var(--radius-lg)',
            backgroundColor: 'var(--color-bg-tertiary)',
            border: '1px solid var(--color-border-default)',
          }}
        >
          <div
            style={{
              fontSize: '1.75rem',
              fontWeight: 700,
              lineHeight: 1,
              color: t.accent || 'var(--color-text-primary)',
            }}
          >
            {t.value}
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
            {t.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function HighRiskSowsList({ sows }) {
  if (!sows || sows.length === 0) {
    return (
      <p className="text-sm text-secondary" style={{ marginTop: 'var(--spacing-md)' }}>
        No SoWs currently in the High or Very High risk band.
      </p>
    );
  }
  return (
    <div
      style={{
        marginTop: 'var(--spacing-md)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-default)',
        overflow: 'hidden',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-sm)' }}>
        <thead>
          <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', textAlign: 'left' }}>
            {['Title', 'Customer', 'Band', 'Score', 'ESAP', 'Updated'].map((h) => (
              <th
                key={h}
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: 600,
                  fontSize: 'var(--font-size-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sows.map((s, i) => (
            <tr
              key={s.sow_id}
              style={{
                borderTop: '1px solid var(--color-border-subtle)',
                backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--color-bg-tertiary)',
              }}
            >
              <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 500 }}>
                <Link
                  href={`/sow/${s.sow_id}`}
                  style={{
                    color: 'var(--color-accent-blue)',
                    textDecoration: 'none',
                  }}
                >
                  {s.title}
                </Link>
              </td>
              <td
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {s.customer_name || '—'}
              </td>
              <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)' }}>
                <PriorityBandBadge band={s.risk_band} />
              </td>
              <td style={{ padding: 'var(--spacing-sm) var(--spacing-md)', fontWeight: 600 }}>
                {Number(s.overall_risk_score || 0).toFixed(0)} / 25
              </td>
              <td
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                {s.esap_flag || '—'}
              </td>
              <td
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--font-size-xs)',
                }}
              >
                {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskAssessmentTab({ framework, authFetch, user }) {
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    authFetch('/api/rules/risk-summary')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load summary (${r.status})`);
        return r.json();
      })
      .then(setSummary)
      .catch((e) => setSummaryError(e.message))
      .finally(() => setSummaryLoading(false));
  }, [user, authFetch]);

  const categories = framework?.categories || [];
  const priorityMatrix = framework?.priorityMatrix || {};
  const playbooks = useMemo(() => framework?.playbooks || [], [framework]);

  return (
    <div>
      <SectionHeader
        title="Risk Categories"
        subtitle="Six primary risk domains per the Professional Services Risk Framework. The keyword classifier in the backend uses these category definitions to bucket newly identified risks."
      />
      <CategoryGrid categories={categories} />

      <SectionHeader
        title="Priority Matrix"
        subtitle="Probability × Impact yields the priority score (1–25), which maps to a band that drives escalation and mitigation requirements."
      />
      <PriorityMatrixLegend matrix={priorityMatrix} />

      <SectionHeader
        title="Mitigation Playbooks"
        subtitle="Standard mitigation patterns by risk category, sourced from framework §5.2. Reputational and Strategic categories don't yet have enumerated playbooks."
      />
      <PlaybookAccordion playbooks={playbooks} />

      <SectionHeader
        title="Portfolio Risk Summary"
        subtitle="Aggregated risk profile across SoWs you can access (limited to the 200 most recently analysed)."
      />
      {summaryLoading && (
        <div style={{ padding: 'var(--spacing-lg) 0' }}>
          <Spinner />
        </div>
      )}
      {summaryError && !summaryLoading && (
        <p className="text-sm" style={{ color: 'var(--color-error)' }}>
          {summaryError}
        </p>
      )}
      {summary && !summaryLoading && (
        <>
          <PortfolioKpis summary={summary} />
          <SectionHeader title="High-risk SoWs" />
          <HighRiskSowsList sows={summary.high_risk_sows} />
        </>
      )}
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

const TABS = [
  { key: 'risk', label: 'Risk Assessment' },
  { key: 'workflow', label: 'Workflow Templates' },
];

export default function BusinessLogic() {
  const { user, authFetch } = useAuth();
  const [framework, setFramework] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('risk');

  useEffect(() => {
    if (!user) return;
    authFetch('/api/rules/risk-framework')
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load risk framework (${res.status})`);
        return res.json();
      })
      .then(setFramework)
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
              Risk assessment framework and workflow templates that drive SoW validation and review.
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
          {activeTab === 'risk' && loading && (
            <div style={{ textAlign: 'center', padding: 'var(--spacing-3xl) 0' }}>
              <Spinner />
            </div>
          )}

          {activeTab === 'risk' && error && (
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

          {activeTab === 'risk' && !loading && !error && framework && (
            <div className="card">
              <RiskAssessmentTab framework={framework} authFetch={authFetch} user={user} />
            </div>
          )}

          {activeTab === 'workflow' && (
            <div className="card">
              <WorkflowTab authFetch={authFetch} user={user} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
