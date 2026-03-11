export default function SupportTransition({ data, onChange }) {
  const transitionPlan = data?.transitionPlan ?? '';
  const supportModel = data?.supportModel ?? '';
  const handoverDate = data?.handoverDate ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Support Transition</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define how the solution will be handed over to the customer's operations team and what
          ongoing support is provided.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
          marginBottom: 'var(--spacing-xl)',
        }}
      >
        {/* Transition Plan Card */}
        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Transition Plan
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Describe how the solution will be transitioned to the customer's operations team after
            go-live, including training, documentation, and handover activities.
          </p>
          <textarea
            className="form-textarea"
            value={transitionPlan}
            onChange={(e) => update({ transitionPlan: e.target.value })}
            placeholder="Outline the transition activities, timelines, training sessions, and documentation that will be provided to the customer's team..."
            rows={8}
          />
        </div>

        {/* Support Model Card */}
        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Ongoing Support Model
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Describe the support model that will be in place after the transition, including SLAs,
            contact channels, and escalation paths.
          </p>
          <div className="form-group">
            <label className="form-label">Target Handover Date</label>
            <input
              type="date"
              className="form-input"
              value={handoverDate}
              onChange={(e) => update({ handoverDate: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Support Description</label>
            <textarea
              className="form-textarea"
              value={supportModel}
              onChange={(e) => update({ supportModel: e.target.value })}
              placeholder="Describe the post-go-live support model, response times, and how the customer can raise issues..."
              rows={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
