PRAGMA foreign_keys = ON;

ALTER TABLE users ADD COLUMN preferred_navigation TEXT NOT NULL DEFAULT 'google'
  CHECK (preferred_navigation IN ('google','waze','apple'));

CREATE TABLE IF NOT EXISTS legal_consents (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('terms','privacy')),
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'registration',
  PRIMARY KEY (user_id, document_type, version)
);

CREATE TABLE IF NOT EXISTS recently_viewed_organizations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS recent_organizations_user_time_idx
  ON recently_viewed_organizations(user_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS legal_consents_user_time_idx
  ON legal_consents(user_id, accepted_at DESC);
