PRAGMA foreign_keys = ON;

-- Move support storage into the managed schema instead of creating it during
-- a visitor request. Existing production data is preserved.
CREATE TABLE IF NOT EXISTS support_requests (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS support_requests_status_created_idx
ON support_requests(status, created_at DESC);

-- Records the last successful maintenance run without exposing user data.
CREATE TABLE IF NOT EXISTS operational_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abuse_events (
  identity_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS abuse_events_identity_action_created_idx
ON abuse_events(identity_hash, action, created_at DESC);

CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS auth_events_identity_action_created_idx
ON auth_events(identity_hash, action, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read_created_idx
ON notifications(read_at, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx
ON analytics_events(created_at);
