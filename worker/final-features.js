const SESSION_COOKIE="gmach_session";
class FinalError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
const ALTER_SPECS=[{"table":"audit_log","column":"branch_id","sql":"ALTER TABLE audit_log ADD COLUMN branch_id TEXT"},{"table":"audit_log","column":"old_value_json","sql":"ALTER TABLE audit_log ADD COLUMN old_value_json TEXT"},{"table":"audit_log","column":"new_value_json","sql":"ALTER TABLE audit_log ADD COLUMN new_value_json TEXT"},{"table":"audit_log","column":"ip_hash","sql":"ALTER TABLE audit_log ADD COLUMN ip_hash TEXT"},{"table":"audit_log","column":"device_label","sql":"ALTER TABLE audit_log ADD COLUMN device_label TEXT"},{"table":"reviews","column":"branch_id","sql":"ALTER TABLE reviews ADD COLUMN branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL"},{"table":"reviews","column":"edited_until","sql":"ALTER TABLE reviews ADD COLUMN edited_until TEXT"},{"table":"reviews","column":"organization_response","sql":"ALTER TABLE reviews ADD COLUMN organization_response TEXT"},{"table":"reviews","column":"organization_response_at","sql":"ALTER TABLE reviews ADD COLUMN organization_response_at TEXT"},{"table":"items","column":"waitlist_response_minutes","sql":"ALTER TABLE items ADD COLUMN waitlist_response_minutes INTEGER NOT NULL DEFAULT 120 CHECK(waitlist_response_minutes BETWEEN 15 AND 10080)"},{"table":"items","column":"waitlist_near_response_minutes","sql":"ALTER TABLE items ADD COLUMN waitlist_near_response_minutes INTEGER NOT NULL DEFAULT 30 CHECK(waitlist_near_response_minutes BETWEEN 15 AND 10080)"},{"table":"items","column":"recurring_allowed","sql":"ALTER TABLE items ADD COLUMN recurring_allowed INTEGER NOT NULL DEFAULT 0 CHECK(recurring_allowed IN (0,1))"},{"table":"items","column":"public_slug","sql":"ALTER TABLE items ADD COLUMN public_slug TEXT"},{"table":"organizations","column":"public_slug","sql":"ALTER TABLE organizations ADD COLUMN public_slug TEXT"},{"table":"organizations","column":"onboarding_completed","sql":"ALTER TABLE organizations ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0 CHECK(onboarding_completed IN (0,1))"}];
const CREATE_SPECS=["CREATE TABLE IF NOT EXISTS user_tours (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  tour_key TEXT NOT NULL,\n  completed_at TEXT,\n  dismissed_at TEXT,\n  last_step INTEGER NOT NULL DEFAULT 0,\n  PRIMARY KEY(user_id,tour_key)\n)","CREATE TABLE IF NOT EXISTS organization_drafts (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,\n  step INTEGER NOT NULL DEFAULT 1 CHECK(step BETWEEN 1 AND 10),\n  payload_json TEXT NOT NULL DEFAULT '{}',\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS organization_onboarding (\n  organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,\n  first_item_added INTEGER NOT NULL DEFAULT 0 CHECK(first_item_added IN (0,1)),\n  management_tour_done INTEGER NOT NULL DEFAULT 0 CHECK(management_tour_done IN (0,1)),\n  preview_seen INTEGER NOT NULL DEFAULT 0 CHECK(preview_seen IN (0,1)),\n  tips_dismissed INTEGER NOT NULL DEFAULT 0 CHECK(tips_dismissed IN (0,1)),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS branch_inventory_policies (\n  branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  mode TEXT NOT NULL DEFAULT 'inherit' CHECK(mode IN ('inherit','separate','shared')),\n  quantity_override INTEGER CHECK(quantity_override IS NULL OR quantity_override BETWEEN 0 AND 999),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY(branch_id,item_id)\n)","CREATE TABLE IF NOT EXISTS pickup_branch_proposals (\n  id TEXT PRIMARY KEY,\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,\n  to_branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,\n  proposed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','expired')),\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  responded_at TEXT\n)","CREATE TABLE IF NOT EXISTS unit_events (\n  id TEXT PRIMARY KEY,\n  unit_id TEXT NOT NULL REFERENCES item_units(id) ON DELETE CASCADE,\n  actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  event_type TEXT NOT NULL,\n  note TEXT,\n  metadata_json TEXT NOT NULL DEFAULT '{}',\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS bulk_inventory_jobs (\n  id TEXT PRIMARY KEY,\n  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,\n  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  action TEXT NOT NULL CHECK(action IN ('activate','deactivate','category','availability','quantity','transfer','qr_export')),\n  payload_json TEXT NOT NULL DEFAULT '{}',\n  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('pending','running','completed','failed')),\n  affected_count INTEGER NOT NULL DEFAULT 0,\n  error TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  completed_at TEXT\n)","CREATE TABLE IF NOT EXISTS item_change_confirmations (\n  id TEXT PRIMARY KEY,\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  request_id TEXT NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,\n  borrower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  summary TEXT NOT NULL,\n  old_value_json TEXT NOT NULL DEFAULT '{}',\n  new_value_json TEXT NOT NULL DEFAULT '{}',\n  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','expired')),\n  expires_at TEXT NOT NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  responded_at TEXT,\n  UNIQUE(item_id,request_id,status)\n)","CREATE TABLE IF NOT EXISTS recurring_loan_rules (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,\n  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 999),\n  starts_at TEXT NOT NULL,\n  duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 30 AND 525600),\n  frequency TEXT NOT NULL CHECK(frequency IN ('weekly','biweekly','monthly')),\n  occurrences INTEGER NOT NULL CHECK(occurrences BETWEEN 2 AND 52),\n  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','paused','cancelled','completed')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS saved_entities (\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  entity_type TEXT NOT NULL CHECK(entity_type IN ('item','organization','category','help_request','search')),\n  entity_id TEXT NOT NULL,\n  notify INTEGER NOT NULL DEFAULT 1 CHECK(notify IN (0,1)),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY(user_id,entity_type,entity_id)\n)","CREATE TABLE IF NOT EXISTS search_suggestion_events (\n  id TEXT PRIMARY KEY,\n  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,\n  query TEXT NOT NULL,\n  corrected_query TEXT,\n  result_count INTEGER NOT NULL DEFAULT 0,\n  city TEXT,\n  source TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS community_match_events (\n  id TEXT PRIMARY KEY,\n  help_request_id TEXT NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,\n  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,\n  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,\n  score REAL NOT NULL DEFAULT 0,\n  notified_at TEXT,\n  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','notified','offered','selected','dismissed')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS notification_outbox (\n  id TEXT PRIMARY KEY,\n  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,\n  channel TEXT NOT NULL CHECK(channel IN ('in_app','email','push')),\n  event_type TEXT NOT NULL,\n  subject TEXT,\n  body TEXT NOT NULL,\n  payload_json TEXT NOT NULL DEFAULT '{}',\n  scheduled_at TEXT NOT NULL,\n  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped')),\n  attempts INTEGER NOT NULL DEFAULT 0,\n  last_error TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  sent_at TEXT\n)","CREATE TABLE IF NOT EXISTS notification_digests (\n  id TEXT PRIMARY KEY,\n  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,\n  digest_date TEXT NOT NULL,\n  payload_json TEXT NOT NULL DEFAULT '{}',\n  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  sent_at TEXT,\n  UNIQUE(user_id,digest_date)\n)","CREATE TABLE IF NOT EXISTS email_templates (\n  template_key TEXT NOT NULL,\n  language TEXT NOT NULL CHECK(language IN ('he','en')),\n  subject TEXT NOT NULL,\n  body_text TEXT NOT NULL,\n  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),\n  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  PRIMARY KEY(template_key,language)\n)","CREATE TABLE IF NOT EXISTS holiday_rules (\n  id TEXT PRIMARY KEY,\n  hebrew_month TEXT NOT NULL,\n  hebrew_day INTEGER NOT NULL CHECK(hebrew_day BETWEEN 1 AND 30),\n  duration_days INTEGER NOT NULL DEFAULT 1 CHECK(duration_days BETWEEN 1 AND 8),\n  title_he TEXT NOT NULL,\n  title_en TEXT,\n  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),\n  message_he TEXT,\n  message_en TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS moderation_jobs (\n  id TEXT PRIMARY KEY,\n  entity_type TEXT NOT NULL CHECK(entity_type IN ('item_image','chat_image','review','message','organization')),\n  entity_id TEXT NOT NULL,\n  reason TEXT,\n  severity TEXT NOT NULL DEFAULT 'normal' CHECK(severity IN ('normal','high','critical')),\n  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','hidden','cleared')),\n  auto_hidden INTEGER NOT NULL DEFAULT 0 CHECK(auto_hidden IN (0,1)),\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  reviewed_at TEXT,\n  reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL\n)","CREATE TABLE IF NOT EXISTS faq_articles (\n  id TEXT PRIMARY KEY,\n  slug TEXT NOT NULL UNIQUE,\n  title_he TEXT NOT NULL,\n  title_en TEXT,\n  body_he TEXT NOT NULL,\n  body_en TEXT,\n  keywords_json TEXT NOT NULL DEFAULT '[]',\n  sort_order INTEGER NOT NULL DEFAULT 0,\n  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),\n  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS page_versions (\n  id TEXT PRIMARY KEY,\n  content_key TEXT NOT NULL,\n  language TEXT NOT NULL CHECK(language IN ('he','en')),\n  version INTEGER NOT NULL,\n  content TEXT NOT NULL,\n  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),\n  UNIQUE(content_key,language,version)\n)","CREATE TABLE IF NOT EXISTS performance_events (\n  id TEXT PRIMARY KEY,\n  path TEXT,\n  metric TEXT NOT NULL,\n  value REAL NOT NULL,\n  user_agent_hash TEXT,\n  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))\n)","CREATE TABLE IF NOT EXISTS backup_objects (\n  backup_run_id TEXT NOT NULL REFERENCES backup_runs(id) ON DELETE CASCADE,\n  storage_key TEXT NOT NULL,\n  object_type TEXT NOT NULL,\n  size_bytes INTEGER,\n  checksum TEXT,\n  PRIMARY KEY(backup_run_id,storage_key)\n)","CREATE TABLE IF NOT EXISTS restore_drills (\n  id TEXT PRIMARY KEY,\n  backup_run_id TEXT REFERENCES backup_runs(id) ON DELETE SET NULL,\n  status TEXT NOT NULL CHECK(status IN ('running','success','failed')),\n  notes TEXT,\n  started_at TEXT NOT NULL,\n  finished_at TEXT\n)","CREATE INDEX IF NOT EXISTS organization_drafts_user_idx ON organization_drafts(user_id,updated_at DESC)","CREATE INDEX IF NOT EXISTS unit_events_unit_idx ON unit_events(unit_id,created_at DESC)","CREATE INDEX IF NOT EXISTS item_change_confirmations_borrower_idx ON item_change_confirmations(borrower_id,status,expires_at)","CREATE INDEX IF NOT EXISTS saved_entities_user_idx ON saved_entities(user_id,entity_type,created_at DESC)","CREATE INDEX IF NOT EXISTS community_match_help_idx ON community_match_events(help_request_id,status,score DESC)","CREATE INDEX IF NOT EXISTS notification_outbox_due_idx ON notification_outbox(status,scheduled_at)","CREATE INDEX IF NOT EXISTS moderation_jobs_status_idx ON moderation_jobs(status,severity,created_at)","CREATE INDEX IF NOT EXISTS performance_events_metric_idx ON performance_events(metric,created_at DESC)"];
const SEED_SPECS=["INSERT OR IGNORE INTO holiday_rules(id,hebrew_month,hebrew_day,duration_days,title_he,title_en,message_he,message_en) VALUES\n('rosh-hashana','Tishri',1,2,'ראש השנה','Rosh Hashanah','האתר סגור לכבוד ראש השנה וייפתח בצאת החג.','The site is closed for Rosh Hashanah and will reopen after the holiday.'),\n('yom-kippur','Tishri',10,1,'יום כיפור','Yom Kippur','האתר סגור לכבוד יום כיפור וייפתח בצאת הצום.','The site is closed for Yom Kippur and will reopen after the fast.'),\n('sukkot-first','Tishri',15,1,'סוכות','Sukkot','האתר סגור לכבוד חג הסוכות.','The site is closed for Sukkot.'),\n('shemini-atzeret','Tishri',22,1,'שמיני עצרת ושמחת תורה','Shemini Atzeret','האתר סגור לכבוד החג.','The site is closed for the holiday.'),\n('pesach-first','Nisan',15,1,'פסח','Passover','האתר סגור לכבוד חג הפסח.','The site is closed for Passover.'),\n('pesach-last','Nisan',21,1,'שביעי של פסח','Seventh Day of Passover','האתר סגור לכבוד שביעי של פסח.','The site is closed for the Seventh Day of Passover.'),\n('shavuot','Sivan',6,1,'שבועות','Shavuot','האתר סגור לכבוד חג השבועות.','The site is closed for Shavuot.')","INSERT OR IGNORE INTO email_templates(template_key,language,subject,body_text) VALUES\n('new_device','he','כניסה ממכשיר חדש','זוהתה כניסה ממכשיר חדש לחשבון שלך. אם זו לא הייתה כניסה שלך, יש להחליף סיסמה ולנתק מכשירים.'),\n('new_device','en','New device sign-in','A new device signed in to your account. If this was not you, change your password and revoke devices.'),\n('pickup_confirmed','he','מועד האיסוף אושר','מועד האיסוף אושר. פרטי ההשאלה זמינים באזור האישי.'),\n('pickup_confirmed','en','Pickup confirmed','Your pickup time was confirmed. Loan details are available in your account.'),\n('loan_cancelled','he','ההשאלה בוטלה','ההשאלה בוטלה והמלאי שוחרר.'),\n('loan_cancelled','en','Loan cancelled','The loan was cancelled and inventory was released.'),\n('extension','he','עדכון בקשת הארכה','יש עדכון חדש בבקשת ההארכה שלך.'),\n('extension','en','Extension update','There is a new update to your extension request.'),\n('waitlist','he','מוצר התפנה עבורך','מוצר ברשימת ההמתנה התפנה עבורך לזמן מוגבל.'),\n('waitlist','en','An item is available for you','A waitlisted item is available for you for a limited time.'),\n('support','he','עדכון בפניית התמיכה','יש עדכון חדש בפניית התמיכה שלך.'),\n('support','en','Support ticket update','There is a new update to your support ticket.')","INSERT OR IGNORE INTO faq_articles(id,slug,title_he,title_en,body_he,body_en,keywords_json,sort_order) VALUES\n('faq-search','search','איך מחפשים מוצר?','How do I find an item?','מקלידים מה צריכים, בוחרים אזור ותאריך ומסננים לפי זמינות ומרחק.','Enter what you need, choose an area and dates, then filter by availability and distance.','[\"חיפוש\",\"מוצר\",\"מרחק\",\"זמינות\"]',10),\n('faq-loan','loan','איך מבקשים השאלה?','How do I request a loan?','בעמוד המוצר בוחרים תאריכים, שעות וכמות ושולחים בקשה. המלאי נשמר בהתאם לכללי המוצר.','On the item page choose dates, times and quantity and submit a request. Inventory is held according to item rules.','[\"השאלה\",\"בקשה\",\"איסוף\"]',20),\n('faq-return','return','איך מחזירים מוצר?','How do I return an item?','מתאמים החזרה בצ׳אט או לפי הוראות הגמ״ח, ובסיום מנהל מורשה מסמן את היחידות כהוחזרו.','Coordinate the return in chat or according to the gmach instructions; an authorized manager marks units returned.','[\"החזרה\",\"איחור\"]',30),\n('faq-support','support','מתי פונים לתמיכה?','When should I contact support?','כאשר לא ניתן לפתור בעיה מול הצד השני או כשיש בעיית חשבון, אבטחה או תקלה טכנית.','Contact support when an issue cannot be resolved with the other party, or for account, security or technical problems.','[\"תמיכה\",\"חשבון\",\"אבטחה\"]',40)"];
let schemaPromise=null;

