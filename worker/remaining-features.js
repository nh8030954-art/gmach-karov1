const SESSION_COOKIE="gmach_session";
class RemainingError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
let schemaPromise=null;
const CREATE=[
"CREATE TABLE IF NOT EXISTS geocode_cache (query_key TEXT PRIMARY KEY,query_text TEXT NOT NULL,result_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),expires_at TEXT NOT NULL)",
"CREATE TABLE IF NOT EXISTS geocode_throttle (id INTEGER PRIMARY KEY CHECK(id=1),last_request_at TEXT)",
"CREATE TABLE IF NOT EXISTS item_image_edits (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,image_url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),crop_json TEXT,rotation INTEGER NOT NULL DEFAULT 0 CHECK(rotation IN (0,90,180,270)),blur_regions_json TEXT NOT NULL DEFAULT '[]',updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(item_id,image_url))",
"CREATE TABLE IF NOT EXISTS review_reports (id TEXT PRIMARY KEY,review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','removed')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),reviewed_at TEXT,UNIQUE(review_id,reporter_id))",
"CREATE TABLE IF NOT EXISTS review_helpful_votes (review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(review_id,user_id))",
"CREATE TABLE IF NOT EXISTS organization_dashboard_snapshots (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,snapshot_date TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(organization_id,snapshot_date))",
"CREATE TABLE IF NOT EXISTS content_translations (content_type TEXT NOT NULL,content_id TEXT NOT NULL,field_name TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN ('he','en')),translated_text TEXT NOT NULL,updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(content_type,content_id,field_name,language))",
"CREATE TABLE IF NOT EXISTS page_content (content_key TEXT NOT NULL,language TEXT NOT NULL CHECK(language IN ('he','en')),content TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','scheduled','published','archived')),publish_at TEXT,updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),PRIMARY KEY(content_key,language))",
"CREATE TABLE IF NOT EXISTS restore_validations (id TEXT PRIMARY KEY,backup_run_id TEXT NOT NULL REFERENCES backup_runs(id) ON DELETE CASCADE,table_count INTEGER NOT NULL DEFAULT 0,row_count INTEGER NOT NULL DEFAULT 0,checksum TEXT,status TEXT NOT NULL CHECK(status IN ('running','success','failed')),details_json TEXT NOT NULL DEFAULT '{}',started_at TEXT NOT NULL,finished_at TEXT)",
"CREATE TABLE IF NOT EXISTS external_service_status (service_key TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('configured','missing','degraded','healthy')),details_json TEXT NOT NULL DEFAULT '{}',checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))"
];
async function ensureSchema(env){if(schemaPromise)return schemaPromise;schemaPromise=(async()=>{for(const s of CREATE)await env.DB.prepare(s).run();const bi=await env.DB.prepare("PRAGMA table_info(backup_runs)").all().catch(()=>({results:[]})),bc=new Set((bi.results||[]).map(x=>x.name));for(const [name,def] of [["backup_type","TEXT NOT NULL DEFAULT 'manual'"],["started_at","TEXT"],["finished_at","TEXT"],["manifest_json","TEXT NOT NULL DEFAULT '{}'"]])if(!bc.has(name))await env.DB.prepare("ALTER TABLE backup_runs ADD COLUMN "+name+" "+def).run();await env.DB.prepare("UPDATE backup_runs SET started_at=COALESCE(started_at,created_at),finished_at=COALESCE(finished_at,completed_at)").run();await env.DB.prepare("INSERT OR IGNORE INTO geocode_throttle(id,last_request_at) VALUES(1,NULL)").run();return true})().catch(e=>{schemaPromise=null;throw e});return schemaPromise}
function cookie(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const [k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return""}
function b64(bytes){let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function hash(v){return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v)))))}
async function currentUser(request,env){const token=cookie(request,SESSION_COOKIE);if(!token)return null;return await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await hash(token),new Date().toISOString()).first()}
async function requireUser(request,env){const u=await currentUser(request,env);if(!u)throw new RemainingError(401,"יש להתחבר כדי להמשיך");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new RemainingError(403,"נדרשת הרשאת מנהל");return u}
async function body(request){try{return await request.json()}catch{throw new RemainingError(400,"בקשה לא תקינה")}}
function clean(v,min=0,max=1000,label="ערך"){const s=String(v??"").trim();if(s.length<min||s.length>max)throw new RemainingError(400,label+" אינו תקין");return s}
function safe(v,f=[]){try{return JSON.parse(v||"")??f}catch{return f}}
async function orgAccess(request,env,orgId){const u=await requireUser(request,env);if(u.role==="admin")return u;const org=await env.DB.prepare("SELECT owner_id FROM organizations WHERE id=? AND deleted_at IS NULL").bind(orgId).first();if(!org)throw new RemainingError(404,"הגמ״ח לא נמצא");if(org.owner_id===u.id)return u;const member=await env.DB.prepare("SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?").bind(orgId,u.id).first();if(!member)throw new RemainingError(403,"אין הרשאה");return u}
function dayKey(date){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",year:"numeric",month:"2-digit",day:"2-digit"}).format(date)}
async function imageEdits(request,env,itemId){
 const item=await env.DB.prepare("SELECT organization_id,image_urls FROM items WHERE id=?").bind(itemId).first();if(!item)throw new RemainingError(404,"הפריט לא נמצא");await orgAccess(request,env,item.organization_id);
 if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM item_image_edits WHERE item_id=? ORDER BY sort_order,image_url").bind(itemId).all();return json({images:rows.results})}
 const b=await body(request);if(!Array.isArray(b.images)||b.images.length>12)throw new RemainingError(400,"רשימת התמונות אינה תקינה");
 await env.DB.prepare("DELETE FROM item_image_edits WHERE item_id=?").bind(itemId).run();
 let primary=false;
 for(let i=0;i<b.images.length;i++){const x=b.images[i],url=clean(x.url,1,800,"כתובת תמונה"),isPrimary=x.isPrimary===true&&!primary;primary ||= isPrimary;const rotation=[0,90,180,270].includes(Number(x.rotation))?Number(x.rotation):0;await env.DB.prepare("INSERT INTO item_image_edits(item_id,image_url,sort_order,is_primary,crop_json,rotation,blur_regions_json) VALUES(?,?,?,?,?,?,?)").bind(itemId,url,i,isPrimary?1:0,JSON.stringify(x.crop||null),rotation,JSON.stringify(x.blurRegions||[])).run()}
 if(b.images.length&&!primary)await env.DB.prepare("UPDATE item_image_edits SET is_primary=1 WHERE item_id=? AND sort_order=0").bind(itemId).run();
 const ordered=(await env.DB.prepare("SELECT image_url FROM item_image_edits WHERE item_id=? ORDER BY is_primary DESC,sort_order").bind(itemId).all()).results.map(x=>x.image_url);
 await env.DB.prepare("UPDATE items SET image_urls=?,updated_at=? WHERE id=?").bind(JSON.stringify(ordered),new Date().toISOString(),itemId).run();
 return json({ok:true,images:ordered});
}
async function availabilityCalendar(request,env,itemId,url){
 const item=await env.DB.prepare("SELECT id,quantity,preparation_minutes,turnaround_minutes,booking_horizon_days,max_per_user FROM items WHERE id=? AND deleted_at IS NULL").bind(itemId).first();if(!item)throw new RemainingError(404,"הפריט לא נמצא");
 const days=Math.max(7,Math.min(120,Number(url.searchParams.get("days"))||45)),start=url.searchParams.get("from")?new Date(url.searchParams.get("from")):new Date();if(Number.isNaN(start.getTime()))throw new RemainingError(400,"תאריך לא תקין");
 const out=[];let nearest=null;
 for(let i=0;i<days;i++){const d=new Date(start);d.setDate(d.getDate()+i);const a=new Date(d);a.setHours(0,0,0,0);const z=new Date(a);z.setDate(z.getDate()+1);
   const row=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) reserved FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?").bind(itemId,z.toISOString(),a.toISOString()).first();
   const blocked=await env.DB.prepare("SELECT 1 FROM inventory_blocks WHERE item_id=? AND starts_at<? AND ends_at>? LIMIT 1").bind(itemId,z.toISOString(),a.toISOString()).first();
   const available=Math.max(0,Number(item.quantity||0)-Number(row?.reserved||0)-(blocked?Number(item.quantity||0):0));const rec={date:dayKey(d),available,blocked:Boolean(blocked)};out.push(rec);if(!nearest&&available>0)nearest=rec.date;
 }
 return json({itemId,days:out,nearestAvailableDate:nearest,maxPerUser:item.max_per_user||item.quantity,preparationMinutes:item.preparation_minutes||0,turnaroundMinutes:item.turnaround_minutes||0});
}
async function similarItems(env,itemId,url){
 const item=await env.DB.prepare("SELECT id,category,city,title FROM items WHERE id=?").bind(itemId).first();if(!item)throw new RemainingError(404,"הפריט לא נמצא");
 const rows=await env.DB.prepare(`SELECT i.id,i.title,i.category,i.city,i.condition,i.image_urls,i.availability_status,o.name organization_name,o.rating organization_rating
 FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id<>? AND i.status='active' AND i.deleted_at IS NULL AND o.deleted_at IS NULL AND o.is_hidden=0 AND (i.category=? OR i.city=?) ORDER BY CASE WHEN i.category=? THEN 0 ELSE 1 END,COALESCE(o.rating,0) DESC,i.created_at DESC LIMIT 12`).bind(itemId,item.category,item.city,item.category).all();
 return json({items:rows.results});
}
async function updateReview(request,env,id){
 const u=await requireUser(request,env),r=await env.DB.prepare("SELECT * FROM reviews WHERE id=?").bind(id).first();if(!r||r.author_id!==u.id)throw new RemainingError(404,"הביקורת לא נמצאה");const deadline=r.edited_until?new Date(r.edited_until):new Date(new Date(r.created_at).getTime()+7*86400000);if(new Date()>deadline)throw new RemainingError(409,"חלון העריכה של הביקורת הסתיים");
 const b=await body(request),rating=Math.max(1,Math.min(5,Number(b.rating)||r.rating)),comment=String(b.comment??r.comment??"").trim().slice(0,1500);await env.DB.prepare("UPDATE reviews SET rating=?,comment=?,updated_at=? WHERE id=?").bind(rating,comment,new Date().toISOString(),id).run();return json({ok:true});
}
async function helpfulReview(request,env,id){
 const u=await requireUser(request,env);try{await env.DB.prepare("INSERT INTO review_helpful_votes(review_id,user_id) VALUES(?,?)").bind(id,u.id).run()}catch{await env.DB.prepare("DELETE FROM review_helpful_votes WHERE review_id=? AND user_id=?").bind(id,u.id).run()}
 const c=await env.DB.prepare("SELECT COUNT(*) count FROM review_helpful_votes WHERE review_id=?").bind(id).first();await env.DB.prepare("UPDATE reviews SET helpful_count=? WHERE id=?").bind(Number(c?.count||0),id).run();return json({helpfulCount:Number(c?.count||0)});
}
async function reportReview(request,env,id){
 const u=await requireUser(request,env),b=await body(request),reason=clean(b.reason,2,500,"סיבה");try{await env.DB.prepare("INSERT INTO review_reports(id,review_id,reporter_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,u.id,reason).run()}catch{throw new RemainingError(409,"כבר דיווחת על הביקורת")};return json({ok:true},201);
}
async function respondReview(request,env,id){
 const r=await env.DB.prepare("SELECT organization_id FROM reviews WHERE id=?").bind(id).first();if(!r)throw new RemainingError(404,"הביקורת לא נמצאה");await orgAccess(request,env,r.organization_id);const b=await body(request),text=clean(b.response,2,1000,"תגובה");await env.DB.prepare("UPDATE reviews SET organization_response=?,organization_response_at=? WHERE id=?").bind(text,new Date().toISOString(),id).run();return json({ok:true});
}
async function orgDashboard(request,env,orgId,url){
 await orgAccess(request,env,orgId);const branch=url.searchParams.get("branch"),category=url.searchParams.get("category");const now=new Date(),today=dayKey(now);
 const where=["i.organization_id=?"],bind=[orgId];if(branch){where.push("lr.branch_id=?");bind.push(branch)}if(category){where.push("i.category=?");bind.push(category)}
 const q=where.join(" AND ");
 const [newReq,pickups,returns,late,inventory,unread,reviews,top]=await Promise.all([
  env.DB.prepare(`SELECT COUNT(*) count FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE ${q} AND lr.status='pending'`).bind(...bind).first(),
  env.DB.prepare(`SELECT COUNT(*) count FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE ${q} AND substr(COALESCE(lr.pickup_window_start,lr.requested_from),1,10)=?`).bind(...bind,today).first(),
  env.DB.prepare(`SELECT COUNT(*) count FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE ${q} AND substr(lr.requested_until,1,10)=?`).bind(...bind,today).first(),
  env.DB.prepare(`SELECT COUNT(*) count FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE ${q} AND lr.status='collected' AND lr.requested_until<?`).bind(...bind,now.toISOString()).first(),
  env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='available' THEN 1 ELSE 0 END) available,SUM(CASE WHEN status='loaned' THEN 1 ELSE 0 END) loaned,SUM(CASE WHEN status='repair' THEN 1 ELSE 0 END) repair FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE i.organization_id=?").bind(orgId).first(),
  env.DB.prepare(`SELECT COUNT(*) count FROM request_messages rm JOIN loan_requests lr ON lr.id=rm.request_id JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? AND rm.read_at IS NULL AND rm.sender_id<>?`).bind(orgId,(await requireUser(request,env)).id).first(),
  env.DB.prepare("SELECT COUNT(*) count,AVG(rating) avg FROM reviews WHERE organization_id=? AND status='published' AND created_at>=datetime('now','-30 days')").bind(orgId).first(),
  env.DB.prepare("SELECT i.id,i.title,COUNT(lr.id) loans FROM items i LEFT JOIN loan_requests lr ON lr.item_id=i.id WHERE i.organization_id=? GROUP BY i.id ORDER BY loans DESC LIMIT 8").bind(orgId).all()
 ]);
 const payload={newRequests:Number(newReq?.count||0),pickupsToday:Number(pickups?.count||0),returnsToday:Number(returns?.count||0),late:Number(late?.count||0),inventory:{total:Number(inventory?.total||0),available:Number(inventory?.available||0),loaned:Number(inventory?.loaned||0),repair:Number(inventory?.repair||0)},unreadMessages:Number(unread?.count||0),reviews30d:Number(reviews?.count||0),rating30d:Number(reviews?.avg||0),topItems:top.results};
 return json(payload);
}
async function pageContent(request,env,url){
 const lang=url.searchParams.get("lang")==="en"?"en":"he";const key=clean(url.searchParams.get("key"),1,120,"מפתח");const row=await env.DB.prepare("SELECT content,status,publish_at,updated_at FROM page_content WHERE content_key=? AND language=? AND status='published'").bind(key,lang).first();return json({content:row||null});
}
async function adminPageContent(request,env){
 const admin=await requireAdmin(request,env);if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM page_content ORDER BY content_key,language").all();return json({pages:rows.results})}
 const b=await body(request),key=clean(b.key,1,120,"מפתח"),lang=b.language==="en"?"en":"he",content=clean(b.content,0,30000,"תוכן"),status=["draft","scheduled","published","archived"].includes(b.status)?b.status:"published",publishAt=b.publishAt||null;
 const old=await env.DB.prepare("SELECT content FROM page_content WHERE content_key=? AND language=?").bind(key,lang).first();const version=await env.DB.prepare("SELECT COALESCE(MAX(version),0)+1 v FROM page_versions WHERE content_key=? AND language=?").bind(key,lang).first();if(old)await env.DB.prepare("INSERT INTO page_versions(id,content_key,language,version,content,created_by) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),key,lang,Number(version?.v||1),old.content,admin.id).run();
 await env.DB.prepare(`INSERT INTO page_content(content_key,language,content,status,publish_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(content_key,language) DO UPDATE SET content=excluded.content,status=excluded.status,publish_at=excluded.publish_at,updated_by=excluded.updated_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(key,lang,content,status,publishAt,admin.id).run();return json({ok:true});
}
async function adminPageVersions(request,env,key,url){await requireAdmin(request,env);const lang=url.searchParams.get("lang")==="en"?"en":"he";const rows=await env.DB.prepare("SELECT * FROM page_versions WHERE content_key=? AND language=? ORDER BY version DESC LIMIT 100").bind(key,lang).all();return json({versions:rows.results})}
async function restorePage(request,env,id){const admin=await requireAdmin(request,env),v=await env.DB.prepare("SELECT * FROM page_versions WHERE id=?").bind(id).first();if(!v)throw new RemainingError(404,"הגרסה לא נמצאה");await env.DB.prepare(`INSERT INTO page_content(content_key,language,content,status,updated_by) VALUES(?,?,?,'published',?) ON CONFLICT(content_key,language) DO UPDATE SET content=excluded.content,status='published',publish_at=NULL,updated_by=excluded.updated_by,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).bind(v.content_key,v.language,v.content,admin.id).run();return json({ok:true})}
async function validateBackup(request,env,id){
 await requireAdmin(request,env);const backup=await env.DB.prepare("SELECT * FROM backup_runs WHERE id=?").bind(id).first();if(!backup)throw new RemainingError(404,"הגיבוי לא נמצא");const vid=crypto.randomUUID(),started=new Date().toISOString();await env.DB.prepare("INSERT INTO restore_validations(id,backup_run_id,status,started_at) VALUES(?,?,'running',?)").bind(vid,id,started).run();
 try{
  const manifest=safe(backup.manifest_json,{});
  if(backup.status!=="completed"||!manifest.storageKey||!manifest.checksum)throw new Error("Backup manifest is incomplete");
  const object=await env.ITEM_IMAGES.get(manifest.storageKey);
  if(!object)throw new Error("Backup artifact is missing");
  const raw=await object.text(),checksum=await hash(raw);
  if(checksum!==manifest.checksum)throw new Error("Backup checksum mismatch");
  const dump=JSON.parse(raw);
  if(!dump.tables||typeof dump.tables!=="object"||Array.isArray(dump.tables))throw new Error("Backup tables are invalid");
  const tables=Object.keys(dump.tables).sort();
  if(!tables.length||tables.some(name=>!/^[A-Za-z0-9_]+$/.test(name)||!Array.isArray(dump.tables[name])))throw new Error("Backup rows are invalid");
  if(JSON.stringify(tables)!==JSON.stringify([...(manifest.tables||[])].sort()))throw new Error("Backup table list mismatch");
  const rows=tables.reduce((sum,name)=>sum+dump.tables[name].length,0);
  await env.DB.prepare("UPDATE restore_validations SET table_count=?,row_count=?,checksum=?,status='success',details_json=?,finished_at=? WHERE id=?").bind(tables.length,rows,checksum,JSON.stringify({manifest,artifactVerified:true,restorePerformed:false}),new Date().toISOString(),vid).run();
  return json({validation:{id:vid,status:"success",tableCount:tables.length,rowCount:rows,checksum,restorePerformed:false}});
 }catch(e){await env.DB.prepare("UPDATE restore_validations SET status='failed',details_json=?,finished_at=? WHERE id=?").bind(JSON.stringify({error:String(e)}),new Date().toISOString(),vid).run();throw e}
}
async function externalStatus(request,env){
 await requireAdmin(request,env);const checks=[
  ["email",Boolean(env.RESEND_API_KEY)],["turnstile",Boolean(env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY)],["push",Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY)],["encryption",Boolean(env.DATA_ENCRYPTION_KEY)]
 ];for(const [k,ok] of checks)await env.DB.prepare("INSERT INTO external_service_status(service_key,status,details_json,checked_at) VALUES(?,?,?,?) ON CONFLICT(service_key) DO UPDATE SET status=excluded.status,details_json=excluded.details_json,checked_at=excluded.checked_at").bind(k,ok?"configured":"missing","{}",new Date().toISOString()).run();return json({services:Object.fromEntries(checks)});
}

async function explicitGeocode(request,env,url){
  const q=clean(url.searchParams.get("q"),3,180,"כתובת"),key=(await hash(q.toLowerCase())).slice(0,40),now=new Date();
  const cached=await env.DB.prepare("SELECT result_json FROM geocode_cache WHERE query_key=? AND expires_at>?").bind(key,now.toISOString()).first();
  if(cached)return json({results:safe(cached.result_json,[]),cached:true,attribution:"© OpenStreetMap contributors"});
  const throttle=await env.DB.prepare("SELECT last_request_at FROM geocode_throttle WHERE id=1").first();
  if(throttle?.last_request_at&&now-new Date(throttle.last_request_at)<1100)throw new RemainingError(429,"נא להמתין שנייה לפני חיפוש כתובת נוסף");
  await env.DB.prepare("UPDATE geocode_throttle SET last_request_at=? WHERE id=1").bind(now.toISOString()).run();
  const target=new URL("https://nominatim.openstreetmap.org/search");
  target.searchParams.set("format","jsonv2");target.searchParams.set("limit","5");target.searchParams.set("countrycodes","il");target.searchParams.set("addressdetails","1");target.searchParams.set("q",q);
  const response=await fetch(target.toString(),{headers:{"User-Agent":"GmachBerega/1.0 (+https://gmach-karov1.nh8030954.workers.dev; contact: support@example.org)","Accept-Language":"he,en"}});
  if(!response.ok)throw new RemainingError(503,"שירות חיפוש הכתובות אינו זמין כרגע");
  const raw=await response.json(),results=(Array.isArray(raw)?raw:[]).map(x=>({displayName:x.display_name,lat:Number(x.lat),lon:Number(x.lon),type:x.type,importance:Number(x.importance||0)})).filter(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lon));
  await env.DB.prepare("INSERT OR REPLACE INTO geocode_cache(query_key,query_text,result_json,expires_at) VALUES(?,?,?,?)").bind(key,q,JSON.stringify(results),new Date(Date.now()+30*86400000).toISOString()).run();
  return json({results,cached:false,attribution:"© OpenStreetMap contributors"});
}

