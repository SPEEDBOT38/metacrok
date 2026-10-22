ALTER TABLE run_ads
  ADD COLUMN IF NOT EXISTS excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correction jsonb,
  ADD COLUMN IF NOT EXISTS controlled_at timestamptz
