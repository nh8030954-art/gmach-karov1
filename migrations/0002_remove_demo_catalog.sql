PRAGMA foreign_keys = ON;

-- Remove only the illustrative records that shipped with the first deployment.
-- Real organizations, items, users and requests are preserved.
DELETE FROM items WHERE id GLOB 'seed-item-*';
DELETE FROM organizations WHERE id GLOB 'seed-org-*';

-- Existing installations that already have users but no administrator keep a
-- recoverable owner account. Fresh installations bootstrap this in the API.
UPDATE users
SET role = 'admin', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin');
