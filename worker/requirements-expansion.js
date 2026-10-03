import { checkAvailabilityRules } from "./privacy-availability.js";

const SESSION_COOKIE="gmach_session";
class ExpansionError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...headers}});
let schemaPromise=null;
export async function ensureRequirementsExpansionSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const alters=[
      ["loan_requests","multi_range_batch_id","ALTER TABLE loan_requests ADD COLUMN multi_range_batch_id TEXT"],
      ["loan_requests","admin_previous_workflow_status","ALTER TABLE loan_requests ADD COLUMN admin_previous_workflow_status TEXT"],
      ["loan_requests","admin_hold_reason","ALTER TABLE loan_requests ADD COLUMN admin_hold_reason TEXT"],
      ["loan_requests","admin_hold_until","ALTER TABLE loan_requests ADD COLUMN admin_hold_until TEXT"]
    ];
    for(const [table,column,sql] of alters){
      const info=await env.DB.prepare("PRAGMA table_info("+table+")").all();
      if(!(info.results||[]).some(x=>x.name===column))await env.DB.prepare(sql).run();
    }
    const statements=[
      "CREATE TABLE IF NOT EXISTS admin_user_controls (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,action TEXT NOT NULL,reason TEXT,starts_at TEXT NOT NULL,ends_at TEXT,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),applied_at TEXT,restored_at TEXT,cancelled_at TEXT)",
      "CREATE TABLE IF NOT EXISTS admin_loan_holds (request_id TEXT PRIMARY KEY REFERENCES loan_requests(id) ON DELETE CASCADE,reason TEXT NOT NULL,hold_until TEXT,created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
      "CREATE INDEX IF NOT EXISTS admin_user_controls_due_idx ON admin_user_controls(cancelled_at,applied_at,restored_at,starts_at,ends_at)",
      "CREATE INDEX IF NOT EXISTS loan_multi_range_batch_idx ON loan_requests(multi_range_batch_id,created_at)"
    ];
    for(const sql of statements)await env.DB.prepare(sql).run();
    return true;
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}

function cookieValue(request,name){for(const part of String(request.headers.get("Cookie")||"").split(";")){const [key,...rest]=part.trim().split("=");if(key===name)return decodeURIComponent(rest.join("="));}return "";}
async function sha256(value){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));let binary="";for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");}
async function requireUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)throw new ExpansionError(401,"יש להתחבר");const hash=await sha256(token);const user=await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.account_status='active'").bind(hash,new Date().toISOString()).first();if(!user)throw new ExpansionError(401,"החיבור פג");return user;}
async function requireAdmin(request,env){const user=await requireUser(request,env);if(user.role!=="admin")throw new ExpansionError(403,"נדרשת הרשאת מנהל");if(Number(user.totp_enabled||0)!==1)throw new ExpansionError(403,"יש להפעיל אימות דו שלבי לפני כניסה להנהלת האתר");return user;}
async function readJson(request){let body;try{body=await request.json()}catch{throw new ExpansionError(400,"תוכן הבקשה אינו תקין")}return body&&typeof body==="object"?body:{};}
const optional=(v,max=500)=>{const s=String(v??"").trim();return s?s.slice(0,max):null};
function iso(v,label){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new ExpansionError(400,label+" אינו תקין");return d.toISOString();}
function csvCell(value){const raw=String(value??""),safe=/^[=+@\-\t\r]/.test(raw)?"'"+raw:raw;return '"'+safe.replaceAll('"','""')+'"';}
function audit(env,actorId,action,entityType,entityId,metadata={}){return env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),actorId,action,entityType,entityId,JSON.stringify(metadata));}

async function publicBranches(env,orgId){
  const org=await env.DB.prepare("SELECT id,name,status,is_hidden,temporarily_closed,reopens_at FROM organizations WHERE id=? AND deleted_at IS NULL").bind(orgId).first();
  if(!org||org.status!=="approved"||Number(org.is_hidden))throw new ExpansionError(404,"הגמ״ח לא נמצא");
  const rows=await env.DB.prepare(`
    SELECT b.id,b.name,b.address,b.city,b.latitude,b.longitude,b.phone,b.hours_json,b.status,b.reopens_at,b.inventory_mode,
      ROUND(AVG(r.branch_rating),1) AS rating,COUNT(r.branch_rating) AS review_count,
      (SELECT COUNT(*) FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.branch_id=b.id AND i.status='active' AND iu.status='available') AS available_units
    FROM organization_branches b
    LEFT JOIN reviews r ON r.branch_id=b.id AND r.status='published' AND r.branch_rating IS NOT NULL
    WHERE b.organization_id=? AND b.status!='archived'
    GROUP BY b.id ORDER BY CASE b.status WHEN 'active' THEN 0 ELSE 1 END,b.name
  `).bind(orgId).all();
  return json({organization:{id:org.id,name:org.name,temporarilyClosed:Boolean(org.temporarily_closed),reopensAt:org.reopens_at},branches:(rows.results||[]).map(x=>({...x,hours:safeJson(x.hours_json,{}),rating:x.rating===null?null:Number(x.rating),reviewCount:Number(x.review_count||0),availableUnits:Number(x.available_units||0)}))});
}

