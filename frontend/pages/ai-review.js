import { useState } from 'react';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

const ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXTENSIONS = ['.pdf', '.docx'];

// ── Mock AI recommendations (replace with API call when ready) ──────────────

const MOCK_RECOMMENDATIONS = {
  violations: [
    {
      rule: 'Missing SLA terms',
      severity: 'high',
      message:
        'No Service Level Agreement defined in the scope section. MCEM requires explicit SLA commitments for all delivery engagements.',
    },
    {
      rule: 'Unbounded scope language',
      severity: 'high',
      message:
        'Phrase "best effort" detected in section 3.2. SDMPlus prohibits vague commitment language — replace with measurable deliverables.',
    },
    {
      rule: 'Missing support transition plan',
      severity: 'medium',
      message:
        'No support handoff or hypercare period defined. Required for all methodologies per MCEM guidelines.',
    },
    {
      rule: 'Incomplete risk register',
      severity: 'medium',
      message:
        'Two identified risks lack mitigation strategies. All risks must include severity, probability, and mitigation plan.',
    },
    {
      rule: 'Customer responsibilities unclear',
      severity: 'low',
      message:
        'Customer resource commitments listed but no RACI matrix provided. Recommended for engagements over $500K.',
    },
  ],
  risks: [
    {
      category: 'Staffing',
      level: 'high',
      description:
        'No backup resource identified for lead Solution Architect role. Single point of failure on critical path.',
    },
    {
      category: 'Timeline',
      level: 'medium',
      description:
        'Sprint 4 delivery overlaps with customer holiday freeze (Dec 20 – Jan 5). Milestone dates may need adjustment.',
    },
    {
      category: 'Budget',
      level: 'low',
      description:
        'Travel & expenses estimated at 3% of engagement value, which is below the typical 5-8% range for on-site delivery.',
    },
  ],
  approval: {
    level: 'Yellow',
    esapType: 'Type-2',
    reason: 'Deal value $2.4M exceeds $1M threshold with estimated margin at 14% (below 15%).',
    chain: [
      'Solution Architect',
      'SQA Reviewer',
      'Customer Practice Lead',
      'Customer Delivery Partner',
    ],
  },
  checklist: [
    { item: 'Verify pricing against approved rate card', required: true, checked: false },
    { item: 'Confirm scope aligns with selected methodology', required: true, checked: false },
    {
      item: 'Validate deliverable acceptance criteria are measurable',
      required: true,
      checked: false,
    },
    {
      item: 'Review risk register for completeness (severity + mitigation)',
      required: true,
      checked: false,
    },
    {
      item: 'Ensure customer responsibilities are explicitly stated',
      required: true,
      checked: false,
    },
    { item: 'Check change management process is documented', required: false, checked: false },
    { item: 'Verify billing milestones match delivery schedule', required: false, checked: false },
    {
      item: 'Confirm support transition plan covers hypercare period',
      required: true,
      checked: false,
    },
  ],
  suggestions: [
    {
      section: 'Scope',
      line: '3.2',
      type: 'rewrite',
      original: 'We will provide best effort support during the transition period.',
      suggested:
        'Microsoft will provide Severity-1 incident response within 4 business hours during the 30-day hypercare period.',
      reason:
        'Replace vague "best effort" commitment with measurable SLA terms per MCEM guidelines.',
    },
    {
      section: 'Deliverables',
      line: '4.1',
      type: 'add',
      original: 'Architecture design document.',
      suggested:
        'Architecture design document — includes deployment topology, data flow diagrams, security boundary mapping, and disaster recovery plan. Acceptance criteria: approved by customer technical lead within 5 business days.',
      reason:
        'Deliverable lacks acceptance criteria. SDMPlus requires measurable AC for every deliverable.',
    },
    {
      section: 'Assumptions',
      line: '6.3',
      type: 'rewrite',
      original: 'Customer will provide necessary access and resources.',
      suggested:
        'Customer will provision VPN access for 5 named Microsoft consultants within 10 business days of SOW signature. Customer will assign a dedicated technical POC available 4 hours/week.',
      reason: 'Assumption is too vague — specify quantity, timeline, and commitment level.',
    },
    {
      section: 'Risks',
      line: '7.2',
      type: 'add',
      original: 'Data migration may encounter unexpected schema differences.',
      suggested:
        'Data migration may encounter unexpected schema differences. Mitigation: allocate 2-week discovery sprint for schema analysis before migration begins. Contingency: 15% buffer on migration timeline. Severity: Medium. Probability: High.',
      reason:
        'Risk identified but missing mitigation strategy, severity rating, and probability assessment.',
    },
    {
      section: 'Pricing',
      line: '8.1',
      type: 'flag',
      original: 'Total engagement value: $2,400,000 (Fixed Fee).',
      suggested:
        'Total engagement value: $2,400,000 (Fixed Fee). Includes 8% risk reserve ($192,000) per ESAP Type-2 requirements. Change orders billed at T&M rates per approved rate card.',
      reason:
        'Fixed-fee engagements over $1M require explicit risk reserve allocation and change order terms.',
    },
    {
      section: 'Support Transition',
      line: '9.1',
      type: 'add',
      original: '',
      suggested:
        'Post-delivery support transition plan: 30-day hypercare period with dedicated L2 engineer. Knowledge transfer sessions (3x per week) for customer ops team. Runbook handoff with incident escalation matrix. RACI: Microsoft leads hypercare; customer assumes ownership on Day 31.',
      reason:
        'Support transition plan is entirely missing. Required for all delivery methodologies per MCEM.',
    },
  ],
  similarSows: [
    { title: 'Contoso Cloud Adoption Phase 2', methodology: 'Cloud Adoption', similarity: 0.89 },
    {
      title: 'Fabrikam Agile Transformation',
      methodology: 'Agile Sprint Delivery',
      similarity: 0.76,
    },
    { title: 'Northwind ERP Sure Step Migration', methodology: 'Sure Step 365', similarity: 0.71 },
  ],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(file) {
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Invalid file type "${ext}". Only .pdf and .docx files are accepted.`;
  }
  if (file.type && !ALLOWED_MIMES.has(file.type)) {
    return 'File type not recognized. Please upload a genuine PDF or Word (.docx) file.';
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${formatFileSize(file.size)}). Maximum size is 25 MB.`;
  }
  return '';
}

