import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import miniflare from "miniflare";
const { FormData: WorkerFormData, Miniflare } = miniflare;

const base = "http://local.test";
const sentEmails = [];
let adminSessionCookie = null;
const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
  scriptPath: "worker/index.js",
  // Keep the emulator date within the pinned workerd version; production keeps its newer date.
  compatibilityDate: "2026-08-06",
  d1Databases: { DB: "smoke-db" },
  r2Buckets: ["ITEM_IMAGES"],
  bindings: { ADMIN_EMAILS: "admin@example.org", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Gmach Berega <verify@example.org>", SUPPORT_EMAIL: "support@example.org", DATA_ENCRYPTION_KEY: "test-only-private-data-key-123456789" },
  serviceBindings: { RESEND_SERVICE: async request => { sentEmails.push(await request.json()); return Response.json({ id: crypto.randomUUID() }); } }
});

async function request(path, { method = "GET", body, cookie, form, origin = base } = {}) {
  const headers = new Headers();
  if (!["GET", "HEAD"].includes(method)) {
    headers.set("Origin", origin);
    headers.set("Sec-Fetch-Site", origin === base ? "same-origin" : "cross-site");
  }
  if (cookie) headers.set("Cookie", cookie);
  if (cookie && cookie === adminSessionCookie && !["GET", "HEAD"].includes(method) && /^\/api\/admin\/(users|organizations|items|reports|backups|moderation)(\/|$)/.test(path)) {
    const db = await mf.getD1Database("DB"), code = "123456", challengeId = crypto.randomUUID();
    const admin = await db.prepare("SELECT id FROM users WHERE email=?").bind("admin@example.org").first();
    await db.prepare("INSERT INTO admin_action_challenges(id,user_id,action,token_hash,expires_at) VALUES(?,?,?,?,?)")
      .bind(challengeId, admin.id, `${method} ${path}`, createHash("sha256").update(code).digest("base64url"), new Date(Date.now() + 600000).toISOString()).run();
    headers.set("X-Admin-Challenge-Id", challengeId);
    headers.set("X-Admin-Challenge-Code", code);
  }
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

  let result = await request("/api/health?deep=1");
  const provisionedAdmin = await (await mf.getD1Database("DB")).prepare("SELECT role,email_verified,totp_enabled FROM users WHERE email=?").bind("netanelhirsh@gmail.com").first();
  assert.deepEqual([provisionedAdmin?.role, provisionedAdmin?.email_verified, provisionedAdmin?.totp_enabled],["admin",1,0],"Requested admin account must be provisioned and require Authenticator setup");
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

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "משתמש ראשון", phone: "052-1112233", city: "ירושלים", address: "רחוב הבדיקה 9, ירושלים", email: "first@example.org", password: "FirstUserPass!456", termsAccepted: true, operationalEmailsAccepted: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const firstCookie = await verifyLatestEmail("first@example.org");
  result = await request("/api/auth/me", { cookie: firstCookie });
  assert.notEqual(result.data.user.role, "admin", "The first registrant must not become an administrator");

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "מנהל בדיקה", phone: "052-1234567", city: "ירושלים", address: "רחוב הבדיקה 1, ירושלים", email: "admin@example.org", password: "UniqueAdminPass!456", termsAccepted: true, operationalEmailsAccepted: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const adminCookie = await verifyLatestEmail("admin@example.org");
  adminSessionCookie = adminCookie;
  result = await request("/api/admin/pending", { cookie: adminCookie });
  assert.equal(result.response.status, 403, "Admin actions require Authenticator enrollment");
  result = await request("/api/auth/2fa/setup", { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", secret = new URL(result.data.otpauthUri).searchParams.get("secret");
  let buffer = 0, bits = 0; const bytes = [];
  for (const char of secret) { buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5; if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 255); } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", Buffer.from(bytes)).update(counter).digest(), offset = digest.at(-1) & 15;
  const code = String((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(6, "0");
  result = await request("/api/auth/2fa/confirm", { method: "POST", cookie: adminCookie, body: { code } });
  assert.equal(result.response.status, 200);
  result = await request("/api/auth/register", { method: "POST", body: { fullName: "English Member", phone: "052-1234578", city: "Jerusalem", address: "10 Example Street, Jerusalem", email: "english@example.org", password: "EnglishUserPass!456", preferredLanguage: "en", termsAccepted: true, operationalEmailsAccepted: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const englishVerification = sentEmails.at(-1);
  assert.equal(englishVerification.subject, "Your Gmach Berega verification code");
  assert.match(englishVerification.html, /dir="ltr"/);
  const englishCookie = await verifyLatestEmail("english@example.org");
  result = await request("/api/me/profile", { cookie: englishCookie });
  assert.equal(result.data.profile.preferredLanguage, "en");
  result = await request("/api/auth/forgot-password", { method: "POST", body: { email: "english@example.org" } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(sentEmails.at(-1).subject, "Reset your Gmach Berega password");

  result = await request("/api/admin/email-templates/password_reset/enabled", {method:"PATCH",body:{enabled:false}});
  assert.equal(result.response.status,401,"Only the authenticated admin may toggle mail");
  result = await request("/api/admin/email-templates/password_reset/enabled", {method:"PATCH",cookie:adminCookie,body:{enabled:false}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  const templateRows=(await request("/api/admin/email-templates",{cookie:adminCookie})).data.templates;
  const resetRows=templateRows.filter(r=>r.template_key==="password_reset");
  assert.equal(resetRows.length,2);assert.ok(resetRows.every(r=>Number(r.enabled)===0));
  const englishReset=resetRows.find(r=>r.language==="en");
  result=await request("/api/admin/email-templates/password_reset/en",{method:"PUT",cookie:adminCookie,body:{subject:englishReset.subject,bodyText:englishReset.body_text,design:englishReset.design}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.ok((await request("/api/admin/email-templates",{cookie:adminCookie})).data.templates.filter(r=>r.template_key==="password_reset").every(r=>Number(r.enabled)===0),"Editing text must preserve disabled status");
  await db.prepare("DELETE FROM auth_challenges WHERE purpose='email_verify'").run();
  const beforeDisabled=sentEmails.length;
  for(const email of ["english@example.org","first@example.org"]){await request("/api/auth/forgot-password",{method:"POST",body:{email}});}
  assert.equal(sentEmails.length,beforeDisabled,"Disabled mail must never reach provider in either language");
  result=await request("/api/admin/email-templates/password_reset/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:true}});
  assert.equal(result.response.status,200);
  await db.prepare("DELETE FROM auth_challenges WHERE purpose='email_verify'").run();
  await request("/api/auth/forgot-password",{method:"POST",body:{email:"english@example.org"}});
  assert.equal(sentEmails.length,beforeDisabled+1,"Re-enabling restores delivery");

  console.log("Email controls passed: permissions, all languages, content edits, blocked provider delivery and re-enable.");
} finally { await mf.dispose(); }
