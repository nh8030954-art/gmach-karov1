PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('email','push')),
  status TEXT NOT NULL CHECK(status IN ('sent','failed','skipped')),
  attempted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  error TEXT,
  PRIMARY KEY(notification_id,channel)
);
CREATE INDEX IF NOT EXISTS notification_delivery_status_idx ON notification_delivery_log(status,attempted_at);
