import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';

export default function Navigation() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (path) => router.pathname === path;

  const navLinks = [
    { href: '/all-sows', label: 'All SoWs' },
    { href: '/create-new', label: 'Create New' },
    { href: '/ai-review', label: 'AI Review' },
    { href: '/review-history', label: 'Review History' },
    { href: '/my-reviews', label: 'My Reviews' },
  ];

  const navLinkStyle = (path) => ({
    fontSize: 'var(--font-size-sm)',
    color: isActive(path) ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    fontWeight: isActive(path) ? 'var(--font-weight-medium)' : 'var(--font-weight-normal)',
    transition: 'color var(--transition-base)',
    textDecoration: 'none',
    paddingBottom: '6px',
    position: 'relative',
  });

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
    router.replace('/login');
  };

  // Derive display name: full_name → email prefix
  const displayName = user?.full_name || user?.email?.split('@')[0] || 'User';
  // Initials for the avatar
  const initials = displayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

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
          {navLinks.map(({ href, label }) => (
            <Link key={href} href={href} style={navLinkStyle(href)}>
              {label}
              {isActive(href) && (
                <motion.div
                  layoutId="nav-underline"
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '2px',
                    backgroundColor: 'var(--color-accent-blue)',
                    borderRadius: '1px',
                  }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              )}
            </Link>
          ))}
        </div>

        {/* User section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
          {/* Avatar + name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {initials}
            </div>
            <span
              className="text-sm"
              style={{
                color: 'var(--color-text-secondary)',
                maxWidth: '120px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayName}
            </span>
          </div>

          {/* Logout */}
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              background: 'none',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              padding: '4px 10px',
              fontSize: 'var(--font-size-xs)',
              color: 'var(--color-text-secondary)',
              cursor: loggingOut ? 'default' : 'pointer',
              opacity: loggingOut ? 0.5 : 1,
              transition: 'border-color var(--transition-base), color var(--transition-base)',
            }}
            onMouseEnter={(e) => {
              if (!loggingOut) {
                e.currentTarget.style.borderColor = 'var(--color-error)';
                e.currentTarget.style.color = 'var(--color-error)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.color = 'var(--color-text-secondary)';
            }}
          >
            {loggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </div>
    </nav>
  );
}
