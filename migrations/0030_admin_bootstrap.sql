-- Create the requested site administration account if the address is not already registered.
-- The password is randomly generated and delivered privately to the account owner.
-- Existing accounts keep their password and are promoted without overwriting credentials.
INSERT OR IGNORE INTO users(id,email,password_hash,password_salt,password_iterations,full_name,role,email_verified,account_status,preferred_language)
VALUES ('2d58740c-97bc-4f59-ab6a-61417783818b','netanelhirsh@gmail.com','rXT3KAgSLheHg7tbbeE-mLYo2OAQ8Kq7t0pgNr2xhh8','-6gEfbHQRhjJxD18o1dLeQ',100000,'נתנאל הירש','admin',1,'active','he');
UPDATE users SET role='admin',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email='netanelhirsh@gmail.com' COLLATE NOCASE;
