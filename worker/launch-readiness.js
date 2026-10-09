import { refreshServerErrorAlert } from "./distribution-completion.js";
import { monitorArchiveBackup } from "./archive-backup.js";
import { adminGmachSelect } from "./admin-gmachs.js";

const SESSION_COOKIE="gmach_session";
class LaunchError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
let schemaPromise=null;

export async function ensureLaunchReadinessSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const statements=[
      "CREATE TABLE IF NOT EXISTS operational_health_snapshots (id TEXT PRIMARY KEY,status TEXT NOT NULL CHECK(status IN ('healthy','warning','critical')),payload_json TEXT NOT NULL DEFAULT '{}',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
      "CREATE INDEX IF NOT EXISTS operational_health_created_idx ON operational_health_snapshots(created_at DESC)",
      "CREATE INDEX IF NOT EXISTS system_alerts_type_open_idx ON system_alerts(alert_type,resolved_at,created_at DESC)",
      "CREATE TABLE IF NOT EXISTS admin_recycle_bin(entity_type TEXT NOT NULL CHECK(entity_type IN ('user','organization','item')),entity_id TEXT NOT NULL,label TEXT NOT NULL,previous_state TEXT NOT NULL,archived_by TEXT NOT NULL,archived_at TEXT NOT NULL,PRIMARY KEY(entity_type,entity_id))"
    ];
    for(const sql of statements)await env.DB.prepare(sql).run();
    return true;
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}

function cookieValue(request,name){for(const part of String(request.headers.get("Cookie")||"").split(";")){const [k,...rest]=part.trim().split("=");if(k===name)return decodeURIComponent(rest.join("="));}return""}
async function sha256(value){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function requireUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)throw new LaunchError(401,"יש להתחבר");const hash=await sha256(token);const u=await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(hash,new Date().toISOString()).first();if(!u)throw new LaunchError(401,"החיבור פג");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new LaunchError(403,"נדרשת הרשאת מנהל");if(Number(u.totp_enabled||0)!==1)throw new LaunchError(403,"יש להפעיל אימות דו שלבי לפני כניסה להנהלת האתר");return u;}
async function orgAccess(request,env,orgId,roles=["owner","inventory"]){const u=await requireUser(request,env);if(u.role==="admin")return{user:u,role:"owner"};const row=await env.DB.prepare("SELECT CASE WHEN o.owner_id=? THEN 'owner' ELSE m.role END AS role FROM organizations o LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE o.id=?").bind(u.id,u.id,orgId).first();if(!row?.role||!roles.includes(row.role))throw new LaunchError(403,"אין הרשאה לניהול המלאי של הגמ״ח");return{user:u,role:row.role}}
async function body(request){try{const b=await request.json();return b&&typeof b==="object"?b:{}}catch{throw new LaunchError(400,"תוכן הבקשה אינו תקין")}}
const text=(v,max=500)=>{const s=String(v??"").trim();return s?s.slice(0,max):null};
function safe(v,fallback={}){try{return JSON.parse(v||"")}catch{return fallback}}
function audit(env,actorId,action,entityType,entityId,oldValue,newValue,branchId=null,meta={}){return env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,branch_id,old_value_json,new_value_json,metadata_json) VALUES(?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actorId,action,entityType,entityId,branchId,JSON.stringify(oldValue||{}),JSON.stringify(newValue||{}),JSON.stringify(meta||{}))}
function nextWorkflow(status,current){if(status==="approved")return"approved_ready_for_pickup";if(status==="collected")return"awaiting_return";if(status==="returned")return"returned_completed";if(status==="cancelled")return"cancelled";if(status==="declined")return"declined";if(status==="pending")return current==="admin_suspended"?"inventory_held":(current||"inventory_held");return current||"inventory_held"}

