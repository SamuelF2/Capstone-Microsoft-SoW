function genId() {
  return `price-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

const DEFAULT_BREAKDOWN = [
  { id: 'price-assessment', name: 'Assessment & Planning', description: '', cost: '' },
  { id: 'price-migration', name: 'Migration Execution', description: '', cost: '' },
  { id: 'price-hypercare', name: 'Hypercare Support', description: '', cost: '' },
];

function formatCurrency(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '$0';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export default function Pricing({ data, onChange }) {
  const totalValue = data?.totalValue ?? '';
  const breakdown = data?.breakdown ?? DEFAULT_BREAKDOWN;

  const update = (patch) => onChange({ ...data, ...patch });

  const addLineItem = () =>
    update({
      breakdown: [...breakdown, { id: genId(), name: '', description: '', cost: '' }],
    });

  const removeLineItem = (id) => update({ breakdown: breakdown.filter((item) => item.id !== id) });

  const changeLineItem = (updated) =>
    update({ breakdown: breakdown.map((item) => (item.id === updated.id ? updated : item)) });

  const calculatedTotal = breakdown.reduce((sum, item) => sum + (parseFloat(item.cost) || 0), 0);

  const isManualTotal = totalValue !== '' && totalValue !== String(calculatedTotal);

  return (
    <div>
      <div style={{ marginBottom: 'var(--spacing-xl)' }}>
        <h2 className="text-2xl font-semibold mb-sm">Pricing</h2>
        <p className="text-secondary" style={{ lineHeight: 'var(--line-height-relaxed)' }}>
          Define the total engagement value and provide a cost breakdown by category.
        </p>
      </div>

      {/* Total Value */}
      <div
        className="card"
        style={{
          marginBottom: 'var(--spacing-xl)',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-xl)',
          alignItems: 'center',
        }}
      >
        <div>
          <label className="form-label">
            Total Engagement Value (USD) <span style={{ color: 'var(--color-error)' }}>*</span>
          </label>
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
              className="form-input"
              value={totalValue}
              onChange={(e) => update({ totalValue: e.target.value })}
              placeholder="0.00"
              min="0"
              step="0.01"
              style={{ paddingLeft: '1.75rem' }}
            />
          </div>
          {isManualTotal && (
            <p
              className="text-xs"
              style={{ marginTop: 'var(--spacing-xs)', color: 'var(--color-warning)' }}
            >
              ⚠ Total differs from sum of breakdown ({formatCurrency(calculatedTotal)})
            </p>
          )}
        </div>

        <div
          style={{
            textAlign: 'center',
            padding: 'var(--spacing-lg)',
            backgroundColor: 'var(--color-bg-tertiary)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <p className="text-sm text-secondary mb-xs">Breakdown Total</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--color-accent-blue)' }}>
            {formatCurrency(calculatedTotal)}
          </p>
        </div>
      </div>

      {/* Breakdown */}
      <div style={{ marginBottom: 'var(--spacing-lg)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-md)',
          }}
        >
          <h3 className="text-lg font-semibold">Cost Breakdown</h3>
          <button className="btn btn-secondary" onClick={addLineItem}>
            + Add Line Item
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-bg-tertiary)',
                  borderBottom: '1px solid var(--color-border-default)',
                }}
              >
                {['Category', 'Description', 'Cost (USD)', ''].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: 'var(--spacing-md) var(--spacing-lg)',
                      textAlign: 'left',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: 'var(--font-weight-semibold)',
                      color: 'var(--color-text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {breakdown.map((item, idx) => (
                <tr
                  key={item.id}
                  style={{
                    borderBottom:
                      idx < breakdown.length - 1 ? '1px solid var(--color-border-default)' : 'none',
                  }}
                >
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-lg)', minWidth: '180px' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={item.name}
                      onChange={(e) => changeLineItem({ ...item, name: e.target.value })}
                      placeholder="Category name"
                      style={{ fontSize: 'var(--font-size-sm)', marginBottom: 0 }}
                    />
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-lg)' }}>
                    <input
                      type="text"
                      className="form-input"
                      value={item.description}
                      onChange={(e) => changeLineItem({ ...item, description: e.target.value })}
                      placeholder="Brief description..."
                      style={{ fontSize: 'var(--font-size-sm)', marginBottom: 0 }}
                    />
                  </td>
                  <td style={{ padding: 'var(--spacing-sm) var(--spacing-lg)', minWidth: '160px' }}>
                    <div style={{ position: 'relative' }}>
                      <span
                        style={{
                          position: 'absolute',
                          left: '0.75rem',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'var(--color-text-secondary)',
                          fontSize: 'var(--font-size-sm)',
                          pointerEvents: 'none',
                        }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        className="form-input"
                        value={item.cost}
                        onChange={(e) => changeLineItem({ ...item, cost: e.target.value })}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        style={{
                          paddingLeft: '1.5rem',
                          fontSize: 'var(--font-size-sm)',
                          marginBottom: 0,
                        }}
                      />
                    </div>
                  </td>
                  <td
                    style={{ padding: 'var(--spacing-sm) var(--spacing-lg)', textAlign: 'center' }}
                  >
                    <button
                      onClick={() => removeLineItem(item.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-tertiary)',
                        cursor: 'pointer',
                        fontSize: '18px',
                        lineHeight: 1,
                        padding: '2px 6px',
                      }}
                      title="Remove line item"
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr
                style={{
                  borderTop: '2px solid var(--color-border-default)',
                  backgroundColor: 'var(--color-bg-tertiary)',
                }}
              >
                <td
                  colSpan={2}
                  style={{
                    padding: 'var(--spacing-md) var(--spacing-lg)',
                    fontWeight: 'var(--font-weight-semibold)',
                  }}
                >
                  Total
                </td>
                <td
                  style={{
                    padding: 'var(--spacing-md) var(--spacing-lg)',
                    fontWeight: 'var(--font-weight-bold)',
                    color: 'var(--color-accent-blue)',
                    fontSize: 'var(--font-size-lg)',
                  }}
                >
                  {formatCurrency(calculatedTotal)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
