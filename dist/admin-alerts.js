(()=>{'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const t=(he,en)=>document.documentElement.lang==='en'?en:he;
const verdict=v=>({suspected:t('חשד לבדיקה','Suspected — needs review'),clear:t('לא נמצא חשד במחקר','No suspicion found'),inconclusive:t('אין מספיק מידע','Insufficient information')}[v]||v);
async function api(path){const r=await fetch(path,{credentials:'same-origin'});const x=await r.json();if(!r.ok)throw new Error(x.error||t('לא הצלחנו לטעון','Could not load'));return x}
function modal(title){let d=document.querySelector('#admin-research-dialog');if(!d){d=document.createElement('dialog');d.id='admin-research-dialog';d.className='modal modal-wide';document.body.append(d)}d.innerHTML=`<button class="dialog-close" aria-label="${t('סגירה','Close')}">×</button><h2>${esc(title)}</h2><div data-research-body><p>${t('טוענים…','Loading…')}</p></div>`;d.querySelector('button').onclick=()=>d.close();if(!d.open)d.showModal();return d}
const date=v=>v?new Date(v).toLocaleString(document.documentElement.lang==='en'?'en-GB':'he-IL'):'';
async function openResearch(id){const d=modal(t('בדיקת גמ״חים ברשת','Gmach web research')),b=d.querySelector('[data-research-body]');try{
 if(id){const {result:r}=await api('/api/admin/gmach-research/'+encodeURIComponent(id));b.innerHTML=`<h3>${esc(r.name)}</h3><p><strong>${esc(verdict(r.verdict))}</strong> · ${esc(date(r.checked_at))}</p><p>${esc(r.summary)}</p><h3>${t('התאמת זהות הגמ״ח','Identity match')}</h3><p>${esc(r.identity_match)}</p><h3>${t('מקורות ונימוקים','Sources and reasons')}</h3>${r.evidence.map(e=>`<article class="dashboard-row"><div><a href="${esc(e.url)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a><p>${esc(e.note)}</p></div></article>`).join('')||`<p>${t('לא נמצאו מקורות מספיקים.','Insufficient sources found.')}</p>`}<p>${t('זהו ממצא מחקר לבדיקה ידנית.','This research finding needs manual review.')}</p><button class="button button-secondary" data-open-research-gmach>${t('ניהול הגמ״ח','Manage gmach')}</button><button class="button button-secondary" data-all-research>${t('כל הבדיקות','All checks')}</button>`;b.querySelector('[data-open-research-gmach]').onclick=()=>{d.close();window.GmachAdmin?.open(r.organization_id)};b.querySelector('[data-all-research]').onclick=()=>openResearch();
 }else{const x=await api('/api/admin/gmach-research');const last=x.runs[0];b.innerHTML=`<p>${t('מחקר קצר ברשת פעם בשבועיים.','Short web research every two weeks.')}</p><p>${last?`${t('בדיקה אחרונה','Latest check')}: ${esc(date(last.checked_at))} · ${Number(last.checked_count)}/${Number(last.candidate_count)} ${t('גמ״חים נבדקו','gmachs checked')}`:t('הבדיקה הראשונה טרם התקבלה.','The first check has not arrived yet.')}</p><p>${t('תשלום סמלי, פיקדון או עסק שמפעיל גם גמ״ח אינם כשלעצמם סיבה לחשד.','Nominal fees, deposits or a business that also runs a charity are not by themselves suspicious.')}</p><div style="display:grid;gap:10px">${x.results.map(r=>`<article class="dashboard-row"><div><strong>${esc(r.name)}</strong><p>${esc(verdict(r.verdict))}</p><small>${esc(date(r.checked_at))}</small></div><button class="button button-secondary button-small" data-research-id="${esc(r.id)}">${t('פרטים ומקורות','Details and sources')}</button></article>`).join('')||`<p>${t('אין עדיין תוצאות.','No results yet.')}</p>`}</div>`;b.querySelectorAll('[data-research-id]').forEach(btn=>btn.onclick=()=>openResearch(btn.dataset.researchId));}
 }catch(e){b.textContent=e.message}}
window.addEventListener('gmach:admin-notification',async e=>{if(document.querySelector('#admin-tab')?.hidden!==false)return;const {kind,target}=e.detail||{};
 if(kind==='research')await openResearch(target);else if(kind==='research-status')await openResearch();
 else if(kind==='support')window.GmachAdminSupportTicket?.(target);
 else if(kind==='error')window.GmachAdminServerErrors?.();
 else if(kind==='alert')window.GmachAdminOperationalHealth?.();
 else if(kind==='report'||kind==='legacy-report')window.GmachAdminContentCenter?.(kind==='report'?'moderation':'content');
});
function install(){const admin=document.querySelector('#admin-tab'),actions=document.querySelector('#dashboard-view .dashboard-actions');if(!admin||admin.hidden||!actions||actions.querySelector('[data-gmach-research]'))return;const b=document.createElement('button');b.type='button';b.className='button button-secondary';b.dataset.gmachResearch='1';b.textContent=t('בדיקות גמ״חים','Gmach checks');b.onclick=()=>openResearch();actions.append(b)}
new MutationObserver(install).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});install();
function installDashboardSummary(){
 const dashboard=document.querySelector('#dashboard-view'),admin=document.querySelector('#admin-tab'),personal=dashboard?.querySelector('.dashboard-stats'),name=document.querySelector('#dashboard-name');
 if(!dashboard||!admin||!personal)return;
 const section=document.createElement('section');section.id='admin-dashboard-summary';section.hidden=true;section.setAttribute('aria-live','polite');personal.before(section);
 let activeKey=null,generation=0,stats=null;
 const eligible=()=>!dashboard.hidden&&!admin.hidden;
 const render=()=>{
  section.innerHTML=`<h2 style="font-size:1.1rem;margin:16px 0 8px">${t('סיכום האתר','Site overview')}</h2><div class="stats-grid dashboard-stats" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">${[['users','משתמשים','Users'],['organizations','גמ״חים','Gmachs'],['items','פריטים','Items'],['requests','בקשות השאלה','Loan requests']].map(([key,he,en])=>`<article><div><strong>${new Intl.NumberFormat(document.documentElement.lang==='en'?'en-GB':'he-IL').format(stats[key])}</strong><span>${t(he,en)}</span></div></article>`).join('')}</div>`;
 };
 const update=async()=>{
  if(!eligible()){activeKey=null;generation++;stats=null;section.hidden=true;section.replaceChildren();return;}
  const key=name?.textContent||'admin';section.hidden=false;
  if(activeKey===key){if(stats)render();return;}
  activeKey=key;stats=null;const requestGeneration=++generation;
  section.textContent=t('טוענים את סיכום האתר…','Loading site overview…');
  try{
   const result=await api('/api/admin/overview');
   if(requestGeneration!==generation||!eligible())return;
   const values=result.stats;
   if(!values||['users','organizations','items','requests'].some(k=>!Number.isSafeInteger(values[k])||values[k]<0))throw new Error(t('נתוני הסיכום אינם זמינים כרגע','Overview data is unavailable'));
   stats=values;render();
  }catch(error){if(requestGeneration===generation&&eligible())section.textContent=error.message;}
 };
 const observer=new MutationObserver(update);
 observer.observe(dashboard,{attributes:true,attributeFilter:['hidden']});observer.observe(admin,{attributes:true,attributeFilter:['hidden']});
 if(name)observer.observe(name,{childList:true,characterData:true,subtree:true});
 new MutationObserver(()=>{if(eligible()&&stats)render();}).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 update();
}
installDashboardSummary();
})();
