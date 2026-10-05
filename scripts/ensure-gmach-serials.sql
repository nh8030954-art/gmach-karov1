-- Assign numbers only to organizations that lack one; preserve every existing identity.
INSERT OR IGNORE INTO organization_serial_codes(code,organization_id)
SELECT (SELECT MAX(149,COALESCE(MAX(code),149)) FROM organization_serial_codes)
       + ROW_NUMBER() OVER (ORDER BY o.created_at,o.id),o.id
FROM organizations o
WHERE NOT EXISTS(SELECT 1 FROM organization_serial_codes s WHERE s.organization_id=o.id);
SELECT COUNT(*) AS missing_gmach_numbers FROM organizations o
WHERE NOT EXISTS(SELECT 1 FROM organization_serial_codes s WHERE s.organization_id=o.id);
