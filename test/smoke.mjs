import assert from "node:assert/strict";
import vm from "node:vm";
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
  const images = await mf.getR2Bucket("ITEM_IMAGES");
  await images.put(backupKey, backupText);
  await db.prepare("INSERT INTO backup_runs(id,status,backup_type,started_at,manifest_json) VALUES(?,'completed','scheduled',?,?)")
    .bind(backupId, new Date().toISOString(), JSON.stringify({ storageKey: backupKey, checksum: backupChecksum, tables: ["users"] })).run();
  result = await request(`/api/admin/backups/${backupId}/validate`, { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.validation.rowCount, 1);
  await images.put(backupKey, backupText + "corruption");
  result = await request(`/api/admin/backups/${backupId}/validate`, { method: "POST", cookie: adminCookie, body: {} });
  assert.notEqual(result.response.status, 200, "Corrupt backups must fail validation");
  result = await request("/api/admin/backups", { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  result = await request(`/api/admin/backups/${result.data.backup.id}/validate`, { method: "POST", cookie: adminCookie, body: {} });
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.validation.status, "success");

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

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "ערכת קישוטים לבדיקה", category: "אירועים", condition: "מצוין", quantity: 1, description: "ערכת קישוטים מלאה שנועדה לבדוק את תהליך הפרסום באתר.", loanConditions: "איסוף עצמי", depositRequired: true, depositAmount: "100", freeConfirmed: true } });
  assert.equal(result.response.status, 201);
  const itemId = result.data.item.id;

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
  result = await request("/api/loan-requests", { method: "POST", cookie: borrowerCookie, body: { itemId, requestedFrom: "2026-10-08T10:00", requestedUntil: "2026-10-09T12:00", quantity: 1, depositAccepted: true, phone: "052-7654321", note: "לאירוע משפחתי" } });
  assert.equal(result.response.status, 201);
  const requestId = result.data.request.id;
  result = await request(`/api/loan-requests/${requestId}/pickup-proposals`, { method:"POST",cookie:adminCookie,body:{startsAt:"2026-10-08T18:00:00Z",endsAt:"2026-10-08T19:00:00Z"} });
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  result = await request(`/api/loan-requests/${requestId}/timeline`, { cookie:borrowerCookie });
  assert.equal(result.response.status,200);
  assert.equal(result.data.proposals.length,1);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-09T18%3A00&until=2026-10-11T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-10T19%3A00&until=2026-10-11T10%3A00`);
  assert.equal(result.response.status, 400);
  result = await request(`/api/items/${itemId}/availability-check?from=2026-10-10T21%3A00&until=2026-10-11T10%3A00`);
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
  result = await request(`/api/items/${itemId}/availability-calendar?from=2026-10-08&days=7`);
  assert.equal(result.response.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.days.length, 7);
  assert.equal(result.data.days[0].available, 1,"one of two units remains available during the approved quantity-1 loan");
  assert.equal(result.data.days[2].available, 2,"both units are available after the loan window");

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

  result = await request("/api/items", { method: "POST", cookie: adminCookie, body: { organizationId, title: "פריט בדיקת אי הגעה", category: "אירועים", condition: "מצב טוב", quantity: 1, description: "פריט ייעודי לבדיקת זרימת אי הגעה במערכת.", loanConditions: "איסוף עצמי", freeConfirmed: true } });
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const noShowItemId=result.data.item.id;
  result = await request("/api/loan-requests", { method:"POST",cookie:borrowerCookie,body:{itemId:noShowItemId,requestedFrom:"2026-11-12T10:00",requestedUntil:"2026-11-13T10:00",quantity:1,depositAccepted:true,phone:"052-7654321",note:"בדיקת אי הגעה"} });
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
  result = await request("/api/loan-requests", { method: "POST", cookie: secondCookie, body: { itemId, requestedFrom: "2026-10-09T10:00", requestedUntil: "2026-10-11T10:00", quantity: 1, depositAccepted: true, phone: "054-1112233", note: "צריך לאירוע נוסף" } });
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
  assert.equal(result.data.organization.address, "רחוב הבדיקה 1, ירושלים");
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
  const pickupBody={itemId,requestedFrom:'2026-10-15T10:00',requestedUntil:'2026-10-16T12:00',quantity:1,depositAccepted:true,phone:'052-7654321'};
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:pickupBody});assert.equal(result.response.status,400,'Multiple branches require an explicit choice');
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId:'foreign'}});assert.equal(result.response.status,400,'Reject unrelated branch');
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId}});assert.equal(result.response.status,201,JSON.stringify(result.data));
  const pickupLoan=result.data.request.id;assert.equal((await db.prepare('SELECT branch_id FROM loan_requests WHERE id=?').bind(pickupLoan).first()).branch_id,branchId);
  result=await request('/api/loan-requests',{method:'POST',cookie:borrowerCookie,body:{...pickupBody,branchId}});assert.equal(result.response.status,409,'Full branch must not borrow stock from another branch');
  result=await request(`/api/items/${itemId}/availability-check?from=2026-10-15T10%3A00&until=2026-10-16T12%3A00&branchId=pickup-second`);assert.equal(result.response.status,200,JSON.stringify(result.data));assert.equal(result.data.availableQuantity,1);
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
  console.log("Cloudflare smoke test passed: auth, D1, R2, inventory, chat, notifications, reports, moderation and permissions.");
} finally {
  await mf.dispose();
}
