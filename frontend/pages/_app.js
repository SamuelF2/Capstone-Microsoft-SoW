import '../styles/globals.css';
import '../styles/shared.css';

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { AnimatePresence, motion } from 'framer-motion';

import Layout from '../components/Layout';
import { AuthProvider, useAuth } from '../lib/auth';

// Routes that don't require authentication
const PUBLIC_ROUTES = ['/login'];

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.15, ease: 'easeIn' } },
};

/**
 * Inner component — has access to the AuthProvider context.
 * Handles route protection and conditionally applies the Layout.
 */
function AppShell({ Component, pageProps }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const isPublic = PUBLIC_ROUTES.includes(router.pathname);

  // Redirect unauthenticated users away from protected routes
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace('/login');
    }
  }, [user, loading, isPublic, router]);

  // Show nothing while rehydrating the session — avoids flash of wrong content
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: 'var(--color-bg-primary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: '40px',
            height: '40px',
            border: '3px solid var(--color-border-default)',
            borderTopColor: 'var(--color-accent-blue)',
            borderRadius: '50%',
            animation: 'spin 0.7s linear infinite',
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Login page renders without the nav shell
  if (isPublic) {
    return <Component {...pageProps} />;
  }

  // Unauthenticated on a protected route — render nothing while redirecting
  if (!user) return null;

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <motion.div
          key={router.pathname}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <Component {...pageProps} />
        </motion.div>
      </AnimatePresence>
    </Layout>
  );
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AppShell Component={Component} pageProps={pageProps} />
    </AuthProvider>
  );
}
