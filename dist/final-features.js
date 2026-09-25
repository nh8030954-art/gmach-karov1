(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function installSensitiveAdminFetch(){
  const original=window.fetch.bind(window);
  window.fetch=async(input,init={})=>{
    const response=await original(input,init);
    if(response.status!==428)return response;
    let info={};try{info=await response.clone().json()}catch{return response}
    if(!info.sensitiveAction||String(typeof input==="string"?input:input?.url||"").includes("/api/admin/sensitive-action/"))return response;
    try{
      const ch=await original("/api/admin/sensitive-action/challenge",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Origin":location.origin},body:JSON.stringify({action:info.sensitiveAction})});
      const challenge=await ch.json();if(!ch.ok)throw new Error(challenge.error||"לא ניתן לשלוח קוד אישור");
      const code=prompt("פעולה רגישה: נשלח קוד אישור למייל המנהל. הזן את הקוד בן 6 הספרות:");
      if(!code)return response;
      const cf=await original("/api/admin/sensitive-action/confirm",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json","Origin":location.origin},body:JSON.stringify({challengeId:challenge.challengeId,code:String(code).trim()})});
      const confirmed=await cf.json();if(!cf.ok)throw new Error(confirmed.error||"האימות נכשל");
      const headers=new Headers(init.headers||{});headers.set("X-Admin-Action-Token",challenge.challengeId);
      return original(input,{...init,headers});
    }catch(e){notice(e.message||"האימות הנוסף נכשל",true);return response}
  };
}
installSensitiveAdminFetch();
async function api(path,options={}){
  const init={credentials:"same-origin",...options,headers:{...(options.headers||{})}};
  if(options.body && !(options.body instanceof FormData)){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(options.body)}
  const r=await fetch(path,init),type=r.headers.get("content-type")||"";
  const data=type.includes("application/json")?await r.json():await r.text();
  if(!r.ok)throw new Error(data?.error||data||"הפעולה נכשלה");
  return data;
}
function notice(message,error=false){
  let n=$("#final-feature-notice");if(!n){n=document.createElement("div");n.id="final-feature-notice";n.setAttribute("role","status");n.style.cssText="position:fixed;z-index:100000;left:16px;right:16px;bottom:16px;max-width:620px;margin:auto;padding:12px 16px;border-radius:12px;color:#fff;box-shadow:0 10px 40px #0003";document.body.append(n)}
  n.style.background=error?"#8b1e2d":"#17365d";n.textContent=message;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>n.hidden=true,4200);
}
function modal(title,html){
  let d=$("#final-feature-dialog");if(!d){d=document.createElement("dialog");d.id="final-feature-dialog";d.className="platform-dialog";document.body.append(d)}
  d.innerHTML=`<div class="platform-dialog-inner" dir="rtl"><div class="platform-dialog-head"><h2>${esc(title)}</h2><button type="button" class="platform-dialog-close" aria-label="סגירה">×</button></div><div id="final-feature-body">${html}</div></div>`;
  $(".platform-dialog-close",d).onclick=()=>d.close();d.showModal();return d;
}
async function installTour(){
  try{
    const me=await api("/api/auth/me");if(!me.user)return;
    const data=await api("/api/me/tours/dashboard");
    if(data.tour?.completed_at||data.tour?.dismissed_at)return;
    const steps=[
      ["ברוכים הבאים","מכאן אפשר לחפש מוצר, לבקש מהקהילה, לעקוב אחר השאלות ולפתוח גמ״ח."],
      ["חיפוש והשאלה","חפשו מוצר לפי שם, עיר, מרחק וזמינות. בעמוד המוצר בוחרים תאריך, שעה וכמות."],
      ["האזור האישי","באזור האישי תראו בקשות, החזרות, התראות, כתובות, מכשירים, מועדפים ולוח זמנים."],
      ["ניהול גמ״ח","אם אתם מנהלים גמ״ח, המרכז המתקדם מרכז סניפים, מלאי, QR, הרשאות ודוחות."]
    ];
    let step=Math.min(Number(data.tour?.last_step||0),steps.length-1);
    const render=()=>{
      const [h,p]=steps[step],d=modal(h,`<p style="line-height:1.7">${esc(p)}</p><div class="platform-progress"><span style="width:${((step+1)/steps.length)*100}%"></span></div><p class="platform-muted">שלב ${step+1} מתוך ${steps.length}</p><div class="platform-row-actions"><button class="platform-action secondary" id="tour-skip">דלג ואל תציג שוב</button>${step?'<button class="platform-action secondary" id="tour-prev">הקודם</button>':""}<button class="platform-action" id="tour-next">${step===steps.length-1?"סיום":"הבא"}</button></div>`);
      $("#tour-skip",d).onclick=async()=>{await api("/api/me/tours/dashboard",{method:"PATCH",body:{step,dismissed:true}});d.close()};
      $("#tour-prev",d)?.addEventListener("click",()=>{step--;d.close();render()});
      $("#tour-next",d).onclick=async()=>{if(step===steps.length-1){await api("/api/me/tours/dashboard",{method:"PATCH",body:{step,completed:true}});d.close()}else{step++;await api("/api/me/tours/dashboard",{method:"PATCH",body:{step}});d.close();render()}};
    };render();
  }catch{}
}
async function openWizard(){
  let drafts=(await api("/api/me/organization-drafts")).drafts||[],draft=drafts[0]||null,step=draft?.step||1,payload=draft?.payload||{};
  const fields=[
    ["זהות הגמ״ח",`<label><span>שם הגמ״ח *</span><input name="name" required value="${esc(payload.name||"")}"></label><label><span>סוג הגוף *</span><select name="organizationType"><option value="private">אדם פרטי</option><option value="family">משפחה</option><option value="community">קהילה / בית כנסת</option><option value="nonprofit">עמותה</option><option value="business">עסק שמשאיל בחינם</option><option value="authority">רשות / מוסד</option></select></label>`],
    ["אזור ויצירת קשר",`<label><span>עיר *</span><input name="city" required value="${esc(payload.city||"")}"></label><label><span>כתובת *</span><input name="address" required value="${esc(payload.address||"")}"></label><label><span>טלפון *</span><input name="phone" required value="${esc(payload.phone||"")}"></label>`],
    ["תיאור ופעילות",`<label class="wide"><span>תיאור *</span><textarea name="description" required>${esc(payload.description||"")}</textarea></label><label><span>אזור שירות</span><input name="serviceArea" value="${esc(payload.serviceArea||payload.city||"")}"></label><label><span>שעות פעילות</span><input name="hours" value="${esc(payload.hours||"")}"></label>`],
    ["קטגוריות",`<label class="wide"><span>קטגוריה ראשית *</span><input name="primaryCategory" required value="${esc(payload.primaryCategory||"")}"></label><label class="wide"><span>קטגוריות נוספות, מופרדות בפסיק</span><input name="categories" value="${esc((payload.categories||[]).join(", "))}"></label>`],
    ["סיום",`<div class="wide platform-note">הגמ״ח ייווצר, אך יישאר מחוץ לחיפוש הציבורי עד שיהיה בו לפחות מוצר פעיל אחד. לאחר מכן יוצג לך קיצור דרך להוספת המוצר הראשון.</div>`]
  ];
  const show=()=>{
    const [title,body]=fields[step-1],d=modal("אשף פתיחת גמ״ח · "+title,`<form id="gmach-wizard" class="platform-form">${body}<div class="wide platform-progress"><span style="width:${step/fields.length*100}%"></span></div><div class="wide platform-row-actions">${step>1?'<button type="button" class="platform-action secondary" id="wizard-prev">הקודם</button>':""}<button type="button" class="platform-action secondary" id="wizard-save">שמירת טיוטה</button><button type="submit" class="platform-action">${step===fields.length?"יצירת הגמ״ח":"הבא"}</button></div></form>`);
    const form=$("#gmach-wizard",d);
    const merge=()=>{const f=new FormData(form);for(const [k,v] of f)payload[k]=v;if(payload.categories)payload.categories=String(payload.categories).split(",").map(x=>x.trim()).filter(Boolean)};
    $("#wizard-prev",d)?.addEventListener("click",()=>{merge();step--;d.close();show()});
    $("#wizard-save",d).onclick=async()=>{merge();const data=await api(draft?"/api/me/organization-drafts/"+draft.id:"/api/me/organization-drafts",{method:draft?"PATCH":"POST",body:{step,payload}});draft=data.draft;notice("הטיוטה נשמרה")};
    form.onsubmit=async e=>{e.preventDefault();merge();if(step<fields.length){const data=await api(draft?"/api/me/organization-drafts/"+draft.id:"/api/me/organization-drafts",{method:draft?"PATCH":"POST",body:{step:step+1,payload}});draft=data.draft;step++;d.close();show();return}
      const created=await api("/api/organizations",{method:"POST",body:{name:payload.name,organizationType:payload.organizationType,city:payload.city,address:payload.address,phone:payload.phone,description:payload.description,serviceArea:payload.serviceArea||payload.city,primaryCategory:payload.primaryCategory,hours:{text:payload.hours||""},pickupOptions:["pickup"]}});
      if(payload.categories?.length){try{const cats=await api("/api/categories");const ids=(cats.categories||[]).filter(c=>payload.categories.some(x=>x===c.name_he||x===c.name_en)).map(c=>c.id);if(ids.length)await api("/api/organizations/"+created.organization.id+"/categories",{method:"PUT",body:{categoryIds:ids}})}catch{}}
      if(draft)await api("/api/me/organization-drafts/"+draft.id,{method:"DELETE"});
      d.close();notice("הגמ״ח נוצר. השלב הבא: הוספת מוצר ראשון כדי לפרסם אותו בחיפוש.");location.hash="#/dashboard";
    };
  };show();
}
async function installWizardEntry(){
  const add=()=>{
    const dash=$("#dashboard-view");if(!dash||$("#final-wizard-button"))return;
    const b=document.createElement("button");b.id="final-wizard-button";b.type="button";b.className="button button-secondary";b.textContent="אשף פתיחת גמ״ח";b.onclick=()=>openWizard().catch(e=>notice(e.message,true));
    const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;host.prepend(b);
  };new MutationObserver(add).observe(document.body,{childList:true,subtree:true});add();
}
async function installPush(){
  if(!("serviceWorker" in navigator)||!("PushManager" in window))return;
  try{
    const cfg=await api("/api/public-config");if(!cfg.pushPublicKey)return;
    const reg=await navigator.serviceWorker.register("/sw.js");
    const me=await api("/api/auth/me");if(!me.user)return;
    let sub=await reg.pushManager.getSubscription();
    if(!sub && Notification.permission==="granted")sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.pushPublicKey)});
    if(sub){const j=sub.toJSON();await api("/api/push-subscriptions",{method:"POST",body:{endpoint:j.endpoint,keys:j.keys}})}
    const addButton=()=>{const dash=$("#dashboard-view");if(!dash||$("#enable-push"))return;const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;const b=document.createElement("button");b.id="enable-push";b.className="platform-action secondary";b.textContent="הפעלת התראות Push";b.onclick=async()=>{const perm=await Notification.requestPermission();if(perm!=="granted")return notice("לא ניתנה הרשאת התראות",true);const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.pushPublicKey)});const j=s.toJSON();await api("/api/push-subscriptions",{method:"POST",body:{endpoint:j.endpoint,keys:j.keys}});notice("התראות Push הופעלו")};host.prepend(b)};
    new MutationObserver(addButton).observe(document.body,{childList:true,subtree:true});addButton();
  }catch(e){console.warn("push unavailable",e)}
}
function urlBase64ToUint8Array(base64String){const padding="=".repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,"+").replace(/_/g,"/"),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
function installQrRoute(){
  const scan=async()=>{
    const m=location.hash.match(/^#\/scan\/(.+)$/);if(!m)return;
    try{
      const data=await api("/api/item-units/scan/"+encodeURIComponent(decodeURIComponent(m[1])));
      const u=data.unit,a=data.activeLoan,d=modal("סריקת יחידה",`<div class="platform-list"><div class="platform-row"><div><strong>${esc(u.title)}</strong><p dir="ltr">${esc(u.serial_number)}</p><p>${esc(u.organization_name)} · ${esc(u.branch_name||"")}</p><span class="platform-chip">${esc(u.status)}</span></div></div>${a?`<div class="platform-note">השאלה פעילה: ${esc(a.borrower_name)} · ${esc(a.status)}</div>`:""}</div><div class="platform-row-actions"><button class="platform-action" data-scan="collected">סמן נאסף</button><button class="platform-action" data-scan="return">סמן הוחזר</button><button class="platform-action secondary" data-scan="available">זמין</button><button class="platform-action danger" data-scan="fault">דיווח תקלה</button></div>`);
      $$("[data-scan]",d).forEach(b=>b.onclick=async()=>{let note="";if(b.dataset.scan==="fault")note=prompt("תיאור התקלה:")||"";await api("/api/item-units/"+u.id+"/scan-action",{method:"POST",body:{action:b.dataset.scan,note}});d.close();notice("סטטוס היחידה עודכן")});
    }catch(e){notice(e.message,true)}
  };window.addEventListener("hashchange",scan);scan();
}
function enhanceChat(){
  const apply=()=>{
    const form=$("#chat-form");if(!form||$("#chat-media-tools"))return;
    const tools=document.createElement("div");tools.id="chat-media-tools";tools.className="platform-row-actions";tools.innerHTML='<button type="button" class="platform-action secondary" data-chat-media="image">📷 תמונה</button><button type="button" class="platform-action secondary" data-chat-media="audio">🎤 קול</button><button type="button" class="platform-action secondary" data-chat-media="location">📍 מיקום</button><button type="button" class="platform-action secondary" data-chat-media="item">כרטיס מוצר</button>';
    form.prepend(tools);
    $$("[data-chat-media]",tools).forEach(b=>b.onclick=async()=>{
      const requestId=$("#chat-request-id")?.value||form.dataset.requestId||document.querySelector("[data-chat-request]")?.dataset.chatRequest;if(!requestId)return notice("לא נמצא מזהה השאלה",true);
      try{
        if(b.dataset.chatMedia==="location"){navigator.geolocation.getCurrentPosition(async p=>{await api("/api/loan-requests/"+requestId+"/rich-message",{method:"POST",body:{type:"location",metadata:{lat:p.coords.latitude,lon:p.coords.longitude}}});notice("המיקום נשלח")},()=>notice("לא ניתנה הרשאת מיקום",true));return}
        if(b.dataset.chatMedia==="item"){const itemId=prompt("מזהה המוצר לשיתוף:");if(itemId)await api("/api/loan-requests/"+requestId+"/rich-message",{method:"POST",body:{type:"item",metadata:{itemId}}});return}
        const input=document.createElement("input");input.type="file";input.accept=b.dataset.chatMedia==="audio"?"audio/*":"image/*";if(b.dataset.chatMedia==="image")input.capture="environment";input.onchange=async()=>{const fd=new FormData();fd.set("file",input.files[0]);fd.set("type",b.dataset.chatMedia);const r=await fetch("/api/loan-requests/"+requestId+"/media",{method:"POST",credentials:"same-origin",body:fd,headers:{"Origin":location.origin}});if(!r.ok){const j=await r.json();throw new Error(j.error)}notice("הקובץ נשלח")};input.click();
      }catch(e){notice(e.message,true)}
    });
  };new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
}
function addAdminFinalPanels(){
  const apply=async()=>{
    const dash=$("#dashboard-view");if(!dash||$("#final-admin-button"))return;
    try{const me=await api("/api/auth/me");if(me.user?.role!=="admin")return;}catch{return}
    const b=document.createElement("button");b.id="final-admin-button";b.className="button button-secondary";b.textContent="תפעול מתקדם";b.onclick=async()=>{
      try{
        const [analytics,audit,templates,holidays,mod,backups]=await Promise.all([api("/api/admin/analytics/operations"),api("/api/admin/audit"),api("/api/admin/email-templates"),api("/api/admin/holiday-rules"),api("/api/admin/moderation"),api("/api/admin/backups")]);
        const d=modal("תפעול מתקדם",`<div class="platform-kpis"><article><strong>${analytics.loans.total||0}</strong><span>השאלות</span></article><article><strong>${analytics.loans.completed||0}</strong><span>הושלמו</span></article><article><strong>${analytics.loans.cancelled||0}</strong><span>בוטלו</span></article><article><strong>${analytics.loans.late||0}</strong><span>איחורים</span></article></div><h3>גיבויים</h3><p><button class="platform-action" id="backup-now">יצירת גיבוי לוגי עכשיו</button> · ${backups.backups.length} גיבויים רשומים</p><h3>תבניות אימייל</h3><div class="platform-list">${templates.templates.slice(0,20).map(t=>`<div class="platform-row"><div><strong>${esc(t.template_key)} · ${esc(t.language)}</strong><p>${esc(t.subject)}</p></div></div>`).join("")}</div><h3>חגים</h3><div class="platform-list">${holidays.holidays.map(h=>`<div class="platform-row"><div><strong>${esc(h.title_he)}</strong><p>${esc(h.hebrew_day)} ${esc(h.hebrew_month)} · ${h.enabled?"פעיל":"כבוי"}</p></div></div>`).join("")}</div><h3>Moderation</h3><p>${mod.jobs.length} פריטים לבדיקה</p><h3>Audit</h3><p>${audit.entries.length} פעולות אחרונות.</p>`);
        $("#backup-now",d).onclick=async()=>{await api("/api/admin/backups",{method:"POST",body:{}});notice("הגיבוי נוצר")};
      }catch(e){notice(e.message,true)}
    };
    const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;host.prepend(b);
  };new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
}

async function openAdvancedTools(){
  const data=await api("/api/me/dashboard"),orgs=data.organizations||[],items=data.items||[],helps=data.helpRequests||[],loans=data.requests||[];
  const d=modal("כלים מתקדמים",`<div class="platform-row-actions" id="adv-tabs"><button class="platform-action" data-tab="orgs">גמ״חים וסניפים</button><button class="platform-action secondary" data-tab="inventory">מלאי ו־QR</button><button class="platform-action secondary" data-tab="community">קהילה</button><button class="platform-action secondary" data-tab="saved">מועדפים ומחזוריות</button><button class="platform-action secondary" data-tab="reviews">ביקורות</button><button class="platform-action secondary" data-tab="loans">תהליך השאלה</button><button class="platform-action secondary" data-tab="map">מפה וחיפוש קרוב</button></div><div id="adv-body" style="margin-top:16px"></div>`);
  const body=$("#adv-body",d);
  const showOrgs=async()=>{
    const blocks=[];
    for(const org of orgs){
      const [ready,branches]=await Promise.all([api("/api/organizations/"+org.id+"/publish-readiness").catch(()=>({ready:false,missing:[]})),api("/api/organizations/"+org.id+"/branches").catch(()=>({branches:[]}))]);
      blocks.push(`<section class="platform-note"><h3>${esc(org.name)}</h3><p>${ready.ready?"מוכן לפרסום":"חסרים: "+esc((ready.missing||[]).join(", "))}</p><div class="platform-row-actions"><button class="platform-action secondary" data-org-lifecycle="${org.id}" data-org-name="${esc(org.name)}">סגירה/מחיקה/בעלות</button><button class="platform-action secondary" data-org-members="${org.id}">מנהלים והרשאות</button><button class="platform-action secondary" data-org-waitlist="${org.id}">רשימת המתנה</button><button class="platform-action secondary" data-org-transfers="${org.id}">העברות סניפים</button></div><div class="platform-list">${(branches.branches||[]).map(b=>`<div class="platform-row"><div><strong>${esc(b.name)}</strong><p>${esc(b.address||"")} · ${esc(b.city||"")}</p></div><div class="platform-row-actions"><span class="platform-chip">${esc(b.status||"active")}</span><button class="platform-action secondary" data-branch-policy="${b.id}" data-org="${org.id}">מדיניות מלאי</button></div></div>`).join("")||'<div class="platform-muted">אין סניפים.</div>'}</div></section>`);
    }
    body.innerHTML=blocks.join("")||'<div class="platform-note">אין גמ״חים בניהולך.</div>';
    $("[data-branch-policy]",body).forEach(btn=>btn.onclick=()=>branchPolicyDialog(btn.dataset.branchPolicy,btn.dataset.org,items.filter(i=>i.organization_id===btn.dataset.org)).catch(e=>notice(e.message,true)));
    $("[data-org-lifecycle]",body).forEach(btn=>btn.onclick=()=>orgLifecycleDialog(btn.dataset.orgLifecycle,btn.dataset.orgName));
    $("[data-org-members]",body).forEach(btn=>btn.onclick=()=>orgMembersDialog(btn.dataset.orgMembers));
    $("[data-org-waitlist]",body).forEach(btn=>btn.onclick=()=>orgWaitlistDialog(btn.dataset.orgWaitlist));
    $("[data-org-transfers]",body).forEach(btn=>btn.onclick=()=>orgTransfersDialog(btn.dataset.orgTransfers,items.filter(i=>i.organization_id===btn.dataset.orgTransfers)));
  };
  const showInventory=async()=>{
    body.innerHTML=items.length?items.map(i=>`<section class="platform-row"><div><strong>${esc(i.title)}</strong><p>${esc(i.organizations?.name||"")} · ${esc(i.status)} · ${Number(i.quantity||0)} יחידות</p></div><div class="platform-row-actions"><button class="platform-action secondary" data-units="${i.id}">יחידות/QR</button><button class="platform-action secondary" data-images="${i.id}">תמונות</button><button class="platform-action secondary" data-clone="${i.id}">שכפול</button><button class="platform-action danger" data-remove="${i.id}">מחיקה בטוחה</button></div></section>`).join(""):'<div class="platform-note">אין מוצרים.</div>';
    $$("[data-units]",body).forEach(b=>b.onclick=async()=>{const u=await api("/api/items/"+b.dataset.units+"/units");body.innerHTML=(u.units||[]).map(x=>`<div class="platform-row"><div><strong dir="ltr">${esc(x.serial_number)}</strong><p>${esc(x.status)} · ${esc(x.condition)}</p></div><button class="platform-action secondary" data-qr="${x.id}">QR</button></div>`).join("")||'<div class="platform-note">אין יחידות סידוריות.</div>';$$("[data-qr]",body).forEach(q=>q.onclick=async()=>{const qr=await api("/api/item-units/"+q.dataset.qr+"/qr");modal("QR ליחידה",`<p><strong>${esc(qr.serialNumber||qr.serial_number||"")}</strong></p><p dir="ltr">${esc(qr.target||"")}</p><p class="platform-muted">ניתן להדפיס חלון זה כתווית.</p><button class="platform-action" onclick="window.print()">הדפסה</button>`)})});
    $$("[data-images]",body).forEach(b=>b.onclick=()=>manageItemImages(b.dataset.images).catch(e=>notice(e.message,true)));
    $$("[data-clone]",body).forEach(b=>b.onclick=async()=>{await api("/api/items/"+b.dataset.clone+"/clone",{method:"POST",body:{}});notice("המוצר שוכפל")});
    $$("[data-remove]",body).forEach(b=>b.onclick=async()=>{if(confirm("להסיר את המוצר לפי כללי ההיסטוריה?")){await api("/api/items/"+b.dataset.remove+"/remove",{method:"POST",body:{}});notice("המוצר טופל")}}); 
  };
  const showCommunity=async()=>{
    body.innerHTML=helps.length?helps.map(h=>`<section class="platform-row"><div><strong>${esc(h.title)}</strong><p>${esc(h.city)} · ${esc(h.status)}</p></div><button class="platform-action secondary" data-match="${h.id}">התאמות</button></section>`).join(""):'<div class="platform-note">אין בקשות קהילה שלך.</div>';
    $$("[data-match]",body).forEach(b=>b.onclick=async()=>{const m=await api("/api/help-requests/"+b.dataset.match+"/matches");body.innerHTML=(m.matches||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.title)}</strong><p>${esc(x.organization_name)} · ציון ${Math.round(x.score)}</p></div></div>`).join("")||'<div class="platform-note">לא נמצאו התאמות.</div>'});
  };
  const showSaved=async()=>{
    const [saved,recurring]=await Promise.all([api("/api/me/saved-entities"),api("/api/me/recurring-loans")]);
    body.innerHTML=`<h3>מועדפים מורחבים</h3><div class="platform-list">${(saved.saved||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.entity_type)}</strong><p>${esc(x.entity_id)}</p></div></div>`).join("")||'<div class="platform-muted">אין.</div>'}</div><h3>בקשות מחזוריות</h3><p><button class="platform-action" id="recurring-add">יצירת בקשה מחזורית</button></p><div class="platform-list">${(recurring.rules||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.title)}</strong><p>${esc(x.frequency)} · ${esc(x.status)}</p></div>${x.status==="active"?`<button class="platform-action danger" data-recurring-cancel="${x.id}">ביטול</button>`:""}</div>`).join("")||'<div class="platform-muted">אין.</div>'}</div>`;
    $("#recurring-add",body).onclick=()=>recurringDialog();
    $("[data-recurring-cancel]",body).forEach(b=>b.onclick=async()=>{await api("/api/me/recurring-loans/"+b.dataset.recurringCancel,{method:"DELETE"});await showSaved()});
  };
  const showLoans=async()=>{
    body.innerHTML=loans.length?loans.map(x=>`<section class="platform-row"><div><strong>${esc(x.items?.title||"פריט")}</strong><p>${x.direction==="incoming"?"בקשה נכנסת":"בקשה שלי"} · ${esc(x.status)} · ${esc(x.requested_from||"")} — ${esc(x.requested_until||"")}</p></div><div class="platform-row-actions"><button class="platform-action secondary" data-loan-timeline="${x.id}">ציר זמן</button><a class="platform-action secondary" href="/api/loan-requests/${encodeURIComponent(x.id)}/calendar.ics">יומן</a>${x.direction==="outgoing"&&["pending","approved"].includes(x.status)?`<button class="platform-action secondary" data-loan-change="${x.id}">שינוי בקשה</button>`:""}${x.direction==="outgoing"&&["approved","collected"].includes(x.status)?`<button class="platform-action secondary" data-loan-extend="${x.id}">הארכה</button>`:""}${x.direction==="incoming"&&x.status==="approved"&&x.item_id?`<button class="platform-action secondary" data-loan-units="${x.id}" data-item="${x.item_id}">הקצאת יחידות</button>`:""}</div></section>`).join(""):'<div class="platform-note">אין השאלות.</div>';
    $$("[data-loan-timeline]",body).forEach(btn=>btn.onclick=async()=>{const t=await api("/api/loan-requests/"+btn.dataset.loanTimeline+"/timeline");modal("ציר זמן להשאלה",`<div class="platform-list">${(t.events||[]).map(e=>`<div class="platform-row"><div><strong>${esc(e.status)}</strong><p>${esc(e.created_at)}${e.note?" · "+esc(e.note):""}</p></div></div>`).join("")||'<div class="platform-note">אין אירועי סטטוס נוספים.</div>'}</div>`)});
    $$("[data-loan-change]",body).forEach(btn=>btn.onclick=()=>loanChangeDialog(btn.dataset.loanChange));
    $$("[data-loan-extend]",body).forEach(btn=>btn.onclick=()=>loanExtensionDialog(btn.dataset.loanExtend));
    $$("[data-loan-units]",body).forEach(btn=>btn.onclick=()=>loanUnitsDialog(btn.dataset.loanUnits,btn.dataset.item));
  };
  const showMap=async()=>{
    body.innerHTML=`<form id="nearby-form" class="platform-form"><label class="wide"><span>כתובת לחיפוש</span><input name="address" placeholder="רחוב, עיר"></label><label><span>רדיוס בק״מ</span><input name="radius" type="number" min="1" max="200" value="20"></label><div class="platform-row-actions"><button type="button" class="platform-action secondary" id="map-current">המיקום הנוכחי</button><button class="platform-action" type="submit">חיפוש</button></div></form><iframe id="nearby-map" title="מפה אינטראקטיבית" style="width:100%;height:360px;border:1px solid #dbe3e8;border-radius:14px;margin-top:12px" loading="lazy"></iframe><div id="nearby-results" class="platform-list" style="margin-top:12px"></div>`;
    let lat=null,lon=null;
    const map=$("#nearby-map",body),results=$("#nearby-results",body),form=$("#nearby-form",body);
    const setMap=(a,b)=>{const span=.08,bbox=[b-span,a-span,b+span,a+span].join(",");map.src="https://www.openstreetmap.org/export/embed.html?bbox="+encodeURIComponent(bbox)+"&layer=mapnik&marker="+encodeURIComponent(a+","+b)};
    const run=async()=>{if(lat==null||lon==null)throw new Error("יש לבחור מיקום או להזין כתובת");setMap(lat,lon);const r=await api("/api/search/nearby?lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lon)+"&radius="+encodeURIComponent(form.radius.value||20));results.innerHTML=(r.results||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.title)}</strong><p>${esc(x.organization_name)} · ${esc(x.branch_name)} · ${Number(x.distanceKm).toFixed(1)} ק״מ</p></div><button class="platform-action secondary" data-map-lat="${x.latitude}" data-map-lon="${x.longitude}">הצגה במפה</button></div>`).join("")||'<div class="platform-note">לא נמצאו פריטים בטווח.</div>';$("[data-map-lat]",results).forEach(b=>b.onclick=()=>setMap(Number(b.dataset.mapLat),Number(b.dataset.mapLon)))};
    $("#map-current",body).onclick=()=>navigator.geolocation.getCurrentPosition(p=>{lat=p.coords.latitude;lon=p.coords.longitude;run().catch(e=>notice(e.message,true))},()=>notice("לא ניתנה הרשאת מיקום",true),{timeout:10000,maximumAge:60000});
    form.onsubmit=async e=>{e.preventDefault();try{const q=form.address.value.trim();if(q){const g=await api("/api/geocode?q="+encodeURIComponent(q));if(!g.results?.length)throw new Error("הכתובת לא נמצאה");lat=g.results[0].lat;lon=g.results[0].lon}await run()}catch(err){notice(err.message,true)}};
  };
  const showReviews=async()=>{
    const r=await api("/api/me/reviews");
    body.innerHTML=`<h3>ביקורות שכתבתי</h3><div class="platform-list">${(r.authored||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.item_title)} · ${"★".repeat(Number(x.rating||0))}</strong><p>${esc(x.organization_name)}${x.branch_name?" · "+esc(x.branch_name):""} · ${esc(x.comment||"")}</p></div><button class="platform-action secondary" data-review-edit="${x.id}" data-rating="${x.rating}" data-comment="${esc(x.comment||"")}">עריכה</button></div>`).join("")||'<div class="platform-muted">אין ביקורות שכתבת.</div>'}</div><h3>ביקורות על הגמ״חים שלי</h3><div class="platform-list">${(r.received||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.author_first_name||"משתמש")} · ${"★".repeat(Number(x.rating||0))}</strong><p>${esc(x.item_title)}${x.branch_name?" · "+esc(x.branch_name):""} · ${esc(x.comment||"")}</p>${x.organization_response?"<p><strong>תגובה:</strong> "+esc(x.organization_response)+"</p>":""}</div><button class="platform-action secondary" data-review-response="${x.id}">תגובה</button></div>`).join("")||'<div class="platform-muted">אין ביקורות שהתקבלו.</div>'}</div>`;
    $$("[data-review-edit]",body).forEach(btn=>btn.onclick=()=>reviewEditDialog(btn.dataset.reviewEdit,Number(btn.dataset.rating),btn.dataset.comment));
    $$("[data-review-response]",body).forEach(btn=>btn.onclick=()=>reviewResponseDialog(btn.dataset.reviewResponse));
  };
  const render={orgs:showOrgs,inventory:showInventory,community:showCommunity,saved:showSaved,reviews:showReviews,loans:showLoans,map:showMap};
  $$("[data-tab]",d).forEach(b=>b.onclick=async()=>{$$("[data-tab]",d).forEach(x=>x.classList.add("secondary"));b.classList.remove("secondary");await render[b.dataset.tab]()});
  await showOrgs();
}
function installAdvancedEntry(){
  const add=()=>{const dash=$("#dashboard-view");if(!dash||$("#final-advanced-button"))return;const b=document.createElement("button");b.id="final-advanced-button";b.className="button button-secondary";b.textContent="כלים מתקדמים";b.onclick=()=>openAdvancedTools().catch(e=>notice(e.message,true));const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;host.prepend(b)};new MutationObserver(add).observe(document.body,{childList:true,subtree:true});add();
}

