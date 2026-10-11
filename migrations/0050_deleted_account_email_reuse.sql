-- Release email addresses reserved by accounts that were already deleted.
-- Keep user IDs and linked history intact; live accounts are not changed.
UPDATE users
SET email='deleted-'||id||'@invalid.local',
    account_status='suspended',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE deleted_at IS NOT NULL
  AND email<>'deleted-'||id||'@invalid.local'
  AND lower(email)<>'netanelhirsh@gmail.com';

DELETE FROM sessions
WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL AND lower(email)<>'netanelhirsh@gmail.com');

DELETE FROM auth_challenges
WHERE user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL AND lower(email)<>'netanelhirsh@gmail.com');
