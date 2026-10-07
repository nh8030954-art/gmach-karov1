(() => {
  const t=(he,en)=>document.documentElement.lang==='en'?en:he;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const methods=[['phone','📞','התקשרות','Call'],['sms','💬','שליחת SMS','Send SMS'],['whatsapp','🟢','ווטסאפ','WhatsApp'],['email','✉️','אימייל','Email'],['address','📍','ניווט לכתובת','Directions'],['chat','🗨️','צ׳אט באתר','Website chat']];
  const dayHe=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'],dayEn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const defaultSettings=()=>({showPublic:false,channels:['phone','address','chat'],preferred:'chat',email:'',hours:{},notes:''});
  function fill(settings=defaultSettings()){
    let section=document.querySelector('#gmach-contact-editor');
    if(!section){section=document.createElement('fieldset');section.id='gmach-contact-editor';document.querySelector('#gmach-consent').closest('label').before(section);}
    section.innerHTML=`<legend>${esc(t('דרכי פנייה ופרטי קשר','Contact preferences'))}</legend>
      <label class="check"><input id="gmach-contact-public" type="checkbox">${esc(t('הצגת פרטי הקשר בעמוד הגמ״ח לציבור','Show contact details publicly on the gmach page'))}</label>
      <p class="form-note">${esc(t('אם לא מסמנים, פרטי הקשר נחשפים רק לאחר אישור בקשת השאלה או פתיחת צ׳אט.','If unchecked, contact details are revealed only after a borrowing or chat request is approved.'))}</p>
      <div class="contact-method-options">${methods.map(([key,icon,he,en])=>`<label class="check"><input type="checkbox" data-gmach-contact-method="${key}">${icon} ${esc(t(he,en))}</label>`).join('')}</div>
      <label>${esc(t('דרך פנייה מועדפת','Preferred contact method'))}<select id="gmach-contact-preferred"></select></label>
      <label>${esc(t('אימייל לפניות לגמ״ח','Gmach contact email'))}<input id="gmach-contact-email" type="email" maxlength="254" autocomplete="email"></label>
      <label class="check"><input id="gmach-contact-scheduled" type="checkbox">${esc(t('הגדרת ימים ושעות לפנייה','Set contact days and hours'))}</label>
      <div id="gmach-contact-hours">${dayHe.map((day,i)=>`<label class="contact-hours-row"><input type="checkbox" data-contact-day="${i}"><span>${esc(t(day,dayEn[i]))}</span><input type="time" data-contact-start="${i}" value="09:00" aria-label="${esc(t('תחילת פניות ביום '+day,'Contact start on '+dayEn[i]))}"><span>–</span><input type="time" data-contact-end="${i}" value="17:00" aria-label="${esc(t('סיום פניות ביום '+day,'Contact end on '+dayEn[i]))}"></label>`).join('')}</div>
      <p class="form-note">${esc(t('שעות הפנייה לפי שעון ישראל. בצ׳אט אפשר להשאיר הודעה בכל שעה שבה האתר פתוח, בהתאם לאישור הבקשה.','Contact hours use Israel time. Messages can be left in an approved chat whenever the website is open.'))}</p>
      <label>${esc(t('הערות נוספות של בעל הגמ״ח','Additional notes from the gmach manager'))}<textarea id="gmach-contact-notes" maxlength="1000" rows="3" placeholder="${esc(t('למשל: נא להתקשר בין 18:00 ל־20:00. עדיף ווטסאפ.','For example: Please call between 18:00 and 20:00. WhatsApp is preferred.'))}"></textarea></label>
      <p class="form-note">${esc(t('ההערות והזמנים מוצגים בעמוד גם כשפרטי הקשר מוסתרים.','Notes and contact hours are shown on the page even when contact details are hidden.'))}</p>`;
    section.querySelector('#gmach-contact-public').checked=settings.showPublic;
    section.querySelectorAll('[data-gmach-contact-method]').forEach(input=>{input.checked=settings.channels.includes(input.dataset.gmachContactMethod);input.onchange=()=>syncPreferred();});
    function syncPreferred(value=section.querySelector('#gmach-contact-preferred').value){const select=section.querySelector('#gmach-contact-preferred');select.innerHTML=`<option value="">${esc(t('ללא העדפה','No preference'))}</option>`+methods.filter(([key])=>section.querySelector(`[data-gmach-contact-method="${key}"]`).checked).map(([key,,he,en])=>`<option value="${key}">${esc(t(he,en))}</option>`).join('');select.value=[...select.options].some(o=>o.value===value)?value:'';section.querySelector('#gmach-contact-email').required=section.querySelector('[data-gmach-contact-method="email"]').checked;}
    syncPreferred(settings.preferred);section.querySelector('#gmach-contact-email').value=settings.email||'';
    section.querySelector('#gmach-contact-notes').value=settings.notes||'';
    const scheduled=section.querySelector('#gmach-contact-scheduled');scheduled.checked=Object.keys(settings.hours||{}).length>0;
    function syncHours(){section.querySelector('#gmach-contact-hours').hidden=!scheduled.checked;section.querySelectorAll('[data-contact-day]').forEach(input=>{const day=input.dataset.contactDay;for(const attr of ['start','end'])section.querySelector(`[data-contact-${attr}="${day}"]`).disabled=!scheduled.checked||!input.checked;});}
    for(const [day,range] of Object.entries(settings.hours||{})){section.querySelector(`[data-contact-day="${day}"]`).checked=true;section.querySelector(`[data-contact-start="${day}"]`).value=range[0];section.querySelector(`[data-contact-end="${day}"]`).value=range[1];}
    scheduled.onchange=syncHours;section.querySelectorAll('[data-contact-day]').forEach(input=>input.onchange=syncHours);syncHours();
  }
  function read(){
    const section=document.querySelector('#gmach-contact-editor'),hours={};
    if(section.querySelector('#gmach-contact-scheduled').checked){for(const input of section.querySelectorAll('[data-contact-day]:checked')){const day=input.dataset.contactDay,start=section.querySelector(`[data-contact-start="${day}"]`).value,end=section.querySelector(`[data-contact-end="${day}"]`).value;if(!start||!end||start>=end)throw new Error(t('יש לבחור טווח שעות תקין לפנייה','Choose a valid contact time range'));hours[day]=[start,end];}if(!Object.keys(hours).length)throw new Error(t('יש לבחור לפחות יום אחד לפנייה','Choose at least one contact day'));}
    return {showPublic:section.querySelector('#gmach-contact-public').checked,channels:[...section.querySelectorAll('[data-gmach-contact-method]:checked')].map(i=>i.dataset.gmachContactMethod),preferred:section.querySelector('#gmach-contact-preferred').value,email:section.querySelector('#gmach-contact-email').value,hours,notes:section.querySelector('#gmach-contact-notes').value};
  }
  function isContactTime(hours,now=new Date()){
    if(!Object.keys(hours||{}).length)return true;
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',weekday:'long',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
    const day=dayEn.indexOf(parts.weekday),range=hours[day],time=parts.hour+':'+parts.minute;
    return Boolean(range&&time>=range[0]&&time<range[1]);
  }
  function markup(contact){
    if(!contact)return '';
    const channels=contact.channels||[],number=String(contact.phone||'').replace(/[^+\d]/g,''),digits=number.replace(/\D/g,''),international=digits.startsWith('0')?'972'+digits.slice(1):digits;
    const dial=digits.startsWith('0')?'+972'+digits.slice(1):digits.startsWith('972')?'+'+digits:number;
    const links={phone:number?'tel:'+dial:null,sms:number?'sms:'+dial:null,whatsapp:digits?'https://wa.me/'+international:null,email:contact.email?'mailto:'+encodeURIComponent(contact.email):null,address:contact.address?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([contact.address,contact.city].filter(Boolean).join(', ')):null};
    const preferred=t('מועדף','Preferred');
    const buttons=methods.filter(([key])=>channels.includes(key)&&(key==='chat'||contact.visible&&links[key])).sort(([a],[b])=>Number(b===contact.preferred)-Number(a===contact.preferred)).map(([key,icon,he,en])=>{const label=icon+' '+t(he,en)+(key===contact.preferred?' · '+preferred:''),className='button '+(key===contact.preferred?'button-primary':'button-secondary');return key==='chat'?`<button type="button" class="${className}" data-contact-chat>${esc(label)}</button>`:`<a class="${className}" href="${esc(links[key])}" ${['whatsapp','address'].includes(key)?'target="_blank" rel="noopener noreferrer"':''}>${esc(label)}</a>`;}).join('');
    const hours=Object.entries(contact.hours||{}).sort(([a],[b])=>Number(a)-Number(b));
    return `<h3>${esc(t('פנייה לגמ״ח','Contact the gmach'))}</h3>${contact.notes?`<div class="contact-manager-notes"><strong>${esc(t('הערות בעל הגמ״ח','Manager’s notes'))}</strong><p>${esc(contact.notes)}</p></div>`:''}${hours.length?`<p><strong>${esc(t('ימי ושעות פנייה (שעון ישראל):','Contact hours (Israel time):'))}</strong> ${hours.map(([day,range])=>`${esc(t(dayHe[day],dayEn[day]))} <span dir="ltr">${esc(range.join('–'))}</span>`).join(' · ')}</p>${!isContactTime(contact.hours)?`<p role="status">${esc(t('כעת מחוץ לשעות הפנייה המועדפות.','Currently outside the preferred contact hours.'))}</p>`:''}`:''}${!contact.visible?`<p>${esc(t('פרטי הקשר יוצגו לאחר אישור בקשת השאלה או פתיחת צ׳אט.','Contact details are revealed after a borrowing or chat request is approved.'))}</p>`:''}<div class="dashboard-row-actions">${buttons}</div>${contact.visible&&contact.address?`<p class="contact-detail">${esc([contact.address,contact.city].filter(Boolean).join(', '))}</p>`:''}${channels.includes('chat')?`<p class="form-note">${esc(t('בצ׳אט אפשר להשאיר הודעה בכל שעה שבה האתר פתוח, בהתאם לאישור הבקשה.','Messages can be left in an approved chat whenever the website is open.'))}</p>`:''}`;
  }
  window.GmachContacts={fill,read,markup,isContactTime,defaultSettings};
})();
