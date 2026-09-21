PRAGMA foreign_keys = ON;

ALTER TABLE loan_requests ADD COLUMN manager_note TEXT;
ALTER TABLE organizations ADD COLUMN is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1));

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('request', 'status', 'message', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE request_messages (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('incorrect', 'unsafe', 'commercial', 'unavailable', 'other')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (reporter_id, item_id, status)
);

CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, created_at DESC);
CREATE INDEX messages_request_idx ON request_messages(request_id, created_at ASC);
CREATE INDEX messages_rate_idx ON request_messages(sender_id, created_at DESC);
CREATE INDEX reports_status_idx ON reports(status, created_at ASC);
CREATE INDEX requests_inventory_idx ON loan_requests(item_id, status, requested_from, requested_until);
