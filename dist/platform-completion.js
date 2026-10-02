(()=>{
  const localizedDialogText = message => window.GmachTranslate?.(message) || message;
  const translatedConfirm = message => window.confirm(localizedDialogText(message));
  const translatedPrompt = (message,defaultValue) => window.prompt(localizedDialogText(message),defaultValue);
  const translatedAlert = message => window.alert(localizedDialogText(message));

  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function installAdminStepUp(){
    if(window.__gmachStepUpInstalled)return;window.__gmachStepUpInstalled=true;
    const nativeFetch=window.fetch.bind(window);
    window.fetch=async(input,init={})=>{
      let response=await nativeFetch(input,init);
      const method=String(init?.method||(input instanceof Request?input.method:"GET")||"GET").toUpperCase();
      const target=typeof input==="string"?input:input?.url||"";
      if(response.status!==428||method==="GET"||target.includes("/api/admin/action-challenges"))return response;
      let info={};try{info=await response.clone().json()}catch{}
      if(!translatedConfirm(info.error||"הפעולה דורשת קוד אישור נוסף שיישלח למייל המנהל. להמשיך?"))return response;
      const url=new URL(target,location.origin),action=method+" "+url.pathname;
      const challenge=await nativeFetch("/api/admin/action-challenges",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action})});
      const challengeData=await challenge.json().catch(()=>({}));if(!challenge.ok)throw new Error(challengeData.error||"לא ניתן ליצור קוד אישור");
      const code=translatedPrompt("הזינו את קוד האישור בן 6 הספרות שנשלח למייל:");if(!code)return response;
      const headers=new Headers(init?.headers||(input instanceof Request?input.headers:undefined)||{});headers.set("X-Admin-Challenge-Id",challengeData.challenge.id);headers.set("X-Admin-Challenge-Code",code.trim());
      const retryInit={...init,method,headers};
      response=await nativeFetch(input,retryInit);return response;
    };
  }
  installAdminStepUp();
  const turnstileState={enabled:false,siteKey:null,tokens:{register:null,support:null,login:null},widgets:{},loginRequired:false};
  window.GmachTurnstile={token:scope=>turnstileState.tokens[scope]||null,reset:scope=>{const id=turnstileState.widgets[scope];if(window.turnstile&&id!==undefined)window.turnstile.reset(id);turnstileState.tokens[scope]=null;},requireLogin:()=>{turnstileState.loginRequired=true;const form=document.getElementById("auth-form");if(form&&window.turnstile){const existing=form.querySelector('[data-turnstile-scope="login"]');if(existing){existing.hidden=false;return}const host=document.createElement("div");host.dataset.turnstileScope="login";host.style.minHeight="66px";host.setAttribute("aria-label","אימות אנושי");const submit=form.querySelector('[type="submit"]');submit?.parentNode?.insertBefore(host,submit);turnstileState.widgets.login=window.turnstile.render(host,{sitekey:turnstileState.siteKey,theme:"auto",callback:t=>turnstileState.tokens.login=t,"expired-callback":()=>turnstileState.tokens.login=null,"error-callback":()=>turnstileState.tokens.login=null});}}};
  async function setupTurnstile(){
    let features;try{features=await fetch("/api/platform/features",{credentials:"same-origin"}).then(r=>r.json());}catch{return;}
    if(!features?.turnstileEnabled||!features.turnstileSiteKey)return;
    turnstileState.enabled=true;turnstileState.siteKey=features.turnstileSiteKey;
    if(!document.querySelector('script[data-gmach-turnstile]')){
      const s=document.createElement("script");s.src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";s.async=true;s.defer=true;s.dataset.gmachTurnstile="1";document.head.appendChild(s);
    }
    const wait=()=>new Promise(resolve=>{if(window.turnstile)return resolve();const t=setInterval(()=>{if(window.turnstile){clearInterval(t);resolve()}},80);setTimeout(()=>{clearInterval(t);resolve()},8000)});
    await wait();if(!window.turnstile)return;
    const add=(scope,form)=>{
      if(!form||form.querySelector('[data-turnstile-scope="'+scope+'"]'))return;
      const host=document.createElement("div");host.dataset.turnstileScope=scope;host.style.minHeight="66px";host.setAttribute("aria-label","אימות אנושי");const submit=form.querySelector('[type="submit"]');submit?.parentNode?.insertBefore(host,submit);
      turnstileState.widgets[scope]=window.turnstile.render(host,{sitekey:turnstileState.siteKey,theme:"auto",callback:t=>turnstileState.tokens[scope]=t,"expired-callback":()=>turnstileState.tokens[scope]=null,"error-callback":()=>turnstileState.tokens[scope]=null});
    };
    add("register",document.getElementById("auth-form"));add("support",document.getElementById("support-form"));if(turnstileState.loginRequired)window.GmachTurnstile.requireLogin();
    const sync=()=>{const registering=document.querySelector('[data-auth-mode="register"]')?.getAttribute("aria-selected")==="true";const reg=document.querySelector('[data-turnstile-scope="register"]');if(reg)reg.hidden=!registering;const login=document.querySelector('[data-turnstile-scope="login"]');if(login)login.hidden=registering||!turnstileState.loginRequired;};
    new MutationObserver(sync).observe(document.getElementById("auth-dialog")||document.body,{subtree:true,attributes:true,attributeFilter:["aria-selected"]});sync();
  }
  const api=async(path,opts={})=>{
    const res=await fetch(path,{credentials:"same-origin",...opts,headers:{"Content-Type":"application/json",...(opts.headers||{})},body:opts.body&&typeof opts.body!=="string"?JSON.stringify(opts.body):opts.body});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||"הפעולה לא הושלמה");
    return data;
  };
  const style=document.createElement("style");
  style.textContent=`
    #platform-tools-entry{margin-inline-start:.5rem}
    .platform-tools{border:0;border-radius:20px;max-width:min(960px,94vw);width:94vw;padding:0;box-shadow:0 24px 70px rgba(0,0,0,.22)}
    .platform-tools::backdrop{background:rgba(9,18,30,.55)}
    .pt-head{display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #e8edf2}
    .pt-head h2{margin:0}.pt-close{border:0;background:transparent;font-size:28px;cursor:pointer}
    .pt-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:14px 18px;border-bottom:1px solid #eef2f5;background:#f8fafb}
    .pt-nav-group{min-width:0;padding:10px;border:1px solid #e5eaee;border-radius:14px;background:#fff}
    .pt-nav-group>strong{display:block;margin:0 4px 8px;color:#667681;font-size:.76rem}
    .pt-nav-buttons{display:grid;gap:6px}
    .pt-tabs button{width:100%;text-align:start;border:0;background:transparent;border-radius:10px;padding:9px 10px;cursor:pointer;color:#173a4d}
    .pt-tabs button:hover{background:#f2f6f7}
    .pt-tabs button[aria-selected="true"]{font-weight:800;background:#173a4d;color:#fff}
    .pt-body{padding:22px;max-height:62vh;overflow:auto}.pt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .pt-card{border:1px solid #e4e9ee;border-radius:14px;padding:14px;background:#fff}.pt-card h3{margin-top:0}
    .pt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pt-form{display:grid;gap:10px}.pt-form[hidden]{display:none}.pt-form input:not([type="checkbox"]),.pt-form select,.pt-form textarea{width:100%;padding:10px;border:1px solid #ccd5dc;border-radius:10px}.pt-form input[type="checkbox"]{width:19px;height:19px;min-width:19px;margin:0;accent-color:#173a4d}.pt-form label:has(>input[type="checkbox"]){display:flex;gap:10px;align-items:center}.pt-form label:has(>input[type="checkbox"]) input{flex:none}
    .pt-btn{border:0;border-radius:10px;padding:9px 13px;cursor:pointer;background:#e9eef2}.pt-btn.primary{background:#173a4d;color:#fff}.pt-btn.danger{background:#fff0f0;color:#9f1d1d}
    .pt-muted{color:#667681;font-size:.92rem}.pt-status{min-height:1.4em;margin-top:8px}.pt-list{display:grid;gap:10px}.pt-list[hidden],.pt-list .pt-row[hidden]{display:none}.pt-favorite-row{display:grid!important;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.pt-favorite-main{min-width:0;border:0;background:transparent;padding:4px;text-align:start;display:flex;align-items:center;justify-content:space-between;gap:16px;cursor:pointer;color:inherit;font:inherit}.pt-favorite-main span{min-width:0;display:grid;gap:4px}.pt-favorite-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#173a4d}.pt-favorite-main small{display:block}.pt-favorite-main b{flex:0 0 auto;color:#173a4d}.pt-favorite-main:hover strong,.pt-favorite-main:focus-visible strong{text-decoration:underline}@media(max-width:560px){.pt-favorite-row{grid-template-columns:1fr}.pt-favorite-row>.pt-btn{width:100%}}
    @media(max-width:820px){.pt-tabs{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:700px){.platform-tools{width:100vw;max-width:100vw;border-radius:18px 18px 0 0;margin:auto 0 0}.pt-tabs{grid-template-columns:1fr 1fr;padding:10px}.pt-nav-group{padding:8px}.pt-tabs button{padding:8px}.pt-body{max-height:64vh;padding:16px}}
    @media(max-width:420px){.pt-tabs{grid-template-columns:1fr}.pt-nav-buttons{grid-template-columns:1fr 1fr}.pt-nav-group>strong{margin-bottom:6px}}
  `;
  document.head.appendChild(style);

  const dialog=document.createElement("dialog");
  dialog.className="platform-tools";
  dialog.id="platform-tools-dialog";
  dialog.innerHTML=`<div class="pt-head"><div><h2>החשבון שלי</h2><div class="pt-muted">פרטים אישיים, העדפות, שמורים ותמיכה</div></div><button class="pt-close" aria-label="סגירה">×</button></div><div class="pt-tabs" aria-label="ניווט בחשבון"></div><div class="pt-body"></div>`;
  document.body.appendChild(dialog);
  $(".pt-close",dialog).onclick=()=>dialog.close();

  const accountGroups=[
    ["החשבון שלי",[["profile","פרטים אישיים"],["addresses","כתובות"],["devices","מכשירים"],["privacy","פרטיות ונתונים"]]],
    ["העדפות",[["notifications","התראות"],["calendar","יומן"]]],
    ["שמורים",[["favorites","מועדפים"],["searches","חיפושים שמורים"],["categories","קטגוריות שמורות"]]],
    ["תמיכה",[["support","הפניות שלי"]]]
  ];
  let profile=null, active="profile";
  const tabbar=$(".pt-tabs",dialog), body=$(".pt-body",dialog);
  accountGroups.forEach(([groupLabel,tabs])=>{
    const group=document.createElement("section");group.className="pt-nav-group";
    group.innerHTML=`<strong>${esc(groupLabel)}</strong><div class="pt-nav-buttons"></div>`;
    const host=$(".pt-nav-buttons",group);
    tabs.forEach(([id,label])=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.tab=id;b.onclick=()=>render(id);host.appendChild(b)});
    tabbar.appendChild(group);
  });
  const adminGroup=document.createElement("section");adminGroup.className="pt-nav-group";adminGroup.hidden=true;adminGroup.dataset.adminGroup="1";
  adminGroup.innerHTML='<strong>הנהלת האתר</strong><div class="pt-nav-buttons"><button type="button" data-tab="admin">ניהול־על</button></div>';
  adminGroup.querySelector("button").onclick=()=>render("admin");tabbar.appendChild(adminGroup);

  function setStatus(msg,error=false){let el=$(".pt-status",body);if(!el){el=document.createElement("div");el.className="pt-status";body.appendChild(el)}el.textContent=window.GmachTranslate?.(msg)||msg||"";el.style.color=error?"#a11":"inherit";}
  async function render(id){
    active=id;
    tabbar.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===id)));
    body.innerHTML="<p>טוענים…</p>";
    try{
      if(!profile) profile=(await api("/api/me/profile")).profile;
      const adminGroup=tabbar.querySelector("[data-admin-group]");if(adminGroup)adminGroup.hidden=profile.role!=="admin";
      if(id==="admin" && profile.role!=="admin"){await render("profile");return;}
      await ({profile:renderProfile,transfers:renderTransfers,privacy:renderPrivacy,addresses:renderAddresses,devices:renderDevices,notifications:renderNotifications,favorites:renderFavorites,calendar:renderCalendar,searches:renderSearches,categories:renderSavedCategories,support:renderSupport,admin:renderAdmin}[id])();

    }catch(e){body.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
  }

  async function renderProfile(){
    profile=(await api("/api/me/profile")).profile;
    body.innerHTML=`<form class="pt-form" id="pt-profile"><div class="pt-grid">
      <label>שם מלא<input name="fullName" value="${esc(profile.full_name||profile.fullName||"")}" required></label>
      <label>טלפון<input name="phone" value="${esc(profile.phone||"")}" required></label>
      <label>עיר/יישוב<input name="city" value="${esc(profile.city||"")}" required></label>
      <label>שפה<select name="preferredLanguage"><option value="he">עברית</option><option value="en">English</option></select></label><label>אפליקציית ניווט<select name="preferredNavigation"><option value="google">Google Maps</option><option value="waze">Waze</option><option value="apple">Apple Maps</option></select></label>
      </div><label><input type="checkbox" name="operationalEmails" ${profile.operationalEmails!==false?"checked":""}> הודעות תפעוליות</label>
      <label><input type="checkbox" name="communityEmails" ${profile.communityEmails?"checked":""}> עדכוני קהילה</label>
      <div class="pt-row"><button class="pt-btn primary">שמירה</button>${profile.deletionRequestedAt?'<button type="button" class="pt-btn danger" id="pt-cancel-deletion">ביטול בקשת מחיקה</button>':""}</div></form><div class="pt-status"></div>`;
    const f=$("#pt-profile",body); f.preferredLanguage.value=profile.preferredLanguage||"he";f.preferredNavigation.value=profile.preferredNavigation||"google";
    f.onsubmit=async e=>{e.preventDefault();try{const chosenLanguage=f.preferredLanguage.value;profile=(await api("/api/me/profile",{method:"PATCH",body:{fullName:f.fullName.value,phone:f.phone.value,city:f.city.value,preferredLanguage:chosenLanguage,preferredNavigation:f.preferredNavigation.value,operationalEmails:f.operationalEmails.checked,communityEmails:f.communityEmails.checked}})).profile;const previousLanguage=localStorage.getItem("gmach-language")||document.documentElement.lang||"he";localStorage.setItem("gmach-language",chosenLanguage);localStorage.setItem("gmach-navigation-app",profile.preferredNavigation||f.preferredNavigation.value);setStatus("הפרטים נשמרו.");if(previousLanguage!==chosenLanguage)location.reload();}catch(err){setStatus(err.message,true)}};
    $("#pt-cancel-deletion",body)?.addEventListener("click",async()=>{try{await api("/api/me/account/cancel-deletion",{method:"POST",body:{}});profile.deletionRequestedAt=null;await renderProfile();setStatus("בקשת המחיקה בוטלה.");}catch(err){setStatus(err.message,true)}});
  }

  async function renderTransfers(){const data=await api("/api/me/organization-transfers");body.innerHTML=`<h3>העברות בעלות</h3><h4>הזמנות שקיבלת</h4><div class="pt-list">${(data.incoming||[]).map(x=>`<div class="pt-card"><strong>${esc(x.organization_name)}</strong><div class="pt-muted">מאת ${esc(x.from_name)} · ${esc(x.status)} · בתוקף עד ${esc(x.expires_at)}</div>${x.status==="pending"?`<div class="pt-row"><button class="pt-btn primary" data-transfer-accept="${esc(x.id)}">קבלת בעלות</button><button class="pt-btn danger" data-transfer-decline="${esc(x.id)}">דחייה</button></div>`:""}</div>`).join("")||'<p class="pt-muted">אין הזמנות ממתינות.</p>'}</div><h4>העברות ששלחת</h4><div class="pt-list">${(data.outgoing||[]).map(x=>`<div class="pt-card"><strong>${esc(x.organization_name)}</strong><div class="pt-muted">אל ${esc(x.to_name||x.to_email)} · ${esc(x.status)} · בתוקף עד ${esc(x.expires_at)}</div></div>`).join("")||'<p class="pt-muted">אין העברות שנשלחו.</p>'}</div><div class="pt-status"></div>`;const respond=async(id,accept)=>{try{await api("/api/organization-transfers/"+encodeURIComponent(id)+"/respond",{method:"POST",body:{accept}});setStatus(accept?"הבעלות הועברה לחשבון שלך.":"ההזמנה נדחתה.");await renderTransfers()}catch(e){setStatus(e.message,true)}};body.querySelectorAll("[data-transfer-accept]").forEach(b=>b.onclick=()=>respond(b.dataset.transferAccept,true));body.querySelectorAll("[data-transfer-decline]").forEach(b=>b.onclick=()=>respond(b.dataset.transferDecline,false))}

  async function renderPrivacy(){
    body.innerHTML=`<div class="pt-grid">
      <section class="pt-card"><h3>הנתונים שלי</h3><p>אפשר לייצא עותק של נתוני החשבון או לשלוח בקשה לעיון ולתיקון מידע.</p><div class="pt-row"><button class="pt-btn" id="pt-export-data" type="button">ייצוא הנתונים שלי</button><button class="pt-btn" id="pt-data-access" type="button">בקשת עיון</button><button class="pt-btn" id="pt-data-correct" type="button">בקשת תיקון</button></div>
      <form class="pt-form" id="pt-data-request-form" hidden><h4 id="pt-data-request-title"></h4><label for="pt-data-request-details">פרטי הבקשה</label><textarea id="pt-data-request-details" name="details" rows="4" maxlength="2000" minlength="5" required></textarea><div class="pt-row"><button class="pt-btn primary" type="submit">שליחת הבקשה</button><button class="pt-btn" type="button" id="pt-data-request-cancel">ביטול</button></div></form></section>
      <section class="pt-card"><h3>מחיקת חשבון</h3><p>בקשת מחיקה מתחילה תקופת המתנה של שבעה ימים. אם יש השאלות פעילות, הטיפול ימתין לסגירתן.</p><button class="pt-btn danger" id="pt-request-deletion" type="button">בקשת מחיקת חשבון</button>
      <form class="pt-form" id="pt-deletion-form" hidden><p>לאחר שליחת הבקשה אפשר לבטל אותה במשך שבעה ימים בלשונית הפרופיל.</p><label><input type="checkbox" required> הבנתי ואני מבקש/ת להתחיל בתהליך מחיקת החשבון</label><div class="pt-row"><button class="pt-btn danger" type="submit">אישור בקשת המחיקה</button><button class="pt-btn" type="button" id="pt-deletion-cancel">ביטול</button></div></form></section></div><div class="pt-status" role="status" aria-live="polite"></div>`;
    $("#pt-export-data",body).onclick=async()=>{try{const response=await fetch("/api/me/export",{credentials:"same-origin"});if(!response.ok)throw new Error("הייצוא נכשל");const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="gmach-my-data.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus("קובץ הנתונים נוצר.")}catch(e){setStatus(e.message,true)}};
    const form=$("#pt-data-request-form",body);
    for(const [id,type,title] of [["pt-data-access","access","מה תרצו לקבל בבקשת העיון?"],["pt-data-correct","correction","איזה מידע תרצו לתקן?"]]){
      $("#"+id,body).onclick=()=>{form.reset();form.dataset.requestType=type;$("#pt-data-request-title",body).textContent=title;form.hidden=false;$("#pt-data-request-details",body).focus()};
    }
    $("#pt-data-request-cancel",body).onclick=()=>{form.reset();form.hidden=true};
    form.onsubmit=async event=>{event.preventDefault();const button=form.querySelector('[type="submit"]');button.disabled=true;try{await api("/api/me/data-request",{method:"POST",body:{type:form.dataset.requestType,details:form.elements.namedItem("details").value.trim()}});form.reset();form.hidden=true;setStatus("הבקשה נשלחה ותופיע במערכת התמיכה.")}catch(e){setStatus(e.message,true)}finally{button.disabled=false}};
    const deletion=$("#pt-deletion-form",body);
    $("#pt-request-deletion",body).onclick=()=>{deletion.hidden=false};
    $("#pt-deletion-cancel",body).onclick=()=>{deletion.reset();deletion.hidden=true};
    deletion.onsubmit=async event=>{event.preventDefault();const button=deletion.querySelector('[type="submit"]');button.disabled=true;try{await api("/api/me/account/request-deletion",{method:"POST",body:{}});deletion.reset();deletion.hidden=true;setStatus("בקשת המחיקה נקלטה. אפשר לבטל אותה דרך לשונית הפרופיל.")}catch(e){setStatus(e.message,true)}finally{button.disabled=false}};
  }

  async function renderAddresses(){
    const data=await api("/api/me/addresses");
    body.innerHTML=`<div class="pt-grid"><section class="pt-card"><h3>כתובות שמורות</h3><div class="pt-list" id="pt-address-list"></div></section><section class="pt-card"><h3>הוספת כתובת</h3><form class="pt-form" id="pt-address-form"><input name="label" placeholder="למשל: בית" required><input name="city" placeholder="עיר/יישוב" required><input name="address" placeholder="כתובת מלאה" required><label><input type="checkbox" name="isDefault"> כתובת ברירת מחדל</label><button class="pt-btn primary">הוספה</button></form></section></div><div class="pt-status"></div>`;
    const list=$("#pt-address-list",body);
    if(!data.addresses.length) list.innerHTML='<p class="pt-muted">עדיין אין כתובות שמורות.</p>';
    for(const x of data.addresses){
      const d=document.createElement("div");d.className="pt-card";
      d.innerHTML=`<strong>${esc(x.label)}</strong> · ${esc(x.city)} ${x.isDefault?"· ברירת מחדל":""}<div class="pt-row"><button class="pt-btn" type="button" data-edit>עריכה</button>${x.isDefault?"":'<button class="pt-btn" type="button" data-default>הגדרה כברירת מחדל</button>'}<button class="pt-btn danger" type="button" data-del>מחיקה</button></div><form class="pt-form" data-edit-form hidden><label>שם הכתובת<input name="label" value="${esc(x.label)}" maxlength="50" required></label><label>עיר או יישוב<input name="city" value="${esc(x.city)}" maxlength="80" required></label><label>כתובת חדשה, רק אם רוצים להחליף<input name="address" autocomplete="street-address" minlength="5" maxlength="180" placeholder="הכתובת השמורה אינה מוצגת מטעמי פרטיות"></label><div class="pt-row"><button class="pt-btn primary" type="submit">שמירת שינויים</button><button class="pt-btn" type="button" data-cancel>ביטול</button></div></form>`;
      const path="/api/me/addresses/"+encodeURIComponent(x.id),edit=d.querySelector("[data-edit-form]");
      d.querySelector("[data-edit]").onclick=()=>{edit.hidden=false;edit.elements.namedItem("label").focus()};
      d.querySelector("[data-cancel]").onclick=()=>{edit.reset();edit.hidden=true};
      edit.onsubmit=async event=>{event.preventDefault();const button=edit.querySelector('[type="submit"]');button.disabled=true;try{const payload={label:edit.elements.namedItem("label").value,city:edit.elements.namedItem("city").value};const address=edit.elements.namedItem("address").value.trim();if(address)payload.address=address;await api(path,{method:"PATCH",body:payload});await renderAddresses();setStatus("הכתובת עודכנה.")}catch(error){setStatus(error.message,true);button.disabled=false}};
      d.querySelector("[data-default]")?.addEventListener("click",async event=>{event.currentTarget.disabled=true;try{await api(path,{method:"PATCH",body:{isDefault:true}});await renderAddresses();setStatus("כתובת ברירת המחדל עודכנה.")}catch(error){setStatus(error.message,true);event.currentTarget.disabled=false}});
      d.querySelector("[data-del]").onclick=async event=>{event.currentTarget.disabled=true;try{await api(path,{method:"DELETE"});await renderAddresses();setStatus("הכתובת נמחקה.")}catch(error){setStatus(error.message,true);event.currentTarget.disabled=false}};
      list.appendChild(d);
    }
    $("#pt-address-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/me/addresses",{method:"POST",body:{label:f.label.value,city:f.city.value,address:f.address.value,isDefault:f.isDefault.checked}});await renderAddresses();}catch(err){setStatus(err.message,true)}};
  }

  async function renderDevices(){
    const data=await api("/api/me/sessions");
    body.innerHTML=`<div class="pt-list" id="pt-devices"></div><div class="pt-status"></div>`;const list=$("#pt-devices",body);
    for(const s of data.sessions){const d=document.createElement("div");d.className="pt-card";d.innerHTML=`<strong>${esc(s.deviceLabel||"מכשיר")}</strong> ${s.current?"· המכשיר הנוכחי":""}<div class="pt-muted">פעילות אחרונה: ${esc(s.lastSeenAt?new Intl.DateTimeFormat(document.documentElement.lang==="en"?"en-GB":"he-IL",{dateStyle:"medium",timeStyle:"short"}).format(new Date(s.lastSeenAt)):"לא ידוע")}</div>${!s.current?'<button class="pt-btn danger" data-revoke>ניתוק המכשיר</button>':""}`;d.querySelector("[data-revoke]")?.addEventListener("click",async()=>{await api("/api/me/sessions/"+encodeURIComponent(s.id),{method:"DELETE"});renderDevices()});list.appendChild(d);}
  }

  async function renderNotifications(){
    const data=await api("/api/me/notification-preferences"), types=["loan_status","messages","waitlist","community","security","support"];
    const current=new Map((data.preferences||[]).map(x=>[x.notification_type,x]));
    body.innerHTML=`<form id="pt-notifications" class="pt-form"><div class="pt-list" id="pt-notification-list"></div><div class="pt-row"><label>שעות שקטות <input name="quietStart" type="time"></label><label>עד <input name="quietEnd" type="time"></label></div><button class="pt-btn primary">שמירת העדפות</button></form><div class="pt-status"></div>`;
    const list=$("#pt-notification-list",body);const names={loan_status:"השאלות",messages:"הודעות",waitlist:"רשימת המתנה",community:"קהילה",security:"אבטחה",support:"תמיכה"};
    types.forEach(t=>{const p=current.get(t)||{};const d=document.createElement("div");d.className="pt-card";d.dataset.type=t;d.innerHTML=`<strong>${names[t]}</strong><div class="pt-row"><label><input type="checkbox" data-k="inApp" ${p.in_app!==0?"checked":""}> באתר</label><label><input type="checkbox" data-k="email" ${p.email?"checked":""}> אימייל</label><label><input type="checkbox" data-k="push" ${p.push?"checked":""}> Push</label><select data-k="digest"><option value="immediate">מיידי</option><option value="daily">סיכום יומי</option></select></div>`;d.querySelector('[data-k="digest"]').value=p.digest||"immediate";list.appendChild(d)});
    const f=$("#pt-notifications",body);const first=(data.preferences||[])[0]||{};f.elements.namedItem("quietStart").value=first.quiet_start||"";f.elements.namedItem("quietEnd").value=first.quiet_end||"";
    f.onsubmit=async e=>{e.preventDefault();const preferences=[...list.children].map(d=>({type:d.dataset.type,inApp:d.querySelector('[data-k="inApp"]').checked,email:d.querySelector('[data-k="email"]').checked,push:d.querySelector('[data-k="push"]').checked,digest:d.querySelector('[data-k="digest"]').value,quietStart:f.elements.namedItem("quietStart").value||null,quietEnd:f.elements.namedItem("quietEnd").value||null}));try{await api("/api/me/notification-preferences",{method:"PUT",body:{preferences}});setStatus("העדפות ההתראות נשמרו.");}catch(err){setStatus(err.message,true)}};
  }

  async function renderCalendar(){const data=await api("/api/me/calendar-preferences").catch(()=>({preferences:{preferred_app:"ics",reminder_minutes:1440}})),feed=await api("/api/me/calendar-feed").catch(()=>({url:""})),p=data.preferences||{};body.innerHTML=`<form id="pt-calendar" class="pt-form"><h3>יומן ותזכורות</h3><label>אפליקציית יומן מועדפת<select name="preferredApp"><option value="ics">קובץ יומן (ICS)</option><option value="google">Google Calendar</option><option value="apple">Apple Calendar</option><option value="outlook">Outlook</option></select></label><label>תזכורת לפני האירוע<select name="reminderMinutes"><option value="60">שעה</option><option value="360">6 שעות</option><option value="720">12 שעות</option><option value="1440">24 שעות</option><option value="2880">48 שעות</option><option value="10080">שבוע</option></select></label><p class="pt-muted">לכל השאלה נוצר אירוע איסוף ואירוע החזרה. אפשר להוריד אותם מכרטיס ההשאלה.</p>${feed.url?'<p class="pt-muted">לעדכון אוטומטי של שינויים ביומן, הוסיפו את קישור המנוי הפרטי הבא כ־Internet Calendar. אין לשתף את הקישור.</p><p><a class="pt-btn" href="'+esc(feed.url)+'" target="_blank" rel="noopener">קישור יומן מתעדכן (ICS)</a></p>':'<p class="pt-muted">קישור המנוי ליומן אינו זמין כרגע; שאר הגדרות היומן עדיין פעילות.</p>'}<button class="pt-btn primary">שמירת העדפות יומן</button></form><div class="pt-status"></div>`;const form=$("#pt-calendar",body);form.preferredApp.value=p.preferred_app||"ics";form.reminderMinutes.value=String(p.reminder_minutes||1440);form.onsubmit=async e=>{e.preventDefault();try{await api("/api/me/calendar-preferences",{method:"PUT",body:{preferredApp:form.preferredApp.value,reminderMinutes:Number(form.reminderMinutes.value)}});setStatus("העדפות היומן נשמרו.")}catch(err){setStatus(err.message,true)}}}
  async function renderFavorites(){
    const data=await api("/api/me/favorites-overview"),names={item:"מוצר",organization:"גמ״ח",category:"קטגוריה",help_request:"בקשת קהילה",search:"חיפוש שמור"};
    body.innerHTML='<h3>המועדפים שלי</h3><p class="pt-muted">מוצרים, גמ״חים, קטגוריות, בקשות קהילה וחיפושים שמורים במקום אחד.</p><div class="pt-list" id="pt-favorites-list"></div><div class="pt-status" role="status"></div>';
    const list=$("#pt-favorites-list",body);
    if(!data.saved?.length){list.innerHTML='<p class="pt-muted">עדיין אין תוכן שמור.</p>';return}
    const openSaved=entry=>{
      if(entry.type==="item"){dialog.close();window.dispatchEvent(new CustomEvent("gmach:open-item",{detail:{id:String(entry.id)}}));return}
      if(entry.type==="organization"){dialog.close();history.pushState({route:"gmach",id:String(entry.id)},"","/gmach/"+encodeURIComponent(entry.id));window.dispatchEvent(new CustomEvent("gmach:open-organization",{detail:{id:String(entry.id)}}));return}
      if(entry.type==="category"){
        const category=document.getElementById("category-filter"),form=document.getElementById("search-form");
        if(category){category.value=entry.label||"";category.dispatchEvent(new Event("change",{bubbles:true}));}
        dialog.close();if(form)form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));history.pushState({route:"catalog"},"","/catalog");window.dispatchEvent(new CustomEvent("gmach:route",{detail:{path:"/catalog"}}));return;
      }
      if(entry.type==="help_request"){dialog.close();location.assign(location.origin+"/community?help="+encodeURIComponent(entry.id));return}
      if(entry.type==="search"){render("searches");}
    };
    for(const entry of data.saved){
      const row=document.createElement("div");row.className="pt-card pt-row pt-favorite-row";
      const main=document.createElement("button");main.type="button";main.className="pt-favorite-main";
      const localizedLabel=document.documentElement.lang==="en"&&entry.type==="category"?entry.labelEn||entry.label:entry.label;
      main.innerHTML=`<span><strong>${esc(localizedLabel)}</strong><small class="pt-muted">${esc(names[entry.type]||entry.type)}${entry.detail&&typeof entry.detail==="string"&&!entry.detail.startsWith("{")?" · "+esc(entry.detail):""}</small></span><b>פתיחה ←</b>`;
      main.onclick=()=>openSaved(entry);
      const remove=document.createElement("button");remove.type="button";remove.className="pt-btn danger";remove.textContent="הסרה מהמועדפים";remove.setAttribute("aria-label",`הסרה מהמועדפים: ${entry.label}`);
      remove.onclick=async()=>{remove.disabled=true;try{await api("/api/me/favorites-overview/"+encodeURIComponent(entry.type)+"/"+encodeURIComponent(entry.id),{method:"DELETE"});row.remove();if(!list.children.length)list.innerHTML='<p class="pt-muted">עדיין אין תוכן שמור.</p>';setStatus("הפריט הוסר מהמועדפים.")}catch(error){setStatus(error.message,true);remove.disabled=false}};
      row.append(main,remove);list.append(row);
    }
  }


  async function renderSearches(){
    const data=await api("/api/me/saved-searches");body.innerHTML=`<div class="pt-grid"><section class="pt-card"><h3>חיפושים שמורים</h3><div class="pt-list" id="pt-search-list"></div></section><section class="pt-card"><h3>שמירת חיפוש</h3><form class="pt-form" id="pt-search-form"><input name="name" placeholder="שם לחיפוש" required><input name="q" placeholder="מילות חיפוש"><input name="city" placeholder="עיר"><input name="category" placeholder="קטגוריה"><label>מצב הפריט<select name="condition"><option value="">כל המצבים</option><option>חדש</option><option>כמו חדש</option><option>מצב טוב</option><option>מצב סביר</option><option>בלאי נראה לעין</option></select></label><label><input type="checkbox" name="availableOnly"> רק פריטים זמינים</label><label><input type="checkbox" name="notify" checked> להודיע על תוצאות חדשות</label><button class="pt-btn primary">שמירה</button></form></section></div><div class="pt-status"></div>`;const list=$("#pt-search-list",body);
    if(!data.searches.length)list.innerHTML='<p class="pt-muted">אין חיפושים שמורים.</p>';
    const form=$("#pt-search-form",body),status=$(".pt-status",body);let editingId=null;
    for(const s of data.searches){const d=document.createElement("div");d.className="pt-card";const summary=[["חיפוש",s.filters?.q||s.filters?.query],["עיר",s.filters?.city],["קטגוריה",s.filters?.category],["מצב",s.filters?.condition]].filter(([,value])=>value).map(([label,value])=>`${label}: ${value}`).join(" · ")+(s.filters?.availableOnly?" · רק זמינים":"")||"כל הפריטים";d.innerHTML=`<strong>${esc(s.name)}</strong><div class="pt-muted">${esc(summary)}</div><button class="pt-btn primary" type="button" data-open>הצגת תוצאות</button> <button class="pt-btn" type="button" data-edit>עריכה</button> <button class="pt-btn danger" type="button" data-del>מחיקה</button>`;
      d.querySelector("[data-open]").onclick=()=>{const form=document.getElementById("search-form"),search=document.getElementById("search-input"),city=document.getElementById("city-filter"),category=document.getElementById("category-filter");if(!form||!search||!city||!category){setStatus("החיפוש אינו זמין כרגע.",true);return}search.value=s.filters?.q||s.filters?.query||"";city.value=s.filters?.city||"";category.value=s.filters?.category||"";const condition=document.getElementById("condition-filter"),available=document.getElementById("available-only");if(condition)condition.value=s.filters?.condition||"";if(available&&typeof s.filters?.availableOnly==="boolean")available.checked=s.filters.availableOnly;category.dispatchEvent(new Event("change",{bubbles:true}));form.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));dialog.close();};
      d.querySelector("[data-edit]").onclick=()=>{editingId=s.id;for(const key of ["name","q","city","category","condition"])form.elements.namedItem(key).value=key==="name"?s.name:key==="q"?s.filters?.q||s.filters?.query||"":s.filters?.[key]||"";form.elements.namedItem("availableOnly").checked=Boolean(s.filters?.availableOnly);form.elements.namedItem("notify").checked=Boolean(s.notify);form.querySelector('[type="submit"]').textContent="שמירת שינויים";form.scrollIntoView({block:"nearest"});form.elements.namedItem("name").focus()};
      d.querySelector("[data-del]").onclick=async()=>{try{await api("/api/me/saved-searches/"+encodeURIComponent(s.id),{method:"DELETE"});await renderSearches()}catch(e){status.textContent=e.message}};list.appendChild(d)}
    form.onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,field=key=>f.elements.namedItem(key);const payload={name:field("name").value,filters:{q:field("q").value,city:field("city").value,category:field("category").value,condition:field("condition").value,availableOnly:field("availableOnly").checked},notify:field("notify").checked};const button=f.querySelector('[type="submit"]');button.disabled=true;status.textContent="";
      try{await api(editingId?"/api/me/saved-searches/"+encodeURIComponent(editingId):"/api/me/saved-searches",{method:editingId?"PATCH":"POST",body:payload});await renderSearches()}catch(error){status.textContent=error.message;button.disabled=false}};
  }

  async function renderSavedCategories(){
    const [all,saved]=await Promise.all([api("/api/categories?locale="+(document.documentElement.lang==="en"?"en":"he")),api("/api/me/saved-categories")]);
    const savedIds=new Set((saved.categories||[]).map(category=>category.id));
    body.innerHTML='<h3>קטגוריות שמורות</h3><p class="pt-muted">בחרו קטגוריות שתרצו למצוא בקלות.</p><label class="pt-form">חיפוש קטגוריה<input id="pt-category-filter" type="search" autocomplete="off" placeholder="שם קטגוריה"></label><div class="pt-list" id="pt-category-list"></div><div class="pt-status" role="status"></div>';
    const list=$("#pt-category-list",body);
    for(const category of all.categories||[]){
      const row=document.createElement("div");row.className="pt-card pt-row";
      const title=document.createElement("strong");title.textContent=document.documentElement.lang==="en"?category.name_en||category.name_he:category.name_he||category.name;
      const button=document.createElement("button");button.type="button";button.className="pt-btn";
      const refresh=()=>{button.textContent=savedIds.has(category.id)?"הסרה מהשמורים":"שמירת קטגוריה";button.setAttribute("aria-pressed",String(savedIds.has(category.id)))};refresh();
      button.onclick=async()=>{button.disabled=true;try{const remove=savedIds.has(category.id);await api("/api/me/saved-categories/"+encodeURIComponent(category.id),{method:remove?"DELETE":"PUT"});if(remove)savedIds.delete(category.id);else savedIds.add(category.id);refresh();setStatus(remove?"הקטגוריה הוסרה.":"הקטגוריה נשמרה.")}catch(error){setStatus(error.message,true)}finally{button.disabled=false}};
      row.append(title,button);list.append(row);
    }
    if(!list.children.length)list.innerHTML='<p class="pt-muted">אין קטגוריות זמינות כרגע.</p>';
    $("#pt-category-filter",body).oninput=event=>{const term=event.currentTarget.value.trim().toLocaleLowerCase();for(const row of list.children)row.hidden=!row.querySelector("strong")?.textContent.toLocaleLowerCase().includes(term)};
  }

  async function renderSupport(){
    const data=await api("/api/me/support-tickets");body.innerHTML=`<h3>הפניות שלי</h3><div class="pt-list" id="pt-ticket-list"></div><div class="pt-status"></div>`;const list=$("#pt-ticket-list",body);
    if(!data.tickets.length)list.innerHTML='<p class="pt-muted">אין פניות קודמות. ניתן לפתוח פנייה דרך "צור קשר".</p>';
    for(const t of data.tickets){
      const d=document.createElement("div");d.className="pt-card";
      const closed=t.status==="closed",path="/api/me/support-tickets/"+encodeURIComponent(t.id);
      const label={open:"פתוחה",waiting:"ממתינה למענה",closed:"סגורה",reopened:"נפתחה מחדש"}[t.status]||t.status;
      d.innerHTML=`<strong>#${esc(t.ticket_number)} · ${esc(t.subject)}</strong><div class="pt-muted">סטטוס: ${esc(label)} · ${esc(t.updated_at)}</div><div class="pt-row"><button class="pt-btn" type="button" data-messages>הצגת שיחה</button><button class="pt-btn ${closed?"":"danger"}" type="button" data-status>${closed?"פתיחה מחדש":"סגירת פנייה"}</button></div><div class="pt-list" data-thread hidden></div><form class="pt-form"><textarea name="message" maxlength="1500" placeholder="הודעה נוספת" required></textarea><button class="pt-btn">שליחה</button></form>`;
      const thread=d.querySelector("[data-thread]");
      async function loadThread(){const result=await api(path+"/messages");thread.innerHTML=result.messages.length?result.messages.map(message=>`<div class="pt-card"><strong>${message.fromSupport?"צוות התמיכה":"אני"}</strong><div>${esc(message.body)}</div><small class="pt-muted">${esc(message.createdAt)}</small></div>`).join(""):'<p class="pt-muted">אין הודעות נוספות בפנייה.</p>';thread.hidden=false}
      d.querySelector("[data-messages]").onclick=async()=>{if(!thread.hidden){thread.hidden=true;return}try{await loadThread()}catch(error){setStatus(error.message,true)}};
      d.querySelector("[data-status]").onclick=async event=>{const button=event.currentTarget;button.disabled=true;try{await api(path+"/status",{method:"PATCH",body:{status:closed?"open":"closed"}});await renderSupport();setStatus(closed?"הפנייה נפתחה מחדש.":"הפנייה נסגרה.")}catch(error){setStatus(error.message,true);button.disabled=false}};
      d.querySelector("form").onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,msg=form.elements.namedItem("message").value.trim();if(!msg)return;const button=form.querySelector("button");button.disabled=true;try{await api(path+"/messages",{method:"POST",body:{message:msg}});form.reset();setStatus("ההודעה נוספה לפנייה.");if(!thread.hidden)await loadThread()}catch(error){setStatus(error.message,true)}finally{button.disabled=false}};
      list.appendChild(d);
    }
  }

  async function renderAdmin(){
    const [cats,closures,security,suggestions]=await Promise.all([api("/api/admin/categories"),api("/api/admin/closures"),api("/api/admin/security-events"),api("/api/admin/category-suggestions")]);
    body.innerHTML=`<div class="pt-grid">
      <section class="pt-card"><h3>קטגוריות</h3><p>${cats.categories.length} קטגוריות במערכת</p><div class="pt-list" id="pt-admin-categories"></div><form class="pt-form" id="pt-cat-form"><input name="nameHe" placeholder="שם בעברית" required><input name="nameEn" placeholder="English"><input name="parentId" placeholder="מזהה קטגוריית אב"><input name="icon" placeholder="אייקון"><input name="imageUrl" placeholder="כתובת תמונה"><input name="synonyms" placeholder="מילים נרדפות, מופרדות בפסיק"><input name="sortOrder" type="number" min="0" max="9999" value="0"><button class="pt-btn primary">הוספת קטגוריה</button></form></section>
      <section class="pt-card"><h3>סגירות מערכת</h3><div class="pt-list" id="pt-admin-closures"></div><form class="pt-form" id="pt-close-form"><input name="title" placeholder="כותרת" required><input name="titleEn" placeholder="English title"><select name="closureType"><option value="maintenance">תחזוקה</option><option value="manual">ידני</option><option value="holiday">חג</option></select><input type="datetime-local" name="startsAt" required><input type="datetime-local" name="endsAt" required><button class="pt-btn primary">תזמון סגירה</button></form></section>
      <section class="pt-card"><h3>הצעות קטגוריה</h3><div class="pt-list" id="pt-category-suggestions"></div></section>
      <section class="pt-card"><h3>אירועי אבטחה</h3><div class="pt-list">${security.events.slice(0,50).map(x=>`<div><strong>${esc(x.event_type)}</strong> · ${esc(x.severity)}<div class="pt-muted">${esc(x.device_label||"")} · ${esc(x.created_at)}</div></div>`).join("")||'<span class="pt-muted">אין אירועים חריגים.</span>'}</div></section>
    </div><div class="pt-status"></div>`;
    const catList=$("#pt-admin-categories",body);
    cats.categories.forEach(cat=>{const row=document.createElement("div");row.className="pt-card";row.innerHTML=`<form class="pt-form" data-cat="${esc(cat.id)}"><strong>${esc(cat.id)}</strong><input name="nameHe" value="${esc(cat.name_he||"")}" required><input name="nameEn" value="${esc(cat.name_en||"")}"><input name="parentId" value="${esc(cat.parent_id||"")}" placeholder="קטגוריית אב"><input name="icon" value="${esc(cat.icon||"")}" placeholder="אייקון"><input name="imageUrl" value="${esc(cat.image_url||"")}" placeholder="כתובת תמונה"><input name="synonyms" value="${esc((cat.synonyms||[]).join(", "))}" placeholder="מילים נרדפות"><input name="sortOrder" type="number" value="${Number(cat.sort_order)||0}"><select name="status"><option value="active">פעילה</option><option value="hidden">מוסתרת</option></select><button class="pt-btn primary">שמירת קטגוריה</button><select name="mergeInto"><option value="">מיזוג לתוך קטגוריה...</option>${cats.categories.filter(x=>x.id!==cat.id).map(x=>`<option value="${esc(x.id)}">${esc(x.name_he||x.id)}</option>`).join("")}</select><button class="pt-btn danger" type="button" data-merge>מיזוג קטגוריה</button></form>`;row.querySelector("[name=status]").value=cat.status||"active";row.querySelector("[data-merge]").onclick=async()=>{const target=row.querySelector("[name=mergeInto]").value;if(!target)return setStatus("בחרו קטגוריית יעד.",true);if(!translatedConfirm("למזג את הקטגוריה? כל השיוכים יעברו לקטגוריית היעד והקטגוריה הנוכחית תוסתר."))return;await api("/api/admin/categories/"+encodeURIComponent(cat.id),{method:"PATCH",body:{mergeInto:target}});setStatus("הקטגוריה מוזגה.");await renderAdmin()};row.querySelector("form").onsubmit=async e=>{e.preventDefault();const q=e.currentTarget;await api("/api/admin/categories/"+encodeURIComponent(cat.id),{method:"PATCH",body:{nameHe:q.nameHe.value,nameEn:q.nameEn.value,parentId:q.parentId.value||null,icon:q.icon.value||null,imageUrl:q.imageUrl.value||null,synonyms:q.synonyms.value.split(",").map(x=>x.trim()).filter(Boolean),sortOrder:Number(q.sortOrder.value)||0,status:q.status.value}});setStatus("הקטגוריה נשמרה.")};catList.appendChild(row)});
    const suggestionList=$("#pt-category-suggestions",body);(suggestions.suggestions||[]).forEach(x=>{const row=document.createElement("div");row.className="pt-card";row.innerHTML=`<strong>${esc(x.name)}</strong><div class="pt-muted">${esc(x.suggested_by_name||"")} · ${esc(x.organization_name||"")} · ${esc(x.status)}</div><p>${esc(x.description||"")}</p>${x.status==="pending"?'<div class="pt-row"><button class="pt-btn primary" data-approve>אישור</button><button class="pt-btn danger" data-reject>דחייה</button></div>':""}`;row.querySelector("[data-approve]")?.addEventListener("click",async()=>{await api("/api/admin/category-suggestions/"+encodeURIComponent(x.id),{method:"PATCH",body:{status:"approved"}});await renderAdmin()});row.querySelector("[data-reject]")?.addEventListener("click",async()=>{await api("/api/admin/category-suggestions/"+encodeURIComponent(x.id),{method:"PATCH",body:{status:"rejected"}});await renderAdmin()});suggestionList.appendChild(row)});if(!(suggestions.suggestions||[]).length)suggestionList.innerHTML='<span class="pt-muted">אין הצעות קטגוריה.</span>';
    const closureList=$("#pt-admin-closures",body);closures.closures.forEach(x=>{const row=document.createElement("div");row.className="pt-card pt-row";row.innerHTML=`<div><strong>${esc(x.title_he)}</strong><div class="pt-muted">${esc(x.starts_at)} עד ${esc(x.ends_at)} · ${x.active?"פעילה":"כבויה"}</div></div><button class="pt-btn" type="button">${x.active?"השבתה":"הפעלה"}</button>`;row.querySelector("button").onclick=async()=>{await api("/api/admin/closures/"+encodeURIComponent(x.id),{method:"PATCH",body:{active:!x.active}});await renderAdmin()};closureList.appendChild(row)});
    $("#pt-cat-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/categories",{method:"POST",body:{nameHe:f.nameHe.value,nameEn:f.nameEn.value,parentId:f.parentId.value||null,icon:f.icon.value||null,imageUrl:f.imageUrl.value||null,synonyms:f.synonyms.value.split(",").map(x=>x.trim()).filter(Boolean),sortOrder:Number(f.sortOrder.value)||0}});await renderAdmin()}catch(err){setStatus(err.message,true)}};
    $("#pt-close-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/closures",{method:"POST",body:{titleHe:f.title.value,titleEn:f.titleEn.value||null,startsAt:new Date(f.startsAt.value).toISOString(),endsAt:new Date(f.endsAt.value).toISOString(),closureType:f.closureType.value}});await renderAdmin()}catch(err){setStatus(err.message,true)}};
  }

  async function openTools(tab=active){
    try{profile=(await api("/api/me/profile")).profile;active=tab||"profile";if(!dialog.open)dialog.showModal();await render(active);}catch(e){translatedAlert(e.message)}
  }
  window.GmachAccountCenter={open:openTools};
  function installEntry(){
    const dash=$("#dashboard-view");if(!dash)return;
    const existing=$("#dashboard-account-button",dash);
    if(existing){if(existing.dataset.accountCenterBound!=="1"){existing.dataset.accountCenterBound="1";existing.addEventListener("click",()=>openTools("profile"))}return}
    if($("#platform-tools-entry"))return;
    const b=document.createElement("button");b.id="platform-tools-entry";b.type="button";b.className="button button-secondary";b.textContent="החשבון שלי";b.addEventListener("click",()=>openTools("profile"));
    const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;host.prepend(b);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{installEntry();setupTurnstile();},{once:true});else{installEntry();setupTurnstile();}
  new MutationObserver(installEntry).observe(document.body,{subtree:true,childList:true});
})();
