CREATE TABLE IF NOT EXISTS site_view_events(id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES site_visits(session_id) ON DELETE CASCADE,visitor_id TEXT NOT NULL,path TEXT NOT NULL,city TEXT NOT NULL DEFAULT '',country TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 1);
CREATE INDEX IF NOT EXISTS site_view_events_time_idx ON site_view_events(created_at);
CREATE TABLE IF NOT EXISTS site_registration_attribution(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,visitor_id TEXT NOT NULL,created_at TEXT NOT NULL);
-- Preserve pre-upgrade totals; their original per-view timestamps were not recorded.
INSERT OR IGNORE INTO site_view_events(id,session_id,visitor_id,path,created_at,views) SELECT 'legacy:'||p.session_id||':'||p.path,p.session_id,v.visitor_id,p.path,v.started_at,p.views FROM site_visit_pages p JOIN site_visits v USING(session_id) WHERE NOT EXISTS(SELECT 1 FROM site_view_events e WHERE e.session_id=v.session_id);
