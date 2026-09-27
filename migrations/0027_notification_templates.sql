INSERT OR IGNORE INTO email_templates(template_key,language,subject,body_text,enabled)
VALUES
('notification','he','עדכון חדש בגמ״ח ברגע','{{title}}\n\n{{body}}\n\nלצפייה בפרטים: {{account_url}}',1),
('notification','en','New Gmach Berega update','You have a new update in your account.\n\n{{title}}\n{{body}}\n\nOpen your account: {{account_url}}',1),
('daily_digest','he','הסיכום היומי שלך מגמ״ח ברגע','{{body}}\n\nלצפייה באזור האישי: {{account_url}}',1),
('daily_digest','en','Your daily Gmach Berega summary','{{body}}\n\nOpen your account: {{account_url}}',1);
