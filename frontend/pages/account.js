import { useState } from 'react';
import Head from 'next/head';
import { useAuth } from '../lib/auth';

export default function Account() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');

  const userData = {
    name: user?.full_name || user?.name || user?.email?.split('@')[0] || '—',
    email: user?.email || '—',
    role: user?.role || '—',
    department: '—',
    joinDate: '—',
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-xl">Profile Information</h2>

            <div className="grid grid-cols-2 gap-lg mb-xl">
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input
                  type="text"
                  value={userData.name}
                  className="form-input"
                  readOnly
                  style={{ opacity: 0.7, cursor: 'default' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  value={userData.email}
                  className="form-input"
                  readOnly
                  style={{ opacity: 0.7, cursor: 'default' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <input
                  type="text"
                  value={userData.role}
                  className="form-input"
                  readOnly
                  style={{ opacity: 0.7, cursor: 'default' }}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Department</label>
                <input
                  type="text"
                  value={userData.department}
                  className="form-input"
                  readOnly
                  style={{ opacity: 0.7, cursor: 'default' }}
                />
              </div>
            </div>

            <p className="text-sm text-tertiary">
              Profile information is managed by your Microsoft Entra ID account.
            </p>
          </div>
        );

      case 'reviews':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-xl">My Reviews</h2>

            <div className="grid grid-cols-4 gap-lg mb-xl">
              <div className="card text-center">
                <div
                  className="text-4xl font-bold mb-sm"
                  style={{ color: 'var(--color-accent-blue)' }}
                >
                  12
                </div>
                <div className="text-sm text-secondary">Total Reviews</div>
              </div>

              <div className="card text-center">
                <div
                  className="text-4xl font-bold mb-sm"
                  style={{ color: 'var(--color-accent-blue)' }}
                >
                  8
                </div>
                <div className="text-sm text-secondary">Completed</div>
              </div>

              <div className="card text-center">
                <div
                  className="text-4xl font-bold mb-sm"
                  style={{ color: 'var(--color-accent-blue)' }}
                >
                  4
                </div>
                <div className="text-sm text-secondary">In Progress</div>
              </div>

              <div className="card text-center">
                <div
                  className="text-4xl font-bold mb-sm"
                  style={{ color: 'var(--color-accent-blue)' }}
                >
                  87%
                </div>
                <div className="text-sm text-secondary">Avg. Score</div>
              </div>
            </div>

            <p className="text-center text-tertiary" style={{ padding: 'var(--spacing-xl)' }}>
              Visit the Review History page to see all your reviews.
            </p>
          </div>
        );

      case 'settings':
        return (
          <div>
            <h2 className="text-2xl font-semibold mb-xl">Settings</h2>

            <div className="mb-xl">
              <h3 className="text-xl font-semibold mb-md">Notifications</h3>

              <div className="form-group">
                <label className="flex items-center gap-sm cursor-pointer">
                  <input type="checkbox" defaultChecked className="form-checkbox" />
                  <span className="text-secondary">Email notifications for review completion</span>
                </label>
              </div>

              <div className="form-group">
                <label className="flex items-center gap-sm cursor-pointer">
                  <input type="checkbox" defaultChecked className="form-checkbox" />
                  <span className="text-secondary">Weekly summary reports</span>
                </label>
              </div>

              <div className="form-group">
                <label className="flex items-center gap-sm cursor-pointer">
                  <input type="checkbox" className="form-checkbox" />
                  <span className="text-secondary">Marketing communications</span>
                </label>
              </div>
            </div>

            <div className="mb-xl">
              <h3 className="text-xl font-semibold mb-md">Preferences</h3>

              <div className="form-group">
                <label className="form-label">Default Methodology</label>
                <select className="form-select">
                  <option>Agile</option>
                  <option>Waterfall</option>
                </select>
              </div>
            </div>

            <button className="btn btn-primary">Save Settings</button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Account Dashboard - Microsoft Cocoon</title>
      </Head>

      <div
        style={{
          minHeight: 'calc(100vh - 80px)',
          padding: 'var(--spacing-2xl) var(--spacing-xl)',
          backgroundColor: 'var(--color-bg-primary)',
        }}
      >
        <div
          style={{
            maxWidth: 'var(--container-xl)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl)',
          }}
        >
          <h1 className="text-4xl font-bold mb-sm">Account Dashboard</h1>
          <p className="text-lg text-secondary mb-xl">Manage your profile and settings</p>

          <div
            className="grid"
            style={{ gridTemplateColumns: '250px 1fr', gap: 'var(--spacing-xl)' }}
          >
            <div className="flex flex-col gap-sm">
              <button
                className={`btn ${activeSection === 'profile' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setActiveSection('profile')}
              >
                👤 Profile
              </button>
              <button
                className={`btn ${activeSection === 'reviews' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setActiveSection('reviews')}
              >
                📊 My Reviews
              </button>
              <button
                className={`btn ${activeSection === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
                style={{ justifyContent: 'flex-start' }}
                onClick={() => setActiveSection('settings')}
              >
                ⚙️ Settings
              </button>
            </div>

            <div className="card">{renderContent()}</div>
          </div>
        </div>
      </div>
    </>
  );
}
