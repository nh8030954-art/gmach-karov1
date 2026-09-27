
const SESSION_COOKIE="gmach_session";
class DistributionError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
let schemaPromise=null;
export async function ensureDistributionCompletionSchema(env){
 if(schemaPromise)return schemaPromise;
 schemaPromise=(async()=>{
  const info=await env.DB.prepare("PRAGMA table_info(support_tickets)").all(),cols=new Set((info.results||[]).map(x=>x.name));
  for(const [name,def] of [["priority","TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','urgent'))"],["assigned_to","TEXT"],["last_staff_reply_at","TEXT"]])if(!cols.has(name))await env.DB.prepare("ALTER TABLE support_tickets ADD COLUMN "+name+" "+def).run();
  for(const sql of [
   "CREATE TABLE IF NOT EXISTS server_errors (id TEXT PRIMARY KEY,request_id TEXT NOT NULL,path TEXT NOT NULL,method TEXT,message TEXT NOT NULL,stack_excerpt TEXT,user_id TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),resolved_at TEXT,resolved_by TEXT)",
   "CREATE TABLE IF NOT EXISTS system_alert_deliveries (alert_id TEXT NOT NULL REFERENCES system_alerts(id) ON DELETE CASCADE,channel TEXT NOT NULL,recipient TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('sent','failed')),error TEXT,sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(alert_id,channel,recipient))",
   "CREATE TABLE IF NOT EXISTS release_readiness_snapshots (id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('ready','warning','blocked')),payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
   "CREATE TABLE IF NOT EXISTS restore_drills (id TEXT PRIMARY KEY,backup_run_id TEXT REFERENCES backup_runs(id) ON DELETE SET NULL,status TEXT NOT NULL CHECK(status IN ('running','success','failed')),notes TEXT,started_at TEXT NOT NULL,finished_at TEXT)",
   "CREATE INDEX IF NOT EXISTS server_errors_open_created_idx ON server_errors(resolved_at,created_at DESC)",
   "CREATE INDEX IF NOT EXISTS support_tickets_admin_queue_idx ON support_tickets(status,priority,updated_at DESC)",
   "CREATE INDEX IF NOT EXISTS alert_deliveries_sent_idx ON system_alert_deliveries(sent_at DESC)",
   "CREATE INDEX IF NOT EXISTS release_readiness_created_idx ON release_readiness_snapshots(created_at DESC)",
   "CREATE INDEX IF NOT EXISTS restore_drills_started_idx ON restore_drills(started_at DESC)"
  ])await env.DB.prepare(sql).run();
  return true;
 })().catch(e=>{schemaPromise=null;throw e});return schemaPromise
}
function cookieValue(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const [k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return""}
async function sha256(v){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v))));let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function currentUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)return null;return env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha256(token),new Date().toISOString()).first()}
async function requireUser(request,env){const u=await currentUser(request,env);if(!u)throw new DistributionError(401,"יש להתחבר");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new DistributionError(403,"נדרשת הרשאת מנהל");return u}
async function body(request){try{const b=await request.json();return b&&typeof b==="object"?b:{}}catch{throw new DistributionError(400,"תוכן הבקשה אינו תקין")}}
const clean=(v,max=500)=>{const s=String(v??"").trim();return s?s.slice(0,max):null};
function safe(v,f={}){try{return JSON.parse(v||"")}catch{return f}}
function hav(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,x=r(c-a),y=r(d-b),z=Math.sin(x/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(y/2)**2;return 2*R*Math.asin(Math.sqrt(z))}
function israelNow(){const p=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Jerusalem",weekday:"short",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date()),o=Object.fromEntries(p.filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));return{day:String(o.weekday||"").toLowerCase(),time:o.hour+":"+o.minute}}
function openNow(hours){const h=hours&&typeof hours==="object"?hours:{},n=israelNow(),keys={sun:["sun","ראשון","א"],mon:["mon","שני","ב"],tue:["tue","שלישי","ג"],wed:["wed","רביעי","ד"],thu:["thu","חמישי","ה"],fri:["fri","שישי","ו"],sat:["sat","שבת"]}[n.day]||[n.day];let raw;for(const k of keys)if(h[k]!=null){raw=h[k];break}if(raw==null)return null;for(const span of Array.isArray(raw)?raw:[raw]){const m=String(span).match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);if(m&&m[1]<=n.time&&n.time<m[2])return true}return false}
async function branchSearch(env,url){
 const q=clean(url.searchParams.get("q"),120),city=clean(url.searchParams.get("city"),80),minRating=Math.max(0,Math.min(5,Number(url.searchParams.get("minRating")||0))),available=url.searchParams.get("available")==="1",onlyOpen=url.searchParams.get("openNow")==="1",lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon")),maxDistance=Math.max(1,Math.min(250,Number(url.searchParams.get("maxDistance")||100))),hasCoords=Number.isFinite(lat)&&Number.isFinite(lon),where=["b.status!='archived'","o.status='approved'","o.is_hidden=0","o.deleted_at IS NULL"],args=[];
 if(q){where.push("(b.name LIKE ? OR b.address LIKE ? OR b.city LIKE ? OR o.name LIKE ?)");for(let i=0;i<4;i++)args.push("%"+q+"%")}if(city){where.push("b.city=?");args.push(city)}
 const sql="SELECT b.id,b.organization_id,b.name,b.address,b.city,b.latitude,b.longitude,b.phone,b.hours_json,b.status,b.reopens_at,b.inventory_mode,o.name AS organization_name,ROUND(AVG(r.branch_rating),1) AS rating,COUNT(r.branch_rating) AS review_count,(SELECT COUNT(*) FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.branch_id=b.id AND iu.status='available' AND i.status='active' AND i.deleted_at IS NULL) AS available_units,(SELECT COUNT(*) FROM items i WHERE i.organization_id=o.id AND i.status='active' AND i.deleted_at IS NULL) AS active_items FROM organization_branches b JOIN organizations o ON o.id=b.organization_id LEFT JOIN reviews r ON r.branch_id=b.id AND r.status='published' AND r.branch_rating IS NOT NULL WHERE "+where.join(" AND ")+" GROUP BY b.id ORDER BY b.city,b.name LIMIT 500";
 let rows=(await env.DB.prepare(sql).bind(...args).all()).results||[];
 rows=rows.map(x=>{const hours=safe(x.hours_json,{}),distanceKm=hasCoords&&Number.isFinite(Number(x.latitude))&&Number.isFinite(Number(x.longitude))?hav(lat,lon,Number(x.latitude),Number(x.longitude)):null;return{...x,hours,openNow:openNow(hours),rating:x.rating===null?null:Number(x.rating),reviewCount:Number(x.review_count||0),availableUnits:Number(x.available_units||0),activeItems:Number(x.active_items||0),distanceKm:distanceKm===null?null:Math.round(distanceKm*10)/10}});
 if(minRating)rows=rows.filter(x=>Number(x.rating||0)>=minRating);if(available)rows=rows.filter(x=>x.availableUnits>0);if(onlyOpen)rows=rows.filter(x=>x.openNow===true);
 if(hasCoords)rows=rows.filter(x=>x.distanceKm!==null&&x.distanceKm<=maxDistance).sort((a,b)=>a.distanceKm-b.distanceKm||Number(b.rating||0)-Number(a.rating||0));else rows.sort((a,b)=>Number(b.availableUnits>0)-Number(a.availableUnits>0)||Number(b.rating||0)-Number(a.rating||0));
 return json({branches:rows.slice(0,150)});
}
async function adminSupportList(request,env,url){
 await requireAdmin(request,env);const status=clean(url.searchParams.get("status"),20),priority=clean(url.searchParams.get("priority"),20),q=clean(url.searchParams.get("q"),120),where=["1=1"],args=[];if(status){where.push("s.status=?");args.push(status)}if(priority){where.push("s.priority=?");args.push(priority)}if(q){where.push("(s.subject LIKE ? OR s.email LIKE ? OR s.name LIKE ? OR CAST(s.ticket_number AS TEXT) LIKE ?)");for(let i=0;i<4;i++)args.push("%"+q+"%")}
 const sql="SELECT s.id,s.ticket_number,s.user_id,s.name,s.email,s.subject,s.status,s.priority,s.assigned_to,s.last_staff_reply_at,s.created_at,s.updated_at,u.full_name AS assigned_name,(SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id=s.id) AS message_count FROM support_tickets s LEFT JOIN users u ON u.id=s.assigned_to WHERE "+where.join(" AND ")+" ORDER BY CASE s.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,CASE s.status WHEN 'open' THEN 0 WHEN 'reopened' THEN 1 WHEN 'waiting' THEN 2 ELSE 3 END,s.updated_at DESC LIMIT 500";
 return json({tickets:(await env.DB.prepare(sql).bind(...args).all()).results||[]})
}
async function adminSupportDetail(request,env,id){await requireAdmin(request,env);const ticket=await env.DB.prepare("SELECT s.*,u.full_name AS assigned_name FROM support_tickets s LEFT JOIN users u ON u.id=s.assigned_to WHERE s.id=?").bind(id).first();if(!ticket)throw new DistributionError(404,"הפנייה לא נמצאה");const m=await env.DB.prepare("SELECT m.id,m.sender_id,m.body,m.created_at,u.full_name,u.role FROM support_ticket_messages m LEFT JOIN users u ON u.id=m.sender_id WHERE m.ticket_id=? ORDER BY m.created_at").bind(id).all();return json({ticket,messages:(m.results||[]).map(x=>({...x,fromSupport:x.role==="admin"}))})}
async function adminSupportReply(request,env,id){const admin=await requireAdmin(request,env),b=await body(request),message=clean(b.message,2000);if(!message)throw new DistributionError(400,"נדרשת הודעה");const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(id).first();if(!ticket)throw new DistributionError(404,"הפנייה לא נמצאה");const now=new Date().toISOString();const statements=[env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,admin.id,message),env.DB.prepare("UPDATE support_tickets SET status='waiting',assigned_to=COALESCE(assigned_to,?),last_staff_reply_at=?,updated_at=? WHERE id=?").bind(admin.id,now,now,id)];if(ticket.user_id)statements.push(env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),ticket.user_id,"system","עדכון בפניית התמיכה",message.slice(0,300)));await env.DB.batch(statements);return json({ok:true})}
async function adminSupportUpdate(request,env,id){const admin=await requireAdmin(request,env),b=await body(request),ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(id).first();if(!ticket)throw new DistributionError(404,"הפנייה לא נמצאה");const status=["open","waiting","closed","reopened"].includes(b.status)?b.status:ticket.status,priority=["low","normal","high","urgent"].includes(b.priority)?b.priority:ticket.priority,assigned=b.assignedTo===undefined?ticket.assigned_to:(b.assignedTo||null);if(assigned&&!await env.DB.prepare("SELECT id FROM users WHERE id=? AND role='admin'").bind(assigned).first())throw new DistributionError(400,"אפשר להקצות פנייה רק למנהל");await env.DB.batch([env.DB.prepare("UPDATE support_tickets SET status=?,priority=?,assigned_to=?,updated_at=? WHERE id=?").bind(status,priority,assigned,new Date().toISOString(),id),env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"support.admin_update","support_ticket",id,JSON.stringify({status,priority,assigned}))]);return json({ok:true,status,priority,assignedTo:assigned})}
async function admins(request,env){await requireAdmin(request,env);return json({admins:(await env.DB.prepare("SELECT id,full_name,email FROM users WHERE role='admin' AND account_status='active' ORDER BY full_name").all()).results||[]})}

