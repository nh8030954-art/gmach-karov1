CREATE TABLE IF NOT EXISTS item_loan_costs (
 item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE,
 payment_mode TEXT NOT NULL CHECK(payment_mode IN ('free','nominal')),
 explanation TEXT NOT NULL DEFAULT ''
);

UPDATE site_settings SET hero_description='מוצאים ציוד להשאלה ללא תשלום או בתשלום סמלי מגמ״חים קרוב לבית.'
WHERE hero_description='מוצאים ציוד להשאלה בחינם מגמ״חים ואנשים טובים קרוב לבית.';
