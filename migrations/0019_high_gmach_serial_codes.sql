-- Rebase all gmach human serial identifiers to a high, sequential range starting at 100001.
CREATE TABLE IF NOT EXISTS organization_serial_codes (
  code INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

DROP TABLE IF EXISTS _gmach_code_rebase;
CREATE TABLE _gmach_code_rebase (
  organization_id TEXT PRIMARY KEY,
  old_code INTEGER NOT NULL,
  new_code INTEGER NOT NULL UNIQUE
);

INSERT INTO _gmach_code_rebase(organization_id,old_code,new_code)
SELECT organization_id,code,100000 + ROW_NUMBER() OVER (ORDER BY code,created_at,organization_id)
FROM organization_serial_codes;

DROP TABLE IF EXISTS _unit_serial_rebase;
CREATE TABLE _unit_serial_rebase (
  unit_id TEXT PRIMARY KEY,
  old_serial TEXT NOT NULL,
  new_serial TEXT NOT NULL UNIQUE
);

INSERT INTO _unit_serial_rebase(unit_id,old_serial,new_serial)
SELECT u.id,u.serial_number,
       CASE
         WHEN u.serial_number LIKE 'GB-' || m.old_code || '-%'
           THEN 'GB-' || m.new_code || '-' || substr(u.serial_number,length('GB-' || m.old_code || '-')+1)
         ELSE u.serial_number
       END
FROM item_units u
JOIN items i ON i.id=u.item_id
JOIN _gmach_code_rebase m ON m.organization_id=i.organization_id;

DROP TABLE IF EXISTS _retired_serial_rebase;
CREATE TABLE _retired_serial_rebase (
  old_serial TEXT PRIMARY KEY,
  new_serial TEXT NOT NULL UNIQUE
);

INSERT OR IGNORE INTO _retired_serial_rebase(old_serial,new_serial)
SELECT r.serial_number,
       CASE
         WHEN r.item_unit_id IS NOT NULL AND usr.new_serial IS NOT NULL THEN usr.new_serial
         ELSE 'GB-' || m.new_code || '-' || substr(r.serial_number,length('GB-' || m.old_code || '-')+1)
       END
FROM retired_serials r
LEFT JOIN _unit_serial_rebase usr ON usr.unit_id=r.item_unit_id
JOIN _gmach_code_rebase m
  ON r.serial_number LIKE 'GB-' || m.old_code || '-%';

UPDATE item_units
SET serial_number='TMP-HIGH-' || id
WHERE id IN (SELECT unit_id FROM _unit_serial_rebase);

UPDATE retired_serials
SET serial_number='TMP-RET-' || serial_number
WHERE serial_number IN (SELECT old_serial FROM _retired_serial_rebase);

UPDATE organization_serial_codes
SET code=-code
WHERE organization_id IN (SELECT organization_id FROM _gmach_code_rebase);

UPDATE organization_serial_codes
SET code=(SELECT m.new_code FROM _gmach_code_rebase m WHERE m.organization_id=organization_serial_codes.organization_id)
WHERE organization_id IN (SELECT organization_id FROM _gmach_code_rebase);

UPDATE item_units
SET serial_number=(SELECT m.new_serial FROM _unit_serial_rebase m WHERE m.unit_id=item_units.id)
WHERE id IN (SELECT unit_id FROM _unit_serial_rebase);

UPDATE retired_serials
SET serial_number=(
  SELECT m.new_serial
  FROM _retired_serial_rebase m
  WHERE 'TMP-RET-' || m.old_serial=retired_serials.serial_number
)
WHERE serial_number LIKE 'TMP-RET-%';

DROP TABLE IF EXISTS _retired_serial_rebase;
DROP TABLE IF EXISTS _unit_serial_rebase;
DROP TABLE IF EXISTS _gmach_code_rebase;
