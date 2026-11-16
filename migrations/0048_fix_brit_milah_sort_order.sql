-- Keep the new Brit Milah subcategory after the existing event subcategories.
-- events-centerpieces already uses 19, and events-signage uses 20.
UPDATE categories
SET sort_order = 21
WHERE id = 'events-brit-milah'
  AND parent_id = 'events';
