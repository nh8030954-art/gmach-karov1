CREATE TABLE IF NOT EXISTS account_registration_intents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intent TEXT NOT NULL CHECK (intent IN ('user', 'owner'))
);
