const SESSION_COOKIE = "gmach_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
// Keep PBKDF2 within the Cloudflare Workers CPU budget. Existing production
// accounts and the seeded administrator already use this compatible cost.
const PASSWORD_ITERATIONS = 100000;
const DEFAULT_FROM_EMAIL = "Gmach Berega <onboarding@resend.dev>";
const DEFAULT_SUPPORT_EMAIL = "netanelhirsh@gmail.com";
const MAX_JSON_BYTES = 32 * 1024;
const IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);
const CATEGORIES = new Set(["אירועים", "כלי עבודה", "תינוקות", "רפואה", "טיולים", "בית ואירוח", "כללי"]);
const CONDITIONS = new Set(["כמו חדש", "מצוין", "טוב"]);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) {
        const response = await routeApi(request, env, ctx, url);
        return withSecurityHeaders(response);
      }
      if (url.pathname.startsWith("/media/")) {
        const response = await serveMedia(request, env, url);
        return withSecurityHeaders(response);
      }
      const response = await env.ASSETS.fetch(request);
      return withSecurityHeaders(response);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (status >= 500) console.error(error);
      return withSecurityHeaders(json({ error: error instanceof HttpError ? error.message : "אירעה תקלה זמנית בשרת" }, status));
    }
  }
};


async function createSupportRequest(request, env) {
  const body = await readJson(request);
  const name = cleanText(body.name, 2, 80, "שם");
  const email = cleanText(body.email, 5, 160, "אימייל").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "נא להזין כתובת אימייל תקינה");
  const subject = cleanText(body.subject, 2, 120, "נושא");
  const message = cleanText(body.message, 10, 2000, "הודעה");
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS support_requests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',
    created_at TEXT NOT NULL
  )`).run();
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO support_requests (id,name,email,subject,message,status,created_at) VALUES (?,?,?,?,?,'new',?)")
    .bind(id, name, email, subject, message, new Date().toISOString()).run();
  return json({ ok: true, id }, 201);
}

async function ensureAdvancedBookingSchema(env) {
  const itemInfo=await env.DB.prepare("PRAGMA table_info(items)").all();
  const itemColumns=new Set((itemInfo.results||[]).map(row=>row.name));
  const itemAdds=[
    ["min_loan_minutes","INTEGER NOT NULL DEFAULT 60 CHECK (min_loan_minutes >= 1)"],
    ["max_loan_minutes","INTEGER NOT NULL DEFAULT 10080 CHECK (max_loan_minutes >= 1)"],
    ["booking_notice_minutes","INTEGER NOT NULL DEFAULT 0 CHECK (booking_notice_minutes >= 0)"],
    ["turnaround_minutes","INTEGER NOT NULL DEFAULT 0 CHECK (turnaround_minutes >= 0)"],
    ["booking_horizon_days","INTEGER NOT NULL DEFAULT 365 CHECK (booking_horizon_days BETWEEN 1 AND 1095)"],
    ["approval_mode","TEXT NOT NULL DEFAULT 'manual' CHECK (approval_mode IN ('manual','automatic'))"],
    ["deposit_required","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required IN (0,1))"],
    ["deposit_amount_agorot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot >= 0)"]
  ];
  for(const [name,definition] of itemAdds) if(!itemColumns.has(name)) await env.DB.prepare(`ALTER TABLE items ADD COLUMN ${name} ${definition}`).run();

  const requestInfo=await env.DB.prepare("PRAGMA table_info(loan_requests)").all();
  const requestColumns=new Set((requestInfo.results||[]).map(row=>row.name));
  const requestAdds=[
    ["quantity","INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999)"],
    ["deposit_required_snapshot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_required_snapshot IN (0,1))"],
    ["deposit_amount_agorot_snapshot","INTEGER NOT NULL DEFAULT 0 CHECK (deposit_amount_agorot_snapshot >= 0)"],
    ["deposit_terms_accepted_at","TEXT"],["collected_at","TEXT"],["returned_at","TEXT"],["cancelled_at","TEXT"]
  ];
  for(const [name,definition] of requestAdds) if(!requestColumns.has(name)) await env.DB.prepare(`ALTER TABLE loan_requests ADD COLUMN ${name} ${definition}`).run();

  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_units (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,unit_code TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','blocked','retired')),note TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS inventory_blocks (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,inventory_unit_id TEXT REFERENCES inventory_units(id) ON DELETE CASCADE,starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),reason TEXT,created_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK (ends_at > starts_at))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS loan_request_units (request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,inventory_unit_id TEXT NOT NULL REFERENCES inventory_units(id) ON DELETE CASCADE,PRIMARY KEY (request_id,inventory_unit_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS loan_request_events (id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,event_type TEXT NOT NULL,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS waitlist_entries (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,requested_from TEXT NOT NULL,requested_until TEXT NOT NULL,quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','notified','converted','cancelled','expired')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),CHECK (requested_until > requested_from))"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS inventory_units_item_status_idx ON inventory_units(item_id,status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS inventory_blocks_item_time_idx ON inventory_blocks(item_id,starts_at,ends_at)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS loan_requests_item_time_status_idx ON loan_requests(item_id,requested_from,requested_until,status)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS loan_request_events_request_idx ON loan_request_events(request_id,created_at DESC)"),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS waitlist_item_time_idx ON waitlist_entries(item_id,status,requested_from,requested_until)")
  ]);
}

async function routeApi(request, env, ctx, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) assertSameOrigin(request, url);
  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (method === "GET" && path === "/api/health") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    await ensureAdvancedBookingSchema(env);
    const [usersTable,challengesTable,itemsTable,waitlistTable,blocksTable]=await Promise.all([
      env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").first(),
      env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='auth_challenges'").first(),
      env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'").first(),
      env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='waitlist_entries'").first(),
      env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='inventory_blocks'").first()
    ]);
    const userSql=String(usersTable?.sql||"").toLowerCase(),itemSql=String(itemsTable?.sql||"").toLowerCase();
    const bookingReady=itemSql.includes("min_loan_minutes")&&itemSql.includes("deposit_required")&&Boolean(waitlistTable)&&Boolean(blocksTable);
    return json({ ok:true,release:"advanced-booking-2026-09-24.1",database:"D1",storage:"R2",email:Boolean(env.RESEND_API_KEY),authSchema:{users:Boolean(usersTable),challenges:Boolean(challengesTable),memberRole:userSql.includes("'member'"),borrowerRole:userSql.includes("'borrower'"),emailVerified:userSql.includes("email_verified")},bookingSchema:{ready:bookingReady,items:Boolean(itemsTable),waitlist:Boolean(waitlistTable),inventoryBlocks:Boolean(blocksTable)},timestamp:new Date().toISOString() });
  }

  if (method === "POST" && path === "/api/auth/register") return register(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/verify-email") return verifyEmail(request, env, url);
  if (method === "POST" && path === "/api/auth/resend-verification") return resendVerification(request, env, ctx);
  if (method === "POST" && path === "/api/auth/forgot-password") return forgotPassword(request, env);
  if (method === "POST" && path === "/api/auth/reset-password") return resetPassword(request, env);
  if (method === "POST" && path === "/api/auth/login") return login(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/2fa/verify-login") return verifyTwoFactorLogin(request, env, url);
  if (method === "POST" && path === "/api/auth/logout") return logout(request, env, url);
  if (method === "POST" && path === "/api/auth/change-password") return changePassword(request, env);
  if (method === "DELETE" && path === "/api/me/account") return deleteAccount(request, env, url);
  if (method === "POST" && path === "/api/auth/2fa/setup") return setupTwoFactor(request, env);
  if (method === "POST" && path === "/api/auth/2fa/confirm") return confirmTwoFactor(request, env);
  if (method === "POST" && path === "/api/auth/2fa/disable") return disableTwoFactor(request, env);
  if (method === "GET" && path === "/api/auth/me") {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }
  if (method === "GET" && path === "/api/public-config") return json({ supportEmail: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL) });
  if (method === "POST" && path === "/api/support") return createSupportRequest(request, env);

  if (method === "GET" && path === "/api/items") return listItems(env, url);
  if (method === "GET" && path === "/api/discovery") return discovery(env, url);
  if (method === "POST" && path === "/api/analytics/events") return recordAnalytics(request, env);
  if (method === "GET" && path === "/api/help-requests") return listHelpRequests(env, url);
  if (method === "POST" && path === "/api/help-requests") return createHelpRequest(request, env);
  if (method === "POST" && path === "/api/reviews") return createReview(request, env);
  if (method === "GET" && path === "/api/site-settings") return getSiteSettings(env);
  if (method === "GET" && path === "/api/page-customizations") return getPageCustomizations(env);
  const itemDetail = path.match(/^\/api\/items\/([^/]+)$/);
  if (method === "GET" && itemDetail) return getItem(env, decodeURIComponent(itemDetail[1]));
  if (method === "PATCH" && itemDetail) return updateItem(request, env, decodeURIComponent(itemDetail[1]));
  const itemAvailabilityCheck = path.match(/^\/api\/items\/([^/]+)\/availability-check$/);
  if (method === "GET" && itemAvailabilityCheck) return checkItemAvailability(env, decodeURIComponent(itemAvailabilityCheck[1]), url);
  const inventoryManage = path.match(/^\/api\/items\/([^/]+)\/inventory$/);
  if (method === "GET" && inventoryManage) return getInventoryManagement(request, env, decodeURIComponent(inventoryManage[1]));
  if (method === "POST" && inventoryManage) return addInventoryBlock(request, env, decodeURIComponent(inventoryManage[1]));
  const inventoryBlock = path.match(/^\/api\/inventory-blocks\/([^/]+)$/);
  if (method === "DELETE" && inventoryBlock) return deleteInventoryBlock(request, env, decodeURIComponent(inventoryBlock[1]));
  const waitlist = path.match(/^\/api\/items\/([^/]+)\/waitlist$/);
  if (method === "POST" && waitlist) return joinWaitlist(request, env, decodeURIComponent(waitlist[1]));


  const favorite = path.match(/^\/api\/favorites\/([^/]+)$/);
  if (favorite && method === "POST") return addFavorite(request, env, decodeURIComponent(favorite[1]));
  if (favorite && method === "DELETE") return removeFavorite(request, env, decodeURIComponent(favorite[1]));

  if (method === "POST" && path === "/api/organizations") return createOrganization(request, env);
  const publicOrganization = path.match(/^\/api\/organizations\/([^/]+)\/public$/);
  if (method === "GET" && publicOrganization) return getPublicOrganization(env, decodeURIComponent(publicOrganization[1]));
  const savedOrganization = path.match(/^\/api\/saved-organizations\/([^/]+)$/);
  if (method === "POST" && savedOrganization) return toggleSavedOrganization(request, env, decodeURIComponent(savedOrganization[1]), true);
  if (method === "DELETE" && savedOrganization) return toggleSavedOrganization(request, env, decodeURIComponent(savedOrganization[1]), false);
  const organizationDetail = path.match(/^\/api\/organizations\/([^/]+)$/);
  if (method === "PATCH" && organizationDetail) return updateOrganization(request, env, decodeURIComponent(organizationDetail[1]));
  if (method === "POST" && path === "/api/items") return createItem(request, env);
  const imageUpload = path.match(/^\/api\/items\/([^/]+)\/images$/);
  if (method === "POST" && imageUpload) return uploadImages(request, env, decodeURIComponent(imageUpload[1]));
  if (method === "POST" && path === "/api/loan-requests") return createLoanRequest(request, env);
  const requestMessages = path.match(/^\/api\/loan-requests\/([^/]+)\/messages$/);
  if (method === "GET" && requestMessages) return listRequestMessages(request, env, decodeURIComponent(requestMessages[1]));
  if (method === "POST" && requestMessages) return createRequestMessage(request, env, decodeURIComponent(requestMessages[1]));

  if (method === "GET" && path === "/api/notifications") return listNotifications(request, env);
  if (method === "POST" && path === "/api/notifications/read-all") return markNotificationsRead(request, env);
  if (method === "POST" && path === "/api/reports") return createReport(request, env);

  if (method === "GET" && path === "/api/me/dashboard") return dashboard(request, env);
  const requestStatus = path.match(/^\/api\/loan-requests\/([^/]+)\/status$/);
  if (method === "PATCH" && requestStatus) return updateRequestStatus(request, env, decodeURIComponent(requestStatus[1]));
  const itemAvailability = path.match(/^\/api\/items\/([^/]+)\/availability$/);
  if (method === "PATCH" && itemAvailability) return updateAvailability(request, env, decodeURIComponent(itemAvailability[1]));

  if (method === "GET" && path === "/api/admin/pending") return adminPending(request, env);
  if (method === "GET" && path === "/api/admin/overview") return adminOverview(request, env);
  if (method === "GET" && path === "/api/admin/site-settings") return adminSiteSettings(request, env);
  if (method === "PATCH" && path === "/api/admin/site-settings") return updateSiteSettings(request, env);
  const restoreSettings = path.match(/^\/api\/admin\/site-settings\/versions\/([^/]+)\/restore$/);
  if (method === "POST" && restoreSettings) return restoreSiteSettings(request, env, decodeURIComponent(restoreSettings[1]));
  if (method === "GET" && path === "/api/admin/users") return adminUsers(request, env);
  if (method === "GET" && path === "/api/admin/content") return adminContent(request, env);
  if (method === "GET" && path === "/api/admin/analytics") return adminAnalytics(request, env);
  if (method === "PUT" && path === "/api/admin/page-customizations") return savePageCustomization(request, env);
  if (method === "DELETE" && path === "/api/admin/page-customizations") return resetPageCustomizations(request, env);
  const restorePageVersion = path.match(/^\/api\/admin\/page-customizations\/versions\/([^/]+)\/restore$/);
  if (method === "POST" && restorePageVersion) return restorePageCustomizationVersion(request, env, decodeURIComponent(restorePageVersion[1]));
  const adminUser = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (method === "PATCH" && adminUser) return updateAdminUser(request, env, decodeURIComponent(adminUser[1]));
  const adminOrganization = path.match(/^\/api\/admin\/organizations\/([^/]+)$/);
  if (method === "PATCH" && adminOrganization) return moderateOrganization(request, env, decodeURIComponent(adminOrganization[1]));
  const adminItem = path.match(/^\/api\/admin\/items\/([^/]+)$/);
  if (method === "PATCH" && adminItem) return moderateItem(request, env, decodeURIComponent(adminItem[1]));
  const adminReport = path.match(/^\/api\/admin\/reports\/([^/]+)$/);
  if (method === "PATCH" && adminReport) return moderateReport(request, env, decodeURIComponent(adminReport[1]));

  throw new HttpError(404, "הכתובת לא נמצאה");
}

async function register(request, env, ctx, url) {
  const body = await readJson(request);
  if (body.termsAccepted !== true) throw new HttpError(400, "יש לאשר את תנאי השימוש ומדיניות הפרטיות");
  const email = normalizeEmail(body.email);
  const fullName = cleanText(body.fullName, 2, 80, "שם מלא");
  const password = validatePassword(body.password);
  try { await enforceAuthRateLimit(env,email,"register",ctx); }
  catch(error) { if(error instanceof HttpError) throw error; console.error("Registration rate limit failed",error); throw new HttpError(503,"לא הצלחנו לבדוק את ההרשמה (שלב אבטחה)"); }
  assertEmailDeliveryConfigured(env);

  let existing;
  try { existing=await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first(); }
  catch(error) { console.error("Registration lookup failed",error); throw new HttpError(503,"לא הצלחנו לבדוק את החשבון (שלב משתמש)"); }
  if (existing) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  const admins = String(env.ADMIN_EMAILS || "").split(",").map(normalizeEmailLoose).filter(Boolean);
  let userCount,existingAdmin;
  try { [userCount,existingAdmin]=await Promise.all([env.DB.prepare("SELECT COUNT(*) AS count FROM users").first(),env.DB.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").first()]); }
  catch(error) { console.error("Registration role lookup failed",error); throw new HttpError(503,"לא הצלחנו לבדוק את החשבון (שלב הרשאות)"); }
  const isFirstAccount = Number(userCount?.count || 0) === 0;
  let role;
  try { role=admins.includes(email)||(!existingAdmin&&isFirstAccount)?"admin":await compatibleMemberRole(env); }
  catch(error) { console.error("Registration role compatibility failed",error); role="member"; }
  const code = verificationCode();
  const challengeHash = await sha256(`${id}:${code}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  try {
    await env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role) VALUES (?,?,?,?,?,?,?)")
      .bind(id, email, passwordHash, salt, PASSWORD_ITERATIONS, fullName, role).run();
  } catch (error) {
    const message=String(error).toLowerCase();
    if (message.includes("unique")) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");
    const fallbackRole=role==="member"?"borrower":role==="borrower"?"member":null;
    if (!fallbackRole) { console.error("Registration user write failed",error); throw new HttpError(503,"לא הצלחנו ליצור את החשבון במסד הנתונים"); }
    try { await env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role) VALUES (?,?,?,?,?,?,?)").bind(id,email,passwordHash,salt,PASSWORD_ITERATIONS,fullName,fallbackRole).run(); }
    catch (fallbackError) { console.error("Registration user fallback failed",fallbackError); throw new HttpError(503,"לא הצלחנו ליצור את החשבון במסד הנתונים"); }
  }
  try {
    await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)").bind(challengeHash,id,expiresAt).run();
  } catch (error) {
    console.error("Registration challenge write failed",error);
    try { await env.DB.prepare("DELETE FROM users WHERE id=?").bind(id).run(); } catch {}
    throw new HttpError(503,"לא הצלחנו ליצור קוד אימות. נסו שוב בעוד רגע");
  }

  try {
    await sendVerificationEmail(env, email, fullName, code);
  } catch (error) {
    console.error("Verification email delivery failed", error);
    try { await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run(); }
    catch (cleanupError) { console.error("Registration cleanup failed", cleanupError); }
    throw new HttpError(503, "לא הצלחנו לשלוח את קוד האימות. שירות המייל אינו זמין כרגע");
  }
  return json({ verificationRequired: true, email, expiresInSeconds: 600 }, 201);
}

