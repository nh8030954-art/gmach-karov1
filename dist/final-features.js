(() => {
"use strict";
  const localizedDialogText = message => window.GmachTranslate?.(message) || message;
  const translatedConfirm = message => window.confirm(localizedDialogText(message));
  const translatedPrompt = (message,defaultValue) => window.prompt(localizedDialogText(message),defaultValue);
  const translatedAlert = message => window.alert(localizedDialogText(message));

const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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
  n.style.background=error?"#8b1e2d":"#17365d";n.textContent=window.GmachTranslate?.(message)||message;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>n.hidden=true,4200);
}
function modal(title,html){
  let d=$("#final-feature-dialog");if(!d){d=document.createElement("dialog");d.id="final-feature-dialog";d.className="platform-dialog";document.body.append(d)}
  d.innerHTML=`<div class="platform-dialog-inner" dir="${document.documentElement.lang==="en"?"ltr":"rtl"}"><div class="platform-dialog-head"><h2>${esc(title)}</h2><button type="button" class="platform-dialog-close" aria-label="סגירה">×</button></div><div id="final-feature-body">${html}</div></div>`;
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
    const consoleNav=$(".platform-console-nav");if(consoleNav&&!$("#final-wizard-button")){
      const b=document.createElement("button");b.id="final-wizard-button";b.type="button";b.textContent="אשף פתיחת גמ״ח";b.onclick=()=>openWizard().catch(e=>notice(e.message,true));consoleNav.append(b);
    }
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
    if(sub){const j=sub.toJSON();await api("/api/me/push-subscriptions",{method:"POST",body:{endpoint:j.endpoint,keys:j.keys}})}
    const addButton=()=>{const host=$("#platform-panel");if(!host||$("#enable-push"))return;const b=document.createElement("button");b.id="enable-push";b.className="platform-action secondary";b.textContent="הפעלת התראות Push";b.onclick=async()=>{const perm=await Notification.requestPermission();if(perm!=="granted")return notice("לא ניתנה הרשאת התראות",true);const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(cfg.pushPublicKey)});const j=s.toJSON();await api("/api/me/push-subscriptions",{method:"POST",body:{endpoint:j.endpoint,keys:j.keys}});notice("התראות Push הופעלו")};host.prepend(b)};
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
      $$("[data-scan]",d).forEach(b=>b.onclick=async()=>{let note="";if(b.dataset.scan==="fault")note=translatedPrompt("תיאור התקלה:")||"";await api("/api/item-units/"+u.id+"/scan-action",{method:"POST",body:{action:b.dataset.scan,note}});d.close();notice("סטטוס היחידה עודכן")});
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
        if(b.dataset.chatMedia==="location"){navigator.geolocation.getCurrentPosition(async p=>{await api("/api/loan-requests/"+requestId+"/chat-rich",{method:"POST",body:{type:"location",metadata:{lat:p.coords.latitude,lon:p.coords.longitude}}});notice("המיקום נשלח")},()=>notice("לא ניתנה הרשאת מיקום",true));return}
        if(b.dataset.chatMedia==="item"){const itemId=translatedPrompt("מזהה המוצר לשיתוף:");if(itemId)await api("/api/loan-requests/"+requestId+"/chat-rich",{method:"POST",body:{type:"item",metadata:{itemId}}});return}
        const input=document.createElement("input");input.type="file";input.accept=b.dataset.chatMedia==="audio"?"audio/*":"image/*";if(b.dataset.chatMedia==="image")input.capture="environment";input.onchange=async()=>{const fd=new FormData();fd.set("file",input.files[0]);fd.set("type",b.dataset.chatMedia);const r=await fetch("/api/loan-requests/"+requestId+"/chat-attachment",{method:"POST",credentials:"same-origin",body:fd,headers:{"Origin":location.origin}});if(!r.ok){const j=await r.json();throw new Error(j.error)}notice("הקובץ נשלח")};input.click();
      }catch(e){notice(e.message,true)}
    });
  };new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
}
function installPersonalFinalPanels(){
  const apply=()=>{
    const nav=$(".platform-console-nav");if(!nav||$("#final-personal-button"))return;
    const b=document.createElement("button");b.id="final-personal-button";b.type="button";b.textContent="מועדפים ובקשות קבועות";b.onclick=async()=>{
      try{
        const [saved,recurring,waitlist,reviews]=await Promise.all([api("/api/me/saved-entities"),api("/api/me/recurring-loans"),api("/api/me/waitlist-offers"),api("/api/me/reviews")]);
        const labels={item:"מוצר",organization:"גמ״ח",category:"קטגוריה",help_request:"בקשת קהילה",search:"חיפוש"};
        const d=modal("מועדפים ובקשות קבועות",`<h3>הצעות פעילות מרשימת המתנה</h3><div class="platform-list">${(waitlist.offers||[]).filter(x=>!x.accepted_at&&!x.declined_at&&new Date(x.expires_at)>new Date()).map(x=>`<div class="platform-row"><div><strong>${esc(x.title)}</strong><p>${esc(x.requested_from)} עד ${esc(x.requested_until)} · בתוקף עד ${esc(x.expires_at)}</p></div><div class="platform-row-actions"><button class="platform-action" data-waitlist-accept="${esc(x.id)}">קבלת ההצעה</button><button class="platform-action danger" data-waitlist-decline="${esc(x.id)}">ויתור</button></div></div>`).join("")||'<p class="platform-muted">אין הצעה פעילה כרגע.</p>'}</div><h3>כל המועדפים</h3><div class="platform-list" id="saved-entities-list">${saved.saved.map(x=>`<div class="platform-row"><div><strong>${esc(labels[x.entity_type]||x.entity_type)}</strong><p>${esc(x.entity_id)} · ${x.notify?"התראות פעילות":"ללא התראות"}</p></div><button class="platform-action danger" data-remove-saved="${esc(x.entity_type)}" data-id="${esc(x.entity_id)}">הסרה</button></div>`).join("")||'<p class="platform-muted">אין מועדפים נוספים.</p>'}</div><h3>שמירת תוכן נוסף</h3><form id="saved-entity-form" class="platform-form"><label>סוג<select name="type"><option value="category">קטגוריה</option><option value="help_request">בקשת קהילה</option><option value="search">חיפוש</option><option value="organization">גמ״ח</option></select></label><label>מזהה או ערך<input name="id" required></label><label><input type="checkbox" name="notify" checked> לקבל התראות</label><button class="platform-action">שמירה</button></form><h3>הביקורות שלי</h3><div class="platform-list">${(reviews.reviews||[]).map(x=>`<div class="platform-row"><div><strong>${esc(x.item_title)} · ${Number(x.rating)}/5</strong><p>${esc(x.body||"ללא טקסט")}</p><small>${x.requested_from?esc(x.requested_from)+" - "+esc(x.requested_until)+" · כמות "+Number(x.loan_quantity||1):""}</small>${x.organization_response?`<p><strong>תגובת הגמ״ח:</strong> ${esc(x.organization_response)}</p>`:""}</div><button class="platform-action" data-edit-my-review="${esc(x.id)}" data-review-rating="${Number(x.rating)}" data-review-body="${esc(x.body||"")}">עריכה</button></div>`).join("")||'<p class="platform-muted">עדיין לא כתבת ביקורות.</p>'}</div><h3>בקשות מחזוריות</h3><form id="recurring-loan-form" class="platform-form"><label>מזהה מוצר<input name="itemId" required></label><label>כמות<input name="quantity" type="number" min="1" value="1"></label><label>מועד ראשון<input name="startsAt" type="datetime-local" required></label><label>משך בדקות<input name="durationMinutes" type="number" min="30" value="1440"></label><label>תדירות<select name="frequency"><option value="weekly">שבועי</option><option value="biweekly">דו שבועי</option><option value="monthly">חודשי</option></select></label><label>מספר מופעים<input name="occurrences" type="number" min="2" max="52" value="4"></label><button class="platform-action">יצירת בקשה מחזורית</button></form><div class="platform-list">${recurring.rules.map(x=>`<div class="platform-row"><div><strong>${esc(x.title)}</strong><p>${esc(x.frequency)} · ${esc(x.starts_at)} · ${x.occurrences} מופעים · ${esc(x.status)}</p></div>${x.status==="active"?`<button class="platform-action danger" data-cancel-rule="${esc(x.id)}">ביטול</button>`:""}</div>`).join("")||'<p class="platform-muted">אין בקשות מחזוריות.</p>'}</div>`);
        $$("[data-edit-my-review]",d).forEach(x=>x.onclick=async()=>{const rating=Number(translatedPrompt("דירוג חדש 1-5:",x.dataset.reviewRating));if(!Number.isInteger(rating)||rating<1||rating>5)return;const body=translatedPrompt("עדכון הביקורת:",x.dataset.reviewBody)||"";try{await api("/api/reviews/"+encodeURIComponent(x.dataset.editMyReview)+"/edit",{method:"PATCH",body:{rating,body}});notice("הביקורת עודכנה");d.close();b.click()}catch(e){notice(e.message,true)}});
        $$("[data-waitlist-accept]",d).forEach(x=>x.onclick=async()=>{const r=await api("/api/me/waitlist-offers/"+encodeURIComponent(x.dataset.waitlistAccept)+"/accept",{method:"POST",body:{}});notice("ההצעה התקבלה ונוצרה בקשת השאלה");d.close();location.hash="#/dashboard"}); $$("[data-waitlist-decline]",d).forEach(x=>x.onclick=async()=>{await api("/api/me/waitlist-offers/"+encodeURIComponent(x.dataset.waitlistDecline)+"/decline",{method:"POST",body:{}});notice("ויתרת על ההצעה");d.close();b.click()});
        $("#saved-entity-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/me/saved-entities",{method:"POST",body:{type:f.type.value,id:f.id.value,notify:f.notify.checked}});notice("התוכן נשמר במועדפים");d.close();b.click()};
        $("#recurring-loan-form",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/me/recurring-loans",{method:"POST",body:{itemId:f.itemId.value,quantity:Number(f.quantity.value),startsAt:new Date(f.startsAt.value).toISOString(),durationMinutes:Number(f.durationMinutes.value),frequency:f.frequency.value,occurrences:Number(f.occurrences.value)}});notice("הבקשה המחזורית נוצרה");d.close();b.click()};
        $$("[data-remove-saved]",d).forEach(x=>x.onclick=async()=>{await api("/api/me/saved-entities/"+encodeURIComponent(x.dataset.removeSaved)+"/"+encodeURIComponent(x.dataset.id),{method:"DELETE"});x.closest(".platform-row")?.remove();notice("המועדף הוסר")});
        $$("[data-cancel-rule]",d).forEach(x=>x.onclick=async()=>{await api("/api/me/recurring-loans/"+encodeURIComponent(x.dataset.cancelRule),{method:"DELETE"});x.disabled=true;x.textContent="בוטל";notice("הבקשה המחזורית בוטלה")});
      }catch(e){notice(e.message,true)}
    };nav.append(b);
  };new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
}
function installReviewPanel(){
  const apply=()=>{const nav=$(".platform-console-nav");if(!nav||$("#final-reviews-button"))return;const b=document.createElement("button");b.id="final-reviews-button";b.type="button";b.textContent="הביקורות שלי";b.onclick=async()=>{try{const data=await api("/api/me/reviews");const d=modal("הביקורות שלי",`<h3>ביקורות שכתבתי</h3><div class="platform-list">${(data.authored||[]).map(r=>`<div class="platform-row"><div><strong>${esc(r.item_title||r.organization_name||"ביקורת")}</strong><p>גמ״ח ${r.rating||""}★ · מוצר ${r.product_rating||r.rating||""}★ · שירות ${r.service_rating||r.rating||""}★${r.branch_id?` · סניף ${r.branch_rating||r.rating||""}★`:""}</p><p>${esc(r.comment||"")}</p><small>${r.branch_name?esc(r.branch_name)+" · ":""}${esc(r.created_at||"")}</small></div><button class="platform-action secondary" data-edit-review="${esc(r.id)}">עריכה</button></div>`).join("")||'<p class="platform-muted">עדיין לא כתבת ביקורות.</p>'}</div><h3>ביקורות על הגמ״חים שלי</h3><div class="platform-list">${(data.received||[]).map(r=>`<div class="platform-row"><div><strong>${esc(r.item_title||r.organization_name||"ביקורת")}</strong><p>${esc(r.author_name||"משתמש")} · ${r.rating||""}★</p><p>${esc(r.comment||"")}</p>${r.organization_response?`<p><strong>התגובה שלך:</strong> ${esc(r.organization_response)}</p>`:""}</div><button class="platform-action secondary" data-respond-review="${esc(r.id)}">תגובה</button></div>`).join("")||'<p class="platform-muted">אין ביקורות שהתקבלו.</p>'}</div>`);
        $$("[data-edit-review]",d).forEach(x=>x.onclick=async()=>{const r=(data.authored||[]).find(v=>v.id===x.dataset.editReview);const rating=Number(translatedPrompt("דירוג כללי 1-5",String(r.rating||5)));const product=Number(translatedPrompt("דירוג מוצר 1-5",String(r.product_rating||r.rating||5)));const service=Number(translatedPrompt("דירוג שירות 1-5",String(r.service_rating||r.rating||5)));const branch=r.branch_id?Number(translatedPrompt("דירוג סניף 1-5",String(r.branch_rating||r.rating||5))):null;const comment=translatedPrompt("עדכון הביקורת",r.comment||"");if(!rating||!product||!service||(r.branch_id&&!branch))return;await api("/api/reviews/"+encodeURIComponent(r.id)+"/edit",{method:"PATCH",body:{rating,productRating:product,serviceRating:service,branchRating:branch,comment}});notice("הביקורת עודכנה");d.close();b.click()});
        $$("[data-respond-review]",d).forEach(x=>x.onclick=async()=>{const r=(data.received||[]).find(v=>v.id===x.dataset.respondReview);const response=translatedPrompt("תגובת הגמ״ח לביקורת",r.organization_response||"");if(!response)return;await api("/api/reviews/"+encodeURIComponent(r.id)+"/respond",{method:"POST",body:{response}});notice("תגובת הגמ״ח נשמרה");d.close();b.click()});
      }catch(e){notice(e.message,true)}};nav.append(b)};
  new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
}
function addAdminFinalPanels(){
  const apply=()=>{
    const nav=$(".platform-console-nav");if(!nav||$("#final-admin-button")||!nav.textContent.includes("ניהול־על"))return;
    const b=document.createElement("button");b.id="final-admin-button";b.textContent="תפעול מתקדם";b.onclick=async()=>{
      try{
        const [analytics,audit,templates,holidays,mod,backups]=await Promise.all([api("/api/admin/analytics/operations"),api("/api/admin/audit"),api("/api/admin/email-templates"),api("/api/admin/holiday-rules"),api("/api/admin/moderation"),api("/api/admin/backups")]);
        const d=modal("תפעול מתקדם",`<div class="platform-kpis"><article><strong>${analytics.loans.total||0}</strong><span>השאלות</span></article><article><strong>${analytics.loans.completed||0}</strong><span>הושלמו</span></article><article><strong>${analytics.loans.cancelled||0}</strong><span>בוטלו</span></article><article><strong>${analytics.loans.late||0}</strong><span>איחורים</span></article><article><strong>${analytics.users.active30||0}</strong><span>פעילים 30 יום</span></article></div>
        <h3>גיבויים</h3><p><button class="platform-action" id="backup-now">יצירת גיבוי לוגי עכשיו</button> · ${backups.backups.length} גיבויים רשומים</p>
        <h3>תבניות אימייל</h3><div class="platform-list" id="template-list">${templates.templates.map(t=>`<button type="button" class="platform-action secondary" data-template="${esc(t.template_key)}" data-lang="${esc(t.language)}">${esc(t.template_key)} · ${esc(t.language)} · ${esc(t.subject)}</button>`).join("")}</div>
        <form id="template-editor" class="platform-form" hidden><input name="key" readonly><select name="language"><option value="he">עברית</option><option value="en">English</option></select><input name="subject" placeholder="נושא" required><textarea name="bodyText" rows="6" placeholder="תוכן" required></textarea><label><input type="checkbox" name="enabled"> פעיל</label><button class="platform-action">שמירת תבנית</button></form>
        <h3>חגים</h3><div class="platform-list">${holidays.holidays.map(h=>`<div class="platform-row"><div><strong>${esc(h.title_he)}</strong><p>${esc(h.hebrew_day)} ${esc(h.hebrew_month)}</p></div><button class="platform-action secondary" data-holiday="${esc(h.id)}">${h.enabled?"השבתה":"הפעלה"}</button></div>`).join("")}</div>
        <h3>Moderation</h3><div class="platform-list">${mod.jobs.slice(0,100).map(j=>`<div class="platform-row"><div><strong>${esc(j.entity_type||"דיווח")} · ${esc(j.severity||"")}</strong><p>${esc(j.reason||j.status||"")}</p></div><button class="platform-action" data-mod="${esc(j.id)}" data-status="reviewed">נבדק</button><button class="platform-action danger" data-mod="${esc(j.id)}" data-status="hidden">הסתרה</button></div>`).join("")||'<p>אין פריטים פתוחים.</p>'}</div>
        <h3>Audit</h3><p>${audit.entries.length} פעולות אחרונות.</p><div class="platform-row-actions"><input id="audit-filter" placeholder="סינון לפי פעולה"><button class="platform-action secondary" id="audit-export">ייצוא CSV</button></div><div class="platform-list" id="audit-list">${audit.entries.slice(0,100).map(a=>`<div class="platform-row" data-audit-action="${esc(a.action||"")}"><div><strong>${esc(a.action||"")}</strong><p>${esc(a.actor_name||a.actor_id||"")} · ${esc(a.created_at||"")} · ${esc(a.ip_address||"")}</p></div></div>`).join("")}</div>`);
        $("#backup-now",d).onclick=async()=>{await api("/api/admin/backups",{method:"POST",body:{}});notice("הגיבוי נוצר")};
        $$("[data-template]",d).forEach(x=>x.onclick=()=>{const t=templates.templates.find(t=>t.template_key===x.dataset.template&&t.language===x.dataset.lang),f=$("#template-editor",d);f.hidden=false;f.key.value=t.template_key;f.language.value=t.language;f.subject.value=t.subject||"";f.bodyText.value=t.body_text||"";f.enabled.checked=t.enabled!==0;f.scrollIntoView({block:"nearest"})});
        $("#template-editor",d).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/admin/email-templates/"+encodeURIComponent(f.key.value)+"/"+f.language.value,{method:"PUT",body:{subject:f.subject.value,bodyText:f.bodyText.value,enabled:f.enabled.checked}});notice("תבנית האימייל נשמרה")};
        $$("[data-holiday]",d).forEach(x=>x.onclick=async()=>{const h=holidays.holidays.find(h=>h.id===x.dataset.holiday);await api("/api/admin/holiday-rules/"+encodeURIComponent(h.id),{method:"PATCH",body:{titleHe:h.title_he,titleEn:h.title_en,enabled:!h.enabled,messageHe:h.message_he,messageEn:h.message_en}});h.enabled=h.enabled?0:1;x.textContent=h.enabled?"השבתה":"הפעלה";notice("הגדרת החג עודכנה")});
        $$("[data-mod]",d).forEach(x=>x.onclick=async()=>{await api("/api/admin/moderation/"+encodeURIComponent(x.dataset.mod),{method:"PATCH",body:{status:x.dataset.status}});x.closest(".platform-row")?.remove();notice("פעולת האכיפה נשמרה")});
        $("#audit-filter",d).oninput=e=>{const q=e.target.value.toLowerCase();$$("[data-audit-action]",d).forEach(x=>x.hidden=!x.dataset.auditAction.toLowerCase().includes(q))};
        $("#audit-export",d).onclick=()=>{const rows=[["action","actor","created_at","ip"],...audit.entries.map(a=>[a.action,a.actor_name||a.actor_id||"",a.created_at||"",a.ip_address||""])],csv=rows.map(r=>r.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(",")).join("\\n"),url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download="gmach-audit.csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
      }catch(e){notice(e.message,true)}
    };nav.append(b);
  };new MutationObserver(apply).observe(document.body,{childList:true,subtree:true});apply();
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
  installWizardEntry();installPush();installQrRoute();enhanceChat();installPersonalFinalPanels();installReviewPanel();addAdminFinalPanels();supportFaq();reportPerformance();
  const watcher=new MutationObserver(()=>{if(!$("#dashboard-view")?.hidden)installTour()});watcher.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
});
})();