async function ensureFinalSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const cache=new Map();
    for(const spec of ALTER_SPECS){
      if(!cache.has(spec.table)){
        const r=await env.DB.prepare(`PRAGMA table_info(${spec.table})`).all();
        cache.set(spec.table,new Set((r.results||[]).map(x=>x.name)));
      }
      if(!cache.get(spec.table).has(spec.column)){
        await env.DB.prepare(spec.sql).run();
        cache.get(spec.table).add(spec.column);
      }
    }
    for(const sql of CREATE_SPECS)await env.DB.prepare(sql).run();
    for(const sql of SEED_SPECS)await env.DB.prepare(sql).run();
    return true;
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}
function cookie(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const [k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return""}
function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function hash(v){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v)))))}
async function body(request){try{return await request.json()}catch{throw new FinalError(400,"גוף הבקשה אינו תקין")}}
function clean(v,min=0,max=500,label="ערך"){const s=String(v??"").trim();if(s.length<min||s.length>max)throw new FinalError(400,`${label} אינו תקין`);return s}
function optional(v,max=1000){const s=String(v??"").trim();if(!s)return null;if(s.length>max)throw new FinalError(400,"הטקסט ארוך מדי");return s}
function safeJson(v,f={}){try{const x=JSON.parse(v||"");return x&&typeof x==="object"?x:f}catch{return f}}
async function currentUser(request,env){
  const token=cookie(request,SESSION_COOKIE);if(!token)return null;
  return await env.DB.prepare(`SELECT u.*,s.token_hash AS current_session_hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`).bind(await hash(token),new Date().toISOString()).first();
}
async function requireUser(request,env){const u=await currentUser(request,env);if(!u)throw new FinalError(401,"יש להתחבר כדי להמשיך");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new FinalError(403,"נדרשת הרשאת מנהל");return u}
async function orgAccess(request,env,orgId,allowed=["owner","requests","inventory","reports"]){
  const u=await requireUser(request,env);if(u.role==="admin")return{user:u,role:"admin"};
  const org=await env.DB.prepare("SELECT owner_id FROM organizations WHERE id=? AND deleted_at IS NULL").bind(orgId).first();
  if(!org)throw new FinalError(404,"הגמ״ח לא נמצא");
  if(org.owner_id===u.id)return{user:u,role:"owner"};
  const m=await env.DB.prepare("SELECT * FROM organization_members WHERE organization_id=? AND user_id=? AND (expires_at IS NULL OR expires_at>?)").bind(orgId,u.id,new Date().toISOString()).first();
  if(!m||!allowed.includes(m.role))throw new FinalError(403,"אין הרשאה לפעולה");
  return{user:u,role:m.role,member:m};
}
async function requestAccess(request,env,id){
  const u=await requireUser(request,env);
  const r=await env.DB.prepare(`SELECT lr.*,i.organization_id,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`).bind(id).first();
  if(!r)throw new FinalError(404,"הבקשה לא נמצאה");
  if(u.role!=="admin"&&u.id!==r.borrower_id&&u.id!==r.owner_id){
    const m=await env.DB.prepare("SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?").bind(r.organization_id,u.id).first();
    if(!m)throw new FinalError(403,"אין הרשאה");
  }
  return{user:u,row:r};
}
async function audit(env,user,action,type,id,meta={},oldValue=null,newValue=null,branchId=null,request=null){
  let ipHash=null;if(request){const ip=request.headers.get("CF-Connecting-IP");if(ip)ipHash=await hash(ip)}
  await env.DB.prepare(`INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json,branch_id,old_value_json,new_value_json,ip_hash,device_label)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),user?.id||null,action,type,id||null,JSON.stringify(meta||{}),branchId,oldValue?JSON.stringify(oldValue):null,newValue?JSON.stringify(newValue):null,ipHash,request?String(request.headers.get("User-Agent")||"").slice(0,180):null).run();
}
async function tour(request,env,key){
  const u=await requireUser(request,env);
  if(request.method==="GET"){
    const r=await env.DB.prepare("SELECT * FROM user_tours WHERE user_id=? AND tour_key=?").bind(u.id,key).first();
    return json({tour:r||{tour_key:key,last_step:0,completed_at:null,dismissed_at:null}});
  }
  const b=await body(request),now=new Date().toISOString();
  const completed=b.completed===true?now:null,dismissed=b.dismissed===true?now:null,step=Math.max(0,Math.min(99,Number(b.step)||0));
  await env.DB.prepare(`INSERT INTO user_tours(user_id,tour_key,last_step,completed_at,dismissed_at) VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,tour_key) DO UPDATE SET last_step=excluded.last_step,completed_at=COALESCE(excluded.completed_at,user_tours.completed_at),dismissed_at=COALESCE(excluded.dismissed_at,user_tours.dismissed_at)`)
    .bind(u.id,key,step,completed,dismissed).run();
  if(key==="dashboard"&&(completed||dismissed))await env.DB.prepare("UPDATE users SET tour_completed=1,updated_at=? WHERE id=?").bind(now,u.id).run();
  return json({ok:true,step,completed:Boolean(completed),dismissed:Boolean(dismissed)});
}
async function drafts(request,env,id=null){
  const u=await requireUser(request,env);
  if(request.method==="GET"){
    const rows=await env.DB.prepare("SELECT * FROM organization_drafts WHERE user_id=? ORDER BY updated_at DESC").bind(u.id).all();
    return json({drafts:rows.results.map(x=>({...x,payload:safeJson(x.payload_json,{})}))});
  }
  if(request.method==="DELETE"){
    await env.DB.prepare("DELETE FROM organization_drafts WHERE id=? AND user_id=?").bind(id,u.id).run();return json({ok:true});
  }
  const b=await body(request),payload=b.payload&&typeof b.payload==="object"?b.payload:{},step=Math.max(1,Math.min(10,Number(b.step)||1)),now=new Date().toISOString();
  if(id){
    const found=await env.DB.prepare("SELECT 1 FROM organization_drafts WHERE id=? AND user_id=?").bind(id,u.id).first();if(!found)throw new FinalError(404,"הטיוטה לא נמצאה");
    await env.DB.prepare("UPDATE organization_drafts SET step=?,payload_json=?,updated_at=? WHERE id=? AND user_id=?").bind(step,JSON.stringify(payload),now,id,u.id).run();
  }else{
    id=crypto.randomUUID();
    await env.DB.prepare("INSERT INTO organization_drafts(id,user_id,step,payload_json) VALUES(?,?,?,?)").bind(id,u.id,step,JSON.stringify(payload)).run();
  }
  return json({draft:{id,step,payload}});
}
async function publishReadiness(request,env,orgId){
  await orgAccess(request,env,orgId);
  const org=await env.DB.prepare("SELECT id,name,description,city,address,phone,organization_type,temporarily_closed,deletion_requested_at FROM organizations WHERE id=?").bind(orgId).first();
  if(!org)throw new FinalError(404,"הגמ״ח לא נמצא");
  const active=await env.DB.prepare("SELECT COUNT(*) AS count FROM items WHERE organization_id=? AND status='active' AND deleted_at IS NULL AND (publish_at IS NULL OR publish_at<=?)").bind(orgId,new Date().toISOString()).first();
  const branches=await env.DB.prepare("SELECT COUNT(*) AS count FROM organization_branches WHERE organization_id=? AND status!='archived'").bind(orgId).first();
  const cats=await env.DB.prepare("SELECT COUNT(*) AS count FROM organization_categories WHERE organization_id=?").bind(orgId).first();
  const missing=[];for(const f of ["name","description","city","address","phone"])if(!org[f])missing.push(f);
  if(!Number(cats?.count||0))missing.push("category");
  if(!Number(active?.count||0))missing.push("first_active_item");
  const ready=!missing.length&&!org.deletion_requested_at;
  return json({ready,missing,activeItems:Number(active?.count||0),branches:Number(branches?.count||0),publiclyVisible:ready&&!org.temporarily_closed});
}
async function entityCategories(request,env,type,id){
  const table=type==="organization"?"organization_categories":"item_categories",idCol=type==="organization"?"organization_id":"item_id";
  if(type==="organization")await orgAccess(request,env,id);else{
    const it=await env.DB.prepare("SELECT organization_id FROM items WHERE id=?").bind(id).first();if(!it)throw new FinalError(404,"המוצר לא נמצא");await orgAccess(request,env,it.organization_id);
  }
  if(request.method==="GET"){
    const rows=await env.DB.prepare(`SELECT c.* FROM ${table} x JOIN categories c ON c.id=x.category_id WHERE x.${idCol}=? ORDER BY c.sort_order,c.name_he`).bind(id).all();
    return json({categories:rows.results});
  }
  const b=await body(request),ids=[...new Set(Array.isArray(b.categoryIds)?b.categoryIds.map(String):[])].slice(0,20);
  if(!ids.length)throw new FinalError(400,"יש לבחור לפחות קטגוריה אחת");
  await env.DB.prepare(`DELETE FROM ${table} WHERE ${idCol}=?`).bind(id).run();
  for(const cat of ids){
    const exists=await env.DB.prepare("SELECT 1 FROM categories WHERE id=? AND status='active'").bind(cat).first();if(exists)await env.DB.prepare(`INSERT INTO ${table}(${idCol},category_id) VALUES(?,?)`).bind(id,cat).run();
  }
  return json({ok:true,categoryIds:ids});
}
async function branchPolicies(request,env,branchId){
  const branch=await env.DB.prepare("SELECT organization_id FROM organization_branches WHERE id=?").bind(branchId).first();if(!branch)throw new FinalError(404,"הסניף לא נמצא");
  await orgAccess(request,env,branch.organization_id,["owner","inventory"]);
  if(request.method==="GET"){
    const rows=await env.DB.prepare("SELECT * FROM branch_inventory_policies WHERE branch_id=?").bind(branchId).all();return json({policies:rows.results});
  }
  const b=await body(request);if(!Array.isArray(b.policies))throw new FinalError(400,"policies נדרש");
  for(const p of b.policies.slice(0,300)){
    const mode=["inherit","separate","shared"].includes(p.mode)?p.mode:"inherit",qty=p.quantityOverride==null?null:Math.max(0,Math.min(999,Number(p.quantityOverride)||0));
    await env.DB.prepare(`INSERT INTO branch_inventory_policies(branch_id,item_id,mode,quantity_override,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(branch_id,item_id) DO UPDATE SET mode=excluded.mode,quantity_override=excluded.quantity_override,updated_at=excluded.updated_at`)
      .bind(branchId,clean(p.itemId,1,100,"מוצר"),mode,qty,new Date().toISOString()).run();
  }
  return json({ok:true});
}
async function proposeBranch(request,env,requestId){
  const {user,row}=await requestAccess(request,env,requestId),b=await body(request),to=clean(b.toBranchId,1,100,"סניף");
  const branch=await env.DB.prepare("SELECT id,organization_id FROM organization_branches WHERE id=? AND organization_id=? AND status='active'").bind(to,row.organization_id).first();
  if(!branch)throw new FinalError(404,"סניף חלופי לא נמצא");
  const id=crypto.randomUUID(),expires=new Date(Date.now()+24*3600000).toISOString();
  await env.DB.prepare("INSERT INTO pickup_branch_proposals(id,request_id,from_branch_id,to_branch_id,proposed_by,expires_at) VALUES(?,?,?,?,?,?)").bind(id,requestId,row.branch_id||null,to,user.id,expires).run();
  return json({proposal:{id,expiresAt:expires}},201);
}
async function respondBranch(request,env,id){
  const u=await requireUser(request,env),b=await body(request),p=await env.DB.prepare(`SELECT p.*,lr.borrower_id,i.organization_id,o.owner_id FROM pickup_branch_proposals p JOIN loan_requests lr ON lr.id=p.request_id JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE p.id=?`).bind(id).first();
  if(!p||p.status!=="pending"||new Date(p.expires_at)<=new Date())throw new FinalError(404,"ההצעה אינה זמינה");
  if(u.id===p.proposed_by)throw new FinalError(403,"רק הצד השני יכול להגיב");
  if(u.id!==p.borrower_id&&u.id!==p.owner_id&&u.role!=="admin")throw new FinalError(403,"אין הרשאה");
  const accept=b.accept===true,now=new Date().toISOString();
  await env.DB.prepare("UPDATE pickup_branch_proposals SET status=?,responded_at=? WHERE id=?").bind(accept?"accepted":"rejected",now,id).run();
  if(accept)await env.DB.prepare("UPDATE loan_requests SET branch_id=?,updated_at=? WHERE id=?").bind(p.to_branch_id,now,p.request_id).run();
  return json({ok:true,accepted:accept});
}
async function unitHistory(request,env,id){
  const urow=await env.DB.prepare(`SELECT iu.*,i.organization_id,i.title FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.id=?`).bind(id).first();if(!urow)throw new FinalError(404,"היחידה לא נמצאה");
  await orgAccess(request,env,urow.organization_id,["owner","inventory","requests"]);
  const events=await env.DB.prepare("SELECT ue.*,u.full_name AS actor_name FROM unit_events ue LEFT JOIN users u ON u.id=ue.actor_id WHERE unit_id=? ORDER BY created_at DESC LIMIT 300").bind(id).all();
  return json({unit:urow,events:events.results});
}
async function scanSerial(request,env,serial){
  const row=await env.DB.prepare(`SELECT iu.*,i.title,i.organization_id,o.name AS organization_name,b.name AS branch_name FROM item_units iu JOIN items i ON i.id=iu.item_id JOIN organizations o ON o.id=i.organization_id LEFT JOIN organization_branches b ON b.id=iu.branch_id WHERE iu.serial_number=?`).bind(serial).first();
  if(!row)throw new FinalError(404,"היחידה לא נמצאה");await orgAccess(request,env,row.organization_id,["owner","inventory","requests"]);
  const active=await env.DB.prepare(`SELECT lr.id,lr.status,lr.borrower_id,u.full_name AS borrower_name,lr.requested_from,lr.requested_until FROM loan_unit_assignments a JOIN loan_requests lr ON lr.id=a.request_id JOIN users u ON u.id=lr.borrower_id WHERE a.unit_id=? AND a.returned_at IS NULL ORDER BY a.assigned_at DESC LIMIT 1`).bind(row.id).first();
  return json({unit:row,activeLoan:active||null});
}
async function unitScanAction(request,env,id){
  const unit=await env.DB.prepare(`SELECT iu.*,i.organization_id FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.id=?`).bind(id).first();if(!unit)throw new FinalError(404,"היחידה לא נמצאה");
  const {user}=await orgAccess(request,env,unit.organization_id,["owner","inventory","requests"]),b=await body(request),action=clean(b.action,2,40,"פעולה"),now=new Date().toISOString();
  if(action==="fault"){
    await env.DB.prepare("UPDATE item_units SET status='repair',notes=?,updated_at=? WHERE id=?").bind(optional(b.note,500),now,id).run();
  }else if(action==="return"){
    const a=await env.DB.prepare("SELECT request_id FROM loan_unit_assignments WHERE unit_id=? AND returned_at IS NULL ORDER BY assigned_at DESC LIMIT 1").bind(id).first();
    if(a){await env.DB.batch([env.DB.prepare("UPDATE loan_unit_assignments SET returned_at=? WHERE unit_id=? AND request_id=?").bind(now,id,a.request_id),env.DB.prepare("UPDATE item_units SET status='available',updated_at=? WHERE id=?").bind(now,id)]);}
  }else if(action==="collected"){
    await env.DB.prepare("UPDATE item_units SET status='loaned',updated_at=? WHERE id=?").bind(now,id).run();
  }else if(action==="available"){
    await env.DB.prepare("UPDATE item_units SET status='available',updated_at=? WHERE id=?").bind(now,id).run();
  }else throw new FinalError(400,"פעולה לא נתמכת");
  await env.DB.prepare("INSERT INTO unit_events(id,unit_id,actor_id,event_type,note,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),id,user.id,action,optional(b.note,500),JSON.stringify(b.metadata||{})).run();
  return json({ok:true,action});
}
async function bulkInventory(request,env,orgId){
  const {user}=await orgAccess(request,env,orgId,["owner","inventory"]),b=await body(request),ids=[...new Set(Array.isArray(b.itemIds)?b.itemIds.map(String):[])].slice(0,500);
  if(!ids.length)throw new FinalError(400,"לא נבחרו מוצרים");
  const action=clean(b.action,2,30,"פעולה");let affected=0;
  for(const itemId of ids){
    const item=await env.DB.prepare("SELECT id FROM items WHERE id=? AND organization_id=?").bind(itemId,orgId).first();if(!item)continue;
    if(action==="activate")await env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE id=?").bind(new Date().toISOString(),itemId).run();
    else if(action==="deactivate")await env.DB.prepare("UPDATE items SET status='archived',updated_at=? WHERE id=?").bind(new Date().toISOString(),itemId).run();
    else if(action==="availability")await env.DB.prepare("UPDATE items SET availability_status=?,updated_at=? WHERE id=?").bind(clean(b.availability,2,40),new Date().toISOString(),itemId).run();
    else if(action==="quantity")await env.DB.prepare("UPDATE items SET quantity=?,updated_at=? WHERE id=?").bind(Math.max(0,Math.min(999,Number(b.quantity)||0)),new Date().toISOString(),itemId).run();
    else if(action==="category"){await env.DB.prepare("UPDATE items SET category=?,updated_at=? WHERE id=?").bind(clean(b.category,2,80),new Date().toISOString(),itemId).run();}
    else throw new FinalError(400,"פעולה קבוצתית לא נתמכת");
    affected++;
  }
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO bulk_inventory_jobs(id,organization_id,actor_id,action,payload_json,status,affected_count,completed_at) VALUES(?,?,?,?,?,'completed',?,?)").bind(id,orgId,user.id,action,JSON.stringify(b),affected,new Date().toISOString()).run();
  await audit(env,user,"inventory.bulk","organization",orgId,{action,affected},null,b,null,request);
  return json({job:{id,action,affected}});
}
async function recurringLoans(request,env,id=null){
  const u=await requireUser(request,env);
  if(request.method==="GET"){const rows=await env.DB.prepare("SELECT r.*,i.title FROM recurring_loan_rules r JOIN items i ON i.id=r.item_id WHERE r.user_id=? ORDER BY r.created_at DESC").bind(u.id).all();return json({rules:rows.results})}
  if(request.method==="DELETE"){await env.DB.prepare("UPDATE recurring_loan_rules SET status='cancelled' WHERE id=? AND user_id=?").bind(id,u.id).run();return json({ok:true})}
  const b=await body(request),item=await env.DB.prepare("SELECT recurring_allowed FROM items WHERE id=? AND status='active' AND deleted_at IS NULL").bind(clean(b.itemId,1,100)).first();if(!item||!item.recurring_allowed)throw new FinalError(409,"המוצר אינו מאפשר בקשה מחזורית");
  const rid=crypto.randomUUID(),frequency=["weekly","biweekly","monthly"].includes(b.frequency)?b.frequency:"weekly";
  await env.DB.prepare("INSERT INTO recurring_loan_rules(id,user_id,item_id,quantity,starts_at,duration_minutes,frequency,occurrences) VALUES(?,?,?,?,?,?,?,?)")
    .bind(rid,u.id,b.itemId,Math.max(1,Math.min(999,Number(b.quantity)||1)),clean(b.startsAt,10,40),Math.max(30,Math.min(525600,Number(b.durationMinutes)||60)),frequency,Math.max(2,Math.min(52,Number(b.occurrences)||2))).run();
  return json({rule:{id:rid,status:"active"}},201);
}
async function savedEntities(request,env,type=null,id=null){
  const u=await requireUser(request,env);
  if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM saved_entities WHERE user_id=? ORDER BY created_at DESC").bind(u.id).all();return json({saved:rows.results})}
  if(request.method==="DELETE"){await env.DB.prepare("DELETE FROM saved_entities WHERE user_id=? AND entity_type=? AND entity_id=?").bind(u.id,type,id).run();return json({ok:true})}
  const b=await body(request),entityType=["item","organization","category","help_request","search"].includes(b.type)?b.type:null;if(!entityType)throw new FinalError(400,"סוג מועדף לא תקין");
  const entityId=clean(b.id,1,180,"מזהה");
  await env.DB.prepare("INSERT OR REPLACE INTO saved_entities(user_id,entity_type,entity_id,notify) VALUES(?,?,?,?)").bind(u.id,entityType,entityId,b.notify===false?0:1).run();
  return json({ok:true},201);
}
async function helpOffers(request,env,id){
  const u=await requireUser(request,env);
  const hr=await env.DB.prepare("SELECT * FROM help_requests WHERE id=?").bind(id).first();if(!hr)throw new FinalError(404,"הבקשה לא נמצאה");
  if(request.method==="GET"){
    const rows=await env.DB.prepare(`SELECT o.*,u.full_name,i.title AS item_title FROM help_request_offers o JOIN users u ON u.id=o.responder_id LEFT JOIN items i ON i.id=o.item_id WHERE o.help_request_id=? ORDER BY o.created_at`).bind(id).all();
    return json({request:hr,offers:rows.results});
  }
  if(u.id===hr.requester_id)throw new FinalError(400,"אי אפשר להציע לעצמך");
  const b=await body(request),itemId=optional(b.itemId,100);
  if(itemId){const item=await env.DB.prepare("SELECT i.id,o.owner_id FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=? AND i.status='active'").bind(itemId).first();if(!item)throw new FinalError(404,"המוצר לא נמצא")}
  const oid=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO help_request_offers(id,help_request_id,responder_id,item_id,message) VALUES(?,?,?,?,?)").bind(oid,id,u.id,itemId,optional(b.message,1000)).run();
  await env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'system',?,?)").bind(crypto.randomUUID(),hr.requester_id,"הצעה חדשה לבקשת קהילה",itemId?"נשלחה הצעה עם מוצר מתאים.":"נשלחה הצעה חדשה לבקשה.").run();
  return json({offer:{id:oid,status:"offered"}},201);
}
async function communityMatches(request,env,id){
  const hr=await env.DB.prepare("SELECT * FROM help_requests WHERE id=?").bind(id).first();if(!hr)throw new FinalError(404,"הבקשה לא נמצאה");
  const rows=await env.DB.prepare(`SELECT i.id AS item_id,i.title,i.category,i.city,i.availability_status,o.id AS organization_id,o.name AS organization_name
    FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.status='active' AND i.deleted_at IS NULL AND o.deleted_at IS NULL AND o.is_hidden=0 LIMIT 500`).all();
  const q=(hr.title+" "+hr.description+" "+(hr.category||"")).toLowerCase();
  const out=rows.results.map(x=>{let score=0;if(hr.category&&x.category===hr.category)score+=50;if(hr.city&&x.city===hr.city)score+=25;for(const w of q.split(/\s+/).filter(x=>x.length>2))if((x.title+" "+x.category).toLowerCase().includes(w))score+=4;if(x.availability_status==="available")score+=20;return{...x,score}}).filter(x=>x.score>10).sort((a,b)=>b.score-a.score).slice(0,50);
  return json({matches:out});
}
async function reviewAction(request,env,id,action){
  const u=await requireUser(request,env),r=await env.DB.prepare("SELECT * FROM reviews WHERE id=?").bind(id).first();if(!r)throw new FinalError(404,"הביקורת לא נמצאה");
  if(action==="edit"){
    if(r.author_id!==u.id)throw new FinalError(403,"אין הרשאה");
    const limit=r.edited_until?new Date(r.edited_until):new Date(new Date(r.created_at).getTime()+7*86400000);if(new Date()>limit)throw new FinalError(410,"חלון העריכה הסתיים");
    const b=await body(request),rating=Math.max(1,Math.min(5,Number(b.rating)||r.rating)),product=Math.max(1,Math.min(5,Number(b.productRating)||r.product_rating||rating)),service=Math.max(1,Math.min(5,Number(b.serviceRating)||r.service_rating||rating));
    await env.DB.prepare("UPDATE reviews SET rating=?,product_rating=?,service_rating=?,comment=?,updated_at=?,edited_until=COALESCE(edited_until,?) WHERE id=?").bind(rating,product,service,optional(b.comment,1500),new Date().toISOString(),limit.toISOString(),id).run();
    return json({ok:true});
  }
  if(action==="helpful"){try{await env.DB.prepare("INSERT INTO review_helpful_votes(review_id,user_id) VALUES(?,?)").bind(id,u.id).run();await env.DB.prepare("UPDATE reviews SET helpful_count=helpful_count+1 WHERE id=?").bind(id).run()}catch{}return json({ok:true})}
  if(action==="report"){const b=await body(request);try{await env.DB.prepare("INSERT INTO review_reports(id,review_id,reporter_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,u.id,clean(b.reason,2,500,"סיבה")).run()}catch{}return json({ok:true})}
  if(action==="respond"){
    const org=await env.DB.prepare("SELECT owner_id FROM organizations WHERE id=?").bind(r.organization_id).first();if(u.role!=="admin"&&org?.owner_id!==u.id)throw new FinalError(403,"אין הרשאה");
    const b=await body(request);await env.DB.prepare("UPDATE reviews SET organization_response=?,organization_response_at=? WHERE id=?").bind(clean(b.response,2,1000,"תגובה"),new Date().toISOString(),id).run();return json({ok:true});
  }
}
async function templates(request,env,key=null,lang=null){
  const a=await requireAdmin(request,env);
  if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM email_templates ORDER BY template_key,language").all();return json({templates:rows.results})}
  const b=await body(request),language=lang==="en"?"en":"he";
  await env.DB.prepare(`INSERT INTO email_templates(template_key,language,subject,body_text,enabled,updated_by,updated_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(template_key,language) DO UPDATE SET subject=excluded.subject,body_text=excluded.body_text,enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
    .bind(clean(key,2,80),language,clean(b.subject,1,160,"נושא"),clean(b.bodyText,2,5000,"תוכן"),b.enabled===false?0:1,a.id,new Date().toISOString()).run();
  return json({ok:true});
}
async function holidays(request,env,id=null){
  await requireAdmin(request,env);
  if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM holiday_rules ORDER BY hebrew_month,hebrew_day").all();return json({holidays:rows.results})}
  const b=await body(request);
  if(id){
    await env.DB.prepare("UPDATE holiday_rules SET title_he=?,title_en=?,enabled=?,message_he=?,message_en=? WHERE id=?").bind(clean(b.titleHe,2,100),optional(b.titleEn,100),b.enabled===false?0:1,optional(b.messageHe,1000),optional(b.messageEn,1000),id).run();
  }else{
    id=crypto.randomUUID();await env.DB.prepare("INSERT INTO holiday_rules(id,hebrew_month,hebrew_day,duration_days,title_he,title_en,enabled,message_he,message_en) VALUES(?,?,?,?,?,?,?,?,?)").bind(id,clean(b.hebrewMonth,2,30),Math.max(1,Math.min(30,Number(b.hebrewDay)||1)),Math.max(1,Math.min(8,Number(b.durationDays)||1)),clean(b.titleHe,2,100),optional(b.titleEn,100),b.enabled===false?0:1,optional(b.messageHe,1000),optional(b.messageEn,1000)).run();
  }
  return json({ok:true,id});
}
async function moderation(request,env,id=null){
  const a=await requireAdmin(request,env);
  if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM moderation_jobs ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END,created_at LIMIT 300").all();return json({jobs:rows.results})}
  const b=await body(request),status=["reviewed","hidden","cleared"].includes(b.status)?b.status:"reviewed";
  await env.DB.prepare("UPDATE moderation_jobs SET status=?,reviewed_at=?,reviewed_by=? WHERE id=?").bind(status,new Date().toISOString(),a.id,id).run();return json({ok:true,status});
}
async function auditList(request,env,url){
  await requireAdmin(request,env);const action=String(url.searchParams.get("action")||""),branch=String(url.searchParams.get("branch")||"");
  let sql="SELECT a.*,u.full_name AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE 1=1",args=[];
  if(action){sql+=" AND a.action LIKE ?";args.push("%"+action+"%")}if(branch){sql+=" AND a.branch_id=?";args.push(branch)}sql+=" ORDER BY a.created_at DESC LIMIT 500";
  const rows=await env.DB.prepare(sql).bind(...args).all();return json({entries:rows.results});
}
async function opsAnalytics(request,env){
  await requireAdmin(request,env);
  const [loans,statuses,items,users,searches,perf]=await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='returned' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled,SUM(CASE WHEN workflow_status='late' THEN 1 ELSE 0 END) late FROM loan_requests"),
    env.DB.prepare("SELECT status,COUNT(*) count FROM loan_requests GROUP BY status"),
    env.DB.prepare("SELECT i.id,i.title,COUNT(lr.id) requests FROM items i LEFT JOIN loan_requests lr ON lr.item_id=i.id GROUP BY i.id ORDER BY requests DESC LIMIT 20"),
    env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN last_login_at>=datetime('now','-30 days') THEN 1 ELSE 0 END) active30 FROM users WHERE deleted_at IS NULL"),
    env.DB.prepare("SELECT query,COUNT(*) searches,AVG(result_count) avg_results FROM search_suggestion_events GROUP BY query ORDER BY searches DESC LIMIT 30"),
    env.DB.prepare("SELECT metric,AVG(value) avg_value,MAX(value) max_value,COUNT(*) samples FROM performance_events WHERE created_at>=datetime('now','-7 days') GROUP BY metric")
  ]);
  return json({loans:loans.results[0]||{},statuses:statuses.results,topItems:items.results,users:users.results[0]||{},searches:searches.results,performance:perf.results});
}
async function faq(env,lang){const rows=await env.DB.prepare("SELECT * FROM faq_articles WHERE enabled=1 ORDER BY sort_order,title_he").all();return json({articles:rows.results.map(x=>({id:x.id,slug:x.slug,title:lang==="en"?(x.title_en||x.title_he):x.title_he,body:lang==="en"?(x.body_en||x.body_he):x.body_he,keywords:safeJson(x.keywords_json,[])}))})}
async function performance(request,env){const b=await body(request),metric=clean(b.metric,1,60),value=Number(b.value);if(!Number.isFinite(value))throw new FinalError(400,"ערך מדד לא תקין");const ua=String(request.headers.get("User-Agent")||"");await env.DB.prepare("INSERT INTO performance_events(id,path,metric,value,user_agent_hash) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),optional(b.path,300),metric,value,ua?await hash(ua):null).run();return json({ok:true},201)}
async function seoMeta(env,type,id,url){
  if(type==="item"){const r=await env.DB.prepare(`SELECT i.id,i.title,i.description,i.city,i.category,i.image_urls,i.status,o.name AS organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=? AND i.deleted_at IS NULL`).bind(id).first();if(!r)throw new FinalError(404,"המוצר לא נמצא");return json({title:`${r.title} | גמ״ח ברגע`,description:String(r.description||"").slice(0,160),canonical:`${url.origin}/#/item/${id}`,images:safeJson(r.image_urls,[]),noindex:r.status!=="active",type:"product"})}
  if(type==="organization"){const r=await env.DB.prepare("SELECT id,name,description,city,logo_url,is_hidden,deleted_at FROM organizations WHERE id=?").bind(id).first();if(!r)throw new FinalError(404,"הגמ״ח לא נמצא");return json({title:`${r.name} | גמ״ח ברגע`,description:String(r.description||"").slice(0,160),canonical:`${url.origin}/#/gmach/${id}`,images:r.logo_url?[r.logo_url]:[],noindex:Boolean(r.is_hidden||r.deleted_at),type:"organization"})}
  throw new FinalError(404,"סוג SEO לא נתמך");
}
async function sitemap(env,url){
  const [items,orgs]=await env.DB.batch([
    env.DB.prepare("SELECT id,updated_at FROM items WHERE status='active' AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10000"),
    env.DB.prepare("SELECT id,updated_at FROM organizations WHERE is_hidden=0 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10000")
  ]);
  const escXml=s=>String(s).replace(/[<>&'"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;","'":"&apos;",'"':"&quot;"}[c]));
  const entries=[...orgs.results.map(x=>({loc:`${url.origin}/#/gmach/${x.id}`,last:x.updated_at})),...items.results.map(x=>({loc:`${url.origin}/#/item/${x.id}`,last:x.updated_at}))];
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries.map(e=>`<url><loc>${escXml(e.loc)}</loc><lastmod>${new Date(e.last).toISOString()}</lastmod></url>`).join("")+"</urlset>";
  return new Response(xml,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=1800"}});
}
async function logicalBackup(request,env){
  const a=await requireAdmin(request,env),id=crypto.randomUUID(),started=new Date().toISOString();
  await env.DB.prepare("INSERT INTO backup_runs(id,backup_type,status,started_at) VALUES(?,'manual','started',?)").bind(id,started).run();
  try{
    const tables=["users","organizations","organization_branches","items","item_units","loan_requests","notifications","reviews","help_requests","support_tickets","categories","site_settings"];
    const dump={version:1,createdAt:started,tables:{}};
    for(const t of tables){const rows=await env.DB.prepare(`SELECT * FROM ${t}`).all();dump.tables[t]=rows.results}
    const raw=JSON.stringify(dump),key=`_system-backups/${started.replace(/[:.]/g,"-")}-${id}.json`;
    if(!env.ITEM_IMAGES?.put)throw new Error("R2 unavailable");
    await env.ITEM_IMAGES.put(key,raw,{httpMetadata:{contentType:"application/json"}});
    await env.DB.batch([
      env.DB.prepare("UPDATE backup_runs SET status='completed',completed_at=?,finished_at=?,manifest_json=? WHERE id=?").bind(new Date().toISOString(),JSON.stringify({storageKey:key,bytes:new TextEncoder().encode(raw).length,tables}),id),
      env.DB.prepare("INSERT INTO backup_objects(backup_run_id,storage_key,object_type,size_bytes) VALUES(?,?,?,?)").bind(id,key,"database-json",new TextEncoder().encode(raw).length)
    ]);
    await audit(env,a,"backup.manual","backup_run",id,{storageKey:key},null,null,null,request);
    return json({backup:{id,status:"completed",storageKey:key}});
  }catch(e){await env.DB.prepare("UPDATE backup_runs SET status='failed',finished_at=?,error=? WHERE id=?").bind(new Date().toISOString(),String(e.message||e).slice(0,1000),id).run();throw e}
}
async function backupList(request,env){await requireAdmin(request,env);const rows=await env.DB.prepare("SELECT * FROM backup_runs ORDER BY COALESCE(started_at,created_at) DESC LIMIT 100").all();return json({backups:rows.results})}

export async function ensureFinalFeaturesSchema(env){return ensureFinalSchema(env)}

export async function runFinalMaintenance(env){
  await ensureFinalSchema(env);const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE pickup_branch_proposals SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now),
    env.DB.prepare("UPDATE item_change_confirmations SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now),
    env.DB.prepare("UPDATE help_requests SET status='closed',updated_at=? WHERE status='open' AND requested_until IS NOT NULL AND requested_until<?").bind(now,now),
    env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE publish_at IS NOT NULL AND publish_at<=? AND status='pending'").bind(now,now)
  ]);
  const waiting=await env.DB.prepare("SELECT w.*,i.waitlist_response_minutes,i.waitlist_near_response_minutes FROM waitlist_entries w JOIN items i ON i.id=w.item_id WHERE w.status='waiting' ORDER BY w.created_at LIMIT 100").all();
  for(const w of waiting.results){
    const conflict=await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) reserved FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?`).bind(w.item_id,w.requested_until,w.requested_from).first();
    const item=await env.DB.prepare("SELECT quantity FROM items WHERE id=?").bind(w.item_id).first();
    if(Number(item?.quantity||0)-Number(conflict?.reserved||0)>=Number(w.quantity||1)){
      const existing=await env.DB.prepare("SELECT 1 FROM waitlist_offers WHERE waitlist_entry_id=? AND accepted_at IS NULL AND declined_at IS NULL AND expires_at>?").bind(w.id,now).first();
      if(!existing){
        const close=Date.parse(w.requested_from)-Date.now()<24*3600000,mins=close?Number(w.waitlist_near_response_minutes||30):Number(w.waitlist_response_minutes||120),oid=crypto.randomUUID(),expires=new Date(Date.now()+mins*60000).toISOString();
        await env.DB.batch([
          env.DB.prepare("INSERT INTO waitlist_offers(id,waitlist_entry_id,expires_at) VALUES(?,?,?)").bind(oid,w.id,expires),
          env.DB.prepare("UPDATE waitlist_entries SET status='notified' WHERE id=?").bind(w.id),
          env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'system',?,?)").bind(crypto.randomUUID(),w.user_id,"מוצר התפנה עבורך",`יש לך ${mins} דקות להגיב להצעה מרשימת ההמתנה.`)
        ]);
      }
    }
  }
}

export async function handleFinalFeatures(request,env,ctx,url){
  const path=url.pathname,method=request.method.toUpperCase();if(!path.startsWith("/api/")&&path!=="/sitemap.xml")return null;
  try{
    await ensureFinalSchema(env);
    let m;
    if(path==="/sitemap.xml"&&method==="GET")return sitemap(env,url);
    m=path.match(/^\/api\/me\/tours\/([^/]+)$/);if(m&&(method==="GET"||method==="PATCH"))return tour(request,env,decodeURIComponent(m[1]));
    if(path==="/api/me/organization-drafts"&&(method==="GET"||method==="POST"))return drafts(request,env);
    m=path.match(/^\/api\/me\/organization-drafts\/([^/]+)$/);if(m&&(method==="PATCH"||method==="DELETE"))return drafts(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/publish-readiness$/);if(m&&method==="GET")return publishReadiness(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/categories$/);if(m&&(method==="GET"||method==="PUT"))return entityCategories(request,env,"organization",decodeURIComponent(m[1]));
    m=path.match(/^\/api\/items\/([^/]+)\/categories$/);if(m&&(method==="GET"||method==="PUT"))return entityCategories(request,env,"item",decodeURIComponent(m[1]));
    m=path.match(/^\/api\/branches\/([^/]+)\/inventory-policies$/);if(m&&(method==="GET"||method==="PUT"))return branchPolicies(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/branch-proposal$/);if(m&&method==="POST")return proposeBranch(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/branch-proposals\/([^/]+)\/respond$/);if(m&&method==="POST")return respondBranch(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/item-units\/([^/]+)\/history$/);if(m&&method==="GET")return unitHistory(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/item-units\/scan\/([^/]+)$/);if(m&&method==="GET")return scanSerial(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/item-units\/([^/]+)\/scan-action$/);if(m&&method==="POST")return unitScanAction(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/inventory\/bulk$/);if(m&&method==="POST")return bulkInventory(request,env,decodeURIComponent(m[1]));
    if(path==="/api/me/recurring-loans"&&(method==="GET"||method==="POST"))return recurringLoans(request,env);
    m=path.match(/^\/api\/me\/recurring-loans\/([^/]+)$/);if(m&&method==="DELETE")return recurringLoans(request,env,decodeURIComponent(m[1]));
    if(path==="/api/me/saved-entities"&&(method==="GET"||method==="POST"))return savedEntities(request,env);
    m=path.match(/^\/api\/me\/saved-entities\/([^/]+)\/([^/]+)$/);if(m&&method==="DELETE")return savedEntities(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));
    m=path.match(/^\/api\/help-requests\/([^/]+)\/offers$/);if(m&&(method==="GET"||method==="POST"))return helpOffers(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/help-requests\/([^/]+)\/matches$/);if(m&&method==="GET")return communityMatches(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/reviews\/([^/]+)\/(edit|helpful|report|respond)$/);if(m&&(method==="PATCH"||method==="POST"))return reviewAction(request,env,decodeURIComponent(m[1]),m[2]);
    if(path==="/api/admin/email-templates"&&method==="GET")return templates(request,env);
    m=path.match(/^\/api\/admin\/email-templates\/([^/]+)\/(he|en)$/);if(m&&method==="PUT")return templates(request,env,decodeURIComponent(m[1]),m[2]);
    if(path==="/api/admin/holiday-rules"&&method==="GET")return holidays(request,env);
    if(path==="/api/admin/holiday-rules"&&method==="POST")return holidays(request,env);
    m=path.match(/^\/api\/admin\/holiday-rules\/([^/]+)$/);if(m&&method==="PATCH")return holidays(request,env,decodeURIComponent(m[1]));
    if(path==="/api/admin/moderation"&&method==="GET")return moderation(request,env);
    m=path.match(/^\/api\/admin\/moderation\/([^/]+)$/);if(m&&method==="PATCH")return moderation(request,env,decodeURIComponent(m[1]));
    if(path==="/api/admin/audit"&&method==="GET")return auditList(request,env,url);
    if(path==="/api/admin/analytics/operations"&&method==="GET")return opsAnalytics(request,env);
    if(path==="/api/faqs"&&method==="GET")return faq(env,url.searchParams.get("lang")==="en"?"en":"he");
    if(path==="/api/performance"&&method==="POST")return performance(request,env);
    m=path.match(/^\/api\/seo\/(item|organization)\/([^/]+)$/);if(m&&method==="GET")return seoMeta(env,m[1],decodeURIComponent(m[2]),url);
    if(path==="/api/admin/backups"&&method==="GET")return backupList(request,env);
    if(path==="/api/admin/backups"&&method==="POST")return logicalBackup(request,env);
    return null;
  }catch(e){const status=e instanceof FinalError?e.status:500;if(status>=500)console.error("final features",e);return json({error:e instanceof FinalError?e.message:"אירעה תקלה בשכבת ההשלמה הסופית"},status)}
}
