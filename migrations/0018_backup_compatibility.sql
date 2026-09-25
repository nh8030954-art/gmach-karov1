PRAGMA foreign_keys = ON;

-- Backward-compatible expansion of the original backup_runs table.
ALTER TABLE backup_runs ADD COLUMN backup_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE backup_runs ADD COLUMN started_at TEXT;
ALTER TABLE backup_runs ADD COLUMN finished_at TEXT;
ALTER TABLE backup_runs ADD COLUMN manifest_json TEXT NOT NULL DEFAULT '{}';

UPDATE backup_runs
SET started_at=COALESCE(started_at,created_at),
    finished_at=COALESCE(finished_at,completed_at),
    backup_type=COALESCE(NULLIF(backup_type,''),'manual');

CREATE INDEX IF NOT EXISTS backup_runs_type_created_idx ON backup_runs(backup_type,created_at DESC);