async function adminLoans(request,env,url){
  await requireAdmin(request,env);
  const where=["1=1"],args=[],status=text(url.searchParams.get("status"),30),workflow=text(url.searchParams.get("workflow"),80),q=text(url.searchParams.get("q"),120),overdue=url.searchParams.get("overdue")==="1";
  if(status){where.push("lr.status=?");args.push(status)}
  if(workflow){where.push("lr.workflow_status=?");args.push(workflow)}
  if(q){where.push("(lr.id LIKE ? OR i.title LIKE ? OR o.name LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)");for(let i=0;i<5;i++)args.push("%"+q+"%")}
  if(overdue){where.push("lr.status='collected' AND lr.requested_until<?");args.push(new Date().toISOString())}
  const rows=await env.DB.prepare(`
    SELECT lr.id,lr.item_id,lr.borrower_id,lr.status,lr.workflow_status,lr.quantity,lr.requested_from,lr.requested_until,
      lr.extension_status,lr.extension_until,lr.branch_id,lr.admin_hold_reason,lr.admin_hold_until,lr.created_at,lr.updated_at,
      i.title,o.id AS organization_id,o.name AS organization_name,u.full_name AS borrower_name,u.email AS borrower_email,
      b.name AS branch_name,
      (SELECT COUNT(*) FROM loan_status_events e WHERE e.request_id=lr.id) AS event_count,
      (SELECT COUNT(*) FROM waitlist_entries w WHERE w.item_id=lr.item_id AND w.status IN ('waiting','notified')) AS waitlist_count
    FROM loan_requests lr
    JOIN items i ON i.id=lr.item_id
    JOIN organizations o ON o.id=i.organization_id
    JOIN users u ON u.id=lr.borrower_id
    LEFT JOIN organization_branches b ON b.id=lr.branch_id
    WHERE ${where.join(" AND ")}
    ORDER BY CASE WHEN lr.status='collected' AND lr.requested_until<? THEN 0 WHEN lr.status IN ('pending','approved') THEN 1 ELSE 2 END,lr.updated_at DESC
    LIMIT 500
  `).bind(...args,new Date().toISOString()).all();
  return json({loans:rows.results||[]});
}

async function adminLoanTimeline(request,env,id){
  await requireAdmin(request,env);
  const loan=await env.DB.prepare(`
    SELECT lr.*,i.title,o.name AS organization_name,u.full_name AS borrower_name,u.email AS borrower_email,b.name AS branch_name
    FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id JOIN users u ON u.id=lr.borrower_id
    LEFT JOIN organization_branches b ON b.id=lr.branch_id WHERE lr.id=?`).bind(id).first();
  if(!loan)throw new LaunchError(404,"ההשאלה לא נמצאה");
  const [events,units,waitlist]=await env.DB.batch([
    env.DB.prepare("SELECT e.*,u.full_name AS actor_name FROM loan_status_events e LEFT JOIN users u ON u.id=e.actor_id WHERE e.request_id=? ORDER BY e.created_at").bind(id),
    env.DB.prepare("SELECT a.unit_id,a.assigned_at,a.returned_at,iu.serial_number,iu.status AS unit_status FROM loan_unit_assignments a JOIN item_units iu ON iu.id=a.unit_id WHERE a.request_id=? ORDER BY a.assigned_at").bind(id),
    env.DB.prepare("SELECT id,status,offer_expires_at,created_at FROM waitlist_entries WHERE item_id=? AND user_id=? ORDER BY created_at DESC LIMIT 20").bind(loan.item_id,loan.borrower_id)
  ]);
  return json({loan,events:events.results||[],units:units.results||[],waitlist:waitlist.results||[]});
}

