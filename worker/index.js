import { handleRemainingFeatures, runRemainingMaintenance, ensureRemainingFeaturesSchema } from "./remaining-features.js";
import { handleRequirementsExpansion, requirementsExpansionPreflight, runRequirementsExpansionMaintenance, ensureRequirementsExpansionSchema } from "./requirements-expansion.js";
import { handleLaunchReadiness, runLaunchReadinessMaintenance, ensureLaunchReadinessSchema } from "./launch-readiness.js";
import { handleDistributionCompletion, runDistributionCompletionMaintenance, ensureDistributionCompletionSchema, recordDistributionError } from "./distribution-completion.js";
import { handleNavigationAdmin, ensureNavigationAdminSchema } from "./navigation-admin.js";
import { handlePrivacyAvailability, ensurePrivacyAvailabilitySchema, checkAvailabilityRules } from "./privacy-availability.js";
import { handlePrivacyPurge, runPrivacyPurgeMaintenance, ensurePrivacyPurgeSchema } from "./privacy-purge.js";
import { handleCommunityChat, runCommunityChatMaintenance, ensureCommunityChatSchema } from "./community-chat.js";
import { handleFinalFeatures, runFinalMaintenance, ensureFinalFeaturesSchema } from "./final-features.js";
import { platformPreflight, handlePlatformCompletionApi, runPlatformCompletionMaintenance, sessionMetadata, ensurePlatformCompletionSchema, recordSecurityFailure } from "./platform-completion.js";
const SESSION_COOKIE = "gmach_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Keep PBKDF2 within the Cloudflare Workers CPU budget. Existing production
// accounts and the seeded administrator already use this compatible cost.
const PASSWORD_ITERATIONS = 100000;
const DEFAULT_FROM_EMAIL = "Gmach Berega <onboarding@resend.dev>";
const DEFAULT_SUPPORT_EMAIL = "netanelhirsh@gmail.com";
const MAX_JSON_BYTES = 32 * 1024;
const TERMS_VERSION = "2026-09-24";
const PRIVACY_VERSION = "2026-09-24";
const PRODUCTION_PLATFORM_SQL = "PRAGMA foreign_keys = ON;\n\n-- Production platform expansion. Existing columns and rows are preserved.\nALTER TABLE users ADD COLUMN address_cipher TEXT;\nALTER TABLE users ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'he' CHECK (preferred_language IN ('he','en'));\nALTER TABLE users ADD COLUMN deletion_requested_at TEXT;\nALTER TABLE users ADD COLUMN deleted_at TEXT;\nALTER TABLE users ADD COLUMN operational_emails_accepted INTEGER NOT NULL DEFAULT 1 CHECK (operational_emails_accepted IN (0,1));\nALTER TABLE users ADD COLUMN community_emails_accepted INTEGER NOT NULL DEFAULT 0 CHECK (community_emails_accepted IN (0,1));\n\nALTER TABLE organizations ADD COLUMN logo_url TEXT;\nALTER TABLE organizations ADD COLUMN publish_at TEXT;\nALTER TABLE organizations ADD COLUMN temporarily_closed INTEGER NOT NULL DEFAULT 0 CHECK (temporarily_closed IN (0,1));\nALTER TABLE organizations ADD COLUMN reopens_at TEXT;\nALTER TABLE organizations ADD COLUMN deletion_requested_at TEXT;\nALTER TABLE organizations ADD COLUMN deleted_at TEXT;\nALTER TABLE organizations ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'private';\n\nALTER TABLE items ADD COLUMN publish_at TEXT;\nALTER TABLE items ADD COLUMN deposit_amount REAL;\nALTER TABLE items ADD COLUMN max_per_user INTEGER;\nALTER TABLE items ADD COLUMN preparation_minutes INTEGER NOT NULL DEFAULT 0;\nALTER TABLE items ADD COLUMN max_loan_days INTEGER;\nALTER TABLE items ADD COLUMN service_radius_km REAL;\nALTER TABLE items ADD COLUMN serial_prefix TEXT;\nALTER TABLE items ADD COLUMN deleted_at TEXT;\nALTER TABLE items ADD COLUMN condition_detail TEXT;\n\nALTER TABLE loan_requests ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'inventory_held';\nALTER TABLE loan_requests ADD COLUMN pickup_window_start TEXT;\nALTER TABLE loan_requests ADD COLUMN pickup_window_end TEXT;\nALTER TABLE loan_requests ADD COLUMN proposed_from TEXT;\nALTER TABLE loan_requests ADD COLUMN proposed_until TEXT;\nALTER TABLE loan_requests ADD COLUMN extension_until TEXT;\nALTER TABLE loan_requests ADD COLUMN extension_status TEXT;\nALTER TABLE loan_requests ADD COLUMN branch_id TEXT;\nALTER TABLE loan_requests ADD COLUMN cancelled_by TEXT;\n\nALTER TABLE request_messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'text';\nALTER TABLE request_messages ADD COLUMN media_url TEXT;\nALTER TABLE request_messages ADD COLUMN deleted_at TEXT;\nALTER TABLE request_messages ADD COLUMN read_at TEXT;\n\nALTER TABLE reviews ADD COLUMN product_rating INTEGER CHECK (product_rating BETWEEN 1 AND 5);\nALTER TABLE reviews ADD COLUMN service_rating INTEGER CHECK (service_rating BETWEEN 1 AND 5);\nALTER TABLE reviews ADD COLUMN updated_at TEXT;\nALTER TABLE reviews ADD COLUMN helpful_count INTEGER NOT NULL DEFAULT 0;\n\nALTER TABLE help_requests ADD COLUMN requested_from TEXT;\nALTER TABLE help_requests ADD COLUMN requested_until TEXT;\nALTER TABLE help_requests ADD COLUMN distance_km REAL;\nALTER TABLE help_requests ADD COLUMN selected_response_id TEXT;\n\nCREATE TABLE categories (\n  id TEXT PRIMARY KEY,\n  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,\n  name_he TEXT NOT NULL,\n  name_en TEXT,\n  icon TEXT,\n  image_url TEXT,\n  synonyms_json TEXT NOT NULL DEFAULT '[]',\n  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','pending')),\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE organization_categories (\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,\n  PRIMARY KEY (organization_id, category_id)\n);\n\nCREATE TABLE item_categories (\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,\n  PRIMARY KEY (item_id, category_id)\n);\n\nCREATE TABLE category_suggestions (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,\n  suggested_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  parent_category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,\n  name TEXT NOT NULL,\n  description TEXT,\n  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  reviewed_at TEXT\n);\n\nCREATE TABLE organization_branches (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  address TEXT NOT NULL,\n  city TEXT NOT NULL,\n  latitude REAL,\n  longitude REAL,\n  phone TEXT,\n  hours_json TEXT NOT NULL DEFAULT '{}',\n  inventory_mode TEXT NOT NULL DEFAULT 'separate' CHECK (inventory_mode IN ('separate','shared','hybrid')),\n  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','temporarily_closed','archived')),\n  reopens_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE organization_members (\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  role TEXT NOT NULL CHECK (role IN ('owner','requests','inventory','reports')),\n  branch_scope_json TEXT NOT NULL DEFAULT '[]',\n  category_scope_json TEXT NOT NULL DEFAULT '[]',\n  expires_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (organization_id, user_id)\n);\n\nCREATE TABLE organization_invitations (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  token_hash TEXT NOT NULL UNIQUE,\n  role TEXT NOT NULL CHECK (role IN ('owner','requests','inventory','reports')),\n  branch_scope_json TEXT NOT NULL DEFAULT '[]',\n  category_scope_json TEXT NOT NULL DEFAULT '[]',\n  message TEXT,\n  invited_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  accepted_by TEXT REFERENCES users(id) ON DELETE SET NULL,\n  expires_at TEXT NOT NULL,\n  accepted_at TEXT,\n  cancelled_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE item_units (\n  id TEXT PRIMARY KEY,\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,\n  serial_number TEXT NOT NULL UNIQUE,\n  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available','held','loaned','repair','inactive','retired')),\n  condition TEXT NOT NULL,\n  retired_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE retired_serials (\n  serial_number TEXT PRIMARY KEY,\n  item_unit_id TEXT,\n  retired_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE loan_unit_assignments (\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE RESTRICT,\n  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  returned_at TEXT,\n  PRIMARY KEY (request_id, unit_id)\n);\n\nCREATE TABLE loan_status_events (\n  id TEXT PRIMARY KEY,\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  status TEXT NOT NULL,\n  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  note TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE availability_rules (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  branch_id TEXT REFERENCES organization_branches(id) ON DELETE CASCADE,\n  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,\n  rule_type TEXT NOT NULL CHECK (rule_type IN ('weekly_window','closure','preparation','advance_limit')),\n  rule_json TEXT NOT NULL,\n  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE user_blocks (\n  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  effective_after_request_id TEXT REFERENCES loan_requests(id) ON DELETE SET NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (blocker_id, blocked_id),\n  CHECK (blocker_id <> blocked_id)\n);\n\nCREATE TABLE notification_preferences (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  notification_type TEXT NOT NULL,\n  in_app INTEGER NOT NULL DEFAULT 1 CHECK (in_app IN (0,1)),\n  email INTEGER NOT NULL DEFAULT 0 CHECK (email IN (0,1)),\n  push INTEGER NOT NULL DEFAULT 0 CHECK (push IN (0,1)),\n  digest TEXT NOT NULL DEFAULT 'immediate' CHECK (digest IN ('immediate','daily')),\n  quiet_start TEXT,\n  quiet_end TEXT,\n  PRIMARY KEY (user_id, notification_type)\n);\n\nCREATE TABLE push_subscriptions (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  endpoint TEXT NOT NULL UNIQUE,\n  p256dh TEXT NOT NULL,\n  auth TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE saved_searches (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  name TEXT NOT NULL,\n  filters_json TEXT NOT NULL,\n  notify INTEGER NOT NULL DEFAULT 1 CHECK (notify IN (0,1)),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE saved_categories (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (user_id, category_id)\n);\n\nCREATE TABLE support_tickets (\n  id TEXT PRIMARY KEY,\n  ticket_number INTEGER NOT NULL UNIQUE,\n  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  name TEXT NOT NULL,\n  email TEXT NOT NULL,\n  subject TEXT NOT NULL,\n  message TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','waiting','closed','reopened')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE system_alerts (\n  id TEXT PRIMARY KEY,\n  alert_type TEXT NOT NULL,\n  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),\n  details_json TEXT NOT NULL DEFAULT '{}',\n  resolved_at TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nINSERT INTO categories(id,parent_id,name_he,name_en,icon,sort_order) VALUES\n('events',NULL,'אירועים','Events','sparkles',10),('tools',NULL,'כלי עבודה','Tools','tools',20),('babies',NULL,'תינוקות','Babies','baby',30),('medical',NULL,'רפואה ושיקום','Medical & rehabilitation','medical',40),('travel',NULL,'טיולים','Travel','travel',50),('home',NULL,'בית ואירוח','Home & hosting','home',60),('community',NULL,'קהילה וכללי','Community','heart',70),\n('events-decor','events','עיצוב וקישוט','Decorations','sparkles',11),('events-tables','events','שולחנות וכיסאות','Tables & chairs','chair',12),('events-lighting','events','תאורה והגברה','Lighting & sound','light',13),('events-serving','events','כלי הגשה','Serving ware','dish',14),('events-canopies','events','חופות וסוכות','Canopies','tent',15),('events-textile','events','מפות וטקסטיל','Tablecloths & textiles','textile',16),\n('tools-electric','tools','כלי עבודה חשמליים','Power tools','drill',21),('tools-hand','tools','כלי עבודה ידניים','Hand tools','hammer',22),('tools-garden','tools','כלי גינה','Garden tools','garden',23),('tools-ladders','tools','סולמות ופיגומים','Ladders','ladder',24),('tools-cleaning','tools','ציוד ניקוי','Cleaning equipment','clean',25),\n('babies-strollers','babies','עגלות וטיולונים','Strollers','stroller',31),('babies-car-seats','babies','מושבי בטיחות','Car seats','seat',32),('babies-cribs','babies','מיטות ולולים','Cribs & playpens','crib',33),('babies-feeding','babies','האכלה והנקה','Feeding','bottle',34),('babies-bathing','babies','רחצה והחתלה','Bathing & changing','bath',35),('babies-carriers','babies','מנשאים','Baby carriers','carrier',36),\n('medical-mobility','medical','ניידות וכיסאות גלגלים','Mobility','wheelchair',41),('medical-walking','medical','הליכונים וקביים','Walkers & crutches','crutch',42),('medical-homecare','medical','ציוד טיפול ביתי','Home care','medical',43),('medical-orthopedic','medical','ציוד אורתופדי','Orthopedic','orthopedic',44),('medical-recovery','medical','ציוד החלמה','Recovery','recovery',45),\n('travel-camping','travel','קמפינג','Camping','tent',51),('travel-hiking','travel','טיולים והליכה','Hiking','backpack',52),('travel-luggage','travel','מזוודות ותיקים','Luggage','luggage',53),('travel-coolers','travel','צידניות וציוד אוכל','Coolers','cooler',54),('travel-beach','travel','ים ובריכה','Beach & pool','beach',55),\n('home-appliances','home','מכשירי חשמל','Appliances','appliance',61),('home-furniture','home','ריהוט מתקפל','Folding furniture','chair',62),('home-kitchen','home','מטבח ואפייה','Kitchen & baking','kitchen',63),('home-bedding','home','אירוח ולינה','Hosting & bedding','bed',64),('home-moving','home','מעבר דירה','Moving','box',65),\n('community-books','community','ספרים ולימוד','Books & study','book',71),('community-religious','community','תשמישי קדושה','Religious items','book',72),('community-accessibility','community','נגישות','Accessibility','accessibility',73),('community-clothing','community','ביגוד ותחפושות','Clothing & costumes','clothing',74),('community-sports','community','ספורט ופנאי','Sports & leisure','sport',75),('community-other','community','אחר','Other','box',99);\n\nCREATE INDEX categories_parent_idx ON categories(parent_id,status,sort_order);\nCREATE INDEX branches_org_idx ON organization_branches(organization_id,status);\nCREATE INDEX members_user_idx ON organization_members(user_id,role);\nCREATE INDEX units_item_status_idx ON item_units(item_id,status);\nCREATE INDEX units_branch_status_idx ON item_units(branch_id,status);\nCREATE INDEX status_events_request_idx ON loan_status_events(request_id,created_at);\nCREATE INDEX availability_lookup_idx ON availability_rules(organization_id,branch_id,item_id,active);\nCREATE INDEX support_user_idx ON support_tickets(user_id,updated_at DESC);\nCREATE INDEX alerts_open_idx ON system_alerts(resolved_at,severity,created_at DESC);\n\n-- Existing gmachim and products are immediately publishable. Verification is no longer a public trust signal.\nUPDATE organizations SET status='approved', verified=0 WHERE status='pending';\nUPDATE items SET status='active' WHERE status='pending';\n";
const COMPLETE_PLATFORM_SQL = "PRAGMA foreign_keys = ON;\n\n-- User privacy, device security and reversible deletion.\nALTER TABLE sessions ADD COLUMN device_label TEXT;\nALTER TABLE sessions ADD COLUMN ip_hash TEXT;\nALTER TABLE sessions ADD COLUMN last_seen_at TEXT;\nALTER TABLE users ADD COLUMN terms_accepted_at TEXT;\nALTER TABLE users ADD COLUMN privacy_accepted_at TEXT;\n\nCREATE TABLE user_addresses (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  label TEXT NOT NULL,\n  address_cipher TEXT NOT NULL,\n  city TEXT NOT NULL,\n  latitude REAL,\n  longitude REAL,\n  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\n-- Loan workflow: pickup alternatives, extensions, recurring dates and waitlist offers.\nCREATE TABLE loan_date_ranges (\n  id TEXT PRIMARY KEY,\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  requested_from TEXT NOT NULL,\n  requested_until TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'held' CHECK (status IN ('held','approved','declined','cancelled','collected','returned')),\n  CHECK (requested_until > requested_from)\n);\n\nCREATE TABLE pickup_proposals (\n  id TEXT PRIMARY KEY,\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  starts_at TEXT NOT NULL,\n  ends_at TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','expired')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  CHECK (ends_at > starts_at)\n);\n\nCREATE TABLE waitlist_offers (\n  id TEXT PRIMARY KEY,\n  waitlist_entry_id TEXT NOT NULL REFERENCES waitlist_entries(id) ON DELETE CASCADE,\n  offered_at TEXT NOT NULL,\n  expires_at TEXT NOT NULL,\n  accepted_at TEXT,\n  declined_at TEXT\n);\n\n-- Reviews and moderation.\nCREATE TABLE review_helpful_votes (\n  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (review_id,user_id)\n);\n\nCREATE TABLE review_reports (\n  id TEXT PRIMARY KEY,\n  review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,\n  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  reason TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','removed')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  UNIQUE (review_id,reporter_id)\n);\n\n-- Community-board offers.\nCREATE TABLE help_request_offers (\n  id TEXT PRIMARY KEY,\n  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,\n  responder_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  item_id TEXT REFERENCES items(id) ON DELETE SET NULL,\n  message TEXT,\n  status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered','selected','withdrawn','declined')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\n-- Saved entities and product comparison.\nCREATE TABLE saved_help_requests (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (user_id,help_request_id)\n);\n\nCREATE TABLE product_comparisons (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY (user_id,item_id)\n);\n\n-- Support conversation and CMS publishing workflow.\nCREATE TABLE support_ticket_messages (\n  id TEXT PRIMARY KEY,\n  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,\n  sender_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  body TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE managed_content (\n  content_key TEXT PRIMARY KEY,\n  locale TEXT NOT NULL DEFAULT 'he',\n  draft_json TEXT NOT NULL DEFAULT '{}',\n  published_json TEXT NOT NULL DEFAULT '{}',\n  publish_at TEXT,\n  version INTEGER NOT NULL DEFAULT 1,\n  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE TABLE platform_closures (\n  id TEXT PRIMARY KEY,\n  closure_type TEXT NOT NULL CHECK (closure_type IN ('manual','holiday','maintenance')),\n  title_he TEXT NOT NULL,\n  title_en TEXT,\n  starts_at TEXT NOT NULL,\n  ends_at TEXT NOT NULL,\n  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),\n  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  CHECK (ends_at > starts_at)\n);\n\nCREATE TABLE security_events (\n  id TEXT PRIMARY KEY,\n  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  event_type TEXT NOT NULL,\n  severity TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),\n  ip_hash TEXT,\n  device_label TEXT,\n  details_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n);\n\nCREATE INDEX user_addresses_user_idx ON user_addresses(user_id,is_default);\nCREATE INDEX loan_date_ranges_request_idx ON loan_date_ranges(request_id,status);\nCREATE INDEX pickup_proposals_request_idx ON pickup_proposals(request_id,status,created_at DESC);\nCREATE INDEX waitlist_offers_expiry_idx ON waitlist_offers(expires_at,accepted_at,declined_at);\nCREATE INDEX help_offers_request_idx ON help_request_offers(help_request_id,status,created_at);\nCREATE INDEX support_messages_ticket_idx ON support_ticket_messages(ticket_id,created_at);\nCREATE INDEX closures_time_idx ON platform_closures(active,starts_at,ends_at);\nCREATE INDEX security_events_time_idx ON security_events(severity,created_at DESC);\n";
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const CATEGORIES = new Set(["אירועים", "כלי עבודה", "תינוקות", "רפואה", "טיולים", "בית ואירוח", "כללי"]);
const CONDITIONS = new Set(["כמו חדש", "מצוין", "טוב"]);
const PRODUCT_CONDITIONS = new Set(["חדש","כמו חדש","מצב טוב","מצב סביר","בלאי נראה לעין","מצוין","טוב"]);
function normalizeProductCondition(value){
  const detail=String(value||"").trim();
  if(!PRODUCT_CONDITIONS.has(detail)) throw new HttpError(400,"נא לבחור מצב פריט תקין");
  const base=detail==="חדש"||detail==="כמו חדש"?"כמו חדש":detail==="מצוין"?"מצוין":"טוב";
  return {base,detail};
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}


function escapeMeta(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
async function serveSeoEntityPage(request,env,url){
  let kind,id,row,title,description,image,noindex=false;
  let m=url.pathname.match(/^\/item\/([^/]+)$/);
  if(m){
    kind="item";id=decodeURIComponent(m[1]);
    row=await env.DB.prepare("SELECT i.id,i.title,i.description,i.image_urls,i.status,i.deleted_at,o.name AS organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?").bind(id).first();
    if(!row||row.deleted_at) return null;
    title=row.title+" | גמ״ח ברגע";description=String(row.description||("השאלת "+row.title+" בחינם דרך "+row.organization_name)).slice(0,180);
    image=parseJsonArray(row.image_urls)[0]||null;noindex=row.status!=="active";
  }else if((m=url.pathname.match(/^\/gmach\/([^/]+)$/))){
    kind="organization";id=decodeURIComponent(m[1]);
    row=await env.DB.prepare("SELECT o.id,o.name,o.description,o.logo_url,o.is_hidden,o.deleted_at,EXISTS(SELECT 1 FROM items i WHERE i.organization_id=o.id AND i.status='active' AND i.deleted_at IS NULL) AS has_items FROM organizations o WHERE o.id=?").bind(id).first();
    if(!row||row.deleted_at)return null;
    title=row.name+" | גמ״ח ברגע";description=String(row.description||("עמוד "+row.name+" בגמ״ח ברגע")).slice(0,180);
    image=row.logo_url||null;noindex=Boolean(row.is_hidden||!row.has_items);
  }else if((m=url.pathname.match(/^\/category\/([^/]+)$/))){
    kind="category";id=decodeURIComponent(m[1]);
    row=await env.DB.prepare("SELECT id,name_he,name_en,image_url,status FROM categories WHERE id=? OR name_he=? LIMIT 1").bind(id,id).first();
    if(!row)return null;
    title=(row.name_he||id)+" להשאלה בחינם | גמ״ח ברגע";description="מצאו "+(row.name_he||id)+" להשאלה בחינם מגמ״חים ואנשים טובים ברחבי ישראל.";
    image=row.image_url||null;noindex=row.status!=="active";
  }else if((m=url.pathname.match(/^\/area\/([^/]+)$/))){
    kind="area";id=decodeURIComponent(m[1]);
    const exists=await env.DB.prepare("SELECT COUNT(*) AS count FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.status='active' AND i.deleted_at IS NULL AND o.is_hidden=0 AND o.deleted_at IS NULL AND (i.city=? OR o.city=?)").bind(id,id).first();
    if(!Number(exists?.count||0))return null;
    title="גמ״חים וציוד להשאלה ב"+id+" | גמ״ח ברגע";description="מצאו ציוד להשאלה בחינם וגמ״חים פעילים ב"+id+".";
    image=null;noindex=false;
  }else return null;
  const assetUrl=new URL("/",url.origin);
  const assetResponse=await env.ASSETS.fetch(new Request(assetUrl.toString(),{method:"GET",headers:request.headers}));
  if(!assetResponse.ok)return assetResponse;
  let html=await assetResponse.text(),canonical=url.origin+"/"+({item:"item/",organization:"gmach/",category:"category/",area:"area/"}[kind])+encodeURIComponent(id);
  const absoluteImage=image?new URL(image,url.origin).toString():null;
  html=html.replace(/<title>[\s\S]*?<\/title>/i,"<title>"+escapeMeta(title)+"</title>");
  html=html.replace(/<meta name="description"[^>]*>/i,'<meta name="description" content="'+escapeMeta(description)+'">');
  const meta=[
    '<base href="/">',
    '<link rel="canonical" href="'+escapeMeta(canonical)+'">',
    '<meta property="og:type" content="'+(kind==="item"?"product":"website")+'">',
    '<meta property="og:title" content="'+escapeMeta(title)+'">',
    '<meta property="og:description" content="'+escapeMeta(description)+'">',
    '<meta property="og:url" content="'+escapeMeta(canonical)+'">',
    absoluteImage?'<meta property="og:image" content="'+escapeMeta(absoluteImage)+'">':"",
    '<meta name="twitter:card" content="'+(absoluteImage?"summary_large_image":"summary")+'">',
    noindex?'<meta name="robots" content="noindex,nofollow">':""
  ].filter(Boolean).join("\n");
  html=html.replace("<head>","<head>\n"+meta);
  html=html.replace("<body","<body data-seo-route=\""+kind+":"+escapeMeta(id)+"\"");
  return new Response(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"public, max-age=300, stale-while-revalidate=600"}});
}

async function bulkInventoryAction(request,env,organizationId){
  const user=await requireUser(request,env),body=await readJson(request);
  const access=await env.DB.prepare("SELECT o.owner_id,m.role FROM organizations o LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE o.id=?").bind(user.id,organizationId).first();
  if(!access||(access.owner_id!==user.id&&user.role!=="admin"&&!["owner","inventory"].includes(access.role)))throw new HttpError(403,"אין הרשאה לניהול המלאי");
  const ids=[...new Set((Array.isArray(body.itemIds)?body.itemIds:[]).map(String))].slice(0,200);if(!ids.length)throw new HttpError(400,"יש לבחור לפחות מוצר אחד");
  const allowed=new Set(["activate","deactivate","availability","quantity","category"]);if(!allowed.has(body.action))throw new HttpError(400,"פעולת המלאי אינה תקינה");
  let affected=0;
  for(const id of ids){
    const item=await env.DB.prepare("SELECT id FROM items WHERE id=? AND organization_id=? AND deleted_at IS NULL").bind(id,organizationId).first();if(!item)continue;
    if(body.action==="activate")affected+=(await env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run()).meta.changes||0;
    else if(body.action==="deactivate")affected+=(await env.DB.prepare("UPDATE items SET status='pending',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run()).meta.changes||0;
    else if(body.action==="availability"){const v=body.availability==="unavailable"?"unavailable":"available";affected+=(await env.DB.prepare("UPDATE items SET availability_status=?,updated_at=? WHERE id=?").bind(v,new Date().toISOString(),id).run()).meta.changes||0;}
    else if(body.action==="quantity"){const q=positiveInt(body.quantity,1,1,999,"כמות");affected+=(await env.DB.prepare("UPDATE items SET quantity=?,inventory_updated_at=?,updated_at=? WHERE id=?").bind(q,new Date().toISOString(),new Date().toISOString(),id).run()).meta.changes||0;}
    else {const cat=cleanText(body.category,2,80,"קטגוריה");affected+=(await env.DB.prepare("UPDATE items SET category=?,updated_at=? WHERE id=?").bind(cat,new Date().toISOString(),id).run()).meta.changes||0;}
  }
  const jobId=crypto.randomUUID();await env.DB.prepare("INSERT INTO bulk_inventory_jobs(id,organization_id,actor_id,action,payload_json,status,affected_count,completed_at) VALUES(?,?,?,?,?,'completed',?,?)").bind(jobId,organizationId,user.id,body.action,JSON.stringify(body).slice(0,4000),affected,new Date().toISOString()).run().catch(()=>{});
  return json({job:{id:jobId,affected,action:body.action}});
}
async function importItems(request,env){
  const user=await requireUser(request,env),body=await readJson(request),organizationId=cleanText(body.organizationId,1,100,"גמ״ח");
  const org=await env.DB.prepare("SELECT o.*,m.role member_role FROM organizations o LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE o.id=?").bind(user.id,organizationId).first();
  if(!org||(org.owner_id!==user.id&&user.role!=="admin"&&!["owner","inventory"].includes(org.member_role)))throw new HttpError(403,"אין הרשאה לייבא מוצרים לגמ״ח הזה");
  const rows=Array.isArray(body.items)?body.items.slice(0,500):[];if(!rows.length)throw new HttpError(400,"לא נמצאו שורות לייבוא");
  const created=[],errors=[];
  for(let n=0;n<rows.length;n++){const x=rows[n];try{
    const title=cleanText(x.title,2,120,"שם הפריט"),category=cleanText(x.category||org.primary_category||"כללי",2,80,"קטגוריה"),description=cleanText(x.description||("פריט "+title+" להשאלה"),10,1200,"תיאור"),condition=normalizeProductCondition(String(x.condition||"טוב")).base,quantity=positiveInt(x.quantity,1,1,999,"כמות"),id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO items(id,organization_id,title,category,description,condition,quantity,city,neighborhood,status,availability_status,is_free,icon,cover_color,inventory_updated_at) VALUES(?,?,?,?,?,?,?,?,?,'active','available',1,'box','#e6f2ef',?)").bind(id,organizationId,title,category,description,condition,quantity,cleanOptional(x.city,80)||org.city,cleanOptional(x.neighborhood,80)||org.neighborhood,new Date().toISOString()).run();created.push(id);
  }catch(e){errors.push({row:n+2,error:e.message||"שורה לא תקינה"})}}
  if(created.length)await env.DB.prepare("UPDATE organizations SET is_hidden=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),organizationId).run();
  return json({created,errors},created.length?201:400);
}


async function invalidatePublicSnapshotRoots(origin) {
  if (typeof caches === "undefined") return;
  const cache = caches.default;
  await Promise.all([
    "/api/items",
    "/api/categories",
    "/api/discovery"
  ].map(path => cache.delete(new Request(origin + path, { method:"GET", headers:{ "Accept":"application/json" } })).catch(() => false)));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname !== "/api/health") {
        const shabbat = israelShabbatState(new Date());
        if (shabbat.closed) {
          if (url.pathname.startsWith("/api/")) return withSecurityHeaders(json({ error:"האתר סגור כעת לכבוד השבת. שבת שלום.", shabbat:true },503));
          return withSecurityHeaders(shabbatClosedPage(shabbat));
        }
        const holiday = israelHolidayState(new Date());
        if (holiday.closed) {
          if (url.pathname.startsWith("/api/")) return withSecurityHeaders(json({ error:`האתר סגור כעת לכבוד ${holiday.title}. חג שמח.`, holiday:true, reopensAt:holiday.reopensAt },503));
          return withSecurityHeaders(platformClosedPage({message:`חג שמח — גמ״ח ברגע סגור כעת לכבוד ${holiday.title}`,endsAt:holiday.reopensAt}));
        }
        const closure = await activePlatformClosure(env, new Date());
        if (closure) {
          if (url.pathname.startsWith("/api/")) return withSecurityHeaders(json({ error:closure.message, closure:true, reopensAt:closure.endsAt },503));
          return withSecurityHeaders(platformClosedPage(closure));
        }
      }
      if (url.pathname.startsWith("/api/")) {
        const preflight = await platformPreflight(request, env, url);
        if (preflight) return withSecurityHeaders(preflight);
        const expansionPreflight = await requirementsExpansionPreflight(request, env, url);
        if (expansionPreflight) return withSecurityHeaders(expansionPreflight);
        const completionResponse = await handlePlatformCompletionApi(request, env, ctx, url);
        if (completionResponse) {
          if (!["GET","HEAD","OPTIONS"].includes(request.method) && completionResponse.ok) await invalidatePublicSnapshotRoots(url.origin);
          return withSecurityHeaders(completionResponse);
        }
        const publicSnapshotPolicy = request.method === "GET" ? ({
          "/api/items": { fresh:30, stale:86400 },
          "/api/categories": { fresh:1800, stale:86400 },
          "/api/discovery": { fresh:60, stale:86400 }
        })[url.pathname] : null;
        if (publicSnapshotPolicy && typeof caches !== "undefined") {
          const cache = caches.default;
          const cacheKey = new Request(url.toString(), { method:"GET", headers:{ "Accept":"application/json" } });
          const snapshot = await cache.match(cacheKey);
          if (snapshot) {
            const cachedAt = Date.parse(snapshot.headers.get("X-Data-Cached-At") || "");
            if (Number.isFinite(cachedAt) && Date.now() - cachedAt < publicSnapshotPolicy.fresh * 1000) {
              const headers = new Headers(snapshot.headers);
              headers.set("Cache-Control", `public, max-age=${publicSnapshotPolicy.fresh}`);
              headers.set("X-Data-Cache", "HIT");
              return withSecurityHeaders(new Response(snapshot.body, { status:snapshot.status, statusText:snapshot.statusText, headers }));
            }
          }
          try {
            const response = await routeApi(request, env, ctx, url);
            if (response.ok) {
              const cachedAt = new Date().toISOString();
              const storedHeaders = new Headers(response.headers);
              storedHeaders.set("Cache-Control", `public, max-age=${publicSnapshotPolicy.stale}`);
              storedHeaders.set("X-Data-Cached-At", cachedAt);
              const stored = new Response(response.clone().body, { status:response.status, statusText:response.statusText, headers:storedHeaders });
              try { ctx.waitUntil(cache.put(cacheKey, stored)); } catch {}
              const liveHeaders = new Headers(response.headers);
              liveHeaders.set("Cache-Control", `public, max-age=${publicSnapshotPolicy.fresh}`);
              liveHeaders.set("X-Data-Cache", "MISS");
              return withSecurityHeaders(new Response(response.body, { status:response.status, statusText:response.statusText, headers:liveHeaders }));
            }
            return withSecurityHeaders(response);
          } catch (error) {
            if (snapshot) {
              const headers = new Headers(snapshot.headers);
              headers.set("Cache-Control", "no-store");
              headers.set("X-Data-Stale", "1");
              headers.set("X-Data-Cache", "STALE");
              headers.set("Warning", '110 - "Response is a cached snapshot because the live database is temporarily unavailable"');
              return withSecurityHeaders(new Response(snapshot.body, { status:snapshot.status, statusText:snapshot.statusText, headers }));
            }
            throw error;
          }
        }
        const response = await routeApi(request, env, ctx, url);
        if (!["GET","HEAD","OPTIONS"].includes(request.method) && response.ok) await invalidatePublicSnapshotRoots(url.origin);
        return withSecurityHeaders(response);
      }
      if (url.pathname === "/sitemap.xml") {
        const response = await handleFinalFeatures(request, env, ctx, url);
        return withSecurityHeaders(response || new Response("Not found",{status:404}));
      }
      if (url.pathname === "/robots.txt") {
        const body="User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /#/dashboard\nDisallow: /#/admin\nSitemap: "+url.origin+"/sitemap.xml\n";
        return withSecurityHeaders(new Response(body,{headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"public, max-age=3600"}}));
      }
      if (url.pathname.startsWith("/media/")) {
        const response = await serveMedia(request, env, url);
        return withSecurityHeaders(response);
      }
      const response = await env.ASSETS.fetch(request);
      return withSecurityHeaders(response);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const requestId = crypto.randomUUID();
      if (status >= 500) { console.error("Request failed", { requestId, path: url.pathname, error }); try { ctx.waitUntil(recordDistributionError(env,request,error,requestId)); } catch {} }
      return withSecurityHeaders(json({ error: error instanceof HttpError ? error.message : "אירעה תקלה זמנית בשרת", requestId }, status, { "X-Request-Id": requestId }));
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async()=>{
      // Schema reconciliation is intentionally daily. Running every ensure
      // function every few minutes was a large, unnecessary source of D1 reads.
      if (event.cron === "17 2 * * *") {
        await ensureAdvancedBookingSchema(env);
        await ensureProductionHardeningSchema(env);
        await ensureCompletePlatformSchema(env);
        await ensureReviewBranchRatingSchema(env);
        await Promise.all([ensurePlatformCompletionSchema(env),ensureFinalFeaturesSchema(env),ensureRemainingFeaturesSchema(env),ensureRequirementsExpansionSchema(env),ensureLaunchReadinessSchema(env),ensureDistributionCompletionSchema(env),ensureNavigationAdminSchema(env),ensurePrivacyAvailabilitySchema(env),ensurePrivacyPurgeSchema(env),ensureCommunityChatSchema(env)]);
      }
      await Promise.all([runScheduledMaintenance(env), runPlatformCompletionMaintenance(env), runFinalMaintenance(env), runRemainingMaintenance(env), runRequirementsExpansionMaintenance(env), runLaunchReadinessMaintenance(env), runDistributionCompletionMaintenance(env), runPrivacyPurgeMaintenance(env), runCommunityChatMaintenance(env)]);
    })());
  }
};


