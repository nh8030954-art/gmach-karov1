PRAGMA foreign_keys = ON;

CREATE TABLE navigation_links (
  id TEXT PRIMARY KEY,
  link_key TEXT NOT NULL UNIQUE,
  label_he TEXT NOT NULL,
  label_en TEXT,
  href TEXT NOT NULL,
  location TEXT NOT NULL CHECK(location IN ('header','footer_find','footer_share','footer_info','account')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  requires_auth INTEGER NOT NULL DEFAULT 0 CHECK(requires_auth IN (0,1)),
  open_new_tab INTEGER NOT NULL DEFAULT 0 CHECK(open_new_tab IN (0,1)),
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX navigation_links_location_idx ON navigation_links(location,enabled,sort_order);
INSERT INTO navigation_links(id,link_key,label_he,label_en,href,location,sort_order) VALUES
('nav-catalog','catalog','כל הפריטים','All items','#/catalog','footer_find',10),
('nav-how','how-it-works','איך זה עובד','How it works','#how-it-works','footer_find',20),
('nav-safety','safety','כללי השאלה בטוחה','Safe borrowing rules','#info:safety','footer_info',10),
('nav-terms','terms','תנאי שימוש','Terms of use','#info:terms','footer_info',20),
('nav-privacy','privacy','פרטיות','Privacy','#info:privacy','footer_info',30),
('nav-accessibility','accessibility','הצהרת נגישות','Accessibility statement','#action:accessibility','footer_info',40),
('nav-support','support','יצירת קשר ותמיכה','Contact and support','#action:support','footer_info',50),
('nav-add-gmach','add-gmach','פרסום גמ״ח','Publish a gmach','#action:add-gmach','footer_share',10),
('nav-add-item','add-item','הוספת פריט','Add an item','#action:add-item','footer_share',20);
