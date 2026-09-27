
PRAGMA foreign_keys = ON;

ALTER TABLE loan_requests ADD COLUMN multi_range_batch_id TEXT;
ALTER TABLE loan_requests ADD COLUMN admin_previous_workflow_status TEXT;
ALTER TABLE loan_requests ADD COLUMN admin_hold_reason TEXT;
ALTER TABLE loan_requests ADD COLUMN admin_hold_until TEXT;

CREATE TABLE admin_user_controls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  reason TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  applied_at TEXT,
  restored_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE admin_loan_holds (
  request_id TEXT PRIMARY KEY REFERENCES loan_requests(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  hold_until TEXT,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX admin_user_controls_due_idx ON admin_user_controls(cancelled_at,applied_at,restored_at,starts_at,ends_at);
CREATE INDEX loan_multi_range_batch_idx ON loan_requests(multi_range_batch_id,created_at);
