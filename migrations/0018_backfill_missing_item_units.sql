-- Backfill serialized units for existing products that have stock quantity but no active unit rows.
WITH RECURSIVE missing(item_id,organization_id,condition,qty,n) AS (
  SELECT i.id,i.organization_id,COALESCE(NULLIF(i.condition,''),'מצב טוב'),i.quantity,1
  FROM items i
  WHERE i.status!='archived'
    AND i.quantity>0
    AND NOT EXISTS (
      SELECT 1 FROM item_units u
      WHERE u.item_id=i.id AND u.status!='retired'
    )
  UNION ALL
  SELECT item_id,organization_id,condition,qty,n+1
  FROM missing
  WHERE n<qty
)
INSERT INTO item_units(id,item_id,branch_id,serial_number,status,condition)
SELECT lower(hex(randomblob(16))),
       m.item_id,
       NULL,
       'GB-'||osc.code||'-'||isc.code||'-'||m.n,
       'available',
       m.condition
FROM missing m
JOIN organization_serial_codes osc ON osc.organization_id=m.organization_id
JOIN item_serial_codes_v2 isc ON isc.item_id=m.item_id;
