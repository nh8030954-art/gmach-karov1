PRAGMA foreign_keys = ON;

ALTER TABLE support_tickets ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'));
ALTER TABLE support_tickets ADD COLUMN assigned_to TEXT;
ALTER TABLE support_tickets ADD COLUMN last_staff_reply_at TEXT;

CREATE TABLE server_errors (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  path TEXT NOT NULL,
  method TEXT,
  message TEXT NOT NULL,
  stack_excerpt TEXT,
  user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT,
  resolved_by TEXT
);

CREATE INDEX server_errors_open_created_idx ON server_errors(resolved_at,created_at DESC);
CREATE INDEX support_tickets_admin_queue_idx ON support_tickets(status,priority,updated_at DESC);