function safeJson(value,fallback){try{return JSON.parse(value||"")}catch{return fallback}}
async function availabilityForRange(env,itemId,from,until){
  const item=await env.DB.prepare("SELECT i.id,i.quantity,i.turnaround_minutes,i.availability_status,i.status,o.status AS org_status,o.is_hidden FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?").bind(itemId).first();
  const ruleCheck=await checkAvailabilityRules(env,itemId,from,until,null);if(!ruleCheck.allowed)return {item,available:0,ruleBlocked:true,reason:ruleCheck.reason};
  if(!item||item.status!=="active"||item.org_status!=="approved"||Number(item.is_hidden))throw new ExpansionError(404,"הפריט לא נמצא");
  const pad=Math.max(0,Number(item.turnaround_minutes||0))*60000;
  const paddedFrom=new Date(Date.parse(from)-pad).toISOString();
  const paddedUntil=new Date(Date.parse(until)+pad).toISOString();
  const booked=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) AS used FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?").bind(itemId,paddedUntil,paddedFrom).first();
  const blocked=await env.DB.prepare("SELECT COALESCE(SUM(quantity),0) AS used FROM inventory_blocks WHERE item_id=? AND starts_at<? AND ends_at>?").bind(itemId,paddedUntil.slice(0,16),paddedFrom.slice(0,16)).first().catch(()=>({used:0}));
  const available=item.availability_status==="unavailable"?0:Math.max(0,Number(item.quantity)-Number(booked?.used||0)-Number(blocked?.used||0));
  return {item,available};
}
function normalizeRanges(body){
  const ranges=Array.isArray(body.ranges)?body.ranges:[];
  if(!ranges.length||ranges.length>8)throw new ExpansionError(400,"אפשר לבחור בין טווח אחד לשמונה טווחים");
  return ranges.map((r,index)=>{
    const from=iso(r.from,"תחילת טווח "+(index+1)),until=iso(r.until,"סיום טווח "+(index+1));
    if(Date.parse(until)<=Date.parse(from))throw new ExpansionError(400,"סיום כל טווח חייב להיות אחרי תחילתו");
    return {from,until};
  });
}
async function multiRangeCheck(request,env,itemId){
  await requireUser(request,env);const body=await readJson(request),quantity=Math.max(1,Math.min(999,Number(body.quantity)||1)),ranges=normalizeRanges(body),results=[];
  for(const range of ranges){const x=await availabilityForRange(env,itemId,range.from,range.until);results.push({...range,availableQuantity:x.available,available:x.available>=quantity});}
  return json({itemId,quantity,allAvailable:results.every(x=>x.available),ranges:results});
}
async function multiRangeRequest(request,env,itemId){
  const user=await requireUser(request,env),body=await readJson(request),quantity=Math.max(1,Math.min(999,Number(body.quantity)||1)),ranges=normalizeRanges(body),phone=optional(body.phone,30)||user.phone;
  if(!phone)throw new ExpansionError(400,"נדרש מספר טלפון");
  const item=await env.DB.prepare("SELECT i.*,o.owner_id,o.name AS organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=? AND i.status='active' AND o.status='approved' AND o.is_hidden=0").bind(itemId).first();
  if(!item)throw new ExpansionError(404,"הפריט לא נמצא");if(item.owner_id===user.id)throw new ExpansionError(400,"אי אפשר להזמין פריט מהגמ״ח שלכם");
  for(const range of ranges){const x=await availabilityForRange(env,itemId,range.from,range.until);if(x.available<quantity)throw new ExpansionError(409,"אחד הטווחים כבר אינו זמין בכמות המבוקשת");}
  const batchId=crypto.randomUUID(),created=[],now=new Date().toISOString(),status=item.approval_mode==="automatic"?"approved":"pending";
  try{
    for(const range of ranges){
      const id=crypto.randomUUID();
      const result=await env.DB.prepare(`INSERT INTO loan_requests(id,item_id,borrower_id,requested_from,requested_until,phone,note,status,quantity,workflow_status,multi_range_batch_id,updated_at)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?
        WHERE (SELECT COALESCE(SUM(quantity),0) FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?) + ? <= ?`)
        .bind(id,itemId,user.id,range.from,range.until,phone,optional(body.note,500),status,quantity,status==="approved"?"approved_ready_for_pickup":"inventory_held",batchId,now,itemId,range.until,range.from,quantity,Number(item.quantity)).run();
      if(!result.meta.changes)throw new ExpansionError(409,"המלאי נתפס בזמן שליחת קבוצת הטווחים");
      created.push(id);
      await env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,"multi_range_created",user.id,"batch:"+batchId).run().catch(()=>{});
    }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),item.owner_id,"request","בקשת השאלה מרובת טווחים",user.full_name+" שלח/ה "+ranges.length+" טווחים עבור "+item.title),
      audit(env,user.id,"loan.multi_range.create","item",itemId,{batchId,count:ranges.length,quantity})
    ]);
    return json({batchId,requestIds:created,status,count:created.length},201);
  }catch(error){
    if(created.length)await env.DB.prepare("DELETE FROM loan_requests WHERE multi_range_batch_id=? AND borrower_id=?").bind(batchId,user.id).run().catch(()=>{});
    throw error;
  }
}

