-- ============================================
-- Cocoon PostgreSQL Initialization
-- Runs automatically on first container start
-- ============================================

-- SoW Documents table (main storage for uploaded SoWs)
CREATE TABLE IF NOT EXISTS sow_documents (
    id              SERIAL PRIMARY KEY,
    title           TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'draft',
    uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content         JSONB,
    metadata        JSONB
);

-- Review Results table (stores AI review findings)
CREATE TABLE IF NOT EXISTS review_results (
    id              SERIAL PRIMARY KEY,
    sow_id          INTEGER REFERENCES sow_documents(id) ON DELETE CASCADE,
    reviewer        TEXT,
    score           REAL,
    findings        JSONB,
    reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_sow_status ON sow_documents(status);
CREATE INDEX IF NOT EXISTS idx_review_sow_id ON review_results(sow_id);

-- Seed: insert a sample SoW for dev testing
INSERT INTO sow_documents (title, status, content, metadata)
VALUES (
    'Sample SoW - Contoso Cloud Migration',
    'draft',
    '{"sections": ["scope", "deliverables", "timeline"]}',
    '{"source": "seed_data", "version": "0.1"}'
) ON CONFLICT DO NOTHING;