async function verifyEmail(request, env, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = cleanText(body.code, 6, 6, "קוד אימות");
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "קוד האימות חייב להכיל 6 ספרות");
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user) throw new HttpError(400, "קוד האימות אינו נכון או שפג תוקפו");
  if (Number(user.email_verified || 0) === 1) throw new HttpError(409, "כתובת האימייל כבר אומתה");
  const tokenHash = await sha256(`${user.id}:${code}`);
  const challenge = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE token_hash = ? AND user_id = ? AND purpose = 'email_verify' AND expires_at > ?")
    .bind(tokenHash, user.id, new Date().toISOString()).first();
  if (!challenge) throw new HttpError(400, "קוד האימות אינו נכון או שפג תוקפו");
  const sessionToken = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email_verified = 1, last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(await sha256(sessionToken), user.id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString())
  ]);
  return json({ user: publicUser({ ...user, email_verified: 1 }) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function resendVerification(request, env, ctx) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  await enforceAuthRateLimit(env, email, "register", ctx);
  assertEmailDeliveryConfigured(env);
  const user = await env.DB.prepare("SELECT id,email,full_name,email_verified FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user || Number(user.email_verified || 0) === 1) return json({ ok: true });
  const code = verificationCode();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)")
      .bind(await sha256(`${user.id}:${code}`), user.id, new Date(Date.now() + 10 * 60 * 1000).toISOString())
  ]);
  await sendVerificationEmail(env, user.email, user.full_name, code);
  return json({ ok: true });
}

async function forgotPassword(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  assertEmailDeliveryConfigured(env);
  const user = await env.DB.prepare("SELECT id,email,full_name,email_verified FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user || Number(user.email_verified || 0) !== 1) return json({ ok: true });
  const recent = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify' AND created_at > ? LIMIT 1")
    .bind(user.id, new Date(Date.now() - 60 * 1000).toISOString()).first();
  if (recent) return json({ ok: true });
  const code = verificationCode();
  await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'email_verify', ?)")
    .bind(await sha256(`${user.id}:password_reset:${code}`), user.id, new Date(Date.now() + 10 * 60 * 1000).toISOString()).run();
  await sendPasswordResetEmail(env, user.email, user.full_name, code);
  return json({ ok: true });
}

async function resetPassword(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = cleanText(body.code, 6, 6, "קוד איפוס");
  const newPassword = validatePassword(body.newPassword);
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, "קוד האיפוס חייב להכיל 6 ספרות");
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 1").bind(email).first();
  if (!user) throw new HttpError(400, "הקוד אינו נכון או שפג תוקפו");
  const tokenHash = await sha256(`${user.id}:password_reset:${code}`);
  const challenge = await env.DB.prepare("SELECT token_hash FROM auth_challenges WHERE token_hash = ? AND user_id = ? AND purpose = 'email_verify' AND expires_at > ?")
    .bind(tokenHash, user.id, new Date().toISOString()).first();
  if (!challenge) throw new HttpError(400, "הקוד אינו נכון או שפג תוקפו");
  const salt = randomToken(16);
  const hash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?").bind(hash, salt, PASSWORD_ITERATIONS, new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM auth_challenges WHERE user_id = ? AND purpose = 'email_verify'").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id)
  ]);
  return json({ ok: true });
}

