/**
 * WorkflowTemplateSelector — card-based workflow template picker used in the
 * SoW creation flow (create-new.js).
 *
 * Fetches available templates from GET /api/workflow/templates and displays
 * them as selectable cards. The default ESAP template is pre-selected.
 *
 * Props
 * -----
 * selectedTemplateId   number|null   — currently selected template ID (null = default)
 * onSelect             function      — called with the template ID when a card is clicked
 * authFetch            function      — authenticated fetch from useAuth()
 */

import { useState, useEffect } from 'react';

export default function WorkflowTemplateSelector({ selectedTemplateId, onSelect, authFetch }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [defaultId, setDefaultId] = useState(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const { signal } = ctrl;
    authFetch('/api/workflow/templates', { signal })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (signal.aborted) return;
        setTemplates(data);
        // Auto-select the system default template on first load
        const def = data.find((t) => t.is_system);
        if (def) {
          setDefaultId(def.id);
          if (selectedTemplateId === null || selectedTemplateId === undefined) {
            onSelect(def.id);
          }
        }
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [authFetch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build a short stage preview string like "6 stages: Draft → AI Review → …"
  function stagePreview(template) {
    const count = template.stage_count || 0;
    if (count === 0) return `${count} stages`;
    return `${count} stages`;
  }

  if (loading) {
    return <p className="text-sm text-secondary">Loading workflow templates…</p>;
  }

  if (templates.length === 0) {
    return <p className="text-sm text-secondary">No workflow templates available.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
      {templates.map((tmpl) => {
        const isSelected = selectedTemplateId === tmpl.id;
        const isDefault = tmpl.id === defaultId;

        return (
          <div
            key={tmpl.id}
            onClick={() => onSelect(tmpl.id)}
            style={{
              padding: 'var(--spacing-md)',
              border: `2px solid ${isSelected ? 'var(--color-accent-purple, #7c3aed)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-lg)',
              cursor: 'pointer',
              backgroundColor: isSelected ? 'rgba(124,58,237,0.05)' : 'var(--color-bg-primary)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)',
              transition: 'border-color 0.15s',
            }}
          >
            <span style={{ fontSize: '1.5rem', flexShrink: 0 }}>🔀</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  flexWrap: 'wrap',
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontWeight: 'var(--font-weight-semibold)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {tmpl.name}
                </p>
                {isDefault && (
                  <span
                    style={{
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'rgba(0,120,212,0.1)',
                      color: 'var(--color-accent-blue)',
                      border: '1px solid rgba(0,120,212,0.2)',
                      fontWeight: 500,
                    }}
                  >
                    Default
                  </span>
                )}
                {tmpl.is_system && !isDefault && (
                  <span
                    style={{
                      padding: '1px 7px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: 'var(--font-size-xs)',
                      backgroundColor: 'var(--color-bg-tertiary)',
                      color: 'var(--color-text-secondary)',
                      border: '1px solid var(--color-border-default)',
                      fontWeight: 500,
                    }}
                  >
                    System
                  </span>
                )}
              </div>
              {tmpl.description && (
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  {tmpl.description}
                </p>
              )}
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {stagePreview(tmpl)}
              </p>
            </div>
            {isSelected && (
              <span
                style={{
                  color: 'var(--color-accent-purple, #7c3aed)',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ✓
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
