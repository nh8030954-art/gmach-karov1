import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

// Synthetic, clearly labelled catalog data. This script is invoked only by the QA workflow.
const destination = process.argv[2];
if (!destination) throw new Error("Pass the output SQL filename");
const cities = ["ירושלים", "תל אביב-יפו", "בני ברק", "חיפה", "פתח תקווה", "בית שמש", "אשדוד", "נתניה", "באר שבע", "מודיעין עילית"];
const groups = [
  ["אירועים", ["שולחן מתקפל", "כיסאות מתקפלים", "מיחם לשבת", "רמקול נייד", "מקרן ומסך", "סט כלים לאירוע"]],
  ["תינוקות", ["עגלת תינוק", "לול מתקפל", "כיסא בטיחות", "משאבת חלב", "טרמפולינה לתינוק", "מיטת מעבר"]],
  ["רפואה", ["כיסא גלגלים", "הליכון מתקפל", "קביים", "מכשיר אינהלציה", "מיטה סיעודית", "מד לחץ דם"]],
  ["כלי עבודה", ["מקדחה נטענת", "סולם מתקפל", "ארגז כלי עבודה", "מכונת שטיפה", "מברגה חשמלית", "מסור ידני"]],
  ["טיולים", ["מזוודה גדולה", "תיק גב לטיול", "צידנית חשמלית", "אוהל משפחתי", "מנשא תינוק", "גגון לרכב"]],
  ["ספרים ולימוד", ["ספרי לימוד", "ערכת יצירה", "מחשבון מדעי", "סט ספרי ילדים", "לוח מחיק", "עמדת קריאה"]]
];
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const sessionToken = userNumber => `qa-demo-session-${String(userNumber).padStart(3, "0")}-activity-v1`;
const sessionHash = token => createHash("sha256").update(token).digest("base64url");
const sql = [
  "-- QA only: fictional organizations, users, sessions and products for launch simulation.",
  "DELETE FROM loan_requests WHERE borrower_id LIKE 'qa-demo-user-%';",
  "DELETE FROM favorites WHERE user_id LIKE 'qa-demo-user-%';",
  "DELETE FROM sessions WHERE user_id LIKE 'qa-demo-user-%';"
];
for (let user = 0; user < 250; user++) {
  const userNumber = user + 1;
  const userId = `qa-demo-user-${String(userNumber).padStart(3, "0")}`;
  const language = userNumber % 2 === 0 ? "en" : "he";
  sql.push(`INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, full_name) VALUES (${quote(userId)}, ${quote(`qa-demo-${userNumber}@example.invalid`)}, 'unusable-qa-demo-hash', 'unusable-qa-demo-salt', ${quote(`משתמש הדגמה ${userNumber}`)});`);
  sql.push(`UPDATE users SET preferred_language=${quote(language)}, account_status='active' WHERE id=${quote(userId)};`);
  sql.push(`INSERT OR REPLACE INTO sessions (token_hash,user_id,expires_at) VALUES (${quote(sessionHash(sessionToken(userNumber)))},${quote(userId)},'2099-12-31T23:59:59.000Z');`);
}
for (let org = 0; org < 36; org++) {
  const [category, products] = groups[org % groups.length];
  const city = cities[org % cities.length];
  const organizationId = `qa-demo-organization-${String(org + 1).padStart(2, "0")}`;
  const name = `גמ״ח הדגמה ${category} ${city} ${org + 1}`;
  const ownerId = `qa-demo-user-${String(org + 1).padStart(3, "0")}`;
  sql.push(`INSERT OR IGNORE INTO organizations (id, owner_id, name, primary_category, city, description, status) VALUES (${quote(organizationId)}, ${quote(ownerId)}, ${quote(name)}, ${quote(category)}, ${quote(city)}, ${quote("נתוני הדגמה בלבד בסביבת הבדיקות. אין לפנות לגמ״ח זה לצורך השאלה אמיתית.")}, 'approved');`);
  sql.push(`UPDATE organizations SET owner_id=${quote(ownerId)}, primary_category=${quote(category)}, status='approved' WHERE id=${quote(organizationId)};`);
  for (let index = 0; index < 6; index++) {
    const product = products[(index + Math.floor(org / groups.length)) % products.length];
    const itemId = `qa-demo-item-${String(org + 1).padStart(2, "0")}-${index + 1}`;
    const availability = index === 5 ? "unavailable" : "available";
    sql.push(`INSERT OR IGNORE INTO items (id, organization_id, title, category, description, condition, quantity, city, status, availability_status, icon) VALUES (${quote(itemId)}, ${quote(organizationId)}, ${quote(product)}, ${quote(category)}, ${quote("פריט הדגמה בלבד. מופיע כדי להמחיש חיפוש, סינון ועמוד גמ״ח בסביבת הבדיקות.")}, 'טוב', ${1 + (index % 4)}, ${quote(city)}, 'active', ${quote(availability)}, 'box');`);
    sql.push(`UPDATE items SET category=${quote(category)}, status='active', availability_status=${quote(availability)} WHERE id=${quote(itemId)};`);
  }
}
await writeFile(destination, sql.join("\n") + "\n");
console.log("Prepared 250 fictional QA users with sessions, 36 organizations and 216 example items");
