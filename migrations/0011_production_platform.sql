PRAGMA foreign_keys = ON;

-- Production platform expansion. Existing columns and rows are preserved.
ALTER TABLE users ADD COLUMN address_cipher TEXT;
ALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'he' CHECK (preferred_language IN ('he','en'));
ALTER TABLE users ADD COLUMN deletion_requested_at TEXT;
ALTER TABLE users ADD COLUMN deleted_at TEXT;
ALTER TABLE users ADD COLUMN operational_emails_accepted INTEGER NOT NULL DEFAULT 1 CHECK (operational_emails_accepted IN (0,1));
ALTER TABLE users ADD COLUMN community_emails_accepted INTEGER NOT NULL DEFAULT 0 CHECK (community_emails_accepted IN (0,1));

ALTER TABLE organizations ADD COLUMN logo_url TEXT;
ALTER TABLE organizations ADD COLUMN publish_at TEXT;
ALTER TABLE organizations ADD COLUMN temporarily_closed INTEGER NOT NULL DEFAULT 0 CHECK (temporarily_closed IN (0,1));
ALTER TABLE organizations ADD COLUMN reopens_at TEXT;
ALTER TABLE organizations ADD COLUMN deletion_requested_at TEXT;
ALTER TABLE organizations ADD COLUMN deleted_at TEXT;
ALTER TABLE organizations ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'private';

ALTER TABLE items ADD COLUMN publish_at TEXT;
ALTER TABLE items ADD COLUMN deposit_amount REAL;
ALTER TABLE items ADD COLUMN max_per_user INTEGER;
ALTER TABLE items ADD COLUMN preparation_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE items ADD COLUMN max_loan_days INTEGER;
ALTER TABLE items ADD COLUMN service_radius_km REAL;
ALTER TABLE items ADD COLUMN serial_prefix TEXT;
ALTER TABLE items ADD COLUMN deleted_at TEXT;
ALTER TABLE items ADD COLUMN condition_detail TEXT;

ALTER TABLE loan_requests ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'inventory_held';
ALTER TABLE loan_requests ADD COLUMN pickup_window_start TEXT;
ALTER TABLE loan_requests ADD COLUMN pickup_window_end TEXT;
ALTER TABLE loan_requests ADD COLUMN proposed_from TEXT;
ALTER TABLE loan_requests ADD COLUMN proposed_until TEXT;
ALTER TABLE loan_requests ADD COLUMN extension_until TEXT;
ALTER TABLE loan_requests ADD COLUMN extension_status TEXT;
ALTER TABLE loan_requests ADD COLUMN branch_id TEXT;
ALTER TABLE loan_requests ADD COLUMN cancelled_by TEXT;

ALTER TABLE request_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text';
ALTER TABLE request_messages ADD COLUMN media_url TEXT;
ALTER TABLE request_messages ADD COLUMN deleted_at TEXT;
ALTER TABLE request_messages ADD COLUMN read_at TEXT;

ALTER TABLE reviews ADD COLUMN product_rating INTEGER CHECK (product_rating BETWEEN 1 AND 5);
ALTER TABLE reviews ADD COLUMN service_rating INTEGER CHECK (service_rating BETWEEN 1 AND 5);
ALTER TABLE reviews ADD COLUMN updated_at TEXT;
ALTER TABLE reviews ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE help_requests ADD COLUMN requested_from TEXT;
ALTER TABLE help_requests ADD COLUMN requested_until TEXT;
ALTER TABLE help_requests ADD COLUMN distance_km REAL;
ALTER TABLE help_requests ADD COLUMN selected_response_id TEXT;

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
  name_he TEXT NOT NULL,
  name_en TEXT,
  icon TEXT,
  image_url TEXT,
  synonyms_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','pending')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE organization_categories (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (organization_id, category_id)
);

CREATE TABLE item_categories (
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (item_id, category_id)
);

CREATE TABLE category_suggestions (
  id TEXT PRIMARY KEY,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  suggested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT
);

