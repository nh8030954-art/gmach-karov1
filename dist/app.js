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

  const state = {
    serverAvailable: false, items: [], filteredItems: [], favorites: new Set(), user: null, selectedItem: null,
    visibleCount: 8, activeCategory: "", pendingAction: null, dashboardTab: "requests", myOrganizations: [], dashboard: null, authMode: "login",
    editingOrganizationId: null, editingItemId: null, chatRequestId: null, chatTimer: null, notifications: [],
    customizations: new Map(), visualEditMode: false, selectedEditable: null, pendingVerificationEmail: "", supportEmail: "",
    discovery: { categories: [], cities: [], suggestions: [], organizations: [] }, viewMode: "list"
  };

  const SEARCH_ALIASES = Object.freeze({
    "אירועים": ["אירוע","שמחה","חתונה","בר מצווה","בת מצווה","ברית","קישוט","קישוטים","עיצוב","דקורציה","שולחן","כיסאות","קשת פרחים","תאורה","הגברה"],
    "כלי עבודה": ["כלים","תיקון","שיפוץ","מקדחה","מברגה","פטישון","סולם","מסור","ארגז כלים"],
    "תינוקות": ["תינוק","ילדים","עגלה","עגלת תינוק","טיולון","עריסה","לול","מיטת תינוק","כיסא אוכל","כסא אוכל","סלקל"],
    "רפואה": ["רפואי","שיקום","נגישות","כיסא גלגלים","כסא גלגלים","כיסא נכים","הליכון","רולטור","קביים","מיטה סיעודית"],
    "טיולים": ["טיול","קמפינג","מחנאות","אוהל","צידנית","תרמיל","מזרן שטח","שק שינה"],
    "בית ואירוח": ["בית","אירוח","אורחים","מזרן","מזרנים","שולחן מתקפל","כיסא מתקפל","כלי אוכל","פלטה","מיחם"],
    "תחפושות": ["תחפושת","פורים","בגד"], "ספרים": ["ספר","לימוד","קודש"]
  });

  const STATUS_LABELS = Object.freeze({ pending: "ממתינה לאישור", approved: "אושרה", declined: "נדחתה", cancelled: "בוטלה", collected: "נאסף", returned: "הוחזר", active: "פעיל", rejected: "נדחה", archived: "בארכיון", available: "זמין", unavailable: "לא זמין", reserved: "בתיאום" });

  function escapeHTML(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }
  function normalize(value) { return String(value || "").trim().toLocaleLowerCase("he"); }
  function formatDateTime(value) { try { return new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)); } catch { return String(value || ""); } }
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
    if (!response.ok) { const error = new Error(data?.error || "הפעולה לא הושלמה"); if (data && typeof data === "object") Object.assign(error, data); throw error; } return data;
  }

  async function detectServer() {
    try { const result = await api("/api/health"); state.serverAvailable = result?.ok === true; } catch { state.serverAvailable = false; }
    $("#connection-banner").hidden = state.serverAvailable;
  }
  async function loadPublicConfig() {
    if (!state.serverAvailable) return; try { const data = await api("/api/public-config"); state.supportEmail = data.supportEmail || ""; const link = $("#support-email-link"); if (state.supportEmail) { link.href = `mailto:${state.supportEmail}`; link.hidden = false; } } catch { /* Optional public configuration. */ }
  }
  async function loadDiscovery(query = "") {
    if (!state.serverAvailable) return;
    try { const data = await api(`/api/discovery${query ? `?q=${encodeURIComponent(query)}` : ""}`); state.discovery = data; renderDiscovery(); }
    catch (error) { console.warn("Discovery unavailable", error); }
  }
  function renderDiscovery() {
    $("#search-suggestions").innerHTML = (state.discovery.suggestions || []).map(value => `<option value="${escapeHTML(value)}"></option>`).join("");
    $$("[data-category]").forEach(button => { const count = state.discovery.categories?.find(row => row.category === button.dataset.category)?.count; const small = $("small", button); if (small && button.dataset.category && count) small.textContent = `${count} פריטים`; });
    $("#organizations-grid").innerHTML = (state.discovery.organizations || []).map(org => `<article class="organization-card"><div><span class="verification-chip ${org.verified ? "is-verified" : ""}">${org.verified ? "✓ גמ״ח מאומת" : "גמ״ח חדש"}</span><h3>${escapeHTML(org.name)}</h3><p>${escapeHTML(org.description)}</p></div><ul><li>📍 ${escapeHTML(org.city)}</li><li>📦 ${Number(org.item_count || 0)} פריטים</li><li>${org.rating ? `⭐ ${escapeHTML(org.rating)} (${Number(org.review_count || 0)})` : "חדש — ללא ביקורות"}</li></ul><button class="button button-secondary button-small" type="button" data-open-organization="${escapeHTML(org.id)}">צפייה בגמ״ח</button></article>`).join("") || '<div class="dashboard-empty"><strong>עדיין אין גמ״חים מאושרים</strong><p>הקהילה נבנית בימים אלה.</p></div>';
    $$('[data-open-organization]').forEach(button => button.addEventListener("click", () => openOrganization(button.dataset.openOrganization)));
  }
  function analytics(eventType, details = {}) { if (state.serverAvailable) api("/api/analytics/events", { method:"POST", body:{ eventType, ...details } }).catch(() => {}); }
  function requireAuth(action) {
    if (state.user) { action?.(); return true; }
    state.pendingAction = action || null; setAuthMode("login"); openDialog($("#auth-dialog")); return false;
  }
  function renderSkeletons() { $("#items-grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join(""); }
  async function loadItems() {
    renderSkeletons();
    if (!state.serverAvailable) { state.items = []; applyFilters(); return; }
    try { const params = new URLSearchParams(); if ($("#date-filter").value) params.set("date", $("#date-filter").value); const data = await api(`/api/items${params.size ? `?${params}` : ""}`); state.items = data.items || []; applyFilters(); }
    catch (error) { console.error("Unable to load items", error); $("#items-grid").innerHTML = ""; $("#empty-state").hidden = false; $("#empty-state h3").textContent = "לא הצלחנו לטעון את הפריטים"; $("#empty-state p").textContent = "כדאי לרענן את הדף בעוד רגע."; $("#results-summary").textContent = "שגיאה בטעינת הקטלוג"; }
  }
  function applyFilters({ resetVisible = true } = {}) {
    if (resetVisible) state.visibleCount = 8;
    const query = normalize($("#search-input").value), city = $("#city-filter").value, category = state.activeCategory || $("#category-filter").value, condition = $("#condition-filter").value, availableOnly = $("#available-only").checked, type = $("#type-filter").value, pickup = $("#pickup-filter").value, verifiedOnly = $("#verified-only").checked;
    const queryTerms = [query, ...Object.entries(SEARCH_ALIASES).flatMap(([key, values]) => query.includes(normalize(key)) || normalize(key).includes(query) || values.some(value => query.includes(normalize(value)) || normalize(value).includes(query)) ? [key, ...values] : [])].map(normalize).filter(Boolean);
    state.filteredItems = state.items.filter(item => { const haystack = normalize([item.title, item.description, item.category, item.subcategory, ...(item.tags || []), item.city, item.neighborhood, item.organizations?.name].join(" ")); return (!query || queryTerms.some(term => haystack.includes(term))) && (!city || item.city === city) && (!category || item.category === category) && (!condition || item.condition === condition) && (!type || item.item_type === type) && (!pickup || item.pickup_method === pickup) && (!verifiedOnly || item.organizations?.verified) && (!availableOnly || item.availability_status === "available"); });
    const sort = $("#sort-select").value;
    state.filteredItems.sort((a, b) => sort === "newest" ? new Date(b.created_at) - new Date(a.created_at) : sort === "city" ? String(a.city).localeCompare(String(b.city), "he") : Number(b.availability_status === "available") - Number(a.availability_status === "available") || Number(Boolean(b.organizations?.verified)) - Number(Boolean(a.organizations?.verified)));
    renderItems();
  }
  function itemCardMarkup(item) {
    const image = safeImageUrl(item.image_urls?.[0]), favorite = state.favorites.has(item.id), available = item.availability_status === "available", count = Number(item.available_count ?? item.quantity), updated = item.inventory_updated_at ? formatRelative(item.inventory_updated_at) : "";
    return `<article class="item-card" data-item-id="${escapeHTML(item.id)}"><div class="item-card-media" style="--media-bg:${safeColor(item.cover_color)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.title)}" loading="lazy">` : `<span class="item-symbol">${iconSvg(item.icon)}</span>`}<span class="availability-badge ${available ? "" : "is-busy"}">${available ? count > 0 ? `${count} זמינים` : "זמין עכשיו" : "בתיאום"}</span><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite-id="${escapeHTML(item.id)}" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div><div class="item-card-body"><div class="item-card-topline"><span class="item-category-label">${escapeHTML(item.category)}</span><span>${escapeHTML(item.condition)}</span></div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p><div class="trust-line"><button type="button" data-open-organization="${escapeHTML(item.organizations?.id)}">${item.organizations?.verified ? "✓ " : ""}${escapeHTML(item.organizations?.name || "גמ״ח")}</button>${item.organizations?.rating ? `<span>⭐ ${escapeHTML(item.organizations.rating)}</span>` : ""}<small>${updated ? `עודכן ${escapeHTML(updated)}` : ""}</small></div><div class="item-card-footer"><span class="item-location">📍 ${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</span><button class="item-card-open" type="button" data-open-item="${escapeHTML(item.id)}">לפרטים ←</button></div></div></article>`;
  }
  function formatRelative(value) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); return days === 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`; }
  function renderItems() {
    const visible = state.filteredItems.slice(0, state.visibleCount);
    const isEmpty = state.filteredItems.length === 0;
    const isLaunchEmpty = state.serverAvailable && state.items.length === 0;
    const isOffline = !state.serverAvailable;
    $("#items-grid").innerHTML = visible.map(itemCardMarkup).join("");
    $("#map-results").innerHTML = visible.map(item => `<article><span class="map-pin">📍</span><div><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.organizations?.name)} · ${escapeHTML(item.city)}</p></div><button data-open-item="${escapeHTML(item.id)}">פרטים</button></article>`).join("");
    $("#empty-state").hidden = !isEmpty;
    $("#items-grid").hidden = isEmpty;
    $("#load-more-button").hidden = isEmpty || state.visibleCount >= state.filteredItems.length;
    if (state.filteredItems.length) {
      $("#results-summary").textContent = `${state.filteredItems.length} פריטים מתאימים נמצאו`;
    } else if (isOffline) {
      $("#results-summary").textContent = "הקטלוג אינו זמין כרגע";
      $("#empty-state h3").textContent = "לא הצלחנו להתחבר כרגע";
      $("#empty-state p").textContent = "נסו לרענן את הדף בעוד רגע.";
      $("#empty-clear-button").textContent = "ניסיון נוסף";
    } else if (isLaunchEmpty) {
      $("#results-summary").textContent = "הקטלוג נבנה יחד עם הקהילה";
      $("#empty-state h3").textContent = "הקטלוג נבנה יחד עם הקהילה";
      $("#empty-state p").textContent = "מנהלים גמ״ח או מחזיקים ציוד שאפשר להשאיל? פרסמו אותו בחינם ועזרו למשפחה הבאה.";
      $("#empty-clear-button").textContent = "פרסום גמ״ח בחינם";
    } else {
      $("#results-summary").textContent = "אין כרגע תוצאות שמתאימות לסינון";
      $("#empty-state h3").textContent = "לא מצאנו פריט מתאים כרגע";
      $("#empty-state p").textContent = "נסו להרחיב את האזור או לבחור קטגוריה אחרת.";
      $("#empty-clear-button").textContent = "ניקוי החיפוש";
    }
    setResultsView(state.viewMode); $$('[data-open-item]').forEach(button => button.addEventListener("click", () => openItem(button.dataset.openItem))); $$('[data-favorite-id]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); toggleFavorite(button.dataset.favoriteId); })); $$('[data-open-organization]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); openOrganization(button.dataset.openOrganization); })); $$(".item-card").forEach(card => card.addEventListener("dblclick", () => openItem(card.dataset.itemId)));
  }
  function findItem(id) { return state.items.find(item => String(item.id) === String(id)); }
  function openItem(id) {
    const item = findItem(id); if (!item) return; state.selectedItem = item;
    const image = safeImageUrl(item.image_urls?.[0]), favorite = state.favorites.has(item.id), available = item.availability_status === "available", verified = Boolean(item.organizations?.verified);
    $("#item-dialog-content").innerHTML = `<article class="item-detail"><div class="item-detail-media" style="--media-bg:${safeColor(item.cover_color)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(item.title)}">` : `<span class="item-symbol">${iconSvg(item.icon)}</span>`}<span class="availability-badge ${available ? "" : "is-busy"}">${available ? "זמין עכשיו" : "זמין בתיאום"}</span></div><div class="item-detail-copy"><div class="detail-meta"><span>${escapeHTML(item.category)}</span><span class="dot"></span><span>${escapeHTML(item.condition)}</span></div><h2 id="item-dialog-title">${escapeHTML(item.title)}</h2><p class="item-detail-description">${escapeHTML(item.description)}</p><ul class="detail-facts"><li><span>מיקום איסוף</span><strong>${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</strong></li><li><span>כמות זמינה</span><strong>${escapeHTML(item.quantity || 1)}</strong></li><li><span>עלות</span><strong>חינם לגמרי</strong></li><li><span>זמינות</span><strong>${available ? "זמין לבקשה" : "יש לתאם תאריך"}</strong></li></ul><div class="gmach-owner"><span class="owner-mark" aria-hidden="true">ג</span><span><strong>${escapeHTML(item.organizations?.name || "גמ״ח קהילתי")}${verified ? " ✓" : ""}</strong><small>${verified ? "גמ״ח מאומת" : "מלווה קהילתי"} · פרטי קשר נמסרים רק לאחר אישור</small></span></div><div class="detail-actions"><button class="button button-primary" type="button" id="detail-request-button">בקשת השאלה חינמית</button><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" id="detail-favorite-button" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div><button class="report-link" type="button" id="detail-report-button">דיווח על פריט או מידע לא נכון</button></div></article>`;
    const orgButton = document.createElement("button"); orgButton.type="button"; orgButton.className="button button-secondary"; orgButton.textContent="עמוד הגמ״ח"; orgButton.addEventListener("click", () => { closeDialog($("#item-dialog")); openOrganization(item.organizations?.id); });
    const shareButton = document.createElement("button"); shareButton.type="button"; shareButton.className="button button-secondary"; shareButton.textContent="שיתוף"; shareButton.addEventListener("click", () => shareItem(item));
    $(".detail-actions", $("#item-dialog-content")).append(orgButton, shareButton);
    $("#detail-request-button").addEventListener("click", () => startRequest(item.id)); $("#detail-favorite-button").addEventListener("click", () => toggleFavorite(item.id, true)); $("#detail-report-button").addEventListener("click", () => openReport(item.id)); analytics("item_view", { entityId:item.id, category:item.category, city:item.city }); openDialog($("#item-dialog"));
  }
  async function shareItem(item) {
    const url = `${location.origin}${location.pathname}#/item/${encodeURIComponent(item.id)}`; const data = { title:item.title, text:`מצאתי את ${item.title} בגמ״ח ברגע`, url };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url); toast("הקישור הועתק"); } analytics("share", { entityId:item.id }); } catch { /* User cancelled sharing. */ }
  }
  async function openOrganization(id) {
    if (!id) return;
    try { const data = await api(`/api/organizations/${encodeURIComponent(id)}/public`); const org=data.organization, items=data.items||[], reviews=data.reviews||[], hours=Object.entries(org.hours||{});
      $("#organization-dialog-content").innerHTML = `<article class="organization-detail"><div class="organization-hero"><span class="verification-chip ${org.verified ? "is-verified" : ""}">${org.verified ? "✓ עמוד גמ״ח נבדק" : "גמ״ח חדש"}</span><h2 id="organization-title">${escapeHTML(org.name)}</h2><p>${escapeHTML(org.description)}</p><div class="organization-meta"><span>📍 ${escapeHTML([org.city,org.neighborhood].filter(Boolean).join(", "))}</span><span>${org.rating ? `⭐ ${escapeHTML(org.rating)} (${Number(org.review_count||0)} ביקורות)` : "עדיין אין ביקורות"}</span><span>${org.last_active_at ? `פעיל ${escapeHTML(formatRelative(org.last_active_at))}` : "פעילות טרם עודכנה"}</span></div></div><div class="organization-facts"><section><h3>איך מקבלים?</h3><p>${escapeHTML((org.pickupOptions||[]).map(v => ({pickup:"איסוף עצמי",delivery:"משלוח",coordination:"בתיאום"}[v]||v)).join(" · ") || "בתיאום")}</p></section><section><h3>אזור שירות</h3><p>${escapeHTML(org.service_area || org.city)}</p></section><section><h3>שעות פעילות</h3><p>${hours.length ? hours.map(([d,h]) => `${escapeHTML(d)}: ${escapeHTML(h)}`).join(" · ") : "בתיאום מראש"}</p></section><section><h3>פרטיות ותיאום</h3><p>פרטי קשר וכתובת אינם מוצגים לציבור. התיאום מתבצע דרך הבקשה והצ׳אט באתר.</p></section></div><h3>פריטים בגמ״ח</h3><div class="mini-items">${items.map(item => `<button type="button" data-org-item="${escapeHTML(item.id)}"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.availability_status === "available" ? "זמין" : "בתיאום")}</span></button>`).join("") || "אין כרגע פריטים פעילים"}</div><h3>ביקורות</h3><div class="review-list">${reviews.map(review => `<blockquote><strong>${"★".repeat(Number(review.rating))}</strong><p>${escapeHTML(review.comment || "ללא הערה")}</p><cite>${escapeHTML(review.author_name)}</cite></blockquote>`).join("") || "עדיין אין ביקורות"}</div></article>`;
      $$('[data-org-item]', $("#organization-dialog-content")).forEach(button => button.addEventListener("click", () => { closeDialog($("#organization-dialog")); openItem(button.dataset.orgItem); })); openDialog($("#organization-dialog"));
    } catch (error) { toast(error.message,"error"); }
  }
  function startRequest(id) { const item = findItem(id); if (!item) return; requireAuth(() => { closeDialog($("#item-dialog")); $("#request-item-id").value = item.id; $("#request-item-name").textContent = item.title; openDialog($("#request-dialog")); }); }
  async function toggleFavorite(id, fromDetail = false) {
    requireAuth(async () => { const exists = state.favorites.has(id); try { await api(`/api/favorites/${encodeURIComponent(id)}`, { method: exists ? "DELETE" : "POST" }); if (exists) state.favorites.delete(id); else state.favorites.add(id); renderItems(); if (fromDetail) openItem(id); toast(exists ? "הפריט הוסר מהמועדפים" : "הפריט נוסף למועדפים"); } catch (error) { toast(error.message, "error"); } });
  }

  function setAuthMode(mode) {
    state.authMode = mode === "register" ? "register" : "login"; $$('[data-auth-mode]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.authMode === state.authMode)));
    const register = state.authMode === "register"; $("#auth-name-field").hidden = !register; $("#auth-name").required = register; $("#auth-consent-row").hidden = !register; $("#auth-consent").required = register; $("#forgot-password-button").hidden = register; $("#auth-password").autocomplete = register ? "new-password" : "current-password"; $("#auth-title").textContent = register ? "מצטרפים לגמ״ח ברגע" : "כניסה לגמ״ח ברגע"; $("#auth-description").textContent = register ? "יוצרים חשבון בחינם ומתחילים להשאיל ולעזור." : "נכנסים עם אימייל וסיסמה כדי לבקש, לשמור ולנהל פריטים."; $("#auth-submit").textContent = register ? "יצירת חשבון" : "כניסה";
  }
  async function finishAuthentication(user, form = null) {
    state.user = user; state.pendingVerificationEmail = ""; updateAuthUI(); await refreshAccountSnapshot(); await refreshNotifications(true); form?.reset(); closeDialog($("#auth-dialog")); const action = state.pendingAction; state.pendingAction = null; action?.();
  }
  async function refreshUser() {
    if (!state.serverAvailable) return;
    try { const data = await api("/api/auth/me"); state.user = data.user; updateAuthUI(); if (state.user) { await refreshAccountSnapshot(); await refreshNotifications(true); } }
    catch { state.user = null; updateAuthUI(); }
  }
  async function refreshAccountSnapshot() {
    if (!state.user) return null; const data = await api("/api/me/dashboard"); state.dashboard = data; state.myOrganizations = data.organizations || []; state.favorites = new Set(data.favorites || []); renderItems(); return data;
  }
  function updateAuthUI() {
    const label = state.user ? "האזור שלי" : "כניסה"; $("#dashboard-button").textContent = label; $$('[data-requires-auth]').forEach(button => { if (button !== $("#dashboard-button")) button.textContent = label; }); $("#dashboard-name").textContent = state.user?.fullName || state.user?.email?.split("@")[0] || "חבר/ה"; $("#admin-tab").hidden = state.user?.role !== "admin"; $("#notifications-button").hidden = !state.user; if (!state.user) { $("#notification-badge").hidden = true; state.notifications = []; }
  }
  async function refreshNotifications(silent = false) {
    if (!state.user) return;
    try { const data = await api("/api/notifications"); state.notifications = data.notifications || []; const unread = Number(data.unread || 0); $("#notification-badge").textContent = unread > 99 ? "99+" : String(unread); $("#notification-badge").hidden = unread === 0; }
    catch (error) { if (!silent) toast(error.message || "לא הצלחנו לטעון התראות", "error"); }
  }
  function renderNotifications() {
    const list = $("#notification-list");
    list.innerHTML = state.notifications.length ? state.notifications.map(item => `<article class="notification-item ${item.read_at ? "" : "is-unread"}"><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.body)}</p><time>${escapeHTML(formatDateTime(item.created_at))}</time>${item.request_id ? `<button type="button" data-notification-chat="${escapeHTML(item.request_id)}">פתיחת השיחה</button>` : ""}</article>`).join("") : '<div class="dashboard-empty"><strong>אין התראות חדשות</strong><p>עדכונים על בקשות ושיחות יופיעו כאן.</p></div>';
    $$('[data-notification-chat]', list).forEach(button => button.addEventListener("click", () => { closeDialog($("#notifications-dialog")); openChat(button.dataset.notificationChat); }));
  }
  async function openNotifications() { await refreshNotifications(); renderNotifications(); openDialog($("#notifications-dialog")); }
  async function submitLoanRequest(payload) { if (!state.user) throw new Error("יש להתחבר לפני שליחת בקשה"); const data = await api("/api/loan-requests", { method: "POST", body: payload }); return data.request; }
  function openGmachForm(organizationId = null) {
    requireAuth(() => {
      const form = $("#gmach-form"); form.reset(); state.editingOrganizationId = organizationId;
      const organization = organizationId ? state.myOrganizations.find(row => row.id === organizationId) : null;
      $("#gmach-form-title").textContent = organization ? "עריכת עמוד הגמ״ח" : "פתיחת עמוד גמ״ח";
      $("#gmach-form-description").textContent = organization ? "שינוי בפרטים הציבוריים יישלח לבדיקה חוזרת כדי לשמור על אמינות הקטלוג." : "ממלאים פרטים בסיסיים. העמוד יפורסם לאחר בדיקה קצרה.";
      $("#gmach-submit").textContent = organization ? "שמירת שינויים" : "שליחה לבדיקה";
      if (organization) {
        $("#gmach-name").value = organization.name || ""; $("#gmach-category").value = organization.primary_category || ""; $("#gmach-city").value = organization.city || "";
        $("#gmach-neighborhood").value = organization.neighborhood || ""; $("#gmach-description").value = organization.description || ""; $("#gmach-phone").value = organization.contact_phone || ""; $("#gmach-address").value=organization.address||""; $("#gmach-service-area").value=organization.service_area||""; $("#gmach-hours").value=organization.hours?.["שעות"]||""; $$('[name="gmach-pickup"]').forEach(input=>input.checked=(organization.pickupOptions||["pickup"]).includes(input.value)); $("#gmach-consent").checked = true;
      }
      openDialog($("#gmach-dialog"));
    });
  }
  async function openItemForm(itemId = null) {
    requireAuth(async () => { try {
      await refreshAccountSnapshot(); const form = $("#item-form"); form.reset(); state.editingItemId = itemId;
      const item = itemId ? (state.dashboard?.items || []).find(row => row.id === itemId) : null;
      const select = $("#item-gmach"); const organizations = state.myOrganizations.filter(org => ["approved", "pending"].includes(org.status) || org.id === item?.organization_id);
      select.innerHTML = '<option value="">בחירת גמ״ח</option>' + organizations.map(org => `<option value="${escapeHTML(org.id)}">${escapeHTML(org.name)}</option>`).join("");
      if (!organizations.length) { toast("כדי לפרסם פריט, פותחים קודם עמוד גמ״ח", "error"); openGmachForm(); return; }
      $("#item-form-title").textContent = item ? "עריכת פריט" : "מה תרצו להשאיל?"; $("#item-submit").textContent = item ? "שמירת שינויים" : "פרסום הפריט"; select.disabled = Boolean(item);
      if (item) {
        select.value = item.organization_id; $("#item-name").value = item.title || ""; $("#item-category").value = item.category || ""; $("#item-condition").value = item.condition || "מצוין";
        $("#item-quantity").value = item.quantity || 1; $("#item-description").value = item.description || ""; $("#item-conditions").value = item.loan_conditions || ""; $("#item-type").value=item.item_type||"loan"; $("#item-pickup").value=item.pickup_method||"pickup"; $("#item-subcategory").value=item.subcategory||""; $("#item-tags").value=(item.tags||[]).join(", "); $("#item-free").checked = true;
      } else { $("#item-quantity").value = 1; $("#item-condition").value = "מצוין"; $("#item-free").checked = true; }
      openDialog($("#item-form-dialog"));
    } catch (error) { toast(error.message || "לא הצלחנו לטעון את הגמ״חים שלך", "error"); } });
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
    let actions = `<button class="button button-secondary button-small" data-open-chat="${escapeHTML(row.id)}">שיחה</button>`;
    if (row.direction === "incoming" && row.status === "pending") actions += `<button class="button button-primary button-small" data-request-decision="approved" data-request-id="${escapeHTML(row.id)}">אישור</button><button class="button button-secondary button-small" data-request-decision="declined" data-request-id="${escapeHTML(row.id)}">דחייה</button>`;
    if (row.direction === "incoming" && row.status === "approved") actions += `<button class="button button-primary button-small" data-request-action="collected" data-request-id="${escapeHTML(row.id)}">סימון כנאסף</button>`;
    if (row.direction === "incoming" && row.status === "collected") actions += `<button class="button button-primary button-small" data-request-action="returned" data-request-id="${escapeHTML(row.id)}">סימון כהוחזר</button>`;
    if (row.direction === "outgoing" && row.status === "pending") actions += `<button class="button button-secondary button-small" data-request-action="cancelled" data-request-id="${escapeHTML(row.id)}">ביטול בקשה</button>`;
    if (row.direction === "outgoing" && row.status === "returned") actions += `<button class="button button-primary button-small" data-review-request="${escapeHTML(row.id)}">כתיבת ביקורת</button>`;
    return actions;
  }
  function renderDashboardRequests(requests) {
    const requestRows = requests.length ? requests.map(row => `<article class="dashboard-row"><div><h3>${escapeHTML(row.items?.title || "פריט")}</h3><p>${row.direction === "incoming" ? `בקשה מאת ${escapeHTML(row.borrower_name || "שואל/ת")}` : "בקשה ששלחתי"} · ${escapeHTML(row.items?.organizations?.name || "גמ״ח")}</p>${row.note ? `<p class="dashboard-note">${escapeHTML(row.note)}</p>` : ""}${row.manager_note ? `<p class="dashboard-note"><strong>הודעת מנהל:</strong> ${escapeHTML(row.manager_note)}</p>` : ""}${row.borrower_phone ? `<p class="contact-detail" dir="ltr">${escapeHTML(row.borrower_phone)}</p>` : ""}${row.contact_phone ? `<p class="contact-detail">טלפון הגמ״ח: <span dir="ltr">${escapeHTML(row.contact_phone)}</span></p>` : ""}</div><div><span class="status-chip ${escapeHTML(row.status)}">${escapeHTML(STATUS_LABELS[row.status] || row.status)}</span><p>${escapeHTML(row.requested_from)} — ${escapeHTML(row.requested_until)}</p></div><div class="dashboard-row-actions">${requestActions(row)}</div></article>`).join("") : '<div class="dashboard-empty"><strong>עוד אין כאן בקשות</strong><p>כשתבקשו פריט או תקבלו בקשה לגמ״ח שלכם, היא תופיע כאן.</p></div>';
    const helpRows=(state.dashboard?.helpRequests||[]).map(row=>`<article class="dashboard-row"><div><h3>${row.urgency==="urgent"?"🔴 ":""}${escapeHTML(row.title)}</h3><p>${escapeHTML(row.city)} · ${escapeHTML(row.category||"כללי")}</p></div><span class="status-chip ${escapeHTML(row.status)}">${escapeHTML(row.status==="open"?"פתוחה":row.status)}</span></article>`).join("");
    $("#dashboard-content").innerHTML = `${requestRows}<section class="dashboard-subsection"><div class="section-heading"><div><h2>בקשות העזרה שלי</h2></div><button class="button button-secondary button-small" id="dashboard-help-request">בקשה חדשה</button></div>${helpRows||'<p>אין בקשות עזרה פתוחות.</p>'}</section>`;
    $$('[data-request-action]').forEach(button => button.addEventListener("click", () => updateRequestStatus(button.dataset.requestId, button.dataset.requestAction)));
    $$('[data-request-decision]').forEach(button => button.addEventListener("click", () => openDecision(button.dataset.requestId, button.dataset.requestDecision)));
    $$('[data-open-chat]').forEach(button => button.addEventListener("click", () => openChat(button.dataset.openChat)));
    $$('[data-review-request]').forEach(button => button.addEventListener("click", () => openReview(button.dataset.reviewRequest))); $("#dashboard-help-request")?.addEventListener("click",openHelpRequest);
  }
  function renderDashboardItems(items) {
    if (!items.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד לא פורסמו פריטים</strong><p>הוסיפו את הפריט הראשון ותנו לו לעזור לעוד משפחה.</p><button class="button button-primary" type="button" id="dashboard-empty-add-item">הוספת פריט</button></div>'; $("#dashboard-empty-add-item")?.addEventListener("click", () => openItemForm()); return; }
    $("#dashboard-content").innerHTML = items.map(item => `<article class="dashboard-row"><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.organizations?.name || "הגמ״ח שלי")} · ${escapeHTML(item.quantity)} יחידות</p></div><div><span class="status-chip ${escapeHTML(item.status)}">${escapeHTML(STATUS_LABELS[item.status] || item.status)}</span><p>${escapeHTML(STATUS_LABELS[item.availability_status] || item.availability_status)}</p></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" type="button" data-edit-item="${escapeHTML(item.id)}">עריכה</button><button class="button button-secondary button-small" type="button" data-toggle-item="${escapeHTML(item.id)}" data-current-availability="${escapeHTML(item.availability_status)}">${item.availability_status === "available" ? "סימון כלא זמין" : "סימון כזמין"}</button><button class="button button-small ${item.status === "archived" ? "button-secondary" : "button-danger"}" type="button" data-archive-item="${escapeHTML(item.id)}" data-is-archived="${item.status === "archived"}">${item.status === "archived" ? "החזרה לבדיקה" : "הסתרה"}</button></div></article>`).join("");
    $$('[data-edit-item]').forEach(button => button.addEventListener("click", () => openItemForm(button.dataset.editItem))); $$('[data-toggle-item]').forEach(button => button.addEventListener("click", () => toggleItemAvailability(button.dataset.toggleItem, button.dataset.currentAvailability))); $$('[data-archive-item]').forEach(button => button.addEventListener("click", () => archiveItem(button.dataset.archiveItem, button.dataset.isArchived !== "true")));
  }
  function renderDashboardOrganizations(organizations) {
    if (!organizations.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד אין לכם עמוד גמ״ח</strong><p>הפתיחה חינמית ולוקחת כמה דקות.</p><button class="button button-primary" type="button" id="dashboard-empty-add-gmach">פתיחת גמ״ח</button></div>'; $("#dashboard-empty-add-gmach")?.addEventListener("click", () => openGmachForm()); return; }
    $("#dashboard-content").innerHTML = organizations.map(org => `<article class="dashboard-row"><div><h3>${escapeHTML(org.name)}</h3><p>${escapeHTML([org.city, org.neighborhood].filter(Boolean).join(", "))}</p></div><div><span class="status-chip ${escapeHTML(org.status)}">${escapeHTML(org.status === "approved" ? "מאושר" : org.status === "rejected" ? "נדחה" : "בבדיקה")}</span><p>${org.is_hidden ? "מוסתר מהקטלוג" : org.verified ? "מאומת ✓" : ""}</p></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" type="button" data-edit-org="${escapeHTML(org.id)}">עריכה</button><button class="button button-small ${org.is_hidden ? "button-secondary" : "button-danger"}" type="button" data-hide-org="${escapeHTML(org.id)}" data-hidden="${Boolean(org.is_hidden)}">${org.is_hidden ? "הצגה מחדש" : "הסתרת הגמ״ח"}</button></div></article>`).join("");
    $$('[data-edit-org]').forEach(button => button.addEventListener("click", () => openGmachForm(button.dataset.editOrg))); $$('[data-hide-org]').forEach(button => button.addEventListener("click", () => toggleOrganizationHidden(button.dataset.hideOrg, button.dataset.hidden !== "true")));
  }
  async function renderAdmin() {
    const [data, overview, appearance, userData, content, analyticsData] = await Promise.all([api("/api/admin/pending"), api("/api/admin/overview"), api("/api/admin/site-settings"), api("/api/admin/users"), api("/api/admin/content"),api("/api/admin/analytics")]), organizations = data.organizations || [], items = data.items || [], reports = data.reports || [];
    const reasonLabels = { incorrect: "מידע לא נכון", unsafe: "חשש בטיחותי", commercial: "בקשת תשלום", unavailable: "אינו זמין", other: "אחר" };
    const s = appearance.settings || {};
    $("#dashboard-content").innerHTML = `<section class="admin-console"><div class="admin-toolbar"><button class="button button-primary" id="start-visual-editor">✦ הפיכת האתר למצב עריכה</button><button class="button button-secondary" id="reset-visual-editor">איפוס כל העריכות החזותיות</button><span>לחיצה על כל רכיב באתר תפתח את כל אפשרויות העיצוב שלו.</span></div><div class="admin-overview"><article><strong>${overview.stats.users}</strong><span>משתמשים</span></article><article><strong>${overview.stats.organizations}</strong><span>גמ״חים</span></article><article><strong>${overview.stats.items}</strong><span>פריטים</span></article><article><strong>${overview.stats.requests}</strong><span>בקשות</span></article></div>
      <details open><summary>עיצוב ותוכן האתר</summary><form id="site-settings-form" class="stack-form admin-settings-grid"><label><span>שם האתר</span><input id="setting-site-name" value="${escapeHTML(s.site_name || "")}" required></label><label><span>סלוגן</span><input id="setting-tagline" value="${escapeHTML(s.tagline || "")}" required></label><label><span>כותרת ראשית</span><input id="setting-hero-title" value="${escapeHTML(s.hero_title || "")}" required></label><label class="wide"><span>תיאור ראשי</span><textarea id="setting-hero-description" required>${escapeHTML(s.hero_description || "")}</textarea></label><label><span>צבע ראשי</span><input id="setting-primary" type="color" value="${escapeHTML(s.primary_color || "#243f75")}"></label><label><span>צבע משני</span><input id="setting-secondary" type="color" value="${escapeHTML(s.secondary_color || "#9d7137")}"></label><label><span>צבע הדגשה</span><input id="setting-accent" type="color" value="${escapeHTML(s.accent_color || "#e7bd78")}"></label><label><span>גופן</span><select id="setting-font">${fontOptions()}</select></label><label><span>גודל בסיס</span><input id="setting-font-size" type="number" min="14" max="22" value="${escapeHTML(s.base_font_size || 16)}"></label><label><span>כתובת לוגו</span><input id="setting-logo" value="${escapeHTML(s.logo_url || "/gmach-berega-logo.jpg")}" dir="ltr"></label><button class="button button-primary" type="submit">שמירת עיצוב ותוכן</button></form><h3>היסטוריית גרסאות</h3><div class="version-list">${(appearance.versions || []).map(v => `<button class="button button-secondary button-small" data-restore-version="${escapeHTML(v.id)}">שחזור ${escapeHTML(formatDateTime(v.created_at))}</button>`).join("") || "עדיין אין גרסאות קודמות"}</div></details>
      <details><summary>אבטחת החשבון שלי</summary><div class="dashboard-row-actions"><button class="button button-secondary" id="admin-change-password">שינוי סיסמה</button><button class="button button-primary" id="admin-enable-2fa">${state.user.twoFactorEnabled ? "הגדרה מחדש של אימות דו־שלבי" : "הפעלת אימות דו־שלבי"}</button></div><div id="two-factor-setup"></div></details>
      <details><summary>משתמשים (${userData.users.length})</summary><div class="admin-users">${userData.users.map(u => `<article class="dashboard-row"><div><h3>${escapeHTML(u.full_name)}</h3><p dir="ltr">${escapeHTML(u.email)}</p><small>נוצר: ${escapeHTML(formatDateTime(u.created_at))} · כניסה אחרונה: ${escapeHTML(u.last_login_at ? formatDateTime(u.last_login_at) : "טרם נכנס")}</small></div><div><label>הרשאה <select data-user-role="${escapeHTML(u.id)}"><option value="member" ${u.role !== "admin" ? "selected" : ""}>משתמש</option><option value="admin" ${u.role === "admin" ? "selected" : ""}>מנהל</option></select></label><label>מצב <select data-user-status="${escapeHTML(u.id)}"><option value="active" ${u.account_status === "active" ? "selected" : ""}>פעיל</option><option value="suspended" ${u.account_status === "suspended" ? "selected" : ""}>מושעה</option></select></label><label class="check"><input type="checkbox" data-user-verified="${escapeHTML(u.id)}" ${u.email_verified ? "checked" : ""}> מייל מאומת</label><button class="button button-secondary button-small" data-save-user="${escapeHTML(u.id)}">שמירה</button></div></article>`).join("")}</div></details>
      <details><summary>כל הגמ״חים (${content.organizations.length})</summary>${content.organizations.map(o => `<article class="dashboard-row"><div><h3>${escapeHTML(o.name)}</h3><p>${escapeHTML(o.owner_name || "ללא בעלים")} · ${escapeHTML(o.owner_email || "")} · ${escapeHTML(o.city)}</p></div><div><span class="status-chip ${escapeHTML(o.status)}">${escapeHTML(o.status)}</span><p>${o.verified ? "מאומת" : "לא מאומת"} · ${o.is_hidden ? "מוסתר" : "מוצג"}</p></div></article>`).join("") || "אין גמ״חים"}</details>
      <details><summary>כל הפריטים (${content.items.length})</summary>${content.items.map(i => `<article class="dashboard-row"><div><h3>${escapeHTML(i.title)}</h3><p>${escapeHTML(i.organization_name)} · ${escapeHTML(i.category)} · כמות ${escapeHTML(i.quantity)}</p></div><div><span class="status-chip ${escapeHTML(i.status)}">${escapeHTML(i.status)}</span><p>${escapeHTML(i.availability_status)}</p></div></article>`).join("") || "אין פריטים"}</details>
      <details><summary>כל בקשות ההשאלה (${content.requests.length})</summary>${content.requests.map(r => `<article class="dashboard-row"><div><h3>${escapeHTML(r.item_title)}</h3><p>${escapeHTML(r.borrower_name)} · ${escapeHTML(r.borrower_email)} · ${escapeHTML(r.organization_name)}</p></div><div><span class="status-chip ${escapeHTML(r.status)}">${escapeHTML(r.status)}</span><p>${escapeHTML(r.requested_from)}–${escapeHTML(r.requested_until)}</p></div></article>`).join("") || "אין בקשות"}</details>
      <details><summary>גרסאות עריכה חיה (${content.visualVersions.length})</summary><div class="version-list">${content.visualVersions.map(v => `<button class="button button-secondary button-small" data-restore-visual="${escapeHTML(v.id)}">שחזור ${escapeHTML(formatDateTime(v.created_at))}</button>`).join("") || "אין גרסאות"}</div></details>
      <details><summary>אישורים ודיווחים (${organizations.length + items.length + reports.length})</summary><h2 class="dashboard-section-title">גמ״חים שממתינים לאישור (${organizations.length})</h2>${organizations.map(org => `<article class="dashboard-row"><div><h3>${escapeHTML(org.name)}</h3><p>${escapeHTML(org.owner_name || "משתמש/ת")} · ${escapeHTML(org.city)}</p></div><div class="dashboard-row-actions"><button class="button button-primary button-small" data-admin-org="${escapeHTML(org.id)}" data-admin-status="approved">אישור</button><button class="button button-secondary button-small" data-admin-org="${escapeHTML(org.id)}" data-admin-status="rejected">דחייה</button></div></article>`).join("")}<h2 class="dashboard-section-title">פריטים (${items.length})</h2>${items.map(item => `<article class="dashboard-row"><div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.org_name)}</p></div><div class="dashboard-row-actions"><button class="button button-primary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="active">פרסום</button><button class="button button-secondary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="rejected">דחייה</button></div></article>`).join("")}<h2 class="dashboard-section-title">דיווחים (${reports.length})</h2>${reports.map(report => `<article class="dashboard-row"><div><h3>${escapeHTML(report.item_title)}</h3><p>${escapeHTML(reasonLabels[report.reason] || report.reason)}</p></div><button class="button button-primary button-small" data-admin-report="${escapeHTML(report.id)}" data-admin-status="reviewed">טופל</button></article>`).join("")}</details>
      <details><summary>מדדי שימוש וביקוש</summary><div class="analytics-grid"><section><h3>חיפושים נפוצים</h3>${(analyticsData.searches||[]).map(x=>`<p><strong>${escapeHTML(x.query)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>ערים מובילות</h3>${(analyticsData.cities||[]).map(x=>`<p><strong>${escapeHTML(x.city)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>קטגוריות מבוקשות</h3>${(analyticsData.categories||[]).map(x=>`<p><strong>${escapeHTML(x.category)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>התאמות מוצלחות</h3><p><strong>${Number(analyticsData.matching?.successful||0)}</strong><span>מתוך ${Number(analyticsData.matching?.total||0)} בקשות</span></p></section></div></details>
      <details><summary>יומן פעילות</summary>${(overview.audit || []).map(a => `<article class="audit-row"><strong>${escapeHTML(a.action)}</strong><span>${escapeHTML(a.actor_name || "מערכת")} · ${escapeHTML(formatDateTime(a.created_at))}</span></article>`).join("") || "אין עדיין פעולות מתועדות"}</details></section>`;
    $("#setting-font").value = s.font_family || "Arial, sans-serif";
    $$('[data-admin-org]').forEach(button => button.addEventListener("click", () => moderate("organization", button.dataset.adminOrg, button.dataset.adminStatus))); $$('[data-admin-item]').forEach(button => button.addEventListener("click", () => moderate("item", button.dataset.adminItem, button.dataset.adminStatus))); $$('[data-admin-report]').forEach(button => button.addEventListener("click", () => moderate("report", button.dataset.adminReport, button.dataset.adminStatus)));
    $("#site-settings-form").addEventListener("submit", saveSiteSettings); $$('[data-restore-version]').forEach(button => button.addEventListener("click", () => restoreSettings(button.dataset.restoreVersion))); $("#admin-change-password").addEventListener("click", changeMyPassword); $("#admin-enable-2fa").addEventListener("click", beginTwoFactorSetup);
    $("#start-visual-editor").addEventListener("click", startVisualEditor); $("#reset-visual-editor").addEventListener("click", resetVisualEditor); $$('[data-restore-visual]').forEach(button => button.addEventListener("click", () => restoreVisualVersion(button.dataset.restoreVisual))); $$('[data-save-user]').forEach(button => button.addEventListener("click", () => saveManagedUser(button.dataset.saveUser)));
  }
  async function moderate(kind, id, status) {
    try { const path = kind === "organization" ? `/api/admin/organizations/${encodeURIComponent(id)}` : kind === "report" ? `/api/admin/reports/${encodeURIComponent(id)}` : `/api/admin/items/${encodeURIComponent(id)}`; await api(path, { method: "PATCH", body: kind === "organization" ? { status, verified: status === "approved" } : { status } }); toast(kind === "report" ? "הדיווח טופל" : "הפרסום עודכן"); await renderAdmin(); await loadItems(); } catch (error) { toast(error.message, "error"); }
  }
  async function resetVisualEditor() { if (!window.confirm("לאפס את כל שינויי העריכה החיה? תישמר גרסה לשחזור.")) return; try { await api("/api/admin/page-customizations", { method: "DELETE" }); location.reload(); } catch (error) { toast(error.message, "error"); } }
  async function restoreVisualVersion(id) { try { await api(`/api/admin/page-customizations/versions/${encodeURIComponent(id)}/restore`, { method: "POST", body: {} }); location.reload(); } catch (error) { toast(error.message, "error"); } }
  async function saveManagedUser(id) { try { const role = document.querySelector(`[data-user-role="${CSS.escape(id)}"]`).value, accountStatus = document.querySelector(`[data-user-status="${CSS.escape(id)}"]`).value, emailVerified = document.querySelector(`[data-user-verified="${CSS.escape(id)}"]`).checked; await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { role, accountStatus, emailVerified } }); toast("המשתמש עודכן"); await renderAdmin(); } catch (error) { toast(error.message, "error"); } }
  async function loadSiteSettings() {
    if (!state.serverAvailable) return;
    try {
      const { settings: s } = await api("/api/site-settings"); if (!s) return;
      document.documentElement.style.setProperty("--navy", s.primary_color); document.documentElement.style.setProperty("--teal", s.secondary_color); document.documentElement.style.setProperty("--accent", s.accent_color); document.documentElement.style.setProperty("--site-font", s.font_family); document.documentElement.style.fontSize = `${s.base_font_size}px`;
      const siteName=s.site_name||"גמ״ח ברגע", tagline=s.tagline||"גדולה גמילות חסדים יותר מן הצדקה", logo=!s.logo_url||s.logo_url==="/gmach-berega-mark.jpg"?"/gmach-berega-logo.jpg":s.logo_url; $$(".brand-copy strong").forEach(el => el.textContent = siteName); $$(".brand-copy small").forEach(el => el.textContent = tagline); $("#hero-title").textContent = s.hero_title||"מה תרצו לשאול היום?"; $("#hero-title").nextElementSibling.textContent = s.hero_description||"מוצאים ציוד להשאלה בחינם מגמ״חים ואנשים טובים קרוב לבית."; $$(".brand-logo-crop img").forEach(img => img.src = logo); document.title = `${siteName} — ${tagline}`;
    } catch (error) { console.warn("Site settings unavailable", error); }
  }
  async function loadPageCustomizations() {
    if (!state.serverAvailable) return;
    try { const data = await api("/api/page-customizations"); state.customizations = new Map((data.customizations || []).map(item => [item.key, item])); for (const item of state.customizations.values()) applyPageCustomization(item); }
    catch (error) { console.warn("Page customizations unavailable", error); }
  }
  function elementEditKey(element) {
    if (element.id) return `#${element.id}`;
    const parts = [];
    let current = element;
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase(); const siblings = current.parentElement ? [...current.parentElement.children].filter(node => node.tagName === current.tagName) : [];
      parts.unshift(`${tag}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : ""}`); current = current.parentElement;
    }
    return parts.join(">");
  }
  function applyPageCustomization(item) {
    let element; try { element = document.querySelector(item.key); } catch { return; } if (!element) return;
    if (item.text !== null && item.text !== undefined) element.textContent = item.text;
    Object.assign(element.style, item.styles || {});
    if (typeof item.attributes?.hidden === "boolean") element.hidden = item.attributes.hidden;
    if (typeof item.attributes?.disabled === "boolean" && "disabled" in element) element.disabled = item.attributes.disabled;
    if (item.attributes?.href && element instanceof HTMLAnchorElement) element.setAttribute("href", item.attributes.href);
  }
  const EDITOR_FONTS = [
    ["Arial, sans-serif", "Arial"], ["Alef, Arial, sans-serif", "Alef"], ["Arimo, Arial, sans-serif", "Arimo"],
    ["Assistant, Arial, sans-serif", "Assistant"], ["Heebo, Arial, sans-serif", "Heebo"], ["IBM Plex Sans Hebrew, Arial, sans-serif", "IBM Plex Sans Hebrew"],
    ["Miriam Libre, Arial, sans-serif", "Miriam Libre"], ["Noto Sans Hebrew, Arial, sans-serif", "Noto Sans Hebrew"], ["Rubik, Arial, sans-serif", "Rubik"],
    ["Secular One, Arial, sans-serif", "Secular One"], ["Varela Round, Arial, sans-serif", "Varela Round"], ["David Libre, serif", "David Libre"],
    ["Frank Ruhl Libre, serif", "Frank Ruhl Libre"], ["Noto Serif Hebrew, serif", "Noto Serif Hebrew"], ["Suez One, serif", "Suez One"]
  ];
  function fontOptions(includeDefault = false) { return `${includeDefault ? '<option value="">ללא שינוי</option>' : ""}${EDITOR_FONTS.map(([value, label]) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join("")}`; }
  function startVisualEditor() {
    state.visualEditMode = true; showHome(); document.body.classList.add("visual-edit-mode");
    const panel = document.createElement("aside"); panel.id = "visual-editor-panel"; panel.innerHTML = `<header><strong>עריכה חיה</strong><button type="button" id="visual-editor-exit">סיום</button></header><p id="visual-editor-hint">לחצו על כל רכיב באתר כדי לערוך אותו.</p><form id="visual-editor-form" hidden><label>טקסט<textarea id="ve-text" rows="4"></textarea></label><div class="editor-grid"><label>גופן<select id="ve-font">${fontOptions(true)}</select></label><label>גודל<input id="ve-size" placeholder="למשל 32px"></label><label>צבע<input id="ve-color" type="color"></label><label>רקע<input id="ve-bg" type="color"></label><label>יישור<select id="ve-align"><option value="">רגיל</option><option value="right">ימין</option><option value="center">מרכז</option><option value="left">שמאל</option></select></label><label>רוחב<input id="ve-width" placeholder="auto / 100% / 500px"></label><label>הזזה אופקית<input id="ve-x" type="number" value="0"></label><label>הזזה אנכית<input id="ve-y" type="number" value="0"></label><label>רווח עליון<input id="ve-mt" placeholder="0px"></label><label>רווח תחתון<input id="ve-mb" placeholder="0px"></label><label>ריפוד<input id="ve-padding" placeholder="למשל 20px"></label><label>סדר<input id="ve-order" type="number"></label><label>קישור<input id="ve-href" dir="ltr" placeholder="#/catalog או https://..."></label><label class="check"><input id="ve-hidden" type="checkbox"> מוסתר</label><label class="check"><input id="ve-disabled" type="checkbox"> מושבת</label></div><div class="editor-actions"><button class="button button-primary" type="submit">שמירת השדות ששונו</button><button class="button button-secondary" id="ve-clear" type="button">איפוס הרכיב</button></div></form>`; document.body.append(panel);
    document.addEventListener("click", visualEditorPick, true); $("#visual-editor-exit").addEventListener("click", stopVisualEditor); $("#visual-editor-form").addEventListener("submit", saveVisualElement); $("#ve-clear").addEventListener("click", clearVisualElement); $$("#visual-editor-form input, #visual-editor-form select, #visual-editor-form textarea").forEach(control => { control.addEventListener("input", () => control.dataset.dirty = "true"); control.addEventListener("change", () => control.dataset.dirty = "true"); });
  }
  function stopVisualEditor() { state.visualEditMode = false; state.selectedEditable?.classList.remove("is-edit-selected"); state.selectedEditable = null; document.body.classList.remove("visual-edit-mode"); document.removeEventListener("click", visualEditorPick, true); $("#visual-editor-panel")?.remove(); }
  function visualEditorPick(event) {
    if (!state.visualEditMode || event.target.closest("#visual-editor-panel") || event.target.closest("dialog")) return;
    event.preventDefault(); event.stopPropagation(); const element = event.target.closest("header,main,footer,header *,main *,footer *"); if (!element || ["HTML","BODY","SCRIPT","STYLE","PATH"].includes(element.tagName)) return;
    state.selectedEditable?.classList.remove("is-edit-selected"); state.selectedEditable = element; element.classList.add("is-edit-selected"); fillVisualEditor(element);
  }
  function fillVisualEditor(element) {
    const form = $("#visual-editor-form"); form.hidden = false; $("#visual-editor-hint").textContent = `${element.tagName.toLowerCase()} · ${elementEditKey(element)}`; const computed = getComputedStyle(element);
    $("#ve-text").value = element.children.length === 0 ? element.textContent.trim() : ""; $("#ve-font").value = [...$("#ve-font").options].some(o => o.value === element.style.fontFamily) ? element.style.fontFamily : ""; $("#ve-size").value = element.style.fontSize; $("#ve-color").value = rgbToHex(computed.color); $("#ve-bg").value = computed.backgroundColor === "rgba(0, 0, 0, 0)" ? "#ffffff" : rgbToHex(computed.backgroundColor); $("#ve-align").value = element.style.textAlign; $("#ve-width").value = element.style.width; $("#ve-mt").value = element.style.marginTop; $("#ve-mb").value = element.style.marginBottom; $("#ve-order").value = element.style.order; $("#ve-href").value = element instanceof HTMLAnchorElement ? element.getAttribute("href") || "" : ""; $("#ve-hidden").checked = element.hidden; $("#ve-disabled").checked = Boolean(element.disabled); $$("#visual-editor-form input, #visual-editor-form select, #visual-editor-form textarea").forEach(control => delete control.dataset.dirty);
  }
  function rgbToHex(value) { const nums = String(value).match(/\d+/g); return nums?.length >= 3 ? `#${nums.slice(0,3).map(n => Number(n).toString(16).padStart(2,"0")).join("")}` : "#000000"; }
  async function saveVisualElement(event) {
    event.preventDefault(); const element = state.selectedEditable; if (!element) return; const key = elementEditKey(element); const leaf = element.children.length === 0;
    const previous = state.customizations.get(key) || { text: null, styles: {}, attributes: {} }; const styles = { ...(previous.styles || {}) }; const attributes = { ...(previous.attributes || {}) }; let text = previous.text;
    const styleFields = [["#ve-font","fontFamily"],["#ve-size","fontSize"],["#ve-color","color"],["#ve-bg","backgroundColor"],["#ve-align","textAlign"],["#ve-width","width"],["#ve-mt","marginTop"],["#ve-mb","marginBottom"],["#ve-order","order"]]; for (const [selector, property] of styleFields) if ($(selector).dataset.dirty) styles[property] = $(selector).value;
    if ($("#ve-padding").dataset.dirty) for (const property of ["paddingTop","paddingBottom","paddingInlineStart","paddingInlineEnd"]) styles[property] = $("#ve-padding").value;
    if ($("#ve-x").dataset.dirty || $("#ve-y").dataset.dirty) styles.transform = `translate(${$("#ve-x").value || 0}px, ${$("#ve-y").value || 0}px)`;
    if (leaf && $("#ve-text").dataset.dirty) text = $("#ve-text").value; if ($("#ve-href").dataset.dirty) attributes.href = $("#ve-href").value || undefined; if ($("#ve-hidden").dataset.dirty) attributes.hidden = $("#ve-hidden").checked; if ($("#ve-disabled").dataset.dirty) attributes.disabled = $("#ve-disabled").checked;
    try { const data = await api("/api/admin/page-customizations", { method: "PUT", body: { key, text, styles, attributes } }); state.customizations.set(key, data.customization); applyPageCustomization(data.customization); element.classList.add("is-edit-selected"); fillVisualEditor(element); toast("רק השדות ששינית נשמרו"); } catch (error) { toast(error.message, "error"); }
  }
  function clearVisualElement() { const element = state.selectedEditable; if (!element) return; element.removeAttribute("style"); $("#ve-text").value = element.textContent.trim(); toast("האיפוס מוצג זמנית; לחצו שמירה כדי לשמור אותו"); }
  async function saveSiteSettings(event) {
    event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "שומרים…");
    try { await api("/api/admin/site-settings", { method: "PATCH", body: { siteName: $("#setting-site-name").value, tagline: $("#setting-tagline").value, heroTitle: $("#setting-hero-title").value, heroDescription: $("#setting-hero-description").value, primaryColor: $("#setting-primary").value, secondaryColor: $("#setting-secondary").value, accentColor: $("#setting-accent").value, fontFamily: $("#setting-font").value, baseFontSize: Number($("#setting-font-size").value), logoUrl: $("#setting-logo").value } }); await loadSiteSettings(); toast("העיצוב והתוכן נשמרו ונוצרה גרסה לשחזור"); await renderAdmin(); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); }
  }
  async function restoreSettings(id) { try { await api(`/api/admin/site-settings/versions/${encodeURIComponent(id)}/restore`, { method: "POST", body: {} }); await loadSiteSettings(); toast("הגרסה שוחזרה"); await renderAdmin(); } catch (error) { toast(error.message, "error"); } }
  async function changeMyPassword() { const currentPassword = window.prompt("הסיסמה הנוכחית"); if (!currentPassword) return; const newPassword = window.prompt("סיסמה חדשה — לפחות 10 תווים"); if (!newPassword) return; try { await api("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }); toast("הסיסמה שונתה בהצלחה"); } catch (error) { toast(error.message, "error"); } }
  async function beginTwoFactorSetup() {
    try { const data = await api("/api/auth/2fa/setup", { method: "POST", body: {} }); const container = $("#two-factor-setup"); const qr = window.qrcode(0, "M"); qr.addData(data.otpauthUri); qr.make(); container.innerHTML = `<div class="two-factor-card"><h3>סרקו באפליקציית Authenticator</h3><div class="totp-qr">${qr.createSvgTag(5, 2)}</div><p>מפתח ידני: <code dir="ltr">${escapeHTML(data.secret)}</code></p><form id="confirm-2fa-form" class="inline-form"><input id="confirm-2fa-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="קוד בן 6 ספרות" required><button class="button button-primary" type="submit">אישור והפעלה</button></form></div>`; $("#confirm-2fa-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/auth/2fa/confirm", { method: "POST", body: { code: $("#confirm-2fa-code").value } }); state.user.twoFactorEnabled = true; toast("אימות דו־שלבי הופעל"); await renderAdmin(); } catch (error) { toast(error.message, "error"); } });
    } catch (error) { toast(error.message, "error"); }
  }
  function openDecision(id, status) { $("#decision-request-id").value = id; $("#decision-status").value = status; $("#decision-note").value = ""; const decline = status === "declined"; $("#decision-title").textContent = decline ? "דחיית בקשת ההשאלה" : "אישור בקשת ההשאלה"; $("#decision-description").textContent = decline ? "כתבו סיבה קצרה וברורה שתישלח לשואל/ת." : "אפשר לצרף הוראות איסוף או הודעה קצרה."; $("#decision-note-label").innerHTML = decline ? "סיבת הדחייה" : "הודעה לשואל/ת <small>(רשות)</small>"; $("#decision-note").required = decline; $("#decision-submit").textContent = decline ? "שליחת הדחייה" : "אישור הבקשה"; openDialog($("#decision-dialog")); }
  async function updateRequestStatus(id, status, managerNote = null) { try { await api(`/api/loan-requests/${encodeURIComponent(id)}/status`, { method: "PATCH", body: { status, managerNote } }); toast("הבקשה עודכנה"); await refreshNotifications(true); showDashboard("requests"); } catch (error) { toast(error.message, "error"); } }
  async function toggleItemAvailability(id, current) { const availabilityStatus = current === "available" ? "unavailable" : "available"; try { await api(`/api/items/${encodeURIComponent(id)}/availability`, { method: "PATCH", body: { availabilityStatus } }); toast("זמינות הפריט עודכנה"); await loadItems(); showDashboard("items"); } catch (error) { toast(error.message, "error"); } }
  async function archiveItem(id, archived) { try { await api(`/api/items/${encodeURIComponent(id)}`, { method: "PATCH", body: { archived } }); toast(archived ? "הפריט הוסתר" : "הפריט נשלח לבדיקה מחדש"); await loadItems(); showDashboard("items"); } catch (error) { toast(error.message, "error"); } }
  async function toggleOrganizationHidden(id, hidden) { try { await api(`/api/organizations/${encodeURIComponent(id)}`, { method: "PATCH", body: { hidden } }); toast(hidden ? "הגמ״ח הוסתר מהקטלוג" : "הגמ״ח חזר לקטלוג"); await loadItems(); showDashboard("gmachim"); } catch (error) { toast(error.message, "error"); } }
  function stopChatPolling() { if (state.chatTimer) window.clearInterval(state.chatTimer); state.chatTimer = null; }
  async function loadChatMessages(silent = false) {
    if (!state.chatRequestId) return;
    try {
      const data = await api(`/api/loan-requests/${encodeURIComponent(state.chatRequestId)}/messages`); const container = $("#chat-messages"); const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 80;
      $("#chat-title").textContent = data.request?.itemTitle || "תיאום ההשאלה"; $("#chat-subtitle").textContent = `${data.request?.organizationName || "גמ״ח"} · ${STATUS_LABELS[data.request?.status] || data.request?.status || ""}`;
      container.innerHTML = data.messages?.length ? data.messages.map(message => `<article class="chat-message ${message.isMine ? "is-mine" : ""}"><strong>${escapeHTML(message.isMine ? "אני" : message.sender_name)}</strong><p>${escapeHTML(message.body)}</p><time>${escapeHTML(formatDateTime(message.created_at))}</time></article>`).join("") : '<div class="chat-empty"><strong>השיחה מתחילה כאן</strong><p>כתבו הודעה לתיאום האיסוף, ההחזרה או שינוי התאריכים.</p></div>';
      if (nearBottom || !silent) container.scrollTop = container.scrollHeight;
    } catch (error) { if (!silent) toast(error.message || "לא הצלחנו לטעון את השיחה", "error"); }
  }
  function openChat(requestId) {
    requireAuth(async () => { stopChatPolling(); state.chatRequestId = requestId; $("#chat-messages").innerHTML = '<div class="skeleton-card" aria-hidden="true"></div>'; openDialog($("#chat-dialog")); await loadChatMessages(); state.chatTimer = window.setInterval(() => loadChatMessages(true), 5000); });
  }
  function openReport(itemId) { requireAuth(() => { closeDialog($("#item-dialog")); $("#report-form").reset(); $("#report-item-id").value = itemId; openDialog($("#report-dialog")); }); }
  function showHome() { $("#dashboard-view").hidden = true; $("#home-view").hidden = false; history.replaceState(null, "", "#/"); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function setResultsView(mode) { state.viewMode=mode === "map" ? "map" : "list"; $("#items-grid").hidden=state.viewMode === "map" || !state.filteredItems.length; $("#map-results").hidden=state.viewMode !== "map" || !state.filteredItems.length; $("#list-view-button").classList.toggle("is-active",state.viewMode==="list"); $("#map-view-button").classList.toggle("is-active",state.viewMode==="map"); }
  function openHelpRequest() { requireAuth(() => { $("#help-request-form").reset(); $("#help-city").value=$("#city-filter").value; $("#help-title").value=$("#search-input").value; openDialog($("#help-request-dialog")); }); }
  async function submitHelpRequest(event) { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"מפרסמים…"); try { await api("/api/help-requests",{method:"POST",body:{title:$("#help-title").value,city:$("#help-city").value,category:$("#help-category").value,description:$("#help-description").value,urgency:$("#help-urgent").checked?"urgent":"normal"}}); event.currentTarget.reset(); closeDialog($("#help-request-dialog")); toast("בקשת העזרה פורסמה לגמ״חים הרלוונטיים"); await refreshAccountSnapshot(); } catch(error){toast(error.message,"error");} finally{setButtonBusy(button,false);} }
  function openReview(requestId) { $("#review-request-id").value=requestId; $("#review-form").reset(); $("#review-request-id").value=requestId; openDialog($("#review-dialog")); }
  async function submitReview(event) { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"מפרסמים…"); try { await api("/api/reviews",{method:"POST",body:{requestId:$("#review-request-id").value,rating:Number($("#review-rating").value),comment:$("#review-comment").value}}); closeDialog($("#review-dialog")); toast("תודה! הביקורת פורסמה"); await loadDiscovery(); } catch(error){toast(error.message,"error");} finally{setButtonBusy(button,false);} }
  function resetFilters() { const hadDate = Boolean($("#date-filter").value); $("#search-form").reset(); $("#category-filter").value = ""; $("#condition-filter").value = ""; $("#type-filter").value=""; $("#pickup-filter").value=""; $("#verified-only").checked=false; $("#available-only").checked = true; state.activeCategory = ""; $$('[data-category]').forEach(button => button.classList.toggle("is-active", button.dataset.category === "")); if (hadDate) loadItems(); else applyFilters(); }
  async function handleEmptyAction() {
    if (!state.serverAvailable) { await detectServer(); await loadItems(); return; }
    if (state.items.length === 0) { openGmachForm(); return; }
    resetFilters();
  }

  const INFO_CONTENT = Object.freeze({
    safety: '<h2 id="info-dialog-title">כללי השאלה בטוחה</h2><p>גמ״ח ברגע מחבר בין מנהלי גמ״חים לשואלים. האחריות לבדיקת הפריט, לתיאום ולשימוש נשארת בידי שני הצדדים.</p><h3>לפני האיסוף</h3><ul><li>ודאו שהפריט, המידות והמועד מתאימים לצורך.</li><li>תאמו מקום ושעת איסוף ברורים בתוך הצ׳אט באתר.</li><li>אל תעבירו פרטי תשלום — כל ההשאלות בפלטפורמה חינמיות.</li><li>בציוד רפואי, בטיחותי או לתינוקות יש לוודא התאמה ותקינות עם גורם מוסמך.</li></ul><h3>בעת ההחזרה</h3><ul><li>החזירו בזמן, נקי ובמצב שבו התקבל.</li><li>דווחו מיד על נזק, תקלה או עיכוב.</li><li>דווחו למנהל האתר על בקשת תשלום, מידע מטעה או ציוד מסוכן.</li></ul>',
    terms: `<h2 id="info-dialog-title">תנאי שימוש בגמ״ח ברגע</h2><p><strong>עודכן לאחרונה: 23 בספטמבר 2026.</strong> פתיחת חשבון, פרסום או שליחת בקשה מהווים הסכמה לתנאים אלה.</p><h3>1. תפקיד האתר</h3><p>גמ״ח ברגע הוא פלטפורמת תיווך טכנולוגית המחברת בין גמ״חים לבין אנשים המבקשים ציוד. האתר אינו הבעלים, המחזיק, המשאיל, היצרן, המוביל, המבטח או המפקח של הפריטים, ואינו צד להסכם שנוצר בין המשתמשים. כל מסירה, שימוש והחזרה נעשים ישירות ובאחריות הצדדים.</p><h3>2. חינם — ללא ערבות מצד האתר</h3><p>ייעוד האתר הוא השאלה ללא תמורה ומנהל גמ״ח מתחייב שלא לגבות דמי השאלה או תשלום מוסווה. למרות זאת, האתר אינו מתחייב שכל משתמש יעמוד בכללים, שהפריט אכן יימסר בחינם, שיהיה זמין, תקין, חוקי, נקי, בטוח או מתאים, או שהמידע בפרסום יהיה מלא. דרישת תשלום או תנאי שלא פורסם מראש מחייבים הפסקת ההתקשרות ודיווח להנהלת האתר. פיקדון סביר מותר רק אם צוין מראש ואינו תשלום מוסווה.</p><h3>3. חשבון ואבטחה</h3><ul><li>יש למסור פרטים נכונים ולהשתמש במייל השייך למשתמש.</li><li>אין להתחזות, להעביר חשבון, לעקוף חסימה או להטעות.</li><li>המשתמש אחראי לסיסמה, לאימות הדו־שלבי ולפעולות בחשבון.</li><li>קטין ישתמש באתר רק בהסכמת הורה או אפוטרופוס ובפיקוחו.</li></ul><h3>4. הפעילות מתנהלת באתר</h3><p>עמוד הגמ״ח, המלאי, הבקשות, ההודעות והעדכונים מנוהלים בגמ״ח ברגע. אין צורך באתר חיצוני, ואין לפרסם קישור שנועד לעקוף את מנגנוני הבטיחות, הדיווח או התיעוד.</p><h3>5. אחריות מנהל גמ״ח</h3><ul><li>לפרסם רק ציוד שבסמכותו להציע ולתאר במדויק מצב, כמות, מגבלות ותנאים.</li><li>לעדכן זמינות, להשיב לבקשות ולשמור על פרטיות השואלים.</li><li>לבדוק תקינות סבירה ולהתריע על בלאי, סיכון או חלק חסר.</li><li>לא לפרסם ציוד אסור, גנוב, מזויף, נשק, תרופות מרשם או ציוד מסוכן שלא כדין.</li></ul><h3>6. אחריות השואל</h3><ul><li>לבדוק לפני האיסוף שהפריט מתאים, שלם ובטוח לצורך.</li><li>להשתמש לפי הוראות ודין ולהחזיר בזמן ובמצב שבו התקבל.</li><li>לדווח מיד על נזק, אובדן, תקלה או עיכוב.</li><li>בציוד רפואי, בטיחותי, חשמלי או לתינוקות לקבל ייעוץ מגורם מוסמך; האתר אינו נותן ייעוץ מקצועי.</li></ul><h3>7. צ׳אט, בקשות וביקורות</h3><p>אישור בקשה אינו התחייבות של האתר שההשאלה תושלם. הצ׳אט נועד לתיאום ענייני בלבד. אסורים ספאם, איומים, הטרדה, תוכן פוגעני, פרטי צד שלישי או בקשות תשלום. ביקורת חייבת לשקף חוויה אמיתית.</p><h3>8. דיווח חובה</h3><p><strong>מי שנתקל בבעיה עם גמ״ח, אדם, פריט או התנהלות מסוימת נדרש לדווח להנהלת האתר</strong> באמצעות כפתור הדיווח או התמיכה. בכלל זה דרישת תשלום, מידע מטעה, ציוד מסוכן, הטרדה, פגיעה בפרטיות, אי־מסירה, אי־החזרה או חשד להונאה. יש לשמור תיעוד ולשתף פעולה בבירור. בסכנה מיידית יש לפנות לגורמי החירום.</p><h3>9. בדיקה ואכיפה</h3><p>הנהלת האתר רשאית לבדוק פרסומים, לבקש הבהרות, להסתיר תוכן, להגביל פעולות ולהשעות או למחוק חשבון. סימון אימות משקף בדיקה מוגבלת במועד מסוים ואינו ערבות לאדם, לגמ״ח או לפריט.</p><h3>10. תוכן וקניין רוחני</h3><p>המעלה תוכן מצהיר שיש לו זכות לעשות בו שימוש ומעניק לאתר רישיון להציג, לאחסן ולעבד אותו לצורך הפעלת השירות, אבטחתו וקידומו.</p><h3>11. זמינות והגבלת אחריות</h3><p>השירות ניתן כפי שהוא וייתכנו תקלות או שינויים. בכפוף לדין, האתר והנהלתו אינם אחראים למצב הפריט, התאמתו, בטיחותו, מסירתו, החזרתו, נזק, אובדן, גניבה, מחלוקת או מצג של משתמש. האחריות לבדיקה ולהחלטה להתקשר מוטלת על הצדדים, ואין בכך לגרוע מזכות שלא ניתן לוותר עליה לפי דין.</p><h3>12. סיום ודין</h3><p>ניתן להפסיק שימוש ולבקש מחיקת חשבון, בכפוף לשמירת מידע הנדרש לבירור, אבטחה או דין. על השירות יחול הדין הישראלי. לפניות בנוגע לתנאים יש להשתמש בערוצי התמיכה באתר. מסמך זה אינו תחליף לייעוץ משפטי פרטני.</p>`,
    privacy: `<h2 id="info-dialog-title">מדיניות פרטיות</h2><p><strong>עודכנה לאחרונה: 23 בספטמבר 2026.</strong> מדיניות זו מסבירה איזה מידע נאסף, מדוע, למי הוא נחשף ומהן אפשרויות המשתמש.</p><h3>1. המידע שנאסף</h3><ul><li>פרטי חשבון: שם, מייל מאומת, גיבוב סיסמה, תפקיד ומועדי כניסה.</li><li>פרטי גמ״ח ופריטים: עיר, שכונה, תיאור, שעות, תמונות, מלאי ותנאים.</li><li>מידע תפעולי פרטי: טלפון וכתובת איסוף שאינם מוצגים בקטלוג הפתוח.</li><li>פעילות: בקשות, תאריכים, צ׳אט, מועדפים, ביקורות, דיווחים ופניות.</li><li>מידע טכני ואבטחה: כתובת IP או גיבוב שלה, אירועי התחברות ויומני שגיאות.</li></ul><h3>2. מטרות</h3><p>המידע משמש ליצירת ואימות חשבון, הפעלת הקטלוג, חיבור ותיאום בין הצדדים, ניהול מלאי ובקשות, תמיכה, אבטחה, מניעת הונאה, אכיפת התנאים ושיפור השירות.</p><h3>3. מסירה והסכמה</h3><p>אין חובה כללית למסור מידע, אך ללא שדות החובה לא ניתן לספק חלק מהשירות. העיבוד נעשה לצורך מתן השירות, על בסיס הסכמה במקומות המתאימים ולצורך אינטרסים לגיטימיים של אבטחה ומניעת שימוש לרעה.</p><h3>4. מי רואה מה</h3><p>שם הגמ״ח, עיר, תיאור, פריטים וזמינות עשויים להיות ציבוריים. מייל, סיסמה, טלפון וכתובת איסוף אינם מוצגים בקטלוג. מידע תיאום נחשף רק לצדדים הרלוונטיים ובהתאם להרשאות. מנהלי מערכת מורשים יכולים לגשת למידע רק לצורכי הפעלה, תמיכה, אבטחה וטיפול בדיווחים.</p><h3>5. ספקים</h3><p>Cloudflare מספקת אירוח, בסיס נתונים, אחסון ואבטחה. Resend משמשת לשליחת קודי אימות, איפוס סיסמה והודעות תפעוליות. הספקים מקבלים רק את המידע הדרוש ועשויים לעבדו מחוץ לישראל בהתאם לתשתיותיהם ולדין.</p><h3>6. אבטחה</h3><p>האתר משתמש בהצפנת תעבורה, עוגיות מאובטחות, הרשאות שרת, הגבלת ניסיונות, אימות מייל, אימות דו־שלבי וגיבוב סיסמאות. אין מערכת חסינה לחלוטין; אין לשלוח בצ׳אט סיסמאות, אשראי, מסמכים רפואיים או מידע רגיש שאינו הכרחי.</p><h3>7. שמירה ומחיקה</h3><p>מידע נשמר כל עוד החשבון פעיל או ככל שנדרש למטרות שלשמן נאסף. לאחר מחיקה עשוי להישמר מידע מצומצם לתקופה סבירה לצורך אבטחה, מניעת הונאה, בירור, גיבוי או חובה חוקית.</p><h3>8. זכויות</h3><p>ניתן לעיין במידע באזור האישי, לתקן פרטים, לשנות סיסמה ולמחוק חשבון. ניתן לפנות להנהלה בבקשת עיון, תיקון, מחיקה או התנגדות; לפני פעולה רגישה תידרש הוכחת זהות.</p><h3>9. עוגיות</h3><p>נעשה שימוש בעוגיית התחברות מאובטחת ובאחסון מקומי להגדרות תצוגה. אין שימוש מיועד לפרסום התנהגותי. חסימתם עלולה לפגוע בכניסה או בהעדפות.</p><h3>10. ילדים ושינויים</h3><p>השירות אינו מיועד לשימוש עצמאי של ילדים. הורה הסבור שנמסר מידע ללא הרשאה מתבקש לפנות להנהלה. שינוי מהותי במדיניות יוצג באתר ותאריך העדכון ישתנה.</p><h3>11. אירוע פרטיות</h3><p>חשד לחשיפה, התחזות, הטרדה או שימוש במידע שלא לצורך מחייב דיווח מיידי להנהלת האתר באמצעות מנגנוני התמיכה והדיווח.</p>`
  });
  function openInfo(type) { $("#info-dialog-content").innerHTML = INFO_CONTENT[type] || INFO_CONTENT.safety; openDialog($("#info-dialog")); }

  function setupEvents() {
    $("#current-year").textContent = new Date().getFullYear(); const today = new Date().toISOString().slice(0, 10); $("#date-filter").min = today; $("#request-start").min = today; $("#request-end").min = today; $("#request-start").addEventListener("change", () => { $("#request-end").min = $("#request-start").value || today; });
    $("#mobile-menu-button").addEventListener("click", () => { const menu = $("#mobile-menu"); menu.hidden = !menu.hidden; $("#mobile-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); }); $$("#mobile-menu a, #mobile-menu button").forEach(el => el.addEventListener("click", () => { $("#mobile-menu").hidden = true; $("#mobile-menu-button").setAttribute("aria-expanded", "false"); }));
    $("#search-form").addEventListener("submit", async event => { event.preventDefault(); if ($("#date-filter").value) await loadItems(); else applyFilters(); const details={query:$("#search-input").value.trim(),city:$("#city-filter").value,category:state.activeCategory||$("#category-filter").value}; analytics(state.filteredItems.length ? "search" : "no_results",details); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); }); ["#city-filter", "#category-filter", "#condition-filter", "#type-filter", "#pickup-filter", "#verified-only", "#available-only", "#sort-select"].forEach(selector => $(selector).addEventListener("change", () => applyFilters())); $("#date-filter").addEventListener("change", loadItems);
    let suggestTimer; $("#search-input").addEventListener("input", () => { clearTimeout(suggestTimer); suggestTimer=setTimeout(() => loadDiscovery($("#search-input").value.trim()),300); });
    $("#list-view-button").addEventListener("click", () => setResultsView("list")); $("#map-view-button").addEventListener("click", () => setResultsView("map"));
    $("#path-borrower").addEventListener("click", () => $("#search-input").focus()); $("#path-manager").addEventListener("click", () => openGmachForm());
    ["#nav-help-request","#mobile-help-request"].forEach(selector => $(selector).addEventListener("click", openHelpRequest));
    $("#filters-button").addEventListener("click", () => { const panel = $("#filter-panel"); panel.hidden = !panel.hidden; $("#filters-button").setAttribute("aria-expanded", String(!panel.hidden)); }); $("#clear-filters").addEventListener("click", resetFilters); $("#empty-clear-button").addEventListener("click", handleEmptyAction); $("#all-categories-button").addEventListener("click", () => { resetFilters(); $("#catalog").scrollIntoView({ behavior: "smooth" }); });
    $$('[data-category]').forEach(button => button.addEventListener("click", () => { state.activeCategory = button.dataset.category; $("#category-filter").value = button.dataset.category; $$('[data-category]').forEach(other => other.classList.toggle("is-active", other === button)); applyFilters(); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); })); $("#load-more-button").addEventListener("click", () => { state.visibleCount += 8; renderItems(); });
    $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => closeDialog(button.closest("dialog")))); $$("dialog").forEach(dialog => { dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }); dialog.addEventListener("close", () => { if (dialog.id === "chat-dialog") { stopChatPolling(); state.chatRequestId = null; } if (dialog.id === "item-form-dialog") $("#item-gmach").disabled = false; if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }); }); $$('[data-auth-mode]').forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

    $("#auth-form").addEventListener("submit", async event => {
      event.preventDefault(); const button = $("#auth-submit"); setButtonBusy(button, true, state.authMode === "register" ? "יוצרים חשבון…" : "נכנסים…");
      try { if (!state.serverAvailable) throw new Error("ההרשמה תהיה זמינה לאחר הפרסום ב־Cloudflare"); const body = { email: $("#auth-email").value.trim(), password: $("#auth-password").value }; if (state.authMode === "register") { body.fullName = $("#auth-name").value.trim(); body.termsAccepted = $("#auth-consent").checked; } let data = await api(`/api/auth/${state.authMode}`, { method: "POST", body }); if (data.verificationRequired) { state.pendingVerificationEmail = data.email; event.currentTarget.reset(); closeDialog($("#auth-dialog")); $("#verify-email-code").value = ""; openDialog($("#verify-email-dialog")); toast("קוד אימות נשלח למייל"); return; } if (data.requiresTwoFactor) { const code = window.prompt("הקלידו את הקוד מאפליקציית Authenticator"); if (!code) throw new Error("הכניסה בוטלה"); data = await api("/api/auth/2fa/verify-login", { method: "POST", body: { challenge: data.challenge, code } }); } await finishAuthentication(data.user, event.currentTarget); }
      catch (error) { if (error.verificationRequired && error.email) { state.pendingVerificationEmail = error.email; closeDialog($("#auth-dialog")); $("#verify-email-code").value = ""; openDialog($("#verify-email-dialog")); toast("שלחו קוד חדש כדי להשלים את האימות"); } else toast(error.message || "לא הצלחנו להיכנס", "error"); } finally { setButtonBusy(button, false); setAuthMode(state.authMode); }
    });
    $("#verify-email-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "מאמתים…"); try { const data = await api("/api/auth/verify-email", { method: "POST", body: { email: state.pendingVerificationEmail, code: $("#verify-email-code").value } }); closeDialog($("#verify-email-dialog")); await finishAuthentication(data.user); toast("כתובת המייל אומתה בהצלחה"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#resend-verification").addEventListener("click", async event => { const button = event.currentTarget; setButtonBusy(button, true, "שולחים…"); try { await api("/api/auth/resend-verification", { method: "POST", body: { email: state.pendingVerificationEmail } }); toast("קוד חדש נשלח למייל"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#forgot-password-button").addEventListener("click", () => { closeDialog($("#auth-dialog")); $("#reset-email").value=$("#auth-email").value; $("#forgot-password-form").hidden=false; $("#reset-password-form").hidden=true; openDialog($("#reset-password-dialog")); });
    $("#forgot-password-form").addEventListener("submit", async event => { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"שולחים…"); try { await api("/api/auth/forgot-password",{method:"POST",body:{email:$("#reset-email").value}}); $("#forgot-password-form").hidden=true; $("#reset-password-form").hidden=false; toast("אם קיים חשבון, קוד איפוס נשלח למייל"); } catch(error) { toast(error.message,"error"); } finally { setButtonBusy(button,false); } });
    $("#reset-password-form").addEventListener("submit", async event => { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"שומרים…"); try { await api("/api/auth/reset-password",{method:"POST",body:{email:$("#reset-email").value,code:$("#reset-code").value,newPassword:$("#reset-new-password").value}}); event.currentTarget.reset(); closeDialog($("#reset-password-dialog")); setAuthMode("login"); openDialog($("#auth-dialog")); toast("הסיסמה שונתה. אפשר להיכנס עכשיו"); } catch(error) { toast(error.message,"error"); } finally { setButtonBusy(button,false); } });
    $("#request-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "שולחים בקשה…"); try { await submitLoanRequest({ itemId: $("#request-item-id").value, requestedFrom: $("#request-start").value, requestedUntil: $("#request-end").value, phone: $("#request-phone").value, note: $("#request-note").value }); event.currentTarget.reset(); closeDialog($("#request-dialog")); toast("הבקשה נשלחה למנהל הגמ״ח. נעדכן אתכם כשיש תשובה."); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את הבקשה", "error"); } finally { setButtonBusy(button, false); } });
    $("#gmach-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; const editing = state.editingOrganizationId; setButtonBusy(button, true, editing ? "שומרים…" : "שולחים לבדיקה…"); try { const body = { name: $("#gmach-name").value, primaryCategory: $("#gmach-category").value, city: $("#gmach-city").value, neighborhood: $("#gmach-neighborhood").value, description: $("#gmach-description").value, phone: $("#gmach-phone").value, address:$("#gmach-address").value,serviceArea:$("#gmach-service-area").value,hours:{"שעות":$("#gmach-hours").value},pickupOptions:$$('[name="gmach-pickup"]:checked').map(input=>input.value) }; await api(editing ? `/api/organizations/${encodeURIComponent(editing)}` : "/api/organizations", { method: editing ? "PATCH" : "POST", body }); event.currentTarget.reset(); state.editingOrganizationId = null; closeDialog($("#gmach-dialog")); toast(editing ? "פרטי הגמ״ח נשמרו" : "עמוד הגמ״ח נשלח לבדיקה. נעדכן אתכם כשיאושר."); await refreshAccountSnapshot(); if (editing) showDashboard("gmachim"); } catch (error) { toast(error.message || "לא הצלחנו לשמור את הגמ״ח", "error"); } finally { setButtonBusy(button, false); } });
    $("#item-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; const editing = state.editingItemId; setButtonBusy(button, true, editing ? "שומרים…" : "מפרסמים…"); try { const body = { organizationId: $("#item-gmach").value, title: $("#item-name").value, category: $("#item-category").value, condition: $("#item-condition").value, quantity: Number($("#item-quantity").value), description: $("#item-description").value, loanConditions: $("#item-conditions").value,itemType:$("#item-type").value,pickupMethod:$("#item-pickup").value,subcategory:$("#item-subcategory").value,tags:$("#item-tags").value.split(",") }; const data = await api(editing ? `/api/items/${encodeURIComponent(editing)}` : "/api/items", { method: editing ? "PATCH" : "POST", body }); const itemId = editing || data.item.id; await uploadItemImages(itemId, [...$("#item-images").files]); event.currentTarget.reset(); state.editingItemId = null; $("#item-gmach").disabled = false; closeDialog($("#item-form-dialog")); toast(editing ? "השינויים נשמרו ונשלחו לבדיקה לפי הצורך" : "הפריט נשמר ונשלח לבדיקה לפני פרסום"); await refreshAccountSnapshot(); if (editing) showDashboard("items"); } catch (error) { toast(error.message || "לא הצלחנו לשמור את הפריט", "error"); } finally { setButtonBusy(button, false); } });
    $("#help-request-form").addEventListener("submit", submitHelpRequest);
    $("#review-form").addEventListener("submit", submitReview);

    $("#decision-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "מעדכנים…"); try { await api(`/api/loan-requests/${encodeURIComponent($("#decision-request-id").value)}/status`, { method: "PATCH", body: { status: $("#decision-status").value, managerNote: $("#decision-note").value } }); closeDialog($("#decision-dialog")); toast("הבקשה עודכנה והשואל/ת קיבל/ה התראה"); await refreshNotifications(true); showDashboard("requests"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#chat-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; const message = $("#chat-message").value.trim(); if (!message || !state.chatRequestId) return; setButtonBusy(button, true, "שולחים…"); try { await api(`/api/loan-requests/${encodeURIComponent(state.chatRequestId)}/messages`, { method: "POST", body: { message } }); $("#chat-message").value = ""; await loadChatMessages(); await refreshNotifications(true); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את ההודעה", "error"); } finally { setButtonBusy(button, false); } });
    $("#report-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "שולחים…"); try { await api("/api/reports", { method: "POST", body: { itemId: $("#report-item-id").value, reason: $("#report-reason").value, details: $("#report-details").value } }); event.currentTarget.reset(); closeDialog($("#report-dialog")); toast("הדיווח התקבל וייבדק על ידי מנהל האתר"); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את הדיווח", "error"); } finally { setButtonBusy(button, false); } });
    $("#notifications-button").addEventListener("click", openNotifications);
    $("#mark-notifications-read").addEventListener("click", async () => { try { await api("/api/notifications/read-all", { method: "POST", body: {} }); await refreshNotifications(); renderNotifications(); } catch (error) { toast(error.message, "error"); } });

    ["#add-gmach-button", "#callout-add-gmach", "#dashboard-add-gmach"].forEach(selector => $(selector).addEventListener("click", () => openGmachForm())); $$('[data-footer-add-gmach]').forEach(button => button.addEventListener("click", () => openGmachForm())); $("#add-item-button").addEventListener("click", () => openItemForm()); $$('[data-footer-add-item]').forEach(button => button.addEventListener("click", () => openItemForm())); $("#callout-learn-more").addEventListener("click", () => openInfo("terms")); $$('[data-open-info]').forEach(button => button.addEventListener("click", () => openInfo(button.dataset.openInfo)));
    $("#dashboard-button").addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard())); $$('[data-requires-auth]').filter(button => button !== $("#dashboard-button")).forEach(button => button.addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard()))); $$('[data-dashboard-tab]').forEach(button => button.addEventListener("click", () => showDashboard(button.dataset.dashboardTab))); $$('[data-go-home]').forEach(button => button.addEventListener("click", showHome));
    $("#sign-out-button").addEventListener("click", async () => { try { if (state.serverAvailable) await api("/api/auth/logout", { method: "POST" }); } catch { /* Cookie expires server-side. */ } stopChatPolling(); state.user = null; state.favorites.clear(); state.dashboard = null; updateAuthUI(); showHome(); renderItems(); toast("יצאתם מהחשבון"); });
    $("#delete-account-button").addEventListener("click", async () => { if (!state.user || !window.confirm("מחיקת החשבון תסיר גם פרסומים, בקשות ושיחות המקושרים אליו. להמשיך?")) return; const password = window.prompt("לאישור המחיקה, הקלידו את הסיסמה שלכם"); if (!password) return; try { await api("/api/me/account", { method: "DELETE", body: { password } }); state.user = null; state.dashboard = null; state.favorites.clear(); updateAuthUI(); showHome(); renderItems(); toast("החשבון והמידע המקושר נמחקו"); } catch (error) { toast(error.message, "error"); } });
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
    setupEvents(); setAuthMode("login"); updateAuthUI(); await detectServer(); await Promise.all([loadSiteSettings(), loadPageCustomizations(), loadPublicConfig(),loadDiscovery()]); document.documentElement.classList.remove("app-booting"); await refreshUser(); await loadItems(); registerWebMCP();
    window.setInterval(() => { if (state.user && document.visibilityState === "visible") refreshNotifications(true); }, 30000);
    if (location.hash === "#/dashboard") state.user ? showDashboard() : requireAuth(() => showDashboard()); else if (location.hash === "#/catalog") window.setTimeout(() => $("#catalog").scrollIntoView(), 0);
  }
  init().catch(error => { document.documentElement.classList.remove("app-booting"); console.error("App initialization failed", error); toast("אירעה תקלה בטעינת האתר. נסו לרענן את הדף.", "error"); });
})();