async function login(request, env, ctx, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  await enforceAuthRateLimit(env, email, "login", ctx);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user) throw new HttpError(401, "האימייל או הסיסמה אינם נכונים");
  if (user.account_status === "suspended") throw new HttpError(403, "החשבון הושעה. יש לפנות למנהל האתר");
  const candidate = await derivePassword(password, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "האימייל או הסיסמה אינם נכונים");
  if (Number(user.email_verified || 0) !== 1) return json({ error: "יש לאמת את כתובת האימייל לפני הכניסה", verificationRequired: true, email: user.email }, 403);

  if (Number(user.totp_enabled || 0) === 1) {
    const challenge = randomToken(32);
    const challengeHash = await sha256(challenge);
    await env.DB.prepare("INSERT INTO auth_challenges (token_hash,user_id,purpose,expires_at) VALUES (?,?, 'login_2fa', ?)")
      .bind(challengeHash, user.id, new Date(Date.now() + 5 * 60 * 1000).toISOString()).run();
    return json({ requiresTwoFactor: true, challenge });
  }

  const sessionToken = randomToken(32);
  const tokenHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(tokenHash, user.id, expiresAt).run();
  await env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), user.id).run();
  ctx.waitUntil(env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run());
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function verifyTwoFactorLogin(request, env, url) {
  const body = await readJson(request);
  const challenge = cleanText(body.challenge, 20, 200, "אתגר אימות");
  const code = cleanText(body.code, 6, 6, "קוד אימות");
  const row = await env.DB.prepare(`SELECT c.token_hash,c.user_id,c.expires_at,u.* FROM auth_challenges c
    JOIN users u ON u.id = c.user_id WHERE c.token_hash = ? AND c.purpose = 'login_2fa' AND c.expires_at > ?`)
    .bind(await sha256(challenge), new Date().toISOString()).first();
  if (!row || !row.totp_secret || !(await verifyTotp(row.totp_secret, code))) throw new HttpError(401, "קוד האימות אינו נכון או שפג תוקפו");
  const sessionToken = randomToken(32);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_challenges WHERE token_hash = ?").bind(row.token_hash),
    env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)")
      .bind(await sha256(sessionToken), row.user_id, new Date(Date.now() + SESSION_SECONDS * 1000).toISOString()),
    env.DB.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), new Date().toISOString(), row.user_id)
  ]);
  return json({ user: publicUser(row) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function changePassword(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const currentPassword = validatePassword(body.currentPassword);
  const newPassword = validatePassword(body.newPassword);
  const candidate = await derivePassword(currentPassword, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה הנוכחית אינה נכונה");
  const salt = randomToken(16);
  const hash = await derivePassword(newPassword, salt, PASSWORD_ITERATIONS);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ?, password_iterations = ?, updated_at = ? WHERE id = ?")
      .bind(hash, salt, PASSWORD_ITERATIONS, new Date().toISOString(), user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(user.id, await sha256(cookieValue(request, SESSION_COOKIE)))
  ]);
  return json({ ok: true });
}

async function deleteAccount(request, env, url) {
  const user = await requireUser(request, env);
  if (user.role === "admin") throw new HttpError(400, "מטעמי בטיחות, חשבון מנהל ניתן למחיקה רק לאחר העברת הרשאת הניהול");
  const body = await readJson(request);
  const password = validatePassword(body.password);
  const candidate = await derivePassword(password, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה אינה נכונה");
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function setupTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const secret = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  await env.DB.prepare("UPDATE users SET totp_secret = ?, totp_enabled = 0, updated_at = ? WHERE id = ?")
    .bind(secret, new Date().toISOString(), user.id).run();
  const label = encodeURIComponent(`גמ״ח ברגע:${user.email}`);
  const issuer = encodeURIComponent("גמ״ח ברגע");
  return json({ secret, otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
}

async function confirmTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const fresh = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?").bind(user.id).first();
  if (!fresh?.totp_secret || !(await verifyTotp(fresh.totp_secret, cleanText(body.code, 6, 6, "קוד אימות")))) throw new HttpError(400, "קוד האימות אינו נכון");
  await env.DB.prepare("UPDATE users SET totp_enabled = 1, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function disableTwoFactor(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const candidate = await derivePassword(validatePassword(body.password), user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "הסיסמה אינה נכונה");
  await env.DB.prepare("UPDATE users SET totp_enabled = 0, totp_secret = NULL, updated_at = ? WHERE id = ?").bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function logout(request, env, url) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function listItems(env, url) {
  const params = [];
  const where = ["i.status = 'active'", "i.is_free = 1", "o.status = 'approved'", "o.is_hidden = 0"];
  const query = cleanOptional(url.searchParams.get("q"), 120);
  const category = cleanOptional(url.searchParams.get("category"), 40);
  const city = cleanOptional(url.searchParams.get("city"), 80);
  const requestedDate = cleanOptional(url.searchParams.get("date"), 10);
  const availableOnly = url.searchParams.get("available_only") === "true";
  if (query) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR o.name LIKE ?)");
    const like = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    params.push(like, like, like);
  }
  if (category) { where.push("i.category = ?"); params.push(category); }
  if (city) { where.push("i.city = ?"); params.push(city); }
  if (availableOnly) where.push("i.availability_status = 'available'");
  if (requestedDate) {
    const date = validateDate(requestedDate, "תאריך החיפוש");
    where.push(`(SELECT COUNT(*) FROM loan_requests lr
      WHERE lr.item_id = i.id AND lr.status IN ('approved','collected')
      AND lr.requested_from <= ? AND lr.requested_until >= ?) < i.quantity`);
    params.push(date, date);
  }
  const result = await env.DB.prepare(`
    SELECT i.*, o.id AS org_id, o.name AS org_name, o.verified AS org_verified,
      o.last_active_at AS org_last_active_at,
      (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_review_count,
      MAX(0, i.quantity - (SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr WHERE lr.item_id=i.id AND lr.status IN ('pending','approved','collected'))) AS available_count
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE ${where.join(" AND ")}
    ORDER BY CASE i.availability_status WHEN 'available' THEN 0 ELSE 1 END, i.created_at DESC
    LIMIT 100
  `).bind(...params).all();
  return json({ items: result.results.map(mapItem) });
}

async function getItem(env, id) {
  const row = await env.DB.prepare(`
    SELECT i.*, o.id AS org_id, o.name AS org_name, o.verified AS org_verified,
      o.last_active_at AS org_last_active_at,
      (SELECT ROUND(AVG(r.rating),1) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_rating,
      (SELECT COUNT(*) FROM reviews r WHERE r.organization_id=o.id AND r.status='published') AS org_review_count,
      MAX(0, i.quantity - (SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr WHERE lr.item_id=i.id AND lr.status IN ('pending','approved','collected'))) AS available_count
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND i.status = 'active' AND i.is_free = 1 AND o.status = 'approved' AND o.is_hidden = 0
  `).bind(id).first();
  if (!row) throw new HttpError(404, "הפריט לא נמצא");
  return json({ item: mapItem(row) });
}

async function discovery(env, url) {
  const query = cleanOptional(url.searchParams.get("q"), 80);
  const like = `%${String(query || "").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
  const [categories, cities, suggestions, organizations] = await env.DB.batch([
    env.DB.prepare(`SELECT category,COUNT(*) AS count FROM items WHERE status='active' AND is_free=1 GROUP BY category ORDER BY count DESC`),
    env.DB.prepare(`SELECT city,COUNT(*) AS count FROM items WHERE status='active' AND is_free=1 GROUP BY city ORDER BY count DESC LIMIT 80`),
    env.DB.prepare(`SELECT DISTINCT title FROM items WHERE status='active' AND (?='' OR title LIKE ?) ORDER BY updated_at DESC LIMIT 8`).bind(query || "", like),
    env.DB.prepare(`SELECT o.id,o.name,o.city,o.description,o.verified,o.last_active_at,
      COUNT(DISTINCT i.id) AS item_count,
      ROUND(AVG(r.rating),1) AS rating,COUNT(DISTINCT r.id) AS review_count
      FROM organizations o LEFT JOIN items i ON i.organization_id=o.id AND i.status='active'
      LEFT JOIN reviews r ON r.organization_id=o.id AND r.status='published'
      WHERE o.status='approved' AND o.is_hidden=0 GROUP BY o.id ORDER BY o.verified DESC,item_count DESC LIMIT 100`)
  ]);
  return json({ categories: categories.results, cities: cities.results, suggestions: suggestions.results.map(row => row.title), organizations: organizations.results });
}

async function getPublicOrganization(env, id) {
  const organization = await env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,
    o.address,o.website_url,o.hours_json,o.service_area,o.pickup_options,o.last_active_at,o.verified_phone,o.verified_address,
    ROUND(AVG(r.rating),1) AS rating,COUNT(DISTINCT r.id) AS review_count
    FROM organizations o LEFT JOIN reviews r ON r.organization_id=o.id AND r.status='published'
    WHERE o.id=? AND o.status='approved' AND o.is_hidden=0 GROUP BY o.id`).bind(id).first();
  if (!organization) throw new HttpError(404, "הגמ״ח לא נמצא");
  const [items, reviews] = await env.DB.batch([
    env.DB.prepare(`SELECT i.*,o.id AS org_id,o.name AS org_name,o.verified AS org_verified,o.last_active_at AS org_last_active_at,
      NULL AS org_rating,0 AS org_review_count,i.quantity AS available_count FROM items i JOIN organizations o ON o.id=i.organization_id
      WHERE i.organization_id=? AND i.status='active' ORDER BY i.availability_status,i.updated_at DESC`).bind(id),
    env.DB.prepare(`SELECT r.rating,r.comment,r.created_at,u.full_name AS author_name FROM reviews r JOIN users u ON u.id=r.author_id
      WHERE r.organization_id=? AND r.status='published' ORDER BY r.created_at DESC LIMIT 30`).bind(id)
  ]);
  return json({ organization: { ...organization, verified: Boolean(organization.verified), verified_phone: Boolean(organization.verified_phone), verified_address: Boolean(organization.verified_address), hours: safeJsonObject(organization.hours_json), pickupOptions: parseJsonArray(organization.pickup_options) }, items: items.results.map(mapItem), reviews: reviews.results });
}

async function toggleSavedOrganization(request, env, organizationId, save) {
  const user = await requireUser(request, env);
  const exists = await env.DB.prepare("SELECT id FROM organizations WHERE id=? AND status='approved'").bind(organizationId).first();
  if (!exists) throw new HttpError(404, "הגמ״ח לא נמצא");
  if (save) await env.DB.prepare("INSERT OR IGNORE INTO saved_organizations(user_id,organization_id) VALUES (?,?)").bind(user.id, organizationId).run();
  else await env.DB.prepare("DELETE FROM saved_organizations WHERE user_id=? AND organization_id=?").bind(user.id, organizationId).run();
  return json({ saved: save });
}

async function listHelpRequests(env, url) {
  const city = cleanOptional(url.searchParams.get("city"), 80);
  const category = cleanOptional(url.searchParams.get("category"), 40);
  const where = ["h.status='open'"]; const params = [];
  if (city) { where.push("h.city=?"); params.push(city); }
  if (category) { where.push("h.category=?"); params.push(category); }
  const result = await env.DB.prepare(`SELECT h.id,h.title,h.description,h.category,h.city,h.urgency,h.created_at,u.full_name AS requester_name
    FROM help_requests h JOIN users u ON u.id=h.requester_id WHERE ${where.join(" AND ")} ORDER BY h.urgency='urgent' DESC,h.created_at DESC LIMIT 100`).bind(...params).all();
  return json({ requests: result.results });
}

async function createHelpRequest(request, env) {
  const user = await requireUser(request, env); const body = await readJson(request);
  const category = cleanOptional(body.category, 40); if (category && !CATEGORIES.has(category)) throw new HttpError(400, "קטגוריה אינה תקינה");
  const urgency = body.urgency === "urgent" ? "urgent" : "normal"; const id = crypto.randomUUID();
  const values = [id,user.id,cleanText(body.title,2,120,"מה צריך"),cleanText(body.description,10,800,"תיאור"),category,cleanText(body.city,2,80,"עיר"),urgency];
  await env.DB.prepare("INSERT INTO help_requests(id,requester_id,title,description,category,city,urgency) VALUES (?,?,?,?,?,?,?)").bind(...values).run();
  return json({ request: { id, status: "open" } }, 201);
}

async function createReview(request, env) {
  const user = await requireUser(request, env); const body = await readJson(request);
  const requestId = cleanText(body.requestId,1,100,"בקשה"); const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new HttpError(400, "הדירוג חייב להיות בין 1 ל־5");
  const row = await env.DB.prepare(`SELECT lr.borrower_id,lr.status,o.id AS organization_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`).bind(requestId).first();
  if (!row || row.borrower_id !== user.id || row.status !== "returned") throw new HttpError(403, "אפשר לדרג רק השאלה שהושלמה");
  try { const id=crypto.randomUUID(); await env.DB.prepare("INSERT INTO reviews(id,request_id,author_id,organization_id,rating,comment) VALUES (?,?,?,?,?,?)").bind(id,requestId,user.id,row.organization_id,rating,cleanOptional(body.comment,800)).run(); return json({ review:{id,rating}},201); }
  catch (error) { if (String(error).toLowerCase().includes("unique")) throw new HttpError(409,"כבר דירגתם את ההשאלה הזו"); throw error; }
}

async function recordAnalytics(request, env) {
  const body = await readJson(request); const allowed = new Set(["search","no_results","item_view","request_created","share"]);
  if (!allowed.has(body.eventType)) throw new HttpError(400,"אירוע אינו תקין");
  const user = await currentUser(request, env);
  await env.DB.prepare("INSERT INTO analytics_events(id,user_id,event_type,query,city,category,entity_id) VALUES (?,?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),user?.id||null,body.eventType,cleanOptional(body.query,120),cleanOptional(body.city,80),cleanOptional(body.category,40),cleanOptional(body.entityId,100)).run();
  return json({ok:true},201);
}

async function addFavorite(request, env, itemId) {
  const user = await requireUser(request, env);
  const item = await env.DB.prepare("SELECT id FROM items WHERE id = ? AND status = 'active'").bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  await env.DB.prepare("INSERT OR IGNORE INTO favorites (user_id,item_id) VALUES (?,?)").bind(user.id, itemId).run();
  return json({ favorite: true });
}

async function removeFavorite(request, env, itemId) {
  const user = await requireUser(request, env);
  await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND item_id = ?").bind(user.id, itemId).run();
  return json({ favorite: false });
}

async function createOrganization(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const id = crypto.randomUUID();
  const category = cleanText(body.primaryCategory, 2, 40, "תחום");
  if (!CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור תחום תקין");
  const values = {
    name: cleanText(body.name, 2, 90, "שם הגמ״ח"),
    city: cleanText(body.city, 2, 80, "עיר"),
    neighborhood: cleanOptional(body.neighborhood, 80),
    description: cleanText(body.description, 10, 600, "תיאור"),
    phone: validatePhone(body.phone),
    address: cleanOptional(body.address, 180),
    serviceArea: cleanOptional(body.serviceArea, 180),
    hoursJson: sanitizeHours(body.hours),
    pickupOptions: sanitizePickupOptions(body.pickupOptions)
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organizations (id,owner_id,name,primary_category,city,neighborhood,description,address,website_url,service_area,hours_json,pickup_options,last_active_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')")
      .bind(id, user.id, values.name, category, values.city, values.neighborhood, values.description, values.address, null, values.serviceArea, values.hoursJson, values.pickupOptions, new Date().toISOString()),
    env.DB.prepare("INSERT INTO organization_contacts (organization_id,contact_phone) VALUES (?,?)").bind(id, values.phone)
  ]);
  return json({ organization: { id, ...values, primaryCategory: category, status: "pending", verified: false } }, 201);
}

async function updateOrganization(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await env.DB.prepare(`SELECT o.*, c.contact_phone FROM organizations o
    LEFT JOIN organization_contacts c ON c.organization_id = o.id
    WHERE o.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!existing) throw new HttpError(404, "הגמ״ח לא נמצא או שאין הרשאה לערוך אותו");

  if (typeof body.hidden === "boolean" && Object.keys(body).length === 1) {
    await env.DB.prepare("UPDATE organizations SET is_hidden = ?, updated_at = ? WHERE id = ?")
      .bind(body.hidden ? 1 : 0, new Date().toISOString(), id).run();
    return json({ id, hidden: body.hidden, status: existing.status });
  }

  const category = cleanText(body.primaryCategory, 2, 40, "תחום");
  if (!CATEGORIES.has(category)) throw new HttpError(400, "נא לבחור תחום תקין");
  const values = {
    name: cleanText(body.name, 2, 90, "שם הגמ״ח"),
    city: cleanText(body.city, 2, 80, "עיר"),
    neighborhood: cleanOptional(body.neighborhood, 80),
    description: cleanText(body.description, 10, 600, "תיאור"),
    phone: validatePhone(body.phone),
    address: cleanOptional(body.address, 180),
    serviceArea: cleanOptional(body.serviceArea, 180), hoursJson: sanitizeHours(body.hours), pickupOptions: sanitizePickupOptions(body.pickupOptions)
  };
  const publicChanged = values.name !== existing.name || category !== existing.primary_category || values.city !== existing.city ||
    (values.neighborhood || null) !== (existing.neighborhood || null) || values.description !== existing.description ||
    (values.address || null) !== (existing.address || null);
  const status = user.role === "admin" || !publicChanged ? existing.status : "pending";
  const verified = status === "approved" ? existing.verified : 0;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE organizations SET name = ?, primary_category = ?, city = ?, neighborhood = ?, description = ?,address=?,website_url=?,service_area=?,hours_json=?,pickup_options=?,last_active_at=?,
      status = ?, verified = ?, updated_at = ? WHERE id = ?`)
      .bind(values.name, category, values.city, values.neighborhood, values.description,values.address,null,values.serviceArea,values.hoursJson,values.pickupOptions,now,status, verified, now, id),
    env.DB.prepare("UPDATE organization_contacts SET contact_phone = ? WHERE organization_id = ?").bind(values.phone, id)
  ]);
  return json({ organization: { id, ...values, primaryCategory: category, status, verified: Boolean(verified), hidden: Boolean(existing.is_hidden) } });
}

function positiveInt(value,fallback,min,max,label){ const n=value===""||value==null?fallback:Number(value); if(!Number.isInteger(n)||n<min||n>max) throw new HttpError(400,`${label} אינו תקין`); return n; }
function moneyAgorot(value){ const n=Number(value); if(!Number.isFinite(n)||n<0||n>1000000) throw new HttpError(400,"סכום הפיקדון אינו תקין"); return Math.round(n*100); }

async function createItem(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const organizationId = cleanText(body.organizationId, 1, 100, "גמ״ח");
  const organization = await env.DB.prepare("SELECT * FROM organizations WHERE id = ? AND owner_id = ? AND status IN ('pending','approved')")
    .bind(organizationId, user.id).first();
  if (!organization) throw new HttpError(403, "אין הרשאה לפרסם בגמ״ח הזה");
  const category = cleanText(body.category, 2, 40, "קטגוריה");
  const condition = cleanText(body.condition, 2, 20, "מצב הפריט");
  if (!CATEGORIES.has(category) || category === "כללי") throw new HttpError(400, "נא לבחור קטגוריה תקינה");
  if (!CONDITIONS.has(condition)) throw new HttpError(400, "נא לבחור מצב פריט תקין");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new HttpError(400, "כמות הפריטים אינה תקינה");
  const title = cleanText(body.title, 2, 120, "שם הפריט");
  const duplicate = await env.DB.prepare("SELECT id FROM items WHERE organization_id = ? AND lower(trim(title)) = lower(trim(?)) AND category = ? AND status != 'archived' LIMIT 1")
    .bind(organizationId, title, category).first();
  if (duplicate) throw new HttpError(409, "כבר קיים בגמ״ח פריט פעיל בשם הזה ובאותה קטגוריה");
  const minLoanMinutes=positiveInt(body.minLoanMinutes,60,1,525600,"משך מינימלי");
  const maxLoanMinutes=positiveInt(body.maxLoanMinutes,10080,1,525600,"משך מקסימלי");
  if(maxLoanMinutes<minLoanMinutes) throw new HttpError(400,"משך ההשאלה המקסימלי חייב להיות גדול או שווה למינימלי");
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO items (id,organization_id,title,category,description,condition,quantity,loan_conditions,city,neighborhood,item_type,subcategory,tags_json,pickup_method,inventory_updated_at,
      min_loan_minutes,max_loan_minutes,booking_notice_minutes,turnaround_minutes,booking_horizon_days,approval_mode,deposit_required,deposit_amount_agorot,
      status,availability_status,is_free,icon,cover_color)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','available',1,'box','#e6f2ef')
  `).bind(
    id,
    organizationId,
    title,
    category,
    cleanText(body.description, 10, 1200, "תיאור"),
    condition,
    quantity,
    cleanOptional(body.loanConditions, 300),
    organization.city,
    organization.neighborhood,
    sanitizeItemType(body.itemType), cleanOptional(body.subcategory, 80), JSON.stringify(sanitizeTags(body.tags)), sanitizePickupMethod(body.pickupMethod), new Date().toISOString(),
    minLoanMinutes, maxLoanMinutes,
    positiveInt(body.bookingNoticeMinutes,0,0,525600,"זמן התראה"), positiveInt(body.turnaroundMinutes,0,0,10080,"זמן התארגנות"),
    positiveInt(body.bookingHorizonDays,365,1,1095,"טווח הזמנה"), body.approvalMode==="automatic"?"automatic":"manual",
    body.depositRequired?1:0, body.depositRequired?moneyAgorot(body.depositAmount):0
  ).run();
  return json({ item: { id, status: "pending" } }, 201);
}

async function updateItem(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const existing = await env.DB.prepare(`SELECT i.*, o.owner_id, o.city AS org_city, o.neighborhood AS org_neighborhood
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!existing) throw new HttpError(404, "הפריט לא נמצא או שאין הרשאה לערוך אותו");

  if (typeof body.archived === "boolean" && Object.keys(body).length === 1) {
    if (body.archived) {
      const active = await env.DB.prepare("SELECT id FROM loan_requests WHERE item_id = ? AND status IN ('pending','approved','collected') LIMIT 1").bind(id).first();
      if (active) throw new HttpError(409, "אי אפשר להסתיר פריט בזמן שיש לו בקשה או השאלה פעילה");
    }
    const status = body.archived ? "archived" : "pending";
    await env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?").bind(status, new Date().toISOString(), id).run();
    return json({ id, status });
  }

  const category = cleanText(body.category, 2, 40, "קטגוריה");
  const condition = cleanText(body.condition, 2, 20, "מצב הפריט");
  if (!CATEGORIES.has(category) || category === "כללי") throw new HttpError(400, "נא לבחור קטגוריה תקינה");
  if (!CONDITIONS.has(condition)) throw new HttpError(400, "נא לבחור מצב פריט תקין");
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) throw new HttpError(400, "כמות הפריטים אינה תקינה");
  const values = {
    title: cleanText(body.title, 2, 120, "שם הפריט"),
    description: cleanText(body.description, 10, 1200, "תיאור"),
    loanConditions: cleanOptional(body.loanConditions, 300), itemType: sanitizeItemType(body.itemType), pickupMethod: sanitizePickupMethod(body.pickupMethod),
    subcategory: cleanOptional(body.subcategory,80), tagsJson: JSON.stringify(sanitizeTags(body.tags))
  };
  const changed = values.title !== existing.title || category !== existing.category || values.description !== existing.description ||
    condition !== existing.condition || quantity !== Number(existing.quantity) || (values.loanConditions || null) !== (existing.loan_conditions || null) || values.itemType !== (existing.item_type||"loan") || values.pickupMethod !== (existing.pickup_method||"pickup") || values.subcategory !== (existing.subcategory||null) || values.tagsJson !== (existing.tags_json||"[]");
  const status = user.role === "admin" || !changed ? existing.status : "pending";
  await env.DB.prepare(`UPDATE items SET title = ?, category = ?, description = ?, condition = ?, quantity = ?, loan_conditions = ?,item_type=?,pickup_method=?,subcategory=?,tags_json=?,inventory_updated_at=?,
    city = ?, neighborhood = ?, status = ?, updated_at = ? WHERE id = ?`).bind(
    values.title, category, values.description, condition, quantity, values.loanConditions,values.itemType,values.pickupMethod,values.subcategory,values.tagsJson,new Date().toISOString(),
    existing.org_city, existing.org_neighborhood, status, new Date().toISOString(), id
  ).run();
  const minLoanMinutes=positiveInt(body.minLoanMinutes,Number(existing.min_loan_minutes||60),1,525600,"משך מינימלי");
  const maxLoanMinutes=positiveInt(body.maxLoanMinutes,Number(existing.max_loan_minutes||10080),1,525600,"משך מקסימלי");
  if(maxLoanMinutes<minLoanMinutes) throw new HttpError(400,"משך ההשאלה המקסימלי חייב להיות גדול או שווה למינימלי");
  await env.DB.prepare(`UPDATE items SET min_loan_minutes=?,max_loan_minutes=?,booking_notice_minutes=?,turnaround_minutes=?,
    booking_horizon_days=?,approval_mode=?,deposit_required=?,deposit_amount_agorot=? WHERE id=?`).bind(
    minLoanMinutes,maxLoanMinutes,
    positiveInt(body.bookingNoticeMinutes,Number(existing.booking_notice_minutes||0),0,525600,"זמן התראה"),
    positiveInt(body.turnaroundMinutes,Number(existing.turnaround_minutes||0),0,10080,"זמן התארגנות"),
    positiveInt(body.bookingHorizonDays,Number(existing.booking_horizon_days||365),1,1095,"טווח הזמנה"),
    body.approvalMode==="automatic"?"automatic":"manual",body.depositRequired?1:0,body.depositRequired?moneyAgorot(body.depositAmount):0,id).run();
  return json({ item: { id, status } });
}

async function uploadImages(request, env, itemId) {
  const user = await requireUser(request, env);
  const item = await env.DB.prepare(`
    SELECT i.id, i.image_urls FROM items i
    JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')
  `).bind(itemId, user.id, user.role).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא או שאין הרשאה לערוך אותו");
  const form = await request.formData();
  const files = form.getAll("images").filter(value => value instanceof File);
  const existing = parseJsonArray(item.image_urls);
  if (!files.length) throw new HttpError(400, "לא נבחרו תמונות");
  if (files.length + existing.length > 4) throw new HttpError(400, "אפשר להעלות עד 4 תמונות לפריט");
  const uploadedKeys = [];
  try {
    for (const file of files) {
      const extension = IMAGE_TYPES.get(file.type);
      if (!extension) throw new HttpError(400, "אפשר להעלות JPG, PNG או WebP בלבד");
      if (file.size > 5 * 1024 * 1024) throw new HttpError(400, "כל תמונה יכולה להיות עד 5MB");
      const key = `items/${user.id}/${itemId}/${crypto.randomUUID()}.${extension}`;
      await env.ITEM_IMAGES.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: "public, max-age=31536000, immutable" } });
      uploadedKeys.push(key);
    }
    const urls = [...existing, ...uploadedKeys.map(key => `/media/${key}`)];
    await env.DB.prepare("UPDATE items SET image_urls = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(urls), new Date().toISOString(), itemId).run();
    return json({ imageUrls: urls }, 201);
  } catch (error) {
    await Promise.all(uploadedKeys.map(key => env.ITEM_IMAGES.delete(key)));
    throw error;
  }
}

