import { useState } from 'react';

export default function ExecutiveSummary({ data, onChange }) {
  const content = data?.content ?? '';

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Executive Summary</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Provide a concise, compelling overview of this engagement — its purpose, key objectives,
          and the value it delivers to the customer.
        </p>
      </div>

      <div className="card">
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">
            Summary <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
          <p className="text-sm text-secondary" style={{ marginBottom: 'var(--spacing-sm)' }}>
            Describe the engagement at a high level — who the customer is, what problem is being
            solved, and the expected business outcomes.
          </p>
          <textarea
            className="form-textarea"
            value={content}
            onChange={(e) => onChange({ ...data, content: e.target.value })}
            placeholder="e.g. This engagement delivers a phased cloud migration for Contoso Ltd., moving their on-premises infrastructure to Azure to improve scalability, reduce operational costs, and enable modern DevOps practices..."
            rows={10}
          />
        </div>
      </div>
    </div>
  );
}
