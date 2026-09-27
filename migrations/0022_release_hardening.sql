PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS system_alert_deliveries (
  alert_id TEXT NOT NULL REFERENCES system_alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  error TEXT,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(alert_id,channel,recipient)
);

CREATE TABLE IF NOT EXISTS release_readiness_snapshots (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('ready','warning','blocked')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS restore_drills (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT REFERENCES backup_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  notes TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX IF NOT EXISTS alert_deliveries_sent_idx ON system_alert_deliveries(sent_at DESC);
CREATE INDEX IF NOT EXISTS release_readiness_created_idx ON release_readiness_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS restore_drills_started_idx ON restore_drills(started_at DESC);
