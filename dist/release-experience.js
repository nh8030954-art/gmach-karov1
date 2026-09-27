
(()=>{"use strict";
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const isEn=()=>document.documentElement.lang==="en";
const tr=(he,en)=>isEn()?en:he;
async function api(path,opts={}){const init={credentials:"same-origin",...opts,headers:{...(opts.headers||{})}};if(opts.body&&!(opts.body instanceof FormData)&&typeof opts.body!=="string"){init.headers["Content-Type"]="application/json";init.body=JSON.stringify(opts.body)}const r=await fetch(path,init),d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||tr("הפעולה לא הושלמה","Action failed"));return d}
function modal(id,title){let d=$("#"+id);if(!d){d=document.createElement("dialog");d.id=id;d.className="modal modal-wide";document.body.append(d)}d.innerHTML='<button class="dialog-close" type="button" aria-label="'+tr("סגירה","Close")+'">×</button><h2>'+esc(title)+'</h2><div data-release-body></div>';$(".dialog-close",d).onclick=()=>d.close();return d}
function minutes(v){v=Number(v||0);if(!v)return tr("ללא","None");if(v%1440===0)return (v/1440)+" "+tr("ימים","days");if(v%60===0)return (v/60)+" "+tr("שעות","hours");return v+" "+tr("דקות","minutes")}
function moneyAgorot(v){return (Number(v||0)/100).toLocaleString(isEn()?"en-IL":"he-IL",{style:"currency",currency:"ILS"})}

async function enrichItemPolicy(){
 const host=$("#item-dialog-content"),itemId=host?.dataset.itemId;
 if(!host||!itemId||host.querySelector("[data-release-policy]"))return;
 try{
  const {item}=await api("/api/items/"+encodeURIComponent(itemId));if(!item)return;
  const copy=$(".item-detail-copy",host);if(!copy)return;
  const section=document.createElement("section");section.dataset.releasePolicy="1";section.className="organization-facts";
  const rows=[
   [tr("משך מינימלי","Minimum duration"),minutes(item.minLoanMinutes)],
   [tr("משך מרבי","Maximum duration"),minutes(item.maxLoanMinutes)],
   [tr("הזמנה מראש","Advance notice"),minutes(item.bookingNoticeMinutes)],
   [tr("זמן הכנה","Preparation time"),minutes(item.preparationMinutes)],
   [tr("זמן בין השאלות","Turnaround time"),minutes(item.turnaroundMinutes)],
   [tr("אופק הזמנה","Booking horizon"),Number(item.bookingHorizonDays||0)+" "+tr("ימים","days")],
   [tr("אישור בקשה","Request approval"),item.approvalMode==="automatic"?tr("אוטומטי","Automatic"):tr("ידני","Manual")],
   [tr("מקסימום למשתמש","Maximum per user"),item.maxPerUser?String(item.maxPerUser):tr("ללא מגבלה נוספת","No additional limit")],
   [tr("רדיוס שירות","Service radius"),item.serviceRadiusKm?item.serviceRadiusKm+" "+tr('ק"מ',"km"):tr("לא הוגדר","Not set")]
  ];
  if(item.depositRequired)rows.push([tr("פיקדון","Deposit"),moneyAgorot(item.depositAmountAgorot)]);
  if(item.recurringAllowed)rows.push([tr("בקשה מחזורית","Recurring request"),tr("נתמכת","Supported")]);
  section.innerHTML='<section style="grid-column:1/-1"><h3>'+tr("תנאי השאלה וזמינות","Loan terms and availability")+'</h3><div class="platform-kpis" style="margin-top:10px">'+rows.map(([a,b])=>'<article><span>'+esc(a)+'</span><strong>'+esc(b)+'</strong></article>').join("")+'</div>'+(item.loan_conditions?'<p style="margin-top:12px"><strong>'+tr("תנאים נוספים: ","Additional terms: ")+'</strong>'+esc(item.loan_conditions)+'</p>':'')+'</section>';
  copy.insertBefore(section,$(".gmach-owner",copy)||$(".detail-actions",copy));
 }catch{}
}

let faqCache=null,faqTimer=null;
async function loadFaq(){if(faqCache)return faqCache;const x=await api("/api/faqs?lang="+(isEn()?"en":"he"));faqCache=x.articles||[];return faqCache}
function words(text){return String(text||"").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu," ").split(/\s+/).filter(x=>x.length>2)}
async function updateFaqSuggestions(){
 const form=$("#support-form"),box=$("#support-faq-suggestions");if(!form||!box)return;
 const q=[form.elements.namedItem("subject")?.value,form.elements.namedItem("message")?.value].join(" ").trim();
 if(q.length<3){box.hidden=true;return}
 try{
  const articles=await loadFaq(),tokens=words(q);
  const ranked=articles.map(a=>{const hay=words([a.title,a.body,...(a.keywords||[])].join(" "));let score=0;for(const t of tokens){if(hay.some(h=>h===t))score+=4;else if(hay.some(h=>h.includes(t)||t.includes(h)))score+=1}return {a,score}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,3);
  if(!ranked.length){box.hidden=true;return}
  box.hidden=false;box.innerHTML='<strong>'+tr("אולי התשובה כבר כאן","You may find the answer here")+'</strong><div style="display:grid;gap:8px;margin-top:8px">'+ranked.map(x=>'<details><summary>'+esc(x.a.title)+'</summary><p>'+esc(x.a.body)+'</p></details>').join("")+'</div>';
 }catch{box.hidden=true}
}
function installFaqRouting(){
 const form=$("#support-form");if(!form||$("#support-faq-suggestions"))return;
 const box=document.createElement("section");box.id="support-faq-suggestions";box.hidden=true;box.className="dashboard-empty";box.setAttribute("aria-live","polite");
 const message=form.querySelector("textarea");message?.parentNode?.insertAdjacentElement("afterend",box);
 for(const el of [form.elements.namedItem("subject"),form.elements.namedItem("message")])el?.addEventListener("input",()=>{clearTimeout(faqTimer);faqTimer=setTimeout(updateFaqSuggestions,250)});
}

async function openMySupport(){
 const d=modal("release-support-center",tr("הפניות שלי","My support requests")),body=$("[data-release-body]",d);body.innerHTML="<p>"+tr("טוענים...","Loading...")+"</p>";d.showModal();
 try{
  const x=await api("/api/me/support-tickets"),tickets=x.tickets||[];
  body.innerHTML=tickets.length?'<div style="display:grid;gap:10px">'+tickets.map(t=>'<article class="dashboard-row" data-ticket="'+esc(t.id)+'"><div><strong>#'+esc(t.ticket_number)+' · '+esc(t.subject)+'</strong><p>'+tr("סטטוס","Status")+': '+esc(t.status)+' · '+esc(new Date(t.updated_at).toLocaleString(isEn()?"en-GB":"he-IL"))+'</p></div><button class="button button-secondary button-small" data-open-ticket="'+esc(t.id)+'">'+tr("פתיחת שיחה","Open conversation")+'</button></article>').join("")+'</div>':'<p>'+tr("אין פניות קודמות.","No previous support requests.")+'</p>';
  $$("[data-open-ticket]",body).forEach(b=>b.onclick=()=>openTicket(b.dataset.openTicket,tickets.find(t=>String(t.id)===String(b.dataset.openTicket))));
 }catch(e){body.innerHTML='<p role="alert">'+esc(e.message)+'</p>'}
}
async function openTicket(id,ticket){
 const d=modal("release-ticket-thread","#"+(ticket?.ticket_number||"")+" "+(ticket?.subject||tr("פניית תמיכה","Support request"))),body=$("[data-release-body]",d);body.innerHTML="<p>"+tr("טוענים...","Loading...")+"</p>";d.showModal();
 const path="/api/me/support-tickets/"+encodeURIComponent(id);
 const render=async()=>{
  const x=await api(path+"/messages"),closed=ticket?.status==="closed";
  body.innerHTML='<div style="display:grid;gap:8px;max-height:48vh;overflow:auto">'+(x.messages||[]).map(m=>'<article class="dashboard-row"><div><strong>'+esc(m.fromSupport?tr("צוות התמיכה","Support team"):tr("אני","Me"))+'</strong><p>'+esc(m.body)+'</p><small>'+esc(new Date(m.createdAt).toLocaleString(isEn()?"en-GB":"he-IL"))+'</small></div></article>').join("")+'</div><form data-ticket-reply class="stack-form" style="margin-top:12px"><label>'+tr("הודעה נוספת","New message")+'<textarea name="message" maxlength="1500" required></textarea></label><button class="button button-primary">'+tr("שליחה","Send")+'</button></form><button class="button button-secondary" type="button" data-ticket-status style="margin-top:8px">'+(closed?tr("פתיחה מחדש","Reopen"):tr("סגירת הפנייה","Close request"))+'</button>';
  $("[data-ticket-reply]",body).onsubmit=async e=>{e.preventDefault();const msg=e.currentTarget.message.value.trim();if(!msg)return;await api(path+"/messages",{method:"POST",body:{message:msg}});ticket.status="reopened";await render()};
  $("[data-ticket-status]",body).onclick=async()=>{const target=ticket?.status==="closed"?"open":"closed";await api(path+"/status",{method:"PATCH",body:{status:target}});ticket.status=target==="closed"?"closed":"reopened";await render()};
 };try{await render()}catch(e){body.innerHTML='<p role="alert">'+esc(e.message)+'</p>'}
}
function installSupportEntry(){
 const dialog=$("#support-dialog");if(dialog&&!dialog.querySelector("[data-my-support]")){
  const b=document.createElement("button");b.type="button";b.className="button button-secondary button-full";b.dataset.mySupport="1";b.textContent=tr("הפניות והשיחות שלי","My requests and conversations");b.onclick=openMySupport;$("#support-form",dialog)?.insertAdjacentElement("afterend",b);
 }
 const actions=$("#dashboard-view .dashboard-actions");if(actions&&!actions.querySelector("[data-my-support]")){
  const b=document.createElement("button");b.type="button";b.className="button button-secondary";b.dataset.mySupport="1";b.textContent=tr("תמיכה","Support");b.onclick=openMySupport;actions.prepend(b);
 }
}

function installBranchMap(){
 const d=$("#public-branches-dialog"),body=d&&$(".requirements-expansion-body",d);if(!d||!d.open||!body||body.querySelector("[data-branch-visual-map]"))return;
 const points=[];for(const a of $$('a[href*="google.com/maps/search"]',body)){try{const u=new URL(a.href),q=u.searchParams.get("query")||"",m=q.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);if(!m)continue;const article=a.closest("article"),name=article?.querySelector("strong")?.textContent||tr("סניף","Branch"),address=article?.querySelector("p")?.textContent||"";points.push({lat:Number(m[1]),lon:Number(m[2]),name,address})}catch{}}
 if(!points.length)return;
 const lats=points.map(p=>p.lat),lons=points.map(p=>p.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons),pad=.0005;
 const x=p=>24+((p.lon-minLon)/(Math.max(pad,maxLon-minLon)))*552,y=p=>276-((p.lat-minLat)/(Math.max(pad,maxLat-minLat)))*236;
 const wrap=document.createElement("section");wrap.dataset.branchVisualMap="1";wrap.className="dashboard-empty";wrap.innerHTML='<h3>'+tr("מפת הסניפים","Branch map")+'</h3><p>'+tr("המפה מסמנת את המיקום היחסי של כל נקודות האיסוף. לחצו על סניף כדי לפתוח ניווט.","The map shows the relative location of all pickup points. Select a branch to open navigation.")+'</p><div style="overflow:auto"><svg viewBox="0 0 600 300" role="img" aria-label="'+tr("מפת סניפים","Branch map")+'" style="width:100%;min-width:480px;border:1px solid #d9e0e5;border-radius:16px;background:#f8fbfc"><path d="M20 40H580M20 100H580M20 160H580M20 220H580M120 20V280M240 20V280M360 20V280M480 20V280" stroke="#dfe8eb" fill="none"/>'+points.map((p,i)=>'<a href="https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.lat+","+p.lon)+'" target="_blank" rel="noopener"><circle cx="'+x(p).toFixed(1)+'" cy="'+y(p).toFixed(1)+'" r="9" fill="#243f75"/><text x="'+(x(p)+13).toFixed(1)+'" y="'+(y(p)+5).toFixed(1)+'" font-size="12" fill="#123c46">'+esc(p.name.slice(0,26))+'</text></a>').join("")+'</svg></div>';
 const route="https://www.google.com/maps/dir/?api=1&origin="+encodeURIComponent(points[0].lat+","+points[0].lon)+"&destination="+encodeURIComponent(points[points.length-1].lat+","+points[points.length-1].lon)+(points.length>2?"&waypoints="+encodeURIComponent(points.slice(1,-1).slice(0,8).map(p=>p.lat+","+p.lon).join("|")):"");
 wrap.insertAdjacentHTML("beforeend",'<p><a class="button button-secondary" target="_blank" rel="noopener" href="'+esc(route)+'">'+tr("פתיחת כל הסניפים ב-Google Maps","Open all branches in Google Maps")+'</a></p>');
 body.prepend(wrap);
}

function init(){
 const obs=new MutationObserver(()=>{enrichItemPolicy();installFaqRouting();installSupportEntry();installBranchMap()});
 obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["open","lang","hidden"]});
 installFaqRouting();installSupportEntry();enrichItemPolicy();installBranchMap();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();