// Requested motion v1
(()=>{
 const init=()=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const search=document.querySelector('.search-panel');
  if(search){search.classList.add('fx-search');requestAnimationFrame(()=>requestAnimationFrame(()=>search.classList.add('fx-in')));}
  const rail=document.querySelector('.category-rail');
  if(rail){
    rail.classList.add('fx-carousel');
    let offset=0,last=0,paused=false,dir=-1;
    const cards=[...rail.children];
    const frame=t=>{
      if(!last)last=t;
      const dt=Math.min(32,t-last);last=t;
      if(!paused){
        const overflow=Math.max(0,rail.scrollWidth-rail.parentElement.clientWidth);
        if(overflow>2){
          offset+=dir*dt*.012;
          if(offset<=-overflow){offset=-overflow;dir=1}
          else if(offset>=0){offset=0;dir=-1}
          rail.style.transform='translate3d('+offset.toFixed(2)+'px,0,0)';
        }
      }
      requestAnimationFrame(frame);
    };
    rail.style.willChange='transform';
    rail.addEventListener('pointerenter',()=>paused=true);
    rail.addEventListener('pointerleave',()=>paused=false);
    rail.addEventListener('touchstart',()=>paused=true,{passive:true});
    rail.addEventListener('touchend',()=>{paused=false},{passive:true});
    requestAnimationFrame(frame);
  }
  const titles=[...document.querySelectorAll('.section-heading')];
  const steps=[...document.querySelectorAll('.steps-grid > *, .how-grid > *, .process-grid > *, [class*="steps"] > article')];
  const faqs=[...document.querySelectorAll('.faq-item, .faq-list > *, [class*="faq"] details')];
  titles.forEach(x=>x.classList.add('fx-title'));
  steps.forEach(x=>x.classList.add('fx-step'));
  faqs.forEach(x=>x.classList.add('fx-faq'));
  const io=new IntersectionObserver(entries=>entries.forEach(en=>{
    if(!en.isIntersecting)return;
    const group=en.target.classList.contains('fx-step')?steps:en.target.classList.contains('fx-faq')?faqs:titles;
    const i=group.indexOf(en.target);
    setTimeout(()=>en.target.classList.add('fx-visible'),Math.min(i%6,5)*(en.target.classList.contains('fx-step')?150:en.target.classList.contains('fx-faq')?110:60));
    io.unobserve(en.target);
  }),{threshold:.16,rootMargin:'0px 0px -4% 0px'});
  [...titles,...steps,...faqs].forEach(x=>io.observe(x));
  const trust=[...document.querySelectorAll('.trust-grid article')];
  trust.forEach(x=>x.classList.add('fx-trust'));
  let trustRaf=0;
  const drawTrust=()=>{const vh=innerHeight||800;trust.forEach((el,i)=>{const r=el.getBoundingClientRect();const p=Math.max(0,Math.min(1,(vh*.88-r.top)/(vh*.38)));const q=Math.max(0,Math.min(1,(p-i*.10)/(1-i*.10)));el.style.opacity=String(.62+q*.38);el.style.transform='translate3d(0,'+((1-q)*30).toFixed(1)+'px,0) scale('+(0.90+q*.13).toFixed(3)+')';el.style.borderColor='rgba(244,189,77,'+(.18+q*.82).toFixed(2)+')';el.style.borderWidth=(2+q*2).toFixed(1)+'px';el.style.boxShadow='0 '+(10+q*14).toFixed(0)+'px '+(22+q*26).toFixed(0)+'px rgba(18,60,70,'+(.10+q*.18).toFixed(2)+'),0 0 0 '+(q*4).toFixed(1)+'px rgba(244,189,77,'+(q*.30).toFixed(2)+')';});trustRaf=0};
  const trustTick=()=>{if(!trustRaf)trustRaf=requestAnimationFrame(drawTrust)};
  addEventListener('scroll',trustTick,{passive:true});addEventListener('resize',trustTick,{passive:true});drawTrust();
  const cta=document.getElementById('callout-add-gmach');
  if(cta){cta.classList.add('fx-cta');const ctaIo=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('fx-cta-visible');ctaIo.unobserve(e.target)}}),{threshold:.65});ctaIo.observe(cta);}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
