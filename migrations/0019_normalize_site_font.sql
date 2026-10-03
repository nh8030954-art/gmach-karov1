-- Normalize the live site to the single approved default font.
-- Admins can still intentionally choose a different font later through the super-admin editor/settings.
UPDATE site_settings
SET font_family='Assistant, sans-serif',
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE id=1;

UPDATE page_customizations
SET styles_json=json_remove(styles_json,'$.fontFamily')
WHERE json_extract(styles_json,'$.fontFamily') IS NOT NULL;
