export default function WaterfallApproach({ data, onChange }) {
  const deliveryApproach = data?.deliveryApproach ?? '';
  const supportTransitionPlan = data?.supportTransitionPlan ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Waterfall Approach</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Describe the Waterfall delivery methodology and how the project will be structured across
          sequential phases.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
        }}
      >
        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Delivery Approach & Methodology
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Ensure your approach aligns with the Waterfall methodology and includes how you'll
            manage risks and quality across each phase.
          </p>
          <textarea
            className="form-textarea"
            value={deliveryApproach}
            onChange={(e) => update({ deliveryApproach: e.target.value })}
            placeholder="Describe the Waterfall approach — phase gates, requirements sign-off, change control process, quality checkpoints, and how risks will be managed across the sequential phases..."
            rows={10}
          />
        </div>

        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Support Transition Plan
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Describe how the solution will be transitioned to the customer's operations team after
            go-live.
          </p>
          <textarea
            className="form-textarea"
            value={supportTransitionPlan}
            onChange={(e) => update({ supportTransitionPlan: e.target.value })}
            placeholder="Outline the transition plan — documentation deliverables, training sessions, knowledge transfer activities, and the support model after project closure..."
            rows={10}
          />
        </div>
      </div>
    </div>
  );
}
