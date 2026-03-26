export default function MigrationStrategy({ data, onChange }) {
  const approach = data?.approach ?? '';
  const waveStrategy = data?.waveStrategy ?? '';
  const timeline = data?.timeline ?? '';
  const rollbackPlan = data?.rollbackPlan ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Migration Strategy</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the cloud migration approach, wave strategy, timeline, and rollback plan.
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
        <div className="card">
          <h3
            className="text-lg font-semibold mb-md"
            style={{
              paddingBottom: 'var(--spacing-md)',
              borderBottom: '1px solid var(--color-border-default)',
            }}
          >
            Migration Approach
          </h3>
          <p
            className="text-sm text-secondary mb-md"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Ensure your approach aligns with the Cloud Adoption Framework and includes how you'll
            manage risks and quality throughout the migration.
          </p>
          <textarea
            className="form-textarea"
            value={approach}
            onChange={(e) => update({ approach: e.target.value })}
            placeholder="Describe the migration patterns to be used (Rehost, Refactor, Rearchitect, Rebuild, Replace), tooling (Azure Migrate, ASR, DMS), and the sequencing of workload migrations..."
            rows={8}
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
            value={waveStrategy}
            onChange={(e) => update({ waveStrategy: e.target.value })}
            placeholder="Describe the wave-by-wave handover plan — which teams take ownership, runbook delivery, monitoring setup, and the support model during steady-state operations..."
            rows={8}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
        }}
      >
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Migration Timeline</h3>
          <textarea
            className="form-textarea"
            value={timeline}
            onChange={(e) => update({ timeline: e.target.value })}
            placeholder="Describe the high-level migration timeline — wave schedule, key milestones, and target go-live dates for each wave..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Rollback Plan</h3>
          <textarea
            className="form-textarea"
            value={rollbackPlan}
            onChange={(e) => update({ rollbackPlan: e.target.value })}
            placeholder="Define the rollback criteria and procedure — what triggers a rollback, how to revert to on-premises, RTO/RPO targets, and decision authority..."
            rows={6}
          />
        </div>
      </div>
    </div>
  );
}
