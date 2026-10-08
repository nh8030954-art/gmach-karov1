CREATE TABLE IF NOT EXISTS notification_event_outbox (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TRIGGER IF NOT EXISTS notification_insert_event AFTER INSERT ON notifications
BEGIN
  INSERT INTO notification_event_outbox(user_id) VALUES(NEW.user_id);
END;
CREATE TABLE IF NOT EXISTS admin_bell_dirty (
  id INTEGER PRIMARY KEY CHECK(id=1),
  version INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS admin_bell_alert_event AFTER INSERT ON system_alerts
WHEN NEW.severity IN ('warning','critical') AND NEW.resolved_at IS NULL
BEGIN
  INSERT INTO admin_bell_dirty(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER IF NOT EXISTS admin_bell_error_event AFTER INSERT ON server_errors
WHEN COALESCE(NEW.method,'')!='CLIENT'
BEGIN
  INSERT INTO admin_bell_dirty(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER IF NOT EXISTS admin_bell_support_event AFTER INSERT ON support_ticket_messages
WHEN COALESCE((SELECT role FROM users WHERE id=NEW.sender_id),'member')!='admin'
BEGIN
  INSERT INTO admin_bell_dirty(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER IF NOT EXISTS admin_bell_content_event AFTER INSERT ON content_reports
BEGIN
  INSERT INTO admin_bell_dirty(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
END;
CREATE TRIGGER IF NOT EXISTS admin_bell_report_event AFTER INSERT ON reports
BEGIN
  INSERT INTO admin_bell_dirty(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1;
END;
