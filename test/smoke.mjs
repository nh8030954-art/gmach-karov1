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
  bindings: { ADMIN_EMAILS: "", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Gmach Berega <verify@example.org>", SUPPORT_EMAIL: "support@example.org", DATA_ENCRYPTION_KEY: "test-only-private-data-key-123456789" },
  serviceBindings: { RESEND_SERVICE: async request => { sentEmails.push(await request.json()); return Response.json({ id: crypto.randomUUID() }); } }
}));

async function request(path, { method = "GET", body, cookie, form, origin = base } = {}) {
  const headers = new Headers();
  if (!["GET", "HEAD"].includes(method)) { headers.set("Origin", origin); headers.set("Sec-Fetch-Site", origin === base ? "same-origin" : "cross-site"); }
  if (cookie) headers.set("Cookie", cookie);
  let payload;
  if (form) payload = form; else if (body !== undefined) { headers.set("Content-Type", "application/json"); payload = JSON.stringify(body); }
  const response = await mf.dispatchFetch(`${base}${path}`, { method, headers, body: payload });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("application/json") ? await response.json() : await response.text();
  return { response, data };
}

async function applyMigration(db, filename) {
  const migration=(await readFile(`migrations/${filename}`,"utf8")).replace(/^\s*--.*$/gm,"");
  const statements=migration.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
  for (const statement of statements) { try { await db.prepare(statement).run(); } catch (error) { if (!/duplicate column name|already exists/i.test(String(error))) throw error; } }
}

try {
  const db = await mf.getD1Database("DB");
  const migrations=["0001_initial.sql","0002_remove_demo_catalog.sql","0003_communication_and_management.sql","0004_admin_console_and_security.sql","0005_visual_editor.sql","0006_refresh_public_copy.sql","0007_platform_expansion.sql","0008_advanced_inventory_and_booking.sql","0009_production_hardening.sql","0010_open_gmach_and_dual_ratings.sql","0011_waitlist_fifo_and_closure_safety.sql","0012_complete_platform.sql","0013_release_completion.sql"];
  for (const filename of migrations) await applyMigration(db,filename);

  const requiredTables=["inventory_holds","scheduled_jobs","notification_delivery_log","backup_runs","operational_alerts","security_events","organization_branches","organization_members","organization_invitations","item_units","loan_unit_assignments","availability_rules","notification_preferences","push_subscriptions","saved_searches","support_tickets","system_alerts"];
  const schema=await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const names=new Set((schema.results||[]).map(row=>row.name));
  for(const table of requiredTables) assert.ok(names.has(table),`Missing production table: ${table}`);

  let result=await request("/api/health");
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.database,"D1");
  assert.equal(result.data.email,true);
  result=await request("/api/categories");
  assert.equal(result.response.status,200);
  assert.ok(result.data.categories.length>20);
  result=await request("/api/items");
  assert.equal(result.response.status,200);
  assert.equal(result.data.items.every(item=>item.is_free!==false),true);

  result=await request("/api/support",{method:"POST",body:{name:"בדיקת תמיכה",email:"supporter@example.com",subject:"בדיקת release",message:"פניית בדיקה לשער ההפצה."}});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  const crossSite=await request("/api/support",{method:"POST",origin:"https://evil.example",body:{name:"x",email:"x@example.com",subject:"x",message:"cross site"}});
  assert.ok([401,403].includes(crossSite.response.status),`Cross-site mutation was not blocked: ${crossSite.response.status}`);

  console.log(`release smoke ok: ${requiredTables.length} required platform tables verified`);
} finally { await mf.dispose(); }
