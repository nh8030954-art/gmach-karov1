CREATE TABLE IF NOT EXISTS site_visits(session_id TEXT PRIMARY KEY,visitor_id TEXT NOT NULL,registered INTEGER NOT NULL DEFAULT 0,source TEXT NOT NULL,started_at TEXT NOT NULL,last_seen TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS site_visits_started_idx ON site_visits(started_at);
CREATE TABLE IF NOT EXISTS site_visit_pages(session_id TEXT NOT NULL REFERENCES site_visits(session_id) ON DELETE CASCADE,path TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(session_id,path));