function validateLoanDateTime(value, label) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text) || Number.isNaN(Date.parse(text))) throw new HttpError(400, `${label} אינו תקין`);
  return text;
}
function loanMinutes(from, until) { return Math.round((Date.parse(until) - Date.parse(from)) / 60000); }
function assertAllowedPickupReturnTime(value, label) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new HttpError(400, `${label} אינו תקין`);
  const [,year,month,dayOfMonth,hour,minute]=match;
  // datetime-local values are Israel wall-clock appointments. Derive only the
  // weekday in UTC so DST/host timezone can never shift the stated local hour.
  const day = new Date(Date.UTC(Number(year),Number(month)-1,Number(dayOfMonth))).getUTCDay();
  const minutes = Number(hour)*60+Number(minute);
  if ((day === 5 && minutes >= 17*60) || (day === 6 && minutes < 21*60)) {
    throw new HttpError(400, `לא ניתן לקבוע ${label} מיום שישי בשעה 17:00 ועד שבת בשעה 21:00`);
  }
}
async function availableQuantityForRange(env,itemId,from,until,turnaroundMinutes=0,excludeRequestId=null) {
  const item = await env.DB.prepare("SELECT quantity FROM items WHERE id=?").bind(itemId).first();
  if (!item) return 0;
  const pad = Math.max(0,Number(turnaroundMinutes)||0);
  const paddedFrom = new Date(Date.parse(from)-pad*60000).toISOString().slice(0,16);
  const paddedUntil = new Date(Date.parse(until)+pad*60000).toISOString().slice(0,16);
  const booked = await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS used FROM loan_requests
    WHERE item_id=? AND status IN ('pending','approved','collected') AND id<>?
      AND requested_from < ? AND requested_until > ?`).bind(itemId,excludeRequestId||"",paddedUntil,paddedFrom).first();
  const blocked = await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS used FROM inventory_blocks
    WHERE item_id=? AND starts_at < ? AND ends_at > ?`).bind(itemId,paddedUntil,paddedFrom).first();
  return Math.max(0,Number(item.quantity)-Number(booked?.used||0)-Number(blocked?.used||0));
}
async function ownedItem(request,env,itemId){
  const user=await requireUser(request,env);
  const item=await env.DB.prepare(`SELECT i.*,o.owner_id FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?`).bind(itemId).first();
  if(!item||(item.owner_id!==user.id&&user.role!=="admin")) throw new HttpError(403,"אין הרשאה לנהל את המלאי הזה");
  return {user,item};
}
async function getInventoryManagement(request,env,itemId){
  const {item}=await ownedItem(request,env,itemId);
  const blocks=await env.DB.prepare("SELECT id,starts_at,ends_at,quantity,reason,created_at FROM inventory_blocks WHERE item_id=? ORDER BY starts_at").bind(itemId).all();
  const units=await env.DB.prepare("SELECT id,unit_code,status,note,created_at,updated_at FROM inventory_units WHERE item_id=? ORDER BY created_at").bind(itemId).all();
  return json({totalQuantity:Number(item.quantity),blocks:blocks.results||[],units:units.results||[]});
}
async function addInventoryBlock(request,env,itemId){
  const {user,item}=await ownedItem(request,env,itemId); const body=await readJson(request);
  const from=validateLoanDateTime(body.startsAt,"תחילת החסימה"),until=validateLoanDateTime(body.endsAt,"סיום החסימה");
  if(Date.parse(until)<=Date.parse(from)) throw new HttpError(400,"סיום החסימה חייב להיות אחרי תחילתה");
  const quantity=positiveInt(body.quantity,1,1,Number(item.quantity),"כמות חסומה");
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO inventory_blocks(id,item_id,starts_at,ends_at,quantity,reason,created_by) VALUES(?,?,?,?,?,?,?)")
    .bind(id,itemId,from,until,quantity,cleanOptional(body.reason,300),user.id).run();
  return json({block:{id,starts_at:from,ends_at:until,quantity}},201);
}
async function deleteInventoryBlock(request,env,id){
  const user=await requireUser(request,env);
  const row=await env.DB.prepare(`SELECT b.id,o.owner_id FROM inventory_blocks b JOIN items i ON i.id=b.item_id JOIN organizations o ON o.id=i.organization_id WHERE b.id=?`).bind(id).first();
  if(!row||(row.owner_id!==user.id&&user.role!=="admin")) throw new HttpError(403,"אין הרשאה למחוק חסימה זו");
  const itemRow=await env.DB.prepare("SELECT item_id FROM inventory_blocks WHERE id=?").bind(id).first();
  await env.DB.prepare("DELETE FROM inventory_blocks WHERE id=?").bind(id).run();
  if(itemRow) await advanceWaitlist(env,itemRow.item_id);
  return json({ok:true});
}
async function joinWaitlist(request,env,itemId){
  const user=await requireUser(request,env); const body=await readJson(request);
  const from=validateLoanDateTime(body.requestedFrom,"מועד האיסוף"),until=validateLoanDateTime(body.requestedUntil,"מועד ההחזרה");
  assertAllowedPickupReturnTime(from,"האיסוף"); assertAllowedPickupReturnTime(until,"ההחזרה");
  if(Date.parse(until)<=Date.parse(from)) throw new HttpError(400,"מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  const item=await env.DB.prepare("SELECT quantity FROM items WHERE id=? AND status='active'").bind(itemId).first(); if(!item) throw new HttpError(404,"הפריט לא נמצא");
  const quantity=positiveInt(body.quantity,1,1,Number(item.quantity),"כמות");
  const available=await availableQuantityForRange(env,itemId,from,until,0,null);
  if(available>=quantity) throw new HttpError(409,"הפריט זמין כרגע; אפשר לבצע הזמנה במקום להצטרף לרשימת המתנה");
  const existing=await env.DB.prepare("SELECT id FROM waitlist_entries WHERE item_id=? AND user_id=? AND requested_from=? AND requested_until=? AND status='waiting'").bind(itemId,user.id,from,until).first();
  if(existing) return json({entry:{id:existing.id,status:"waiting"}});
  const id=crypto.randomUUID(); await env.DB.prepare("INSERT INTO waitlist_entries(id,item_id,user_id,requested_from,requested_until,quantity) VALUES(?,?,?,?,?,?)").bind(id,itemId,user.id,from,until,quantity).run();
  return json({entry:{id,status:"waiting"}},201);
}
async function advanceWaitlist(env,itemId){
  const item=await env.DB.prepare("SELECT turnaround_minutes FROM items WHERE id=?").bind(itemId).first(); if(!item) return;
  const entries=await env.DB.prepare("SELECT id,user_id,requested_from,requested_until,quantity FROM waitlist_entries WHERE item_id=? AND status='waiting' ORDER BY created_at ASC").bind(itemId).all();
  const entry=(entries.results||[])[0];
  if(!entry) return;
  const available=await availableQuantityForRange(env,itemId,entry.requested_from,entry.requested_until,Number(item.turnaround_minutes||0),null);
  if(available>=Number(entry.quantity)){
    const changed=await env.DB.prepare("UPDATE waitlist_entries SET status='notified' WHERE id=? AND status='waiting'").bind(entry.id).run();
    if(changed.meta.changes) await notificationStatement(env,entry.user_id,"waitlist","הפריט שביקשתם זמין","התפנה מלאי לטווח שביקשתם. אתם ראשונים בתור לטווח הזה; ניתן להיכנס לפריט ולבצע הזמנה.",null).run();
  }
}

async function checkItemAvailability(env,itemId,url) {
  const item = await env.DB.prepare(`SELECT i.id,i.quantity,i.min_loan_minutes,i.max_loan_minutes,i.turnaround_minutes,
    i.deposit_required,i.deposit_amount_agorot,i.approval_mode,i.availability_status
    FROM items i JOIN organizations o ON o.id=i.organization_id
    WHERE i.id=? AND i.status='active' AND o.status='approved'`).bind(itemId).first();
  if (!item) throw new HttpError(404,"הפריט לא נמצא");
  const from=validateLoanDateTime(url.searchParams.get("from"),"מועד האיסוף");
  const until=validateLoanDateTime(url.searchParams.get("until"),"מועד ההחזרה");
  assertAllowedPickupReturnTime(from,"האיסוף"); assertAllowedPickupReturnTime(until,"ההחזרה");
  const duration=loanMinutes(from,until);
  if(duration<=0) throw new HttpError(400,"מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  const available=item.availability_status==="unavailable"?0:await availableQuantityForRange(env,itemId,from,until,item.turnaround_minutes,null);
  let nextAvailableAt=null;
  if(!available && item.availability_status!=="unavailable"){
    const duration=Math.max(1,loanMinutes(from,until));
    let cursor=from;
    for(let attempt=0;attempt<24;attempt++){
      const overlap=await env.DB.prepare(`SELECT MIN(requested_until) AS next_end FROM loan_requests
        WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from < ? AND requested_until > ?`)
        .bind(itemId,new Date(Date.parse(cursor)+duration*60000).toISOString().slice(0,16),cursor).first();
      if(!overlap?.next_end) break;
      cursor=String(overlap.next_end).slice(0,16);
      const end=new Date(Date.parse(cursor)+duration*60000).toISOString().slice(0,16);
      try { assertAllowedPickupReturnTime(cursor,"האיסוף"); assertAllowedPickupReturnTime(end,"ההחזרה"); }
      catch { const d=new Date(cursor); const day=d.getUTCDay(); if(day===5){d.setUTCDate(d.getUTCDate()+1);d.setUTCHours(21,0,0,0);} else if(day===6){d.setUTCHours(21,0,0,0);} cursor=d.toISOString().slice(0,16); continue; }
      if(await availableQuantityForRange(env,itemId,cursor,end,item.turnaround_minutes,null)>0){nextAvailableAt=cursor;break;}
    }
  }
  return json({available:available>0,availableQuantity:available,totalQuantity:Number(item.quantity),nextAvailableAt,
    minLoanMinutes:Number(item.min_loan_minutes),maxLoanMinutes:Number(item.max_loan_minutes),
    depositRequired:Boolean(item.deposit_required),depositAmountAgorot:Number(item.deposit_amount_agorot),approvalMode:item.approval_mode});
}

async function createLoanRequest(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const itemId = cleanText(body.itemId, 1, 100, "פריט");
  const item = await env.DB.prepare(`
    SELECT i.id,i.title,i.quantity,i.availability_status,i.min_loan_minutes,i.max_loan_minutes,
      i.booking_notice_minutes,i.booking_horizon_days,i.turnaround_minutes,i.approval_mode,
      i.deposit_required,i.deposit_amount_agorot,o.owner_id
    FROM items i JOIN organizations o ON o.id=i.organization_id
    WHERE i.id=? AND i.status='active' AND i.is_free=1 AND o.status='approved'
  `).bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  if (item.owner_id === user.id) throw new HttpError(400, "אי אפשר להזמין פריט מהגמ״ח שלכם");
  if (item.availability_status === "unavailable") throw new HttpError(409, "הפריט אינו זמין כרגע");

  const from = validateLoanDateTime(body.requestedFrom, "מועד האיסוף");
  const until = validateLoanDateTime(body.requestedUntil, "מועד ההחזרה");
  assertAllowedPickupReturnTime(from, "האיסוף");
  assertAllowedPickupReturnTime(until, "ההחזרה");
  const duration = loanMinutes(from, until);
  if (duration <= 0) throw new HttpError(400, "מועד ההחזרה חייב להיות אחרי מועד האיסוף");
  if (duration < Number(item.min_loan_minutes)) throw new HttpError(400, `משך ההשאלה המינימלי הוא ${item.min_loan_minutes} דקות`);
  if (duration > Number(item.max_loan_minutes)) throw new HttpError(400, `משך ההשאלה המקסימלי הוא ${item.max_loan_minutes} דקות`);
  const now = Date.now();
  const fromMs = Date.parse(from);
  if (fromMs < now + Number(item.booking_notice_minutes) * 60000) throw new HttpError(400, "מועד האיסוף מוקדם מדי לפי תנאי הגמ״ח");
  if (fromMs > now + Number(item.booking_horizon_days) * 86400000) throw new HttpError(400, "מועד האיסוף רחוק מדי לפי תנאי הגמ״ח");

  const quantity = Number(body.quantity || 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > Number(item.quantity)) throw new HttpError(400, "הכמות המבוקשת אינה תקינה");
  if (Number(item.deposit_required) && body.depositAccepted !== true) throw new HttpError(400, "יש לאשר את תנאי הפיקדון לפני שליחת ההזמנה");

  const available = await availableQuantityForRange(env,itemId,from,until,Number(item.turnaround_minutes),null);
  if (available < quantity) throw new HttpError(409, available > 0 ? `נותרו רק ${available} יחידות בטווח שבחרתם` : "הפריט אינו זמין בטווח שבחרתם");

  const id = crypto.randomUUID();
  const status = item.approval_mode === "automatic" ? "approved" : "pending";
  const acceptedAt = Number(item.deposit_required) ? new Date().toISOString() : null;
  const result = await env.DB.prepare(`
    INSERT INTO loan_requests
      (id,item_id,borrower_id,requested_from,requested_until,phone,note,status,quantity,
       deposit_required_snapshot,deposit_amount_agorot_snapshot,deposit_terms_accepted_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?
    WHERE (
      SELECT COALESCE(SUM(lr.quantity),0) FROM loan_requests lr
      WHERE lr.item_id=? AND lr.status IN ('pending','approved','collected')
        AND lr.requested_from < ? AND lr.requested_until > ?
    ) + ? <= ?
  `).bind(id,itemId,user.id,from,until,validatePhone(body.phone),cleanOptional(body.note,500),status,quantity,
    Number(item.deposit_required),Number(item.deposit_amount_agorot),acceptedAt,
    itemId,until,from,quantity,Number(item.quantity)).run();
  if (!result.meta.changes) throw new HttpError(409, "המלאי נתפס הרגע על ידי הזמנה אחרת. בחרו מועד אחר");

  await env.DB.batch([
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,user.id,"created",JSON.stringify({from,until,quantity,status})),
    notificationStatement(env,item.owner_id,"request","בקשת השאלה חדשה",`${user.full_name} ביקש/ה ${quantity} יחידות של ${item.title}`,id)
  ]);
  return json({ request:{id,status}, availability:{remaining:Math.max(0,available-quantity)} },201);
}

async function dashboard(request, env) {
  const user = await requireUser(request, env);
  const [organizationsResult, itemsResult, requestsResult, favoritesResult, savedOrganizationsResult, helpRequestsResult] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,o.is_hidden,o.created_at,c.contact_phone,o.address,o.website_url,o.service_area,o.hours_json,o.pickup_options
      FROM organizations o LEFT JOIN organization_contacts c ON c.organization_id = o.id WHERE o.owner_id = ? ORDER BY o.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT i.id,i.organization_id,i.title,i.category,i.description,i.condition,i.quantity,i.loan_conditions,i.image_urls,
      i.status,i.availability_status,i.created_at,o.name AS org_name,i.item_type,i.subcategory,i.tags_json,i.pickup_method,i.inventory_updated_at,
      i.min_loan_minutes,i.max_loan_minutes,i.booking_notice_minutes,i.turnaround_minutes,i.booking_horizon_days,i.approval_mode,i.deposit_required,i.deposit_amount_agorot
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE o.owner_id = ? ORDER BY i.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT lr.id,lr.item_id,lr.status,lr.requested_from,lr.requested_until,lr.phone,lr.note,lr.manager_note,lr.created_at,lr.quantity,lr.deposit_required_snapshot,lr.deposit_amount_agorot_snapshot,
      i.title AS item_title,o.name AS org_name,o.owner_id,u.full_name AS borrower_name,
      CASE WHEN o.owner_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction,
      CASE WHEN lr.borrower_id = ? AND lr.status IN ('approved','collected') THEN c.contact_phone ELSE NULL END AS contact_phone
      FROM loan_requests lr JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id
      JOIN users u ON u.id = lr.borrower_id LEFT JOIN organization_contacts c ON c.organization_id = o.id
      WHERE lr.borrower_id = ? OR o.owner_id = ? ORDER BY lr.created_at DESC`).bind(user.id, user.id, user.id, user.id),
    env.DB.prepare("SELECT item_id FROM favorites WHERE user_id = ?").bind(user.id),
    env.DB.prepare(`SELECT s.organization_id,o.name,o.city,o.verified FROM saved_organizations s JOIN organizations o ON o.id=s.organization_id WHERE s.user_id=? ORDER BY s.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT id,title,description,category,city,urgency,status,created_at FROM help_requests WHERE requester_id=? ORDER BY created_at DESC`).bind(user.id)
  ]);
  const organizations = organizationsResult.results.map(row => ({ ...row, verified: Boolean(row.verified), is_hidden: Boolean(row.is_hidden), hours: safeJsonObject(row.hours_json), pickupOptions: parseJsonArray(row.pickup_options) }));
  const items = itemsResult.results.map(row => ({ ...row, image_urls: parseJsonArray(row.image_urls), tags: parseJsonArray(row.tags_json), organizations: { name: row.org_name } }));
  const requests = requestsResult.results.map(row => ({
    id: row.id,
    status: row.status,
    requested_from: row.requested_from,
    requested_until: row.requested_until,
    note: row.note,
    manager_note: row.manager_note,
    quantity: Number(row.quantity || 1),
    deposit_required: Boolean(row.deposit_required_snapshot),
    deposit_amount_agorot: Number(row.deposit_amount_agorot_snapshot || 0),
    direction: row.direction,
    borrower_name: row.direction === "incoming" ? row.borrower_name : undefined,
    borrower_phone: row.direction === "incoming" ? row.phone : undefined,
    contact_phone: row.contact_phone,
    items: { title: row.item_title, organizations: { name: row.org_name } }
  }));
  return json({
    user: publicUser(user),
    organizations,
    items,
    requests,
    favorites: favoritesResult.results.map(row => row.item_id),
    savedOrganizations: savedOrganizationsResult.results,
    helpRequests: helpRequestsResult.results,
    stats: {
      activeRequests: requests.filter(row => ["pending", "approved", "collected"].includes(row.status)).length,
      items: items.length,
      completed: requests.filter(row => row.status === "returned").length
    }
  });
}

async function updateRequestStatus(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const target = cleanText(body.status, 2, 20, "סטטוס");
  const row = await env.DB.prepare(`SELECT lr.status,lr.borrower_id,lr.item_id,lr.requested_from,lr.requested_until,lr.manager_note,lr.quantity AS requested_quantity,
    i.title AS item_title,i.quantity,i.turnaround_minutes,o.owner_id FROM loan_requests lr
    JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id WHERE lr.id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "הבקשה לא נמצאה");
  let allowed = false;
  if (row.borrower_id === user.id && row.status === "pending" && target === "cancelled") allowed = true;
  if (row.owner_id === user.id || user.role === "admin") {
    allowed = allowed || (row.status === "pending" && ["approved", "declined"].includes(target));
    allowed = allowed || (row.status === "approved" && target === "collected");
    allowed = allowed || (row.status === "collected" && target === "returned");
  }
  if (!allowed) throw new HttpError(403, "מעבר הסטטוס הזה אינו מורשה");
  let managerNote = row.manager_note;
  if (target === "declined") managerNote = cleanText(body.managerNote, 3, 500, "סיבת הדחייה");
  else if (target === "approved") managerNote = cleanOptional(body.managerNote, 500);
  const now = new Date().toISOString();
  let result;
  if (target === "approved") {
    result = await env.DB.prepare(`UPDATE loan_requests SET status = 'approved', manager_note = ?, updated_at = ?
      WHERE id = ? AND status = 'pending' AND (
        SELECT COALESCE(SUM(other.quantity),0) FROM loan_requests other
        WHERE other.item_id = ? AND other.id <> ? AND other.status IN ('pending','approved','collected')
          AND other.requested_from < ? AND other.requested_until > ?
      ) + ? <= ?`).bind(managerNote, now, id, row.item_id, id, row.requested_until, row.requested_from, Number(row.requested_quantity||1), Number(row.quantity)).run();
    if (!result.meta.changes) throw new HttpError(409, "כל היחידות תפוסות בתאריכים האלה. אפשר לדחות את הבקשה או לתאם תאריכים אחרים בצ׳אט");
  } else {
    result = await env.DB.prepare("UPDATE loan_requests SET status = ?, manager_note = ?, collected_at = CASE WHEN ?='collected' THEN ? ELSE collected_at END, returned_at = CASE WHEN ?='returned' THEN ? ELSE returned_at END, cancelled_at = CASE WHEN ?='cancelled' THEN ? ELSE cancelled_at END, updated_at = ? WHERE id = ? AND status = ?")
      .bind(target, managerNote, target, now, target, now, target, now, now, id, row.status).run();
    if (!result.meta.changes) throw new HttpError(409, "הבקשה כבר עודכנה. רעננו את האזור האישי");
  }

  const statusText = { approved: "אושרה", declined: "נדחתה", cancelled: "בוטלה", collected: "סומנה כנאספה", returned: "סומנה כהוחזרה" }[target] || "עודכנה";
  const recipientId = row.borrower_id === user.id ? row.owner_id : row.borrower_id;
  await env.DB.batch([
    notificationStatement(env, recipientId, "status", `הבקשה ${statusText}`, `הבקשה עבור ${row.item_title} ${statusText}.`, id),
    env.DB.prepare("INSERT INTO loan_request_events(id,request_id,actor_id,event_type,details_json) VALUES (?,?,?,?,?)")
      .bind(crypto.randomUUID(),id,user.id,target,JSON.stringify({managerNote:managerNote||null}))
  ]);
  if(["declined","cancelled","returned"].includes(target)) await advanceWaitlist(env,row.item_id);
  return json({ id, status: target, managerNote });
}