async function automaticDailyBackup(env){
  const today=new Date().toISOString().slice(0,10);
  const existing=await env.DB.prepare("SELECT id FROM backup_runs WHERE backup_type='scheduled' AND substr(started_at,1,10)=? AND status='completed' LIMIT 1").bind(today).first();
  if(existing)return existing.id;
  const id=crypto.randomUUID(),started=new Date().toISOString();
  await env.DB.prepare("INSERT INTO backup_runs(id,backup_type,status,started_at) VALUES(?,'scheduled','started',?)").bind(id,started).run();
  try{
    const tableRows=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('auth_events','rate_limits') ORDER BY name").all();
    const dump={version:2,createdAt:started,tables:{}},tables=[];
    for(const row of tableRows.results){
      const t=String(row.name);
      if(!/^[A-Za-z0-9_]+$/.test(t))continue;
      const rows=await env.DB.prepare("SELECT * FROM "+t).all();
      dump.tables[t]=rows.results;
      tables.push(t);
    }
    const objects=[];
    if(env.ITEM_IMAGES?.list){
      let cursor;
      do{
        const page=await env.ITEM_IMAGES.list({limit:1000,cursor});
        for(const o of page.objects||[])if(!String(o.key).startsWith("_system-backups/"))objects.push({key:o.key,size:o.size,etag:o.etag,uploaded:o.uploaded});
        cursor=page.truncated?page.cursor:undefined;
      }while(cursor);
    }
    dump.r2Manifest=objects;
    const raw=JSON.stringify(dump),bytes=new TextEncoder().encode(raw),checksum=await hash(raw),key="_system-backups/daily/"+today+"-"+id+".json";
    await env.ITEM_IMAGES.put(key,raw,{httpMetadata:{contentType:"application/json"}});
    const manifest={storageKey:key,bytes:bytes.length,checksum,tables,r2ObjectCount:objects.length};
    await env.DB.batch([
      env.DB.prepare("UPDATE backup_runs SET status='completed',completed_at=?,finished_at=?,manifest_json=? WHERE id=?").bind(new Date().toISOString(),new Date().toISOString(),JSON.stringify(manifest),id),
      env.DB.prepare("INSERT OR REPLACE INTO backup_objects(backup_run_id,storage_key,object_type,size_bytes,checksum) VALUES(?,?,?,?,?)").bind(id,key,"database+r2-manifest",bytes.length,checksum)
    ]);
    const old=await env.DB.prepare("SELECT id,manifest_json FROM backup_runs WHERE backup_type='scheduled' AND status='completed' ORDER BY started_at DESC LIMIT -1 OFFSET 14").all();
    for(const x of old.results){
      const m=safe(x.manifest_json,{});
      if(m.storageKey)try{await env.ITEM_IMAGES.delete(m.storageKey)}catch{}
      await env.DB.prepare("DELETE FROM backup_runs WHERE id=?").bind(x.id).run();
    }
    return id;
  }catch(e){
    await env.DB.prepare("UPDATE backup_runs SET status='failed',completed_at=?,finished_at=?,error=? WHERE id=?").bind(new Date().toISOString(),new Date().toISOString(),String(e?.message||e).slice(0,1000),id).run();
    try{await env.DB.prepare("INSERT INTO operational_alerts(id,alert_type,severity,details_json) VALUES(?,'backup_failed','critical',?)").bind(crypto.randomUUID(),JSON.stringify({error:String(e?.message||e)})).run()}catch{}
    throw e;
  }
}