function israelDateParts(date) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit",weekday:"short"}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
}
function gregorianToJdn(y,m,d) {
  const a=Math.floor((14-m)/12),yy=y+4800-a,mm=m+12*a-3;
  return d+Math.floor((153*mm+2)/5)+365*yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)-32045;
}
function hebrewLeap(y){ return ((7*y+1)%19)<7; }
function hebrewYearMonths(y){ return hebrewLeap(y)?13:12; }
function hebrewDelay1(y){ const months=Math.floor((235*y-234)/19),parts=12084+13753*months,day=months*29+Math.floor(parts/25920); return ((3*(day+1))%7)<3?day+1:day; }
function hebrewDelay2(y){ const last=hebrewDelay1(y-1),present=hebrewDelay1(y),next=hebrewDelay1(y+1); return next-present===356?2:present-last===382?1:0; }
function hebrewNewYear(y){ return 347995+hebrewDelay1(y)+hebrewDelay2(y); }
function hebrewYearDays(y){ return hebrewNewYear(y+1)-hebrewNewYear(y); }
function hebrewMonthDays(y,m){
  if([2,4,6,10,13].includes(m)) return 29;
  if(m===12&&!hebrewLeap(y)) return 29;
  if(m===8&&hebrewYearDays(y)%10!==5) return 29;
  if(m===9&&hebrewYearDays(y)%10===3) return 29;
  return 30;
}
function hebrewToJdn(y,m,d){
  let days=d;
  if(m<7){ for(let mm=7;mm<=hebrewYearMonths(y);mm++) days+=hebrewMonthDays(y,mm); for(let mm=1;mm<m;mm++) days+=hebrewMonthDays(y,mm); }
  else for(let mm=7;mm<m;mm++) days+=hebrewMonthDays(y,mm);
  return hebrewNewYear(y)+days-1;
}
function passoverGregorianDate(gYear){
  let hy=gYear+3760, jdn=hebrewToJdn(hy,1,15);
  const epoch=new Date(Date.UTC(1970,0,1)), epochJdn=gregorianToJdn(1970,1,1);
  return new Date(epoch.getTime()+(jdn-epochJdn)*86400000);
}
function israelUtcForLocal(y,m,d,hour,minute){
  let guess=Date.UTC(y,m-1,d,hour,minute);
  const fmt=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
  for(let i=0;i<3;i++){
    const p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
    const shown=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute));
    guess+=Date.UTC(y,m-1,d,hour,minute)-shown;
  }
  return new Date(guess);
}
function shabbatTimesForFriday(y,m,d){
  const date=new Date(Date.UTC(y,m-1,d)), jan1=new Date(Date.UTC(y,0,1)), n=Math.floor((date-jan1)/86400000)+1;
  const gamma=2*Math.PI/365*(n-1),eq=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
  const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
  const lat=31.778*Math.PI/180,ha=Math.acos(Math.cos(90.833*Math.PI/180)/(Math.cos(lat)*Math.cos(decl))-Math.tan(lat)*Math.tan(decl))*180/Math.PI;
  // NOAA solar-noon formula: sunset uses longitude minus the positive hour
  // angle. Using longitude plus the angle closes the site early Friday.
  const sunsetMinutes=720-4*(35.235-ha)-eq;
  const noon=israelUtcForLocal(y,m,d,12,0), noonParts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(noon);
  const offsetMinutes=(noon.getTime()-Date.UTC(y,m-1,d,12,0))/-60000;
  const sunsetLocal=sunsetMinutes+offsetMinutes, closeLocal=sunsetLocal-20;
  const close=israelUtcForLocal(y,m,d,Math.floor(closeLocal/60),Math.round(closeLocal%60));
  const sat=new Date(Date.UTC(y,m-1,d+1)), sp=israelDateParts(sat);
  const satN=Math.floor((sat-jan1)/86400000)+1,g2=2*Math.PI/365*(satN-1),eq2=229.18*(0.000075+0.001868*Math.cos(g2)-0.032077*Math.sin(g2)-0.014615*Math.cos(2*g2)-0.040849*Math.sin(2*g2));
  const dec2=0.006918-0.399912*Math.cos(g2)+0.070257*Math.sin(g2)-0.006758*Math.cos(2*g2)+0.000907*Math.sin(2*g2)-0.002697*Math.cos(3*g2)+0.00148*Math.sin(3*g2);
  const ha2=Math.acos(Math.cos(98.5*Math.PI/180)/(Math.cos(lat)*Math.cos(dec2))-Math.tan(lat)*Math.tan(dec2))*180/Math.PI;
  const nightMinutes=720-4*(35.235-ha2)-eq2+offsetMinutes;
  const open=israelUtcForLocal(Number(sp.year),Number(sp.month),Number(sp.day),Math.floor(nightMinutes/60),Math.round(nightMinutes%60));
  return {close,open};
}
function israelShabbatState(now){
  const p=israelDateParts(now), y=Number(p.year),m=Number(p.month),d=Number(p.day);
  const dayIndex={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[p.weekday];
  let friday=new Date(Date.UTC(y,m-1,d+(5-dayIndex)));
  if(dayIndex===6) friday=new Date(Date.UTC(y,m-1,d-1));
  const fp=israelDateParts(friday), times=shabbatTimesForFriday(Number(fp.year),Number(fp.month),Number(fp.day));
  return {closed:now>=times.close&&now<times.open,reopensAt:times.open.toISOString()};
}
const ISRAEL_HOLIDAYS=[
  {month:"Tishri",day:1,duration:2,title:"ראש השנה"},
  {month:"Tishri",day:10,duration:1,title:"יום הכיפורים"},
  {month:"Tishri",day:15,duration:1,title:"חג הסוכות"},
  {month:"Tishri",day:22,duration:1,title:"שמיני עצרת ושמחת תורה"},
  {month:"Nisan",day:15,duration:1,title:"חג הפסח"},
  {month:"Nisan",day:21,duration:1,title:"שביעי של פסח"},
  {month:"Sivan",day:6,duration:1,title:"חג השבועות"}
];
function hebrewDateParts(date){
  const parts=new Intl.DateTimeFormat("en-u-ca-hebrew",{timeZone:"Asia/Jerusalem",year:"numeric",month:"long",day:"numeric"}).formatToParts(date);
  return Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
}
function israelHolidayState(now){
  const today=israelDateParts(now), localNoon=israelUtcForLocal(Number(today.year),Number(today.month),Number(today.day),12,0);
  for(let offset=-8;offset<=1;offset++){
    const candidate=new Date(localNoon.getTime()+offset*86400000), hp=hebrewDateParts(candidate);
    for(const holiday of ISRAEL_HOLIDAYS){
      if(hp.month!==holiday.month||Number(hp.day)!==holiday.day)continue;
      const startParts=israelDateParts(candidate),eve=new Date(Date.UTC(Number(startParts.year),Number(startParts.month)-1,Number(startParts.day)-1));
      const eveParts=israelDateParts(eve),times=shabbatTimesForFriday(Number(eveParts.year),Number(eveParts.month),Number(eveParts.day));
      let reopens=times.open;
      if(holiday.duration>1){
        const lastEve=new Date(eve.getTime()+(holiday.duration-1)*86400000),lp=israelDateParts(lastEve);
        reopens=shabbatTimesForFriday(Number(lp.year),Number(lp.month),Number(lp.day)).open;
      }
      if(now>=times.close&&now<reopens)return {closed:true,title:holiday.title,reopensAt:reopens.toISOString()};
    }
  }
  return {closed:false};
}
function shabbatClosedPage(state){
  const reopens=new Intl.DateTimeFormat("he-IL",{timeZone:"Asia/Jerusalem",dateStyle:"full",timeStyle:"short"}).format(new Date(state.reopensAt));
  const html=`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>גמ״ח ברגע - שבת שלום</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font-family:Arial,sans-serif;color:#123c46;text-align:center"><main style="max-width:680px;padding:40px 24px"><img src="/gmach-berega-logo.jpg" alt="גמ״ח ברגע" style="max-width:260px;width:70%;height:auto"><h1 style="font-size:42px;margin:20px 0">שבת שלום</h1><p style="font-size:22px;line-height:1.7">גמ״ח ברגע סגור כעת לכבוד השבת.</p><p style="font-size:18px;line-height:1.7">האתר ישוב לפעילות בעזרת ה׳ בצאת השבת, ב-${escapeHtml(reopens)}.</p><p style="line-height:1.7">כל המידע, הבקשות וההשאלות שכבר נשמרו נשארים שמורים בזמן הסגירה.</p><p><a href="mailto:${escapeHtml(DEFAULT_SUPPORT_EMAIL)}" style="color:#123c46;font-weight:700">פנייה לתמיכה</a></p></main></body></html>`;
  return new Response(html,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Retry-After":"900"}});
}

async function activePlatformClosure(env,now){
  try{
    const iso=now.toISOString();
    const row=await env.DB.prepare("SELECT title_he,ends_at FROM platform_closures WHERE active=1 AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC LIMIT 1").bind(iso,iso).first();
    if(row)return {message:row.title_he||"האתר סגור זמנית",endsAt:row.ends_at};
    const configured=JSON.parse(String(env.JEWISH_HOLIDAY_CLOSURES_JSON||"[]"));
    const item=Array.isArray(configured)?configured.find(entry=>iso>=entry.startsAt&&iso<entry.endsAt):null;
    return item?{message:item.message||"חג שמח — האתר סגור כעת לכבוד החג",endsAt:item.endsAt}:null;
  }catch{return null;}
}
function platformClosedPage(closure){const reopens=new Intl.DateTimeFormat("he-IL",{timeZone:"Asia/Jerusalem",dateStyle:"full",timeStyle:"short"}).format(new Date(closure.endsAt));return new Response(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>גמ״ח ברגע - סגור זמנית</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;font-family:Arial,sans-serif;color:#123c46;text-align:center"><main style="max-width:680px;padding:40px 24px"><img src="/gmach-berega-logo.jpg" alt="גמ״ח ברגע" style="max-width:260px"><h1>${escapeHtml(closure.message)}</h1><p style="font-size:20px">האתר ישוב לפעילות ב-${escapeHtml(reopens)}</p><p style="line-height:1.7">המידע, הבקשות וההשאלות שכבר נשמרו במערכת נשארים שמורים בזמן התחזוקה.</p><p><a href="mailto:${escapeHtml(DEFAULT_SUPPORT_EMAIL)}" style="color:#123c46;font-weight:700">פנייה לתמיכה</a></p></main></body></html>`,{status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Retry-After":"900"}});}

async function createSupportRequest(request, env, ctx) {
  await ensureProductionHardeningSchema(env);
  await ensureCompletePlatformSchema(env);
  const body = await readJson(request);
  const name = cleanText(body.name, 2, 80, "שם");
  const email = cleanText(body.email, 5, 160, "אימייל").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "נא להזין כתובת אימייל תקינה");
  const subject = cleanText(body.subject, 2, 120, "נושא");
  const message = cleanText(body.message, 10, 2000, "הודעה");
  await enforcePublicRateLimit(env, email, "support", ctx, 5);
  const user = await currentUser(request, env);
  const id = crypto.randomUUID();
  const next = await env.DB.prepare("SELECT COALESCE(MAX(ticket_number),0)+1 AS number FROM support_tickets").first();
  const ticketNumber = Number(next?.number || 1);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_tickets(id,ticket_number,user_id,name,email,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',?,?)")
      .bind(id,ticketNumber,user?.id||null,name,email,subject,message,new Date().toISOString(),new Date().toISOString()),
    env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body) VALUES(?,?,?,?)")
      .bind(crypto.randomUUID(),id,user?.id||null,message)
  ]);
  return json({ ok: true, id, ticketNumber }, 201);
}

async function ensureAdvancedBookingSchema(env) {
  const itemInfo=await env.DB.prepare("PRAGMA table_info(items)").all();
  const itemColumns=new Set((itemInfo.results||[]).map(row=>row.name));
  const itemAdds=[
    ["min_loan_minutes","INTEGER NOT NULL DEFAULT 60 CHECK (min_loan_minutes >= 1)"],
    ["max_loan_minutes","INTEGER NOT NULL DEFAULT 10080 CHECK (max_loan_minutes >= 1)"],
    ["booking_notice_minutes","INTEGER NOT NULL DEFAULT 0 CHECK (booking_notice_minutes >= 0)"],
    ["turnaround_minutes","INTEGER NOT NULL DEFAULT 0 CHECK (turnaround_minutes >= 0)"],
    ["booking_horizon_days","INTEGER NOT NULL DEFAULT 365 CHECK (booking_horizon_days BETWEEN 1 AND 1095)"],
    ["booking_horizon_minutes","INTEGER CHECK (booking_horizon_minutes BETWEEN 1 AND 1576800)"],
    ["approval_mode","TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual','automatic'))"],
    ["deposit_required","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required IN (0,1))"],
    ["deposit_amount_agorot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot >= 0)"]
  ];
  for(const [name,definition] of itemAdds) if(!itemColumns.has(name)) await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${name} ${definition}`).run();

  const requestInfo=await env.DB.prepare("PRAGMA table_info(loan_requests)").all();
  const requestColumns=new Set((requestInfo.results||[]).map(row=>row.name));
  const requestAdds=[
    ["quantity","INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999)"],
    ["deposit_required_snapshot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required_snapshot IN (0,1))"],
    ["deposit_amount_agorot_snapshot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot_snapshot >= 0)"],
    ["deposit_terms_accepted_at","TEXT"],["collected_at","TEXT"],["returned_at","TEXT"],["cancelled_at","TEXT"]
  ];
  for(const [name,definition] of requestAdds) if(!requestColumns.has(name)) await env.DB.prepare(`ALTER TABLE loan_requests ADD COLUMN ${name} ${definition}`).run();

  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_units (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,unit_code TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','blocked','retired')),note TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_blocks (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE CASCADE,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),reason TEXT,created_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK (ends_at > starts_at))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS loan_request_units (request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,inventory_unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,PRIMARY KEY (request_id,inventory_unit_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS loan_request_events (id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,event_type TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS waitlist_entries (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,requested_from TEXT NOT NULL,requested_until TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','converted','cancelled','expired')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK (requested_until > requested_from))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS inventory_units_item_status_idx ON inventory_units(item_id,status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS inventory_blocks_item_time_idx ON inventory_blocks(item_id,starts_at,ends_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS loan_requests_item_time_status_idx ON loan_requests(item_id,requested_from,requested_until,status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS loan_request_events_request_idx ON loan_request_events(request_id,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS waitlist_item_time_idx ON waitlist_entries(item_id,status,requested_from,requested_until)")
  ]);
}

async function ensureProductionHardeningSchema(env) {
  const ready = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='operational_state'").first();
  if (ready) return;
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS support_requests (id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,subject TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS support_requests_status_created_idx ON support_requests(status,created_at DESC)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS operational_state (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS abuse_events (identity_hash TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS abuse_events_identity_action_created_idx ON abuse_events(identity_hash,action,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS auth_events_identity_action_created_idx ON auth_events(identity_hash,action,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS notifications_read_created_idx ON notifications(read_at,created_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events(created_at)")
  ]);
}

async function ensureCompletePlatformSchema(env) {
  const platformReady=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='categories'").first();
  if(!platformReady){
    const platformStatements=PRODUCTION_PLATFORM_SQL.replace(/^\s*--.*$/gm,"").split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(value=>value&&!/^PRAGMA\b/i.test(value));
    await env.DB.batch(platformStatements.map(statement=>env.DB.prepare(statement)));
  }
  const relationReady=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organization_categories'").first();
  if(!relationReady) await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS organization_categories (organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,PRIMARY KEY (organization_id,category_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS item_categories (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,PRIMARY KEY (item_id,category_id))")
  ]);
  const ready=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='security_events'").first();
  if(ready)return;
  const statements=COMPLETE_PLATFORM_SQL.replace(/^\s*--.*$/gm,"").split(/;\s*(?:\r?\n|$)/).map(value=>value.trim()).filter(value=>value&&!/^PRAGMA\b/i.test(value));
  await env.DB.batch(statements.map(statement=>env.DB.prepare(statement)));
}

async function routeApi(request, env, ctx, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) assertSameOrigin(request, url);
  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (method === "GET" && path === "/api/health") {
    // Health probes must verify availability without mutating schema or doing
    // expensive reconciliation. Migrations and the daily maintenance cron own
    // schema repair so release checks cannot consume the D1 daily allowance.
    const deep = url.searchParams.get("deep") === "1";
    await env.DB.prepare("SELECT 1 AS ok").first();
    let catalog = null, categories = null;
    if (deep) {
      await env.DB.prepare(`SELECT i.id FROM items i JOIN organizations o ON o.id=i.organization_id
        WHERE i.status='active' AND i.is_free=1 AND o.status='approved' AND o.is_hidden=0 LIMIT 1`).first();
      catalog = true;
      await env.DB.prepare("SELECT id FROM categories WHERE status='active' LIMIT 1").first();
      categories = true;
    }
    return json({
      ok:true,
      release:"complete-platform-2026-09-27.15",
      database:"D1",
      storage:"R2",
      email:Boolean(env.RESEND_API_KEY),
      privateDataEncryption:Boolean(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY),
      deep,
      catalog,
      categories,
      timestamp:new Date().toISOString()
    });
  }

  if (method === "POST" && path === "/api/translate/user-content") return translateUserContent(request, env, ctx);
  if (method === "POST" && path === "/api/auth/register") return register(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/verify-email") return verifyEmail(request, env, url);
  if (method === "POST" && path === "/api/auth/resend-verification") return resendVerification(request, env, ctx);
  if (method === "POST" && path === "/api/auth/forgot-password") return forgotPassword(request, env, ctx);
  if (method === "POST" && path === "/api/auth/reset-password") return resetPassword(request, env, ctx);
  if (method === "POST" && path === "/api/auth/login") return login(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/2fa/verify-login") return verifyTwoFactorLogin(request, env, url);
  if (method === "POST" && path === "/api/auth/logout") return logout(request, env, url);
  if (method === "POST" && path === "/api/auth/logout-all") return logoutAll(request, env, url);
  if (method === "POST" && path === "/api/auth/change-password") return changePassword(request, env);
  if (method === "DELETE" && path === "/api/me/account") return deleteAccount(request, env, url);
  if (method === "POST" && path === "/api/auth/2fa/setup") return setupTwoFactor(request, env);
  if (method === "POST" && path === "/api/auth/2fa/confirm") return confirmTwoFactor(request, env);
  if (method === "POST" && path === "/api/auth/2fa/disable") return disableTwoFactor(request, env);
  if (method === "GET" && path === "/api/auth/me") {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (method === "GET" && path === "/api/public-config") return json({ supportEmail: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL), pushPublicKey: String(env.VAPID_PUBLIC_KEY || "") });
  if (method === "GET" && path === "/api/me/calendar-feed") return myCalendarFeed(request,env);
  const calendarFeed=path.match(/^\/calendar\/([A-Za-z0-9_-]{20,})\.ics$/); if(method==="GET"&&calendarFeed)return publicCalendarFeed(env,calendarFeed[1]);
  if (method === "GET" && path === "/api/unsubscribe/community") return unsubscribeCommunity(env,url.searchParams.get("token"));
  if (method === "GET" && path === "/api/categories") return listCategories(env, url);
  if (method === "POST" && path === "/api/support") return createSupportRequest(request, env, ctx);
  if (method === "GET" && path === "/api/me/profile") return getProfile(request, env);
  if (method === "PATCH" && path === "/api/me/profile") return updateProfile(request, env);
  if (method === "GET" && path === "/api/me/sessions") return listSessions(request, env);
  if (method === "GET" && path === "/api/me/security-events") return listMySecurityEvents(request, env);
  if (method === "GET" && path === "/api/me/notification-preferences") return getNotificationPreferences(request, env);
  if (method === "PUT" && path === "/api/me/notification-preferences") return saveNotificationPreferences(request, env);
  if (method === "GET" && path === "/api/me/saved-searches") return listSavedSearches(request, env);
  if (method === "POST" && path === "/api/me/saved-searches") return createSavedSearch(request, env);
  if (method === "GET" && path === "/api/me/favorites-overview") return favoritesOverview(request, env);
  const favoriteOverviewDetail=path.match(/^\/api\/me\/favorites-overview\/([^/]+)\/([^/]+)$/);
  if (method === "DELETE" && favoriteOverviewDetail) return removeFromFavoritesOverview(request, env, decodeURIComponent(favoriteOverviewDetail[1]), decodeURIComponent(favoriteOverviewDetail[2]));
  if (method === "GET" && path === "/api/me/saved-categories") return listSavedCategories(request, env);
  const savedCategory = path.match(/^\/api\/me\/saved-categories\/([^/]+)$/);
  if (savedCategory && method === "PUT") return saveCategory(request, env, decodeURIComponent(savedCategory[1]));
  if (savedCategory && method === "DELETE") return removeSavedCategory(request, env, decodeURIComponent(savedCategory[1]));

  if (method === "POST" && path === "/api/me/account/request-deletion") return requestAccountDeletion(request, env);
  if (method === "POST" && path === "/api/me/account/cancel-deletion") return cancelAccountDeletion(request, env);
  const sessionRevoke = path.match(/^\/api\/me\/sessions\/([^/]+)$/);
  if (method === "DELETE" && sessionRevoke) return revokeSession(request, env, decodeURIComponent(sessionRevoke[1]));
  if (method === "GET" && path === "/api/me/addresses") return listAddresses(request, env);
  if (method === "POST" && path === "/api/me/addresses") return createAddress(request, env);
  const addressDetail = path.match(/^\/api\/me\/addresses\/([^/]+)$/);
  if (method === "PATCH" && addressDetail) return updateAddress(request, env, decodeURIComponent(addressDetail[1]));
  if (method === "DELETE" && addressDetail) return deleteAddress(request, env, decodeURIComponent(addressDetail[1]));
  const savedSearchDetail = path.match(/^\/api\/me\/saved-searches\/([^/]+)$/);
  if (method === "PATCH" && savedSearchDetail) return updateSavedSearch(request, env, decodeURIComponent(savedSearchDetail[1]));
  if (method === "DELETE" && savedSearchDetail) return deleteSavedSearch(request, env, decodeURIComponent(savedSearchDetail[1]));
  if (method === "GET" && path === "/api/me/support-tickets") return listMySupportTickets(request, env);
  const supportTicketMessages = path.match(/^\/api\/me\/support-tickets\/([^/]+)\/messages$/);
  if (method === "GET" && supportTicketMessages) return listSupportTicketMessages(request, env, decodeURIComponent(supportTicketMessages[1]));
  if (method === "POST" && supportTicketMessages) return addSupportTicketMessage(request, env, decodeURIComponent(supportTicketMessages[1]));
  const supportTicketStatus = path.match(/^\/api\/me\/support-tickets\/([^/]+)\/status$/);
  if (method === "PATCH" && supportTicketStatus) return updateSupportTicketStatus(request, env, decodeURIComponent(supportTicketStatus[1]));

  if (method === "GET" && path === "/api/items") return listItems(env, url);
  if (method === "GET" && path === "/api/discovery") return discovery(env, url);
  if (method === "POST" && path === "/api/analytics/events") return recordAnalytics(request, env);
  const organizationView = path.match(/^\/api\/organizations\/([^/]+)\/view$/);
  if (method === "POST" && organizationView) return recordOrganizationView(request, env, decodeURIComponent(organizationView[1]));
  if (method === "GET" && path === "/api/help-requests") return listHelpRequests(env, url);
  if (method === "POST" && path === "/api/help-requests") return createHelpRequest(request, env);
  if (method === "POST" && path === "/api/reviews") return createReview(request, env);
  const helpfulReview = path.match(/^\/api\/reviews\/([^/]+)\/helpful$/);
  if (method === "POST" && helpfulReview) return markReviewHelpful(request, env, decodeURIComponent(helpfulReview[1]));
  const reportReview = path.match(/^\/api\/reviews\/([^/]+)\/report$/);
  if (method === "POST" && reportReview) return reportReviewContent(request, env, decodeURIComponent(reportReview[1]));
  if (method === "GET" && path === "/api/site-settings") return getSiteSettings(env);
  if (method === "GET" && path === "/api/page-customizations") return getPageCustomizations(env);
  const itemDetail = path.match(/^\/api\/items\/([^/]+)$/);
  if (method === "GET" && itemDetail) return getItem(env, decodeURIComponent(itemDetail[1]));
  if (method === "PATCH" && itemDetail) return updateItem(request, env, decodeURIComponent(itemDetail[1]));
  const itemAvailabilityCheck = path.match(/^\/api\/items\/([^/]+)\/availability-check$/);
  if (method === "GET" && itemAvailabilityCheck) return checkItemAvailability(env, decodeURIComponent(itemAvailabilityCheck[1]), url);
  const inventoryManage = path.match(/^\/api\/items\/([^/]+)\/inventory$/);
  if (method === "GET" && inventoryManage) return getInventoryManagement(request, env, decodeURIComponent(inventoryManage[1]));
  if (method === "POST" && inventoryManage) return addInventoryBlock(request, env, decodeURIComponent(inventoryManage[1]));
  const inventoryBlock = path.match(/^\/api\/inventory-blocks\/([^/]+)$/);
  if (method === "DELETE" && inventoryBlock) return deleteInventoryBlock(request, env, decodeURIComponent(inventoryBlock[1]));
  const waitlist = path.match(/^\/api\/items\/([^/]+)\/waitlist$/);
  if (method === "GET" && waitlist) return listItemWaitlist(request, env, decodeURIComponent(waitlist[1]));
  if (method === "POST" && waitlist) return joinWaitlist(request, env, decodeURIComponent(waitlist[1]));
  const waitlistEntry = path.match(/^\/api\/waitlist\/([^/]+)$/);
  if (method === "DELETE" && waitlistEntry) return leaveWaitlist(request, env, decodeURIComponent(waitlistEntry[1]));


  const favorite = path.match(/^\/api\/favorites\/([^/]+)$/);
  if (favorite && method === "POST") return addFavorite(request, env, decodeURIComponent(favorite[1]));
  if (favorite && method === "DELETE") return removeFavorite(request, env, decodeURIComponent(favorite[1]));

  if (method === "POST" && path === "/api/organizations") return createOrganization(request, env);
  const organizationBranches = path.match(/^\/api\/organizations\/([^/]+)\/branches$/);
  if (method === "GET" && organizationBranches) return listBranches(request, env, decodeURIComponent(organizationBranches[1]));
  if (method === "POST" && organizationBranches) return createBranch(request, env, decodeURIComponent(organizationBranches[1]));
  const branchDetail = path.match(/^\/api\/branches\/([^/]+)$/);
  if (method === "PATCH" && branchDetail) return updateBranch(request, env, decodeURIComponent(branchDetail[1]));
  if (method === "DELETE" && branchDetail) return archiveBranch(request, env, decodeURIComponent(branchDetail[1]));
  const organizationMembers = path.match(/^\/api\/organizations\/([^/]+)\/members$/);
  if (method === "GET" && organizationMembers) return listOrganizationMembers(request, env, decodeURIComponent(organizationMembers[1]));
  if (method === "POST" && organizationMembers) return addOrganizationMember(request, env, decodeURIComponent(organizationMembers[1]));
  const organizationInvitations = path.match(/^\/api\/organizations\/([^/]+)\/invitations$/);
  if (method === "GET" && organizationInvitations) return listOrganizationInvitations(request, env, decodeURIComponent(organizationInvitations[1]));
  if (method === "POST" && organizationInvitations) return createOrganizationInvitation(request, env, decodeURIComponent(organizationInvitations[1]), url);
  const organizationInvitationCancel = path.match(/^\/api\/organization-invitations\/([^/]+)$/);
  if (method === "DELETE" && organizationInvitationCancel) return cancelOrganizationInvitation(request, env, decodeURIComponent(organizationInvitationCancel[1]));
  const organizationInvitationAccept = path.match(/^\/api\/organization-invitations\/([^/]+)\/accept$/);
  if (method === "POST" && organizationInvitationAccept) return acceptOrganizationInvitation(request, env, decodeURIComponent(organizationInvitationAccept[1]));
  const organizationMember = path.match(/^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/);
  if (method === "DELETE" && organizationMember) return removeOrganizationMember(request, env, decodeURIComponent(organizationMember[1]), decodeURIComponent(organizationMember[2]));
  const publicOrganization = path.match(/^\/api\/organizations\/([^/]+)\/public$/);
  if (method === "GET" && publicOrganization) return getPublicOrganization(env, decodeURIComponent(publicOrganization[1]));
  const savedOrganization = path.match(/^\/api\/saved-organizations\/([^/]+)$/);
  if (method === "POST" && savedOrganization) return toggleSavedOrganization(request, env, decodeURIComponent(savedOrganization[1]), true);
  if (method === "DELETE" && savedOrganization) return toggleSavedOrganization(request, env, decodeURIComponent(savedOrganization[1]), false);
  const organizationDetail = path.match(/^\/api\/organizations\/([^/]+)$/);
  if (method === "PATCH" && organizationDetail) return updateOrganization(request, env, decodeURIComponent(organizationDetail[1]));
  if (method === "POST" && path === "/api/items") return createItem(request, env);
  const itemUnits = path.match(/^\/api\/items\/([^/]+)\/units$/);
  if (method === "GET" && itemUnits) return listItemUnits(request, env, decodeURIComponent(itemUnits[1]));
  if (method === "POST" && itemUnits) return createItemUnit(request, env, decodeURIComponent(itemUnits[1]));
  const imageUpload = path.match(/^\/api\/items\/([^/]+)\/images$/);
  if (method === "POST" && imageUpload) return uploadImages(request, env, decodeURIComponent(imageUpload[1]));
  if (method === "POST" && path === "/api/loan-requests") return createLoanRequest(request, env);
  const loanUnits = path.match(/^\/api\/loan-requests\/([^/]+)\/units$/);
  if (method === "GET" && loanUnits) return manageLoanUnits(request, env, decodeURIComponent(loanUnits[1]), false);
  if (method === "POST" && loanUnits) return manageLoanUnits(request, env, decodeURIComponent(loanUnits[1]), true);
  const loanTimeline = path.match(/^\/api\/loan-requests\/([^/]+)\/timeline$/);
  if (method === "GET" && loanTimeline) return getLoanTimeline(request, env, decodeURIComponent(loanTimeline[1]));
  const loanPickup = path.match(/^\/api\/loan-requests\/([^/]+)\/pickup-proposals$/);
  if (method === "POST" && loanPickup) return createPickupProposal(request, env, decodeURIComponent(loanPickup[1]));
  const acceptPickup = path.match(/^\/api\/pickup-proposals\/([^/]+)\/accept$/);
  if (method === "POST" && acceptPickup) return acceptPickupProposal(request, env, decodeURIComponent(acceptPickup[1]));
  const pickupExpiryResponse = path.match(/^\/api\/loan-requests\/([^/]+)\/pickup-expiry\/respond$/);
  if (method === "POST" && pickupExpiryResponse) return respondPickupExpiry(request, env, decodeURIComponent(pickupExpiryResponse[1]));
  const loanExtension = path.match(/^\/api\/loan-requests\/([^/]+)\/extension$/);
  if (method === "POST" && loanExtension) return requestLoanExtension(request, env, decodeURIComponent(loanExtension[1]));
  const loanExtensionDecision = path.match(/^\/api\/loan-requests\/([^/]+)\/extension\/decision$/);
  if (method === "PATCH" && loanExtensionDecision) return decideLoanExtension(request, env, decodeURIComponent(loanExtensionDecision[1]));
  const requestMessages = path.match(/^\/api\/loan-requests\/([^/]+)\/messages$/);
  if (method === "GET" && requestMessages) return listRequestMessages(request, env, decodeURIComponent(requestMessages[1]));
  if (method === "POST" && requestMessages) return createRequestMessage(request, env, decodeURIComponent(requestMessages[1]));
  const requestAttachment=path.match(/^\/api\/loan-requests\/([^/]+)\/chat-attachment$/);
  if(method==="POST"&&requestAttachment)return uploadRequestChatAttachment(request,env,decodeURIComponent(requestAttachment[1]));
  const requestRich=path.match(/^\/api\/loan-requests\/([^/]+)\/chat-rich$/);
  if(method==="POST"&&requestRich){const b=await readJson(request);return createRequestMessage(new Request(request.url,{method:"POST",headers:request.headers,body:JSON.stringify(b.type==="location"?{messageType:"location",latitude:b.metadata?.lat,longitude:b.metadata?.lon,label:b.metadata?.label}:{messageType:"item_card",itemId:b.metadata?.itemId})}),env,decodeURIComponent(requestRich[1]));}

  const requestMessage = path.match(/^\/api\/messages\/([^/]+)$/);
  if (method === "PATCH" && requestMessage) return editRequestMessage(request, env, decodeURIComponent(requestMessage[1]));
  if (method === "DELETE" && requestMessage) return deleteRequestMessage(request, env, decodeURIComponent(requestMessage[1]));
  const reportMessage=path.match(/^\/api\/messages\/([^/]+)\/report$/);
  if(method==="POST"&&reportMessage)return reportRequestMessage(request,env,decodeURIComponent(reportMessage[1]));
  const blockUser=path.match(/^\/api\/users\/([^/]+)\/block$/);
  if(method==="POST"&&blockUser)return blockChatUser(request,env,decodeURIComponent(blockUser[1]));
  const helpOffers = path.match(/^\/api\/help-requests\/([^/]+)\/offers$/);
  if (method === "GET" && helpOffers) return listHelpOffers(request, env, decodeURIComponent(helpOffers[1]));
  if (method === "POST" && helpOffers) return createHelpOffer(request, env, decodeURIComponent(helpOffers[1]));
  const helpOffer = path.match(/^\/api\/help-offers\/([^/]+)$/);
  if (method === "PATCH" && helpOffer) return updateHelpOffer(request, env, decodeURIComponent(helpOffer[1]));

  if (method === "GET" && path === "/api/notifications") return listNotifications(request, env);
  if (method === "POST" && path === "/api/notifications/read-all") return markNotificationsRead(request, env);
  if (method === "POST" && path === "/api/reports") return createReport(request, env);

  if (method === "GET" && path === "/api/me/dashboard") return dashboard(request, env);
  const requestStatus = path.match(/^\/api\/loan-requests\/([^/]+)\/status$/);
  if (method === "PATCH" && requestStatus) return updateRequestStatus(request, env, decodeURIComponent(requestStatus[1]));
  const itemAvailability = path.match(/^\/api\/items\/([^/]+)\/availability$/);
  if (method === "PATCH" && itemAvailability) return updateAvailability(request, env, decodeURIComponent(itemAvailability[1]));

  if (method === "GET" && path === "/api/admin/pending") return adminPending(request, env);
  if (method === "GET" && path === "/api/admin/overview") return adminOverview(request, env);
  if (method === "GET" && path === "/api/admin/site-settings") return adminSiteSettings(request, env);
  if (method === "PATCH" && path === "/api/admin/site-settings") return updateSiteSettings(request, env);
  const restoreSettings = path.match(/^\/api\/admin\/site-settings\/versions\/([^/]+)\/restore$/);
  if (method === "POST" && restoreSettings) return restoreSiteSettings(request, env, decodeURIComponent(restoreSettings[1]));
  if (method === "GET" && path === "/api/admin/users") return adminUsers(request, env);
  if (method === "GET" && path === "/api/admin/content") return adminContent(request, env);
  if (method === "GET" && path === "/api/admin/analytics") return adminAnalytics(request, env);
  if (method === "GET" && path === "/api/admin/analytics/export.csv") return adminAnalyticsCsv(request, env);
  if (method === "GET" && path === "/api/admin/categories") return adminCategories(request, env);
  if (method === "POST" && path === "/api/admin/categories") return createAdminCategory(request, env);
  const adminCategory = path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (method === "PATCH" && adminCategory) return updateAdminCategory(request, env, decodeURIComponent(adminCategory[1]));
  if (method === "GET" && path === "/api/admin/closures") return adminClosures(request, env);
  if (method === "POST" && path === "/api/admin/closures") return createAdminClosure(request, env);
  const adminClosure = path.match(/^\/api\/admin\/closures\/([^/]+)$/);
  if (method === "PATCH" && adminClosure) return updateAdminClosure(request, env, decodeURIComponent(adminClosure[1]));
  if (method === "GET" && path === "/api/admin/security-events") return adminSecurityEvents(request, env);
  if (method === "PUT" && path === "/api/admin/page-customizations") return savePageCustomization(request, env);
  if (method === "DELETE" && path === "/api/admin/page-customizations") return resetPageCustomizations(request, env);
  const restorePageVersion = path.match(/^\/api\/admin\/page-customizations\/versions\/([^/]+)\/restore$/);
  if (method === "POST" && restorePageVersion) return restorePageCustomizationVersion(request, env, decodeURIComponent(restorePageVersion[1]));
  const adminUser = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (method === "PATCH" && adminUser) return updateAdminUser(request, env, decodeURIComponent(adminUser[1]));
  const adminOrganization = path.match(/^\/api\/admin\/organizations\/([^/]+)$/);
  if (method === "PATCH" && adminOrganization) return moderateOrganization(request, env, decodeURIComponent(adminOrganization[1]));
  const adminItem = path.match(/^\/api\/admin\/items\/([^/]+)$/);
  if (method === "PATCH" && adminItem) return moderateItem(request, env, decodeURIComponent(adminItem[1]));
  const adminReport = path.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (method === "PATCH" && adminReport) return moderateReport(request, env, decodeURIComponent(adminReport[1]));

  const bulkRoute=path.match(/^\/api\/organizations\/([^/]+)\/inventory\/bulk$/);
  if(method==="POST"&&bulkRoute)return bulkInventoryAction(request,env,decodeURIComponent(bulkRoute[1]));
  if(method==="POST"&&path==="/api/items/import")return importItems(request,env);

  const finalFeaturesResponse = await handleFinalFeatures(request, env, ctx, url);
  if (finalFeaturesResponse) return finalFeaturesResponse;
  const remainingFeaturesResponse = await handleRemainingFeatures(request, env, ctx, url);
  if (remainingFeaturesResponse) return remainingFeaturesResponse;
  const requirementsExpansionResponse = await handleRequirementsExpansion(request, env, ctx, url);
  if (requirementsExpansionResponse) return requirementsExpansionResponse;
  const launchReadinessResponse = await handleLaunchReadiness(request, env, ctx, url);
  if (launchReadinessResponse) return launchReadinessResponse;
  const distributionCompletionResponse = await handleDistributionCompletion(request, env, ctx, url);
  if (distributionCompletionResponse) return distributionCompletionResponse;
  const navigationAdminResponse = await handleNavigationAdmin(request, env, ctx, url);
  if (navigationAdminResponse) return navigationAdminResponse;
  const privacyAvailabilityResponse = await handlePrivacyAvailability(request, env, ctx, url);
  if (privacyAvailabilityResponse) return privacyAvailabilityResponse;
  const privacyPurgeResponse = await handlePrivacyPurge(request, env, ctx, url);
  if (privacyPurgeResponse) return privacyPurgeResponse;
  const communityChatResponse = await handleCommunityChat(request, env, ctx, url);
  if (communityChatResponse) return communityChatResponse;

  throw new HttpError(404, "הכתובת לא נמצאה");
}

async function register(request, env, ctx, url) {
  const body = await readJson(request);
  if (body.termsAccepted !== true) throw new HttpError(400, "יש לאשר את תנאי השימוש ומדיניות הפרטיות");
  if (body.operationalEmailsAccepted !== true) throw new HttpError(400, "יש לאשר קבלת הודעות תפעוליות הנחוצות להפעלת החשבון");
  const email = normalizeEmail(body.email);
  const preferredLanguage = body.preferredLanguage === "en" ? "en" : "he";
  const fullName = cleanText(body.fullName, 2, 80, "שם מלא");
  const phone = validatePhone(body.phone);
  const city = cleanText(body.city, 2, 80, "עיר או יישוב");
  const address = cleanText(body.address, 5, 180, "כתובת מלאה");
  const addressCipher = await encryptPrivateValue(address, env);
  const password = validatePassword(body.password);
  try { await enforceAuthRateLimit(env,email,"register",ctx); }
  catch(error) { if(error instanceof HttpError) throw error; console.error("Registration rate limit failed",error); throw new HttpError(503,"לא הצלחנו לבדוק את ההרשמה (שלב אבטחה)"); }
  assertEmailDeliveryConfigured(env);

  let existing;
  try { existing=await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first(); }
  catch(error) { console.error("Registration lookup failed",error); throw new HttpError(503,"לא הצלחנו לבדוק את החשבון (שלב משתמש)"); }
  if (existing) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  const admins = String(env.ADMIN_EMAILS || "").split(",").map(normalizeEmailLoose).filter(Boolean);
  let role;
  try { role=admins.includes(email)?"admin":await compatibleMemberRole(env); }
  catch(error) { console.error("Registration role compatibility failed",error); role="member"; }
  const code = verificationCode();
  const challengeHash = await sha256(`${id}:${code}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    const acceptedAt=new Date().toISOString();
    await env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role,phone,city,address_cipher,terms_accepted_at,privacy_accepted_at,operational_emails_accepted,community_emails_accepted,preferred_language,consent_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id, email, passwordHash, salt, PASSWORD_ITERATIONS, fullName, role, phone, city, addressCipher, acceptedAt, acceptedAt, 1, body.communityEmailsAccepted===true?1:0,preferredLanguage,TERMS_VERSION).run();
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO legal_consents(user_id,document_type,version,accepted_at,source) VALUES(?,?,?,?,?)").bind(id,"terms",TERMS_VERSION,acceptedAt,"registration"),
      env.DB.prepare("INSERT OR IGNORE INTO legal_consents(user_id,document_type,version,accepted_at,source) VALUES(?,?,?,?,?)").bind(id,"privacy",PRIVACY_VERSION,acceptedAt,"registration")
    ]);
  } catch (error) {
    const message=String(error).toLowerCase();
    if (message.includes("unique")) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");
    const fallbackRole=role==="member"?"borrower":role==="borrower"?"member":null;
    if (!fallbackRole) { console.error("Registration user write failed",error); throw new HttpError(503,"לא הצלחנו ליצור את החשבון במסד הנתונים"); }
    try { const acceptedAt=new Date().toISOString(); await env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role,phone,city,address_cipher,terms_accepted_at,privacy_accepted_at,operational_emails_accepted,community_emails_accepted,preferred_language,consent_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,email,passwordHash,salt,PASSWORD_ITERATIONS,fullName,fallbackRole,phone,city,addressCipher,acceptedAt,acceptedAt,1,body.communityEmailsAccepted===true?1:0,preferredLanguage,TERMS_VERSION).run(); await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO legal_consents(user_id,document_type,version,accepted_at,source) VALUES(?,?,?,?,?)").bind(id,"terms",TERMS_VERSION,acceptedAt,"registration"),env.DB.prepare("INSERT OR IGNORE INTO legal_consents(user_id,document_type,version,accepted_at,source) VALUES(?,?,?,?,?)").bind(id,"privacy",PRIVACY_VERSION,acceptedAt,"registration")]); }
    catch (fallbackError) { console.error("Registration user fallback failed",fallbackError); throw new HttpError(503,"לא הצלחנו ליצור את החשבון במסד הנתונים"); }
  }
  try {
    await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)").bind(challengeHash,id,expiresAt).run();
  } catch (error) {
    console.error("Registration challenge write failed",error);
    try { await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run(); } catch {}
    throw new HttpError(503,"לא הצלחנו ליצור קוד אימות. נסו שוב בעוד רגע");
  }

  try {
    await sendVerificationEmail(env, email, fullName, code, preferredLanguage);
  } catch (error) {
    console.error("Verification email delivery failed", error);
    try { await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run(); }
    catch (cleanupError) { console.error("Registration cleanup failed", cleanupError); }
    throw new HttpError(503, "לא הצלחנו לשלוח את קוד האימות. שירות המייל אינו זמין כרגע");
  }
  return json({ verificationRequired: true, email, expiresInSeconds: 600 }, 201);
}

