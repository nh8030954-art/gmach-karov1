PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_iterations INTEGER NOT NULL DEFAULT 210000,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  primary_category TEXT NOT NULL,
  city TEXT NOT NULL,
  neighborhood TEXT,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE organization_contacts (
  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  contact_phone TEXT NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  condition TEXT NOT NULL CHECK (condition IN ('כמו חדש', 'מצוין', 'טוב')),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  loan_conditions TEXT,
  city TEXT NOT NULL,
  neighborhood TEXT,
  image_urls TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'archived')),
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'unavailable', 'reserved')),
  is_free INTEGER NOT NULL DEFAULT 1 CHECK (is_free = 1),
  icon TEXT NOT NULL DEFAULT 'box',
  cover_color TEXT NOT NULL DEFAULT '#e6f2ef',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE loan_requests (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  borrower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_from TEXT NOT NULL,
  requested_until TEXT NOT NULL,
  phone TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'cancelled', 'collected', 'returned')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (requested_until >= requested_from)
);

CREATE TABLE favorites (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identity_hash TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('login', 'register')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE INDEX organizations_owner_idx ON organizations(owner_id, created_at DESC);
CREATE INDEX organizations_status_idx ON organizations(status, created_at DESC);
CREATE INDEX items_catalog_idx ON items(status, availability_status, created_at DESC);
CREATE INDEX items_org_idx ON items(organization_id, created_at DESC);
CREATE INDEX requests_borrower_idx ON loan_requests(borrower_id, created_at DESC);
CREATE INDEX requests_item_idx ON loan_requests(item_id, created_at DESC);
CREATE INDEX auth_events_lookup_idx ON auth_events(identity_hash, action, created_at DESC);

INSERT INTO organizations (id, name, primary_category, city, neighborhood, description, status, verified, created_at) VALUES
  ('seed-org-01', 'גמ״ח שמחות רמת שלמה', 'אירועים', 'ירושלים', 'רמת שלמה', 'ציוד ועיצוב לאירועים משפחתיים.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-02', 'גמ״ח כלי עבודה כהן', 'כלי עבודה', 'בני ברק', 'פרדס כץ', 'כלי עבודה שימושיים לתיקונים בבית.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-03', 'גמ״ח יד לאם', 'תינוקות', 'בית שמש', 'רמה ד׳', 'ציוד תינוקות נקי ובטיחותי למשפחות.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-04', 'גמ״ח רפואה וסיוע', 'רפואה', 'פתח תקווה', 'הדר גנים', 'ציוד רפואי ושיקומי להשאלה.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-05', 'גמ״ח מטיילים ביחד', 'טיולים', 'מודיעין עילית', 'ברכפלד', 'ציוד לטיולים ולקמפינג משפחתי.', 'approved', 0, '2026-09-01T10:00:00Z'),
  ('seed-org-06', 'גמ״ח אירוח מכל הלב', 'בית ואירוח', 'אשדוד', 'רובע ז׳', 'ציוד לאירוח, שבתות ושמחות.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-07', 'גמ״ח ציוד לאירועים', 'אירועים', 'ירושלים', 'נווה יעקב', 'הגברה וציוד לאירועים קטנים.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-08', 'גמ״ח בדרך טובה', 'טיולים', 'בני ברק', 'מרכז העיר', 'מזוודות וציוד שימושי לנסיעות.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-09', 'גמ״ח מתקנים בבית', 'כלי עבודה', 'בית שמש', 'הקריה החרדית', 'ציוד לתחזוקה ותיקונים ביתיים.', 'approved', 0, '2026-09-01T10:00:00Z'),
  ('seed-org-10', 'גמ״ח תופרות חסד', 'בית ואירוח', 'פתח תקווה', 'עמישב', 'מכונות תפירה וציוד יצירה.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-11', 'גמ״ח מציגים', 'אירועים', 'מודיעין עילית', 'קריית ספר', 'מקרנים ומסכים לשיעורים ושמחות.', 'approved', 1, '2026-09-01T10:00:00Z'),
  ('seed-org-12', 'גמ״ח עושים יחד', 'כלי עבודה', 'אשדוד', 'רובע ג׳', 'ערכות וכלים לפרויקטים קטנים.', 'approved', 1, '2026-09-01T10:00:00Z');

INSERT INTO items (id, organization_id, title, category, description, condition, quantity, city, neighborhood, status, availability_status, icon, cover_color, created_at) VALUES
  ('seed-item-01', 'seed-org-01', 'סט קשתות פרחים לאירוע', 'אירועים', 'שלוש קשתות בגבהים שונים, פרחים לבנים וורודים ובסיסים יציבים. מתאים לחופה, ברית או בת מצווה.', 'מצוין', 1, 'ירושלים', 'רמת שלמה', 'active', 'available', 'decor', '#f7e7ee', '2026-09-17T10:00:00Z'),
  ('seed-item-02', 'seed-org-02', 'מקדחה נטענת + סט ביטים', 'כלי עבודה', 'מקדחה 18V עם שתי סוללות, מטען וערכת ביטים. להשאלה עד שלושה ימים.', 'כמו חדש', 2, 'בני ברק', 'פרדס כץ', 'active', 'available', 'drill', '#e6eef7', '2026-09-18T08:30:00Z'),
  ('seed-item-03', 'seed-org-03', 'עריסה מתקפלת לתינוק', 'תינוקות', 'עריסה קלה לנסיעות עם מזרן וכיסוי נקי. מתקפלת לתיק נשיאה קומפקטי.', 'מצוין', 1, 'בית שמש', 'רמה ד׳', 'active', 'available', 'baby', '#f4e8ee', '2026-09-15T12:00:00Z'),
  ('seed-item-04', 'seed-org-04', 'כיסא גלגלים מתקפל', 'רפואה', 'כיסא גלגלים תקני, קל לקיפול ונכנס לרכב משפחתי. כולל משענות רגליים נשלפות.', 'טוב', 1, 'פתח תקווה', 'הדר גנים', 'active', 'available', 'medical', '#e2eff5', '2026-09-13T09:00:00Z'),
  ('seed-item-05', 'seed-org-05', 'אוהל משפחתי ל־6 אנשים', 'טיולים', 'אוהל עמיד ונוח להקמה, כולל יריעה תחתונה ויתדות. מתאים לקמפינג משפחתי.', 'מצוין', 1, 'מודיעין עילית', 'ברכפלד', 'active', 'available', 'tent', '#e7efdc', '2026-09-12T14:20:00Z'),
  ('seed-item-06', 'seed-org-06', 'שולחנות מתקפלים לאירוח', 'בית ואירוח', 'שישה שולחנות מתקפלים באורך 1.80 מ׳. ניתן לקחת גם חלק מהכמות.', 'טוב', 6, 'אשדוד', 'רובע ז׳', 'active', 'available', 'table', '#eee9df', '2026-09-11T17:45:00Z'),
  ('seed-item-07', 'seed-org-07', 'רמקול מוגבר עם מיקרופון', 'אירועים', 'רמקול נייד לאירוע קטן, כולל מיקרופון אלחוטי, חצובה וכבל טעינה.', 'מצוין', 1, 'ירושלים', 'נווה יעקב', 'active', 'reserved', 'speaker', '#e8e8f3', '2026-09-10T08:00:00Z'),
  ('seed-item-08', 'seed-org-08', 'מזוודות גדולות לנסיעה', 'טיולים', 'זוג מזוודות קשיחות עם ארבעה גלגלים. ניתן להשאיל בנפרד או יחד.', 'טוב', 2, 'בני ברק', 'מרכז העיר', 'active', 'available', 'luggage', '#e8edf4', '2026-09-09T12:00:00Z'),
  ('seed-item-09', 'seed-org-09', 'סולם אלומיניום 7 שלבים', 'כלי עבודה', 'סולם ביתי יציב וקל. מתאים לצביעה, תלייה ותיקונים בבית.', 'טוב', 1, 'בית שמש', 'הקריה החרדית', 'active', 'available', 'ladder', '#e9edf0', '2026-09-08T09:10:00Z'),
  ('seed-item-10', 'seed-org-10', 'מכונת תפירה ביתית', 'בית ואירוח', 'מכונה נוחה לשימוש עם דוושה, חוטים בסיסיים וחוברת הדרכה בעברית.', 'מצוין', 1, 'פתח תקווה', 'עמישב', 'active', 'available', 'sewing', '#f4e7e3', '2026-09-07T15:00:00Z'),
  ('seed-item-11', 'seed-org-11', 'מקרן ומסך מתקפל', 'אירועים', 'מקרן Full HD ומסך 100 אינץ׳. מתאים למצגות, ערבי משפחה ושיעורים.', 'כמו חדש', 1, 'מודיעין עילית', 'קריית ספר', 'active', 'available', 'projector', '#e3edf1', '2026-09-06T11:30:00Z'),
  ('seed-item-12', 'seed-org-12', 'ארגז כלי עבודה מלא', 'כלי עבודה', 'פטיש, פליירים, מפתחות, מברגים, מטר וציוד בסיסי לתיקונים קטנים.', 'טוב', 1, 'אשדוד', 'רובע ג׳', 'active', 'available', 'tools', '#f3eadb', '2026-09-05T10:10:00Z');
