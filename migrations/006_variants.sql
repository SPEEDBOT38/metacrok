CREATE TABLE IF NOT EXISTS variants (
  run_id text NOT NULL,
  idx int NOT NULL,
  data jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, idx)
)