PRAGMA foreign_keys = ON;

-- Security, trusted devices and consent/deletion lifecycle.
ALTER TABLE sessions ADD COLUMN user_agent_hash TEXT;
ALTER TABLE sessions ADD COLUMN trusted INTEGER NOT NULL DEFAULT 0 CHECK (trusted IN (0,1));
ALTER TABLE users ADD COLUMN consent_version TEXT NOT NULL DEFAULT '2026-09-25';
ALTER TABLE users ADD COLUMN deletion_reminder_sent_at TEXT;

-- Gmach lifecycle and ownership transfer.
ALTER TABLE organizations ADD COLUMN deletion_cancelled_at TEXT;
ALTER TABLE organizations ADD COLUMN transfer_pending_to TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD COLUMN draft_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE organization_transfers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);

CREATE TABLE branch_transfers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit_id TEXT REFERENCES item_units(id) ON DELETE SET NULL,
  from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
  to_branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','received','cancelled')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  received_at TEXT
);

-- Inventory, holds, image ordering and material-change approvals.
ALTER TABLE items ADD COLUMN primary_image_url TEXT;
ALTER TABLE items ADD COLUMN material_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN last_material_change_at TEXT;

CREATE TABLE inventory_holds (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','released','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE item_images (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),
  moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending','approved','hidden','rejected')),
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Loan changes, cancellation undo, no-show and waitlist offer windows.
ALTER TABLE loan_requests ADD COLUMN hold_expires_at TEXT;
ALTER TABLE loan_requests ADD COLUMN pickup_expires_at TEXT;
ALTER TABLE loan_requests ADD COLUMN no_show_at TEXT;
ALTER TABLE loan_requests ADD COLUMN cancellation_undo_until TEXT;
ALTER TABLE loan_requests ADD COLUMN change_pending_json TEXT;
ALTER TABLE waitlist_entries ADD COLUMN response_minutes INTEGER NOT NULL DEFAULT 120 CHECK (response_minutes BETWEEN 5 AND 10080);
ALTER TABLE waitlist_entries ADD COLUMN offer_expires_at TEXT;

-- Chat moderation/media metadata and lifecycle.
ALTER TABLE request_messages ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';
CREATE TABLE message_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(message_id,reporter_id)
);

-- Branch-aware reviews.
ALTER TABLE reviews ADD COLUMN branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL;
ALTER TABLE reviews ADD COLUMN edited_until TEXT;

-- Security blocking and sensitive admin actions.
CREATE TABLE security_blocks (
  identity_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
  blocked_until TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE admin_action_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Calendar, data-rights, notification queue and backups.
CREATE TABLE calendar_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  preferred_app TEXT NOT NULL DEFAULT 'ics' CHECK (preferred_app IN ('ics','google','apple','outlook')),
  reminder_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (reminder_minutes BETWEEN 0 AND 10080),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_data_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('export','access','correction')),
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','completed','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE TABLE notification_queue (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','push','digest')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  scheduled_at TEXT NOT NULL,
  sent_at TEXT,
  failed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE backup_runs (
  id TEXT PRIMARY KEY,
  backup_key TEXT,
  status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE INDEX organization_transfers_org_status_idx ON organization_transfers(organization_id,status,created_at DESC);
CREATE INDEX branch_transfers_org_status_idx ON branch_transfers(organization_id,status,created_at DESC);
CREATE INDEX inventory_holds_lookup_idx ON inventory_holds(item_id,status,starts_at,ends_at,expires_at);
CREATE INDEX item_images_item_sort_idx ON item_images(item_id,sort_order);
CREATE INDEX message_reports_status_idx ON message_reports(status,created_at);
CREATE INDEX security_blocks_until_idx ON security_blocks(blocked_until);
CREATE INDEX admin_action_challenges_user_idx ON admin_action_challenges(user_id,action,expires_at);
CREATE INDEX notification_queue_due_idx ON notification_queue(channel,scheduled_at,sent_at,failed_at);
CREATE INDEX backup_runs_created_idx ON backup_runs(created_at DESC);
