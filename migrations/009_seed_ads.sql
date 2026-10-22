CREATE TABLE IF NOT EXISTS seed_ads (
  id text PRIMARY KEY,
  pack text NOT NULL DEFAULT 'custom',
  competitor text NOT NULL,
  ad jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)