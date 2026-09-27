
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operational_health_snapshots (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('healthy','warning','critical')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX IF NOT EXISTS operational_health_created_idx ON operational_health_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS system_alerts_type_open_idx ON system_alerts(alert_type,resolved_at,created_at DESC);
