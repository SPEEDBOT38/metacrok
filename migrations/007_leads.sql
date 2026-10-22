CREATE TABLE IF NOT EXISTS leads (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  run_id text,
  created_at timestamptz NOT NULL DEFAULT now()
)