function orgLifecycleDialog(orgId,name){
  const d=modal("ניהול גמ״ח · "+name,`<form id="org-life-form" class="platform-form"><label><span>פעולה</span><select name="action"><option value="close">סגירה זמנית</option><option value="reopen">פתיחה מחדש</option><option value="request_delete">בקשת מחיקה</option><option value="cancel_delete">ביטול בקשת מחיקה</option></select></label><label><span>פתיחה צפויה</span><input name="reopensAt" type="datetime-local"></label><label class="wide"><span><input name="cancelPending" type="checkbox"> בעת סגירה זמנית, לבטל בקשות ממתינות/מאושרות</span></label><button class="platform-action" type="submit">ביצוע</button></form><hr><form id="org-owner-transfer" class="platform-form"><label class="wide"><span>העברת בעלות למשתמש קיים לפי אימייל</span><input name="email" type="email" required></label><button class="platform-action secondary" type="submit">שליחת בקשת בעלות</button></form>`);
  $("#org-life-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget),action=f.get("action");if(action==="request_delete"&&!confirm("הגמ״ח יוסתר מיד והמחיקה הסופית תבוצע רק לאחר 7 ימים ולאחר שכל מוצר שנאסף יוחזר. להמשיך?"))return;await api("/api/organizations/"+orgId+"/lifecycle",{method:"PATCH",body:{action,reopensAt:f.get("reopensAt")||null,cancelPending:f.get("cancelPending")==="on"}});d.close();notice("מצב הגמ״ח עודכן")};
  $("#org-owner-transfer",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/organizations/"+orgId+"/transfer",{method:"POST",body:{email:f.get("email")}});d.close();notice("בקשת העברת הבעלות נשלחה")};
}
async function orgMembersDialog(orgId){
  const data=await api("/api/organizations/"+orgId+"/members");
  const d=modal("מנהלים והרשאות",`<div class="platform-list" id="org-member-list">${(data.members||[]).map(m=>`<div class="platform-row"><div><strong>${esc(m.full_name)}</strong><p>${esc(m.email)} · ${esc(m.role)}</p></div><button class="platform-action danger" data-member-remove="${m.user_id}">הסרה</button></div>`).join("")||'<div class="platform-note">אין מנהלים נוספים.</div>'}</div><form id="org-member-add" class="platform-form"><label><span>אימייל של משתמש רשום</span><input name="email" type="email" required></label><label><span>תפקיד</span><select name="role"><option value="requests">בקשות ואיסופים</option><option value="inventory">מלאי</option><option value="reports">דוחות</option></select></label><label class="wide"><span>מזהי סניפים מורשים, מופרדים בפסיק (ריק = הכל)</span><input name="branches"></label><label class="wide"><span>מזהי קטגוריות מורשות, מופרדים בפסיק (ריק = הכל)</span><input name="categories"></label><button class="platform-action" type="submit">הוספה/עדכון</button></form>`);
  $("[data-member-remove]",d).forEach(b=>b.onclick=async()=>{await api("/api/organizations/"+orgId+"/members/"+b.dataset.memberRemove,{method:"DELETE"});d.close();notice("המנהל הוסר")});
  $("#org-member-add",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/organizations/"+orgId+"/members",{method:"POST",body:{email:f.get("email"),role:f.get("role"),branchIds:String(f.get("branches")||"").split(",").map(x=>x.trim()).filter(Boolean),categoryIds:String(f.get("categories")||"").split(",").map(x=>x.trim()).filter(Boolean)}});d.close();notice("הרשאות המנהל נשמרו")};
}
async function orgWaitlistDialog(orgId){
  const data=await api("/api/organizations/"+orgId+"/waitlist");
  modal("רשימת המתנה",`<div class="platform-list">${(data.entries||[]).map((x,i)=>`<div class="platform-row"><div><strong>#${i+1} · ${esc(x.full_name||"משתמש")}</strong><p>${esc(x.item_title||"")} · ${esc(x.status)} · ${esc(x.created_at||"")}</p></div></div>`).join("")||'<div class="platform-note">אין ממתינים כרגע.</div>'}</div>`);
}
async function orgTransfersDialog(orgId,orgItems){
  const [data,branchesData]=await Promise.all([api("/api/organizations/"+orgId+"/branch-transfers"),api("/api/organizations/"+orgId+"/branches")]);
  const branches=branchesData.branches||[];
  const d=modal("העברות בין סניפים",`<div class="platform-list">${(data.transfers||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.item_title||x.item_id)}</strong><p>${esc(x.status)} · ${esc(x.created_at)}</p></div>${x.status==="in_transit"?`<button class="platform-action" data-receive="${x.id}">קבלה בסניף</button>`:""}</div>`).join("")||'<div class="platform-note">אין העברות.</div>'}</div><form id="transfer-add" class="platform-form"><label><span>מוצר</span><select name="itemId" required><option value="">בחירה</option>${orgItems.map(i=>`<option value="${i.id}">${esc(i.title)}</option>`).join("")}</select></label><label><span>סניף מקור</span><select name="fromBranchId"><option value="">ללא</option>${branches.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label><label><span>סניף יעד</span><select name="toBranchId" required><option value="">בחירה</option>${branches.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join("")}</select></label><label><span>כמות</span><input name="quantity" type="number" min="1" max="999" value="1"></label><button class="platform-action" type="submit">יצירת העברה</button></form>`);
  $("[data-receive]",d).forEach(b=>b.onclick=async()=>{await api("/api/branch-transfers/"+b.dataset.receive+"/receive",{method:"POST",body:{}});d.close();notice("ההעברה התקבלה")});
  $("#transfer-add",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/organizations/"+orgId+"/branch-transfers",{method:"POST",body:{itemId:f.get("itemId"),fromBranchId:f.get("fromBranchId")||null,toBranchId:f.get("toBranchId"),quantity:Number(f.get("quantity"))}});d.close();notice("העברה נפתחה")};
}
function recurringDialog(){
  const d=modal("בקשה מחזורית",`<form id="recurring-form" class="platform-form"><label class="wide"><span>מזהה מוצר</span><input name="itemId" required></label><label><span>תחילת ההשאלה הראשונה</span><input name="startsAt" type="datetime-local" required></label><label><span>משך בכל פעם (דקות)</span><input name="duration" type="number" min="30" value="60"></label><label><span>תדירות</span><select name="frequency"><option value="weekly">כל שבוע</option><option value="biweekly">כל שבועיים</option><option value="monthly">כל חודש</option></select></label><label><span>מספר מופעים</span><input name="occurrences" type="number" min="2" max="52" value="4"></label><label><span>כמות</span><input name="quantity" type="number" min="1" max="999" value="1"></label><button class="platform-action" type="submit">יצירה</button></form>`);
  $("#recurring-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/me/recurring-loans",{method:"POST",body:{itemId:f.get("itemId"),startsAt:f.get("startsAt"),durationMinutes:Number(f.get("duration")),frequency:f.get("frequency"),occurrences:Number(f.get("occurrences")),quantity:Number(f.get("quantity"))}});d.close();notice("הבקשה המחזורית נשמרה")};
}

function loanChangeDialog(id){
  const d=modal("שינוי בקשת השאלה",`<form id="loan-change-form" class="platform-form"><label><span>מתאריך</span><input name="from" type="datetime-local" required></label><label><span>עד תאריך</span><input name="until" type="datetime-local" required></label><label><span>כמות</span><input name="quantity" type="number" min="1" max="999" value="1" required></label><button class="platform-action" type="submit">שליחה לאישור מחדש</button></form>`);
  $("#loan-change-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/loan-requests/"+id+"/change",{method:"POST",body:{requestedFrom:f.get("from"),requestedUntil:f.get("until"),quantity:Number(f.get("quantity"))}});d.close();notice("בקשת השינוי נשלחה")};
}
function loanExtensionDialog(id){
  const d=modal("בקשת הארכה",`<form id="loan-extension-form" class="platform-form"><label><span>מועד החזרה חדש</span><input name="until" type="datetime-local" required></label><button class="platform-action" type="submit">שליחת בקשה</button></form>`);
  $("#loan-extension-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/loan-requests/"+id+"/extension",{method:"POST",body:{requestedUntil:f.get("until")}});d.close();notice("בקשת ההארכה נשלחה")};
}
async function loanUnitsDialog(id,itemId){
  const u=await api("/api/items/"+itemId+"/units");
  const d=modal("הקצאת יחידות",`<form id="loan-units-form" class="platform-list">${(u.units||[]).filter(x=>["available","held"].includes(x.status)).map(x=>`<label class="platform-row"><span><strong dir="ltr">${esc(x.serial_number)}</strong> · ${esc(x.condition)}</span><input type="checkbox" name="unit" value="${x.id}"></label>`).join("")||'<div class="platform-note">אין יחידות זמינות.</div>'}<button class="platform-action" type="submit">הקצאה</button></form>`);
  $("#loan-units-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/loan-requests/"+id+"/assign-units",{method:"POST",body:{unitIds:f.getAll("unit")}});d.close();notice("היחידות הוקצו")};
}

async function branchPolicyDialog(branchId,orgId,items){
  const current=await api("/api/branches/"+branchId+"/inventory-policies"),map=new Map((current.policies||[]).map(x=>[x.item_id,x]));
  const d=modal("מדיניות מלאי לסניף",`<form id="branch-policy-form" class="platform-list">${items.map(i=>{const p=map.get(i.id)||{};return`<div class="platform-row"><div><strong>${esc(i.title)}</strong></div><div class="platform-row-actions"><select data-mode="${i.id}"><option value="inherit">לפי ברירת מחדל</option><option value="separate">מלאי נפרד</option><option value="shared">מלאי משותף</option></select><input data-qty="${i.id}" type="number" min="0" max="999" placeholder="כמות בסניף" value="${p.quantity_override??""}" style="max-width:110px"></div></div>`}).join("")||'<div class="platform-note">אין מוצרים בגמ״ח.</div>'}<button class="platform-action" type="submit">שמירת מדיניות</button></form>`);
  for(const i of items){const el=d.querySelector('[data-mode="'+CSS.escape(i.id)+'"]');if(el)el.value=map.get(i.id)?.mode||"inherit"}
  $("#branch-policy-form",d).onsubmit=async e=>{e.preventDefault();const policies=items.map(i=>({itemId:i.id,mode:d.querySelector('[data-mode="'+CSS.escape(i.id)+'"]').value,quantityOverride:d.querySelector('[data-qty="'+CSS.escape(i.id)+'"]').value===""?null:Number(d.querySelector('[data-qty="'+CSS.escape(i.id)+'"]').value)}));await api("/api/branches/"+branchId+"/inventory-policies",{method:"PUT",body:{policies}});d.close();notice("מדיניות המלאי נשמרה")};
}
function reviewEditDialog(id,rating,comment){
  const d=modal("עריכת ביקורת",`<form id="review-edit-form" class="platform-form"><label><span>דירוג</span><select name="rating">${[5,4,3,2,1].map(v=>`<option value="${v}" ${v===rating?"selected":""}>${v} כוכבים</option>`).join("")}</select></label><label class="wide"><span>ביקורת</span><textarea name="comment" maxlength="1500">${esc(comment)}</textarea></label><button class="platform-action" type="submit">שמירה</button></form>`);
  $("#review-edit-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/reviews/"+id+"/edit",{method:"PATCH",body:{rating:Number(f.get("rating")),comment:f.get("comment")}});d.close();notice("הביקורת עודכנה")};
}
function reviewResponseDialog(id){
  const d=modal("תגובה לביקורת",`<form id="review-response-form" class="platform-form"><label class="wide"><span>תגובה</span><textarea name="response" maxlength="1000" required></textarea></label><button class="platform-action" type="submit">פרסום תגובה</button></form>`);
  $("#review-response-form",d).onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);await api("/api/reviews/"+id+"/respond",{method:"POST",body:{response:f.get("response")}});d.close();notice("התגובה פורסמה")};
}

async function manageItemImages(itemId){
  const data=await api("/api/items/"+itemId+"/images/manage"),images=data.images||[];
  const d=modal("ניהול תמונות",`<p class="platform-muted">בחרו תמונה ראשית, שנו סדר או הסירו תמונות. עיבוד מקומי לפני העלאה זמין בטופס המוצר.</p><div class="platform-list" id="img-manage-list">${images.map((x,i)=>`<div class="platform-row" draggable="true" data-url="${esc(x.url)}"><div><img src="${esc(x.url)}" alt="" style="width:96px;height:72px;object-fit:cover;border-radius:8px"><p>${x.is_primary?"תמונה ראשית":""} · ${esc(x.moderation_status)}</p></div><div class="platform-row-actions"><label><input type="radio" name="primary-image" value="${esc(x.url)}" ${x.is_primary?"checked":""}> ראשית</label><button type="button" class="platform-action secondary" data-up>↑</button><button type="button" class="platform-action secondary" data-down>↓</button><button type="button" class="platform-action danger" data-delete>הסרה</button></div></div>`).join("")||'<div class="platform-note">אין תמונות.</div>'}</div><p><button class="platform-action" id="save-image-order">שמירת שינויים</button></p>`);
  const list=$("#img-manage-list",d);
  const move=(row,dir)=>{const sibling=dir<0?row.previousElementSibling:row.nextElementSibling;if(sibling)list.insertBefore(dir<0?row:sibling,dir<0?sibling:row)};
  $$("[data-up]",d).forEach(b=>b.onclick=()=>move(b.closest("[data-url]"),-1));
  $$("[data-down]",d).forEach(b=>b.onclick=()=>move(b.closest("[data-url]"),1));
  $$("[data-delete]",d).forEach(b=>b.onclick=()=>b.closest("[data-url]").remove());
  $("#save-image-order",d).onclick=async()=>{const rows=$$("[data-url]",d),orderedUrls=rows.map(r=>r.dataset.url),primaryUrl=$('input[name="primary-image"]:checked',d)?.value||orderedUrls[0]||"";await api("/api/items/"+itemId+"/images/manage",{method:"PATCH",body:{orderedUrls,primaryUrl}});d.close();notice("סדר התמונות נשמר")};
}
function installImageEditor(){
  const input=$("#item-images");if(!input||input.dataset.editorInstalled)return;input.dataset.editorInstalled="1";
  input.addEventListener("change",async()=>{
    const files=[...input.files];if(!files.length||typeof DataTransfer==="undefined")return;
    const first=files[0],url=URL.createObjectURL(first),img=new Image();img.src=url;await img.decode().catch(()=>{});
    if(!img.naturalWidth)return URL.revokeObjectURL(url);
    let rotation=0,crop=false,blur=false;
    const d=modal("עיבוד התמונה הראשונה",`<canvas id="img-edit-canvas" style="max-width:100%;border-radius:10px;border:1px solid #ddd"></canvas><div class="platform-row-actions"><button type="button" class="platform-action secondary" id="img-rotate">סיבוב 90°</button><button type="button" class="platform-action secondary" id="img-crop">חיתוך ריבוע מרכזי</button><button type="button" class="platform-action secondary" id="img-blur">טשטוש פרטיות</button><button type="button" class="platform-action" id="img-apply">החלפה בקובץ המעובד</button><button type="button" class="platform-action secondary" id="img-keep">השארת המקור</button></div>`);
    const canvas=$("#img-edit-canvas",d),ctx=canvas.getContext("2d");
    const draw=()=>{let sw=img.naturalWidth,sh=img.naturalHeight,sx=0,sy=0;if(crop){const s=Math.min(sw,sh);sx=(sw-s)/2;sy=(sh-s)/2;sw=sh=s}const turn=(rotation/90)%2!==0;const max=1200,scale=Math.min(1,max/Math.max(sw,sh)),w=Math.round(sw*scale),h=Math.round(sh*scale);canvas.width=turn?h:w;canvas.height=turn?w:h;ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.filter=blur?"blur(7px)":"none";if(rotation===90){ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2)}else if(rotation===180){ctx.translate(canvas.width,canvas.height);ctx.rotate(Math.PI)}else if(rotation===270){ctx.translate(0,canvas.height);ctx.rotate(-Math.PI/2)}ctx.drawImage(img,sx,sy,sw,sh,0,0,w,h);ctx.restore()};
    draw();$("#img-rotate",d).onclick=()=>{rotation=(rotation+90)%360;draw()};$("#img-crop",d).onclick=()=>{crop=!crop;draw()};$("#img-blur",d).onclick=()=>{blur=!blur;draw()};
    $("#img-keep",d).onclick=()=>{URL.revokeObjectURL(url);d.close()};
    $("#img-apply",d).onclick=()=>canvas.toBlob(blob=>{if(!blob)return;const ext=first.type==="image/png"?"png":"jpg",processed=new File([blob],first.name.replace(/\.[^.]+$/,"")+"-edited."+ext,{type:blob.type||"image/jpeg"}),dt=new DataTransfer();dt.items.add(processed);files.slice(1,4).forEach(x=>dt.items.add(x));input.files=dt.files;URL.revokeObjectURL(url);d.close();notice("התמונה עובדה מקומית ותועלה בגרסה החדשה")},first.type==="image/png"?"image/png":"image/jpeg",0.9);
  });
}

async function supportFaq(){
  const form=$("#support-form");if(!form||$("#support-faq-suggestions"))return;
  try{const data=await api("/api/faqs");const box=document.createElement("div");box.id="support-faq-suggestions";box.className="platform-note";box.innerHTML="<strong>לפני פתיחת פנייה — אולי זה יעזור:</strong>"+data.articles.slice(0,4).map(a=>`<details><summary>${esc(a.title)}</summary><p>${esc(a.body)}</p></details>`).join("");form.prepend(box)}catch{}
}
function reportPerformance(){
  if(!("PerformanceObserver" in window))return;
  try{
    const send=(metric,value)=>navigator.sendBeacon?.("/api/performance",new Blob([JSON.stringify({metric,value,path:location.pathname+location.hash})],{type:"application/json"}));
    new PerformanceObserver(list=>{for(const e of list.getEntries())if(e.entryType==="largest-contentful-paint")send("LCP",e.startTime)}).observe({type:"largest-contentful-paint",buffered:true});
    new PerformanceObserver(list=>{let total=0;for(const e of list.getEntries())if(!e.hadRecentInput)total+=e.value;send("CLS",total)}).observe({type:"layout-shift",buffered:true});
  }catch{}
}
document.addEventListener("DOMContentLoaded",()=>{
  installWizardEntry();installAdvancedEntry();installPush();installQrRoute();enhanceChat();installImageEditor();addAdminFinalPanels();supportFaq();reportPerformance();
  const watcher=new MutationObserver(()=>{if(!$("#dashboard-view")?.hidden)installTour()});watcher.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
});
})();