/**
 * TwoColumnGrid — thin wrapper for the 1fr 1fr grid layout used to place two
 * cards side-by-side (e.g. Delivery Approach + Support Transition).
 */
export default function TwoColumnGrid({ children, gap = 'var(--spacing-xl)', style }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
