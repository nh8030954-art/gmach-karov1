
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS privacy_purge_runs (
  id TEXT PRIMARY KEY,
  subject_user_id TEXT,
  subject_user_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  rows_deleted INTEGER NOT NULL DEFAULT 0,
  rows_anonymized INTEGER NOT NULL DEFAULT 0,
  media_deleted INTEGER NOT NULL DEFAULT 0,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS privacy_retention_policies (
  policy_key TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 3650),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO privacy_retention_policies(policy_key,retention_days,enabled) VALUES
('security_events',180,1),
('performance_events',90,1),
('notification_queue',90,1),
('notification_outbox',180,1),
('notification_digests',180,1),
('analytics_events',365,1),
('system_alerts',365,1),
('auth_events',90,1);

CREATE INDEX IF NOT EXISTS privacy_purge_runs_user_idx ON privacy_purge_runs(subject_user_id,status,created_at DESC);
