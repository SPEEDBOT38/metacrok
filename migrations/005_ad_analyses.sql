CREATE TABLE IF NOT EXISTS ad_analyses (
  ad_id text PRIMARY KEY,
  analysis jsonb NOT NULL,
  model text,
  cost_usd numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
)