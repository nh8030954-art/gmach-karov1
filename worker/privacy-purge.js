
const SESSION_COOKIE="gmach_session";
class PrivacyPurgeError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
let schemaPromise=null;
const DEFAULT_POLICIES=[
 ["security_events",180],["performance_events",90],["notification_queue",90],["notification_outbox",180],
 ["notification_digests",180],["analytics_events",365],["system_alerts",365],["auth_events",90]
];
export async function ensurePrivacyPurgeSchema(env){
 if(schemaPromise)return schemaPromise;
 schemaPromise=(async()=>{
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS privacy_purge_runs (id TEXT PRIMARY KEY,subject_user_id TEXT,subject_user_hash TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('running','success','failed')),rows_deleted INTEGER NOT NULL DEFAULT 0,rows_anonymized INTEGER NOT NULL DEFAULT 0,media_deleted INTEGER NOT NULL DEFAULT 0,details_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),completed_at TEXT,error TEXT)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS privacy_retention_policies (policy_key TEXT PRIMARY KEY,retention_days INTEGER NOT NULL CHECK(retention_days BETWEEN 1 AND 3650),enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),updated_by TEXT,updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))").run();
  for(const [key,days] of DEFAULT_POLICIES)await env.DB.prepare("INSERT OR IGNORE INTO privacy_retention_policies(policy_key,retention_days,enabled) VALUES(?,?,1)").bind(key,days).run();
  await env.DB.prepare("CREATE INDEX IF NOT EXISTS privacy_purge_runs_user_idx ON privacy_purge_runs(subject_user_id,status,created_at DESC)").run();
  return true;
 })().catch(e=>{schemaPromise=null;throw e});
 return schemaPromise;
}
function cookie(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const [k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return""}
async function sha256(value){const b=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));let s="";for(const x of b)s+=String.fromCharCode(x);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/,"")}
async function requireUser(request,env){const token=cookie(request,SESSION_COOKIE);if(!token)throw new PrivacyPurgeError(401,"יש להתחבר");const hash=await sha256(token),u=await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.account_status='active'").bind(hash,new Date().toISOString()).first();if(!u)throw new PrivacyPurgeError(401,"החיבור פג");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new PrivacyPurgeError(403,"נדרשת הרשאת מנהל");if(Number(u.totp_enabled||0)!==1)throw new PrivacyPurgeError(403,"יש להפעיל אימות דו שלבי לפני כניסה להנהלת האתר");return u;}
async function body(request){try{const x=await request.json();return x&&typeof x==="object"?x:{}}catch{throw new PrivacyPurgeError(400,"תוכן הבקשה אינו תקין")}}
async function runSafe(env,sql,args=[]){try{const r=await env.DB.prepare(sql).bind(...args).run();return Number(r.meta?.changes||0)}catch(e){console.warn("privacy purge skipped SQL",{sql:sql.slice(0,100),error:String(e)});return 0}}
async function allSafe(env,sql,args=[]){try{const r=await env.DB.prepare(sql).bind(...args).all();return r.results||[]}catch{return[]}}
function mediaKey(url){const s=String(url||"");if(!s.startsWith("/media/"))return null;try{return decodeURIComponent(s.slice(7))}catch{return s.slice(7)}}

async function purgeDeletedUser(env,user){
 const existing=await env.DB.prepare("SELECT id FROM privacy_purge_runs WHERE subject_user_id=? AND status='success' AND created_at>=? LIMIT 1").bind(user.id,user.deleted_at||"").first().catch(()=>null);
 if(existing)return {skipped:true,userId:user.id};
 const runId=crypto.randomUUID(),subjectHash=await sha256(user.id),now=new Date().toISOString();
 await env.DB.prepare("INSERT INTO privacy_purge_runs(id,subject_user_id,subject_user_hash,status) VALUES(?,?,?,'running')").bind(runId,user.id,subjectHash).run();
 let rowsDeleted=0,rowsAnonymized=0,mediaDeleted=0;
 const detail={deleted:[],anonymized:[],media:[]};
 try{
  const media=await allSafe(env,"SELECT id,media_url FROM request_messages WHERE sender_id=? AND media_url IS NOT NULL",[user.id]);
  media.push(...await allSafe(env,"SELECT id,media_url FROM organization_chat_messages WHERE sender_id=? AND media_url IS NOT NULL",[user.id]));
  for(const m of media){const key=mediaKey(m.media_url);if(key&&env.ITEM_IMAGES?.delete){try{await env.ITEM_IMAGES.delete(key);mediaDeleted++;detail.media.push(key)}catch{}}}
  const deleteOps=[
   ["sessions","DELETE FROM sessions WHERE user_id=?"],
   ["user_addresses","DELETE FROM user_addresses WHERE user_id=?"],
   ["push_subscriptions","DELETE FROM push_subscriptions WHERE user_id=?"],
   ["notification_preferences","DELETE FROM notification_preferences WHERE user_id=?"],
   ["saved_searches","DELETE FROM saved_searches WHERE user_id=?"],
   ["saved_categories","DELETE FROM saved_categories WHERE user_id=?"],
   ["saved_entities","DELETE FROM saved_entities WHERE user_id=?"],
   ["user_tours","DELETE FROM user_tours WHERE user_id=?"],
   ["navigation_preferences","DELETE FROM navigation_preferences WHERE user_id=?"],
   ["calendar_preferences","DELETE FROM calendar_preferences WHERE user_id=?"],
   ["notification_queue","DELETE FROM notification_queue WHERE user_id=?"],
   ["notification_outbox","DELETE FROM notification_outbox WHERE user_id=?"],
   ["notification_digests","DELETE FROM notification_digests WHERE user_id=?"],
   ["notifications","DELETE FROM notifications WHERE user_id=?"],
   ["favorites","DELETE FROM favorites WHERE user_id=?"],
   ["saved_organizations","DELETE FROM saved_organizations WHERE user_id=?"],
   ["product_comparisons","DELETE FROM product_comparisons WHERE user_id=?"],
   ["saved_help_requests","DELETE FROM saved_help_requests WHERE user_id=?"],
   ["recently_viewed_organizations","DELETE FROM recently_viewed_organizations WHERE user_id=?"],
   ["review_helpful_votes","DELETE FROM review_helpful_votes WHERE user_id=?"],
   ["organization_members","DELETE FROM organization_members WHERE user_id=?"],
   ["user_blocks","DELETE FROM user_blocks WHERE blocker_id=? OR blocked_id=?"]
  ];
  for(const [name,sql] of deleteOps){const args=name==="user_blocks"?[user.id,user.id]:[user.id],n=await runSafe(env,sql,args);if(n){rowsDeleted+=n;detail.deleted.push([name,n])}}
  const anonOps=[
   ["organization_chat_messages","UPDATE organization_chat_messages SET body='[תוכן נמחק לבקשת המשתמש]',media_url=NULL,metadata_json='{}',deleted_at=COALESCE(deleted_at,?) WHERE sender_id=?",[now,user.id]],
   ["organization_chat_requests","UPDATE organization_chat_requests SET note='[תוכן נמחק לבקשת המשתמש]',status='cancelled',updated_at=? WHERE borrower_id=?",[now,user.id]],
   ["request_messages","UPDATE request_messages SET body='[תוכן נמחק לבקשת המשתמש]',media_url=NULL,deleted_at=COALESCE(deleted_at,?) WHERE sender_id=?",[now,user.id]],
   ["reviews","UPDATE reviews SET comment=NULL,updated_at=COALESCE(updated_at,?) WHERE author_id=?",[now,user.id]],
   ["help_requests","UPDATE help_requests SET title='בקשה שנמחקה',description='התוכן נמחק לבקשת המשתמש',city='לא זמין',status='closed',updated_at=? WHERE requester_id=?",[now,user.id]],
   ["help_request_responses","UPDATE help_request_responses SET message='[תוכן נמחק לבקשת המשתמש]' WHERE responder_id=?",[user.id]],
   ["support_ticket_messages","UPDATE support_ticket_messages SET body='[תוכן נמחק לבקשת המשתמש]',sender_id=NULL WHERE sender_id=?",[user.id]],
   ["support_tickets","UPDATE support_tickets SET user_id=NULL,name='משתמש שנמחק',email='deleted-'||id||'@invalid.local',message='[תוכן נמחק לבקשת המשתמש]',updated_at=? WHERE user_id=?",[now,user.id]],
   ["analytics_events","UPDATE analytics_events SET user_id=NULL,query=NULL WHERE user_id=?",[user.id]],
   ["search_suggestion_events","UPDATE search_suggestion_events SET user_id=NULL,query='[deleted]',corrected_query=NULL,city=NULL WHERE user_id=?",[user.id]],
   ["security_events","UPDATE security_events SET user_id=NULL,ip_hash=NULL,device_label=NULL,details_json='{}' WHERE user_id=?",[user.id]],
   ["user_data_requests","UPDATE user_data_requests SET details=NULL WHERE user_id=?",[user.id]]
  ];
  for(const [name,sql,args] of anonOps){const n=await runSafe(env,sql,args);if(n){rowsAnonymized+=n;detail.anonymized.push([name,n])}}
  await env.DB.prepare("UPDATE privacy_purge_runs SET status='success',rows_deleted=?,rows_anonymized=?,media_deleted=?,details_json=?,completed_at=? WHERE id=?").bind(rowsDeleted,rowsAnonymized,mediaDeleted,JSON.stringify(detail),new Date().toISOString(),runId).run();
  return {runId,userId:user.id,rowsDeleted,rowsAnonymized,mediaDeleted};
 }catch(e){
  await env.DB.prepare("UPDATE privacy_purge_runs SET status='failed',rows_deleted=?,rows_anonymized=?,media_deleted=?,details_json=?,completed_at=?,error=? WHERE id=?").bind(rowsDeleted,rowsAnonymized,mediaDeleted,JSON.stringify(detail),new Date().toISOString(),String(e?.message||e).slice(0,1000),runId).run().catch(()=>{});
  throw e;
 }
}
async function applyRetention(env){
 const policies=await allSafe(env,"SELECT policy_key,retention_days,enabled FROM privacy_retention_policies WHERE enabled=1");
 const out={};
 for(const p of policies){
  const days=Math.max(1,Math.min(3650,Number(p.retention_days)||1)),cutoff=new Date(Date.now()-days*86400000).toISOString();
  let n=0;
  if(p.policy_key==="security_events")n=await runSafe(env,"DELETE FROM security_events WHERE created_at<?",[cutoff]);
  else if(p.policy_key==="performance_events")n=await runSafe(env,"DELETE FROM performance_events WHERE created_at<?",[cutoff]);
  else if(p.policy_key==="notification_queue")n=await runSafe(env,"DELETE FROM notification_queue WHERE created_at<? AND (sent_at IS NOT NULL OR failed_at IS NOT NULL)",[cutoff]);
  else if(p.policy_key==="notification_outbox")n=await runSafe(env,"DELETE FROM notification_outbox WHERE created_at<? AND status IN ('sent','failed','skipped')",[cutoff]);
  else if(p.policy_key==="notification_digests")n=await runSafe(env,"DELETE FROM notification_digests WHERE created_at<? AND status IN ('sent','failed')",[cutoff]);
  else if(p.policy_key==="analytics_events")n=await runSafe(env,"DELETE FROM analytics_events WHERE created_at<?",[cutoff]);
  else if(p.policy_key==="system_alerts")n=await runSafe(env,"DELETE FROM system_alerts WHERE created_at<? AND resolved_at IS NOT NULL",[cutoff]);
  else if(p.policy_key==="auth_events")n=await runSafe(env,"DELETE FROM auth_events WHERE created_at<?",[cutoff]);
  out[p.policy_key]=n;
 }
 await runSafe(env,"DELETE FROM geo_cache WHERE expires_at<?",[new Date().toISOString()]);
 return out;
}
async function runAll(env){
 await ensurePrivacyPurgeSchema(env);
 const deleted=await allSafe(env,"SELECT id,deleted_at FROM users WHERE deleted_at IS NOT NULL ORDER BY deleted_at LIMIT 100");
 const purges=[];for(const u of deleted)purges.push(await purgeDeletedUser(env,u));
 const retention=await applyRetention(env);
 return {purges,retention};
}
async function adminOverview(request,env){
 await requireAdmin(request,env);
 const [policies,runs,pending]=await Promise.all([
  allSafe(env,"SELECT * FROM privacy_retention_policies ORDER BY policy_key"),
  allSafe(env,"SELECT id,subject_user_hash,status,rows_deleted,rows_anonymized,media_deleted,created_at,completed_at,error FROM privacy_purge_runs ORDER BY created_at DESC LIMIT 100"),
  allSafe(env,"SELECT u.id,u.full_name,u.email,u.deletion_requested_at,u.deleted_at,(SELECT COUNT(*) FROM organizations o WHERE o.owner_id=u.id AND o.deleted_at IS NULL) AS owned_organizations,(SELECT COUNT(*) FROM loan_requests lr WHERE lr.borrower_id=u.id AND lr.status IN ('pending','approved','collected')) AS active_loans FROM users u WHERE u.deletion_requested_at IS NOT NULL ORDER BY u.deletion_requested_at")
 ]);
 return json({policies,runs,pending});
}
async function updatePolicy(request,env,key){
 const admin=await requireAdmin(request,env),b=await body(request),days=Math.max(1,Math.min(3650,Number(b.retentionDays)||0));if(!days)throw new PrivacyPurgeError(400,"מספר הימים אינו תקין");
 const current=await env.DB.prepare("SELECT policy_key FROM privacy_retention_policies WHERE policy_key=?").bind(key).first();if(!current)throw new PrivacyPurgeError(404,"מדיניות השמירה לא נמצאה");
 await env.DB.prepare("UPDATE privacy_retention_policies SET retention_days=?,enabled=?,updated_by=?,updated_at=? WHERE policy_key=?").bind(days,b.enabled===false?0:1,admin.id,new Date().toISOString(),key).run();
 return json({ok:true});
}
async function runNow(request,env){await requireAdmin(request,env);return json(await runAll(env))}

export async function runPrivacyPurgeMaintenance(env){return runAll(env)}
export async function handlePrivacyPurge(request,env,ctx,url){
 const method=request.method.toUpperCase(),path=url.pathname;
 try{
  if(method==="GET"&&path==="/api/admin/privacy-retention")return adminOverview(request,env);
  if(method==="POST"&&path==="/api/admin/privacy-retention/run")return runNow(request,env);
  const m=path.match(/^\/api\/admin\/privacy-retention\/policies\/([^/]+)$/);if(method==="PATCH"&&m)return updatePolicy(request,env,decodeURIComponent(m[1]));
  return null;
 }catch(e){if(e instanceof PrivacyPurgeError)return json({error:e.message},e.status);throw e}
}
