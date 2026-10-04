-- Add the previously unmanaged administrator alert mail without changing existing templates.
INSERT OR IGNORE INTO email_templates(template_key,language,subject,body_text,enabled,design_json) VALUES
('system_alert','he','{{title}}','{{body}}',1,'{}'),
('system_alert','en','{{title}}','{{body}}',1,'{}');
