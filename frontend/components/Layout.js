import Navigation from './Navigation';

export default function Layout({ children }) {
  return (
    <>
      <Navigation />
      <main
        style={{
          minHeight: 'calc(100vh - 80px)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        {children}
      </main>
    </>
  );
}
