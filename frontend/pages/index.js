import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Home() {
  const router = useRouter();

  return (
    <>
      <Head>
        <title>Microsoft Cocoon - AI-Powered SOW Review</title>
      </Head>

      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 'calc(100vh - 80px)',
          background: 'var(--gradient-hero)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          className="text-center"
          style={{
            maxWidth: '600px',
            padding: 'var(--spacing-xl)',
            zIndex: 1,
          }}
        >
          <h1
            className="font-bold mb-md"
            style={{
              fontSize: '3.5rem',
              background: 'var(--gradient-text)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Microsoft Cocoon
          </h1>

          <p className="text-xl text-secondary mb-2xl">
            AI-powered compliance for agile transformation
          </p>

          <div className="flex gap-md justify-center mb-2xl">
            <button className="btn btn-primary btn-lg" onClick={() => router.push('/create-task')}>
              Create New SOW
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => router.push('/review-history')}
            >
              View All SOWs
            </button>
          </div>

          <p className="text-sm text-tertiary">Microsoft organization for SOW management</p>
        </div>
      </div>
    </>
  );
}
