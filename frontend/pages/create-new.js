import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function CreateNew() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    sowTitle: '',
    opportunityId: '',
    workOrderNumber: '',
    dealValue: '',
    estimatedMargin: '',
    customerName: '',
    customerLegalName: '',
    deliveryMethodology: '',
  });

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate submission — in production, POST to your API here
    setTimeout(() => {
      router.push('/all-sows');
    }, 1000);
  };

  const isValid =
    form.sowTitle && form.opportunityId && form.customerName && form.deliveryMethodology;

  const methodologies = ['Agile Sprint Delivery', 'Sure Step 365', 'Waterfall', 'Cloud Adoption'];

  return (
    <>
      <Head>
        <title>Create New SoW – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
        }}
      >
        <div
          style={{
            maxWidth: '760px',
            margin: '0 auto',
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 'var(--spacing-2xl)' }}>
            <h1 className="text-4xl font-bold mb-sm">Create New SoW</h1>
            <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
              Fill in the details below to generate a new Statement of Work template.
            </p>
          </div>

          {/* Form Card */}
          <form onSubmit={handleSubmit}>
            <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
              <h2
                className="text-xl font-semibold mb-xl"
                style={{
                  paddingBottom: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                SoW Details
              </h2>

              {/* Row 1: SoW Title (full width) */}
              <div className="form-group">
                <label className="form-label">
                  SoW Title <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="text"
                  name="sowTitle"
                  value={form.sowTitle}
                  onChange={handleChange}
                  placeholder="e.g. Contoso Cloud Migration Phase 1"
                  className="form-input"
                  required
                />
              </div>

              {/* Row 2: Opportunity ID + Work Order Number */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Opportunity ID <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="opportunityId"
                    value={form.opportunityId}
                    onChange={handleChange}
                    placeholder="e.g. OPP-20240001"
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Work Order Number</label>
                  <input
                    type="text"
                    name="workOrderNumber"
                    value={form.workOrderNumber}
                    onChange={handleChange}
                    placeholder="e.g. WO-88421"
                    className="form-input"
                  />
                </div>
              </div>

              {/* Row 3: Deal Value + Estimated Margin */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Deal Value (USD)</label>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      $
                    </span>
                    <input
                      type="number"
                      name="dealValue"
                      value={form.dealValue}
                      onChange={handleChange}
                      placeholder="0.00"
                      className="form-input"
                      style={{ paddingLeft: '1.75rem' }}
                      min="0"
                      step="0.01"
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Estimated Margin (%)</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="number"
                      name="estimatedMargin"
                      value={form.estimatedMargin}
                      onChange={handleChange}
                      placeholder="0"
                      className="form-input"
                      style={{ paddingRight: '2.5rem' }}
                      min="0"
                      max="100"
                      step="0.1"
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '1rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--color-text-secondary)',
                        pointerEvents: 'none',
                      }}
                    >
                      %
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 4: Customer Name + Customer Legal Name */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 'var(--spacing-lg)',
                  marginBottom: 'var(--spacing-lg)',
                }}
              >
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">
                    Customer Name <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    name="customerName"
                    value={form.customerName}
                    onChange={handleChange}
                    placeholder="e.g. Contoso"
                    className="form-input"
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Customer Legal Name</label>
                  <input
                    type="text"
                    name="customerLegalName"
                    value={form.customerLegalName}
                    onChange={handleChange}
                    placeholder="e.g. Contoso Ltd."
                    className="form-input"
                  />
                </div>
              </div>

              {/* Row 5: Delivery Methodology (full width) */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">
                  Delivery Methodology <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <select
                  name="deliveryMethodology"
                  value={form.deliveryMethodology}
                  onChange={handleChange}
                  className="form-select"
                  required
                >
                  <option value="">Select a methodology…</option>
                  {methodologies.map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p className="text-sm text-secondary">
                <span style={{ color: 'var(--color-error)' }}>*</span> Required fields
              </p>
              <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
                <button type="button" className="btn btn-secondary" onClick={() => router.back()}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isValid || isSubmitting}
                  style={{ opacity: !isValid || isSubmitting ? 0.6 : 1 }}
                >
                  {isSubmitting ? 'Creating…' : 'Create SoW'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
