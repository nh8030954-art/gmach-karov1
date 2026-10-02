-- Reconcile serialized unit states with the current loan lifecycle.
UPDATE item_units
SET status='held',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  SELECT a.unit_id
  FROM loan_unit_assignments a
  JOIN loan_requests lr ON lr.id=a.request_id
  WHERE a.returned_at IS NULL AND lr.status='approved'
);

UPDATE item_units
SET status='loaned',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  SELECT a.unit_id
  FROM loan_unit_assignments a
  JOIN loan_requests lr ON lr.id=a.request_id
  WHERE a.returned_at IS NULL AND lr.status='collected'
);

UPDATE item_units
SET status='available',updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id IN (
  SELECT a.unit_id
  FROM loan_unit_assignments a
  JOIN loan_requests lr ON lr.id=a.request_id
  WHERE a.returned_at IS NULL AND lr.status IN ('declined','cancelled','returned')
);

UPDATE loan_unit_assignments
SET returned_at=COALESCE(returned_at,strftime('%Y-%m-%dT%H:%M:%fZ','now'))
WHERE returned_at IS NULL
  AND request_id IN (
    SELECT id FROM loan_requests WHERE status IN ('declined','cancelled','returned')
  );