async function optionalReportQuery(env,sql,args=[]){
  try{const r=await env.DB.prepare(sql).bind(...args).all();return r.results||[]}
  catch(error){console.warn("Optional report source unavailable",String(error?.message||error).slice(0,240));return []}
}
async function myReports(request,env){
  const user=await requireUser(request,env);
  const [items,reviews,messages,content]=await Promise.all([
    optionalReportQuery(env,"SELECT 'item' AS type,r.id,r.item_id AS entity_id,i.title AS entity_title,r.reason,r.details,r.status,r.created_at FROM reports r LEFT JOIN items i ON i.id=r.item_id WHERE r.reporter_id=? ORDER BY r.created_at DESC LIMIT 100",[user.id]),
    optionalReportQuery(env,"SELECT 'review' AS type,rr.id,rr.review_id AS entity_id,COALESCE(i.title,o.name,'ביקורת') AS entity_title,rr.reason,NULL AS details,rr.status,rr.created_at FROM review_reports rr JOIN reviews rv ON rv.id=rr.review_id LEFT JOIN items i ON i.id=rv.item_id LEFT JOIN organizations o ON o.id=rv.organization_id WHERE rr.reporter_id=? ORDER BY rr.created_at DESC LIMIT 100",[user.id]),
    optionalReportQuery(env,"SELECT 'message' AS type,mr.id,mr.message_id AS entity_id,'הודעה בצ׳אט' AS entity_title,mr.reason,NULL AS details,mr.status,mr.created_at FROM message_reports mr WHERE mr.reporter_id=? ORDER BY mr.created_at DESC LIMIT 100",[user.id]),
    optionalReportQuery(env,"SELECT entity_type AS type,id,entity_id,entity_type AS entity_title,reason,NULL AS details,status,created_at FROM content_reports WHERE reporter_id=? ORDER BY created_at DESC LIMIT 100",[user.id])
  ]);
  const all=[...items,...reviews,...messages,...content].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,250);
  return json({reports:all,sources:{items:items.length,reviews:reviews.length,messages:messages.length,content:content.length}});
}

