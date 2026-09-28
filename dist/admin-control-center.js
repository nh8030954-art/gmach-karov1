(()=>{
"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const en=()=>document.documentElement.lang==="en"||document.documentElement.dir==="ltr";
const t=(he,english)=>en()?english:he;
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const fmt=v=>{if(!v)return"";try{return new Intl.DateTimeFormat(en()?"en-GB":"he-IL",{dateStyle:"short",timeStyle:"short"}).format(new Date(v))}catch{return String(v)}};
async function api(path,opt={}){
 const init={credentials:"same-origin",headers:{"Accept":"application/json",...(opt.headers||{})},...opt};
 if(opt.body!==undefined&&typeof opt.body!=="string"){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(opt.body)}
 const r=await fetch(path,init);let data={};try{data=await r.json()}catch{}
 if(!r.ok)throw new Error(data.error||t("הפעולה נכשלה","Action failed"));
 return data;
}
function toast(msg,bad=false){
 const fn=window.showToast||window.toast;if(typeof fn==="function"){fn(msg,bad?"error":"success");return}
 let x=$("#admin-control-toast");if(!x){x=document.createElement("div");x.id="admin-control-toast";x.setAttribute("role","status");x.setAttribute("aria-live","polite");x.setAttribute("aria-atomic","true");x.style.cssText="position:fixed;z-index:99999;bottom:20px;left:20px;max-width:360px;padding:12px 16px;border-radius:12px;background:#111;color:#fff;box-shadow:0 8px 30px #0003";document.body.append(x)}
 x.textContent=msg;x.hidden=false;clearTimeout(x._timer);x._timer=setTimeout(()=>x.hidden=true,3500);
}
function dialog(){
 let d=$("#admin-control-center");if(!d){d=document.createElement("dialog");d.id="admin-control-center";d.className="modal modal-wide";document.body.append(d)}
 d.innerHTML='<button class="dialog-close" type="button" aria-label="'+t("סגירה","Close")+'">×</button><div class="dialog-heading align-start"><span class="section-kicker">'+t("הנהלת האתר","Site administrator")+'</span><h2>'+t("מרכז בקרת האתר","Site control center")+'</h2><p>'+t("ניהול תפעול, תוכן, קטגוריות והגדרות במקום אחד.","Manage operations, content, categories and settings in one place.")+'</p></div><nav class="dashboard-tabs" data-control-tabs></nav><div class="launch-body" data-control-body></div>';
 $(".dialog-close",d).onclick=()=>d.close();return d;
}
const sections=[
 ["settings",t("הגדרות אתר","Site settings")],
 ["categories",t("קטגוריות","Categories")],
 ["closures",t("סגירות","Closures")],
 ["holidays",t("חגים","Holidays")],
 ["emails",t("תבניות מייל","Email templates")],
 ["moderation",t("מודרציה","Moderation")],
 ["security",t("אבטחה","Security")],
 ["exports",t("ייצוא נתונים","Data exports")]
];
async function openCenter(){
 const d=dialog(),tabs=$("[data-control-tabs]",d),body=$("[data-control-body]",d);
 tabs.innerHTML=sections.map(([id,label])=>'<button type="button" class="dashboard-tab" data-control-tab="'+id+'">'+esc(label)+'</button>').join("");
 async function show(id){
   $$("[data-control-tab]",d).forEach(b=>b.classList.toggle("is-active",b.dataset.controlTab===id));
   body.innerHTML="<p>"+t("טוענים...","Loading...")+"</p>";
   try{
     if(id==="settings")await renderSettings(body);
     if(id==="categories")await renderCategories(body);
     if(id==="closures")await renderClosures(body);
     if(id==="holidays")await renderHolidays(body);
     if(id==="emails")await renderEmails(body);
     if(id==="moderation")await renderModeration(body);
     if(id==="security")await renderSecurity(body);
     if(id==="exports")await renderExports(body);
   }catch(e){body.innerHTML='<div class="dashboard-empty"><strong>'+t("לא הצלחנו לטעון את המסך","Could not load this screen")+'</strong><p>'+esc(e.message)+'</p></div>'}
 }
 $$("[data-control-tab]",d).forEach(b=>b.onclick=()=>show(b.dataset.controlTab));
 d.showModal();await show("settings");
}
async function renderSettings(root){
 const x=await api("/api/admin/site-settings"),s=x.settings||{},versions=x.versions||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("זהות ועיצוב האתר","Site identity and design")+'</h3><form data-site-settings class="stack-form"><div class="two-columns"><label>'+t("שם האתר","Site name")+'<input name="siteName" value="'+esc(s.site_name||"")+'"></label><label>'+t("סלוגן","Tagline")+'<input name="tagline" value="'+esc(s.tagline||"")+'"></label></div><label>'+t("כותרת ראשית","Hero title")+'<input name="heroTitle" value="'+esc(s.hero_title||"")+'"></label><label>'+t("תיאור ראשי","Hero description")+'<textarea name="heroDescription" rows="3">'+esc(s.hero_description||"")+'</textarea></label><div class="two-columns"><label>'+t("צבע ראשי","Primary color")+'<input name="primaryColor" type="color" value="'+esc(s.primary_color||"#1f4f8a")+'"></label><label>'+t("צבע הדגשה","Accent color")+'<input name="accentColor" type="color" value="'+esc(s.accent_color||"#c59b42")+'"></label></div><label>'+t("כתובת לוגו","Logo URL")+'<input name="logoUrl" value="'+esc(s.logo_url||"")+'"></label><button class="button button-primary">'+t("שמירת הגדרות","Save settings")+'</button></form></div><div class="dashboard-section"><h3>'+t("היסטוריית גרסאות","Version history")+'</h3><div data-settings-versions style="display:grid;gap:8px">'+versions.map(v=>'<article class="dashboard-row"><div><strong>'+esc(fmt(v.created_at))+'</strong><small>'+esc(v.created_by_name||"")+'</small></div><button class="button button-secondary button-small" data-restore-settings="'+esc(v.id)+'">'+t("שחזור","Restore")+'</button></article>').join("")+'</div></div>';
 $("[data-site-settings]",root).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/site-settings",{method:"PATCH",body:{siteName:f.siteName.value,tagline:f.tagline.value,heroTitle:f.heroTitle.value,heroDescription:f.heroDescription.value,primaryColor:f.primaryColor.value,accentColor:f.accentColor.value,logoUrl:f.logoUrl.value}});toast(t("הגדרות האתר נשמרו","Site settings saved"));await renderSettings(root)}catch(err){toast(err.message,true)}};
 $$("[data-restore-settings]",root).forEach(b=>b.onclick=async()=>{if(!confirm(t("לשחזר גרסה זו?","Restore this version?")))return;try{await api("/api/admin/site-settings/versions/"+encodeURIComponent(b.dataset.restoreSettings)+"/restore",{method:"POST",body:{}});toast(t("הגרסה שוחזרה","Version restored"));await renderSettings(root)}catch(e){toast(e.message,true)}});
}
async function renderCategories(root){
 const [x,sug]=await Promise.all([api("/api/admin/categories"),api("/api/admin/category-suggestions")]);
 const cats=x.categories||[],suggestions=sug.suggestions||[];
 root.innerHTML='<div class="dashboard-section"><div class="section-heading"><div><h3>'+t("ניהול קטגוריות מלא","Full category management")+'</h3><p>'+t("יצירה, תרגום, מילים נרדפות, סדר, הסתרה ומיזוג.","Create, translate, manage synonyms, ordering, hiding and merging.")+'</p></div><button class="button button-primary" data-new-category>'+t("קטגוריה חדשה","New category")+'</button></div><div data-categories style="display:grid;gap:8px">'+cats.map(c=>'<article class="dashboard-row"><div><strong>'+esc(c.name_he)+' '+(c.name_en?'· '+esc(c.name_en):"")+'</strong><p>'+esc((c.synonyms||[]).join(", "))+'</p><small>'+esc(c.id)+' · '+esc(c.status)+' · #'+Number(c.sort_order||0)+'</small></div><div class="dashboard-row-actions"><button class="button button-secondary button-small" data-edit-category="'+esc(c.id)+'">'+t("עריכה","Edit")+'</button><button class="button button-secondary button-small" data-merge-category="'+esc(c.id)+'">'+t("מיזוג","Merge")+'</button></div></article>').join("")+'</div></div><div class="dashboard-section"><h3>'+t("הצעות קטגוריה מהקהילה","Community category suggestions")+'</h3><div style="display:grid;gap:8px">'+suggestions.map(s=>'<article class="dashboard-row"><div><strong>'+esc(s.name)+'</strong><p>'+esc(s.description||"")+'</p><small>'+esc(s.status)+' · '+esc(fmt(s.created_at))+'</small></div>'+(s.status==="pending"?'<div class="dashboard-row-actions"><button class="button button-primary button-small" data-category-suggestion="'+esc(s.id)+'" data-status="approved">'+t("אישור","Approve")+'</button><button class="button button-secondary button-small" data-category-suggestion="'+esc(s.id)+'" data-status="rejected">'+t("דחייה","Reject")+'</button></div>':"")+'</article>').join("")||"<p>"+t("אין הצעות ממתינות.","No pending suggestions.")+"</p>"+'</div></div>';
 function editor(row){
  const nameHe=prompt(t("שם בעברית","Hebrew name"),row?.name_he||"");if(!nameHe)return;
  const nameEn=prompt(t("שם באנגלית","English name"),row?.name_en||"")||"";
  const parentId=prompt(t("מזהה קטגוריית אב, ריק לראשית","Parent category ID, blank for top level"),row?.parent_id||"")||null;
  const icon=prompt(t("שם סמל","Icon name"),row?.icon||"")||"";
  const imageUrl=prompt(t("כתובת תמונה","Image URL"),row?.image_url||"")||"";
  const synonyms=(prompt(t("מילים נרדפות, מופרדות בפסיקים","Synonyms, comma separated"),(row?.synonyms||[]).join(", "))||"").split(",").map(v=>v.trim()).filter(Boolean);
  const sortOrder=Number(prompt(t("סדר תצוגה","Sort order"),String(row?.sort_order||0))||0);
  return {nameHe,nameEn,parentId,icon,imageUrl,synonyms,sortOrder};
 }
 $("[data-new-category]",root).onclick=async()=>{const body=editor(null);if(!body)return;try{await api("/api/admin/categories",{method:"POST",body});toast(t("הקטגוריה נוצרה","Category created"));await renderCategories(root)}catch(e){toast(e.message,true)}};
 $$("[data-edit-category]",root).forEach(b=>b.onclick=async()=>{const row=cats.find(c=>String(c.id)===String(b.dataset.editCategory)),body=editor(row);if(!body)return;body.status=confirm(t("להציג את הקטגוריה לציבור?","Show this category publicly?"))?"active":"hidden";try{await api("/api/admin/categories/"+encodeURIComponent(row.id),{method:"PATCH",body});toast(t("הקטגוריה עודכנה","Category updated"));await renderCategories(root)}catch(e){toast(e.message,true)}});
 $$("[data-merge-category]",root).forEach(b=>b.onclick=async()=>{const into=prompt(t("מזהה קטגוריית היעד למיזוג","Target category ID to merge into"));if(!into)return;try{await api("/api/admin/categories/"+encodeURIComponent(b.dataset.mergeCategory),{method:"PATCH",body:{mergeInto:into}});toast(t("הקטגוריה מוזגה","Category merged"));await renderCategories(root)}catch(e){toast(e.message,true)}});
 $$("[data-category-suggestion]",root).forEach(b=>b.onclick=async()=>{try{await api("/api/admin/category-suggestions/"+encodeURIComponent(b.dataset.categorySuggestion),{method:"PATCH",body:{status:b.dataset.status}});toast(t("ההצעה עודכנה","Suggestion updated"));await renderCategories(root)}catch(e){toast(e.message,true)}});
}
async function renderClosures(root){
 const x=await api("/api/admin/closures"),rows=x.closures||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("סגירת האתר ותחזוקה","Site closure and maintenance")+'</h3><form data-new-closure class="stack-form"><div class="two-columns"><label>'+t("סוג","Type")+'<select name="closureType"><option value="manual">'+t("ידנית","Manual")+'</option><option value="maintenance">'+t("תחזוקה","Maintenance")+'</option><option value="holiday">'+t("חג","Holiday")+'</option></select></label><label>'+t("כותרת","Title")+'<input name="titleHe" required></label></div><label>'+t("כותרת באנגלית","English title")+'<input name="titleEn"></label><div class="two-columns"><label>'+t("התחלה","Starts")+'<input name="startsAt" type="datetime-local" required></label><label>'+t("סיום","Ends")+'<input name="endsAt" type="datetime-local" required></label></div><button class="button button-primary">'+t("תזמון סגירה","Schedule closure")+'</button></form><div style="display:grid;gap:8px;margin-top:14px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r.title_he)+' '+(r.title_en?'· '+esc(r.title_en):"")+'</strong><p>'+esc(fmt(r.starts_at))+' - '+esc(fmt(r.ends_at))+'</p><small>'+esc(r.closure_type)+'</small></div><button class="button button-secondary button-small" data-toggle-closure="'+esc(r.id)+'" data-active="'+(r.active?"1":"0")+'">'+(r.active?t("כיבוי","Disable"):t("הפעלה","Enable"))+'</button></article>').join("")+'</div></div>';
 $("[data-new-closure]",root).onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{await api("/api/admin/closures",{method:"POST",body:{closureType:f.closureType.value,titleHe:f.titleHe.value,titleEn:f.titleEn.value,startsAt:new Date(f.startsAt.value).toISOString(),endsAt:new Date(f.endsAt.value).toISOString()}});toast(t("הסגירה תוזמנה","Closure scheduled"));await renderClosures(root)}catch(err){toast(err.message,true)}};
 $$("[data-toggle-closure]",root).forEach(b=>b.onclick=async()=>{try{await api("/api/admin/closures/"+encodeURIComponent(b.dataset.toggleClosure),{method:"PATCH",body:{active:b.dataset.active!=="1"}});toast(t("הסגירה עודכנה","Closure updated"));await renderClosures(root)}catch(e){toast(e.message,true)}});
}
async function renderHolidays(root){
 const x=await api("/api/admin/holiday-rules"),rows=x.holidays||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("כללי חגים","Holiday rules")+'</h3><p>'+t("הגדרת ימים, משך, הודעות בעברית ובאנגלית והפעלה או השבתה.","Configure dates, duration, Hebrew and English messages, and activation.")+'</p><button class="button button-primary" data-new-holiday>'+t("חג חדש","New holiday")+'</button><div style="display:grid;gap:8px;margin-top:12px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r.title_he)+' '+(r.title_en?'· '+esc(r.title_en):"")+'</strong><p>'+esc(r.hebrew_month)+' '+Number(r.hebrew_day)+' · '+Number(r.duration_days)+' '+t("ימים","days")+'</p><small>'+esc(r.enabled?t("פעיל","active"):t("מושבת","disabled"))+'</small></div><button class="button button-secondary button-small" data-edit-holiday="'+esc(r.id)+'">'+t("עריכה","Edit")+'</button></article>').join("")+'</div></div>';
 async function edit(row){
  const titleHe=prompt(t("שם החג בעברית","Holiday Hebrew title"),row?.title_he||"");if(!titleHe)return;
  const titleEn=prompt(t("שם החג באנגלית","Holiday English title"),row?.title_en||"")||"";
  const messageHe=prompt(t("הודעה בעברית","Hebrew message"),row?.message_he||"")||"";
  const messageEn=prompt(t("הודעה באנגלית","English message"),row?.message_en||"")||"";
  if(row){await api("/api/admin/holiday-rules/"+encodeURIComponent(row.id),{method:"PATCH",body:{titleHe,titleEn,messageHe,messageEn,enabled:confirm(t("החג פעיל?","Holiday active?"))}})}
  else{const hebrewMonth=prompt(t("חודש עברי באנגלית, לדוגמה Tishri","Hebrew month in English, e.g. Tishri"));if(!hebrewMonth)return;const hebrewDay=Number(prompt(t("יום בחודש","Day of month"),"1")||1),durationDays=Number(prompt(t("משך בימים","Duration in days"),"1")||1);await api("/api/admin/holiday-rules",{method:"POST",body:{hebrewMonth,hebrewDay,durationDays,titleHe,titleEn,messageHe,messageEn,enabled:true}})}
 }
 $("[data-new-holiday]",root).onclick=async()=>{try{await edit(null);toast(t("החג נוסף","Holiday added"));await renderHolidays(root)}catch(e){toast(e.message,true)}};
 $$("[data-edit-holiday]",root).forEach(b=>b.onclick=async()=>{try{await edit(rows.find(r=>String(r.id)===String(b.dataset.editHoliday)));toast(t("החג עודכן","Holiday updated"));await renderHolidays(root)}catch(e){toast(e.message,true)}});
}
async function renderEmails(root){
 const x=await api("/api/admin/email-templates"),rows=x.templates||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("תבניות אימייל והתראות","Email and notification templates")+'</h3><div style="display:grid;gap:8px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r.template_key)+' · '+esc(r.language.toUpperCase())+'</strong><p>'+esc(r.subject)+'</p><small>'+esc(r.enabled?t("פעיל","active"):t("מושבת","disabled"))+' · '+esc(fmt(r.updated_at))+'</small></div><button class="button button-secondary button-small" data-edit-template="'+esc(r.template_key)+'" data-lang="'+esc(r.language)+'">'+t("עריכה","Edit")+'</button></article>').join("")+'</div></div>';
 $$("[data-edit-template]",root).forEach(b=>b.onclick=async()=>{const row=rows.find(r=>r.template_key===b.dataset.editTemplate&&r.language===b.dataset.lang);if(!row)return;const subject=prompt(t("נושא ההודעה","Message subject"),row.subject);if(subject===null)return;const bodyText=prompt(t("תוכן ההודעה","Message body"),row.body_text);if(bodyText===null)return;try{await api("/api/admin/email-templates/"+encodeURIComponent(row.template_key)+"/"+row.language,{method:"PUT",body:{subject,bodyText,enabled:confirm(t("התבנית פעילה?","Template active?"))}});toast(t("התבנית נשמרה","Template saved"));await renderEmails(root)}catch(e){toast(e.message,true)}});
}
async function renderModeration(root){
 const x=await api("/api/admin/moderation"),rows=x.jobs||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("תור מודרציה מאוחד","Unified moderation queue")+'</h3><div style="display:grid;gap:8px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r.entity_type)+' · '+esc(r.severity)+'</strong><p>'+esc(r.reason||"")+'</p><small>'+esc(r.status)+' · '+esc(fmt(r.created_at))+'</small></div>'+(r.status==="pending"?'<div class="dashboard-row-actions"><button class="button button-secondary button-small" data-mod="'+esc(r.id)+'" data-status="cleared">'+t("אישור","Clear")+'</button><button class="button button-primary button-small" data-mod="'+esc(r.id)+'" data-status="hidden">'+t("הסתרה","Hide")+'</button></div>':"")+'</article>').join("")||"<p>"+t("אין פריטים בתור המודרציה.","Moderation queue is empty.")+"</p>"+'</div></div>';
 $$("[data-mod]",root).forEach(b=>b.onclick=async()=>{try{await api("/api/admin/moderation/"+encodeURIComponent(b.dataset.mod),{method:"PATCH",body:{status:b.dataset.status}});toast(t("המודרציה עודכנה","Moderation updated"));await renderModeration(root)}catch(e){toast(e.message,true)}});
}
async function renderSecurity(root){
 const x=await api("/api/admin/security-events"),rows=x.events||[];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("אירועי אבטחה","Security events")+'</h3><div style="display:grid;gap:8px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r.event_type)+' · '+esc(r.severity)+'</strong><p>'+esc(r.device_label||"")+'</p><small>'+esc(fmt(r.created_at))+' · '+esc(r.user_id||"")+'</small></div></article>').join("")||"<p>"+t("אין אירועי אבטחה.","No security events.")+"</p>"+'</div></div>';
}
function renderExports(root){
 const rows=[
  ["users",t("משתמשים","Users"),t("חשבונות, תפקידים וסטטוס","Accounts, roles and status")],
  ["organizations",t("גמ״חים","Organizations"),t("פרטי גמ״חים וסטטוס","Organization details and status")],
  ["items",t("פריטים","Items"),t("קטלוג, מלאי וסטטוס","Catalog, inventory and status")],
  ["loans",t("השאלות","Loans"),t("בקשות, תאריכים וסטטוס תהליך","Requests, dates and workflow status")],
  ["support",t("תמיכה","Support"),t("פניות, עדיפות והקצאה","Tickets, priority and assignment")]
 ];
 root.innerHTML='<div class="dashboard-section"><h3>'+t("ייצוא נתוני מערכת","System data exports")+'</h3><p>'+t("הורדת CSV או גיליון Excel. CSV נשמר ב-UTF-8.","Download UTF-8 CSV or Excel spreadsheet files.")+'</p><div style="display:grid;gap:8px">'+rows.map(r=>'<article class="dashboard-row"><div><strong>'+esc(r[1])+'</strong><p>'+esc(r[2])+'</p></div><div class="dashboard-row-actions"><a class="button button-secondary button-small" href="/api/admin/export.csv?type='+encodeURIComponent(r[0])+'" download>'+t("ייצוא CSV","Export CSV")+'</a><a class="button button-secondary button-small" href="/api/admin/export.xls?type='+encodeURIComponent(r[0])+'" download>'+t("ייצוא Excel","Export Excel")+'</a></div></article>').join("")+'</div></div>';
}
function install(){
 const tab=$("#admin-tab"),actions=$("#dashboard-view .dashboard-actions");
 if(!tab||tab.hidden||!actions||actions.querySelector("[data-admin-control-center]"))return;
 const b=document.createElement("button");b.type="button";b.className="button button-primary";b.dataset.adminControlCenter="1";b.textContent=t("מרכז בקרת האתר","Site control center");b.onclick=openCenter;actions.prepend(b);
}
function init(){const obs=new MutationObserver(install);obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["hidden","lang","dir"]});install()}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();