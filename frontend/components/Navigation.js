import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Navigation() {
  const router = useRouter();

  const isActive = (path) => {
    return router.pathname === path;
  };

  return (
    <nav
      style={{
        backgroundColor: 'var(--color-bg-primary)',
        borderBottom: '1px solid var(--color-border-default)',
        padding: 'var(--spacing-md) 0',
        position: 'sticky',
        top: 0,
        zIndex: 'var(--z-sticky)',
      }}
    >
      <div
        style={{
          maxWidth: 'var(--container-2xl)',
          margin: '0 auto',
          padding: '0 var(--spacing-xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
          }}
        >
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--gradient-purple)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
            }}
          >
            C
          </div>
          <span>Cocoon</span>
        </Link>

        <div
          style={{
            display: 'flex',
            gap: 'var(--spacing-xl)',
            alignItems: 'center',
          }}
        >
          <Link
            href="/"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: isActive('/') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
              fontWeight: isActive('/') ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
              transition: 'color var(--transition-base)',
            }}
          >
            All SOWs
          </Link>
          <Link
            href="/create-task"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: isActive('/create-task')
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              fontWeight: isActive('/create-task')
                ? 'var(--font-weight-medium)'
                : 'var(--font-weight-normal)',
              transition: 'color var(--transition-base)',
            }}
          >
            Create Task
          </Link>
          <Link
            href="/review-history"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: isActive('/review-history')
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              fontWeight: isActive('/review-history')
                ? 'var(--font-weight-medium)'
                : 'var(--font-weight-normal)',
              transition: 'color var(--transition-base)',
            }}
          >
            Review History
          </Link>
          <Link
            href="/account"
            style={{
              fontSize: 'var(--font-size-sm)',
              color: isActive('/account')
                ? 'var(--color-text-primary)'
                : 'var(--color-text-secondary)',
              fontWeight: isActive('/account')
                ? 'var(--font-weight-medium)'
                : 'var(--font-weight-normal)',
              transition: 'color var(--transition-base)',
            }}
          >
            My Reviews
          </Link>
        </div>

        <button
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-bg-secondary)',
            border: '1px solid var(--color-border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            cursor: 'pointer',
          }}
        >
          👤
        </button>
      </div>
    </nav>
  );
}
