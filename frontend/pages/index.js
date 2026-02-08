import { useState, useEffect } from 'react';

export default function Home() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch('http://localhost:8000/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setHealth({ status: 'error', database: err.message }));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: '2rem', maxWidth: 600 }}>
      <h1>🧬 Cocoon</h1>
      <p>Microsoft SoW Review Automation</p>
      <hr />
      <h3>System Status</h3>
      {health ? (
        <pre
          style={{
            background: '#f4f4f4',
            padding: '1rem',
            borderRadius: 8,
          }}
        >
          {JSON.stringify(health, null, 2)}
        </pre>
      ) : (
        <p>Connecting to backend...</p>
      )}
      <p style={{ color: '#888', fontSize: '0.85rem' }}>
        Backend: <a href="http://localhost:8000/docs">http://localhost:8000/docs</a>
        <br />
        ArangoDB: <a href="http://localhost:8529">http://localhost:8529</a>
      </p>
    </div>
  );
}
