import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../lib/auth';
import { roleLabel as fullRoleLabel } from '../lib/workflowStages';

// CPL/CDP get a nav-compact alias; everything else uses the canonical label.
// This is the only place in the app that prefers the abbreviated forms.
const NAV_COMPACT_OVERRIDES = { cpl: 'CPL', cdp: 'CDP' };

export default function Navigation() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const isActive = (path) => router.pathname === path;

  // System Admin elevates privileges — treat it as matching any role-gated link.
  const isSystemAdmin = user?.role === 'system-admin';

  const navLinks = [
    { href: '/all-sows', label: 'All SoWs' },
    { href: '/create-new', label: 'Create New' },
    { href: '/ai-review', label: 'AI Review' },
    { href: '/my-reviews', label: 'My Reviews' },
    { href: '/drm-dashboard', label: 'DRM Dashboard', roles: ['cpl', 'cdp', 'delivery-manager'] },
    { href: '/review-history', label: 'Review History' },
    { href: '/business-logic', label: 'Business Logic' },
  ];

  // Human-readable label for the current (possibly-overridden) role.
  const roleLabel = user?.role
    ? NAV_COMPACT_OVERRIDES[user.role] || fullRoleLabel(user.role)
    : null;
  const roleIsOverridden = !!user?._baseRole && user._baseRole !== user.role;

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
          {navLinks
            .filter((link) => !link.roles || isSystemAdmin || link.roles.includes(user?.role))
            .map(({ href, label }) => (
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
          {/* Active role badge — reminds the user which role gates the UI.
              Click to jump to Account → Settings where the override lives. */}
          {roleLabel && (
            <Link
              href="/account"
              title={
                roleIsOverridden
                  ? `Role override active (real role: ${user._baseRole}). Click to manage.`
                  : 'Your current role. Click to change in Account → Settings.'
              }
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                textDecoration: 'none',
                border: '1px solid',
                borderColor: roleIsOverridden
                  ? 'rgba(245,158,11,0.4)'
                  : isSystemAdmin
                    ? 'rgba(124,58,237,0.4)'
                    : 'var(--color-border-default)',
                backgroundColor: roleIsOverridden
                  ? 'rgba(245,158,11,0.1)'
                  : isSystemAdmin
                    ? 'rgba(124,58,237,0.1)'
                    : 'var(--color-bg-secondary)',
                color: roleIsOverridden
                  ? 'var(--color-warning)'
                  : isSystemAdmin
                    ? 'var(--color-accent-purple, #7c3aed)'
                    : 'var(--color-text-secondary)',
              }}
            >
              {isSystemAdmin && <span>★</span>}
              {roleLabel}
              {roleIsOverridden && !isSystemAdmin && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 'var(--font-weight-normal)',
                    opacity: 0.8,
                  }}
                >
                  (override)
                </span>
              )}
            </Link>
          )}

          {/* Avatar + name */}
          <Link
            href="/account"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-sm)',
              textDecoration: 'none',
            }}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: isActive('/account')
                  ? 'var(--color-accent-purple)'
                  : 'var(--color-accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.75rem',
                fontWeight: 'var(--font-weight-semibold)',
                color: '#fff',
                flexShrink: 0,
                cursor: 'pointer',
                transition: 'background-color var(--transition-base)',
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
          </Link>

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
