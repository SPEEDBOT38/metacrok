CREATE TABLE IF NOT EXISTS variant_images (
  run_id text NOT NULL,
  idx int NOT NULL,
  mime text NOT NULL DEFAULT 'image/png',
  data text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  variant_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, idx)
)