async function verifyEmail(request, env, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = cleanText(body.code, 6, 6, "קוד אימות");
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "קוד האימות חייב להכיל 6 ספרות");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user) throw new HttpError(400, "קוד האימות אינו נכון או שפג תוקפו");
  if (Number(user.email_verified || 0) === 1) throw new HttpError(409, "כתובת האימייל כבר אומתה");
  const tokenHash = await sha256(`${user.id}:${code}`);
  const challenge = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE token_hash = ? AND user_id = ? AND purpose = 'email_verify' AND expires_at > ?")
    .bind(tokenHash, user.id, new Date().toISOString()).first();
  if (!challenge) throw new HttpError(400, "קוד האימות אינו נכון או שפג תוקפו");
  const sessionToken = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email_verified = 1, last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(sessionToken), user.id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString())
  ]);
  return json({ user: publicUser({ ...user, email_verified: 1 }) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function resendVerification(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  await enforceAuthRateLimit(env, email, "register", ctx);
  assertEmailDeliveryConfigured(env);
  const user = await env.DB.prepare("SELECT id,email,full_name,email_verified,preferred_language FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user || Number(user.email_verified || 0) === 1) return json({ ok: true });
  const code = verificationCode();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)")
      .bind(await sha256(`${user.id}:${code}`), user.id, new Date(Date.now() + 10 * 60 * 1000).toISOString())
  ]);
  await sendVerificationEmail(env, user.email, user.full_name, code, user.preferred_language);
  return json({ ok: true });
}

async function forgotPassword(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  await enforcePublicRateLimit(env, email, "password_reset", ctx, 5);
  assertEmailDeliveryConfigured(env);
  const user = await env.DB.prepare("SELECT id,email,full_name,email_verified,preferred_language FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user || Number(user.email_verified || 0) !== 1) return json({ ok: true });
  const recent = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify' AND created_at > ? LIMIT 1")
    .bind(user.id, new Date(Date.now() - 60 * 1000).toISOString()).first();
  if (recent) return json({ ok: true });
  const code = verificationCode();
  await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)")
    .bind(await sha256(`${user.id}:password_reset:${code}`), user.id, new Date(Date.now() + 10 * 60 * 1000).toISOString()).run();
  await sendPasswordResetEmail(env, user.email, user.full_name, code, user.preferred_language);
  return json({ ok: true });
}

async function resetPassword(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  await enforcePublicRateLimit(env, email, "password_reset_verify", ctx, 10);
  const code = cleanText(body.code, 6, 6, "קוד איפוס");
  const newPassword = validatePassword(body.newPassword);
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "קוד האיפוס חייב להכיל 6 ספרות");
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 1").bind(email).first();
  if (!user) throw new HttpError(400, "הקוד אינו נכון או שפג תוקפו");
  const tokenHash = await sha256(`${user.id}:password_reset:${code}`);
  const challenge = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE token_hash = ? AND user_id = ? AND purpose = 'email_verify' AND expires_at > ?")
    .bind(tokenHash, user.id, new Date().toISOString()).first();
  if (!challenge) throw new HttpError(400, "הקוד אינו נכון או שפג תוקפו");
  const salt = randomToken(16);
  const hash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?").bind(hash, salt, PASSWORD_ITERATIONS, new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id)
  ]);
  return json({ ok: true });
}