async function adminLoanOverride(request,env,id){
  const admin=await requireAdmin(request,env),b=await body(request),loan=await env.DB.prepare("SELECT * FROM loan_requests WHERE id=?").bind(id).first();
  if(!loan)throw new LaunchError(404,"ההשאלה לא נמצאה");
  const allowed=["pending","approved","declined","cancelled","collected","returned"],status=b.status===undefined?loan.status:String(b.status);
  if(!allowed.includes(status))throw new LaunchError(400,"סטטוס ההשאלה אינו תקין");
  const workflow=text(b.workflowStatus,80)||nextWorkflow(status,loan.workflow_status),reason=text(b.reason,500)||"עדכון מנהל",now=new Date().toISOString();
  const collectedAt=status==="collected"?(loan.collected_at||now):loan.collected_at;
  const returnedAt=status==="returned"?(loan.returned_at||now):(status==="collected"?null:loan.returned_at);
  const cancelledAt=["cancelled","declined"].includes(status)?(loan.cancelled_at||now):(["pending","approved","collected","returned"].includes(status)?null:loan.cancelled_at);
  await env.DB.batch([
    env.DB.prepare("UPDATE loan_requests SET status=?,workflow_status=?,collected_at=?,returned_at=?,cancelled_at=?,updated_at=? WHERE id=?").bind(status,workflow,collectedAt,returnedAt,cancelledAt,now,id),
    env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,"admin_override:"+status,admin.id,reason),
    audit(env,admin.id,"loan.admin_override","loan_request",id,{status:loan.status,workflowStatus:loan.workflow_status},{status,workflowStatus:workflow},loan.branch_id,{reason})
  ]);
  if(["cancelled","declined","returned"].includes(status))await env.DB.prepare("UPDATE inventory_holds SET status='released' WHERE request_id=? AND status='active'").bind(id).run().catch(()=>{});
  if(status==="returned"){
    await env.DB.prepare("UPDATE loan_unit_assignments SET returned_at=COALESCE(returned_at,?) WHERE request_id=?").bind(now,id).run().catch(()=>{});
    await env.DB.prepare("UPDATE item_units SET status='available',updated_at=? WHERE id IN (SELECT unit_id FROM loan_unit_assignments WHERE request_id=?)").bind(now,id).run().catch(()=>{});
  }
  await queueAdminAlert(env,admin.id,"admin_loan_override","warning","בוצע שינוי ידני בהשאלה",{requestId:id,fromStatus:loan.status,toStatus:status,reason});
  return json({ok:true,status,workflowStatus:workflow});
}

async function branchInventoryWorkspace(request,env,branchId){
  const branch=await env.DB.prepare("SELECT * FROM organization_branches WHERE id=?").bind(branchId).first();if(!branch)throw new LaunchError(404,"הסניף לא נמצא");
  const {user}=await orgAccess(request,env,branch.organization_id,["owner","inventory"]);
  if(request.method==="GET"){
    const [items,policies,units]=await env.DB.batch([
      env.DB.prepare("SELECT id,title,quantity,status,availability_status FROM items WHERE organization_id=? AND deleted_at IS NULL ORDER BY title").bind(branch.organization_id),
      env.DB.prepare("SELECT * FROM branch_inventory_policies WHERE branch_id=?").bind(branchId),
      env.DB.prepare("SELECT item_id,status,COUNT(*) AS count FROM item_units WHERE branch_id=? GROUP BY item_id,status").bind(branchId)
    ]);
    return json({branch,items:items.results||[],policies:policies.results||[],unitCounts:units.results||[]});
  }
  const b=await body(request),policies=Array.isArray(b.policies)?b.policies:[];
  if(!policies.length)throw new LaunchError(400,"יש לשלוח לפחות מדיניות אחת");
  const old=await env.DB.prepare("SELECT * FROM branch_inventory_policies WHERE branch_id=?").bind(branchId).all();
  for(const p of policies.slice(0,500)){
    const itemId=text(p.itemId,100),mode=["inherit","separate","shared"].includes(p.mode)?p.mode:"inherit",quantityOverride=p.quantityOverride===null||p.quantityOverride===""||p.quantityOverride===undefined?null:Math.max(0,Math.min(999,Number(p.quantityOverride)||0));
    const item=await env.DB.prepare("SELECT id FROM items WHERE id=? AND organization_id=? AND deleted_at IS NULL").bind(itemId,branch.organization_id).first();
    if(!item)throw new LaunchError(400,"נמצא מוצר שאינו שייך לגמ״ח של הסניף");
    await env.DB.prepare(`INSERT INTO branch_inventory_policies(branch_id,item_id,mode,quantity_override,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(branch_id,item_id) DO UPDATE SET mode=excluded.mode,quantity_override=excluded.quantity_override,updated_at=excluded.updated_at`)
      .bind(branchId,itemId,mode,quantityOverride,new Date().toISOString()).run();
  }
  const updated=await env.DB.prepare("SELECT * FROM branch_inventory_policies WHERE branch_id=?").bind(branchId).all();
  await audit(env,user.id,"branch.inventory_policy.update","organization_branch",branchId,old.results||[],updated.results||[],branchId,{organizationId:branch.organization_id}).run().catch(()=>{});
  return json({ok:true,policies:updated.results||[]});
}

