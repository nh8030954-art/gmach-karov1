-- Create the requested site administration account if the address is not already registered.
-- The password is randomly generated and delivered privately to the account owner.
-- Existing accounts receive the requested new password once. Later runs must
-- never reset a password the owner changed after the first sign-in.
CREATE TABLE IF NOT EXISTS admin_bootstrap_applied (
  bootstrap_key TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO users(id,email,password_hash,password_salt,password_iterations,full_name,role,email_verified,account_status,preferred_language)
VALUES ('2d58740c-97bc-4f59-ab6a-61417783818b','netanelhirsh@gmail.com','_RVOm5Ys0JmHVqmSoD6H9VGuL3aGDYBl3hLgMLoFWOU','Ml42yeO5zWdS-wUETBSV4g',100000,'נתנאל הירש','admin',1,'active','he');
UPDATE users SET role='admin',email_verified=1,account_status='active',
  password_hash='_RVOm5Ys0JmHVqmSoD6H9VGuL3aGDYBl3hLgMLoFWOU',password_salt='Ml42yeO5zWdS-wUETBSV4g',password_iterations=100000,
  updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE email='netanelhirsh@gmail.com' COLLATE NOCASE
  AND NOT EXISTS (SELECT 1 FROM admin_bootstrap_applied WHERE bootstrap_key='netanel-admin-20260928');
INSERT OR IGNORE INTO admin_bootstrap_applied(bootstrap_key) VALUES ('netanel-admin-20260928');

-- One-time account recovery requested by the site owner on 2026-10-01.
-- The plaintext temporary password is never stored in the repository.
UPDATE users
SET role='admin',
    email_verified=1,
    account_status='active',
    password_hash='_RVOm5Ys0JmHVqmSoD6H9VGuL3aGDYBl3hLgMLoFWOU',
    password_salt='Ml42yeO5zWdS-wUETBSV4g',
    password_iterations=100000,
    totp_enabled=0,
    totp_secret=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE email='netanelhirsh@gmail.com' COLLATE NOCASE
  AND NOT EXISTS (
    SELECT 1 FROM admin_bootstrap_applied
    WHERE bootstrap_key='netanel-admin-recovery-20261001-1849'
  );

DELETE FROM sessions
WHERE user_id IN (
  SELECT id FROM users WHERE email='netanelhirsh@gmail.com' COLLATE NOCASE
)
AND NOT EXISTS (
  SELECT 1 FROM admin_bootstrap_applied
  WHERE bootstrap_key='netanel-admin-recovery-20261001-1849'
);

INSERT OR IGNORE INTO admin_bootstrap_applied(bootstrap_key)
VALUES ('netanel-admin-recovery-20261001-1849');