async function adminUserDetail(request,env,userId){
  await requireAdmin(request,env);
  const user=await env.DB.prepare("SELECT id,email,full_name,role,email_verified,account_status,totp_enabled,created_at,last_login_at,preferred_language FROM users WHERE id=?").bind(userId).first();
  if(!user)throw new ExpansionError(404,"המשתמש לא נמצא");
  const [sessions,security,loans,reviews,reports,memberships,controls,auditRows]=await env.DB.batch([
    env.DB.prepare("SELECT token_hash AS id,device_label,last_seen_at,created_at,expires_at FROM sessions WHERE user_id=? ORDER BY COALESCE(last_seen_at,created_at) DESC LIMIT 50").bind(userId),
    env.DB.prepare("SELECT id,event_type,severity,device_label,created_at FROM security_events WHERE user_id=? ORDER BY created_at DESC LIMIT 100").bind(userId),
    env.DB.prepare(`SELECT lr.id,lr.status,lr.workflow_status,lr.requested_from,lr.requested_until,lr.created_at,i.title,o.name AS organization_name,
      CASE WHEN lr.borrower_id=? THEN 'borrower' ELSE 'owner' END AS relation
      FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id
      WHERE lr.borrower_id=? OR o.owner_id=? ORDER BY lr.created_at DESC LIMIT 150`).bind(userId,userId,userId),
    env.DB.prepare("SELECT id,rating,item_rating,service_rating,status,created_at FROM reviews WHERE author_id=? ORDER BY created_at DESC LIMIT 100").bind(userId),
    env.DB.prepare("SELECT id,item_id,reason,status,created_at FROM reports WHERE reporter_id=? ORDER BY created_at DESC LIMIT 100").bind(userId),
    env.DB.prepare("SELECT m.organization_id,m.role,m.branch_scope_json,m.category_scope_json,o.name FROM organization_members m JOIN organizations o ON o.id=m.organization_id WHERE m.user_id=? ORDER BY o.name").bind(userId),
    env.DB.prepare("SELECT id,action,reason,starts_at,ends_at,created_at,applied_at,restored_at,cancelled_at FROM admin_user_controls WHERE user_id=? ORDER BY created_at DESC LIMIT 50").bind(userId),
    env.DB.prepare("SELECT id,action,entity_type,entity_id,created_at FROM audit_log WHERE actor_id=? ORDER BY created_at DESC LIMIT 100").bind(userId)
  ]);
  return json({user,sessions:sessions.results||[],securityEvents:security.results||[],loans:loans.results||[],reviews:reviews.results||[],reports:reports.results||[],memberships:memberships.results||[],controls:controls.results||[],audit:auditRows.results||[]});
}
async function adminUserControl(request,env,userId){
  const admin=await requireAdmin(request,env);if(admin.id===userId)throw new ExpansionError(400,"אי אפשר להשעות את החשבון שמחובר כרגע");
  const target=await env.DB.prepare("SELECT id,account_status FROM users WHERE id=?").bind(userId).first();if(!target)throw new ExpansionError(404,"המשתמש לא נמצא");
  const body=await readJson(request),action=String(body.action||""),reason=optional(body.reason,500),now=new Date().toISOString();
  if(action==="revoke_sessions"){await env.DB.batch([env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),audit(env,admin.id,"user.sessions.revoke","user",userId,{reason})]);return json({ok:true,accountStatus:target.account_status});}
  if(action==="restore"){await env.DB.batch([env.DB.prepare("UPDATE users SET account_status='active',updated_at=? WHERE id=?").bind(now,userId),env.DB.prepare("UPDATE admin_user_controls SET restored_at=COALESCE(restored_at,?),cancelled_at=COALESCE(cancelled_at,?) WHERE user_id=? AND restored_at IS NULL").bind(now,now,userId),audit(env,admin.id,"user.restore","user",userId,{reason})]);return json({ok:true,accountStatus:"active"});}
  if(action==="suspend_now"){const id=crypto.randomUUID(),endsAt=body.endsAt?iso(body.endsAt,"מועד סיום"):null;await env.DB.batch([env.DB.prepare("INSERT INTO admin_user_controls(id,user_id,action,reason,starts_at,ends_at,created_by,applied_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,userId,"suspend",reason,now,endsAt,admin.id,now),env.DB.prepare("UPDATE users SET account_status='suspended',updated_at=? WHERE id=?").bind(now,userId),env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(userId),audit(env,admin.id,"user.suspend","user",userId,{reason,endsAt})]);return json({ok:true,controlId:id,accountStatus:"suspended"});}
  if(action==="schedule_suspend"){const startsAt=iso(body.startsAt,"מועד התחלה"),endsAt=body.endsAt?iso(body.endsAt,"מועד סיום"):null;if(endsAt&&Date.parse(endsAt)<=Date.parse(startsAt))throw new ExpansionError(400,"מועד הסיום חייב להיות אחרי מועד ההתחלה");const id=crypto.randomUUID();await env.DB.batch([env.DB.prepare("INSERT INTO admin_user_controls(id,user_id,action,reason,starts_at,ends_at,created_by) VALUES(?,?,?,?,?,?,?)").bind(id,userId,"suspend",reason,startsAt,endsAt,admin.id),audit(env,admin.id,"user.suspension.schedule","user",userId,{startsAt,endsAt,reason})]);return json({ok:true,controlId:id,scheduled:true});}
  throw new ExpansionError(400,"פעולת המשתמש אינה תקינה");
}

async function adminLoanControl(request,env,requestId){
  const admin=await requireAdmin(request,env),body=await readJson(request),action=String(body.action||""),row=await env.DB.prepare("SELECT id,status,workflow_status FROM loan_requests WHERE id=?").bind(requestId).first();
  if(!row)throw new ExpansionError(404,"ההשאלה לא נמצאה");
  if(action==="suspend"){const reason=optional(body.reason,500)||"הושהה על ידי הנהלת האתר",holdUntil=body.holdUntil?iso(body.holdUntil,"מועד סיום"):null,now=new Date().toISOString();await env.DB.batch([env.DB.prepare("INSERT INTO admin_loan_holds(request_id,reason,hold_until,created_by) VALUES(?,?,?,?) ON CONFLICT(request_id) DO UPDATE SET reason=excluded.reason,hold_until=excluded.hold_until,created_by=excluded.created_by,created_at=CURRENT_TIMESTAMP").bind(requestId,reason,holdUntil,admin.id),env.DB.prepare("UPDATE loan_requests SET admin_previous_workflow_status=COALESCE(admin_previous_workflow_status,workflow_status),workflow_status='admin_suspended',admin_hold_reason=?,admin_hold_until=?,updated_at=? WHERE id=?").bind(reason,holdUntil,now,requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"admin_suspended",admin.id,reason),audit(env,admin.id,"loan.suspend","loan_request",requestId,{reason,holdUntil})]);return json({ok:true,workflowStatus:"admin_suspended"});}
  if(action==="resume"){const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("DELETE FROM admin_loan_holds WHERE request_id=?").bind(requestId),env.DB.prepare("UPDATE loan_requests SET workflow_status=COALESCE(admin_previous_workflow_status,CASE status WHEN 'collected' THEN 'awaiting_return' WHEN 'approved' THEN 'approved_ready_for_pickup' ELSE 'inventory_held' END),admin_previous_workflow_status=NULL,admin_hold_reason=NULL,admin_hold_until=NULL,updated_at=? WHERE id=?").bind(now,requestId),env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),requestId,"admin_resumed",admin.id,optional(body.reason,500)),audit(env,admin.id,"loan.resume","loan_request",requestId,{})]);return json({ok:true,resumed:true});}
  throw new ExpansionError(400,"פעולת ההשאלה אינה תקינה");
}
async function auditCsv(request,env,url){
  await requireAdmin(request,env);const action=optional(url.searchParams.get("action"),120),entityType=optional(url.searchParams.get("entity_type"),80),actor=optional(url.searchParams.get("actor_id"),100),from=optional(url.searchParams.get("from"),40),to=optional(url.searchParams.get("to"),40),where=["1=1"],args=[];
  if(action){where.push("a.action LIKE ?");args.push("%"+action+"%")}if(entityType){where.push("a.entity_type=?");args.push(entityType)}if(actor){where.push("a.actor_id=?");args.push(actor)}if(from){where.push("a.created_at>=?");args.push(iso(from,"מתאריך"))}if(to){where.push("a.created_at<=?");args.push(iso(to,"עד תאריך"))}
  const rows=await env.DB.prepare(`SELECT a.id,a.created_at,a.action,a.entity_type,a.entity_id,a.branch_id,a.actor_id,u.email AS actor_email,a.device_label,a.old_value_json,a.new_value_json,a.metadata_json FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id WHERE ${where.join(" AND ")} ORDER BY a.created_at DESC LIMIT 20000`).bind(...args).all();
  const cols=["id","created_at","action","entity_type","entity_id","branch_id","actor_id","actor_email","device_label","old_value_json","new_value_json","metadata_json"],csv="\ufeff"+[cols,...(rows.results||[]).map(r=>cols.map(k=>r[k]))].map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="gmach-audit.csv"',"Cache-Control":"no-store"}});
}

