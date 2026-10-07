(() => {
  const t=(he,en)=>document.documentElement.lang==='en'?en:he;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const methods=[['phone','📞','התקשרות','Call'],['sms','💬','שליחת SMS','Send SMS'],['whatsapp','🟢','ווטסאפ','WhatsApp'],['email','✉️','אימייל','Email'],['address','📍','ניווט לכתובת','Directions'],['chat','🗨️','צ׳אט באתר','Website chat']];
  const icons={
    phone:'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3.1 5.2 2 2 0 0 1 5.1 3h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L8.6 10.5a16 16 0 0 0 4.9 4.9l1.3-1.3a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.7 2z"/>',
    sms:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a8.5 8.5 0 0 1 19 0z"/><path d="M7 11h.01M12 11h.01M17 11h.01"/>',
    whatsapp:'<path d="M20.1 3.9A10 10 0 0 0 4.3 15.7L3 21l5.4-1.4A10 10 0 0 0 20.1 3.9Z"/><path d="M8.2 7.2c-.8 0-1.4 1-1.1 2.2.7 2.9 3.4 5.6 6.3 6.3 1.2.3 2.2-.3 2.2-1.1l-2.4-1.5-.9.9a9 9 0 0 1-3.3-3.3l.9-.9-1.7-2.6Z"/>',
    email:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',
    address:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/>',
    chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a8.5 8.5 0 0 1 19 0z"/><path d="M7 9h10M7 13h6"/>'
  };
  const icon=key=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${icons[key]}</svg>`;
  const dayHe=['ראשון','שני','שלישי','רביעי','חמישי','שישי','שבת'],dayEn=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const defaultSettings=()=>({showPublic:false,channels:['phone','address','chat'],preferred:'',email:'',hours:{},notes:''});
  function timeOptions(selected){return Array.from({length:96},(_,i)=>{const value=String(Math.floor(i/4)).padStart(2,'0')+':'+String(i%4*15).padStart(2,'0');return `<option value="${value}" ${value===selected?'selected':''}>${value}</option>`;}).join('');}
  function fill(settings=defaultSettings()){
    let section=document.querySelector('#gmach-contact-editor');
    if(!section){section=document.createElement('fieldset');section.id='gmach-contact-editor';document.querySelector('#gmach-consent').closest('label').before(section);}
    section.innerHTML=`<legend>${esc(t('דרכי פנייה ופרטי קשר','Contact preferences'))}</legend>
      <label class="contact-setting-switch"><input id="gmach-contact-public" type="checkbox">${esc(t('הצגת פרטי הקשר בעמוד הגמ״ח לציבור','Show contact details publicly on the gmach page'))}</label>
      <p class="form-note">${esc(t('אם לא מסמנים, פרטי הקשר נחשפים רק לאחר אישור בקשת השאלה או פתיחת צ׳אט.','If unchecked, contact details are revealed only after a borrowing or chat request is approved.'))}</p>
      <p class="contact-choice-title">${esc(t('בחרו באילו דרכים אפשר לפנות לגמ״ח','Choose how people can contact the gmach'))}</p>
      <div class="contact-method-options">${methods.map(([key,,he,en])=>`<label class="contact-method-choice"><input type="checkbox" data-gmach-contact-method="${key}"><span class="contact-method-tile" data-method="${key}"><span class="contact-action-icon">${icon(key)}</span><span>${esc(t(he,en))}</span><span class="contact-choice-check" aria-hidden="true">✓</span></span></label>`).join('')}</div>
      <label id="gmach-contact-email-field">${esc(t('אימייל לפניות לגמ״ח','Gmach contact email'))}<input id="gmach-contact-email" type="email" maxlength="254" autocomplete="email"></label>
      <label class="contact-setting-switch"><input id="gmach-contact-scheduled" type="checkbox">${esc(t('הגדרת ימים ושעות לפנייה','Set contact days and hours'))}</label>
      <div id="gmach-contact-hours"><p class="form-note">${esc(t('בחרו יום ושעות. שינוי שעה מסמן את היום אוטומטית.','Choose days and hours. Changing a time selects its day automatically.'))}</p>${dayHe.map((day,i)=>`<div class="contact-hours-row"><label class="contact-day-label"><input type="checkbox" data-contact-day="${i}"><span>${esc(t(day,dayEn[i]))}</span></label><div class="contact-time-range"><select dir="ltr" data-contact-start="${i}" aria-label="${esc(t('תחילת פניות ביום '+day,'Contact start on '+dayEn[i]))}">${timeOptions('09:00')}</select><span>–</span><select dir="ltr" data-contact-end="${i}" aria-label="${esc(t('סיום פניות ביום '+day,'Contact end on '+dayEn[i]))}">${timeOptions('17:00')}</select></div></div>`).join('')}</div>

      <p class="form-note">${esc(t('שעות הפנייה לפי שעון ישראל. בצ׳אט אפשר להשאיר הודעה בכל שעה שבה האתר פתוח, בהתאם לאישור הבקשה.','Contact hours use Israel time. Messages can be left in an approved chat whenever the website is open.'))}</p>
      <label>${esc(t('הערות נוספות של בעל הגמ״ח','Additional notes from the gmach manager'))}<textarea id="gmach-contact-notes" maxlength="1000" rows="3" placeholder="${esc(t('למשל: נא להתקשר בין 18:00 ל־20:00. עדיף ווטסאפ.','For example: Please call between 18:00 and 20:00. WhatsApp is preferred.'))}"></textarea></label>
      <p class="form-note">${esc(t('ההערות והזמנים מוצגים בעמוד גם כשפרטי הקשר מוסתרים.','Notes and contact hours are shown on the page even when contact details are hidden.'))}</p>`;
    section.querySelector('#gmach-contact-public').checked=settings.showPublic;
    function syncMethods(){const enabled=section.querySelector('[data-gmach-contact-method="email"]').checked;section.querySelector('#gmach-contact-email-field').hidden=!enabled;section.querySelector('#gmach-contact-email').required=enabled;}
    section.querySelectorAll('[data-gmach-contact-method]').forEach(input=>{input.checked=settings.channels.includes(input.dataset.gmachContactMethod);input.onchange=syncMethods;});
    syncMethods();section.querySelector('#gmach-contact-email').value=settings.email||'';
    section.querySelector('#gmach-contact-notes').value=settings.notes||'';
    const scheduled=section.querySelector('#gmach-contact-scheduled');scheduled.checked=Object.keys(settings.hours||{}).length>0;
    function syncHours(){section.querySelector('#gmach-contact-hours').hidden=!scheduled.checked;section.querySelectorAll('[data-contact-day]').forEach(input=>{const day=input.dataset.contactDay;for(const attr of ['start','end'])section.querySelector(`[data-contact-${attr}="${day}"]`).disabled=!scheduled.checked;});}
    for(const [day,range] of Object.entries(settings.hours||{})){section.querySelector(`[data-contact-day="${day}"]`).checked=true;for(const [index,attr] of ['start','end'].entries()){const select=section.querySelector(`[data-contact-${attr}="${day}"]`);if(![...select.options].some(option=>option.value===range[index])){const option=document.createElement('option');option.value=range[index];option.textContent=range[index];select.append(option);}select.value=range[index];}}
    section.querySelectorAll('[data-contact-start],[data-contact-end]').forEach(select=>{select.onchange=()=>{const day=select.dataset.contactStart??select.dataset.contactEnd;section.querySelector(`[data-contact-day="${day}"]`).checked=true;};});

    scheduled.onchange=syncHours;section.querySelectorAll('[data-contact-day]').forEach(input=>input.onchange=syncHours);syncHours();
  }
  function read(){
    const section=document.querySelector('#gmach-contact-editor'),hours={};
    if(section.querySelector('#gmach-contact-scheduled').checked){for(const input of section.querySelectorAll('[data-contact-day]:checked')){const day=input.dataset.contactDay,start=section.querySelector(`[data-contact-start="${day}"]`).value,end=section.querySelector(`[data-contact-end="${day}"]`).value;if(!start||!end||start>=end)throw new Error(t('יש לבחור טווח שעות תקין לפנייה','Choose a valid contact time range'));hours[day]=[start,end];}if(!Object.keys(hours).length)throw new Error(t('יש לבחור לפחות יום אחד לפנייה','Choose at least one contact day'));}
    return {showPublic:section.querySelector('#gmach-contact-public').checked,channels:[...section.querySelectorAll('[data-gmach-contact-method]:checked')].map(i=>i.dataset.gmachContactMethod),preferred:'',email:section.querySelector('#gmach-contact-email').value,hours,notes:section.querySelector('#gmach-contact-notes').value};
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
    const buttons=methods.filter(([key])=>channels.includes(key)&&(key==='chat'||contact.visible&&links[key])).map(([key,,he,en])=>{const content=`<span class="contact-action-icon">${icon(key)}</span><span>${esc(t(he,en))}</span>`,attrs=`class="contact-action" data-method="${key}"`;return key==='chat'?`<button type="button" ${attrs} data-contact-chat>${content}</button>`:`<a ${attrs} href="${esc(links[key])}" ${['whatsapp','address'].includes(key)?'target="_blank" rel="noopener noreferrer"':''}>${content}</a>`;}).join('');
    const hours=Object.entries(contact.hours||{}).sort(([a],[b])=>Number(a)-Number(b));
    return `<h3>${esc(t('פנייה לגמ״ח','Contact the gmach'))}</h3>${contact.notes?`<div class="contact-manager-notes"><strong>${esc(t('הערות בעל הגמ״ח','Manager’s notes'))}</strong><p>${esc(contact.notes)}</p></div>`:''}${hours.length?`<p><strong>${esc(t('ימי ושעות פנייה (שעון ישראל):','Contact hours (Israel time):'))}</strong> ${hours.map(([day,range])=>`${esc(t(dayHe[day],dayEn[day]))} <span dir="ltr">${esc(range.join('–'))}</span>`).join(' · ')}</p>${!isContactTime(contact.hours)?`<p role="status">${esc(t('כעת מחוץ לשעות הפנייה המועדפות.','Currently outside the preferred contact hours.'))}</p>`:''}`:''}${!contact.visible?`<p>${esc(t('פרטי הקשר יוצגו לאחר אישור בקשת השאלה או פתיחת צ׳אט.','Contact details are revealed after a borrowing or chat request is approved.'))}</p>`:''}<div class="gmach-contact-actions">${buttons}</div>${contact.visible&&contact.address?`<p class="contact-detail">${esc([contact.address,contact.city].filter(Boolean).join(', '))}</p>`:''}${channels.includes('chat')?`<p class="form-note">${esc(t('בצ׳אט אפשר להשאיר הודעה בכל שעה שבה האתר פתוח, בהתאם לאישור הבקשה.','Messages can be left in an approved chat whenever the website is open.'))}</p>`:''}`;
  }
  window.GmachContacts={fill,read,markup,isContactTime,defaultSettings};
})();
