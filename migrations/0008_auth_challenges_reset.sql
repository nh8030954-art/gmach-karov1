PRAGMA foreign_keys = OFF;
CREATE TABLE auth_challenges_next (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('login_2fa', 'email_verify', 'password_reset')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO auth_challenges_next (token_hash,user_id,purpose,expires_at,created_at)
SELECT token_hash,user_id,purpose,expires_at,created_at FROM auth_challenges;
DROP TABLE auth_challenges;
ALTER TABLE auth_challenges_next RENAME TO auth_challenges;
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges(expires_at);
UPDATE site_settings SET logo_url='/gmach-berega-logo.jpg', tagline='גדולה גמילות חסדים יותר מן הצדקה' WHERE id=1;
PRAGMA foreign_keys = ON;
