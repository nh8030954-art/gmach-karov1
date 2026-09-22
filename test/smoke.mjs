import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { FormData as WorkerFormData, Miniflare, convertV4MiniflareOptions } from "miniflare";

const base = "http://local.test";
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true,
  scriptPath: "worker/index.js",
  compatibilityDate: "2026-09-20",
  d1Databases: { DB: "smoke-db" },
  r2Buckets: ["ITEM_IMAGES"],
  bindings: { ADMIN_EMAILS: "" }
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

try {
  const db = await mf.getD1Database("DB");
  for (const filename of ["0001_initial.sql", "0002_remove_demo_catalog.sql", "0003_communication_and_management.sql", "0004_admin_console_and_security.sql", "0005_visual_editor.sql"]) {
    const migration = await readFile(`migrations/${filename}`, "utf8");
    const statements = migration.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }

  let result = await request("/api/health");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.database, "D1");

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

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, body: { name: "גמ״ח בדיקה", primaryCategory: "אירועים", city: "ירושלים", neighborhood: "מרכז", description: "ציוד חינמי לאירועים קהילתיים ולשמחות משפחתיות.", phone: "050-1234567" } });
  assert.equal(result.response.status, 201);
  const organizationId = result.data.organization.id;

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "ערכת קישוטים לבדיקה", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.", loanConditions: "איסוף עצמי" } });
  assert.equal(result.response.status, 201);
  const itemId = result.data.item.id;

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
  assert.equal(result.data.organizations.length, 1);
  assert.equal(result.data.items.length, 1);
  await request(`/api/admin/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", verified: true } });
  result = await request(`/api/admin/items/${itemId}`, { method: "PATCH", cookie: adminCookie, body: { status: "active" } });
  assert.equal(result.response.status, 200);

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואלת ציוד", email: "borrower@example.com", password: "AnotherPass!456" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.user.role, "member");
  const borrowerCookie = result.response.headers.get("set-cookie").split(";", 1)[0];

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
  assert.equal(result.data.requests[0].borrower_phone, "052-7654321");
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", managerNote: "איסוף מהכניסה בשעה 19:00" } });
  assert.equal(result.response.status, 200);

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

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואל נוסף", email: "second@example.com", password: "ThirdPass!789" } });
  assert.equal(result.response.status, 201);
  const secondCookie = result.response.headers.get("set-cookie").split(";", 1)[0];
  result = await request(`/api/loan-requests/${requestId}/messages`, { cookie: secondCookie });
  assert.equal(result.response.status, 403);
  result = await request("/api/loan-requests", { method: "POST", cookie: secondCookie, body: { itemId, requestedFrom: "2026-10-02", requestedUntil: "2026-10-04", phone: "054-1112233", note: "צריך לאירוע נוסף" } });
  assert.equal(result.response.status, 201);
  const overlappingRequestId = result.data.request.id;
  result = await request(`/api/loan-requests/${overlappingRequestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", managerNote: "נבדוק זמינות" } });
  assert.equal(result.response.status, 409);
  result = await request(`/api/loan-requests/${overlappingRequestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "declined", managerNote: "הפריט כבר תפוס בתאריכים שביקשת" } });
  assert.equal(result.response.status, 200);

  result = await request("/api/reports", { method: "POST", cookie: borrowerCookie, body: { itemId, reason: "incorrect", details: "בדיקת זרימת הדיווח" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/admin/pending", { cookie: adminCookie });
  assert.equal(result.data.reports.length, 1);
  const reportId = result.data.reports[0].id;
  result = await request(`/api/admin/reports/${reportId}`, { method: "PATCH", cookie: adminCookie, body: { status: "reviewed" } });
  assert.equal(result.response.status, 200);

  result = await request(`/api/items/${itemId}`, { method: "PATCH", cookie: adminCookie, body: { title: "ערכת קישוטים מעודכנת", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה ומעודכנת שנועדה לבדוק את תהליך העריכה באתר.", loanConditions: "איסוף עצמי" } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: true } });
  assert.equal(result.response.status, 200);
  result = await request("/api/items");
  assert.equal(result.data.items.length, 0);
  await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: false } });
  result = await request("/api/items");
  assert.equal(result.data.items.length, 1);

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
