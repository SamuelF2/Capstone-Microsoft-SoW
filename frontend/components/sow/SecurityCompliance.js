import SectionHeader from './ui/SectionHeader';
import TwoColumnGrid from './ui/TwoColumnGrid';

export default function SecurityCompliance({ data, onChange }) {
  const securityFramework = data?.securityFramework ?? '';
  const complianceRequirements = data?.complianceRequirements ?? '';
  const identityManagement = data?.identityManagement ?? '';
  const networkSecurity = data?.networkSecurity ?? '';
  const dataProtection = data?.dataProtection ?? '';
  const monitoringAlerting = data?.monitoringAlerting ?? '';

  const update = (patch) => onChange({ ...data, ...patch });

  return (
    <div>
      <SectionHeader
        title="Security & Compliance"
        description="Define the security architecture, compliance requirements, and controls that will be implemented as part of the cloud adoption."
      />

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Security Framework</h3>
          <p className="text-sm text-secondary mb-md">
            Describe the security framework and standards applied to this engagement.
          </p>
          <textarea
            className="form-textarea"
            value={securityFramework}
            onChange={(e) => update({ securityFramework: e.target.value })}
            placeholder="e.g. Microsoft Cloud Security Benchmark (MCSB), CIS Azure Foundations Benchmark, ISO 27001, SOC 2 alignment..."
            rows={6}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Compliance Requirements</h3>
          <p className="text-sm text-secondary mb-md">
            Identify regulatory and compliance requirements that must be met.
          </p>
          <textarea
            className="form-textarea"
            value={complianceRequirements}
            onChange={(e) => update({ complianceRequirements: e.target.value })}
            placeholder="e.g. GDPR data residency, Australian Privacy Act, Industry-specific regulations, Microsoft compliance offerings to be leveraged..."
            rows={6}
          />
        </div>
      </TwoColumnGrid>

      <TwoColumnGrid style={{ marginBottom: 'var(--spacing-xl)' }}>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Identity & Access Management</h3>
          <textarea
            className="form-textarea"
            value={identityManagement}
            onChange={(e) => update({ identityManagement: e.target.value })}
            placeholder="Describe the IAM approach — Azure AD/Entra ID configuration, MFA enforcement, Privileged Identity Management (PIM), RBAC model..."
            rows={5}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Network Security</h3>
          <textarea
            className="form-textarea"
            value={networkSecurity}
            onChange={(e) => update({ networkSecurity: e.target.value })}
            placeholder="Describe the network security controls — Virtual Network design, NSGs, Azure Firewall, Private Endpoints, DDoS protection..."
            rows={5}
          />
        </div>
      </TwoColumnGrid>

      <TwoColumnGrid>
        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Data Protection</h3>
          <textarea
            className="form-textarea"
            value={dataProtection}
            onChange={(e) => update({ dataProtection: e.target.value })}
            placeholder="Describe data protection measures — encryption at rest and in transit, Azure Key Vault, backup strategy, data classification..."
            rows={5}
          />
        </div>

        <div className="card">
          <h3 className="text-lg font-semibold mb-sm">Monitoring & Alerting</h3>
          <textarea
            className="form-textarea"
            value={monitoringAlerting}
            onChange={(e) => update({ monitoringAlerting: e.target.value })}
            placeholder="Describe the security monitoring approach — Microsoft Defender for Cloud, Microsoft Sentinel, log analytics workspace, alert rules..."
            rows={5}
          />
        </div>
      </TwoColumnGrid>
    </div>
  );
}