async function branchManagement(request,env,branchId){
  const branch=await env.DB.prepare("SELECT * FROM organization_branches WHERE id=?").bind(branchId).first();
  if(!branch)throw new LaunchError(404,"הסניף לא נמצא");
  await orgAccess(request,env,branch.organization_id,["owner"]);
  return json({branch:{...branch,hours:safe(branch.hours_json,{})}});
}

async function adminEntities(request,env,url){
  await requireAdmin(request,env);
  const type=String(url.searchParams.get("type")||"users"),q=text(url.searchParams.get("q"),120),status=text(url.searchParams.get("status"),40),like=q?"%"+q+"%":null;
  let sql,args=[];
  if(type==="users"){
    sql="SELECT id,email,full_name,role,account_status,email_verified,created_at,last_login_at FROM users WHERE deleted_at IS NULL";
    if(q){sql+=" AND (email LIKE ? OR full_name LIKE ?)";args.push(like,like)}if(status){sql+=" AND account_status=?";args.push(status)}
    sql+=" ORDER BY COALESCE(last_login_at,created_at) DESC LIMIT 300";
  }else if(type==="organizations"){
    sql=adminGmachSelect+" WHERE o.deleted_at IS NULL";
    if(q){sql+=" AND (o.name LIKE ? OR o.city LIKE ? OR u.email LIKE ?)";args.push(like,like,like)}if(status){sql+=" AND o.status=?";args.push(status)}
    sql+=" ORDER BY o.updated_at DESC LIMIT 300";
  }else if(type==="items"){
    sql="SELECT i.id,i.title,i.status,i.availability_status,i.quantity,i.city,i.organization_id,i.updated_at,o.name organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.deleted_at IS NULL";
    if(q){sql+=" AND (i.title LIKE ? OR i.city LIKE ? OR o.name LIKE ?)";args.push(like,like,like)}if(status){sql+=" AND i.status=?";args.push(status)}
    sql+=" ORDER BY i.updated_at DESC LIMIT 300";
  }else if(type==="support"){
    sql="SELECT id,ticket_number,user_id,name,email,subject,status,created_at,updated_at FROM support_tickets WHERE 1=1";
    if(q){sql+=" AND (subject LIKE ? OR email LIKE ? OR name LIKE ? OR CAST(ticket_number AS TEXT) LIKE ?)";args.push(like,like,like,like)}if(status){sql+=" AND status=?";args.push(status)}
    sql+=" ORDER BY updated_at DESC LIMIT 300";
  }else throw new LaunchError(400,"סוג ישות אינו נתמך");
  const rows=await env.DB.prepare(sql).bind(...args).all();
  return json({type,entities:rows.results||[]});
}

