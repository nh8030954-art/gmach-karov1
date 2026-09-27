
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS community_offer_messages (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES help_request_offers(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
  read_at TEXT,
  edited_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS community_offer_message_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES community_offer_messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(message_id,reporter_id)
);
CREATE TABLE IF NOT EXISTS chat_retention_runs (
  id TEXT PRIMARY KEY,
  loan_messages_archived INTEGER NOT NULL DEFAULT 0,
  community_messages_archived INTEGER NOT NULL DEFAULT 0,
  media_deleted INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS community_offer_messages_offer_idx ON community_offer_messages(offer_id,created_at);
CREATE INDEX IF NOT EXISTS community_offer_message_reports_status_idx ON community_offer_message_reports(status,created_at);
CREATE INDEX IF NOT EXISTS chat_retention_runs_created_idx ON chat_retention_runs(created_at DESC);
