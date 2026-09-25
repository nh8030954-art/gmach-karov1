PRAGMA foreign_keys = ON;

DROP TRIGGER IF EXISTS notifications_enqueue_delivery;
CREATE TRIGGER notifications_enqueue_delivery
AFTER INSERT ON notifications
BEGIN
  INSERT INTO notification_queue(id,user_id,notification_type,channel,title,body,payload_json,scheduled_at)
  SELECT
    lower(hex(randomblob(16))),
    NEW.user_id,
    CASE
      WHEN NEW.type IN ('request','status') THEN 'loan_status'
      WHEN NEW.type='message' THEN 'messages'
      ELSE 'security'
    END,
    CASE WHEN p.digest='daily' THEN 'digest' ELSE 'email' END,
    NEW.title,
    NEW.body,
    json_object('requestId',NEW.request_id,'notificationId',NEW.id),
    CASE
      WHEN p.digest='daily' THEN datetime('now','+1 day','start of day','+8 hours')
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now')
    END
  FROM notification_preferences p
  JOIN users u ON u.id=p.user_id
  WHERE p.user_id=NEW.user_id
    AND p.notification_type=CASE
      WHEN NEW.type IN ('request','status') THEN 'loan_status'
      WHEN NEW.type='message' THEN 'messages'
      ELSE 'security'
    END
    AND p.email=1
    AND u.operational_emails_accepted=1;

  INSERT INTO notification_queue(id,user_id,notification_type,channel,title,body,payload_json,scheduled_at)
  SELECT
    lower(hex(randomblob(16))),
    NEW.user_id,
    CASE
      WHEN NEW.type IN ('request','status') THEN 'loan_status'
      WHEN NEW.type='message' THEN 'messages'
      ELSE 'security'
    END,
    'push',
    NEW.title,
    NEW.body,
    json_object('requestId',NEW.request_id,'notificationId',NEW.id),
    strftime('%Y-%m-%dT%H:%M:%fZ','now')
  FROM notification_preferences p
  WHERE p.user_id=NEW.user_id
    AND p.notification_type=CASE
      WHEN NEW.type IN ('request','status') THEN 'loan_status'
      WHEN NEW.type='message' THEN 'messages'
      ELSE 'security'
    END
    AND p.push=1;
END;

INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'loan_status',1,operational_emails_accepted,0,'immediate' FROM users WHERE account_status='active';
INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'messages',1,0,0,'immediate' FROM users WHERE account_status='active';
INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'security',1,operational_emails_accepted,0,'immediate' FROM users WHERE account_status='active';
INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'support',1,operational_emails_accepted,0,'immediate' FROM users WHERE account_status='active';
INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'community',1,community_emails_accepted,0,'daily' FROM users WHERE account_status='active';
INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest)
SELECT id,'waitlist',1,operational_emails_accepted,0,'immediate' FROM users WHERE account_status='active';