async function login(request, env, ctx, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  await enforceAuthRateLimit(env, email, "login", ctx);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user) { await recordSecurityFailure(request,env,"login_failed"); throw new HttpError(401, "האימייל או הסיסמה אינם נכונים"); }
  if (user.account_status === "suspended") throw new HttpError(403, "החשבון הושעה. יש לפנות למנהל האתר");
  const candidate = await derivePassword(password, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) { await recordSecurityFailure(request,env,"login_failed"); throw new HttpError(401, "האימייל או הסיסמה אינם נכונים"); }
  if (Number(user.email_verified || 0) !== 1) return json({ error: "יש לאמת את כתובת האימייל לפני הכניסה", verificationRequired: true, email: user.email }, 403);

  if (Number(user.totp_enabled || 0) === 1) {
    const challenge = randomToken(32);
    const challengeHash = await sha256(challenge);
    await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'login_2fa', ?)")
      .bind(challengeHash, user.id, new Date(Date.now() + 5 * 60 * 1000).toISOString()).run();
    return json({ requiresTwoFactor: true, challenge });
  }

  const sessionToken = randomToken(32);
  const tokenHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  const metadata = await sessionMetadata(request, env, user.id);
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,device_label,ip_hash,user_agent_hash,last_seen_at) VALUES (?,?,?,?,?,?,?)")
    .bind(tokenHash, user.id, expiresAt, metadata.deviceLabel, metadata.ipHash, metadata.userAgentHash, new Date().toISOString()).run();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), user.id).run();
  ctx.waitUntil(env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run());
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function verifyTwoFactorLogin(request, env, url) {
  const body = await readJson(request);
  const challenge = cleanText(body.challenge, 20, 200, "אתגר אימות");
  const code = cleanText(body.code, 6, 6, "קוד אימות");
  const row = await env.DB.prepare(`SELECT c.token_hash,c.user_id,c.expires_at,u.* FROM auth_challenges c
    JOIN users u ON u.id = c.user_id WHERE c.token_hash = ? AND c.purpose = 'login_2fa' AND c.expires_at > ?`)
    .bind(await sha256(challenge), new Date().toISOString()).first();
  if (!row || !row.totp_secret || !(await verifyTotp(row.totp_secret, code))) throw new HttpError(401, "קוד האימות אינו נכון או שפג תוקפו");
  const sessionToken = randomToken(32);
  const metadata = await sessionMetadata(request, env, row.user_id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE token_hash = ?").bind(row.token_hash),
    env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at,device_label,ip_hash,user_agent_hash,last_seen_at) VALUES (?,?,?,?,?,?,?)")
      .bind(await sha256(sessionToken), row.user_id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(), metadata.deviceLabel, metadata.ipHash, metadata.userAgentHash, new Date().toISOString()),
    env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), row.user_id)
  ]);
  return json({ user: publicUser(row) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function changePassword(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const currentPassword = validatePassword(body.currentPassword);
  const newPassword = validatePassword(body.newPassword);
  const candidate = await derivePassword(currentPassword, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה הנוכחית אינה נכונה");
  const salt = randomToken(16);
  const hash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?")
      .bind(hash, salt, PASSWORD_ITERATIONS, new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(cookieValue(request, SESSION_COOKIE)))
  ]);
  return json({ ok: true });
}

async function deleteAccount(request, env, url) {
  const user = await requireUser(request, env);
  if (user.role === "admin") throw new HttpError(400, "מטעמי בטיחות, חשבון מנהל ניתן למחיקה רק לאחר העברת הרשאת הניהול");
  const body = await readJson(request);
  const password = validatePassword(body.password);
  const candidate = await derivePassword(password, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה אינה נכונה");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET account_status='suspended',deletion_requested_at=?,updated_at=? WHERE id=?").bind(now,now,user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id)
  ]);
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function setupTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  await env.DB.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?")
    .bind(secret, new Date().toISOString(), user.id).run();
  const label = encodeURIComponent(`גמ״ח ברגע:${user.email}`);
  const issuer = encodeURIComponent("גמ״ח ברגע");
  return json({ secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
}

async function confirmTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const fresh = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(user.id).first();
  if (!fresh?.totp_secret || !(await verifyTotp(fresh.totp_secret, cleanText(body.code, 6, 6, "קוד אימות")))) throw new HttpError(400, "קוד האימות אינו נכון");
  await env.DB.prepare("UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function disableTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const candidate = await derivePassword(validatePassword(body.password), user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה אינה נכונה");
  await env.DB.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function logout(request, env, url) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function logoutAll(request, env, url) {
  const user = await requireUser(request, env);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function getProfile(request, env) {
  const user = await requireUser(request, env);
  return json({ profile: { ...publicUser(user), phone:user.phone||null, city:user.city||null, address:await decryptPrivateValue(user.address_cipher,env), preferredLanguage:user.preferred_language||"he", preferredNavigation:user.preferred_navigation||"google", operationalEmails:Boolean(user.operational_emails_accepted), communityEmails:Boolean(user.community_emails_accepted), deletionRequestedAt:user.deletion_requested_at||null, consentVersion:user.consent_version||null } });
}

async function updateProfile(request, env) {
  const user = await requireUser(request, env), body = await readJson(request);
  const fullName=cleanText(body.fullName,2,80,"שם מלא"), phone=validatePhone(body.phone), city=cleanText(body.city,2,80,"עיר או יישוב");
  const language=body.preferredLanguage==="en"?"en":"he", navigation=["google","waze","apple"].includes(body.preferredNavigation)?body.preferredNavigation:(user.preferred_navigation||"google"), operational=body.operationalEmails===false?0:1, community=body.communityEmails===true?1:0;
  const now=new Date().toISOString();
  // preferred_navigation on users is the canonical navigation preference.
  // Do not depend on the obsolete navigation_preferences table, which was
  // never part of the migration ledger and made profile updates schema-order dependent.
  await env.DB.prepare("UPDATE users SET full_name=?,phone=?,city=?,preferred_language=?,preferred_navigation=?,operational_emails_accepted=?,community_emails_accepted=?,updated_at=? WHERE id=?")
    .bind(fullName,phone,city,language,navigation,operational,community,now,user.id).run();
  return json({ profile:{...publicUser({...user,full_name:fullName}),phone,city,preferredLanguage:language,preferredNavigation:navigation,operationalEmails:Boolean(operational),communityEmails:Boolean(community)} });
}

async function listSessions(request, env) {
  const user=await requireUser(request,env), token=cookieValue(request,SESSION_COOKIE), tokenHash=token?await sha256(token):"";
  const rows=await env.DB.prepare("SELECT token_hash,device_label,last_seen_at,created_at,expires_at FROM sessions WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all();
  return json({sessions:rows.results.map(row=>({id:row.token_hash,deviceLabel:row.device_label||"מכשיר לא מזוהה",lastSeenAt:row.last_seen_at||row.created_at,createdAt:row.created_at,expiresAt:row.expires_at,current:row.token_hash===tokenHash}))});
}


async function listMySecurityEvents(request,env){const user=await requireUser(request,env);const rows=await env.DB.prepare("SELECT id,event_type,severity,details_json,created_at FROM security_events WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id).all();return json({events:rows.results.map(x=>({...x,details:safeJsonObject(x.details_json)}))})}

async function requestAccountDeletion(request,env){const user=await requireUser(request,env);const [active,owned]=await env.DB.batch([env.DB.prepare("SELECT COUNT(*) AS n FROM loan_requests WHERE (borrower_id=? OR item_id IN (SELECT id FROM items WHERE organization_id IN (SELECT id FROM organizations WHERE owner_id=?))) AND status IN (\'pending\',\'approved\',\'collected\')").bind(user.id,user.id),env.DB.prepare("SELECT COUNT(*) AS n FROM organizations WHERE owner_id=? AND deleted_at IS NULL").bind(user.id)]);const activeLoans=Number(active.results?.[0]?.n||0),ownedOrganizations=Number(owned.results?.[0]?.n||0),now=new Date().toISOString(),scheduled=new Date(Date.now()+7*86400000).toISOString();await env.DB.prepare("UPDATE users SET deletion_requested_at=?,updated_at=? WHERE id=?").bind(now,now,user.id).run();await env.DB.prepare("INSERT INTO security_events(id,user_id,event_type,severity,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),user.id,"account_deletion_requested","warning",JSON.stringify({scheduledAt:scheduled,activeLoans,ownedOrganizations})).run();return json({ok:true,scheduledAt:scheduled,blockedByActiveLoans:activeLoans>0,activeLoans,blockedByOwnedOrganizations:ownedOrganizations>0,ownedOrganizations});}

async function cancelAccountDeletion(request, env) {
  const user=await requireUser(request,env);
  if(!user.deletion_requested_at) return json({ok:true,alreadyActive:true});
  await env.DB.prepare("UPDATE users SET deletion_requested_at=NULL,account_status='active',updated_at=? WHERE id=?")
    .bind(new Date().toISOString(),user.id).run();
  await env.DB.prepare("INSERT INTO security_events(id,user_id,event_type,severity,details_json) VALUES(?,?,?,?,?)")
    .bind(crypto.randomUUID(),user.id,"account_deletion_cancelled","info","{}").run();
  return json({ok:true});
}

async function revokeSession(request,env,sessionId){
  const user=await requireUser(request,env),token=cookieValue(request,SESSION_COOKIE),currentHash=token?await sha256(token):"";
  if(!/^[A-Za-z0-9_-]{20,100}$/.test(sessionId)) throw new HttpError(400,"מזהה המכשיר אינו תקין");
  if(sessionId===currentHash) throw new HttpError(400,"לניתוק המכשיר הנוכחי יש להשתמש ביציאה מהחשבון");
  const result=await env.DB.prepare("DELETE FROM sessions WHERE user_id=? AND token_hash=?").bind(user.id,sessionId).run();
  if(!result.meta.changes) throw new HttpError(404,"המכשיר אינו מחובר עוד");
  return json({ok:true});
}

async function listAddresses(request,env){
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare("SELECT id,label,city,latitude,longitude,is_default,created_at,updated_at FROM user_addresses WHERE user_id=? ORDER BY is_default DESC,updated_at DESC").bind(user.id).all();
  return json({addresses:rows.results.map(row=>({...row,isDefault:Boolean(row.is_default)}))});
}

async function createAddress(request,env){
  const user=await requireUser(request,env),body=await readJson(request),id=crypto.randomUUID();
  const label=cleanText(body.label,1,50,"שם הכתובת"),city=cleanText(body.city,2,80,"עיר או יישוב"),address=cleanText(body.address,5,180,"כתובת מלאה");
  const cipher=await encryptPrivateValue(address,env),isDefault=body.isDefault===true?1:0;
  const statements=[];
  if(isDefault) statements.push(env.DB.prepare("UPDATE user_addresses SET is_default=0,updated_at=? WHERE user_id=?").bind(new Date().toISOString(),user.id));
  statements.push(env.DB.prepare("INSERT INTO user_addresses(id,user_id,label,address_cipher,city,latitude,longitude,is_default) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id,user.id,label,cipher,city,Number.isFinite(Number(body.latitude))?Number(body.latitude):null,Number.isFinite(Number(body.longitude))?Number(body.longitude):null,isDefault));
  await env.DB.batch(statements);
  return json({address:{id,label,city,isDefault:Boolean(isDefault)}},201);
}

async function updateAddress(request,env,id){
  const user=await requireUser(request,env),body=await readJson(request);
  const existing=await env.DB.prepare("SELECT * FROM user_addresses WHERE id=? AND user_id=?").bind(id,user.id).first();
  if(!existing) throw new HttpError(404,"הכתובת לא נמצאה");
  const label=body.label===undefined?existing.label:cleanText(body.label,1,50,"שם הכתובת");
  const city=body.city===undefined?existing.city:cleanText(body.city,2,80,"עיר או יישוב");
  const cipher=body.address===undefined?existing.address_cipher:await encryptPrivateValue(cleanText(body.address,5,180,"כתובת מלאה"),env);
  const lat=body.latitude===undefined?existing.latitude:(Number.isFinite(Number(body.latitude))?Number(body.latitude):null);
  const lon=body.longitude===undefined?existing.longitude:(Number.isFinite(Number(body.longitude))?Number(body.longitude):null);
  const isDefault=body.isDefault===undefined?Number(existing.is_default):(body.isDefault?1:0),now=new Date().toISOString();
  const s=[];if(isDefault)s.push(env.DB.prepare("UPDATE user_addresses SET is_default=0,updated_at=? WHERE user_id=?").bind(now,user.id));
  s.push(env.DB.prepare("UPDATE user_addresses SET label=?,address_cipher=?,city=?,latitude=?,longitude=?,is_default=?,updated_at=? WHERE id=? AND user_id=?").bind(label,cipher,city,lat,lon,isDefault,now,id,user.id));
  await env.DB.batch(s);return json({ok:true,address:{id,label,city,latitude:lat,longitude:lon,isDefault:Boolean(isDefault)}});
}

async function deleteAddress(request,env,id){
  const user=await requireUser(request,env);
  const row=await env.DB.prepare("SELECT is_default FROM user_addresses WHERE id=? AND user_id=?").bind(id,user.id).first();
  if(!row) throw new HttpError(404,"הכתובת לא נמצאה");
  await env.DB.prepare("DELETE FROM user_addresses WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(Number(row.is_default)===1){
    const next=await env.DB.prepare("SELECT id FROM user_addresses WHERE user_id=? ORDER BY updated_at DESC LIMIT 1").bind(user.id).first();
    if(next) await env.DB.prepare("UPDATE user_addresses SET is_default=1,updated_at=? WHERE id=?").bind(new Date().toISOString(),next.id).run();
  }
  return json({ok:true});
}

async function deleteSavedSearch(request,env,id){
  const user=await requireUser(request,env);
  const result=await env.DB.prepare("DELETE FROM saved_searches WHERE id=? AND user_id=?").bind(id,user.id).run();
  if(!result.meta.changes) throw new HttpError(404,"החיפוש השמור לא נמצא");
  return json({ok:true});
}

async function listMySupportTickets(request,env){
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare("SELECT id,ticket_number,subject,status,created_at,updated_at FROM support_tickets WHERE user_id=? OR email=? COLLATE NOCASE ORDER BY updated_at DESC LIMIT 100").bind(user.id,user.email).all();
  return json({tickets:rows.results});
}

async function listSupportTicketMessages(request,env,ticketId){
  const user=await requireUser(request,env);
  const ticket=await env.DB.prepare("SELECT id,message,created_at FROM support_tickets WHERE id=? AND (user_id=? OR email=? COLLATE NOCASE)").bind(ticketId,user.id,user.email).first();
  if(!ticket)throw new HttpError(404,"הפנייה לא נמצאה");
  const rows=await env.DB.prepare("SELECT m.id,m.body,m.created_at,m.sender_id,u.role AS sender_role FROM support_ticket_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.ticket_id=? ORDER BY m.created_at ASC LIMIT 200").bind(ticketId).all();
  const messages=rows.results.map(row=>({id:row.id,body:row.body,createdAt:row.created_at,fromSupport:row.sender_role==="admin"&&row.sender_id!==user.id}));
  if(ticket.message&&!messages.length)messages.push({id:"original",body:ticket.message,createdAt:ticket.created_at,fromSupport:false});
  return json({messages});
}

async function addSupportTicketMessage(request,env,ticketId){
  const user=await requireUser(request,env),body=await readJson(request);
  const ticket=await env.DB.prepare("SELECT id,status FROM support_tickets WHERE id=? AND (user_id=? OR email=? COLLATE NOCASE)").bind(ticketId,user.id,user.email).first();
  if(!ticket) throw new HttpError(404,"הפנייה לא נמצאה");
  const message=cleanText(body.message,1,1500,"הודעה"),id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body) VALUES(?,?,?,?)").bind(id,ticketId,user.id,message),
    env.DB.prepare("UPDATE support_tickets SET status=CASE WHEN status='closed' THEN 'reopened' ELSE status END,updated_at=? WHERE id=?").bind(now,ticketId)
  ]);
  return json({message:{id,createdAt:now}},201);
}

async function updateSupportTicketStatus(request,env,ticketId){
  const user=await requireUser(request,env),body=await readJson(request);
  const ticket=await env.DB.prepare("SELECT id,user_id,email,status FROM support_tickets WHERE id=?").bind(ticketId).first();
  if(!ticket) throw new HttpError(404,"הפנייה לא נמצאה");
  if(user.role!=="admin"&&ticket.user_id!==user.id&&String(ticket.email||"").toLowerCase()!==String(user.email||"").toLowerCase()) throw new HttpError(403,"אין הרשאה");
  const status=body.status==="closed"?"closed":body.status==="open"?"reopened":null;
  if(!status) throw new HttpError(400,"סטטוס הפנייה אינו תקין");
  await env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),ticketId).run();
  return json({ok:true,status});
}

async function adminCategories(request,env){
  await requireAdmin(request,env);
  const rows=await env.DB.prepare("SELECT id,parent_id,name_he,name_en,icon,image_url,synonyms_json,status,sort_order,created_at,updated_at FROM categories ORDER BY sort_order,name_he").all();
  return json({categories:rows.results.map(row=>({...row,synonyms:parseJsonArray(row.synonyms_json)}))});
}

async function createAdminCategory(request,env){
  const user=await requireAdmin(request,env),body=await readJson(request);
  const id=cleanOptional(body.id,80)||("cat-"+crypto.randomUUID().slice(0,8)),nameHe=cleanText(body.nameHe,2,80,"שם הקטגוריה"),nameEn=cleanOptional(body.nameEn,80),parentId=cleanOptional(body.parentId,80);
  if(parentId){const parent=await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(parentId).first();if(!parent)throw new HttpError(400,"קטגוריית האב אינה קיימת");}
  await env.DB.batch([
    env.DB.prepare("INSERT INTO categories(id,parent_id,name_he,name_en,icon,image_url,synonyms_json,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id,parentId,nameHe,nameEn,cleanOptional(body.icon,50),validateAssetUrl(body.imageUrl),JSON.stringify(Array.isArray(body.synonyms)?body.synonyms.slice(0,50):[]),"active",Math.max(0,Math.min(9999,Number(body.sortOrder)||0))),
    auditStatement(env,user.id,"category.create","category",id,{nameHe,parentId})
  ]);
  return json({category:{id,nameHe,nameEn,parentId}},201);
}

async function updateAdminCategory(request,env,id){
  const user=await requireAdmin(request,env),body=await readJson(request);
  const current=await env.DB.prepare("SELECT * FROM categories WHERE id=?").bind(id).first();
  if(!current)throw new HttpError(404,"הקטגוריה לא נמצאה");
  const parentId=body.parentId===undefined?current.parent_id:cleanOptional(body.parentId,80);
  if(parentId===id)throw new HttpError(400,"קטגוריה לא יכולה להיות קטגוריית אב של עצמה");
  if(parentId){const parent=await env.DB.prepare("SELECT id FROM categories WHERE id=?").bind(parentId).first();if(!parent)throw new HttpError(400,"קטגוריית האב אינה קיימת");}
  const status=["active","hidden"].includes(body.status)?body.status:current.status;
  const nameHe=body.nameHe===undefined?current.name_he:cleanText(body.nameHe,2,80,"שם הקטגוריה");
  const nameEn=body.nameEn===undefined?current.name_en:cleanOptional(body.nameEn,80);
  const icon=body.icon===undefined?current.icon:cleanOptional(body.icon,50);
  const imageUrl=body.imageUrl===undefined?current.image_url:validateAssetUrl(body.imageUrl);
  const synonyms=Array.isArray(body.synonyms)?body.synonyms.slice(0,50).map(x=>String(x).trim()).filter(Boolean):parseJsonArray(current.synonyms_json);
  const sortOrder=body.sortOrder===undefined?current.sort_order:Math.max(0,Math.min(9999,Number(body.sortOrder)||0));
  await env.DB.batch([
    env.DB.prepare("UPDATE categories SET parent_id=?,name_he=?,name_en=?,icon=?,image_url=?,synonyms_json=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(parentId,nameHe,nameEn,icon,imageUrl,JSON.stringify(synonyms),status,sortOrder,id),
    auditStatement(env,user.id,"category.update","category",id,{nameHe,parentId,status,sortOrder})
  ]);
  return json({category:{id,nameHe,nameEn,parentId,status,sortOrder}});
}

async function adminClosures(request,env){
  await requireAdmin(request,env);
  const rows=await env.DB.prepare("SELECT id,closure_type,title_he,title_en,starts_at,ends_at,active,created_at FROM platform_closures ORDER BY starts_at DESC LIMIT 200").all();
  return json({closures:rows.results.map(row=>({...row,active:Boolean(row.active)}))});
}

async function createAdminClosure(request,env){
  const user=await requireAdmin(request,env),body=await readJson(request),id=crypto.randomUUID();
  const type=["manual","holiday","maintenance"].includes(body.closureType)?body.closureType:"manual";
  const start=validateDateTime(body.startsAt,"מועד התחלה"),end=validateDateTime(body.endsAt,"מועד סיום");
  if(end<=start) throw new HttpError(400,"מועד הסיום חייב להיות אחרי מועד ההתחלה");
  await env.DB.batch([
    env.DB.prepare("INSERT INTO platform_closures(id,closure_type,title_he,title_en,starts_at,ends_at,active,created_by) VALUES(?,?,?,?,?,?,1,?)")
      .bind(id,type,cleanText(body.titleHe,2,120,"כותרת"),cleanOptional(body.titleEn,120),start,end,user.id),
    auditStatement(env,user.id,"platform.closure.create","platform_closure",id,{type,start,end})
  ]);
  return json({closure:{id,type,startsAt:start,endsAt:end}},201);
}

async function updateAdminClosure(request,env,id){
  const user=await requireAdmin(request,env),body=await readJson(request);
  const current=await env.DB.prepare("SELECT * FROM platform_closures WHERE id=?").bind(id).first();
  if(!current)throw new HttpError(404,"הסגירה לא נמצאה");
  const active=body.active===undefined?Boolean(current.active):Boolean(body.active);
  const titleHe=body.titleHe===undefined?current.title_he:cleanText(body.titleHe,2,120,"כותרת");
  const titleEn=body.titleEn===undefined?current.title_en:cleanOptional(body.titleEn,120);
  await env.DB.batch([
    env.DB.prepare("UPDATE platform_closures SET title_he=?,title_en=?,active=? WHERE id=?").bind(titleHe,titleEn,active?1:0,id),
    auditStatement(env,user.id,"platform.closure.update","platform_closure",id,{active,titleHe})
  ]);
  return json({closure:{id,active,titleHe,titleEn}});
}

async function adminSecurityEvents(request,env){
  await requireAdmin(request,env);
  const rows=await env.DB.prepare("SELECT id,user_id,event_type,severity,device_label,details_json,created_at FROM security_events ORDER BY created_at DESC LIMIT 250").all();
  return json({events:rows.results.map(row=>({...row,details:safeJsonObject(row.details_json)}))});
}

async function listCategories(env,url) {
  const locale=url.searchParams.get("locale")==="en"?"en":"he";
  const rows=await env.DB.prepare("SELECT id,parent_id,name_he,name_en,icon,image_url,synonyms_json FROM categories WHERE status='active' ORDER BY sort_order,name_he").all();
  return json({categories:rows.results.map(row=>{let synonyms=[];try{const parsed=JSON.parse(row.synonyms_json||"[]");if(Array.isArray(parsed))synonyms=parsed.filter(x=>typeof x==="string").slice(0,80)}catch{}return {...row,synonyms,name:locale==="en"&&row.name_en?row.name_en:row.name_he}})});
}

async function getNotificationPreferences(request,env) {
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare("SELECT notification_type,in_app,email,push,digest,quiet_start,quiet_end FROM notification_preferences WHERE user_id=? ORDER BY notification_type").bind(user.id).all();
  return json({preferences:rows.results});
}

async function saveNotificationPreferences(request,env) {
  const user=await requireUser(request,env), body=await readJson(request), rows=Array.isArray(body.preferences)?body.preferences:[];
  if(rows.length>40) throw new HttpError(400,"נשלחו יותר מדי הגדרות");
  const statements=[];
  for(const row of rows){ const type=cleanText(row.type,2,60,"סוג התראה"),digest=row.digest==="daily"?"daily":"immediate";
    statements.push(env.DB.prepare(`INSERT INTO notification_preferences(user_id,notification_type,in_app,email,push,digest,quiet_start,quiet_end) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,notification_type) DO UPDATE SET in_app=excluded.in_app,email=excluded.email,push=excluded.push,digest=excluded.digest,quiet_start=excluded.quiet_start,quiet_end=excluded.quiet_end`).bind(user.id,type,row.inApp===false?0:1,row.email===true?1:0,row.push===true?1:0,digest,cleanOptional(row.quietStart,5),cleanOptional(row.quietEnd,5))); }
  if(statements.length) await env.DB.batch(statements);
  return json({ok:true});
}

async function listSavedSearches(request,env){ const user=await requireUser(request,env); const rows=await env.DB.prepare("SELECT id,name,filters_json,notify,created_at FROM saved_searches WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(); return json({searches:rows.results.map(row=>({...row,filters:safeJsonObject(row.filters_json),notify:Boolean(row.notify)}))}); }
async function listSavedCategories(request,env){
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare("SELECT c.id,c.name_he,c.name_en FROM saved_categories s JOIN categories c ON c.id=s.category_id WHERE s.user_id=? AND c.status='active' ORDER BY c.sort_order,c.name_he").bind(user.id).all();
  return json({categories:rows.results});
}
async function favoritesOverview(request,env){
  const user=await requireUser(request,env);
  const queries=[
    env.DB.prepare("SELECT 'item' AS type,f.item_id AS id,i.title AS label,i.city AS detail FROM favorites f LEFT JOIN items i ON i.id=f.item_id WHERE f.user_id=? ORDER BY f.item_id LIMIT 100").bind(user.id),
    env.DB.prepare("SELECT 'organization' AS type,s.organization_id AS id,o.name AS label,o.city AS detail FROM saved_organizations s LEFT JOIN organizations o ON o.id=s.organization_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100").bind(user.id),
    env.DB.prepare("SELECT 'category' AS type,s.category_id AS id,c.name_he AS label,c.name_en AS labelEn,NULL AS detail FROM saved_categories s LEFT JOIN categories c ON c.id=s.category_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100").bind(user.id),
    env.DB.prepare("SELECT 'search' AS type,id,name AS label,filters_json AS detail FROM saved_searches WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(user.id),
    env.DB.prepare(`SELECT s.entity_type AS type,s.entity_id AS id,
      CASE s.entity_type WHEN 'item' THEN i.title WHEN 'organization' THEN o.name WHEN 'category' THEN c.name_he WHEN 'help_request' THEN h.title WHEN 'search' THEN z.name END AS label,
      NULL AS detail FROM saved_entities s
      LEFT JOIN items i ON s.entity_type='item' AND i.id=s.entity_id
      LEFT JOIN organizations o ON s.entity_type='organization' AND o.id=s.entity_id
      LEFT JOIN categories c ON s.entity_type='category' AND c.id=s.entity_id
      LEFT JOIN help_requests h ON s.entity_type='help_request' AND h.id=s.entity_id
      LEFT JOIN saved_searches z ON s.entity_type='search' AND z.id=s.entity_id AND z.user_id=s.user_id
      WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 100`).bind(user.id)
  ];
  const results=await env.DB.batch(queries),seen=new Set(),saved=[];
  for(const group of results)for(const row of group.results){const key=`${row.type}:${row.id}`;if(seen.has(key))continue;seen.add(key);saved.push({...row,label:row.label||"פריט שאינו זמין"});}
  return json({saved});
}
async function removeFromFavoritesOverview(request,env,type,id){
  const user=await requireUser(request,env);
  const columns={item:["favorites","item_id"],organization:["saved_organizations","organization_id"],category:["saved_categories","category_id"],search:["saved_searches","id"]};
  if(![...Object.keys(columns),"help_request"].includes(type))throw new HttpError(400,"סוג המועדף אינו תקין");
  const statements=[env.DB.prepare("DELETE FROM saved_entities WHERE user_id=? AND entity_type=? AND entity_id=?").bind(user.id,type,id)];
  if(columns[type]){const [table,column]=columns[type];statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id=? AND ${column}=?`).bind(user.id,id));}
  await env.DB.batch(statements);
  return json({ok:true});
}
async function saveCategory(request,env,id){
  const user=await requireUser(request,env);
  const category=await env.DB.prepare("SELECT id FROM categories WHERE id=? AND status='active'").bind(id).first();
  if(!category)throw new HttpError(404,"הקטגוריה לא נמצאה");
  await env.DB.prepare("INSERT OR IGNORE INTO saved_categories(user_id,category_id) VALUES(?,?)").bind(user.id,id).run();
  return json({saved:true});
}
async function removeSavedCategory(request,env,id){
  const user=await requireUser(request,env);
  await env.DB.prepare("DELETE FROM saved_categories WHERE user_id=? AND category_id=?").bind(user.id,id).run();
  return json({saved:false});
}
async function createSavedSearch(request,env){ const user=await requireUser(request,env),body=await readJson(request),id=crypto.randomUUID(),filters=body.filters&&typeof body.filters==="object"&&!Array.isArray(body.filters)?body.filters:{}; await env.DB.prepare("INSERT INTO saved_searches(id,user_id,name,filters_json,notify) VALUES(?,?,?,?,?)").bind(id,user.id,cleanText(body.name,2,80,"שם החיפוש"),JSON.stringify(filters).slice(0,4000),body.notify===false?0:1).run(); return json({search:{id}},201); }
async function updateSavedSearch(request,env,id){
  const user=await requireUser(request,env),body=await readJson(request);
  const filters=body.filters&&typeof body.filters==="object"&&!Array.isArray(body.filters)?body.filters:{};
  const result=await env.DB.prepare("UPDATE saved_searches SET name=?,filters_json=?,notify=? WHERE id=? AND user_id=?")
    .bind(cleanText(body.name,2,80,"שם החיפוש"),JSON.stringify(filters).slice(0,4000),body.notify===false?0:1,id,user.id).run();
  if(!result.meta.changes)throw new HttpError(404,"החיפוש השמור לא נמצא");
  return json({ok:true});
}

async function listItems(env, url) {
  // Repair the legacy review relation once per Worker isolate; then the
  // primary catalog query can return item ratings without a fallback.
  await ensureReviewBranchRatingSchema(env).catch(error => console.error("Review relation repair unavailable", error));
  const params = [];
  const maximumCatalogLimit = env.QA_CATALOG_LIMIT === "300" ? 300 : 100;
  const requestedCatalogLimit = Number.parseInt(url.searchParams.get("limit") || "", 10);
  const catalogLimit = Number.isFinite(requestedCatalogLimit)
    ? Math.max(1, Math.min(maximumCatalogLimit, requestedCatalogLimit))
    : maximumCatalogLimit;
  const where = ["i.status = 'active'", "i.is_free = 1", "o.status = 'approved'", "o.is_hidden = 0"];
  const query = cleanOptional(url.searchParams.get("q"), 120);
  const category = cleanOptional(url.searchParams.get("category"), 40);
  const city = cleanOptional(url.searchParams.get("city"), 80);
  const condition = cleanOptional(url.searchParams.get("condition"), 30);
  const subcategory = cleanOptional(url.searchParams.get("subcategory"), 80);
  const minimumRating = Number(url.searchParams.get("min_rating") || 0);
  const minimumQuantity = Math.max(0, Number(url.searchParams.get("quantity") || 0));
  const requestedDate = cleanOptional(url.searchParams.get("date"), 10);
  const availableOnly = url.searchParams.get("available_only") === "true";
  if (query) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR o.name LIKE ?)");
    const like = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    params.push(like, like, like);
  }
  if (category) { where.push("i.category = ?"); params.push(category); }
  if (city) { where.push("i.city = ?"); params.push(city); }
  if (condition) { where.push("i.condition = ?"); params.push(condition); }
  if (subcategory) { where.push("i.subcategory = ?"); params.push(subcategory); }
  if (minimumRating > 0) { where.push("COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.organization_id=o.id AND r.status='published'),0) >= ?"); params.push(Math.min(5,minimumRating)); }
  if (minimumQuantity > 0) { where.push("MAX(0,i.quantity-(SELECT COALESCE(SUM(lq.quantity),0) FROM loan_requests lq WHERE lq.item_id=i.id AND lq.status IN ('pending','approved','collected') AND lq.requested_from <= strftime('%Y-%m-%dT%H:%M','now') AND lq.requested_until > strftime('%Y-%m-%dT%H:%M','now'))-(SELECT COALESCE(SUM(ib.quantity),0) FROM inventory_blocks ib WHERE ib.item_id=i.id AND ib.starts_at <= strftime('%Y-%m-%dT%H:%M','now') AND ib.ends_at > strftime('%Y-%m-%dT%H:%M','now'))) >= ?"); params.push(Math.min(999,minimumQuantity)); }
  if (availableOnly) where.push("i.availability_status = 'available'");
  if (requestedDate) {
    const date = validateDate(requestedDate, "תאריך החיפוש");
    where.push(`(SELECT COUNT(*) FROM loan_requests lr
      WHERE lr.item_id = i.id AND lr.status IN ('approved','collected')
      AND lr.requested_from <= ? AND lr.requested_until >= ?) < i.quantity`);
    params.push(date, date);
  }
  let result;
  try {
    result = await env.DB.prepare(`
      SELECT i.*, o.id AS org_id, o.name AS org_name,
        o.last_active_at AS org_last_active_at,
        (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_review_count,
        (SELECT ROUND(AVG(r.item_rating),1) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_rating,
        (SELECT COUNT(*) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_review_count,
        MAX(0, i.quantity
          - (SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr WHERE lr.item_id=i.id AND lr.status IN ('pending','approved','collected') AND lr.requested_from <= strftime('%Y-%m-%dT%H:%M','now') AND lr.requested_until > strftime('%Y-%m-%dT%H:%M','now'))
          - (SELECT COALESCE(SUM(ib.quantity),0) FROM inventory_blocks ib WHERE ib.item_id=i.id AND ib.starts_at <= strftime('%Y-%m-%dT%H:%M','now') AND ib.ends_at > strftime('%Y-%m-%dT%H:%M','now'))) AS available_count
      FROM items i JOIN organizations o ON o.id = i.organization_id
      WHERE ${where.join(" AND ")}
      ORDER BY CASE i.availability_status WHEN 'available' THEN 0 ELSE 1 END, i.created_at DESC
      LIMIT ${catalogLimit}
    `).bind(...params).all();
  } catch (error) {
    console.error("Enhanced catalog query failed; serving compatible catalog", error);
    const fallbackWhere = ["i.status = 'active'", "i.is_free = 1", "o.status = 'approved'"];
    const fallbackParams = [];
    if (query) {
      fallbackWhere.push("(i.title LIKE ? OR i.description LIKE ? OR o.name LIKE ?)");
      const like = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
      fallbackParams.push(like, like, like);
    }
    if (category) { fallbackWhere.push("i.category = ?"); fallbackParams.push(category); }
    if (city) { fallbackWhere.push("i.city = ?"); fallbackParams.push(city); }
    if (condition) { fallbackWhere.push("i.condition = ?"); fallbackParams.push(condition); }
    if (availableOnly) fallbackWhere.push("i.availability_status = 'available'");
    result = await env.DB.prepare(`
      SELECT i.*, o.id AS org_id, o.name AS org_name,
        NULL AS org_last_active_at, NULL AS org_rating, 0 AS org_review_count,
        NULL AS item_rating, 0 AS item_review_count, i.quantity AS available_count
      FROM items i JOIN organizations o ON o.id = i.organization_id
      WHERE ${fallbackWhere.join(" AND ")}
      ORDER BY CASE i.availability_status WHEN 'available' THEN 0 ELSE 1 END, i.created_at DESC
      LIMIT ${catalogLimit}
    `).bind(...fallbackParams).all();
  }
  return json({ items: result.results.map(mapItem) });
}

async function getItem(env, id) {
  await ensureReviewBranchRatingSchema(env).catch(error => console.error("Review relation repair unavailable", error));
  const row = await env.DB.prepare(`
    SELECT i.*, o.id AS org_id, o.name AS org_name,
      o.last_active_at AS org_last_active_at,
      (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_review_count,
      (SELECT ROUND(AVG(r.item_rating),1) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_review_count,
      MAX(0, i.quantity - (SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr WHERE lr.item_id=i.id AND lr.status IN ('pending','approved','collected'))) AS available_count
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND i.status = 'active' AND i.is_free = 1 AND o.status = 'approved' AND o.is_hidden = 0
  `).bind(id).first();
  if (!row) throw new HttpError(404, "הפריט לא נמצא");
  return json({ item: mapItem(row) });
}

async function discovery(env, url) {
  const query = cleanOptional(url.searchParams.get("q"), 80);
  const like = `%${String(query || "").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const orgCity=cleanOptional(url.searchParams.get("orgCity"),80),orgCategory=cleanOptional(url.searchParams.get("orgCategory"),80),orgQuery=cleanOptional(url.searchParams.get("orgQuery"),100);
  const minRating=Math.max(0,Math.min(5,Number(url.searchParams.get("minRating"))||0)),availableOnly=url.searchParams.get("orgAvailable")==="1";
  const orgWhere=["o.status='approved'","o.is_hidden=0","o.deleted_at IS NULL","EXISTS (SELECT 1 FROM items vi WHERE vi.organization_id=o.id AND vi.status='active' AND vi.deleted_at IS NULL)"],orgBind=[];
  if(orgCity){orgWhere.push("o.city=?");orgBind.push(orgCity)}
  if(orgCategory){orgWhere.push("EXISTS (SELECT 1 FROM items ci WHERE ci.organization_id=o.id AND ci.status='active' AND ci.deleted_at IS NULL AND ci.category=?)");orgBind.push(orgCategory)}
  if(orgQuery){const oq=`%${orgQuery.replaceAll("%","\\%").replaceAll("_","\\_")}%`;orgWhere.push("(o.name LIKE ? ESCAPE '\\' OR o.description LIKE ? ESCAPE '\\' OR o.city LIKE ? ESCAPE '\\')");orgBind.push(oq,oq,oq)}
  if(availableOnly)orgWhere.push("EXISTS (SELECT 1 FROM items ai WHERE ai.organization_id=o.id AND ai.status='active' AND ai.deleted_at IS NULL AND ai.availability_status='available')");
  if(minRating>0){orgWhere.push("COALESCE((SELECT AVG(rr.rating) FROM reviews rr WHERE rr.organization_id=o.id AND rr.status='published'),0)>=?");orgBind.push(minRating)}
  const [categories, cities, suggestions, organizations] = await env.DB.batch([
    env.DB.prepare(`SELECT category,COUNT(*) AS count FROM items WHERE status='active' AND is_free=1 GROUP BY category ORDER BY count DESC`),
    env.DB.prepare(`SELECT city,COUNT(*) AS count FROM items WHERE status='active' AND is_free=1 GROUP BY city ORDER BY count DESC LIMIT 80`),
    env.DB.prepare(`SELECT DISTINCT title FROM items WHERE status='active' AND (?='' OR title LIKE ?) ORDER BY updated_at DESC LIMIT 8`).bind(query || "", like),
    env.DB.prepare(`SELECT o.id,o.name,o.city,o.description,o.last_active_at,
      COUNT(DISTINCT i.id) AS item_count,
      ROUND(AVG(r.rating),1) AS rating,COUNT(DISTINCT r.id) AS review_count,
      SUM(CASE WHEN i.availability_status='available' THEN 1 ELSE 0 END) AS available_items
      FROM organizations o LEFT JOIN items i ON i.organization_id=o.id AND i.status='active' AND i.deleted_at IS NULL
      LEFT JOIN reviews r ON r.organization_id=o.id AND r.status='published'
      WHERE ${orgWhere.join(" AND ")} GROUP BY o.id ORDER BY rating DESC,available_items DESC,item_count DESC LIMIT 100`).bind(...orgBind)
  ]);
  return json({ categories: categories.results, cities: cities.results, suggestions: suggestions.results.map(row => row.title), organizations: organizations.results,organizationFilters:{city:orgCity||"",category:orgCategory||"",query:orgQuery||"",minRating,availableOnly} });
}

async function getPublicOrganization(env, id) {
  const organization = await env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,
    o.website_url,o.hours_json,o.service_area,o.pickup_options,o.last_active_at,o.verified_phone,o.verified_address,
    ROUND(AVG(r.rating),1) AS rating,COUNT(DISTINCT r.id) AS review_count
    FROM organizations o LEFT JOIN reviews r ON r.organization_id=o.id AND r.status='published'
    WHERE o.id=? AND o.status='approved' AND o.is_hidden=0 AND EXISTS (SELECT 1 FROM items pi WHERE pi.organization_id=o.id AND pi.status='active' AND pi.deleted_at IS NULL) GROUP BY o.id`).bind(id).first();
  if (!organization) throw new HttpError(404, "הגמ״ח לא נמצא");
  await ensureReviewBranchRatingSchema(env).catch(error => console.error("Review relation repair unavailable", error));
  // Repair a missing category relation for older deployments, while allowing
  // valid public sections to load if unrelated optional schema work fails.
  await ensureCompletePlatformSchema(env).catch(error => console.error("Public organization relation repair unavailable", { organizationId: id, error }));
  const queries = [
    env.DB.prepare(`SELECT i.*,o.id AS org_id,o.name AS org_name,o.last_active_at AS org_last_active_at,
      NULL AS org_rating,0 AS org_review_count,
      (SELECT ROUND(AVG(r.item_rating),1) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.item_id=i.id AND r.status='published' AND r.item_rating IS NOT NULL) AS item_review_count,
      i.quantity AS available_count FROM items i JOIN organizations o ON o.id=i.organization_id
      WHERE i.organization_id=? AND i.status='active' ORDER BY i.availability_status,i.updated_at DESC`).bind(id),
    env.DB.prepare(`SELECT r.id,r.rating,r.item_rating,r.service_rating,r.branch_rating,r.comment,r.created_at,r.updated_at,r.helpful_count,r.organization_response,r.organization_response_at,
      substr(u.full_name,1,instr(u.full_name||' ',' ')-1) AS author_name,
      i.title AS item_title,lr.requested_from,lr.returned_at,b.name AS branch_name
      FROM reviews r JOIN users u ON u.id=r.author_id
      LEFT JOIN loan_requests lr ON lr.id=r.request_id
      LEFT JOIN items i ON i.id=lr.item_id
      LEFT JOIN organization_branches b ON b.id=r.branch_id
      WHERE r.organization_id=? AND r.status='published' ORDER BY r.created_at DESC LIMIT 30`).bind(id),
    env.DB.prepare(`SELECT c.id,c.name_he,c.name_en,c.icon,c.image_url FROM organization_categories oc JOIN categories c ON c.id=oc.category_id WHERE oc.organization_id=? AND c.status='active' ORDER BY c.sort_order,c.name_he`).bind(id)
  ];
  const [itemsResult,reviewsResult,categoriesResult] = await Promise.allSettled(queries.map(query => query.all()));
  for (const [section,result] of [["items",itemsResult],["reviews",reviewsResult],["categories",categoriesResult]]) {
    if (result.status === "rejected") console.error("Public organization section unavailable", { organizationId: id, section, error: result.reason });
  }
  let items = itemsResult.status === "fulfilled" ? itemsResult.value.results.map(mapItem) : [];
  if (itemsResult.status === "rejected") {
    // Public pages must still show listed equipment while optional review and
    // inventory migrations are being reconciled on an older D1 database.
    try {
      const compatibleItems = await env.DB.prepare(`SELECT i.*,o.id AS org_id,o.name AS org_name,i.quantity AS available_count
        FROM items i JOIN organizations o ON o.id=i.organization_id
        WHERE i.organization_id=? AND i.status='active' ORDER BY i.updated_at DESC`).bind(id).all();
      items = compatibleItems.results.map(mapItem);
    } catch (error) {
      console.error("Compatible public organization items unavailable", { organizationId: id, error });
    }
  }
  let reviews = reviewsResult.status === "fulfilled" ? reviewsResult.value.results : [];
  if (reviewsResult.status === "rejected") {
    try {
      const compatibleReviews = await env.DB.prepare(`SELECT r.id,r.rating,r.comment,r.created_at,
        substr(u.full_name,1,instr(u.full_name||' ',' ')-1) AS author_name
        FROM reviews r JOIN users u ON u.id=r.author_id
        WHERE r.organization_id=? AND r.status='published' ORDER BY r.created_at DESC LIMIT 30`).bind(id).all();
      reviews = compatibleReviews.results;
    } catch (error) {
      console.error("Compatible public organization reviews unavailable", { organizationId: id, error });
    }
  }
  const categories = categoriesResult.status === "fulfilled" ? categoriesResult.value.results : [];
  const partialSections = [["items", itemsResult], ["reviews", reviewsResult], ["categories", categoriesResult]].filter(([,result]) => result.status === "rejected").map(([section]) => section);
  return json({ organization: { ...organization, verified_phone: Boolean(organization.verified_phone), verified_address: Boolean(organization.verified_address), hours: safeJsonObject(organization.hours_json), pickupOptions: parseJsonArray(organization.pickup_options), categories }, items, reviews, partial: partialSections.length > 0, partialSections });
}

async function toggleSavedOrganization(request, env, organizationId, save) {
  const user = await requireUser(request, env);
  const exists = await env.DB.prepare("SELECT id FROM organizations WHERE id=? AND status='approved'").bind(organizationId).first();
  if (!exists) throw new HttpError(404, "הגמ״ח לא נמצא");
  if (save) await env.DB.prepare("INSERT OR IGNORE INTO saved_organizations(user_id,organization_id) VALUES (?,?)").bind(user.id, organizationId).run();
  else await env.DB.prepare("DELETE FROM saved_organizations WHERE user_id=? AND organization_id=?").bind(user.id, organizationId).run();
  return json({ saved: save });
}

async function recordOrganizationView(request,env,organizationId){
  const user=await requireUser(request,env);
  const org=await env.DB.prepare("SELECT id FROM organizations WHERE id=? AND status='approved' AND is_hidden=0 AND deleted_at IS NULL").bind(organizationId).first();
  if(!org)throw new HttpError(404,"הגמ״ח לא נמצא");
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO recently_viewed_organizations(user_id,organization_id,viewed_at) VALUES(?,?,?)
    ON CONFLICT(user_id,organization_id) DO UPDATE SET viewed_at=excluded.viewed_at`).bind(user.id,organizationId,now).run();
  await env.DB.prepare("DELETE FROM recently_viewed_organizations WHERE user_id=? AND organization_id NOT IN (SELECT organization_id FROM recently_viewed_organizations WHERE user_id=? ORDER BY viewed_at DESC LIMIT 20)").bind(user.id,user.id).run();
  return json({ok:true,viewedAt:now},201);
}

async function listHelpRequests(env, url) {
  const city = cleanOptional(url.searchParams.get("city"), 80);
  const category = cleanOptional(url.searchParams.get("category"), 40);
  const requestId = cleanOptional(url.searchParams.get("id"), 100);
  const page = Math.max(1,Math.min(1000,Number.parseInt(url.searchParams.get("page")||"1",10)||1)),limit=12;
  const where = ["h.status='open'"]; const params = [];
  if (requestId) { where.push("h.id=?"); params.push(requestId); }
  if (city) { where.push("h.city=?"); params.push(city); }
  if (category) { where.push("h.category=?"); params.push(category); }
  const [count,result]=await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS total FROM help_requests h WHERE ${where.join(" AND ")}`).bind(...params),
    env.DB.prepare(`SELECT h.id,h.title,h.description,h.category,h.city,h.urgency,h.requested_from,h.requested_until,h.distance_km,h.created_at,substr(u.full_name,1,instr(u.full_name||' ',' ')-1) AS requester_name
      FROM help_requests h JOIN users u ON u.id=h.requester_id WHERE ${where.join(" AND ")} ORDER BY h.urgency='urgent' DESC,h.created_at DESC LIMIT ? OFFSET ?`).bind(...params,limit,(page-1)*limit)
  ]);
  return json({ requests: result.results,page,total:Number(count.results[0]?.total||0),pageSize:limit });
}

async function createHelpRequest(request, env) {
  const user = await requireUser(request, env); const body = await readJson(request);
  const category = cleanOptional(body.category, 80);
  if (category) {
    const categoryRow=await env.DB.prepare("SELECT id FROM categories WHERE status='active' AND (name_he=? OR id=?) LIMIT 1").bind(category,category).first();
    if(!categoryRow && !CATEGORIES.has(category)) throw new HttpError(400,"קטגוריה אינה תקינה");
  }
  const urgency = body.urgency === "urgent" ? "urgent" : "normal"; const id = crypto.randomUUID();
  let requestedFrom=body.requestedFrom?validateDateTime(body.requestedFrom,"מועד התחלה"):null,requestedUntil=body.requestedUntil?validateDateTime(body.requestedUntil,"מועד סיום"):null;
  if(requestedFrom&&requestedUntil&&Date.parse(requestedUntil)<=Date.parse(requestedFrom))throw new HttpError(400,"מועד הסיום חייב להיות אחרי מועד ההתחלה");
  if(requestedUntil&&Date.parse(requestedUntil)<=Date.now())throw new HttpError(400,"מועד הסיום חייב להיות בעתיד");
  const distanceKm=body.distanceKm==null||body.distanceKm===""?null:Number(body.distanceKm);
  if(distanceKm!==null&&(!Number.isFinite(distanceKm)||distanceKm<1||distanceKm>500))throw new HttpError(400,"טווח המרחק חייב להיות בין 1 ל-500 ק״מ");
  const values = [id,user.id,cleanText(body.title,2,120,"מה צריך"),cleanText(body.description,10,800,"תיאור"),category,cleanText(body.city,2,80,"עיר"),urgency,requestedFrom,requestedUntil,distanceKm];
  await env.DB.prepare("INSERT INTO help_requests(id,requester_id,title,description,category,city,urgency,requested_from,requested_until,distance_km) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(...values).run();
  return json({ request: { id, status: "open",requestedFrom,requestedUntil,distanceKm } }, 201);
}

let reviewBranchRatingSchemaPromise = null;
async function ensureReviewBranchRatingSchema(env) {
  if (reviewBranchRatingSchemaPromise) return reviewBranchRatingSchemaPromise;
  reviewBranchRatingSchemaPromise = (async () => {
    const columns = new Set((await env.DB.prepare("PRAGMA table_info(reviews)").all()).results.map(column => column.name));
    for (const [name, sql] of [
      ["item_id", "ALTER TABLE reviews ADD COLUMN item_id TEXT REFERENCES items(id) ON DELETE CASCADE"],
      ["branch_rating", "ALTER TABLE reviews ADD COLUMN branch_rating INTEGER CHECK (branch_rating BETWEEN 1 AND 5)"]
    ]) {
      if (columns.has(name)) continue;
      try { await env.DB.prepare(sql).run(); }
      catch (error) { if (!/duplicate column name/i.test(String(error))) throw error; }
    }
    if (!columns.has("item_id")) {
      await env.DB.prepare("UPDATE reviews SET item_id=(SELECT lr.item_id FROM loan_requests lr WHERE lr.id=reviews.request_id) WHERE item_id IS NULL AND request_id IS NOT NULL").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS reviews_item_idx ON reviews(item_id,status,created_at DESC)").run();
    }
    return true;
  })().catch(error => {
    reviewBranchRatingSchemaPromise = null;
    throw error;
  });
  return reviewBranchRatingSchemaPromise;
}

async function createReview(request, env) {
  const user = await requireUser(request, env); const body = await readJson(request);
  await ensureReviewBranchRatingSchema(env);
  const requestId = cleanText(body.requestId,1,100,"בקשה");
  const rating = Number(body.organizationRating); const itemRating = Number(body.itemRating); const serviceRating = Number(body.serviceRating); const branchRating = body.branchRating==null?null:Number(body.branchRating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "דירוג הגמ״ח חייב להיות בין 1 ל־5");
  if (!Number.isInteger(itemRating) || itemRating < 1 || itemRating > 5) throw new HttpError(400, "דירוג הפריט חייב להיות בין 1 ל־5");
  if (!Number.isInteger(serviceRating) || serviceRating < 1 || serviceRating > 5) throw new HttpError(400, "דירוג השירות חייב להיות בין 1 ל־5");
  if (branchRating!==null && (!Number.isInteger(branchRating)||branchRating<1||branchRating>5)) throw new HttpError(400,"דירוג הסניף חייב להיות בין 1 ל־5");
  const row = await env.DB.prepare(`SELECT lr.borrower_id,lr.status,lr.branch_id,i.id AS item_id,o.id AS organization_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`).bind(requestId).first();
  if (!row || row.borrower_id !== user.id || row.status !== "returned") throw new HttpError(403, "אפשר לדרג רק השאלה שהושלמה");
  try { const id=crypto.randomUUID(),editedUntil=new Date(Date.now()+7*86400000).toISOString(); await env.DB.prepare("INSERT INTO reviews(id,request_id,author_id,organization_id,item_id,rating,item_rating,service_rating,branch_id,branch_rating,comment,edited_until) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,requestId,user.id,row.organization_id,row.item_id,rating,itemRating,serviceRating,row.branch_id||null,row.branch_id?(branchRating||rating):null,cleanOptional(body.comment,800),editedUntil).run(); return json({ review:{id,organizationRating:rating,itemRating,serviceRating,branchId:row.branch_id||null,branchRating:row.branch_id?(branchRating||rating):null,editedUntil}},201); }
  catch (error) { if (String(error).toLowerCase().includes("unique")) throw new HttpError(409,"כבר דירגתם את ההשאלה הזו"); throw error; }
}

async function recordAnalytics(request, env) {
  const body = await readJson(request); const allowed = new Set(["search","no_results","item_view","request_created","share"]);
  if (!allowed.has(body.eventType)) throw new HttpError(400,"אירוע אינו תקין");
  const user = await currentUser(request, env);
  const source=cleanOptional(body.source,80),referrer=cleanOptional(body.referrer,180),pagePath=cleanOptional(body.pagePath,180);
  await env.DB.prepare("INSERT INTO analytics_events(id,user_id,event_type,query,city,category,entity_id,source,referrer,page_path) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),user?.id||null,body.eventType,cleanOptional(body.query,120),cleanOptional(body.city,80),cleanOptional(body.category,40),cleanOptional(body.entityId,100),source,referrer,pagePath).run();
  return json({ok:true},201);
}

async function addFavorite(request, env, itemId) {
  const user = await requireUser(request, env);
  const item = await env.DB.prepare("SELECT id FROM items WHERE id = ? AND status = 'active'").bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  await env.DB.prepare("INSERT OR IGNORE INTO favorites (user_id,item_id) VALUES (?,?)").bind(user.id, itemId).run();
  return json({ favorite: true });
}

async function removeFavorite(request, env, itemId) {
  const user = await requireUser(request, env);
  await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND item_id = ?").bind(user.id, itemId).run();
  return json({ favorite: false });
}

async function createOrganization(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const category = cleanText(body.primaryCategory, 2, 40, "תחום");
  const categoryRow=await env.DB.prepare("SELECT id FROM categories WHERE status='active' AND (name_he=? OR id=?) LIMIT 1").bind(category,category).first();
  if (!categoryRow && !CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור תחום תקין");
  const values = {
    name: cleanText(body.name, 2, 90, "שם הגמ״ח"),
    city: cleanText(body.city, 2, 80, "עיר"),
    neighborhood: cleanOptional(body.neighborhood, 80),
    description: cleanText(body.description, 10, 600, "תיאור"),
    phone: validatePhone(body.phone),
    address: cleanText(body.address, 5, 180, "כתובת מלאה"),
    serviceArea: cleanOptional(body.serviceArea, 180),
    hoursJson: requiredHours(body.hours),
    pickupOptions: sanitizePickupOptions(body.pickupOptions)
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organizations (id,owner_id,name,primary_category,city,neighborhood,description,address,website_url,service_area,hours_json,pickup_options,last_active_at,status,verified,is_hidden,organization_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'approved',0,1,?)")
      .bind(id, user.id, values.name, category, values.city, values.neighborhood, values.description, values.address, null, values.serviceArea, values.hoursJson, values.pickupOptions, new Date().toISOString(),["private","family","community","nonprofit","business","authority"].includes(body.organizationType)?body.organizationType:"private"),
    env.DB.prepare("INSERT INTO organization_contacts (organization_id,contact_phone) VALUES (?,?)").bind(id, values.phone)
  ]);
  return json({ organization: { id, ...values, primaryCategory: category, status: "approved" } }, 201);
}

async function updateOrganization(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await env.DB.prepare(`SELECT o.*, c.contact_phone FROM organizations o
    LEFT JOIN organization_contacts c ON c.organization_id = o.id
    WHERE o.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!existing) throw new HttpError(404, "הגמ״ח לא נמצא או שאין הרשאה לערוך אותו");

  if (typeof body.hidden === "boolean" && Object.keys(body).length === 1) {
    await env.DB.prepare("UPDATE organizations SET is_hidden = ?, updated_at = ? WHERE id = ?")
      .bind(body.hidden ? 1 : 0, new Date().toISOString(), id).run();
    return json({ id, hidden: body.hidden, status: existing.status });
  }

  const category = cleanText(body.primaryCategory, 2, 40, "תחום");
  const categoryRow=await env.DB.prepare("SELECT id FROM categories WHERE status='active' AND (name_he=? OR id=?) LIMIT 1").bind(category,category).first();
  if (!categoryRow && !CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור תחום תקין");
  const values = {
    name: cleanText(body.name, 2, 90, "שם הגמ״ח"),
    city: cleanText(body.city, 2, 80, "עיר"),
    neighborhood: cleanOptional(body.neighborhood, 80),
    description: cleanText(body.description, 10, 600, "תיאור"),
    phone: validatePhone(body.phone),
    address: cleanText(body.address, 5, 180, "כתובת מלאה"),
    serviceArea: cleanOptional(body.serviceArea, 180), hoursJson: requiredHours(body.hours), pickupOptions: sanitizePickupOptions(body.pickupOptions)
  };
  const status = existing.status === "rejected" && user.role !== "admin" ? "rejected" : "approved";
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE organizations SET name = ?, primary_category = ?, city = ?, neighborhood = ?, description = ?,address=?,website_url=?,service_area=?,hours_json=?,pickup_options=?,last_active_at=?,organization_type=?,
      status = ?, verified = 0, updated_at = ? WHERE id = ?`)
      .bind(values.name, category, values.city, values.neighborhood, values.description,values.address,null,values.serviceArea,values.hoursJson,values.pickupOptions,now,["private","family","community","nonprofit","business","authority"].includes(body.organizationType)?body.organizationType:(existing.organization_type||"private"),status, now, id),
    env.DB.prepare("UPDATE organization_contacts SET contact_phone = ? WHERE organization_id = ?").bind(values.phone, id)
  ]);
  return json({ organization: { id, ...values, primaryCategory: category, status, hidden: Boolean(existing.is_hidden) } });
}

function positiveInt(value,fallback,min,max,label){ const n=value===""||value==null?fallback:Number(value); if(!Number.isInteger(n)||n<min||n>max) throw new HttpError(400,`${label} אינו תקין`); return n; }
function moneyAgorot(value){ const n=Number(value); if(!Number.isFinite(n)||n<0||n>1000000) throw new HttpError(400,"סכום הפיקדון אינו תקין"); return Math.round(n*100); }

async function notifyMatchingSavedSearches(env,item){const rows=await env.DB.prepare("SELECT id,user_id,name,filters_json FROM saved_searches WHERE notify=1").all();for(const row of rows.results||[]){const f=safeJsonObject(row.filters_json),q=String(f.query||"").trim().toLowerCase(),matchesQuery=!q||[item.title,item.description,item.organizationName].some(v=>String(v||"").toLowerCase().includes(q)),matchesCity=!f.city||String(f.city)===String(item.city),matchesCategory=!f.category||String(f.category)===String(item.category),matchesCondition=!f.condition||String(f.condition)===String(item.condition);if(matchesQuery&&matchesCity&&matchesCategory&&matchesCondition)await notificationStatement(env,row.user_id,"status","פריט חדש מתאים לחיפוש שמור",`${item.title} נוסף ומתאים לחיפוש "${row.name}".`,null).run()}}

async function createItem(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const organizationId = cleanText(body.organizationId, 1, 100, "גמ״ח");
  const organization = await env.DB.prepare("SELECT * FROM organizations WHERE id = ? AND owner_id = ? AND status IN ('pending','approved')")
    .bind(organizationId, user.id).first();
  if (!organization) throw new HttpError(403, "אין הרשאה לפרסם בגמ״ח הזה");
  const category = cleanText(body.category, 2, 40, "קטגוריה");
  const conditionInfo = normalizeProductCondition(cleanText(body.condition, 2, 30, "מצב הפריט"));
  const condition = conditionInfo.base;
  const categoryRow=await env.DB.prepare("SELECT id FROM categories WHERE status='active' AND (name_he=? OR id=?) LIMIT 1").bind(category,category).first();
  if (!categoryRow && !CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור קטגוריה תקינה");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new HttpError(400, "כמות הפריטים אינה תקינה");
  const title = cleanText(body.title, 2, 120, "שם הפריט");
  const duplicate = await env.DB.prepare("SELECT id FROM items WHERE organization_id = ? AND lower(trim(title)) = lower(trim(?)) AND category = ? AND status != 'archived' LIMIT 1")
    .bind(organizationId, title, category).first();
  if (duplicate) throw new HttpError(409, "כבר קיים בגמ״ח פריט פעיל בשם הזה ובאותה קטגוריה");
  const minLoanMinutes=positiveInt(body.minLoanMinutes,60,1,525600,"משך מינימלי");
  const maxLoanMinutes=positiveInt(body.maxLoanMinutes,10080,1,525600,"משך מקסימלי");
  if(maxLoanMinutes<minLoanMinutes) throw new HttpError(400,"משך ההשאלה המקסימלי חייב להיות גדול או שווה למינימלי");
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO items (id,organization_id,title,category,description,condition,condition_detail,quantity,loan_conditions,city,neighborhood,item_type,subcategory,tags_json,pickup_method,inventory_updated_at,
      min_loan_minutes,max_loan_minutes,booking_notice_minutes,turnaround_minutes,booking_horizon_days,approval_mode,deposit_required,deposit_amount_agorot,
      publish_at,max_per_user,preparation_minutes,max_loan_days,service_radius_km,status,availability_status,is_free,icon,cover_color)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active','available',1,'box','#e6f2ef')
  `).bind(
    id,
    organizationId,
    title,
    category,
    cleanText(body.description, 10, 1200, "תיאור"),
    condition,
    conditionInfo.detail,
    quantity,
    cleanOptional(body.loanConditions, 300),
    organization.city,
    organization.neighborhood,
    sanitizeItemType(body.itemType), cleanOptional(body.subcategory, 80), JSON.stringify(sanitizeTags(body.tags)), sanitizePickupMethod(body.pickupMethod), new Date().toISOString(),
    minLoanMinutes, maxLoanMinutes,
    positiveInt(body.bookingNoticeMinutes,0,0,525600,"זמן התראה"), positiveInt(body.turnaroundMinutes,0,0,10080,"זמן התארגנות"),
    positiveInt(body.bookingHorizonDays,365,1,1095,"טווח הזמנה"), body.approvalMode==="automatic"?"automatic":"manual",
    body.depositRequired?1:0, body.depositRequired?moneyAgorot(body.depositAmount):0,
    body.publishAt?validateDateTime(body.publishAt,"מועד פרסום"):null,
    body.maxPerUser?positiveInt(body.maxPerUser,1,1,999,"מגבלה למשתמש"):null,
    positiveInt(body.preparationMinutes,0,0,10080,"זמן הכנה"),
    body.maxLoanDays?positiveInt(body.maxLoanDays,1,1,3650,"ימי השאלה מרביים"):null,
    body.serviceRadiusKm?Math.max(0.1,Math.min(500,Number(body.serviceRadiusKm))):null
  ).run();
  if(body.bookingHorizonMinutes!==undefined)await env.DB.prepare("UPDATE items SET booking_horizon_minutes=? WHERE id=?").bind(positiveInt(body.bookingHorizonMinutes,525600,1,1576800,"טווח הזמנה"),id).run();
  const publishAt=body.publishAt?validateDateTime(body.publishAt,"מועד פרסום"):null;
  const publishStatus=publishAt&&Date.parse(publishAt)>Date.now()?"pending":"active";
  if(publishStatus!=="active") await env.DB.prepare("UPDATE items SET status='pending' WHERE id=?").bind(id).run();
  else await env.DB.prepare("UPDATE organizations SET is_hidden=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),organizationId).run();
  await env.DB.prepare("INSERT INTO organization_onboarding(organization_id,first_item_added) VALUES(?,1) ON CONFLICT(organization_id) DO UPDATE SET first_item_added=1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(organizationId).run().catch(()=>{});
  if(publishStatus==="active"){await notifyMatchingSavedSearches(env,{id,title,description:body.description,organizationName:organization.name,city:organization.city,category,condition});await notifySavedFollowers(env,{itemId:id,organizationId,category,title,event:"created"});}
  return json({ item: { id, status: publishStatus,publishAt } }, 201);
}

async function updateItem(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await env.DB.prepare(`SELECT i.*, o.owner_id, o.city AS org_city, o.neighborhood AS org_neighborhood
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!existing) throw new HttpError(404, "הפריט לא נמצא או שאין הרשאה לערוך אותו");

  if (typeof body.archived === "boolean" && Object.keys(body).length === 1) {
    if (body.archived) {
      const active = await env.DB.prepare("SELECT id FROM loan_requests WHERE item_id = ? AND status IN ('pending','approved','collected') LIMIT 1").bind(id).first();
      if (active) throw new HttpError(409, "אי אפשר להסתיר פריט בזמן שיש לו בקשה או השאלה פעילה");
    }
    const status = body.archived ? "archived" : "pending";
    await env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
    return json({ id, status });
  }

  const category = cleanText(body.category, 2, 40, "קטגוריה");
  const conditionInfo = normalizeProductCondition(cleanText(body.condition, 2, 30, "מצב הפריט"));
  const condition = conditionInfo.base;
  const categoryRow=await env.DB.prepare("SELECT id FROM categories WHERE status='active' AND (name_he=? OR id=?) LIMIT 1").bind(category,category).first();
  if (!categoryRow && !CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור קטגוריה תקינה");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new HttpError(400, "כמות הפריטים אינה תקינה");
  const values = {
    title: cleanText(body.title, 2, 120, "שם הפריט"),
    description: cleanText(body.description, 10, 1200, "תיאור"),
    loanConditions: cleanOptional(body.loanConditions, 300), itemType: sanitizeItemType(body.itemType), pickupMethod: sanitizePickupMethod(body.pickupMethod),
    subcategory: cleanOptional(body.subcategory,80), tagsJson: JSON.stringify(sanitizeTags(body.tags))
  };
  const changed = values.title !== existing.title || category !== existing.category || values.description !== existing.description ||
    condition !== existing.condition || quantity !== Number(existing.quantity) || (values.loanConditions || null) !== (existing.loan_conditions || null) || values.itemType !== (existing.item_type||"loan") || values.pickupMethod !== (existing.pickup_method||"pickup") || values.subcategory !== (existing.subcategory||null) || values.tagsJson !== (existing.tags_json||"[]");
  const status = existing.status==="archived"?"archived":"active";
  const materialChange = changed && ["title","category","description","condition","quantity","loan_conditions"].some(key=>{
    const next={title:values.title,category,description:values.description,condition,quantity,loan_conditions:values.loanConditions}[key];
    return String(next??"")!==String(existing[key]??"");
  });
  await env.DB.prepare(`UPDATE items SET title = ?, category = ?, description = ?, condition = ?, condition_detail=?, quantity = ?, loan_conditions = ?,item_type=?,pickup_method=?,subcategory=?,tags_json=?,inventory_updated_at=?,
    city = ?, neighborhood = ?, status = ?, material_version=material_version+?,last_material_change_at=CASE WHEN ? THEN ? ELSE last_material_change_at END, updated_at = ? WHERE id = ?`).bind(
    values.title, category, values.description, condition, conditionInfo.detail, quantity, values.loanConditions,values.itemType,values.pickupMethod,values.subcategory,values.tagsJson,new Date().toISOString(),
    existing.org_city, existing.org_neighborhood, status, materialChange?1:0,materialChange?1:0,new Date().toISOString(),new Date().toISOString(), id
  ).run();
  if(materialChange){
    const active=await env.DB.prepare("SELECT lr.id,lr.borrower_id FROM loan_requests lr WHERE lr.item_id=? AND lr.status IN ('pending','approved')").bind(id).all();
    const statements=[];
    for(const requestRow of active.results||[]){
      statements.push(notificationStatement(env,requestRow.borrower_id,"status","פרטי המוצר השתנו","בוצע שינוי מהותי במוצר שהזמנת. יש לבדוק את הפרטים המעודכנים ולאשר מחדש.",requestRow.id));
      statements.push(env.DB.prepare("UPDATE loan_requests SET workflow_status='change_reapproval_required',updated_at=? WHERE id=?").bind(new Date().toISOString(),requestRow.id));
    }
    if(statements.length) await env.DB.batch(statements);
    await notifySavedFollowers(env,{itemId:id,organizationId:existing.organization_id,category,title:values.title,event:"changed"});
  }
  const minLoanMinutes=positiveInt(body.minLoanMinutes,Number(existing.min_loan_minutes||60),1,525600,"משך מינימלי");
  const maxLoanMinutes=positiveInt(body.maxLoanMinutes,Number(existing.max_loan_minutes||10080),1,525600,"משך מקסימלי");
  if(maxLoanMinutes<minLoanMinutes) throw new HttpError(400,"משך ההשאלה המקסימלי חייב להיות גדול או שווה למינימלי");
  const publishAt=body.publishAt?validateDateTime(body.publishAt,"מועד פרסום"):null,maxPerUser=body.maxPerUser?positiveInt(body.maxPerUser,1,1,999,"מגבלה למשתמש"):null,preparationMinutes=positiveInt(body.preparationMinutes,Number(existing.preparation_minutes||0),0,10080,"זמן הכנה"),maxLoanDays=body.maxLoanDays?positiveInt(body.maxLoanDays,1,1,3650,"ימי השאלה מרביים"):null,serviceRadiusKm=body.serviceRadiusKm?Math.max(0.1,Math.min(500,Number(body.serviceRadiusKm))):null;
  const scheduled=publishAt&&Date.parse(publishAt)>Date.now(),nextStatus=existing.status==="archived"?"archived":scheduled?"pending":"active";
  await env.DB.prepare(`UPDATE items SET min_loan_minutes=?,max_loan_minutes=?,booking_notice_minutes=?,turnaround_minutes=?,
    booking_horizon_days=?,approval_mode=?,deposit_required=?,deposit_amount_agorot=?,publish_at=?,max_per_user=?,preparation_minutes=?,max_loan_days=?,service_radius_km=?,status=? WHERE id=?`).bind(
    minLoanMinutes,maxLoanMinutes,
    positiveInt(body.bookingNoticeMinutes,Number(existing.booking_notice_minutes||0),0,525600,"זמן התראה"),
    positiveInt(body.turnaroundMinutes,Number(existing.turnaround_minutes||0),0,10080,"זמן התארגנות"),
    positiveInt(body.bookingHorizonDays,Number(existing.booking_horizon_days||365),1,1095,"טווח הזמנה"),
    body.approvalMode==="automatic"?"automatic":"manual",body.depositRequired?1:0,body.depositRequired?moneyAgorot(body.depositAmount):0,publishAt,maxPerUser,preparationMinutes,maxLoanDays,serviceRadiusKm,nextStatus,id).run();
  if(body.bookingHorizonMinutes!==undefined)await env.DB.prepare("UPDATE items SET booking_horizon_minutes=? WHERE id=?").bind(positiveInt(body.bookingHorizonMinutes,Number(existing.booking_horizon_minutes||existing.booking_horizon_days*1440),1,1576800,"טווח הזמנה"),id).run();
  return json({ item: { id, status:nextStatus,publishAt,maxPerUser,preparationMinutes,maxLoanDays,serviceRadiusKm } });
}

function bytesToBase64(bytes){
  let binary="";const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}
async function moderateItemImage(env,file){
  if(!env.AI?.run)return{action:"unavailable",confidence:0,reason:"Workers AI binding unavailable"};
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const image=`data:${file.type};base64,${bytesToBase64(bytes)}`;
    const result=await env.AI.run("@cf/moondream/moondream3.1-9B-A2B",{
      task:"query",image,
      question:"Classify this image for a family-friendly community equipment lending marketplace. Return JSON only as {\"action\":\"allow|review|block\",\"confidence\":0.0,\"reason\":\"short reason\"}. Block only clearly explicit sexual content, graphic gore, extremist or hate propaganda, illegal drug promotion, or clear weapons intended to harm people. Review uncertain borderline cases. Ordinary household items, tools, medical equipment, toys, books, event equipment and people in normal clothing are allowed.",
      reasoning:false,stream:false,temperature:0,max_tokens:160
    });
    const raw=String(result?.answer||result?.response||"").trim(),match=raw.match(/\{[\s\S]*\}/);
    if(!match)return{action:"review",confidence:.5,reason:"AI moderation returned an unstructured result"};
    const parsed=JSON.parse(match[0]),action=["allow","review","block"].includes(parsed.action)?parsed.action:"review";
    return{action,confidence:Math.max(0,Math.min(1,Number(parsed.confidence)||0)),reason:String(parsed.reason||"AI image moderation").slice(0,300)};
  }catch(error){
    console.warn("Image moderation unavailable",error);
    return{action:"unavailable",confidence:0,reason:String(error?.message||error).slice(0,300)};
  }
}
async function uploadImages(request, env, itemId) {
  const user = await requireUser(request, env);
  const item = await env.DB.prepare(`
    SELECT i.id, i.image_urls FROM items i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')
  `).bind(itemId, user.id, user.role).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא או שאין הרשאה לערוך אותו");
  const form = await request.formData();
  const files = form.getAll("images").filter(value => value instanceof File);
  const existing = parseJsonArray(item.image_urls);
  if (!files.length) throw new HttpError(400, "לא נבחרו תמונות");
  if (files.length + existing.length > 12) throw new HttpError(400, "אפשר להעלות עד 12 תמונות לפריט");
  const uploadedKeys = [],moderationFindings=[];
  try {
    for (const file of files) {
      const extension = IMAGE_TYPES.get(file.type);
      if (!extension) throw new HttpError(400, "אפשר להעלות JPG, PNG או WebP בלבד");
      if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "כל תמונה יכולה להיות עד 5MB");
      const signature=new Uint8Array(await file.slice(0,16).arrayBuffer());
      const validJpeg=file.type==="image/jpeg"&&signature[0]===0xff&&signature[1]===0xd8&&signature[2]===0xff;
      const validPng=file.type==="image/png"&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((byte,index)=>signature[index]===byte);
      const validWebp=file.type==="image/webp"&&String.fromCharCode(...signature.slice(0,4))==="RIFF"&&String.fromCharCode(...signature.slice(8,12))==="WEBP";
      if(!validJpeg&&!validPng&&!validWebp)throw new HttpError(400,"קובץ התמונה פגום או שסוגו אינו תואם לתוכן");
      const scan=await moderateItemImage(env,file);
      const key = `items/${user.id}/${itemId}/${crypto.randomUUID()}.${extension}`;
      await env.ITEM_IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      uploadedKeys.push(key);
      if(scan.action!=="allow")moderationFindings.push({...scan,key,fileName:file.name||"image"});
    }
    const urls = [...existing, ...uploadedKeys.map(key => `/media/${key}`)],autoHidden=moderationFindings.some(x=>x.action==="block"&&x.confidence>=.85);
    const now=new Date().toISOString();
    await env.DB.prepare("UPDATE items SET image_urls = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(urls), now, itemId).run();
    if(moderationFindings.length){
      await ensureFinalFeaturesSchema(env);
      const statements=moderationFindings.map(f=>env.DB.prepare("INSERT INTO moderation_jobs(id,entity_type,entity_id,reason,severity,status,auto_hidden) VALUES(?,?,?,?,?,'pending',?)")
        .bind(crypto.randomUUID(),"item_image",itemId,`${f.reason} | image=${f.key} | confidence=${f.confidence.toFixed(2)}`,f.action==="block"?"critical":f.action==="review"?"high":"normal",f.action==="block"&&f.confidence>=.85?1:0));
      if(autoHidden)statements.push(env.DB.prepare("UPDATE items SET status='pending',updated_at=? WHERE id=?").bind(now,itemId));
      await env.DB.batch(statements);
    }
    return json({ imageUrls: urls,moderation:{reviewRequired:moderationFindings.length>0,autoHidden} }, 201);
  } catch (error) {
    await Promise.all(uploadedKeys.map(key => env.ITEM_IMAGES.delete(key)));
    throw error;
  }
}

function validateLoanDateTime(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) throw new HttpError(400, `${label} אינו תקין`);
  return text;
}
function loanMinutes(from, until) { return Math.round((Date.parse(until) - Date.parse(from)) / 60000); }
function haversineKm(lat1,lon1,lat2,lon2){
  const R=6371,rad=v=>v*Math.PI/180,dLat=rad(lat2-lat1),dLon=rad(lon2-lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}
function assertAllowedPickupReturnTime(value, label) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new HttpError(400, `${label} אינו תקין`);
  const [,year,month,dayOfMonth,hour,minute]=match;
  // datetime-local values are Israel wall-clock appointments. Derive only the
  // weekday in UTC so DST/host timezone can never shift the stated local hour.
  const day = new Date(Date.UTC(Number(year),Number(month)-1,Number(dayOfMonth))).getUTCDay();
  const minutes = Number(hour)*60+Number(minute);
  if ((day === 5 && minutes >= 17*60) || (day === 6 && minutes < 20*60)) {
    throw new HttpError(400, `לא ניתן לקבוע ${label} מיום שישי בשעה 17:00 ועד שבת בשעה 20:00`);
  }
}
async function availableQuantityForRange(env,itemId,from,until,turnaroundMinutes=0,excludeRequestId=null) {
  const item = await env.DB.prepare("SELECT quantity FROM items WHERE id=?").bind(itemId).first();
  if (!item) return 0;
  const pad = Math.max(0,Number(turnaroundMinutes)||0);
  const paddedFrom = new Date(Date.parse(from)-pad*60000).toISOString().slice(0,16);
  const paddedUntil = new Date(Date.parse(until)+pad*60000).toISOString().slice(0,16);
  const booked = await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS used FROM loan_requests
    WHERE item_id=? AND status IN ('pending','approved','collected') AND id<>?
      AND requested_from < ? AND requested_until > ?`).bind(itemId,excludeRequestId||"",paddedUntil,paddedFrom).first();
  const blocked = await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS used FROM inventory_blocks
    WHERE item_id=? AND starts_at < ? AND ends_at > ?`).bind(itemId,paddedUntil,paddedFrom).first();
  return Math.max(0,Number(item.quantity)-Number(booked?.used||0)-Number(blocked?.used||0));
}
async function ownedItem(request,env,itemId){
  const user=await requireUser(request,env);
  const item=await env.DB.prepare(`SELECT i.*,o.owner_id FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?`).bind(itemId).first();
  if(!item||(item.owner_id!==user.id&&user.role!=="admin")) throw new HttpError(403,"אין הרשאה לנהל את המלאי הזה");
  return {user,item};
}
async function getInventoryManagement(request,env,itemId){
  const {item}=await ownedItem(request,env,itemId);
  const blocks=await env.DB.prepare("SELECT id,starts_at,ends_at,quantity,reason,created_at FROM inventory_blocks WHERE item_id=? ORDER BY starts_at").bind(itemId).all();
  const units=await env.DB.prepare("SELECT id,unit_code,status,note,created_at,updated_at FROM inventory_units WHERE item_id=? ORDER BY created_at").bind(itemId).all();
  return json({totalQuantity:Number(item.quantity),blocks:blocks.results||[],units:units.results||[]});
}
async function addInventoryBlock(request,env,itemId){
  const {user,item}=await ownedItem(request,env,itemId); const body=await readJson(request);
  const from=validateLoanDateTime(body.startsAt,"תחילת החסימה"),until=validateLoanDateTime(body.endsAt,"סיום החסימה");
  if(Date.parse(until)<=Date.parse(from)) throw new HttpError(400,"סיום החסימה חייב להיות אחרי תחילתה");
  const quantity=positiveInt(body.quantity,1,1,Number(item.quantity),"כמות חסומה");
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO inventory_blocks(id,item_id,starts_at,ends_at,quantity,reason,created_by) VALUES(?,?,?,?,?,?,?)")
    .bind(id,itemId,from,until,quantity,cleanOptional(body.reason,300),user.id).run();
  return json({block:{id,starts_at:from,ends_at:until,quantity}},201);
}
async function deleteInventoryBlock(request,env,id){
  const user=await requireUser(request,env);
  const row=await env.DB.prepare(`SELECT b.id,o.owner_id FROM inventory_blocks b JOIN items i ON i.id=b.item_id JOIN organizations o ON o.id=i.organization_id WHERE b.id=?`).bind(id).first();
  if(!row||(row.owner_id!==user.id&&user.role!=="admin")) throw new HttpError(403,"אין הרשאה למחוק חסימה זו");
  const itemRow=await env.DB.prepare("SELECT item_id FROM inventory_blocks WHERE id=?").bind(id).first();
  await env.DB.prepare("DELETE FROM inventory_blocks WHERE id=?").bind(id).run();
  if(itemRow) await advanceWaitlist(env,itemRow.item_id);
  return json({ok:true});
}
async function listItemWaitlist(request,env,itemId){const user=await requireUser(request,env);const item=await env.DB.prepare(`SELECT i.id,o.owner_id FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?`).bind(itemId).first();if(!item)throw new HttpError(404,"הפריט לא נמצא");const member=item.owner_id===user.id||user.role==="admin"||await env.DB.prepare("SELECT 1 ok FROM organization_members m JOIN items i ON i.organization_id=m.organization_id WHERE i.id=? AND m.user_id=? AND m.role IN ('owner','requests','inventory')").bind(itemId,user.id).first();const rows=member?await env.DB.prepare(`SELECT w.*,u.full_name FROM waitlist_entries w JOIN users u ON u.id=w.user_id WHERE w.item_id=? AND w.status IN ('waiting','notified') ORDER BY w.created_at`).bind(itemId).all():await env.DB.prepare(`SELECT w.* FROM waitlist_entries w WHERE w.item_id=? AND w.user_id=? AND w.status IN ('waiting','notified') ORDER BY w.created_at`).bind(itemId,user.id).all();return json({entries:rows.results,canManage:Boolean(member)});}
async function leaveWaitlist(request,env,id){const user=await requireUser(request,env),row=await env.DB.prepare("SELECT w.*,i.organization_id,o.owner_id FROM waitlist_entries w JOIN items i ON i.id=w.item_id JOIN organizations o ON o.id=i.organization_id WHERE w.id=?").bind(id).first();if(!row)throw new HttpError(404,"הרשומה לא נמצאה");const member=row.user_id===user.id||row.owner_id===user.id||user.role==="admin"||await env.DB.prepare("SELECT 1 ok FROM organization_members WHERE organization_id=? AND user_id=? AND role IN ('owner','requests')").bind(row.organization_id,user.id).first();if(!member)throw new HttpError(403,"אין הרשאה");await env.DB.prepare("UPDATE waitlist_entries SET status='cancelled' WHERE id=? AND status IN ('waiting','notified')").bind(id).run();return json({ok:true});}
async function joinWaitlist(request,env,itemId){
  const user=await requireUser(request,env); const body=await readJson(request);
  const from=validateLoanDateTime(body.requestedFrom,"מועד האיסוף"),until=validateLoanDateTime(body.requestedUntil,"מועד ההחזרה");
  assertAllowedPickupReturnTime(from,"האיסוף"); assertAllowedPickupReturnTime(until,"ההחזרה");
  if(Date.parse(until)<=Date.parse(from)) throw new HttpError(400,"מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  const item=await env.DB.prepare("SELECT quantity,turnaround_minutes FROM items WHERE id=? AND status='active'").bind(itemId).first(); if(!item) throw new HttpError(404,"הפריט לא נמצא");
  const quantity=positiveInt(body.quantity,1,1,Number(item.quantity),"כמות");
  const available=await availableQuantityForRange(env,itemId,from,until,Number(item.turnaround_minutes||0),null);
  if(available>=quantity) throw new HttpError(409,"הפריט זמין כרגע; אפשר לבצע הזמנה במקום להצטרף לרשימת המתנה");
  const existing=await env.DB.prepare("SELECT id FROM waitlist_entries WHERE item_id=? AND user_id=? AND requested_from=? AND requested_until=? AND status='waiting'").bind(itemId,user.id,from,until).first();
  if(existing) return json({entry:{id:existing.id,status:"waiting"}});
  const id=crypto.randomUUID(); await env.DB.prepare("INSERT INTO waitlist_entries(id,item_id,user_id,requested_from,requested_until,quantity) VALUES(?,?,?,?,?,?)").bind(id,itemId,user.id,from,until,quantity).run();
  return json({entry:{id,status:"waiting"}},201);
}
async function advanceWaitlist(env,itemId){
  const item=await env.DB.prepare("SELECT turnaround_minutes FROM items WHERE id=?").bind(itemId).first(); if(!item) return;
  const entries=await env.DB.prepare("SELECT id,user_id,requested_from,requested_until,quantity FROM waitlist_entries WHERE item_id=? AND status='waiting' ORDER BY created_at ASC").bind(itemId).all();
  const entry=(entries.results||[])[0];
  if(!entry) return;
  const available=await availableQuantityForRange(env,itemId,entry.requested_from,entry.requested_until,Number(item.turnaround_minutes||0),null);
  if(available>=Number(entry.quantity)){
    const changed=await env.DB.prepare("UPDATE waitlist_entries SET status='notified' WHERE id=? AND status='waiting'").bind(entry.id).run();
    if(changed.meta.changes) await notificationStatement(env,entry.user_id,"waitlist","הפריט שביקשתם זמין","התפנה מלאי לטווח שביקשתם. אתם ראשונים בתור לטווח הזה; ניתן להיכנס לפריט ולבצע הזמנה.",null).run();
  }
}

async function checkItemAvailability(env,itemId,url) {
  const item = await env.DB.prepare(`SELECT i.id,i.quantity,i.min_loan_minutes,i.max_loan_minutes,i.turnaround_minutes,
    i.deposit_required,i.deposit_amount_agorot,i.approval_mode,i.availability_status
    FROM items i JOIN organizations o ON o.id=i.organization_id
    WHERE i.id=? AND i.status='active' AND o.status='approved'`).bind(itemId).first();
  if (!item) throw new HttpError(404,"הפריט לא נמצא");
  const from=validateLoanDateTime(url.searchParams.get("from"),"מועד האיסוף");
  const until=validateLoanDateTime(url.searchParams.get("until"),"מועד ההחזרה");
  assertAllowedPickupReturnTime(from,"האיסוף"); assertAllowedPickupReturnTime(until,"ההחזרה");
  const duration=loanMinutes(from,until);
  if(duration<=0) throw new HttpError(400,"מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  const available=item.availability_status==="unavailable"?0:await availableQuantityForRange(env,itemId,from,until,item.turnaround_minutes,null);
  let nextAvailableAt=null;
  if(!available && item.availability_status!=="unavailable"){
    const duration=Math.max(1,loanMinutes(from,until));
    let cursor=from;
    for(let attempt=0;attempt<24;attempt++){
      const overlap=await env.DB.prepare(`SELECT MIN(requested_until) AS next_end FROM loan_requests
        WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from < ? AND requested_until > ?`)
        .bind(itemId,new Date(Date.parse(cursor)+duration*60000).toISOString().slice(0,16),cursor).first();
      if(!overlap?.next_end) break;
      cursor=String(overlap.next_end).slice(0,16);
      const end=new Date(Date.parse(cursor)+duration*60000).toISOString().slice(0,16);
      try { assertAllowedPickupReturnTime(cursor,"האיסוף"); assertAllowedPickupReturnTime(end,"ההחזרה"); }
      catch { const d=new Date(cursor); const day=d.getUTCDay(); if(day===5){d.setUTCDate(d.getUTCDate()+1);d.setUTCHours(21,0,0,0);} else if(day===6){d.setUTCHours(21,0,0,0);} cursor=d.toISOString().slice(0,16); continue; }
      if(await availableQuantityForRange(env,itemId,cursor,end,item.turnaround_minutes,null)>0){nextAvailableAt=cursor;break;}
    }
  }
  return json({available:available>0,availableQuantity:available,totalQuantity:Number(item.quantity),nextAvailableAt,
    minLoanMinutes:Number(item.min_loan_minutes),maxLoanMinutes:Number(item.max_loan_minutes),
    depositRequired:Boolean(item.deposit_required),depositAmountAgorot:Number(item.deposit_amount_agorot),approvalMode:item.approval_mode});
}

async function createLoanRequest(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const itemId = cleanText(body.itemId, 1, 100, "פריט");
  const item = await env.DB.prepare(`
    SELECT i.id,i.title,i.quantity,i.availability_status,i.min_loan_minutes,i.max_loan_minutes,
      i.booking_notice_minutes,i.booking_horizon_days,i.booking_horizon_minutes,i.turnaround_minutes,i.approval_mode,
      i.deposit_required,i.deposit_amount_agorot,i.max_per_user,i.service_radius_km,i.preparation_minutes,i.max_loan_days,o.owner_id,o.id AS organization_id
    FROM items i JOIN organizations o ON o.id=i.organization_id
    WHERE i.id=? AND i.status='active' AND i.is_free=1 AND o.status='approved'
  `).bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  if (item.owner_id === user.id) throw new HttpError(400, "אי אפשר להזמין פריט מהגמ״ח שלכם");
  if (item.availability_status === "unavailable") throw new HttpError(409, "הפריט אינו זמין כרגע");

  const from = validateLoanDateTime(body.requestedFrom, "מועד האיסוף");
  const until = validateLoanDateTime(body.requestedUntil, "מועד ההחזרה");
  const availabilityRuleCheck = await checkAvailabilityRules(env,itemId,from,until,cleanOptional(body.branchId,100));
  if (!availabilityRuleCheck.allowed) throw new HttpError(409, availabilityRuleCheck.reason || "המועד אינו זמין לפי כללי הגמ״ח");
  assertAllowedPickupReturnTime(from, "האיסוף");
  assertAllowedPickupReturnTime(until, "ההחזרה");
  const duration = loanMinutes(from, until);
  if (duration <= 0) throw new HttpError(400, "מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  if (duration < Number(item.min_loan_minutes)) throw new HttpError(400, `משך ההשאלה המינימלי הוא ${item.min_loan_minutes} דקות`);
  if (duration > Number(item.max_loan_minutes)) throw new HttpError(400, `משך ההשאלה המקסימלי הוא ${item.max_loan_minutes} דקות`);
  if(Number(item.max_loan_days||0)>0&&duration>Number(item.max_loan_days)*1440) throw new HttpError(400,`משך ההשאלה המרבי הוא ${item.max_loan_days} ימים`);
  const now = Date.now();
  const fromMs = Date.parse(from);
  if (fromMs < now + (Number(item.booking_notice_minutes)+Number(item.preparation_minutes||0)) * 60000) throw new HttpError(400, "מועד האיסוף מוקדם מדי לפי זמן ההזמנה וההכנה של הגמ״ח");
  if (fromMs > now + Number(item.booking_horizon_minutes||Number(item.booking_horizon_days)*1440) * 60000) throw new HttpError(400, "מועד האיסוף רחוק מדי לפי תנאי הגמ״ח");

  const quantity = Number(body.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.quantity)) throw new HttpError(400, "הכמות המבוקשת אינה תקינה");
  if(Number(item.max_per_user||0)>0){
    const activeForUser=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) AS qty FROM loan_requests WHERE item_id=? AND borrower_id=? AND status IN ('pending','approved','collected')").bind(itemId,user.id).first();
    if(Number(activeForUser?.qty||0)+quantity>Number(item.max_per_user)) throw new HttpError(409,`המגבלה למשתמש עבור מוצר זה היא ${item.max_per_user} יחידות`);
  }
  if(Number(item.service_radius_km||0)>0){
    const home=await env.DB.prepare("SELECT latitude,longitude FROM user_addresses WHERE user_id=? ORDER BY is_default DESC,updated_at DESC LIMIT 1").bind(user.id).first();
    const branch=await env.DB.prepare("SELECT latitude,longitude FROM organization_branches WHERE organization_id=? AND status='active' AND latitude IS NOT NULL AND longitude IS NOT NULL ORDER BY created_at LIMIT 1").bind(item.organization_id).first();
    if(!home?.latitude||!home?.longitude) throw new HttpError(400,"כדי להזמין מוצר עם מגבלת מרחק יש לשמור כתובת מאומתת עם מיקום באזור האישי");
    if(branch?.latitude&&branch?.longitude){
      const distance=haversineKm(Number(home.latitude),Number(home.longitude),Number(branch.latitude),Number(branch.longitude));
      if(distance>Number(item.service_radius_km)) throw new HttpError(409,`המוצר זמין עד ${item.service_radius_km} ק״מ מהסניף. הכתובת השמורה נמצאת במרחק של כ־${distance.toFixed(1)} ק״מ`);
    }
  }
  if (Number(item.deposit_required) && body.depositAccepted !== true) throw new HttpError(400, "יש לאשר את תנאי הפיקדון לפני שליחת ההזמנה");

  const available = await availableQuantityForRange(env,itemId,from,until,Number(item.turnaround_minutes),null);
  if (available < quantity) throw new HttpError(409, available > 0 ? `נותרו רק ${available} יחידות בטווח שבחרתם` : "הפריט אינו זמין בטווח שבחרתם");

  const id = crypto.randomUUID();
  const status = item.approval_mode === "automatic" ? "approved" : "pending";
  const acceptedAt = Number(item.deposit_required) ? new Date().toISOString() : null;
  const result = await env.DB.prepare(`
    INSERT INTO loan_requests
      (id,item_id,borrower_id,requested_from,requested_until,phone,note,status,quantity,
       deposit_required_snapshot,deposit_amount_agorot_snapshot,deposit_terms_accepted_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?
    WHERE (
      SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr
      WHERE lr.item_id=? AND lr.status IN ('pending','approved','collected')
        AND lr.requested_from < ? AND lr.requested_until > ?
    ) + ? <= ?
  `).bind(id,itemId,user.id,from,until,validatePhone(body.phone),cleanOptional(body.note,500),status,quantity,
    Number(item.deposit_required),Number(item.deposit_amount_agorot),acceptedAt,
    itemId,until,from,quantity,Number(item.quantity)).run();
  if (!result.meta.changes) throw new HttpError(409, "המלאי נתפס הרגע על ידי הזמנה אחרת. בחרו מועד אחר");

  const holdId=crypto.randomUUID();
  const holdExpiresAt=new Date(Date.now()+24*60*60*1000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,user.id,"created",JSON.stringify({from,until,quantity,status})),
    env.DB.prepare("INSERT INTO inventory_holds(id,item_id,user_id,request_id,quantity,starts_at,ends_at,expires_at,status) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(holdId,itemId,user.id,id,quantity,from,until,holdExpiresAt,status==="approved"?"converted":"active"),
    env.DB.prepare("UPDATE loan_requests SET hold_expires_at=?,workflow_status=? WHERE id=?")
      .bind(holdExpiresAt,status==="approved"?"approved_ready_for_pickup":"inventory_held",id),
    notificationStatement(env,item.owner_id,"request","בקשת השאלה חדשה",`${user.full_name} ביקש/ה ${quantity} יחידות של ${item.title}`,id)
  ]);
  return json({ request:{id,status,holdExpiresAt}, availability:{remaining:Math.max(0,available-quantity)} },201);
}

async function dashboard(request, env) {
  const user = await requireUser(request, env);
  const [organizationsResult, itemsResult, requestsResult, favoritesResult, savedOrganizationsResult, helpRequestsResult, recentOrganizationsResult] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,o.is_hidden,o.created_at,c.contact_phone,o.address,o.website_url,o.service_area,o.hours_json,o.pickup_options
      FROM organizations o LEFT JOIN organization_contacts c ON c.organization_id = o.id WHERE o.owner_id = ? ORDER BY o.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT i.id,i.organization_id,i.title,i.category,i.description,i.condition,i.quantity,i.loan_conditions,i.image_urls,
      i.status,i.availability_status,i.created_at,o.name AS org_name,i.item_type,i.subcategory,i.tags_json,i.pickup_method,i.inventory_updated_at,
      i.min_loan_minutes,i.max_loan_minutes,i.booking_notice_minutes,i.turnaround_minutes,i.booking_horizon_days,i.approval_mode,i.deposit_required,i.deposit_amount_agorot
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE o.owner_id = ? ORDER BY i.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT lr.id,lr.item_id,lr.status,lr.requested_from,lr.requested_until,lr.phone,lr.note,lr.manager_note,lr.created_at,lr.quantity,lr.deposit_required_snapshot,lr.deposit_amount_agorot_snapshot,lr.workflow_status,lr.extension_status,lr.extension_until,lr.change_pending_json,lr.cancellation_undo_until,
      i.title AS item_title,o.name AS org_name,o.owner_id,u.full_name AS borrower_name,
      CASE WHEN o.owner_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction,
      CASE WHEN lr.borrower_id = ? AND lr.status IN ('approved','collected') THEN c.contact_phone ELSE NULL END AS contact_phone
      FROM loan_requests lr JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id
      JOIN users u ON u.id = lr.borrower_id LEFT JOIN organization_contacts c ON c.organization_id = o.id
      WHERE lr.borrower_id = ? OR o.owner_id = ? ORDER BY lr.created_at DESC`).bind(user.id, user.id, user.id, user.id),
    env.DB.prepare("SELECT item_id FROM favorites WHERE user_id = ?").bind(user.id),
    env.DB.prepare(`SELECT s.organization_id,o.name,o.city,o.verified FROM saved_organizations s JOIN organizations o ON o.id=s.organization_id WHERE s.user_id=? ORDER BY s.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT id,title,description,category,city,urgency,status,requested_from,requested_until,distance_km,created_at FROM help_requests WHERE requester_id=? ORDER BY created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT rv.organization_id,o.name,o.city,o.primary_category,rv.viewed_at,
      (SELECT COUNT(*) FROM items i WHERE i.organization_id=o.id AND i.status='active' AND i.deleted_at IS NULL) AS item_count
      FROM recently_viewed_organizations rv JOIN organizations o ON o.id=rv.organization_id
      WHERE rv.user_id=? AND o.status='approved' AND o.is_hidden=0 AND o.deleted_at IS NULL
      ORDER BY rv.viewed_at DESC LIMIT 8`).bind(user.id)
  ]);
  const organizations = organizationsResult.results.map(row => ({ ...row, verified: Boolean(row.verified), is_hidden: Boolean(row.is_hidden), hours: safeJsonObject(row.hours_json), pickupOptions: parseJsonArray(row.pickup_options) }));
  const items = itemsResult.results.map(row => ({ ...row, image_urls: parseJsonArray(row.image_urls), tags: parseJsonArray(row.tags_json), organizations: { name: row.org_name } }));
  const requests = requestsResult.results.map(row => ({
    id: row.id,
    status: row.status,
    requested_from: row.requested_from,
    requested_until: row.requested_until,
    note: row.note,
    manager_note: row.manager_note,
    quantity: Number(row.quantity || 1),
    deposit_required: Boolean(row.deposit_required_snapshot),
    deposit_amount_agorot: Number(row.deposit_amount_agorot_snapshot || 0),
    workflow_status: row.workflow_status || null,
    extension_status: row.extension_status || null,
    extension_until: row.extension_until || null,
    change_pending_json: row.change_pending_json || null,
    cancellation_undo_until: row.cancellation_undo_until || null,
    direction: row.direction,
    borrower_name: row.direction === "incoming" ? row.borrower_name : undefined,
    borrower_phone: row.direction === "incoming" ? row.phone : undefined,
    contact_phone: row.contact_phone,
    items: { title: row.item_title, organizations: { name: row.org_name } }
  }));
  return json({
    user: publicUser(user),
    organizations,
    items,
    requests,
    favorites: favoritesResult.results.map(row => row.item_id),
    savedOrganizations: savedOrganizationsResult.results,
    recentlyViewedOrganizations: recentOrganizationsResult.results,
    helpRequests: helpRequestsResult.results,
    stats: {
      activeRequests: requests.filter(row => ["pending", "approved", "collected"].includes(row.status)).length,
      items: items.length,
      completed: requests.filter(row => row.status === "returned").length
    }
  });
}

async function updateRequestStatus(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const target = cleanText(body.status, 2, 20, "סטטוס");
  const row = await env.DB.prepare(`SELECT lr.status,lr.borrower_id,lr.item_id,lr.requested_from,lr.requested_until,lr.manager_note,lr.quantity AS requested_quantity,
    i.title AS item_title,i.quantity,i.turnaround_minutes,i.category,o.id AS organization_id,o.owner_id FROM loan_requests lr
    JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id WHERE lr.id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "הבקשה לא נמצאה");
  let allowed = false;
  if (row.borrower_id === user.id && ["pending","approved"].includes(row.status) && target === "cancelled") allowed = true;
  if (row.owner_id === user.id || user.role === "admin") {
    allowed = allowed || (row.status === "pending" && ["approved", "declined", "cancelled"].includes(target));
    allowed = allowed || (row.status === "approved" && ["collected","cancelled","no_show"].includes(target));
    allowed = allowed || (row.status === "collected" && target === "returned");
  }
  if (!allowed) throw new HttpError(403, "מעבר הסטטוס הזה אינו מורשה");
  let managerNote = row.manager_note;
  if (target === "declined") managerNote = cleanText(body.managerNote, 3, 500, "סיבת הדחייה");
  else if (target === "cancelled" && (row.owner_id === user.id || user.role === "admin") && row.status === "approved") managerNote = cleanText(body.managerNote, 3, 500, "סיבת הביטול");
  else if (target === "approved") managerNote = cleanOptional(body.managerNote, 500);
  const now = new Date().toISOString();
  let result;
  if(target==="collected"){
    const serialized=await env.DB.prepare("SELECT COUNT(*) AS count FROM item_units WHERE item_id=? AND status!='retired'").bind(row.item_id).first();
    if(Number(serialized?.count||0)>0){
      const assigned=await env.DB.prepare("SELECT COUNT(*) AS count FROM loan_unit_assignments WHERE request_id=?").bind(id).first();
      if(Number(assigned?.count||0)<Number(row.requested_quantity||1)) throw new HttpError(409,"יש להקצות את היחידות הסידוריות בזמן האיסוף לפני סימון כנאסף");
    }
  }
  if (target === "approved") {
    result = await env.DB.prepare(`UPDATE loan_requests SET status = 'approved', manager_note = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND (
        SELECT COALESCE(SUM(other.quantity),0) FROM loan_requests other
        WHERE other.item_id = ? AND other.id <> ? AND other.status IN ('pending','approved','collected')
          AND other.requested_from < ? AND other.requested_until > ?
      ) + ? <= ?`).bind(managerNote, now, id, row.item_id, id, row.requested_until, row.requested_from, Number(row.requested_quantity||1), Number(row.quantity)).run();
    if (!result.meta.changes) throw new HttpError(409, "כל היחידות תפוסות בתאריכים האלה. אפשר לדחות את הבקשה או לתאם תאריכים אחרים בצ׳אט");
  } else {
    const undoUntil=target==="cancelled"?new Date(Date.now()+15*1000).toISOString():null;
    const workflow={cancelled:"cancelled",declined:"declined",collected:"awaiting_return",returned:"completed",no_show:"no_show"}[target]||target;
    result = await env.DB.prepare("UPDATE loan_requests SET status = ?, manager_note = ?, collected_at = CASE WHEN ?='collected' THEN ? ELSE collected_at END, returned_at = CASE WHEN ?='returned' THEN ? ELSE returned_at END, cancelled_at = CASE WHEN ?='cancelled' THEN ? ELSE cancelled_at END, cancellation_undo_until=CASE WHEN ?='cancelled' THEN ? ELSE cancellation_undo_until END, workflow_status=?, updated_at = ? WHERE id = ? AND status = ?")
      .bind(target, managerNote, target, now, target, now, target, now, target, undoUntil, workflow, now, id, row.status).run();
    if (!result.meta.changes) throw new HttpError(409, "הבקשה כבר עודכנה. רעננו את האזור האישי");
  }

  const statusText = { approved: "אושרה", declined: "נדחתה", cancelled: "בוטלה", collected: "סומנה כנאספה", returned: "סומנה כהוחזרה", no_show:"סומנה כאי-הגעה" }[target] || "עודכנה";
  const recipientId = row.borrower_id === user.id ? row.owner_id : row.borrower_id;
  const statusStatements=[
    notificationStatement(env, recipientId, "status", `הבקשה ${statusText}`, target==="no_show"?`בקשת ההשאלה עבור ${row.item_title} סומנה כאי-הגעה. המלאי שוחרר ורשימת ההמתנה קודמה.`:`הבקשה עבור ${row.item_title} ${statusText}.`, id),
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,user.id,target,JSON.stringify({managerNote:managerNote||null}))
  ];
  if(target==="approved") statusStatements.push(env.DB.prepare("UPDATE inventory_holds SET status='converted' WHERE request_id=? AND status='active'").bind(id));
  if(["declined","cancelled","returned","no_show"].includes(target)) statusStatements.push(env.DB.prepare("UPDATE inventory_holds SET status='released' WHERE request_id=? AND status IN ('active','converted')").bind(id));
  if(target==="returned"){
    statusStatements.push(env.DB.prepare("UPDATE loan_unit_assignments SET returned_at=? WHERE request_id=? AND returned_at IS NULL").bind(now,id));
    statusStatements.push(env.DB.prepare("UPDATE item_units SET status='available',updated_at=? WHERE id IN (SELECT unit_id FROM loan_unit_assignments WHERE request_id=?)").bind(now,id));
  }
  await env.DB.batch(statusStatements);
  if(["declined","returned","no_show"].includes(target)) await advanceWaitlist(env,row.item_id);
  if(target==="returned") await notifySavedFollowers(env,{itemId:row.item_id,organizationId:row.organization_id,category:row.category,title:row.item_title,event:"available"});
  return json({ id, status: target, managerNote });
}

async function updateAvailability(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const availability = cleanText(body.availabilityStatus, 2, 20, "זמינות");
  if (!["available", "unavailable", "reserved"].includes(availability)) throw new HttpError(400, "מצב הזמינות אינו תקין");
  const item = await env.DB.prepare(`SELECT i.id FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!item) throw new HttpError(403, "אין הרשאה לערוך את הפריט");
  await env.DB.prepare("UPDATE items SET availability_status = ?, updated_at = ? WHERE id = ?")
    .bind(availability, new Date().toISOString(), id).run();
  return json({ id, availabilityStatus: availability });
}

async function getRequestParticipant(request, env, requestId, { allowAdmin = true } = {}) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare(`SELECT lr.id,lr.borrower_id,lr.status,lr.returned_at,i.id AS item_id,i.title AS item_title,o.owner_id,o.name AS org_name
    FROM loan_requests lr JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id
    WHERE lr.id = ?`).bind(requestId).first();
  if (!row) throw new HttpError(404, "בקשת ההשאלה לא נמצאה");
  const participant = row.borrower_id === user.id || row.owner_id === user.id;
  if (!participant && !(allowAdmin && user.role === "admin")) throw new HttpError(403, "השיחה זמינה רק לצדדים בבקשת ההשאלה");
  return { user, row, participant };
}

async function listRequestMessages(request, env, requestId) {
  const { user, row } = await getRequestParticipant(request, env, requestId);
  const result = await env.DB.prepare(`SELECT m.id,m.body,m.created_at,m.sender_id,m.message_type,m.media_url,m.metadata_json,m.deleted_at,m.read_at,u.full_name AS sender_name
    FROM request_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.request_id = ? ORDER BY m.created_at ASC LIMIT 300`).bind(requestId).all();
  await env.DB.prepare("UPDATE request_messages SET read_at=? WHERE request_id=? AND sender_id<>? AND read_at IS NULL")
    .bind(new Date().toISOString(),requestId,user.id).run();
  return json({
    request: { id: row.id, status: row.status, itemTitle: row.item_title, organizationName: row.org_name, chatWritable: !(row.returned_at && Date.now()-Date.parse(row.returned_at)>14*86400000), chatWritableUntil: row.returned_at ? new Date(Date.parse(row.returned_at)+14*86400000).toISOString() : null, chatRetainUntil: row.returned_at ? new Date(Date.parse(row.returned_at)+365*86400000).toISOString() : null },
    messages: result.results.map(message => ({ ...message, metadata:safeJsonObject(message.metadata_json),isMine: message.sender_id === user.id }))
  });
}

async function createRequestMessage(request, env, requestId) {
  const { user, row, participant } = await getRequestParticipant(request, env, requestId, { allowAdmin: false });
  if (!participant) throw new HttpError(403, "רק השואל ומנהל הגמ״ח יכולים לשלוח הודעות");
  if(row.returned_at && Date.now()-Date.parse(row.returned_at)>14*86400000) throw new HttpError(409,"השיחה נסגרה 14 ימים לאחר החזרת הפריט");
  const recipientId = row.borrower_id === user.id ? row.owner_id : row.borrower_id;
  const blocks=await env.DB.prepare(`SELECT blocker_id,effective_after_request_id FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)`).bind(user.id,recipientId,recipientId,user.id).all();
  for(const block of blocks.results||[]){
    if(!block.effective_after_request_id || block.effective_after_request_id!==requestId || ["returned","cancelled","declined"].includes(row.status)) throw new HttpError(403,"לא ניתן לשלוח הודעות למשתמש הזה");
  }
  const body = await readJson(request);
  const messageType=["text","location","item_card","help_request_card"].includes(body.messageType)?body.messageType:"text";
  let message="",metadata={};
  if(messageType==="text"){
    message=cleanText(body.message,1,1000,"הודעה");
    assertSafeChatText(message);
  } else if(messageType==="location"){
    const lat=Number(body.latitude),lon=Number(body.longitude);
    if(!Number.isFinite(lat)||lat<-90||lat>90||!Number.isFinite(lon)||lon<-180||lon>180) throw new HttpError(400,"המיקום אינו תקין");
    message=cleanOptional(body.label,120)||"מיקום משותף"; metadata={latitude:lat,longitude:lon,label:message};
  } else if(messageType==="item_card"){
    const itemId=cleanText(body.itemId,1,100,"פריט"),item=await env.DB.prepare("SELECT id,title FROM items WHERE id=? AND status='active'").bind(itemId).first();
    if(!item) throw new HttpError(404,"הפריט לא נמצא"); message=`פריט: ${item.title}`;metadata={itemId:item.id,title:item.title};
  } else {
    const helpId=cleanText(body.helpRequestId,1,100,"בקשה"),help=await env.DB.prepare("SELECT id,title FROM help_requests WHERE id=?").bind(helpId).first();
    if(!help) throw new HttpError(404,"בקשת הקהילה לא נמצאה");message=`בקשה: ${help.title}`;metadata={helpRequestId:help.id,title:help.title};
  }
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS count FROM request_messages
    WHERE sender_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')`).bind(user.id).first();
  if (Number(recent?.count || 0) >= 10) throw new HttpError(429, "נשלחו יותר מדי הודעות. נסו שוב בעוד דקה");
  const id = crypto.randomUUID(),createdAt=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages (id,request_id,sender_id,body,message_type,metadata_json) VALUES (?,?,?,?,?,?)").bind(id, requestId, user.id, message,messageType,JSON.stringify(metadata)),
    notificationStatement(env, recipientId, "message", `הודעה חדשה על ${row.item_title}`, `${user.full_name}: ${message.slice(0, 120)}`, requestId)
  ]);
  return json({ message: { id, request_id: requestId, sender_id: user.id, sender_name: user.full_name, body: message,message_type:messageType,metadata,isMine: true, created_at: createdAt } }, 201);
}

async function uploadRequestChatAttachment(request,env,requestId){
  const {user,row,participant}=await getRequestParticipant(request,env,requestId,{allowAdmin:false});
  if(!participant)throw new HttpError(403,"רק הצדדים להשאלה יכולים לצרף קובץ");
  if(row.returned_at&&Date.now()-Date.parse(row.returned_at)>14*86400000)throw new HttpError(409,"השיחה נסגרה 14 ימים לאחר החזרת הפריט");
  const form=await request.formData(),file=form.get("file"),kind=String(form.get("type")||"image");
  if(!(file instanceof File)||!file.size)throw new HttpError(400,"לא נבחר קובץ");
  const imageTypes=new Map([["image/jpeg","jpg"],["image/png","png"],["image/webp","webp"]]);
  const audioTypes=new Map([["audio/webm","webm"],["audio/ogg","ogg"],["audio/mp4","m4a"],["audio/mpeg","mp3"]]);
  const types=kind==="audio"?audioTypes:imageTypes,ext=types.get(file.type);
  if(!ext)throw new HttpError(400,kind==="audio"?"סוג קובץ הקול אינו נתמך":"סוג התמונה אינו נתמך");
  const max=kind==="audio"?10*1024*1024:5*1024*1024;if(file.size>max)throw new HttpError(400,"הקובץ גדול מדי");
  let moderation=null;if(kind==="image"){moderation=await moderateItemImage(env,file);if(moderation.action==="block"&&moderation.confidence>=.85)throw new HttpError(400,"התמונה נחסמה בבדיקת בטיחות");}
  const key=`chat/${user.id}/${requestId}/${crypto.randomUUID()}.${ext}`;
  await env.ITEM_IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:"private, max-age=86400"}});
  const id=crypto.randomUUID(),recipientId=row.borrower_id===user.id?row.owner_id:row.borrower_id,now=new Date().toISOString();
  try{
    await env.DB.batch([
      env.DB.prepare("INSERT INTO request_messages(id,request_id,sender_id,body,message_type,media_url,metadata_json) VALUES(?,?,?,?,?,?,?)").bind(id,requestId,user.id,kind==="audio"?"הודעה קולית":"תמונה",kind,"/media/"+key,JSON.stringify({contentType:file.type,size:file.size})),
      notificationStatement(env,recipientId,"message",`הודעה חדשה על ${row.item_title}`,kind==="audio"?"נשלחה הודעה קולית":"נשלחה תמונה",requestId)
    ]);
  }catch(e){await env.ITEM_IMAGES.delete(key);throw e}
  if(kind==="image"&&moderation&&moderation.action!=="allow"){try{await ensureFinalFeaturesSchema(env);await env.DB.prepare("INSERT INTO moderation_jobs(id,entity_type,entity_id,reason,severity,status,auto_hidden) VALUES(?,?,?,?,?,\'pending\',0)").bind(crypto.randomUUID(),"chat_image",id,moderation.reason||"Image requires review",moderation.action==="review"?"high":"normal").run()}catch{}}
  return json({ok:true,moderation:{reviewRequired:Boolean(moderation&&moderation.action!=="allow")},message:{id,request_id:requestId,sender_id:user.id,message_type:kind,media_url:"/media/"+key,created_at:now}},201);
}
async function reportRequestMessage(request,env,messageId){
  const user=await requireUser(request,env),b=await readJson(request),reason=cleanText(b.reason,2,500,"סיבת הדיווח");
  const m=await env.DB.prepare("SELECT request_id,sender_id FROM request_messages WHERE id=?").bind(messageId).first();if(!m)throw new HttpError(404,"ההודעה לא נמצאה");
  await getRequestParticipant(request,env,m.request_id);if(m.sender_id===user.id)throw new HttpError(400,"לא ניתן לדווח על הודעה ששלחתם");
  await env.DB.prepare("INSERT OR IGNORE INTO message_reports(id,message_id,reporter_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),messageId,user.id,reason).run();
  return json({ok:true});
}
async function blockChatUser(request,env,blockedId){
  const user=await requireUser(request,env);if(user.id===blockedId)throw new HttpError(400,"לא ניתן לחסום את עצמכם");
  const exists=await env.DB.prepare("SELECT id FROM users WHERE id=? AND deleted_at IS NULL").bind(blockedId).first();if(!exists)throw new HttpError(404,"המשתמש לא נמצא");
  const b=await readJson(request),after=b.effectiveAfterRequestId?cleanText(b.effectiveAfterRequestId,1,100,"השאלה"):null;
  if(after)await getRequestParticipant(request,env,after);
  await env.DB.prepare("INSERT INTO user_blocks(blocker_id,blocked_id,effective_after_request_id) VALUES(?,?,?) ON CONFLICT(blocker_id,blocked_id) DO UPDATE SET effective_after_request_id=excluded.effective_after_request_id").bind(user.id,blockedId,after).run();
  return json({ok:true,effectiveAfterRequestId:after});
}

async function decideLoanExtension(request,env,requestId){const {user,loan}=await loanAccess(request,env,requestId);if(user.id===loan.borrower_id&&user.role!=="admin")throw new HttpError(403,"רק מנהל הגמ״ח יכול להחליט על הארכה");if(loan.extension_status!=="pending"||!loan.extension_until)throw new HttpError(409,"אין בקשת הארכה ממתינה");const body=await readJson(request),decision=String(body.decision||"");if(!["approved","declined"].includes(decision))throw new HttpError(400,"יש לבחור אישור או דחייה");const now=new Date().toISOString();if(decision==="approved"){const available=await availableQuantityForRange(env,loan.item_id,loan.requested_until,loan.extension_until,0,requestId);if(available<Number(loan.quantity||1))throw new HttpError(409,"לא ניתן לאשר את ההארכה כי קיימת התנגשות מלאי");await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET requested_until=extension_until,extension_status='approved',workflow_status=CASE WHEN status='collected' THEN 'awaiting_return' ELSE workflow_status END,updated_at=? WHERE id=?").bind(now,requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"extension_approved",user.id,cleanOptional(body.note,500)),notificationStatement(env,loan.borrower_id,"status","בקשת ההארכה אושרה","מועד ההחזרה החדש אושר.",requestId)]);return json({ok:true,status:"approved"});}await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET extension_status='declined',updated_at=? WHERE id=?").bind(now,requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"extension_declined",user.id,cleanOptional(body.note,500)),notificationStatement(env,loan.borrower_id,"status","בקשת ההארכה נדחתה","מועד ההחזרה המקורי נשאר בתוקף.",requestId)]);return json({ok:true,status:"declined"});}

async function editRequestMessage(request,env,messageId){const user=await requireUser(request,env),row=await env.DB.prepare("SELECT id,request_id,sender_id,created_at,deleted_at FROM request_messages WHERE id=?").bind(messageId).first();if(!row)throw new HttpError(404,"ההודעה לא נמצאה");if(row.sender_id!==user.id)throw new HttpError(403,"אפשר לערוך רק הודעה ששלחתם");if(row.deleted_at)throw new HttpError(409,"הודעה שנמחקה אינה ניתנת לעריכה");if(Date.now()-Date.parse(row.created_at)>15*60*1000)throw new HttpError(409,"אפשר לערוך הודעה רק ב-15 הדקות הראשונות");const b=await readJson(request),message=cleanText(b.message,1,2000,"הודעה");assertSafeChatText(message);await env.DB.batch([env.DB.prepare("UPDATE request_messages SET body=? WHERE id=?").bind(message,messageId),env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),row.request_id,user.id,"message_edited",JSON.stringify({messageId}))]);return json({ok:true,body:message})}

async function deleteRequestMessage(request,env,messageId){
  const user=await requireUser(request,env),row=await env.DB.prepare("SELECT id,request_id,sender_id,created_at,deleted_at FROM request_messages WHERE id=?").bind(messageId).first();
  if(!row)throw new HttpError(404,"ההודעה לא נמצאה");if(row.sender_id!==user.id)throw new HttpError(403,"אפשר למחוק רק הודעה ששלחתם");if(row.deleted_at)throw new HttpError(409,"ההודעה כבר נמחקה");
  if(Date.now()-Date.parse(row.created_at)>5*60*1000)throw new HttpError(409,"אפשר למחוק הודעה רק בחמש הדקות הראשונות");
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE request_messages SET body='הודעה נמחקה',media_url=NULL,metadata_json='{}',deleted_at=? WHERE id=?").bind(now,messageId),env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),row.request_id,user.id,"message_deleted",JSON.stringify({messageId}))]);return json({ok:true,deletedAt:now});
}

function assertSafeChatText(message){
  const matches=String(message).match(/(?:https?:\/\/|www\.)[^\s]+/gi)||[];
  const blockedHosts=new Set(["bit.ly","tinyurl.com","t.co","cutt.ly","is.gd","rb.gy","shorturl.at"]);
  for(const raw of matches){
    let u;try{u=new URL(raw.startsWith("www.")?"https://"+raw:raw);}catch{throw new HttpError(400,"הקישור בהודעה אינו תקין");}
    const host=u.hostname.toLowerCase();
    if(u.protocol!=="https:"||host.startsWith("xn--")||/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)||blockedHosts.has(host)) throw new HttpError(400,"מטעמי בטיחות לא ניתן לשלוח את הקישור הזה");
  }
}

async function listNotifications(request, env) {
  const user = await requireUser(request, env);
  const [items, unread] = await env.DB.batch([
    env.DB.prepare(`SELECT id,type,title,body,request_id,read_at,created_at FROM notifications
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(user.id),
    env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id)
  ]);
  return json({ notifications: items.results, unread: Number(unread.results[0]?.count || 0) });
}

async function markNotificationsRead(request, env) {
  const user = await requireUser(request, env);
  await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function createReport(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const itemId = cleanText(body.itemId, 1, 100, "פריט");
  const reason = cleanText(body.reason, 2, 30, "סיבת הדיווח");
  if (!["incorrect", "unsafe", "commercial", "unavailable", "other"].includes(reason)) throw new HttpError(400, "סיבת הדיווח אינה תקינה");
  const item = await env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  try {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO reports (id,reporter_id,item_id,reason,details) VALUES (?,?,?,?,?)")
      .bind(id, user.id, itemId, reason, cleanOptional(body.details, 800)).run();
    const reportCount=await env.DB.prepare("SELECT COUNT(DISTINCT reporter_id) AS count FROM reports WHERE item_id=? AND status='pending'").bind(itemId).first();
    const shouldHide=reason==="unsafe" || Number(reportCount?.count||0)>=3;
    if(shouldHide){
      const owner=await env.DB.prepare("SELECT o.owner_id,i.title FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?").bind(itemId).first();
      await env.DB.batch([
        env.DB.prepare("UPDATE items SET status='pending',updated_at=? WHERE id=? AND status='active'").bind(new Date().toISOString(),itemId),
        env.DB.prepare("INSERT INTO content_reports(id,entity_type,entity_id,reporter_id,reason,severity,status) VALUES(?,?,?,?,?,'critical','pending')").bind(crypto.randomUUID(),"item",itemId,user.id,reason),
        owner?.owner_id ? env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'system',?,?)").bind(crypto.randomUUID(),owner.owner_id,"הפריט הוסתר לבדיקה",`הפריט ${owner.title||""} הוסתר זמנית בעקבות דיווח בטיחות/מספר דיווחים וייבדק על ידי מנהל האתר.`) : env.DB.prepare("SELECT 1")
      ]);
    }
    return json({ report: { id, status: "pending", temporarilyHidden:shouldHide } }, 201);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new HttpError(409, "כבר שלחתם דיווח פתוח על הפריט הזה");
    throw error;
  }
}

async function adminPending(request, env) {
  await requireAdmin(request, env);
  const [items, reports] = await env.DB.batch([
    env.DB.prepare(`SELECT i.id,i.title,i.category,i.description,i.condition,i.quantity,i.status,i.created_at,o.name AS org_name,o.status AS org_status
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE i.status = 'pending' ORDER BY i.created_at ASC`),
    env.DB.prepare(`SELECT r.id,r.reason,r.details,r.created_at,i.title AS item_title,u.full_name AS reporter_name,u.email AS reporter_email
      FROM reports r JOIN items i ON i.id = r.item_id JOIN users u ON u.id = r.reporter_id
      WHERE r.status = 'pending' ORDER BY r.created_at ASC`)
  ]);
  return json({ organizations: [], items: items.results, reports: reports.results });
}

async function getSiteSettings(env) {
  const row = await env.DB.prepare("SELECT site_name,tagline,hero_title,hero_description,primary_color,secondary_color,accent_color,font_family,base_font_size,logo_url,updated_at FROM site_settings WHERE id = 1").first();
  return json({ settings: row });
}

async function adminOverview(request, env) {
  await requireAdmin(request, env);
  const [users, organizations, items, requests, audit] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM organizations"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM items"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM loan_requests"),
    env.DB.prepare("SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.full_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 30")
  ]);
  return json({ stats: { users: users.results[0]?.count || 0, organizations: organizations.results[0]?.count || 0, items: items.results[0]?.count || 0, requests: requests.results[0]?.count || 0 }, audit: audit.results });
}

async function adminAnalytics(request, env) {
  await requireAdmin(request, env);
  const [events, searches, cities, categories, sources, referrers, success] = await env.DB.batch([
    env.DB.prepare(`SELECT event_type,COUNT(*) AS count FROM analytics_events WHERE created_at>=datetime('now','-30 days') GROUP BY event_type`),
    env.DB.prepare(`SELECT query,COUNT(*) AS count FROM analytics_events WHERE event_type IN ('search','no_results') AND query IS NOT NULL GROUP BY query ORDER BY count DESC LIMIT 30`),
    env.DB.prepare(`SELECT city,COUNT(*) AS count FROM analytics_events WHERE city IS NOT NULL GROUP BY city ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT category,COUNT(*) AS count FROM analytics_events WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT COALESCE(source,'direct') AS source,COUNT(*) AS count FROM analytics_events WHERE created_at>=datetime('now','-30 days') GROUP BY COALESCE(source,'direct') ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT referrer,COUNT(*) AS count FROM analytics_events WHERE created_at>=datetime('now','-30 days') AND referrer IS NOT NULL GROUP BY referrer ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('approved','collected','returned') THEN 1 ELSE 0 END) AS successful FROM loan_requests`)
  ]);
  return json({ events:events.results, searches:searches.results, cities:cities.results, categories:categories.results, sources:sources.results, referrers:referrers.results, matching:{ total:Number(success.results[0]?.total||0), successful:Number(success.results[0]?.successful||0) } });
}

async function adminAnalyticsCsv(request,env){
  await requireAdmin(request,env);
  const rows=await env.DB.prepare(`SELECT created_at,event_type,query,city,category,entity_id,source,referrer,page_path FROM analytics_events ORDER BY created_at DESC LIMIT 10000`).all();
  const cols=["created_at","event_type","query","city","category","entity_id","source","referrer","page_path"];
  const cell=value=>{const s=String(value??"");return /[",\\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};
  const csv=[cols.join(","),...(rows.results||[]).map(row=>cols.map(key=>cell(row[key])).join(","))].join("\n");
  return new Response("\uFEFF"+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="gmach-analytics.csv"',"Cache-Control":"no-store"}});
}

async function adminSiteSettings(request, env) {
  await requireAdmin(request, env);
  const [settings, versions] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM site_settings WHERE id = 1"),
    env.DB.prepare("SELECT v.id,v.created_at,u.full_name AS created_by_name FROM site_setting_versions v LEFT JOIN users u ON u.id = v.created_by ORDER BY v.created_at DESC LIMIT 50")
  ]);
  return json({ settings: settings.results[0], versions: versions.results });
}

async function updateSiteSettings(request, env) {
  const user = await requireAdmin(request, env);
  const current = await env.DB.prepare("SELECT * FROM site_settings WHERE id = 1").first();
  if (!current) throw new HttpError(500, "הגדרות האתר אינן זמינות");
  const body = await readJson(request);
  const next = {
    site_name: cleanText(body.siteName, 2, 60, "שם האתר"), tagline: cleanText(body.tagline, 2, 140, "סלוגן"),
    hero_title: cleanText(body.heroTitle, 2, 100, "כותרת ראשית"), hero_description: cleanText(body.heroDescription, 10, 300, "תיאור ראשי"),
    primary_color: validateColor(body.primaryColor), secondary_color: validateColor(body.secondaryColor), accent_color: validateColor(body.accentColor),
    font_family: validateFont(body.fontFamily), base_font_size: Math.max(14, Math.min(22, Number(body.baseFontSize) || 16)),
    logo_url: validateAssetUrl(body.logoUrl)
  };
  const versionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_setting_versions (id,settings_json,created_by) VALUES (?,?,?)").bind(versionId, JSON.stringify(current), user.id),
    env.DB.prepare(`UPDATE site_settings SET site_name=?,tagline=?,hero_title=?,hero_description=?,primary_color=?,secondary_color=?,accent_color=?,font_family=?,base_font_size=?,logo_url=?,updated_by=?,updated_at=? WHERE id=1`)
      .bind(next.site_name,next.tagline,next.hero_title,next.hero_description,next.primary_color,next.secondary_color,next.accent_color,next.font_family,next.base_font_size,next.logo_url,user.id,new Date().toISOString()),
    auditStatement(env, user.id, "site.settings.update", "site_settings", "1", { versionId })
  ]);
  return json({ settings: next, versionId });
}

async function restoreSiteSettings(request, env, versionId) {
  const user = await requireAdmin(request, env);
  const [version, current] = await Promise.all([
    env.DB.prepare("SELECT settings_json FROM site_setting_versions WHERE id = ?").bind(versionId).first(),
    env.DB.prepare("SELECT * FROM site_settings WHERE id = 1").first()
  ]);
  if (!version) throw new HttpError(404, "הגרסה לא נמצאה");
  const saved = JSON.parse(version.settings_json);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_setting_versions (id,settings_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(current), user.id),
    env.DB.prepare(`UPDATE site_settings SET site_name=?,tagline=?,hero_title=?,hero_description=?,primary_color=?,secondary_color=?,accent_color=?,font_family=?,base_font_size=?,logo_url=?,updated_by=?,updated_at=? WHERE id=1`)
      .bind(saved.site_name,saved.tagline,saved.hero_title,saved.hero_description,saved.primary_color,saved.secondary_color,saved.accent_color,saved.font_family,saved.base_font_size,saved.logo_url,user.id,new Date().toISOString()),
    auditStatement(env, user.id, "site.settings.restore", "site_setting_versions", versionId)
  ]);
  return json({ ok: true });
}

async function adminUsers(request, env) {
  await requireAdmin(request, env);
  const result = await env.DB.prepare(`SELECT id,email,full_name,role,email_verified,account_status,totp_enabled,created_at,last_login_at
    FROM users ORDER BY created_at DESC LIMIT 500`).all();
  return json({ users: result.results });
}

async function getPageCustomizations(env) {
  const result = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json,updated_at FROM page_customizations ORDER BY element_key").all();
  return json({ customizations: result.results.map(row => ({ key: row.element_key, text: row.text_content, styles: safeJsonObject(row.styles_json), attributes: safeJsonObject(row.attributes_json), updatedAt: row.updated_at })) });
}

async function savePageCustomization(request, env) {
  const user = await requireAdmin(request, env);
  const body = await readJson(request);
  const key = cleanText(body.key, 2, 500, "מזהה רכיב");
  if (!/^(#[a-z][\w:-]*|(?:[a-z][\w-]*(?::nth-of-type\(\d+\))?)(?:>(?:[a-z][\w-]*(?::nth-of-type\(\d+\))?))*)$/i.test(key)) throw new HttpError(400, "מזהה הרכיב אינו תקין");
  const textContent = body.text === null || body.text === undefined ? null : cleanOptional(body.text, 3000);
  const styles = sanitizeEditorStyles(body.styles);
  const attributes = sanitizeEditorAttributes(body.attributes);
  const existing = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all();
  const versionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(versionId, JSON.stringify(existing.results), user.id),
    env.DB.prepare(`INSERT INTO page_customizations (element_key,text_content,styles_json,attributes_json,updated_by,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(element_key) DO UPDATE SET text_content=excluded.text_content,styles_json=excluded.styles_json,attributes_json=excluded.attributes_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(key, textContent, JSON.stringify(styles), JSON.stringify(attributes), user.id, new Date().toISOString()),
    auditStatement(env, user.id, "page.element.update", "page_element", key, { versionId })
  ]);
  return json({ customization: { key, text: textContent, styles, attributes }, versionId });
}

async function resetPageCustomizations(request, env) {
  const user = await requireAdmin(request, env);
  const existing = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(existing.results), user.id),
    env.DB.prepare("DELETE FROM page_customizations"), auditStatement(env, user.id, "page.customizations.reset", "page", "home")
  ]);
  return json({ ok: true });
}

async function restorePageCustomizationVersion(request, env, versionId) {
  const user = await requireAdmin(request, env);
  const [version, current] = await Promise.all([
    env.DB.prepare("SELECT snapshot_json FROM page_customization_versions WHERE id = ?").bind(versionId).first(),
    env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all()
  ]);
  if (!version) throw new HttpError(404, "גרסת העריכה לא נמצאה");
  const rows = JSON.parse(version.snapshot_json || "[]");
  const statements = [
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(current.results), user.id),
    env.DB.prepare("DELETE FROM page_customizations")
  ];
  for (const row of rows.slice(0, 1000)) statements.push(env.DB.prepare("INSERT INTO page_customizations (element_key,text_content,styles_json,attributes_json,updated_by) VALUES (?,?,?,?,?)").bind(row.element_key, row.text_content, row.styles_json || "{}", row.attributes_json || "{}", user.id));
  statements.push(auditStatement(env, user.id, "page.customizations.restore", "page_customization_versions", versionId));
  await env.DB.batch(statements);
  return json({ ok: true });
}

async function adminContent(request, env) {
  await requireAdmin(request, env);
  const [organizations, items, requests, reports, versions] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.city,o.neighborhood,o.status,o.verified,o.is_hidden,o.created_at,u.full_name AS owner_name,u.email AS owner_email FROM organizations o LEFT JOIN users u ON u.id=o.owner_id ORDER BY o.created_at DESC LIMIT 500`),
    env.DB.prepare(`SELECT i.id,i.title,i.category,i.condition,i.quantity,i.status,i.availability_status,i.created_at,o.name AS organization_name FROM items i JOIN organizations o ON o.id=i.organization_id ORDER BY i.created_at DESC LIMIT 1000`),
    env.DB.prepare(`SELECT lr.id,lr.status,lr.requested_from,lr.requested_until,lr.created_at,i.title AS item_title,b.full_name AS borrower_name,b.email AS borrower_email,o.name AS organization_name FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN users b ON b.id=lr.borrower_id JOIN organizations o ON o.id=i.organization_id ORDER BY lr.created_at DESC LIMIT 1000`),
    env.DB.prepare(`SELECT r.id,r.reason,r.status,r.created_at,i.title AS item_title,u.full_name AS reporter_name FROM reports r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 500`),
    env.DB.prepare(`SELECT v.id,v.created_at,u.full_name AS created_by_name FROM page_customization_versions v LEFT JOIN users u ON u.id=v.created_by ORDER BY v.created_at DESC LIMIT 100`)
  ]);
  return json({ organizations: organizations.results, items: items.results, requests: requests.results, reports: reports.results, visualVersions: versions.results });
}

async function updateAdminUser(request, env, id) {
  const admin = await requireAdmin(request, env);
  if (id === admin.id) throw new HttpError(400, "אי אפשר לשנות את הרשאות החשבון שמחובר כרגע");
  const body = await readJson(request);
  const role = body.role === "admin" ? "admin" : "member";
  const status = body.accountStatus === "suspended" ? "suspended" : "active";
  const verified = body.emailVerified === true ? 1 : 0;
  const result = await env.DB.prepare("UPDATE users SET role=?,account_status=?,email_verified=?,updated_at=? WHERE id=?").bind(role,status,verified,new Date().toISOString(),id).run();
  if (!result.meta.changes) throw new HttpError(404, "המשתמש לא נמצא");
  await auditStatement(env, admin.id, "user.update", "user", id, { role, status, verified }).run();
  return json({ id, role, accountStatus: status, emailVerified: Boolean(verified) });
}

function sanitizeEditorStyles(input) {
  const allowed = new Set(["color","backgroundColor","fontFamily","fontSize","fontWeight","textAlign","lineHeight","letterSpacing","width","maxWidth","minHeight","marginTop","marginBottom","marginInlineStart","marginInlineEnd","paddingTop","paddingBottom","paddingInlineStart","paddingInlineEnd","borderRadius","opacity","order","transform","display"]);
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [key, raw] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    const value = String(raw ?? "").trim();
    if (value.length <= 100 && !/[;{}<>]/.test(value)) result[key] = value;
  }
  return result;
}

function sanitizeEditorAttributes(input) {
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  if (typeof input.hidden === "boolean") result.hidden = input.hidden;
  if (typeof input.disabled === "boolean") result.disabled = input.disabled;
  if (typeof input.href === "string") {
    const href = input.href.trim();
    if (/^(#|\/|https:\/\/)[^\s<>]{0,500}$/.test(href)) result.href = href;
  }
  return result;
}

function safeJsonObject(value) {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function auditStatement(env, actorId, action, entityType, entityId = null, metadata = {}) {
  return env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(metadata));
}

async function moderateOrganization(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["approved", "rejected"].includes(status)) throw new HttpError(400, "סטטוס האישור אינו תקין");
  const result = await env.DB.prepare("UPDATE organizations SET status = ?, verified = 0, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הגמ״ח לא נמצא");
  return json({ id, status });
}

async function moderateItem(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["active", "rejected", "archived"].includes(status)) throw new HttpError(400, "סטטוס הפריט אינו תקין");
  if (status === "active") {
    const owner = await env.DB.prepare("SELECT o.status FROM items i JOIN organizations o ON o.id = i.organization_id WHERE i.id = ?").bind(id).first();
    if (!owner) throw new HttpError(404, "הפריט לא נמצא");
    if (owner.status !== "approved") throw new HttpError(409, "יש לאשר את הגמ״ח לפני פרסום הפריט");
  }
  const result = await env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הפריט לא נמצא");
  return json({ id, status });
}

async function moderateReport(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["reviewed", "dismissed"].includes(status)) throw new HttpError(400, "סטטוס הדיווח אינו תקין");
  const result = await env.DB.prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(status, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הדיווח לא נמצא או כבר טופל");
  return json({ id, status });
}

async function requireOrganizationRole(request,env,organizationId,allowed=["owner","requests","inventory","reports"]){
  const user=await requireUser(request,env);
  if(user.role==="admin") return {user,role:"owner"};
  const row=await env.DB.prepare(`SELECT CASE WHEN o.owner_id=? THEN 'owner' ELSE m.role END AS role FROM organizations o LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE o.id=?`).bind(user.id,user.id,organizationId).first();
  if(!row?.role||!allowed.includes(row.role)) throw new HttpError(403,"אין הרשאה לבצע את הפעולה בגמ״ח הזה");
  return {user,role:row.role};
}

async function listBranches(request,env,organizationId){
  await requireOrganizationRole(request,env,organizationId);
  const rows=await env.DB.prepare("SELECT * FROM organization_branches WHERE organization_id=? AND status!='archived' ORDER BY created_at").bind(organizationId).all();
  return json({branches:rows.results.map(row=>({...row,hours:safeJsonObject(row.hours_json)}))});
}

async function createBranch(request,env,organizationId){
  const {user}=await requireOrganizationRole(request,env,organizationId,["owner"]),body=await readJson(request),id=crypto.randomUUID();
  const mode=["separate","shared","hybrid"].includes(body.inventoryMode)?body.inventoryMode:"separate";
  await env.DB.batch([env.DB.prepare("INSERT INTO organization_branches(id,organization_id,name,address,city,latitude,longitude,phone,hours_json,inventory_mode) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,organizationId,cleanText(body.name,2,80,"שם הסניף"),cleanText(body.address,5,180,"כתובת"),cleanText(body.city,2,80,"עיר"),Number.isFinite(Number(body.latitude))?Number(body.latitude):null,Number.isFinite(Number(body.longitude))?Number(body.longitude):null,validatePhone(body.phone),sanitizeHours(body.hours),mode),auditStatement(env,user.id,"branch.create","organization_branch",id,{organizationId})]);
  return json({branch:{id,organizationId,inventoryMode:mode}},201);
}

async function updateBranch(request,env,id){
  const body=await readJson(request),branch=await env.DB.prepare("SELECT * FROM organization_branches WHERE id=?").bind(id).first();
  if(!branch) throw new HttpError(404,"הסניף לא נמצא");
  const {user}=await requireOrganizationRole(request,env,branch.organization_id,["owner"]);
  const status=body.status===undefined?branch.status:(["active","temporarily_closed","archived"].includes(body.status)?body.status:null);
  if(!status) throw new HttpError(400,"סטטוס הסניף אינו תקין");
  const reopensAt=body.reopensAt===undefined?branch.reopens_at:(body.reopensAt?new Date(body.reopensAt).toISOString():null);
  const name=body.name===undefined?branch.name:cleanText(body.name,2,80,"שם הסניף");
  const city=body.city===undefined?branch.city:cleanText(body.city,2,80,"עיר");
  const address=body.address===undefined?branch.address:cleanText(body.address,5,180,"כתובת");
  const phone=body.phone===undefined?branch.phone:validatePhone(body.phone);
  const mode=body.inventoryMode===undefined?branch.inventory_mode:(["separate","shared","hybrid"].includes(body.inventoryMode)?body.inventoryMode:null);
  if(!mode) throw new HttpError(400,"מודל המלאי אינו תקין");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE organization_branches SET name=?,address=?,city=?,phone=?,inventory_mode=?,status=?,reopens_at=?,updated_at=? WHERE id=?").bind(name,address,city,phone,mode,status,reopensAt,now,id),
    auditStatement(env,user.id,"branch.update","organization_branch",id,{before:{status:branch.status,reopensAt:branch.reopens_at},after:{status,reopensAt}})
  ]);
  if(status==="temporarily_closed"&&branch.status!=="temporarily_closed"){
    const rows=await env.DB.prepare("SELECT DISTINCT borrower_id,id FROM loan_requests WHERE branch_id=? AND status IN ('pending','approved')").bind(id).all();
    for(const row of rows.results||[]) await env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),row.borrower_id,"status","הסניף נסגר זמנית",reopensAt?"הסניף נסגר זמנית. פתיחה מתוכננת: "+reopensAt:"הסניף נסגר זמנית. נעדכן כשיחזור לפעילות.",row.id).run();
  }
  return json({ok:true,branch:{id,name,city,address,phone,inventoryMode:mode,status,reopensAt}});
}
async function archiveBranch(request,env,id){
  const branch=await env.DB.prepare("SELECT * FROM organization_branches WHERE id=?").bind(id).first();
  if(!branch) throw new HttpError(404,"הסניף לא נמצא");
  const {user}=await requireOrganizationRole(request,env,branch.organization_id,["owner"]);
  const active=await env.DB.prepare("SELECT COUNT(*) AS n FROM loan_requests WHERE branch_id=? AND status IN ('pending','approved','collected')").bind(id).first();
  if(Number(active?.n||0)>0) throw new HttpError(409,"לא ניתן לארכב סניף עם השאלות פעילות");
  await env.DB.batch([env.DB.prepare("UPDATE organization_branches SET status='archived',updated_at=? WHERE id=?").bind(new Date().toISOString(),id),auditStatement(env,user.id,"branch.archive","organization_branch",id,{})]);
  return json({ok:true});
}

async function listOrganizationMembers(request,env,organizationId){
  await requireOrganizationRole(request,env,organizationId,["owner"]);
  const rows=await env.DB.prepare(`SELECT m.user_id,m.role,m.branch_scope_json,m.category_scope_json,m.created_at,u.full_name,u.email FROM organization_members m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.created_at`).bind(organizationId).all();
  return json({members:rows.results});
}

async function addOrganizationMember(request,env,organizationId){
  const {user}=await requireOrganizationRole(request,env,organizationId,["owner"]),body=await readJson(request),email=normalizeEmail(body.email),role=["requests","inventory","reports"].includes(body.role)?body.role:null;
  if(!role) throw new HttpError(400,"תפקיד המנהל אינו תקין");
  const member=await env.DB.prepare("SELECT id FROM users WHERE email=? COLLATE NOCASE AND account_status='active'").bind(email).first();
  if(!member) throw new HttpError(404,"לא נמצא משתמש פעיל עם כתובת האימייל הזו");
  await env.DB.batch([env.DB.prepare(`INSERT INTO organization_members(organization_id,user_id,role,branch_scope_json,category_scope_json) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,branch_scope_json=excluded.branch_scope_json,category_scope_json=excluded.category_scope_json`).bind(organizationId,member.id,role,JSON.stringify(Array.isArray(body.branchIds)?body.branchIds.slice(0,50):[]),JSON.stringify(Array.isArray(body.categoryIds)?body.categoryIds.slice(0,50):[])),auditStatement(env,user.id,"organization.member.set","organization",organizationId,{memberId:member.id,role})]);
  return json({member:{userId:member.id,role}},201);
}

async function listOrganizationInvitations(request,env,organizationId){await requireOrganizationRole(request,env,organizationId,["owner"]);const rows=await env.DB.prepare("SELECT id,role,branch_scope_json,category_scope_json,message,invited_email,expires_at,accepted_at,cancelled_at,created_at FROM organization_invitations WHERE organization_id=? ORDER BY created_at DESC LIMIT 100").bind(organizationId).all();return json({invitations:rows.results})}
async function createOrganizationInvitation(request,env,organizationId,url){
  const invitationColumns=await env.DB.prepare("PRAGMA table_info(organization_invitations)").all();
  if(!(invitationColumns.results||[]).some(column=>column.name==="invited_email")) await env.DB.prepare("ALTER TABLE organization_invitations ADD COLUMN invited_email TEXT").run();
  const {user}=await requireOrganizationRole(request,env,organizationId,["owner"]),body=await readJson(request),role=["requests","inventory","reports"].includes(body.role)?body.role:null;
  if(!role)throw new HttpError(400,"תפקיד המנהל אינו תקין");
  const invitedEmail=body.email?normalizeEmail(body.email):null,token=randomToken(32),tokenHash=await sha256(token),id=crypto.randomUUID(),expiresAt=new Date(Date.now()+7*86400000).toISOString(),inviteUrl=`${url.origin}/#/invite/${encodeURIComponent(token)}`;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organization_invitations(id,organization_id,token_hash,role,branch_scope_json,category_scope_json,message,invited_by,expires_at,invited_email) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(id,organizationId,tokenHash,role,JSON.stringify(Array.isArray(body.branchIds)?body.branchIds.slice(0,50):[]),JSON.stringify(Array.isArray(body.categoryIds)?body.categoryIds.slice(0,50):[]),cleanOptional(body.message,500),user.id,expiresAt,invitedEmail),
    auditStatement(env,user.id,"organization.invitation.create","organization",organizationId,{invitationId:id,role,invitedEmail})
  ]);
  let emailSent=false;
  if(invitedEmail&&env.RESEND_API_KEY){
    try{
      const org=await env.DB.prepare("SELECT name FROM organizations WHERE id=?").bind(organizationId).first();
      const recipient=await env.DB.prepare("SELECT preferred_language FROM users WHERE email=? COLLATE NOCASE LIMIT 1").bind(invitedEmail).first();
      const name=String(org?.name||"Gmach"),safeName=escapeHtmlEmail(name),language=recipient?.preferred_language||"both";
      const englishText=`You were invited to manage ${name}. This invitation expires in seven days: ${inviteUrl}`;
      const hebrewText=`הוזמנת להצטרף כמנהל/ת של ${name}. הקישור בתוקף לשבעה ימים: ${inviteUrl}`;
      const subject=language==="he"?`הזמנה לניהול ${name}`:language==="en"?`Invitation to manage ${name}`:`Invitation to manage a gmach | הזמנה לניהול גמ״ח`;
      const text=language==="he"?hebrewText:language==="en"?englishText:`${englishText}\n\n${hebrewText}`;
      const englishHtml=`<section dir="ltr" lang="en"><h2>Invitation to manage a gmach</h2><p>You were invited to manage ${safeName}.</p><p><a href="${inviteUrl}">Open invitation</a></p><p>The invitation expires in seven days.</p></section>`;
      const hebrewHtml=`<section dir="rtl" lang="he"><h2>הזמנה לניהול</h2><p>הוזמנת להצטרף כמנהל/ת של ${safeName}.</p><p><a href="${inviteUrl}">פתיחת ההזמנה</a></p><p>הקישור בתוקף לשבעה ימים.</p></section>`;
      const deliver=env.RESEND_SERVICE?.fetch?env.RESEND_SERVICE.fetch.bind(env.RESEND_SERVICE):fetch;
      const res=await deliver("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify({from:String(env.RESEND_FROM_EMAIL||DEFAULT_FROM_EMAIL),to:[invitedEmail],subject,text,html:`<div style="font-family:Arial,sans-serif">${language==="he"?hebrewHtml:language==="en"?englishHtml:englishHtml+hebrewHtml}</div>`})});emailSent=res.ok;
    }catch(error){console.error("manager invitation email failed",{organizationId,invitedEmail,error});}
  }
  return json({invitation:{id,role,expiresAt,url:inviteUrl,invitedEmail,emailSent}},201);
}
async function cancelOrganizationInvitation(request,env,id){const inv=await env.DB.prepare("SELECT organization_id FROM organization_invitations WHERE id=?").bind(id).first();if(!inv)throw new HttpError(404,"ההזמנה לא נמצאה");const {user}=await requireOrganizationRole(request,env,inv.organization_id,["owner"]);const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE organization_invitations SET cancelled_at=? WHERE id=? AND accepted_at IS NULL").bind(now,id),auditStatement(env,user.id,"organization.invitation.cancel","organization",inv.organization_id,{invitationId:id})]);return json({ok:true})}
async function acceptOrganizationInvitation(request,env,token){
  const user=await requireUser(request,env),hash=await sha256(token),inv=await env.DB.prepare("SELECT * FROM organization_invitations WHERE token_hash=? AND accepted_at IS NULL AND cancelled_at IS NULL AND expires_at>?").bind(hash,new Date().toISOString()).first();
  if(!inv)throw new HttpError(404,"ההזמנה אינה תקפה או שפג תוקפה");
  if(inv.invited_email&&String(inv.invited_email).toLowerCase()!==String(user.email).toLowerCase())throw new HttpError(403,"ההזמנה נשלחה לכתובת אימייל אחרת");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organization_members(organization_id,user_id,role,branch_scope_json,category_scope_json) VALUES(?,?,?,?,?) ON CONFLICT(organization_id,user_id) DO UPDATE SET role=excluded.role,branch_scope_json=excluded.branch_scope_json,category_scope_json=excluded.category_scope_json").bind(inv.organization_id,user.id,inv.role,inv.branch_scope_json,inv.category_scope_json),
    env.DB.prepare("UPDATE organization_invitations SET accepted_by=?,accepted_at=? WHERE id=?").bind(user.id,now,inv.id),
    auditStatement(env,user.id,"organization.invitation.accept","organization",inv.organization_id,{invitationId:inv.id})
  ]);
  return json({ok:true,organizationId:inv.organization_id,role:inv.role});
}

