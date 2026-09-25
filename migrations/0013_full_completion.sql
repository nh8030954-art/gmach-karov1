PRAGMA foreign_keys = ON;

-- Full completion layer: adds missing operational state without changing existing public-home data.

ALTER TABLE users ADD COLUMN tour_completed INTEGER NOT NULL DEFAULT 0 CHECK (tour_completed IN (0,1));
ALTER TABLE users ADD COLUMN navigation_preference TEXT NOT NULL DEFAULT 'google' CHECK (navigation_preference IN ('google','waze','apple'));
ALTER TABLE users ADD COLUMN quiet_hours_enabled INTEGER NOT NULL DEFAULT 0 CHECK (quiet_hours_enabled IN (0,1));
ALTER TABLE users ADD COLUMN quiet_start TEXT;
ALTER TABLE users ADD COLUMN quiet_end TEXT;

ALTER TABLE organization_invitations ADD COLUMN invitee_email TEXT;
ALTER TABLE organization_invitations ADD COLUMN invitation_type TEXT NOT NULL DEFAULT 'manager' CHECK (invitation_type IN ('manager','ownership'));

ALTER TABLE organization_branches ADD COLUMN rating REAL;
ALTER TABLE organization_branches ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE item_units ADD COLUMN notes TEXT;
ALTER TABLE push_subscriptions ADD COLUMN user_agent TEXT;
ALTER TABLE push_subscriptions ADD COLUMN last_used_at TEXT;

CREATE TABLE consent_versions (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK(document_type IN ('terms','privacy')),
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  PRIMARY KEY(user_id,document_type,version)
);

CREATE TABLE device_security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT REFERENCES sessions(token_hash) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  device_label TEXT,
  ip_hash TEXT,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE inventory_holds (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 999),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','converted','expired','cancelled')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(ends_at > starts_at)
);

CREATE TABLE scheduled_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  run_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','done','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at TEXT
);

CREATE TABLE inventory_transfers (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE CASCADE,
  from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
  to_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK(status IN ('in_transit','received','cancelled')),
  initiated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  received_at TEXT
);

CREATE TABLE chat_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,
  attachment_type TEXT NOT NULL CHECK(attachment_type IN ('image','audio','location','item','help_request')),
  storage_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE chat_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(message_id,reporter_id)
);

CREATE TABLE notification_delivery_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK(channel IN ('in_app','email','push')),
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('queued','sent','failed','skipped')),
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE backup_runs (
  id TEXT PRIMARY KEY,
  backup_type TEXT NOT NULL CHECK(backup_type IN ('scheduled','manual','restore_drill')),
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  error TEXT
);

CREATE TABLE operational_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','warning','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at TEXT
);

CREATE TABLE seo_routes (
  path TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  title TEXT,
  description TEXT,
  noindex INTEGER NOT NULL DEFAULT 0 CHECK(noindex IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE ownership_transfers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  accepted_at TEXT
);

CREATE TABLE branch_reviews (
  id TEXT PRIMARY KEY,
  branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL UNIQUE REFERENCES loan_requests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT
);

CREATE TABLE product_change_confirmations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  change_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT,
  UNIQUE(item_id,request_id,status)
);

CREATE TABLE data_subject_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK(request_type IN ('access','correction','export')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admin_sensitive_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  confirmation_code_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','expired','cancelled')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  confirmed_at TEXT
);

CREATE TABLE blocked_identities (
  identity_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  severity INTEGER NOT NULL DEFAULT 1 CHECK(severity BETWEEN 1 AND 5),
  blocked_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE calendar_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  reminder_minutes INTEGER NOT NULL DEFAULT 1440 CHECK(reminder_minutes BETWEEN 0 AND 10080),
  provider TEXT NOT NULL DEFAULT 'download' CHECK(provider IN ('download','google','apple','outlook')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE item_image_metadata (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  moderation_status TEXT NOT NULL DEFAULT 'clean' CHECK(moderation_status IN ('clean','pending','hidden')),
  privacy_blur INTEGER NOT NULL DEFAULT 0 CHECK(privacy_blur IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(item_id,image_url)
);

CREATE INDEX device_security_events_user_idx ON device_security_events(user_id,created_at DESC);
CREATE INDEX inventory_holds_item_time_idx ON inventory_holds(item_id,status,starts_at,ends_at,expires_at);
CREATE INDEX inventory_holds_expiry_idx ON inventory_holds(status,expires_at);
CREATE INDEX scheduled_jobs_due_idx ON scheduled_jobs(status,run_at);
CREATE INDEX inventory_transfers_status_idx ON inventory_transfers(status,created_at DESC);
CREATE INDEX chat_attachments_message_idx ON chat_attachments(message_id);
CREATE INDEX notification_delivery_user_idx ON notification_delivery_log(user_id,created_at DESC);
CREATE INDEX operational_alerts_open_idx ON operational_alerts(status,severity,created_at DESC);
CREATE INDEX ownership_transfers_target_idx ON ownership_transfers(to_user_id,status,expires_at);
CREATE INDEX branch_reviews_branch_idx ON branch_reviews(branch_id,status,created_at DESC);
CREATE INDEX data_subject_requests_user_idx ON data_subject_requests(user_id,status,created_at DESC);
