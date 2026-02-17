import { useRouter } from 'next/router';
import Head from 'next/head';
import { useEffect, useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(false);
  const [featuresVisible, setFeaturesVisible] = useState(false);
  const [howItWorksVisible, setHowItWorksVisible] = useState(false);

  useEffect(() => {
    // Trigger fade-in animation after component mounts
    setIsVisible(true);

    // Delay features section animation
    const featuresTimer = setTimeout(() => {
      setFeaturesVisible(true);
    }, 200);

    // Delay how it works section animation
    const howItWorksTimer = setTimeout(() => {
      setHowItWorksVisible(true);
    }, 400);

    return () => {
      clearTimeout(featuresTimer);
      clearTimeout(howItWorksTimer);
    };
  }, []);

  return (
    <>
      <Head>
        <title>Microsoft Cocoon - AI-Powered SOW Review</title>
      </Head>

      <div style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        {/* Hero Section */}
        <div
          className="flex items-center justify-center"
          style={{
            minHeight: '40vh',
            background: 'var(--gradient-hero)',
            position: 'relative',
            overflow: 'hidden',
            padding: 'var(--spacing-3xl) var(--spacing-xl)',
          }}
        >
          <div
            className="text-center"
            style={{
              maxWidth: '800px',
              padding: 'var(--spacing-xl)',
              zIndex: 1,
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
              transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            }}
          >
            <div
              className="badge badge-primary mb-lg"
              style={{
                opacity: isVisible ? 1 : 0,
                transition: 'opacity 0.5s ease-out 0.05s',
              }}
            >
              🛡️ Microsoft MCEM Compliant
            </div>

            <h1
              className="font-bold mb-lg"
              style={{
                fontSize: '3.5rem',
                color: '#fff',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
                transition: 'opacity 0.4s ease-out 0.05s, transform 0.4s ease-out 0.05s',
              }}
            >
              Cocoon SoW Automation
            </h1>

            <p
              className="text-lg mb-2xl"
              style={{
                color: 'rgba(255, 255, 255, 0.9)',
                lineHeight: 'var(--line-height-relaxed)',
                maxWidth: '700px',
                margin: '0 auto var(--spacing-2xl)',
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease-out 0.2s, transform 0.5s ease-out 0.2s',
              }}
            >
              Streamline Statement of Work creation, ensure MCEM compliance, and accelerate
              approvals with built-in quality checks and persona-based workflows.
            </p>

            <div
              className="flex gap-md justify-center"
              style={{
                opacity: isVisible ? 1 : 0,
                transform: isVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.5s ease-out 0.3s, transform 0.5s ease-out 0.3s',
              }}
            >
              <button className="btn btn-primary btn-lg" onClick={() => router.push('/create-new')}>
                Create New SOW
              </button>
              <button
                className="btn btn-secondary btn-lg"
                onClick={() => router.push('/review-history')}
              >
                View All SoWs
              </button>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div
          style={{
            padding: 'var(--spacing-3xl) var(--spacing-xl)',
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            opacity: featuresVisible ? 1 : 0,
            transform: featuresVisible ? 'translateY(0)' : 'translateY(30px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <div className="grid grid-cols-4 gap-lg">
            {/* Feature Card 1 */}
            <div
              className="card"
              style={{
                borderLeft: '3px solid var(--color-success)',
                backgroundColor: 'var(--color-bg-secondary)',
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.4s ease-out 0.05s, transform 0.4s ease-out 0.05s',
              }}
            >
              <div
                style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--spacing-md)',
                  color: 'var(--color-success)',
                }}
              >
                📝
              </div>
              <h3 className="text-lg font-semibold mb-sm">Guided Authoring</h3>
              <p
                className="text-sm text-secondary"
                style={{ lineHeight: 'var(--line-height-relaxed)' }}
              >
                Template-based creation with real-time validation and compliance checks
              </p>
            </div>

            {/* Feature Card 2 */}
            <div
              className="card"
              style={{
                borderLeft: '3px solid var(--color-info)',
                backgroundColor: 'var(--color-bg-secondary)',
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.4s ease-out 0.1s, transform 0.4s ease-out 0.1s',
              }}
            >
              <div
                style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--spacing-md)',
                  color: 'var(--color-info)',
                }}
              >
                ✅
              </div>
              <h3 className="text-lg font-semibold mb-sm">Built-in Quality</h3>
              <p
                className="text-sm text-secondary"
                style={{ lineHeight: 'var(--line-height-relaxed)' }}
              >
                Automated validation against SDMPlus standards and best practices
              </p>
            </div>

            {/* Feature Card 3 */}
            <div
              className="card"
              style={{
                borderLeft: '3px solid var(--color-accent-purple)',
                backgroundColor: 'var(--color-bg-secondary)',
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.4s ease-out 0.15s, transform 0.4s ease-out 0.15s',
              }}
            >
              <div
                style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--spacing-md)',
                  color: 'var(--color-accent-purple)',
                }}
              >
                👥
              </div>
              <h3 className="text-lg font-semibold mb-sm">Multi-Persona Workflow</h3>
              <p
                className="text-sm text-secondary"
                style={{ lineHeight: 'var(--line-height-relaxed)' }}
              >
                Role-based reviews from Solution Architects, CPI, CDP, and more
              </p>
            </div>

            {/* Feature Card 4 */}
            <div
              className="card"
              style={{
                borderLeft: '3px solid var(--color-warning)',
                backgroundColor: 'var(--color-bg-secondary)',
                opacity: featuresVisible ? 1 : 0,
                transform: featuresVisible ? 'translateY(0)' : 'translateY(20px)',
                transition: 'opacity 0.4s ease-out 0.2s, transform 0.4s ease-out 0.2s',
              }}
            >
              <div
                style={{
                  fontSize: '2rem',
                  marginBottom: 'var(--spacing-md)',
                  color: 'var(--color-warning)',
                }}
              >
                ⚡
              </div>
              <h3 className="text-lg font-semibold mb-sm">Faster Approvals</h3>
              <p
                className="text-sm text-secondary"
                style={{ lineHeight: 'var(--line-height-relaxed)' }}
              >
                Reduce review cycles with pre-validated content and clear workflows
              </p>
            </div>
          </div>
        </div>

        {/* How It Works Section */}
        <div
          style={{
            padding: 'var(--spacing-3xl) var(--spacing-xl)',
            backgroundColor: 'var(--color-bg-primary)',
            opacity: howItWorksVisible ? 1 : 0,
            transform: howItWorksVisible ? 'translateY(0)' : 'translateY(30px)',
            transition: 'opacity 0.6s ease-out, transform 0.6s ease-out',
          }}
        >
          <div
            style={{
              maxWidth: 'var(--container-lg)',
              margin: '0 auto',
            }}
          >
            <h2
              className="text-4xl font-bold text-center mb-2xl"
              style={{
                opacity: howItWorksVisible ? 1 : 0,
                transform: howItWorksVisible ? 'translateY(0)' : 'translateY(-20px)',
                transition: 'opacity 0.5s ease-out 0.1s, transform 0.5s ease-out 0.1s',
              }}
            >
              How It Works
            </h2>

            <div className="flex flex-col gap-xl">
              {/* Step 1 */}
              <div
                className="flex gap-lg items-start"
                style={{
                  opacity: howItWorksVisible ? 1 : 0,
                  transform: howItWorksVisible ? 'translateY(0)' : 'translateY(20px)',
                  transition: 'opacity 0.4s ease-out 0.15s, transform 0.4s ease-out 0.15s',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--gradient-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  1
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-sm">Guided Drafting</h3>
                  <p
                    className="text-secondary"
                    style={{ lineHeight: 'var(--line-height-relaxed)' }}
                  >
                    Select methodology-specific template, fill structured forms with real-time
                    validation, collaborate with Solution Architect and team
                  </p>
                </div>
              </div>

              {/* Step 2 */}
              <div
                className="flex gap-lg items-start"
                style={{
                  opacity: howItWorksVisible ? 1 : 0,
                  transform: howItWorksVisible ? 'translateY(0)' : 'translateY(20px)',
                  transition: 'opacity 0.4s ease-out 0.25s, transform 0.4s ease-out 0.25s',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--gradient-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  2
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-sm">Risk & Quality Review</h3>
                  <p
                    className="text-secondary"
                    style={{ lineHeight: 'var(--line-height-relaxed)' }}
                  >
                    AI-powered analysis identifies compliance gaps, quality issues, and
                    recommendations before human review
                  </p>
                </div>
              </div>

              {/* Step 3 */}
              <div
                className="flex gap-lg items-start"
                style={{
                  opacity: howItWorksVisible ? 1 : 0,
                  transform: howItWorksVisible ? 'translateY(0)' : 'translateY(20px)',
                  transition: 'opacity 0.4s ease-out 0.35s, transform 0.4s ease-out 0.35s',
                }}
              >
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--gradient-blue)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    flexShrink: 0,
                  }}
                >
                  3
                </div>
                <div>
                  <h3 className="text-xl font-semibold mb-sm">Multi-Stakeholder Approval</h3>
                  <p
                    className="text-secondary"
                    style={{ lineHeight: 'var(--line-height-relaxed)' }}
                  >
                    Automated routing to CPI, CDP, and other reviewers with clear workflows and
                    status tracking
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