function b64(bytes){let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function contentHash(value){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)))))}
async function sendAlertEmail(env,alert){
  const recipient=String(env.ADMIN_ALERT_EMAIL||env.SUPPORT_EMAIL||"").trim();
  if(!recipient||!env.RESEND_API_KEY)return {sent:false,reason:"not_configured"};
  const existing=await env.DB.prepare("SELECT 1 FROM system_alert_deliveries WHERE alert_id=? AND channel='email' AND recipient=? AND status='sent'").bind(alert.id,recipient).first().catch(()=>null);
  if(existing)return {sent:true,duplicate:true};
  const details=safe(alert.details_json,{});
  const title="[Gmach Berega] "+String(alert.severity||"warning").toUpperCase()+" - "+String(alert.alert_type||"system alert");
  const bodyText=["התראת מערכת אוטומטית","סוג: "+alert.alert_type,"חומרה: "+alert.severity,"זמן: "+alert.created_at,"פרטים: "+JSON.stringify(details,null,2)].join("\n");
  try{
    const res=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Authorization":"Bearer "+env.RESEND_API_KEY,"Content-Type":"application/json"},body:JSON.stringify({from:String(env.FROM_EMAIL||"Gmach Berega <onboarding@resend.dev>"),to:[recipient],subject:title,text:bodyText})});
    if(!res.ok)throw new Error("Resend "+res.status+" "+(await res.text()).slice(0,300));
    await env.DB.prepare("INSERT OR REPLACE INTO system_alert_deliveries(alert_id,channel,recipient,status,error,sent_at) VALUES(?,'email',?,'sent',NULL,?)").bind(alert.id,recipient,new Date().toISOString()).run();
    return {sent:true};
  }catch(e){
    await env.DB.prepare("INSERT OR REPLACE INTO system_alert_deliveries(alert_id,channel,recipient,status,error,sent_at) VALUES(?,'email',?,'failed',?,?)").bind(alert.id,recipient,String(e?.message||e).slice(0,500),new Date().toISOString()).run().catch(()=>{});
    return {sent:false,reason:String(e?.message||e)};
  }
}
async function deliverOpenAlerts(env){
  const rows=(await env.DB.prepare("SELECT * FROM system_alerts WHERE resolved_at IS NULL AND severity IN ('warning','critical') ORDER BY CASE severity WHEN 'critical' THEN 0 ELSE 1 END,created_at LIMIT 50").all()).results||[];
  for(const alert of rows)await sendAlertEmail(env,alert);
}
async function performRestoreDrill(env,backupId,actorId=null){
  const backup=await env.DB.prepare("SELECT * FROM backup_runs WHERE id=?").bind(backupId).first();
  if(!backup)throw new DistributionError(404,"הגיבוי לא נמצא");
  const drillId=crypto.randomUUID(),started=new Date().toISOString();
  await env.DB.prepare("INSERT INTO restore_drills(id,backup_run_id,status,started_at) VALUES(?,?,'running',?)").bind(drillId,backupId,started).run();
  try{
    const manifest=safe(backup.manifest_json,{});
    const key=manifest.storageKey||backup.backup_key;
    if(backup.status!=="completed"||!key)throw new Error("Backup is not complete");
    const storage=env.BACKUP_STORAGE||env.ITEM_IMAGES;
    const object=await storage.get(key);
    if(!object)throw new Error("Backup artifact is missing");
    const raw=await object.text();
    const checksum=await contentHash(raw);
    if(manifest.checksum&&checksum!==manifest.checksum)throw new Error("Backup checksum mismatch");
    const dump=JSON.parse(raw);
    if(!dump.tables||typeof dump.tables!=="object"||Array.isArray(dump.tables))throw new Error("Backup table map is invalid");
    const tables=Object.keys(dump.tables);
    if(!tables.length)throw new Error("Backup contains no tables");
    let rows=0,checkedColumns=0;
    for(const table of tables){
      if(!/^[A-Za-z0-9_]+$/.test(table)||!Array.isArray(dump.tables[table]))throw new Error("Invalid backup table "+table);
      rows+=dump.tables[table].length;
      const info=await env.DB.prepare("PRAGMA table_info("+table+")").all();
      const cols=new Set((info.results||[]).map(x=>x.name));
      if(!cols.size)throw new Error("Current schema is missing table "+table);
      for(const sample of dump.tables[table].slice(0,5))for(const key of Object.keys(sample||{})){checkedColumns++;if(!cols.has(key))throw new Error("Current schema is missing "+table+"."+key);}
    }
    if(Array.isArray(dump.r2Manifest)&&dump.r2Manifest.length){
      const sample=dump.r2Manifest.slice(0,Math.min(10,dump.r2Manifest.length));
      for(const x of sample)if(x.backupKey&&!await storage.head(x.backupKey))throw new Error("Backup object copy is missing: "+x.backupKey);
    }
    const notes=JSON.stringify({checksum,tables:tables.length,rows,checkedColumns,r2Objects:Array.isArray(dump.r2Manifest)?dump.r2Manifest.length:0,separateStorage:Boolean(env.BACKUP_STORAGE),actorId});
    await env.DB.prepare("UPDATE restore_drills SET status='success',notes=?,finished_at=? WHERE id=?").bind(notes,new Date().toISOString(),drillId).run();
    return {id:drillId,status:"success",backupId,tables:tables.length,rows,checkedColumns,r2Objects:Array.isArray(dump.r2Manifest)?dump.r2Manifest.length:0,separateStorage:Boolean(env.BACKUP_STORAGE)};
  }catch(e){
    await env.DB.prepare("UPDATE restore_drills SET status='failed',notes=?,finished_at=? WHERE id=?").bind(String(e?.message||e).slice(0,1500),new Date().toISOString(),drillId).run().catch(()=>{});
    await ensureAlert(env,"restore_drill_failed","critical",{backupId,error:String(e?.message||e).slice(0,500)});
    throw e;
  }
}
async function releaseReadiness(request,env){
  await requireAdmin(request,env);
  const now=Date.now();
  const [backup,drill,validation,errors,alerts,urgent]=await Promise.all([
    env.DB.prepare("SELECT * FROM backup_runs WHERE status='completed' ORDER BY COALESCE(finished_at,completed_at,created_at) DESC LIMIT 1").first().catch(()=>null),
    env.DB.prepare("SELECT * FROM restore_drills ORDER BY started_at DESC LIMIT 1").first().catch(()=>null),
    env.DB.prepare("SELECT * FROM restore_validations ORDER BY started_at DESC LIMIT 1").first().catch(()=>null),
    env.DB.prepare("SELECT COUNT(*) AS count FROM server_errors WHERE resolved_at IS NULL AND created_at>=datetime('now','-24 hours')").first().catch(()=>({count:0})),
    env.DB.prepare("SELECT COUNT(*) AS count FROM system_alerts WHERE resolved_at IS NULL AND severity IN ('warning','critical')").first().catch(()=>({count:0})),
    env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE status!='closed' AND priority='urgent'").first().catch(()=>({count:0}))
  ]);
  const backupAgeHours=backup?Math.round((now-Date.parse(backup.finished_at||backup.completed_at||backup.created_at))/360000)/10:null;
  const checks={
    email:Boolean(env.RESEND_API_KEY),
    encryption:Boolean(env.DATA_ENCRYPTION_KEY),
    turnstile:Boolean(env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY),
    push:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),
    aiModeration:Boolean(env.AI),
    separateBackupStorage:Boolean(env.BACKUP_STORAGE),
    recentBackup:Boolean(backup&&backupAgeHours<=30),
    recentRestoreDrill:Boolean(drill&&drill.status==="success"&&now-Date.parse(drill.finished_at||drill.started_at)<=35*86400000),
    openServerErrors24h:Number(errors?.count||0),
    openAlerts:Number(alerts?.count||0),
    urgentSupport:Number(urgent?.count||0)
  };
  const blockers=[];
  const warnings=[];
  if(!checks.email)blockers.push("email");
  if(!checks.encryption)blockers.push("encryption");
  if(!checks.recentBackup)blockers.push("recentBackup");
  if(checks.openServerErrors24h>0)blockers.push("serverErrors");
  if(!checks.turnstile)warnings.push("turnstile");
  if(!checks.push)warnings.push("push");
  if(!checks.separateBackupStorage)warnings.push("separateBackupStorage");
  if(!checks.recentRestoreDrill)warnings.push("restoreDrill");
  if(checks.openAlerts>0)warnings.push("openAlerts");
  if(checks.urgentSupport>0)warnings.push("urgentSupport");
  const status=blockers.length?"blocked":warnings.length?"warning":"ready";
  const payload={status,checks,blockers,warnings,latestBackup:backup,latestRestoreDrill:drill,latestValidation:validation,generatedAt:new Date().toISOString()};
  await env.DB.prepare("INSERT INTO release_readiness_snapshots(id,status,payload_json) VALUES(?,?,?)").bind(crypto.randomUUID(),status,JSON.stringify(payload)).run().catch(()=>{});
  return json(payload);
}
async function runRestoreDrill(request,env,id){const admin=await requireAdmin(request,env);return json({drill:await performRestoreDrill(env,id,admin.id)},201)}
async function testOperationalAlert(request,env){
  await requireAdmin(request,env);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,'manual_alert_test','warning',?)").bind(id,JSON.stringify({source:"admin",test:true})).run();
  const alert=await env.DB.prepare("SELECT * FROM system_alerts WHERE id=?").bind(id).first();
  const delivery=await sendAlertEmail(env,alert);
  return json({ok:true,alertId:id,delivery});
}

