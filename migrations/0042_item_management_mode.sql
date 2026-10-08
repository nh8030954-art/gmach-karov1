ALTER TABLE items ADD COLUMN management_mode TEXT NOT NULL DEFAULT 'managed' CHECK(management_mode IN ('managed','direct'));

-- Protect concurrent requests and mode changes, including alternate feature routers.
CREATE TRIGGER direct_items_no_loans
BEFORE INSERT ON loan_requests
WHEN EXISTS(SELECT 1 FROM items WHERE id=NEW.item_id AND management_mode='direct')
BEGIN
  SELECT RAISE(ABORT,'Direct contact items cannot receive loan requests');
END;

CREATE TRIGGER item_mode_preserves_active_loans
BEFORE UPDATE OF management_mode ON items
WHEN NEW.management_mode='direct' AND OLD.management_mode!='direct'
 AND EXISTS(SELECT 1 FROM loan_requests WHERE item_id=OLD.id AND status IN ('pending','approved','collected'))
BEGIN
  SELECT RAISE(ABORT,'Finish active loans before switching to direct contact');
END;
