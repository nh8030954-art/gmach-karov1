(() => {
  "use strict";
  const localizedDialogText = message => window.GmachTranslate?.(message) || message;
  const translatedConfirm = message => window.confirm(localizedDialogText(message));
  const translatedPrompt = (message,defaultValue) => window.prompt(localizedDialogText(message),defaultValue);
  const translatedAlert = message => window.alert(localizedDialogText(message));


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
    visibleCount: 8, activeCategory: "", compareIds: new Set(), pendingAction: null, dashboardTab: "requests", myOrganizations: [], dashboard: null, authMode: "login",
    editingOrganizationId: null, editingItemId: null, chatRequestId: null, chatTimer: null, notifications: [],
    customizations: new Map(), visualEditMode: false, selectedEditable: null, pendingVerificationEmail: "", supportEmail: "",
    discovery: { categories: [], cities: [], suggestions: [], organizations: [] }, categoryAliases: [], categoryCatalog: [], pendingCommunityItem: null, viewMode: "list"
  };

  function itemSubcategoriesFor(category){
    const rows=Array.isArray(state.categoryCatalog)?state.categoryCatalog:[],parent=rows.find(row=>!row.parent_id&&(row.name_he===category||row.id===category));
    return parent?rows.filter(row=>row.parent_id===parent.id).map(row=>row.name_he).filter(Boolean):[];
  }
  function categoryRailPresentation(row){
    const name=String(row?.name_he||"").trim();
    const known={
      "אירועים":{icon:"decor",className:"category-events",subtitle:"עיצוב, שולחנות וציוד",subtitleEn:"Decor, tables & event gear"},
      "כלי עבודה":{icon:"tools",className:"category-tools",subtitle:"לבית ולתיקונים",subtitleEn:"Home & repair tools"},
      "תינוקות":{icon:"baby",className:"category-baby",subtitle:"עגלות, מיטות וכיסאות",subtitleEn:"Strollers, cribs & seats"},
      "רפואה":{icon:"medical",className:"category-medical",subtitle:"שיקום וסיוע",subtitleEn:"Rehabilitation & assistance"},
      "רפואה ושיקום":{icon:"medical",className:"category-medical",subtitle:"שיקום וסיוע",subtitleEn:"Rehabilitation & assistance"},
      "טיולים":{icon:"tent",className:"category-outdoors",subtitle:"קמפינג ונסיעות",subtitleEn:"Camping & travel"},
      "בית ואירוח":{icon:"home",className:"category-home",subtitle:"אירוח וציוד לבית",subtitleEn:"Hosting & home equipment"}
    };
    const fallbackIcon=ICONS[row?.icon]?row.icon:"box";
    return known[name]||{icon:fallbackIcon,className:"category-all",subtitle:String(row?.name_en||"").trim()||"ציוד להשאלה"};
  }
  function categoryDisplayName(value){
    const row=(state.categoryCatalog||[]).find(x=>x.name_he===value||x.id===value);
    return document.documentElement.lang==="en"?(row?.name_en||value):value;
  }
  function subcategoryDisplayName(value){
    const row=(state.categoryCatalog||[]).find(x=>x.name_he===value||x.id===value);
    return document.documentElement.lang==="en"?(row?.name_en||value):value;
  }
  function populateItemCategorySelector(){
    const parents=(state.categoryCatalog||[]).filter(row=>!row.parent_id&&row.name_he);
    const populate=(selector,emptyLabel)=>{
      const select=$(selector);if(!select)return;
      const current=select.value;
      const visibleEmpty=document.documentElement.lang==="en"?(window.GmachTranslate?.(emptyLabel)||emptyLabel):emptyLabel;
      select.innerHTML='<option value="">'+escapeHTML(visibleEmpty)+'</option>'+parents.map(row=>'<option value="'+escapeHTML(row.name_he)+'">'+escapeHTML(document.documentElement.lang==="en"?(row.name_en||row.name_he):row.name_he)+'</option>').join("");
      if(current&&parents.some(row=>row.name_he===current))select.value=current;
    };
    populate("#item-category","בחירה");
    populate("#gmach-category","בחירה");
    populate("#category-filter","כל הקטגוריות");
    populate("#hero-category-filter","כל הקטגוריות");
    populate("#help-category","לא בטוח/ה");
    const rail=$("#category-rail");
    if(rail){
      const active=state.activeCategory;
      rail.querySelectorAll('[data-carousel-clone]').forEach(node=>node.remove());
      rail.classList.remove("carousel-continuous");
      rail.classList.add("carousel-ready");
      const isEnglish=document.documentElement.lang==="en";
      rail.innerHTML='<button class="category-card '+(!active?'is-active':'')+'" type="button" data-category="" role="listitem"><span class="category-icon category-all" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></svg></span><strong>'+(isEnglish?'All':'הכול')+'</strong><small>'+(isEnglish?'Everything available':'כל מה שזמין')+'</small></button>'+parents.map(row=>{const meta=categoryRailPresentation(row),label=isEnglish?(row.name_en||row.name_he):row.name_he,subtitle=isEnglish?(meta.subtitleEn||row.name_en||'Items for loan'):meta.subtitle;return '<button class="category-card '+(active===row.name_he?'is-active ':'')+'" type="button" data-category="'+escapeHTML(row.name_he)+'" role="listitem"><span class="category-icon '+escapeHTML(meta.className)+'" aria-hidden="true"><svg viewBox="0 0 24 24">'+(ICONS[meta.icon]||ICONS.box)+'</svg></span><strong>'+escapeHTML(label)+'</strong><small>'+escapeHTML(subtitle)+'</small></button>'}).join("");
      bindCategoryRailButtons();
      window.setTimeout(()=>window.GmachResetCategoryCarousel?.(),0);
    }
    updateItemSubcategories();
    updateCatalogSubcategories();
  }
  function updateItemSubcategories(selected=""){
    const select=$("#item-subcategory");if(!select)return;
    const category=$("#item-category")?.value||"",options=itemSubcategoriesFor(category);
    select.disabled=!category||!options.length;
    select.innerHTML='<option value="">'+(category?(options.length?"ללא קטגוריית משנה":"אין קטגוריות משנה זמינות"):"בחרו קודם קטגוריה")+'</option>'+options.map(value=>'<option value="'+escapeHTML(value)+'">'+escapeHTML(categoryDisplayName(value))+'</option>').join("");
    if(selected&&options.includes(selected))select.value=selected;
  }
  function updateCatalogSubcategories(selected=""){
    const select=$("#subcategory-filter");if(!select)return;
    const category=$("#category-filter")?.value||"",options=category?itemSubcategoriesFor(category):[];
    select.disabled=!category||!options.length;
    select.innerHTML='<option value="">'+(category?(options.length?"כל קטגוריות המשנה":"אין קטגוריות משנה זמינות"):"בחרו קודם קטגוריה")+'</option>'+options.map(value=>'<option value="'+escapeHTML(value)+'">'+escapeHTML(categoryDisplayName(value))+'</option>').join("");
    if(selected&&options.includes(selected))select.value=selected;
  }
  function bindCategoryRailButtons(){
    $$("[data-category]").forEach(button=>button.onclick=()=>{
      state.activeCategory=button.dataset.category||"";
      $("#category-filter").value=state.activeCategory;
      $("#hero-category-filter").value=state.activeCategory;
      updateCatalogSubcategories();
      $$("[data-category]").forEach(other=>other.classList.toggle("is-active",other===button));
      applyFilters();
      $("#catalog")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
    function setGmachHoursMode(byAppointment){
    const toggle=$("#gmach-hours-by-appointment"),grid=$("#gmach-hours-grid");if(!toggle||!grid)return;
    toggle.checked=Boolean(byAppointment);grid.hidden=Boolean(byAppointment);
    $$("[data-hours-day]",grid).forEach(day=>{day.disabled=Boolean(byAppointment)});
    $$("[data-hours-start],[data-hours-end]",grid).forEach(input=>{input.disabled=Boolean(byAppointment);input.setCustomValidity("")});
  }

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
  function displayCondition(value) { const text=String(value||"").trim(); return text==="טוב"?"מצב טוב":text==="מצוין"?"כמו חדש":text||"לא צוין"; }
  function formatDateTime(value) { try { return new Intl.DateTimeFormat(document.documentElement.lang==="en"?"en-GB":"he-IL", { dateStyle: "short", timeStyle: "short",timeZone:"Asia/Jerusalem" }).format(new Date(value)); } catch { return String(value || ""); } }
  function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "#e6f2ef"; }
  function safeImageUrl(value) {
    try { const url = new URL(value, window.location.origin); return url.origin === window.location.origin && url.pathname.startsWith("/media/") ? url.href : ""; }
    catch { return ""; }
  }
  function iconSvg(icon = "box") { return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon] || ICONS.box}</svg>`; }
  function ensureToastTopLayer(element){
    if(!element||typeof element.showPopover!=="function")return;
    try{
      if(!element.hasAttribute("popover"))element.setAttribute("popover","manual");
      if(!element.style.top)element.style.top="auto";
      if(!element.style.right)element.style.right="auto";
      if(!element.style.margin)element.style.margin="0";
      if(!element.style.border)element.style.border="0";
      if(!element.matches(":popover-open"))element.showPopover();
    }catch{}
  }
  function hideToastTopLayer(element){try{if(element?.matches?.(":popover-open"))element.hidePopover()}catch{}}
  window.GmachEnsureTopLayerToast=ensureToastTopLayer;
  window.GmachHideTopLayerToast=hideToastTopLayer;
  function extractIncidentNumber(message){
    return String(message||"").match(/(?:מספר תקלה|Error reference)\s*:\s*([A-Za-z0-9-]{8,40})/i)?.[1]||"";
  }
  function createClientIncident(error,context="שגיאת דפדפן"){
    const existing=String(error?.requestId||extractIncidentNumber(error?.message)||"").trim();if(existing)return existing;
    const random=crypto.getRandomValues(new Uint32Array(1))[0]%100000,incident=String(Date.now())+String(random).padStart(5,"0");
    window.GmachLastIncidentNumber=incident;
    try{fetch("/api/client-errors",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({incidentNumber:incident,path:location.pathname+location.search,message:String(error?.message||context).slice(0,1000),stack:String(error?.stack||"").slice(0,3000)})}).catch(()=>{})}catch{}
    return incident;
  }
  function technicalErrorMessage(message){
    return /(?:is not a function|cannot read|undefined|null|referenceerror|typeerror|syntaxerror|unexpected token|failed to fetch|load failed|networkerror|אירעה שגיאה לא צפויה|תקלה זמנית|לא הצלחנו לטעון|הפעולה לא הושלמה)/i.test(String(message||""));
  }
  function toast(message, type = "success") {
    message=window.GmachTranslate?.(message)||message;
    if(type==="error"&&!extractIncidentNumber(message)&&technicalErrorMessage(message)){
      const incident=createClientIncident(new Error(String(message)),"תקלה בממשק");
      message+= (uiIsEnglish()?" Error reference: ":" מספר תקלה: ")+incident;
    }
    const incident=extractIncidentNumber(message);if(incident)window.GmachLastIncidentNumber=incident;
    const region = $("#toast-region");
    ensureToastTopLayer(region);document.body.classList.add("toast-visible");
    if ([...region.children].some(el => el.textContent === message && el.classList.contains("error") === (type === "error"))) return;
    const el = document.createElement("div"); el.className = `toast ${type === "error" ? "error" : ""}`; el.textContent = message; region.append(el);
    while (region.children.length > 2) region.firstElementChild.remove();
    window.setTimeout(() => { el.remove(); if(!region.children.length){hideToastTopLayer(region);document.body.classList.remove("toast-visible")} }, 5200);
  }
  window.GmachToast=toast;
  function setButtonBusy(button, busy, busyText = "שולח…") {
    if (!button) return;
    if (busy) { button.dataset.originalText = button.textContent; button.textContent = busyText; button.disabled = true; }
    else { button.textContent = button.dataset.originalText || button.textContent; button.disabled = false; }
  }
  function openDialog(dialog) { if (!dialog) return; if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal(); document.body.classList.add("dialog-open"); }
  function closeDialog(dialog) { if (!dialog) return; if (dialog.open) dialog.close(); if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }

  function uiIsEnglish(){return String(document.documentElement.lang||"").toLowerCase().startsWith("en")}
  function visibleFieldLabel(el){
    const clean=value=>String(value||"").replace(/\s*\((?:רשות|optional)\)\s*/gi," ").replace(/\s+/g," ").trim();
    let label=el.closest?.("label")||null;
    if(!label&&el.id){try{label=document.querySelector('label[for="'+CSS.escape(el.id)+'"]')}catch{}}
    const preferred=label?.querySelector?.("span")?.textContent||el.getAttribute?.("aria-label")||el.getAttribute?.("placeholder")||label?.textContent||el.name||el.id||"";
    const name=clean(preferred);
    return name|| (uiIsEnglish()?"this field":"השדה הזה");
  }
  function formValidationMessage(el){
    const name=visibleFieldLabel(el),v=el.validity||{},en=uiIsEnglish(),quoted="„"+name+"”";
    if(v.valueMissing){
      if(el.type==="checkbox"||el.type==="radio")return en?"Please confirm "+quoted+".":"יש לאשר "+quoted+".";
      if(el.tagName==="SELECT")return en?"Please select "+quoted+".":"יש לבחור "+quoted+".";
      if(el.type==="file")return en?"Please choose a file for "+quoted+".":"יש לבחור קובץ עבור "+quoted+".";
      return en?quoted+" is required.":"השדה "+quoted+" הוא שדה חובה.";
    }
    if(v.typeMismatch){
      if(el.type==="email")return en?"Enter a valid email address in "+quoted+".":"יש להזין כתובת אימייל תקינה בשדה "+quoted+".";
      if(el.type==="url")return en?"Enter a valid web address in "+quoted+".":"יש להזין כתובת אתר תקינה בשדה "+quoted+".";
      return en?"Enter a valid value in "+quoted+".":"יש להזין ערך תקין בשדה "+quoted+".";
    }
    if(v.tooShort)return en?quoted+" must contain at least "+el.minLength+" characters.":"בשדה "+quoted+" יש להזין לפחות "+el.minLength+" תווים.";
    if(v.tooLong)return en?quoted+" can contain at most "+el.maxLength+" characters.":"בשדה "+quoted+" ניתן להזין עד "+el.maxLength+" תווים.";
    if(v.rangeUnderflow)return en?quoted+" must be at least "+el.min+".":"הערך בשדה "+quoted+" חייב להיות לפחות "+el.min+".";
    if(v.rangeOverflow)return en?quoted+" must be at most "+el.max+".":"הערך בשדה "+quoted+" יכול להיות לכל היותר "+el.max+".";
    if(v.stepMismatch)return en?"Enter a permitted value in "+quoted+".":"יש להזין ערך מותר בשדה "+quoted+".";
    if(v.badInput)return en?"Enter a valid value in "+quoted+".":"יש להזין ערך תקין בשדה "+quoted+".";
    if(v.patternMismatch){
      const hint=String(el.getAttribute?.("title")||"").trim();
      return hint?(en?quoted+" has an invalid format. "+hint:"הערך בשדה "+quoted+" אינו בפורמט הנדרש. "+hint):(en?quoted+" has an invalid format.":"הערך בשדה "+quoted+" אינו בפורמט הנדרש.");
    }
    return en?"Check "+quoted+" and try again.":"יש לבדוק את "+quoted+" ולנסות שוב.";
  }
  function describeHttpError(response,data){
    const raw=typeof data==="string"?data:String(data?.error||data?.message||"").trim();
    const en=uiIsEnglish(),status=Number(response?.status||0),requestId=String(data?.requestId||response?.headers?.get?.("X-Request-Id")||"").trim();
    if(raw&&!/^\s*</.test(raw)){
      let message=window.GmachTranslate?.(raw)||raw;
      if(status>=500&&requestId&&!extractIncidentNumber(message))message+=" "+(en?"Error reference: ":"מספר תקלה: ")+requestId;
      if(status>=500&&requestId)window.GmachLastIncidentNumber=requestId;
      return message;
    }
    let message;
    if(status===400)message=en?"The request is invalid. Check the entered details.":"הבקשה אינה תקינה. יש לבדוק את הפרטים שהוזנו.";
    else if(status===401)message=en?"Your session is missing or has expired. Sign in and try again.":"החיבור לחשבון חסר או פג. יש להתחבר ולנסות שוב.";
    else if(status===403)message=en?"You do not have permission to perform this action.":"אין הרשאה לבצע את הפעולה.";
    else if(status===404)message=en?"The requested item or page was not found.":"הפריט או העמוד המבוקש לא נמצא.";
    else if(status===409)message=en?"The action conflicts with a newer change. Refresh and try again.":"הפעולה מתנגשת עם שינוי חדש יותר. יש לרענן ולנסות שוב.";
    else if(status===413)message=en?"The submitted file or request is too large.":"הקובץ או הבקשה שנשלחו גדולים מדי.";
    else if(status===429)message=en?"Too many attempts. Please try again later.":"בוצעו יותר מדי ניסיונות. יש לנסות שוב מאוחר יותר.";
    else if(status>=500)message=en?"A temporary server error occurred.":"אירעה תקלה זמנית בשרת.";
    else message=en?"The action could not be completed.":"הפעולה לא הושלמה.";
    if(requestId)message+=" "+(en?"Error reference: ":"מספר תקלה: ")+requestId;
    return message;
  }
  function describeNetworkError(error){
    const incident=createClientIncident(error,"תקלה בחיבור לשרת"),en=uiIsEnglish();
    let message;
    if(error?.name==="AbortError")message=en?"The server is taking too long to respond. Try again shortly.":"השרת מתעכב. אפשר לנסות שוב בעוד רגע.";
    else if(error instanceof TypeError)message=en?"Could not connect to the server. Check the internet connection and try again.":"לא ניתן להתחבר לשרת. יש לבדוק את החיבור לאינטרנט ולנסות שוב.";
    else message=String(error?.message||error|| (en?"An unexpected error occurred.":"אירעה שגיאה לא צפויה."));
    return message+" "+(en?"Error reference: ":"מספר תקלה: ")+incident;
  }
  window.GmachDescribeHttpError=describeHttpError;
  window.GmachDescribeNetworkError=describeNetworkError;

  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
    const init = { credentials: "same-origin", ...options, signal: options.signal || controller.signal }; delete init.timeoutMs; init.headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== "string") { init.headers.set("Content-Type", "application/json"); init.body = JSON.stringify(options.body); }
    try {
      const response = await fetch(path, init); const type = response.headers.get("content-type") || ""; const data = type.includes("application/json") ? await response.json() : null;
      if (!response.ok) { const error = new Error(describeHttpError(response,data)); if (data && typeof data === "object") Object.assign(error, data); error.status=response.status; error.requestId=error.requestId||response.headers.get("X-Request-Id")||""; throw error; }
      if (data && typeof data === "object" && response.headers.get("X-Data-Stale") === "1") data._stale = true;
      return data;
    } catch (error) {
      if (error?.name === "AbortError" || error instanceof TypeError) { const wrapped=new Error(describeNetworkError(error)); wrapped.requestId=extractIncidentNumber(wrapped.message); wrapped.systemFault=true; throw wrapped; }
      if(Number(error?.status||0)>=500){error.systemFault=true;if(error.requestId)window.GmachLastIncidentNumber=error.requestId}
      throw error;
    } finally { window.clearTimeout(timeout); }
  }

  function openSupportForError(error,context="תקלה באתר"){
    const dialog=$("#support-dialog"),form=$("#support-form");if(!dialog||!form)return;
    const requestId=String(error?.requestId||extractIncidentNumber(error?.message)||window.GmachLastIncidentNumber||"").trim();
    if(state.user?.fullName||state.user?.full_name)form.elements.name.value=state.user.fullName||state.user.full_name;
    if(state.user?.email)form.elements.email.value=state.user.email;
    form.elements.subject.value=context.slice(0,120);
    form.elements.message.value=[context,error?.message||"",requestId?"מספר תקלה: "+requestId:"","עמוד: "+location.pathname+location.hash].filter(Boolean).join("\n").slice(0,2000);
    openDialog(dialog);form.elements.message.focus();
  }
  async function detectServer() {
    try { const result = await api("/api/health", { timeoutMs: 4000 }); state.serverAvailable = result?.ok === true; } catch { state.serverAvailable = false; }
    $("#connection-banner").hidden = state.serverAvailable;
  }
  async function loadPublicConfig() {
    try { const data = await api("/api/public-config"); state.supportEmail = data.supportEmail || ""; } catch { /* Optional public configuration. */ }
  }
  async function loadDiscovery(query = "") {
    try { const data = await api(`/api/discovery${query ? `?q=${encodeURIComponent(query)}` : ""}`); state.discovery = data; renderDiscovery(); state.serverAvailable = true; $("#connection-banner").hidden = true; }
    catch (error) { console.warn("Discovery unavailable", error); }
  }
  async function loadCategoryAliases(){
    try{
      const data=await api("/api/categories");
      state.categoryCatalog=Array.isArray(data.categories)?data.categories:[];
      state.categoryAliases=state.categoryCatalog.map(row=>({nameHe:row.name_he||"",nameEn:row.name_en||"",synonyms:Array.isArray(row.synonyms)?row.synonyms:[]}));
      populateItemCategorySelector();
      renderDiscovery();
    }catch(error){console.warn("Category aliases unavailable",error)}
  }
  window.addEventListener("gmach:categories-changed",()=>Promise.allSettled([loadCategoryAliases(),loadDiscovery(),loadItems()]));
  function installAdvancedGmachSearch(){
    const section=$("#gmachim"),heading=section?.querySelector(".section-heading");
    if(!heading||$("#advanced-gmach-search"))return;
    const button=document.createElement("button");
    button.id="advanced-gmach-search";button.type="button";button.className="button button-secondary";button.textContent="חיפוש גמ״חים מתקדם";
    button.addEventListener("click",openAdvancedGmachSearch);heading.append(button);
  }
  async function openAdvancedGmachSearch(){
    let d=$("#advanced-gmach-dialog");if(!d){d=document.createElement("dialog");d.id="advanced-gmach-dialog";d.className="modal modal-wide";document.body.append(d)}
    const categories=(state.categoryCatalog||[]).filter(row=>!row.parent_id&&row.name_he);
    const cities=[...new Set((state.discovery.cities||[]).map(row=>row.city).filter(Boolean))];
    d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>חיפוש גמ״חים מתקדם</h2>
      <form id="advanced-gmach-form" class="form-grid">
        <label class="wide">שם, תיאור או עיר<input name="query" type="search" maxlength="100" autocomplete="off"></label>
        <label>עיר<input name="city" type="text" list="advanced-gmach-cities" maxlength="80" placeholder="כל הארץ" autocomplete="off"><datalist id="advanced-gmach-cities">${cities.map(value=>`<option value="${escapeHTML(value)}"></option>`).join("")}</datalist></label>
        <label>קטגוריה<select name="category"><option value="">כל הקטגוריות</option>${categories.map(row=>`<option value="${escapeHTML(row.name_he)}">${escapeHTML(document.documentElement.lang==="en"?(row.name_en||row.name_he):row.name_he)}</option>`).join("")}</select></label>
        <label>דירוג מינימלי<select name="rating"><option value="0">ללא סינון</option><option value="3">3+</option><option value="4">4+</option><option value="4.5">4.5+</option></select></label>
        <label class="check"><input name="available" type="checkbox">רק גמ״חים עם פריט זמין</label>
        <button class="button button-primary" type="submit">חיפוש</button>
      </form>
      <div id="advanced-gmach-results" class="organizations-grid" aria-live="polite"></div>`;
    $(".dialog-close",d).onclick=()=>closeDialog(d);
    const form=$("#advanced-gmach-form",d),results=$("#advanced-gmach-results",d);
    form.onsubmit=async e=>{
      e.preventDefault();results.innerHTML='<div class="dashboard-empty">מחפשים גמ״חים…</div>';
      const fd=new FormData(form),params=new URLSearchParams();
      const query=String(fd.get("query")||"").trim(),city=String(fd.get("city")||""),category=String(fd.get("category")||""),rating=String(fd.get("rating")||"0");
      if(query)params.set("orgQuery",query);if(city)params.set("orgCity",city);if(category)params.set("orgCategory",category);if(Number(rating)>0)params.set("minRating",rating);if(fd.has("available"))params.set("orgAvailable","1");
      try{
        const data=await api("/api/discovery?"+params.toString()),rows=data.organizations||[];
        results.innerHTML=rows.map(org=>`<article class="organization-card">${org.rating ? `<div class="organization-card-rating">${ratingStars(org.rating,{size:"gmach-card-top",count:Number(org.review_count||0)})}</div>` : '<div class="organization-card-rating organization-card-rating-empty">חדש — ללא דירוגים</div>'}<div><h3 class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</h3><p>${escapeHTML(org.description||"")}</p></div><ul><li>📍 ${escapeHTML(org.city||"")}</li><li>📦 ${Number(org.item_count||0)} ${Number(org.item_count||0) === 1 ? "פריט" : "פריטים"}</li><li>✅ ${Number(org.available_items||0)} זמינים</li></ul><button class="button button-primary button-small" type="button" data-advanced-org="${escapeHTML(org.id)}">צפייה בגמ״ח</button></article>`).join("")||'<div class="dashboard-empty"><strong>לא נמצאו גמ״חים מתאימים</strong><p>נסו להסיר מסנן או להרחיב את החיפוש.</p></div>';
        $$("[data-advanced-org]",results).forEach(button=>button.onclick=()=>{closeDialog(d);openOrganization(button.dataset.advancedOrg)});
      }catch(error){results.innerHTML=`<p role="alert">${escapeHTML(error.message||"לא הצלחנו להשלים את החיפוש")}</p>`}
    };
    openDialog(d);form.querySelector('[name="query"]')?.focus();
  }
  function renderDiscovery() {
    const english=document.documentElement.lang==="en";
    const suggestedCategories=state.categoryAliases.flatMap(row=>[english?row.nameEn:row.nameHe,...(row.synonyms||[]).filter(value=>english?/^[^\u0590-\u05ff]+$/.test(value):/[\u0590-\u05ff]/.test(value))]);
    const suggestionValues=[...new Set([...(state.discovery.suggestions||[]).filter(value=>english?/^[^\u0590-\u05ff]+$/.test(value):/[\u0590-\u05ff]/.test(value)),...suggestedCategories].filter(Boolean))].slice(0,120);
    $("#search-suggestions").innerHTML = suggestionValues.map(value => `<option value="${escapeHTML(value)}"></option>`).join("");
    $$("[data-category]").forEach(button => { const count = Number(state.discovery.categories?.find(row => row.category === button.dataset.category)?.count || 0); const small = $("small", button); if (small && button.dataset.category) small.textContent = `${count} ${english ? (count === 1 ? "item" : "items") : (count === 1 ? "פריט" : "פריטים")}`; });
    $("#organizations-grid").innerHTML = (state.discovery.organizations || []).map(org => `<article class="organization-card">${org.rating ? `<div class="organization-card-rating">${ratingStars(org.rating,{size:"gmach-card-top",count:Number(org.review_count||0)})}</div>` : '<div class="organization-card-rating organization-card-rating-empty">חדש — ללא דירוגים</div>'}<div><h3 class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</h3><p>${escapeHTML(org.description)}</p></div><ul><li>📍 ${escapeHTML(org.city)}</li><li>📦 ${Number(org.item_count || 0)} ${Number(org.item_count || 0) === 1 ? "פריט" : "פריטים"}</li></ul><button class="button button-secondary button-small" type="button" data-open-organization="${escapeHTML(org.id)}">צפייה בגמ״ח</button></article>`).join("") || '<div class="dashboard-empty"><strong>עדיין אין גמ״חים</strong><p>הקהילה נבנית בימים אלה.</p></div>';
    $$('[data-open-organization]').forEach(button => {
      button.addEventListener("click", () => openOrganization(button.dataset.openOrganization));
      const card=button.closest(".organization-card");
      if(!card)return;
      card.tabIndex=0;card.setAttribute("role","link");card.setAttribute("aria-label",button.textContent.trim()+": "+(card.querySelector("h3")?.textContent||""));
      card.addEventListener("click",event=>{if(!event.target.closest("button,a,input,select"))openOrganization(button.dataset.openOrganization)});
      card.addEventListener("keydown",event=>{if(event.target===card&&(event.key==="Enter"||event.key===" ")){event.preventDefault();openOrganization(button.dataset.openOrganization)}});
    });
  }
  function analyticsAcquisition(){
    const params=new URLSearchParams(location.search),utm=params.get("utm_source");
    let referrer=null;try{if(document.referrer){const u=new URL(document.referrer);if(u.origin!==location.origin)referrer=u.hostname;}}catch{}
    const source=utm||sessionStorage.getItem("gmach-acquisition-source")||referrer||"direct";
    if(source!=="direct")sessionStorage.setItem("gmach-acquisition-source",source.slice(0,80));
    return {source:source.slice(0,80),referrer:referrer?.slice(0,180)||null,pagePath:location.pathname.slice(0,180)};
  }
  function analytics(eventType, details = {}) { if (state.serverAvailable) api("/api/analytics/events", { method:"POST", body:{ eventType, ...analyticsAcquisition(), ...details } }).catch(() => {}); }
  function requireAuth(action) {
    if (state.user) { action?.(); return true; }
    state.pendingAction = action || null; setAuthMode("login"); openDialog($("#auth-dialog")); return false;
  }
  function renderSkeletons() { $("#items-grid").innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join(""); }
  const CATALOG_CACHE_KEY = "gmach-catalog-cache-v1";
  function saveCatalogCache(items) {
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), items })); } catch {}
  }
  function readCatalogCache() {
    try {
      const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || "null");
      if (!cached || !Array.isArray(cached.items) || !cached.items.length) return null;
      if (Date.now() - Number(cached.savedAt || 0) > 86400000) return null;
      return cached.items;
    } catch { return null; }
  }
  async function loadItems() {
    renderSkeletons();
    try {
      const params = new URLSearchParams();
      if ($("#date-filter").value) params.set("date", $("#date-filter").value);
      const data = await api(`/api/items${params.size ? `?${params}` : ""}`);
      state.items = data.items || [];
      saveCatalogCache(state.items);
      refreshCatalogEnglish();
      for (const id of state.compareIds) if (!state.items.some(item => String(item.id) === id)) state.compareIds.delete(id);
      applyFilters();
      renderCompareTray();
      state.serverAvailable = !data._stale;
      const banner = $("#connection-banner");
      banner.hidden = !data._stale;
      if (data._stale) banner.querySelector("span").textContent = "השירות החי אינו זמין כרגע. מוצג snapshot אחרון של הקטלוג; זמינות הפריטים עשויה להשתנות.";
    } catch (error) {
      console.error("Unable to load items", error);
      const cachedItems = readCatalogCache();
      if (cachedItems) {
        state.items = cachedItems;
        state.serverAvailable = false;
        applyFilters();
        renderCompareTray();
        const banner = $("#connection-banner");
        banner.hidden = false;
        banner.querySelector("span").textContent = "החיבור לשירות אינו זמין כרגע. מוצג הקטלוג האחרון שנשמר במכשיר; זמינות הפריטים עשויה להשתנות.";
        $("#results-summary").textContent = `מוצג עותק שמור של ${state.filteredItems.length} פריטים`;
        return;
      }
      state.serverAvailable = false;
      $("#items-grid").innerHTML = "";
      $("#empty-state").hidden = false;
      $("#empty-state h3").textContent = "הקטלוג אינו זמין כרגע";
      $("#empty-state p").textContent = "השירות עמוס זמנית. אפשר להמשיך לעיין בשאר האתר ולנסות שוב בעוד רגע.";
      $("#results-summary").textContent = "הקטלוג אינו זמין כרגע";
      $("#connection-banner").hidden = false;
    }
  }
  function editDistance(a,b){a=normalize(a);b=normalize(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;const prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let left=i,diag=i-1;prev[0]=i;for(let j=1;j<=b.length;j++){const up=prev[j],cost=a[i-1]===b[j-1]?0:1,next=Math.min(up+1,left+1,diag+cost);diag=up;prev[j]=next;left=next}}return prev[b.length]}
  function fuzzyQueryMatch(item,query){const q=normalize(query);if(!q)return true;const words=normalize([item.title,item.description,item.category,item.subcategory,...(item.tags||[]),item.city,item.neighborhood,item.organizations?.name].join(" ")).split(/\s+/).filter(Boolean);return q.split(/\s+/).every(term=>words.some(word=>word.includes(term)||term.includes(word)||editDistance(term,word)<=Math.max(1,Math.floor(Math.min(term.length,word.length)/4))))}
  function searchScore(item,query){
    const q=normalize(query),title=normalize(item.title),category=normalize(item.category),description=normalize(item.description),tags=normalize((item.tags||[]).join(" "));
    let score=0;
    if(q){if(title===q)score+=120;else if(title.startsWith(q))score+=90;else if(title.includes(q))score+=65;if(category.includes(q))score+=45;if(tags.includes(q))score+=30;if(description.includes(q))score+=15;}
    if(item.availability_status==="available")score+=35;
    score+=Math.min(25,Number(item.rating||0)*3);
    score+=Math.min(20,Number(item.organizations?.rating||0)*2);
    const condition=normalize(item.condition_detail||item.condition);if(["חדש","כמו חדש","new","like new"].some(x=>condition.includes(normalize(x))))score+=12;else if(["מצוין","טוב","excellent","good"].some(x=>condition.includes(normalize(x))))score+=7;
    return score;
  }
  function applyFilters({ resetVisible = true } = {}) {
    if (resetVisible) state.visibleCount = 8;
    const query = normalize($("#search-input").value), city = $("#city-filter").value, category = $("#category-filter").value, subcategory = $("#subcategory-filter")?.value||"", condition = $("#condition-filter").value, availableOnly = $("#available-only").checked, type = $("#type-filter").value, pickup = "";
    const dynamicAliases=state.categoryAliases.flatMap(row=>{const values=[row.nameHe,row.nameEn,...row.synonyms].filter(Boolean);return values.some(value=>query.includes(normalize(value))||normalize(value).includes(query))?values:[];});
    const translatedAliases=(window.GmachSearchAliases?.()||[]).filter(([he,en])=>{const value=normalize(en);return query.length>=3&&(value.includes(query)||query.includes(value))}).map(([he])=>he);
    const queryTerms = [query,...translatedAliases, ...Object.entries(SEARCH_ALIASES).flatMap(([key, values]) => query.includes(normalize(key)) || normalize(key).includes(query) || values.some(value => query.includes(normalize(value)) || normalize(value).includes(query)) ? [key, ...values] : []),...dynamicAliases].map(normalize).filter(Boolean);
    const baseMatch=item=>(!city || item.city === city) && (!category || item.category === category) && (!subcategory || item.subcategory === subcategory) && (!condition || displayCondition(item.condition) === condition) && (!type || item.item_type === type) && (!pickup || item.pickup_method === pickup) && (!availableOnly || item.availability_status === "available");
    state.filteredItems = state.items.filter(item => { const haystack = normalize([item.title, item.description, item.category, item.subcategory, ...(item.tags || []), item.city, item.neighborhood, item.organizations?.name].join(" ")); return baseMatch(item) && (!query || queryTerms.some(term => haystack.includes(term))); });
    if(query&&state.filteredItems.length===0) state.filteredItems=state.items.filter(item=>baseMatch(item)&&fuzzyQueryMatch(item,query));
    const sort = $("#sort-select").value;
    state.filteredItems.sort((a, b) => sort === "newest" ? new Date(b.created_at) - new Date(a.created_at) : sort === "city" ? String(a.city).localeCompare(String(b.city), "he") : searchScore(b,query)-searchScore(a,query) || Number(b.availability_status === "available") - Number(a.availability_status === "available") || Number(b.rating || 0) - Number(a.rating || 0));
    renderItems();
  }
  function itemDisplayText(item,field){
    const raw=String(item[field]||"");if(document.documentElement.lang!=="en")return raw;
    const value=item[field+"English"]??state.items.find(row=>row.id===item.id)?.[field+"English"];
    if(value&&!/[\u0590-\u05ff]/.test(value))return value;
    const local=window.GmachTranslate?.(raw)||raw;if(!/[\u0590-\u05ff]/.test(local))return local;
    if(field==="title")return categoryDisplayName(item.category||"")+" item";
    return item.englishStatus==="ready"?"English description unavailable.":"Preparing the English description…";
  }
  let englishRefreshToken=0;
  async function refreshCatalogEnglish(){
    const token=++englishRefreshToken;if(document.documentElement.lang!=="en")return;
    for(let attempt=0;attempt<6&&token===englishRefreshToken;attempt++){
      const pending=state.items.filter(item=>item.englishStatus==="pending").slice(0,40);if(!pending.length)return;
      await new Promise(resolve=>setTimeout(resolve,Math.min(15000,1000*2**attempt)));
      if(token!==englishRefreshToken||document.documentElement.lang!=="en")return;
      try{const data=await api("/api/items/english-content?ids="+encodeURIComponent(pending.map(item=>item.id).join(",")));let changed=false;for(const english of data.items||[]){const row=state.items.find(item=>item.id===english.id);if(row&&english.englishStatus==="ready"){Object.assign(row,english);changed=true}}if(changed){saveCatalogCache(state.items);renderItems()}}catch{return}
    }
  }
  window.addEventListener("gmach-language-change",()=>{renderItems();refreshCatalogEnglish()});
  function itemLoanCost(item){return (item.paymentMode||item.payment_mode)==="nominal"?(document.documentElement.lang==="en"?"Nominal fee":"תשלום סמלי"):(document.documentElement.lang==="en"?"No charge":"ללא תשלום")}
  function itemLoanCostExplanation(item){return item.costExplanation||item.cost_explanation||""}
  function syncItemLoanCostForm(){const nominal=$("#item-payment-mode").value==="nominal";$("#item-cost-explanation-row").hidden=!nominal;$("#item-cost-explanation").disabled=!nominal}
  function isDirectItem(item){return (item?.managementMode||item?.management_mode)==="direct";}
  function itemCardMarkup(item) {
    const image = safeImageUrl(item.image_urls?.[0]), favorite = state.favorites.has(item.id), available = item.availability_status === "available", count = Number(item.available_count ?? item.quantity), updated = item.inventory_updated_at ? formatRelative(item.inventory_updated_at) : "";
    return `<article class="item-card" data-item-id="${escapeHTML(item.id)}"><div class="item-card-media" style="--media-bg:${safeColor(item.cover_color)}">${image ? `<img src="${escapeHTML(image)}" alt="${escapeHTML(itemDisplayText(item,"title"))}" loading="lazy">` : `<span class="item-symbol">${iconSvg(item.icon)}</span>`}${item.rating ? `<span class="item-card-rating">${ratingStars(item.rating,{size:"item-card-overlay"})}</span>` : ""}<span class="availability-badge ${available ? "" : "is-busy"}">${isDirectItem(item) ? pickupText("לתיאום ישיר","Direct contact") : available ? count > 0 ? `${count} זמינים` : "זמין עכשיו" : "בתיאום"}</span><button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" data-favorite-id="${escapeHTML(item.id)}" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div><div class="item-card-body"><div class="item-card-topline"><span class="item-category-label">${escapeHTML(categoryDisplayName(item.category))}${item.subcategory?` · ${escapeHTML(subcategoryDisplayName(item.subcategory))}`:""}</span><span>${escapeHTML(displayCondition(item.condition))}</span></div><h3 data-user-content-priority="title">${escapeHTML(itemDisplayText(item,"title"))}</h3><span class="status-chip">${escapeHTML(itemLoanCost(item))}</span><p data-user-content-priority="description">${escapeHTML(itemDisplayText(item,"description"))}</p><div class="trust-line"><button type="button" data-open-organization="${escapeHTML(item.organizations?.id)}" class="organization-name" translate="no">${escapeHTML(item.organizations?.name || "גמ״ח")}</button>${item.organizations?.rating ? ratingStars(item.organizations.rating,{label:"גמ״ח",size:"gmach-card"}) : ""}<small>${updated ? `עודכן ${escapeHTML(updated)}` : ""}</small></div><div class="item-card-footer"><span class="item-location">📍 ${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</span><span class="item-card-controls"><button class="compare-toggle" type="button" data-compare-item="${escapeHTML(item.id)}" aria-pressed="${state.compareIds.has(String(item.id))}">${state.compareIds.has(String(item.id)) ? "✓ להשוואה" : "+ להשוואה"}</button><button class="item-card-open" type="button" data-open-item="${escapeHTML(item.id)}">לפרטים ←</button></span></div></div></article>`;
  }
  function ratingStars(value,{label="",size="small",count=null}={}){
    const numeric=Math.max(0,Math.min(5,Number(value)||0)),filled=Math.max(0,Math.min(5,Math.round(numeric)));
    const stars=Array.from({length:5},(_,i)=>`<span class="rating-star ${i<filled?"is-filled":"is-empty"}" aria-hidden="true">★</span>`).join("");
    const score=numeric?numeric.toFixed(Number.isInteger(numeric)?0:1):"0";
    return `<span class="rating-display rating-${escapeHTML(size)}" role="img" aria-label="${escapeHTML((label?label+" ":"")+score+" מתוך 5")}">${label?`<span class="rating-label">${escapeHTML(label)}</span>`:""}<span class="rating-stars">${stars}</span><span class="rating-score">${escapeHTML(score)}/5</span>${count!==null?`<span class="rating-count">(${Number(count)||0})</span>`:""}</span>`;
  }
  function formatRelative(value) { const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000)); if(document.documentElement.lang==="en")return days===0?"today":days===1?"yesterday":`${days} days ago`; return days === 0 ? "היום" : days === 1 ? "אתמול" : `לפני ${days} ימים`; }
  function renderItems() {
    const visible = state.filteredItems.slice(0, state.visibleCount);
    const isEmpty = state.filteredItems.length === 0;
    const isLaunchEmpty = state.serverAvailable && state.items.length === 0;
    const isOffline = !state.serverAvailable;
    $("#items-grid").innerHTML = visible.map(itemCardMarkup).join("");
    $("#map-results").innerHTML = visible.map(item => `<article><span class="map-pin">📍</span><div><strong>${escapeHTML(itemDisplayText(item,"title"))}</strong><p>${escapeHTML(item.category||"כללי")}${item.subcategory?` · ${escapeHTML(item.subcategory)}`:""} · <span class="organization-name" translate="no">${escapeHTML(item.organizations?.name)}</span> · ${escapeHTML(item.city)}</p></div><button data-open-item="${escapeHTML(item.id)}">פרטים</button></article>`).join("");
    $("#empty-state").hidden = !isEmpty;
    $("#items-grid").hidden = isEmpty;
    $("#load-more-button").hidden = isEmpty || state.visibleCount >= state.filteredItems.length;
    if (state.filteredItems.length) {
      const count = state.filteredItems.length;
      $("#results-summary").textContent = count === 1 ? "פריט מתאים אחד נמצא" : `${count} פריטים מתאימים נמצאו`;
    } else if (isOffline) {
      $("#results-summary").textContent = "הקטלוג אינו זמין כרגע";
      $("#empty-state h3").textContent = "לא הצלחנו להתחבר כרגע";
      $("#empty-state p").textContent = "נסו לרענן את הדף בעוד רגע.";
      $("#empty-clear-button").textContent = "ניסיון נוסף";
    } else if (isLaunchEmpty) {
      $("#results-summary").textContent = "הקטלוג נבנה יחד עם הקהילה";
      $("#empty-state h3").textContent = "הקטלוג נבנה יחד עם הקהילה";
      $("#empty-state p").textContent = "מנהלים גמ״ח או מחזיקים ציוד שאפשר להשאיל? פרסמו אותו באתר ועזרו למשפחה הבאה.";
      $("#empty-clear-button").textContent = "פרסום גמ״ח";
    } else {
      $("#results-summary").textContent = "אין כרגע תוצאות שמתאימות לסינון";
      $("#empty-state h3").textContent = "לא מצאנו פריט מתאים כרגע";
      const selectedCategory = $("#category-filter").value;
      const selectedCity = $("#city-filter").value, searchTerm = normalize($("#search-input").value);
      const unavailableInCategory = $("#available-only").checked && state.items.some(item => (!selectedCategory || item.category === selectedCategory) && (!selectedCity || item.city === selectedCity) && (!searchTerm || normalize([item.title,item.category,item.description].join(" ")).includes(searchTerm)) && item.availability_status !== "available");
      $("#empty-state p").textContent = unavailableInCategory ? "יש פריטים בקטגוריה הזו, אך הם אינם זמינים כרגע. בטלו את הסינון 'רק פריטים זמינים' כדי לראות אותם ולבדוק אפשרות לתיאום." : "נסו להרחיב את האזור או לבחור קטגוריה אחרת.";
      $("#empty-clear-button").textContent = "ניקוי החיפוש";
    }
    setResultsView(state.viewMode); $$('[data-open-item]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); openItem(button.dataset.openItem); })); $$('[data-favorite-id]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); toggleFavorite(button.dataset.favoriteId); })); $$('[data-compare-item]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); toggleCompare(button.dataset.compareItem); })); $$('[data-open-organization]').forEach(button => button.addEventListener("click", event => { event.stopPropagation(); openOrganization(button.dataset.openOrganization); })); $$(".item-card").forEach(card => { card.addEventListener("click", event => { if(event.target.closest("button,a,input,select,textarea"))return; openItem(card.dataset.itemId); }); });
  }
  function findItem(id) { return state.items.find(item => String(item.id) === String(id)); }
  function toggleCompare(id) {
    id = String(id);
    if (state.compareIds.has(id)) state.compareIds.delete(id);
    else if (state.compareIds.size >= 5) { toast("אפשר להשוות עד חמישה פריטים", "error"); return; }
    else state.compareIds.add(id);
    $$('[data-compare-item]').filter(button => button.dataset.compareItem === id).forEach(button => {
      const selected = state.compareIds.has(id);
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = selected ? "✓ להשוואה" : "+ להשוואה";
    });
    renderCompareTray();
  }
  function renderCompareTray() {
    let tray = $("#compare-tray");
    if (!tray) { tray = document.createElement("aside"); tray.id = "compare-tray"; tray.className = "compare-tray"; tray.setAttribute("aria-label", "השוואת פריטים"); document.body.append(tray); }
    tray.hidden = state.compareIds.size === 0;
    if (tray.hidden) return;
    tray.innerHTML = `<span>${state.compareIds.size} מתוך 5 פריטים להשוואה</span><button type="button" class="button button-primary button-small" data-open-compare ${state.compareIds.size < 2 ? "disabled" : ""}>השוואה</button><button type="button" class="button button-secondary button-small" data-clear-compare>ניקוי</button>`;
    tray.querySelector('[data-open-compare]').addEventListener("click", openComparison);
    tray.querySelector('[data-clear-compare]').addEventListener("click", () => { state.compareIds.clear(); renderCompareTray(); renderItems(); });
  }
  function openComparison() {
    const items = [...state.compareIds].map(findItem).filter(Boolean);
    if (items.length < 2) return;
    let dialog = $("#compare-dialog");
    if (!dialog) { dialog = document.createElement("dialog"); dialog.id = "compare-dialog"; dialog.className = "modal compare-dialog"; document.body.append(dialog); dialog.addEventListener("close", () => { if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }); }
    const rows = [
      ["קטגוריה", item => item.category], ["מצב", item => displayCondition(item.condition)],
      ["זמינות", item => item.availability_status === "available" ? "זמין" : "בתיאום"], ["כמות זמינה", item => isDirectItem(item)?pickupText("בתיאום ישיר","Direct contact"):item.available_count ?? item.quantity],
      ["עיר", item => item.city], ["תנאי השאלה", item => item.loan_conditions]
    ];
    const ratingRow=`<tr class="compare-rating-row"><th scope="row">דירוג פריט</th>${items.map(item=>`<td>${item.rating?ratingStars(item.rating,{size:"compare"}):'<span class="rating-unrated">טרם דורג</span>'}</td>`).join("")}</tr>`;
    const organizationRow=`<tr><th scope="row">גמ״ח</th>${items.map(item=>`<td><span class="organization-name" translate="no">${escapeHTML(item.organizations?.name||"לא צוין")}</span></td>`).join("")}</tr>`;
    dialog.innerHTML = `<button class="dialog-close" type="button" aria-label="סגירת השוואה" data-close-compare>×</button><h2>השוואת פריטים</h2><p>השוו עד חמישה פריטים ובחרו מה מתאים לכם.</p><div class="compare-scroll"><table class="compare-table"><thead><tr><th scope="col">פרט</th>${items.map(item => `<th scope="col">${escapeHTML(itemDisplayText(item,"title"))}<button type="button" data-remove-compare="${escapeHTML(item.id)}" aria-label="הסרת ${escapeHTML(itemDisplayText(item,"title"))} מההשוואה">הסרה</button></th>`).join("")}</tr></thead><tbody>${ratingRow}${organizationRow}${rows.map(([label, value]) => `<tr><th scope="row">${label}</th>${items.map(item => `<td>${escapeHTML(value(item) ?? "לא צוין")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    dialog.querySelector('[data-close-compare]').addEventListener("click", () => closeDialog(dialog));
    dialog.querySelectorAll('[data-remove-compare]').forEach(button => button.addEventListener("click", () => { state.compareIds.delete(button.dataset.removeCompare); closeDialog(dialog); renderCompareTray(); renderItems(); if (state.compareIds.size >= 2) openComparison(); }));
    openDialog(dialog);
  }
  function itemPolicyMinutes(v) {
    const en=document.documentElement.lang==="en"; v=Number(v||0);
    if(!v)return en?"None":"ללא";
    if(v%1440===0)return (v/1440)+" "+(en?"days":"ימים");
    if(v%60===0)return (v/60)+" "+(en?"hours":"שעות");
    return v+" "+(en?"minutes":"דקות");
  }
  function itemPolicyLoanDuration(v) {
    const en=document.documentElement.lang==="en";v=Math.max(0,Number(v||0));
    if(!v)return en?"None":"ללא";
    const days=Math.floor(v/1440),hours=(v%1440)/60,parts=[];
    if(days)parts.push(days+" "+(en?(days===1?"day":"days"):"ימים"));
    if(hours)parts.push((Number.isInteger(hours)?hours:Number(hours.toFixed(1)))+" "+(en?"hours":"שעות"));
    return parts.join(" + ") || (en?"less than an hour":"פחות משעה");
  }
  function itemPolicyMoney(v) {
    return (Number(v||0)/100).toLocaleString(document.documentElement.lang==="en"?"en-IL":"he-IL",{style:"currency",currency:"ILS"});
  }
  function itemPolicyHTML(item) {
    const en=document.documentElement.lang==="en",t=(he,enText)=>en?enText:he;
    const timingRows=[
      [t("משך מינימלי","Minimum duration"),itemPolicyLoanDuration(item.minLoanMinutes)],
      [t("משך מרבי","Maximum duration"),itemPolicyLoanDuration(item.maxLoanMinutes)],
      [t("הזמנה מראש","Advance notice"),itemPolicyMinutes(item.bookingNoticeMinutes)],
      [t("זמן הכנה","Preparation time"),itemPolicyMinutes(item.preparationMinutes)],
      [t("זמן בין השאלות","Turnaround time"),itemPolicyMinutes(item.turnaroundMinutes)],
      [t("אופק הזמנה","Booking horizon"),Number(item.bookingHorizonDays||0)+" "+t("ימים","days")]
    ];
    const approval=item.approvalMode==="automatic"?t("אוטומטי","Automatic"):t("ידני","Manual");
    const ruleRows=[
      [t("עלות ההשאלה","Loan cost"),itemLoanCost(item)],
      [t("אישור בקשה","Request approval"),approval],
      [t("מקסימום למשתמש","Maximum per user"),item.maxPerUser?String(item.maxPerUser):t("ללא מגבלה נוספת","No additional limit")],
      [t("רדיוס שירות","Service radius"),item.serviceRadiusKm?item.serviceRadiusKm+" "+t('ק"מ',"km"):t("לא הוגדר","Not set")]
    ];
    if(item.recurringAllowed)ruleRows.push([t("בקשה מחזורית","Recurring request"),t("נתמכת","Supported")]);
    const emptyValues=new Set([t("ללא","None"),t("ללא מגבלה נוספת","No additional limit"),t("לא הוגדר","Not set")]);
    const renderRows=rows=>rows.map(([label,value])=>'<div class="loan-policy-row"><span>'+escapeHTML(label)+'</span><strong class="'+(emptyValues.has(String(value))?'is-muted':'')+'">'+escapeHTML(value)+'</strong></div>').join("");
    const horizon=Number(item.bookingHorizonDays||0)+" "+t("ימים","days");
    const summary=[[t("עד","Up to"),itemPolicyLoanDuration(item.maxLoanMinutes)],[t("אישור","Approval"),approval],[t("הזמנה עד","Book up to"),horizon]];
    if(item.depositRequired)summary.push([t("פיקדון","Deposit"),itemPolicyMoney(item.depositAmountAgorot)]);
    return '<section class="organization-facts" data-release-policy="1"><section class="loan-policy-panel" style="grid-column:1/-1"><div class="loan-policy-heading"><div><span class="loan-policy-kicker">'+t("מידע חשוב לפני שמבקשים","Important before requesting")+'</span><h3>'+t("תנאי השאלה וזמינות","Loan terms and availability")+'</h3></div></div><div class="loan-policy-summary">'+summary.map(([label,value])=>'<span class="loan-policy-chip"><small>'+escapeHTML(label)+'</small><strong>'+escapeHTML(value)+'</strong></span>').join("")+'</div><div class="loan-policy-groups"><section class="loan-policy-group"><h4>'+t("זמנים","Timing")+'</h4>'+renderRows(timingRows)+'</section><section class="loan-policy-group"><h4>'+t("כללי בקשה","Request rules")+'</h4>'+renderRows(ruleRows)+'</section></div>'+(item.depositRequired?'<div class="loan-policy-deposit"><span>'+t("פיקדון","Deposit")+'</span><strong>'+escapeHTML(itemPolicyMoney(item.depositAmountAgorot))+'</strong><small>'+t("הפיקדון אינו תשלום עבור ההשאלה.","The deposit is not a fee for the loan.")+'</small></div>':'')+(itemLoanCostExplanation(item)?'<div class="loan-policy-notes"><strong>'+t('הסבר לתשלום הסמלי','Nominal fee explanation')+'</strong><p>'+escapeHTML(itemLoanCostExplanation(item))+'</p></div>':'')+(item.loan_conditions?'<div class="loan-policy-notes"><strong>'+t("תנאים נוספים","Additional terms")+'</strong><p>'+escapeHTML(item.loan_conditions)+'</p></div>':'')+'</section></section>';
  }

  async function openItem(id) {
    let item = findItem(id);
    {
      try {
        const data = await api("/api/items/"+encodeURIComponent(id));
        item = data?.item || null;
        if (item) {
          const existingIndex=state.items.findIndex(row=>String(row.id)===String(item.id));
          if(existingIndex>=0) state.items[existingIndex]=item; else state.items.push(item);
        }
      } catch (error) {
        toast(error.message || "לא הצלחנו לפתוח את הפריט", "error");
        return;
      }
    }
    if (!item) { toast("הפריט אינו זמין כרגע", "error"); return; }
    state.selectedItem = item;
    const direct=isDirectItem(item);
    $("#item-dialog-content").dataset.managementMode=direct?"direct":"managed";
    $("#item-dialog-content").dataset.itemId = String(item.id);
    const images=(item.image_urls||[]).map(safeImageUrl).filter(Boolean), image = images[0], favorite = state.favorites.has(item.id), available = item.availability_status === "available";
    const gallery=image?`<div class="item-gallery-stage"><img id="item-gallery-main" src="${escapeHTML(image)}" alt="${escapeHTML(itemDisplayText(item,"title"))}"></div>${images.length>1?`<button class="item-gallery-nav item-gallery-prev" type="button" aria-label="תמונה קודמת">‹</button><button class="item-gallery-nav item-gallery-next" type="button" aria-label="תמונה הבאה">›</button><span class="item-gallery-count" aria-live="polite">1 / ${images.length}</span><div class="item-gallery-thumbs">${images.map((src,index)=>`<button type="button" data-gallery-index="${index}" class="${index===0?"is-active":""}" aria-label="הצגת תמונה ${index+1}"><img src="${escapeHTML(src)}" alt=""></button>`).join("")}</div>`:""}`:`<span class="item-symbol">${iconSvg(item.icon)}</span>`;
    $("#item-dialog-content").innerHTML = `<article class="item-detail ${image ? "has-item-image" : "item-detail-no-image"}"><div class="item-detail-media" style="--media-bg:${safeColor(item.cover_color)}">${gallery}<span class="availability-badge ${available ? "" : "is-busy"}">${direct ? pickupText("לתיאום ישיר","Direct contact") : available ? "זמין עכשיו" : "זמין בתיאום"}</span></div><div class="item-detail-copy"><div class="detail-meta"><span>${escapeHTML(item.category)}</span>${item.subcategory?`<span class="dot"></span><span>${escapeHTML(item.subcategory)}</span>`:""}<span class="dot"></span><span>${escapeHTML(displayCondition(item.condition))}</span></div><h2 id="item-dialog-title" data-user-content-priority="title">${escapeHTML(itemDisplayText(item,"title"))}</h2><div class="item-rating-hero">${item.rating ? ratingStars(item.rating,{size:"item-large",count:Number(item.reviewCount||0)}) : '<span class="rating-unrated">טרם דורג</span>'}</div><p class="item-detail-description" data-user-content-priority="description">${escapeHTML(itemDisplayText(item,"description"))}</p><ul class="detail-facts"><li><span>מיקום איסוף</span><strong>${escapeHTML([item.city, item.neighborhood].filter(Boolean).join(", "))}</strong></li>${direct ? "" : `<li><span>כמות זמינה</span><strong>${escapeHTML(item.quantity || 1)}</strong></li><li><span>זמינות</span><strong>${available ? "זמין לבקשה" : "יש לתאם תאריך"}</strong></li>`}</ul>${direct ? `<section class="gmach-contact-section" id="item-direct-contact"><p>${escapeHTML(pickupText("הזמינות וקבלת הפריט מתואמות ישירות עם הגמ״ח.","Arrange availability and pickup directly with the gmach."))}</p>${window.GmachContacts?.markup(item.contact)||""}</section>` : `<section id="item-pickup-branches" class="dashboard-empty" aria-live="polite"></section>${itemPolicyHTML(item)}`}<div class="gmach-owner"><span class="owner-mark" aria-hidden="true">ג</span><span><strong class="organization-name" translate="no">${escapeHTML(item.organizations?.name || "גמ״ח קהילתי")}</strong><small>${item.organizations?.rating ? ratingStars(item.organizations.rating,{label:"דירוג גמ״ח",size:"gmach-small",count:Number(item.organizations.reviewCount||0)}) : "גמ״ח חדש ללא דירוגים"}</small></span></div><div class="detail-actions">${direct ? "" : `<button class="button button-primary" type="button" id="detail-request-button">בקשת השאלה</button>`}<button class="favorite-button ${favorite ? "is-favorite" : ""}" type="button" id="detail-favorite-button" aria-label="${favorite ? "הסרה מהמועדפים" : "הוספה למועדפים"}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS.heart}</svg></button></div><button class="report-link" type="button" id="detail-report-button">דיווח על פריט או מידע לא נכון</button></div></article>`;
    if(!direct)showPickupBranches(item.id);
    $("[data-contact-chat]",$("#item-dialog-content"))?.addEventListener("click",()=>requestOrganizationChat(item.organizations?.id,true));
    if(images.length>1){
      let galleryIndex=0;const root=$("#item-dialog-content"),main=$("#item-gallery-main",root),count=$(".item-gallery-count",root),thumbs=Array.from(root.querySelectorAll("[data-gallery-index]"));
      const showGallery=index=>{galleryIndex=(index+images.length)%images.length;main.src=images[galleryIndex];count.textContent=`${galleryIndex+1} / ${images.length}`;thumbs.forEach((button,n)=>button.classList.toggle("is-active",n===galleryIndex));};
      $(".item-gallery-prev",root)?.addEventListener("click",()=>showGallery(galleryIndex-1));
      $(".item-gallery-next",root)?.addEventListener("click",()=>showGallery(galleryIndex+1));
      thumbs.forEach(button=>button.addEventListener("click",()=>showGallery(Number(button.dataset.galleryIndex))));
    }
    const orgButton = document.createElement("button"); orgButton.type="button"; orgButton.className="button button-secondary"; orgButton.textContent="עמוד הגמ״ח"; orgButton.addEventListener("click", () => { closeDialog($("#item-dialog")); openOrganization(item.organizations?.id); });
    const shareButton = document.createElement("button"); shareButton.type="button"; shareButton.className="button button-secondary"; shareButton.textContent="שיתוף"; shareButton.addEventListener("click", () => shareItem(item));
    $(".detail-actions", $("#item-dialog-content")).append(orgButton, shareButton);
    $("#detail-request-button")?.addEventListener("click", () => startRequest(item.id)); if(!direct)showItemServiceEligibility(item); $("#detail-favorite-button").addEventListener("click", () => toggleFavorite(item.id, true)); $("#detail-report-button").addEventListener("click", () => openReport(item.id)); analytics("item_view", { entityId:item.id, category:item.category, city:item.city }); openDialog($("#item-dialog"));
  }
  async function shareItem(item) {
    const url = `${location.origin}/item/${encodeURIComponent(item.id)}`; const data = { title:item.title, text:`מצאתי את ${item.title} בגמ״ח ברגע`, url };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(url); toast("הקישור הועתק"); } analytics("share", { entityId:item.id }); } catch { /* User cancelled sharing. */ }
  }
  function showOrganizationPage(id) { $("#dashboard-view").hidden = true; $("#home-view").hidden = true; $("#organization-page-view").hidden = false; const path=`/gmach/${encodeURIComponent(id)}`; if(location.pathname!==path) history.pushState({route:"gmach",id:String(id)},"",path); window.scrollTo(0,0); }
  function reviewItemLink(review) {
    if (!review?.item_title) return "";
    const itemId=String(review.item_id||""), image=safeImageUrl(review.item_image_url);
    if (!itemId) return `<span class="review-item-context">על הפריט: ${escapeHTML(review.item_title)}</span>`;
    const media=image
      ? `<span class="review-item-thumb"><img src="${escapeHTML(image)}" alt=""></span>`
      : `<span class="review-item-thumb review-item-thumb-placeholder">${iconSvg("box")}</span>`;
    return `<a class="review-item-link" href="/item/${encodeURIComponent(itemId)}" data-review-item="${escapeHTML(itemId)}">${media}<span class="review-item-link-copy"><small>הפריט שדורג</small><strong>${escapeHTML(review.item_title)}</strong></span><span class="review-item-arrow" aria-hidden="true">←</span></a>`;
  }
  async function openOrganization(id) {
    if (!id) return;
    try { const data = await api(`/api/organizations/${encodeURIComponent(id)}/public`); if(state.user) api(`/api/organizations/${encodeURIComponent(id)}/view`,{method:"POST",body:{}}).catch(()=>{}); const org=data.organization, items=data.items||[], reviews=data.reviews||[], hours=Object.entries(org.hours||{}); $("#organization-page-content").dataset.organizationId=String(id);
      $("#organization-page-content").innerHTML = `<article class="organization-detail">${org.temporarily_closed?`<div class="dashboard-empty" role="status"><strong>הגמ״ח סגור זמנית</strong><p>${org.reopens_at?`פתיחה צפויה: ${escapeHTML(formatDateTime(org.reopens_at))}`:"מועד הפתיחה מחדש יעודכן בהמשך."}</p></div>`:""}<div class="organization-hero"><span class="verification-chip">${org.rating ? ratingStars(org.rating,{label:"גמ״ח",size:"gmach-hero",count:Number(org.review_count||0)}) : "חדש — ללא דירוגים"}</span><h2 id="organization-title" class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</h2><p>${escapeHTML(org.description)}</p><div class="organization-meta"><span>📍 ${escapeHTML([org.city,org.neighborhood].filter(Boolean).join(", "))}</span><span>${org.rating ? ratingStars(org.rating,{size:"gmach-meta"}) : "עדיין אין דירוגים"}</span><span>${org.last_active_at ? `פעיל ${escapeHTML(formatRelative(org.last_active_at))}` : "פעילות טרם עודכנה"}</span></div></div><div class="organization-service-summary">${hours.length?'<p><strong>'+escapeHTML(pickupText("שעות פעילות","Opening hours"))+':</strong> '+hours.map(([d,h])=>escapeHTML(d)+': '+escapeHTML(h)).join(" · ")+'</p>':""}<p><strong>${escapeHTML(pickupText("אזור שירות","Service area"))}:</strong> ${escapeHTML(org.service_area || org.city)}${org.serviceRange?.radiusKm?` · ${escapeHTML(pickupText(`עד ${org.serviceRange.radiusKm} ק״מ`,`Within ${org.serviceRange.radiusKm} km`))}`:""}</p></div>${items.length?"<h3>פריטים בגמ״ח</h3>":""}${[...new Set(items.map(item => item.category || "כללי"))].map(category => `<section class="organization-category"><h4>${escapeHTML(categoryDisplayName(category))}</h4><div class="mini-items">${items.filter(item => (item.category || "כללי") === category).map(item => `<button type="button" data-org-item="${escapeHTML(item.id)}"><strong data-user-content-priority="title">${escapeHTML(itemDisplayText(item,"title"))}</strong>${item.subcategory?`<small>${escapeHTML(subcategoryDisplayName(item.subcategory))}</small>`:""}<span>${item.rating ? ratingStars(item.rating,{size:"mini"}) : escapeHTML(item.availability_status === "available" ? "זמין" : "בתיאום")}</span></button>`).join("")}</div></section>`).join("") || ""}<h3>דירוגי משתמשים</h3><div class="review-list">${reviews.map(review => `<blockquote data-review-id="${escapeHTML(review.id||"")}"><div class="review-rating-grid">${review.item_rating ? ratingStars(review.item_rating,{size:"review-primary"}) : ""}<div class="review-secondary-ratings">${review.rating ? ratingStars(review.rating,{label:"דירוג הגמ״ח",size:"review-secondary"}) : ""}${review.service_rating ? ratingStars(review.service_rating,{label:"שירות",size:"review-secondary"}) : ""}${review.branch_rating ? ratingStars(review.branch_rating,{label:"סניף",size:"review-secondary"}) : ""}</div></div>${reviewItemLink(review)}<p>${escapeHTML(review.comment || "ללא הערה")}</p><div class="review-byline"><cite>${window.GmachOriginalName(review.author_name||"משתמש/ת")}</cite>${review.returned_at || review.requested_from ? `<time datetime="${escapeHTML(review.returned_at||review.requested_from)}">${escapeHTML((review.returned_at||review.requested_from).slice(0,10))}</time>` : ""}${review.branch_name ? `<span>· ${window.GmachOriginalName(review.branch_name)}</span>` : ""}</div>${review.organization_response ? `<p><strong>תגובת הגמ״ח:</strong> ${escapeHTML(review.organization_response)}</p>` : ""}<div class="review-actions"><button type="button" class="button button-secondary" data-review-helpful="${escapeHTML(review.id||"")}">מועילה (${Number(review.helpful_count||0)})</button><button type="button" class="button button-secondary" data-review-report="${escapeHTML(review.id||"")}">דיווח</button></div></blockquote>`).join("") || "עדיין אין דירוגים"}</div></article>`;
      let contact=org.contact;
      if(state.user){try{contact=(await api(`/api/organizations/${encodeURIComponent(id)}/contact`)).contact;}catch{}}
      const contactSection=document.createElement("section");contactSection.className="gmach-contact-section";
      contactSection.innerHTML=window.GmachContacts.markup(contact);
      $("#organization-page-content .organization-hero").insertAdjacentElement("afterend",contactSection);
      const handleChat=()=>{if(contact?.approvedChatId){openChat(contact.approvedChatId);return;}if(!items.length||items.some(isDirectItem)){requestOrganizationChat(id,items.some(isDirectItem));return;}toast(pickupText("בחרו פריט ושלחו בקשת השאלה. הצ׳אט ייפתח לאחר אישור.","Choose an item and send a borrowing request. The chat opens after approval."));$("#organization-page-content .organization-category")?.scrollIntoView({behavior:"smooth"});};
      $("[data-contact-chat]",contactSection)?.addEventListener("click",handleChat);

      if (data.partial) $("#organization-page-content").insertAdjacentHTML("afterbegin", `<p class="dashboard-empty" role="status" data-partial-sections="${escapeHTML((data.partialSections||[]).join(","))}">חלק מפרטי הגמ״ח אינם זמינים כרגע. אפשר לנסות שוב בעוד רגע.</p>`);
      $$('[data-org-item]', $("#organization-page-content")).forEach(button => button.addEventListener("click", () => { openItem(button.dataset.orgItem); }));
      $$('[data-review-item]', $("#organization-page-content")).forEach(link => link.addEventListener("click", event => { event.preventDefault(); openItem(link.dataset.reviewItem); }));
      $$('[data-review-helpful]', $("#organization-page-content")).forEach(button=>button.addEventListener("click",()=>requireAuth(async()=>{try{await api("/api/reviews/"+encodeURIComponent(button.dataset.reviewHelpful)+"/helpful",{method:"POST",body:{}});button.disabled=true;toast("תודה על המשוב")}catch(e){toast(e.message,"error")}}))); $$('[data-review-report]', $("#organization-page-content")).forEach(button=>button.addEventListener("click",()=>requireAuth(async()=>{const reason=translatedPrompt("מה הבעיה בביקורת?");if(!reason)return;try{await api("/api/reviews/"+encodeURIComponent(button.dataset.reviewReport)+"/report",{method:"POST",body:{reason}});button.disabled=true;toast("הדיווח נשלח לבדיקה")}catch(e){toast(e.message,"error")}}))); showOrganizationPage(id);
    } catch (error) {
      const content = $("#organization-page-content");
      content.innerHTML = `<div class="dashboard-empty" role="alert"><h2 id="organization-title">לא הצלחנו לטעון את עמוד הגמ״ח</h2><p>${escapeHTML(error.message)}</p>${error.systemFault&&error.requestId ? `<small>מספר תקלה לתמיכה: ${escapeHTML(error.requestId)}</small>` : ""}<div class="dashboard-row-actions"><button class="button button-secondary" type="button" data-retry-organization>ניסיון חוזר</button><button class="button button-secondary" type="button" data-support-organization>פנייה לתמיכה עם פרטי התקלה</button></div></div>`;
      $("[data-retry-organization]", content).addEventListener("click", () => openOrganization(id));$("[data-support-organization]",content).addEventListener("click",()=>openSupportForError(error,"תקלה בטעינת עמוד גמ״ח"));
      showOrganizationPage(id);
    }
  }
  let requestAvailability=null;
  function resetRequestAvailability(){
    requestAvailability=null;
    $("#request-partial-options").hidden=true;
    $("#request-waitlist").hidden=true;
  }
  const pickupText=(he,en)=>document.documentElement.lang==="en"?en:he;
  async function showPickupBranches(id){const host=$("#item-pickup-branches");if(!host)return;try{const data=await api(`/api/items/${encodeURIComponent(id)}/pickup-branches`);if(host!==$("#item-pickup-branches"))return;host.hidden=!(data.branches||[]).length;host.innerHTML='<strong>'+pickupText('סניפי איסוף','Pickup branches')+'</strong>'+(data.branches||[]).map(b=>'<p>'+window.GmachOriginalName(b.name)+' · '+escapeHTML([b.city,b.address].filter(Boolean).join(', '))+'</p>').join('')}catch{host.textContent=pickupText('לא הצלחנו לטעון את סניפי האיסוף.','Could not load pickup branches.')}}
  async function loadRequestBranches(id){const select=$("#request-branch"),field=$("#request-branch-field"),address=$("#request-branch-address"),submit=$('#request-form button[type="submit"]');submit.disabled=true;field.hidden=false;select.disabled=true;select.replaceChildren(new Option(pickupText('טוענים סניפים…','Loading branches…'),''));address.textContent='';try{const data=await api(`/api/items/${encodeURIComponent(id)}/pickup-branches`);if($("#request-item-id").value!==id)return;const branches=data.branches||[];select.replaceChildren(...(branches.length>1?[new Option(pickupText('בחרו סניף איסוף','Choose a pickup branch'),'')]:[]),...branches.map(b=>{const o=new Option(b.name+(b.city?' · '+b.city:''),b.id);o.setAttribute('translate','no');o.dataset.originalName='1';return o}));field.hidden=!branches.length;select.required=branches.length>1;select.disabled=!branches.length;select.onchange=()=>{const branch=branches.find(b=>b.id===select.value);address.textContent=branch?[branch.city,branch.address].filter(Boolean).join(', '):'';resetRequestAvailability();checkRequestedAvailability()};select.onchange();submit.disabled=false}catch(error){address.textContent=pickupText('לא הצלחנו לטעון סניפים. סגרו ופתחו שוב את הבקשה.','Could not load branches. Close and reopen the request.');select.replaceChildren();toast(error.message,'error')}}
  const serviceMessage=(result)=>pickupText(result.message, result.outside?`This gmach serves residents within ${result.radiusKm} km of its location.`:"");
  async function itemServiceEligibility(item){return api(`/api/organizations/${encodeURIComponent(item.organizationId||item.organization_id||item.organizations?.id)}/service-eligibility`);}
  async function showItemServiceEligibility(item){
    if(!state.user)return;
    const button=$("#detail-request-button");if(!button)return;
    button.disabled=true;
    try{const result=await itemServiceEligibility(item);if(button!==$("#detail-request-button"))return;button.disabled=!result.allowed&&!result.exceptionAvailable;if(result.outside){button.textContent=result.exceptionAvailable?pickupText("בקשת חריגה מטווח השירות","Request a distance exception"):serviceMessage(result);button.title=serviceMessage(result);}}
    catch(error){if(button===$("#detail-request-button")){button.disabled=true;button.textContent=error.message;}}
    finally{if(button===$("#detail-request-button")&&!button.disabled)button.removeAttribute("title");}
  }
  function startRequest(id) { const item = findItem(id); if (!item) return; requireAuth(async () => {
    let eligibility;try{eligibility=await itemServiceEligibility(item);}catch(error){toast(error.message,"error");return;}
    if(!eligibility.allowed&&!eligibility.exceptionAvailable){toast(serviceMessage(eligibility),"error");return;}
    closeDialog($("#item-dialog")); $("#request-form").reset();
    $("#request-service-message").hidden=!eligibility.outside;$("#request-service-message").textContent=serviceMessage(eligibility);
    $("#request-exception-field").hidden=!eligibility.exceptionAvailable;$("#request-distance-exception").required=eligibility.exceptionAvailable;
 $("#request-item-id").value=item.id; $("#request-item-name").textContent=item.title;$("#request-cost-notice").textContent=itemLoanCost(item)+(itemLoanCostExplanation(item)?" — "+itemLoanCostExplanation(item):""); $("#request-quantity").max=String(item.quantity||1); $("#request-quantity").value="1"; $("#request-availability").textContent="בחרו תאריך ושעה כדי לבדוק זמינות."; resetRequestAvailability(); $("#request-deposit-box").hidden=true; $("#request-deposit-consent").required=false; openDialog($("#request-dialog")); loadRequestBranches(item.id); }); }
  let availabilityTimer;
  async function checkRequestedAvailability(){
    clearTimeout(availabilityTimer);
    const id=$("#request-item-id").value,from=$("#request-start").value,until=$("#request-end").value,requestedQuantity=Math.max(1,Number($("#request-quantity").value)||1),branchId=$("#request-branch").value||"";
    if(!id||!from||!until){$("#request-availability").textContent="בחרו תאריך ושעה כדי לבדוק זמינות.";resetRequestAvailability();return;}
    availabilityTimer=setTimeout(async()=>{try{
      $("#request-availability").textContent="בודקים זמינות…";
      const data=await api(`/api/items/${encodeURIComponent(id)}/availability-check?from=${encodeURIComponent(from)}&until=${encodeURIComponent(until)}&branchId=${encodeURIComponent(branchId)}`);
      if($("#request-item-id").value!==id||($("#request-branch").value||"")!==branchId)return;
      requestAvailability={...data,itemId:id,from,until,requestedQuantity,branchId};
      const availableQuantity=Math.max(0,Number(data.availableQuantity)||0),partial=availableQuantity>0&&requestedQuantity>availableQuantity;
      $("#request-quantity").max=String(Math.max(1,Number(data.totalQuantity)||availableQuantity||1));
      $("#request-partial-options").hidden=!partial;
      $("#request-waitlist").hidden=availableQuantity>0;
      if(partial){
        $("#request-availability").textContent=document.documentElement.lang==="en"?`Partial availability: you requested ${requestedQuantity} units and ${availableQuantity} are available for this period.`:`זמינות חלקית: ביקשתם ${requestedQuantity} יחידות, ובטווח הזה זמינות ${availableQuantity}.`;
        $("#request-partial-message").textContent="אפשר לקבל עכשיו את הכמות הזמינה, להמתין לכמות המלאה או לבחור מועד אחר.";
      }else{
        $("#request-availability").textContent=availableQuantity>0?`זמין בטווח שבחרתם — ${availableQuantity} יחידות זמינות.`:(data.nextAvailableAt?`לא זמין בטווח שבחרתם. הזמינות הקרובה שמצאנו מתחילה ב־${new Date(data.nextAvailableAt).toLocaleString("he-IL")}.`:"לא זמין בטווח שבחרתם.");
      }
      $("#request-deposit-box").hidden=!data.depositRequired; $("#request-deposit-consent").required=Boolean(data.depositRequired);
      $("#request-deposit-amount").textContent=(Number(data.depositAmountAgorot||0)/100).toFixed(2);
    }catch(error){requestAvailability=null;$("#request-partial-options").hidden=true;$("#request-availability").textContent=error.message||"לא ניתן לבדוק זמינות כרגע.";}},180);
  }
  async function joinCurrentRequestWaitlist(quantity){
    const q=Math.max(1,Number(quantity)||1);
    await api("/api/items/"+encodeURIComponent($("#request-item-id").value)+"/waitlist",{method:"POST",body:{requestedFrom:$("#request-start").value,requestedUntil:$("#request-end").value,quantity:q}});
    toast("נוספתם לרשימת ההמתנה. נעדכן אתכם כשהכמות שביקשתם תתפנה.");
    $("#request-waitlist").hidden=true;$("#request-partial-options").hidden=true;
  }
  async function toggleFavorite(id, fromDetail = false) {
    requireAuth(async () => { const exists = state.favorites.has(id); try { await api(`/api/favorites/${encodeURIComponent(id)}`, { method: exists ? "DELETE" : "POST" }); if (exists) state.favorites.delete(id); else state.favorites.add(id); renderItems(); if (fromDetail) openItem(id); toast(exists ? "הפריט הוסר מהמועדפים" : "הפריט נוסף למועדפים"); } catch (error) { toast(error.message, "error"); } });
  }

  function setAuthMode(mode) {
    state.authMode = mode === "register" ? "register" : "login"; $$('[data-auth-mode]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.authMode === state.authMode)));
    const register = state.authMode === "register"; $("#auth-name-field").hidden = !register; $$(".auth-register-field").forEach(field=>field.hidden=!register); $("#auth-name").required = register; ["#auth-phone","#auth-city","#auth-address","#auth-operational-consent"].forEach(selector=>$(selector).required=register); $("#auth-consent-row").hidden = !register; $("#auth-consent").required = register; $("#forgot-password-button").hidden = register; $("#auth-password").autocomplete = register ? "new-password" : "current-password"; $("#auth-title").textContent = register ? "מצטרפים לגמ״ח ברגע" : "כניסה לגמ״ח ברגע"; $("#auth-description").textContent = register ? "יוצרים חשבון ומתחילים להשאיל ולעזור." : "נכנסים עם אימייל וסיסמה כדי לבקש, לשמור ולנהל פריטים."; $("#auth-submit").textContent = register ? "יצירת חשבון" : "כניסה";
  }
  function adoptAccountLanguage(user){if(!user?.preferredLanguage||localStorage.getItem("gmach-language"))return;localStorage.setItem("gmach-language",user.preferredLanguage);if(user.preferredLanguage==="en"){document.documentElement.lang="en";document.documentElement.dir="ltr";window.dispatchEvent(new Event("gmach-language-change"))}}
  async function finishAuthentication(user, form = null) {
    state.user = user; state.pendingVerificationEmail = ""; adoptAccountLanguage(user); updateAuthUI(); await refreshAccountSnapshot(); await refreshNotifications(true); form?.reset(); closeDialog($("#auth-dialog")); const action = state.pendingAction; state.pendingAction = null; action?.();
  }
  async function refreshUser(hydrate=true) {
    try { const data = await api("/api/auth/me"); state.user = data.user; adoptAccountLanguage(state.user); updateAuthUI(); if (state.user && hydrate) { await refreshAccountSnapshot(); await refreshNotifications(true); } return state.user; }
    catch { state.user = null; updateAuthUI(); return null; }
  }
  async function refreshAccountSnapshot() {
    if (!state.user) return null; const data = await api("/api/me/dashboard"); state.dashboard = data; state.myOrganizations = data.organizations || []; state.favorites = new Set(data.favorites || []); renderItems(); return data;
  }
  function updateAuthUI() {
    const label = state.user ? "האזור שלי" : "כניסה"; $("#dashboard-button").textContent = label; $$('[data-requires-auth]').forEach(button => { if (button !== $("#dashboard-button")) button.textContent = label; }); $("#dashboard-name").textContent = state.user ? (state.user.fullName || state.user.email?.split("@")[0] || "") : ""; $("#admin-tab").hidden = state.user?.role !== "admin" || !state.user.twoFactorEnabled; const notificationButton=$("#notifications-button"); notificationButton.hidden=false; notificationButton.style.visibility=state.user?"visible":"hidden"; notificationButton.disabled=!state.user; notificationButton.setAttribute("aria-hidden",state.user?"false":"true"); if (state.user?.role !== "admin" || !state.user.twoFactorEnabled) { $$('[data-admin-support-center],[data-release-readiness],[data-server-errors],[data-admin-control-center],[data-launch-admin-loans],[data-launch-health],[data-launch-entities],[data-admin-users-full],[data-privacy-retention],[data-navigation-admin]').forEach(button=>button.remove()); if(state.dashboardTab==="admin")state.dashboardTab="profile"; } if (!state.user) { $("#notification-badge").hidden = true; state.notifications = []; }
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
  function validateGmachHoursRange(name, announce=false) {
    const start=$(`[data-hours-start="${name}"]`),end=$(`[data-hours-end="${name}"]`);
    if(!start||!end)return true;
    start.setCustomValidity("");end.setCustomValidity("");
    let message="";
    if(name==="שישי"&&(start.value>"17:00"||end.value>"17:00"))message="ביום שישי ניתן להגדיר שעות פעילות רק עד 17:00.";
    else if(name==="שבת"&&(start.value<"20:00"||end.value<"20:00"))message="בשבת ניתן להגדיר שעות פעילות רק החל מ־20:00.";
    else if(start.value&&end.value&&start.value>=end.value)message="שעת הסיום חייבת להיות מאוחרת משעת הפתיחה.";
    if(message){
      if(name==="שישי"){start.setCustomValidity(message);end.setCustomValidity(message)}
      else if(name==="שבת"){start.setCustomValidity(message);end.setCustomValidity(message)}
      else end.setCustomValidity(message);
      if(announce)toast(message,"error");
      return false;
    }
    return true;
  }
  function readGmachHours() {
    if($("#gmach-hours-by-appointment")?.checked)return {};
    const hours = {};
    $$('[data-hours-day]:checked').forEach(day => {
      const name = day.dataset.hoursDay, start = $(`[data-hours-start="${name}"]`).value, end = $(`[data-hours-end="${name}"]`).value;
      if(!start||!end)throw new Error("יש לבחור שעת פתיחה ושעת סיום לכל יום מסומן.");
      if(!validateGmachHoursRange(name,false)){
        if(name==="שישי")throw new Error("ביום שישי ניתן להגדיר שעות פעילות רק עד 17:00.");
        if(name==="שבת")throw new Error("בשבת ניתן להגדיר שעות פעילות רק החל מ־20:00.");
        throw new Error("שעת הסיום חייבת להיות מאוחרת משעת הפתיחה.");
      }
      hours[name] = `${start}–${end}`;
    });
    return hours;
  }
  function populateGmachHours(hours) {
    const source=hours&&typeof hours==="object"?hours:{},hasHours=Object.keys(source).some(key=>String(source[key]||"").trim());
    setGmachHoursMode(!hasHours);
    $$('[data-hours-day]').forEach(day => {
      const name = day.dataset.hoursDay, value = source[name];
      day.checked = Boolean(value);
      const match = String(value||"").match(/(\d{2}:\d{2})[^\d]+(\d{2}:\d{2})/);
      if (match) { $(`[data-hours-start="${name}"]`).value = match[1]; $(`[data-hours-end="${name}"]`).value = match[2]; }
    });
  }
  function openGmachForm(organizationId = null) {
    requireAuth(async () => {
      const form = $("#gmach-form"); form.reset(); state.editingOrganizationId = organizationId;
      setGmachHoursMode(true);
      window.GmachContacts.fill();
      const organization = organizationId ? state.myOrganizations.find(row => row.id === organizationId) : null;
      $("#gmach-form-title").textContent = organization ? "עריכת עמוד הגמ״ח" : "פתיחת עמוד גמ״ח";
      $("#gmach-form-description").textContent = organization ? "אפשר לעדכן את פרטי הגמ״ח בכל עת." : "ממלאים פרטים בסיסיים. אפשר לפרסם את הגמ״ח גם בלי להוסיף פריטים.";
      $("#gmach-submit").textContent = organization ? "שמירת שינויים" : "פתיחת גמ״ח";
      if (organization) {
        try{const settings=await api(`/api/organizations/${encodeURIComponent(organizationId)}/service-range`);$("#gmach-service-radius").value=settings.serviceRange.radiusKm??"";$("#gmach-distance-exception").checked=settings.serviceRange.allowException;}catch(error){toast(error.message,"error");return;}
        try{const settings=await api(`/api/organizations/${encodeURIComponent(organizationId)}/contact-settings`);window.GmachContacts.fill(settings.contactSettings)}catch(error){toast(error.message,"error");return;}
        $("#gmach-name").value = organization.name || ""; $("#gmach-organization-type").value=organization.organization_type||"private"; $("#gmach-category").value = organization.primary_category || ""; $("#gmach-city").value = organization.city || "";
        $("#gmach-neighborhood").value = organization.neighborhood || ""; $("#gmach-description").value = organization.description || ""; $("#gmach-phone").value = organization.contact_phone || ""; $("#gmach-address").value=organization.address||""; $("#gmach-service-area").value=organization.service_area||""; populateGmachHours(organization.hours?.["שעות"] ? {ראשון:"09:00–17:00",שני:"09:00–17:00",שלישי:"09:00–17:00",רביעי:"09:00–17:00",חמישי:"09:00–17:00"} : organization.hours||{}); $("#gmach-consent").checked = true;
      }
      else { try { const {profile}=await api("/api/me/profile"); $("#gmach-phone").value=profile.phone||""; $("#gmach-address").value=profile.address||""; $("#gmach-city").value=profile.city||""; } catch(error) { toast(error.message,"error"); } }
      openDialog($("#gmach-dialog"));
    });
  }
  function setLoanDuration(field, minutes) {
    const value = Math.max(30, Number(minutes) || 60);
    const unit = $("#" + field + "-unit");
    const useDays=value>=1440 && value%1440===0;
    unit.value = useDays ? "1440" : "60";
    $("#" + field).value = Number((value / Number(unit.value)).toFixed(2));
  }
  function loanDurationMinutes(field) {
    return Number($("#" + field).value) * Number($("#" + field + "-unit").value);
  }
  function setOptionalDuration(field, minutes) {
    const value = Math.max(0, Number(minutes) || 0), unit = $("#" + field + "-unit");
    unit.value = value && value % 1440 === 0 ? "1440" : value && value % 60 === 0 ? "60" : "1";
    $("#" + field).value = value / Number(unit.value);
  }
  function optionalDurationMinutes(field) {
    return Number($("#" + field).value) * Number($("#" + field + "-unit").value);
  }
  function syncItemManagementForm(){
    const direct=$("#item-management-mode").value==="direct";
    $("#item-management-help").textContent=direct?pickupText("ללא ניהול מלאי ובקשות. דרכי הקשר שבחרתם לגמ״ח יוצגו תמיד בעמוד הפריט ובעמוד הגמ״ח.","No stock or loan requests. Your selected contact methods always appear on the item and gmach pages."):pickupText("ניהול מלאי, בקשות ואישורים באתר, כמו היום.","Manage stock, requests and approvals on the site.");
    for(const id of ["item-quantity","item-approval-mode","item-min-loan","item-max-loan","item-booking-notice","item-turnaround","item-booking-horizon","item-max-per-user","item-max-loan-days","item-service-radius","item-deposit-required","item-deposit-amount"]){
      const input=$("#"+id),label=input?.closest("label");if(!input||!label)continue;
      label.hidden=direct||(id==="item-deposit-amount"&&!$("#item-deposit-required").checked);
      label.querySelectorAll("input,select").forEach(control=>control.disabled=direct);
    }
    for(const row of $$("#item-form .two-columns")){row.hidden=[...row.children].every(label=>label.hidden);}
    $("#item-form .item-advanced-settings summary small").hidden=direct;
  }
  $("#item-management-mode").addEventListener("change",syncItemManagementForm);
  async function openItemForm(itemId = null, clone = false, communityContext = null, adminContext = null) {
    requireAuth(async () => { try {
      await Promise.all([refreshAccountSnapshot(),loadCategoryAliases()]); if(adminContext&&state.user?.role==="admin"){if(!state.myOrganizations.some(o=>o.id===adminContext.organization.id))state.myOrganizations.push(adminContext.organization);if(adminContext.item&&!state.dashboard.items.some(i=>i.id===adminContext.item.id))state.dashboard.items.push(adminContext.item)} const form = $("#item-form"); form.reset(); state.editingItemId = clone ? null : itemId; state.pendingCommunityItem=communityContext||null;
      const item = itemId ? (state.dashboard?.items || []).find(row => row.id === itemId) : null;
      const select = $("#item-gmach"); const organizations = state.myOrganizations.filter(org => ["approved", "pending"].includes(org.status) || org.id === item?.organization_id);
      select.innerHTML = '<option value="">בחירת גמ״ח</option>' + organizations.map(org => `<option value="${escapeHTML(org.id)}">${window.GmachOriginalName(org.name)}</option>`).join("");
      if (!organizations.length) { toast("כדי לפרסם פריט, פותחים קודם עמוד גמ״ח", "error"); openGmachForm(); return; }
      $("#item-form-title").textContent = clone ? "שכפול פריט" : item ? "עריכת פריט" : "מה תרצו להשאיל?"; $("#item-submit").textContent = item && !clone ? "שמירת שינויים" : "פרסום הפריט"; select.disabled = Boolean(item && !clone);if(adminContext&&!item)select.value=adminContext.organization.id;
      if (item) {
        select.value = item.organization_id; $("#item-name").value = clone ? `עותק של ${item.title || ""}`.slice(0,120) : item.title || ""; const categorySelect=$("#item-category"),savedCategory=item.category||""; categorySelect.value=[...categorySelect.options].some(option=>option.value===savedCategory)?savedCategory:""; $("#item-condition").value = ["חדש","כמו חדש","מצב טוב","מצב סביר","בלאי נראה לעין"].includes(displayCondition(item.condition))?displayCondition(item.condition):"מצב טוב";
        $("#item-quantity").value = item.quantity || 1; $("#item-description").value = item.description || ""; $("#item-conditions").value = item.loan_conditions || ""; $("#item-type").value=item.item_type||"loan"; updateItemSubcategories(item.subcategory||""); $("#item-tags").value=(item.tags||[]).join(", "); setLoanDuration("item-min-loan",item.min_loan_minutes||60); setLoanDuration("item-max-loan",item.max_loan_minutes||10080); setOptionalDuration("item-booking-notice",item.booking_notice_minutes||0); setOptionalDuration("item-turnaround",item.turnaround_minutes||0); setLoanDuration("item-booking-horizon",item.booking_horizon_minutes||Number(item.booking_horizon_days||365)*1440); $("#item-approval-mode").value=item.approval_mode||"manual"; $("#item-deposit-required").checked=Boolean(item.deposit_required); $("#item-deposit-amount-row").hidden=!item.deposit_required; $("#item-deposit-amount").value=(Number(item.deposit_amount_agorot||0)/100).toFixed(2); $("#item-publish-at").value=item.publish_at?String(item.publish_at).slice(0,16):""; $("#item-max-per-user").value=item.max_per_user||""; $("#item-preparation").value=item.preparation_minutes||0; $("#item-max-loan-days").value=item.max_loan_days||""; $("#item-service-radius").value=item.service_radius_km||""; $("#item-free").checked=false;
      } else { $("#item-quantity").value=1; $("#item-condition").value="מצב טוב"; setLoanDuration("item-min-loan",60); setLoanDuration("item-max-loan",10080); setOptionalDuration("item-booking-notice",0); setOptionalDuration("item-turnaround",0); setLoanDuration("item-booking-horizon",365*1440); $("#item-approval-mode").value="manual"; $("#item-deposit-required").checked=false; $("#item-deposit-amount-row").hidden=true; $("#item-deposit-amount").value=0; $("#item-publish-at").value=""; $("#item-max-per-user").value=""; $("#item-preparation").value=0; $("#item-max-loan-days").value=""; $("#item-service-radius").value=""; $("#item-free").checked=false; updateItemSubcategories(); if(state.pendingCommunityItem){$("#item-name").value=state.pendingCommunityItem.title||"";$("#item-description").value=(state.pendingCommunityItem.description||"").slice(0,1200);const category=state.pendingCommunityItem.category||"";if(category&&[...$("#item-category").options].some(option=>option.value===category)){$("#item-category").value=category;updateItemSubcategories();}} }
      $("#item-payment-mode").value=(item?.paymentMode||item?.payment_mode||"free");$("#item-cost-explanation").value=itemLoanCostExplanation(item||{});syncItemLoanCostForm();
      $("#item-management-mode").value=isDirectItem(item)?"direct":"managed";syncItemManagementForm();
      if (clone) toast("הפרטים הועתקו לטופס חדש. בדקו כמות וצרפו תמונות לפני הפרסום.");
      openDialog($("#item-form-dialog"));
    } catch (error) { toast(error.message || "לא הצלחנו לטעון את הגמ״חים שלך", "error"); } });
  }
  async function uploadItemImages(itemId, files) {
    if (!files.length) return []; if (files.length > 12) throw new Error("אפשר להעלות עד 12 תמונות"); const form = new FormData();
    for (const file of files) { if (file.size > 5 * 1024 * 1024) throw new Error("כל תמונה יכולה להיות עד 5MB"); if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("אפשר להעלות JPG, PNG או WebP בלבד"); form.append("images", file); }
    return api(`/api/items/${encodeURIComponent(itemId)}/images`, { method: "POST", body: form });
  }

  function organizeDashboardTools(){
    const actions=$("#dashboard-view .dashboard-actions"),details=$("#dashboard-more-tools"),list=$("#dashboard-more-tools-list");
    if(!actions||!details||!list)return;
    [...actions.children].forEach(child=>{
      if(child.id==="add-item-button"||child.id==="dashboard-add-gmach"||child.id==="dashboard-more-tools")return;
      if(child instanceof HTMLButtonElement)list.appendChild(child);
    });
    details.hidden=list.children.length===0;
  }
  function installDashboardToolOrganizer(){
    const actions=$("#dashboard-view .dashboard-actions");if(!actions||actions.dataset.toolsOrganizer==="1")return;
    actions.dataset.toolsOrganizer="1";organizeDashboardTools();
    new MutationObserver(organizeDashboardTools).observe(actions,{childList:true});
  }
  async function renderDashboardSaved(){
    const data=await api("/api/me/favorites-overview"),saved=data.saved||[];
    const groups={
      favorites:saved.filter(x=>x.type==="item"||x.type==="organization"),
      searches:saved.filter(x=>x.type==="search"),
      categories:saved.filter(x=>x.type==="category"),
      help:saved.filter(x=>x.type==="help_request")
    };
    const preview=list=>list.slice(0,3).map(x=>escapeHTML(x.label||"שמירה")).join(" · ");
    $("#dashboard-content").innerHTML=`<section class="dashboard-subsection"><div class="section-heading"><div><h2>השמורים שלי</h2><p>כל מה שסימנת כדי לחזור אליו במהירות.</p></div></div><div class="dashboard-saved-grid"><article class="dashboard-saved-card"><span class="saved-count">${groups.favorites.length}</span><h3>מועדפים</h3><p>${groups.favorites.length?preview(groups.favorites):"עוד לא שמרת פריטים או גמ״חים."}</p><button class="button button-secondary button-small" type="button" data-open-account-tab="favorites">פתיחת המועדפים</button></article><article class="dashboard-saved-card"><span class="saved-count">${groups.searches.length}</span><h3>חיפושים שמורים</h3><p>${groups.searches.length?preview(groups.searches):"שמרו חיפוש כדי לחזור לאותם סינונים."}</p><button class="button button-secondary button-small" type="button" data-open-account-tab="searches">פתיחת החיפושים</button></article><article class="dashboard-saved-card"><span class="saved-count">${groups.categories.length}</span><h3>קטגוריות שמורות</h3><p>${groups.categories.length?preview(groups.categories):"קטגוריות שתשמרו יופיעו כאן."}</p><button class="button button-secondary button-small" type="button" data-open-account-tab="categories">פתיחת הקטגוריות</button></article><article class="dashboard-saved-card"><span class="saved-count">${groups.help.length}</span><h3>בקשות קהילה שמורות</h3><p>${groups.help.length?preview(groups.help):"אין כרגע בקשות קהילה שמורות."}</p><button class="button button-secondary button-small" type="button" id="saved-open-community">לוח הבקשות</button></article></div></section>`;
    $$("[data-open-account-tab]",$("#dashboard-content")).forEach(button=>button.addEventListener("click",()=>window.GmachAccountCenter?.open(button.dataset.openAccountTab)));
    $("#saved-open-community")?.addEventListener("click",()=>openCommunityBoard(1));
  }

  async function showDashboard(tab = state.dashboardTab) {
    if (!state.user) { requireAuth(() => showDashboard(tab)); return; } if (state.user.role === "admin" && !state.user.twoFactorEnabled) tab = "profile"; else if (tab === "admin" && state.user.role !== "admin") tab = "requests"; state.dashboardTab = tab; $("#home-view").hidden = true; $("#organization-page-view").hidden = true; $("#dashboard-view").hidden = false; window.scrollTo({ top: 0, behavior: "auto" }); history.replaceState({route:"dashboard"}, "", "/dashboard"); $$('[data-dashboard-tab]').forEach(button => button.setAttribute("aria-selected", String(button.dataset.dashboardTab === tab))); $("#dashboard-content").innerHTML = '<div class="skeleton-card" aria-hidden="true"></div>';
    try { const data = await refreshAccountSnapshot(); $("#stat-requests").textContent = data.stats.activeRequests; $("#stat-items").textContent = data.stats.items; $("#stat-completed").textContent = data.stats.completed; if (tab === "requests") renderDashboardRequests(data.requests || []); if (tab === "items") renderDashboardItems(data.items || []); if (tab === "gmachim") renderDashboardOrganizations(data.organizations || []); if (tab === "saved") await renderDashboardSaved(); if (tab === "addresses") await renderAddresses(); if (tab === "sessions") await renderSessions(); if (tab === "searches") await renderSavedSearches(); if (tab === "profile") { await renderProfile(); if(state.user.role==="admin"&&!state.user.twoFactorEnabled){const panel=document.createElement("section");panel.className="dashboard-empty";panel.innerHTML=`<h2>אבטחת חשבון הנהלת האתר</h2><p>כדי להיכנס להנהלת האתר, סרקו קוד באפליקציית Authenticator והפעילו אימות דו שלבי.</p><button class="button button-primary" type="button" id="admin-enable-2fa">הפעלת אימות דו שלבי</button><div id="two-factor-setup"></div>`;$("#dashboard-content").prepend(panel);$("#admin-enable-2fa").addEventListener("click",beginTwoFactorSetup)}}; if (tab === "notifications") await renderNotificationPreferences(); if (tab === "admin") await renderAdmin(); organizeDashboardTools(); document.documentElement.classList.remove("route-dashboard-boot"); }
    catch (error) { document.documentElement.classList.remove("route-dashboard-boot"); console.error("Dashboard error", error); $("#dashboard-content").innerHTML = `<div class="dashboard-empty"><p>${escapeHTML(error.message || "לא הצלחנו לטעון את האזור האישי")}</p>${error.systemFault&&error.requestId?`<small>מספר תקלה לתמיכה: ${escapeHTML(error.requestId)}</small>`:""}<button class="button button-secondary" type="button" id="dashboard-support-error">פנייה לתמיכה עם פרטי התקלה</button></div>`;$("#dashboard-support-error")?.addEventListener("click",()=>openSupportForError(error,"תקלה בטעינת האזור האישי")); }
  }
  async function renderSessions() {
    const [{sessions = []},{events = []}] = await Promise.all([api("/api/me/sessions"),api("/api/me/security-events")]);
    $("#dashboard-content").innerHTML = `<section class="dashboard-subsection"><h2>מכשירים מחוברים</h2><p>אפשר לנתק מכשיר שאינכם מזהים. המכשיר הנוכחי יישאר מחובר.</p>${sessions.map(s => `<article class="dashboard-row"><div><strong>${escapeHTML(s.deviceLabel)}</strong><p>פעילות אחרונה: ${escapeHTML(formatDateTime(s.lastSeenAt))}</p><small>חובר: ${escapeHTML(formatDateTime(s.createdAt))} · תפוגה: ${escapeHTML(formatDateTime(s.expiresAt))}</small></div><div>${s.current ? '<span class="status-chip active">המכשיר הזה</span>' : `<button class="button button-secondary button-small" data-revoke-session="${escapeHTML(s.id)}">ניתוק</button>`}</div></article>`).join("") || "<p>לא נמצאו מכשירים מחוברים.</p>"}<h3>אירועי אבטחה אחרונים</h3>${events.map(e=>`<article class="dashboard-row"><div><strong>${escapeHTML(e.event_type)}</strong><p>${escapeHTML(formatDateTime(e.created_at))}</p></div><span class="status-chip">${escapeHTML(e.severity)}</span></article>`).join("")||"<p>אין אירועי אבטחה להצגה.</p>"}</section>`;
    $$('[data-revoke-session]').forEach(button => button.addEventListener("click", async () => { if (!translatedConfirm("לנתק את המכשיר הזה?")) return; try { await api(`/api/me/sessions/${encodeURIComponent(button.dataset.revokeSession)}`, {method:"DELETE"}); toast("המכשיר נותק"); await renderSessions(); } catch (e) { toast(e.message,"error"); } }));
  }
  function openAddressEditor(id,label,city){let d=$("#address-edit-dialog");if(!d){d=document.createElement("dialog");d.id="address-edit-dialog";d.className="modal";document.body.append(d)}d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>עריכת כתובת</h2><form id="address-edit-form" class="stack-form"><label>שם הכתובת<input name="label" maxlength="50" required value="${escapeHTML(label)}"></label><label>עיר או יישוב<input name="city" maxlength="80" required value="${escapeHTML(city)}"></label><label>כתובת מלאה חדשה <small>(רשות, השאירו ריק כדי לא לשנות)</small><input name="address" minlength="5" maxlength="180" autocomplete="street-address"></label><button class="button button-primary">שמירת שינויים</button></form>`;$(".dialog-close",d).onclick=()=>closeDialog(d);$("#address-edit-form",d).onsubmit=async e=>{e.preventDefault();const x=e.currentTarget,body={label:x.label.value,city:x.city.value};if(x.address.value.trim())body.address=x.address.value.trim();try{await api("/api/me/addresses/"+encodeURIComponent(id),{method:"PATCH",body});toast("הכתובת עודכנה");closeDialog(d);await renderAddresses()}catch(err){toast(err.message,"error")}};openDialog(d)}
  async function renderAddresses() {
    const {addresses = []} = await api("/api/me/addresses");
    $("#dashboard-content").innerHTML = `<section class="dashboard-subsection"><h2>כתובות פרטיות</h2><p>הכתובת המלאה שמורה באופן מוצפן ואינה מוצגת ברשימה.</p>${addresses.map(a => `<article class="dashboard-row"><div><strong>${escapeHTML(a.label)}${a.isDefault ? " · ברירת מחדל" : ""}</strong><p>${escapeHTML(a.city)}</p></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" data-edit-address="${escapeHTML(a.id)}" data-address-label="${escapeHTML(a.label)}" data-address-city="${escapeHTML(a.city)}">עריכה</button><button class="button button-secondary button-small" data-default-address="${escapeHTML(a.id)}" ${a.isDefault ? "disabled" : ""}>קביעה כברירת מחדל</button><button class="button button-secondary button-small" data-delete-address="${escapeHTML(a.id)}">מחיקה</button></div></article>`).join("") || "<p>עוד לא נשמרו כתובות.</p>"}<form id="account-address-form" class="form-grid"><h3>הוספת כתובת</h3><label>שם הכתובת<input name="label" required maxlength="50" placeholder="למשל: בית"></label><label>עיר או יישוב<input name="city" required maxlength="80"></label><label class="wide">כתובת מלאה<input name="address" required minlength="5" maxlength="180" autocomplete="street-address"></label><label class="check"><input type="checkbox" name="isDefault">ברירת מחדל</label><button class="button button-primary" type="submit">שמירת כתובת</button></form></section>`;
    $("#account-address-form").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget; const fields = new FormData(form); try { await api("/api/me/addresses", {method:"POST",body:{label:fields.get("label"),city:fields.get("city"),address:fields.get("address"),isDefault:fields.has("isDefault")}}); toast("הכתובת נשמרה"); await renderAddresses(); } catch(e){ toast(e.message,"error"); } });
    $$('[data-edit-address]').forEach(button=>button.addEventListener("click",()=>openAddressEditor(button.dataset.editAddress,button.dataset.addressLabel,button.dataset.addressCity)));
    $$('[data-default-address]').forEach(button => button.addEventListener("click", async () => { try { await api(`/api/me/addresses/${encodeURIComponent(button.dataset.defaultAddress)}`, {method:"PATCH",body:{isDefault:true}}); await renderAddresses(); } catch(e){toast(e.message,"error");} }));
    $$('[data-delete-address]').forEach(button => button.addEventListener("click", async () => { if (!translatedConfirm("למחוק את הכתובת?")) return; try { await api(`/api/me/addresses/${encodeURIComponent(button.dataset.deleteAddress)}`, {method:"DELETE"}); await renderAddresses(); } catch(e){toast(e.message,"error");} }));
  }
  async function renderSavedSearches() {
    const {searches = []} = await api("/api/me/saved-searches");
    $("#dashboard-content").innerHTML = `<section class="dashboard-subsection"><h2>חיפושים שמורים</h2>${searches.map(s => `<article class="dashboard-row"><strong>${escapeHTML(s.name)}</strong><div class="dashboard-row-actions"><button class="button button-primary button-small" data-run-search="${escapeHTML(s.id)}">הצגת תוצאות</button><button class="button button-secondary button-small" data-edit-search="${escapeHTML(s.id)}">עריכה</button><button class="button button-secondary button-small" data-delete-search="${escapeHTML(s.id)}">מחיקה</button></div></article>`).join("") || "<p>אין חיפושים שמורים.</p>"}<form id="save-current-search" class="form-grid"><label>שם החיפוש<input name="name" required maxlength="80" placeholder="למשל: ציוד לתינוק בתל אביב"></label><button class="button button-primary" type="submit">שמירת הסינון הנוכחי</button></form></section>`;
    $("#save-current-search").addEventListener("submit", async event => { event.preventDefault(); try { const name = new FormData(event.currentTarget).get("name"); await api("/api/me/saved-searches", {method:"POST",body:{name,filters:{query:$("#search-input").value,city:$("#city-filter").value,category:state.activeCategory || $("#category-filter").value,subcategory:$("#subcategory-filter")?.value||"",condition:$("#condition-filter").value,availableOnly:$("#available-only").checked}}}); toast("החיפוש נשמר"); await renderSavedSearches(); } catch(e){toast(e.message,"error");} });
    $$('[data-run-search]').forEach(button => button.addEventListener("click", () => { const f = searches.find(s => s.id === button.dataset.runSearch)?.filters || {}; $("#search-input").value = f.query || ""; $("#city-filter").value = f.city || ""; state.activeCategory = f.category || ""; $("#category-filter").value = f.category || ""; updateCatalogSubcategories(f.subcategory||""); $("#condition-filter").value = f.condition || ""; $("#available-only").checked = Boolean(f.availableOnly); showHome(); applyFilters(); $("#catalog").scrollIntoView({behavior:"smooth"}); }));
    $$('[data-edit-search]').forEach(button => button.addEventListener("click", async () => { const s=searches.find(x=>x.id===button.dataset.editSearch);if(!s)return;const name=translatedPrompt("שם החיפוש",s.name);if(!name)return;const notify=translatedConfirm("לקבל התראה כשנוסף פריט מתאים?");try{await api("/api/me/saved-searches/"+encodeURIComponent(s.id),{method:"PATCH",body:{name,filters:s.filters||{},notify}});toast("החיפוש השמור עודכן");await renderSavedSearches()}catch(e){toast(e.message,"error")} }));
    $$('[data-delete-search]').forEach(button => button.addEventListener("click", async () => { try { await api(`/api/me/saved-searches/${encodeURIComponent(button.dataset.deleteSearch)}`, {method:"DELETE"}); await renderSavedSearches(); } catch(e){toast(e.message,"error");} }));
  }
  async function renderProfile() {
    const {profile: p} = await api("/api/me/profile");
    $("#dashboard-content").innerHTML = `<section class="dashboard-subsection"><h2>הפרטים שלי</h2><form id="account-profile-form" class="form-grid"><label>שם מלא<input name="fullName" required maxlength="80" value="${escapeHTML(p.fullName || "")}"></label><label>טלפון<input name="phone" required inputmode="tel" value="${escapeHTML(p.phone || "")}"></label><label>עיר או יישוב<input name="city" required maxlength="80" value="${escapeHTML(p.city || "")}"></label><label>אפליקציית ניווט מועדפת<select name="preferredNavigation"><option value="google" ${p.preferredNavigation==="google"?"selected":""}>Google Maps</option><option value="waze" ${p.preferredNavigation==="waze"?"selected":""}>Waze</option><option value="apple" ${p.preferredNavigation==="apple"?"selected":""}>Apple Maps</option></select></label><label class="check"><input name="operationalEmails" type="checkbox" ${p.operationalEmails ? "checked" : ""}>עדכונים על פעולות באתר</label><label class="check"><input name="communityEmails" type="checkbox" ${p.communityEmails ? "checked" : ""}>עדכונים מהקהילה</label><button class="button button-primary" type="submit">שמירת פרטים</button></form>${p.deletionRequestedAt ? '<button id="cancel-account-deletion" class="button button-secondary" type="button">ביטול בקשת מחיקת החשבון</button>' : ""}</section>`;
    $("#account-profile-form").addEventListener("submit", async event => { event.preventDefault(); const f = new FormData(event.currentTarget); try { const result = await api("/api/me/profile", {method:"PATCH",body:{fullName:f.get("fullName"),phone:f.get("phone"),city:f.get("city"),preferredLanguage:p.preferredLanguage,preferredNavigation:f.get("preferredNavigation"),operationalEmails:f.has("operationalEmails"),communityEmails:f.has("communityEmails")}}); state.user = {...state.user,...result.profile}; toast("הפרטים נשמרו"); await renderProfile(); } catch(e){toast(e.message,"error");} });
    $("#cancel-account-deletion")?.addEventListener("click", async () => { try { await api("/api/me/account/cancel-deletion", {method:"POST",body:{}}); toast("בקשת המחיקה בוטלה"); await renderProfile(); } catch(e){toast(e.message,"error");} });
  }
  async function renderNotificationPreferences() {
    const {preferences = []} = await api("/api/me/notification-preferences");
    const types = [{key:"status",label:"עדכוני השאלה"},{key:"message",label:"הודעות בשיחות"},{key:"reminder",label:"תזכורות"},{key:"waitlist",label:"רשימת המתנה"},{key:"community",label:"בקשות קהילה"}];
    $("#dashboard-content").innerHTML = `<section class="dashboard-subsection"><h2>העדפות התראות</h2><p>התראות חשובות על השאלות נשמרות גם באתר.</p><form id="notification-preferences-form" class="form-grid">${types.map(t => { const v = preferences.find(p => p.notification_type === t.key) || {}; return `<fieldset class="wide"><legend>${t.label}</legend><label class="check"><input type="checkbox" data-pref="${t.key}" data-channel="inApp" ${v.in_app !== 0 ? "checked" : ""}>באתר</label><label class="check"><input type="checkbox" data-pref="${t.key}" data-channel="email" ${v.email === 1 ? "checked" : ""}>באימייל</label><label class="check"><input type="checkbox" data-pref="${t.key}" data-channel="push" ${v.push === 1 ? "checked" : ""}>Push</label><label>תדירות<select data-pref="${t.key}" data-channel="digest"><option value="immediate" ${v.digest!=="daily"?"selected":""}>מיידי</option><option value="daily" ${v.digest==="daily"?"selected":""}>סיכום יומי</option></select></label><label>שקט מ<input type="time" data-pref="${t.key}" data-channel="quietStart" value="${escapeHTML(v.quiet_start||"")}"></label><label>עד<input type="time" data-pref="${t.key}" data-channel="quietEnd" value="${escapeHTML(v.quiet_end||"")}"></label></fieldset>`; }).join("")}<button class="button button-primary" type="submit">שמירת העדפות</button></form></section>`;
    $("#notification-preferences-form").addEventListener("submit", async event => { event.preventDefault(); const form = event.currentTarget; const rows = types.map(t => ({type:t.key,inApp:Boolean(form.querySelector(`[data-pref="${t.key}"][data-channel="inApp"]`)?.checked),email:Boolean(form.querySelector(`[data-pref="${t.key}"][data-channel="email"]`)?.checked),push:Boolean(form.querySelector(`[data-pref="${t.key}"][data-channel="push"]`)?.checked),digest:form.querySelector(`[data-pref="${t.key}"][data-channel="digest"]`)?.value||"immediate",quietStart:form.querySelector(`[data-pref="${t.key}"][data-channel="quietStart"]`)?.value||null,quietEnd:form.querySelector(`[data-pref="${t.key}"][data-channel="quietEnd"]`)?.value||null})); try { await api("/api/me/notification-preferences", {method:"PUT",body:{preferences:rows}}); toast("ההעדפות נשמרו"); } catch(e){toast(e.message,"error");} });
  }
  function calendarUrl(provider,title,start,end,details){const s=new Date(start).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z"),e=new Date(end).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");if(provider==="google")return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(title)+"&dates="+s+"/"+e+"&details="+encodeURIComponent(details||"");if(provider==="outlook")return "https://outlook.live.com/calendar/0/deeplink/compose?subject="+encodeURIComponent(title)+"&startdt="+encodeURIComponent(new Date(start).toISOString())+"&enddt="+encodeURIComponent(new Date(end).toISOString())+"&body="+encodeURIComponent(details||"");return null}
  async function openCalendarMenu(requestId){const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId));if(!row){toast("לא הצלחנו למצוא את ההשאלה","error");return}if(!row.requested_from||!row.requested_until||Number.isNaN(Date.parse(row.requested_from))||Number.isNaN(Date.parse(row.requested_until))){toast("להשאלה הזו עדיין אין מועדי איסוף והחזרה תקינים","error");return}let d=$("#calendar-action-dialog");if(!d){d=document.createElement("dialog");d.id="calendar-action-dialog";d.className="modal";document.body.append(d)}const title=(row.items?.title||"השאלה")+" - גמ״ח ברגע",pickupEnd=new Date(new Date(row.requested_from).getTime()+30*60000).toISOString(),returnEnd=new Date(new Date(row.requested_until).getTime()+30*60000).toISOString(),gp=calendarUrl("google","איסוף: "+title,row.requested_from,pickupEnd,row.items?.organizations?.name||""),gr=calendarUrl("google","החזרה: "+title,row.requested_until,returnEnd,row.items?.organizations?.name||""),op=calendarUrl("outlook","איסוף: "+title,row.requested_from,pickupEnd,row.items?.organizations?.name||""),or=calendarUrl("outlook","החזרה: "+title,row.requested_until,returnEnd,row.items?.organizations?.name||"");d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>הוספה ליומן</h2><p>בחרו יומן. אירועי האיסוף וההחזרה נשמרים בנפרד.</p><div class="dashboard-row-actions"><a class="button button-primary" target="_blank" rel="noopener" href="${escapeHTML(gp)}">Google - איסוף</a><a class="button button-primary" target="_blank" rel="noopener" href="${escapeHTML(gr)}">Google - החזרה</a><a class="button button-secondary" target="_blank" rel="noopener" href="${escapeHTML(op)}">Outlook - איסוף</a><a class="button button-secondary" target="_blank" rel="noopener" href="${escapeHTML(or)}">Outlook - החזרה</a><a class="button button-secondary" href="/api/loan-requests/${encodeURIComponent(requestId)}/calendar.ics" download>Apple / ICS - שני האירועים</a></div>`;$(".dialog-close",d).onclick=()=>closeDialog(d);openDialog(d)}
  function requestProgress(row){
    const status=row.workflow_status==="no_show"?"no_show":row.status;
    const stopped=["declined","cancelled","no_show"].includes(status),stages=["בקשה","אושרה","נאסף","הוחזר"];
    const index=status==="returned"?4:status==="collected"?3:status==="approved"?2:status==="pending"?1:0;
    const label=status==="returned"?"ההשאלה הושלמה":status==="collected"?"המשתמש אסף · ממתין להחזרה":status==="approved"?"הבקשה אושרה · ממתין לאיסוף":status==="pending"?"ממתין לאישור הגמ״ח":status==="declined"?"הבקשה נדחתה":status==="no_show"?"אי-הגעה":"הבקשה בוטלה";
    if(stopped)return `<div class="loan-progress loan-progress-stopped" aria-label="מצב ההשאלה"><strong>${escapeHTML(label)}</strong></div>`;
    return `<div class="loan-progress" aria-label="התקדמות ההשאלה: ${escapeHTML(label)}"><div class="loan-progress-track" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="${index}"><span style="width:${index*25}%"></span></div><div class="loan-progress-stages">${stages.map((stage,i)=>`<span class="${i<index?"is-done":""}">${stage}</span>`).join("")}</div><small>${escapeHTML(label)}</small></div>`;
  }
  function requestActions(row) {
    let actions = `<button class="button button-secondary button-small" data-open-chat="${escapeHTML(row.id)}">שיחה</button><button class="button button-secondary button-small" data-calendar-request="${escapeHTML(row.id)}">הוספה ליומן</button>`;
    if (row.direction === "incoming" && row.status === "pending") actions += `<button class="button button-primary button-small" data-request-decision="approved" data-request-id="${escapeHTML(row.id)}">אישור</button><button class="button button-secondary button-small" data-request-decision="declined" data-request-id="${escapeHTML(row.id)}">דחייה</button>`;
    if (row.direction === "incoming" && row.status === "approved") actions += `<button class="button button-secondary button-small" data-pickup-request="${escapeHTML(row.id)}">הקצאת יחידות</button><button class="button button-primary button-small" data-confirm-collected="${escapeHTML(row.id)}">אישור איסוף</button><button class="button button-secondary button-small" data-no-show="${escapeHTML(row.id)}">אי-הגעה</button>`;
    if (row.direction === "incoming" && row.status === "approved") actions += `<button class="button button-secondary button-small" data-manager-cancel="${escapeHTML(row.id)}">ביטול מצד הגמ״ח</button>`;
    if (row.direction === "incoming" && row.status === "collected") actions += `<button class="button button-primary button-small" data-return-request="${escapeHTML(row.id)}">מסך החזרה</button>`;
    if (["pending","approved"].includes(row.status)) actions += `<button class="button button-secondary button-small" data-loan-flow="${escapeHTML(row.id)}" data-direction="${escapeHTML(row.direction)}">תיאום וציר זמן</button><button class="button button-secondary button-small" data-branch-proposal="${escapeHTML(row.id)}">סניף איסוף חלופי</button>`
    if (row.direction === "outgoing" && ["pending","approved"].includes(row.status)) actions += `<button class="button button-secondary button-small" data-change-request="${escapeHTML(row.id)}">שינוי בקשה</button><button class="button button-secondary button-small" data-request-action="cancelled" data-request-id="${escapeHTML(row.id)}">ביטול בקשה</button>`;
    if(row.direction==="outgoing"&&row.status==="cancelled"&&row.cancellation_undo_until&&Date.parse(row.cancellation_undo_until)>Date.now()) actions += `<button class="button button-primary button-small" data-undo-cancel="${escapeHTML(row.id)}">ביטול הביטול</button>`;
    if (row.direction === "outgoing" && ["approved","collected"].includes(row.status)) actions += `<button class="button button-secondary button-small" data-extension-request="${escapeHTML(row.id)}">בקשת הארכה</button>`;
    if(row.direction==="outgoing"&&row.workflow_status==="pickup_expired") actions += `<button class="button button-primary button-small" data-pickup-expiry="wait" data-workflow-state="pickup-expired" data-request-id="${escapeHTML(row.id)}">להמתין לתיאום חדש</button><button class="button button-secondary button-small" data-pickup-expiry="cancel" data-request-id="${escapeHTML(row.id)}">לבטל את הבקשה</button>`;
    if (row.direction === "incoming" && row.extension_status === "pending") actions += `<button class="button button-primary button-small" data-extension-decision="approved" data-request-id="${escapeHTML(row.id)}">אישור הארכה</button><button class="button button-secondary button-small" data-extension-alternative="${escapeHTML(row.id)}">הצעת מועד חלופי</button><button class="button button-secondary button-small" data-extension-decision="declined" data-request-id="${escapeHTML(row.id)}">דחיית הארכה</button>`;
    if(row.direction==="incoming"&&row.change_pending_json) actions += `<button class="button button-primary button-small" data-change-decision="approved" data-request-id="${escapeHTML(row.id)}">אישור שינוי</button><button class="button button-secondary button-small" data-change-decision="declined" data-request-id="${escapeHTML(row.id)}">דחיית שינוי</button>`;
    if (row.direction === "outgoing" && row.status === "returned") actions += `<button class="button button-primary button-small" data-review-request="${escapeHTML(row.id)}">כתיבת ביקורת</button>`;
    if(["approved","collected","returned"].includes(row.status))actions+=`<button class="button button-secondary button-small" data-request-contact="${escapeHTML(row.id)}">${escapeHTML(pickupText("פרטי קשר ופנייה","Contact options"))}</button>`;
    return actions;
  }
  async function openPickupScreen(requestId){
    const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId));
    try{
      const data=await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/units");
      let d=$("#pickup-screen-dialog");
      if(!d){d=document.createElement("dialog");d.id="pickup-screen-dialog";d.className="modal modal-wide";document.body.append(d)}
      d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>הקצאת יחידות</h2><div class="dashboard-row"><div><strong>${escapeHTML(row?.items?.title||"פריט")}</strong><p>${window.GmachOriginalName(row?.borrower_name||"שואל/ת")} · <span dir="ltr">${escapeHTML(row?.borrower_phone||"")}</span></p><p>${escapeHTML(formatDateTime(row?.requested_from))} עד ${escapeHTML(formatDateTime(row?.requested_until))} · כמות ${Number(row?.quantity||1)}</p></div></div><h3>בחרו את היחידות שיימסרו בפועל</h3><div>${(data.units||[]).map(u=>`<label class="dashboard-row"><span><input type="checkbox" name="pickup-unit" value="${escapeHTML(u.id)}" ${u.assigned?"checked":""}> ${escapeHTML(u.serial_number)}</span><span>${escapeHTML(u.condition||u.status)}</span></label>`).join("")||"<p>למוצר אין יחידות סידוריות.</p>"}</div><p class="platform-note">שמירת ההקצאה אינה מאשרת איסוף. אישור האיסוף נעשה בנפרד מרשימת הבקשות.</p><div class="dashboard-row-actions">${(data.units||[]).length?'<button class="button button-primary" id="save-pickup-units">שמירת הקצאת יחידות</button>':""}</div>`;
      $(".dialog-close",d).onclick=()=>closeDialog(d);
      const selectedUnits=()=>$$('input[name="pickup-unit"]:checked',d).map(x=>x.value);
      $("#save-pickup-units",d)?.addEventListener("click",async()=>{
        try{
          await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/assign-units",{method:"POST",body:{unitIds:selectedUnits()}});
          toast("הקצאת היחידות נשמרה");
          closeDialog(d);
          await refreshAccountSnapshot();
          showDashboard("requests");
        }catch(error){toast(error.message,"error")}
      });
      openDialog(d);
    }catch(e){toast(e.message,"error")}
  }
  async function openReturnScreen(requestId){const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId));try{const unitData=await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/units");const assigned=(unitData.units||[]).filter(u=>u.assigned);let d=$("#return-screen-dialog");if(!d){d=document.createElement("dialog");d.id="return-screen-dialog";d.className="modal";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>מסך החזרה</h2><p><strong>${escapeHTML(row?.items?.title||"פריט")}</strong></p>${assigned.length?`<h3>היחידות שצריכות לחזור</h3><div>${assigned.map(u=>`<article class="dashboard-row"><strong dir="ltr">${escapeHTML(u.serial_number)}</strong><span>${escapeHTML(u.condition||"")}</span></article>`).join("")}</div>`:""}<p>לאחר האישור היחידות ישוחררו למלאי ורשימת ההמתנה תתקדם אוטומטית.</p><label>הערת החזרה<textarea id="return-note" maxlength="500"></textarea></label><button class="button button-primary" id="confirm-return">אישור שהמשתמש החזיר</button>`;$(".dialog-close",d).onclick=()=>closeDialog(d);$("#confirm-return",d).onclick=async event=>{const button=event.currentTarget;setButtonBusy(button,true,"מאשרים…");try{await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/status",{method:"PATCH",body:{status:"returned",managerNote:$("#return-note",d).value}});toast("אושר שהמשתמש החזיר את הפריט. ההשאלה הושלמה.");closeDialog(d);await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message||"לא הצלחנו לאשר את ההחזרה","error")}finally{setButtonBusy(button,false)}};openDialog(d)}catch(e){toast(e.message,"error")}}
  function accountTourKey(){return "gmach-account-tour-dismissed:"+(state.user?.id||"guest")}
  function openAccountTour(){window.GmachStartAccountTour?.({manual:true,userId:state.user?.id})}
  function maybeShowAccountTour(isNewAccount){if(isNewAccount)setTimeout(()=>window.GmachStartAccountTour?.({userId:state.user?.id}),0)}
  function renderDashboardRequests(requests) {
    const now=Date.now(),outgoing=requests.filter(r=>r.direction==="outgoing"),nextLoan=outgoing.filter(r=>["approved","collected"].includes(r.status)&&Date.parse(r.requested_until)>=now).sort((a,b)=>Date.parse(a.requested_from)-Date.parse(b.requested_from))[0],returns=outgoing.filter(r=>r.status==="collected").sort((a,b)=>Date.parse(a.requested_until)-Date.parse(b.requested_until)),needsAction=requests.filter(r=>(r.direction==="incoming"&&(r.status==="pending"||r.extension_status==="pending"||r.change_pending_json))||(r.direction==="outgoing"&&r.workflow_status==="pickup_time_proposed"));
    const priority=`<section class="dashboard-subsection dashboard-priority"><div class="section-heading"><div><h2>מה דורש תשומת לב</h2><p>הפעולות הקרובות והחשובות ביותר.</p></div></div><div class="admin-overview"><article><strong>${nextLoan?escapeHTML(nextLoan.items?.title||"השאלה קרובה"):"אין"}</strong><span>${nextLoan?"ההשאלה הקרובה · "+escapeHTML(formatDateTime(nextLoan.requested_from)):"אין השאלה קרובה"}</span></article><article><strong>${returns.length}</strong><span>פריטים שממתינים להחזרה</span></article><article><strong>${needsAction.length}</strong><span>בקשות שממתינות לפעולה שלך</span></article><article><strong>${(state.dashboard?.helpRequests||[]).filter(x=>x.status==="open").length}</strong><span>בקשות קהילה פתוחות</span></article></div></section>`;
    const requestRows = requests.length ? requests.map(row => `<article class="dashboard-row"><div><h3>${escapeHTML(row.items?.title || "פריט")}</h3><p>${row.direction === "incoming" ? `בקשה מאת ${window.GmachOriginalName(row.borrower_name || "שואל/ת")}` : "בקשה ששלחתי"} · ${escapeHTML(row.items?.organizations?.name || "גמ״ח")}</p>${row.note ? `<p class="dashboard-note">${escapeHTML(row.note)}</p>` : ""}${row.manager_note ? `<p class="dashboard-note"><strong>הודעת מנהל:</strong> ${escapeHTML(row.manager_note)}</p>` : ""}${row.borrower_phone ? `<p class="contact-detail" dir="ltr">${escapeHTML(row.borrower_phone)}</p>` : ""}${row.contact_phone ? `<p class="contact-detail">טלפון הגמ״ח: <span dir="ltr">${escapeHTML(row.contact_phone)}</span></p>` : ""}${row.pickup_address ? `<p class="contact-detail"><strong>${escapeHTML(pickupText("כתובת איסוף:","Pickup address:"))}</strong> ${escapeHTML(row.pickup_address)}</p>`:""}${row.branch_name ? `<p class="contact-detail"><strong>סניף איסוף:</strong> ${window.GmachOriginalName(row.branch_name)}${row.branch_city?` · ${escapeHTML(row.branch_city)}`:""}${["approved","collected","returned"].includes(row.status)&&row.branch_address?` · ${escapeHTML(row.branch_address)}`:""}</p>` : ""}${requestProgress(row)}</div><div><span class="status-chip ${escapeHTML(row.workflow_status==="no_show"?"cancelled":row.status)}">${escapeHTML(row.workflow_status==="no_show"?"אי-הגעה":(STATUS_LABELS[row.status] || row.status))}</span><p>${escapeHTML(formatDateTime(row.requested_from))} — ${escapeHTML(formatDateTime(row.requested_until))}</p></div><div class="dashboard-row-actions">${requestActions(row)}</div></article>`).join("") : '<div class="dashboard-empty"><strong>עוד אין כאן בקשות</strong><p>כשתבקשו פריט או תקבלו בקשה לגמ״ח שלכם, היא תופיע כאן.</p></div>';
    const helpRows=(state.dashboard?.helpRequests||[]).map(row=>`<article class="dashboard-row"><div><h3>${row.urgency==="urgent"?"🔴 ":""}${escapeHTML(row.title)}</h3><p>${escapeHTML(row.city)} · ${escapeHTML(row.category||"כללי")}${row.distance_km?` · עד ${Number(row.distance_km)} ק״מ`:""}${row.requested_until?` · עד ${escapeHTML(formatDateTime(row.requested_until))}`:""}</p></div><div><span class="status-chip ${escapeHTML(row.status)}">${escapeHTML(row.status==="open"?"פתוחה":row.status)}</span><button class="button button-secondary button-small" data-help-offers="${escapeHTML(row.id)}">הצעות</button><button class="button button-secondary button-small" data-help-matches="${escapeHTML(row.id)}">התאמות חכמות</button></div></article>`).join("");
    const isNewAccount=!(state.dashboard?.chatRequests||[]).length&&!requests.length&&!(state.dashboard?.items||[]).length&&!(state.dashboard?.organizations||[]).length&&!(state.dashboard?.helpRequests||[]).length;
    const startPanel=isNewAccount?`<section class="dashboard-subsection account-start"><h2>מתחילים מכאן</h2><p>אפשר למצוא ציוד, לפרסם בקשת עזרה או לפתוח גמ"ח ראשון.</p><div class="dashboard-row-actions"><button class="button button-primary" id="account-start-search">חיפוש ציוד</button><button class="button button-secondary" id="account-start-nearby">גמ"חים קרובים</button><button class="button button-secondary" id="account-start-help">פרסום בקשת עזרה</button><button class="button button-secondary" id="account-start-gmach">פתיחת גמ"ח</button><button class="button button-secondary" id="account-start-tour">סיור קצר</button></div></section>`:"";
    const recent=(state.dashboard?.recentlyViewedOrganizations||[]);
    const recentPanel=recent.length?`<section class="dashboard-subsection"><h2>גמ"חים שנצפו לאחרונה</h2><div class="mini-items">${recent.map(org=>`<button type="button" data-recent-org="${escapeHTML(org.organization_id)}"><strong class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</strong><span>${escapeHTML(org.city||"")} · ${Number(org.item_count||0)} ${Number(org.item_count||0) === 1 ? "פריט" : "פריטים"}</span></button>`).join("")}</div></section>`:"";
    $("#dashboard-content").innerHTML = `${startPanel}${priority}${requestRows}<section class="dashboard-subsection"><div class="section-heading"><div><h2>בקשות העזרה שלי</h2></div><button class="button button-secondary button-small" id="dashboard-help-request">בקשה חדשה</button></div>${helpRows||'<p>אין בקשות עזרה פתוחות.</p>'}</section>${recentPanel}`;
    $("#account-start-search")?.addEventListener("click",()=>{showHome();$("#search-input").focus();});
    $("#account-start-nearby")?.addEventListener("click",openNearbyGmachs);
    $("#account-start-help")?.addEventListener("click",openHelpRequest);
    $("#account-start-gmach")?.addEventListener("click",()=>openGmachForm());
    renderOrganizationChatRequests();
    $("#account-start-tour")?.addEventListener("click",openAccountTour);
    maybeShowAccountTour(isNewAccount);
    $$("[data-recent-org]").forEach(button=>button.addEventListener("click",()=>openOrganization(button.dataset.recentOrg)));
    $$('[data-request-action]').forEach(button => button.addEventListener("click", () => updateRequestStatus(button.dataset.requestId, button.dataset.requestAction)));
    $$('[data-pickup-request]').forEach(button=>button.addEventListener("click",()=>openPickupScreen(button.dataset.pickupRequest)));
    $$('[data-confirm-collected]').forEach(button=>button.addEventListener("click",async()=>{
      if(!translatedConfirm("לאשר שהמשתמש אסף את הפריט?"))return;
      try{
        await api("/api/loan-requests/"+encodeURIComponent(button.dataset.confirmCollected)+"/status",{method:"PATCH",body:{status:"collected"}});
        toast("אושר שהמשתמש אסף את הפריט");
        await refreshAccountSnapshot();
        showDashboard("requests");
      }catch(e){toast(e.message,"error")}
    }));
    $$('[data-return-request]').forEach(button=>button.addEventListener("click",()=>openReturnScreen(button.dataset.returnRequest)));
    $$('[data-no-show]').forEach(button=>button.addEventListener("click",async()=>{if(!translatedConfirm("לסמן את השואל/ת כאי-הגעה? הפעולה תשחרר את המלאי ותעדכן את רשימת ההמתנה."))return;await updateRequestStatus(button.dataset.noShow,"no_show")}));
    $$('[data-manager-cancel]').forEach(button=>button.addEventListener("click",async()=>{const reason=translatedPrompt("סיבת הביטול שתישלח לשואל/ת:");if(!reason)return;await updateRequestStatus(button.dataset.managerCancel,"cancelled",reason)}));
    $$('[data-request-decision]').forEach(button => button.addEventListener("click", () => openDecision(button.dataset.requestId, button.dataset.requestDecision)));
    $$('[data-change-request]').forEach(button=>button.addEventListener("click",()=>openLoanChange(button.dataset.changeRequest)));
    $$('[data-undo-cancel]').forEach(button=>button.addEventListener("click",async()=>{try{await api("/api/loan-requests/"+encodeURIComponent(button.dataset.undoCancel)+"/undo-cancel",{method:"POST",body:{}});toast("הבקשה שוחזרה");await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message,"error")}}));
    $$('[data-change-decision]').forEach(button=>button.addEventListener("click",async()=>{try{await api("/api/loan-requests/"+encodeURIComponent(button.dataset.requestId)+"/change/respond",{method:"POST",body:{accept:button.dataset.changeDecision==="approved"}});toast(button.dataset.changeDecision==="approved"?"השינוי אושר":"השינוי נדחה");await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message,"error")}}));
    $$("[data-pickup-expiry]").forEach(b=>b.onclick=async()=>{try{await api("/api/loan-requests/"+encodeURIComponent(b.dataset.requestId)+"/pickup-expiry/respond",{method:"POST",body:{action:b.dataset.pickupExpiry}});toast(b.dataset.pickupExpiry==="wait"?"נשלחה בקשה לתיאום איסוף חדש":"הבקשה בוטלה");await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message,"error")}}); $$("[data-branch-proposal]").forEach(b=>b.addEventListener("click",()=>openBranchProposal(b.dataset.branchProposal)));
    $$('[data-extension-decision]').forEach(button=>button.addEventListener("click",async()=>{try{await api("/api/loan-requests/"+encodeURIComponent(button.dataset.requestId)+"/extension/respond",{method:"POST",body:{accept:button.dataset.extensionDecision==="approved"}});toast(button.dataset.extensionDecision==="approved"?"ההארכה אושרה":"ההארכה נדחתה");await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message,"error")}}));
    $$('[data-extension-alternative]').forEach(button=>button.addEventListener("click",async()=>{const value=translatedPrompt("מועד החזרה חלופי, לדוגמה 2026-10-01T18:00");if(!value)return;try{await api("/api/loan-requests/"+encodeURIComponent(button.dataset.extensionAlternative)+"/extension/respond",{method:"POST",body:{accept:false,alternativeUntil:new Date(value).toISOString()}});toast("המועד החלופי נשלח");await refreshAccountSnapshot();showDashboard("requests")}catch(e){toast(e.message,"error")}}));
    $$("[data-request-contact]").forEach(button=>button.onclick=()=>openRequestContact(button.dataset.requestContact));
    $$('[data-open-chat]').forEach(button => button.addEventListener("click", () => openChat(button.dataset.openChat))); $$('[data-calendar-request]').forEach(button=>button.addEventListener("click",()=>openCalendarMenu(button.dataset.calendarRequest))); $$('[data-loan-flow]').forEach(button=>button.addEventListener("click",()=>openLoanFlow(button.dataset.loanFlow,button.dataset.direction))); $$('[data-extension-request]').forEach(button=>button.addEventListener("click",()=>openExtensionRequest(button.dataset.extensionRequest)));
    $$('[data-review-request]').forEach(button => button.addEventListener("click", () => openReview(button.dataset.reviewRequest))); $("#dashboard-help-request")?.addEventListener("click",openHelpRequest); $$("[data-help-offers]").forEach(b=>b.addEventListener("click",()=>openHelpOffers(b.dataset.helpOffers))); $$("[data-help-matches]").forEach(b=>b.addEventListener("click",()=>openHelpMatches(b.dataset.helpMatches)));
  }
  async function openNearbyGmachs(){
    if(!navigator.geolocation){toast("המכשיר אינו מאפשר קבלת מיקום. אפשר לחפש לפי עיר.","error");showHome();$("#city-filter")?.focus();return;}
    toast("מבקשים את המיקום רק כדי למצוא גמ״חים קרובים");
    navigator.geolocation.getCurrentPosition(async position=>{
      try{
        const data=await api("/api/search/nearby?lat="+encodeURIComponent(position.coords.latitude)+"&lon="+encodeURIComponent(position.coords.longitude)+"&radius=30");
        const distinct=[];const seen=new Set();
        for(const row of data.results||[]){if(seen.has(row.organization_id))continue;seen.add(row.organization_id);distinct.push(row);if(distinct.length>=10)break;}
        let d=$("#nearby-gmachs-dialog");if(!d){d=document.createElement("dialog");d.id="nearby-gmachs-dialog";d.className="modal modal-wide";document.body.append(d)}
        d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>גמ"חים קרובים</h2><p>המיקום משמש לחיפוש הזה בלבד ואינו נשמר.</p>${distinct.map(row=>`<article class="dashboard-row"><div><strong>${window.GmachOriginalName(row.organization_name)}</strong><p>${window.GmachOriginalName(row.branch_name||row.branch_city||row.city||"")} · ${Number(row.distanceKm||0).toFixed(1)} ק"מ</p></div><button class="button button-primary button-small" data-nearby-org="${escapeHTML(row.organization_id)}">צפייה בגמ"ח</button></article>`).join("")||"<p>לא נמצאו גמ״חים עם נקודת איסוף פעילה בטווח של 30 ק״מ.</p>"}`;
        $(".dialog-close",d).onclick=()=>closeDialog(d);
        $$("[data-nearby-org]",d).forEach(button=>button.onclick=()=>{closeDialog(d);openOrganization(button.dataset.nearbyOrg)});
        openDialog(d);
      }catch(error){toast(error.message||"לא הצלחנו למצוא גמ״חים קרובים","error")}
    },()=>{toast("לא ניתנה הרשאת מיקום. אפשר לחפש לפי עיר.","error");showHome();$("#city-filter")?.focus();},{enableHighAccuracy:false,timeout:8000,maximumAge:60000});
  }

  async function openHelpMatches(helpRequestId){try{const data=await api("/api/help-requests/"+encodeURIComponent(helpRequestId)+"/matches"),matches=data.matches||[];let d=$("#help-matches-dialog");if(!d){d=document.createElement("dialog");d.id="help-matches-dialog";d.className="modal modal-wide";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>מוצרים מתאימים לבקשה</h2><div class="dashboard-row-actions"><button class="button button-secondary" type="button" data-create-help-item>הוספת מוצר חדש וקישור לבקשה</button></div>${matches.map(x=>`<article class="dashboard-row"><div><strong>${escapeHTML(x.title)}</strong><p>${window.GmachOriginalName(x.organization_name)} · ${escapeHTML(x.city||"")} · ציון התאמה ${Number(x.score||0)}</p></div><button class="button button-primary button-small" data-offer-match="${escapeHTML(x.item_id)}">הצעת המוצר</button></article>`).join("")||"<p>לא נמצאו כרגע מוצרים מתאימים.</p>"}`;$(".dialog-close",d).onclick=()=>closeDialog(d);$$("[data-offer-match]",d).forEach(b=>b.onclick=async()=>{const message=translatedPrompt("הודעה לבעל הבקשה:","מצאתי מוצר שיכול להתאים לבקשה שלך.")||"";await api("/api/help-requests/"+encodeURIComponent(helpRequestId)+"/offers",{method:"POST",body:{itemId:b.dataset.offerMatch,message}});toast("ההצעה נשלחה");closeDialog(d)});$("[data-create-help-item]",d)?.addEventListener("click",()=>{const request=data.request||{};closeDialog(d);openItemForm(null,false,{helpRequestId,title:request.title||"",description:request.description||"",category:request.category||""})});openDialog(d)}catch(e){toast(e.message,"error")}}
  async function openCommunityOfferChat(offerId){
    try{
      let d=$("#community-offer-chat-dialog");if(!d){d=document.createElement("dialog");d.id="community-offer-chat-dialog";d.className="modal modal-wide";document.body.append(d)}
      const load=async()=>{const data=await api("/api/help-offers/"+encodeURIComponent(offerId)+"/messages"),messages=data.messages||[],writable=data.offer?.writable===true&&!data.offer?.blocked;d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>שיחה על הצעת הקהילה</h2><p>${escapeHTML(data.offer?.title||"בקשת קהילה")} · <span class="status-chip">${escapeHTML(data.offer?.status||"")}</span></p>${data.offer?.blocked?'<p class="dashboard-empty">השיחה חסומה ולא ניתן לשלוח הודעות חדשות.</p>':""}<div class="chat-messages" data-community-chat-messages>${messages.length?messages.map(m=>`<article class="chat-message ${m.isMine?"is-mine":""}"><strong>${window.GmachOriginalName(m.isMine?"אני":m.sender_name)}</strong><p>${escapeHTML(m.body)}</p><time>${escapeHTML(formatDateTime(m.created_at))}</time>${m.edited_at?'<small>נערכה</small>':""}${m.isMine&&m.read_at?'<small>נקרא '+escapeHTML(formatDateTime(m.read_at))+'</small>':""}${m.isMine&&!m.deleted_at&&Date.now()-Date.parse(m.created_at)<15*60000?`<button class="button button-secondary button-small" data-community-edit="${escapeHTML(m.id)}" data-body="${escapeHTML(m.body)}">עריכה</button>`:""}${m.isMine&&!m.deleted_at&&Date.now()-Date.parse(m.created_at)<5*60000?`<button class="button button-secondary button-small" data-community-delete="${escapeHTML(m.id)}">מחיקה</button>`:""}${!m.isMine?`<button class="button button-secondary button-small" data-community-report="${escapeHTML(m.id)}">דיווח</button><button class="button button-danger button-small" data-community-block="${escapeHTML(data.offer?.otherUserId||"")}">חסימה</button>`:""}</article>`).join(""):'<div class="chat-empty"><strong>השיחה מתחילה כאן</strong><p>אפשר לתאם פרטים כבר מרגע שנשלחה ההצעה.</p></div>'}</div><form data-community-chat-form class="chat-form"><label class="sr-only">הודעה</label><textarea name="message" rows="2" maxlength="1000" required placeholder="כתבו הודעה" ${writable?"":"disabled"}></textarea><button class="button button-primary" ${writable?"":"disabled"}>שליחה</button></form>${writable?"":'<p class="form-note">השיחה נשמרת לקריאה, אך אי אפשר לשלוח הודעות חדשות במצב הנוכחי.</p>'}`;
        $(".dialog-close",d).onclick=()=>closeDialog(d);
        const form=$("[data-community-chat-form]",d);form.onsubmit=async e=>{e.preventDefault();const text=form.message.value.trim();if(!text)return;const button=form.querySelector("button");button.disabled=true;try{await api("/api/help-offers/"+encodeURIComponent(offerId)+"/messages",{method:"POST",body:{message:text}});await load()}catch(err){toast(err.message,"error");button.disabled=false}};
        $$("[data-community-edit]",d).forEach(b=>b.onclick=async()=>{const message=translatedPrompt("עריכת הודעה",b.dataset.body||"");if(message===null||!message.trim())return;try{await api("/api/help-offer-messages/"+encodeURIComponent(b.dataset.communityEdit),{method:"PATCH",body:{message}});await load()}catch(err){toast(err.message,"error")}});
        $$("[data-community-delete]",d).forEach(b=>b.onclick=async()=>{try{await api("/api/help-offer-messages/"+encodeURIComponent(b.dataset.communityDelete),{method:"DELETE"});await load()}catch(err){toast(err.message,"error")}});
        $$("[data-community-report]",d).forEach(b=>b.onclick=async()=>{const reason=translatedPrompt("מה הבעיה בהודעה?");if(!reason)return;try{await api("/api/help-offer-messages/"+encodeURIComponent(b.dataset.communityReport)+"/report",{method:"POST",body:{reason}});toast("הדיווח נשלח לבדיקה")}catch(err){toast(err.message,"error")}});
        $$("[data-community-block]",d).forEach(b=>b.onclick=async()=>{if(!b.dataset.communityBlock||!translatedConfirm("לחסום את המשתמש הזה?"))return;try{await api("/api/users/"+encodeURIComponent(b.dataset.communityBlock)+"/block",{method:"POST",body:{}});toast("המשתמש נחסם");await load()}catch(err){toast(err.message,"error")}});
        const box=$("[data-community-chat-messages]",d);if(box)box.scrollTop=box.scrollHeight;
      };await load();openDialog(d);
    }catch(e){toast(e.message,"error")}
  }
  async function openHelpOffers(helpRequestId){try{const data=await api("/api/help-requests/"+encodeURIComponent(helpRequestId)+"/offers");let d=$("#help-offers-dialog");if(!d){d=document.createElement("dialog");d.id="help-offers-dialog";d.className="modal modal-wide";document.body.append(d)}const offers=data.offers||[];d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>הצעות לבקשת הקהילה</h2>${offers.map(o=>`<article class="dashboard-row"><div><strong>${window.GmachOriginalName(o.full_name||"מציע")}</strong><p>${escapeHTML(o.item_title||"ללא מוצר מקושר")}</p><p>${escapeHTML(o.message||"")}</p></div><div><span class="status-chip">${escapeHTML(o.status)}</span><button class="button button-secondary button-small" data-community-offer-chat="${escapeHTML(o.id)}">שיחה</button>${o.status==="offered"?`<button class="button button-primary button-small" data-select-offer="${escapeHTML(o.id)}">בחירת ההצעה</button>`:""}</div></article>`).join("")||"<p>עדיין אין הצעות.</p>"}`;$(".dialog-close",d).onclick=()=>closeDialog(d);$$("[data-community-offer-chat]",d).forEach(b=>b.onclick=()=>openCommunityOfferChat(b.dataset.communityOfferChat));$$("[data-select-offer]",d).forEach(b=>b.onclick=async()=>{if(!translatedConfirm("לבחור בהצעה ולסגור את בקשת הקהילה?"))return;await api("/api/help-offers/"+encodeURIComponent(b.dataset.selectOffer),{method:"PATCH",body:{status:"selected"}});toast("ההצעה נבחרה והבקשה נסגרה");closeDialog(d);await refreshAccountSnapshot();showDashboard("requests")});openDialog(d)}catch(e){toast(e.message,"error")}}
  async function openLoanFlow(requestId,direction){
    try{
      const data=await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/timeline"),proposals=data.proposals||[],events=data.events||[];
      let d=$("#loan-flow-dialog");if(!d){d=document.createElement("dialog");d.id="loan-flow-dialog";d.className="modal modal-wide";document.body.append(d)}
      const labels={inventory_held:"המלאי נשמר",hold_expired:"שמירת המלאי פגה",pending:"ממתין לאישור",pickup_time_proposed:"ממתין לתיאום איסוף",pickup_expired:"זמן האיסוף פג",approved_ready_for_pickup:"אושר ומוכן לאיסוף",collected:"נאסף",awaiting_return:"ממתין להחזרה",extension_pending:"הארכה ממתינה",overdue:"באיחור",completed:"הוחזר והושלם",cancelled:"בוטל",declined:"נדחה"};
      d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>תיאום וציר זמן</h2><p><strong>מצב נוכחי:</strong> ${escapeHTML(labels[data.request?.workflowStatus]||data.request?.workflowStatus||data.request?.status||"")}</p><section><h3>הצעות איסוף</h3>${proposals.map(p=>`<article class="dashboard-row"><div><strong>${escapeHTML(formatDateTime(p.starts_at))} עד ${escapeHTML(formatDateTime(p.ends_at))}</strong><p>${escapeHTML(p.status)}</p></div>${p.status==="pending"?`<button class="button button-primary button-small" data-accept-pickup="${escapeHTML(p.id)}">אישור ההצעה</button><button class="button button-secondary button-small" data-counter-pickup="${escapeHTML(p.id)}">הצעה נגדית</button>`:""}</article>`).join("")||"<p>עדיין לא הוצע חלון איסוף.</p>"}<form id="pickup-proposal-form" class="form-grid"><label>מתאריך ושעה<input type="datetime-local" name="startsAt" required></label><label>עד תאריך ושעה<input type="datetime-local" name="endsAt" required></label><button class="button button-primary">הצעת חלון איסוף</button></form></section><section><h3>ציר זמן</h3><ol class="timeline-list">${events.map(e=>`<li><strong>${escapeHTML(labels[e.status]||e.status)}</strong><span>${escapeHTML(formatDateTime(e.created_at))}</span>${e.note?`<p>${escapeHTML(e.note)}</p>`:""}</li>`).join("")||"<li>אין אירועים עדיין.</li>"}</ol></section>`;
      $(".dialog-close",d).onclick=()=>closeDialog(d);$("#pickup-proposal-form",d).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/pickup-proposals",{method:"POST",body:{startsAt:new Date(form.startsAt.value).toISOString(),endsAt:new Date(form.endsAt.value).toISOString()}});closeDialog(d);await openLoanFlow(requestId,direction)};
      $$("[data-accept-pickup]",d).forEach(b=>b.onclick=async()=>{await api("/api/pickup-proposals/"+encodeURIComponent(b.dataset.acceptPickup)+"/accept",{method:"POST",body:{}});toast("זמן האיסוף אושר");closeDialog(d);await refreshAccountSnapshot();await showDashboard("requests")}); $$("[data-counter-pickup]",d).forEach(b=>b.onclick=()=>{$("#pickup-proposal-form",d).scrollIntoView({behavior:"smooth",block:"center"});$("#pickup-proposal-form [name=startsAt]",d)?.focus();toast("בחרו חלון חלופי ושלחו הצעה נגדית")});
      openDialog(d);
    }catch(e){toast(e.message,"error")}
  }

  async function openBranchProposal(requestId){
    try{
      const data=await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/branch-proposal"),branches=data.branches||[],proposals=data.proposals||[];
      let d=$("#branch-proposal-dialog");if(!d){d=document.createElement("dialog");d.id="branch-proposal-dialog";d.className="modal modal-wide";document.body.append(d)}
      const branchOptions=branches.filter(b=>String(b.id)!==String(data.currentBranchId||"")).map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)} · ${escapeHTML(b.city||"")}</option>`).join("");
      d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>סניף איסוף חלופי</h2><p>אפשר להציע סניף אחר. ההחלפה תיכנס לתוקף רק לאחר אישור הצד השני.</p><section><h3>הצעות קודמות</h3>${proposals.map(p=>`<article class="dashboard-row"><div><strong>${escapeHTML(p.to_branch_name||"סניף חלופי")}</strong><p>${escapeHTML(p.status)} · בתוקף עד ${escapeHTML(formatDateTime(p.expires_at))}</p></div>${p.canRespond?`<div class="dashboard-row-actions"><button class="button button-primary button-small" data-branch-response="accept" data-proposal-id="${escapeHTML(p.id)}">אישור</button><button class="button button-secondary button-small" data-branch-response="reject" data-proposal-id="${escapeHTML(p.id)}">דחייה</button></div>`:""}</article>`).join("")||"<p>עדיין לא הוצע סניף חלופי.</p>"}</section><form id="branch-proposal-form" class="form-grid"><label class="wide">בחירת סניף<select name="toBranchId" required><option value="">בחירת סניף חלופי</option>${branchOptions}</select></label><button class="button button-primary" ${branchOptions?"":"disabled"}>שליחת הצעה</button></form>${branchOptions?"":"<p>אין כרגע סניף חלופי פעיל שאפשר להציע.</p>"}`;
      $(".dialog-close",d).onclick=()=>closeDialog(d);
      $("#branch-proposal-form",d).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;try{await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/branch-proposal",{method:"POST",body:{toBranchId:form.toBranchId.value}});toast("הצעת הסניף נשלחה לצד השני");closeDialog(d);await openBranchProposal(requestId)}catch(err){toast(err.message,"error")}};
      $$("[data-branch-response]",d).forEach(b=>b.onclick=async()=>{try{await api("/api/branch-proposals/"+encodeURIComponent(b.dataset.proposalId)+"/respond",{method:"POST",body:{accept:b.dataset.branchResponse==="accept"}});toast(b.dataset.branchResponse==="accept"?"סניף האיסוף החלופי אושר":"הצעת הסניף נדחתה");closeDialog(d);await refreshAccountSnapshot();showDashboard("requests")}catch(err){toast(err.message,"error")}});
      openDialog(d);
    }catch(e){toast(e.message,"error")}
  }

  async function openLoanChange(requestId){const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId));if(!row)return;let d=$("#loan-change-dialog");if(!d){d=document.createElement("dialog");d.id="loan-change-dialog";d.className="modal";document.body.append(d)}d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>שינוי בקשת השאלה</h2><form id="loan-change-form" class="stack-form"><label>איסוף<input name="requestedFrom" type="datetime-local" value="${escapeHTML(String(row.requested_from||"").slice(0,16))}" required></label><label>החזרה<input name="requestedUntil" type="datetime-local" value="${escapeHTML(String(row.requested_until||"").slice(0,16))}" required></label><label>כמות<input name="quantity" type="number" min="1" max="999" value="${Number(row.quantity||1)}" required></label><button class="button button-primary">שליחת השינוי לאישור</button></form>`;$(".dialog-close",d).onclick=()=>closeDialog(d);$("#loan-change-form",d).onsubmit=async e=>{e.preventDefault();const q=e.currentTarget;try{await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/change",{method:"POST",body:{requestedFrom:new Date(q.requestedFrom.value).toISOString(),requestedUntil:new Date(q.requestedUntil.value).toISOString(),quantity:Number(q.quantity.value)}});toast("בקשת השינוי נשלחה לאישור");closeDialog(d);await refreshAccountSnapshot();showDashboard("requests")}catch(err){toast(err.message,"error")}};openDialog(d)}
  async function openExtensionRequest(requestId){
    const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId));let d=$("#extension-dialog");if(!d){d=document.createElement("dialog");d.id="extension-dialog";d.className="modal";document.body.append(d)}
    d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>בקשת הארכה</h2><form id="extension-form" class="stack-form"><label><span>מועד החזרה חדש</span><input name="requestedUntil" type="datetime-local" required></label><label><span>הערה</span><textarea name="note" maxlength="500"></textarea></label><button class="button button-primary">שליחת בקשת הארכה</button></form>`;$(".dialog-close",d).onclick=()=>closeDialog(d);const input=d.querySelector('[name="requestedUntil"]');if(row?.requested_until)input.min=new Date(row.requested_until).toISOString().slice(0,16);$("#extension-form",d).onsubmit=async e=>{e.preventDefault();const form=e.currentTarget;await api("/api/loan-requests/"+encodeURIComponent(requestId)+"/extension",{method:"POST",body:{requestedUntil:new Date(form.requestedUntil.value).toISOString(),note:form.note.value}});toast("בקשת ההארכה נשלחה");closeDialog(d);await showDashboard("requests")};openDialog(d);
  }
  function renderDashboardItems(items) {
    items=Array.isArray(items)?items:[];
    if (!items.length) { $("#dashboard-content").innerHTML = '<div class="dashboard-empty"><strong>עוד לא פורסמו פריטים</strong><p>הוסיפו את הפריט הראשון ותנו לו לעזור לעוד משפחה.</p><button class="button button-primary" type="button" id="dashboard-empty-add-item">הוספת פריט</button></div>'; $("#dashboard-empty-add-item")?.addEventListener("click", () => openItemForm()); return; }
    const renderItemRow=item=>`<article class="dashboard-row"><div><h3 data-user-content-priority="title">${escapeHTML(item.title)}</h3><p>${escapeHTML(item.category||"כללי")}${item.subcategory?` · ${escapeHTML(item.subcategory)}`:""} · ${isDirectItem(item)?pickupText("תיאום ישיר","Direct contact"):escapeHTML(Number(item.unit_count??item.quantity??0))+" יחידות"}</p></div><div><span class="status-chip ${escapeHTML(item.status)}">${escapeHTML(STATUS_LABELS[item.status] || item.status)}</span><p>${escapeHTML(STATUS_LABELS[item.availability_status] || item.availability_status)}</p></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" type="button" data-edit-item="${escapeHTML(item.id)}">עריכה</button><button class="button button-secondary button-small" type="button" data-clone-item="${escapeHTML(item.id)}">שכפול</button><button class="button button-danger button-small" type="button" data-remove-item="${escapeHTML(item.id)}">מחיקה לפי היסטוריה</button>${isDirectItem(item)?"":`<button class="button button-secondary button-small" type="button" data-inventory-item="${escapeHTML(item.id)}">ניהול מלאי</button>`}<button class="button button-secondary button-small" type="button" data-images-item="${escapeHTML(item.id)}">עריכת תמונות</button>${isDirectItem(item)?"":`<button class="button button-secondary button-small" type="button" data-units-item="${escapeHTML(item.id)}">יחידות ו-QR</button>`}${isDirectItem(item)?"":`<button class="button button-secondary button-small" type="button" data-toggle-item="${escapeHTML(item.id)}" data-current-availability="${escapeHTML(item.availability_status)}">${item.availability_status === "available" ? "סימון כלא זמין" : "סימון כזמין"}</button>`}<button class="button button-small ${item.status === "archived" ? "button-secondary" : "button-danger"}" type="button" data-archive-item="${escapeHTML(item.id)}" data-is-archived="${item.status === "archived"}">${item.status === "archived" ? "החזרה לבדיקה" : "הסתרה"}</button></div></article>`;
    const groups=new Map();
    for(const item of items){
      const key=String(item.organization_id||item.organizations?.id||"unknown");
      if(!groups.has(key)){
        const ownOrg=(Array.isArray(state.myOrganizations)?state.myOrganizations:[]).find(org=>String(org.id)===key);
        groups.set(key,{name:item.organizations?.name||ownOrg?.name||"הגמ״ח שלי",items:[]});
      }
      groups.get(key).items.push(item);
    }
    $("#dashboard-content").innerHTML=[...groups.entries()].map(([orgId,group])=>`<section class="dashboard-item-group" data-organization-items="${escapeHTML(orgId)}"><header class="dashboard-item-group-header"><div><span>גמ״ח</span><h2>${escapeHTML(group.name)}</h2></div><strong>${group.items.length} ${group.items.length===1?"פריט":"פריטים"}</strong></header><div class="dashboard-item-group-list">${group.items.map(renderItemRow).join("")}</div></section>`).join("");
    $$('[data-edit-item]').forEach(button => button.addEventListener("click", () => openItemForm(button.dataset.editItem)));
    $$('[data-remove-item]').forEach(button=>button.addEventListener("click",async()=>{if(!translatedConfirm("למחוק את המוצר? אם קיימת היסטוריה היא תישמר באופן מינימלי."))return;try{const r=await api("/api/items/"+encodeURIComponent(button.dataset.removeItem)+"/remove",{method:"POST",body:{}});toast(r.deferred?"המוצר הוסתר עד לסיום ההשאלות הפעילות":"המוצר הוסר");await refreshAccountSnapshot();showDashboard("items")}catch(e){toast(e.message,"error")}}));
    $$('[data-clone-item]').forEach(button => button.addEventListener("click", () => openItemForm(button.dataset.cloneItem, true)));
    $$('[data-inventory-item]').forEach(button=>button.addEventListener("click",()=>openInventoryManager(button.dataset.inventoryItem)));
    $$('[data-images-item]').forEach(button=>button.addEventListener("click",()=>openItemImageEditor(button.dataset.imagesItem)));
    $$('[data-units-item]').forEach(button=>button.addEventListener("click",()=>openUnitManager(button.dataset.unitsItem)));
    $$('[data-toggle-item]').forEach(button => button.addEventListener("click", () => toggleItemAvailability(button.dataset.toggleItem, button.dataset.currentAvailability)));
    $$('[data-archive-item]').forEach(button => button.addEventListener("click", () => archiveItem(button.dataset.archiveItem, button.dataset.isArchived !== "true")));
  }
  async function openUnitManager(itemId,focusSerial=null){
    try{
      const itemData=(state.dashboard?.items||[]).find(x=>String(x.id)===String(itemId));
      const [unitsData,branchesData]=await Promise.all([api("/api/items/"+encodeURIComponent(itemId)+"/units"),itemData?.organization_id?api("/api/organizations/"+encodeURIComponent(itemData.organization_id)+"/branches").catch(()=>({branches:[]})):Promise.resolve({branches:[]})]);
      const branches=(branchesData.branches||[]).filter(b=>b.status!=="archived"),branchOptions=branches.map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)} · ${escapeHTML(b.city||"")}</option>`).join("");
      let d=$("#unit-manager-dialog");if(!d){d=document.createElement("dialog");d.id="unit-manager-dialog";d.className="modal modal-wide";document.body.append(d)}
      const units=unitsData.units||[];d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>יחידות ו-QR · ${escapeHTML(itemData?.title||"")}</h2><div id="unit-list">${units.map(u=>`<article class="dashboard-row" data-unit-serial="${escapeHTML(u.serial_number)}"><div><strong dir="ltr">${escapeHTML(u.serial_number)}</strong><p>${escapeHTML(u.condition)} · ${escapeHTML(({available:"זמין",held:"שמור",loaned:"מושאל",repair:"בתיקון",inactive:"לא פעיל",retired:"יצא משימוש"})[u.status]||u.status)}</p></div><div class="dashboard-row-actions"><select data-unit-status="${escapeHTML(u.id)}"><option value="available">זמין</option><option value="held">שמור</option><option value="loaned">מושאל</option><option value="repair">בתיקון</option><option value="inactive">לא פעיל</option><option value="retired">יצא משימוש</option></select><select data-unit-branch="${escapeHTML(u.id)}"><option value="">ללא סניף</option>${branchOptions}</select><button class="button button-secondary button-small" data-unit-save="${escapeHTML(u.id)}">שמירה</button><button class="button button-secondary button-small" data-unit-qr="${escapeHTML(u.id)}">QR</button><button class="button button-secondary button-small" data-unit-history="${escapeHTML(u.id)}">היסטוריה</button></div></article>`).join("")||"<p>אין יחידות סידוריות.</p>"}</div><form id="unit-create-form" class="form-grid"><label>מספר יחידות להוספה<input name="count" type="number" min="1" max="100" value="1" required></label><label>מצב<select name="condition" required><option>חדש</option><option>כמו חדש</option><option selected>מצב טוב</option><option>מצב סביר</option><option>בלאי נראה לעין</option></select></label><label>סניף<select name="branchId"><option value="">ללא שיוך לסניף</option>${branchOptions}</select></label><button class="button button-primary">יצירת יחידות</button></form><div class="dashboard-row-actions"><button class="button button-secondary" id="scan-unit-qr">סריקת QR מהמצלמה</button><button class="button button-secondary" id="print-unit-qrs">הדפסת כל תוויות ה-QR</button></div>`;
      $(".dialog-close",d).onclick=()=>closeDialog(d);units.forEach(u=>{const s=d.querySelector('[data-unit-status="'+CSS.escape(String(u.id))+'"]'),br=d.querySelector('[data-unit-branch="'+CSS.escape(String(u.id))+'"]');if(s)s.value=u.status;if(br)br.value=u.branch_id||""});
      $("#unit-create-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const out=await api("/api/items/"+encodeURIComponent(itemId)+"/units",{method:"POST",body:{count:Number(f.count.value),condition:f.condition.value,branchId:f.branchId.value||null}});await refreshAccountSnapshot();toast("נוספו "+Number(out.units?.length||0)+" יחידות. סך הכול "+Number(out.quantity||0));closeDialog(d);await openUnitManager(itemId)};
      $$("[data-unit-save]",d).forEach(b=>b.onclick=async()=>{const s=d.querySelector('[data-unit-status="'+CSS.escape(String(b.dataset.unitSave))+'"]'),br=d.querySelector('[data-unit-branch="'+CSS.escape(String(b.dataset.unitSave))+'"]');await api("/api/item-units/"+encodeURIComponent(b.dataset.unitSave),{method:"PATCH",body:{status:s.value,branchId:br?.value||null}});toast("היחידה והסניף נשמרו")});
      $$("[data-unit-qr]",d).forEach(b=>b.onclick=()=>window.open("/api/item-units/"+encodeURIComponent(b.dataset.unitQr)+"/qr","_blank","noopener"));
      $$("[data-unit-history]",d).forEach(b=>b.onclick=async()=>{const h=await api("/api/item-units/"+encodeURIComponent(b.dataset.unitHistory)+"/history");translatedAlert((h.events||[]).map(x=>(x.created_at||"")+" · "+(x.event_type||"")+" "+(x.note||"")).join("\n")||"אין אירועים")});
      $("#scan-unit-qr",d).onclick=async()=>{let sd=document.getElementById("unit-qr-scanner-dialog");if(!sd){sd=document.createElement("dialog");sd.id="unit-qr-scanner-dialog";sd.className="modal";document.body.append(sd)}sd.innerHTML='<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>סריקת QR של יחידה</h2><video id="unit-qr-video" playsinline muted style="width:100%;max-height:55vh;background:#111;border-radius:12px"></video><p id="unit-qr-status" role="status" aria-live="polite">מפעיל מצלמה…</p><label>או בחרו תמונת QR<input id="unit-qr-image" type="file" accept="image/*" capture="environment"></label><form id="unit-qr-manual"><label>או הזינו מספר סידורי / מזהה יחידה<input name="code" autocomplete="off" required></label><button class="button button-primary">איתור יחידה</button></form>';let stream=null,raf=0;const stop=()=>{cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop())};$(".dialog-close",sd).onclick=()=>{stop();closeDialog(sd)};const locate=raw=>{const value=String(raw||"").trim(),match=value.match(/(?:item-units|unit)\/([^/?#]+)/),id=(match||[])[1]||value,decoded=(()=>{try{return decodeURIComponent(id)}catch{return id}})(),unit=units.find(u=>String(u.id)===decoded||String(u.serial_number).toLowerCase()===decoded.toLowerCase()||String(u.serial_number).toLowerCase()===value.toLowerCase());if(!unit){$("#unit-qr-status",sd).textContent="היחידה לא נמצאה בפריט הזה";return false}stop();closeDialog(sd);const row=d.querySelector('[data-unit-save="'+CSS.escape(String(unit.id))+'"]')?.closest(".dashboard-row");row?.scrollIntoView({behavior:"smooth",block:"center"});if(row){row.tabIndex=-1;row.focus();row.animate([{outline:"4px solid currentColor"},{outline:"0 solid transparent"}],{duration:1800})}toast("נמצאה יחידה "+unit.serial_number);return true};$("#unit-qr-manual",sd).onsubmit=e=>{e.preventDefault();locate(e.currentTarget.code.value)};$("#unit-qr-image",sd).onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{if(!("BarcodeDetector" in window))throw new Error("unsupported");const bitmap=await createImageBitmap(file),detector=new BarcodeDetector({formats:["qr_code"]}),codes=await detector.detect(bitmap);bitmap.close?.();if(!codes[0]?.rawValue||!locate(codes[0].rawValue))$("#unit-qr-status",sd).textContent="לא נמצא QR מתאים בתמונה"}catch{$("#unit-qr-status",sd).textContent="סריקת QR מתמונה אינה זמינה בדפדפן הזה. אפשר להזין את הקוד ידנית."}};openDialog(sd);try{if(!("BarcodeDetector" in window)||!navigator.mediaDevices?.getUserMedia)throw new Error("fallback");const detector=new BarcodeDetector({formats:["qr_code"]});stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});const v=$("#unit-qr-video",sd);v.srcObject=stream;await v.play();$("#unit-qr-status",sd).textContent="כוונו את המצלמה אל קוד ה-QR";const tick=async()=>{if(!sd.open)return stop();try{const codes=await detector.detect(v);if(codes[0]?.rawValue&&locate(codes[0].rawValue))return}catch{}raf=requestAnimationFrame(tick)};tick()}catch{$("#unit-qr-video",sd).hidden=true;$("#unit-qr-status",sd).textContent="סריקת מצלמה אינה זמינה בדפדפן הזה. אפשר להזין את הקוד ידנית."}};
      $("#print-unit-qrs",d).onclick=()=>{const w=window.open("","_blank");if(!w)return;w.document.write("<h1>QR · "+escapeHTML(itemData?.title||"")+"</h1>"+units.map(u=>'<section style="display:inline-block;padding:18px;text-align:center;page-break-inside:avoid"><img width="180" height="180" src="/api/item-units/'+encodeURIComponent(u.id)+'/qr"><div>'+escapeHTML(u.serial_number)+"</div></section>").join(""));w.document.close();w.onload=()=>w.print()};
      openDialog(d);
      if(focusSerial){
        const row=d.querySelector('[data-unit-serial="'+CSS.escape(String(focusSerial))+'"]');
        if(row){row.tabIndex=-1;row.scrollIntoView({behavior:"smooth",block:"center"});row.focus();row.animate([{outline:"4px solid currentColor"},{outline:"0 solid transparent"}],{duration:1800})}
      }
    }catch(e){toast(e.message,"error")}
  }
  async function openManagedUnitFromQr(serial){
    const value=String(serial||"").trim();if(!value)return;
    if(!state.user){requireAuth(()=>openManagedUnitFromQr(value));return}
    try{
      const data=await api("/api/item-units/by-serial/"+encodeURIComponent(value));
      await showDashboard("items");
      await openUnitManager(data.unit.itemId,data.unit.serialNumber);
      history.replaceState({route:"dashboard"},"","/dashboard");
    }catch(error){toast(error.message||"לא הצלחנו לפתוח את היחידה","error")}
  }
  async function openInventoryManager(itemId){
    $("#inventory-item-id").value=itemId; const item=findItem(itemId); $("#inventory-title").textContent="ניהול מלאי — "+(item?.title||"");
    await refreshInventoryManager(itemId); openDialog($("#inventory-dialog"));
  }
  async function refreshInventoryManager(itemId){
    const [data,waitlistData]=await Promise.all([api("/api/items/"+encodeURIComponent(itemId)+"/inventory"),api("/api/items/"+encodeURIComponent(itemId)+"/waitlist").catch(()=>({entries:[],canManage:false}))]);
    $("#inventory-quantity").max=String(data.totalQuantity||1);
    $("#inventory-blocks").innerHTML=((data.blocks||[]).length?"<h3>חסימות פעילות</h3>"+(data.blocks||[]).map(b=>'<article class="dashboard-row"><div><strong>'+escapeHTML(b.reason||"חסימת מלאי")+'</strong><p>'+escapeHTML(b.starts_at)+" - "+escapeHTML(b.ends_at)+" · "+b.quantity+' יחידות</p></div><button class="button button-secondary button-small" type="button" data-delete-block="'+escapeHTML(b.id)+'">הסרה</button></article>').join(""):"<p>אין חסימות מלאי.</p>")+'<h3>רשימת המתנה</h3>'+((waitlistData.entries||[]).map((w,i)=>'<article class="dashboard-row"><div><strong>מקום '+(i+1)+(w.full_name?" · "+window.GmachOriginalName(w.full_name):"")+'</strong><p>'+escapeHTML(w.requested_from)+" - "+escapeHTML(w.requested_until)+" · "+Number(w.quantity||1)+' יחידות · '+escapeHTML(w.status)+'</p></div><button class="button button-secondary button-small" data-remove-waitlist="'+escapeHTML(w.id)+'">הסרה</button></article>').join("")||"<p>אין ממתינים פעילים.</p>");
    $$("[data-delete-block]").forEach(b=>b.addEventListener("click",async()=>{try{await api("/api/inventory-blocks/"+encodeURIComponent(b.dataset.deleteBlock),{method:"DELETE"});await refreshInventoryManager(itemId);}catch(e){toast(e.message,"error")}})); $$("[data-remove-waitlist]").forEach(b=>b.addEventListener("click",async()=>{try{await api("/api/waitlist/"+encodeURIComponent(b.dataset.removeWaitlist),{method:"DELETE"});await refreshInventoryManager(itemId)}catch(e){toast(e.message,"error")}}));
  }
  function renderDashboardOrganizations(organizations) {
    const recent=state.dashboard?.recentlyViewedOrganizations||[];
    const owned=organizations.length?organizations.map(org => `<article class="dashboard-row" data-owned-org="${escapeHTML(org.id)}"><div><h3 class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</h3><p>${escapeHTML([org.city, org.neighborhood].filter(Boolean).join(", "))}</p></div><div><span class="status-chip ${escapeHTML(org.status)}">${escapeHTML(org.status === "rejected" ? "הוסר" : "פעיל")}</span><p>${org.is_hidden ? "מוסתר מהקטלוג" : "מוצג לציבור"}</p></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" type="button" data-edit-org="${escapeHTML(org.id)}">עריכה</button><button class="button button-secondary button-small" type="button" data-manage-org="${escapeHTML(org.id)}">סניפים ומנהלים</button><button class="button button-secondary button-small" type="button" data-org-transfers="${escapeHTML(org.id)}">העברות בעלות</button><button class="button button-secondary button-small" type="button" data-org-advanced="${escapeHTML(org.id)}">כלים מתקדמים</button><button class="button button-secondary button-small" type="button" data-org-bulk="${escapeHTML(org.id)}">פעולות מלאי</button><button class="button button-secondary button-small" type="button" data-org-reviews="${escapeHTML(org.id)}">ביקורות ותגובות</button><button class="button button-small ${org.is_hidden ? "button-secondary" : "button-danger"}" type="button" data-hide-org="${escapeHTML(org.id)}" data-hidden="${Boolean(org.is_hidden)}">${org.is_hidden ? "הצגה מחדש" : "הסתרת הגמ״ח"}</button></div></article>`).join(""):'<div class="dashboard-empty"><strong>עוד אין לכם עמוד גמ״ח</strong><p>הפתיחה ללא תשלום ולוקחת כמה דקות.</p><button class="button button-primary" type="button" id="dashboard-empty-add-gmach">פתיחת גמ״ח</button></div>';
    const recentPanel=recent.length?`<section class="dashboard-subsection"><h2>גמ"חים שנצפו לאחרונה</h2><div class="mini-items">${recent.map(org=>`<button type="button" data-recent-org="${escapeHTML(org.organization_id)}"><strong class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</strong><span>${escapeHTML(org.city||"")} · ${Number(org.item_count||0)} ${Number(org.item_count||0) === 1 ? "פריט" : "פריטים"}</span></button>`).join("")}</div></section>`:"";
    const selected=state.activeOrganizationId && organizations.some(org=>org.id===state.activeOrganizationId)?state.activeOrganizationId:organizations[0]?.id;
    state.activeOrganizationId=selected||null;
    const tabs=organizations.length>1?`<div class="organization-switch" role="tablist" aria-label="בחירת גמ״ח">${organizations.map(org=>`<button type="button" role="tab" data-switch-org="${escapeHTML(org.id)}" aria-selected="${org.id===selected}" class="organization-name" translate="no">${window.GmachOriginalName(org.name)}</button>`).join("")}</div>`:"";
    $("#dashboard-content").innerHTML=tabs+owned+recentPanel;
    $$('[data-switch-org]').forEach(button=>button.addEventListener("click",()=>{state.activeOrganizationId=button.dataset.switchOrg;renderDashboardOrganizations(organizations)}));
    $$('[data-owned-org]', $("#dashboard-content")).forEach(row=>{row.hidden=organizations.length>1 && row.dataset.ownedOrg!==selected;});
    $("#dashboard-empty-add-gmach")?.addEventListener("click", () => openGmachForm());
    $$("[data-recent-org]").forEach(button=>button.addEventListener("click",()=>openOrganization(button.dataset.recentOrg)));
    $$('[data-edit-org]').forEach(button => button.addEventListener("click", () => openGmachForm(button.dataset.editOrg))); $$('[data-manage-org]').forEach(button => button.addEventListener("click", () => openOrganizationManager(button.dataset.manageOrg))); $$('[data-org-transfers]').forEach(button=>button.addEventListener("click",()=>window.GmachAccountCenter?.open("transfers"))); $$('[data-org-advanced]').forEach(button=>button.addEventListener("click",()=>openOrganizationAdvanced(button.dataset.orgAdvanced))); $$('[data-org-bulk]').forEach(button=>button.addEventListener("click",()=>openBulkInventory(button.dataset.orgBulk))); $$('[data-org-reviews]').forEach(button=>button.addEventListener("click",()=>openOrganizationReviews(button.dataset.orgReviews))); $$('[data-hide-org]').forEach(button => button.addEventListener("click", () => toggleOrganizationHidden(button.dataset.hideOrg, button.dataset.hidden !== "true")));
  }
  async function openOrganizationReviews(orgId){try{const data=await api("/api/organizations/"+encodeURIComponent(orgId)+"/reviews/manage");let d=$("#organization-reviews-dialog");if(!d){d=document.createElement("dialog");d.id="organization-reviews-dialog";d.className="modal modal-wide";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>ביקורות ותגובות הגמ״ח</h2>${(data.reviews||[]).map(r=>`<article class="dashboard-row"><div><strong>${window.GmachOriginalName(r.reviewer_name)} · ${Number(r.rating)}/5 · ${escapeHTML(r.item_title)}</strong><p>${escapeHTML(r.body||"ללא טקסט")}</p><small>${r.requested_from?escapeHTML(formatDateTime(r.requested_from))+" - "+escapeHTML(formatDateTime(r.requested_until))+" · כמות "+Number(r.loan_quantity||1):""}</small>${r.organization_response?`<p><strong>תגובת הגמ״ח:</strong> ${escapeHTML(r.organization_response)}</p>`:""}</div><button class="button button-secondary button-small" data-respond-review="${escapeHTML(r.id)}">תגובה לביקורת</button></article>`).join("")||"<p>אין עדיין ביקורות לגמ״ח.</p>"}`;$(".dialog-close",d).onclick=()=>closeDialog(d);$$("[data-respond-review]",d).forEach(b=>b.onclick=async()=>{const response=translatedPrompt("תגובת הגמ״ח לביקורת:");if(response===null)return;await api("/api/reviews/"+encodeURIComponent(b.dataset.respondReview)+"/respond",{method:"POST",body:{response}});toast("תגובת הגמ״ח נשמרה");closeDialog(d);await openOrganizationReviews(orgId)});openDialog(d)}catch(e){toast(e.message,"error")}}
  const QUERYALL=(selector,root=document)=>Array.from(root.querySelectorAll(selector));
  async function openItemImageEditor(itemId){try{const [itemData,editData]=await Promise.all([api("/api/items/"+encodeURIComponent(itemId)),api("/api/items/"+encodeURIComponent(itemId)+"/image-edits")]);const urls=itemData.item?.imageUrls||itemData.item?.image_urls||[],saved=new Map((editData.images||[]).map(x=>[x.image_url,x]));let d=$("#item-image-editor-dialog");if(!d){d=document.createElement("dialog");d.id="item-image-editor-dialog";d.className="modal modal-wide";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>עריכת תמונות</h2><p>בחרו תמונה ראשית, סדר, סיבוב ואזורים לטשטוש. אזורי הטשטוש נשמרים כנתוני עריכה לצורך עיבוד והצגה בטוחה.</p><form id="item-image-editor-form"><div id="item-image-editor-list">${urls.map((url,i)=>{const x=saved.get(url)||{};return `<article class="dashboard-row" data-image-row data-url="${escapeHTML(url)}"><img src="${escapeHTML(url)}" alt="" style="width:96px;height:72px;object-fit:cover"><div><label>ראשית <input type="radio" name="primary" value="${i}" ${x.is_primary||(!editData.images?.length&&i===0)?"checked":""}></label><label>סיבוב <select data-rotation><option>0</option><option ${Number(x.rotation)===90?"selected":""}>90</option><option ${Number(x.rotation)===180?"selected":""}>180</option><option ${Number(x.rotation)===270?"selected":""}>270</option></select></label><label>טשטוש אזורים (JSON) <input data-blur value='${escapeHTML(x.blur_regions_json||"[]")}'></label><label>חיתוך (JSON) <input data-crop value='${escapeHTML(x.crop_json||"null")}'></label></div><div><button type="button" class="button button-secondary button-small" data-up>↑</button><button type="button" class="button button-secondary button-small" data-down>↓</button></div></article>`}).join("")||"<p>אין תמונות לעריכה.</p>"}</div><button class="button button-primary">שמירת עריכת התמונות</button></form>`;$(".dialog-close",d).onclick=()=>closeDialog(d);const host=$("#item-image-editor-list",d);QUERYALL("[data-up]",d).forEach(b=>b.onclick=()=>{const row=b.closest("[data-image-row]");row.previousElementSibling&&host.insertBefore(row,row.previousElementSibling)});QUERYALL("[data-down]",d).forEach(b=>b.onclick=()=>{const row=b.closest("[data-image-row]");row.nextElementSibling&&host.insertBefore(row.nextElementSibling,row)});$("#item-image-editor-form",d).onsubmit=async e=>{e.preventDefault();const rows=QUERYALL("[data-image-row]",d),primary=Number(new FormData(e.currentTarget).get("primary")||0),images=rows.map((r,i)=>{let blur=[],crop=null;try{blur=JSON.parse($("[data-blur]",r).value||"[]");crop=JSON.parse($("[data-crop]",r).value||"null")}catch{throw new Error("JSON לא תקין בעריכת התמונה")};return{url:r.dataset.url,isPrimary:i===primary,rotation:Number($("[data-rotation]",r).value),blurRegions:blur,crop}});await api("/api/items/"+encodeURIComponent(itemId)+"/image-edits",{method:"PUT",body:{images}});toast("עריכת התמונות נשמרה");closeDialog(d)};openDialog(d)}catch(e){toast(e.message,"error")}}
  function openBulkInventory(orgId){const items=(state.dashboard?.items||[]).filter(x=>String(x.organization_id||x.organizations?.id||"")===String(orgId));let d=$("#bulk-inventory-dialog");if(!d){d=document.createElement("dialog");d.id="bulk-inventory-dialog";d.className="modal modal-wide";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>פעולות מלאי קבוצתיות</h2><form id="bulk-inventory-form" class="stack-form"><div>${items.map(x=>`<label><input type="checkbox" name="itemId" value="${escapeHTML(x.id)}"> ${escapeHTML(x.title)}</label>`).join("")||"<p>אין מוצרים זמינים.</p>"}</div><label>פעולה<select name="action"><option value="activate">הפעלה</option><option value="deactivate">השבתה</option><option value="availability">שינוי זמינות</option><option value="quantity">שינוי כמות</option><option value="category">שינוי קטגוריה</option></select></label><label>ערך<input name="value" placeholder="זמינות, כמות או קטגוריה"></label><button class="button button-primary">ביצוע על המוצרים שנבחרו</button></form><hr><h3>ייבוא מוצרים</h3><p>הדביקו CSV עם העמודות title,category,description,condition,quantity,city,neighborhood.</p><textarea id="bulk-import-csv" rows="7" class="wide"></textarea><button class="button button-secondary" id="bulk-import-preview">בדיקה וייבוא</button>`;$(".dialog-close",d).onclick=()=>closeDialog(d);$("#bulk-inventory-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,ids=[...f.querySelectorAll('[name="itemId"]:checked')].map(x=>x.value);if(!ids.length)return toast("בחרו לפחות מוצר אחד","error");const action=f.action.value,v=f.value.value,body={itemIds:ids,action};if(action==="availability")body.availability=v;if(action==="quantity")body.quantity=Number(v);if(action==="category")body.category=v;const r=await api("/api/organizations/"+encodeURIComponent(orgId)+"/inventory/bulk",{method:"POST",body});toast("הפעולה הושלמה על "+r.job.affected+" מוצרים");await refreshAccountSnapshot()};$("#bulk-import-preview",d).onclick=async()=>{const text=$("#bulk-import-csv",d).value.trim();if(!text)return;const lines=text.split(/\r?\n/).filter(Boolean),headers=lines.shift().split(",").map(x=>x.trim());const rows=lines.map(line=>{const values=line.split(",");return Object.fromEntries(headers.map((h,i)=>[h,(values[i]||"").trim()]))});const invalid=rows.filter(x=>!x.title||!x.city);if(invalid.length)return toast("נמצאו "+invalid.length+" שורות ללא title או city. הייבוא לא בוצע.","error");if(!translatedConfirm("נמצאו "+rows.length+" שורות תקינות. לייבא עכשיו?"))return;const result=await api("/api/items/import",{method:"POST",body:{organizationId:orgId,items:rows}});toast("נוצרו "+result.created.length+" מוצרים"+(result.errors.length?" עם "+result.errors.length+" שגיאות":""));await refreshAccountSnapshot()};openDialog(d)}
  async function openOrganizationAdvanced(orgId){try{const [branchesData,transfers]=await Promise.all([api("/api/organizations/"+encodeURIComponent(orgId)+"/branches"),api("/api/organizations/"+encodeURIComponent(orgId)+"/branch-transfers").catch(()=>({transfers:[]}))]);const branches=branchesData.branches||[];let d=$("#organization-advanced-dialog");if(!d){d=document.createElement("dialog");d.id="organization-advanced-dialog";d.className="modal modal-wide";document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="סגירה">×</button><h2>כלים מתקדמים לגמ״ח</h2><div class="form-grid"><section><h3>העברת בעלות</h3><form id="ownership-transfer-form"><label>אימייל הבעלים החדש<input name="email" type="email" required></label><button class="button button-secondary">שליחת הזמנה</button></form></section><section><h3>סגירה ומחיקה</h3><label>פתיחה מחדש<input id="org-reopen-at" type="datetime-local"></label><div class="dashboard-row-actions"><button class="button button-secondary" data-org-close>סגירה זמנית</button><button class="button button-primary" data-org-reopen>פתיחה מחדש</button><button class="button button-danger" data-org-delete>בקשת מחיקה בעוד 7 ימים</button><button class="button button-secondary" data-org-cancel-delete>ביטול בקשת מחיקה</button></div></section><section class="wide"><h3>העברת מלאי בין סניפים</h3><form id="branch-transfer-form" class="form-grid"><label>מזהה מוצר<input name="itemId" required></label><label>מזהה יחידה <small>(רשות)</small><input name="unitId"></label><label>מסניף<select name="fromBranchId"><option value="">ללא סניף</option>${branches.map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)}</option>`).join("")}</select></label><label>לסניף<select name="toBranchId" required>${branches.map(b=>`<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)}</option>`).join("")}</select></label><label>כמות<input name="quantity" type="number" min="1" value="1"></label><button class="button button-primary">התחלת העברה</button></form><div>${(transfers.transfers||[]).map(t=>`<article class="dashboard-row"><div><strong>${escapeHTML(t.title)}</strong><p>${escapeHTML(t.from_branch_name||"ללא סניף")} → ${escapeHTML(t.to_branch_name)} · ${escapeHTML(t.status)}</p></div>${t.status==="in_transit"?`<button class="button button-primary button-small" data-receive-transfer="${escapeHTML(t.id)}">אישור קבלה</button>`:""}</article>`).join("")||"<p>אין העברות פעילות.</p>"}</div></section></div>`;$(".dialog-close",d).onclick=()=>closeDialog(d);$("#ownership-transfer-form",d).onsubmit=async e=>{e.preventDefault();const r=await api("/api/organizations/"+encodeURIComponent(orgId)+"/transfer",{method:"POST",body:{email:e.currentTarget.email.value}});toast("הזמנת העברת הבעלות נשלחה עד "+formatDateTime(r.transfer.expiresAt))};$("[data-org-close]",d).onclick=async()=>{const v=$("#org-reopen-at",d).value;if(!v)return toast("בחרו מועד פתיחה מחדש","error");const cancelFuture=translatedConfirm("לבטל גם בקשות עתידיות שטרם נאספו? לחצו ביטול כדי להשאיר אותן פעילות ורק להודיע לשואלים.");await api("/api/organizations/"+encodeURIComponent(orgId)+"/lifecycle",{method:"PATCH",body:{action:"close",reopensAt:new Date(v).toISOString(),cancelFutureRequests:cancelFuture}});toast(cancelFuture?"הגמ״ח נסגר והבקשות העתידיות בוטלו":"הגמ״ח נסגר והמשתמשים קיבלו הודעה")};$("[data-org-reopen]",d).onclick=async()=>{await api("/api/organizations/"+encodeURIComponent(orgId)+"/lifecycle",{method:"PATCH",body:{action:"reopen"}});toast("הגמ״ח נפתח מחדש")};$("[data-org-delete]",d).onclick=async()=>{const name=(state.dashboard?.organizations||[]).find(x=>String(x.id)===String(orgId))?.name||"";if(translatedPrompt("להתחלת מחיקה הקלידו את שם הגמ״ח:")!==name)return toast("שם הגמ״ח לא תאם","error");await api("/api/organizations/"+encodeURIComponent(orgId)+"/lifecycle",{method:"PATCH",body:{action:"request_delete"}});toast("בקשת המחיקה נקלטה. ניתן לבטל בתקופת ההמתנה.")};$("[data-org-cancel-delete]",d).onclick=async()=>{await api("/api/organizations/"+encodeURIComponent(orgId)+"/lifecycle",{method:"PATCH",body:{action:"cancel_delete"}});toast("בקשת המחיקה בוטלה")};$("#branch-transfer-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/organizations/"+encodeURIComponent(orgId)+"/branch-transfers",{method:"POST",body:{itemId:f.itemId.value,unitId:f.unitId.value||null,fromBranchId:f.fromBranchId.value||null,toBranchId:f.toBranchId.value,quantity:Number(f.quantity.value)}});toast("העברת המלאי נפתחה");closeDialog(d);await openOrganizationAdvanced(orgId)};$$("[data-receive-transfer]",d).forEach(b=>b.onclick=async()=>{await api("/api/branch-transfers/"+encodeURIComponent(b.dataset.receiveTransfer)+"/receive",{method:"POST",body:{}});toast("העברת המלאי התקבלה");closeDialog(d);await openOrganizationAdvanced(orgId)});openDialog(d)}catch(e){toast(e.message,"error")}}
  async function openOrganizationManager(orgId) {
    try {
      const [branchesData,membersData,invitationsData]=await Promise.all([api("/api/organizations/"+encodeURIComponent(orgId)+"/branches"),api("/api/organizations/"+encodeURIComponent(orgId)+"/members"),api("/api/organizations/"+encodeURIComponent(orgId)+"/invitations")]);
      let d=$("#organization-manager-dialog");if(!d){d=document.createElement("dialog");d.id="organization-manager-dialog";d.className="modal modal-wide";document.body.append(d)}
      const branches=branchesData.branches||[],members=membersData.members||[],invitations=invitationsData.invitations||[];
      d.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>סניפים ומנהלים</h2><div class="form-grid"><section class="wide"><h3>סניפים</h3><div id="org-branch-list">${branches.map(b=>`<article class="dashboard-row"><div><strong>${escapeHTML(b.name)}</strong><p>${escapeHTML(b.city)} · ${escapeHTML(b.address)} · ${escapeHTML(b.inventory_mode)}</p></div><div class="dashboard-row-actions"><label>פתיחה מחדש<input type="datetime-local" data-branch-reopen="${escapeHTML(b.id)}" value="${escapeHTML(String(b.reopens_at||"").slice(0,16))}"></label><button class="button button-secondary button-small" data-branch-edit="${escapeHTML(b.id)}">עריכת סניף</button><button class="button button-secondary button-small" data-branch-close="${escapeHTML(b.id)}">סגירה זמנית</button>${b.status==="temporarily_closed"?`<button class="button button-primary button-small" data-branch-reopen-now="${escapeHTML(b.id)}">פתיחה עכשיו</button>`:""}<button class="button button-danger button-small" data-branch-archive="${escapeHTML(b.id)}">ארכוב</button></div></article>`).join("")||"<p>אין סניפים.</p>"}</div><form id="org-branch-form" class="form-grid"><label>שם<input name="name" required></label><label>עיר<input name="city" required></label><label class="wide">כתובת<input name="address" required></label><label>טלפון<input name="phone" inputmode="tel"></label><label>מודל מלאי<select name="inventoryMode"><option value="separate">נפרד</option><option value="shared">משותף</option><option value="hybrid">משולב</option></select></label><button class="button button-primary">הוספת סניף</button></form></section><section class="wide"><h3>מנהלים והרשאות</h3><div>${members.map(m=>`<article class="dashboard-row"><div><strong>${window.GmachOriginalName(m.full_name)}</strong><p dir="ltr">${escapeHTML(m.email)}</p><small>${escapeHTML(m.role)}</small></div><button class="button button-danger button-small" data-remove-member="${escapeHTML(m.user_id)}">הסרה</button></article>`).join("")||"<p>אין מנהלים נוספים.</p>"}</div><form id="org-member-form" class="form-grid"><label>אימייל משתמש<input name="email" type="email" required></label><label>תפקיד<select name="role"><option value="requests">בקשות ואיסופים</option><option value="inventory">מלאי</option><option value="reports">דוחות</option></select></label><label class="wide">סניפים מורשים<select name="branches" multiple size="${Math.min(6,Math.max(2,branches.length))}">${branches.map(x=>`<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join("")}</select><small>ללא בחירה = כל הסניפים</small></label><label class="wide">קטגוריות מורשות<select name="categories" multiple size="6">${(state.discovery.categories||[]).map(x=>{const id=typeof x==="string"?x:(x.id||x.name_he||x.name),name=typeof x==="string"?x:(x.name_he||x.name||x.id);return `<option value="${escapeHTML(id)}">${escapeHTML(name)}</option>`}).join("")}</select><small>ללא בחירה = כל הקטגוריות</small></label><button class="button button-primary">שמירת מנהל</button></form><h4>הזמנת מנהל חדש</h4><form id="org-invite-form" class="form-grid"><label>תפקיד<select name="role"><option value="requests">בקשות ואיסופים</option><option value="inventory">מלאי</option><option value="reports">דוחות</option></select></label><label class="wide">הודעה אישית<input name="message" maxlength="500"></label><button class="button button-primary">יצירת קישור הזמנה ל-7 ימים</button></form><div>${invitations.filter(x=>!x.accepted_at&&!x.cancelled_at&&Date.parse(x.expires_at)>Date.now()).map(x=>`<article class="dashboard-row"><span>${escapeHTML(x.role)} · בתוקף עד ${escapeHTML(formatDateTime(x.expires_at))}</span><button class="button button-danger button-small" data-cancel-invite="${escapeHTML(x.id)}">ביטול</button></article>`).join("")||"<p>אין הזמנות פעילות.</p>"}</div></section></div>`;
      $(".dialog-close",d).onclick=()=>closeDialog(d);
      $("#org-branch-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,button=e.submitter;setButtonBusy(button,true,"מוסיפים…");try{await api("/api/organizations/"+encodeURIComponent(orgId)+"/branches",{method:"POST",body:{name:f.name.value.trim(),city:f.city.value.trim(),address:f.address.value.trim(),phone:f.phone.value.trim()||null,inventoryMode:f.inventoryMode.value,hours:{}}});toast("הסניף נוסף ונשמר בגמ״ח");closeDialog(d);await refreshAccountSnapshot();await openOrganizationManager(orgId)}catch(error){toast(error.message||"לא הצלחנו להוסיף את הסניף","error")}finally{setButtonBusy(button,false)}};
      $$("[data-branch-edit]",d).forEach(btn=>btn.onclick=async()=>{const branch=branches.find(x=>String(x.id)===String(btn.dataset.branchEdit));if(!branch)return;let ed=$("#branch-edit-dialog");if(!ed){ed=document.createElement("dialog");ed.id="branch-edit-dialog";ed.className="modal";document.body.append(ed)}ed.innerHTML=`<button class="dialog-close" type="button" aria-label="סגירה">×</button><h2>עריכת סניף</h2><form id="branch-edit-form" class="stack-form"><label>שם<input name="name" value="${escapeHTML(branch.name||"")}" required></label><label>עיר<input name="city" value="${escapeHTML(branch.city||"")}" required></label><label>כתובת<input name="address" value="${escapeHTML(branch.address||"")}" required></label><label>טלפון<input name="phone" value="${escapeHTML(branch.phone||"")}"></label><label>מודל מלאי<select name="inventoryMode"><option value="separate">נפרד</option><option value="shared">משותף</option><option value="hybrid">משולב</option></select></label><button class="button button-primary">שמירת סניף</button></form>`;$(".dialog-close",ed).onclick=()=>closeDialog(ed);ed.querySelector('[name="inventoryMode"]').value=branch.inventory_mode||"separate";$("#branch-edit-form",ed).onsubmit=async e=>{e.preventDefault();const q=e.currentTarget;await api("/api/branches/"+encodeURIComponent(branch.id),{method:"PATCH",body:{name:q.name.value,city:q.city.value,address:q.address.value,phone:q.phone.value||null,inventoryMode:q.inventoryMode.value}});toast("פרטי הסניף נשמרו");closeDialog(ed);closeDialog(d);await openOrganizationManager(orgId)};openDialog(ed)});
      $$("[data-branch-close]",d).forEach(b=>b.onclick=async()=>{const input=d.querySelector('[data-branch-reopen="'+CSS.escape(b.dataset.branchClose)+'"]'),reopen=input?.value||null;if(!reopen){toast("בחרו מועד פתיחה מחדש","error");input?.focus();return}await api("/api/branches/"+encodeURIComponent(b.dataset.branchClose),{method:"PATCH",body:{status:"temporarily_closed",reopensAt:new Date(reopen).toISOString()}});toast("הסניף נסגר זמנית והלווים הפעילים עודכנו");closeDialog(d);await openOrganizationManager(orgId)});
      $$("[data-branch-reopen-now]",d).forEach(b=>b.onclick=async()=>{await api("/api/branches/"+encodeURIComponent(b.dataset.branchReopenNow),{method:"PATCH",body:{status:"active",reopensAt:null}});toast("הסניף חזר לפעילות");closeDialog(d);await openOrganizationManager(orgId)});
      $$("[data-branch-archive]",d).forEach(b=>b.onclick=async()=>{if(!translatedConfirm("לארכב את הסניף?"))return;await api("/api/branches/"+encodeURIComponent(b.dataset.branchArchive),{method:"DELETE"});closeDialog(d);await openOrganizationManager(orgId)});
      $("#org-invite-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const out=await api("/api/organizations/"+encodeURIComponent(orgId)+"/invitations",{method:"POST",body:{role:f.role.value,message:f.message.value||null}});try{await navigator.clipboard.writeText(out.invitation.url);toast("קישור ההזמנה הועתק. הוא בתוקף ל-7 ימים.")}catch{translatedPrompt("העתיקו את קישור ההזמנה:",out.invitation.url)};closeDialog(d);await openOrganizationManager(orgId)};
      $$("[data-cancel-invite]",d).forEach(b=>b.onclick=async()=>{await api("/api/organization-invitations/"+encodeURIComponent(b.dataset.cancelInvite),{method:"DELETE"});toast("ההזמנה בוטלה");closeDialog(d);await openOrganizationManager(orgId)});
      $("#org-member-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/organizations/"+encodeURIComponent(orgId)+"/members",{method:"POST",body:{email:f.email.value,role:f.role.value,branchIds:[...f.branches.selectedOptions].map(x=>x.value),categoryIds:[...f.categories.selectedOptions].map(x=>x.value)}});toast("הרשאות המנהל נשמרו");closeDialog(d);await openOrganizationManager(orgId)};
      $$("[data-remove-member]",d).forEach(b=>b.onclick=async()=>{if(!translatedConfirm("להסיר את המנהל?"))return;await api("/api/organizations/"+encodeURIComponent(orgId)+"/members/"+encodeURIComponent(b.dataset.removeMember),{method:"DELETE"});closeDialog(d);await openOrganizationManager(orgId)});
      openDialog(d);
    } catch(e){toast(e.message,"error")}
  }
  async function renderAdmin() {
    const [data, overview, appearance, userData, content, analyticsData] = await Promise.all([api("/api/admin/pending"), api("/api/admin/overview"), api("/api/admin/site-settings"), api("/api/admin/users"), api("/api/admin/content"),api("/api/admin/analytics")]), organizations = data.organizations || [], items = data.items || [], reports = data.reports || [];
    const reasonLabels = { incorrect: "מידע לא נכון", unsafe: "חשש בטיחותי", commercial: "תשלום שלא פורסם או מעבר לסמלי", unavailable: "אינו זמין", other: "אחר" };
    const s = appearance.settings || {};
    $("#dashboard-content").innerHTML = `<section class="admin-console"><div class="admin-toolbar"><button class="button button-primary" id="start-visual-editor">✦ הפיכת האתר למצב עריכה</button><button class="button button-secondary" id="reset-visual-editor">איפוס כל העריכות החזותיות</button><span>לחיצה על כל רכיב באתר תפתח את כל אפשרויות העיצוב שלו.</span></div><div class="admin-overview"><article><strong>${overview.stats.users}</strong><span>משתמשים</span></article><article><strong>${overview.stats.organizations}</strong><span>גמ״חים</span></article><article><strong>${overview.stats.items}</strong><span>פריטים</span></article><article><strong>${overview.stats.requests}</strong><span>בקשות</span></article></div>
      <details open><summary>עיצוב ותוכן האתר</summary><form id="site-settings-form" class="stack-form admin-settings-grid"><label><span>שם האתר</span><input id="setting-site-name" value="${escapeHTML(s.site_name || "")}" required></label><label><span>סלוגן</span><input id="setting-tagline" value="${escapeHTML(s.tagline || "")}" required></label><label><span>כותרת ראשית</span><input id="setting-hero-title" value="${escapeHTML(s.hero_title || "")}" required></label><label class="wide"><span>תיאור ראשי</span><textarea id="setting-hero-description" required>${escapeHTML(s.hero_description || "")}</textarea></label><label><span>צבע ראשי</span><input id="setting-primary" type="color" value="${escapeHTML(s.primary_color || "#243f75")}"></label><label><span>צבע משני</span><input id="setting-secondary" type="color" value="${escapeHTML(s.secondary_color || "#9d7137")}"></label><label><span>צבע הדגשה</span><input id="setting-accent" type="color" value="${escapeHTML(s.accent_color || "#e7bd78")}"></label><label><span>גופן</span><select id="setting-font">${fontOptions()}</select></label><label><span>גודל בסיס</span><input id="setting-font-size" type="number" min="14" max="22" value="${escapeHTML(s.base_font_size || 16)}"></label><label><span>כתובת לוגו</span><input id="setting-logo" value="${escapeHTML(s.logo_url || "/gmach-berega-logo.jpg")}" dir="ltr"></label><button class="button button-primary" type="submit">שמירת עיצוב ותוכן</button></form><h3>היסטוריית גרסאות</h3><div class="version-list">${(appearance.versions || []).map(v => `<button class="button button-secondary button-small" data-restore-version="${escapeHTML(v.id)}">שחזור ${escapeHTML(formatDateTime(v.created_at))}</button>`).join("") || "עדיין אין גרסאות קודמות"}</div></details>
      <details><summary>אבטחת החשבון שלי</summary><div class="dashboard-row-actions"><button class="button button-secondary" id="admin-change-password">שינוי סיסמה</button><button class="button button-primary" id="admin-enable-2fa">${state.user.twoFactorEnabled ? "הגדרה מחדש של אימות דו־שלבי" : "הפעלת אימות דו־שלבי"}</button></div><div id="two-factor-setup"></div></details>
      <details><summary>משתמשים (${userData.users.length})</summary><div class="admin-users">${userData.users.map(u => `<article class="dashboard-row"><div><h3>${window.GmachOriginalName(u.full_name)}</h3><p dir="ltr">${escapeHTML(u.email)}</p><small>נוצר: ${escapeHTML(formatDateTime(u.created_at))} · כניסה אחרונה: ${escapeHTML(u.last_login_at ? formatDateTime(u.last_login_at) : "טרם נכנס")}</small></div><div><label>הרשאה <strong>${u.role === "admin" ? "מנהל האתר" : "משתמש"}</strong></label><label>מצב <select data-user-status="${escapeHTML(u.id)}"><option value="active" ${u.account_status === "active" ? "selected" : ""}>פעיל</option><option value="suspended" ${u.account_status === "suspended" ? "selected" : ""}>מושעה</option></select></label><label class="check"><input type="checkbox" data-user-verified="${escapeHTML(u.id)}" ${u.email_verified ? "checked" : ""}> מייל מאומת</label><button class="button button-secondary button-small" data-save-user="${escapeHTML(u.id)}">שמירה</button><button class="button button-danger button-small" data-delete-user="${escapeHTML(u.id)}" data-delete-user-label="${escapeHTML(u.full_name||u.email)}">מחיקה</button></div></article>`).join("")}</div></details>
      <details><summary>כל הגמ״חים (${content.organizations.length})</summary>${content.organizations.map(window.GmachAdmin.summary).join("") || "אין גמ״חים"}</details>
      <details><summary>כל הפריטים (${content.items.length})</summary>${content.items.map(i => `<article class="dashboard-row"><div><h3>${escapeHTML(i.title)}</h3><p><button type="button" class="button button-secondary button-small" data-admin-gmach-open="${escapeHTML(i.organization_id)}">${window.GmachOriginalName(i.organization_name)}</button> · ${escapeHTML(i.category)} · ${escapeHTML(Number(i.unit_count??i.quantity??0))} יחידות בפועל</p></div><div><span class="status-chip ${escapeHTML(i.status)}">${escapeHTML(i.status)}</span><p>${escapeHTML(i.availability_status)}</p></div></article>`).join("") || "אין פריטים"}</details>
      <details><summary>כל בקשות ההשאלה (${content.requests.length})</summary>${content.requests.map(r => `<article class="dashboard-row"><div><h3>${escapeHTML(r.item_title)}</h3><p>${window.GmachOriginalName(r.borrower_name)} · ${escapeHTML(r.borrower_email)} · <button type="button" class="button button-secondary button-small" data-admin-gmach-open="${escapeHTML(r.organization_id)}">${window.GmachOriginalName(r.organization_name)}</button></p></div><div><span class="status-chip ${escapeHTML(r.status)}">${escapeHTML(STATUS_LABELS[r.status]||r.status)}</span><p class="loan-date-range">${escapeHTML(formatDateTime(r.requested_from))} — ${escapeHTML(formatDateTime(r.requested_until))}</p></div></article>`).join("") || "אין בקשות"}</details>
      <details><summary>גרסאות עריכה חיה (${content.visualVersions.length})</summary><div class="version-list">${content.visualVersions.map(v => `<button class="button button-secondary button-small" data-restore-visual="${escapeHTML(v.id)}">שחזור ${escapeHTML(formatDateTime(v.created_at))}</button>`).join("") || "אין גרסאות"}</div></details>
      <details><summary>בדיקת פריטים ודיווחים (${items.length + reports.length})</summary><h2 class="dashboard-section-title">פריטים שממתינים לבדיקה (${items.length})</h2>${items.map(item => `<article class="dashboard-row"><div><h3 data-user-content-priority="title">${escapeHTML(item.title)}</h3><p>${window.GmachOriginalName(item.org_name)}</p></div><div class="dashboard-row-actions"><button class="button button-primary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="active">פרסום</button><button class="button button-secondary button-small" data-admin-item="${escapeHTML(item.id)}" data-admin-status="rejected">דחייה</button></div></article>`).join("")}<h2 class="dashboard-section-title">דיווחים (${reports.length})</h2>${reports.map(report => `<article class="dashboard-row"><div><h3>${escapeHTML(report.item_title)}</h3><p>${escapeHTML(reasonLabels[report.reason] || report.reason)}</p></div><button class="button button-primary button-small" data-admin-report="${escapeHTML(report.id)}" data-admin-status="reviewed">טופל</button></article>`).join("")}</details>
      <details><summary>מדדי שימוש וביקוש</summary><div class="dashboard-row-actions"><a class="button button-secondary button-small" href="/api/admin/analytics/export.csv" download>ייצוא נתוני שימוש CSV</a></div><div class="analytics-grid"><section><h3>חיפושים נפוצים</h3>${(analyticsData.searches||[]).map(x=>`<p><strong>${escapeHTML(x.query)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>ערים מובילות</h3>${(analyticsData.cities||[]).map(x=>`<p><strong>${escapeHTML(x.city)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>קטגוריות מבוקשות</h3>${(analyticsData.categories||[]).map(x=>`<p><strong>${escapeHTML(x.category)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>מקורות הגעה</h3>${(analyticsData.sources||[]).map(x=>`<p><strong>${escapeHTML(x.source||"direct")}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>אתרים מפנים</h3>${(analyticsData.referrers||[]).map(x=>`<p><strong>${escapeHTML(x.referrer)}</strong><span>${Number(x.count)}</span></p>`).join("")||"אין נתונים"}</section><section><h3>התאמות מוצלחות</h3><p><strong>${Number(analyticsData.matching?.successful||0)}</strong><span>מתוך ${Number(analyticsData.matching?.total||0)} בקשות</span></p></section></div></details>
      <details><summary>יומן פעילות</summary>${(overview.audit || []).map(a => `<article class="audit-row"><strong>${escapeHTML(a.action)}</strong><span>${window.GmachOriginalName(a.actor_name || "מערכת")} · ${escapeHTML(formatDateTime(a.created_at))}</span></article>`).join("") || "אין עדיין פעולות מתועדות"}</details></section>`;
    $("#setting-font").value = s.font_family || "Arial, sans-serif";
    $$('[data-admin-org]').forEach(button => button.addEventListener("click", () => moderate("organization", button.dataset.adminOrg, button.dataset.adminStatus))); $$('[data-admin-item]').forEach(button => button.addEventListener("click", () => moderate("item", button.dataset.adminItem, button.dataset.adminStatus))); $$('[data-admin-report]').forEach(button => button.addEventListener("click", () => moderate("report", button.dataset.adminReport, button.dataset.adminStatus)));
    $("#site-settings-form").addEventListener("submit", saveSiteSettings); $$('[data-restore-version]').forEach(button => button.addEventListener("click", () => restoreSettings(button.dataset.restoreVersion))); $("#admin-change-password").addEventListener("click", changeMyPassword); $("#admin-enable-2fa").addEventListener("click", beginTwoFactorSetup);
    $("#start-visual-editor").addEventListener("click", startVisualEditor); $("#reset-visual-editor").addEventListener("click", resetVisualEditor); $$('[data-restore-visual]').forEach(button => button.addEventListener("click", () => restoreVisualVersion(button.dataset.restoreVisual))); $$('[data-save-user]').forEach(button => button.addEventListener("click", () => saveManagedUser(button.dataset.saveUser))); $$('[data-delete-user]').forEach(button => button.addEventListener("click", () => deleteAdminEntity("users",button.dataset.deleteUser,button.dataset.deleteUserLabel))); $$('[data-delete-organization]').forEach(button => button.addEventListener("click", () => deleteAdminEntity("organizations",button.dataset.deleteOrganization,button.dataset.deleteOrganizationLabel)));
  }
  window.GmachAdminTools={branches:openOrganizationManager,advanced:openOrganizationAdvanced,reviews:openOrganizationReviews,add:(id,r)=>openItemForm(null,false,null,{organization:r}),editItem:(i,r)=>openItemForm(i.id,false,null,{organization:r,item:i}),item:openInventoryManager,units:openUnitManager};
  window.addEventListener("gmach:admin-updated",async()=>{if(state.user?.role!=="admin")return;try{await refreshAccountSnapshot();if(state.dashboardTab==="admin"||document.querySelector(".admin-console"))await renderAdmin();await loadItems()}catch(e){toast(e.message,"error")}});
  async function deleteAdminEntity(type,id,label) { if (!translatedConfirm(`למחוק את ${label || "הרשומה"}? הפעולה תסיר אותה מהאתר.`)) return; try { await api(`/api/admin/entities/${type}/${encodeURIComponent(id)}`, { method: "DELETE" }); toast("נמחק בהצלחה"); await renderAdmin(); if(type==="organizations") await loadItems(); } catch (error) { toast(error.message, "error"); } }
  async function moderate(kind, id, status) {
    try { const path = kind === "organization" ? `/api/admin/organizations/${encodeURIComponent(id)}` : kind === "report" ? `/api/admin/reports/${encodeURIComponent(id)}` : `/api/admin/items/${encodeURIComponent(id)}`; await api(path, { method: "PATCH", body: kind === "organization" ? { status, verified: status === "approved" } : { status } }); toast(kind === "report" ? "הדיווח טופל" : "הפרסום עודכן"); await renderAdmin(); await loadItems(); } catch (error) { toast(error.message, "error"); }
  }
  async function resetVisualEditor() { if (!translatedConfirm("לאפס את כל שינויי העריכה החיה? תישמר גרסה לשחזור.")) return; try { await api("/api/admin/page-customizations", { method: "DELETE" }); location.reload(); } catch (error) { toast(error.message, "error"); } }
  async function restoreVisualVersion(id) { try { await api(`/api/admin/page-customizations/versions/${encodeURIComponent(id)}/restore`, { method: "POST", body: {} }); location.reload(); } catch (error) { toast(error.message, "error"); } }
  async function saveManagedUser(id) { try { const accountStatus = document.querySelector(`[data-user-status="${CSS.escape(id)}"]`).value, emailVerified = document.querySelector(`[data-user-verified="${CSS.escape(id)}"]`).checked; await api(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { accountStatus, emailVerified } }); toast("המשתמש עודכן"); await renderAdmin(); } catch (error) { toast(error.message, "error"); } }
  function currentLoanPolicyCopy(value){const copy={"מוצאים ציוד להשאלה בחינם מגמ״חים ואנשים טובים קרוב לבית.":"מוצאים ציוד להשאלה ללא תשלום או בתשלום סמלי מגמ״חים קרוב לבית.","הכול בהשאלה חינם":"השאלה ללא תשלום או בתשלום סמלי","הכול ללא תשלום":"גמילות חסדים נגישה","הפרסום, הבקשה וההשאלה בפלטפורמה חינמיים לחלוטין.":"הפרסום והבקשה באתר ללא תשלום. הפריטים מוצעים ללא תשלום או לכל היותר בתשלום סמלי."};return copy[value]||value}
  async function loadSiteSettings() {
    try {
      const { settings: s } = await api("/api/site-settings"); if (!s) return;
      try { localStorage.setItem("gmach-site-settings-v1", JSON.stringify({cache_version:3,primary_color:s.primary_color,secondary_color:s.secondary_color,accent_color:s.accent_color,font_family:s.font_family,base_font_size:s.base_font_size})); } catch {}
      document.documentElement.style.setProperty("--navy", s.primary_color); document.documentElement.style.setProperty("--teal", s.secondary_color); document.documentElement.style.setProperty("--accent", s.accent_color); document.documentElement.style.setProperty("--site-font", s.font_family); document.documentElement.style.fontSize = `${s.base_font_size}px`;
      const siteName=s.site_name||"גמ״ח ברגע", tagline=s.tagline||"גדולה גמילות חסדים יותר מן הצדקה", logo=!s.logo_url||s.logo_url==="/gmach-berega-mark.jpg"||s.logo_url==="/gmach-berega-logo.jpg"||s.logo_url==="/gmach-berega-mark-cropped.jpg"?"/gmach-berega-full.jpg":s.logo_url; $$(".brand-copy strong").forEach(el => el.textContent = siteName); $$(".brand-copy small").forEach(el => el.textContent = tagline); $("#hero-title").textContent = s.hero_title||"מה תרצו לקבל היום?"; $("#hero-title").nextElementSibling.textContent = currentLoanPolicyCopy(s.hero_description)||"מוצאים ציוד להשאלה ללא תשלום או בתשלום סמלי מגמ״חים קרוב לבית."; $$(".brand-logo-crop img").forEach(img => img.src = logo); const rawTitle = `${siteName} — ${tagline}`; document.title = document.documentElement.lang === "en" && window.GmachTranslate ? window.GmachTranslate(rawTitle) : rawTitle;
    } catch (error) { console.warn("Site settings unavailable", error); }
  }
  async function loadPageCustomizations() {
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
    if (item.text !== null && item.text !== undefined) element.textContent = currentLoanPolicyCopy(item.text);
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
    const panel = document.createElement("aside"); panel.id = "visual-editor-panel"; panel.innerHTML = `<header><strong>עריכה חיה</strong><button type="button" id="visual-editor-exit">סיום</button></header><p id="visual-editor-hint">לחצו על כל רכיב באתר כדי לערוך אותו.</p><form id="visual-editor-form" hidden><label>טקסט<textarea id="ve-text" rows="4"></textarea></label><div class="editor-grid"><label>גופן<select id="ve-font">${fontOptions(true)}</select></label><label>גודל<input id="ve-size" placeholder="למשל 32px"></label><label>צבע<input id="ve-color" type="color"></label><label>רקע<input id="ve-bg" type="color"></label><label>יישור<select id="ve-align"><option value="">רגיל</option><option value="right">ימין</option><option value="center">מרכז</option><option value="left">שמאל</option></select></label><label>רוחב<input id="ve-width" placeholder="auto / 100% / 500px"></label><label>הזזה אופקית<input id="ve-x" type="number" value="0"></label><label>הזזה אנכית<input id="ve-y" type="number" value="0"></label><label>רווח עליון<input id="ve-mt" placeholder="0px"></label><label>רווח תחתון<input id="ve-mb" placeholder="0px"></label><label>ריפוד<input id="ve-padding" placeholder="למשל 20px"></label><label>סדר<input id="ve-order" type="number"></label><label>קישור<input id="ve-href" dir="ltr" placeholder="/catalog או https://..."></label><label class="check"><input id="ve-hidden" type="checkbox"> מוסתר</label><label class="check"><input id="ve-disabled" type="checkbox"> מושבת</label></div><div class="editor-actions"><button class="button button-primary" type="submit">שמירת השדות ששונו</button><button class="button button-secondary" id="ve-clear" type="button">איפוס הרכיב</button></div></form>`; document.body.append(panel);
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
  async function changeMyPassword() { const currentPassword = translatedPrompt("הסיסמה הנוכחית"); if (!currentPassword) return; const newPassword = translatedPrompt("סיסמה חדשה — לפחות 10 תווים"); if (!newPassword) return; try { await api("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }); toast("הסיסמה שונתה בהצלחה"); } catch (error) { toast(error.message, "error"); } }
  async function beginTwoFactorSetup() {
    try { const data = await api("/api/auth/2fa/setup", { method: "POST", body: {} }); const container = $("#two-factor-setup"); const qr = window.qrcode(0, "M"); qr.addData(data.otpauthUri); qr.make(); container.innerHTML = `<div class="two-factor-card"><h3>סרקו באפליקציית Authenticator</h3><div class="totp-qr">${qr.createSvgTag(5, 2)}</div><p>מפתח ידני: <code dir="ltr">${escapeHTML(data.secret)}</code></p><form id="confirm-2fa-form" class="inline-form"><input id="confirm-2fa-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="קוד בן 6 ספרות" required><button class="button button-primary" type="submit">אישור והפעלה</button></form></div>`; $("#confirm-2fa-form").addEventListener("submit", async event => { event.preventDefault(); try { await api("/api/auth/2fa/confirm", { method: "POST", body: { code: $("#confirm-2fa-code").value } }); state.user.twoFactorEnabled = true; updateAuthUI(); toast("אימות דו־שלבי הופעל"); await showDashboard("admin"); } catch (error) { toast(error.message, "error"); } });
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
      let contact=$("#organization-chat-contact");if(!contact){contact=document.createElement("p");contact.id="organization-chat-contact";contact.className="contact-detail";$("#chat-subtitle").insertAdjacentElement("afterend",contact)}
      contact.hidden=!data.pickup;contact.innerHTML=data.pickup?window.GmachContacts.markup(data.pickup):"";$("[data-contact-chat]",contact)?.remove();
      const chatForm=$("#chat-form"),chatReadOnly=data.request?.chatWritable===false;chatForm.dataset.chatWritable=String(!chatReadOnly);chatForm.querySelectorAll("textarea,button[type=submit],#chat-media-tools button").forEach(control=>control.toggleAttribute("disabled",chatReadOnly));let retentionNote=$("#chat-retention-note");if(!retentionNote){retentionNote=document.createElement("p");retentionNote.id="chat-retention-note";retentionNote.className="form-note";chatForm.insertAdjacentElement("afterend",retentionNote)}retentionNote.hidden=!data.request?.chatWritableUntil&&!data.request?.chatRetainUntil;retentionNote.textContent=chatReadOnly?(data.request?.chatRetainUntil?"השיחה לקריאה בלבד. תוכן השיחה נשמר עד "+formatDateTime(data.request.chatRetainUntil)+".":"השיחה לקריאה בלבד."):(data.request?.chatWritableUntil?"אפשר לכתוב בשיחה עד "+formatDateTime(data.request.chatWritableUntil)+". לאחר מכן היא תישאר לקריאה בלבד.":""); container.innerHTML = data.messages?.length ? data.messages.map(message => `<article class="chat-message ${message.isMine ? "is-mine" : ""}"><strong>${window.GmachOriginalName(message.isMine ? "אני" : message.sender_name)}</strong>${message.body?`<p>${escapeHTML(message.body)}</p>`:""}${message.message_type==="location"&&message.metadata?.latitude?`<p><a href="https://www.google.com/maps?q=${encodeURIComponent(message.metadata.latitude+","+message.metadata.longitude)}" target="_blank" rel="noopener">📍 ${escapeHTML(message.metadata.label||"פתיחת המיקום במפה")}</a></p>`:""}${message.message_type==="item_card"&&message.metadata?.itemId?`<p><button type="button" class="button button-secondary button-small" data-open-chat-item="${escapeHTML(message.metadata.itemId)}">📦 ${escapeHTML(message.metadata.title||"פתיחת המוצר")}</button></p>`:""}${message.media_url?(message.message_type==="audio"?`<audio controls preload="metadata" src="${escapeHTML(message.media_url)}"></audio>`:message.message_type==="image"?`<a href="${escapeHTML(message.media_url)}" target="_blank" rel="noopener"><img class="chat-media-image" src="${escapeHTML(message.media_url)}" alt="תמונה שצורפה לשיחה" loading="lazy"></a>`:`<p><a href="${escapeHTML(message.media_url)}" target="_blank" rel="noopener">פתיחת קובץ מצורף</a></p>`):""}<time>${escapeHTML(formatDateTime(message.created_at))}</time>${message.isMine&&Date.now()-new Date(message.created_at).getTime()<900000?`<button type="button" class="button button-secondary button-small" data-edit-message="${escapeHTML(message.id)}" data-message-body="${escapeHTML(message.body||"")}">עריכה</button>`:""}${message.isMine&&Date.now()-new Date(message.created_at).getTime()<300000?`<button type="button" class="button button-secondary button-small" data-delete-message="${escapeHTML(message.id)}">מחיקת הודעה</button>`:""}${message.isMine&&message.read_at?`<small>נקרא ${escapeHTML(formatDateTime(message.read_at))}</small>`:""}${!message.isMine?`<button type="button" class="button button-secondary button-small" data-report-message="${escapeHTML(message.id)}">דיווח</button><button type="button" class="button button-danger button-small" data-block-user="${escapeHTML(message.sender_id)}">חסימה</button>`:""}</article>`).join("") : '<div class="chat-empty"><strong>השיחה מתחילה כאן</strong><p>כתבו הודעה לתיאום האיסוף, ההחזרה או שינוי התאריכים.</p></div>';
      $$("[data-open-chat-item]",container).forEach(b=>b.onclick=()=>openItem(b.dataset.openChatItem));       $$("[data-edit-message]",container).forEach(b=>b.onclick=async()=>{const message=translatedPrompt("עריכת הודעה",b.dataset.messageBody||"");if(message===null||!message.trim())return;try{await api("/api/messages/"+encodeURIComponent(b.dataset.editMessage),{method:"PATCH",body:{message}});await loadChatMessages()}catch(e){toast(e.message,"error")}});       $$("[data-delete-message]",container).forEach(b=>b.onclick=async()=>{try{await api("/api/messages/"+encodeURIComponent(b.dataset.deleteMessage),{method:"DELETE"});await loadChatMessages()}catch(e){toast(e.message,"error")}}); $$("[data-report-message]",container).forEach(b=>b.onclick=async()=>{const reason=translatedPrompt("מה הבעיה בהודעה?");if(!reason)return;try{await api("/api/messages/"+encodeURIComponent(b.dataset.reportMessage)+"/report",{method:"POST",body:{reason}});toast("הדיווח נשלח לבדיקה")}catch(e){toast(e.message,"error")}}); $$("[data-block-user]",container).forEach(b=>b.onclick=async()=>{if(!translatedConfirm("לחסום את המשתמש? אם קיימת השאלה פעילה, החסימה המלאה תיכנס לתוקף לאחר סיומה."))return;try{await api("/api/users/"+encodeURIComponent(b.dataset.blockUser)+"/block",{method:"POST",body:{effectiveAfterRequestId:state.chatRequestId}});toast("המשתמש נחסם בהתאם למצב ההשאלה")}catch(e){toast(e.message,"error")}});
      if (nearBottom || !silent) container.scrollTop = container.scrollHeight;
    } catch (error) { if (!silent) toast(error.message || "לא הצלחנו לטעון את השיחה", "error"); }
  }
  function openChat(requestId) {
    requireAuth(async () => { stopChatPolling(); state.chatRequestId = requestId; $("#chat-form").dataset.requestId=String(requestId); $("#chat-messages").innerHTML = '<div class="skeleton-card" aria-hidden="true"></div>'; openDialog($("#chat-dialog")); await loadChatMessages(); state.chatTimer = window.setInterval(() => loadChatMessages(true), 5000); });
  }
  async function openRequestContact(requestId){try{const data=await api(`/api/loan-requests/${encodeURIComponent(requestId)}/pickup-details`);let dialog=$("#request-contact-dialog");if(!dialog){dialog=document.createElement("dialog");dialog.id="request-contact-dialog";dialog.className="modal modal-medium";document.body.append(dialog)}dialog.innerHTML=`<button class="dialog-close" type="button" aria-label="${escapeHTML(pickupText("סגירה","Close"))}">×</button>`+window.GmachContacts.markup(data.contact);$(".dialog-close",dialog).onclick=()=>closeDialog(dialog);$("[data-contact-chat]",dialog)?.addEventListener("click",()=>{closeDialog(dialog);openChat(requestId)});openDialog(dialog);}catch(e){toast(e.message,"error")}}
  async function requestOrganizationChat(organizationId,direct=false){
    requireAuth(async()=>{try{
      const eligibility=await api(`/api/organizations/${encodeURIComponent(organizationId)}/service-eligibility`);
      if(!eligibility.allowed&&!eligibility.exceptionAvailable){toast(eligibility.message,"error");return;}
      let dialog=$("#organization-chat-request-dialog");if(!dialog){dialog=document.createElement("dialog");dialog.id="organization-chat-request-dialog";dialog.className="modal modal-medium";document.body.append(dialog)}
      dialog.innerHTML=`<button type="button" class="dialog-close" aria-label="${escapeHTML(pickupText("סגירה","Close"))}">×</button><h2>${escapeHTML(pickupText("בקשת פתיחת צ׳אט","Request a chat"))}</h2><p>${escapeHTML(direct?pickupText("שלחו הודעה קצרה למנהל הגמ״ח כדי לבקש לפתוח צ׳אט.","Send a short message to the manager to request a chat."):pickupText("הצ׳אט והפרטים ליצירת קשר ייפתחו לאחר אישור מנהל הגמ״ח.","The chat and contact details become available after the manager approves."))}</p><form class="form-grid"><label>${escapeHTML(pickupText("מה אתם צריכים?","What do you need?"))}<textarea name="note" required minlength="2" maxlength="1000" rows="4"></textarea></label>${eligibility.outside?`<p>${escapeHTML(eligibility.message)}</p><label class="check"><input type="checkbox" name="distanceException" required>${escapeHTML(pickupText("אני מבקש/ת חריגה מטווח השירות","I am requesting an exception to the service range"))}</label>`:""}<button type="submit" class="button button-primary">${escapeHTML(pickupText("שליחת הבקשה","Send request"))}</button></form>`;
      $(".dialog-close",dialog).onclick=()=>closeDialog(dialog);
      $("form",dialog).onsubmit=async event=>{event.preventDefault();const button=event.submitter;setButtonBusy(button,true);try{const form=event.currentTarget;const data=await api(`/api/organizations/${encodeURIComponent(organizationId)}/chat-requests`,{method:"POST",body:{note:form.elements.note.value,distanceException:Boolean(form.elements.distanceException?.checked)}});closeDialog(dialog);if(data.chatRequest.status==="approved")openChat(data.chatRequest.id);else{toast(pickupText("הבקשה נשלחה וממתינה לאישור מנהל הגמ״ח","Your request is waiting for the manager’s approval"));await showDashboard("requests")}}catch(e){toast(e.message,"error")}finally{setButtonBusy(button,false)}};
      openDialog(dialog);
    }catch(e){toast(e.message,"error")}});
  }
  function renderOrganizationChatRequests(){
    const rows=state.dashboard?.chatRequests||[];if(!rows.length)return;
    const section=document.createElement("section");section.className="dashboard-subsection";
    section.innerHTML=`<h2>${escapeHTML(pickupText("בקשות צ׳אט עם גמ״חים","Gmach chat requests"))}</h2>`+rows.map(row=>`<article class="dashboard-row"><div><h3>${window.GmachOriginalName(row.organization_name)}</h3><p>${row.direction==="incoming"?window.GmachOriginalName(row.borrower_name):escapeHTML(pickupText("בקשה ששלחתי","My request"))}</p><p>${escapeHTML(row.note)}</p>${row.distance_exception?`<p>${escapeHTML(pickupText("בקשת חריגה מטווח השירות","Service range exception request"))}</p>`:""}${row.address?`<p>${escapeHTML(row.address)} · <span dir="ltr">${escapeHTML(row.phone||"")}</span></p>`:""}</div><div><span class="status-chip ${escapeHTML(row.status)}">${escapeHTML(STATUS_LABELS[row.status]||row.status)}</span><div class="dashboard-row-actions">${row.status==="approved"?`<button class="button button-primary" data-org-chat-open="${escapeHTML(row.id)}">${escapeHTML(pickupText("פתיחת צ׳אט","Open chat"))}</button>`:""}${row.status==="pending"&&row.direction==="incoming"?['approved','declined'].map(status=>`<button class="button button-secondary" data-org-chat-status="${status}" data-org-chat-id="${escapeHTML(row.id)}">${escapeHTML(status==="approved"?pickupText("אישור פתיחת צ׳אט","Approve chat"):pickupText("דחיית הבקשה","Decline request"))}</button>`).join(""):""}${['pending','approved'].includes(row.status)&&row.direction==="outgoing"?`<button class="button button-secondary" data-org-chat-status="cancelled" data-org-chat-id="${escapeHTML(row.id)}">${escapeHTML(pickupText("ביטול בקשה","Cancel request"))}</button>`:""}</div></div></article>`).join("");
    $("#dashboard-content").prepend(section);
    $$("[data-org-chat-open]",section).forEach(button=>button.onclick=()=>openChat(button.dataset.orgChatOpen));
    $$("[data-org-chat-status]",section).forEach(button=>button.onclick=async()=>{setButtonBusy(button,true);try{await api(`/api/organization-chat-requests/${encodeURIComponent(button.dataset.orgChatId)}/status`,{method:"PATCH",body:{status:button.dataset.orgChatStatus}});await showDashboard("requests");await refreshNotifications(true)}catch(e){toast(e.message,"error")}finally{setButtonBusy(button,false)}});
  }
  function openReport(itemId) { requireAuth(() => { closeDialog($("#item-dialog")); $("#report-form").reset(); $("#report-item-id").value = itemId; openDialog($("#report-dialog")); }); }
  function showHome() { $("#organization-page-view").hidden = true; $("#dashboard-view").hidden = true; $("#home-view").hidden = false; history.replaceState(null, "", location.pathname === "/" ? "/" : location.pathname); window.scrollTo({ top: 0, behavior: "auto" }); }
  function setResultsView(mode) { state.viewMode=mode === "map" ? "map" : "list"; $("#items-grid").hidden=state.viewMode === "map" || !state.filteredItems.length; $("#map-results").hidden=state.viewMode !== "map" || !state.filteredItems.length; $("#list-view-button").classList.toggle("is-active",state.viewMode==="list"); $("#map-view-button").classList.toggle("is-active",state.viewMode==="map"); }
  function openHelpRequest() { requireAuth(() => { $("#help-request-form").reset(); $("#help-city").value=$("#city-filter").value; $("#help-title").value=$("#search-input").value; openDialog($("#help-request-dialog")); }); }
  async function openCommunityBoard(page=1,focusId=null){
    const dialog=$("#community-board-dialog"),form=$("#community-board-filter"),results=$("#community-board-results"),pages=$("#community-board-pages");
    if(!dialog.open)openDialog(dialog);
    results.innerHTML='<p>טוענים בקשות פתוחות…</p>';pages.innerHTML="";
    const params=new URLSearchParams({page:String(page)}),city=form.elements.namedItem("city").value.trim(),category=form.elements.namedItem("category").value;if(focusId)params.set("id",focusId);
    if(city)params.set("city",city);if(category)params.set("category",category);
    try{
      const [data,saved]=await Promise.all([api("/api/help-requests?"+params),state.user?api("/api/me/saved-entities").catch(()=>({saved:[]})):Promise.resolve({saved:[]})]);
      const savedIds=new Set((saved.saved||[]).filter(row=>row.entity_type==="help_request").map(row=>row.entity_id));
      results.innerHTML=data.requests.length?data.requests.map(row=>`<article class="community-board-card"><h3>${escapeHTML(row.title)}</h3><small>${escapeHTML(row.city)} · ${escapeHTML(row.category||"כללי")} · ${window.GmachOriginalName(row.requester_name||"חבר קהילה")}${row.urgency==="urgent"?" · דחוף":""}</small>${row.requested_from||row.requested_until?`<p><strong>מועד:</strong> ${row.requested_from?escapeHTML(formatDateTime(row.requested_from)):"גמיש"}${row.requested_until?" - "+escapeHTML(formatDateTime(row.requested_until)):""}</p>`:""}${row.distance_km?`<p><strong>טווח:</strong> עד ${Number(row.distance_km)} ק״מ</p>`:""}<p>${escapeHTML(row.description)}</p><div class="community-board-actions"><button class="button button-secondary button-small" type="button" data-board-save="${escapeHTML(row.id)}" aria-pressed="${savedIds.has(row.id)}">${savedIds.has(row.id)?"✓ נשמר במועדפים":"שמירה במועדפים"}</button><button class="button button-secondary button-small" type="button" data-board-share="${escapeHTML(row.id)}">שיתוף</button><button class="button button-primary button-small" type="button" data-board-offer="${escapeHTML(row.id)}">הצעת עזרה</button></div><form class="community-offer-form" data-board-offer-form="${escapeHTML(row.id)}" hidden><label>איך תוכלו לעזור?<textarea name="message" rows="3" maxlength="1000" required></textarea></label><button class="button button-primary button-small" type="submit">שליחת הצעה</button></form></article>`).join(""):'<p>אין בקשות פתוחות שמתאימות לסינון הזה.</p>';
      results.querySelectorAll('[data-board-save]').forEach(button=>button.onclick=()=>requireAuth(async()=>{const id=button.dataset.boardSave,exists=savedIds.has(id);button.disabled=true;try{if(exists){await api("/api/me/saved-entities/help_request/"+encodeURIComponent(id),{method:"DELETE"});savedIds.delete(id)}else{await api("/api/me/saved-entities",{method:"POST",body:{type:"help_request",id}});savedIds.add(id)}button.textContent=exists?"שמירה במועדפים":"✓ נשמר במועדפים";button.setAttribute("aria-pressed",String(!exists))}catch(error){toast(error.message,"error")}finally{button.disabled=false}}));
      results.querySelectorAll('[data-board-share]').forEach(button=>button.onclick=async()=>{const row=(data.requests||[]).find(x=>String(x.id)===String(button.dataset.boardShare));if(!row)return;const url=location.origin+"/community?help="+encodeURIComponent(row.id);const payload={title:row.title,text:row.description,url};try{if(navigator.share)await navigator.share(payload);else{await navigator.clipboard.writeText(url);toast("הקישור לבקשה הועתק")}}catch(error){if(error?.name!=="AbortError")toast("לא הצלחנו לשתף את הבקשה","error")}});
      results.querySelectorAll('[data-board-offer]').forEach(button=>button.onclick=()=>requireAuth(()=>{const offer=results.querySelector(`[data-board-offer-form="${button.dataset.boardOffer}"]`);offer.hidden=false;offer.querySelector("textarea").focus()}));
      results.querySelectorAll('[data-board-offer-form]').forEach(offer=>offer.onsubmit=async event=>{event.preventDefault();const button=offer.querySelector('[type="submit"]');button.disabled=true;try{await api("/api/help-requests/"+encodeURIComponent(offer.dataset.boardOfferForm)+"/offers",{method:"POST",body:{message:offer.elements.namedItem("message").value.trim()}});offer.hidden=true;toast("ההצעה נשלחה למבקש העזרה")}catch(error){toast(error.message,"error")}finally{button.disabled=false}});
      const totalPages=Math.ceil(data.total/data.pageSize);if(!focusId&&totalPages>1){pages.innerHTML=`<button class="button button-secondary button-small" type="button" data-board-page="${page-1}" ${page<=1?"disabled":""}>הקודם</button><span>עמוד ${page} מתוך ${totalPages}</span><button class="button button-secondary button-small" type="button" data-board-page="${page+1}" ${page>=totalPages?"disabled":""}>הבא</button>`;pages.querySelectorAll('[data-board-page]').forEach(button=>button.onclick=()=>openCommunityBoard(Number(button.dataset.boardPage)))}
    }catch(error){results.innerHTML=`<p role="alert">${escapeHTML(error.message||"לא ניתן לטעון את לוח הבקשות")}</p>`}
  }
  async function submitHelpRequest(event) { event.preventDefault(); const form=event.currentTarget; const button=event.submitter; setButtonBusy(button,true,"מפרסמים…"); try { await api("/api/help-requests",{method:"POST",body:{title:$("#help-title").value,city:$("#help-city").value,category:$("#help-category").value,description:$("#help-description").value,urgency:$("#help-urgent").checked?"urgent":"normal",requestedFrom:$("#help-from").value||null,requestedUntil:$("#help-until").value||null,distanceKm:$("#help-distance").value||null}}); form.reset(); closeDialog($("#help-request-dialog")); toast("בקשת העזרה פורסמה לגמ״חים הרלוונטיים"); await refreshAccountSnapshot(); } catch(error){toast(error.message,"error");} finally{setButtonBusy(button,false);} }
  function openReview(requestId) { const row=(state.dashboard?.requests||[]).find(x=>String(x.id)===String(requestId)); $("#review-request-id").value=requestId; $("#review-form").reset(); $("#review-request-id").value=requestId; const branchRow=$("#review-branch-rating-row");branchRow.hidden=!row?.branch_id;$("#review-branch-rating").disabled=!row?.branch_id; openDialog($("#review-dialog")); }
  async function submitReview(event) { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"מפרסמים…"); try { await api("/api/reviews",{method:"POST",body:{requestId:$("#review-request-id").value,organizationRating:Number($("#review-organization-rating").value),itemRating:Number($("#review-item-rating").value),serviceRating:Number($("#review-service-rating").value),branchRating:$("#review-branch-rating").disabled?null:Number($("#review-branch-rating").value),comment:$("#review-comment").value}}); closeDialog($("#review-dialog")); toast("תודה! דירוג הגמ״ח והפריט פורסם"); await Promise.all([loadDiscovery(),loadItems()]); } catch(error){toast(error.message,"error");} finally{setButtonBusy(button,false);} }
  function resetFilters() { const hadDate = Boolean($("#date-filter").value); $("#search-form").reset(); $("#category-filter").value = ""; $("#hero-category-filter").value = ""; updateCatalogSubcategories(); $("#condition-filter").value = ""; $("#type-filter").value=""; $("#available-only").checked = true; state.activeCategory = ""; $$('[data-category]').forEach(button => button.classList.toggle("is-active", button.dataset.category === "")); if (hadDate) loadItems(); else applyFilters(); }
  async function handleEmptyAction() {
    if (!state.serverAvailable) { await detectServer(); await loadItems(); return; }
    if (state.items.length === 0) { openGmachForm(); return; }
    resetFilters();
  }

  const INFO_CONTENT = Object.freeze({
    safety: '<h2 id="info-dialog-title">כללי השאלה בטוחה</h2><p>גמ״ח ברגע מחבר בין מנהלי גמ״חים לשואלים. האחריות לבדיקת הפריט, לתיאום ולשימוש נשארת בידי שני הצדדים.</p><h3>לפני האיסוף</h3><ul><li>ודאו שהפריט, המידות והמועד מתאימים לצורך.</li><li>תאמו מקום ושעת איסוף ברורים בתוך הצ׳אט באתר.</li><li>בדקו אם הפריט מוצע ללא תשלום או בתשלום סמלי. אל תמסרו פרטי תשלום רגישים בצ׳אט.</li><li>בציוד רפואי, בטיחותי או לתינוקות יש לוודא התאמה ותקינות עם גורם מוסמך.</li></ul><h3>בעת ההחזרה</h3><ul><li>החזירו בזמן, נקי ובמצב שבו התקבל.</li><li>דווחו מיד על נזק, תקלה או עיכוב.</li><li>דווחו להנהלת האתר על תשלום שלא פורסם או מעבר לסמלי, מידע מטעה או ציוד מסוכן.</li></ul>',
    terms: `<h2 id="info-dialog-title">תנאי שימוש בגמ״ח ברגע</h2><p><strong>עודכן לאחרונה: 24 בספטמבר 2026.</strong> פתיחת חשבון, פרסום או שליחת בקשה מהווים הסכמה לתנאים אלה.</p><h3>1. תפקיד האתר</h3><p>גמ״ח ברגע הוא פלטפורמת תיווך טכנולוגית המחברת בין גמ״חים לבין אנשים המבקשים ציוד. האתר אינו הבעלים, המחזיק, המשאיל, היצרן, המוביל, המבטח או המפקח של הפריטים, ואינו צד להסכם שנוצר בין המשתמשים. כל מסירה, שימוש והחזרה נעשים ישירות ובאחריות הצדדים.</p><h3>2. ללא תשלום או בתשלום סמלי — ללא ערבות מצד האתר</h3><p>ייעוד האתר הוא גמילות חסדים. מנהל גמ״ח מתחייב לגבות לכל היותר תשלום סמלי ולציין בפרסום אם נדרש תשלום. למרות זאת, האתר אינו מתחייב שכל משתמש יעמוד בכללים, שהפריט יימסר בתנאים שפורסמו, שיהיה זמין, תקין, חוקי, נקי, בטוח או מתאים, או שהמידע בפרסום יהיה מלא. דרישת תשלום מעבר לסמלי או תנאי שלא פורסם מראש מחייבים הפסקת ההתקשרות ודיווח להנהלת האתר. פיקדון סביר מותר רק אם צוין מראש ואינו תשלום מוסווה. הפיקדון נועד אך ורק להבטחת החזרת המוצר כפי שנלקח ולא ליצירת רווח. האתר אינו מחזיק בפיקדון, אינו צד להסדר הפיקדון ואינו מתחייב להשבתו או למימושו.</p><h3>3. חשבון ואבטחה</h3><ul><li>יש למסור פרטים נכונים ולהשתמש במייל השייך למשתמש.</li><li>אין להתחזות, להעביר חשבון, לעקוף חסימה או להטעות.</li><li>המשתמש אחראי לסיסמה, לאימות הדו־שלבי ולפעולות בחשבון.</li><li>אין באתר גיל מינימום טכני גורף. משתמש קטין ישתמש באתר בהסכמת הורה או אפוטרופוס ובפיקוחו ככל שהדבר נדרש לפי דין ובהתאם לנסיבות.</li></ul><h3>4. הפעילות מתנהלת באתר</h3><p>עמוד הגמ״ח, המלאי, הבקשות, ההודעות והעדכונים מנוהלים בגמ״ח ברגע. אין צורך באתר חיצוני, ואין לפרסם קישור שנועד לעקוף את מנגנוני הבטיחות, הדיווח או התיעוד.</p><h3>5. אחריות מנהל גמ״ח</h3><ul><li>לפרסם רק ציוד שבסמכותו להציע ולתאר במדויק מצב, כמות, מגבלות ותנאים.</li><li>לעדכן זמינות, להשיב לבקשות ולשמור על פרטיות השואלים.</li><li>לבדוק תקינות סבירה ולהתריע על בלאי, סיכון או חלק חסר.</li><li>לא לפרסם ציוד אסור, גנוב, מזויף, נשק, תרופות מרשם או ציוד מסוכן שלא כדין.</li></ul><h3>6. אחריות השואל</h3><ul><li>לבדוק לפני האיסוף שהפריט מתאים, שלם ובטוח לצורך.</li><li>להשתמש לפי הוראות ודין ולהחזיר בזמן ובמצב שבו התקבל.</li><li>לדווח מיד על נזק, אובדן, תקלה או עיכוב.</li><li>בציוד רפואי, בטיחותי, חשמלי או לתינוקות לקבל ייעוץ מגורם מוסמך; האתר אינו נותן ייעוץ מקצועי.</li></ul><h3>7. צ׳אט, בקשות וביקורות</h3><p>אישור בקשה אינו התחייבות של האתר שההשאלה תושלם. הצ׳אט נועד לתיאום ענייני בלבד. אסורים ספאם, איומים, הטרדה, תוכן פוגעני, פרטי צד שלישי או דרישות תשלום שלא פורסמו מראש או החורגות מתשלום סמלי. ביקורת חייבת לשקף חוויה אמיתית.</p><h3>8. דיווח חובה</h3><p><strong>מי שנתקל בבעיה עם גמ״ח, אדם, פריט או התנהלות מסוימת נדרש לדווח להנהלת האתר</strong> באמצעות כפתור הדיווח או התמיכה. בכלל זה דרישת תשלום שלא פורסמה מראש או החורגת מתשלום סמלי, מידע מטעה, ציוד מסוכן, הטרדה, פגיעה בפרטיות, אי־מסירה, אי־החזרה או חשד להונאה. יש לשמור תיעוד ולשתף פעולה בבירור. בסכנה מיידית יש לפנות לגורמי החירום.</p><h3>9. בדיקה ואכיפה</h3><p>הנהלת האתר רשאית לבדוק פרסומים, לבקש הבהרות, להסתיר תוכן, להגביל פעולות ולהשעות או למחוק חשבון. סימון אימות משקף בדיקה מוגבלת במועד מסוים ואינו ערבות לאדם, לגמ״ח או לפריט.</p><h3>10. תוכן וקניין רוחני</h3><p>המעלה תוכן מצהיר שיש לו זכות לעשות בו שימוש ומעניק לאתר רישיון להציג, לאחסן ולעבד אותו לצורך הפעלת השירות, אבטחתו וקידומו.</p><h3>11. זמינות והגבלת אחריות</h3><p>השירות ניתן כפי שהוא וייתכנו תקלות או שינויים. האתר אינו צד להשאלה, להזמנה, למסירה, להחזרה או להסדר פיקדון ואינו מתחייב לזמינות מוצר, לביצוע עסקה או להתנהלות מי מהצדדים. בכפוף לדין, האתר והנהלתו אינם אחראים למצב הפריט, התאמתו, בטיחותו, מסירתו, החזרתו, נזק, אובדן, גניבה, פיקדון, מחלוקת או מצג של משתמש. האחריות לבדיקה ולהחלטה להתקשר מוטלת על הצדדים, ואין בכך לגרוע מזכות שלא ניתן לוותר עליה לפי דין.</p><h3>12. סיום ודין</h3><p>ניתן להפסיק שימוש ולבקש מחיקת חשבון, בכפוף לשמירת מידע הנדרש לבירור, אבטחה או דין. על השירות יחול הדין הישראלי. לפניות בנוגע לתנאים יש להשתמש בערוצי התמיכה באתר. מסמך זה אינו תחליף לייעוץ משפטי פרטני.</p>`,
    privacy: `<h2 id="info-dialog-title">מדיניות פרטיות</h2><p><strong>עודכנה לאחרונה: 24 בספטמבר 2026.</strong> מדיניות זו מסבירה איזה מידע נאסף, מדוע, למי הוא נחשף ומהן אפשרויות המשתמש.</p><h3>1. המידע שנאסף</h3><ul><li>פרטי חשבון: שם, מייל מאומת, גיבוב סיסמה, תפקיד ומועדי כניסה.</li><li>פרטי גמ״ח ופריטים: עיר, שכונה, תיאור, שעות, תמונות, מלאי ותנאים.</li><li>מידע תפעולי פרטי: טלפון וכתובת איסוף שאינם מוצגים בקטלוג הפתוח.</li><li>פעילות: בקשות, תאריכים ושעות, כמויות, סטטוסי מלאי, תנאי פיקדון ואישורם, צ׳אט, מועדפים, ביקורות, דיווחים ופניות.</li><li>מידע טכני ואבטחה: כתובת IP או גיבוב שלה, אירועי התחברות ויומני שגיאות.</li></ul><h3>2. מטרות</h3><p>המידע משמש ליצירת ואימות חשבון, הפעלת הקטלוג, חיבור ותיאום בין הצדדים, ניהול מלאי ובקשות, תמיכה, אבטחה, מניעת הונאה, אכיפת התנאים ושיפור השירות.</p><h3>3. מסירה והסכמה</h3><p>אין חובה כללית למסור מידע, אך ללא שדות החובה לא ניתן לספק חלק מהשירות. העיבוד נעשה לצורך מתן השירות, על בסיס הסכמה במקומות המתאימים ולצורך אינטרסים לגיטימיים של אבטחה ומניעת שימוש לרעה.</p><h3>4. מי רואה מה</h3><p>שם הגמ״ח, עיר, תיאור, פריטים וזמינות עשויים להיות ציבוריים. מייל, סיסמה, טלפון וכתובת איסוף אינם מוצגים בקטלוג. מידע תיאום נחשף רק לצדדים הרלוונטיים ובהתאם להרשאות. מנהלי מערכת מורשים יכולים לגשת למידע רק לצורכי הפעלה, תמיכה, אבטחה וטיפול בדיווחים.</p><h3>5. ספקים</h3><p>ספקי תשתית מספקים אירוח, בסיס נתונים, אחסון ואבטחה. ספק שירותי דואר אלקטרוני משמש לשליחת קודי אימות, איפוס סיסמה והודעות תפעוליות. הספקים מקבלים רק את המידע הדרוש ועשויים לעבדו מחוץ לישראל בהתאם לתשתיותיהם ולדין.</p><h3>6. אבטחה</h3><p>האתר משתמש בהצפנת תעבורה, עוגיות מאובטחות, הרשאות שרת, הגבלת ניסיונות, אימות מייל, אימות דו־שלבי וגיבוב סיסמאות. אין מערכת חסינה לחלוטין; אין לשלוח בצ׳אט סיסמאות, אשראי, מסמכים רפואיים או מידע רגיש שאינו הכרחי.</p><h3>7. שמירה ומחיקה</h3><p>מידע נשמר כל עוד החשבון פעיל או ככל שנדרש למטרות שלשמן נאסף. לאחר מחיקה עשוי להישמר מידע מצומצם לתקופה סבירה לצורך אבטחה, מניעת הונאה, בירור, גיבוי או חובה חוקית.</p><h3>8. זכויות</h3><p>ניתן לעיין במידע באזור האישי, לתקן פרטים, לשנות סיסמה ולמחוק חשבון. ניתן לפנות להנהלה בבקשת עיון, תיקון, מחיקה או התנגדות; לפני פעולה רגישה תידרש הוכחת זהות.</p><h3>9. עוגיות</h3><p>נעשה שימוש בעוגיית התחברות מאובטחת ובאחסון מקומי להגדרות תצוגה. אין שימוש מיועד לפרסום התנהגותי. חסימתם עלולה לפגוע בכניסה או בהעדפות.</p><h3>10. ילדים ושינויים</h3><p>אין באתר גיל מינימום טכני גורף. כאשר הדין או נסיבות השימוש מחייבים הסכמת הורה או אפוטרופוס, השימוש של קטין ייעשה בהסכמה ובפיקוח מתאימים. הורה או אפוטרופוס הסבור שנמסר מידע ללא הרשאה מתבקש לפנות להנהלה. שינוי מהותי במדיניות יוצג באתר ותאריך העדכון ישתנה.</p><h3>11. אירוע פרטיות</h3><p>חשד לחשיפה, התחזות, הטרדה או שימוש במידע שלא לצורך מחייב דיווח מיידי להנהלת האתר באמצעות מנגנוני התמיכה והדיווח.</p>`
  });
  const INFO_CONTENT_EN = Object.freeze({
    safety: '<h2 id="info-dialog-title">Safe borrowing guidelines</h2><p>Gmach Berega connects gmach managers with borrowers. Responsibility for checking the item, coordinating the handoff and using it safely remains with both parties.</p><h3>Before pickup</h3><ul><li>Make sure the item, dimensions and dates fit your needs.</li><li>Coordinate a clear pickup place and time through the site chat.</li><li>Check whether the item is free or requires a nominal fee. Do not share sensitive payment details in chat.</li><li>For medical, safety-related or baby equipment, confirm suitability and condition with a qualified professional.</li></ul><h3>When returning</h3><ul><li>Return the item on time, clean and in the condition in which it was received.</li><li>Report damage, malfunction or delay immediately.</li><li>Report undisclosed or excessive payments, misleading information or unsafe equipment to the site administrator.</li></ul>',
    terms: '<h2 id="info-dialog-title">Gmach Berega Terms of Use</h2><p><strong>Last updated: September 24, 2026.</strong> Creating an account, publishing content or submitting a request constitutes acceptance of these terms.</p><h3>1. Role of the site</h3><p>Gmach Berega is a technology matchmaking platform connecting gmachs with people seeking equipment. The site is not the owner, holder, lender, manufacturer, carrier, insurer or supervisor of the items and is not a party to agreements formed between users. Every handoff, use and return takes place directly between, and under the responsibility of, the parties.</p><h3>2. Free service — no site guarantee</h3><p>The site is intended for community lending. Gmach managers may charge at most a nominal fee and must disclose it in the listing. The site nevertheless does not guarantee that every user will follow the rules, that an item will in fact be provided under the disclosed terms, or that it will be available, functional, lawful, clean, safe or suitable, or that a listing is complete. A fee exceeding a nominal amount or an undisclosed condition should end the transaction and be reported to the site administrator. A reasonable deposit is permitted only when disclosed in advance and must not be a disguised fee. A deposit is intended solely to secure return of the item as received, not to create profit. The site does not hold deposits, is not a party to deposit arrangements and does not guarantee their refund or enforcement.</p><h3>3. Account and security</h3><ul><li>Provide accurate details and use an email address belonging to you.</li><li>Do not impersonate another person, transfer an account, bypass a restriction or mislead others.</li><li>You are responsible for your password, two-factor authentication and account activity.</li><li>The site does not impose a blanket technical minimum age. Where law or circumstances require parent or guardian consent, a minor should use the service with the appropriate consent and supervision.</li></ul><h3>4. Activity stays on the platform</h3><p>The gmach page, inventory, requests, messages and updates are managed in Gmach Berega. No outside website is required, and users must not publish links intended to bypass the platform’s safety, reporting or record-keeping mechanisms.</p><h3>5. Gmach manager responsibilities</h3><ul><li>List only equipment you are authorized to offer and describe its condition, quantity, limitations and terms accurately.</li><li>Keep availability current, respond to requests and protect borrowers’ privacy.</li><li>Perform a reasonable condition check and disclose wear, risks or missing parts.</li><li>Do not list prohibited, stolen or counterfeit goods, weapons, prescription medication, or unlawfully dangerous equipment.</li></ul><h3>6. Borrower responsibilities</h3><ul><li>Before pickup, check that the item is suitable, complete and safe for the intended use.</li><li>Use it according to instructions and law, and return it on time and in the condition received.</li><li>Report damage, loss, malfunction or delay immediately.</li><li>For medical, safety, electrical or baby equipment, seek guidance from a qualified professional; the site does not provide professional advice.</li></ul><h3>7. Chat, requests and reviews</h3><p>Approval of a request is not a promise by the site that the loan will be completed. Chat is for relevant coordination only. Spam, threats, harassment, abusive content, third-party personal data and undisclosed payments or charges exceeding a nominal fee are prohibited. Reviews must reflect a genuine experience.</p><h3>8. Mandatory reporting</h3><p><strong>Anyone who encounters a problem involving a gmach, person, item or conduct should report it to the site administrator</strong> using the reporting or support tools. This includes undisclosed payments or charges exceeding a nominal fee, misleading information, unsafe equipment, harassment, privacy violations, failure to provide or return an item, or suspected fraud. Preserve relevant records and cooperate with review. In an immediate danger, contact the appropriate emergency services.</p><h3>9. Review and enforcement</h3><p>The site administration may review listings, request clarification, hide content, restrict actions, and suspend or delete accounts. A verification mark reflects a limited check at a particular time and is not a guarantee of a person, gmach or item.</p><h3>10. Content and intellectual property</h3><p>A user uploading content represents that they have the right to use it and grants the site a license to display, store and process it as necessary to operate, secure and promote the service.</p><h3>11. Availability and limitation of liability</h3><p>The service is provided as-is and may experience interruptions or changes. The site is not a party to a loan, booking, handoff, return or deposit arrangement and does not guarantee item availability, completion of a transaction or the conduct of either party. Subject to applicable law, the site and its administration are not responsible for an item’s condition, suitability, safety, delivery or return; damage, loss, theft, deposits, disputes, or user representations. Each party remains responsible for its checks and decision to proceed. Nothing in these terms limits rights that cannot lawfully be waived.</p><h3>12. Termination and law</h3><p>You may stop using the service and request account deletion, subject to retention of information required for review, security or legal obligations. Israeli law applies. Questions about these terms should be submitted through the site support channels. This document is not a substitute for individual legal advice.</p>',
    privacy: '<h2 id="info-dialog-title">Privacy Policy</h2><p><strong>Last updated: September 24, 2026.</strong> This policy explains what information is collected, why it is used, who can access it and what choices users have.</p><h3>1. Information collected</h3><ul><li>Account information: name, verified email, password hash, role and sign-in timestamps.</li><li>Gmach and item information: city, neighborhood, description, hours, images, inventory and terms.</li><li>Private operational information: phone number and pickup address that are not displayed in the public catalog.</li><li>Activity information: requests, dates and times, quantities, inventory status, deposit terms and approvals, chat, favorites, reviews, reports and support requests.</li><li>Technical and security information: IP address or a hash of it, sign-in events and error logs.</li></ul><h3>2. Purposes</h3><p>Information is used to create and verify accounts, operate the catalog, connect and coordinate between parties, manage inventory and requests, provide support, maintain security, prevent fraud, enforce the terms and improve the service.</p><h3>3. Providing information and consent</h3><p>There is no general obligation to provide information, but required fields are necessary for some features. Processing is performed to provide the service, on consent where appropriate, and for legitimate interests such as security and abuse prevention.</p><h3>4. Who sees what</h3><p>Gmach name, city, description, items and availability may be public. Email, password, phone number and pickup address are not displayed in the catalog. Coordination information is shared only with relevant parties according to permissions. Authorized administrators may access information only for operation, support, security and handling reports.</p><h3>5. Service providers</h3><p>Infrastructure providers supply hosting, database, storage and security services. An email delivery provider sends verification codes, password resets and operational email. Providers receive only information necessary for their role and may process it outside Israel according to their infrastructure and applicable law.</p><h3>6. Security</h3><p>The site uses transport encryption, secure cookies, server-side authorization, rate limits, email verification, two-factor authentication and password hashing. No system is completely immune from risk; do not send passwords, card details, medical documents or unnecessary sensitive information through chat.</p><h3>7. Retention and deletion</h3><p>Information is retained while an account is active or as needed for the purpose for which it was collected. After deletion, limited information may be retained for a reasonable period for security, fraud prevention, investigation, backup or legal obligations.</p><h3>8. Rights</h3><p>You can review information in your account, correct details, change your password and delete your account. You may contact the administration to request access, correction, deletion or objection; identity verification may be required before a sensitive action.</p><h3>9. Cookies and local storage</h3><p>A secure sign-in cookie and local storage are used for display preferences. The site is not intended to use behavioral advertising. Blocking these technologies may affect sign-in or preferences.</p><h3>10. Minors and changes</h3><p>The site does not impose a blanket technical minimum age. Where law or circumstances require parent or guardian consent, a minor’s use should take place with appropriate consent and supervision. A parent or guardian who believes information was provided without authorization should contact the administration. Material policy changes will be presented on the site and the update date will change.</p><h3>11. Privacy incidents</h3><p>Suspected exposure, impersonation, harassment or unnecessary use of information should be reported promptly using the site’s support and reporting mechanisms.</p>'
  });
  function openInfo(type) {
    const english=localStorage.getItem("gmach-language")==="en",source=english?INFO_CONTENT_EN:INFO_CONTENT;
    let content=source[type]||source.safety;
    if(type==="terms") content=content
      .replace("<h3>9. בדיקה ואכיפה</h3><p>הנהלת האתר רשאית לבדוק פרסומים, לבקש הבהרות, להסתיר תוכן, להגביל פעולות ולהשעות או למחוק חשבון. סימון אימות משקף בדיקה מוגבלת במועד מסוים ואינו ערבות לאדם, לגמ״ח או לפריט.</p>","<h3>9. דיווח ואכיפה</h3><p>גמ״חים ומוצרים מתפרסמים באחריות המפרסם ואינם מקבלים סימון אימות מטעם האתר. הנהלת האתר רשאית בעקבות דיווח או צורך בטיחותי לבדוק פרסומים, להסתיר תוכן ולהגביל חשבונות.</p>")
      .replace("<h3>9. Review and enforcement</h3><p>The site administration may review listings, request clarification, hide content, restrict actions, and suspend or delete accounts. A verification mark reflects a limited check at a particular time and is not a guarantee of a person, gmach or item.</p>","<h3>9. Reporting and enforcement</h3><p>Gmachs and items are published under the publisher’s responsibility and do not receive a site verification mark. Following a report or safety concern, the administration may review or hide content and restrict accounts.</p>");
    if(type==="privacy") content=content
      .replace("שם הגמ״ח, עיר, תיאור, פריטים וזמינות עשויים להיות ציבוריים. מייל, סיסמה, טלפון וכתובת איסוף אינם מוצגים בקטלוג. מידע תיאום נחשף רק לצדדים הרלוונטיים ובהתאם להרשאות.","שם הגמ״ח, כתובתו, טלפון הגמ״ח, עיר, תיאור, שעות, פריטים וזמינות הם מידע ציבורי. מייל, סיסמה, כתובות פרטיות ומיקום נוכחי של משתמש אינם מוצגים לציבור. לאחר שמירת מלאי לבקשה יוצגו לבעל הגמ״ח שם השואל, עירו ומספר הטלפון שלו לצורך התיאום.")
      .replace("Gmach name, city, description, items and availability may be public. Email, password, phone number and pickup address are not displayed in the catalog. Coordination information is shared only with relevant parties according to permissions.","A gmach’s name, address, contact phone, city, description, hours, items and availability are public. A user’s email, password, private addresses and current location are not public. Once inventory is held for a request, the gmach manager can see the borrower’s name, city and phone number for coordination.");
    $("#info-dialog-content").innerHTML=content; openDialog($("#info-dialog"));
  }

  window.addEventListener("gmach:open-item",event=>{const id=event?.detail?.id;if(id)openItem(id);});
  window.addEventListener("gmach:open-organization",event=>{const id=event?.detail?.id;if(id)openOrganization(id);});
  window.addEventListener("gmach:route",event=>{const path=event?.detail?.path;if(path==="/catalog")window.setTimeout(()=>$("#catalog")?.scrollIntoView(),0);});
  function navigateHomeSection(path,targetId){
    $("#organization-page-view").hidden=true;
    $("#dashboard-view").hidden=true;
    $("#home-view").hidden=false;
    history.pushState({route:path},"",path);
    const target=$("#"+targetId);
    if(target) target.scrollIntoView({behavior:"auto",block:"start"});
  }
  function setupEvents() {
    $("#initiative-register")?.addEventListener("click", () => { setAuthMode("register"); openDialog($("#auth-dialog")); });
    $("#current-year").textContent = new Date().getFullYear(); const today = new Date().toISOString().slice(0, 10); $("#date-filter").min = today; const nowLocal=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16); $("#request-start").min=nowLocal; $("#request-end").min=nowLocal; $("#request-start").addEventListener("change",()=>{$("#request-end").min=$("#request-start").value||nowLocal;checkRequestedAvailability();}); $("#request-end").addEventListener("change",checkRequestedAvailability); $("#request-quantity").addEventListener("change",checkRequestedAvailability); $("#item-deposit-required").addEventListener("change",()=>{$("#item-deposit-amount-row").hidden=!$("#item-deposit-required").checked;$("#item-deposit-amount").required=$("#item-deposit-required").checked;});
    $("#mobile-menu-button").addEventListener("click", () => { const menu = $("#mobile-menu"); menu.hidden = !menu.hidden; $("#mobile-menu-button").setAttribute("aria-expanded", String(!menu.hidden)); }); $$("#mobile-menu a, #mobile-menu button").forEach(el => el.addEventListener("click", () => { $("#mobile-menu").hidden = true; $("#mobile-menu-button").setAttribute("aria-expanded", "false"); }));
    const cleanSectionRoutes={"/catalog":"catalog","/how-it-works":"how-it-works","/gmachim":"gmachim"};
    $$('a[href="/catalog"],a[href="/how-it-works"],a[href="/gmachim"]').forEach(link=>link.addEventListener("click",event=>{
      if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
      const targetId=cleanSectionRoutes[link.getAttribute("href")];if(!targetId)return;
      event.preventDefault();navigateHomeSection(link.getAttribute("href"),targetId);
    }));

    $("#search-form").addEventListener("submit", async event => { event.preventDefault(); $("#category-filter").value=$("#hero-category-filter").value; if ($("#date-filter").value) await loadItems(); else applyFilters(); const details={query:$("#search-input").value.trim(),city:$("#city-filter").value,category:$("#category-filter").value}; analytics(state.filteredItems.length ? "search" : "no_results",details); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); }); ["#city-filter", "#category-filter", "#subcategory-filter", "#condition-filter", "#type-filter", "#available-only", "#sort-select"].forEach(selector => $(selector).addEventListener("change", () => { if (selector === "#category-filter") { state.activeCategory = $(selector).value; updateCatalogSubcategories(); $$("[data-category]").forEach(button => button.classList.toggle("is-active", button.dataset.category === state.activeCategory)); } applyFilters(); })); $("#date-filter").addEventListener("change", loadItems);
    let suggestTimer; $("#search-input").addEventListener("input", () => { clearTimeout(suggestTimer); suggestTimer=setTimeout(() => loadDiscovery($("#search-input").value.trim()),300); });
    $("#list-view-button").addEventListener("click", () => setResultsView("list")); $("#map-view-button").addEventListener("click", () => setResultsView("map"));
    $("#path-borrower").addEventListener("click", () => $("#search-input").focus()); $("#path-manager").addEventListener("click", () => openGmachForm());
    ["#nav-help-request","#mobile-help-request"].forEach(selector => $(selector).addEventListener("click", openHelpRequest));
    ["#nav-community-board","#mobile-community-board"].forEach(selector=>$(selector).addEventListener("click",()=>openCommunityBoard(1)));
    $("#community-board-filter").addEventListener("submit",event=>{event.preventDefault();openCommunityBoard(1)});
    $("#filters-button").addEventListener("click", () => { const panel = $("#filter-panel"); panel.hidden = !panel.hidden; $("#filters-button").setAttribute("aria-expanded", String(!panel.hidden)); }); $("#clear-filters").addEventListener("click", resetFilters); $("#empty-clear-button").addEventListener("click", handleEmptyAction); $("#all-categories-button").addEventListener("click", () => { resetFilters(); $("#catalog").scrollIntoView({ behavior: "smooth" }); });
    $$('[data-category]').forEach(button => button.addEventListener("click", () => { state.activeCategory = button.dataset.category; $("#category-filter").value = button.dataset.category; $("#hero-category-filter").value = button.dataset.category; updateCatalogSubcategories(); $$('[data-category]').forEach(other => other.classList.toggle("is-active", other === button)); applyFilters(); $("#catalog").scrollIntoView({ behavior: "smooth", block: "start" }); })); $("#load-more-button").addEventListener("click", () => { state.visibleCount += 8; renderItems(); });
    $$('[data-close-dialog]').forEach(button => button.addEventListener("click", () => closeDialog(button.closest("dialog")))); $$("dialog").forEach(dialog => { dialog.addEventListener("click", event => { if (event.target === dialog) closeDialog(dialog); }); dialog.addEventListener("close", () => { if (dialog.id === "chat-dialog") { stopChatPolling(); state.chatRequestId = null; } if (dialog.id === "item-form-dialog") $("#item-gmach").disabled = false; if (!$("dialog[open]")) document.body.classList.remove("dialog-open"); }); }); $$('[data-auth-mode]').forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

    $("#auth-form").addEventListener("submit", async event => {
      event.preventDefault(); const form = event.currentTarget; const button = $("#auth-submit"); setButtonBusy(button, true, state.authMode === "register" ? "יוצרים חשבון…" : "נכנסים…");
      try { if (!state.serverAvailable) throw new Error("ההרשמה אינה זמינה כרגע"); const body = { email: $("#auth-email").value.trim(), password: $("#auth-password").value }; if (state.authMode === "register") { Object.assign(body,{fullName:$("#auth-name").value.trim(),phone:$("#auth-phone").value.trim(),city:$("#auth-city").value.trim(),address:$("#auth-address").value.trim(),preferredLanguage:localStorage.getItem("gmach-language")==="en"?"en":"he",termsAccepted:$("#auth-consent").checked,operationalEmailsAccepted:$("#auth-operational-consent").checked,communityEmailsAccepted:$("#auth-community-consent").checked,registrationIntent:document.querySelector('input[name="auth-account-intent"]:checked')?.value||"user",turnstileToken:window.GmachTurnstile?.token("register")||null});sessionStorage.setItem("gmach-registration-intent",body.registrationIntent); } else { body.turnstileToken=window.GmachTurnstile?.token("login")||null; } let data = await api(`/api/auth/${state.authMode}`, { method: "POST", body }); if (data.verificationRequired) { state.pendingVerificationEmail = data.email; form.reset(); closeDialog($("#auth-dialog")); $("#verify-email-code").value = ""; openDialog($("#verify-email-dialog")); toast("קוד אימות נשלח למייל"); return; } if (data.requiresTwoFactor) { const code = translatedPrompt("הקלידו את הקוד מאפליקציית Authenticator"); if (!code) throw new Error("הכניסה בוטלה"); data = await api("/api/auth/2fa/verify-login", { method: "POST", body: { challenge: data.challenge, code } }); } await finishAuthentication(data.user, form); }
      catch (error) { if(error.turnstileRequired){window.GmachTurnstile?.requireLogin?.();window.GmachTurnstile?.reset?.("login");} if (error.verificationRequired && error.email) { state.pendingVerificationEmail = error.email; closeDialog($("#auth-dialog")); $("#verify-email-code").value = ""; openDialog($("#verify-email-dialog")); toast("שלחו קוד חדש כדי להשלים את האימות"); } else toast(error.message || "לא הצלחנו להיכנס", "error"); } finally { setButtonBusy(button, false); setAuthMode(state.authMode); }
    });
    $("#verify-email-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "מאמתים…"); try { const intent=sessionStorage.getItem("gmach-registration-intent")||"user"; const data = await api("/api/auth/verify-email", { method: "POST", body: { email: state.pendingVerificationEmail, code: $("#verify-email-code").value } }); closeDialog($("#verify-email-dialog")); await finishAuthentication(data.user); sessionStorage.removeItem("gmach-registration-intent"); toast("כתובת המייל אומתה בהצלחה"); if(intent==="owner"){toast("החשבון מוכן. עכשיו פותחים את הגמ״ח הראשון.");window.setTimeout(()=>openGmachForm(),0);} } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#resend-verification").addEventListener("click", async event => { const button = event.currentTarget; setButtonBusy(button, true, "שולחים…"); try { await api("/api/auth/resend-verification", { method: "POST", body: { email: state.pendingVerificationEmail } }); toast("קוד חדש נשלח למייל"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#forgot-password-button").addEventListener("click", () => { closeDialog($("#auth-dialog")); $("#reset-email").value=$("#auth-email").value; $("#forgot-password-form").hidden=false; $("#reset-password-form").hidden=true; openDialog($("#reset-password-dialog")); });
    $("#forgot-password-form").addEventListener("submit", async event => { event.preventDefault(); const button=event.submitter; setButtonBusy(button,true,"שולחים…"); try { await api("/api/auth/forgot-password",{method:"POST",body:{email:$("#reset-email").value}}); $("#forgot-password-form").hidden=true; $("#reset-password-form").hidden=false; toast("אם קיים חשבון, קוד איפוס נשלח למייל"); } catch(error) { toast(error.message,"error"); } finally { setButtonBusy(button,false); } });
    $("#reset-password-form").addEventListener("submit", async event => { event.preventDefault(); const form=event.currentTarget; const button=event.submitter; setButtonBusy(button,true,"שומרים…"); try { await api("/api/auth/reset-password",{method:"POST",body:{email:$("#reset-email").value,code:$("#reset-code").value,newPassword:$("#reset-new-password").value}}); form.reset(); closeDialog($("#reset-password-dialog")); setAuthMode("login"); openDialog($("#auth-dialog")); toast("הסיסמה שונתה. אפשר להיכנס עכשיו"); } catch(error) { toast(error.message,"error"); } finally { setButtonBusy(button,false); } });
    $("#inventory-form").addEventListener("submit",async event=>{event.preventDefault();const form=event.currentTarget;const button=event.submitter;setButtonBusy(button,true,"שומרים…");try{const itemId=$("#inventory-item-id").value;await api("/api/items/"+encodeURIComponent(itemId)+"/inventory",{method:"POST",body:{startsAt:$("#inventory-start").value,endsAt:$("#inventory-end").value,quantity:Number($("#inventory-quantity").value),reason:$("#inventory-reason").value}});form.reset();$("#inventory-item-id").value=itemId;await refreshInventoryManager(itemId);toast("חסימת המלאי נשמרה.");}catch(e){toast(e.message||"לא הצלחנו לשמור","error")}finally{setButtonBusy(button,false)}});
  $("#request-waitlist").addEventListener("click",async()=>{try{await joinCurrentRequestWaitlist($("#request-quantity").value)}catch(e){toast(e.message||"לא הצלחנו להצטרף לרשימת ההמתנה","error")}});
  $("#request-use-available").addEventListener("click",()=>{const available=Math.max(1,Number(requestAvailability?.availableQuantity)||1);$("#request-quantity").value=String(available);toast(document.documentElement.lang==="en"?`Quantity updated to ${available} available units`:`הכמות עודכנה ל-${available} יחידות זמינות`);checkRequestedAvailability();});
  $("#request-partial-waitlist").addEventListener("click",async()=>{try{await joinCurrentRequestWaitlist(requestAvailability?.requestedQuantity||$("#request-quantity").value)}catch(e){toast(e.message||"לא הצלחנו להצטרף לרשימת ההמתנה","error")}});
  $("#request-change-dates").addEventListener("click",()=>{$("#request-start").focus();$("#request-start").scrollIntoView({behavior:"smooth",block:"center"});});
  $$('[data-open-date-picker]').forEach(button=>button.addEventListener("click",()=>{const input=$("#"+button.dataset.openDatePicker);input.focus();if(typeof input.showPicker==="function")input.showPicker();}));
  $("#request-form").addEventListener("submit", async event => { event.preventDefault(); const form=event.currentTarget; const button=event.submitter; setButtonBusy(button,true,"שולחים בקשה…"); try { const payload={branchId:$("#request-branch").value||null,itemId:$("#request-item-id").value,requestedFrom:$("#request-start").value,requestedUntil:$("#request-end").value,quantity:Number($("#request-quantity").value),distanceException:$("#request-distance-exception").checked,phone:$("#request-phone").value,note:$("#request-note").value,depositAccepted:$("#request-deposit-consent").checked}; const currentAvailability=requestAvailability&&requestAvailability.itemId===payload.itemId&&requestAvailability.from===payload.requestedFrom&&requestAvailability.until===payload.requestedUntil&&requestAvailability.branchId===(payload.branchId||"")?requestAvailability:null; if(currentAvailability&&payload.quantity>Number(currentAvailability.availableQuantity||0)){ $("#request-partial-options").hidden=Number(currentAvailability.availableQuantity||0)<=0;$("#request-waitlist").hidden=Number(currentAvailability.availableQuantity||0)>0;toast(Number(currentAvailability.availableQuantity||0)>0?"בחרו אם לקבל את הכמות הזמינה, להמתין לכמות המלאה או לשנות מועד.":"אין כרגע כמות זמינה. אפשר להצטרף לרשימת ההמתנה או לבחור מועד אחר.","error");return;} const result=await api("/api/loan-requests",{method:"POST",body:payload}); form.reset(); resetRequestAvailability(); closeDialog($("#request-dialog")); toast(result.request.status==="approved"?"ההזמנה אושרה ונשמרה.":"הבקשה נשלחה למנהל הגמ״ח. נעדכן אתכם כשיש תשובה."); await loadItems(); } catch(error){toast(error.message||"לא הצלחנו לשלוח את הבקשה","error");} finally{setButtonBusy(button,false);} });
    $$('[data-hours-start="שישי"],[data-hours-end="שישי"],[data-hours-start="שבת"],[data-hours-end="שבת"]').forEach(input=>input.addEventListener("change",()=>validateGmachHoursRange(input.dataset.hoursStart||input.dataset.hoursEnd,true)));
    $("#gmach-form").addEventListener("submit", async event => { event.preventDefault(); const form=event.currentTarget; const button = event.submitter; const editing = state.editingOrganizationId; setButtonBusy(button, true, editing ? "שומרים…" : "פותחים גמ״ח…"); try { const body = { name: $("#gmach-name").value, organizationType:$("#gmach-organization-type").value, primaryCategory: $("#gmach-category").value, city: $("#gmach-city").value, neighborhood: $("#gmach-neighborhood").value, description: $("#gmach-description").value, phone: $("#gmach-phone").value, address:$("#gmach-address").value,serviceArea:$("#gmach-service-area").value,serviceRadiusKm:$("#gmach-service-radius").value?Number($("#gmach-service-radius").value):null,allowDistanceException:$("#gmach-distance-exception").checked,contactSettings:window.GmachContacts.read(),hours:readGmachHours(),pickupOptions:["coordination"] }; await api(editing ? `/api/organizations/${encodeURIComponent(editing)}` : "/api/organizations", { method: editing ? "PATCH" : "POST", body }); form.reset(); state.editingOrganizationId = null; closeDialog($("#gmach-dialog")); toast(editing ? "פרטי הגמ״ח נשמרו" : "עמוד הגמ״ח נפתח והוא פעיל עכשיו"); await Promise.all([refreshAccountSnapshot(),loadDiscovery()]); if (editing) showDashboard("gmachim"); } catch (error) { toast(error.message || "לא הצלחנו לשמור את הגמ״ח", "error"); } finally { setButtonBusy(button, false); } });
    $("#item-payment-mode").addEventListener("change",syncItemLoanCostForm);
    $("#item-form").addEventListener("submit", async event => { event.preventDefault(); const form=event.currentTarget; const button = event.submitter; const editing = state.editingItemId; setButtonBusy(button, true, editing ? "שומרים…" : "מפרסמים…"); try { const body={managementMode:$("#item-management-mode").value,organizationId:$("#item-gmach").value,title:$("#item-name").value,category:$("#item-category").value,condition:$("#item-condition").value,quantity:Number($("#item-quantity").value),description:$("#item-description").value,loanConditions:$("#item-conditions").value,itemType:$("#item-type").value,pickupMethod:"coordination",subcategory:$("#item-subcategory").value,tags:$("#item-tags").value.split(","),minLoanMinutes:loanDurationMinutes("item-min-loan"),maxLoanMinutes:loanDurationMinutes("item-max-loan"),bookingNoticeMinutes:optionalDurationMinutes("item-booking-notice"),turnaroundMinutes:optionalDurationMinutes("item-turnaround"),bookingHorizonMinutes:loanDurationMinutes("item-booking-horizon"),bookingHorizonDays:Math.ceil(loanDurationMinutes("item-booking-horizon")/1440),approvalMode:$("#item-approval-mode").value,depositRequired:$("#item-deposit-required").checked,depositAmount:Number($("#item-deposit-amount").value||0),publishAt:$("#item-publish-at").value||null,maxPerUser:$("#item-max-per-user").value?Number($("#item-max-per-user").value):null,preparationMinutes:Number($("#item-preparation").value||0),maxLoanDays:$("#item-max-loan-days").value?Number($("#item-max-loan-days").value):null,serviceRadiusKm:$("#item-service-radius").value?Number($("#item-service-radius").value):null,nominalPolicyConfirmed:$("#item-free").checked,paymentMode:$("#item-payment-mode").value,costExplanation:$("#item-cost-explanation").value}; if(!Number.isInteger(body.bookingNoticeMinutes)||!Number.isInteger(body.turnaroundMinutes)||body.bookingNoticeMinutes<0||body.bookingNoticeMinutes>525600||body.turnaroundMinutes<0||body.turnaroundMinutes>10080)throw new Error("יש לבחור זמני הזמנה והתארגנות תקינים."); if(!Number.isInteger(body.minLoanMinutes)||!Number.isInteger(body.maxLoanMinutes)||body.minLoanMinutes<1||body.maxLoanMinutes>525600||body.minLoanMinutes>body.maxLoanMinutes)throw new Error("יש לבחור משך מינימלי ומקסימלי תקינים; המקסימלי חייב להיות גדול מהמינימלי."); const data = await api(editing ? `/api/items/${encodeURIComponent(editing)}` : "/api/items", { method: editing ? "PATCH" : "POST", body }); const itemId = editing || data.item.id; const imageResult=await uploadItemImages(itemId, [...$("#item-images").files]); if(imageResult?.moderation?.autoHidden)toast("אחת התמונות סומנה אוטומטית לבדיקה והפריט הוסתר זמנית עד לבדיקת מנהל.","error");else if(imageResult?.moderation?.reviewRequired)toast("אחת התמונות נשלחה לבדיקת תוכן נוספת."); if(!editing&&state.pendingCommunityItem){const pending=state.pendingCommunityItem;try{await api("/api/help-requests/"+encodeURIComponent(pending.helpRequestId)+"/offers",{method:"POST",body:{itemId,message:"נוסף מוצר חדש במיוחד עבור בקשת הקהילה הזו."}});state.pendingCommunityItem=null;toast("המוצר פורסם וקושר אוטומטית לבקשת הקהילה")}catch(linkError){toast("המוצר פורסם, אך הקישור לבקשת הקהילה לא הושלם: "+linkError.message,"error")}} form.reset(); state.editingItemId = null; $("#item-gmach").disabled = false; closeDialog($("#item-form-dialog")); toast(editing ? "השינויים נשמרו ונשלחו לבדיקה לפי הצורך" : "הפריט נשמר ונשלח לבדיקה לפני פרסום"); await refreshAccountSnapshot(); if (editing) showDashboard("items"); } catch (error) { toast(error.message || "לא הצלחנו לשמור את הפריט", "error"); } finally { setButtonBusy(button, false); } });
    $("#suggest-category-button")?.addEventListener("click",()=>requireAuth(async()=>{const name=translatedPrompt("איזו קטגוריה חסרה?");if(!name?.trim())return;const description=translatedPrompt("תיאור קצר שיעזור לנו להבין מה שייך לקטגוריה, אופציונלי")||"";try{await api("/api/category-suggestions",{method:"POST",body:{name:name.trim(),description,organizationId:$("#item-gmach").value||null}});toast("הצעת הקטגוריה נשלחה להנהלת האתר")}catch(e){toast(e.message,"error")}}));
    $("#suggest-subcategory-button")?.addEventListener("click",()=>requireAuth(async()=>{
      const category=$("#item-category")?.value||"";
      if(!category){toast("בחרו קודם קטגוריה ראשית","error");$("#item-category")?.focus();return}
      const parent=(state.categoryCatalog||[]).find(row=>!row.parent_id&&(row.name_he===category||row.id===category));
      const name=translatedPrompt("איזו קטגוריית משנה חסרה?");if(!name?.trim())return;
      const description=translatedPrompt("תיאור קצר שיעזור לנו להבין מה שייך לקטגוריית המשנה, אופציונלי")||"";
      try{await api("/api/category-suggestions",{method:"POST",body:{name:name.trim(),description,organizationId:$("#item-gmach").value||null,parentCategoryId:parent?.id||null}});toast("הצעת קטגוריית המשנה נשלחה להנהלת האתר")}catch(e){toast(e.message,"error")}
    }));
    $("#gmach-suggest-category-button")?.addEventListener("click",()=>requireAuth(async()=>{const name=translatedPrompt("איזו קטגוריה חסרה?");if(!name?.trim())return;const description=translatedPrompt("תיאור קצר שיעזור לנו להבין את תחום הגמ״ח, אופציונלי")||"";try{await api("/api/category-suggestions",{method:"POST",body:{name:name.trim(),description,organizationId:null}});toast("הצעת הקטגוריה נשלחה להנהלת האתר")}catch(e){toast(e.message,"error")}}));
    $("#item-category")?.addEventListener("change",()=>updateItemSubcategories());
    $("#gmach-hours-by-appointment")?.addEventListener("change",event=>setGmachHoursMode(event.currentTarget.checked));
    $("#help-request-form").addEventListener("submit", submitHelpRequest);
    $("#review-form").addEventListener("submit", submitReview);

    $("#decision-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; setButtonBusy(button, true, "מעדכנים…"); try { await api(`/api/loan-requests/${encodeURIComponent($("#decision-request-id").value)}/status`, { method: "PATCH", body: { status: $("#decision-status").value, managerNote: $("#decision-note").value } }); closeDialog($("#decision-dialog")); toast("הבקשה עודכנה והשואל/ת קיבל/ה התראה"); await refreshNotifications(true); showDashboard("requests"); } catch (error) { toast(error.message, "error"); } finally { setButtonBusy(button, false); } });
    $("#chat-form").addEventListener("submit", async event => { event.preventDefault(); const button = event.submitter; const message = $("#chat-message").value.trim(); if (!message || !state.chatRequestId) return; setButtonBusy(button, true, "שולחים…"); try { await api(`/api/loan-requests/${encodeURIComponent(state.chatRequestId)}/messages`, { method: "POST", body: { message } }); $("#chat-message").value = ""; await loadChatMessages(); await refreshNotifications(true); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את ההודעה", "error"); } finally { setButtonBusy(button, false); } });
    $("#report-form").addEventListener("submit", async event => { event.preventDefault(); const form=event.currentTarget; const button = event.submitter; setButtonBusy(button, true, "שולחים…"); try { await api("/api/reports", { method: "POST", body: { itemId: $("#report-item-id").value, reason: $("#report-reason").value, details: $("#report-details").value } }); form.reset(); closeDialog($("#report-dialog")); toast("הדיווח התקבל וייבדק על ידי הנהלת האתר"); } catch (error) { toast(error.message || "לא הצלחנו לשלוח את הדיווח", "error"); } finally { setButtonBusy(button, false); } });
    $("#notifications-button").addEventListener("click", openNotifications);
    $("#mark-notifications-read").addEventListener("click", async () => { try { await api("/api/notifications/read-all", { method: "POST", body: {} }); await refreshNotifications(); renderNotifications(); } catch (error) { toast(error.message, "error"); } });

    ["#add-gmach-button", "#callout-add-gmach", "#dashboard-add-gmach"].forEach(selector => $(selector).addEventListener("click", () => openGmachForm())); $$('[data-footer-add-gmach]').forEach(button => button.addEventListener("click", () => openGmachForm())); $("#add-item-button").addEventListener("click", () => openItemForm()); $$('[data-footer-add-item]').forEach(button => button.addEventListener("click", () => openItemForm())); $("#callout-learn-more").addEventListener("click", () => openInfo("terms")); $$('[data-open-info]').forEach(button => button.addEventListener("click", () => openInfo(button.dataset.openInfo)));
    $("#dashboard-button").addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard())); $$('[data-requires-auth]').filter(button => button !== $("#dashboard-button")).forEach(button => button.addEventListener("click", () => state.user ? showDashboard() : requireAuth(() => showDashboard()))); $$('[data-dashboard-tab]').forEach(button => button.addEventListener("click", () => showDashboard(button.dataset.dashboardTab))); $$('[data-go-home]').forEach(button => button.addEventListener("click", showHome));
    $("#sign-out-button").addEventListener("click", async () => { try { if (state.serverAvailable) await api("/api/auth/logout", { method: "POST" }); } catch { /* Cookie expires server-side. */ } stopChatPolling(); state.user = null; state.favorites.clear(); state.dashboard = null; updateAuthUI(); showHome(); renderItems(); toast("יצאתם מהחשבון"); });
    $("#delete-account-button").addEventListener("click", async () => { if (!state.user || !translatedConfirm("מחיקת החשבון תסיר גם פרסומים, בקשות ושיחות המקושרים אליו. להמשיך?")) return; const password = translatedPrompt("לאישור המחיקה, הקלידו את הסיסמה שלכם"); if (!password) return; try { await api("/api/me/account", { method: "DELETE", body: { password } }); state.user = null; state.dashboard = null; state.favorites.clear(); updateAuthUI(); showHome(); renderItems(); toast("החשבון והמידע המקושר נמחקו"); } catch (error) { toast(error.message, "error"); } });
    const handleCleanRoute=()=>{const path=location.pathname;
      if(path==="/dashboard"){const unit=new URLSearchParams(location.search).get("unit");if(unit){openManagedUnitFromQr(unit);return}state.user?showDashboard():requireAuth(()=>showDashboard());return}
      if(path.startsWith("/gmach/")){openOrganization(decodeURIComponent(path.slice(7)));return}
      $("#organization-page-view").hidden=true;$("#dashboard-view").hidden=true;$("#home-view").hidden=false;
      if(path==="/catalog")$("#catalog")?.scrollIntoView({behavior:"auto",block:"start"});
      else if(path==="/community")window.setTimeout(()=>openCommunityBoard(1,new URLSearchParams(location.search).get("help")||undefined),0);
      else if(path==="/how-it-works")$("#how-it-works")?.scrollIntoView({behavior:"auto",block:"start"});
      else if(path==="/gmachim")$("#gmachim")?.scrollIntoView({behavior:"auto",block:"start"});
    };
    window.addEventListener("popstate",handleCleanRoute);
    window.addEventListener("hashchange",()=>{const h=location.hash;
      const unitLegacy=h.match(/^#\/unit\/([^/?#]+)/);if(unitLegacy){history.replaceState(null,"","/dashboard?unit="+encodeURIComponent(decodeURIComponent(unitLegacy[1])));handleCleanRoute();return}
      const legacy=h.match(/^#\/(dashboard|catalog|community|gmach\/[^/?]+)/);
      if(!legacy)return;
      const path="/"+legacy[1];history.replaceState(null,"",path+location.search);handleCleanRoute();
    });
  }

  function registerWebMCP() {
    const context = document.modelContext; if (!context?.registerTool) return; const controller = new AbortController(); const register = tool => Promise.resolve(context.registerTool(tool, { signal: controller.signal })).catch(error => console.warn("WebMCP registration failed", error));
    register({ name: "search_free_items", title: "חיפוש פריטים להשאלה", description: "Search the free or nominal-fee loan catalog by text, category, and city without changing data.", inputSchema: { type: "object", properties: { query: { type: "string" }, category: { type: "string" }, city: { type: "string" } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input = {}) { const query = normalize(input.query); return state.items.filter(item => (!query || normalize(`${item.title} ${item.description}`).includes(query)) && (!input.category || item.category === input.category) && (!input.city || item.city === input.city)).slice(0, 20).map(item => ({ id: item.id, title: item.title, category: item.category, subcategory: item.subcategory||null, city: item.city, available: item.availability_status === "available", free: (item.paymentMode||item.payment_mode||"free")==="free",paymentMode:item.paymentMode||item.payment_mode||"free",costExplanation:itemLoanCostExplanation(item) })); } });
    register({ name: "open_item_details", title: "פתיחת פרטי פריט", description: "Open a catalog item's details. This does not submit a request.", inputSchema: { type: "object", properties: { itemId: { type: "string" } }, required: ["itemId"], additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true }, execute(input) { const item = findItem(input.itemId); if (!item) throw new Error("Item not found"); openItem(item.id); return { id: item.id, title: item.title, opened: true }; } });
    register({ name: "submit_free_loan_request", title: "שליחת בקשת השאלה", description: "Submit a loan request. Requires an authenticated user.", inputSchema: { type: "object", properties: { itemId: { type: "string" }, requestedFrom: { type: "string", format: "date" }, requestedUntil: { type: "string", format: "date" }, phone: { type: "string" }, note: { type: "string" } }, required: ["itemId", "requestedFrom", "requestedUntil", "phone"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const result = await submitLoanRequest(input); toast("בקשת ההשאלה נשלחה"); return { requestId: result.id, status: result.status }; } });
    window.addEventListener("pagehide", () => controller.abort(), { once: true });
  }

  function installFormErrorFocus(){
    const pendingForms=new WeakSet();
    document.addEventListener("invalid",event=>{
      const el=event.target;if(!(el instanceof HTMLElement))return;
      event.preventDefault();el.setAttribute("aria-invalid","true");
      const clear=()=>el.removeAttribute("aria-invalid");el.addEventListener("input",clear,{once:true});el.addEventListener("change",clear,{once:true});
      const form=el.form;
      if(form&&!pendingForms.has(form)){pendingForms.add(form);toast(formValidationMessage(el),"error");setTimeout(()=>pendingForms.delete(form),0)}
      else if(!form)toast(formValidationMessage(el),"error");
      requestAnimationFrame(()=>{el.focus({preventScroll:true});el.scrollIntoView({behavior:"smooth",block:"center"})});
    },true);
    document.addEventListener("submit",event=>{
      const form=event.target;if(!(form instanceof HTMLFormElement)||form.checkValidity())return;
      event.preventDefault();const first=form.querySelector(":invalid");
      if(first){first.setAttribute("aria-invalid","true");toast(formValidationMessage(first),"error");first.focus({preventScroll:true});first.scrollIntoView({behavior:"smooth",block:"center"})}
    },true);
  }
  async function init() {
    if("scrollRestoration" in history)history.scrollRestoration="manual";
    if((location.pathname||"/")==="/"&&!location.hash)window.scrollTo({top:0,left:0,behavior:"auto"});
    setupEvents(); installFormErrorFocus(); installDashboardToolOrganizer(); setAuthMode("login"); installAdvancedGmachSearch(); registerWebMCP();
    const siteCopyReady=Promise.allSettled([loadSiteSettings(),loadPageCustomizations()]);
    const publicReady=Promise.allSettled([loadPublicConfig(),loadDiscovery(),loadCategoryAliases(),loadItems()]);
    const connectionReady=detectServer();
    const authReady=refreshUser(false);
    if(location.hash){
      const legacy=location.hash.match(/^#\/(dashboard|catalog|community|gmach\/[^/?]+|invite\/[^/?]+)/);
      if(legacy)history.replaceState(null,"","/"+legacy[1]+location.search);
    }
    const path=location.pathname||"/";
    if(path==="/dashboard"){
      $("#home-view").hidden=true;$("#organization-page-view").hidden=true;$("#dashboard-view").hidden=false;
      $("#dashboard-content").innerHTML='<div class="skeleton-card" aria-hidden="true"></div>';
    } else if(path.startsWith("/gmach/")){
      $("#home-view").hidden=true;$("#dashboard-view").hidden=true;$("#organization-page-view").hidden=false;
      $("#organization-page-content").innerHTML='<div class="skeleton-card" aria-hidden="true"></div>';
    }

    const routeAfterAuth=async()=>{
      await authReady;
      if(path==="/dashboard"){ if(state.user) showDashboard(); else requireAuth(()=>showDashboard()); }
      else if(state.user){ Promise.allSettled([refreshAccountSnapshot(),refreshNotifications(true)]); }
      const inviteMatch=path.match(/^\/invite\/([^/?]+)/);
      if(inviteMatch){
        if(!state.user){openAuth("login");toast("יש להתחבר כדי לקבל את הזמנת הניהול");return}
        try{await api("/api/organization-invitations/"+encodeURIComponent(decodeURIComponent(inviteMatch[1]))+"/accept",{method:"POST",body:{}});toast("הצטרפת לצוות הניהול");history.replaceState({route:"dashboard"},"","/dashboard");await refreshAccountSnapshot();showDashboard("gmachim")}catch(e){toast(e.message,"error")}
      }
    };
    routeAfterAuth().catch(error=>console.warn("Account route hydration failed",error));

    Promise.allSettled([publicReady,connectionReady]).then(async()=>{
      const seoRoute=document.body.dataset.seoRoute||"";
      if(seoRoute.startsWith("item:")) await openItem(seoRoute.slice(5));
      else if(seoRoute.startsWith("organization:")) await openOrganization(seoRoute.slice(13));
      else if(path.startsWith("/gmach/")) await openOrganization(decodeURIComponent(path.slice(7)));
      else if(seoRoute.startsWith("category:")){const id=seoRoute.slice(9),cat=(state.discovery?.categories||[]).find(x=>x.id===id),label=cat?.name_he||id;$("#category-filter").value=label;state.activeCategory=label;applyFilters();window.setTimeout(()=>$("#catalog").scrollIntoView(),0)}
      else if(seoRoute.startsWith("area:")){const city=seoRoute.slice(5);$("#city-filter").value=city;applyFilters();window.setTimeout(()=>$("#catalog").scrollIntoView(),0)}
      if(path==="/catalog")window.setTimeout(()=>$("#catalog").scrollIntoView(),0);
      else if(path==="/community")window.setTimeout(()=>openCommunityBoard(1,new URLSearchParams(location.search).get("help")||undefined),0);
      else if(path==="/how-it-works")window.setTimeout(()=>$("#how-it-works")?.scrollIntoView(),0);
      else if(path==="/gmachim")window.setTimeout(()=>$("#gmachim")?.scrollIntoView(),0);
      const sharedHelp=new URLSearchParams(location.search).get("help");if(sharedHelp&&path!=="/community")await openCommunityBoard(1,sharedHelp);
    }).catch(error=>console.warn("Background page hydration failed",error));

    window.setInterval(async()=>{if(state.serverAvailable||document.visibilityState!=="visible")return;await detectServer();if(state.serverAvailable)await Promise.allSettled([loadPublicConfig(),loadDiscovery(),loadCategoryAliases(),loadItems(),refreshUser()])},30000);
    window.setInterval(()=>{if(state.user&&document.visibilityState==="visible")refreshNotifications(true)},30000);
  }
  init().catch(error => { document.documentElement.classList.remove("site-copy-pending","app-booting"); console.error("App initialization failed", error); const shellReady=Boolean($("#home-view")||$("#dashboard-view")||$("#organization-page-view")); if(!shellReady) toast("אירעה תקלה בטעינת האתר. נסו לרענן את הדף.", "error"); });
})();

// In-site support form
(()=>{
 const ready=()=>{
  const show=d=>{if(d&&!d.open&&typeof d.showModal==='function')d.showModal()};
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog')?.close()));
  const supportButton=document.getElementById('support-form-button'),supportDialog=document.getElementById('support-dialog'),supportForm=document.getElementById('support-form');
  supportButton?.addEventListener('click',()=>{
    const incident=String(window.GmachLastIncidentNumber||'').trim();
    if(incident&&supportForm&&!supportForm.elements.message.value.trim()){
      supportForm.elements.subject.value='דיווח על תקלה';
      supportForm.elements.message.value='מספר תקלה: '+incident+'\nעמוד: '+location.pathname+location.search;
    }
    show(supportDialog);
  });
  supportForm?.addEventListener('submit',async e=>{
   e.preventDefault();if(!supportForm.reportValidity())return;
   const submit=document.getElementById('support-submit'),status=document.getElementById('support-form-status');
   submit.disabled=true;status.textContent='שולחים את הפנייה…';
   try{
    let supportMessage=supportForm.elements.message.value;
    const incident=String(window.GmachLastIncidentNumber||'').trim();
    if(incident&&!supportMessage.includes(incident))supportMessage=(supportMessage+'\n\nמספר תקלה: '+incident).trim();
    const res=await fetch('/api/support',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:supportForm.elements.name.value,email:supportForm.elements.email.value,subject:supportForm.elements.subject.value,message:supportMessage,turnstileToken:window.GmachTurnstile?.token("support")||null})});
    const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error||'השליחה לא הושלמה');
    supportForm.reset();status.textContent='הפנייה נשלחה בהצלחה.';
   }catch(err){status.textContent=err.message||'לא הצלחנו לשלוח כרגע. נסו שוב בעוד רגע.'}finally{submit.disabled=false}
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();

// Persistent accessibility preferences. Controls remain fully keyboard usable
// and only affect presentation; they do not replace semantic accessibility.
(()=>{
  const storageKey='gmach-berega-accessibility-v1';
  const options=['large-text','high-contrast','grayscale','readable-font','underline-links','stop-motion'];
  const className=option=>`a11y-${option}`;
  let preferences={};
  try{preferences=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{preferences={};}
  const apply=()=>{
    options.forEach(option=>document.documentElement.classList.toggle(className(option),Boolean(preferences[option])));
    document.querySelectorAll('[data-a11y]').forEach(button=>button.setAttribute('aria-pressed',String(Boolean(preferences[button.dataset.a11y]))));
  };
  apply();
  const ready=()=>{
    const menu=document.getElementById('accessibility-dialog');
    const statement=document.getElementById('accessibility-statement-dialog');
    const show=dialog=>{if(dialog&&!dialog.open){dialog.showModal();document.body.classList.add('dialog-open');}};
    apply();
    document.getElementById('accessibility-button')?.addEventListener('click',()=>show(menu));
    document.querySelectorAll('[data-a11y]').forEach(button=>button.addEventListener('click',()=>{
      const option=button.dataset.a11y; preferences[option]=!preferences[option];
      localStorage.setItem(storageKey,JSON.stringify(preferences)); apply();
    }));
    document.getElementById('accessibility-reset')?.addEventListener('click',()=>{
      preferences={}; localStorage.removeItem(storageKey); apply();
    });
    document.querySelectorAll('[data-open-accessibility-statement]').forEach(button=>button.addEventListener('click',()=>{
      if(menu?.open)menu.close(); show(statement);
    }));
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
})();

// Category carousel continuous autoplay v3 — movement only; current visuals are preserved.
(()=>{
  let stopCurrent=()=>{};
  const start=()=>{
    const rail=document.getElementById('category-rail');
    if(!rail)return;
    stopCurrent();
    rail.querySelectorAll('[data-carousel-clone]').forEach(node=>node.remove());
    delete rail.dataset.continuousCarousel;
    rail.scrollLeft=0;
    if(matchMedia('(prefers-reduced-motion: reduce)').matches||document.documentElement.classList.contains('a11y-stop-motion'))return;
    rail.dataset.continuousCarousel='1';
    rail.classList.add('carousel-ready','carousel-continuous');
    const originals=[...rail.children].filter(node=>!node.dataset.carouselClone);
    if(originals.length<2)return;
    originals.forEach((el,index)=>{
      const clone=el.cloneNode(true);
      clone.setAttribute('aria-hidden','true');
      clone.tabIndex=-1;
      clone.dataset.carouselClone=String(index);
      clone.addEventListener('click',()=>el.click());
      rail.appendChild(clone);
    });
    let paused=false,last=performance.now(),raf=0,resume=0;
    const speed=window.innerWidth<=760?62:48;
    const rtl=document.documentElement.dir==='rtl';
    const half=()=>rail.scrollWidth/2;
    const tick=now=>{
      const dt=Math.min(40,now-last);last=now;
      if(!paused&&!document.hidden&&!document.documentElement.classList.contains('a11y-stop-motion')){
        rail.scrollLeft+=rtl?-(speed*dt/1000):(speed*dt/1000);
        const h=half();
        if(Math.abs(rail.scrollLeft)>=h-2)rail.scrollLeft=0;
      }
      raf=requestAnimationFrame(tick);
    };
    const pause=()=>{paused=true;clearTimeout(resume)};
    const restart=()=>{clearTimeout(resume);resume=setTimeout(()=>paused=false,450)};
    rail.addEventListener('pointerdown',pause,{passive:true});
    rail.addEventListener('pointerup',restart,{passive:true});
    rail.addEventListener('pointercancel',restart,{passive:true});
    rail.addEventListener('touchend',restart,{passive:true});
    rail.addEventListener('wheel',()=>{pause();restart()},{passive:true});
    raf=requestAnimationFrame(tick);
    stopCurrent=()=>{cancelAnimationFrame(raf);clearTimeout(resume)};
  };
  window.GmachResetCategoryCarousel=start;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