async function serverErrors(request,env,url){const admin=await requireAdmin(request,env);if(request.method==="GET"){const open=url.searchParams.get("open")!=="0";return json({errors:(await env.DB.prepare("SELECT * FROM server_errors "+(open?"WHERE resolved_at IS NULL ":"")+"ORDER BY created_at DESC LIMIT 500").all()).results||[]})}const b=await body(request),id=clean(b.id,100);if(!id)throw new DistributionError(400,"נדרש מזהה תקלה");const at=b.reopen?null:new Date().toISOString();await env.DB.prepare("UPDATE server_errors SET resolved_at=?,resolved_by=? WHERE id=?").bind(at,at?admin.id:null,id).run();return json({ok:true,resolvedAt:at})}
export async function recordDistributionError(env,request,error,requestId){try{await ensureDistributionCompletionSchema(env);let userId=null;try{userId=(await currentUser(request,env))?.id||null}catch{}const url=new URL(request.url);await env.DB.prepare("INSERT INTO server_errors(id,request_id,path,method,message,stack_excerpt,user_id) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),requestId,url.pathname,request.method,String(error?.message||error).slice(0,1000),String(error?.stack||"").slice(0,3000),userId).run()}catch{}}
async function ensureAlert(env,type,severity,details){const x=await env.DB.prepare("SELECT * FROM system_alerts WHERE alert_type=? AND resolved_at IS NULL AND created_at>=datetime('now','-6 hours') LIMIT 1").bind(type).first().catch(()=>null);if(x)return x;const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,?,?)").bind(id,type,severity,JSON.stringify(details||{})).run().catch(()=>{});return env.DB.prepare("SELECT * FROM system_alerts WHERE id=?").bind(id).first().catch(()=>null)}
export async function runDistributionCompletionMaintenance(env){
  await ensureDistributionCompletionSchema(env);
  const e=await env.DB.prepare("SELECT COUNT(*) AS count FROM server_errors WHERE created_at>=datetime('now','-1 hour')").first().catch(()=>({count:0}));
  if(Number(e?.count||0)>=5)await ensureAlert(env,"server_error_spike","critical",{countLastHour:Number(e.count)});else await env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE alert_type='server_error_spike' AND resolved_at IS NULL").bind(new Date().toISOString()).run().catch(()=>{});
  const u=await env.DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE priority='urgent' AND status!='closed' AND updated_at<datetime('now','-2 hours')").first().catch(()=>({count:0}));
  if(Number(u?.count||0)>0)await ensureAlert(env,"urgent_support_waiting","warning",{urgentWaiting:Number(u.count)});
  const latestBackup=await env.DB.prepare("SELECT id,COALESCE(finished_at,completed_at,created_at) AS finished FROM backup_runs WHERE status='completed' ORDER BY finished DESC LIMIT 1").first().catch(()=>null);
  if(!latestBackup||Date.now()-Date.parse(latestBackup.finished)>30*3600000)await ensureAlert(env,"backup_stale","critical",{latestBackup:latestBackup?.finished||null});
  else await env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE alert_type='backup_stale' AND resolved_at IS NULL").bind(new Date().toISOString()).run().catch(()=>{});
  if(!env.BACKUP_STORAGE)await ensureAlert(env,"backup_not_separate","warning",{message:"BACKUP_STORAGE binding is missing"});
  else await env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE alert_type='backup_not_separate' AND resolved_at IS NULL").bind(new Date().toISOString()).run().catch(()=>{});
  const lastDrill=await env.DB.prepare("SELECT finished_at,started_at FROM restore_drills WHERE status='success' ORDER BY COALESCE(finished_at,started_at) DESC LIMIT 1").first().catch(()=>null);
  if(latestBackup&&(!lastDrill||Date.now()-Date.parse(lastDrill.finished_at||lastDrill.started_at)>30*86400000))try{await performRestoreDrill(env,latestBackup.id,null)}catch{}
  await deliverOpenAlerts(env);
}
export async function handleDistributionCompletion(request,env,ctx,url){try{await ensureDistributionCompletionSchema(env);const method=request.method.toUpperCase(),path=url.pathname;let m;if(method==="GET"&&path==="/api/search/branches")return branchSearch(env,url);if(method==="GET"&&path==="/api/admin/support-tickets")return adminSupportList(request,env,url);if(method==="GET"&&path==="/api/admin/support/admins")return admins(request,env);if(method==="GET"&&(m=path.match(/^\/api\/admin\/support-tickets\/([^/]+)$/)))return adminSupportDetail(request,env,decodeURIComponent(m[1]));if(method==="POST"&&(m=path.match(/^\/api\/admin\/support-tickets\/([^/]+)\/messages$/)))return adminSupportReply(request,env,decodeURIComponent(m[1]));if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/support-tickets\/([^/]+)$/)))return adminSupportUpdate(request,env,decodeURIComponent(m[1]));if(path==="/api/admin/server-errors"&&(method==="GET"||method==="PATCH"))return serverErrors(request,env,url);if(method==="GET"&&path==="/api/admin/release-readiness")return releaseReadiness(request,env);if(method==="POST"&&(m=path.match(/^\/api\/admin\/backups\/([^/]+)\/restore-drill$/)))return runRestoreDrill(request,env,decodeURIComponent(m[1]));if(method==="POST"&&path==="/api/admin/release-readiness/test-alert")return testOperationalAlert(request,env);return null}catch(e){if(e instanceof DistributionError)return json({error:e.message},e.status);throw e}}
