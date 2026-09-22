UPDATE site_settings
SET hero_title = 'מה תרצו לשאול היום?',
    hero_description = 'מוצאים ציוד להשאלה בחינם מגמ״חים ואנשים טובים קרוב לבית.',
    font_family = CASE WHEN font_family = 'Arial, sans-serif' THEN 'Assistant, Arial, sans-serif' ELSE font_family END,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 1
  AND hero_title IN ('מה צריך להשאיל היום?', 'מה תרצו להשאיל היום?');
