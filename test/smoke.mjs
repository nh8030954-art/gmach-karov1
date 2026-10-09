import assert from "node:assert/strict";
import vm from "node:vm";
import { createHash, createHmac } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import miniflare from "miniflare";
import { handleLaunchReadiness } from "../worker/launch-readiness.js";
import { refreshServerErrorAlert, handleDistributionCompletion } from "../worker/distribution-completion.js";
const { FormData: WorkerFormData, Miniflare } = miniflare;

const base = "http://local.test";
const fixtureStart=new Date();fixtureStart.setUTCHours(12,0,0,0);fixtureStart.setUTCDate(fixtureStart.getUTCDate()+7+((4-fixtureStart.getUTCDay()+7)%7));
function fixtureDate(value){return new Date(fixtureStart.getTime()+Date.parse(value+'T12:00:00Z')-Date.parse('2026-10-08T12:00:00Z')).toISOString().slice(0,10)}
const sentEmails = [];
let adminSessionCookie = null;
const mf = new Miniflare({
  modules: true,
  modulesRules: [{ type: "ESModule", include: ["**/*.js"], fallthrough: true }],
  scriptPath: "worker/index.js",
  // Keep the emulator date within the pinned workerd version; production keeps its newer date.
  compatibilityDate: "2026-08-06",
  d1Databases: { DB: "smoke-db" },
  r2Buckets: ["ITEM_IMAGES","BACKUP_STORAGE"],
  bindings: { ADMIN_EMAILS: "admin@example.org", RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Gmach Berega <verify@example.org>", SUPPORT_EMAIL: "support@example.org", DATA_ENCRYPTION_KEY: "test-only-private-data-key-123456789" },
  serviceBindings: { RESEND_SERVICE: async request => { sentEmails.push(await request.json()); return Response.json({ id: crypto.randomUUID() }); } }
});

async function request(path, { method = "GET", body, cookie, form, origin = base } = {}) {
  if(method==="POST"&&path==="/api/organizations"&&body&&!Object.hasOwn(body,"subcategories"))body={...body,subcategories:["__all__"]};
  const headers = new Headers();
  if (!["GET", "HEAD"].includes(method)) {
    headers.set("Origin", origin);
    headers.set("Sec-Fetch-Site", origin === base ? "same-origin" : "cross-site");
  }
  if (cookie) headers.set("Cookie", cookie);
  if (cookie && cookie === adminSessionCookie && !["GET", "HEAD"].includes(method) && /^\/api\/admin\/(users|organizations|items|reports|backups|moderation|entities)(\/|$)/.test(path)) {
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

  // Simulate the production schema being ahead of its old migration ledger.
  await db.batch([db.prepare('DROP TRIGGER direct_items_no_loans'),db.prepare('DROP TRIGGER item_mode_preserves_active_loans'),db.prepare('ALTER TABLE items DROP COLUMN management_mode')]);
  assert.equal((await request('/api/items')).response.status,200,'Runtime independently reconciles the new item mode');
  assert.ok((await db.prepare('PRAGMA table_info(items)').all()).results.some(column=>column.name==='management_mode'));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name IN ('direct_items_no_loans','item_mode_preserves_active_loans')").first()).n,2);

  const authOnlyRows=(await db.prepare("SELECT template_key,enabled FROM email_templates").all()).results;
  assert.ok(authOnlyRows.length>=24);
  for(const row of authOnlyRows)assert.equal(Number(row.enabled),["verification","password_reset"].includes(row.template_key)?1:0,"Only auth emails enabled after rollout");
  // Restore normal fixture choices for the full workflow regression suite.
  await db.prepare("UPDATE email_templates SET enabled=1").run();
  const repeat=(await readFile("migrations/0034_auth_only_email_controls.sql","utf8")).replace(/^\s*--.*$/gm,"");
  await db.batch(splitMigration(repeat).map(statement=>db.prepare(statement)));
  assert.equal((await db.prepare("SELECT MIN(enabled) AS enabled FROM email_templates").first()).enabled,1,"One-time rollout must preserve later administrator choices");
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
  const pendingRegistrant = await db.prepare("SELECT id FROM users WHERE email=?").bind("first@example.org").first();
  assert.equal(pendingRegistrant,null,"There must be no user account before email verification");
  const pendingAttempt=await db.prepare("SELECT id FROM pending_registrations WHERE email=?").bind("first@example.org").first();
  assert.ok(pendingAttempt,"Only a temporary registration attempt is stored");
  const initialCode=sentEmails.at(-1).text.match(/\b\d{6}\b/)[0];
  result=await request("/api/auth/verify-email",{method:"POST",body:{email:"first@example.org",code:initialCode==="000000"?"111111":"000000"}});
  assert.equal(result.response.status,400);
  assert.equal(await db.prepare("SELECT id FROM users WHERE email=?").bind("first@example.org").first(),null,"Invalid codes cannot create a user");
  result = await request("/api/auth/login",{method:"POST",body:{email:"first@example.org",password:"FirstUserPass!456"}});
  assert.equal(result.response.status,403);
  assert.equal(result.data.verificationRequired,true,"An inactive registration must still offer email verification");
  await db.prepare("UPDATE pending_registrations SET expires_at=? WHERE email=?").bind(new Date(Date.now()-1000).toISOString(),"first@example.org").run();
  result=await request("/api/auth/verify-email",{method:"POST",body:{email:"first@example.org",code:initialCode}});
  assert.equal(result.response.status,400,"Expired codes cannot create an account");
  result=await request("/api/auth/resend-verification",{method:"POST",body:{email:"first@example.org"}});
  assert.equal(result.response.status,200,"Temporary registrations support resending without a user account");
  assert.equal(await db.prepare("SELECT id FROM users WHERE email=?").bind("first@example.org").first(),null);
  const firstCookie = await verifyLatestEmail("first@example.org");
  const activatedRegistrant = await db.prepare("SELECT email_verified,account_status FROM users WHERE email=?").bind("first@example.org").first();
  assert.equal(activatedRegistrant.email_verified,1);
  assert.equal(activatedRegistrant.account_status,"active","A valid code activates the registration");
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
  const visitorId=crypto.randomUUID(),sessionId=crypto.randomUUID();
  result=await request('/api/analytics/visit',{method:'POST',body:{visitorId,sessionId,path:'/catalog',referrer:'https://example.org/search?q=private'}});assert.equal(result.response.status,201);
  await request('/api/analytics/visit',{method:'POST',body:{visitorId,sessionId,path:'/catalog'}});
  await request('/api/analytics/visit',{method:'POST',body:{visitorId,sessionId:crypto.randomUUID(),path:'/gmach/test'}});
  assert.equal((await request('/api/admin/analytics/visitors')).response.status,401);
  const visitorStats=(await request('/api/admin/analytics/visitors',{cookie:adminCookie})).data;
  assert.equal(Number(visitorStats.summary.visitors),1);assert.equal(Number(visitorStats.summary.visits),2);assert.equal(Number(visitorStats.summary.views),3);assert.equal(Number(visitorStats.summary.guestVisits),2);assert.equal(Number(visitorStats.pages.find(p=>p.path==='/catalog').views),2);assert.equal(visitorStats.sources.find(s=>s.source==='example.org').visits,1);
  assert.equal((await request('/api/analytics/visit',{method:'POST',body:{visitorId:'bad',sessionId,path:'/catalog'}})).response.status,400);
  const {periodStart,recordRegistration,recordVisit}=await import('../worker/visitor-analytics.js');
  assert.equal(periodStart('today',new Date('2026-10-04T21:30:00Z')),'2026-10-04T21:00:00.000Z');
  assert.equal(periodStart('week',new Date('2026-10-04T12:00:00Z')),'2026-10-03T21:00:00.000Z');
  assert.equal(periodStart('month',new Date('2026-11-12T12:00:00Z')),'2026-10-31T22:00:00.000Z');
  const analyticsUser=await db.prepare("SELECT id,role FROM users WHERE email='english@example.org'").first();
  assert.equal((await request('/api/admin/users/'+analyticsUser.id,{method:'PATCH',cookie:adminCookie,body:{role:'admin',accountStatus:'active',emailVerified:true}})).response.status,403);
  assert.equal((await db.prepare('SELECT role FROM users WHERE id=?').bind(analyticsUser.id).first()).role,analyticsUser.role);
  assert.equal((await request('/api/admin/users/'+analyticsUser.id,{method:'PATCH',cookie:adminCookie,body:{accountStatus:'active',emailVerified:true}})).response.status,200);
  await recordRegistration({DB:db},new Request('https://example.org',{headers:{Cookie:'gmach-visitor-id='+visitorId}}),analyticsUser.id);
  for(const period of ['today','week','month']){const stats=(await request('/api/admin/analytics/visitors?period='+period,{cookie:adminCookie})).data;assert.equal(stats.summary.convertedVisitors,1);assert.equal(stats.summary.conversionRate,100);assert.equal(stats.summary.visitors,1);assert.ok(stats.summary.registrations>=1);assert.equal(stats.pages.find(p=>p.path==='/catalog').visitors,1);assert.ok(stats.timeline.length);}
  // Existing sessions must count new views by view time rather than their old start time.
  await db.prepare("UPDATE site_visits SET started_at='2020-01-01T00:00:00.000Z' WHERE session_id=?").bind(sessionId).run();
  await recordVisit({DB:db},{visitorId,sessionId,path:'/catalog'},false,{city:'Jerusalem',country:'IL'});
  const cityStats=(await request('/api/admin/analytics/visitors?period=today',{cookie:adminCookie})).data;
  assert.equal(cityStats.summary.views,4);assert.equal(cityStats.cities.find(c=>c.city==='Jerusalem').visitors,1);
  const templateRows=(await request("/api/admin/email-templates",{cookie:adminCookie})).data.templates;
  for(const key of ["verification","password_reset","manager_invite","notification","daily_digest","new_device","pickup_confirmed","loan_cancelled","extension","waitlist","support","system_alert"]){for(const language of ["he","en"]){assert.ok(templateRows.some(r=>r.template_key===key&&r.language===language),key+" missing in "+language);}}
  const alertSource=await readFile("worker/distribution-completion.js","utf8");
  const sendAlert=vm.runInNewContext(alertSource.slice(alertSource.indexOf("async function sendAlertEmail"),alertSource.indexOf("async function deliverOpenAlerts"))+";sendAlertEmail",{safe:(value,fallback)=>{try{return JSON.parse(value)}catch{return fallback}}});
  let alertProviderCalls=0;
  const alertEnv={DB:db,ADMIN_ALERT_EMAIL:"admin@example.org",RESEND_API_KEY:"test",RESEND_SERVICE:{fetch:async()=>{alertProviderCalls++;return new Response("{}")}}};
  const alert={id:"template-toggle-test",alert_type:"test",severity:"warning",created_at:new Date().toISOString(),details_json:"{}"};
  await db.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,?,?)").bind(alert.id,alert.alert_type,alert.severity,alert.details_json).run();
  await request("/api/admin/email-templates/system_alert/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:false}});
  assert.equal((await sendAlert(alertEnv,alert)).reason,"template_disabled");assert.equal(alertProviderCalls,0);
  await request("/api/admin/email-templates/system_alert/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:true}});
  assert.equal((await sendAlert(alertEnv,alert)).sent,true);assert.equal(alertProviderCalls,1);
  await db.prepare("UPDATE email_templates SET enabled=0 WHERE template_key='system_alert' AND language='en'").run();
  assert.equal((await sendAlert(alertEnv,{...alert,id:"another-alert"})).reason,"template_disabled","A disabled English row also suppresses Hebrew alerts");
  await request("/api/admin/email-templates/system_alert/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:true}});
  const platformMailSource=await readFile("worker/platform-completion.js","utf8");
  let securityMailCalls=0;
  const securityMail=vm.runInNewContext(platformMailSource.slice(platformMailSource.indexOf("async function sendSecurityEmail"),platformMailSource.indexOf("function operationalEnglish"))+";sendSecurityEmail",{qfirst:async(env,sql,args)=>{try{return await env.DB.prepare(sql).bind(...args).first()}catch{return null}},sendEmail:async()=>{securityMailCalls++}});
  await request("/api/admin/email-templates/new_device/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:false}});
  await securityMail({DB:db},(await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first()).id,"כניסה ממכשיר חדש","test");assert.equal(securityMailCalls,0,"Disabled new-device mail must not reach provider");
  await request("/api/admin/email-templates/new_device/enabled",{method:"PATCH",cookie:adminCookie,body:{enabled:true}});
  await securityMail({DB:db},(await db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").first()).id,"כניסה ממכשיר חדש","test");assert.equal(securityMailCalls,1,"Enabled new-device mail reaches provider");
  await securityMail({DB:{prepare:sql=>sql.includes('MIN(enabled)')?{first:async()=>{throw Error('database unavailable')}}:{bind:()=>({first:async()=>({email:'test@example.org',full_name:'Test',preferred_language:'he'})})}}},"test-user","test","test");assert.equal(securityMailCalls,1,"Unreadable email controls must suppress delivery");
  const mailSource=await readFile("worker/index.js","utf8");
  const managedMail=vm.runInNewContext(mailSource.slice(mailSource.indexOf("async function managedEmailTemplate"),mailSource.indexOf("async function sendVerificationEmail"))+";managedEmailTemplate");
  for(const key of ["verification","password_reset","manager_invite","notification","daily_digest","new_device","pickup_confirmed","loan_cancelled","extension","waitlist","support","system_alert"]){for(const language of ["he","en"]){for(const failure of ["disabled","missing","database_error"]){const gateDB={prepare:()=>({bind:()=>({first:async()=>{if(failure==="database_error")throw Error("unavailable");return failure==="missing"?null:{enabled:0}}})})};assert.equal(await managedMail({DB:gateDB},key,language,{subject:"test",text:"test"}),null,key+" "+language+" must suppress "+failure);}}}
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

  await db.prepare("INSERT OR REPLACE INTO notification_preferences(user_id,notification_type,email) SELECT id,'loan_status',1 FROM users WHERE email='english@example.org'").run();
  const exportResult=await request("/api/me/export",{cookie:englishCookie});
  assert.equal(exportResult.response.status,200,JSON.stringify(exportResult.data));
  for(const key of ["recentOrganizations","securityEvents","notificationPreferences","savedEntities","dataRequests"]){assert.ok(Array.isArray(exportResult.data[key]),key+" must export an array even with no data");}
  assert.deepEqual(exportResult.data.recentOrganizations,[]);
  assert.deepEqual(exportResult.data.savedEntities,[]);
  assert.deepEqual(exportResult.data.dataRequests,[]);
  assert.ok(exportResult.data.notificationPreferences.length>0,"Existing preferences must be exported rather than hidden by a query error");
  result = await request("/api/me/favorites-overview");
  assert.equal(result.response.status, 401, "Favorites require authentication");
  result = await request("/api/me/saved-categories/tools", { method: "PUT", cookie: firstCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  result = await request("/api/me/saved-searches", { method: "POST", cookie: firstCookie, body: { name: "כלים קרובים", filters: { q: "מקדחה", city: "ירושלים", condition: "טוב", availableOnly: true }, notify: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const overviewSavedSearchId = result.data.search.id;
  result = await request("/api/me/favorites-overview", { cookie: firstCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.ok(result.data.saved.some(entry => entry.type === "category" && entry.id === "tools"));
  assert.ok(result.data.saved.some(entry => entry.type === "search" && entry.id === overviewSavedSearchId));
  result = await request("/api/me/favorites-overview", { cookie: adminCookie });
  assert.equal(result.data.saved.length, 0, "Favorites must be isolated per user");
  result = await request("/api/me/favorites-overview/category/tools", { method: "DELETE", cookie: firstCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  result = await request("/api/me/saved-categories", { cookie: firstCookie });
  assert.ok(!result.data.categories.some(entry => entry.id === "tools"));
  result = await request("/api/help-requests", { method: "POST", cookie: firstCookie, body: { title: "מקדחה להשאלה", description: "צריכים מקדחה לעבודות בית קטנות", category: "כלי עבודה", city: "ירושלים" } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const boardRequestId=result.data.request.id;
  result = await request("/api/help-requests?city="+encodeURIComponent("ירושלים")+"&page=1");
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.page, 1);
  assert.ok(result.data.total >= 1);
  assert.ok(result.data.requests.some(entry=>entry.id===boardRequestId));
  result = await request("/api/help-requests?city="+encodeURIComponent("תל אביב")+"&page=1");
  assert.ok(!result.data.requests.some(entry=>entry.id===boardRequestId));
  result = await request("/api/me/saved-entities", { method: "POST", cookie: adminCookie, body: { type: "help_request", id: boardRequestId } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  result = await request("/api/me/favorites-overview", { cookie: adminCookie });
  assert.ok(result.data.saved.some(entry=>entry.type==="help_request"&&entry.id===boardRequestId&&entry.label==="מקדחה להשאלה"));

  result = await request("/api/support", { method: "POST", cookie: firstCookie, body: { name: "משתמש ראשון", email: "first@example.org", subject: "בדיקת שיחת תמיכה", message: "הודעת פתיחה לפנייה של המשתמש הראשון." } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const ticketId = result.data.id;
  result = await request(`/api/me/support-tickets/${ticketId}/messages`, { cookie: adminCookie });
  assert.equal(result.response.status, 404, "Another account must not read a support conversation");
  result = await request(`/api/me/support-tickets/${ticketId}/messages`, { cookie: firstCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.messages.length, 1);
  assert.equal(result.data.messages[0].body, "הודעת פתיחה לפנייה של המשתמש הראשון.");
  result = await request(`/api/me/support-tickets/${ticketId}/messages`, { method: "POST", cookie: firstCookie, body: { message: "הודעת המשך של המשתמש הראשון." } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  result = await request(`/api/me/support-tickets/${ticketId}/messages`, { cookie: firstCookie });
  assert.equal(result.data.messages.length, 2);
  result = await request(`/api/me/support-tickets/${ticketId}/status`, { method: "PATCH", cookie: firstCookie, body: { status: "closed" } });
  assert.equal(result.data.status, "closed");
  result = await request(`/api/me/support-tickets/${ticketId}/status`, { method: "PATCH", cookie: firstCookie, body: { status: "open" } });
  assert.equal(result.data.status, "reopened");
  await db.prepare("DELETE FROM support_ticket_messages WHERE ticket_id=?").bind(ticketId).run();
  result = await request(`/api/me/support-tickets/${ticketId}/messages`, { cookie: firstCookie });
  assert.equal(result.data.messages[0].body, "הודעת פתיחה לפנייה של המשתמש הראשון.", "Legacy tickets retain their initial message");

  const geocodeKey = createHash("sha256").update("ירושלים").digest("base64url").slice(0, 40);
  await db.prepare("INSERT INTO geocode_cache(query_key,query_text,result_json,expires_at) VALUES(?,?,?,?)")
    .bind(geocodeKey, "ירושלים", JSON.stringify([{ displayName: "ירושלים", lat: 31.77, lon: 35.21 }]), new Date(Date.now() + 60000).toISOString()).run();
  result = await request("/api/maps/geocode?q=" + encodeURIComponent("ירושלים"));
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.cached, true);
  await db.prepare("UPDATE geocode_throttle SET last_request_at=? WHERE id=1").bind(new Date().toISOString()).run();
  result = await request("/api/maps/geocode?q=" + encodeURIComponent("תל אביב"));
  assert.equal(result.response.status, 429, JSON.stringify(result.data));

  const backupId = crypto.randomUUID();
  const backupKey = `_system-backups/daily/test-${backupId}.json`;
  const backupText = JSON.stringify({ version: 2, tables: { users: [{ id: "example" }] }, r2Manifest: [] });
  const backupChecksum = createHash("sha256").update(backupText).digest("base64url");
  const images = await mf.getR2Bucket("BACKUP_STORAGE");
  await images.put(backupKey, backupText);
  await db.prepare("INSERT INTO backup_runs(id,status,backup_type,started_at,manifest_json) VALUES(?,'completed','scheduled',?,?)")
    .bind(backupId, new Date().toISOString(), JSON.stringify({ storageKey: backupKey, checksum: backupChecksum, tables: ["users"] })).run();
  result = await request(`/api/admin/backups/${backupId}/validate`, { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.validation.rowCount, 1);
  await images.put(backupKey, backupText + "corruption");
  result = await request(`/api/admin/backups/${backupId}/validate`, { method: "POST", cookie: adminCookie, body: {} });
  assert.notEqual(result.response.status, 200, "Corrupt backups must fail validation");
  // Archive metadata drives health even when legacy internal backups have failed.
  const fullStorage=await mf.getR2Bucket("BACKUP_STORAGE");
  const fullKey="backups/gmach-full-20261008T062808Z.zip",previousKey="backups/gmach-full-20261007T003000Z.zip",fullBytes="archive fixture";
  const fullChecksum=createHash("sha256").update(fullBytes).digest("hex");
  const pointer={key:fullKey,sha256:fullChecksum,size:fullBytes.length,updated_at:new Date().toISOString()};
  await fullStorage.put(fullKey,fullBytes);await fullStorage.put(previousKey,fullBytes);
  await fullStorage.put("CURRENT.json",JSON.stringify(pointer));
  await fullStorage.put("PREVIOUS.json",JSON.stringify({...pointer,key:previousKey}));
  await fullStorage.put("STATUS.json",JSON.stringify({status:"success",last_success_at:pointer.updated_at}));
  await fullStorage.put("VERIFY.json",JSON.stringify({status:"success",key:fullKey,sha256:fullChecksum,verified_at:pointer.updated_at}));
  for(const type of ["backup_failed","backup_stale","backup_restore_failed"]){await db.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,'critical','{}')").bind(crypto.randomUUID(),type).run()}
  result=await request("/api/admin/operations/health",{cookie:adminCookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.latestBackup.source,"github-archive");assert.equal(result.data.latestBackup.status,"completed");assert.equal(result.data.latestRestoreDrill.status,"success");assert.ok(!result.data.warnings.includes("backup"));assert.ok(!result.data.alerts.some(a=>["backup_failed","backup_stale","backup_restore_failed"].includes(a.alert_type)));
  // Validation responses and browser incidents must not become critical server alerts.
  const expectedIncidentIds=[];
  for(let i=0;i<6;i++)for(const [method,message,age] of [["PATCH","נדרש קוד אישור נוסף לפעולה רגישה",0],["CLIENT","Failed to fetch",0],["GET","Old server failure",90*60000]]){
    const id=crypto.randomUUID();expectedIncidentIds.push(id);
    await db.prepare("INSERT INTO server_errors(id,request_id,path,method,message,created_at) VALUES(?,?,?,?,?,?)").bind(id,id,"/test/health",method,message,new Date(Date.now()-age).toISOString()).run();
  }
  await refreshServerErrorAlert({DB:db});
  assert.equal(await db.prepare("SELECT id FROM system_alerts WHERE alert_type='server_error_spike' AND resolved_at IS NULL").first(),null,"Only real server failures within one hour should trigger a spike");
  for(let i=0;i<5;i++){
    const id=crypto.randomUUID();expectedIncidentIds.push(id);
    await db.prepare("INSERT INTO server_errors(id,request_id,path,method,message,created_at) VALUES(?,?,?,?,?,?)").bind(id,id,"/test/health","GET","Actual server failure",new Date().toISOString()).run();
  }
  await refreshServerErrorAlert({DB:db});
  const spike=await db.prepare("SELECT id FROM system_alerts WHERE alert_type='server_error_spike' AND resolved_at IS NULL").first();assert.ok(spike,"Actual failures must still alert the admin");
  const resolvePath="/api/admin/operations/alerts/"+spike.id+"/resolve";
  result=await request(resolvePath,{method:"PATCH",body:{}});assert.equal(result.response.status,401,"Anonymous users cannot resolve alerts");
  result=await request(resolvePath,{method:"PATCH",cookie:adminCookie,body:{}});assert.equal(result.response.status,200,"Logged-in admin can resolve an alert without another confirmation code");
  assert.ok((await db.prepare("SELECT resolved_at FROM system_alerts WHERE id=?").bind(spike.id).first()).resolved_at);
  for(const id of expectedIncidentIds)await db.prepare("DELETE FROM server_errors WHERE id=?").bind(id).run();
  const incidentCountBefore=(await db.prepare("SELECT COUNT(*) AS n FROM server_errors").first()).n;
  const guarded=await mf.dispatchFetch(base+"/api/admin/users/"+crypto.randomUUID(),{method:"PATCH",headers:{Cookie:adminCookie,Origin:base,"Content-Type":"application/json"},body:"{}"});
  assert.equal(guarded.status,428,"Other sensitive admin actions still require confirmation and return a usable status");
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM server_errors").first()).n,incidentCountBefore,"Confirmation requirements are not server incidents");
  // Health and readiness must use the same effective key as private data encryption.
  for(const [keyEnv,expected] of [[{RESEND_API_KEY:"fallback-private-data-key-long-enough"},true],[{},false],[{DATA_ENCRYPTION_KEY:"short",RESEND_API_KEY:"fallback-private-data-key-long-enough"},false]]){
    const env={DB:db,BACKUP_STORAGE:fullStorage,...keyEnv};
    for(const [path,handler,field] of [["/api/admin/operations/health",handleLaunchReadiness,"services"],["/api/admin/release-readiness",handleDistributionCompletion,"checks"]]){
      const req=new Request(base+path,{headers:{Cookie:adminCookie}});
      const response=await handler(req,env,{},new URL(req.url));
      assert.equal(response.status,200);const health=await response.json();
      assert.equal(health[field].encryption,expected,"Encryption readiness must match the key used by encryption");
      if(expected)assert.ok(!(health.warnings||health.blockers||[]).includes("encryption"));
    }
  }
  result=await request("/api/admin/backups/archive-status",{cookie:adminCookie});assert.equal(result.response.status,200);assert.equal(result.data.current.key,fullKey);assert.equal(result.data.previous.key,previousKey);
  for(const slot of ["current","previous"]){result=await request("/api/admin/backups/archive/"+slot,{cookie:adminCookie});assert.equal(result.response.status,200);assert.equal(result.response.headers.get("Content-Type"),"application/zip");assert.equal(result.data,fullBytes)}
  result=await request("/api/admin/backups/archive/current");assert.ok([401,403].includes(result.response.status),"Full archives must remain private");
  const beforeInternalBackup=await db.prepare("SELECT COUNT(*) AS n FROM backup_runs").first();
  for(const path of ["/api/admin/backups","/api/admin/backups/full"]){
    result = await request(path, { method: "POST", cookie: adminCookie, body: {} });
    assert.equal(result.response.status,410,"Internal backup creation must be disabled");
  }
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM backup_runs").first()).n,beforeInternalBackup.n,"Disabled routes must not create backup records");

  result = await request("/api/admin/site-settings", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.settings.site_name, "גמ״ח ברגע");
  assert.equal(result.data.settings.hero_title, "מה תרצו לשאול היום?");
  result = await request("/api/admin/site-settings", { method: "PATCH", cookie: adminCookie, body: { siteName: "גמ״ח ברגע", tagline: "גדולה גמילות חסדים יותר מן הצדקה", heroTitle: "מה צריך להשאיל היום?", heroDescription: "מוצאים ציוד זמין מגמחים ואנשים טובים באזור שלכם ללא תשלום.", primaryColor: "#243f75", secondaryColor: "#9d7137", accentColor: "#e7bd78", fontFamily: "Arial, sans-serif", baseFontSize: 16, logoUrl: "/gmach-berega-logo.jpg" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/admin/users", { cookie: adminCookie });
  assert.equal(result.data.users.some(user => user.email === "admin@example.org"), true);
  result = await request("/api/admin/page-customizations", { method: "PUT", cookie: adminCookie, body: { key: "#hero-title", text: "מה תרצו להשאיל?", styles: { fontSize: "64px", color: "#243f75", position: "fixed" }, attributes: { hidden: false } } });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.customization.styles.position, undefined);
  result = await request("/api/page-customizations");
  assert.equal(result.data.customizations[0].key, "#hero-title");
  result = await request("/api/admin/content", { cookie: adminCookie });
  assert.equal(Array.isArray(result.data.visualVersions), true);
  result = await request("/api/auth/me", { cookie: adminCookie });
  assert.equal(result.data.user.twoFactorEnabled, true);

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, body: { name: "גמ״ח בדיקה", primaryCategory: "אירועים", city: "ירושלים", neighborhood: "מרכז", address: "רחוב הבדיקה 1, ירושלים", serviceArea: "ירושלים והסביבה", hours: { "ראשון": "09:00–17:00", "שני": "09:00–17:00" }, description: "ציוד חינמי לאירועים קהילתיים ולשמחות משפחתיות.", phone: "050-1234567" } });
  assert.equal(result.response.status, 201);
  const organizationId = result.data.organization.id;
  const organizationFixture={name:'בדיקת קטגוריות משנה',primaryCategory:'אירועים',city:'ירושלים',neighborhood:'מרכז',address:'רחוב הבדיקה 1, ירושלים',serviceArea:'ירושלים והסביבה',hours:{ראשון:'09:00–17:00'},description:'ציוד לאירועים קהילתיים ולשמחות משפחתיות.',phone:'050-1234567'};
  const eventChildren=(await db.prepare("SELECT c.id FROM categories c JOIN categories p ON p.id=c.parent_id WHERE p.name_he='אירועים' AND c.status='active' ORDER BY c.id LIMIT 2").all()).results.map(row=>row.id);
  assert.equal(eventChildren.length,2);
  for(const subcategories of [undefined,[],['unknown'],['__all__',eventChildren[0]]])assert.equal((await request('/api/organizations',{method:'POST',cookie:adminCookie,body:{...organizationFixture,subcategories}})).response.status,400,'Missing or invalid subcategory selection is rejected');
  let subResult=await request('/api/organizations',{method:'POST',cookie:adminCookie,body:{...organizationFixture,subcategories:eventChildren}});assert.equal(subResult.response.status,201,JSON.stringify(subResult.data));
  const subOrgId=subResult.data.organization.id;
  assert.deepEqual((await request(`/api/organizations/${subOrgId}/subcategories`,{cookie:adminCookie})).data.subcategories,eventChildren);
  assert.equal((await request(`/api/organizations/${subOrgId}/subcategories`)).response.status,401,'Settings require sign-in');
  const otherCategory=(await db.prepare("SELECT c.id FROM categories c JOIN categories p ON p.id=c.parent_id WHERE p.name_he!='אירועים' AND c.status='active' LIMIT 1").first()).id;
  assert.equal((await request(`/api/organizations/${subOrgId}`,{method:'PATCH',cookie:adminCookie,body:{...organizationFixture,subcategories:[otherCategory]}})).response.status,400,'Subcategory must belong to the chosen parent');
  assert.deepEqual((await request(`/api/organizations/${subOrgId}/subcategories`,{cookie:adminCookie})).data.subcategories,eventChildren,'Rejected edits do not overwrite selections');
  assert.equal((await request(`/api/organizations/${subOrgId}`,{method:'PATCH',cookie:adminCookie,body:{...organizationFixture,subcategories:['__all__']}})).response.status,200);
  assert.deepEqual((await request(`/api/organizations/${subOrgId}/subcategories`,{cookie:adminCookie})).data.subcategories,['__all__']);
  await db.prepare('DELETE FROM organizations WHERE id=?').bind(subOrgId).run();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM organization_subcategory_preferences WHERE organization_id=?').bind(subOrgId).first()).n,0,'Preference rows are deleted with the organization');

  const unconfirmed=await mf.dispatchFetch(base+`/api/admin/organizations/${organizationId}`,{method:'PATCH',headers:{Cookie:adminCookie,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({name:'ללא אישור'})});
  assert.equal(unconfirmed.status,428,'Gmach changes expose a usable confirmation response instead of a server error');
  const tokenCounter=Buffer.alloc(8);tokenCounter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const tokenDigest=createHmac('sha1',Buffer.from(bytes)).update(tokenCounter).digest(),tokenOffset=tokenDigest.at(-1)&15;
  const tokenCode=String((tokenDigest.readUInt32BE(tokenOffset)&0x7fffffff)%1000000).padStart(6,'0');
  const mailBeforeChallenge=sentEmails.length;
  const confirmGmach=await request('/api/admin/action-challenges',{method:'POST',cookie:adminCookie,body:{action:`PATCH /api/admin/organizations/${organizationId}`,authenticatorCode:tokenCode}});
  assert.equal(confirmGmach.response.status,200,JSON.stringify(confirmGmach.data));assert.ok(confirmGmach.data.challenge.code);assert.equal(sentEmails.length,mailBeforeChallenge,'Gmach confirmation works without disabled email');
  assert.equal((await request('/api/admin/entities/users/'+analyticsUser.id,{method:'PATCH',cookie:adminCookie,body:{role:'admin'}})).response.status,403);
  assert.equal((await db.prepare('SELECT role FROM users WHERE id=?').bind(analyticsUser.id).first()).role,'member');
  const initialGmachCode=result.data.organization.gmachCode;
  assert.ok(initialGmachCode>=150,"A new gmach receives a number immediately, before its first item");
  assert.equal((await db.prepare("SELECT code FROM organization_serial_codes WHERE organization_id=?").bind(organizationId).first()).code,initialGmachCode);
  assert.equal((await request(`/api/admin/organizations/${organizationId}`)).response.status,401);
  assert.equal((await request(`/api/admin/organizations/${organizationId}`,{cookie:englishCookie})).response.status,403);
  result=await request(`/api/admin/organizations/${organizationId}`,{cookie:adminCookie});
  assert.equal(result.data.organization.gmach_code,initialGmachCode);
  assert.equal(result.data.organization.contact_phone,"050-1234567");
  result=await request(`/api/admin/organizations/${organizationId}`,{method:"PATCH",cookie:adminCookie,body:{status:"pending",isHidden:false,temporarilyClosed:true,reopensAt:"2026-10-06T09:00:00Z",name:"גמ״ח מעודכן",phone:"052-1234567",ownerEmail:"admin@example.org"}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  const contentGmach=(await request('/api/admin/content',{cookie:adminCookie})).data.organizations.find(o=>o.id===organizationId);
  const entityGmach=(await request('/api/admin/entities?type=organizations',{cookie:adminCookie})).data.entities.find(o=>o.id===organizationId);
  assert.deepEqual(entityGmach,contentGmach,"Every admin list shares the same complete organization data and state");
  assert.deepEqual([contentGmach.status,contentGmach.is_hidden,contentGmach.temporarily_closed,contentGmach.contact_phone],["pending",0,1,"052-1234567"]);
  assert.equal((await request(`/api/admin/organizations/${organizationId}`,{method:"PATCH",cookie:adminCookie,body:{reopensAt:"bad-date"}})).response.status,400);
  result=await request(`/api/admin/organizations/${organizationId}`,{method:"PATCH",cookie:adminCookie,body:{status:"approved",isHidden:true,temporarilyClosed:false,reopensAt:null,phone:"050-1234567"}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));


  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "ערכת קישוטים לבדיקה", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.", loanConditions: "איסוף עצמי", depositRequired: true, depositAmount: "100", freeConfirmed: true } });
  assert.equal(result.response.status, 201);
  const itemId = result.data.item.id;
  const costBody={title:"ערכת קישוטים לבדיקה",category:"אירועים",condition:"מצוין",quantity:1,description:"ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.",loanConditions:"איסוף עצמי",nominalPolicyConfirmed:true,paymentMode:"nominal",costExplanation:"תשלום סמלי לכיסוי ניקוי בלבד",depositRequired:true,depositAmount:"100"};
  result=await request(`/api/items/${itemId}`,{method:"PATCH",cookie:adminCookie,body:costBody});assert.equal(result.response.status,200,JSON.stringify(result.data));
  const nominalItem=(await request(`/api/items/${itemId}`)).data.item;
  assert.equal(nominalItem.paymentMode,"nominal");assert.equal(nominalItem.costExplanation,costBody.costExplanation);
  assert.equal(nominalItem.depositRequired,true);assert.equal(nominalItem.depositAmountAgorot,10000,'Deposit remains separate from the nominal fee');
  assert.equal((await request('/api/items')).data.items.find(i=>i.id===itemId).paymentMode,'nominal');
  assert.equal((await request(`/api/organizations/${organizationId}/public`)).data.items.find(i=>i.id===itemId).paymentMode,'nominal');
  assert.equal((await request('/api/me/dashboard',{cookie:adminCookie})).data.items.find(i=>i.id===itemId).payment_mode,'nominal');
  result=await request(`/api/items/${itemId}`,{method:"PATCH",cookie:adminCookie,body:{...costBody,paymentMode:'commercial'}});assert.equal(result.response.status,400);
  result=await request(`/api/items/${itemId}`,{method:"PATCH",cookie:adminCookie,body:{...costBody,costExplanation:'x'.repeat(501)}});assert.equal(result.response.status,400);
  result=await request(`/api/items/${itemId}`,{method:"PATCH",cookie:adminCookie,body:{...costBody,costExplanation:''}});assert.equal(result.response.status,200,'Explanation is optional');
  result=await request(`/api/items/${itemId}`,{method:"PATCH",cookie:adminCookie,body:{...costBody,paymentMode:'free'}});assert.equal(result.response.status,200);
  const freeAgain=(await request(`/api/items/${itemId}`)).data.item;assert.equal(freeAgain.paymentMode,'free');assert.equal(freeAgain.costExplanation,'','Switching to no charge clears a stale fee explanation');
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM item_loan_costs WHERE item_id=?').bind(itemId).first()).n,0);


  result = await request(`/api/items/${itemId}/units`, { cookie: adminCookie });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.units.length,1,"A quantity-1 item must receive exactly one automatic serial number");
  assert.ok(String(result.data.units[0].serial_number||"").length>4,"Automatic serial number missing");
  assert.ok(Number(String(result.data.units[0].serial_number||"").split("-")[1])>=150,"Gmach serial code must start at 150 or above");

  result = await request(`/api/organizations/${organizationId}/branches`, { method:"POST", cookie:adminCookie, body:{ name:"סניף מרכזי",address:"רחוב הבדיקה 1",city:"ירושלים",phone:"050-1234567",inventoryMode:"separate",hours:{sun:"09:00-17:00"} } });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  const branchId=result.data.branch.id;
  result = await request(`/api/branches/${branchId}`, { method:"PATCH",cookie:adminCookie,body:{name:"סניף מרכזי מעודכן",address:"רחוב הבדיקה 2",city:"ירושלים",phone:"050-1234567",inventoryMode:"hybrid"} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request(`/api/organizations/${organizationId}/branches`, { cookie:adminCookie });
  let smokeBranch=result.data.branches.find(b=>b.id===branchId);
  assert.equal(smokeBranch.name,"סניף מרכזי מעודכן");
  assert.equal(smokeBranch.inventory_mode,"hybrid");
  const reopenAt=new Date(Date.now()+3600000).toISOString();
  result = await request(`/api/branches/${branchId}`, { method:"PATCH",cookie:adminCookie,body:{status:"temporarily_closed",reopensAt:reopenAt} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request(`/api/organizations/${organizationId}/branches`, { cookie:adminCookie });
  smokeBranch=result.data.branches.find(b=>b.id===branchId);
  assert.equal(smokeBranch.status,"temporarily_closed");
  result = await request(`/api/branches/${branchId}`, { method:"PATCH",cookie:adminCookie,body:{status:"active",reopensAt:null} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request(`/api/organizations/${organizationId}/branches`, { cookie:adminCookie });
  smokeBranch=result.data.branches.find(b=>b.id===branchId);
  assert.equal(smokeBranch.status,"active");
  result = await request(`/api/branches/${branchId}/inventory-workspace`, { cookie:adminCookie });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.branch.id,branchId);
  result = await request(`/api/branches/${branchId}/inventory-workspace`, { method:"PUT",cookie:adminCookie,body:{policies:[{itemId,mode:"separate",quantityOverride:2}]} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.policies.some(p=>p.item_id===itemId&&p.mode==="separate"&&Number(p.quantity_override)===2),true);
  result = await request(`/api/items/${itemId}/units`, { method:"POST",cookie:adminCookie,body:{count:1,condition:"חדש",branchId} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  assert.equal(result.data.quantity,2,"adding one serialized unit must also increase item quantity");
  assert.equal(result.data.units.length,1,"adding one serialized unit must create exactly one new unit");
  assert.match(String(result.data.units[0].serialNumber||""),/^GB-\d+-\d+-2$/,"new unit serial must continue the item sequence");
  result = await request(`/api/items/${itemId}/units`, { cookie: adminCookie });
  assert.equal(result.data.units.find(u=>u.id===result.data.units[1]?.id)?.branch_id||result.data.units[1]?.branch_id,branchId,"new serialized unit must be assigned to the selected branch");

  const form = new WorkerFormData();
  form.append("images", new Blob([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82])], { type: "image/png" }), "sample.png");
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
  // Direct items expose only selected contact fields even when showPublic is false.
  const savedContacts=(await request(`/api/organizations/${organizationId}/contact-settings`,{cookie:adminCookie})).data.contactSettings;
  assert.equal((await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:false,channels:['phone'],preferred:'phone'}}})).response.status,200);
  const directBody={organizationId,title:'פריט לתיאום ישיר',category:'אירועים',condition:'מצב טוב',description:'פריט לתיאום ישיר ללא ניהול מלאי ובקשות באתר.',managementMode:'direct',freeConfirmed:true};
  result=await request('/api/items',{method:'POST',cookie:adminCookie,body:directBody});assert.equal(result.response.status,201,JSON.stringify(result.data));
  const directId=result.data.item.id;
  const directDetail=(await request(`/api/items/${directId}`)).data.item;
  assert.equal(directDetail.managementMode,'direct');assert.equal(directDetail.contact.visible,true);assert.ok(directDetail.contact.phone);assert.equal(directDetail.contact.address,undefined);assert.equal(directDetail.contact.email,undefined);assert.deepEqual(directDetail.contact.channels,['phone']);
  assert.equal((await request(`/api/organizations/${organizationId}/public`)).data.organization.contact.visible,true,'Direct item contacts are public on the organization page too');
  assert.equal((await request(`/api/items/${itemId}`)).data.item.managementMode,'managed');
  assert.equal((await request(`/api/items/${itemId}`)).data.item.contact,undefined);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM item_units WHERE item_id=?').bind(directId).first()).n,0,'Direct item creates no stock units');
  for(const path of [`/api/items/${directId}/inventory`,`/api/items/${directId}/units`,`/api/items/${directId}/availability-check`,`/api/items/${directId}/availability-calendar`])assert.equal((await request(path,{cookie:adminCookie})).response.status,409,path);
  for(const path of ['/api/loan-requests',`/api/items/${directId}/multi-range-request`,`/api/items/${directId}/waitlist`])assert.equal((await request(path,{method:'POST',cookie:borrowerCookie,body:{itemId:directId}})).response.status,409,path);
  assert.equal((await request(`/api/items/${directId}`,{method:'PATCH',cookie:adminCookie,body:{...directBody,managementMode:'invalid'}})).response.status,400);
  assert.equal((await request(`/api/items/${directId}`,{method:'PATCH',cookie:adminCookie,body:{...directBody,managementMode:'managed',quantity:2}})).response.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM item_units WHERE item_id=?').bind(directId).first()).n,2,'Switch to managed creates stock');
  assert.equal((await request(`/api/organizations/${organizationId}/public`)).data.organization.contact.visible,false,'Managed-only organization retains contact privacy');
  await db.prepare('DELETE FROM items WHERE id=?').bind(directId).run();
  await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:savedContacts}});

  result = await request("/api/me/profile", { method:"PATCH", cookie:borrowerCookie, body:{fullName:"שואלת ציוד",phone:"052-7654321",city:"ירושלים",preferredLanguage:"en",operationalEmails:true} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request(`/api/organizations/${organizationId}/invitations`,{method:"POST",cookie:adminCookie,body:{email:"borrower@example.com",role:"reports"}});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  assert.equal(sentEmails.at(-1).subject.startsWith("Invitation to manage"),true,"English members receive an English manager invitation");
  assert.ok(sentEmails.at(-1).html.includes('dir="ltr"'));
  result = await request(`/api/organizations/${organizationId}/invitations`,{method:"POST",cookie:adminCookie,body:{email:"new-manager@example.com",role:"reports"}});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  assert.ok(sentEmails.at(-1).text.includes("הוזמנת")&&sentEmails.at(-1).text.includes("You were invited"),"Invites to unregistered recipients include both languages");

  result = await request("/api/me/profile", { cookie:borrowerCookie });
  assert.equal(result.data.profile.city,"ירושלים");
  result = await request("/api/me/notification-preferences", { method:"PUT",cookie:borrowerCookie,body:{preferences:[{type:"loan_status",inApp:true,email:true,push:false,digest:"immediate"}]} });
  assert.equal(result.response.status,200);
  result = await request("/api/me/saved-searches", { method:"POST",cookie:borrowerCookie,body:{name:"עגלות בירושלים",filters:{category:"תינוקות",city:"ירושלים"},notify:true} });
  assert.equal(result.response.status,201);

  result = await request(`/api/favorites/${itemId}`, { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  // Service range enforcement must survive a direct API request and forged coordinates.
  const rangePolicy=await request(`/api/organizations/${organizationId}/service-range`,{cookie:adminCookie});
  assert.equal(rangePolicy.data.serviceRange.radiusKm,null);
  assert.equal((await request(`/api/organizations/${organizationId}/service-range`,{cookie:borrowerCookie})).response.status,404);
  assert.equal((await request(`/api/organizations/${organizationId}/service-eligibility`)).response.status,401);
  await db.prepare("INSERT OR REPLACE INTO organization_service_ranges(organization_id,radius_km,allow_exception) VALUES(?,5,0)").bind(organizationId).run();
  const rangeBorrower=await db.prepare('SELECT id,address_cipher FROM users WHERE email=?').bind('borrower@example.com').first();
  await db.prepare('UPDATE users SET address_cipher=NULL WHERE id=?').bind(rangeBorrower.id).run();
  assert.equal((await request(`/api/organizations/${organizationId}/service-eligibility`,{cookie:borrowerCookie})).response.status,400,'Missing address must not bypass service range');
  await db.prepare('UPDATE users SET address_cipher=? WHERE id=?').bind(rangeBorrower.address_cipher,rangeBorrower.id).run();
  const savedHome=await request('/api/me/addresses',{method:'POST',cookie:borrowerCookie,body:{label:'בית',city:'ירושלים',address:'רחוב הבדיקה 12',isDefault:true,latitude:0,longitude:0}});
  assert.equal(savedHome.response.status,201,JSON.stringify(savedHome.data));
  async function seedServiceLocation(address,city,latitude,longitude){const hash=createHash('sha256').update([address.trim(),city.trim()].filter(Boolean).join(', ').toLowerCase()).digest('hex');await db.prepare('INSERT OR REPLACE INTO service_location_cache(address_hash,latitude,longitude,expires_at) VALUES(?,?,?,?)').bind(hash,latitude,longitude,new Date(Date.now()+86400000).toISOString()).run();}
  const serviceOrg=await db.prepare('SELECT address,city FROM organizations WHERE id=?').bind(organizationId).first();
  await seedServiceLocation(serviceOrg.address,serviceOrg.city,31.78,35.22);
  await seedServiceLocation('רחוב הבדיקה 12','ירושלים',31.79,35.22);
  assert.equal((await request(`/api/organizations/${organizationId}/service-eligibility`,{cookie:borrowerCookie})).data.allowed,true);
  const notificationsBeforeChat=new Set((await db.prepare('SELECT id FROM notifications').all()).results.map(n=>n.id));
  // A gmach needs no inventory to appear; chat approval is independent of loans.
  const chatOrgResult=await request('/api/organizations',{method:'POST',cookie:adminCookie,body:{name:'גמ״ח בלי פריטים',primaryCategory:'אירועים',city:'ירושלים',address:serviceOrg.address,serviceArea:'ירושלים והסביבה',hours:{'ראשון':'09:00–17:00'},description:'גמ״ח שמסייע לפי הצורך ללא רשימת פריטים.',phone:'050-1234567',serviceRadiusKm:5,allowDistanceException:false}});
  assert.equal(chatOrgResult.response.status,201,JSON.stringify(chatOrgResult.data));
  const chatOrgId=chatOrgResult.data.organization.id;
  assert.ok((await request('/api/discovery')).data.organizations.some(o=>o.id===chatOrgId&&o.item_count===0));
  const chatPublic=(await request(`/api/organizations/${chatOrgId}/public`)).data;
  assert.equal(chatPublic.items.length,0);assert.equal(chatPublic.organization.address,undefined);assert.equal(chatPublic.organization.contact_phone,undefined);
  assert.ok(!(await request('/api/maps/gmachs')).data.locations.some(o=>o.id===chatOrgId),'Private no-item gmachs must not expose an exact map address');
  const fullContacts={showPublic:true,channels:['phone','sms','whatsapp','email','address','chat'],preferred:'whatsapp',email:'contact@example.org',hours:{3:['18:00','20:00']},notes:'נא לפנות בווטסאפ, או להתקשר בשעות הערב.'};
  assert.equal((await request(`/api/organizations/${chatOrgId}/contact-settings`,{cookie:borrowerCookie})).response.status,404);
  assert.equal((await request(`/api/organizations/${chatOrgId}/contact-settings`)).response.status,401);
  assert.equal((await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:'true'}}})).response.status,400);
  result=await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:fullContacts}});assert.equal(result.response.status,200,JSON.stringify(result.data));
  const publishedContacts=(await request(`/api/organizations/${chatOrgId}/public`)).data.organization.contact;
  assert.equal(publishedContacts.phone,'050-1234567');assert.equal(publishedContacts.address,serviceOrg.address);assert.equal(publishedContacts.email,'contact@example.org');assert.equal(publishedContacts.preferred,'whatsapp');assert.deepEqual(publishedContacts.hours,fullContacts.hours);
  assert.equal((await request('/api/maps/gmachs')).data.locations.find(o=>o.id===chatOrgId)?.navigation_address,serviceOrg.address,'Selected public navigation exposes the full address for mapping');
  await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{channels:['phone','chat'],preferred:'phone'}}});
  assert.ok(!(await request('/api/maps/gmachs')).data.locations.some(o=>o.id===chatOrgId),'Unselected navigation must not expose an exact map address');
  assert.equal((await request(`/api/organizations/${chatOrgId}/public`)).data.organization.contact.address,undefined);
  await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:fullContacts}});
  result=await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:false}}});assert.equal(result.response.status,200);
  const privateContact=(await request(`/api/organizations/${chatOrgId}/contact`)).data.contact;
  assert.equal(privateContact.visible,false);assert.equal(privateContact.phone,undefined);assert.equal(privateContact.email,undefined);assert.equal(privateContact.address,undefined);assert.equal(privateContact.notes,fullContacts.notes);

  await seedServiceLocation('רחוב הבדיקה 12','ירושלים',31.9,35.22);
  assert.equal((await request(`/api/organizations/${chatOrgId}/chat-requests`,{method:'POST',cookie:borrowerCookie,body:{note:'מחפשת ציוד',distanceException:true,latitude:31.78,longitude:35.22}})).response.status,403);
  await db.prepare('UPDATE organization_service_ranges SET allow_exception=1 WHERE organization_id=?').bind(chatOrgId).run();
  assert.equal((await request(`/api/organizations/${chatOrgId}/chat-requests`,{method:'POST',cookie:borrowerCookie,body:{note:'מחפשת ציוד'}})).response.status,403);
  result=await request(`/api/organizations/${chatOrgId}/chat-requests`,{method:'POST',cookie:borrowerCookie,body:{note:'מחפשת ציוד',distanceException:true}});
  assert.equal(result.response.status,201,JSON.stringify(result.data));const chatId=result.data.chatRequest.id;
  assert.equal(result.data.chatRequest.status,'pending');
  assert.equal((await request(`/api/organizations/${chatOrgId}/chat-requests`,{method:'POST',cookie:borrowerCookie,body:{note:'בקשה נוספת',distanceException:true}})).data.chatRequest.id,chatId,'Repeated requests reuse the active request');
  assert.equal((await request(`/api/loan-requests/${chatId}/messages`,{cookie:borrowerCookie})).response.status,403);
  assert.equal((await request(`/api/loan-requests/${chatId}/messages`,{method:'POST',cookie:borrowerCookie,body:{message:'אין אישור עדיין'}})).response.status,403);
  const pendingChat=(await request('/api/me/dashboard',{cookie:borrowerCookie})).data.chatRequests.find(c=>c.id===chatId);
  assert.equal(pendingChat.address,null);assert.equal(pendingChat.phone,null);assert.equal(pendingChat.distance_exception,1);
  assert.equal((await request(`/api/organization-chat-requests/${chatId}/status`,{method:'PATCH',cookie:borrowerCookie,body:{status:'approved'}})).response.status,403);
  assert.equal((await request(`/api/organization-chat-requests/${chatId}/status`,{method:'PATCH',cookie:englishCookie,body:{status:'approved'}})).response.status,403);
  const loanCountBefore=(await db.prepare('SELECT COUNT(*) n FROM loan_requests').first()).n;
  result=await request(`/api/organization-chat-requests/${chatId}/status`,{method:'PATCH',cookie:adminCookie,body:{status:'approved'}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal((await request(`/api/loan-requests/${chatId}/messages`,{cookie:englishCookie})).response.status,403);
  result=await request(`/api/loan-requests/${chatId}/messages`,{cookie:borrowerCookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.pickup.address,serviceOrg.address);assert.equal(result.data.pickup.phone,'050-1234567');
  assert.equal(result.data.pickup.email,'contact@example.org');
  assert.equal((await request(`/api/organizations/${chatOrgId}/contact`,{cookie:borrowerCookie})).data.contact.approvedChatId,chatId);
  assert.equal((await request(`/api/organizations/${chatOrgId}/contact`,{cookie:englishCookie})).data.contact.visible,false);
  await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{channels:['email','chat'],preferred:'email'}}});
  const selectedOnly=(await request(`/api/loan-requests/${chatId}/messages`,{cookie:borrowerCookie})).data.pickup;
  assert.equal(selectedOnly.address,undefined);assert.equal(selectedOnly.phone,undefined);assert.equal(selectedOnly.email,'contact@example.org');
  const selectedDashboard=(await request('/api/me/dashboard',{cookie:borrowerCookie})).data.chatRequests.find(c=>c.id===chatId);assert.equal(selectedDashboard.address,null);assert.equal(selectedDashboard.phone,null);
  assert.equal((await request(`/api/loan-requests/${chatId}/pickup-details`,{cookie:borrowerCookie})).data.contact.email,'contact@example.org');
  await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:fullContacts}});

  result=await request(`/api/loan-requests/${chatId}/messages`,{method:'POST',cookie:borrowerCookie,body:{message:'שלום, אפשר לתאם?'}});
  assert.equal(result.response.status,201,JSON.stringify(result.data));const chatMessageId=result.data.message.id;
  result=await request(`/api/messages/${chatMessageId}`,{method:'PATCH',cookie:borrowerCookie,body:{message:'שלום, אשמח לתאם'}});assert.equal(result.response.status,200);
  assert.equal((await request(`/api/messages/${chatMessageId}`,{method:'DELETE',cookie:englishCookie})).response.status,403);
  assert.equal((await request(`/api/loan-requests/${chatId}/chat-rich`,{method:'POST',cookie:adminCookie,body:{type:'location',metadata:{lat:31.78,lon:35.22,label:'מיקום'}}})).response.status,201);
  result=await request(`/api/loan-requests/${chatId}/messages`,{cookie:adminCookie});assert.equal(result.data.messages.length,2);assert.equal(result.data.messages[0].body,'שלום, אשמח לתאם');
  const chatAudio=new WorkerFormData();chatAudio.append('file',new Blob([new Uint8Array([1,2,3])],{type:'audio/webm'}),'sample.webm');chatAudio.append('type','audio');
  result=await request(`/api/loan-requests/${chatId}/chat-attachment`,{method:'POST',cookie:borrowerCookie,form:chatAudio});assert.equal(result.response.status,201,JSON.stringify(result.data));
  const chatMedia=result.data.message.media_url;
  assert.equal((await request(chatMedia)).response.status,401);
  assert.equal((await request(chatMedia,{cookie:englishCookie})).response.status,403);
  assert.equal((await request(chatMedia,{cookie:adminCookie})).response.status,200);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM loan_requests').first()).n,loanCountBefore,'Chat must never create a fake loan');
  assert.equal((await request(`/api/messages/${chatMessageId}/report`,{method:'POST',cookie:adminCookie,body:{reason:'בדיקת דיווח'}})).response.status,200);
  assert.equal((await request(`/api/messages/${chatMessageId}`,{method:'DELETE',cookie:borrowerCookie})).response.status,200);
  assert.equal((await request(`/api/organizations/${organizationId}/chat-requests`,{method:'POST',cookie:borrowerCookie,body:{note:'גמ״ח עם פריטים'}})).response.status,409);
  await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:fullContacts}});
  assert.equal((await request(`/api/organizations/${organizationId}/public`)).data.organization.contact.email,'contact@example.org');
  assert.equal((await request(`/api/organizations/${organizationId}/contact`)).data.contact.phone,'050-1234567');
  await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:false,channels:['phone','address','chat'],preferred:'chat',email:'',hours:{},notes:''}}});

  await request(`/api/organizations/${chatOrgId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:false}}});
  result=await request(`/api/organization-chat-requests/${chatId}/status`,{method:'PATCH',cookie:borrowerCookie,body:{status:'cancelled'}});assert.equal(result.response.status,200);
  assert.equal((await request(`/api/loan-requests/${chatId}/messages`,{cookie:borrowerCookie})).response.status,403);
  assert.equal((await request('/api/me/dashboard',{cookie:borrowerCookie})).data.chatRequests.find(c=>c.id===chatId).address,null);
  for(const n of (await db.prepare('SELECT id FROM notifications').all()).results){if(!notificationsBeforeChat.has(n.id))await db.prepare('DELETE FROM notifications WHERE id=?').bind(n.id).run();}
  await db.prepare('DELETE FROM organizations WHERE id=?').bind(chatOrgId).run();
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM organization_chat_requests WHERE id=?').bind(chatId).first()).n,0,'Deleting gmach cascades to chats');
  await seedServiceLocation('רחוב הבדיקה 12','ירושלים',31.79,35.22);

  await seedServiceLocation('רחוב הבדיקה 12','ירושלים',31.9,35.22);
  const denied=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{itemId,distanceException:true,latitude:31.78,longitude:35.22}});
  assert.equal(denied.response.status,403,JSON.stringify(denied.data));
  assert.ok(denied.data.error.includes('5'));
  const multiRangeDenied=await request(`/api/items/${itemId}/multi-range-request`,{method:'POST',cookie:borrowerCookie,body:{ranges:[{from:`${fixtureDate("2026-10-08")}T10:00`,until:`${fixtureDate("2026-10-09")}T12:00`}],phone:'052-7654321',distanceException:true}});
  assert.equal(multiRangeDenied.response.status,403,'Multi-range API must enforce the organization service radius too');

  assert.equal((await request(`/api/organizations/${organizationId}/public`)).response.status,200,'Public items remain visible outside range');
  await db.prepare('UPDATE organization_service_ranges SET allow_exception=1 WHERE organization_id=?').bind(organizationId).run();
  assert.equal((await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{itemId}})).response.status,403,'Exception requires an explicit request');
  await db.prepare("UPDATE items SET approval_mode='automatic' WHERE id=?").bind(itemId).run();
  result = await request("/api/loan-requests", { method: "POST", cookie: borrowerCookie, body: { itemId, requestedFrom: `${fixtureDate("2026-10-08")}T10:00`, requestedUntil: `${fixtureDate("2026-10-09")}T12:00`, quantity: 1, depositAccepted: true, phone: "052-7654321", note: "לאירוע משפחתי",distanceException:true } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.request.status,'pending','Distance exceptions must never be automatically approved');
  const exceptionRow=await db.prepare('SELECT note FROM loan_requests WHERE id=?').bind(result.data.request.id).first();
  assert.ok(exceptionRow.note.startsWith('בקשת חריגה מטווח שירות:'));
  await db.prepare('DELETE FROM organization_service_ranges WHERE organization_id=?').bind(organizationId).run();
  await db.prepare("UPDATE items SET approval_mode='manual' WHERE id=?").bind(itemId).run();
  await db.prepare('DELETE FROM user_addresses WHERE id=?').bind(savedHome.data.address.id).run();
  const requestId = result.data.request.id;
  assert.equal((await request(`/api/items/${itemId}`,{method:'PATCH',cookie:adminCookie,body:{...costBody,managementMode:'direct'}})).response.status,409,'Active loans prevent mode changes');
  await assert.rejects(()=>db.prepare("UPDATE items SET management_mode='direct' WHERE id=?").bind(itemId).run(),/Finish active loans/,'Database trigger protects concurrent changes');
  assert.equal((await request(`/api/loan-requests/${requestId}/pickup-details`,{cookie:borrowerCookie})).response.status,403,'Pending borrower cannot reveal pickup details');
  assert.equal((await request(`/api/loan-requests/${requestId}/pickup-details`,{cookie:englishCookie})).response.status,403,'Another user cannot reveal pickup details');
  const pendingDashboard=(await request('/api/me/dashboard',{cookie:borrowerCookie})).data.requests.find(x=>x.id===requestId);
  assert.equal(pendingDashboard.pickup_address,null);
  assert.equal(pendingDashboard.branch_address,null);
  assert.equal(pendingDashboard.contact_phone,null);
  const pendingCalendar=await request(`/api/loan-requests/${requestId}/calendar.ics`,{cookie:borrowerCookie});
  assert.equal(pendingCalendar.response.status,200);
  assert.ok(!pendingCalendar.data.includes(serviceOrg.address),'Pending calendar cannot reveal the gmach address');

  result = await request(`/api/loan-requests/${requestId}/pickup-proposals`, { method:"POST",cookie:adminCookie,body:{startsAt:`${fixtureDate("2026-10-08")}T18:00:00Z`,endsAt:`${fixtureDate("2026-10-08")}T19:00:00Z`} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/timeline`, { cookie:borrowerCookie });
  assert.equal(result.response.status,200);
  assert.equal(result.data.proposals.length,1);
  result = await request(`/api/items/${itemId}/availability-check?from=${fixtureDate("2026-10-09")}T18%3A00&until=${fixtureDate("2026-10-11")}T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=${fixtureDate("2026-10-10")}T19%3A00&until=${fixtureDate("2026-10-11")}T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=${fixtureDate("2026-10-10")}T21%3A00&until=${fixtureDate("2026-10-11")}T10%3A00`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.available, true);

  result = await request("/api/notifications", { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.equal(result.data.notifications.filter(n=>n.request_id===requestId&&!n.read_at).length,1);
  assert.ok(result.data.notifications.some(n=>n.action_kind==="support"),"Admin bell includes support");
  assert.ok(result.data.unread>=1);

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
  assert.equal(result.data.requests[0].borrower_phone, undefined, "Borrower phone must remain hidden before approval");
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "approved", managerNote: "איסוף מהכניסה בשעה 19:00" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/me/dashboard", { cookie: adminCookie });
  assert.equal(result.data.requests[0].borrower_phone, "052-7654321", "Borrower phone must be revealed after approval");
  result = await request(`/api/loan-requests/${requestId}/units`, { cookie: adminCookie });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(Array.isArray(result.data.units), true);
  assert.equal(result.data.units.length, 2,"loan unit listing must reflect the extra serialized unit added earlier");
  result = await request(`/api/loan-requests/${requestId}/calendar.ics`, { cookie: borrowerCookie });
  assert.equal(result.response.status, 200, String(result.data));
  assert.match(result.response.headers.get("content-type")||"", /text\/calendar/);
  assert.match(String(result.data), /BEGIN:VCALENDAR/);
  assert.match(String(result.data), /איסוף/);
  assert.match(String(result.data), /החזרה/);
  result = await request(`/api/items/${itemId}/availability-calendar?from=${fixtureDate("2026-10-08")}&days=7`);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.days.length, 7);
  assert.equal(result.data.days[0].available, 1,"one of two units remains available during the approved quantity-1 loan");
  assert.equal(result.data.days[2].available, 2,"both units are available after the loan window");

  result = await request("/api/me/dashboard", { cookie: borrowerCookie });
  assert.equal(result.data.requests[0].status, "approved");
  assert.equal(result.data.requests[0].manager_note, "איסוף מהכניסה בשעה 19:00");
  assert.equal(result.data.requests[0].contact_phone, "050-1234567");
  const selectedPickupBranch=(await db.prepare('SELECT branch_id FROM loan_requests WHERE id=?').bind(requestId).first()).branch_id;
  const expectedPickupAddress=selectedPickupBranch?(await db.prepare('SELECT address FROM organization_branches WHERE id=?').bind(selectedPickupBranch).first()).address:serviceOrg.address;
  assert.equal(result.data.requests[0].pickup_address,expectedPickupAddress);
  const approvedPickup=await request(`/api/loan-requests/${requestId}/pickup-details`,{cookie:borrowerCookie});
  assert.equal(approvedPickup.response.status,200);
  assert.equal(approvedPickup.data.pickup.address,expectedPickupAddress);
  assert.equal(approvedPickup.data.pickup.phone,'050-1234567');
  await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{channels:['email','chat'],preferred:'email',email:'only@example.org'}}});
  const limitedLoanContact=(await request(`/api/loan-requests/${requestId}/pickup-details`,{cookie:borrowerCookie})).data;
  assert.equal(limitedLoanContact.pickup.address,undefined);assert.equal(limitedLoanContact.pickup.phone,undefined);assert.equal(limitedLoanContact.contact.email,'only@example.org');
  const limitedLoanRow=(await request('/api/me/dashboard',{cookie:borrowerCookie})).data.requests.find(r=>r.id===requestId);assert.equal(limitedLoanRow.pickup_address,null);assert.equal(limitedLoanRow.branch_address,null);assert.equal(limitedLoanRow.contact_phone,null);
  const limitedCalendar=await request(`/api/loan-requests/${requestId}/calendar.ics`,{cookie:borrowerCookie});assert.equal(limitedCalendar.response.status,200);assert.ok(!limitedCalendar.data.includes(expectedPickupAddress));
  await request(`/api/organizations/${organizationId}/contact-settings`,{method:'PATCH',cookie:adminCookie,body:{contactSettings:{showPublic:false,channels:['phone','address','chat'],preferred:'chat',email:'',hours:{},notes:''}}});


  assert.deepEqual(result.data.favorites, [itemId]);

  result = await request("/api/notifications", { cookie: borrowerCookie });
  assert.equal(result.data.unread, 3);
  result = await request("/api/notifications/read-all", { method: "POST", cookie: borrowerCookie, body: {} });
  assert.equal(result.response.status, 200);
  result = await request("/api/notifications", { cookie: borrowerCookie });
  assert.equal(result.data.unread, 0);

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "פריט בדיקת אי הגעה", category: "אירועים", condition: "מצב טוב", quantity: 1, description: "פריט ייעודי לבדיקת זרימת אי הגעה במערכת.", loanConditions: "איסוף עצמי", freeConfirmed: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const noShowItemId=result.data.item.id;
  result = await request("/api/loan-requests", { method:"POST",cookie:borrowerCookie,body:{itemId:noShowItemId,requestedFrom:`${fixtureDate("2026-11-12")}T10:00`,requestedUntil:`${fixtureDate("2026-11-13")}T10:00`,quantity:1,depositAccepted:true,phone:"052-7654321",note:"בדיקת אי הגעה"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  const noShowRequestId=result.data.request.id;
  result = await request(`/api/loan-requests/${noShowRequestId}/status`,{method:"PATCH",cookie:adminCookie,body:{status:"approved"}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${noShowRequestId}/status`,{method:"PATCH",cookie:adminCookie,body:{status:"no_show"}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request("/api/me/dashboard",{cookie:adminCookie});
  const noShowRow=result.data.requests.find(x=>x.id===noShowRequestId);
  assert.equal(noShowRow.status,"cancelled");
  assert.equal(noShowRow.workflow_status,"no_show");

  result = await request("/api/auth/register", { method: "POST", body: { fullName: "שואל נוסף", phone:"054-1112233", city:"ירושלים", address:"רחוב הבדיקה 2, ירושלים", email: "second@example.com", password: "ThirdPass!789", termsAccepted: true, operationalEmailsAccepted:true } });
  assert.equal(result.response.status, 201);
  const secondCookie = await verifyLatestEmail("second@example.com");
  result = await request(`/api/organizations/${organizationId}/members`, { method:"POST",cookie:adminCookie,body:{email:"second@example.com",role:"inventory"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/organizations/${organizationId}/inventory-export.csv`, { cookie: secondCookie });
  assert.equal(result.response.status, 403, "Inventory-only managers cannot export organization reports");
  result = await request(`/api/organizations/${organizationId}/inventory-export.csv`, { cookie: adminCookie });
  assert.equal(result.response.status, 200);
  assert.match(result.response.headers.get("content-type"), /text\/csv/);
  assert.ok(result.data.includes("ערכת קישוטים לבדיקה"));
  result = await request(`/api/loan-requests/${requestId}/messages`, { cookie: secondCookie });
  assert.equal(result.response.status, 403);
  result = await request("/api/loan-requests", { method: "POST", cookie: secondCookie, body: { itemId, requestedFrom: `${fixtureDate("2026-10-09")}T10:00`, requestedUntil: `${fixtureDate("2026-10-11")}T10:00`, quantity: 1, depositAccepted: true, phone: "054-1112233", note: "צריך לאירוע נוסף" } });
  assert.ok([201,409].includes(result.response.status), "An overlapping second request must either reserve another available unit or return a clean inventory conflict");

  result = await request("/api/reports", { method: "POST", cookie: borrowerCookie, body: { itemId, reason: "incorrect", details: "בדיקת זרימת הדיווח" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/admin/pending", { cookie: adminCookie });
  assert.equal(result.data.reports.length, 1);
  const reportId = result.data.reports[0].id;
  result = await request(`/api/admin/reports/${reportId}`, { method: "PATCH", cookie: adminCookie, body: { status: "reviewed" } });
  assert.equal(result.response.status, 200);

  result = await request(`/api/items/${itemId}`, { method: "PATCH", cookie: adminCookie, body: { title: "ערכת קישוטים מעודכנת", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה ומעודכנת שנועדה לבדוק את תהליך העריכה באתר.", loanConditions: "איסוף עצמי", freeConfirmed: true } });
  assert.equal(result.response.status, 200);
  result = await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: true } });
  assert.equal(result.response.status, 200);
  result = await request("/api/items");
  assert.equal(result.data.items.length, 0);
  await request(`/api/organizations/${organizationId}`, { method: "PATCH", cookie: adminCookie, body: { hidden: false } });
  result = await request("/api/items");
  assert.equal(result.data.items.length, 2);

  result = await request("/api/discovery?q=קישוט");
  assert.equal(result.response.status, 200);
  assert.equal(result.data.organizations[0].id, organizationId);
  result = await request(`/api/organizations/${organizationId}/public`);
  assert.equal(result.response.status, 200);
  assert.equal(result.data.items.length, 2);
  assert.equal(Object.hasOwn(result.data.organization,"address"),false,"Public organization address must be withheld");
  assert.equal(Object.hasOwn(result.data.organization, "contact_phone"), false);
  assert.equal(result.data.partial, false, "Public gmach details must not degrade on a migrated database");
  result = await request("/api/organizations/nonexistent/public");
  assert.equal(result.response.status, 404);
  assert.ok(result.data.requestId);
  result = await request("/api/help-requests", { method: "POST", cookie: borrowerCookie, body: { title: "צריך שולחן מתקפל", description: "דרוש שולחן מתקפל לאירוע משפחתי קרוב", category: "אירועים", city: "ירושלים", urgency: "urgent" } });
  assert.equal(result.response.status, 201);
  result = await request("/api/help-requests?city=ירושלים&category=אירועים");
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
  const allocatedUnitId=result.data.units[0].id;
  result = await request(`/api/loan-requests/${requestId}/status`, { method:"PATCH",cookie:adminCookie,body:{status:"collected"} });
  assert.equal(result.response.status,409,"serialized pickup must be blocked until the manager allocates the requested units");
  result = await request(`/api/loan-requests/${requestId}/assign-units`, { method: "POST", cookie: adminCookie, body: { unitIds: [allocatedUnitId] } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.status,"approved","allocating units must not itself mark the item as collected");
  result = await request(`/api/loan-requests/${requestId}/assign-units`, { method: "POST", cookie: adminCookie, body: { unitIds: [allocatedUnitId] } });
  assert.equal(result.response.status, 200, "saving the same unit assignment twice must be idempotent: "+JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/units`, { cookie:adminCookie });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  const allocated=result.data.units.find(u=>u.id===allocatedUnitId);
  assert.equal(Boolean(allocated?.assigned),true,"allocated unit must be linked to the loan");
  assert.equal(allocated?.status,"held","allocated unit must stay held until pickup is confirmed");
  result = await request(`/api/loan-requests/${requestId}/status`, { method:"PATCH",cookie:adminCookie,body:{status:"collected"} });
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  result = await request("/api/me/dashboard",{cookie:adminCookie});
  assert.equal(result.data.requests.find(x=>x.id===requestId)?.status,"collected","manager pickup confirmation must move the request to collected");
  result = await request(`/api/loan-requests/${requestId}/status`, { method: "PATCH", cookie: adminCookie, body: { status: "returned" } });
  assert.equal(result.response.status, 200);
  result = await request("/api/me/dashboard",{cookie:adminCookie});
  assert.equal(result.data.requests.find(x=>x.id===requestId)?.status,"returned","manager return confirmation must finish the loan");
  result = await request("/api/reviews", { method: "POST", cookie: borrowerCookie, body: { requestId, organizationRating: 5, itemRating: 4, serviceRating: 5, comment: "שירות מצוין והפריט במצב טוב" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.data.review.organizationRating, 5);
  assert.equal(result.data.review.itemRating, 4);
  result = await request(`/api/items/${itemId}`);
  assert.equal(result.data.item.rating, 4);
  assert.equal(result.data.item.organizations.rating, 5);
  result = await request(`/api/organizations/${organizationId}/public`);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.reviews.length, 1);
  assert.equal(result.data.reviews[0].service_rating, 5);
  result = await request(`/api/items/${itemId}/similar`);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.ok(Array.isArray(result.data.items));
  result = await request("/api/me/saved-searches", { method: "POST", cookie: borrowerCookie, body: { name: "אירועים בעיר", filters: { q: "כיסאות", city: "ירושלים" }, notify: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const savedSearchId = result.data.search.id;
  result = await request(`/api/me/saved-searches/${savedSearchId}`, { method: "PATCH", cookie: adminCookie, body: { name: "חיפוש זר", filters: {}, notify: false } });
  assert.equal(result.response.status, 404);
  result = await request(`/api/me/saved-searches/${savedSearchId}`, { method: "PATCH", cookie: borrowerCookie, body: { name: "אירועים מעודכנים", filters: { q: "שולחן", city: "ירושלים" }, notify: false } });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  result = await request("/api/me/saved-searches", { cookie: borrowerCookie });
  assert.equal(result.data.searches.find(search => search.id === savedSearchId).name, "אירועים מעודכנים");
  assert.equal(result.data.searches.find(search => search.id === savedSearchId).notify, false);
  await db.prepare("DROP TABLE organization_categories").run();
  result = await request(`/api/organizations/${organizationId}/public`);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.partial, false);
  assert.equal(result.data.organization.id, organizationId);
  assert.equal(result.data.items.length, 2);
  assert.ok(await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='organization_categories'").first());

  // Pickup selection persists and cannot overbook one branch using another branch's units.
  await db.prepare("INSERT INTO organization_branches(id,organization_id,name,city,address,status) VALUES('pickup-second',?,'סניף שני','ירושלים','כתובת שנייה','active')").bind(organizationId).run();
  await db.prepare("UPDATE items SET quantity=2 WHERE id=?").bind(itemId).run();
  await db.prepare("INSERT INTO item_units(id,item_id,serial_number,status,condition) VALUES('pickup-extra-unit',?,'PICKUP-EXTRA','available','good')").bind(itemId).run();
  const branchUnits=(await db.prepare("SELECT id FROM item_units WHERE item_id=? AND status!='retired' ORDER BY id").bind(itemId).all()).results;
  await db.prepare("UPDATE item_units SET branch_id=?,status='available' WHERE id=?").bind(branchId,branchUnits[0].id).run();
  await db.prepare("UPDATE item_units SET branch_id='pickup-second',status='available' WHERE id=?").bind(branchUnits[1].id).run();
  result=await request(`/api/items/${itemId}/pickup-branches`);
  assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.branches.length,2);
  for(const branch of result.data.branches)assert.equal(Object.hasOwn(branch,'address'),false);
  const publicBranches=(await request(`/api/organizations/${organizationId}/branches-public`)).data.branches;
  for(const branch of publicBranches)for(const key of ['address','phone','latitude','longitude'])assert.equal(Object.hasOwn(branch,key),false,`Public branch leaks ${key}`);
  const branchSearch=(await request('/api/search/branches?city='+encodeURIComponent('ירושלים'))).data.branches;
  for(const branch of branchSearch){assert.equal(Object.hasOwn(branch,'address'),false);assert.equal(Object.hasOwn(branch,'phone'),false);if(branch.latitude!=null)assert.equal(branch.latitude,Math.round(branch.latitude*10)/10);}
  const publicDiscovery=(await request('/api/discovery')).data.organizations;
  for(const org of publicDiscovery)for(const key of ['address','phone','latitude','longitude'])assert.equal(Object.hasOwn(org,key),false,`Discovery leaks ${key}`);

  const pickupBody={itemId,requestedFrom:`${fixtureDate("2026-10-15")}T10:00`,requestedUntil:`${fixtureDate("2026-10-16")}T12:00`,quantity:1,depositAccepted:true,phone:'052-7654321'};
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:pickupBody});assert.equal(result.response.status,400,'Multiple branches require an explicit choice');
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId:'foreign'}});assert.equal(result.response.status,400,'Reject unrelated branch');
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId}});assert.equal(result.response.status,201,JSON.stringify(result.data));
  const pickupLoan=result.data.request.id;assert.equal((await db.prepare('SELECT branch_id FROM loan_requests WHERE id=?').bind(pickupLoan).first()).branch_id,branchId);
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId}});assert.equal(result.response.status,409,'Full branch must not borrow stock from another branch');
  result=await request(`/api/items/${itemId}/availability-check?from=${fixtureDate("2026-10-15")}T10%3A00&until=${fixtureDate("2026-10-16")}T12%3A00&branchId=pickup-second`);assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.availableQuantity,1);
  await db.prepare("UPDATE loan_requests SET status='approved' WHERE id=?").bind(pickupLoan).run();
  result=await request(`/api/loan-requests/${pickupLoan}/assign-units`,{method:'POST',cookie:adminCookie,body:{unitIds:[branchUnits[1].id]}});assert.equal(result.response.status,409,'Pickup assignment cannot silently change the selected branch');

  result = await request("/api/auth/logout", { method: "POST", cookie: borrowerCookie });
  assert.equal(result.response.status, 200);
  result = await request("/api/auth/me", { cookie: borrowerCookie });
  assert.equal(result.data.user, null);

  result = await request("/api/organizations", { method: "POST", cookie: adminCookie, origin: "https://evil.example", body: {} });
  assert.equal(result.response.status, 403);

  const archivedUser=(await db.prepare("SELECT id FROM users WHERE email='english@example.org'").first()).id;
  for(const [type,id,table,field] of [['user',archivedUser,'users','account_status'],['organization',organizationId,'organizations','is_hidden'],['item',itemId,'items','status']]){
    const before=(await db.prepare(`SELECT ${field} state FROM ${table} WHERE id=?`).bind(id).first()).state;
    assert.equal((await request('/api/admin/recycle-bin/'+type+'/'+id,{method:'POST',body:{action:'archive'}})).response.status,401);
    result=await request('/api/admin/recycle-bin/'+type+'/'+id,{method:'POST',cookie:adminCookie,body:{action:'archive'}});assert.equal(result.response.status,200,JSON.stringify(result.data));
    assert((await request('/api/admin/recycle-bin',{cookie:adminCookie})).data.entries.some(r=>r.entity_id===id));
    result=await request('/api/admin/recycle-bin/'+type+'/'+id,{method:'POST',cookie:adminCookie,body:{action:'restore'}});assert.equal(result.response.status,200,JSON.stringify(result.data));
    assert.equal((await db.prepare(`SELECT ${field} state FROM ${table} WHERE id=?`).bind(id).first()).state,before,'Restore original state');
  }
  const selfAdmin=(await request("/api/auth/me",{cookie:adminCookie})).data.user.id;
  assert.equal((await request('/api/admin/recycle-bin/user/'+selfAdmin,{method:'POST',cookie:adminCookie,body:{action:'archive'}})).response.status,400,'Cannot archive own admin');
  assert.equal((await request('/api/admin/users/'+archivedUser+'/activity',{cookie:adminCookie})).response.status,200);
  assert((await db.prepare('SELECT id FROM loan_requests WHERE id=?').bind(pickupLoan).first()),'History survives archives');
  // Counts follow the public catalogue; gmach deletion needs the existing admin session only.
  async function assertPublicCategoryCounts(){const discovery=(await request('/api/discovery')).data;const catalog=(await request('/api/items')).data.items;const expected={};for(const item of catalog)expected[item.category]=(expected[item.category]||0)+1;assert.deepEqual(Object.fromEntries(discovery.categories.map(r=>[r.category,Number(r.count)])),expected);}
  await assertPublicCategoryCounts();
  await db.prepare('UPDATE organizations SET is_hidden=1 WHERE id=?').bind(organizationId).run();await assertPublicCategoryCounts();
  await db.prepare('UPDATE organizations SET is_hidden=0 WHERE id=?').bind(organizationId).run();
  const deletePath='/api/admin/entities/organizations/'+organizationId;
  assert.equal((await request(deletePath,{method:'DELETE'})).response.status,401);
  const freshMember=(await request('/api/auth/login',{method:'POST',body:{email:'english@example.org',password:'EnglishUserPass!456'}})).response.headers.get('set-cookie')?.split(';')[0];
  assert.ok(freshMember);assert.equal((await request(deletePath,{method:'DELETE',cookie:freshMember})).response.status,403);
  const emailsBeforeDelete=sentEmails.length;
  const deleted=await request(deletePath,{method:'DELETE',cookie:adminCookie});assert.equal(deleted.response.status,200,JSON.stringify(deleted.data));
  assert.equal(sentEmails.length,emailsBeforeDelete,'Deletion needs no email confirmation');
  assert((await db.prepare('SELECT deleted_at FROM organizations WHERE id=?').bind(organizationId).first()).deleted_at);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM items WHERE organization_id=? AND deleted_at IS NULL').bind(organizationId).first()).n,0);
  // Simulate an older deletion that left active, undeleted child items behind.
  await db.prepare('UPDATE items SET deleted_at=NULL,status=\'active\' WHERE organization_id=?').bind(organizationId).run();await assertPublicCategoryCounts();
  console.log("Cloudflare smoke test passed: auth, D1, R2, inventory, chat, notifications, reports, moderation and permissions.");
} finally {
  await mf.dispose();
}