async function removeOrganizationMember(request,env,organizationId,memberId){
  const {user}=await requireOrganizationRole(request,env,organizationId,["owner"]);
  await env.DB.batch([env.DB.prepare("DELETE FROM organization_members WHERE organization_id=? AND user_id=?").bind(organizationId,memberId),auditStatement(env,user.id,"organization.member.remove","organization",organizationId,{memberId})]);
  return json({ok:true});
}

async function itemOrganization(env,itemId){return env.DB.prepare("SELECT i.organization_id,i.serial_prefix,o.name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?").bind(itemId).first();}
async function listItemUnits(request,env,itemId){const item=await itemOrganization(env,itemId);if(!item)throw new HttpError(404,"הפריט לא נמצא");await requireOrganizationRole(request,env,item.organization_id,["owner","inventory"]);const rows=await env.DB.prepare("SELECT id,branch_id,serial_number,status,condition,created_at,updated_at FROM item_units WHERE item_id=? ORDER BY created_at").bind(itemId).all();return json({units:rows.results});}
async function createItemUnit(request,env,itemId){const item=await itemOrganization(env,itemId);if(!item)throw new HttpError(404,"הפריט לא נמצא");const {user}=await requireOrganizationRole(request,env,item.organization_id,["owner","inventory"]),body=await readJson(request);const count=positiveInt(body.count,1,1,100,"כמות יחידות"),prefix=String(item.serial_prefix||item.name||"GMH").replace(/[^A-Za-z0-9א-ת]/g,"").slice(0,8).toUpperCase()||"GMH",created=[];for(let i=0;i<count;i++){let serial;for(let attempt=0;attempt<10;attempt++){serial=`${prefix}-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;const exists=await env.DB.prepare("SELECT 1 FROM item_units WHERE serial_number=? UNION SELECT 1 FROM retired_serials WHERE serial_number=?").bind(serial,serial).first();if(!exists)break;}const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO item_units(id,item_id,branch_id,serial_number,condition) VALUES(?,?,?,?,?)").bind(id,itemId,cleanOptional(body.branchId,100),serial,cleanText(body.condition,2,30,"מצב היחידה")).run();created.push({id,serialNumber:serial});}await auditStatement(env,user.id,"item.units.create","item",itemId,{count}).run();return json({units:created},201);}

async function markReviewHelpful(request,env,reviewId){const user=await requireUser(request,env);const exists=await env.DB.prepare("SELECT id FROM reviews WHERE id=? AND status='published'").bind(reviewId).first();if(!exists)throw new HttpError(404,"הביקורת לא נמצאה");await env.DB.batch([env.DB.prepare("INSERT OR IGNORE INTO review_helpful_votes(review_id,user_id) VALUES(?,?)").bind(reviewId,user.id),env.DB.prepare("UPDATE reviews SET helpful_count=(SELECT COUNT(*) FROM review_helpful_votes WHERE review_id=?) WHERE id=?").bind(reviewId,reviewId)]);return json({helpful:true});}
async function reportReviewContent(request,env,reviewId){const user=await requireUser(request,env),body=await readJson(request),id=crypto.randomUUID();try{await env.DB.prepare("INSERT INTO review_reports(id,review_id,reporter_id,reason) VALUES(?,?,?,?)").bind(id,reviewId,user.id,cleanText(body.reason,2,500,"סיבת הדיווח")).run();}catch(error){if(String(error).toLowerCase().includes("unique"))throw new HttpError(409,"כבר דיווחתם על הביקורת");throw error;}return json({report:{id,status:"pending"}},201);}

async function loanAccess(request,env,requestId){
  const user=await requireUser(request,env);const loan=await env.DB.prepare(`SELECT lr.*,i.organization_id,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE lr.id=? AND (lr.borrower_id=? OR o.owner_id=? OR m.user_id IS NOT NULL OR ?='admin')`).bind(user.id,requestId,user.id,user.id,user.role).first();
  if(!loan)throw new HttpError(404,"ההשאלה לא נמצאה או שאין הרשאה לצפות בה");return {user,loan};
}
async function getLoanTimeline(request,env,requestId){const {loan}=await loanAccess(request,env,requestId);const [events,proposals,ranges]=await env.DB.batch([env.DB.prepare("SELECT status,note,created_at FROM loan_status_events WHERE request_id=? ORDER BY created_at").bind(requestId),env.DB.prepare("SELECT id,starts_at,ends_at,status,created_at FROM pickup_proposals WHERE request_id=? ORDER BY created_at DESC").bind(requestId),env.DB.prepare("SELECT id,requested_from,requested_until,status FROM loan_date_ranges WHERE request_id=? ORDER BY requested_from").bind(requestId)]);return json({request:{id:loan.id,status:loan.status,workflowStatus:loan.workflow_status,requestedFrom:loan.requested_from,requestedUntil:loan.requested_until},events:events.results,proposals:proposals.results,dateRanges:ranges.results});}
async function createPickupProposal(request,env,requestId){const {user,loan}=await loanAccess(request,env,requestId),body=await readJson(request),start=validateDateTime(body.startsAt,"תחילת חלון האיסוף"),end=validateDateTime(body.endsAt,"סיום חלון האיסוף");if(end<=start)throw new HttpError(400,"סיום חלון האיסוף חייב להיות אחרי תחילתו");const id=crypto.randomUUID(),now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE pickup_proposals SET status='rejected' WHERE request_id=? AND status='pending'").bind(requestId),env.DB.prepare("INSERT INTO pickup_proposals(id,request_id,proposed_by,starts_at,ends_at) VALUES(?,?,?,?,?)").bind(id,requestId,user.id,start,end),env.DB.prepare("UPDATE loan_requests SET workflow_status='pickup_time_proposed',proposed_from=?,proposed_until=?,updated_at=? WHERE id=?").bind(start,end,now,requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"pickup_time_proposed",user.id,null)]);const recipient=user.id===loan.borrower_id?loan.owner_id:loan.borrower_id;await notificationStatement(env,recipient,"pickup_proposed","הוצע זמן איסוף","נשלחה הצעה חדשה לחלון איסוף.",requestId).run();return json({proposal:{id,startsAt:start,endsAt:end,status:"pending"}},201);}
async function acceptPickupProposal(request,env,proposalId){const proposal=await env.DB.prepare("SELECT p.*,lr.borrower_id,i.organization_id,o.owner_id FROM pickup_proposals p JOIN loan_requests lr ON lr.id=p.request_id JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE p.id=?").bind(proposalId).first();if(!proposal)throw new HttpError(404,"הצעת הזמן לא נמצאה");const {user}=await loanAccess(request,env,proposal.request_id);if(user.id===proposal.proposed_by)throw new HttpError(403,"רק הצד השני יכול לאשר את ההצעה");const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE pickup_proposals SET status='accepted' WHERE id=? AND status='pending'").bind(proposalId),env.DB.prepare("UPDATE pickup_proposals SET status='rejected' WHERE request_id=? AND id<>? AND status='pending'").bind(proposal.request_id,proposalId),env.DB.prepare("UPDATE loan_requests SET status='approved',workflow_status='approved_ready_for_pickup',pickup_window_start=?,pickup_window_end=?,pickup_expires_at=?,updated_at=? WHERE id=?").bind(proposal.starts_at,proposal.ends_at,proposal.ends_at,now,proposal.request_id),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),proposal.request_id,"approved_ready_for_pickup",user.id,null)]);return json({ok:true,status:"approved_ready_for_pickup"});}
async function respondPickupExpiry(request,env,requestId){const {user,loan}=await loanAccess(request,env,requestId);if(user.id!==loan.borrower_id)throw new HttpError(403,"רק השואל יכול לבחור מה לעשות לאחר שפג זמן האיסוף");if(loan.workflow_status!=="pickup_expired")throw new HttpError(409,"זמן האיסוף אינו מסומן כפג");const body=await readJson(request),action=String(body.action||"");const now=new Date().toISOString();if(action==="cancel"){await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET status='cancelled',workflow_status='cancelled',cancelled_at=?,updated_at=? WHERE id=?").bind(now,now,requestId),env.DB.prepare("UPDATE inventory_holds SET status='released' WHERE request_id=? AND status IN ('active','converted')").bind(requestId),env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,user.id,"pickup_expired_cancelled","{}")]);await notificationStatement(env,loan.owner_id,"status","הבקשה בוטלה לאחר שפג זמן האיסוף","השואל בחר לבטל את הבקשה.",requestId).run();await advanceWaitlist(env,loan.item_id);return json({ok:true,status:"cancelled"})}if(action==="wait"){await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET workflow_status='pickup_time_proposed',pickup_expires_at=NULL,updated_at=? WHERE id=?").bind(now,requestId),env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,user.id,"pickup_expired_wait","{}")]);await notificationStatement(env,loan.owner_id,"status","השואל ממתין לתיאום איסוף חדש","יש להציע חלון איסוף חדש.",requestId).run();return json({ok:true,status:"pickup_time_proposed"})}throw new HttpError(400,"יש לבחור המתנה או ביטול")}

async function requestLoanExtension(request,env,requestId){const {user,loan}=await loanAccess(request,env,requestId);if(user.id!==loan.borrower_id)throw new HttpError(403,"רק השואל יכול לבקש הארכה");if(!["approved","collected"].includes(loan.status))throw new HttpError(409,"לא ניתן לבקש הארכה בשלב הזה");const body=await readJson(request),until=validateDateTime(body.requestedUntil,"מועד החזרה חדש");if(until<=loan.requested_until)throw new HttpError(400,"מועד ההחזרה החדש חייב להיות מאוחר יותר");const conflict=await env.DB.prepare(`SELECT id FROM loan_requests WHERE item_id=? AND id<>? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>? LIMIT 1`).bind(loan.item_id,requestId,until,loan.requested_until).first();if(conflict)throw new HttpError(409,"קיימת השאלה מתנגשת ולכן אי אפשר להאריך עד המועד הזה");await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET extension_until=?,extension_status='pending',workflow_status='extension_pending',updated_at=? WHERE id=?").bind(until,new Date().toISOString(),requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"extension_pending",user.id,cleanOptional(body.note,500))]);await notificationStatement(env,loan.owner_id,"extension_requested","בקשת הארכה","השואל ביקש להאריך את ההשאלה.",requestId).run();return json({ok:true,status:"extension_pending"},201);}

async function listHelpOffers(request,env,helpRequestId){const user=await requireUser(request,env);const help=await env.DB.prepare("SELECT requester_id AS user_id FROM help_requests WHERE id=?").bind(helpRequestId).first();if(!help)throw new HttpError(404,"בקשת הקהילה לא נמצאה");const rows=await env.DB.prepare(`SELECT h.*,u.full_name,i.title AS item_title FROM help_request_offers h JOIN users u ON u.id=h.responder_id LEFT JOIN items i ON i.id=h.item_id WHERE h.help_request_id=? AND (h.responder_id=? OR ?=? OR ?='admin') ORDER BY h.created_at DESC`).bind(helpRequestId,user.id,help.user_id,user.id,user.role).all();return json({offers:rows.results});}
async function updateHelpOffer(request,env,offerId){const user=await requireUser(request,env),body=await readJson(request),row=await env.DB.prepare(`SELECT o.*,h.requester_id,h.status AS request_status FROM help_request_offers o JOIN help_requests h ON h.id=o.help_request_id WHERE o.id=?`).bind(offerId).first();if(!row)throw new HttpError(404,"ההצעה לא נמצאה");const status=String(body.status||"");if(status==="withdrawn"){if(row.responder_id!==user.id)throw new HttpError(403,"רק מציע ההצעה יכול לבטל אותה");await env.DB.prepare("UPDATE help_request_offers SET status='withdrawn' WHERE id=? AND status='offered'").bind(offerId).run();return json({ok:true,status});}if(status==="selected"){if(row.requester_id!==user.id)throw new HttpError(403,"רק מפרסם הבקשה יכול לבחור הצעה");if(row.request_status!=="open")throw new HttpError(409,"בקשת הקהילה כבר נסגרה");await env.DB.batch([env.DB.prepare("UPDATE help_request_offers SET status=CASE WHEN id=? THEN 'selected' WHEN status='offered' THEN 'declined' ELSE status END WHERE help_request_id=?").bind(offerId,row.help_request_id),env.DB.prepare("UPDATE help_requests SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.help_request_id),notificationStatement(env,row.responder_id,"status","ההצעה שלכם נבחרה","מפרסם בקשת הקהילה בחר בהצעה שלכם.")]);return json({ok:true,status});}throw new HttpError(400,"סטטוס הצעה לא נתמך");}
async function createHelpOffer(request,env,helpRequestId){const user=await requireUser(request,env),body=await readJson(request),help=await env.DB.prepare("SELECT requester_id AS user_id,status FROM help_requests WHERE id=?").bind(helpRequestId).first();if(!help||help.status!=="open")throw new HttpError(404,"בקשת הקהילה אינה פתוחה");if(help.user_id===user.id)throw new HttpError(400,"אי אפשר להציע מענה לבקשה שלכם");const itemId=cleanOptional(body.itemId,100);if(itemId){const permitted=await env.DB.prepare(`SELECT i.id FROM items i JOIN organizations o ON o.id=i.organization_id LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE i.id=? AND (o.owner_id=? OR m.user_id IS NOT NULL OR ?='admin')`).bind(user.id,itemId,user.id,user.role).first();if(!permitted)throw new HttpError(403,"אין הרשאה להציע את הפריט הזה");}const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare("INSERT INTO help_request_offers(id,help_request_id,responder_id,item_id,message) VALUES(?,?,?,?,?)").bind(id,helpRequestId,user.id,itemId,cleanOptional(body.message,800)),notificationStatement(env,help.user_id,"community_offer","התקבלה הצעה לבקשת הקהילה","מישהו הציע עזרה לבקשה שפרסמתם.")]);return json({offer:{id,status:"offered"}},201);}

async function serveMedia(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "הפעולה אינה נתמכת");
  const key = decodeURIComponent(url.pathname.slice("/media/".length));
  if (!key.startsWith("items/") || key.includes("..")) throw new HttpError(404, "התמונה לא נמצאה");
  const object = await env.ITEM_IMAGES.get(key);
  if (!object) throw new HttpError(404, "התמונה לא נמצאה");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "יש להתחבר כדי להמשיך");
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "הפעולה מיועדת למנהלי האתר");
  return user;
}

async function notifySavedFollowers(env,{itemId,organizationId,category,title,event}){try{const rows=await env.DB.prepare(`SELECT DISTINCT user_id FROM saved_entities WHERE notify=1 AND ((entity_type='item' AND entity_id=?) OR (entity_type='organization' AND entity_id=?) OR (entity_type='category' AND entity_id=?))`).bind(itemId||"",organizationId||"",category||"").all();if(!rows.results?.length)return;const messages={created:["נוסף מוצר שעשוי לעניין אותך",`${title} נוסף לתוכן ששמרת.`],changed:["פרטי מוצר שמור השתנו",`עודכנו פרטים עבור ${title}.`],available:["מוצר שמור חזר לזמינות",`${title} זמין שוב להשאלה.`]};const [subject,body]=messages[event]||messages.changed;await env.DB.batch(rows.results.map(r=>notificationStatement(env,r.user_id,"system",subject,body,null)))}catch(error){console.error("saved follower notification failed",{itemId,event,error})}}

function notificationStatement(env, userId, type, title, body, requestId = null) {
  if (!["request", "status", "message", "system"].includes(type)) type = "status";
  return env.DB.prepare("INSERT INTO notifications (id,user_id,type,title,body,request_id) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, type, title, body, requestId);
}

async function enforceAuthRateLimit(env, email, action, ctx, limit = 10) {
  const identity = await sha256(email);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM auth_events
    WHERE identity_hash = ? AND action = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')`).bind(identity, action).first();
  if (Number(row?.count || 0) >= limit) throw new HttpError(429, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות");
  await env.DB.prepare("INSERT INTO auth_events (identity_hash,action) VALUES (?,?)").bind(identity, action).run();
  ctx?.waitUntil(env.DB.prepare("DELETE FROM auth_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')").run());
}

export async function translateUserContent(request,env,ctx){
  if(!env.AI?.run)throw new HttpError(503,"שירות התרגום אינו זמין כרגע");
  const body=await readJson(request),texts=body?.texts;
  if(!Array.isArray(texts)||texts.length<1||texts.length>12||texts.some(text=>typeof text!=="string"||text.length<2||text.length>500)||texts.reduce((sum,text)=>sum+text.length,0)>4500)throw new HttpError(400,"יש לשלוח עד 12 קטעי טקסט, באורך כולל של עד 4,500 תווים");
  const identity=request.headers.get("CF-Connecting-IP")||request.headers.get("X-Forwarded-For")||"unknown";
  await enforcePublicRateLimit(env,identity,"content_translation",ctx,20);
  const translated=[];
  for(const text of texts){
    if(!/[\u0590-\u05ff]/.test(text)){translated.push(text);continue}
    try{
      const result=await env.AI.run("@cf/meta/m2m100-1.2b",{text,source_lang:"he",target_lang:"en"});
      const value=result?.translated_text||result?.translation||result?.response;
      if(typeof value!=="string"||!value.trim())throw new Error("Empty translation");
      translated.push(value.trim());
    }catch(error){console.error("user content translation failed",{error});throw new HttpError(503,"התרגום אינו זמין כרגע. אפשר לנסות שוב מאוחר יותר")}
  }
  return json({translations:translated},200,{"Cache-Control":"no-store"});
}

async function enforcePublicRateLimit(env, identityValue, action, ctx, limit = 10) {
  const identity = await sha256(identityValue);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM abuse_events
    WHERE identity_hash = ? AND action = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')`).bind(identity, action).first();
  if (Number(row?.count || 0) >= limit) throw new HttpError(429, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות");
  await env.DB.prepare("INSERT INTO abuse_events(identity_hash,action) VALUES (?,?)").bind(identity, action).run();
  ctx?.waitUntil(env.DB.prepare("DELETE FROM abuse_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')").run());
}

async function communityUnsubscribeToken(env,userId){
  const secret=String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"");if(!secret)return null;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("community-unsubscribe:"+userId)));
  return userId+"."+toBase64Url(sig);
}
async function unsubscribeCommunity(env,token){
  const [userId,sig]=String(token||"").split(".");if(!userId||!sig)throw new HttpError(400,"קישור ההסרה אינו תקין");
  const expected=await communityUnsubscribeToken(env,userId);if(!expected||expected!==token)throw new HttpError(403,"קישור ההסרה אינו תקף");
  await env.DB.prepare("UPDATE users SET community_emails_accepted=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),userId).run();
  return new Response("<!doctype html><meta charset=utf-8><title>גמ״ח ברגע</title><main dir=rtl style='font-family:Arial;max-width:600px;margin:60px auto'><h1>העדכונים הופסקו</h1><p>הוסרת בהצלחה עדכוני קהילה באימייל. הודעות תפעוליות חיוניות לחשבון אינן מושפעות.</p></main>",{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}});
}
function icsEscape(v){return String(v||"").replaceAll("\\","\\\\").replaceAll(";","\\;").replaceAll(",","\\,").replace(/\r?\n/g,"\\n")}
function icsUtc(v){const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z")}
async function myCalendarFeed(request,env){
  const user=await requireUser(request,env);let token=user.calendar_feed_token;
  if(!token){token=toBase64Url(crypto.getRandomValues(new Uint8Array(24)));await env.DB.prepare("UPDATE users SET calendar_feed_token=?,updated_at=? WHERE id=?").bind(token,new Date().toISOString(),user.id).run()}
  return json({url:"https://gmach-karov1.nh8030954.workers.dev/calendar/"+token+".ics"});
}
async function publicCalendarFeed(env,token){
  const user=await env.DB.prepare("SELECT id FROM users WHERE calendar_feed_token=? AND deleted_at IS NULL").bind(token).first();if(!user)return new Response("Not found",{status:404});
  const pref=await env.DB.prepare("SELECT reminder_minutes FROM calendar_preferences WHERE user_id=?").bind(user.id).first().catch(()=>null),reminder=Math.max(0,Number(pref?.reminder_minutes??1440));
  const rows=await env.DB.prepare(`SELECT lr.id,lr.requested_from,lr.requested_until,lr.status,i.title,o.name organization_name FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE (lr.borrower_id=? OR o.owner_id=?) AND lr.status IN ('pending','approved','collected') ORDER BY lr.requested_from LIMIT 300`).bind(user.id,user.id).all();
  const events=[];for(const x of rows.results||[]){for(const [kind,when,label] of [["pickup",x.requested_from,"איסוף"],["return",x.requested_until,"החזרה"]]){const dt=icsUtc(when);if(!dt)continue;events.push(["BEGIN:VEVENT","UID:"+x.id+"-"+kind+"@gmach-berega","DTSTAMP:"+icsUtc(new Date()),"DTSTART:"+dt,"SUMMARY:"+icsEscape(label+" · "+x.title),"DESCRIPTION:"+icsEscape(x.organization_name+" · "+x.status),"URL:https://gmach-karov1.nh8030954.workers.dev/#/account",...(reminder?["BEGIN:VALARM","TRIGGER:-PT"+reminder+"M","ACTION:DISPLAY","DESCRIPTION:"+icsEscape(label+" · "+x.title),"END:VALARM"]:[]),"END:VEVENT"].join("\r\n"))}}
  const body=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gmach Berega//Calendar Feed//HE","CALSCALE:GREGORIAN","METHOD:PUBLISH","X-WR-CALNAME:גמ״ח ברגע",...events,"END:VCALENDAR",""].join("\r\n");
  return new Response(body,{headers:{"Content-Type":"text/calendar; charset=utf-8","Cache-Control":"private, max-age=300","Content-Disposition":'inline; filename="gmach-berega.ics"'}});
}
async function vapidJwt(env,endpoint){
  const pub=fromBase64Url(env.VAPID_PUBLIC_KEY||""),priv=fromBase64Url(env.VAPID_PRIVATE_KEY||"");
  if(pub.length!==65||pub[0]!==4||priv.length!==32)throw new Error("Invalid VAPID key material");
  const enc=v=>toBase64Url(new TextEncoder().encode(JSON.stringify(v))),aud=new URL(endpoint).origin;
  const header=enc({typ:"JWT",alg:"ES256"}),payload=enc({aud,exp:Math.floor(Date.now()/1000)+3600,sub:"mailto:"+(env.SUPPORT_EMAIL||DEFAULT_SUPPORT_EMAIL)});
  const key=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:toBase64Url(pub.slice(1,33)),y:toBase64Url(pub.slice(33,65)),d:toBase64Url(priv),ext:true}, {name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,new TextEncoder().encode(header+"."+payload)));
  return header+"."+payload+"."+toBase64Url(sig);
}
async function sendEmptyWebPush(env,subscription){
  const token=await vapidJwt(env,subscription.endpoint),response=await fetch(subscription.endpoint,{method:"POST",headers:{TTL:"120",Urgency:"normal",Authorization:`vapid t=${token}, k=${env.VAPID_PUBLIC_KEY}`},body:null});
  if(response.status===404||response.status===410){await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=?").bind(subscription.id).run();return false}
  if(!response.ok)throw new Error("Push endpoint returned "+response.status);return true;
}
function israelClock(){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
  return String(p.hour||"00")+":"+String(p.minute||"00");
}
function inQuietHours(now,start,end){if(!start||!end||start===end)return false;return start<end?now>=start&&now<end:now>=start||now<end}
async function sendOperationalNotificationEmail(env,user,notification){
  if(!env.RESEND_API_KEY||!user.email)return false;
  const en=user.preferred_language==="en",lang=en?"en":"he",accountUrl="https://gmach-karov1.nh8030954.workers.dev/#/account";
  const template=await env.DB.prepare("SELECT subject,body_text,enabled FROM email_templates WHERE template_key='notification' AND language=?").bind(lang).first().catch(()=>null);
  if(template&&Number(template.enabled)===0)return false;
  const render=s=>String(s||"").replaceAll("{{title}}",notification.title||"").replaceAll("{{body}}",notification.body||"").replaceAll("{{account_url}}",accountUrl);
  const subject=template?.subject?render(template.subject):(en?"Gmach Berega update":notification.title),plain=template?.body_text?render(template.body_text):(en?`You have a new update in Gmach Berega. Open your account for details.\n\n${notification.title}\n${notification.body}`:`${notification.title}\n\n${notification.body}`);
  const unsubToken=Number(user.community_emails_accepted)?await communityUnsubscribeToken(env,user.user_id||user.id):null,unsubUrl=unsubToken?"https://gmach-karov1.nh8030954.workers.dev/api/unsubscribe/community?token="+encodeURIComponent(unsubToken):null,finalPlain=plain+(unsubUrl?(en?"\n\nUnsubscribe from community updates: ":"\n\nהסרה מעדכוני קהילה: ")+unsubUrl:"");
  const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify({from:String(env.RESEND_FROM_EMAIL||DEFAULT_FROM_EMAIL),to:[user.email],subject,text:finalPlain,html:`<div dir="${en?"ltr":"rtl"}" style="font-family:Arial,sans-serif;max-width:560px;margin:auto"><h2>${escapeHtmlEmail(subject)}</h2><p style="white-space:pre-line">${escapeHtmlEmail(plain)}</p><p><a href="${accountUrl}">${en?"Open account":"פתיחת האזור האישי"}</a></p></div>`,reply_to:String(env.SUPPORT_EMAIL||DEFAULT_SUPPORT_EMAIL)})});
  if(!response.ok)throw new Error("Email provider returned "+response.status);return true;
}
async function deliverNotificationChannels(env){
  const nowIso=new Date().toISOString(),clock=israelClock();
  const rows=await env.DB.prepare(`SELECT n.id,n.user_id,n.type,n.title,n.body,n.request_id,n.created_at,u.email,u.preferred_language,u.community_emails_accepted,
    COALESCE(p.email,CASE WHEN n.type IN ('request','status') THEN 1 ELSE 0 END) pref_email,
    COALESCE(p.push,0) pref_push,COALESCE(p.digest,'immediate') digest,p.quiet_start,p.quiet_end
    FROM notifications n JOIN users u ON u.id=n.user_id
    LEFT JOIN notification_preferences p ON p.user_id=n.user_id AND p.notification_type=n.type
    WHERE n.created_at>=datetime(?,'-2 days') AND u.deleted_at IS NULL
      AND NOT EXISTS(SELECT 1 FROM notification_delivery_log l WHERE l.notification_id=n.id AND l.channel='email' AND l.status='sent')
    ORDER BY n.created_at LIMIT 100`).bind(nowIso).all().catch(()=>({results:[]}));
  for(const n of rows.results||[]){
    if(inQuietHours(clock,n.quiet_start,n.quiet_end)||n.digest==="daily")continue;
    if(Number(n.pref_email)){
      try{const sent=await sendOperationalNotificationEmail(env,n,n);await env.DB.prepare("INSERT OR REPLACE INTO notification_delivery_log(notification_id,channel,status,attempted_at,error) VALUES(?, 'email', ?, ?, NULL)").bind(n.id,sent?"sent":"skipped",nowIso).run()}catch(e){await env.DB.prepare("INSERT OR REPLACE INTO notification_delivery_log(notification_id,channel,status,attempted_at,error) VALUES(?, 'email','failed',?,?)").bind(n.id,nowIso,String(e?.message||e).slice(0,500)).run()}
    }
    if(Number(n.pref_push)&&env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY){
      const subs=await env.DB.prepare("SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?").bind(n.user_id).all();
      let sent=false,error=null;for(const sub of subs.results||[]){try{sent=(await sendEmptyWebPush(env,sub))||sent}catch(e){error=String(e?.message||e).slice(0,500)}}
      await env.DB.prepare("INSERT OR REPLACE INTO notification_delivery_log(notification_id,channel,status,attempted_at,error) VALUES(?, 'push', ?, ?, ?)").bind(n.id,sent?"sent":error?"failed":"skipped",nowIso,error).run();
    }
  }
}
async function deliverDailyDigests(env){
  const clock=israelClock();if(clock<"19:00"||clock>"20:00"||!env.RESEND_API_KEY)return;
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const users=await env.DB.prepare(`SELECT DISTINCT u.id,u.email,u.preferred_language FROM users u JOIN notification_preferences p ON p.user_id=u.id WHERE p.digest='daily' AND p.email=1 AND u.deleted_at IS NULL`).all().catch(()=>({results:[]}));
  for(const user of users.results||[]){
    const done=await env.DB.prepare("SELECT id FROM notification_digests WHERE user_id=? AND digest_date=? AND status='sent'").bind(user.id,today).first();if(done)continue;
    const items=await env.DB.prepare(`SELECT n.id,n.title,n.body,n.created_at FROM notifications n WHERE n.user_id=? AND n.created_at>=datetime('now','-1 day') AND NOT EXISTS(SELECT 1 FROM notification_delivery_log l WHERE l.notification_id=n.id AND l.channel='email' AND l.status='sent') ORDER BY n.created_at DESC LIMIT 30`).bind(user.id).all();
    if(!(items.results||[]).length)continue;
    const en=user.preferred_language==="en",lang=en?"en":"he",accountUrl="https://gmach-karov1.nh8030954.workers.dev/#/account",template=await env.DB.prepare("SELECT subject,body_text,enabled FROM email_templates WHERE template_key=\'daily_digest\' AND language=?").bind(lang).first().catch(()=>null);if(template&&Number(template.enabled)===0)continue;
    const digestBody=(en?"Updates from the last day:":"עדכונים מהיממה האחרונה:")+"\n\n"+items.results.map(x=>"• "+x.title+" — "+x.body).join("\n"),subject=template?.subject||(en?"Your daily Gmach Berega summary":"הסיכום היומי שלך מגמ״ח ברגע"),text=template?.body_text?String(template.body_text).replaceAll("{{body}}",digestBody).replaceAll("{{account_url}}",accountUrl):digestBody;
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify({from:String(env.RESEND_FROM_EMAIL||DEFAULT_FROM_EMAIL),to:[user.email],subject,text,reply_to:String(env.SUPPORT_EMAIL||DEFAULT_SUPPORT_EMAIL)})});
    const id=crypto.randomUUID(),now=new Date().toISOString();
    if(response.ok){await env.DB.batch([env.DB.prepare("INSERT OR REPLACE INTO notification_digests(id,user_id,digest_date,payload_json,status,sent_at) VALUES(?,?,?,?, 'sent',?)").bind(id,user.id,today,JSON.stringify({count:items.results.length}),now),...items.results.map(x=>env.DB.prepare("INSERT OR REPLACE INTO notification_delivery_log(notification_id,channel,status,attempted_at,error) VALUES(?, 'email','sent',?,NULL)").bind(x.id,now))]);}
    else await env.DB.prepare("INSERT OR REPLACE INTO notification_digests(id,user_id,digest_date,payload_json,status) VALUES(?,?,?,?, 'failed')").bind(id,user.id,today,JSON.stringify({status:response.status})).run();
  }
}
async function runScheduledMaintenance(env) {
  await ensureProductionHardeningSchema(env);
  const now = new Date().toISOString();
  const deletionReminderUsers=await env.DB.prepare(`SELECT id FROM users WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL AND deletion_requested_at<=datetime(?,'-5 days') AND deletion_requested_at>datetime(?,'-7 days') AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=users.id AND n.title='תזכורת לפני מחיקת החשבון' AND n.created_at>=datetime(?,'-2 days'))`).bind(now,now,now).all();
  for(const row of deletionReminderUsers.results||[]) await notificationStatement(env,row.id,"system","תזכורת לפני מחיקת החשבון","בקשת מחיקת החשבון עדיין פעילה. ניתן לבטל אותה באזור האישי לפני תום שבעת הימים.",null).run();
  const scheduledItems=await env.DB.prepare(`SELECT i.id,i.title,i.description,i.city,i.category,i.condition,o.name organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.status='pending' AND i.publish_at IS NOT NULL AND i.publish_at<=?`).bind(now).all();
  for(const item of scheduledItems.results||[]){await env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE id=? AND status='pending'").bind(now,item.id).run();await notifyMatchingSavedSearches(env,{id:item.id,title:item.title,description:item.description,organizationName:item.organization_name,city:item.city,category:item.category,condition:item.condition})}
  const newlyOverdue=await env.DB.prepare(`SELECT lr.id,lr.borrower_id,i.title,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.status='collected' AND lr.requested_until<? AND lr.workflow_status!='overdue'`).bind(now).all();
  const expiredHolds=await env.DB.prepare(`SELECT h.id,h.request_id,h.item_id,lr.borrower_id,i.title,o.owner_id FROM inventory_holds h JOIN loan_requests lr ON lr.id=h.request_id JOIN items i ON i.id=h.item_id JOIN organizations o ON o.id=i.organization_id WHERE h.status='active' AND h.expires_at<=? AND lr.status='pending'`).bind(now).all();
  const missedPickups=await env.DB.prepare(`SELECT lr.id,lr.item_id,lr.borrower_id,i.title,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.status='approved' AND lr.pickup_expires_at IS NOT NULL AND lr.pickup_expires_at<=? AND lr.workflow_status='approved_ready_for_pickup'`).bind(now).all();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM auth_challenges WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM auth_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')"),
    env.DB.prepare("DELETE FROM abuse_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')"),
    env.DB.prepare("UPDATE waitlist_entries SET status='expired' WHERE status IN ('waiting','notified') AND requested_until < ?").bind(now.slice(0,16)),
    env.DB.prepare("UPDATE waitlist_offers SET declined_at=? WHERE accepted_at IS NULL AND declined_at IS NULL AND expires_at<=?").bind(now,now),
    env.DB.prepare("UPDATE loan_requests SET workflow_status='overdue' WHERE status='collected' AND requested_until<? AND workflow_status!='overdue'").bind(now),
    env.DB.prepare("UPDATE request_messages SET body='הודעה שנמחקה בהתאם למדיניות השמירה',media_url=NULL,deleted_at=? WHERE created_at<datetime(?,'-1 year') AND deleted_at IS NULL").bind(now,now),
    env.DB.prepare("DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-180 days')"),
    env.DB.prepare("DELETE FROM analytics_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-395 days')"),
    env.DB.prepare("INSERT INTO operational_state(key,value,updated_at) VALUES ('last_maintenance_at',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(now,now)
  ]);
  for(const row of newlyOverdue.results||[]) await env.DB.batch([
    notificationStatement(env,row.borrower_id,"status","ההשאלה באיחור",`מועד ההחזרה של ${row.title} עבר. החזירו את הפריט בהקדם או בקשו הארכה מהאזור האישי.`,row.id),
    notificationStatement(env,row.owner_id,"status","השאלה באיחור",`${row.title} עדיין לא סומן כהוחזר. ניתן ליצור קשר עם השואל דרך הבקשה.`,row.id),
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),row.id,null,"overdue",JSON.stringify({detectedAt:now}))
  ]);
  for(const row of expiredHolds.results||[]){await env.DB.batch([
    env.DB.prepare("UPDATE inventory_holds SET status='released' WHERE id=? AND status='active'").bind(row.id),
    env.DB.prepare("UPDATE loan_requests SET status='cancelled',workflow_status='hold_expired',cancelled_at=?,updated_at=? WHERE id=? AND status='pending'").bind(now,now,row.request_id),
    notificationStatement(env,row.borrower_id,"status","שמירת המלאי פגה",`שמירת המלאי עבור ${row.title} פגה משום שהבקשה לא אושרה בזמן.`,row.request_id),
    notificationStatement(env,row.owner_id,"status","שמירת מלאי פגה",`בקשת ההשאלה עבור ${row.title} שוחררה והמלאי זמין שוב.`,row.request_id),
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),row.request_id,null,"hold_expired",JSON.stringify({expiredAt:now}))
  ]);await advanceWaitlist(env,row.item_id)}
  for(const row of missedPickups.results||[]) await env.DB.batch([
    env.DB.prepare("UPDATE loan_requests SET workflow_status='pickup_expired',updated_at=? WHERE id=? AND workflow_status='approved_ready_for_pickup'").bind(now,row.id),
    notificationStatement(env,row.borrower_id,"status","חלון האיסוף הסתיים",`חלון האיסוף של ${row.title} הסתיים. אפשר לבקש תיאום חדש או לבטל את הבקשה.`,row.id),
    notificationStatement(env,row.owner_id,"status","אי הגעה לאיסוף",`חלון האיסוף של ${row.title} הסתיים ללא סימון איסוף.`,row.id),
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),row.id,null,"pickup_expired",JSON.stringify({expiredAt:now}))
  ]);
  await deliverNotificationChannels(env);
  await deliverDailyDigests(env);

}

