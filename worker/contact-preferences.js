export const contactSchema=[`CREATE TABLE IF NOT EXISTS organization_contact_preferences (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 show_public INTEGER NOT NULL DEFAULT 0 CHECK(show_public IN (0,1)),
 channels_json TEXT NOT NULL DEFAULT '["phone","address","chat"]',
 preferred TEXT NOT NULL DEFAULT 'chat', email TEXT,
 hours_json TEXT NOT NULL DEFAULT '{}', notes TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
)`];
const ready=new WeakMap();
export async function ensureContactPreferences(env){if(!ready.has(env.DB))ready.set(env.DB,env.DB.batch(contactSchema.map(s=>env.DB.prepare(s))).catch(e=>{ready.delete(env.DB);throw e}));await ready.get(env.DB)}
const methods=['phone','sms','whatsapp','email','address','chat'];
export const defaultContactPreferences=()=>({showPublic:false,channels:['phone','address','chat'],preferred:'chat',email:'',hours:{},notes:''});
function invalid(message){const error=new Error(message);error.status=400;throw error}
function plain(value,max){if(typeof value!=='string'||value.length>max)invalid('פרטי הקשר אינם תקינים');return value.trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')}
export function contactPreferencesInput(value,existing=defaultContactPreferences()){
 if(value===undefined)return existing;
 if(!value||typeof value!=='object'||Array.isArray(value))invalid('הגדרות הקשר אינן תקינות');
 const showPublic=value.showPublic??existing.showPublic;
 if(typeof showPublic!=='boolean')invalid('יש לבחור האם להציג פרטי קשר בעמוד הגמ״ח');
 const channels=value.channels??existing.channels;
 if(!Array.isArray(channels)||channels.some(x=>!methods.includes(x))||new Set(channels).size!==channels.length)invalid('יש לבחור אמצעי קשר תקינים');
 const preferred=value.preferred??existing.preferred;
 if(preferred!==''&&!channels.includes(preferred))invalid('דרך הפנייה המועדפת צריכה להיות אחת מהאפשרויות שנבחרו');
 const email=plain(value.email??existing.email,254);
 if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email))invalid('כתובת האימייל אינה תקינה');
 if(channels.includes('email')&&!email)invalid('יש להזין אימייל כדי להציג כפתור אימייל');
 const hours=value.hours??existing.hours;
 if(!hours||typeof hours!=='object'||Array.isArray(hours)||Object.keys(hours).length>7)invalid('ימי ושעות הפנייה אינם תקינים');
 const cleanHours={};
 for(const [day,range] of Object.entries(hours)){
  if(!/^[0-6]$/.test(day)||!Array.isArray(range)||range.length!==2||range.some(t=>typeof t!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(t))||range[0]>=range[1])invalid('יש לבחור יום וטווח שעות תקין לפנייה');
  cleanHours[day]=[...range];
 }
 return {showPublic,channels:[...channels],preferred,email,hours:cleanHours,notes:plain(value.notes??existing.notes,1000)};
}
export async function getContactPreferences(env,id){
 await ensureContactPreferences(env);
 const row=await env.DB.prepare('SELECT * FROM organization_contact_preferences WHERE organization_id=?').bind(id).first();
 if(!row)return defaultContactPreferences();
 return {showPublic:Boolean(row.show_public),channels:JSON.parse(row.channels_json),preferred:row.preferred,email:row.email||'',hours:JSON.parse(row.hours_json),notes:row.notes||''};
}
export function contactPreferencesStatement(env,id,p){return env.DB.prepare(`INSERT INTO organization_contact_preferences(organization_id,show_public,channels_json,preferred,email,hours_json,notes) VALUES(?,?,?,?,?,?,?)
 ON CONFLICT(organization_id) DO UPDATE SET show_public=excluded.show_public,channels_json=excluded.channels_json,preferred=excluded.preferred,email=excluded.email,hours_json=excluded.hours_json,notes=excluded.notes,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(id,p.showPublic?1:0,JSON.stringify(p.channels),p.preferred,p.email||null,JSON.stringify(p.hours),p.notes)}
export async function contactView(env,id,{approved=false,phone,address,city}={}){
 const settings=await getContactPreferences(env,id),visible=settings.showPublic||approved;
 const data={showPublic:settings.showPublic,channels:settings.channels,preferred:settings.preferred,hours:settings.hours,notes:settings.notes,visible};
 if(!visible)return data;
 const row=await env.DB.prepare('SELECT o.address,o.city,c.contact_phone AS phone FROM organizations o LEFT JOIN organization_contacts c ON c.organization_id=o.id WHERE o.id=? AND o.deleted_at IS NULL').bind(id).first();
 if(!row)return {...data,visible:false};
 if(settings.channels.some(m=>['phone','sms','whatsapp'].includes(m)))data.phone=phone??row.phone;
 if(settings.channels.includes('address')){data.address=address??row.address;data.city=city??row.city;}
 if(settings.channels.includes('email'))data.email=settings.email;
 return data;
}
