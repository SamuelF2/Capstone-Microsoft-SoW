import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { useAuth } from '../lib/auth';

export default function Login() {
  const router = useRouter();
  const { user, login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    email: '',
    password: '',
    fullName: '',
    confirmPassword: '',
  });

  // Already logged in — bounce to home
  useEffect(() => {
    if (user) router.replace('/');
  }, [user, router]);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setError(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!isLogin && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isLogin) {
        await login(form.email, form.password);
      } else {
        await register(form.email, form.password, form.fullName);
      }
      router.replace('/');
    } catch (err) {
      setError(err.message);
      setIsSubmitting(false);
    }
  };

  const switchMode = () => {
    setIsLogin(!isLogin);
    setError(null);
    setForm({ email: '', password: '', fullName: '', confirmPassword: '' });
  };

  const isValid = isLogin
    ? form.email && form.password
    : form.email && form.password && form.confirmPassword;

  return (
    <>
      <Head>
        <title>{isLogin ? 'Sign In' : 'Create Account'} – Cocoon</title>
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
            {isLogin ? 'Welcome back' : 'Create account'}
          </h1>
          <p
            className="text-center text-secondary"
            style={{ marginBottom: 'var(--spacing-2xl)', fontSize: 'var(--font-size-sm)' }}
          >
            {isLogin
              ? 'Sign in to access your SoW workspace'
              : 'Join Cocoon to start drafting and reviewing SoWs'}
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

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Full name — register only */}
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  name="fullName"
                  value={form.fullName}
                  onChange={handleChange}
                  placeholder="Your name"
                  className="form-input"
                  autoComplete="name"
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="form-input"
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder={isLogin ? 'Enter your password' : 'At least 8 characters'}
                className="form-input"
                required
                autoComplete={isLogin ? 'current-password' : 'new-password'}
                minLength={8}
              />
            </div>

            {/* Confirm password — register only */}
            {!isLogin && (
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={form.confirmPassword}
                  onChange={handleChange}
                  placeholder="Repeat your password"
                  className="form-input"
                  required
                  autoComplete="new-password"
                />
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={!isValid || isSubmitting}
              style={{
                width: '100%',
                marginTop: 'var(--spacing-sm)',
                marginBottom: 'var(--spacing-lg)',
                opacity: !isValid || isSubmitting ? 0.6 : 1,
                fontSize: 'var(--font-size-base)',
                padding: 'var(--spacing-md)',
              }}
            >
              {isSubmitting
                ? isLogin
                  ? 'Signing in…'
                  : 'Creating account…'
                : isLogin
                  ? 'Sign In'
                  : 'Create Account'}
            </button>
          </form>

          {/* Switch mode */}
          <p className="text-center text-secondary" style={{ fontSize: 'var(--font-size-sm)' }}>
            {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={switchMode}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                color: 'var(--color-accent-blue)',
                fontWeight: 'var(--font-weight-semibold)',
                fontSize: 'var(--font-size-sm)',
                cursor: 'pointer',
              }}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </>
  );
}
