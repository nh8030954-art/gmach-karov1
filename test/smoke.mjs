import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import miniflare from "miniflare";
const { FormData: WorkerFormData, Miniflare } = miniflare;

const base = "http://local.test";
const sentEmails = [];
const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
  scriptPath: "worker/index.js",
  // Keep the emulator date within the pinned workerd version; production keeps its newer date.
  compatibilityDate: "2026-08-06",
  d1Databases: { DB: "smoke-db" },
  r2Buckets: ["ITEM_IMAGES"],
  bindings: { ADMIN_EMAILS: "", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Gmach Berega <verify@example.org>", SUPPORT_EMAIL: "support@example.org", DATA_ENCRYPTION_KEY: "test-only-private-data-key-123456789" },
  serviceBindings: { RESEND_SERVICE: async request => { sentEmails.push(await request.json()); return Response.json({ id: crypto.randomUUID() }); } }
});

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

function splitMigration(sql) {
  const statements = [];
  let buffer = "";
  let trigger = false;
  for (const line of sql.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("--")) continue;
    buffer += `${line}\n`;
    if (!trigger && /^\s*CREATE\s+TRIGGER\b/i.test(buffer)) trigger = true;
    const complete = trigger ? /^\s*END;\s*$/i.test(line) : /;\s*$/.test(line);
    if (complete) {
      statements.push(buffer.trim().replace(/;\s*$/, ""));
      buffer = "";
      trigger = false;
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

try {
  const db = await mf.getD1Database("DB");
  // Exercise the same schema as production, including migrations added after this test.
  for (const filename of (await readdir("migrations")).filter(name => /^\d+.*\.sql$/.test(name)).sort()) {
    const migration = (await readFile(`migrations/${filename}`, "utf8")).replace(/^\s*--.*$/gm, "");
    const statements = splitMigration(migration);
    await db.batch(statements.map(statement => db.prepare(statement)));
  }

  let result = await request("/api/health");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.database, "D1");
  assert.equal(result.data.email, true);
  result = await request("/api/categories");
  assert.equal(result.response.status, 200);
  assert.ok(result.data.categories.length > 20);

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    result = await request("/api/support", { method: "POST", body: { name: "בדיקת תמיכה", email: "supporter@example.com", subject: `פנייה ${attempt}`, message: "זוהי פנייה תקינה לבדיקת מנגנון התמיכה והגבלת השימוש." } });
    assert.equal(result.response.status, 201, JSON.stringify(result.data));
  }
  result = await request("/api/support", { method: "POST", body: { name: "בדיקת תמיכה", email: "supporter@example.com", subject: "פנייה נוספת", message: "פנייה זו אמורה להיחסם לאחר חריגה מהמכסה המותרת." } });
  assert.equal(result.response.status, 429);

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

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, body: { name: "גמ״ח בדיקה", primaryCategory: "אירועים", city: "ירושלים", neighborhood: "מרכז", description: "ציוד חינמי לאירועים קהילתיים ולשמחות משפחתיות.", phone: "050-1234567" } });
  assert.equal(result.response.status, 201);
  const organizationId = result.data.organization.id;

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "ערכת קישוטים לבדיקה", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.", loanConditions: "איסוף עצמי", depositRequired: true, depositAmount: "100" } });
  assert.equal(result.response.status, 201);
  const itemId = result.data.item.id;

  result = await request(`/api/organizations/${organizationId}/branches`, { method:"POST", cookie:adminCookie, body:{ name:"סניף מרכזי",address:"רחוב הבדיקה 1",city:"ירושלים",phone:"050-1234567",inventoryMode:"separate",hours:{sun:"09:00-17:00"} } });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/items/${itemId}/units`, { method:"POST",cookie:adminCookie,body:{count:2,condition:"חדש"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  assert.equal(result.data.units.length,2);

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
  assert.equal(result.data.items.length, 0, "New items should publish immediately without admin approval");

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואלת ציוד", phone:"052-7654321", city:"ירושלים", address:"רחוב הבדיקה 1, ירושלים", email: "borrower@example.com", password: "AnotherPass!456", termsAccepted: true, operationalEmailsAccepted:true } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.verificationRequired, true);
  const borrowerCookie = await verifyLatestEmail("borrower@example.com");
  result = await request("/api/me/profile", { cookie:borrowerCookie });
  assert.equal(result.data.profile.city,"ירושלים");
  result = await request("/api/me/notification-preferences", { method:"PUT",cookie:borrowerCookie,body:{preferences:[{type:"loan_status",inApp:true,email:true,push:false,digest:"immediate"}]} });
  assert.equal(result.response.status,200);
  result = await request("/api/me/saved-searches", { method:"POST",cookie:borrowerCookie,body:{name:"עגלות בירושלים",filters:{category:"תינוקות",city:"ירושלים"},notify:true} });
  assert.equal(result.response.status,201);

  result = await request(`/api/favorites/${itemId}`, { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  result = await request("/api/loan-requests", { method: "POST", cookie: borrowerCookie, body: { itemId, requestedFrom: "2026-10-01T10:00", requestedUntil: "2026-10-02T12:00", quantity: 1, depositAccepted: true, phone: "052-7654321", note: "לאירוע משפחתי" } });
  assert.equal(result.response.status, 201);
  const requestId = result.data.request.id;
  result = await request(`/api/loan-requests/${requestId}/pickup-proposals`, { method:"POST",cookie:adminCookie,body:{startsAt:"2026-10-01T18:00:00Z",endsAt:"2026-10-01T19:00:00Z"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/timeline`, { cookie:borrowerCookie });
  assert.equal(result.response.status,200);
  assert.equal(result.data.proposals.length,1);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-02T18%3A00&until=2026-10-04T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-03T20%3A00&until=2026-10-04T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-03T21%3A00&until=2026-10-04T10%3A00`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.available, true);

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
  assert.equal(result.data.unread, 3);
  result = await request("/api/notifications/read-all", { method: "POST", cookie: borrowerCookie, body: {} });
  assert.equal(result.response.status, 200);
  result = await request("/api/notifications", { cookie: borrowerCookie });
  assert.equal(result.data.unread, 0);

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואל נוסף", phone:"054-1112233", city:"ירושלים", address:"רחוב הבדיקה 2, ירושלים", email: "second@example.com", password: "ThirdPass!789", termsAccepted: true, operationalEmailsAccepted:true } });
  assert.equal(result.response.status, 201);
  const secondCookie = await verifyLatestEmail("second@example.com");
  result = await request(`/api/organizations/${organizationId}/members`, { method:"POST",cookie:adminCookie,body:{email:"second@example.com",role:"inventory"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/messages`, { cookie: secondCookie });
  assert.equal(result.response.status, 403);
  result = await request("/api/loan-requests", { method: "POST", cookie: secondCookie, body: { itemId, requestedFrom: "2026-10-02T10:00", requestedUntil: "2026-10-04T10:00", quantity: 1, depositAccepted: true, phone: "054-1112233", note: "צריך לאירוע נוסף" } });
  assert.equal(result.response.status, 409);

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
  const helpRequestId=result.data.requests[0].id;
  result = await request(`/api/help-requests/${helpRequestId}/offers`, { method:"POST",cookie:adminCookie,body:{itemId,message:"הפריט שלנו מתאים לבקשה"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request("/api/analytics/events", { method: "POST", cookie: borrowerCookie, body: { eventType: "search", query: "קישוט", city: "ירושלים", category: "אירועים" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/admin/analytics", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  result = await request(`/api/items/${itemId}/units`, { cookie: adminCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.units.length >= 1);
  result = await request(`/api/loan-requests/${requestId}/assign-units`, { method: "POST", cookie: adminCookie, body: { unitIds: [result.data.units[0].id] } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "returned" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/reviews", { method: "POST", cookie: borrowerCookie, body: { requestId, organizationRating: 5, itemRating: 4, serviceRating: 5, comment: "שירות מצוין והפריט במצב טוב" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.review.organizationRating, 5);
  assert.equal(result.data.review.itemRating, 4);
  result = await request(`/api/items/${itemId}`);
  assert.equal(result.data.item.rating, 4);
  assert.equal(result.data.item.organizations.rating, 5);

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
