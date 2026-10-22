CREATE TABLE IF NOT EXISTS runs (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  stage text NOT NULL DEFAULT 'brand',
  status text NOT NULL DEFAULT 'running',
  input jsonb NOT NULL,
  brand jsonb,
  competitors jsonb NOT NULL DEFAULT '[]'::jsonb,
  synthesis jsonb,
  source text,
  cost jsonb NOT NULL DEFAULT '{}'::jsonb,
  apify jsonb,
  error text,
  ip_hash text,
  lock_until timestamptz
)