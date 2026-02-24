import Link from 'next/link';

export default function ReviewCard({ id, title, subtitle, details }) {
  return (
    <Link
      href={`/review/${id}`}
      className="card card-interactive flex items-center justify-between"
      style={{
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      <div className="flex-1">
        <h3 className="text-lg font-semibold mb-sm">{title}</h3>
        <p className="text-sm text-secondary mb-xs">{subtitle}</p>
        {details && <p className="text-xs text-tertiary">{details}</p>}
      </div>
      <div
        style={{
          fontSize: '1.5rem',
          color: 'var(--color-text-tertiary)',
          marginLeft: 'var(--spacing-md)',
        }}
      >
        →
      </div>
    </Link>
  );
}
