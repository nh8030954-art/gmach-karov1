PRAGMA foreign_keys = ON;

-- Final feature-completion layer. Additive only: no public-home layout data is changed.

ALTER TABLE audit_log ADD COLUMN branch_id TEXT;
ALTER TABLE audit_log ADD COLUMN old_value_json TEXT;
ALTER TABLE audit_log ADD COLUMN new_value_json TEXT;
ALTER TABLE audit_log ADD COLUMN ip_hash TEXT;
ALTER TABLE audit_log ADD COLUMN device_label TEXT;

ALTER TABLE reviews ADD COLUMN organization_response TEXT;
ALTER TABLE reviews ADD COLUMN organization_response_at TEXT;

ALTER TABLE items ADD COLUMN waitlist_response_minutes INTEGER NOT NULL DEFAULT 120 CHECK(waitlist_response_minutes BETWEEN 15 AND 10080);
ALTER TABLE items ADD COLUMN waitlist_near_response_minutes INTEGER NOT NULL DEFAULT 30 CHECK(waitlist_near_response_minutes BETWEEN 15 AND 10080);
ALTER TABLE items ADD COLUMN recurring_allowed INTEGER NOT NULL DEFAULT 0 CHECK(recurring_allowed IN (0,1));
ALTER TABLE items ADD COLUMN public_slug TEXT;
ALTER TABLE organizations ADD COLUMN public_slug TEXT;
ALTER TABLE organizations ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0,1));

CREATE TABLE user_tours (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tour_key TEXT NOT NULL,
  completed_at TEXT,
  dismissed_at TEXT,
  last_step INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,tour_key)
);

CREATE TABLE organization_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 10),
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE organization_onboarding (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  first_item_added INTEGER NOT NULL DEFAULT 0 CHECK(first_item_added IN (0,1)),
  management_tour_done INTEGER NOT NULL DEFAULT 0 CHECK(management_tour_done IN (0,1)),
  preview_seen INTEGER NOT NULL DEFAULT 0 CHECK(preview_seen IN (0,1)),
  tips_dismissed INTEGER NOT NULL DEFAULT 0 CHECK(tips_dismissed IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE branch_inventory_policies (
  branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'inherit' CHECK(mode IN ('inherit','separate','shared')),
  quantity_override INTEGER CHECK(quantity_override IS NULL OR quantity_override BETWEEN 0 AND 999),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(branch_id,item_id)
);

CREATE TABLE pickup_branch_proposals (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,
  to_branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,
  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT
);

CREATE TABLE unit_events (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  note TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE bulk_inventory_jobs (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('activate','deactivate','category','availability','quantity','transfer','qr_export')),
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','running','completed','failed')),
  affected_count INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  completed_at TEXT
);

CREATE TABLE item_change_confirmations (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  borrower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  old_value_json TEXT NOT NULL DEFAULT '{}',
  new_value_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  responded_at TEXT,
  UNIQUE(item_id,request_id,status)
);

CREATE TABLE recurring_loan_rules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 999),
  starts_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 30 AND 525600),
  frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly')),
  occurrences INTEGER NOT NULL CHECK(occurrences BETWEEN 2 AND 52),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled','completed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE saved_entities (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('item','organization','category','help_request','search')),
  entity_id TEXT NOT NULL,
  notify INTEGER NOT NULL DEFAULT 1 CHECK(notify IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(user_id,entity_type,entity_id)
);

CREATE TABLE search_suggestion_events (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  corrected_query TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  city TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE community_match_events (
  id TEXT PRIMARY KEY,
  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  score REAL NOT NULL DEFAULT 0,
  notified_at TEXT,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','notified','offered','selected','dismissed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK(channel IN ('in_app','email','push')),
  event_type TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  scheduled_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at TEXT
);

CREATE TABLE notification_digests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  digest_date TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  sent_at TEXT,
  UNIQUE(user_id,digest_date)
);

CREATE TABLE email_templates (
  template_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('he','en')),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY(template_key,language)
);

