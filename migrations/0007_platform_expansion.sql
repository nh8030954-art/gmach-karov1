PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN phone TEXT;
ALTER TABLE users ADD COLUMN city TEXT;

ALTER TABLE organizations ADD COLUMN address TEXT;
ALTER TABLE organizations ADD COLUMN website_url TEXT;
ALTER TABLE organizations ADD COLUMN hours_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN service_area TEXT;
ALTER TABLE organizations ADD COLUMN pickup_options TEXT NOT NULL DEFAULT '["pickup"]';
ALTER TABLE organizations ADD COLUMN last_active_at TEXT;
ALTER TABLE organizations ADD COLUMN verified_phone INTEGER NOT NULL DEFAULT 0 CHECK (verified_phone IN (0,1));
ALTER TABLE organizations ADD COLUMN verified_address INTEGER NOT NULL DEFAULT 0 CHECK (verified_address IN (0,1));

ALTER TABLE items ADD COLUMN item_type TEXT NOT NULL DEFAULT 'loan' CHECK (item_type IN ('loan','donation','service'));
ALTER TABLE items ADD COLUMN subcategory TEXT;
ALTER TABLE items ADD COLUMN tags_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE items ADD COLUMN pickup_method TEXT NOT NULL DEFAULT 'pickup' CHECK (pickup_method IN ('pickup','delivery','coordination'));
ALTER TABLE items ADD COLUMN inventory_updated_at TEXT;

CREATE TABLE help_requests (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  city TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal','urgent')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','matched','closed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE help_request_responses (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  responder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(help_request_id, organization_id)
);

CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE REFERENCES loan_requests(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE saved_organizations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(user_id, organization_id)
);

CREATE TABLE analytics_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('search','no_results','item_view','request_created','share')),
  query TEXT,
  city TEXT,
  category TEXT,
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX help_requests_lookup_idx ON help_requests(status,city,category,created_at DESC);
CREATE INDEX reviews_org_idx ON reviews(organization_id,status,created_at DESC);
CREATE INDEX analytics_type_idx ON analytics_events(event_type,created_at DESC);
CREATE INDEX items_discovery_idx ON items(status,city,category,item_type,updated_at DESC);
