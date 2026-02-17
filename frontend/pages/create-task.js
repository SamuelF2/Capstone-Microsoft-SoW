import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function CreateTask() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [methodology, setMethodology] = useState('Agile');

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (file) {
      // In a real app, you would upload the file and get a review ID
      // For now, we'll simulate by redirecting to a sample review
      router.push('/review/1');
    } else {
      alert('Please upload a SOW document first');
    }
  };

  return (
    <>
      <Head>
        <title>Create Task - AI-Powered SOW Review</title>
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
            maxWidth: 'var(--container-lg)',
            margin: '0 auto',
            padding: '0 var(--spacing-xl)',
          }}
        >
          <h1 className="text-4xl font-bold mb-md">AI-Powered SOW Review</h1>
          <p
            className="text-lg text-secondary mb-2xl"
            style={{ lineHeight: 'var(--line-height-relaxed)' }}
          >
            Upload your Statement of Work document for automated compliance analysis and expert
            recommendations
          </p>

          <div className="card" style={{ maxWidth: '800px' }}>
            <h3 className="text-xl font-semibold mb-lg">Upload SOW Document</h3>

            <div
              style={{
                border: '2px dashed var(--color-border-default)',
                borderRadius: 'var(--radius-lg)',
                padding: 'var(--spacing-2xl) var(--spacing-xl)',
                textAlign: 'center',
                marginBottom: 'var(--spacing-xl)',
                transition: 'border-color var(--transition-base)',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: 'var(--spacing-md)' }}>📄</div>
              <p className="text-secondary mb-md">
                {file ? file.name : 'Drag and drop your SOW document here'}
              </p>
              <label htmlFor="file-upload" className="btn btn-secondary btn-sm">
                Browse Files
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".pdf,.doc,.docx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>

            <div className="form-group">
              <label className="form-label">SOW Methodology</label>
              <select
                value={methodology}
                onChange={(e) => setMethodology(e.target.value)}
                className="form-select"
              >
                <option value="Agile">Agile</option>
                <option value="Waterfall">Waterfall</option>
              </select>
            </div>

            <button onClick={handleUpload} className="btn btn-primary btn-lg btn-block">
              Upload and Analyze
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