export async function requirementsExpansionPreflight(request,env,url){
  if(!url.pathname.startsWith("/api/loan-requests/")||["GET","HEAD"].includes(request.method.toUpperCase()))return null;
  if(url.pathname.includes("/admin-control"))return null;
  const match=url.pathname.match(/^\/api\/loan-requests\/([^/]+)/);if(!match)return null;
  await ensureRequirementsExpansionSchema(env);
  const hold=await env.DB.prepare("SELECT reason,hold_until FROM admin_loan_holds WHERE request_id=?").bind(decodeURIComponent(match[1])).first();
  if(!hold)return null;if(hold.hold_until&&Date.parse(hold.hold_until)<=Date.now()){await releaseExpiredLoanHold(env,decodeURIComponent(match[1]));return null;}
  return json({error:"ההשאלה הושהתה זמנית על ידי הנהלת האתר",adminSuspended:true,reason:hold.reason,holdUntil:hold.hold_until},423);
}

async function releaseExpiredLoanHold(env,requestId){
  const now=new Date().toISOString();await env.DB.batch([env.DB.prepare("DELETE FROM admin_loan_holds WHERE request_id=?").bind(requestId),env.DB.prepare("UPDATE loan_requests SET workflow_status=COALESCE(admin_previous_workflow_status,CASE status WHEN 'collected' THEN 'awaiting_return' WHEN 'approved' THEN 'approved_ready_for_pickup' ELSE 'inventory_held' END),admin_previous_workflow_status=NULL,admin_hold_reason=NULL,admin_hold_until=NULL,updated_at=? WHERE id=?").bind(now,requestId)]).catch(()=>{});
}

