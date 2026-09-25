PRAGMA foreign_keys = ON;

-- User privacy, device security and reversible deletion.
ALTER TABLE sessions ADD COLUMN device_label TEXT;
ALTER TABLE sessions ADD COLUMN ip_hash TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;
ALTER TABLE users ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT;

CREATE TABLE user_addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  address_cipher TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Loan workflow: pickup alternatives, extensions, recurring dates and waitlist offers.
CREATE TABLE loan_date_ranges (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  requested_from TEXT NOT NULL,
  requested_until TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','approved','declined','cancelled','collected','returned')),
  CHECK (requested_until > requested_from)
);

CREATE TABLE pickup_proposals (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE waitlist_offers (
  id TEXT PRIMARY KEY,
  waitlist_entry_id TEXT NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,
  offered_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  declined_at TEXT
);

-- Reviews and moderation.
CREATE TABLE review_helpful_votes (
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (review_id,user_id)
);

CREATE TABLE review_reports (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','removed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (review_id,reporter_id)
);

-- Community-board offers.
CREATE TABLE help_request_offers (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  responder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','selected','withdrawn','declined')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Saved entities and product comparison.
CREATE TABLE saved_help_requests (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,help_request_id)
);

CREATE TABLE product_comparisons (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id,item_id)
);

-- Support conversation and CMS publishing workflow.
CREATE TABLE support_ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE managed_content (
  content_key TEXT PRIMARY KEY,
  locale TEXT NOT NULL DEFAULT 'he',
  draft_json TEXT NOT NULL DEFAULT '{}',
  published_json TEXT NOT NULL DEFAULT '{}',
  publish_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE platform_closures (
  id TEXT PRIMARY KEY,
  closure_type TEXT NOT NULL CHECK (closure_type IN ('manual','holiday','maintenance')),
  title_he TEXT NOT NULL,
  title_en TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK (ends_at > starts_at)
);

CREATE TABLE security_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  ip_hash TEXT,
  device_label TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX user_addresses_user_idx ON user_addresses(user_id,is_default);
CREATE INDEX loan_date_ranges_request_idx ON loan_date_ranges(request_id,status);
CREATE INDEX pickup_proposals_request_idx ON pickup_proposals(request_id,status,created_at DESC);
CREATE INDEX waitlist_offers_expiry_idx ON waitlist_offers(expires_at,accepted_at,declined_at);
CREATE INDEX help_offers_request_idx ON help_request_offers(help_request_id,status,created_at);
CREATE INDEX support_messages_ticket_idx ON support_ticket_messages(ticket_id,created_at);
CREATE INDEX closures_time_idx ON platform_closures(active,starts_at,ends_at);
CREATE INDEX security_events_time_idx ON security_events(severity,created_at DESC);