const SEVERITY_STYLES = {
  high: {
    bg: 'rgba(239,68,68,0.12)',
    color: '#ef4444',
    border: 'rgba(239,68,68,0.3)',
    label: 'High',
  },
  medium: {
    bg: 'rgba(251,191,36,0.12)',
    color: '#fbbf24',
    border: 'rgba(251,191,36,0.3)',
    label: 'Medium',
  },
  low: {
    bg: 'rgba(74,222,128,0.12)',
    color: '#4ade80',
    border: 'rgba(74,222,128,0.3)',
    label: 'Low',
  },
};

const APPROVAL_STYLES = {
  Green: { bg: 'rgba(74,222,128,0.15)', color: '#4ade80', border: 'rgba(74,222,128,0.4)' },
  Yellow: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: 'rgba(251,191,36,0.4)' },
  Red: { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.4)' },
};

// ── Recommendation Sub-Components ───────────────────────────────────────────

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity] || SEVERITY_STYLES.low;
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

function ViolationsSection({ violations }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-error)' }}>&#9888;</span> Compliance Violations
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {violations.length} found
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {violations.map((v, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: `3px solid ${(SEVERITY_STYLES[v.severity] || SEVERITY_STYLES.low).color}`,
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
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {v.rule}
              </span>
              <SeverityBadge severity={v.severity} />
            </div>
            <p
              className="text-secondary"
              style={{ fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}
            >
              {v.message}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RisksSection({ risks }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-warning)' }}>&#9873;</span> Delivery Risks
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 'var(--spacing-md)',
        }}
      >
        {risks.map((r, i) => {
          const s = SEVERITY_STYLES[r.level] || SEVERITY_STYLES.low;
          return (
            <div
              key={i}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: `1px solid ${s.border}`,
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
                <span
                  className="font-semibold"
                  style={{ fontSize: 'var(--font-size-sm)', color: s.color }}
                >
                  {r.category}
                </span>
                <SeverityBadge severity={r.level} />
              </div>
              <p
                className="text-secondary"
                style={{
                  fontSize: 'var(--font-size-sm)',
                  lineHeight: 'var(--line-height-relaxed)',
                }}
              >
                {r.description}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ApprovalSection({ approval }) {
  const style = APPROVAL_STYLES[approval.level] || APPROVAL_STYLES.Yellow;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-info)' }}>&#9745;</span> ESAP Approval Status
      </h3>
      <div
        style={{
          padding: 'var(--spacing-lg)',
          borderRadius: 'var(--radius-lg)',
          backgroundColor: style.bg,
          border: `1px solid ${style.border}`,
          marginBottom: 'var(--spacing-lg)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
            marginBottom: 'var(--spacing-sm)',
          }}
        >
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              borderRadius: '50%',
              backgroundColor: style.color,
              boxShadow: `0 0 8px ${style.color}`,
            }}
          />
          <span
            className="font-semibold"
            style={{ fontSize: 'var(--font-size-xl)', color: style.color }}
          >
            {approval.level} — {approval.esapType}
          </span>
        </div>
        <p
          className="text-secondary"
          style={{ fontSize: 'var(--font-size-sm)', lineHeight: 'var(--line-height-relaxed)' }}
        >
          {approval.reason}
        </p>
      </div>
      <div>
        <p className="text-sm font-semibold mb-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Required Approval Chain
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--spacing-sm)',
            alignItems: 'center',
          }}
        >
          {approval.chain.map((person, i) => (
            <span
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
            >
              <span
                style={{
                  padding: '4px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-sm)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)',
                }}
              >
                {person}
              </span>
              {i < approval.chain.length - 1 && (
                <span
                  style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}
                >
                  &#8594;
                </span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChecklistSection({ checklist }) {
  const [items, setItems] = useState(checklist);
  const toggle = (idx) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, checked: !it.checked } : it)));
  };
  const done = items.filter((it) => it.checked).length;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-blue)' }}>&#9776;</span> Review Checklist
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: done === items.length ? 'var(--color-success)' : 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {done}/{items.length} complete
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {items.map((it, i) => (
          <label
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--spacing-md)',
              padding: 'var(--spacing-sm) var(--spacing-md)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              backgroundColor: it.checked ? 'rgba(74,222,128,0.05)' : 'transparent',
              transition: 'background-color var(--transition-base)',
            }}
          >
            <input
              type="checkbox"
              checked={it.checked}
              onChange={() => toggle(i)}
              style={{
                marginTop: 3,
                accentColor: 'var(--color-accent-blue)',
                width: 16,
                height: 16,
              }}
            />
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                color: it.checked ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                textDecoration: it.checked ? 'line-through' : 'none',
                lineHeight: 'var(--line-height-relaxed)',
              }}
            >
              {it.item}
              {it.required && (
                <span
                  style={{
                    color: 'var(--color-error)',
                    marginLeft: 4,
                    fontSize: 'var(--font-size-xs)',
                  }}
                >
                  *
                </span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

const SUGGESTION_TYPE_STYLES = {
  rewrite: { label: 'Rewrite', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
  add: { label: 'Add', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  flag: { label: 'Flag', color: '#ef4444', bg: 'rgba(239,68,68,0.12)' },
};

function SuggestionsSection({ suggestions }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-blue)' }}>&#9998;</span> Section Suggestions
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: 400,
          }}
        >
          {suggestions.length} suggestions
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {suggestions.map((s, i) => {
          const typeStyle = SUGGESTION_TYPE_STYLES[s.type] || SUGGESTION_TYPE_STYLES.flag;
          return (
            <div
              key={i}
              style={{
                padding: 'var(--spacing-lg)',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'var(--color-bg-tertiary)',
                border: '1px solid var(--color-border-default)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-md)',
                }}
              >
                <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                  {s.section}
                  <span className="text-tertiary" style={{ fontWeight: 400, marginLeft: 6 }}>
                    Line {s.line}
                  </span>
                </span>
                <span
                  style={{
                    padding: '2px 10px',
                    borderRadius: 'var(--radius-full)',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 600,
                    backgroundColor: typeStyle.bg,
                    color: typeStyle.color,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {typeStyle.label}
                </span>
              </div>

              {s.original && (
                <div
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'rgba(239,68,68,0.06)',
                    borderLeft: '3px solid rgba(239,68,68,0.4)',
                    marginBottom: 'var(--spacing-sm)',
                  }}
                >
                  <p
                    style={{
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--color-text-tertiary)',
                      textDecoration: 'line-through',
                      lineHeight: 'var(--line-height-relaxed)',
                      margin: 0,
                    }}
                  >
                    {s.original}
                  </p>
                </div>
              )}

              <div
                style={{
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(74,222,128,0.06)',
                  borderLeft: '3px solid rgba(74,222,128,0.4)',
                  marginBottom: 'var(--spacing-sm)',
                }}
              >
                <p
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    lineHeight: 'var(--line-height-relaxed)',
                    margin: 0,
                  }}
                >
                  {s.suggested}
                </p>
              </div>

              <p
                className="text-secondary"
                style={{
                  fontSize: 'var(--font-size-xs)',
                  lineHeight: 'var(--line-height-relaxed)',
                  margin: 0,
                  fontStyle: 'italic',
                }}
              >
                {s.reason}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionAnalysisSection({ sections, missingKeywords }) {
  const found = sections.filter((s) => s.found).length;
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-blue)' }}>&#128196;</span> Section Analysis
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 'var(--font-size-sm)',
            color: found === sections.length ? 'var(--color-success)' : 'var(--color-warning)',
            fontWeight: 400,
          }}
        >
          {found}/{sections.length} sections found
        </span>
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {sections.map((s, i) => (
          <div
            key={i}
            style={{
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
              borderLeft: `3px solid ${s.found ? 'var(--color-success)' : 'var(--color-error)'}`,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: s.issues.length > 0 ? 'var(--spacing-xs)' : 0,
              }}
            >
              <span className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {s.displayName}
              </span>
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 600,
                  backgroundColor: s.found ? 'rgba(74,222,128,0.12)' : 'rgba(239,68,68,0.12)',
                  color: s.found ? '#4ade80' : '#ef4444',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {s.found ? 'Found' : 'Missing'}
              </span>
            </div>
            {s.issues.length > 0 && (
              <div style={{ marginTop: 'var(--spacing-xs)' }}>
                {s.issues.map((issue, j) => (
                  <p
                    key={j}
                    className="text-secondary"
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      lineHeight: 'var(--line-height-relaxed)',
                      margin: 0,
                    }}
                  >
                    {issue}
                  </p>
                ))}
              </div>
            )}
            {s.found && s.content && (
              <details style={{ marginTop: 'var(--spacing-sm)' }}>
                <summary
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                  }}
                >
                  Preview extracted content
                </summary>
                <p
                  style={{
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--color-text-tertiary)',
                    lineHeight: 'var(--line-height-relaxed)',
                    marginTop: 'var(--spacing-xs)',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '120px',
                    overflow: 'auto',
                  }}
                >
                  {s.content}
                </p>
              </details>
            )}
          </div>
        ))}
      </div>

      {missingKeywords && missingKeywords.length > 0 && (
        <div style={{ marginTop: 'var(--spacing-lg)' }}>
          <p
            className="text-sm font-semibold mb-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            Missing Methodology Keywords
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-xs)' }}>
            {missingKeywords.map((kw, i) => (
              <span
                key={i}
                style={{
                  padding: '2px 10px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: 'var(--font-size-xs)',
                  backgroundColor: 'rgba(251,191,36,0.12)',
                  color: '#fbbf24',
                  border: '1px solid rgba(251,191,36,0.3)',
                }}
              >
                {kw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SimilarSowsSection({ similarSows }) {
  return (
    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
      <h3
        className="text-lg font-semibold mb-lg"
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}
      >
        <span style={{ color: 'var(--color-accent-purple-light)' }}>&#128279;</span> Similar SoWs in
        Knowledge Graph
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        {similarSows.map((s, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 'var(--spacing-md) var(--spacing-lg)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-tertiary)',
            }}
          >
            <div>
              <p className="font-semibold" style={{ fontSize: 'var(--font-size-sm)' }}>
                {s.title}
              </p>
              <p className="text-tertiary" style={{ fontSize: 'var(--font-size-xs)' }}>
                {s.methodology}
              </p>
            </div>
            <div
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'rgba(139,92,246,0.12)',
                color: 'var(--color-accent-purple-light)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 600,
              }}
            >
              {Math.round(s.similarity * 100)}% match
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function AIReview() {
  const router = useRouter();
  const { sowId } = router.query; // set when coming from draft submit-for-review
  const { authFetch } = useAuth();
  const [file, setFile] = useState(null);
  const [methodology, setMethodology] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState({ file: '', methodology: '' });
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [recommendations, setRecommendations] = useState(null);
  const [currentSowId, setCurrentSowId] = useState(null);
  const [isProceeding, setIsProceeding] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [similarSows, setSimilarSows] = useState([]);

  // If arriving from draft submit-for-review (Path A), auto-trigger AI analysis
  useEffect(() => {
    if (!sowId || !authFetch) return;
    setCurrentSowId(sowId);
    setIsAnalyzing(true);
    setAiUnavailable(false);
    setError(null);

    authFetch(`/api/sow/${sowId}/ai-analyze`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail?.detail || `AI analysis failed (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        // Map API response to component format
        setRecommendations({
          violations: data.violations || [],
          risks: data.risks || [],
          approval: {
            level: data.approval?.level || 'Yellow',
            esapType: data.approval?.esap_type || 'Type-2',
            reason: data.approval?.reason || '',
            chain: data.approval?.chain || [],
          },
          checklist: (data.checklist || []).map((c) => ({
            item: c.text,
            required: c.required,
            checked: false,
          })),
          suggestions: (data.suggestions || []).map((s) => ({
            section: s.section,
            line: '',
            type: s.rationale?.includes('missing') ? 'add' : 'rewrite',
            original: s.current_text || '',
            suggested: s.suggested_text || '',
            reason: s.rationale || '',
          })),
          sections: [],
          missingKeywords: [],
        });
        setIsAnalyzing(false);
        setShowResults(true);

        // Fetch similar SoWs from the AI proxy (non-blocking)
        authFetch(`/api/ai/sow/${sowId}/similar`)
          .then((r) => (r.ok ? r.json() : []))
          .then((data) => setSimilarSows(data))
          .catch(() => {});
      })
      .catch((err) => {
        setAiUnavailable(true);
        setError(err.message);
        setIsAnalyzing(false);
      });
  }, [sowId, authFetch]);

  // Proceed to Internal Review (after AI review)
  const handleProceedToReview = async () => {
    const id = currentSowId;
    if (!id) return;
    setIsProceeding(true);
    setError(null);
    try {
      const res = await authFetch(`/api/sow/${id}/proceed-to-review`, { method: 'POST' });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Failed to proceed (${res.status})`);
      }
      router.push('/all-sows');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProceeding(false);
    }
  };

  const processSelectedFile = (selected) => {
    const fileError = validateFile(selected);
    if (fileError) {
      setFile(null);
      setErrors((prev) => ({ ...prev, file: fileError }));
    } else {
      setFile(selected);
      setErrors((prev) => ({ ...prev, file: '' }));
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    const newErrors = { file: '', methodology: '' };
    if (!file) {
      newErrors.file = 'Please upload a SoW document.';
    }
    if (!methodology) {
      newErrors.methodology = 'Please select a methodology.';
    }
    if (newErrors.file || newErrors.methodology) {
      setErrors(newErrors);
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('methodology', methodology);

      const res = await authFetch('/api/sow/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail?.detail || `Upload failed (${res.status})`);
      }

      const sow = await res.json();
      setCurrentSowId(sow.id);

      // Upload succeeded — now submit for review (transitions to ai_review)
      await authFetch(`/api/sow/${sow.id}/submit-for-review`, { method: 'POST' });

      // Run AI analysis
      setIsUploading(false);
      setIsAnalyzing(true);

      const aiRes = await authFetch(`/api/sow/${sow.id}/ai-analyze`, { method: 'POST' });
      if (!aiRes.ok) {
        const detail = await aiRes.json().catch(() => ({}));
        throw new Error(detail?.detail || `AI analysis failed (${aiRes.status})`);
      }
      const aiData = await aiRes.json();

      // Also parse for section analysis
      let parseData = { sections: [], missingKeywords: [], violations: [] };
      try {
        const parseRes = await authFetch(`/api/sow/${sow.id}/parse`, { method: 'POST' });
        if (parseRes.ok) {
          parseData = await parseRes.json();
        }
      } catch {
        // Parse is optional, AI analysis is the primary
      }

      // Merge AI analysis with parse results
      const data = {
        sections: parseData.sections || [],
        missingKeywords: parseData.missingKeywords || [],
        violations: aiData.violations || [],
        risks: aiData.risks || [],
        approval: {
          level: aiData.approval?.level || 'Yellow',
          esapType: aiData.approval?.esap_type || 'Type-2',
          reason: aiData.approval?.reason || '',
          chain: aiData.approval?.chain || [],
        },
        checklist: (aiData.checklist || []).map((c) => ({
          item: c.text,
          required: c.required,
          checked: false,
        })),
        suggestions: (aiData.suggestions || []).map((s) => ({
          section: s.section,
          line: '',
          type: s.rationale?.includes('missing') ? 'add' : 'rewrite',
          original: s.current_text || '',
          suggested: s.suggested_text || '',
          reason: s.rationale || '',
        })),
      };

      setRecommendations(data);
      setIsAnalyzing(false);
      setShowResults(true);

      // Fetch similar SoWs from the AI proxy (non-blocking)
      authFetch(`/api/ai/sow/${sow.id}/similar`)
        .then((r) => (r.ok ? r.json() : []))
        .then((similar) => setSimilarSows(similar))
        .catch(() => {});
    } catch (err) {
      setAiUnavailable(true);
      setError(err.message);
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const methodologies = ['Agile Sprint Delivery', 'Sure Step 365', 'Waterfall', 'Cloud Adoption'];

  const isValid = file && methodology && !errors.file && !errors.methodology;

  return (
    <>
      <Head>
        <title>AI Review – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">AI-Powered SoW Review</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Upload an existing Statement of Work document for automated compliance analysis and
              expert AI recommendations.
            </p>
          </div>

          {/* AI unavailable banner */}
          {aiUnavailable && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(251,191,36,0.08)',
                border: '1px solid rgba(251,191,36,0.3)',
                color: 'var(--color-warning)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              AI analysis is temporarily unavailable. You can continue with manual review.
            </div>
          )}

          {/* Error banner */}
          {error && !aiUnavailable && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.3)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              <strong>Upload failed:</strong> {error}
            </div>
          )}

          {/* Upload Card */}
          {!showResults && (
            <>
              <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <h2
                  className="text-xl font-semibold mb-xl"
                  style={{
                    paddingBottom: 'var(--spacing-md)',
                    borderBottom: '1px solid var(--color-border-default)',
                  }}
                >
                  Upload SoW Document
                </h2>

                {/* Drop Zone */}
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--color-accent-blue)' : file ? 'var(--color-success)' : errors.file ? 'var(--color-error)' : 'var(--color-border-default)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-3xl) var(--spacing-xl)',
                    textAlign: 'center',
                    marginBottom: 'var(--spacing-xl)',
                    backgroundColor: isDragging
                      ? 'rgba(0,120,212,0.05)'
                      : file
                        ? 'rgba(74,222,128,0.05)'
                        : errors.file
                          ? 'rgba(239,68,68,0.05)'
                          : 'var(--color-bg-tertiary)',
                    transition: 'all var(--transition-base)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: '2.5rem', marginBottom: 'var(--spacing-md)' }}>
                    {file ? '✅' : errors.file ? '❌' : '📄'}
                  </div>

                  {file ? (
                    <>
                      <p className="font-semibold mb-sm" style={{ color: 'var(--color-success)' }}>
                        {file.name}
                      </p>
                      <p className="text-sm text-secondary">{formatFileSize(file.size)}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setErrors((prev) => ({ ...prev, file: '' }));
                        }}
                        className="btn btn-ghost btn-sm"
                        style={{ marginTop: 'var(--spacing-md)', color: 'var(--color-error)' }}
                      >
                        Remove file
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="text-secondary mb-md">
                        Drag and drop your SoW document here, or
                      </p>
                      <label
                        htmlFor="file-upload"
                        className="btn btn-secondary btn-sm"
                        style={{ cursor: 'pointer' }}
                      >
                        Browse Files
                      </label>
                      <p
                        className="text-sm text-tertiary"
                        style={{ marginTop: 'var(--spacing-md)' }}
                      >
                        Supported: .pdf, .docx (max 25 MB)
                      </p>
                    </>
                  )}

                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>

                {errors.file && (
                  <p className="form-error" style={{ marginBottom: 'var(--spacing-md)' }}>
                    {errors.file}
                  </p>
                )}

                {/* Methodology */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    SoW Methodology <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <select
                    value={methodology}
                    onChange={(e) => {
                      setMethodology(e.target.value);
                      if (e.target.value) {
                        setErrors((prev) => ({ ...prev, methodology: '' }));
                      }
                    }}
                    className="form-select"
                  >
                    <option value="">Select a methodology…</option>
                    {methodologies.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {errors.methodology && <p className="form-error">{errors.methodology}</p>}
                </div>
                <p className="form-helper" style={{ marginTop: 'var(--spacing-sm)' }}>
                  Google Docs users: File → Download as PDF or Word (.docx)
                </p>
              </div>

              {/* AI Info Banner */}
              <div className="alert alert-info" style={{ marginBottom: 'var(--spacing-lg)' }}>
                <strong>How AI Review Works:</strong> Our model checks your SoW against MCEM
                compliance standards, flags missing sections, scores delivery risk, and generates
                actionable recommendations — typically in under 30 seconds.
              </div>

              {/* Actions */}
              <div
                style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--spacing-md)' }}
              >
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
                  Cancel
                </button>
                <button
                  onClick={handleUpload}
                  className="btn btn-primary btn-lg"
                  disabled={!isValid || isUploading}
                  style={{ opacity: isValid && !isUploading ? 1 : 0.6 }}
                >
                  {isUploading ? 'Uploading…' : 'Upload & Analyze'}
                </button>
              </div>
            </>
          )}

          {/* Analyzing spinner */}
          {isAnalyzing && (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--spacing-3xl) 0',
              }}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: 48,
                  height: 48,
                  border: '3px solid var(--color-border-default)',
                  borderTopColor: 'var(--color-accent-blue)',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <p
                className="text-secondary font-semibold"
                style={{ marginTop: 'var(--spacing-lg)', fontSize: 'var(--font-size-lg)' }}
              >
                Analyzing SoW against MCEM standards…
              </p>
              <p className="text-tertiary" style={{ marginTop: 'var(--spacing-sm)' }}>
                Checking compliance rules, risk patterns, and approval requirements
              </p>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Recommendations */}
          {showResults && recommendations && (
            <div>
              {/* Success banner */}
              <div
                style={{
                  marginBottom: 'var(--spacing-xl)',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'rgba(74,222,128,0.08)',
                  border: '1px solid rgba(74,222,128,0.3)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p className="font-semibold" style={{ color: 'var(--color-success)' }}>
                    Analysis Complete
                  </p>
                  <p className="text-sm text-secondary">
                    {file?.name} — {methodology}
                  </p>
                </div>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setShowResults(false);
                    setRecommendations(null);
                    setFile(null);
                    setMethodology('');
                  }}
                >
                  Analyze Another
                </button>
              </div>

              {recommendations.sections && recommendations.sections.length > 0 && (
                <SectionAnalysisSection
                  sections={recommendations.sections}
                  missingKeywords={recommendations.missingKeywords}
                />
              )}
              <ApprovalSection approval={recommendations.approval} />
              <ViolationsSection violations={recommendations.violations} />
              <SuggestionsSection suggestions={recommendations.suggestions} />
              <RisksSection risks={recommendations.risks} />
              <ChecklistSection checklist={recommendations.checklist} />
              {similarSows.length > 0 && <SimilarSowsSection similarSows={similarSows} />}

              {/* Action Bar — Proceed to Internal Review */}
              {currentSowId && (
                <div
                  className="card"
                  style={{
                    padding: 'var(--spacing-lg) var(--spacing-xl)',
                    borderLeft: '3px solid var(--color-accent-blue)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 'var(--spacing-md)',
                  }}
                >
                  <div>
                    {recommendations.approval && (
                      <p className="text-sm" style={{ marginBottom: 'var(--spacing-xs)' }}>
                        <strong>ESAP Level:</strong> {recommendations.approval.esapType} (
                        {recommendations.approval.level})
                      </p>
                    )}
                    {recommendations.approval?.chain && (
                      <p className="text-sm text-secondary">
                        <strong>Required Reviewers:</strong>{' '}
                        {recommendations.approval.chain.join(', ')}
                      </p>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                    <button className="btn btn-secondary" onClick={() => router.push('/all-sows')}>
                      Back to All SoWs
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleProceedToReview}
                      disabled={isProceeding}
                      style={{ opacity: isProceeding ? 0.6 : 1 }}
                    >
                      {isProceeding ? 'Proceeding…' : 'Proceed to Internal Review →'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
