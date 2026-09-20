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
  bindings: { ADMIN_EMAILS: "admin@example.com" }
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
  const migration = await readFile("migrations/0001_initial.sql", "utf8");
  const statements = migration.split(/;\s*(?:\r?\n|$)/).map(statement => statement.trim()).filter(Boolean);
  await db.batch(statements.map(statement => db.prepare(statement)));

  let result = await request("/api/health");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.database, "D1");

  result = await request("/api/items");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.items.length, 12);
  assert.equal(result.data.items.every(item => item.is_free !== false), true);

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "מנהלת האתר", email: "admin@example.com", password: "StrongPass!123" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.user.role, "admin");
  const adminCookie = result.response.headers.get("set-cookie").split(";", 1)[0];

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

  result = await request("/api/me/dashboard", { cookie: adminCookie });
  assert.equal(result.data.requests[0].direction, "incoming");
  assert.equal(result.data.requests[0].borrower_phone, "052-7654321");
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "approved" } });
  assert.equal(result.response.status, 200);

  result = await request("/api/me/dashboard", { cookie: borrowerCookie });
  assert.equal(result.data.requests[0].status, "approved");
  assert.equal(result.data.requests[0].contact_phone, "050-1234567");
  assert.deepEqual(result.data.favorites, [itemId]);

  result = await request("/api/auth/logout", { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  result = await request("/api/auth/me", { cookie: borrowerCookie });
  assert.equal(result.data.user, null);

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, origin: "https://evil.example", body: {} });
  assert.equal(result.response.status, 403);

  console.log("Cloudflare smoke test passed: auth, D1, R2, moderation, requests and permissions.");
} finally {
  await mf.dispose();
}