async function updateAvailability(request, env, id) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const availability = cleanText(body.availabilityStatus, 2, 20, "זמינות");
  if (!["available", "unavailable", "reserved"].includes(availability)) throw new HttpError(400, "מצב הזמינות אינו תקין");
  const item = await env.DB.prepare(`SELECT i.id FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND (o.owner_id = ? OR ? = 'admin')`).bind(id, user.id, user.role).first();
  if (!item) throw new HttpError(403, "אין הרשאה לערוך את הפריט");
  await env.DB.prepare("UPDATE items SET availability_status = ?, updated_at = ? WHERE id = ?")
    .bind(availability, new Date().toISOString(), id).run();
  return json({ id, availabilityStatus: availability });
}

async function getRequestParticipant(request, env, requestId, { allowAdmin = true } = {}) {
  const user = await requireUser(request, env);
  const row = await env.DB.prepare(`SELECT lr.id,lr.borrower_id,lr.status,i.title AS item_title,o.owner_id,o.name AS org_name
    FROM loan_requests lr JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id
    WHERE lr.id = ?`).bind(requestId).first();
  if (!row) throw new HttpError(404, "בקשת ההשאלה לא נמצאה");
  const participant = row.borrower_id === user.id || row.owner_id === user.id;
  if (!participant && !(allowAdmin && user.role === "admin")) throw new HttpError(403, "השיחה זמינה רק לצדדים בבקשת ההשאלה");
  return { user, row, participant };
}

