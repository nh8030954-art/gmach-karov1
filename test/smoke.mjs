import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormData as WorkerFormData, Miniflare, convertV4MiniflareOptions } from "miniflare";

const base = "http://local.test";
const sentEmails = [];
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: "worker/index.js",
  compatibilityDate: "2026-09-20",
  d1Databases: { DB: "smoke-db" },
  r2Buckets: ["ITEM_IMAGES"],
  bindings: { ADMIN_EMAILS: "", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Gmach Berega <verify@example.org>", SUPPORT_EMAIL: "support@example.org", DATA_ENCRYPTION_KEY: "local-smoke-encryption-key", ENVIRONMENT:"test" },
  serviceBindings: { RESEND_SERVICE: async request => { sentEmails.push(await request.json()); return Response.json({ id: crypto.randomUUID() }); } }
}));

async function request(path, { method = "GET", body, cookie, form, origin = base } = {}) {
  const headers = new Headers();
  if (!["GET", "HEAD"].includes(method)) {
    headers.set("Origin", origin);
    headers.set("Sec-Fetch-Site", origin === base ? "same-origin" : "cross-site");
  }
  if (cookie) headers.set("Cookie", cookie);
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers.set("Content-Type", "application/json");
    payload = JSON.stringify(body);
  }
  const response = await mf.dispatchFetch(`${base}${path}`, { method, headers, body: payload });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  return { response, data };
}

async function verifyLatestEmail(email) {
  const message = [...sentEmails].reverse().find(item => item.to?.includes(email));
  assert.ok(message, `No verification email sent to ${email}`);
  const code = message.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(code, "Verification code missing from email");
  const verified = await request("/api/auth/verify-email", { method: "POST", body: { email, code } });
  assert.equal(verified.response.status, 200, JSON.stringify(verified.data));
  return verified.response.headers.get("set-cookie").split(";", 1)[0];
}

