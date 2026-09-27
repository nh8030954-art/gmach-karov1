import { writeFile } from "node:fs/promises";

// Synthetic, clearly labelled catalog data. This script is invoked only by the QA workflow.
const destination = process.argv[2];
if (!destination) throw new Error("Pass the output SQL filename");
const cities = ["ירושלים", "תל אביב-יפו", "בני ברק", "חיפה", "פתח תקווה", "בית שמש", "אשדוד", "נתניה", "באר שבע", "מודיעין עילית"];
const groups = [
  ["ציוד לאירועים", ["שולחן מתקפל", "כיסאות מתקפלים", "מיחם לשבת", "רמקול נייד", "מקרן ומסך", "סט כלים לאירוע"]],
  ["תינוקות וילדים", ["עגלת תינוק", "לול מתקפל", "כיסא בטיחות", "משאבת חלב", "טרמפולינה לתינוק", "מיטת מעבר"]],
  ["רפואה ושיקום", ["כיסא גלגלים", "הליכון מתקפל", "קביים", "מכשיר אינהלציה", "מיטה סיעודית", "מד לחץ דם"]],
  ["כלי עבודה", ["מקדחה נטענת", "סולם מתקפל", "ארגז כלי עבודה", "מכונת שטיפה", "מברגה חשמלית", "מסור ידני"]],
  ["נסיעות וטיולים", ["מזוודה גדולה", "תיק גב לטיול", "צידנית חשמלית", "אוהל משפחתי", "מנשא תינוק", "גגון לרכב"]],
  ["ספרים ולימוד", ["ספרי לימוד", "ערכת יצירה", "מחשבון מדעי", "סט ספרי ילדים", "לוח מחיק", "עמדת קריאה"]]
];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sql = ["-- QA only: fictional organizations and products for visual review."];
for (let org = 0; org < 36; org++) {
  const [category, products] = groups[org % groups.length];
  const city = cities[org % cities.length];
  const organizationId = `qa-demo-organization-${String(org + 1).padStart(2, "0")}`;
  const name = `גמ״ח הדגמה ${category} ${city} ${org + 1}`;
  sql.push(`INSERT OR IGNORE INTO organizations (id, name, primary_category, city, description, status) VALUES (${quote(organizationId)}, ${quote(name)}, ${quote(category)}, ${quote(city)}, ${quote("נתוני הדגמה בלבד בסביבת הבדיקות. אין לפנות לגמ״ח זה לצורך השאלה אמיתית.")}, 'approved');`);
  for (let index = 0; index < 6; index++) {
    const product = products[(index + Math.floor(org / groups.length)) % products.length];
    const itemId = `qa-demo-item-${String(org + 1).padStart(2, "0")}-${index + 1}`;
    const availability = index === 5 ? "unavailable" : "available";
    sql.push(`INSERT OR IGNORE INTO items (id, organization_id, title, category, description, condition, quantity, city, status, availability_status, icon) VALUES (${quote(itemId)}, ${quote(organizationId)}, ${quote(product)}, ${quote(category)}, ${quote("פריט הדגמה בלבד. מופיע כדי להמחיש חיפוש, סינון ועמוד גמ״ח בסביבת הבדיקות.")}, 'טוב', ${1 + (index % 4)}, ${quote(city)}, 'active', ${quote(availability)}, 'box');`);
  }
}
await writeFile(destination, sql.join("\n") + "\n");
console.log("Prepared 36 fictional QA organizations and 216 example items");
