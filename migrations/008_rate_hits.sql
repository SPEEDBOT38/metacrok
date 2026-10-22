CREATE TABLE IF NOT EXISTS rate_hits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  ts timestamptz NOT NULL DEFAULT now()
)