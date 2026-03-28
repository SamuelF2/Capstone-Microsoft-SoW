import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';

export default function Login() {
  const router = useRouter();
  const { user, loading, login } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Already logged in — bounce to home
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const handleLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login();
      router.replace('/');
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('popup') || msg.includes('blocked') || msg.includes('BrowserAuthError')) {
        setError(
          'Sign-in popup was blocked by your browser. Please allow popups for this site and try again.'
        );
      } else if (msg.includes('user_cancelled') || msg.includes('cancelled')) {
        setError(null); // User closed the popup — not an error
      } else {
        setError(msg || 'Sign-in failed. Please try again.');
      }
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p className="text-secondary">Loading...</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Sign In – Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'var(--spacing-xl)',
          background: 'var(--gradient-hero)',
        }}
      >
        <div
          className="card"
          style={{ width: '100%', maxWidth: '440px', padding: 'var(--spacing-3xl)' }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-2xl)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: 'var(--radius-xl)',
                background: 'var(--gradient-purple)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                color: '#fff',
              }}
            >
              C
            </div>
            <span
              style={{
                fontSize: 'var(--font-size-2xl)',
                fontWeight: 'var(--font-weight-bold)',
              }}
            >
              Cocoon
            </span>
          </div>

          {/* Heading */}
          <h1
            className="text-3xl font-bold text-center"
            style={{ marginBottom: 'var(--spacing-xs)' }}
          >
            Welcome
          </h1>
          <p
            className="text-center text-secondary"
            style={{
              marginBottom: 'var(--spacing-2xl)',
              fontSize: 'var(--font-size-sm)',
            }}
          >
            Sign in with your Microsoft account to access your SoW workspace
          </p>

          {/* Error banner */}
          {error && (
            <div
              style={{
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-sm) var(--spacing-md)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'rgba(220,38,38,0.08)',
                border: '1px solid rgba(220,38,38,0.25)',
                color: 'var(--color-error)',
                fontSize: 'var(--font-size-sm)',
              }}
            >
              {error}
            </div>
          )}

          {/* Sign in button */}
          <button
            onClick={handleLogin}
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{
              width: '100%',
              fontSize: 'var(--font-size-base)',
              padding: 'var(--spacing-md)',
              opacity: isSubmitting ? 0.6 : 1,
            }}
          >
            {isSubmitting ? 'Signing in...' : 'Sign in with Microsoft'}
          </button>
        </div>
      </div>
    </>
  );
}