async function unifiedModeration(request,env,url){
  const admin=await requireAdmin(request,env);
  if(request.method==="GET"){
    const status=String(url.searchParams.get("status")||"pending"),rows=[];
    const collect=async(type,sql,args=[])=>{try{const r=await env.DB.prepare(sql).bind(...args).all();for(const x of r.results)rows.push({...x,source:type})}catch{}};
    await Promise.all([
      collect("item_report","SELECT r.id,r.item_id AS entity_id,r.reason,r.details,r.status,r.created_at,u.full_name AS reporter_name,i.title AS entity_title FROM reports r LEFT JOIN users u ON u.id=r.reporter_id LEFT JOIN items i ON i.id=r.item_id WHERE r.status=?",[status]),
      collect("content_report","SELECT r.id,r.entity_id,r.reason,NULL AS details,r.status,r.created_at,u.full_name AS reporter_name,r.entity_type AS entity_title FROM content_reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status=?",[status]),
      collect("review_report","SELECT r.id,r.review_id AS entity_id,r.reason,NULL AS details,r.status,r.created_at,u.full_name AS reporter_name,'review' AS entity_title FROM review_reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status=?",[status]),
      collect("message_report","SELECT r.id,r.message_id AS entity_id,r.reason,NULL AS details,r.status,r.created_at,u.full_name AS reporter_name,'message' AS entity_title FROM message_reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status=?",[status]),
      collect("chat_report","SELECT r.id,r.message_id AS entity_id,r.reason,NULL AS details,r.status,r.created_at,u.full_name AS reporter_name,'chat message' AS entity_title FROM chat_reports r LEFT JOIN users u ON u.id=r.reporter_id WHERE r.status=?",[status]),
      collect("moderation_job","SELECT id,entity_id,reason,NULL AS details,status,created_at,NULL AS reporter_name,entity_type AS entity_title FROM moderation_jobs WHERE status=?",[status])
    ]);
    rows.sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));
    return json({reports:rows.slice(0,500)});
  }
  const b=await body(request),source=clean(b.source,2,40,"מקור"),id=clean(b.id,1,100,"דיווח"),action=["reviewed","dismissed","removed","hidden","cleared"].includes(b.action)?b.action:"reviewed",now=new Date().toISOString();
  const map={
    item_report:["reports","updated_at",["reviewed","dismissed"].includes(action)?action:"reviewed"],
    content_report:["content_reports",null,["reviewed","dismissed","removed"].includes(action)?action:"reviewed"],
    review_report:["review_reports","reviewed_at",["reviewed","dismissed","removed"].includes(action)?action:"reviewed"],
    message_report:["message_reports",null,["reviewed","dismissed","removed"].includes(action)?action:"reviewed"],
    chat_report:["chat_reports",null,["reviewed","dismissed","removed"].includes(action)?action:"reviewed"],
    moderation_job:["moderation_jobs","reviewed_at",["reviewed","hidden","cleared"].includes(action)?action:"reviewed"]
  };
  const cfg=map[source];if(!cfg)throw new RemainingError(400,"מקור דיווח לא תקין");
  const [table,timeCol,statusValue]=cfg;
  if(!/^[a-z_]+$/.test(table))throw new RemainingError(400,"מקור לא תקין");
  if(timeCol)await env.DB.prepare("UPDATE "+table+" SET status=?,"+timeCol+"=? WHERE id=?").bind(statusValue,now,id).run();
  else await env.DB.prepare("UPDATE "+table+" SET status=? WHERE id=?").bind(statusValue,id).run();
  if(source==="review_report"&&statusValue==="removed"){const rr=await env.DB.prepare("SELECT review_id FROM review_reports WHERE id=?").bind(id).first();if(rr)await env.DB.prepare("UPDATE reviews SET status='hidden' WHERE id=?").bind(rr.review_id).run()}
  if((source==="message_report"||source==="chat_report")&&statusValue==="removed"){const tableName=source==="message_report"?"message_reports":"chat_reports";const rr=await env.DB.prepare("SELECT message_id FROM "+tableName+" WHERE id=?").bind(id).first();if(rr)await env.DB.prepare("UPDATE request_messages SET body='הודעה הוסרה על ידי מנהל האתר',media_url=NULL,deleted_at=? WHERE id=?").bind(now,rr.message_id).run()}
  await env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"moderation."+statusValue,source,id,JSON.stringify({source,action:statusValue})).run().catch(()=>{});
  return json({ok:true,status:statusValue});
}

