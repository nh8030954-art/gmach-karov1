const SESSION_COOKIE = "gmach_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210000;
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
      return withSecurityHeaders(json({ error: status >= 500 ? "אירעה תקלה זמנית בשרת" : error.message }, status));
    }
  }
};

async function routeApi(request, env, ctx, url) {
  const method = request.method.toUpperCase();
  const path = url.pathname;
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) assertSameOrigin(request, url);
  if (method === "OPTIONS") return new Response(null, { status: 204 });

  if (method === "GET" && path === "/api/health") {
    await env.DB.prepare("SELECT 1 AS ok").first();
    return json({ ok: true, database: "D1", storage: "R2" });
  }

  if (method === "POST" && path === "/api/auth/register") return register(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/login") return login(request, env, ctx, url);
  if (method === "POST" && path === "/api/auth/logout") return logout(request, env, url);
  if (method === "GET" && path === "/api/auth/me") {
    const user = await currentUser(request, env);
    return json({ user: user ? publicUser(user) : null });
  }

  if (method === "GET" && path === "/api/items") return listItems(env, url);
  const itemDetail = path.match(/^\/api\/items\/([^/]+)$/);
  if (method === "GET" && itemDetail) return getItem(env, decodeURIComponent(itemDetail[1]));

  const favorite = path.match(/^\/api\/favorites\/([^/]+)$/);
  if (favorite && method === "POST") return addFavorite(request, env, decodeURIComponent(favorite[1]));
  if (favorite && method === "DELETE") return removeFavorite(request, env, decodeURIComponent(favorite[1]));

  if (method === "POST" && path === "/api/organizations") return createOrganization(request, env);
  if (method === "POST" && path === "/api/items") return createItem(request, env);
  const imageUpload = path.match(/^\/api\/items\/([^/]+)\/images$/);
  if (method === "POST" && imageUpload) return uploadImages(request, env, decodeURIComponent(imageUpload[1]));
  if (method === "POST" && path === "/api/loan-requests") return createLoanRequest(request, env);

  if (method === "GET" && path === "/api/me/dashboard") return dashboard(request, env);
  const requestStatus = path.match(/^\/api\/loan-requests\/([^/]+)\/status$/);
  if (method === "PATCH" && requestStatus) return updateRequestStatus(request, env, decodeURIComponent(requestStatus[1]));
  const itemAvailability = path.match(/^\/api\/items\/([^/]+)\/availability$/);
  if (method === "PATCH" && itemAvailability) return updateAvailability(request, env, decodeURIComponent(itemAvailability[1]));

  if (method === "GET" && path === "/api/admin/pending") return adminPending(request, env);
  const adminOrganization = path.match(/^\/api\/admin\/organizations\/([^/]+)$/);
  if (method === "PATCH" && adminOrganization) return moderateOrganization(request, env, decodeURIComponent(adminOrganization[1]));
  const adminItem = path.match(/^\/api\/admin\/items\/([^/]+)$/);
  if (method === "PATCH" && adminItem) return moderateItem(request, env, decodeURIComponent(adminItem[1]));

  throw new HttpError(404, "הכתובת לא נמצאה");
}

async function register(request, env, ctx, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const fullName = cleanText(body.fullName, 2, 80, "שם מלא");
  const password = validatePassword(body.password);
  await enforceAuthRateLimit(env, email, "register", ctx);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (existing) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");

  const id = crypto.randomUUID();
  const salt = randomToken(16);
  const passwordHash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  const admins = String(env.ADMIN_EMAILS || "").split(",").map(normalizeEmailLoose).filter(Boolean);
  const role = admins.includes(email) ? "admin" : "member";
  const sessionToken = randomToken(32);
  const tokenHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();

  try {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id,email,password_hash,password_salt,password_iterations,full_name,role) VALUES (?,?,?,?,?,?,?)")
        .bind(id, email, passwordHash, salt, PASSWORD_ITERATIONS, fullName, role),
      env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)")
        .bind(tokenHash, id, expiresAt)
    ]);
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) throw new HttpError(409, "כבר קיים חשבון עם כתובת האימייל הזו");
    throw error;
  }

  return json({ user: { id, email, fullName, role } }, 201, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function login(request, env, ctx, url) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const password = validatePassword(body.password);
  await enforceAuthRateLimit(env, email, "login", ctx);
  const user = await env.DB.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").bind(email).first();
  if (!user) throw new HttpError(401, "האימייל או הסיסמה אינם נכונים");
  const candidate = await derivePassword(password, user.password_salt, user.password_iterations);
  if (!constantTimeEqual(candidate, user.password_hash)) throw new HttpError(401, "האימייל או הסיסמה אינם נכונים");

  const sessionToken = randomToken(32);
  const tokenHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();
  await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(tokenHash, user.id, expiresAt).run();
  ctx.waitUntil(env.DB.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(new Date().toISOString()).run());
  return json({ user: publicUser(user) }, 200, { "Set-Cookie": sessionCookie(sessionToken, url) });
}

