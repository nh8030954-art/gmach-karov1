ALTER TABLE users ADD COLUMN calendar_feed_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_calendar_feed_token_idx ON users(calendar_feed_token) WHERE calendar_feed_token IS NOT NULL;
