-- The requested position for Brit Milah in the event subcategory list is 24.
UPDATE categories
SET sort_order = 24
WHERE id = 'events-brit-milah'
  AND parent_id = 'events';
