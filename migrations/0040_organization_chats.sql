CREATE TABLE IF NOT EXISTS organization_chat_requests (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 borrower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','cancelled')),
 note TEXT NOT NULL, distance_exception INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS organization_chat_active_pair ON organization_chat_requests(organization_id,borrower_id) WHERE status IN ('pending','approved');
CREATE TABLE IF NOT EXISTS organization_chat_messages (
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES organization_chat_requests(id) ON DELETE CASCADE,
 sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
 message_type TEXT NOT NULL DEFAULT 'text', media_url TEXT, metadata_json TEXT NOT NULL DEFAULT '{}',
 deleted_at TEXT, read_at TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS organization_chat_messages_request ON organization_chat_messages(request_id,created_at);
CREATE TABLE IF NOT EXISTS organization_chat_reports (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES organization_chat_messages(id) ON DELETE CASCADE,
 reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(message_id,reporter_id)
);

-- Publish legacy gmachs that were waiting for their first item.
UPDATE organizations SET is_hidden=0 WHERE status='approved' AND deleted_at IS NULL AND is_hidden=1 AND NOT EXISTS(SELECT 1 FROM items WHERE organization_id=organizations.id);