async function compatibleMemberRole(env) {
  // Early deployments used borrower/gmach_manager while the current schema
  // uses member/admin. Inspect the live table definition so registrations keep
  // working on databases created by either version without weakening roles.
  const schema = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").first();
  const definition = String(schema?.sql || "").toLowerCase();
  if (definition.includes("'member'")) return "member";
  if (definition.includes("'borrower'")) return "borrower";
  return "member";
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw new HttpError(413, "הבקשה גדולה מדי");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new HttpError(415, "נדרש תוכן מסוג JSON");
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new HttpError(413, "הבקשה גדולה מדי");
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "תוכן הבקשה אינו תקין");
  }
}

function assertSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (origin && origin !== url.origin) throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
  if (!origin && !local && fetchSite !== "same-origin") throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
}

function publicUser(user) {
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role, emailVerified: Boolean(user.email_verified), twoFactorEnabled: Boolean(user.totp_enabled), preferredLanguage: user.preferred_language || "he" };
}

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    condition: row.condition,
    quantity: row.quantity,
    available_count: row.available_count === null || row.available_count === undefined ? row.quantity : Number(row.available_count),
    loan_conditions: row.loan_conditions,
    item_type: row.item_type || "loan",
    subcategory: row.subcategory || null,
    tags: parseJsonArray(row.tags_json),
    pickup_method: row.pickup_method || "pickup",
    inventory_updated_at: row.inventory_updated_at || row.updated_at,
    city: row.city,
    neighborhood: row.neighborhood,
    image_urls: parseJsonArray(row.image_urls),
    availability_status: row.availability_status,
    minLoanMinutes: Number(row.min_loan_minutes || 60),
    maxLoanMinutes: Number(row.max_loan_minutes || 10080),
    bookingNoticeMinutes: Number(row.booking_notice_minutes || 0),
    turnaroundMinutes: Number(row.turnaround_minutes || 0),
    bookingHorizonDays: Number(row.booking_horizon_days || 365),
    bookingHorizonMinutes: Number(row.booking_horizon_minutes || Number(row.booking_horizon_days||365)*1440),
    approvalMode: row.approval_mode || "manual",
    depositRequired: Boolean(row.deposit_required),
    depositAmountAgorot: Number(row.deposit_amount_agorot || 0),
    maxPerUser: row.max_per_user == null ? null : Number(row.max_per_user),
    preparationMinutes: Number(row.preparation_minutes || 0),
    maxLoanDays: row.max_loan_days == null ? null : Number(row.max_loan_days),
    serviceRadiusKm: row.service_radius_km == null ? null : Number(row.service_radius_km),
    recurringAllowed: Boolean(row.recurring_allowed),
    waitlistResponseMinutes: row.waitlist_response_minutes == null ? null : Number(row.waitlist_response_minutes),
    icon: row.icon,
    cover_color: row.cover_color,
    created_at: row.created_at,
    rating: row.item_rating ? Number(row.item_rating) : null,
    reviewCount: Number(row.item_review_count || 0),
    organizations: { id: row.org_id, name: row.org_name, rating: row.org_rating ? Number(row.org_rating) : null, reviewCount: Number(row.org_review_count || 0), lastActiveAt: row.org_last_active_at || null }
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

