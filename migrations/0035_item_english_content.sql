CREATE TABLE IF NOT EXISTS item_english_content (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  title_en TEXT,
  description_en TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