async function patchAdminEntity(request,env,type,id){
  const admin=await requireAdmin(request,env),b=await body(request),now=new Date().toISOString();
  if(type==="users"){
    if(b.role!==undefined)throw new LaunchError(403,"שינוי הרשאות ניהול אינו זמין");
    const old=await env.DB.prepare("SELECT id,account_status FROM users WHERE id=? AND deleted_at IS NULL").bind(id).first();if(!old)throw new LaunchError(404,"המשתמש לא נמצא");if(id===admin.id&&b.accountStatus==="suspended")throw new LaunchError(400,"אי אפשר להשעות את חשבון המנהל הנוכחי");
    const next=["active","suspended"].includes(b.accountStatus)?b.accountStatus:old.account_status;
    const statements=[env.DB.prepare("UPDATE users SET account_status=?,updated_at=? WHERE id=?").bind(next,now,id),audit(env,admin.id,"admin.entity.user","user",id,old,{account_status:next})];
    if(b.revokeSessions===true)statements.push(env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id));
    await env.DB.batch(statements);return json({ok:true,accountStatus:next});
  }
  if(type==="organizations"){
    const old=await env.DB.prepare("SELECT id,status,is_hidden,temporarily_closed,reopens_at FROM organizations WHERE id=? AND deleted_at IS NULL").bind(id).first();if(!old)throw new LaunchError(404,"הגמ״ח לא נמצא");
    const status=["pending","approved","rejected"].includes(b.status)?b.status:old.status,isHidden=b.isHidden===undefined?old.is_hidden:(b.isHidden?1:0),closed=b.temporarilyClosed===undefined?old.temporarily_closed:(b.temporarilyClosed?1:0),reopens=b.reopensAt===undefined?old.reopens_at:(b.reopensAt?new Date(b.reopensAt).toISOString():null);
    await env.DB.batch([env.DB.prepare("UPDATE organizations SET status=?,is_hidden=?,temporarily_closed=?,reopens_at=?,updated_at=? WHERE id=?").bind(status,isHidden,closed,reopens,now,id),audit(env,admin.id,"admin.entity.organization","organization",id,old,{status,is_hidden:isHidden,temporarily_closed:closed,reopens_at:reopens})]);
    return json({ok:true,status,isHidden:Boolean(isHidden),temporarilyClosed:Boolean(closed)});
  }
  if(type==="items"){
    const old=await env.DB.prepare("SELECT id,status,availability_status FROM items WHERE id=? AND deleted_at IS NULL").bind(id).first();if(!old)throw new LaunchError(404,"המוצר לא נמצא");
    const status=["pending","active","rejected","archived"].includes(b.status)?b.status:old.status,availability=["available","unavailable","reserved"].includes(b.availabilityStatus)?b.availabilityStatus:old.availability_status;
    await env.DB.batch([env.DB.prepare("UPDATE items SET status=?,availability_status=?,updated_at=? WHERE id=?").bind(status,availability,now,id),audit(env,admin.id,"admin.entity.item","item",id,old,{status,availability_status:availability})]);
    return json({ok:true,status,availabilityStatus:availability});
  }
  if(type==="support"){
    const old=await env.DB.prepare("SELECT id,status FROM support_tickets WHERE id=?").bind(id).first();if(!old)throw new LaunchError(404,"הפנייה לא נמצאה");
    const status=["open","waiting","closed","reopened"].includes(b.status)?b.status:old.status;
    await env.DB.batch([env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").bind(status,now,id),audit(env,admin.id,"admin.entity.support","support_ticket",id,old,{status})]);return json({ok:true,status});
  }
  throw new LaunchError(400,"סוג ישות אינו נתמך");
}


async function deleteAdminEntity(request,env,type,id){
  await requireAdmin(request,env);
  const now=new Date().toISOString();
  if(type==="users"){
    const old=await env.DB.prepare("SELECT id,email,deleted_at FROM users WHERE id=?").bind(id).first();
    if(!old||old.deleted_at)throw new LaunchError(404,"המשתמש לא נמצא");
    if(String(old.email||"").toLowerCase()==="netanelhirsh@gmail.com")throw new LaunchError(403,"אי אפשר למחוק את מנהל-העל הראשי");
    const result=await env.DB.prepare("UPDATE users SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(now,now,id).run();
    if(!result.success)throw new LaunchError(500,"מחיקת המשתמש נכשלה");
    return json({ok:true,deleted:true});
  }
  if(type==="organizations"){
    const old=await env.DB.prepare("SELECT id,deleted_at FROM organizations WHERE id=?").bind(id).first();
    if(!old||old.deleted_at)throw new LaunchError(404,"הגמ״ח לא נמצא");
    const results=await env.DB.batch([
      env.DB.prepare("UPDATE items SET deleted_at=COALESCE(deleted_at,?),updated_at=? WHERE organization_id=? AND deleted_at IS NULL").bind(now,now,id),
      env.DB.prepare("UPDATE organizations SET deleted_at=?,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(now,now,id)
    ]);
    if(results.some(result=>!result.success))throw new LaunchError(500,"מחיקת הגמ״ח והפריטים נכשלה");
    return json({ok:true,deleted:true,itemsDeleted:true});
  }
  throw new LaunchError(400,"מחיקה נתמכת רק למשתמשים ולגמ״חים");
}

async function operationalHealth(request,env){
  await requireAdmin(request,env);const now=Date.now();
  const archive=await monitorArchiveBackup(env,now);
  await refreshServerErrorAlert(env);
  const [failedQueue,failedOutbox,critical,totals,inventoryMismatch]=await env.DB.batch([
    env.DB.prepare("SELECT COUNT(*) AS count FROM notification_queue WHERE failed_at IS NOT NULL AND failed_at>=?").bind(new Date(now-86400000).toISOString()),
    env.DB.prepare("SELECT COUNT(*) AS count FROM notification_outbox WHERE status='failed' AND created_at>=?").bind(new Date(now-86400000).toISOString()),
    env.DB.prepare("SELECT * FROM system_alerts WHERE resolved_at IS NULL ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users,(SELECT COUNT(*) FROM organizations WHERE deleted_at IS NULL) AS organizations,(SELECT COUNT(*) FROM items WHERE deleted_at IS NULL) AS items,(SELECT COUNT(*) FROM loan_requests) AS loans"),
    env.DB.prepare("SELECT COUNT(*) AS count FROM items i WHERE (SELECT COUNT(*) FROM item_units u WHERE u.item_id=i.id AND u.status!=\'retired\')>i.quantity")
  ]);
  const latest=archive.latestBackup,backupAgeHours=archive.backupAgeHours;
  const services={email:Boolean(env.RESEND_API_KEY),turnstile:Boolean(env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY),push:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),encryption:String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"").length>=24,separateBackupStorage:Boolean(env.BACKUP_STORAGE)};
  const warnings=[];
  if(!latest||latest.status!=="completed"||backupAgeHours===null||backupAgeHours>30)warnings.push("backup");
  if(Number(failedQueue.results?.[0]?.count||0)+Number(failedOutbox.results?.[0]?.count||0)>0)warnings.push("notification_delivery");
  if((critical.results||[]).some(x=>x.severity==="critical"))warnings.push("critical_alert");
  if(!services.encryption)warnings.push("encryption");
  if(Number(inventoryMismatch.results?.[0]?.count||0)>0)warnings.push("inventory_serial_quantity_mismatch");
  const status=warnings.includes("critical_alert")||warnings.includes("encryption")?"critical":warnings.length?"warning":"healthy";
  const payload={status,warnings,latestBackup:latest,latestRestoreDrill:archive.latestVerification,backupSource:"github-archive",lastBackupAttempt:archive.status,failedNotifications24h:Number(failedQueue.results?.[0]?.count||0)+Number(failedOutbox.results?.[0]?.count||0),inventorySerialQuantityMismatch:Number(inventoryMismatch.results?.[0]?.count||0),alerts:critical.results||[],services,totals:totals.results?.[0]||{}};
  await env.DB.prepare("INSERT INTO operational_health_snapshots(id,status,payload_json) VALUES(?,?,?)").bind(crypto.randomUUID(),status,JSON.stringify(payload)).run().catch(()=>{});
  return json(payload);
}

async function resolveAlert(request,env,id){
  const admin=await requireAdmin(request,env),row=await env.DB.prepare("SELECT * FROM system_alerts WHERE id=?").bind(id).first();if(!row)throw new LaunchError(404,"ההתראה לא נמצאה");
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE id=?").bind(now,id),audit(env,admin.id,"system_alert.resolve","system_alert",id,{resolvedAt:row.resolved_at},{resolvedAt:now},null,{type:row.alert_type})]);return json({ok:true,resolvedAt:now})
}

async function queueAdminAlert(env,actorId,type,severity,title,details){
  const now=new Date().toISOString(),id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,?,?)").bind(id,type,severity,JSON.stringify({...details,title,actorId})).run().catch(()=>{});
  try{
    const admins=await env.DB.prepare("SELECT id FROM users WHERE role='admin' AND account_status='active'").all();
    for(const admin of admins.results||[])await env.DB.prepare("INSERT INTO notification_outbox(id,user_id,channel,event_type,subject,body,payload_json,scheduled_at,status) VALUES(?,?,?,?,?,?,?,?, 'pending')").bind(crypto.randomUUID(),admin.id,"email",type,title,JSON.stringify(details||{}),JSON.stringify(details||{}),now).run();
  }catch{}
  return id;
}

