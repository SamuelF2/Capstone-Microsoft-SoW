import { motion } from 'framer-motion';

export default function Spinner({ size = 40, message }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--spacing-lg)',
        padding: 'var(--spacing-3xl) 0',
      }}
    >
      <motion.div
        style={{
          width: size,
          height: size,
          border: '3px solid var(--color-border-default)',
          borderTopColor: 'var(--color-accent-blue)',
          borderRadius: '50%',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
      />
      {message && <p className="text-secondary">{message}</p>}
    </div>
  );
}
