import SectionHeader from './ui/SectionHeader';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function DataMigration({ data, onChange }) {
  const strategy = data?.strategy ?? '';
  const dataSources = data?.dataSources ?? '';
  const migrationApproach = data?.migrationApproach ?? '';
  const validationPlan = data?.validationPlan ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Data Migration Strategy"
        description="Define the strategy for migrating legacy data into Dynamics 365, including data sources, transformation rules, and validation processes."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Migration Strategy Overview</h3>
          <p className="text-sm text-secondary mb-md">
            High-level approach to data migration for this implementation.
          </p>
          <textarea
            className="form-textarea"
            value={strategy}
            onChange={(e) => update({ strategy: e.target.value })}
            placeholder="Describe the overall data migration strategy — tooling (SSIS, Scribe, Kingswaysoft), migration waves, and phased approach..."
            rows={7}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Data Sources</h3>
          <p className="text-sm text-secondary mb-md">
            Identify all source systems and data entities to be migrated.
          </p>
          <textarea
            className="form-textarea"
            value={dataSources}
            onChange={(e) => update({ dataSources: e.target.value })}
            placeholder="List the source systems (e.g. legacy ERP, spreadsheets, CRM), data entities (e.g. customers, orders, inventory), and estimated volumes..."
            rows={7}
          />
        </div>
      </TwoColumnGrid>

      <TwoColumnGrid>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Migration Approach</h3>
          <p className="text-sm text-secondary mb-md">
            Describe the technical approach — extraction, transformation, and load (ETL) process.
          </p>
          <textarea
            className="form-textarea"
            value={migrationApproach}
            onChange={(e) => update({ migrationApproach: e.target.value })}
            placeholder="Detail the ETL process, data cleansing activities, field mapping, transformation rules, and the sequence of migration runs..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Data Validation Plan</h3>
          <p className="text-sm text-secondary mb-md">
            Define how migrated data will be validated before go-live.
          </p>
          <textarea
            className="form-textarea"
            value={validationPlan}
            onChange={(e) => update({ validationPlan: e.target.value })}
            placeholder="Describe the validation approach — reconciliation checks, UAT data verification, customer sign-off process, and rollback criteria..."
            rows={6}
          />
        </div>
      </TwoColumnGrid>
    </div>
  );
}
