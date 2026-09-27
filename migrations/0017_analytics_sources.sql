ALTER TABLE analytics_events ADD COLUMN source TEXT;
ALTER TABLE analytics_events ADD COLUMN referrer TEXT;
ALTER TABLE analytics_events ADD COLUMN page_path TEXT;

CREATE INDEX IF NOT EXISTS analytics_events_source_created_idx
  ON analytics_events(source, created_at DESC);
