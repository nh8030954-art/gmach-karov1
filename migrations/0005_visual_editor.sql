PRAGMA foreign_keys = ON;

CREATE TABLE page_customizations (
  element_key TEXT PRIMARY KEY,
  text_content TEXT,
  styles_json TEXT NOT NULL DEFAULT '{}',
  attributes_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE page_customization_versions (
  id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX page_customization_versions_created_idx ON page_customization_versions(created_at DESC);