async function logout(request, env, url) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": clearSessionCookie(url) });
}

async function listItems(env, url) {
  const params = [];
  const where = ["i.status = 'active'", "i.is_free = 1", "o.status = 'approved'"];
  const query = cleanOptional(url.searchParams.get("q"), 120);
  const category = cleanOptional(url.searchParams.get("category"), 40);
  const city = cleanOptional(url.searchParams.get("city"), 80);
  if (query) {
    where.push("(i.title LIKE ? OR i.description LIKE ? OR o.name LIKE ?)");
    const like = `%${query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    params.push(like, like, like);
  }
  if (category) { where.push("i.category = ?"); params.push(category); }
  if (city) { where.push("i.city = ?"); params.push(city); }
  const result = await env.DB.prepare(`
    SELECT i.*, o.id AS org_id, o.name AS org_name, o.verified AS org_verified
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE ${where.join(" AND ")}
    ORDER BY CASE i.availability_status WHEN 'available' THEN 0 ELSE 1 END, i.created_at DESC
    LIMIT 100
  `).bind(...params).all();
  return json({ items: result.results.map(mapItem) });
}

async function getItem(env, id) {
  const row = await env.DB.prepare(`
    SELECT i.*, o.id AS org_id, o.name AS org_name, o.verified AS org_verified
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND i.status = 'active' AND i.is_free = 1 AND o.status = 'approved'
  `).bind(id).first();
  if (!row) throw new HttpError(404, "הפריט לא נמצא");
  return json({ item: mapItem(row) });
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
    phone: validatePhone(body.phone)
  };
  await env.DB.batch([
    env.DB.prepare("INSERT INTO organizations (id,owner_id,name,primary_category,city,neighborhood,description,status) VALUES (?,?,?,?,?,?,?,'pending')")
      .bind(id, user.id, values.name, category, values.city, values.neighborhood, values.description),
    env.DB.prepare("INSERT INTO organization_contacts (organization_id,contact_phone) VALUES (?,?)").bind(id, values.phone)
  ]);
  return json({ organization: { id, ...values, primaryCategory: category, status: "pending", verified: false } }, 201);
}

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
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO items (id,organization_id,title,category,description,condition,quantity,loan_conditions,city,neighborhood,status,availability_status,is_free,icon,cover_color)
    VALUES (?,?,?,?,?,?,?,?,?,?,'pending','available',1,'box','#e6f2ef')
  `).bind(
    id,
    organizationId,
    cleanText(body.title, 2, 120, "שם הפריט"),
    category,
    cleanText(body.description, 10, 1200, "תיאור"),
    condition,
    quantity,
    cleanOptional(body.loanConditions, 300),
    organization.city,
    organization.neighborhood
  ).run();
  return json({ item: { id, status: "pending" } }, 201);
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

async function createLoanRequest(request, env) {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const itemId = cleanText(body.itemId, 1, 100, "פריט");
  const item = await env.DB.prepare(`
    SELECT i.id, i.availability_status, o.owner_id
    FROM items i JOIN organizations o ON o.id = i.organization_id
    WHERE i.id = ? AND i.status = 'active' AND i.is_free = 1 AND o.status = 'approved'
  `).bind(itemId).first();
  if (!item) throw new HttpError(404, "הפריט לא נמצא");
  if (item.owner_id === user.id) throw new HttpError(400, "אי אפשר לבקש פריט מהגמ״ח שלכם");
  if (item.availability_status === "unavailable") throw new HttpError(409, "הפריט אינו זמין כרגע");
  const from = validateDate(body.requestedFrom, "תאריך האיסוף");
  const until = validateDate(body.requestedUntil, "תאריך ההחזרה");
  const today = new Date().toISOString().slice(0, 10);
  if (from < today) throw new HttpError(400, "תאריך האיסוף כבר עבר");
  if (until < from) throw new HttpError(400, "תאריך ההחזרה חייב להיות אחרי תאריך האיסוף");
  const maxUntil = new Date(`${from}T00:00:00Z`);
  maxUntil.setUTCDate(maxUntil.getUTCDate() + 180);
  if (until > maxUntil.toISOString().slice(0, 10)) throw new HttpError(400, "אפשר לבקש השאלה לתקופה של עד 180 יום");
  const duplicate = await env.DB.prepare("SELECT id FROM loan_requests WHERE item_id = ? AND borrower_id = ? AND status IN ('pending','approved','collected')")
    .bind(itemId, user.id).first();
  if (duplicate) throw new HttpError(409, "כבר קיימת בקשה פעילה שלכם לפריט הזה");
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO loan_requests (id,item_id,borrower_id,requested_from,requested_until,phone,note,status) VALUES (?,?,?,?,?,?,?,'pending')")
    .bind(id, itemId, user.id, from, until, validatePhone(body.phone), cleanOptional(body.note, 500)).run();
  return json({ request: { id, status: "pending" } }, 201);
}

async function dashboard(request, env) {
  const user = await requireUser(request, env);
  const [organizationsResult, itemsResult, requestsResult, favoritesResult] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,o.created_at,c.contact_phone
      FROM organizations o LEFT JOIN organization_contacts c ON c.organization_id = o.id WHERE o.owner_id = ? ORDER BY o.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT i.id,i.title,i.status,i.availability_status,i.created_at,o.name AS org_name
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE o.owner_id = ? ORDER BY i.created_at DESC`).bind(user.id),
    env.DB.prepare(`SELECT lr.id,lr.status,lr.requested_from,lr.requested_until,lr.phone,lr.note,lr.created_at,
      i.title AS item_title,o.name AS org_name,o.owner_id,u.full_name AS borrower_name,
      CASE WHEN o.owner_id = ? THEN 'incoming' ELSE 'outgoing' END AS direction,
      CASE WHEN lr.borrower_id = ? AND lr.status IN ('approved','collected') THEN c.contact_phone ELSE NULL END AS contact_phone
      FROM loan_requests lr JOIN items i ON i.id = lr.item_id JOIN organizations o ON o.id = i.organization_id
      JOIN users u ON u.id = lr.borrower_id LEFT JOIN organization_contacts c ON c.organization_id = o.id
      WHERE lr.borrower_id = ? OR o.owner_id = ? ORDER BY lr.created_at DESC`).bind(user.id, user.id, user.id, user.id),
    env.DB.prepare("SELECT item_id FROM favorites WHERE user_id = ?").bind(user.id)
  ]);
  const organizations = organizationsResult.results.map(row => ({ ...row, verified: Boolean(row.verified) }));
  const items = itemsResult.results.map(row => ({ ...row, organizations: { name: row.org_name } }));
  const requests = requestsResult.results.map(row => ({
    id: row.id,
    status: row.status,
    requested_from: row.requested_from,
    requested_until: row.requested_until,
    note: row.note,
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
  const row = await env.DB.prepare(`SELECT lr.status,lr.borrower_id,o.owner_id FROM loan_requests lr
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
  await env.DB.prepare("UPDATE loan_requests SET status = ?, updated_at = ? WHERE id = ?")
    .bind(target, new Date().toISOString(), id).run();
  return json({ id, status: target });
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

async function adminPending(request, env) {
  await requireAdmin(request, env);
  const [organizations, items] = await env.DB.batch([
    env.DB.prepare(`SELECT o.id,o.name,o.primary_category,o.city,o.neighborhood,o.description,o.status,o.verified,o.created_at,u.full_name AS owner_name,u.email AS owner_email
      FROM organizations o LEFT JOIN users u ON u.id = o.owner_id WHERE o.status = 'pending' ORDER BY o.created_at ASC`),
    env.DB.prepare(`SELECT i.id,i.title,i.category,i.description,i.condition,i.quantity,i.status,i.created_at,o.name AS org_name,o.status AS org_status
      FROM items i JOIN organizations o ON o.id = i.organization_id WHERE i.status = 'pending' ORDER BY i.created_at ASC`)
  ]);
  return json({ organizations: organizations.results, items: items.results });
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

async function enforceAuthRateLimit(env, email, action, ctx) {
  const identity = await sha256(email);
  const row = await env.DB.prepare(`SELECT COUNT(*) AS count FROM auth_events
    WHERE identity_hash = ? AND action = ? AND created_at >= strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 minutes')`).bind(identity, action).first();
  if (Number(row?.count || 0) >= 10) throw new HttpError(429, "יותר מדי ניסיונות. נסו שוב בעוד 15 דקות");
  await env.DB.prepare("INSERT INTO auth_events (identity_hash,action) VALUES (?,?)").bind(identity, action).run();
  ctx.waitUntil(env.DB.prepare("DELETE FROM auth_events WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')").run());
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
  return { id: user.id, email: user.email, fullName: user.full_name, role: user.role };
}

function mapItem(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    description: row.description,
    condition: row.condition,
    quantity: row.quantity,
    loan_conditions: row.loan_conditions,
    city: row.city,
    neighborhood: row.neighborhood,
    image_urls: parseJsonArray(row.image_urls),
    availability_status: row.availability_status,
    icon: row.icon,
    cover_color: row.cover_color,
    created_at: row.created_at,
    organizations: { id: row.org_id, name: row.org_name, verified: Boolean(row.org_verified) }
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

async function derivePassword(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64Url(salt), iterations }, key, 256);
  return toBase64Url(new Uint8Array(bits));
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
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
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
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