CREATE TABLE holiday_rules (
  id TEXT PRIMARY KEY,
  hebrew_month TEXT NOT NULL,
  hebrew_day INTEGER NOT NULL CHECK(hebrew_day BETWEEN 1 AND 30),
  duration_days INTEGER NOT NULL DEFAULT 1 CHECK(duration_days BETWEEN 1 AND 8),
  title_he TEXT NOT NULL,
  title_en TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  message_he TEXT,
  message_en TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE moderation_jobs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('item_image','chat_image','review','message','organization')),
  entity_id TEXT NOT NULL,
  reason TEXT,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK(severity IN ('normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','hidden','cleared')),
  auto_hidden INTEGER NOT NULL DEFAULT 0 CHECK(auto_hidden IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE faq_articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title_he TEXT NOT NULL,
  title_en TEXT,
  body_he TEXT NOT NULL,
  body_en TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE page_versions (
  id TEXT PRIMARY KEY,
  content_key TEXT NOT NULL,
  language TEXT NOT NULL CHECK(language IN ('he','en')),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(content_key,language,version)
);

CREATE TABLE performance_events (
  id TEXT PRIMARY KEY,
  path TEXT,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  user_agent_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE backup_objects (
  backup_run_id TEXT NOT NULL REFERENCES backup_runs(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  object_type TEXT NOT NULL,
  size_bytes INTEGER,
  checksum TEXT,
  PRIMARY KEY(backup_run_id,storage_key)
);

CREATE TABLE restore_drills (
  id TEXT PRIMARY KEY,
  backup_run_id TEXT REFERENCES backup_runs(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),
  notes TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE INDEX organization_drafts_user_idx ON organization_drafts(user_id,updated_at DESC);
CREATE INDEX unit_events_unit_idx ON unit_events(unit_id,created_at DESC);
CREATE INDEX item_change_confirmations_borrower_idx ON item_change_confirmations(borrower_id,status,expires_at);
CREATE INDEX saved_entities_user_idx ON saved_entities(user_id,entity_type,created_at DESC);
CREATE INDEX community_match_help_idx ON community_match_events(help_request_id,status,score DESC);
CREATE INDEX notification_outbox_due_idx ON notification_outbox(status,scheduled_at);
CREATE INDEX moderation_jobs_status_idx ON moderation_jobs(status,severity,created_at);
CREATE INDEX performance_events_metric_idx ON performance_events(metric,created_at DESC);

INSERT OR IGNORE INTO holiday_rules(id,hebrew_month,hebrew_day,duration_days,title_he,title_en,message_he,message_en) VALUES
('rosh-hashana','Tishri',1,2,'ראש השנה','Rosh Hashanah','האתר סגור לכבוד ראש השנה וייפתח בצאת החג.','The site is closed for Rosh Hashanah and will reopen after the holiday.'),
('yom-kippur','Tishri',10,1,'יום כיפור','Yom Kippur','האתר סגור לכבוד יום כיפור וייפתח בצאת הצום.','The site is closed for Yom Kippur and will reopen after the fast.'),
('sukkot-first','Tishri',15,1,'סוכות','Sukkot','האתר סגור לכבוד חג הסוכות.','The site is closed for Sukkot.'),
('shemini-atzeret','Tishri',22,1,'שמיני עצרת ושמחת תורה','Shemini Atzeret','האתר סגור לכבוד החג.','The site is closed for the holiday.'),
('pesach-first','Nisan',15,1,'פסח','Passover','האתר סגור לכבוד חג הפסח.','The site is closed for Passover.'),
('pesach-last','Nisan',21,1,'שביעי של פסח','Seventh Day of Passover','האתר סגור לכבוד שביעי של פסח.','The site is closed for the Seventh Day of Passover.'),
('shavuot','Sivan',6,1,'שבועות','Shavuot','האתר סגור לכבוד חג השבועות.','The site is closed for Shavuot.');

INSERT OR IGNORE INTO email_templates(template_key,language,subject,body_text) VALUES
('new_device','he','כניסה ממכשיר חדש','זוהתה כניסה ממכשיר חדש לחשבון שלך. אם זו לא הייתה כניסה שלך, יש להחליף סיסמה ולנתק מכשירים.'),
('new_device','en','New device sign-in','A new device signed in to your account. If this was not you, change your password and revoke devices.'),
('pickup_confirmed','he','מועד האיסוף אושר','מועד האיסוף אושר. פרטי ההשאלה זמינים באזור האישי.'),
('pickup_confirmed','en','Pickup confirmed','Your pickup time was confirmed. Loan details are available in your account.'),
('loan_cancelled','he','ההשאלה בוטלה','ההשאלה בוטלה והמלאי שוחרר.'),
('loan_cancelled','en','Loan cancelled','The loan was cancelled and inventory was released.'),
('extension','he','עדכון בקשת הארכה','יש עדכון חדש בבקשת ההארכה שלך.'),
('extension','en','Extension update','There is a new update to your extension request.'),
('waitlist','he','מוצר התפנה עבורך','מוצר ברשימת ההמתנה התפנה עבורך לזמן מוגבל.'),
('waitlist','en','An item is available for you','A waitlisted item is available for you for a limited time.'),
('support','he','עדכון בפניית התמיכה','יש עדכון חדש בפניית התמיכה שלך.'),
('support','en','Support ticket update','There is a new update to your support ticket.');

INSERT OR IGNORE INTO faq_articles(id,slug,title_he,title_en,body_he,body_en,keywords_json,sort_order) VALUES
('faq-search','search','איך מחפשים מוצר?','How do I find an item?','מקלידים מה צריכים, בוחרים אזור ותאריך ומסננים לפי זמינות ומרחק.','Enter what you need, choose an area and dates, then filter by availability and distance.','["חיפוש","מוצר","מרחק","זמינות"]',10),
('faq-loan','loan','איך מבקשים השאלה?','How do I request a loan?','בעמוד המוצר בוחרים תאריכים, שעות וכמות ושולחים בקשה. המלאי נשמר בהתאם לכללי המוצר.','On the item page choose dates, times and quantity and submit a request. Inventory is held according to item rules.','["השאלה","בקשה","איסוף"]',20),
('faq-return','return','איך מחזירים מוצר?','How do I return an item?','מתאמים החזרה בצ׳אט או לפי הוראות הגמ״ח, ובסיום מנהל מורשה מסמן את היחידות כהוחזרו.','Coordinate the return in chat or according to the gmach instructions; an authorized manager marks units returned.','["החזרה","איחור"]',30),
('faq-support','support','מתי פונים לתמיכה?','When should I contact support?','כאשר לא ניתן לפתור בעיה מול הצד השני או כשיש בעיית חשבון, אבטחה או תקלה טכנית.','Contact support when an issue cannot be resolved with the other party, or for account, security or technical problems.','["תמיכה","חשבון","אבטחה"]',40);
