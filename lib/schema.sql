CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS teacher (
  id SERIAL PRIMARY KEY,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text', 'link')),
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'pending', 'failed')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Databases created before the status/error columns existed or before the
-- 'failed' status was added. Safe to run repeatedly.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS error TEXT;
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_status_check;
ALTER TABLE sources ADD CONSTRAINT sources_status_check
  CHECK (status IN ('ready', 'pending', 'failed'));

CREATE TABLE IF NOT EXISTS chunks (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No vector index on purpose. An ivfflat index scans only one list by
-- default, which on a small corpus (a single teacher's notes) can silently
-- miss relevant rows. An exact sequential scan is exact and still takes
-- milliseconds at this size. DROP covers databases created before this change.
DROP INDEX IF EXISTS chunks_embedding_idx;

CREATE TABLE IF NOT EXISTS qa_log (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  grounded BOOLEAN NOT NULL,
  source_ids INTEGER[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  qa_log_id INTEGER NOT NULL REFERENCES qa_log(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  embedding vector(768) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP INDEX IF EXISTS feedback_embedding_idx;