async function listRequestMessages(request, env, requestId) {
  const { user, row } = await getRequestParticipant(request, env, requestId);
  const result = await env.DB.prepare(`SELECT m.id,m.body,m.created_at,m.sender_id,u.full_name AS sender_name
    FROM request_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.request_id = ? ORDER BY m.created_at ASC LIMIT 300`).bind(requestId).all();
  return json({
    request: { id: row.id, status: row.status, itemTitle: row.item_title, organizationName: row.org_name },
    messages: result.results.map(message => ({ ...message, isMine: message.sender_id === user.id }))
  });
}

async function createRequestMessage(request, env, requestId) {
  const { user, row, participant } = await getRequestParticipant(request, env, requestId, { allowAdmin: false });
  if (!participant) throw new HttpError(403, "רק השואל ומנהל הגמ״ח יכולים לשלוח הודעות");
  const body = await readJson(request);
  const message = cleanText(body.message, 1, 1000, "הודעה");
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS count FROM request_messages
    WHERE sender_id = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 minute')`).bind(user.id).first();
  if (Number(recent?.count || 0) >= 10) throw new HttpError(429, "נשלחו יותר מדי הודעות. נסו שוב בעוד דקה");
  const id = crypto.randomUUID();
  const recipientId = row.borrower_id === user.id ? row.owner_id : row.borrower_id;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages (id,request_id,sender_id,body) VALUES (?,?,?,?)").bind(id, requestId, user.id, message),
    notificationStatement(env, recipientId, "message", `הודעה חדשה על ${row.item_title}`, `${user.full_name}: ${message.slice(0, 120)}`, requestId)
  ]);
  return json({ message: { id, request_id: requestId, sender_id: user.id, sender_name: user.full_name, body: message, isMine: true, created_at: new Date().toISOString() } }, 201);
}

async function listNotifications(request, env) {
  const user = await requireUser(request, env);
  const [items, unread] = await env.DB.batch([
    env.DB.prepare(`SELECT id,type,title,body,request_id,read_at,created_at FROM notifications
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`).bind(user.id),
    env.DB.prepare("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL").bind(user.id)
  ]);
  return json({ notifications: items.results, unread: Number(unread.results[0]?.count || 0) });
}

async function markNotificationsRead(request, env) {
  const user = await requireUser(request, env);
  await env.DB.prepare("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL")
    .bind(new Date().toISOString(), user.id).run();
  return json({ ok: true });
}

async function createReport(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const itemId = cleanText(body.itemId, 1, 100, "פריט");
  const reason = cleanText(body.reason, 2, 30, "סיבת הדיווח");
  if (!["incorrect", "unsafe", "commercial", "unavailable", "other"].includes(reason)) throw new HttpError(400, "סיבת הדיווח אינה תקינה");
  const item = await env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  try {
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO reports (id,reporter_id,item_id,reason,details) VALUES (?,?,?,?,?)")
      .bind(id, user.id, itemId, reason, cleanOptional(body.details, 800)).run();
    return json({ report: { id, status: "pending" } }, 201);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new HttpError(409, "כבר שלחתם דיווח פתוח על הפריט הזה");
    throw error;
  }
}

