import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Navigation() {
  const router = useRouter();

  const isActive = (path) => router.pathname === path;

  const navLinkStyle = (path) => ({
    fontSize: 'var(--font-size-sm)',
    color: isActive(path) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontWeight: isActive(path) ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
    transition: 'color var(--transition-base)',
    textDecoration: 'none',
    paddingBottom: '2px',
    borderBottom: isActive(path) ? '2px solid var(--color-accent-blue)' : '2px solid transparent',
  });

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
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
            color: 'var(--color-text-primary)',
            textDecoration: 'none',
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
              fontSize: '1rem',
              fontWeight: 'bold',
              color: '#fff',
            }}
          >
            C
          </div>
          <span>Cocoon</span>
        </Link>

        {/* Nav Links */}
        <div style={{ display: 'flex', gap: 'var(--spacing-xl)', alignItems: 'center' }}>
          <Link href="/all-sows" style={navLinkStyle('/all-sows')}>
            All SoWs
          </Link>
          <Link href="/create-new" style={navLinkStyle('/create-new')}>
            Create New
          </Link>
          <Link href="/ai-review" style={navLinkStyle('/ai-review')}>
            AI Review
          </Link>
          <Link href="/review-history" style={navLinkStyle('/review-history')}>
            Review History
          </Link>
          <Link href="/my-reviews" style={navLinkStyle('/my-reviews')}>
            My Reviews
          </Link>
        </div>

        {/* Account Button */}
        <Link href="/account" style={{ textDecoration: 'none' }}>
          <button
            style={{
              width: '36px',
              height: '36px',
              borderRadius: 'var(--radius-full)',
              backgroundColor: isActive('/account')
                ? 'var(--color-accent-blue)'
                : 'var(--color-bg-secondary)',
              border: `1px solid ${isActive('/account') ? 'var(--color-accent-blue)' : 'var(--color-border-default)'}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              cursor: 'pointer',
              transition:
                'background-color var(--transition-base), border-color var(--transition-base)',
            }}
          >
            👤
          </button>
        </Link>
      </div>
    </nav>
  );
}
