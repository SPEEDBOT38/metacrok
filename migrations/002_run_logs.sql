CREATE TABLE IF NOT EXISTS run_logs (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'info',
  line text NOT NULL
)