try {
  const db = await mf.getD1Database("DB");
  for (const filename of ["0001_initial.sql", "0002_remove_demo_catalog.sql", "0003_communication_and_management.sql", "0004_admin_console_and_security.sql", "0005_visual_editor.sql", "0006_refresh_public_copy.sql", "0007_platform_expansion.sql", "0008_production_platform.sql"]) {
    const migration = await readFile(`migrations/${filename}`, "utf8");
    const statements = migration.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }

  let result = await request("/api/health");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.database, "D1");
  assert.equal(result.data.email, true);

  result = await request("/api/items");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.items.length, 0);
  assert.equal(result.data.items.every(item => item.is_free !== false), true);

  result = await request("/api/auth/login", { method: "POST", body: { email: "netanelhirsh@gmail.com", password: "GbR!7qN9#vK4xP2mZ8sL" } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.user.role, "admin");
  const adminCookie = result.response.headers.get("set-cookie").split(";", 1)[0];

  result = await request("/api/admin/site-settings", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.settings.site_name, "גמ״ח ברגע");
  assert.equal(result.data.settings.hero_title, "מה תרצו לשאול היום?");
  result = await request("/api/admin/site-settings", { method: "PATCH", cookie: adminCookie, body: { siteName: "גמ״ח ברגע", tagline: "גדולה גמילות חסדים יותר מן הצדקה", heroTitle: "מה צריך להשאיל היום?", heroDescription: "מוצאים ציוד זמין מגמחים ואנשים טובים באזור שלכם ללא תשלום.", primaryColor: "#243f75", secondaryColor: "#9d7137", accentColor: "#e7bd78", fontFamily: "Arial, sans-serif", baseFontSize: 16, logoUrl: "/gmach-berega-logo.jpg" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/admin/users", { cookie: adminCookie });
  assert.equal(result.data.users.some(user => user.email === "netanelhirsh@gmail.com"), true);
  result = await request("/api/admin/page-customizations", { method: "PUT", cookie: adminCookie, body: { key: "#hero-title", text: "מה תרצו להשאיל?", styles: { fontSize: "64px", color: "#243f75", position: "fixed" }, attributes: { hidden: false } } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.customization.styles.position, undefined);
  result = await request("/api/page-customizations");
  assert.equal(result.data.customizations[0].key, "#hero-title");
  result = await request("/api/admin/content", { cookie: adminCookie });
  assert.equal(Array.isArray(result.data.visualVersions), true);
  result = await request("/api/auth/2fa/setup", { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200);
  assert.match(result.data.otpauthUri, /^otpauth:\/\/totp\//);

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, body: { name: "גמ״ח בדיקה", primaryCategory: "אירועים", city: "ירושלים", neighborhood: "מרכז", address:"רחוב יפו 1, ירושלים", description: "ציוד חינמי לאירועים קהילתיים ולשמחות משפחתיות.", phone: "050-1234567" } });
  assert.equal(result.response.status, 201);
  const organizationId = result.data.organization.id;

  result = await request("/api/categories?lang=he");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.categories.length > 20, true);
  result = await request(`/api/organizations/${organizationId}/branches`, { method: "POST", cookie: adminCookie, body: { name: "הסניף הראשי", address: "רחוב יפו 1, ירושלים", city: "ירושלים", phone: "050-1234567", inventoryMode: "hybrid", hours: { sunday: ["09:00-18:00"] } } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const branchId = result.data.branch.id;

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "ערכת קישוטים לבדיקה", category: "אירועים", condition: "מצב טוב", quantity: 1, description: "ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.", loanConditions: "איסוף עצמי" } });
  assert.equal(result.response.status, 201);
  const itemId = result.data.item.id;

  result = await request(`/api/items/${itemId}/units`, { method: "POST", cookie: adminCookie, body: { count: 2, branchId, condition: "מצב טוב" } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  assert.equal(result.data.units.length, 2);
  assert.notEqual(result.data.units[0].serial, result.data.units[1].serial);
  result = await request(`/api/items/${itemId}/units`, { cookie: adminCookie });
  assert.equal(result.data.units.length, 2);
  const unitId = result.data.units[0].id;
  result = await request(`/api/item-units/${unitId}`, { method: "PATCH", cookie: adminCookie, body: { status: "repair", condition: "בלאי נראה לעין", serialNumber: "FORBIDDEN" } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/items/${itemId}/units`, { cookie: adminCookie });
  assert.notEqual(result.data.units.find(unit => unit.id === unitId).serial_number, "FORBIDDEN");

  const form = new WorkerFormData();
  form.append("images", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "sample.png");
  result = await request(`/api/items/${itemId}/images`, { method: "POST", cookie: adminCookie, form });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.imageUrls.length, 1);
  const mediaPath = result.data.imageUrls[0];
  result = await request(mediaPath);
  assert.equal(result.response.status, 200);
  assert.equal(result.response.headers.get("content-type"), "image/png");

  result = await request("/api/admin/pending", { cookie: adminCookie });
  assert.equal(result.data.organizations.length, 0);
  assert.equal(result.data.items.length, 0);

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואלת ציוד", email: "borrower@example.com", password: "AnotherPass!456",phone:"050-7654321",city:"ירושלים",address:"רחוב המלך דוד 1", termsAccepted: true,operationalEmailsAccepted:true } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.verificationRequired, true);
  const borrowerCookie = await verifyLatestEmail("borrower@example.com");

  result = await request("/api/me/profile", { cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.profile.address, "רחוב המלך דוד 1");
  result = await request("/api/me/notification-preferences", { method: "PUT", cookie: borrowerCookie, body: { preferences: [{ type: "loan_status", inApp: true, email: true, push: false, quietStart: "22:00", quietEnd: "07:00" }] } });
  assert.equal(result.response.status, 200);
  result = await request("/api/me/saved-searches", { method: "POST", cookie: borrowerCookie, body: { name: "קישוטים בירושלים", filters: { query: "קישוטים", city: "ירושלים" }, notify: true } });
  assert.equal(result.response.status, 201);
  result = await request("/api/support/tickets", { method: "POST", cookie: borrowerCookie, body: { subject: "בדיקת תמיכה", message: "זוהי פניית בדיקה מלאה למערכת התמיכה." } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.ticket.number >= 1001, true);

  result = await request(`/api/favorites/${itemId}`, { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  result = await request("/api/loan-requests", { method: "POST", cookie: borrowerCookie, body: { itemId, requestedFrom: "2026-10-01", requestedUntil: "2026-10-03", phone: "052-7654321", note: "לאירוע משפחתי" } });
  assert.equal(result.response.status, 201);
  const requestId = result.data.request.id;

  result = await request("/api/notifications", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.unread, 1);
  assert.equal(result.data.notifications[0].request_id, requestId);

  result = await request(`/api/loan-requests/${requestId}/messages`, { method: "POST", cookie: borrowerCookie, body: { message: "אפשר לאסוף בשעות הערב?" } });
  assert.equal(result.response.status, 201);
  result = await request(`/api/loan-requests/${requestId}/messages`, { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.messages.length, 1);
  assert.equal(result.data.messages[0].body, "אפשר לאסוף בשעות הערב?");
  result = await request(`/api/loan-requests/${requestId}/messages`, { method: "POST", cookie: adminCookie, body: { message: "כן, נתאם כאן לאחר האישור." } });
  assert.equal(result.response.status, 201);

  result = await request("/api/me/dashboard", { cookie: adminCookie });
  assert.equal(result.data.requests[0].direction, "incoming");
  assert.equal(result.data.requests[0].borrower_phone, "050-7654321");
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", managerNote: "איסוף מהכניסה בשעה 19:00" } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/loan-requests/${requestId}/timeline`, { cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.events.some(event => event.status === "approved_ready"), true);

  result = await request("/api/me/dashboard", { cookie: borrowerCookie });
  assert.equal(result.data.requests[0].status, "approved");
  assert.equal(result.data.requests[0].manager_note, "איסוף מהכניסה בשעה 19:00");
  assert.equal(result.data.requests[0].contact_phone, "050-1234567");
  assert.deepEqual(result.data.favorites, [itemId]);

  result = await request("/api/notifications", { cookie: borrowerCookie });
  assert.equal(result.data.unread, 2);
  result = await request("/api/notifications/read-all", { method: "POST", cookie: borrowerCookie, body: {} });
  assert.equal(result.response.status, 200);
  result = await request("/api/notifications", { cookie: borrowerCookie });
  assert.equal(result.data.unread, 0);

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואל נוסף", email: "second@example.com", password: "ThirdPass!789",phone:"054-1112233",city:"ירושלים",address:"רחוב הנביאים 2",termsAccepted: true,operationalEmailsAccepted:true } });
  assert.equal(result.response.status, 201);
  const secondCookie = await verifyLatestEmail("second@example.com");
  result = await request(`/api/loan-requests/${requestId}/messages`, { cookie: secondCookie });
  assert.equal(result.response.status, 403);
  result = await request("/api/loan-requests", { method: "POST", cookie: secondCookie, body: { itemId, requestedFrom: "2026-10-02", requestedUntil: "2026-10-04", quantity:1,joinWaitlist:true,note: "צריך לאירוע נוסף" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.waitlist.status,"waiting");

  result = await request("/api/reports", { method: "POST", cookie: borrowerCookie, body: { itemId, reason: "incorrect", details: "בדיקת זרימת הדיווח" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/admin/pending", { cookie: adminCookie });
  assert.equal(result.data.reports.length, 1);
  const reportId = result.data.reports[0].id;
  result = await request(`/api/admin/reports/${reportId}`, { method: "PATCH", cookie: adminCookie, body: { status: "reviewed" } });
  assert.equal(result.response.status, 200);

  result = await request(`/api/items/${itemId}`, { method: "PATCH", cookie: adminCookie, body: { title: "ערכת קישוטים מעודכנת", category: "אירועים", condition: "מצב טוב", quantity: 1, description: "ערכת קישוטים מלאה ומעודכנת שנועדה לבדוק את תהליך העריכה באתר.", loanConditions: "איסוף עצמי" } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: true } });
  assert.equal(result.response.status, 200);
  result = await request("/api/items");
  assert.equal(result.data.items.length, 0);
  await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: false } });
  result = await request("/api/items");
  assert.equal(result.data.items.length, 1);

  result = await request("/api/discovery?q=קישוט");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.organizations[0].id, organizationId);
  result = await request(`/api/organizations/${organizationId}/public`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.items.length, 1);
  result = await request("/api/help-requests", { method: "POST", cookie: borrowerCookie, body: { title: "צריך שולחן מתקפל", description: "דרוש שולחן מתקפל לאירוע משפחתי קרוב", category: "אירועים", city: "ירושלים", urgency: "urgent" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/help-requests?city=ירושלים");
  assert.equal(result.data.requests.length, 1);
  result = await request("/api/analytics/events", { method: "POST", cookie: borrowerCookie, body: { eventType: "search", query: "קישוט", city: "ירושלים", category: "אירועים" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/admin/analytics", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "collected" } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "returned" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/reviews", { method: "POST", cookie: borrowerCookie, body: { requestId, rating: 5, productRating: 4, serviceRating: 5, comment: "שירות מצוין" } });
  assert.equal(result.response.status, 201);

  result = await request("/api/auth/logout", { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  result = await request("/api/auth/me", { cookie: borrowerCookie });
  assert.equal(result.data.user, null);

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, origin: "https://evil.example", body: {} });
  assert.equal(result.response.status, 403);

  console.log("Cloudflare smoke test passed: auth, D1, R2, inventory, chat, notifications, reports, moderation and permissions.");
} finally {
  await mf.dispose();
}
