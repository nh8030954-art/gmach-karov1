PRAGMA foreign_keys = ON;

-- Consent/versioning and account deletion recovery.
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN privacy_version TEXT;
ALTER TABLE users ADD COLUMN deletion_requested_at TEXT;
ALTER TABLE users ADD COLUMN deletion_due_at TEXT;
ALTER TABLE users ADD COLUMN deletion_cancelled_at TEXT;
ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'he';

CREATE TABLE IF NOT EXISTS device_security_events (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,event_type TEXT NOT NULL,
 device_label TEXT,ip_hash TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Explicit inventory holds and publication scheduling.
CREATE TABLE IF NOT EXISTS inventory_holds (
 id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,
 quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,
 expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','cancelled')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS inventory_holds_item_time_idx ON inventory_holds(item_id,status,starts_at,ends_at,expires_at);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
 id TEXT PRIMARY KEY,job_type TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',run_at TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS scheduled_jobs_due_idx ON scheduled_jobs(status,run_at);

-- Branch inventory transfer history.
CREATE TABLE IF NOT EXISTS inventory_transfers (
 id TEXT PRIMARY KEY,unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
 from_branch_id TEXT,to_branch_id TEXT,status TEXT NOT NULL DEFAULT 'in_transit' CHECK(status IN ('in_transit','received','cancelled')),
 initiated_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),received_at TEXT
);

-- Ownership/admin invitations with expiry.
CREATE TABLE IF NOT EXISTS gmach_invitations (
 id TEXT PRIMARY KEY,gmach_id TEXT NOT NULL,invite_type TEXT NOT NULL CHECK(invite_type IN ('manager','ownership')),
 email TEXT NOT NULL,role TEXT,token_hash TEXT NOT NULL UNIQUE,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
 created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

-- Chat safety/media/read lifecycle.
CREATE TABLE IF NOT EXISTS chat_attachments (
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
 attachment_type TEXT NOT NULL CHECK(attachment_type IN ('image','audio','location','item','help_request')),
 storage_key TEXT,metadata_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS chat_blocks (
 blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 effective_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(blocker_id,blocked_id)
);
CREATE TABLE IF NOT EXISTS chat_reports (
 id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Notification delivery, quiet hours and push subscriptions.
CREATE TABLE IF NOT EXISTS notification_preferences (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,email_enabled INTEGER NOT NULL DEFAULT 1,push_enabled INTEGER NOT NULL DEFAULT 0,
 in_app_enabled INTEGER NOT NULL DEFAULT 1,quiet_start TEXT,quiet_end TEXT,daily_digest INTEGER NOT NULL DEFAULT 0,community_updates INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS push_subscriptions (
 id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,endpoint TEXT NOT NULL UNIQUE,p256dh TEXT NOT NULL,auth TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),last_used_at TEXT
);
CREATE TABLE IF NOT EXISTS notification_delivery_log (
 id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,channel TEXT NOT NULL,event_type TEXT NOT NULL,status TEXT NOT NULL,
 error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Backup/restore audit and operational alerts.
CREATE TABLE IF NOT EXISTS backup_runs (
 id TEXT PRIMARY KEY,backup_type TEXT NOT NULL,status TEXT NOT NULL,started_at TEXT NOT NULL,finished_at TEXT,manifest_json TEXT NOT NULL DEFAULT '{}',error TEXT
);
CREATE TABLE IF NOT EXISTS operational_alerts (
 id TEXT PRIMARY KEY,alert_type TEXT NOT NULL,severity TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_at TEXT
);

-- Product/category suggestions and SEO aliases.
CREATE TABLE IF NOT EXISTS category_suggestions (
 id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE SET NULL,name TEXT NOT NULL,parent_name TEXT,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS seo_routes (
 path TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT,title TEXT,description TEXT,noindex INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
