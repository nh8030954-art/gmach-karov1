CREATE TABLE IF NOT EXISTS admin_notification_links (
  notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gmach_research_runs (
  id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  candidate_count INTEGER NOT NULL,
  checked_count INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS gmach_research_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES gmach_research_runs(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL CHECK(verdict IN ('clear','inconclusive','suspected')),
  summary TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  identity_match TEXT NOT NULL,
  reviewed_at TEXT,
  checked_at TEXT NOT NULL,
  UNIQUE(run_id,organization_id)
);
CREATE INDEX IF NOT EXISTS gmach_research_org_date ON gmach_research_results(organization_id,checked_at DESC);
