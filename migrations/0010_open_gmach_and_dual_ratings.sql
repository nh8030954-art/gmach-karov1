PRAGMA foreign_keys = ON;

-- Opening a gmach no longer requires administrator approval.
UPDATE organizations SET status = 'approved', verified = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'pending';

-- A completed loan receives two independent scores: the gmach and the item.
ALTER TABLE reviews ADD COLUMN item_id TEXT REFERENCES items(id) ON DELETE CASCADE;
ALTER TABLE reviews ADD COLUMN item_rating INTEGER CHECK (item_rating BETWEEN 1 AND 5);

UPDATE reviews
SET item_id = (SELECT lr.item_id FROM loan_requests lr WHERE lr.id = reviews.request_id)
WHERE item_id IS NULL;

CREATE INDEX reviews_item_idx ON reviews(item_id,status,created_at DESC);