async function adminPending(request, env) {
  await requireAdmin(request, env);
  const [organizations, items, reports] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,o.created_at,u.full_name AS owner_name,u.email AS owner_email
      FROM organizations o LEFT JOIN users u ON u.id = o.owner_id WHERE o.status = 'pending' ORDER BY o.created_at ASC`),
    env.DB.prepare(`SELECT i.id,i.title,i.category,i.description,i.condition,i.quantity,i.status,i.created_at,o.name AS org_name,o.status AS org_status
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE i.status = 'pending' ORDER BY i.created_at ASC`),
    env.DB.prepare(`SELECT r.id,r.reason,r.details,r.created_at,i.title AS item_title,u.full_name AS reporter_name,u.email AS reporter_email
      FROM reports r JOIN items i ON i.id = r.item_id JOIN users u ON u.id = r.reporter_id
      WHERE r.status = 'pending' ORDER BY r.created_at ASC`)
  ]);
  return json({ organizations: organizations.results, items: items.results, reports: reports.results });
}

async function getSiteSettings(env) {
  const row = await env.DB.prepare("SELECT site_name,tagline,hero_title,hero_description,primary_color,secondary_color,accent_color,font_family,base_font_size,logo_url,updated_at FROM site_settings WHERE id = 1").first();
  return json({ settings: row });
}

async function adminOverview(request, env) {
  await requireAdmin(request, env);
  const [users, organizations, items, requests, audit] = await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM users"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM organizations"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM items"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM loan_requests"),
    env.DB.prepare("SELECT a.id,a.action,a.entity_type,a.entity_id,a.created_at,u.full_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.created_at DESC LIMIT 30")
  ]);
  return json({ stats: { users: users.results[0]?.count || 0, organizations: organizations.results[0]?.count || 0, items: items.results[0]?.count || 0, requests: requests.results[0]?.count || 0 }, audit: audit.results });
}

async function adminAnalytics(request, env) {
  await requireAdmin(request, env);
  const [events, searches, cities, categories, success] = await env.DB.batch([
    env.DB.prepare(`SELECT event_type,COUNT(*) AS count FROM analytics_events WHERE created_at>=datetime('now','-30 days') GROUP BY event_type`),
    env.DB.prepare(`SELECT query,COUNT(*) AS count FROM analytics_events WHERE event_type IN ('search','no_results') AND query IS NOT NULL GROUP BY query ORDER BY count DESC LIMIT 30`),
    env.DB.prepare(`SELECT city,COUNT(*) AS count FROM analytics_events WHERE city IS NOT NULL GROUP BY city ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT category,COUNT(*) AS count FROM analytics_events WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 20`),
    env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN status IN ('approved','collected','returned') THEN 1 ELSE 0 END) AS successful FROM loan_requests`)
  ]);
  return json({ events:events.results, searches:searches.results, cities:cities.results, categories:categories.results, matching:{ total:Number(success.results[0]?.total||0), successful:Number(success.results[0]?.successful||0) } });
}

async function adminSiteSettings(request, env) {
  await requireAdmin(request, env);
  const [settings, versions] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM site_settings WHERE id = 1"),
    env.DB.prepare("SELECT v.id,v.created_at,u.full_name AS created_by_name FROM site_setting_versions v LEFT JOIN users u ON u.id = v.created_by ORDER BY v.created_at DESC LIMIT 50")
  ]);
  return json({ settings: settings.results[0], versions: versions.results });
}

async function updateSiteSettings(request, env) {
  const user = await requireAdmin(request, env);
  const current = await env.DB.prepare("SELECT * FROM site_settings WHERE id = 1").first();
  if (!current) throw new HttpError(500, "הגדרות האתר אינן זמינות");
  const body = await readJson(request);
  const next = {
    site_name: cleanText(body.siteName, 2, 60, "שם האתר"), tagline: cleanText(body.tagline, 2, 140, "סלוגן"),
    hero_title: cleanText(body.heroTitle, 2, 100, "כותרת ראשית"), hero_description: cleanText(body.heroDescription, 10, 300, "תיאור ראשי"),
    primary_color: validateColor(body.primaryColor), secondary_color: validateColor(body.secondaryColor), accent_color: validateColor(body.accentColor),
    font_family: validateFont(body.fontFamily), base_font_size: Math.max(14, Math.min(22, Number(body.baseFontSize) || 16)),
    logo_url: validateAssetUrl(body.logoUrl)
  };
  const versionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_setting_versions (id,settings_json,created_by) VALUES (?,?,?)").bind(versionId, JSON.stringify(current), user.id),
    env.DB.prepare(`UPDATE site_settings SET site_name=?,tagline=?,hero_title=?,hero_description=?,primary_color=?,secondary_color=?,accent_color=?,font_family=?,base_font_size=?,logo_url=?,updated_by=?,updated_at=? WHERE id=1`)
      .bind(next.site_name,next.tagline,next.hero_title,next.hero_description,next.primary_color,next.secondary_color,next.accent_color,next.font_family,next.base_font_size,next.logo_url,user.id,new Date().toISOString()),
    auditStatement(env, user.id, "site.settings.update", "site_settings", "1", { versionId })
  ]);
  return json({ settings: next, versionId });
}

async function restoreSiteSettings(request, env, versionId) {
  const user = await requireAdmin(request, env);
  const [version, current] = await Promise.all([
    env.DB.prepare("SELECT settings_json FROM site_setting_versions WHERE id = ?").bind(versionId).first(),
    env.DB.prepare("SELECT * FROM site_settings WHERE id = 1").first()
  ]);
  if (!version) throw new HttpError(404, "הגרסה לא נמצאה");
  const saved = JSON.parse(version.settings_json);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO site_setting_versions (id,settings_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(current), user.id),
    env.DB.prepare(`UPDATE site_settings SET site_name=?,tagline=?,hero_title=?,hero_description=?,primary_color=?,secondary_color=?,accent_color=?,font_family=?,base_font_size=?,logo_url=?,updated_by=?,updated_at=? WHERE id=1`)
      .bind(saved.site_name,saved.tagline,saved.hero_title,saved.hero_description,saved.primary_color,saved.secondary_color,saved.accent_color,saved.font_family,saved.base_font_size,saved.logo_url,user.id,new Date().toISOString()),
    auditStatement(env, user.id, "site.settings.restore", "site_setting_versions", versionId)
  ]);
  return json({ ok: true });
}

async function adminUsers(request, env) {
  await requireAdmin(request, env);
  const result = await env.DB.prepare(`SELECT id,email,full_name,role,email_verified,account_status,totp_enabled,created_at,last_login_at
    FROM users ORDER BY created_at DESC LIMIT 500`).all();
  return json({ users: result.results });
}

async function getPageCustomizations(env) {
  const result = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json,updated_at FROM page_customizations ORDER BY element_key").all();
  return json({ customizations: result.results.map(row => ({ key: row.element_key, text: row.text_content, styles: safeJsonObject(row.styles_json), attributes: safeJsonObject(row.attributes_json), updatedAt: row.updated_at })) });
}

async function savePageCustomization(request, env) {
  const user = await requireAdmin(request, env);
  const body = await readJson(request);
  const key = cleanText(body.key, 2, 500, "מזהה רכיב");
  if (!/^(#[a-z][\w:-]*|(?:[a-z][\w-]*(?::nth-of-type\(\d+\))?)(?:>(?:[a-z][\w-]*(?::nth-of-type\(\d+\))?))*)$/i.test(key)) throw new HttpError(400, "מזהה הרכיב אינו תקין");
  const textContent = body.text === null || body.text === undefined ? null : cleanOptional(body.text, 3000);
  const styles = sanitizeEditorStyles(body.styles);
  const attributes = sanitizeEditorAttributes(body.attributes);
  const existing = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all();
  const versionId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(versionId, JSON.stringify(existing.results), user.id),
    env.DB.prepare(`INSERT INTO page_customizations (element_key,text_content,styles_json,attributes_json,updated_by,updated_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT(element_key) DO UPDATE SET text_content=excluded.text_content,styles_json=excluded.styles_json,attributes_json=excluded.attributes_json,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
      .bind(key, textContent, JSON.stringify(styles), JSON.stringify(attributes), user.id, new Date().toISOString()),
    auditStatement(env, user.id, "page.element.update", "page_element", key, { versionId })
  ]);
  return json({ customization: { key, text: textContent, styles, attributes }, versionId });
}

async function resetPageCustomizations(request, env) {
  const user = await requireAdmin(request, env);
  const existing = await env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(existing.results), user.id),
    env.DB.prepare("DELETE FROM page_customizations"), auditStatement(env, user.id, "page.customizations.reset", "page", "home")
  ]);
  return json({ ok: true });
}

async function restorePageCustomizationVersion(request, env, versionId) {
  const user = await requireAdmin(request, env);
  const [version, current] = await Promise.all([
    env.DB.prepare("SELECT snapshot_json FROM page_customization_versions WHERE id = ?").bind(versionId).first(),
    env.DB.prepare("SELECT element_key,text_content,styles_json,attributes_json FROM page_customizations ORDER BY element_key").all()
  ]);
  if (!version) throw new HttpError(404, "גרסת העריכה לא נמצאה");
  const rows = JSON.parse(version.snapshot_json || "[]");
  const statements = [
    env.DB.prepare("INSERT INTO page_customization_versions (id,snapshot_json,created_by) VALUES (?,?,?)").bind(crypto.randomUUID(), JSON.stringify(current.results), user.id),
    env.DB.prepare("DELETE FROM page_customizations")
  ];
  for (const row of rows.slice(0, 1000)) statements.push(env.DB.prepare("INSERT INTO page_customizations (element_key,text_content,styles_json,attributes_json,updated_by) VALUES (?,?,?,?,?)").bind(row.element_key, row.text_content, row.styles_json || "{}", row.attributes_json || "{}", user.id));
  statements.push(auditStatement(env, user.id, "page.customizations.restore", "page_customization_versions", versionId));
  await env.DB.batch(statements);
  return json({ ok: true });
}

async function adminContent(request, env) {
  await requireAdmin(request, env);
  const [organizations, items, requests, reports, versions] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.city,o.neighborhood,o.status,o.verified,o.is_hidden,o.created_at,u.full_name AS owner_name,u.email AS owner_email FROM organizations o LEFT JOIN users u ON u.id=o.owner_id ORDER BY o.created_at DESC LIMIT 500`),
    env.DB.prepare(`SELECT i.id,i.title,i.category,i.condition,i.quantity,i.status,i.availability_status,i.created_at,o.name AS organization_name FROM items i JOIN organizations o ON o.id=i.organization_id ORDER BY i.created_at DESC LIMIT 1000`),
    env.DB.prepare(`SELECT lr.id,lr.status,lr.requested_from,lr.requested_until,lr.created_at,i.title AS item_title,b.full_name AS borrower_name,b.email AS borrower_email,o.name AS organization_name FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN users b ON b.id=lr.borrower_id JOIN organizations o ON o.id=i.organization_id ORDER BY lr.created_at DESC LIMIT 1000`),
    env.DB.prepare(`SELECT r.id,r.reason,r.status,r.created_at,i.title AS item_title,u.full_name AS reporter_name FROM reports r JOIN items i ON i.id=r.item_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 500`),
    env.DB.prepare(`SELECT v.id,v.created_at,u.full_name AS created_by_name FROM page_customization_versions v LEFT JOIN users u ON u.id=v.created_by ORDER BY v.created_at DESC LIMIT 100`)
  ]);
  return json({ organizations: organizations.results, items: items.results, requests: requests.results, reports: reports.results, visualVersions: versions.results });
}

async function updateAdminUser(request, env, id) {
  const admin = await requireAdmin(request, env);
  if (id === admin.id) throw new HttpError(400, "אי אפשר לשנות את הרשאות החשבון שמחובר כרגע");
  const body = await readJson(request);
  const role = body.role === "admin" ? "admin" : "member";
  const status = body.accountStatus === "suspended" ? "suspended" : "active";
  const verified = body.emailVerified === true ? 1 : 0;
  const result = await env.DB.prepare("UPDATE users SET role=?,account_status=?,email_verified=?,updated_at=? WHERE id=?").bind(role,status,verified,new Date().toISOString(),id).run();
  if (!result.meta.changes) throw new HttpError(404, "המשתמש לא נמצא");
  await auditStatement(env, admin.id, "user.update", "user", id, { role, status, verified }).run();
  return json({ id, role, accountStatus: status, emailVerified: Boolean(verified) });
}

function sanitizeEditorStyles(input) {
  const allowed = new Set(["color","backgroundColor","fontFamily","fontSize","fontWeight","textAlign","lineHeight","letterSpacing","width","maxWidth","minHeight","marginTop","marginBottom","marginInlineStart","marginInlineEnd","paddingTop","paddingBottom","paddingInlineStart","paddingInlineEnd","borderRadius","opacity","order","transform","display"]);
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  for (const [key, raw] of Object.entries(input)) {
    if (!allowed.has(key)) continue;
    const value = String(raw ?? "").trim();
    if (value.length <= 100 && !/[;{}<>]/.test(value)) result[key] = value;
  }
  return result;
}

function sanitizeEditorAttributes(input) {
  const result = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) return result;
  if (typeof input.hidden === "boolean") result.hidden = input.hidden;
  if (typeof input.disabled === "boolean") result.disabled = input.disabled;
  if (typeof input.href === "string") {
    const href = input.href.trim();
    if (/^(#|\/|https:\/\/)[^\s<>]{0,500}$/.test(href)) result.href = href;
  }
  return result;
}

function safeJsonObject(value) {
  try { const parsed = JSON.parse(value || "{}"); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
}

function auditStatement(env, actorId, action, entityType, entityId = null, metadata = {}) {
  return env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,entity_type,entity_id,metadata_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), actorId, action, entityType, entityId, JSON.stringify(metadata));
}

