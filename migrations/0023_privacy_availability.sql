PRAGMA foreign_keys = ON;
ALTER TABLE user_data_requests ADD COLUMN admin_note TEXT;
ALTER TABLE user_data_requests ADD COLUMN assigned_to TEXT;
ALTER TABLE user_data_requests ADD COLUMN updated_at TEXT;
ALTER TABLE user_data_requests ADD COLUMN due_at TEXT;
CREATE INDEX user_data_requests_admin_idx ON user_data_requests(status,due_at,created_at);
CREATE INDEX availability_rules_scope_idx ON availability_rules(organization_id,branch_id,item_id,rule_type,active);
