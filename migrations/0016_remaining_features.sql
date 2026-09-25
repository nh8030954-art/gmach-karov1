PRAGMA foreign_keys = ON;

-- Remaining production features: additive schema only.

CREATE TABLE IF NOT EXISTS item_image_edits (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  crop_json TEXT,
  rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation IN (0,90,180,270)),
  blur_regions_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(item_id,image_url)
);

CREATE TABLE IF NOT EXISTS review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  UNIQUE(review_id,reporter_id)
);

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(review_id,user_id)
);

CREATE TABLE IF NOT EXISTS organization_dashboard_snapshots (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(organization_id,snapshot_date)
);

CREATE TABLE IF NOT EXISTS content_translations (
  content_type TEXT NOT NULL,
  content_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('he','en')),
  translated_text TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(content_type,content_id,field_name,language)
);

CREATE TABLE IF NOT EXISTS page_content (
  content_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('he','en')),
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','scheduled','published','archived')),
  publish_at TEXT,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(content_key,language)
);

CREATE TABLE IF NOT EXISTS restore_validations (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT NOT NULL REFERENCES backup_runs(id) ON DELETE CASCADE,
  table_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  checksum TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  details_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE IF NOT EXISTS external_service_status (
  service_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('configured','missing','degraded','healthy')),
  details_json TEXT NOT NULL DEFAULT '{}',
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS item_image_edits_order_idx ON item_image_edits(item_id,sort_order);
CREATE INDEX IF NOT EXISTS review_reports_status_idx ON review_reports(status,created_at);
CREATE INDEX IF NOT EXISTS org_dashboard_snapshot_idx ON organization_dashboard_snapshots(organization_id,snapshot_date DESC);
CREATE INDEX IF NOT EXISTS page_content_publish_idx ON page_content(status,publish_at);
