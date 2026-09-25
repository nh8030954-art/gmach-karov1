PRAGMA foreign_keys = ON;

ALTER TABLE saved_searches ADD COLUMN last_checked_at TEXT;
ALTER TABLE saved_searches ADD COLUMN last_result_signature TEXT;
ALTER TABLE push_subscriptions ADD COLUMN user_agent TEXT;

CREATE TABLE geo_cache (
  query_key TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE content_reports (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('item_image','item','organization','message','review')),
  entity_id TEXT NOT NULL,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK (severity IN ('normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE cms_versions (
  id TEXT PRIMARY KEY,
  content_key TEXT NOT NULL,
  locale TEXT NOT NULL DEFAULT 'he',
  content_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX geo_cache_expiry_idx ON geo_cache(expires_at);
CREATE INDEX content_reports_status_idx ON content_reports(status,severity,created_at);
CREATE INDEX cms_versions_key_idx ON cms_versions(content_key,locale,created_at DESC);
