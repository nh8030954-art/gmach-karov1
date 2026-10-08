-- Add mourning categories without replacing existing catalog entries.
INSERT OR IGNORE INTO categories (id,parent_id,name_he,name_en,icon,sort_order) VALUES
('mourning',NULL,'אבלות','Mourning','book','80'),
('mourning-low-chairs','mourning','כיסאות נמוכים לשבעה','Low mourning chairs','book','10'),
('mourning-furniture','mourning','שולחנות וכיסאות למנחמים','Tables and chairs for visitors','book','20'),
('mourning-tents','mourning','אוהלים וציוד הצללה לשבעה','Mourning tents and shade equipment','book','30'),
('mourning-prayer','mourning','ציוד תפילה ומניין','Prayer and minyan equipment','book','40'),
('mourning-books','mourning','סידורים, תהילים וספרי לימוד','Prayer books, Psalms and study books','book','50'),
('mourning-hospitality','mourning','מיחמים וכלי אירוח','Hot water urns and hospitality supplies','book','60'),
('mourning-support','mourning','ארוחות וסיוע למשפחה','Meals and family support','book','70'),
('mourning-other','mourning','אחר','Other','book','99');
