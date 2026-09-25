(()=>{
  const $=(s,r=document)=>r.querySelector(s);
  const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const turnstileState={enabled:false,siteKey:null,tokens:{register:null,support:null},widgets:{}};
  window.GmachTurnstile={token:scope=>turnstileState.tokens[scope]||null,reset:scope=>{const id=turnstileState.widgets[scope];if(window.turnstile&&id!==undefined)window.turnstile.reset(id);turnstileState.tokens[scope]=null;}};
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
    add("register",document.getElementById("auth-form"));add("support",document.getElementById("support-form"));
    const sync=()=>{const reg=document.querySelector('[data-turnstile-scope="register"]');if(reg)reg.hidden=document.querySelector('[data-auth-mode="register"]')?.getAttribute("aria-selected")!=="true";};
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
    .pt-tabs{display:flex;gap:8px;overflow:auto;padding:12px 18px;border-bottom:1px solid #eef2f5}
    .pt-tabs button{white-space:nowrap;border:1px solid #dfe6ec;background:#fff;border-radius:999px;padding:8px 13px;cursor:pointer}
    .pt-tabs button[aria-selected="true"]{font-weight:700;border-color:#7e8b95}
    .pt-body{padding:18px 22px;max-height:68vh;overflow:auto}.pt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}
    .pt-card{border:1px solid #e4e9ee;border-radius:14px;padding:14px;background:#fff}.pt-card h3{margin-top:0}
    .pt-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.pt-form{display:grid;gap:10px}.pt-form input,.pt-form select,.pt-form textarea{width:100%;padding:10px;border:1px solid #ccd5dc;border-radius:10px}
    .pt-btn{border:0;border-radius:10px;padding:9px 13px;cursor:pointer;background:#e9eef2}.pt-btn.primary{background:#173a4d;color:#fff}.pt-btn.danger{background:#fff0f0;color:#9f1d1d}
    .pt-muted{color:#667681;font-size:.92rem}.pt-status{min-height:1.4em;margin-top:8px}.pt-list{display:grid;gap:10px}
    @media(max-width:700px){.platform-tools{width:100vw;max-width:100vw;border-radius:18px 18px 0 0;margin:auto 0 0}.pt-body{max-height:72vh}}
  `;
  document.head.appendChild(style);

  const dialog=document.createElement("dialog");
  dialog.className="platform-tools";
  dialog.id="platform-tools-dialog";
  dialog.innerHTML=`<div class="pt-head"><div><h2>מרכז הגדרות וניהול</h2><div class="pt-muted">חשבון, פרטיות, מכשירים וכלי ניהול</div></div><button class="pt-close" aria-label="סגירה">×</button></div><div class="pt-tabs" role="tablist"></div><div class="pt-body"></div>`;
  document.body.appendChild(dialog);
  $(".pt-close",dialog).onclick=()=>dialog.close();

  const tabs=[
    ["profile","פרופיל"],["addresses","כתובות"],["devices","מכשירים"],["notifications","התראות"],["searches","חיפושים שמורים"],["support","תמיכה"],["admin","ניהול־על"]
  ];
  let profile=null, active="profile";
  const tabbar=$(".pt-tabs",dialog), body=$(".pt-body",dialog);
  tabs.forEach(([id,label])=>{const b=document.createElement("button");b.textContent=label;b.dataset.tab=id;b.onclick=()=>render(id);tabbar.appendChild(b);});

  function setStatus(msg,error=false){let el=$(".pt-status",body);if(!el){el=document.createElement("div");el.className="pt-status";body.appendChild(el)}el.textContent=msg||"";el.style.color=error?"#a11":"inherit";}
  async function render(id){
    active=id;
    [...tabbar.children].forEach(b=>b.setAttribute("aria-selected",String(b.dataset.tab===id)));
    body.innerHTML="<p>טוענים…</p>";
    try{
      if(!profile) profile=(await api("/api/me/profile")).profile;
      if(id==="admin" && profile.role!=="admin"){body.innerHTML="<p>המסך זמין למנהל האתר בלבד.</p>";return;}
      await ({profile:renderProfile,addresses:renderAddresses,devices:renderDevices,notifications:renderNotifications,searches:renderSearches,support:renderSupport,admin:renderAdmin}[id])();
    }catch(e){body.innerHTML=`<p role="alert">${esc(e.message)}</p>`;}
  }

  async function renderProfile(){
    profile=(await api("/api/me/profile")).profile;
    body.innerHTML=`<form class="pt-form" id="pt-profile"><div class="pt-grid">
      <label>שם מלא<input name="fullName" value="${esc(profile.full_name||profile.fullName||"")}" required></label>
      <label>טלפון<input name="phone" value="${esc(profile.phone||"")}" required></label>
      <label>עיר/יישוב<input name="city" value="${esc(profile.city||"")}" required></label>
      <label>שפה<select name="preferredLanguage"><option value="he">עברית</option><option value="en">English</option></select></label>
      </div><label><input type="checkbox" name="operationalEmails" ${profile.operationalEmails!==false?"checked":""}> הודעות תפעוליות</label>
      <label><input type="checkbox" name="communityEmails" ${profile.communityEmails?"checked":""}> עדכוני קהילה</label>
      <div class="pt-row"><button class="pt-btn primary">שמירה</button>${profile.deletionRequestedAt?'<button type="button" class="pt-btn danger" id="pt-cancel-deletion">ביטול בקשת מחיקה</button>':""}</div></form><div class="pt-status"></div>`;
    const f=$("#pt-profile",body); f.preferredLanguage.value=profile.preferredLanguage||"he";
    f.onsubmit=async e=>{e.preventDefault();try{profile=(await api("/api/me/profile",{method:"PATCH",body:{fullName:f.fullName.value,phone:f.phone.value,city:f.city.value,preferredLanguage:f.preferredLanguage.value,operationalEmails:f.operationalEmails.checked,communityEmails:f.communityEmails.checked}})).profile;setStatus("הפרטים נשמרו.");}catch(err){setStatus(err.message,true)}};
    $("#pt-cancel-deletion",body)?.addEventListener("click",async()=>{try{await api("/api/me/account/cancel-deletion",{method:"POST",body:{}});profile.deletionRequestedAt=null;await renderProfile();setStatus("בקשת המחיקה בוטלה.");}catch(err){setStatus(err.message,true)}});
  }

  async function renderAddresses(){
    const data=await api("/api/me/addresses");
    body.innerHTML=`<div class="pt-grid"><section class="pt-card"><h3>כתובות שמורות</h3><div class="pt-list" id="pt-address-list"></div></section><section class="pt-card"><h3>הוספת כתובת</h3><form class="pt-form" id="pt-address-form"><input name="label" placeholder="למשל: בית" required><input name="city" placeholder="עיר/יישוב" required><input name="address" placeholder="כתובת מלאה" required><label><input type="checkbox" name="isDefault"> כתובת ברירת מחדל</label><button class="pt-btn primary">הוספה</button></form></section></div><div class="pt-status"></div>`;
    const list=$("#pt-address-list",body);
    if(!data.addresses.length) list.innerHTML='<p class="pt-muted">עדיין אין כתובות שמורות.</p>';
    for(const x of data.addresses){const d=document.createElement("div");d.className="pt-card";d.innerHTML=`<strong>${esc(x.label)}</strong> · ${esc(x.city)} ${x.isDefault?"· ברירת מחדל":""}<div><button class="pt-btn danger" data-del>מחיקה</button></div>`;d.querySelector("[data-del]").onclick=async()=>{await api("/api/me/addresses/"+encodeURIComponent(x.id),{method:"DELETE"});renderAddresses()};list.appendChild(d);}
    $("#pt-address-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/me/addresses",{method:"POST",body:{label:f.label.value,city:f.city.value,address:f.address.value,isDefault:f.isDefault.checked}});await renderAddresses();}catch(err){setStatus(err.message,true)}};
  }

  async function renderDevices(){
    const data=await api("/api/me/sessions");
    body.innerHTML=`<div class="pt-list" id="pt-devices"></div><div class="pt-status"></div>`;const list=$("#pt-devices",body);
    for(const s of data.sessions){const d=document.createElement("div");d.className="pt-card";d.innerHTML=`<strong>${esc(s.deviceLabel||"מכשיר")}</strong> ${s.current?"· המכשיר הנוכחי":""}<div class="pt-muted">פעילות אחרונה: ${esc(s.lastSeenAt||"")}</div>${!s.current?'<button class="pt-btn danger" data-revoke>ניתוק המכשיר</button>':""}`;d.querySelector("[data-revoke]")?.addEventListener("click",async()=>{await api("/api/me/sessions/"+encodeURIComponent(s.id),{method:"DELETE"});renderDevices()});list.appendChild(d);}
  }

  async function renderNotifications(){
    const data=await api("/api/me/notification-preferences"), types=["loan_status","messages","waitlist","community","security","support"];
    const current=new Map((data.preferences||[]).map(x=>[x.notification_type,x]));
    body.innerHTML=`<form id="pt-notifications" class="pt-form"><div class="pt-list" id="pt-notification-list"></div><div class="pt-row"><label>שעות שקטות <input name="quietStart" type="time"></label><label>עד <input name="quietEnd" type="time"></label></div><button class="pt-btn primary">שמירת העדפות</button></form><div class="pt-status"></div>`;
    const list=$("#pt-notification-list",body);const names={loan_status:"השאלות",messages:"הודעות",waitlist:"רשימת המתנה",community:"קהילה",security:"אבטחה",support:"תמיכה"};
    types.forEach(t=>{const p=current.get(t)||{};const d=document.createElement("div");d.className="pt-card";d.dataset.type=t;d.innerHTML=`<strong>${names[t]}</strong><div class="pt-row"><label><input type="checkbox" data-k="inApp" ${p.in_app!==0?"checked":""}> באתר</label><label><input type="checkbox" data-k="email" ${p.email?"checked":""}> אימייל</label><label><input type="checkbox" data-k="push" ${p.push?"checked":""}> Push</label><select data-k="digest"><option value="immediate">מיידי</option><option value="daily">סיכום יומי</option></select></div>`;d.querySelector('[data-k="digest"]').value=p.digest||"immediate";list.appendChild(d)});
    const f=$("#pt-notifications",body);const first=(data.preferences||[])[0]||{};f.quietStart.value=first.quiet_start||"";f.quietEnd.value=first.quiet_end||"";
    f.onsubmit=async e=>{e.preventDefault();const preferences=[...list.children].map(d=>({type:d.dataset.type,inApp:d.querySelector('[data-k="inApp"]').checked,email:d.querySelector('[data-k="email"]').checked,push:d.querySelector('[data-k="push"]').checked,digest:d.querySelector('[data-k="digest"]').value,quietStart:f.quietStart.value||null,quietEnd:f.quietEnd.value||null}));try{await api("/api/me/notification-preferences",{method:"PUT",body:{preferences}});setStatus("העדפות ההתראות נשמרו.");}catch(err){setStatus(err.message,true)}};
  }

  async function renderSearches(){
    const data=await api("/api/me/saved-searches");body.innerHTML=`<div class="pt-grid"><section class="pt-card"><h3>חיפושים שמורים</h3><div class="pt-list" id="pt-search-list"></div></section><section class="pt-card"><h3>שמירת חיפוש</h3><form class="pt-form" id="pt-search-form"><input name="name" placeholder="שם לחיפוש" required><input name="q" placeholder="מילות חיפוש"><input name="city" placeholder="עיר"><input name="category" placeholder="קטגוריה"><label><input type="checkbox" name="notify" checked> להודיע על תוצאות חדשות</label><button class="pt-btn primary">שמירה</button></form></section></div><div class="pt-status"></div>`;const list=$("#pt-search-list",body);
    if(!data.searches.length)list.innerHTML='<p class="pt-muted">אין חיפושים שמורים.</p>';
    for(const s of data.searches){const d=document.createElement("div");d.className="pt-card";d.innerHTML=`<strong>${esc(s.name)}</strong><div class="pt-muted">${esc(JSON.stringify(s.filters||{}))}</div><button class="pt-btn danger" data-del>מחיקה</button>`;d.querySelector("[data-del]").onclick=async()=>{await api("/api/me/saved-searches/"+encodeURIComponent(s.id),{method:"DELETE"});renderSearches()};list.appendChild(d)}
    $("#pt-search-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;await api("/api/me/saved-searches",{method:"POST",body:{name:f.name.value,filters:{q:f.q.value,city:f.city.value,category:f.category.value},notify:f.notify.checked}});renderSearches()};
  }

  async function renderSupport(){
    const data=await api("/api/me/support-tickets");body.innerHTML=`<h3>הפניות שלי</h3><div class="pt-list" id="pt-ticket-list"></div><div class="pt-status"></div>`;const list=$("#pt-ticket-list",body);
    if(!data.tickets.length)list.innerHTML='<p class="pt-muted">אין פניות קודמות. ניתן לפתוח פנייה דרך "צור קשר".</p>';
    for(const t of data.tickets){const d=document.createElement("div");d.className="pt-card";d.innerHTML=`<strong>#${esc(t.ticket_number)} · ${esc(t.subject)}</strong><div class="pt-muted">סטטוס: ${esc(t.status)} · ${esc(t.updated_at)}</div><form class="pt-form"><textarea name="message" maxlength="1500" placeholder="הודעה נוספת"></textarea><button class="pt-btn">שליחה</button></form>`;d.querySelector("form").onsubmit=async e=>{e.preventDefault();const msg=e.currentTarget.message.value.trim();if(!msg)return;await api("/api/me/support-tickets/"+encodeURIComponent(t.id)+"/messages",{method:"POST",body:{message:msg}});setStatus("ההודעה נוספה לפנייה.");e.currentTarget.reset()};list.appendChild(d)}
  }

  async function renderAdmin(){
    const [cats,closures,security]=await Promise.all([api("/api/admin/categories"),api("/api/admin/closures"),api("/api/admin/security-events")]);
    body.innerHTML=`<div class="pt-grid">
      <section class="pt-card"><h3>קטגוריות</h3><p>${cats.categories.length} קטגוריות במערכת</p><form class="pt-form" id="pt-cat-form"><input name="nameHe" placeholder="שם בעברית" required><input name="nameEn" placeholder="English"><input name="parentId" placeholder="מזהה קטגוריית אב"><button class="pt-btn primary">הוספה</button></form></section>
      <section class="pt-card"><h3>סגירות מערכת</h3><div class="pt-list">${closures.closures.map(c=>`<div><strong>${esc(c.title_he)}</strong><div class="pt-muted">${esc(c.starts_at)} — ${esc(c.ends_at)}</div></div>`).join("")||'<span class="pt-muted">אין סגירות מתוזמנות.</span>'}</div><form class="pt-form" id="pt-close-form"><input name="title" placeholder="כותרת" required><input type="datetime-local" name="startsAt" required><input type="datetime-local" name="endsAt" required><button class="pt-btn primary">תזמון סגירה</button></form></section>
      <section class="pt-card"><h3>אירועי אבטחה</h3><div class="pt-list">${security.events.slice(0,20).map(x=>`<div><strong>${esc(x.event_type)}</strong> · ${esc(x.severity)}<div class="pt-muted">${esc(x.created_at)}</div></div>`).join("")||'<span class="pt-muted">אין אירועים חריגים.</span>'}</div></section>
    </div><div class="pt-status"></div>`;
    $("#pt-cat-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/categories",{method:"POST",body:{nameHe:f.nameHe.value,nameEn:f.nameEn.value,parentId:f.parentId.value||null}});renderAdmin()}catch(err){setStatus(err.message,true)}};
    $("#pt-close-form",body).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/closures",{method:"POST",body:{titleHe:f.title.value,startsAt:new Date(f.startsAt.value).toISOString(),endsAt:new Date(f.endsAt.value).toISOString(),closureType:"maintenance"}});renderAdmin()}catch(err){setStatus(err.message,true)}};
  }

  async function openTools(){
    try{profile=(await api("/api/me/profile")).profile;if(!dialog.open)dialog.showModal();await render(active);}catch(e){alert(e.message)}
  }
  function installEntry(){
    const dash=$("#dashboard-view");if(!dash||$("#platform-tools-entry"))return;
    const b=document.createElement("button");b.id="platform-tools-entry";b.type="button";b.className="button button-secondary";b.textContent="הגדרות וניהול";b.addEventListener("click",openTools);
    const host=dash.querySelector(".dashboard-actions,.dashboard-header,.section-heading")||dash;host.prepend(b);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>{installEntry();setupTurnstile();},{once:true});else{installEntry();setupTurnstile();}
  new MutationObserver(installEntry).observe(document.body,{subtree:true,childList:true});
})();