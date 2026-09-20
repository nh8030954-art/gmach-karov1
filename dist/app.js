(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  const ICONS = Object.freeze({
    decor: '<path d="M5 20V10l7-6 7 6v10M8 20v-6h8v6"/><path d="M4 20h16M12 4V1M8 6 6 3M16 6l2-3"/>',
    drill: '<path d="M5 8h10a4 4 0 0 1 4 4v1H9a4 4 0 0 1-4-4Z"/><path d="M9 13v7h5v-7M19 10h3M3 8V5h6v3"/>',
    baby: '<path d="M4 4h2l2 11h10l2-7H7M9 19a2 2 0 1 0 0 .1M17 19a2 2 0 1 0 0 .1"/>',
    medical: '<circle cx="9" cy="17" r="4"/><circle cx="9" cy="6" r="2"/><path d="M9 9v4h5l3 5M13 11h5M17 14v4h4"/>',
    tent: '<path d="m3 20 9-16 9 16M7 20l5-8 5 8M3 20h18"/>',
    table: '<path d="M3 8h18v5H3zM6 13v7M18 13v7M9 8V4h6v4"/>',
    speaker: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="14" r="4"/><circle cx="12" cy="7" r="1"/>',
    luggage: '<rect x="5" y="6" width="14" height="15" rx="3"/><path d="M9 6V3h6v3M9 10v7M15 10v7"/>',
    ladder: '<path d="M7 3 5 21M17 3l2 18M7 7h10M6 12h12M6 17h12"/>',
    sewing: '<circle cx="9" cy="12" r="5"/><path d="M14 12h7M18 8v8M4 20h16"/>',
    projector: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="15" cy="12" r="3"/><path d="M7 10h2M7 14h2"/>',
    tools: '<path d="m14 6 4-4 4 4-4 4M14 6 3 17l4 4L18 10M6 16l2 2"/>',
    home: '<path d="m3 11 9-8 9 8v10H3Z"/><path d="M9 21v-7h6v7"/>',
    heart: '<path d="M12 21s-8-5-8-12a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 7-8 12-8 12Z"/>',
    box: '<path d="m4 7 8-4 8 4-8 4ZM4 7v10l8 4 8-4V7M12 11v10"/>'
  });

  const DEMO_ITEMS = [
    ["demo-01", "סט קשתות פרחים לאירוע", "אירועים", "שלוש קשתות בגבהים שונים, פרחים לבנים וורודים ובסיסים יציבים. מתאים לחופה, ברית או בת מצווה.", "מצוין", "ירושלים", "רמת שלמה", "available", 1, "decor", "#f7e7ee", "גמ״ח שמחות רמת שלמה", true],
    ["demo-02", "מקדחה נטענת + סט ביטים", "כלי עבודה", "מקדחה 18V עם שתי סוללות, מטען וערכת ביטים. להשאלה עד שלושה ימים.", "כמו חדש", "בני ברק", "פרדס כץ", "available", 2, "drill", "#e6eef7", "גמ״ח כלי עבודה כהן", true],
    ["demo-03", "עריסה מתקפלת לתינוק", "תינוקות", "עריסה קלה לנסיעות עם מזרן וכיסוי נקי. מתקפלת לתיק נשיאה קומפקטי.", "מצוין", "בית שמש", "רמה ד׳", "available", 1, "baby", "#f4e8ee", "גמ״ח יד לאם", true],
    ["demo-04", "כיסא גלגלים מתקפל", "רפואה", "כיסא גלגלים תקני, קל לקיפול ונכנס לרכב משפחתי. כולל משענות רגליים נשלפות.", "טוב", "פתח תקווה", "הדר גנים", "available", 1, "medical", "#e2eff5", "גמ״ח רפואה וסיוע", true],
    ["demo-05", "אוהל משפחתי ל־6 אנשים", "טיולים", "אוהל עמיד ונוח להקמה, כולל יריעה תחתונה ויתדות. מתאים לקמפינג משפחתי.", "מצוין", "מודיעין עילית", "ברכפלד", "available", 1, "tent", "#e7efdc", "גמ״ח מטיילים ביחד", false],
    ["demo-06", "שולחנות מתקפלים לאירוח", "בית ואירוח", "שישה שולחנות מתקפלים באורך 1.80 מ׳. ניתן לקחת גם חלק מהכמות.", "טוב", "אשדוד", "רובע ז׳", "available", 6, "table", "#eee9df", "גמ״ח אירוח מכל הלב", true],
    ["demo-07", "רמקול מוגבר עם מיקרופון", "אירועים", "רמקול נייד לאירוע קטן, כולל מיקרופון אלחוטי, חצובה וכבל טעינה.", "מצוין", "ירושלים", "נווה יעקב", "reserved", 1, "speaker", "#e8e8f3", "גמ״ח ציוד לאירועים", true],
    ["demo-08", "מזוודות גדולות לנסיעה", "טיולים", "זוג מזוודות קשיחות עם ארבעה גלגלים. ניתן להשאיל בנפרד או יחד.", "טוב", "בני ברק", "מרכז העיר", "available", 2, "luggage", "#e8edf4", "גמ״ח בדרך טובה", true],
    ["demo-09", "סולם אלומיניום 7 שלבים", "כלי עבודה", "סולם ביתי יציב וקל. מתאים לצביעה, תלייה ותיקונים בבית.", "טוב", "בית שמש", "הקריה החרדית", "available", 1, "ladder", "#e9edf0", "גמ״ח מתקנים בבית", false],
    ["demo-10", "מכונת תפירה ביתית", "בית ואירוח", "מכונה נוחה לשימוש עם דוושה, חוטים בסיסיים וחוברת הדרכה בעברית.", "מצוין", "פתח תקווה", "עמישב", "available", 1, "sewing", "#f4e7e3", "גמ״ח תופרות חסד", true],
    ["demo-11", "מקרן ומסך מתקפל", "אירועים", "מקרן Full HD ומסך 100 אינץ׳. מתאים למצגות, ערבי משפחה ושיעורים.", "כמו חדש", "מודיעין עילית", "קריית ספר", "available", 1, "projector", "#e3edf1", "גמ״ח מציגים", true],
    ["demo-12", "ארגז כלי עבודה מלא", "כלי עבודה", "פטיש, פליירים, מפתחות, מברגים, מטר וציוד בסיסי לתיקונים קטנים.", "טוב", "אשדוד", "רובע ג׳", "available", 1, "tools", "#f3eadb", "גמ״ח עושים יחד", true]
  ].map((row, index) => ({
    id: row[0], title: row[1], category: row[2], description: row[3], condition: row[4], city: row[5], neighborhood: row[6],
    availability_status: row[7], quantity: row[8], icon: row[9], cover_color: row[10], organizations: { name: row[11], verified: row[12] },
    image_urls: [], created_at: new Date(Date.UTC(2026, 8, 18 - index)).toISOString()
  }));

  const state = {
    serverAvailable: false, items: [], filteredItems: [], favorites: new Set(), user: null, selectedItem: null,
    visibleCount: 8, activeCategory: "", pendingAction: null, dashboardTab: "requests", myOrganizations: [], dashboard: null, authMode: "login"
  };

  const STATUS_LABELS = Object.freeze({ pending: "ממתינה לאישור", approved: "אושרה", declined: "נדחתה", cancelled: "בוטלה", collected: "נאסף", returned: "הוחזר", active: "פעיל", rejected: "נדחה", archived: "בארכיון", available: "זמין", unavailable: "לא זמין", reserved: "בתיאום" });

  function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function normalize(value) { return String(value || "").trim().toLocaleLowerCase("he"); }
  function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#e6f2ef"; }
  function safeImageUrl(value) {
    try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && url.pathname.startsWith("/media/") ? url.href : ""; }
    catch { return ""; }
  }
  function iconSvg(icon = "box") { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon] || ICONS.box}</svg>`; }
  function toast(message, type = "success") {
    const el = document.createElement("div"); el.className = `toast ${type === "error" ? "error" : ""}`; el.textContent = message; $("#toast-region").append(el); window.setTimeout(() => el.remove(), 4200);
  }
  function setButtonBusy(button, busy, busyText = "שולח…") {
    if (!button) return;
    if (busy) { button.dataset.originalText = button.textContent; button.textContent = busyText; button.disabled = true; }
    else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
  }
  function openDialog(dialog) { if (!dialog) return; if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal(); document.body.classList.add("dialog-open"); }
  function closeDialog(dialog) { if (!dialog) return; if (dialog.open) dialog.close(); if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }

  async function api(path, options = {}) {
    const init = { credentials: "same-origin", ...options }; init.headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") { init.headers.set("Content-Type", "application/json"); init.body = JSON.stringify(options.body); }
    const response = await fetch(path, init); const type = response.headers.get("content-type") || ""; const data = type.includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || "הפעולה לא הושלמה"); return data;
  }

  async function detectServer() {
    try { const result = await api("/api/health"); state.serverAvailable = result?.ok === true; } catch { state.serverAvailable = false; }
    $("#connection-banner").hidden = state.serverAvailable;
  }
  function requireAuth(action) {
    if (state.user) { action?.(); return true; }
    state.pendingAction = action || null; setAuthMode("login"); openDialog($("#auth-dialog")); return false;
  }
  function renderSkeletons() { $("#items-grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join(""); }
  async function loadItems() {
    renderSkeletons();
    if (!state.serverAvailable) { state.items = DEMO_ITEMS; applyFilters(); return; }
    try { const data = await api("/api/items"); state.items = data.items || []; applyFilters(); }
    catch (error) { console.error("Unable to load items", error); $("#items-grid").innerHTML = ""; $("#empty-state").hidden = false; $("#empty-state h3").textContent = "לא הצלחנו לטעון את הפריטים"; $("#empty-state p").textContent = "כדאי לרענן את הדף בעוד רגע."; $("#results-summary").textContent = "שגיאה בטעינת הקטלוג"; }
  }
  function applyFilters({ resetVisible = true } = {}) {
    if (resetVisible) state.visibleCount = 8;
    const query = normalize($("#search-input").value), city = $("#city-filter").value, category = state.activeCategory || $("#category-filter").value, condition = $("#condition-filter").value, availableOnly = $("#available-only").checked;
    state.filteredItems = state.items.filter(item => { const haystack = normalize([item.title, item.description, item.category, item.city, item.neighborhood, item.organizations?.name].join(" ")); return (!query || haystack.includes(query)) && (!city || item.city === city) && (!category || item.category === category) && (!condition || item.condition === condition) && (!availableOnly || item.availability_status === "available"); });
    const sort = $("#sort-select").value;
    state.filteredItems.sort((a, b) => sort === "newest" ? new Date(b.created_at) - new Date(a.created_at) : sort === "city" ? String(a.city).localeCompare(String(b.city), "he") : Number(b.availability_status === "available") - Number(a.availability_status === "available") || Number(Boolean(b.organizations?.verified)) - Number(Boolean(a.organizations?.verified)));
    renderItems();
  }
  function itemCardMarkup(item) {
    const image = safeImageUrl(item.image_urls?.[0]), favorite = state.favorites.has(item.id), available = item.availability_status === "available", quantityText = Number(item.quantity) > 1 ? `${Number(item.quantity)} יחידות` : item.condition;
    return `<article class="item-card" data-item-id="${escapeHTML(item.id)}"><div class="item-card-media" style="--media-bg:${safeColor(item.cover_color)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.title)}" loading="lazy">` : `<span class="item-symbol">${iconSvg(item.icon)}</span>`}<span class="availability-badge ${available ? "" : "is-busy"}">${available ? "זמין עכשיו" : "בתיאום"}</span><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite-id="${escapeHTML(item.id)}" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div><div class="item-card-body"><div class="item-card-topline"><span class="item-category-label">${escapeHTML(item.category)}</span><span>${escapeHTML(quantityText)}</span></div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p><div class="item-card-footer"><span class="item-location"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</span><button class="item-card-open" type="button" data-open-item="${escapeHTML(item.id)}">לפרטים ←</button></div></div></article>`;
  }
  function renderItems() {
    const visible = state.filteredItems.slice(0, state.visibleCount); $("#items-grid").innerHTML = visible.map(itemCardMarkup).join(""); $("#empty-state").hidden = state.filteredItems.length > 0; $("#items-grid").hidden = state.filteredItems.length === 0; $("#load-more-button").hidden = state.visibleCount >= state.filteredItems.length; $("#results-summary").textContent = state.filteredItems.length ? `${state.filteredItems.length} פריטים מתאימים נמצאו` : "אין כרגע תוצאות שמתאימות לסינון";
    $$('[data-open-item]').forEach(button => button.addEventListener("click", () => openItem(button.dataset.openItem))); $$('[data-favorite-id]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); toggleFavorite(button.dataset.favoriteId); })); $$(".item-card").forEach(card => card.addEventListener("dblclick", () => openItem(card.dataset.itemId)));
  }
  function findItem(id) { return state.items.find(item => String(item.id) === String(id)); }
  function openItem(id) {
    const item = findItem(id); if (!item) return; state.selectedItem = item;
    const image = safeImageUrl(item.image_urls?.[0]), favorite = state.favorites.has(item.id), available = item.availability_status === "available", verified = Boolean(item.organizations?.verified);
    $("#item-dialog-content").innerHTML = `<article class="item-detail"><div class="item-detail-media" style="--media-bg:${safeColor(item.cover_color)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.title)}">` : `<span class="item-symbol">${iconSvg(item.icon)}</span>`}<span class="availability-badge ${available ? "" : "is-busy"}">${available ? "זמין עכשיו" : "זמין בתיאום"}</span></div><div class="item-detail-copy"><div class="detail-meta"><span>${escapeHTML(item.category)}</span><span class="dot"></span><span>${escapeHTML(item.condition)}</span></div><h2 id="item-dialog-title">${escapeHTML(item.title)}</h2><p class="item-detail-description">${escapeHTML(item.description)}</p><ul class="detail-facts"><li><span>מיקום איסוף</span><strong>${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</strong></li><li><span>כמות זמינה</span><strong>${escapeHTML(item.quantity || 1)}</strong></li><li><span>עלות</span><strong>חינם לגמרי</strong></li><li><span>זמינות</span><strong>${available ? "זמין לבקשה" : "יש לתאם תאריך"}</strong></li></ul><div class="gmach-owner"><span class="owner-mark" aria-hidden="true">ג</span><span><strong>${escapeHTML(item.organizations?.name || "גמ״ח קהילתי")}${verified ? " ✓" : ""}</strong><small>${verified ? "גמ״ח מאומת" : "מלווה קהילתי"} · פרטי קשר נמסרים רק לאחר אישור</small></span></div><div class="detail-actions"><button class="button button-primary" type="button" id="detail-request-button">בקשת השאלה חינמית</button><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" id="detail-favorite-button" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div></div></article>`;
    $("#detail-request-button").addEventListener("click", () => startRequest(item.id)); $("#detail-favorite-button").addEventListener("click", () => toggleFavorite(item.id, true)); openDialog($("#item-dialog"));
  }
  function startRequest(id) { const item = findItem(id); if (!item) return; requireAuth(() => { closeDialog($("#item-dialog")); $("#request-item-id").value = item.id; $("#request-item-name").textContent = item.title; openDialog($("#request-dialog")); }); }
  async function toggleFavorite(id, fromDetail = false) {
    requireAuth(async () => { const exists = state.favorites.has(id); try { await api(`/api/favorites/${encodeURIComponent(id)}`, { method: exists ? "DELETE" : "POST" }); if (exists) state.favorites.delete(id); else state.favorites.add(id); renderItems(); if (fromDetail) openItem(id); toast(exists ? "הפריט הוסר מהמועדפים" : "הפריט נוסף למועדפים"); } catch (error) { toast(error.message, "error"); } });
  }

  function setAuthMode(mode) {
    state.authMode = mode === "register" ? "register" : "login"; $$('[data-auth-mode]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.authMode === state.authMode)));
    const register = state.authMode === "register"; $("#auth-name-field").hidden = !register; $("#auth-name").required = register; $("#auth-password").autocomplete = register ? "new-password" : "current-password"; $("#auth-title").textContent = register ? "מצטרפים לגמ״ח קרוב" : "כניסה לגמ״ח קרוב"; $("#auth-description").textContent = register ? "יוצרים חשבון בחינם ומתחילים להשאיל ולעזור." : "נכנסים עם אימייל וסיסמה כדי לבקש, לשמור ולנהל פריטים."; $("#auth-submit").textContent = register ? "יצירת חשבון" : "כניסה";
  }
  async function refreshUser() {
    if (!state.serverAvailable) return;
    try { const data = await api("/api/auth/me"); state.user = data.user; updateAuthUI(); if (state.user) await refreshAccountSnapshot(); }
    catch { state.user = null; updateAuthUI(); }
  }
  async function refreshAccountSnapshot() {
    if (!state.user) return null; const data = await api("/api/me/dashboard"); state.dashboard = data; state.myOrganizations = data.organizations || []; state.favorites = new Set(data.favorites || []); renderItems(); return data;
  }
  function updateAuthUI() {
    const label = state.user ? "האזור שלי" : "כניסה"; $("#dashboard-button").textContent = label; $$('[data-requires-auth]').forEach(button => { if (button !== $("#dashboard-button")) button.textContent = label; }); $("#dashboard-name").textContent = state.user?.fullName || state.user?.email?.split("@")[0] || "חבר/ה"; $("#admin-tab").hidden = state.user?.role !== "admin";
  }
  async function submitLoanRequest(payload) { if (!state.user) throw new Error("יש להתחבר לפני שליחת בקשה"); const data = await api("/api/loan-requests", { method: "POST", body: payload }); return data.request; }
  function openGmachForm() { requireAuth(() => openDialog($("#gmach-dialog"))); }
  async function openItemForm() {
    requireAuth(async () => { try { await refreshAccountSnapshot(); const select = $("#item-gmach"); select.innerHTML = '<option value="">בחירת גמ״ח</option>' + state.myOrganizations.filter(org => ["approved", "pending"].includes(org.status)).map(org => `<option value="${escapeHTML(org.id)}">${escapeHTML(org.name)}</option>`).join(""); if (!state.myOrganizations.length) { toast("כדי לפרסם פריט, פותחים קודם עמוד גמ״ח", "error"); openDialog($("#gmach-dialog")); return; } openDialog($("#item-form-dialog")); } catch (error) { toast(error.message || "לא הצלחנו לטעון את הגמ״חים שלך", "error"); } });
  }
  async function uploadItemImages(itemId, files) {
    if (!files.length) return []; if (files.length > 4) throw new Error("אפשר להעלות עד 4 תמונות"); const form = new FormData();
    for (const file of files) { if (file.size > 5 * 1024 * 1024) throw new Error("כל תמונה יכולה להיות עד 5MB"); if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("אפשר להעלות JPG, PNG או WebP בלבד"); form.append("images", file); }
    return api(`/api/items/${encodeURIComponent(itemId)}/images`, { method: "POST", body: form });
  }

  async function showDashboard(tab = state.dashboardTab) {
    if (!state.user) { requireAuth(() => showDashboard(tab)); return; } if (tab === "admin" && state.user.role !== "admin") tab = "requests"; state.dashboardTab = tab; $("#home-view").hidden = true; $("#dashboard-view").hidden = false; window.scrollTo({ top: 0, behavior: "smooth" }); history.replaceState(null, "", "#/dashboard"); $$('[data-dashboard-tab]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.dashboardTab === tab))); $("#dashboard-content").innerHTML = '<div class="skeleton-card" aria-hidden="true"></div>';
    try { const data = await refreshAccountSnapshot(); $("#stat-requests").textContent = data.stats.activeRequests; $("#stat-items").textContent = data.stats.items; $("#stat-completed").textContent = data.stats.completed; if (tab === "requests") renderDashboardRequests(data.requests || []); if (tab === "items") renderDashboardItems(data.items || []); if (tab === "gmachim") renderDashboardOrganizations(data.organizations || []); if (tab === "admin") await renderAdmin(); }
    catch (error) { console.error("Dashboard error", error); $("#dashboard-content").innerHTML = `<div class="dashboard-empty">${escapeHTML(error.message || "לא הצלחנו לטעון את האזור האישי")}</div>`; }
  }
  function requestActions(row) {
    if (row.direction === "incoming" && row.status === "pending") return `<button class="button button-primary button-small" data-request-action="approved" data-request-id="${escapeHTML(row.id)}">אישור</button><button class="button button-secondary button-small" data-request-action="declined" data-request-id="${escapeHTML(row.id)}">דחייה</button>`;
    if (row.direction === "incoming" && row.status === "approved") return `<button class="button button-primary button-small" data-request-action="collected" data-request-id="${escapeHTML(row.id)}">סימון כנאסף</button>`;
    if (row.direction === "incoming" && row.status === "collected") return `<button class="button button-primary button-small" data-request-action="returned" data-request-id="${escapeHTML(row.id)}">סימון כהוחזר</button>`;
    if (row.direction === "outgoing" && row.status === "pending") return `<button class="button button-secondary button-small" data-request-action="cancelled" data-request-id="${escapeHTML(row.id)}">ביטול בקשה</button>`; return "";
  }
  function renderDashboardRequests(requests) {
    if (!requests.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד אין כאן בקשות</strong><p>כשתבקשו פריט או תקבלו בקשה לגמ״ח שלכם, היא תופיע כאן.</p></div>'; return; }
    $("#dashboard-content").innerHTML = requests.map(row => `<article class="dashboard-row"><div><h3>${escapeHTML(row.items?.title || "פריט")}</h3><p>${row.direction === "incoming" ? `בקשה מאת ${escapeHTML(row.borrower_name || "שואל/ת")}` : "בקשה ששלחתי"} · ${escapeHTML(row.items?.organizations?.name || "גמ״ח")}</p>${row.borrower_phone ? `<p class="contact-detail" dir="ltr">${escapeHTML(row.borrower_phone)}</p>` : ""}${row.contact_phone ? `<p class="contact-detail">טלפון הגמ״ח: <span dir="ltr">${escapeHTML(row.contact_phone)}</span></p>` : ""}</div><div><span class="status-chip ${escapeHTML(row.status)}">${escapeHTML(STATUS_LABELS[row.status] || row.status)}</span><p>${escapeHTML(row.requested_from)} — ${escapeHTML(row.requested_until)}</p></div><div class="dashboard-row-actions">${requestActions(row)}</div></article>`).join("");
    $$('[data-request-action]').forEach(button => button.addEventListener("click", () => updateRequestStatus(button.dataset.requestId, button.dataset.requestAction)));
  }
  function renderDashboardItems(items) {
    if (!items.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד לא פורסמו פריטים</strong><p>הוסיפו את הפריט הראשון ותנו לו לעזור לעוד משפחה.</p><button class="button button-primary" type="button" id="dashboard-empty-add-item">הוספת פריט</button></div>'; $("#dashboard-empty-add-item")?.addEventListener("click", openItemForm); return; }
    $("#dashboard-content").innerHTML = items.map(item => `<article class="dashboard-row"><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.organizations?.name || "הגמ״ח שלי")}</p></div><span class="status-chip ${escapeHTML(item.status)}">${escapeHTML(STATUS_LABELS[item.status] || item.status)}</span><button class="button button-secondary button-small" type="button" data-toggle-item="${escapeHTML(item.id)}" data-current-availability="${escapeHTML(item.availability_status)}">${item.availability_status === "available" ? "סימון כלא זמין" : "סימון כזמין"}</button></article>`).join(""); $$('[data-toggle-item]').forEach(button => button.addEventListener("click", () => toggleItemAvailability(button.dataset.toggleItem, button.dataset.currentAvailability)));
  }
  function renderDashboardOrganizations(organizations) {
    if (!organizations.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד אין לכם עמוד גמ״ח</strong><p>הפתיחה חינמית ולוקחת כמה דקות.</p><button class="button button-primary" type="button" id="dashboard-empty-add-gmach">פתיחת גמ״ח</button></div>'; $("#dashboard-empty-add-gmach")?.addEventListener("click", openGmachForm); return; }
    $("#dashboard-content").innerHTML = organizations.map(org => `<article class="dashboard-row"><div><h3>${escapeHTML(org.name)}</h3><p>${escapeHTML([org.city, org.neighborhood].filter(Boolean).join(", "))}</p></div><span class="status-chip ${escapeHTML(org.status)}">${escapeHTML(org.status === "approved" ? "מאושר" : org.status === "rejected" ? "נדחה" : "בבדיקה")}</span><span>${org.verified ? "מאומת ✓" : ""}</span></article>`).join("");
  }
  async function renderAdmin() {
    const data = await api("/api/admin/pending"), organizations = data.organizations || [], items = data.items || [], empty = !organizations.length && !items.length;
    $("#dashboard-content").innerHTML = empty ? '<div class="dashboard-empty"><strong>הכול מטופל</strong><p>אין כרגע פרסומים שממתינים לבדיקה.</p></div>' : `<h2 class="dashboard-section-title">גמ״חים שממתינים לאישור (${organizations.length})</h2>${organizations.map(org => `<article class="dashboard-row"><div><h3>${escapeHTML(org.name)}</h3><p>${escapeHTML(org.owner_name || "משתמש/ת")} · ${escapeHTML(org.city)} · ${escapeHTML(org.primary_category)}</p><p>${escapeHTML(org.description)}</p></div><span class="status-chip pending">בבדיקה</span><div class="dashboard-row-actions"><button class="button button-primary button-small" data-admin-org="${escapeHTML(org.id)}" data-admin-status="approved">אישור ואימות</button><button class="button button-secondary button-small" data-admin-org="${escapeHTML(org.id)}" data-admin-status="rejected">דחייה</button></div></article>`).join("")}<h2 class="dashboard-section-title">פריטים שממתינים לאישור (${items.length})</h2>${items.map(item => `<article class="dashboard-row"><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.org_name)} · ${escapeHTML(item.category)} · ${escapeHTML(item.condition)}</p><p>${escapeHTML(item.description)}</p></div><span class="status-chip pending">בבדיקה</span><div class="dashboard-row-actions"><button class="button button-primary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="active">פרסום</button><button class="button button-secondary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="rejected">דחייה</button></div></article>`).join("")}`;
    $$('[data-admin-org]').forEach(button => button.addEventListener("click", () => moderate("organization", button.dataset.adminOrg, button.dataset.adminStatus))); $$('[data-admin-item]').forEach(button => button.addEventListener("click", () => moderate("item", button.dataset.adminItem, button.dataset.adminStatus)));
  }
  async function moderate(kind, id, status) {
    try { const path = kind === "organization" ? `/api/admin/organizations/${encodeURIComponent(id)}` : `/api/admin/items/${encodeURIComponent(id)}`; await api(path, { method: "PATCH", body: kind === "organization" ? { status, verified: status === "approved" } : { status } }); toast("הפרסום עודכן"); await renderAdmin(); await loadItems(); } catch (error) { toast(error.message, "error"); }
  }
  async function updateRequestStatus(id, status) { try { await api(`/api/loan-requests/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status } }); toast("הבקשה עודכנה"); showDashboard("requests"); } catch (error) { toast(error.message, "error"); } }
  async function toggleItemAvailability(id, current) { const availabilityStatus = current === "available" ? "unavailable" : "available"; try { await api(`/api/items/${encodeURIComponent(id)}/availability`, { method: "PATCH", body: { availabilityStatus } }); toast("זמינות הפריט עודכנה"); await loadItems(); showDashboard("items"); } catch (error) { toast(error.message, "error"); } }
  function showHome() { $("#dashboard-view").hidden = true; $("#home-view").hidden = false; history.replaceState(null, "", "#/"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function resetFilters() { $("#search-form").reset(); $("#category-filter").value = ""; $("#condition-filter").value = ""; $("#available-only").checked = true; state.activeCategory = ""; $$('[data-category]').forEach(button => button.classList.toggle("is-active", button.dataset.category === "")); applyFilters(); }

  const INFO_CONTENT = Object.freeze({
    safety: '<h2 id="info-dialog-title">כללי השאלה בטוחה</h2><p>גמ״ח קרוב מחבר בין מלווים לשואלים, והאחריות לתיאום ולהשאלה נשארת בידי שני הצדדים.</p><h3>לפני האיסוף</h3><ul><li>ודאו שהפריט מתאים לצורך ולמועד.</li><li>תאמו מקום ושעת איסוף ברורים.</li><li>אל תעבירו פרטי תשלום — כל ההשאלות בפלטפורמה חינמיות.</li></ul><h3>בעת ההחזרה</h3><ul><li>החזירו בזמן, נקי ובמצב שבו התקבל.</li><li>דווחו מיד על נזק או עיכוב.</li></ul>',
    terms: '<h2 id="info-dialog-title">עיקרי תנאי השימוש</h2><p>השירות מיועד להשאלה חינמית בלבד. אסור לפרסם פריטים בתשלום, פריטים אסורים או ציוד שאינו בטיחותי לשימוש.</p><h3>אחריות המשתמשים</h3><p>המלווה אחראי לתיאור מדויק ותקינות סבירה; השואל אחראי לשימוש זהיר ולהחזרה במועד. הפלטפורמה אינה צד להסכם ההשאלה.</p><h3>ניהול תוכן</h3><p>ניתן להסיר פרסום מטעה, מסוכן או מסחרי ולחסום שימוש שמפר את כללי הקהילה.</p>',
    privacy: '<h2 id="info-dialog-title">עיקרי מדיניות הפרטיות</h2><p>נאספים רק הפרטים הדרושים להפעלת השירות: פרטי חשבון, בקשות השאלה, פריטים ופרטי תיאום.</p><h3>מי רואה מה?</h3><p>פרטי קשר אינם מוצגים בקטלוג הפתוח. הם זמינים רק לצדדים הרלוונטיים לבקשה ובהתאם להרשאות.</p><h3>אבטחה ושליטה</h3><p>המידע נשמר ב־Cloudflare D1 והתמונות ב־Cloudflare R2. הסיסמאות נשמרות רק כגיבוב מאובטח, וההרשאות נאכפות בשרת.</p>'
  });
  function openInfo(type) { $("#info-dialog-content").innerHTML = INFO_CONTENT[type] || INFO_CONTENT.safety; openDialog($("#info-dialog")); }

  function setupEvents() {
    $("#current-year").textContent = new Date().getFullYear(); const today = new Date().toISOString().slice(0, 10); $("#date-filter").min = today; $("#request-start").min = today; $("#request-end").min = today; $("#request-start").addEventListener("change", () => { $("#request-end").min = $("#request-start").value || today; });
    $("#mobile-menu-button").addEventListener("click", () => { const menu = $("#mobile-menu"); menu.hidden = !menu.hidden; $("#mobile-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); }); $$("#mobile-menu a, #mobile-menu button").forEach(el => el.addEventListener("click", () => { $("#mobile-menu").hidden = true; $("#mobile-menu-button").setAttribute("aria-expanded", "false"); }));
    $("#search-form").addEventListener("submit", event => { event.preventDefault(); applyFilters(); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); }); ["#city-filter", "#category-filter", "#condition-filter", "#available-only", "#sort-select"].forEach(selector => $(selector).addEventListener("change", () => applyFilters())); $("#date-filter").addEventListener("change", () => applyFilters());
    $("#filters-button").addEventListener("click", () => { const panel = $("#filter-panel"); panel.hidden = !panel.hidden; $("#filters-button").setAttribute("aria-expanded", String(!panel.hidden)); }); $("#clear-filters").addEventListener("click", resetFilters); $("#empty-clear-button").addEventListener("click", resetFilters); $("#all-categories-button").addEventListener("click", () => { resetFilters(); $("#catalog").scrollIntoView({ behavior: "smooth" }); });
    $$('[data-category]').forEach(button => button.addEventListener("click", () => { state.activeCategory = button.dataset.category; $("#category-filter").value = button.dataset.category; $$('[data-category]').forEach(other => other.classList.toggle("is-active", other === button)); applyFilters(); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); })); $("#load-more-button").addEventListener("click", () => { state.visibleCount += 8; renderItems(); });
    $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => closeDialog(button.closest("dialog")))); $$("dialog").forEach(dialog => { dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }); dialog.addEventListener("close", () => { if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }); }); $$('[data-auth-mode]').forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

    $("#auth-form").addEventListener("submit", async event => {
      event.preventDefault(); const button = $("#auth-submit"); setButtonBusy(button, true, state.authMode === "register" ? "יוצרים חשבון…" : "נכנסים…");
      try { if (!state.serverAvailable) throw new Error("ההרשמה תהיה זמינה לאחר הפרסום ב־Cloudflare"); const body = { email: $("#auth-email").value.trim(), password: $("#auth-password").value }; if (state.authMode === "register") body.fullName = $("#auth-name").value.trim(); const data = await api(`/api/auth/${state.authMode}`, { method: "POST", body }); state.user = data.user; updateAuthUI(); await refreshAccountSnapshot(); event.currentTarget.reset(); closeDialog($("#auth-dialog")); toast(state.authMode === "register" ? "ברוכים הבאים! החשבון נוצר בהצלחה" : "נכנסתם בהצלחה"); const action = state.pendingAction; state.pendingAction = null; action?.(); }
      catch (error) { toast(error.message || "לא הצלחנו להיכנס", "error"); } finally { setButtonBusy(button, false); setAuthMode(state.authMode); }
    });
    $("#request-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "שולחים בקשה…"); try { await submitLoanRequest({ itemId: $("#request-item-id").value, requestedFrom: $("#request-start").value, requestedUntil: $("#request-end").value, phone: $("#request-phone").value, note: $("#request-note").value }); event.currentTarget.reset(); closeDialog($("#request-dialog")); toast("הבקשה נשלחה למנהל הגמ״ח. נעדכן אתכם כשיש תשובה."); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את הבקשה", "error"); } finally { setButtonBusy(button, false); } });
    $("#gmach-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "שולחים לבדיקה…"); try { await api("/api/organizations", { method: "POST", body: { name: $("#gmach-name").value, primaryCategory: $("#gmach-category").value, city: $("#gmach-city").value, neighborhood: $("#gmach-neighborhood").value, description: $("#gmach-description").value, phone: $("#gmach-phone").value } }); event.currentTarget.reset(); closeDialog($("#gmach-dialog")); toast("עמוד הגמ״ח נשלח לבדיקה. נעדכן אתכם כשיאושר."); await refreshAccountSnapshot(); } catch (error) { toast(error.message || "לא הצלחנו לפתוח את הגמ״ח", "error"); } finally { setButtonBusy(button, false); } });
    $("#item-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "מפרסמים…"); try { const data = await api("/api/items", { method: "POST", body: { organizationId: $("#item-gmach").value, title: $("#item-name").value, category: $("#item-category").value, condition: $("#item-condition").value, quantity: Number($("#item-quantity").value), description: $("#item-description").value, loanConditions: $("#item-conditions").value } }); await uploadItemImages(data.item.id, [...$("#item-images").files]); event.currentTarget.reset(); closeDialog($("#item-form-dialog")); toast("הפריט נשמר ונשלח לבדיקה לפני פרסום"); await refreshAccountSnapshot(); } catch (error) { toast(error.message || "לא הצלחנו לפרסם את הפריט", "error"); } finally { setButtonBusy(button, false); } });

    ["#add-gmach-button", "#callout-add-gmach", "#dashboard-add-gmach"].forEach(selector => $(selector).addEventListener("click", openGmachForm)); $$('[data-footer-add-gmach]').forEach(button => button.addEventListener("click", openGmachForm)); $("#add-item-button").addEventListener("click", openItemForm); $$('[data-footer-add-item]').forEach(button => button.addEventListener("click", openItemForm)); $("#callout-learn-more").addEventListener("click", () => openInfo("terms")); $$('[data-open-info]').forEach(button => button.addEventListener("click", () => openInfo(button.dataset.openInfo)));
    $("#dashboard-button").addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard())); $$('[data-requires-auth]').filter(button => button !== $("#dashboard-button")).forEach(button => button.addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard()))); $$('[data-dashboard-tab]').forEach(button => button.addEventListener("click", () => showDashboard(button.dataset.dashboardTab))); $$('[data-go-home]').forEach(button => button.addEventListener("click", showHome));
    $("#sign-out-button").addEventListener("click", async () => { try { if (state.serverAvailable) await api("/api/auth/logout", { method: "POST" }); } catch { /* Cookie expires server-side. */ } state.user = null; state.favorites.clear(); state.dashboard = null; updateAuthUI(); showHome(); renderItems(); toast("יצאתם מהחשבון"); });
    window.addEventListener("hashchange", () => { if (location.hash === "#/dashboard") state.user ? showDashboard() : requireAuth(() => showDashboard()); else { $("#dashboard-view").hidden = true; $("#home-view").hidden = false; if (location.hash === "#/catalog") window.setTimeout(() => $("#catalog").scrollIntoView(), 0); } });
  }

  function registerWebMCP() {
    const context = document.modelContext; if (!context?.registerTool) return; const controller = new AbortController(); const register = tool => Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(error => console.warn("WebMCP registration failed", error));
    register({ name: "search_free_items", title: "חיפוש פריטים להשאלה", description: "Search the free-loan catalog by text, category, and city without changing data.", inputSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, city: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input = {}) { const query = normalize(input.query); return state.items.filter(item => (!query || normalize(`${item.title} ${item.description}`).includes(query)) && (!input.category || item.category === input.category) && (!input.city || item.city === input.city)).slice(0, 20).map(item => ({ id: item.id, title: item.title, category: item.category, city: item.city, available: item.availability_status === "available", free: true })); } });
    register({ name: "open_item_details", title: "פתיחת פרטי פריט", description: "Open a catalog item's details. This does not submit a request.", inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { const item = findItem(input.itemId); if (!item) throw new Error("Item not found"); openItem(item.id); return { id: item.id, title: item.title, opened: true }; } });
    register({ name: "submit_free_loan_request", title: "שליחת בקשת השאלה", description: "Submit a free loan request. Requires an authenticated user.", inputSchema: { type: "object", properties: { itemId: { type: "string" }, requestedFrom: { type: "string", format: "date" }, requestedUntil: { type: "string", format: "date" }, phone: { type: "string" }, note: { type: "string" } }, required: ["itemId", "requestedFrom", "requestedUntil", "phone"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const result = await submitLoanRequest(input); toast("בקשת ההשאלה נשלחה"); return { requestId: result.id, status: result.status, free: true }; } });
    window.addEventListener("pagehide", () => controller.abort(), { once: true });
  }

  async function init() {
    setupEvents(); setAuthMode("login"); updateAuthUI(); await detectServer(); await refreshUser(); await loadItems(); registerWebMCP();
    if (location.hash === "#/dashboard") state.user ? showDashboard() : requireAuth(() => showDashboard()); else if (location.hash === "#/catalog") window.setTimeout(() => $("#catalog").scrollIntoView(), 0);
  }
  init().catch(error => { console.error("App initialization failed", error); toast("אירעה תקלה בטעינת האתר. נסו לרענן את הדף.", "error"); });
})();