CREATE TABLE organization_branches (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  phone TEXT,
  hours_json TEXT NOT NULL DEFAULT '{}',
  inventory_mode TEXT NOT NULL DEFAULT 'separate' CHECK (inventory_mode IN ('separate','shared','hybrid')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','temporarily_closed','archived')),
  reopens_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE organization_members (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','requests','inventory','reports')),
  branch_scope_json TEXT NOT NULL DEFAULT '[]',
  category_scope_json TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE organization_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner','requests','inventory','reports')),
  branch_scope_json TEXT NOT NULL DEFAULT '[]',
  category_scope_json TEXT NOT NULL DEFAULT '[]',
  message TEXT,
  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE item_units (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
  serial_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','loaned','repair','inactive','retired')),
  condition TEXT NOT NULL,
  retired_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE retired_serials (
  serial_number TEXT PRIMARY KEY,
  item_unit_id TEXT,
  retired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE loan_unit_assignments (
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE RESTRICT,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  returned_at TEXT,
  PRIMARY KEY (request_id, unit_id)
);

CREATE TABLE loan_status_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE availability_rules (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  branch_id TEXT REFERENCES organization_branches(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('weekly_window','closure','preparation','advance_limit')),
  rule_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE user_blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  effective_after_request_id TEXT REFERENCES loan_requests(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE notification_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  in_app INTEGER NOT NULL DEFAULT 1 CHECK (in_app IN (0,1)),
  email INTEGER NOT NULL DEFAULT 0 CHECK (email IN (0,1)),
  push INTEGER NOT NULL DEFAULT 0 CHECK (push IN (0,1)),
  digest TEXT NOT NULL DEFAULT 'immediate' CHECK (digest IN ('immediate','daily')),
  quiet_start TEXT,
  quiet_end TEXT,
  PRIMARY KEY (user_id, notification_type)
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  filters_json TEXT NOT NULL,
  notify INTEGER NOT NULL DEFAULT 1 CHECK (notify IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE saved_categories (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number INTEGER NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','closed','reopened')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE system_alerts (
  id TEXT PRIMARY KEY,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  details_json TEXT NOT NULL DEFAULT '{}',
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO categories(id,parent_id,name_he,name_en,icon,sort_order) VALUES
('events',NULL,'אירועים','Events','sparkles',10),('tools',NULL,'כלי עבודה','Tools','tools',20),('babies',NULL,'תינוקות','Babies','baby',30),('medical',NULL,'רפואה ושיקום','Medical & rehabilitation','medical',40),('travel',NULL,'טיולים','Travel','travel',50),('home',NULL,'בית ואירוח','Home & hosting','home',60),('community',NULL,'קהילה וכללי','Community','heart',70),
('events-decor','events','עיצוב וקישוט','Decorations','sparkles',11),('events-tables','events','שולחנות וכיסאות','Tables & chairs','chair',12),('events-lighting','events','תאורה והגברה','Lighting & sound','light',13),('events-serving','events','כלי הגשה','Serving ware','dish',14),('events-canopies','events','חופות וסוכות','Canopies','tent',15),('events-textile','events','מפות וטקסטיל','Tablecloths & textiles','textile',16),
('tools-electric','tools','כלי עבודה חשמליים','Power tools','drill',21),('tools-hand','tools','כלי עבודה ידניים','Hand tools','hammer',22),('tools-garden','tools','כלי גינה','Garden tools','garden',23),('tools-ladders','tools','סולמות ופיגומים','Ladders','ladder',24),('tools-cleaning','tools','ציוד ניקוי','Cleaning equipment','clean',25),
('babies-strollers','babies','עגלות וטיולונים','Strollers','stroller',31),('babies-car-seats','babies','מושבי בטיחות','Car seats','seat',32),('babies-cribs','babies','מיטות ולולים','Cribs & playpens','crib',33),('babies-feeding','babies','האכלה והנקה','Feeding','bottle',34),('babies-bathing','babies','רחצה והחתלה','Bathing & changing','bath',35),('babies-carriers','babies','מנשאים','Baby carriers','carrier',36),
('medical-mobility','medical','ניידות וכיסאות גלגלים','Mobility','wheelchair',41),('medical-walking','medical','הליכונים וקביים','Walkers & crutches','crutch',42),('medical-homecare','medical','ציוד טיפול ביתי','Home care','medical',43),('medical-orthopedic','medical','ציוד אורתופדי','Orthopedic','orthopedic',44),('medical-recovery','medical','ציוד החלמה','Recovery','recovery',45),
('travel-camping','travel','קמפינג','Camping','tent',51),('travel-hiking','travel','טיולים והליכה','Hiking','backpack',52),('travel-luggage','travel','מזוודות ותיקים','Luggage','luggage',53),('travel-coolers','travel','צידניות וציוד אוכל','Coolers','cooler',54),('travel-beach','travel','ים ובריכה','Beach & pool','beach',55),
('home-appliances','home','מכשירי חשמל','Appliances','appliance',61),('home-furniture','home','ריהוט מתקפל','Folding furniture','chair',62),('home-kitchen','home','מטבח ואפייה','Kitchen & baking','kitchen',63),('home-bedding','home','אירוח ולינה','Hosting & bedding','bed',64),('home-moving','home','מעבר דירה','Moving','box',65),
('community-books','community','ספרים ולימוד','Books & study','book',71),('community-religious','community','תשמישי קדושה','Religious items','book',72),('community-accessibility','community','נגישות','Accessibility','accessibility',73),('community-clothing','community','ביגוד ותחפושות','Clothing & costumes','clothing',74),('community-sports','community','ספורט ופנאי','Sports & leisure','sport',75),('community-other','community','אחר','Other','box',99);

CREATE INDEX categories_parent_idx ON categories(parent_id,status,sort_order);
CREATE INDEX branches_org_idx ON organization_branches(organization_id,status);
CREATE INDEX members_user_idx ON organization_members(user_id,role);
CREATE INDEX units_item_status_idx ON item_units(item_id,status);
CREATE INDEX units_branch_status_idx ON item_units(branch_id,status);
CREATE INDEX status_events_request_idx ON loan_status_events(request_id,created_at);
CREATE INDEX availability_lookup_idx ON availability_rules(organization_id,branch_id,item_id,active);
CREATE INDEX support_user_idx ON support_tickets(user_id,updated_at DESC);
CREATE INDEX alerts_open_idx ON system_alerts(resolved_at,severity,created_at DESC);

-- Existing gmachim and products are immediately publishable. Verification is no longer a public trust signal.
UPDATE organizations SET status='approved', verified=0 WHERE status='pending';
UPDATE items SET status='active' WHERE status='pending';