export async function runRequirementsExpansionMaintenance(env){
  await ensureRequirementsExpansionSchema(env);const now=new Date().toISOString();
  const due=await env.DB.prepare("SELECT id,user_id,ends_at FROM admin_user_controls WHERE cancelled_at IS NULL AND applied_at IS NULL AND starts_at<=? ORDER BY starts_at LIMIT 100").bind(now).all();
  for(const row of due.results||[])await env.DB.batch([env.DB.prepare("UPDATE users SET account_status='suspended',updated_at=? WHERE id=?").bind(now,row.user_id),env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(row.user_id),env.DB.prepare("UPDATE admin_user_controls SET applied_at=? WHERE id=? AND applied_at IS NULL").bind(now,row.id)]).catch(()=>{});
  const restore=await env.DB.prepare("SELECT id,user_id FROM admin_user_controls WHERE cancelled_at IS NULL AND applied_at IS NOT NULL AND restored_at IS NULL AND ends_at IS NOT NULL AND ends_at<=? ORDER BY ends_at LIMIT 100").bind(now).all();
  for(const row of restore.results||[])await env.DB.batch([env.DB.prepare("UPDATE users SET account_status='active',updated_at=? WHERE id=?").bind(now,row.user_id),env.DB.prepare("UPDATE admin_user_controls SET restored_at=? WHERE id=?").bind(now,row.id)]).catch(()=>{});
  const expired=await env.DB.prepare("SELECT request_id FROM admin_loan_holds WHERE hold_until IS NOT NULL AND hold_until<=? LIMIT 100").bind(now).all();
  for(const row of expired.results||[])await releaseExpiredLoanHold(env,row.request_id);
}

export async function handleRequirementsExpansion(request,env,ctx,url){
  const method=request.method.toUpperCase(),path=url.pathname;
  try{
    let m;
    if(method==="GET"&&(m=path.match(/^\/api\/organizations\/([^/]+)\/branches-public$/)))return publicBranches(env,decodeURIComponent(m[1]));
    if(method==="POST"&&(m=path.match(/^\/api\/items\/([^/]+)\/multi-range-check$/)))return multiRangeCheck(request,env,decodeURIComponent(m[1]));
    if(method==="POST"&&(m=path.match(/^\/api\/items\/([^/]+)\/multi-range-request$/)))return multiRangeRequest(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&path==="/api/me/reports")return myReports(request,env);
    if(method==="GET"&&(m=path.match(/^\/api\/admin\/users\/([^/]+)\/full$/)))return adminUserDetail(request,env,decodeURIComponent(m[1]));
    if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/users\/([^/]+)\/control$/)))return adminUserControl(request,env,decodeURIComponent(m[1]));
    if(method==="PATCH"&&(m=path.match(/^\/api\/admin\/loan-requests\/([^/]+)\/control$/)))return adminLoanControl(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&path==="/api/admin/audit/export.csv")return auditCsv(request,env,url);
    return null;
  }catch(error){
    if(error instanceof ExpansionError)return json({error:error.message},error.status);
    throw error;
  }
}
