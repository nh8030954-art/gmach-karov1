PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0, 1));
ALTER TABLE users ADD COLUMN account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended'));
ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0 CHECK (totp_enabled IN (0, 1));
ALTER TABLE users ADD COLUMN last_login_at TEXT;

CREATE TABLE site_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  site_name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  hero_title TEXT NOT NULL,
  hero_description TEXT NOT NULL,
  primary_color TEXT NOT NULL,
  secondary_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  font_family TEXT NOT NULL,
  base_font_size INTEGER NOT NULL CHECK (base_font_size BETWEEN 14 AND 22),
  logo_url TEXT NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE site_setting_versions (
  id TEXT PRIMARY KEY,
  settings_json TEXT NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE auth_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login_2fa', 'email_verify')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO site_settings (id,site_name,tagline,hero_title,hero_description,primary_color,secondary_color,accent_color,font_family,base_font_size,logo_url)
VALUES (1,'גמ״ח ברגע','גדולה גמילות חסדים יותר מן הצדקה','מה צריך להשאיל היום?','מוצאים ציוד זמין מגמ״חים ואנשים טובים באזור שלכם — בלי תשלום ובלי להסתבך.','#243f75','#9d7137','#e7bd78','Arial, sans-serif',16,'/gmach-berega-logo.jpg');

INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role,email_verified)
VALUES ('admin-netanel-hirsh','netanelhirsh@gmail.com','5cSI6TEtFyH-uPzoGKFhS2ioqI9z-0NlihqSNTPgT5U','xcEC4K-hYRHx8qGkzLxv1g',100000,'נתנאל הירש','admin',1)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  password_salt = excluded.password_salt,
  password_iterations = excluded.password_iterations,
  role = 'admin',
  email_verified = 1,
  account_status = 'active',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

CREATE INDEX site_versions_created_idx ON site_setting_versions(created_at DESC);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges(expires_at);
