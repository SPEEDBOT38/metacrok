CREATE TABLE IF NOT EXISTS run_ads (
  run_id text NOT NULL,
  ad_id text NOT NULL,
  competitor text NOT NULL,
  days_running int,
  pick_reason text,
  PRIMARY KEY (run_id, ad_id)
)