export async function ensureRemainingFeaturesSchema(env){return ensureSchema(env)}
export async function runRemainingMaintenance(env){await ensureSchema(env);const now=new Date().toISOString();await env.DB.prepare("UPDATE page_content SET status='published',publish_at=NULL,updated_at=? WHERE status='scheduled' AND publish_at IS NOT NULL AND publish_at<=?").bind(now,now).run();await automaticDailyBackup(env)}
export async function handleRemainingFeatures(request,env,ctx,url){
 await ensureSchema(env);const method=request.method.toUpperCase(),path=url.pathname;
 try{
  let m=path.match(/^\/api\/items\/([^/]+)\/image-edits$/);if(m&&(method==="GET"||method==="PUT"))return imageEdits(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/items\/([^/]+)\/availability-calendar$/);if(m&&method==="GET")return availabilityCalendar(request,env,decodeURIComponent(m[1]),url);
  m=path.match(/^\/api\/items\/([^/]+)\/similar$/);if(m&&method==="GET")return similarItems(env,decodeURIComponent(m[1]),url);
  m=path.match(/^\/api\/reviews\/([^/]+)$/);if(m&&method==="PATCH")return updateReview(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/reviews\/([^/]+)\/helpful$/);if(m&&method==="POST")return helpfulReview(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/reviews\/([^/]+)\/report$/);if(m&&method==="POST")return reportReview(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/reviews\/([^/]+)\/response$/);if(m&&method==="POST")return respondReview(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/organizations\/([^/]+)\/operations-dashboard$/);if(m&&method==="GET")return orgDashboard(request,env,decodeURIComponent(m[1]),url);
  if(path==="/api/content"&&method==="GET")return pageContent(request,env,url);
  if(path==="/api/admin/page-content"&&(method==="GET"||method==="PUT"))return adminPageContent(request,env);
  m=path.match(/^\/api\/admin\/page-content\/([^/]+)\/versions$/);if(m&&method==="GET")return adminPageVersions(request,env,decodeURIComponent(m[1]),url);
  m=path.match(/^\/api\/admin\/page-versions\/([^/]+)\/restore$/);if(m&&method==="POST")return restorePage(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/admin\/backups\/([^/]+)\/validate$/);if(m&&method==="POST")return validateBackup(request,env,decodeURIComponent(m[1]));
  if(path==="/api/admin/external-services"&&method==="GET")return externalStatus(request,env);
  if(path==="/api/admin/moderation-unified"&&(method==="GET"||method==="PATCH"))return unifiedModeration(request,env,url);
  if(path==="/api/maps/geocode"&&method==="GET")return explicitGeocode(request,env,url);
  return null;
 }catch(e){const status=e instanceof RemainingError?e.status:500;if(status>=500)console.error("remaining-features",e);return json({error:e instanceof RemainingError?e.message:"אירעה תקלה בשכבת ההשלמה"},status)}
}
