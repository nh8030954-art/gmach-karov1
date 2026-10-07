CREATE TABLE IF NOT EXISTS organization_contact_preferences (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 show_public INTEGER NOT NULL DEFAULT 0 CHECK(show_public IN (0,1)),
 channels_json TEXT NOT NULL DEFAULT '["phone","address","chat"]',
 preferred TEXT NOT NULL DEFAULT 'chat', email TEXT,
 hours_json TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