function cleanText(value, min, max, label) {
  const text = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ");
  if (text.length < min || text.length > max) throw new HttpError(400, `${label} חייב להכיל ${min}–${max} תווים`);
  return text;
}

function cleanOptional(value, max) {
  const text = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ");
  if (!text) return null;
  if (text.length > max) throw new HttpError(400, `הטקסט יכול להכיל עד ${max} תווים`);
  return text;
}

function validateDateTime(value, label) {
  const text = String(value || "").trim();
  const date = new Date(text);
  if (!text || Number.isNaN(date.getTime())) throw new HttpError(400, `${label} אינו תקין`);
  return date.toISOString();
}

function normalizeEmail(value) {
  const email = normalizeEmailLoose(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "כתובת האימייל אינה תקינה");
  return email;
}

function normalizeEmailLoose(value) {
  return String(value || "").trim().toLowerCase();
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) throw new HttpError(400, "הסיסמה חייבת להכיל 10–128 תווים");
  return password;
}

function assertEmailDeliveryConfigured(env) {
  if (!env.RESEND_API_KEY) throw new HttpError(503, "שירות אימות המייל עדיין אינו מוגדר");
}

function verificationCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

async function sendVerificationEmail(env, email, fullName, code, language="he") {
  assertEmailDeliveryConfigured(env);
  const deliver = env.RESEND_SERVICE?.fetch ? env.RESEND_SERVICE.fetch.bind(env.RESEND_SERVICE) : fetch;
  const response = await deliver("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: String(env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL),
      to: [email],
      subject: language==="en"?"Your Gmach Berega verification code":"קוד האימות שלך לגמ״ח ברגע",
      text: language==="en"?`Hello ${fullName}, your verification code is ${code}. It expires in 10 minutes. If you did not sign up, you can ignore this email.`:`שלום ${fullName}, קוד האימות שלך הוא ${code}. הקוד תקף ל-10 דקות. אם לא ביקשת להירשם, אפשר להתעלם מהמייל.`,
      html: language==="en"?`<div dir="ltr" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">Gmach Berega</h1><p>Hello ${escapeHtmlEmail(fullName)},</p><p>Your verification code:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75">${code}</p><p>The code expires in 10 minutes. If you did not sign up, you can ignore this email.</p></div>`:`<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">גמ״ח ברגע</h1><p>שלום ${escapeHtmlEmail(fullName)},</p><p>קוד האימות שלך:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75" dir="ltr">${code}</p><p>הקוד תקף ל־10 דקות. אם לא ביקשת להירשם, אפשר להתעלם מהמייל.</p></div>`,
      reply_to: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

async function sendPasswordResetEmail(env, email, fullName, code, language="he") {
  assertEmailDeliveryConfigured(env);
  const deliver = env.RESEND_SERVICE?.fetch ? env.RESEND_SERVICE.fetch.bind(env.RESEND_SERVICE) : fetch;
  const response = await deliver("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: String(env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL), to: [email], subject: language==="en"?"Reset your Gmach Berega password":"איפוס סיסמה בגמ״ח ברגע",
      text: language==="en"?`Hello ${fullName}, your password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore this email.`:`שלום ${fullName}, קוד איפוס הסיסמה שלך הוא ${code}. הקוד תקף ל-10 דקות. אם לא ביקשת זאת, אפשר להתעלם מהמייל.`,
      html: language==="en"?`<div dir="ltr" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">Gmach Berega</h1><p>Hello ${escapeHtmlEmail(fullName)},</p><p>Your password reset code:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75">${code}</p><p>The code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`:`<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">גמ״ח ברגע</h1><p>שלום ${escapeHtmlEmail(fullName)},</p><p>קוד איפוס הסיסמה שלך:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75" dir="ltr">${code}</p><p>הקוד תקף ל־10 דקות. אם לא ביקשת זאת, אפשר להתעלם מהמייל.</p></div>`,
      reply_to: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);}
function escapeHtmlEmail(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function validatePhone(value) {
  const phone = String(value || "").trim();
  if (!/^0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/.test(phone)) throw new HttpError(400, "מספר הטלפון אינו תקין");
  return phone;
}

function validateDate(value, label) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HttpError(400, `${label} אינו תקין`);
  return date;
}

function validateColor(value) {
  const color = String(value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, "צבע חייב להיות בפורמט HEX תקין");
  return color.toLowerCase();
}

function validateOptionalHttpsUrl(value) {
  const text = cleanOptional(value, 500); if (!text) return null;
  try { const parsed = new URL(text); if (parsed.protocol !== "https:") throw new Error(); return parsed.toString(); }
  catch { throw new HttpError(400, "כתובת האתר חייבת להתחיל ב־https://"); }
}

function sanitizeHours(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const result = {}; for (const [day, hours] of Object.entries(value).slice(0, 7)) {
    if (/^[א-ת\s'-]{2,20}$/.test(day) && typeof hours === "string" && hours.length <= 60) result[day] = hours.trim();
  } return JSON.stringify(result);
}
function requiredHours(value){
  const hours=sanitizeHours(value),parsed=JSON.parse(hours);
  if(!Object.values(parsed).some(entry=>String(entry||"").trim().length>=3))throw new HttpError(400,"יש להזין שעות פעילות");
  return hours;
}

function sanitizePickupOptions(value) {
  const allowed = new Set(["pickup","delivery","coordination"]);
  const values = Array.isArray(value) ? value.filter(item => allowed.has(item)) : ["pickup"];
  return JSON.stringify([...new Set(values)].slice(0,3).length ? [...new Set(values)].slice(0,3) : ["pickup"]);
}

function sanitizeItemType(value) { return ["loan","donation"].includes(value) ? value : "loan"; }
function sanitizePickupMethod(value) { return "coordination"; }
function sanitizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map(item => String(item).trim()).filter(item => item.length >= 2 && item.length <= 30))].slice(0,10);
}

function validateFont(value) {
  const allowed = ["Arial, sans-serif", "Alef, Arial, sans-serif", "Arimo, Arial, sans-serif", "Assistant, Arial, sans-serif", "Heebo, Arial, sans-serif", "IBM Plex Sans Hebrew, Arial, sans-serif", "Miriam Libre, Arial, sans-serif", "Noto Sans Hebrew, Arial, sans-serif", "Rubik, Arial, sans-serif", "Secular One, Arial, sans-serif", "Varela Round, Arial, sans-serif", "David Libre, serif", "Frank Ruhl Libre, serif", "Noto Serif Hebrew, serif", "Suez One, serif"];
  const font = String(value || "").trim();
  if (!allowed.includes(font)) throw new HttpError(400, "הגופן שנבחר אינו נתמך");
  return font;
}

function validateAssetUrl(value) {
  const url = String(value || "").trim();
  if (!/^\/[a-z0-9_./-]+$/i.test(url) || url.includes("..")) throw new HttpError(400, "כתובת הלוגו אינה תקינה");
  return url;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations }, key, 256);
  return toBase64Url(new Uint8Array(bits));
}

