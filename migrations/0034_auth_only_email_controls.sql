-- Apply the administrator's temporary auth-only email choice once.
CREATE TABLE IF NOT EXISTS email_control_rollouts (rollout_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
UPDATE email_templates SET enabled=CASE WHEN template_key IN ('verification','password_reset') THEN 1 ELSE 0 END,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE NOT EXISTS (SELECT 1 FROM email_control_rollouts WHERE rollout_key='auth-only-2026-10-04');
INSERT OR IGNORE INTO email_control_rollouts(rollout_key,applied_at) VALUES('auth-only-2026-10-04',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
