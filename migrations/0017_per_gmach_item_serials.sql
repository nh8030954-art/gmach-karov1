-- Per-gmach item serial identity and canonical active unit serials.
CREATE TABLE IF NOT EXISTS item_serial_codes_v2 (
  item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS item_serial_codes_v2_org_idx
  ON item_serial_codes_v2(organization_id, code);

INSERT OR IGNORE INTO organization_serial_codes(organization_id)
SELECT id FROM organizations;

INSERT OR IGNORE INTO item_serial_codes_v2(item_id, organization_id, code)
SELECT id, organization_id,
       ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at, id)
FROM items;

-- Move active unit serials to guaranteed-unique temporary values first so
-- canonical renumbering cannot collide while two items exchange/gap-fill codes.
UPDATE item_units
SET serial_number='TMP-' || id
WHERE status!='retired';

WITH canonical AS (
  SELECT
    u.id,
    'GB-' || osc.code || '-' || isc.code || '-' ||
    ROW_NUMBER() OVER (PARTITION BY u.item_id ORDER BY u.created_at, u.id) AS serial_number
  FROM item_units u
  JOIN items i ON i.id=u.item_id
  JOIN organization_serial_codes osc ON osc.organization_id=i.organization_id
  JOIN item_serial_codes_v2 isc ON isc.item_id=i.id
  WHERE u.status!='retired'
)
UPDATE item_units
SET serial_number=(SELECT c.serial_number FROM canonical c WHERE c.id=item_units.id)
WHERE id IN (SELECT id FROM canonical);
