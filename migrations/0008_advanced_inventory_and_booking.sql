PRAGMA foreign_keys = ON;

-- Advanced inventory and booking foundation. This migration is additive only:
-- existing catalog/UI data and visual design are untouched.

ALTER TABLE items ADD COLUMN min_loan_minutes INTEGER NOT NULL DEFAULT 60 CHECK (min_loan_minutes >= 1);
ALTER TABLE items ADD COLUMN max_loan_minutes INTEGER NOT NULL DEFAULT 10080 CHECK (max_loan_minutes >= 1);
ALTER TABLE items ADD COLUMN booking_notice_minutes INTEGER NOT NULL DEFAULT 0 CHECK (booking_notice_minutes >= 0);
ALTER TABLE items ADD COLUMN turnaround_minutes INTEGER NOT NULL DEFAULT 0 CHECK (turnaround_minutes >= 0);
ALTER TABLE items ADD COLUMN booking_horizon_days INTEGER NOT NULL DEFAULT 365 CHECK (booking_horizon_days BETWEEN 1 AND 1095);
ALTER TABLE items ADD COLUMN approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual','automatic'));
ALTER TABLE items ADD COLUMN deposit_required INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required IN (0,1));
ALTER TABLE items ADD COLUMN deposit_amount_agorot INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot >= 0);

ALTER TABLE loan_requests ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999);
ALTER TABLE loan_requests ADD COLUMN deposit_required_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required_snapshot IN (0,1));
ALTER TABLE loan_requests ADD COLUMN deposit_amount_agorot_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot_snapshot >= 0);
ALTER TABLE loan_requests ADD COLUMN deposit_terms_accepted_at TEXT;
ALTER TABLE loan_requests ADD COLUMN collected_at TEXT;
ALTER TABLE loan_requests ADD COLUMN returned_at TEXT;
ALTER TABLE loan_requests ADD COLUMN cancelled_at TEXT;

CREATE TABLE inventory_units (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  unit_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','blocked','retired')),
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE inventory_blocks (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  reason TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE loan_request_units (
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  inventory_unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,
  PRIMARY KEY (request_id, inventory_unit_id)
);

CREATE TABLE loan_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE waitlist_entries (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_from TEXT NOT NULL,
  requested_until TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','converted','cancelled','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (requested_until > requested_from)
);

CREATE INDEX inventory_units_item_status_idx ON inventory_units(item_id,status);
CREATE INDEX inventory_blocks_item_time_idx ON inventory_blocks(item_id,starts_at,ends_at);
CREATE INDEX loan_requests_item_time_status_idx ON loan_requests(item_id,requested_from,requested_until,status);
CREATE INDEX loan_request_events_request_idx ON loan_request_events(request_id,created_at DESC);
CREATE INDEX waitlist_item_time_idx ON waitlist_entries(item_id,status,requested_from,requested_until);

-- Israeli platform rule: collection/return appointments are not permitted
-- from Friday 17:00 until Saturday 21:00. Enforcement belongs in the API
-- as well as the client; this schema stores exact timestamps for that check.
