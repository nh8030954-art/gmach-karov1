PRAGMA foreign_keys = ON;

-- New release-completion structures. Existing platform columns/tables from 0011/0012 are reused.
CREATE TABLE IF NOT EXISTS consent_versions (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,document_type TEXT NOT NULL CHECK(document_type IN ('terms','privacy')),
 version TEXT NOT NULL,accepted_at TEXT NOT NULL,PRIMARY KEY(user_id,document_type,version)
);
CREATE TABLE IF NOT EXISTS device_security_events (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
 event_type TEXT NOT NULL,device_label TEXT,ip_hash TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS inventory_holds (
 id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','cancelled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS inventory_holds_item_time_idx ON inventory_holds(item_id,status,starts_at,ends_at,expires_at);
CREATE TABLE IF NOT EXISTS scheduled_jobs (
 id TEXT PRIMARY KEY,job_type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',run_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs(status,run_at);
CREATE TABLE IF NOT EXISTS inventory_transfers (
 id TEXT PRIMARY KEY,unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE CASCADE,from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
 to_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,status TEXT NOT NULL DEFAULT 'in_transit' CHECK(status IN ('in_transit','received','cancelled')),
 initiated_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),received_at TEXT
);
CREATE TABLE IF NOT EXISTS chat_attachments (
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,attachment_type TEXT NOT NULL CHECK(attachment_type IN ('image','audio','location','item','help_request')),
 storage_key TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS chat_reports (
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notification_delivery_log (
 id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,channel TEXT NOT NULL,event_type TEXT NOT NULL,status TEXT NOT NULL,error TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS backup_runs (
 id TEXT PRIMARY KEY,backup_type TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,manifest_json TEXT NOT NULL DEFAULT '{}',error TEXT
);
CREATE TABLE IF NOT EXISTS operational_alerts (
 id TEXT PRIMARY KEY,alert_type TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',details_json TEXT NOT NULL DEFAULT '{}',
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS seo_routes (
 path TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT,title TEXT,description TEXT,noindex INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