async function ensureAlert(env,type,severity,title,details){
  const existing=await env.DB.prepare("SELECT id FROM system_alerts WHERE alert_type=? AND resolved_at IS NULL AND created_at>=? LIMIT 1").bind(type,new Date(Date.now()-86400000).toISOString()).first();
  if(!existing)await queueAdminAlert(env,null,type,severity,title,details);
}
async function monitorOperations(env){
  await monitorArchiveBackup(env);
  const failed=await env.DB.prepare("SELECT COUNT(*) AS count FROM notification_queue WHERE failed_at IS NOT NULL AND failed_at>=?").bind(new Date(Date.now()-86400000).toISOString()).first().catch(()=>({count:0}));
  if(Number(failed?.count||0)>0)await ensureAlert(env,"notification_delivery_failed","warning","נכשלו משלוחי התראות ב-24 השעות האחרונות",{count:Number(failed.count)});
}

function csvCell(v){const s=String(v??"");return '"'+(/^[=+\-@]/.test(s)?("'"+s):s).replaceAll('"','""')+'"'}
async function adminExportCsv(request,env,url){
  await requireAdmin(request,env);
  const type=String(url.searchParams.get("type")||"users"),now=new Date().toISOString();
  let columns=[],rows=[];
  if(type==="users"){
    columns=["id","email","full_name","role","account_status","email_verified","created_at","last_login_at"];
    rows=(await env.DB.prepare("SELECT id,email,full_name,role,account_status,email_verified,created_at,last_login_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10000").all()).results||[];
  }else if(type==="organizations"){
    columns=["id","name","city","status","owner_id","created_at","updated_at"];
    rows=(await env.DB.prepare("SELECT id,name,city,status,owner_id,created_at,updated_at FROM organizations WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10000").all()).results||[];
  }else if(type==="items"){
    columns=["id","organization_id","title","category","condition","quantity","status","availability_status","city","created_at","updated_at"];
    rows=(await env.DB.prepare("SELECT id,organization_id,title,category,condition,quantity,status,availability_status,city,created_at,updated_at FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20000").all()).results||[];
  }else if(type==="loans"){
    columns=["id","item_id","borrower_id","status","workflow_status","quantity","requested_from","requested_until","branch_id","created_at","updated_at"];
    rows=(await env.DB.prepare("SELECT id,item_id,borrower_id,status,workflow_status,quantity,requested_from,requested_until,branch_id,created_at,updated_at FROM loan_requests ORDER BY created_at DESC LIMIT 20000").all()).results||[];
  }else if(type==="support"){
    columns=["id","ticket_number","user_id","name","email","subject","status","priority","assigned_to","created_at","updated_at"];
    rows=(await env.DB.prepare("SELECT id,ticket_number,user_id,name,email,subject,status,priority,assigned_to,created_at,updated_at FROM support_tickets ORDER BY updated_at DESC LIMIT 10000").all()).results||[];
  }else throw new LaunchError(400,"סוג הייצוא אינו נתמך");
  const csv=[columns.map(csvCell).join(","),...rows.map(r=>columns.map(c=>csvCell(r[c])).join(","))].join("\r\n");
  return new Response("\ufeff"+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="gmach-'+type+'-'+now.slice(0,10)+'.csv"',"Cache-Control":"no-store"}});
}

function xmlCell(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&apos;")}
async function adminExportXls(request,env,url){
  await requireAdmin(request,env);
  const type=String(url.searchParams.get("type")||"users"),now=new Date().toISOString();
  let columns=[],rows=[];
  if(type==="users"){columns=["id","email","full_name","role","account_status","email_verified","created_at","last_login_at"];rows=(await env.DB.prepare("SELECT id,email,full_name,role,account_status,email_verified,created_at,last_login_at FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 10000").all()).results||[]}
  else if(type==="organizations"){columns=["id","name","city","status","owner_id","created_at","updated_at"];rows=(await env.DB.prepare("SELECT id,name,city,status,owner_id,created_at,updated_at FROM organizations WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 10000").all()).results||[]}
  else if(type==="items"){columns=["id","organization_id","title","category","condition","quantity","status","availability_status","city","created_at","updated_at"];rows=(await env.DB.prepare("SELECT id,organization_id,title,category,condition,quantity,status,availability_status,city,created_at,updated_at FROM items WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20000").all()).results||[]}
  else if(type==="loans"){columns=["id","item_id","borrower_id","status","workflow_status","quantity","requested_from","requested_until","branch_id","created_at","updated_at"];rows=(await env.DB.prepare("SELECT id,item_id,borrower_id,status,workflow_status,quantity,requested_from,requested_until,branch_id,created_at,updated_at FROM loan_requests ORDER BY created_at DESC LIMIT 20000").all()).results||[]}
  else if(type==="support"){columns=["id","ticket_number","user_id","name","email","subject","status","priority","assigned_to","created_at","updated_at"];rows=(await env.DB.prepare("SELECT id,ticket_number,user_id,name,email,subject,status,priority,assigned_to,created_at,updated_at FROM support_tickets ORDER BY updated_at DESC LIMIT 10000").all()).results||[]}
  else throw new LaunchError(400,"סוג הייצוא אינו נתמך");
  const row=x=>"<Row>"+x.map(v=>"<Cell><Data ss:Type=\"String\">"+xmlCell(v)+"</Data></Cell>").join("")+"</Row>";
  const xml='<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="'+xmlCell(type)+'"><Table>'+row(columns)+rows.map(r=>row(columns.map(k=>r[k]))).join("")+"</Table></Worksheet></Workbook>";
  return new Response(xml,{headers:{"Content-Type":"application/vnd.ms-excel; charset=utf-8","Content-Disposition":'attachment; filename="gmach-'+type+'-'+now.slice(0,10)+'.xls"',"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}

export async function runLaunchReadinessMaintenance(env){
  await ensureLaunchReadinessSchema(env);
  // GitHub verifies the full ZIP archive; do not run legacy JSON restore drills.
  await monitorOperations(env);
}

export async function handleLaunchReadiness(request,env,ctx,url){
  try{
    const method=request.method.toUpperCase(),path=url.pathname;let m;
    if(method==="GET"&&path==="/api/admin/loan-requests")return adminLoans(request,env,url);
    if(method==="GET"&&(m=path.match(/^\/api\/admin\/loan-requests\/([^/]+)\/timeline$/)))return adminLoanTimeline(request,env,decodeURIComponent(m[1]));
    if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/loan-requests\/([^/]+)\/override$/)))return adminLoanOverride(request,env,decodeURIComponent(m[1]));
    if((method==="GET"||method==="PUT")&&(m=path.match(/^\/api\/branches\/([^/]+)\/inventory-workspace$/)))return branchInventoryWorkspace(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&(m=path.match(/^\/api\/branches\/([^/]+)\/management$/)))return branchManagement(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&path==="/api/admin/entities")return adminEntities(request,env,url);
    if(method==="GET"&&path==="/api/admin/export.csv")return adminExportCsv(request,env,url);
    if(method==="GET"&&path==="/api/admin/export.xls")return adminExportXls(request,env,url);
    if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/entities\/(users|organizations|items|support)\/([^/]+)$/)))return await patchAdminEntity(request,env,m[1],decodeURIComponent(m[2]));
    if(method==="DELETE"&&(m=path.match(/^\/api\/admin\/entities\/(users|organizations)\/([^/]+)$/)))return await deleteAdminEntity(request,env,m[1],decodeURIComponent(m[2]));
    if(method==="GET"&&path==="/api/admin/operations/health")return await operationalHealth(request,env);
    if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/operations\/alerts\/([^/]+)\/resolve$/)))return await resolveAlert(request,env,decodeURIComponent(m[1]));
    return null;
  }catch(e){if(e instanceof LaunchError)return json({error:e.message},e.status);console.error("Launch readiness route failed",{method:request.method,path:url.pathname,error:String(e?.message||e),stack:String(e?.stack||"")});return json({error:"פעולת הניהול נכשלה: "+String(e?.message||e).slice(0,300)},500)}
}
