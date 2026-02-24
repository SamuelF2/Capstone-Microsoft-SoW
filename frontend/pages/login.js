import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Login() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, you would handle authentication here
    router.push('/');
  };

  return (
    <>
      <Head>
        <title>{isLogin ? 'Login' : 'Register'} - Microsoft Cocoon</title>
      </Head>

      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 'calc(100vh - 80px)',
          padding: 'var(--spacing-xl)',
          background: 'var(--gradient-hero)',
        }}
      >
        <div className="card w-full" style={{ maxWidth: '450px', padding: 'var(--spacing-2xl)' }}>
          <div className="flex items-center justify-center gap-md mb-xl">
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
              }}
            >
              C
            </div>
            <h2 className="text-2xl font-bold">Cocoon</h2>
          </div>

          <h1 className="text-3xl font-bold text-center mb-sm">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h1>
          <p className="text-center text-secondary mb-xl">
            {isLogin
              ? 'Sign in to access your SOW reviews'
              : 'Sign up to start reviewing SOW documents'}
          </p>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@microsoft.com"
                className="form-input"
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="form-input"
                required
              />
            </div>

            {isLogin && (
              <div className="text-right mb-lg">
                <a href="#" className="text-sm" style={{ color: 'var(--color-accent-blue)' }}>
                  Forgot password?
                </a>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block mb-lg">
              {isLogin ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div className="divider mb-lg"></div>

          <button className="btn btn-secondary btn-block mb-lg">
            <span style={{ marginRight: 'var(--spacing-sm)', fontSize: '1.25rem' }}>⊞</span>
            Sign in with Microsoft
          </button>

          <div className="text-center">
            <p className="text-sm text-secondary">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="btn btn-ghost"
                style={{
                  padding: '0 var(--spacing-sm)',
                  color: 'var(--color-accent-blue)',
                  fontWeight: 'var(--font-weight-semibold)',
                }}
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