async function moderateOrganization(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["approved", "rejected"].includes(status)) throw new HttpError(400, "סטטוס האישור אינו תקין");
  const verified = status === "approved" && body.verified === true ? 1 : 0;
  const result = await env.DB.prepare("UPDATE organizations SET status = ?, verified = ?, updated_at = ? WHERE id = ?")
    .bind(status, verified, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הגמ״ח לא נמצא");
  return json({ id, status, verified: Boolean(verified) });
}

async function moderateItem(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["active", "rejected", "archived"].includes(status)) throw new HttpError(400, "סטטוס הפריט אינו תקין");
  if (status === "active") {
    const owner = await env.DB.prepare("SELECT o.status FROM items i JOIN organizations o ON o.id = i.organization_id WHERE i.id = ?").bind(id).first();
    if (!owner) throw new HttpError(404, "הפריט לא נמצא");
    if (owner.status !== "approved") throw new HttpError(409, "יש לאשר את הגמ״ח לפני פרסום הפריט");
  }
  const result = await env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הפריט לא נמצא");
  return json({ id, status });
}

async function moderateReport(request, env, id) {
  await requireAdmin(request, env);
  const body = await readJson(request);
  const status = cleanText(body.status, 2, 20, "סטטוס");
  if (!["reviewed", "dismissed"].includes(status)) throw new HttpError(400, "סטטוס הדיווח אינו תקין");
  const result = await env.DB.prepare("UPDATE reports SET status = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
    .bind(status, new Date().toISOString(), id).run();
  if (!result.meta.changes) throw new HttpError(404, "הדיווח לא נמצא או כבר טופל");
  return json({ id, status });
}

async function serveMedia(request, env, url) {
  if (request.method !== "GET" && request.method !== "HEAD") throw new HttpError(405, "הפעולה אינה נתמכת");
  const key = decodeURIComponent(url.pathname.slice("/media/".length));
  if (!key.startsWith("items/") || key.includes("..")) throw new HttpError(404, "התמונה לא נמצאה");
  const object = await env.ITEM_IMAGES.get(key);
  if (!object) throw new HttpError(404, "התמונה לא נמצאה");
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}

async function currentUser(request, env) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), new Date().toISOString()).first();
  return row || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "יש להתחבר כדי להמשיך");
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "הפעולה מיועדת למנהלי האתר");
  return user;
}

function notificationStatement(env, userId, type, title, body, requestId = null) {
  return env.DB.prepare("INSERT INTO notifications (id,user_id,type,title,body,request_id) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), userId, type, title, body, requestId);
}

async function enforceAuthRateLimit(env, email, action, ctx) {
  const identity = await sha256(email);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM auth_events
    WHERE identity_hash = ? AND action = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')`).bind(identity, action).first();
  if (Number(row?.count || 0) >= 10) throw new HttpError(429, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות");
  await env.DB.prepare("INSERT INTO auth_events (identity_hash,action) VALUES (?,?)").bind(identity, action).run();
  ctx.waitUntil(env.DB.prepare("DELETE FROM auth_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')").run());
}

async function compatibleMemberRole(env) {
  // Early deployments used borrower/gmach_manager while the current schema
  // uses member/admin. Inspect the live table definition so registrations keep
  // working on databases created by either version without weakening roles.
  const schema = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").first();
  const definition = String(schema?.sql || "").toLowerCase();
  if (definition.includes("'member'")) return "member";
  if (definition.includes("'borrower'")) return "borrower";
  return "member";
}

async function readJson(request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > MAX_JSON_BYTES) throw new HttpError(413, "הבקשה גדולה מדי");
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new HttpError(415, "נדרש תוכן מסוג JSON");
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new HttpError(413, "הבקשה גדולה מדי");
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "תוכן הבקשה אינו תקין");
  }
}

function assertSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);
  if (origin && origin !== url.origin) throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
  if (!origin && !local && fetchSite !== "same-origin") throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
  if (fetchSite && !["same-origin", "none"].includes(fetchSite)) throw new HttpError(403, "הבקשה נחסמה מטעמי אבטחה");
}

function publicUser(user) {
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role, emailVerified: Boolean(user.email_verified), twoFactorEnabled: Boolean(user.totp_enabled) };
}

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    condition: row.condition,
    quantity: row.quantity,
    available_count: row.available_count === null || row.available_count === undefined ? row.quantity : Number(row.available_count),
    loan_conditions: row.loan_conditions,
    item_type: row.item_type || "loan",
    subcategory: row.subcategory || null,
    tags: parseJsonArray(row.tags_json),
    pickup_method: row.pickup_method || "pickup",
    inventory_updated_at: row.inventory_updated_at || row.updated_at,
    city: row.city,
    neighborhood: row.neighborhood,
    image_urls: parseJsonArray(row.image_urls),
    availability_status: row.availability_status,
    icon: row.icon,
    cover_color: row.cover_color,
    created_at: row.created_at,
    organizations: { id: row.org_id, name: row.org_name, verified: Boolean(row.org_verified), rating: row.org_rating ? Number(row.org_rating) : null, reviewCount: Number(row.org_review_count || 0), lastActiveAt: row.org_last_active_at || null }
  };
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string").slice(0, 4) : [];
  } catch {
    return [];
  }
}

function cleanText(value, min, max, label) {
  const text = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ");
  if (text.length < min || text.length > max) throw new HttpError(400, `${label} חייב להכיל ${min}–${max} תווים`);
  return text;
}

function cleanOptional(value, max) {
  const text = String(value ?? "").trim().replace(/[\u0000-\u001F\u007F]/g, " ");
  if (!text) return null;
  if (text.length > max) throw new HttpError(400, `הטקסט יכול להכיל עד ${max} תווים`);
  return text;
}

function normalizeEmail(value) {
  const email = normalizeEmailLoose(value);
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "כתובת האימייל אינה תקינה");
  return email;
}

function normalizeEmailLoose(value) {
  return String(value || "").trim().toLowerCase();
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128) throw new HttpError(400, "הסיסמה חייבת להכיל 10–128 תווים");
  return password;
}

function assertEmailDeliveryConfigured(env) {
  if (!env.RESEND_API_KEY) throw new HttpError(503, "שירות אימות המייל עדיין אינו מוגדר");
}

function verificationCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + (bytes[0] % 900000));
}

async function sendVerificationEmail(env, email, fullName, code) {
  assertEmailDeliveryConfigured(env);
  const deliver = env.RESEND_SERVICE?.fetch ? env.RESEND_SERVICE.fetch.bind(env.RESEND_SERVICE) : fetch;
  const response = await deliver("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: String(env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL),
      to: [email],
      subject: "קוד האימות שלך לגמ״ח ברגע",
      text: `שלום ${fullName}, קוד האימות שלך הוא ${code}. הקוד תקף ל-10 דקות. אם לא ביקשת להירשם, אפשר להתעלם מהמייל.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">גמ״ח ברגע</h1><p>שלום ${escapeHtmlEmail(fullName)},</p><p>קוד האימות שלך:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75" dir="ltr">${code}</p><p>הקוד תקף ל־10 דקות. אם לא ביקשת להירשם, אפשר להתעלם מהמייל.</p></div>`,
      reply_to: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

async function sendPasswordResetEmail(env, email, fullName, code) {
  assertEmailDeliveryConfigured(env);
  const deliver = env.RESEND_SERVICE?.fetch ? env.RESEND_SERVICE.fetch.bind(env.RESEND_SERVICE) : fetch;
  const response = await deliver("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: String(env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL), to: [email], subject: "איפוס סיסמה בגמ״ח ברגע",
      text: `שלום ${fullName}, קוד איפוס הסיסמה שלך הוא ${code}. הקוד תקף ל-10 דקות. אם לא ביקשת זאת, אפשר להתעלם מהמייל.`,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#15313a"><h1 style="color:#243f75">גמ״ח ברגע</h1><p>שלום ${escapeHtmlEmail(fullName)},</p><p>קוד איפוס הסיסמה שלך:</p><p style="font-size:32px;font-weight:800;letter-spacing:8px;color:#243f75" dir="ltr">${code}</p><p>הקוד תקף ל־10 דקות. אם לא ביקשת זאת, אפשר להתעלם מהמייל.</p></div>`,
      reply_to: String(env.SUPPORT_EMAIL || DEFAULT_SUPPORT_EMAIL)
    })
  });
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

function escapeHtmlEmail(value) {
  return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function validatePhone(value) {
  const phone = String(value || "").trim();
  if (!/^0\d{1,2}[-\s]?\d{3}[-\s]?\d{4}$/.test(phone)) throw new HttpError(400, "מספר הטלפון אינו תקין");
  return phone;
}

function validateDate(value, label) {
  const date = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) throw new HttpError(400, `${label} אינו תקין`);
  return date;
}

function validateColor(value) {
  const color = String(value || "").trim();
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, "צבע חייב להיות בפורמט HEX תקין");
  return color.toLowerCase();
}

function validateOptionalHttpsUrl(value) {
  const text = cleanOptional(value, 500); if (!text) return null;
  try { const parsed = new URL(text); if (parsed.protocol !== "https:") throw new Error(); return parsed.toString(); }
  catch { throw new HttpError(400, "כתובת האתר חייבת להתחיל ב־https://"); }
}

function sanitizeHours(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "{}";
  const result = {}; for (const [day, hours] of Object.entries(value).slice(0, 7)) {
    if (/^[א-ת\s'-]{2,20}$/.test(day) && typeof hours === "string" && hours.length <= 60) result[day] = hours.trim();
  } return JSON.stringify(result);
}

function sanitizePickupOptions(value) {
  const allowed = new Set(["pickup","delivery","coordination"]);
  const values = Array.isArray(value) ? value.filter(item => allowed.has(item)) : ["pickup"];
  return JSON.stringify([...new Set(values)].slice(0,3).length ? [...new Set(values)].slice(0,3) : ["pickup"]);
}

function sanitizeItemType(value) { return ["loan","donation","service"].includes(value) ? value : "loan"; }
function sanitizePickupMethod(value) { return ["pickup","delivery","coordination"].includes(value) ? value : "pickup"; }
function sanitizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return [...new Set(list.map(item => String(item).trim()).filter(item => item.length >= 2 && item.length <= 30))].slice(0,10);
}

function validateFont(value) {
  const allowed = ["Arial, sans-serif", "Alef, Arial, sans-serif", "Arimo, Arial, sans-serif", "Assistant, Arial, sans-serif", "Heebo, Arial, sans-serif", "IBM Plex Sans Hebrew, Arial, sans-serif", "Miriam Libre, Arial, sans-serif", "Noto Sans Hebrew, Arial, sans-serif", "Rubik, Arial, sans-serif", "Secular One, Arial, sans-serif", "Varela Round, Arial, sans-serif", "David Libre, serif", "Frank Ruhl Libre, serif", "Noto Serif Hebrew, serif", "Suez One, serif"];
  const font = String(value || "").trim();
  if (!allowed.includes(font)) throw new HttpError(400, "הגופן שנבחר אינו נתמך");
  return font;
}

function validateAssetUrl(value) {
  const url = String(value || "").trim();
  if (!/^\/[a-z0-9_./-]+$/i.test(url) || url.includes("..")) throw new HttpError(400, "כתובת הלוגו אינה תקינה");
  return url;
}

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations }, key, 256);
  return toBase64Url(new Uint8Array(bits));
}

async function verifyTotp(secret, code) {
  if (!/^\d{6}$/.test(String(code || ""))) return false;
  const key = await crypto.subtle.importKey("raw", base32Decode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const counter = Math.floor(Date.now() / 30_000);
  for (let drift = -1; drift <= 1; drift += 1) {
    const bytes = new Uint8Array(8);
    let value = counter + drift;
    for (let index = 7; index >= 0; index -= 1) { bytes[index] = value & 0xff; value = Math.floor(value / 256); }
    const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, bytes));
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    if (String(binary % 1_000_000).padStart(6, "0") === code) return true;
  }
  return false;
}

function base32Encode(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let output = "", buffer = 0, bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(buffer >>> bits) & 31]; }
  }
  if (bits > 0) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bytes = [];
  let buffer = 0, bits = 0;
  for (const char of String(value || "").toUpperCase().replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char); if (index < 0) throw new Error("Invalid base32 value");
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((buffer >>> bits) & 0xff); }
  }
  return Uint8Array.from(bytes);
}

async function sha256(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return toBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

function randomToken(length) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const char of String(value || "").replace(/=+$/g, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new Error("Invalid base64url value");
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

function constantTimeEqual(a, b) {
  const left = fromBase64Url(a);
  const right = fromBase64Url(b);
  let mismatch = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) mismatch |= (left[index] || 0) ^ (right[index] || 0);
  return mismatch === 0;
}

function cookieValue(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function sessionCookie(token, url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_SECONDS}${secure}`;
}

function clearSessionCookie(url) {
  const secure = url.protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders }
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
  headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
