CREATE TABLE IF NOT EXISTS ig_posts (
  run_id text NOT NULL,
  id text NOT NULL,
  handle text NOT NULL,
  is_brand boolean NOT NULL DEFAULT false,
  caption text,
  image_url text,
  url text,
  post_type text,
  likes int,
  comments int,
  posted_at timestamptz,
  analysis jsonb,
  PRIMARY KEY (run_id, id)
)