async function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = Math.floor(Date.now() / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    const bytes = new Uint8Array(8);
    let value = counter + drift;
    for (let index = 7; index >= 0; index -= 1) { bytes[index] = value & 0xff; value = Math.floor(value / 256); }
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    if (String(binary % 1_000_000).padStart(6, "0") === code) return true;
  }
  return false;
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let output = "", buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(buffer >>> bits) & 31]; }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of String(value || "").toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid base32 value");
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 0xff); }
  }
  return Uint8Array.from(bytes);
}

async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

async function encryptPrivateValue(value, env) {
  const secret=String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"");
  if(secret.length<24) throw new HttpError(503,"מפתח הצפנת הנתונים הפרטיים אינו מוגדר");
  const keyBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value)));
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(encrypted)}`;
}

async function decryptPrivateValue(cipher,env) {
  if(!cipher)return null;
  const [version,ivText,dataText]=String(cipher).split(".");
  if(version!=="v1"||!ivText||!dataText)throw new HttpError(503,"לא ניתן לקרוא את הכתובת השמורה");
  const secret=String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"");
  if(secret.length<24)throw new HttpError(503,"מפתח הצפנת הנתונים הפרטיים אינו מוגדר");
  const decode=value=>Uint8Array.from(atob(value.replaceAll("-","+").replaceAll("_","/").padEnd(Math.ceil(value.length/4)*4,"=")),c=>c.charCodeAt(0));
  const keyBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
  try{return new TextDecoder().decode(await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(ivText)},key,decode(dataText)))}catch{throw new HttpError(503,"לא ניתן לקרוא את הכתובת השמורה")}
}

function bytesToBase64Url(bytes){let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");}

function randomToken(length) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of String(value || "").replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base64url value");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function constantTimeEqual(a, b) {
  const left = fromBase64Url(a);
  const right = fromBase64Url(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] || 0) ^ (right[index] || 0);
  return mismatch === 0;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(token, url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie(url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self), payment=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com https://www.openstreetmap.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
