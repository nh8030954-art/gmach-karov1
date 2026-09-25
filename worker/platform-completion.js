const SESSION_COOKIE = "gmach_session";

class PlatformError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }
});

function clean(value, min = 0, max = 500, label = "ערך") {
  const text = String(value ?? "").trim();
  if (text.length < min || text.length > max) throw new PlatformError(400, `${label} אינו תקין`);
  return text;
}

function optional(value, max = 1000) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (text.length > max) throw new PlatformError(400, "הטקסט ארוך מדי");
  return text;
}

async function bodyJson(request) {
  try { return await request.json(); }
  catch { throw new PlatformError(400, "גוף הבקשה אינו JSON תקין"); }
}

function cookie(request, name) {
  for (const part of String(request.headers.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function b64(bytes) {
  let out = "";
  for (const byte of bytes) out += String.fromCharCode(byte);
  return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
}

async function hash(value) {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)))));
}

async function currentUser(request, env) {
  const token = cookie(request, SESSION_COOKIE);
  if (!token) return null;
  const tokenHash = await hash(token);
  const user = await env.DB.prepare(`SELECT u.*,s.token_hash AS current_session_hash
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at>?`).bind(tokenHash,new Date().toISOString()).first();
  return user || null;
}

async function requireUser(request, env) {
  const user = await currentUser(request, env);
  if (!user) throw new PlatformError(401,"יש להתחבר כדי להמשיך");
  if (user.account_status === "suspended") throw new PlatformError(403,"החשבון מושעה");
  return user;
}

async function requireAdmin(request, env) {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new PlatformError(403,"נדרשת הרשאת מנהל");
  return user;
}

async function encrypt(value, env) {
  const secret=String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"");
  if(secret.length<24) throw new PlatformError(503,"מפתח הצפנת הנתונים הפרטיים אינו מוגדר");
  const keyBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv},key,new TextEncoder().encode(value)));
  return `v1.${b64(iv)}.${b64(data)}`;
}

function fromB64(value) {
  let s=String(value).replaceAll("-","+").replaceAll("_","/");
  while(s.length%4)s+="=";
  const binary=atob(s),out=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);
  return out;
}

async function decrypt(value, env) {
  if(!value) return "";
  const [version,ivPart,dataPart]=String(value).split(".");
  if(version!=="v1"||!ivPart||!dataPart) return "";
  try{
    const secret=String(env.DATA_ENCRYPTION_KEY||env.RESEND_API_KEY||"");
    const keyBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(secret));
    const key=await crypto.subtle.importKey("raw",keyBytes,{name:"AES-GCM"},false,["decrypt"]);
    const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(ivPart)},key,fromB64(dataPart));
    return new TextDecoder().decode(plain);
  }catch{return "";}
}

function safeJson(value, fallback = {}) {
  try { const parsed=JSON.parse(value||""); return parsed && typeof parsed==="object" ? parsed : fallback; }
  catch { return fallback; }
}

async function orgAccess(request, env, organizationId, roles = ["owner","requests","inventory","reports"]) {
  const user=await requireUser(request,env);
  if(user.role==="admin") return {user,role:"admin"};
  const org=await env.DB.prepare("SELECT owner_id FROM organizations WHERE id=? AND deleted_at IS NULL").bind(organizationId).first();
  if(!org) throw new PlatformError(404,"הגמ״ח לא נמצא");
  if(org.owner_id===user.id) return {user,role:"owner"};
  const member=await env.DB.prepare("SELECT role,branch_scope_json,category_scope_json FROM organization_members WHERE organization_id=? AND user_id=? AND (expires_at IS NULL OR expires_at>?)")
    .bind(organizationId,user.id,new Date().toISOString()).first();
  if(!member || !roles.includes(member.role)) throw new PlatformError(403,"אין הרשאה לפעולה");
  return {user,role:member.role,member};
}

async function loanAccess(request, env, requestId) {
  const user=await requireUser(request,env);
  const loan=await env.DB.prepare(`SELECT lr.*,i.organization_id,o.owner_id
    FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`).bind(requestId).first();
  if(!loan) throw new PlatformError(404,"ההשאלה לא נמצאה");
  if(user.role!=="admin" && user.id!==loan.borrower_id && user.id!==loan.owner_id) {
    const member=await env.DB.prepare("SELECT 1 FROM organization_members WHERE organization_id=? AND user_id=?").bind(loan.organization_id,user.id).first();
    if(!member) throw new PlatformError(403,"אין הרשאה להשאלה");
  }
  return {user,loan};
}

function haversine(lat1,lon1,lat2,lon2){
  const R=6371,toRad=v=>Number(v)*Math.PI/180;
  const dLat=toRad(lat2)-toRad(lat1),dLon=toRad(lon2)-toRad(lon1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}

function levenshtein(a,b){
  a=String(a||"").toLowerCase();b=String(b||"").toLowerCase();
  const m=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
  for(let i=0;i<=a.length;i++)m[i][0]=i;for(let j=0;j<=b.length;j++)m[0][j]=j;
  for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)m[i][j]=Math.min(m[i-1][j]+1,m[i][j-1]+1,m[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
  return m[a.length][b.length];
}

async function listAddresses(request,env){
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare("SELECT id,label,address_cipher,city,latitude,longitude,is_default,created_at,updated_at FROM user_addresses WHERE user_id=? ORDER BY is_default DESC,created_at").bind(user.id).all();
  const addresses=[];
  for(const row of rows.results) addresses.push({id:row.id,label:row.label,address:await decrypt(row.address_cipher,env),city:row.city,latitude:row.latitude,longitude:row.longitude,isDefault:Boolean(row.is_default),createdAt:row.created_at,updatedAt:row.updated_at});
  return json({addresses});
}

async function saveAddress(request,env,id=null){
  const user=await requireUser(request,env),body=await bodyJson(request);
  const address=clean(body.address,5,180,"כתובת"),city=clean(body.city,2,80,"עיר"),label=clean(body.label||"בית",1,40,"שם הכתובת");
  const cipher=await encrypt(address,env),lat=Number.isFinite(Number(body.latitude))?Number(body.latitude):null,lon=Number.isFinite(Number(body.longitude))?Number(body.longitude):null;
  const isDefault=body.isDefault===true?1:0,now=new Date().toISOString();
  if(isDefault) await env.DB.prepare("UPDATE user_addresses SET is_default=0 WHERE user_id=?").bind(user.id).run();
  if(id){
    const found=await env.DB.prepare("SELECT id FROM user_addresses WHERE id=? AND user_id=?").bind(id,user.id).first();
    if(!found) throw new PlatformError(404,"הכתובת לא נמצאה");
    await env.DB.prepare("UPDATE user_addresses SET label=?,address_cipher=?,city=?,latitude=?,longitude=?,is_default=?,updated_at=? WHERE id=? AND user_id=?")
      .bind(label,cipher,city,lat,lon,isDefault,now,id,user.id).run();
    return json({ok:true,id});
  }
  id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO user_addresses(id,user_id,label,address_cipher,city,latitude,longitude,is_default,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id,user.id,label,cipher,city,lat,lon,isDefault,now).run();
  return json({ok:true,id},201);
}

async function deleteAddress(request,env,id){
  const user=await requireUser(request,env);
  await env.DB.prepare("DELETE FROM user_addresses WHERE id=? AND user_id=?").bind(id,user.id).run();
  return json({ok:true});
}

async function deleteSession(request,env,key){
  const user=await requireUser(request,env);
  const current=user.current_session_hash;
  const row=await env.DB.prepare("SELECT token_hash FROM sessions WHERE user_id=? AND substr(token_hash,1,12)=?").bind(user.id,key).first();
  if(!row) throw new PlatformError(404,"המכשיר לא נמצא");
  if(row.token_hash===current) throw new PlatformError(409,"את המכשיר הנוכחי מנתקים באמצעות יציאה מהחשבון");
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash=? AND user_id=?").bind(row.token_hash,user.id).run();
  return json({ok:true});
}

async function cancelDeletion(request,env){
  const user=await requireUser(request,env);
  if(!user.deletion_requested_at) return json({ok:true,cancelled:false});
  await env.DB.prepare("UPDATE users SET deletion_requested_at=NULL,updated_at=? WHERE id=? AND deleted_at IS NULL").bind(new Date().toISOString(),user.id).run();
  return json({ok:true,cancelled:true});
}

async function saveUserPreferences(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request);
  const language=body.language==="en"?"en":"he";
  const navigation=["google","waze","apple"].includes(body.navigation)?body.navigation:"google";
  const tour=body.tourCompleted===true?1:0,quiet=body.quietHoursEnabled===true?1:0;
  const time=v=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v||""))?String(v):null;
  await env.DB.prepare("UPDATE users SET preferred_language=?,navigation_preference=?,tour_completed=?,quiet_hours_enabled=?,quiet_start=?,quiet_end=?,updated_at=? WHERE id=?")
    .bind(language,navigation,tour,quiet,time(body.quietStart),time(body.quietEnd),new Date().toISOString(),user.id).run();
  return json({ok:true});
}

async function exportMyData(request,env){
  const user=await requireUser(request,env);
  const tables={
    profile: await env.DB.prepare("SELECT id,email,full_name,phone,city,preferred_language,created_at,last_login_at,deletion_requested_at FROM users WHERE id=?").bind(user.id).first(),
    organizations:(await env.DB.prepare("SELECT * FROM organizations WHERE owner_id=?").bind(user.id).all()).results,
    requests:(await env.DB.prepare("SELECT * FROM loan_requests WHERE borrower_id=?").bind(user.id).all()).results,
    reviews:(await env.DB.prepare("SELECT * FROM reviews WHERE author_id=?").bind(user.id).all()).results,
    helpRequests:(await env.DB.prepare("SELECT * FROM help_requests WHERE requester_id=?").bind(user.id).all()).results,
    notifications:(await env.DB.prepare("SELECT * FROM notifications WHERE user_id=?").bind(user.id).all()).results,
    savedSearches:(await env.DB.prepare("SELECT * FROM saved_searches WHERE user_id=?").bind(user.id).all()).results
  };
  return json({exportedAt:new Date().toISOString(),...tables});
}

async function createDataRequest(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request),type=["access","correction","export"].includes(body.type)?body.type:"access",id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO data_subject_requests(id,user_id,request_type,details) VALUES(?,?,?,?)").bind(id,user.id,type,optional(body.details,2000)).run();
  return json({request:{id,type,status:"open"}},201);
}

async function deleteSavedSearch(request,env,id){
  const user=await requireUser(request,env);
  await env.DB.prepare("DELETE FROM saved_searches WHERE id=? AND user_id=?").bind(id,user.id).run();
  return json({ok:true});
}

async function updateBranch(request,env,orgId,branchId){
  await orgAccess(request,env,orgId,["owner","inventory"]);
  const body=await bodyJson(request),status=["active","temporarily_closed","archived"].includes(body.status)?body.status:"active";
  const mode=["separate","shared","hybrid"].includes(body.inventoryMode)?body.inventoryMode:"separate";
  await env.DB.prepare(`UPDATE organization_branches SET name=?,address=?,city=?,latitude=?,longitude=?,phone=?,hours_json=?,inventory_mode=?,status=?,reopens_at=?,updated_at=? WHERE id=? AND organization_id=?`)
    .bind(clean(body.name,2,80,"שם"),clean(body.address,5,180,"כתובת"),clean(body.city,2,80,"עיר"),Number.isFinite(Number(body.latitude))?Number(body.latitude):null,Number.isFinite(Number(body.longitude))?Number(body.longitude):null,optional(body.phone,30),JSON.stringify(body.hours||{}),mode,status,optional(body.reopensAt,40),new Date().toISOString(),branchId,orgId).run();
  return json({ok:true});
}

async function deleteBranch(request,env,orgId,branchId){
  await orgAccess(request,env,orgId,["owner"]);
  const active=await env.DB.prepare(`SELECT 1 FROM loan_requests WHERE branch_id=? AND status IN ('pending','approved','collected') LIMIT 1`).bind(branchId).first();
  if(active) throw new PlatformError(409,"אי אפשר לארכב סניף עם השאלה פעילה");
  await env.DB.prepare("UPDATE organization_branches SET status='archived',updated_at=? WHERE id=? AND organization_id=?").bind(new Date().toISOString(),branchId,orgId).run();
  return json({ok:true});
}

async function closeOrganization(request,env,orgId){
  const {user}=await orgAccess(request,env,orgId,["owner"]),body=await bodyJson(request);
  const closed=body.closed===true,reopens=closed?optional(body.reopensAt,40):null;
  await env.DB.prepare("UPDATE organizations SET temporarily_closed=?,reopens_at=?,updated_at=? WHERE id=?").bind(closed?1:0,reopens,new Date().toISOString(),orgId).run();
  if(closed){
    const borrowers=await env.DB.prepare(`SELECT DISTINCT lr.borrower_id,lr.id FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? AND lr.status IN ('pending','approved')`).bind(orgId).all();
    for(const row of borrowers.results) await env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,'system',?,?,?)").bind(crypto.randomUUID(),row.borrower_id,"הגמ״ח נסגר זמנית",reopens?`הגמ״ח סגור זמנית עד ${reopens}`:"הגמ״ח סגור זמנית. נעדכן כשייפתח מחדש.",row.id).run();
  }
  await env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),user.id,closed?"organization.close":"organization.reopen","organization",orgId,JSON.stringify({reopensAt:reopens})).run();
  return json({ok:true,closed,reopensAt:reopens});
}

async function requestOrganizationDeletion(request,env,orgId){
  await orgAccess(request,env,orgId,["owner"]);
  const body=await bodyJson(request),org=await env.DB.prepare("SELECT name FROM organizations WHERE id=?").bind(orgId).first();
  if(!org) throw new PlatformError(404,"הגמ״ח לא נמצא");
  if(String(body.confirmName||"").trim()!==org.name || String(body.confirmText||"").trim()!=="מחיקה") throw new PlatformError(400,"אישור המחיקה אינו תואם");
  const active=await env.DB.prepare(`SELECT COUNT(*) AS count FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? AND lr.status='collected'`).bind(orgId).first();
  const now=new Date().toISOString();
  await env.DB.prepare("UPDATE organizations SET deletion_requested_at=?,is_hidden=1,updated_at=? WHERE id=?").bind(now,now,orgId).run();
  await env.DB.prepare("UPDATE organization_invitations SET cancelled_at=COALESCE(cancelled_at,?) WHERE organization_id=? AND accepted_at IS NULL").bind(now,orgId).run();
  return json({ok:true,deletionRequestedAt:now,hidden:true,waitingForReturns:Number(active?.count||0)>0});
}

async function cancelOrganizationDeletion(request,env,orgId){
  await orgAccess(request,env,orgId,["owner"]);
  await env.DB.prepare("UPDATE organizations SET deletion_requested_at=NULL,is_hidden=0,updated_at=? WHERE id=?").bind(new Date().toISOString(),orgId).run();
  return json({ok:true});
}

async function ownershipTransfer(request,env,orgId){
  const {user}=await orgAccess(request,env,orgId,["owner"]),body=await bodyJson(request),email=clean(body.email,5,160,"אימייל").toLowerCase();
  const target=await env.DB.prepare("SELECT id,full_name,email FROM users WHERE email=? COLLATE NOCASE AND deleted_at IS NULL").bind(email).first();
  if(!target) throw new PlatformError(404,"לא נמצא משתמש רשום עם האימייל הזה");
  if(target.id===user.id) throw new PlatformError(400,"הבעלות כבר שלכם");
  await env.DB.prepare("UPDATE ownership_transfers SET status='cancelled' WHERE organization_id=? AND status='pending'").bind(orgId).run();
  const id=crypto.randomUUID(),expires=new Date(Date.now()+7*86400000).toISOString();
  await env.DB.prepare("INSERT INTO ownership_transfers(id,organization_id,from_user_id,to_user_id,expires_at) VALUES(?,?,?,?,?)").bind(id,orgId,user.id,target.id,expires).run();
  await env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'system',?,?)").bind(crypto.randomUUID(),target.id,"הזמנה לקבלת בעלות","נשלחה אליך בקשה להעברת בעלות על גמ״ח.").run();
  return json({transfer:{id,to:target.full_name,expiresAt:expires}},201);
}

async function acceptOwnership(request,env,id){
  const user=await requireUser(request,env);
  const row=await env.DB.prepare("SELECT * FROM ownership_transfers WHERE id=? AND status='pending' AND expires_at>?").bind(id,new Date().toISOString()).first();
  if(!row||row.to_user_id!==user.id) throw new PlatformError(404,"העברת הבעלות אינה זמינה");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE organizations SET owner_id=?,updated_at=? WHERE id=?").bind(user.id,now,row.organization_id),
    env.DB.prepare("INSERT OR REPLACE INTO organization_members(organization_id,user_id,role,branch_scope_json,category_scope_json,created_at) VALUES(?,?,'owner','[]','[]',?)").bind(row.organization_id,user.id,now),
    env.DB.prepare("UPDATE ownership_transfers SET status='accepted',accepted_at=? WHERE id=?").bind(now,id)
  ]);
  return json({ok:true,organizationId:row.organization_id});
}

async function createInvitation(request,env,orgId){
  const {user}=await orgAccess(request,env,orgId,["owner"]),body=await bodyJson(request),email=clean(body.email,5,160,"אימייל").toLowerCase();
  const role=["requests","inventory","reports"].includes(body.role)?body.role:"requests";
  const token=crypto.randomUUID()+crypto.randomUUID(),tokenHash=await hash(token),id=crypto.randomUUID(),expires=new Date(Date.now()+Math.min(30,Math.max(1,Number(body.expiresDays)||7))*86400000).toISOString();
  await env.DB.prepare("INSERT INTO organization_invitations(id,organization_id,token_hash,role,branch_scope_json,category_scope_json,message,invited_by,expires_at,invitee_email) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .bind(id,orgId,tokenHash,role,JSON.stringify(body.branchIds||[]),JSON.stringify(body.categoryIds||[]),optional(body.message,500),user.id,expires,email).run();
  return json({invitation:{id,email,role,token,expiresAt:expires}},201);
}

async function listInvitations(request,env,orgId){
  await orgAccess(request,env,orgId,["owner"]);
  const rows=await env.DB.prepare("SELECT id,role,branch_scope_json,category_scope_json,message,expires_at,accepted_at,cancelled_at,created_at,invitee_email FROM organization_invitations WHERE organization_id=? ORDER BY created_at DESC").bind(orgId).all();
  return json({invitations:rows.results.map(r=>({...r,branchScopes:safeJson(r.branch_scope_json,[]),categoryScopes:safeJson(r.category_scope_json,[])}))});
}

async function cancelInvitation(request,env,id){
  const user=await requireUser(request,env);
  const row=await env.DB.prepare("SELECT organization_id FROM organization_invitations WHERE id=?").bind(id).first();
  if(!row) throw new PlatformError(404,"ההזמנה לא נמצאה");
  await orgAccess(request,env,row.organization_id,["owner"]);
  await env.DB.prepare("UPDATE organization_invitations SET cancelled_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
  return json({ok:true});
}

async function updateMember(request,env,orgId,userId){
  await orgAccess(request,env,orgId,["owner"]);
  const body=await bodyJson(request),role=["requests","inventory","reports"].includes(body.role)?body.role:"requests";
  await env.DB.prepare("UPDATE organization_members SET role=?,branch_scope_json=?,category_scope_json=?,expires_at=? WHERE organization_id=? AND user_id=?")
    .bind(role,JSON.stringify(body.branchIds||[]),JSON.stringify(body.categoryIds||[]),optional(body.expiresAt,40),orgId,userId).run();
  return json({ok:true});
}

async function suggestCategory(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request),id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO category_suggestions(id,organization_id,suggested_by,parent_category_id,name,description) VALUES(?,?,?,?,?,?)")
    .bind(id,optional(body.organizationId,100),user.id,optional(body.parentCategoryId,100),clean(body.name,2,80,"קטגוריה"),optional(body.description,500)).run();
  return json({suggestion:{id,status:"pending"}},201);
}

async function adminCategories(request,env){
  await requireAdmin(request,env);
  const rows=await env.DB.prepare("SELECT * FROM categories ORDER BY sort_order,name_he").all();
  const suggestions=await env.DB.prepare("SELECT cs.*,u.full_name FROM category_suggestions cs JOIN users u ON u.id=cs.suggested_by ORDER BY cs.created_at DESC LIMIT 200").all();
  return json({categories:rows.results,suggestions:suggestions.results});
}

async function createCategory(request,env){
  await requireAdmin(request,env);const body=await bodyJson(request),id=clean(body.id||crypto.randomUUID(),2,100,"מזהה");
  await env.DB.prepare("INSERT INTO categories(id,parent_id,name_he,name_en,icon,image_url,synonyms_json,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?)")
    .bind(id,optional(body.parentId,100),clean(body.nameHe,2,80,"שם בעברית"),optional(body.nameEn,80),optional(body.icon,40),optional(body.imageUrl,500),JSON.stringify(body.synonyms||[]),body.status==="hidden"?"hidden":"active",Number(body.sortOrder)||0).run();
  return json({category:{id}},201);
}

async function updateCategory(request,env,id){
  await requireAdmin(request,env);const body=await bodyJson(request);
  await env.DB.prepare("UPDATE categories SET parent_id=?,name_he=?,name_en=?,icon=?,image_url=?,synonyms_json=?,status=?,sort_order=?,updated_at=? WHERE id=?")
    .bind(optional(body.parentId,100),clean(body.nameHe,2,80,"שם בעברית"),optional(body.nameEn,80),optional(body.icon,40),optional(body.imageUrl,500),JSON.stringify(body.synonyms||[]),["active","hidden","pending"].includes(body.status)?body.status:"active",Number(body.sortOrder)||0,new Date().toISOString(),id).run();
  return json({ok:true});
}

async function moderateCategorySuggestion(request,env,id){
  const admin=await requireAdmin(request,env),body=await bodyJson(request),status=body.status==="approved"?"approved":"rejected";
  const suggestion=await env.DB.prepare("SELECT * FROM category_suggestions WHERE id=?").bind(id).first();
  if(!suggestion) throw new PlatformError(404,"ההצעה לא נמצאה");
  if(status==="approved"){
    const categoryId=String(suggestion.name).toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9א-ת-]/g,"").slice(0,60)||crypto.randomUUID();
    await env.DB.prepare("INSERT OR IGNORE INTO categories(id,parent_id,name_he,status,sort_order) VALUES(?,?,?,'active',999)").bind(categoryId,suggestion.parent_category_id,suggestion.name).run();
  }
  await env.DB.prepare("UPDATE category_suggestions SET status=?,reviewed_at=? WHERE id=?").bind(status,new Date().toISOString(),id).run();
  await env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"category_suggestion."+status,"category_suggestion",id,"{}").run();
  return json({ok:true,status});
}

async function updateUnit(request,env,id){
  const unit=await env.DB.prepare("SELECT iu.*,i.organization_id FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.id=?").bind(id).first();
  if(!unit) throw new PlatformError(404,"היחידה לא נמצאה");
  await orgAccess(request,env,unit.organization_id,["owner","inventory"]);
  const body=await bodyJson(request),status=["available","held","loaned","repair","inactive","retired"].includes(body.status)?body.status:unit.status;
  const condition=clean(body.condition||unit.condition,2,40,"מצב");
  if(status==="retired") await env.DB.prepare("INSERT OR IGNORE INTO retired_serials(serial_number,item_unit_id) VALUES(?,?)").bind(unit.serial_number,id).run();
  await env.DB.prepare("UPDATE item_units SET branch_id=?,status=?,condition=?,notes=?,retired_at=?,updated_at=? WHERE id=?")
    .bind(optional(body.branchId,100),status,condition,optional(body.notes,500),status==="retired"?new Date().toISOString():null,new Date().toISOString(),id).run();
  return json({ok:true,status});
}

async function transferUnit(request,env,id){
  const unit=await env.DB.prepare("SELECT iu.*,i.organization_id FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.id=?").bind(id).first();
  if(!unit) throw new PlatformError(404,"היחידה לא נמצאה");
  const {user}=await orgAccess(request,env,unit.organization_id,["owner","inventory"]),body=await bodyJson(request);
  const target=await env.DB.prepare("SELECT id FROM organization_branches WHERE id=? AND organization_id=? AND status!='archived'").bind(clean(body.toBranchId,1,100,"סניף יעד"),unit.organization_id).first();
  if(!target) throw new PlatformError(404,"סניף היעד לא נמצא");
  if(["held","loaned"].includes(unit.status)) throw new PlatformError(409,"אי אפשר להעביר יחידה שמורה או מושאלת");
  const transferId=crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO inventory_transfers(id,unit_id,from_branch_id,to_branch_id,initiated_by) VALUES(?,?,?,?,?)").bind(transferId,id,unit.branch_id,target.id,user.id),
    env.DB.prepare("UPDATE item_units SET status='inactive',updated_at=? WHERE id=?").bind(new Date().toISOString(),id)
  ]);
  return json({transfer:{id:transferId,status:"in_transit"}},201);
}

async function receiveTransfer(request,env,id){
  const transfer=await env.DB.prepare(`SELECT t.*,i.organization_id FROM inventory_transfers t JOIN item_units u ON u.id=t.unit_id JOIN items i ON i.id=u.item_id WHERE t.id=?`).bind(id).first();
  if(!transfer) throw new PlatformError(404,"העברה לא נמצאה");
  await orgAccess(request,env,transfer.organization_id,["owner","inventory"]);
  if(transfer.status!=="in_transit") throw new PlatformError(409,"העברה זו כבר טופלה");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE inventory_transfers SET status='received',received_at=? WHERE id=?").bind(now,id),
    env.DB.prepare("UPDATE item_units SET branch_id=?,status='available',updated_at=? WHERE id=?").bind(transfer.to_branch_id,now,transfer.unit_id)
  ]);
  return json({ok:true});
}

async function unitQr(request,env,id,url){
  const unit=await env.DB.prepare(`SELECT iu.id,iu.serial_number,iu.item_id,i.title,i.organization_id FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.id=?`).bind(id).first();
  if(!unit) throw new PlatformError(404,"היחידה לא נמצאה");
  await orgAccess(request,env,unit.organization_id,["owner","inventory"]);
  const target=`${url.origin}/#/scan/${encodeURIComponent(unit.serial_number)}`;
  return json({unitId:id,serialNumber:unit.serial_number,itemId:unit.item_id,title:unit.title,target,printLabel:`${unit.title} · ${unit.serial_number}`});
}

async function duplicateItem(request,env,id){
  const item=await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(id).first();
  if(!item) throw new PlatformError(404,"הפריט לא נמצא");
  await orgAccess(request,env,item.organization_id,["owner","inventory"]);
  const newId=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO items(id,organization_id,title,category,description,condition,quantity,loan_conditions,city,neighborhood,image_urls,status,availability_status,is_free,icon,cover_color,created_at,updated_at,item_type,subcategory,tags_json,pickup_method,inventory_updated_at,min_loan_minutes,max_loan_minutes,booking_notice_minutes,turnaround_minutes,booking_horizon_days,approval_mode,deposit_required,deposit_amount_agorot,publish_at,deposit_amount,max_per_user,preparation_minutes,max_loan_days,service_radius_km,serial_prefix,condition_detail)
    SELECT ?,organization_id,title||' - עותק',category,description,condition,quantity,loan_conditions,city,neighborhood,image_urls,'pending',availability_status,is_free,icon,cover_color,?,?,item_type,subcategory,tags_json,pickup_method,inventory_updated_at,min_loan_minutes,max_loan_minutes,booking_notice_minutes,turnaround_minutes,booking_horizon_days,approval_mode,deposit_required,deposit_amount_agorot,NULL,deposit_amount,max_per_user,preparation_minutes,max_loan_days,service_radius_km,serial_prefix,condition_detail FROM items WHERE id=?`)
    .bind(newId,now,now,id).run();
  return json({item:{id:newId,status:"pending"}},201);
}

async function importItems(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request);
  if(!Array.isArray(body.items)||!body.items.length||body.items.length>200) throw new PlatformError(400,"יש לשלוח 1–200 פריטים");
  const orgId=clean(body.organizationId,1,100,"גמ״ח");
  await orgAccess(request,env,orgId,["owner","inventory"]);
  const errors=[],created=[];
  for(let index=0;index<body.items.length;index++){
    const row=body.items[index];
    try{
      const title=clean(row.title,2,120,"שם פריט"),category=clean(row.category||"כללי",2,80,"קטגוריה"),description=clean(row.description||title,2,1500,"תיאור");
      const conditionDetail=String(row.condition||"טוב").trim();
      const condition=conditionDetail==="חדש"||conditionDetail==="כמו חדש"?"כמו חדש":conditionDetail==="מצוין"?"מצוין":"טוב";
      const quantity=Math.min(999,Math.max(1,Number(row.quantity)||1)),org=await env.DB.prepare("SELECT city,neighborhood FROM organizations WHERE id=?").bind(orgId).first(),id=crypto.randomUUID(),now=new Date().toISOString();
      await env.DB.prepare(`INSERT INTO items(id,organization_id,title,category,description,condition,quantity,city,neighborhood,status,availability_status,is_free,created_at,updated_at,condition_detail) VALUES(?,?,?,?,?,?,?,?,?,'pending','available',1,?,?,?)`)
        .bind(id,orgId,title,category,description,condition,quantity,org.city,org.neighborhood,now,now,conditionDetail).run();
      created.push({row:index+1,id,title});
    }catch(error){errors.push({row:index+1,error:error.message||"שגיאה"});}
  }
  return json({created,errors,total:body.items.length},errors.length?207:201);
}

async function deleteItemSafely(request,env,id){
  const item=await env.DB.prepare("SELECT * FROM items WHERE id=?").bind(id).first();
  if(!item) throw new PlatformError(404,"הפריט לא נמצא");
  await orgAccess(request,env,item.organization_id,["owner","inventory"]);
  const active=await env.DB.prepare("SELECT COUNT(*) AS count FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected')").bind(id).first();
  if(Number(active?.count||0)>0) throw new PlatformError(409,"המחיקה תחכה עד שכל ההשאלות הפעילות יסתיימו");
  const history=await env.DB.prepare("SELECT COUNT(*) AS count FROM loan_requests WHERE item_id=?").bind(id).first();
  if(Number(history?.count||0)===0){
    const units=await env.DB.prepare("SELECT serial_number,id FROM item_units WHERE item_id=?").bind(id).all();
    for(const u of units.results) await env.DB.prepare("INSERT OR IGNORE INTO retired_serials(serial_number,item_unit_id) VALUES(?,?)").bind(u.serial_number,u.id).run();
    await env.DB.prepare("DELETE FROM items WHERE id=?").bind(id).run();
    return json({ok:true,deleted:true});
  }
  await env.DB.prepare("UPDATE items SET deleted_at=?,status='archived',title='פריט שהוסר',description='הפריט הוסר; היסטוריית השאלות נשמרה ללא פרסום.',image_urls='[]',updated_at=? WHERE id=?").bind(new Date().toISOString(),new Date().toISOString(),id).run();
  return json({ok:true,deleted:false,anonymized:true});
}

async function advancedSearch(env,url){
  const q=String(url.searchParams.get("q")||"").trim(),city=String(url.searchParams.get("city")||"").trim(),category=String(url.searchParams.get("category")||"").trim();
  const lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon")),radius=Math.max(1,Math.min(500,Number(url.searchParams.get("radius"))||500));
  const rows=await env.DB.prepare(`SELECT i.*,o.name AS organization_name,o.city AS organization_city,o.temporarily_closed,b.id AS branch_id,b.name AS branch_name,b.latitude,b.longitude,b.status AS branch_status,
    COALESCE((SELECT AVG(r.product_rating) FROM reviews r WHERE r.request_id IN (SELECT lr.id FROM loan_requests lr WHERE lr.item_id=i.id) AND r.status='published'),0) AS item_rating,
    COALESCE((SELECT AVG(r.rating) FROM reviews r WHERE r.organization_id=o.id AND r.status='published'),0) AS organization_rating
    FROM items i JOIN organizations o ON o.id=i.organization_id
    LEFT JOIN organization_branches b ON b.organization_id=o.id AND b.status!='archived'
    WHERE i.status='active' AND i.deleted_at IS NULL AND o.deleted_at IS NULL AND o.is_hidden=0 LIMIT 600`).all();
  const cats=await env.DB.prepare("SELECT name_he,name_en,synonyms_json FROM categories WHERE status='active'").all();
  const synonyms=new Map();
  for(const c of cats.results){for(const s of safeJson(c.synonyms_json,[]))synonyms.set(String(s).toLowerCase(),c.name_he);}
  const expanded=synonyms.get(q.toLowerCase())||q;
  let out=rows.results.map(row=>{
    const text=`${row.title} ${row.description} ${row.category} ${row.organization_name}`.toLowerCase();
    let textScore=!expanded?1:(text.includes(expanded.toLowerCase())?100:Math.max(0,40-levenshtein(expanded,row.title)));
    const distance=Number.isFinite(lat)&&Number.isFinite(lon)&&Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude))?haversine(lat,lon,row.latitude,row.longitude):null;
    const availability=row.availability_status==="available"?25:0;
    const rating=Number(row.item_rating||0)*3+Number(row.organization_rating||0)*2;
    const conditionScore=/חדש/.test(row.condition)?8:/טוב|מצוין/.test(row.condition)?5:2;
    return {...row,distanceKm:distance,matchScore:textScore+availability+rating+conditionScore};
  }).filter(row=>(!q||row.matchScore>20)&&(!city||row.city===city||row.organization_city===city)&&(!category||row.category===category)&& (row.distanceKm==null||row.distanceKm<=radius));
  const unique=new Map();for(const row of out){const prev=unique.get(row.id);if(!prev||((row.distanceKm??9999)<(prev.distanceKm??9999)))unique.set(row.id,row);}
  out=[...unique.values()].sort((a,b)=>b.matchScore-a.matchScore||(a.distanceKm??9999)-(b.distanceKm??9999)).slice(0,100);
  return json({items:out,query:q,expandedQuery:expanded});
}

async function comparisons(request,env){
  const user=await requireUser(request,env);
  const rows=await env.DB.prepare(`SELECT i.*,o.name AS organization_name FROM product_comparisons pc JOIN items i ON i.id=pc.item_id JOIN organizations o ON o.id=i.organization_id WHERE pc.user_id=? ORDER BY pc.created_at`).bind(user.id).all();
  return json({items:rows.results});
}

async function addComparison(request,env,itemId){
  const user=await requireUser(request,env);
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM product_comparisons WHERE user_id=?").bind(user.id).first();
  if(Number(count?.count||0)>=5) throw new PlatformError(409,"אפשר להשוות עד חמישה פריטים");
  await env.DB.prepare("INSERT OR IGNORE INTO product_comparisons(user_id,item_id) VALUES(?,?)").bind(user.id,itemId).run();
  return json({ok:true});
}

async function removeComparison(request,env,itemId){
  const user=await requireUser(request,env);await env.DB.prepare("DELETE FROM product_comparisons WHERE user_id=? AND item_id=?").bind(user.id,itemId).run();return json({ok:true});
}

async function changeLoan(request,env,id){
  const {user,loan}=await loanAccess(request,env,id);
  if(user.id!==loan.borrower_id) throw new PlatformError(403,"רק השואל יכול לשנות את הבקשה");
  if(!["pending","approved"].includes(loan.status)) throw new PlatformError(409,"אי אפשר לשנות את הבקשה בשלב הזה");
  const body=await bodyJson(request),from=clean(body.requestedFrom||loan.requested_from,10,40,"תאריך התחלה"),until=clean(body.requestedUntil||loan.requested_until,10,40,"תאריך סיום"),quantity=Math.max(1,Math.min(999,Number(body.quantity)||loan.quantity||1));
  if(new Date(until)<=new Date(from)) throw new PlatformError(400,"מועד הסיום חייב להיות אחרי מועד ההתחלה");
  const conflict=await env.DB.prepare(`SELECT COALESCE(SUM(quantity),0) AS reserved FROM loan_requests WHERE item_id=? AND id<>? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?`).bind(loan.item_id,id,until,from).first();
  const item=await env.DB.prepare("SELECT quantity FROM items WHERE id=?").bind(loan.item_id).first();
  if(Number(conflict?.reserved||0)+quantity>Number(item?.quantity||0)) throw new PlatformError(409,"אין מספיק מלאי בטווח החדש");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE loan_requests SET requested_from=?,requested_until=?,quantity=?,status='pending',workflow_status='inventory_held',updated_at=? WHERE id=?").bind(from,until,quantity,now,id),
    env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,"borrower_changed_request",user.id,optional(body.note,500)),
    env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,'status',?,?,?)").bind(crypto.randomUUID(),loan.owner_id,"בקשת השאלה עודכנה","השואל שינה תאריכים או כמות ונדרש אישור מחדש.",id)
  ]);
  return json({ok:true,status:"pending"});
}

async function cancelLoan(request,env,id){
  const {user,loan}=await loanAccess(request,env,id);
  if(loan.status==="collected") throw new PlatformError(409,"לא ניתן לבטל לאחר איסוף; יש לבצע החזרה");
  if(["returned","cancelled","declined"].includes(loan.status)) return json({ok:true,status:loan.status});
  const now=new Date().toISOString(),other=user.id===loan.borrower_id?loan.owner_id:loan.borrower_id;
  await env.DB.batch([
    env.DB.prepare("UPDATE loan_requests SET status='cancelled',workflow_status='cancelled',cancelled_by=?,cancelled_at=?,updated_at=? WHERE id=?").bind(user.id,now,now,id),
    env.DB.prepare("UPDATE inventory_holds SET status='cancelled' WHERE request_id=? AND status='active'").bind(id),
    env.DB.prepare("INSERT INTO loan_status_events(id,request_id,status,actor_id,note) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),id,"cancelled",user.id,null),
    env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,'status',?,?,?)").bind(crypto.randomUUID(),other,"ההשאלה בוטלה","הבקשה בוטלה והמלאי שוחרר.",id)
  ]);
  return json({ok:true,status:"cancelled"});
}

async function rejectPickup(request,env,id){
  const proposal=await env.DB.prepare("SELECT * FROM pickup_proposals WHERE id=? AND status='pending'").bind(id).first();
  if(!proposal) throw new PlatformError(404,"ההצעה לא נמצאה");
  const {user}=await loanAccess(request,env,proposal.request_id);
  if(user.id===proposal.proposed_by) throw new PlatformError(403,"רק הצד השני יכול לדחות");
  await env.DB.prepare("UPDATE pickup_proposals SET status='rejected' WHERE id=?").bind(id).run();
  await env.DB.prepare("UPDATE loan_requests SET workflow_status='waiting_pickup_time',updated_at=? WHERE id=?").bind(new Date().toISOString(),proposal.request_id).run();
  return json({ok:true});
}

async function extensionDecision(request,env,id){
  const {user,loan}=await loanAccess(request,env,id);
  if(user.id===loan.borrower_id && user.role!=="admin") throw new PlatformError(403,"רק הגמ״ח יכול להחליט על ההארכה");
  if(loan.extension_status!=="pending") throw new PlatformError(409,"אין בקשת הארכה ממתינה");
  const body=await bodyJson(request),approve=body.approve===true,until=approve?loan.extension_until:(body.alternativeUntil?clean(body.alternativeUntil,10,40,"מועד חלופי"):null),now=new Date().toISOString();
  if(approve){
    await env.DB.prepare("UPDATE loan_requests SET requested_until=?,extension_status='approved',workflow_status='collected',updated_at=? WHERE id=?").bind(until,now,id).run();
  }else if(until){
    await env.DB.prepare("UPDATE loan_requests SET extension_until=?,extension_status='countered',workflow_status='extension_pending',updated_at=? WHERE id=?").bind(until,now,id).run();
  }else{
    await env.DB.prepare("UPDATE loan_requests SET extension_status='rejected',workflow_status='collected',updated_at=? WHERE id=?").bind(now,id).run();
  }
  await env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,'status',?,?,?)").bind(crypto.randomUUID(),loan.borrower_id,"עדכון בקשת הארכה",approve?"ההארכה אושרה":until?"הוצע מועד החזרה חלופי":"ההארכה נדחתה",id).run();
  return json({ok:true,status:approve?"approved":until?"countered":"rejected"});
}

async function assignUnits(request,env,id){
  const {user,loan}=await loanAccess(request,env,id);
  if(user.id===loan.borrower_id && user.role!=="admin") throw new PlatformError(403,"רק הגמ״ח יכול להקצות יחידות");
  const body=await bodyJson(request),unitIds=[...new Set(Array.isArray(body.unitIds)?body.unitIds:[])];
  const quantity=Number(loan.quantity||1);
  if(unitIds.length!==quantity) throw new PlatformError(400,`יש לבחור בדיוק ${quantity} יחידות`);
  const rows=await env.DB.prepare(`SELECT iu.id,iu.status,i.organization_id FROM item_units iu JOIN items i ON i.id=iu.item_id WHERE iu.item_id=?`).bind(loan.item_id).all();
  const byId=new Map(rows.results.map(x=>[x.id,x]));
  for(const unitId of unitIds){const unit=byId.get(unitId);if(!unit||!["available","held"].includes(unit.status))throw new PlatformError(409,"אחת היחידות אינה זמינה");}
  await env.DB.prepare("DELETE FROM loan_unit_assignments WHERE request_id=? AND returned_at IS NULL").bind(id).run();
  for(const unitId of unitIds){
    await env.DB.batch([
      env.DB.prepare("INSERT INTO loan_unit_assignments(request_id,unit_id) VALUES(?,?)").bind(id,unitId),
      env.DB.prepare("UPDATE item_units SET status='loaned',updated_at=? WHERE id=?").bind(new Date().toISOString(),unitId)
    ]);
  }
  return json({ok:true,unitIds});
}

async function managerWaitlist(request,env,itemId){
  const item=await env.DB.prepare("SELECT organization_id FROM items WHERE id=?").bind(itemId).first();if(!item)throw new PlatformError(404,"הפריט לא נמצא");
  await orgAccess(request,env,item.organization_id,["owner","requests","inventory"]);
  const rows=await env.DB.prepare(`SELECT w.*,u.full_name,u.email FROM waitlist_entries w JOIN users u ON u.id=w.user_id WHERE w.item_id=? ORDER BY w.created_at`).bind(itemId).all();
  return json({entries:rows.results});
}

async function respondWaitlistOffer(request,env,id){
  const user=await requireUser(request,env),body=await bodyJson(request),offer=await env.DB.prepare(`SELECT wo.*,w.user_id,w.item_id FROM waitlist_offers wo JOIN waitlist_entries w ON w.id=wo.waitlist_entry_id WHERE wo.id=?`).bind(id).first();
  if(!offer||offer.user_id!==user.id||offer.accepted_at||offer.declined_at) throw new PlatformError(404,"ההצעה אינה זמינה");
  const now=new Date().toISOString();
  if(new Date(offer.expires_at)<=new Date()) throw new PlatformError(410,"זמן התגובה להצעה הסתיים");
  if(body.accept===true){
    await env.DB.batch([env.DB.prepare("UPDATE waitlist_offers SET accepted_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE waitlist_entries SET status='accepted' WHERE id=?").bind(offer.waitlist_entry_id)]);
    return json({ok:true,accepted:true});
  }
  await env.DB.batch([env.DB.prepare("UPDATE waitlist_offers SET declined_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE waitlist_entries SET status='declined' WHERE id=?").bind(offer.waitlist_entry_id)]);
  return json({ok:true,accepted:false});
}

async function selectHelpOffer(request,env,id){
  const offer=await env.DB.prepare(`SELECT ho.*,hr.requester_id FROM help_request_offers ho JOIN help_requests hr ON hr.id=ho.help_request_id WHERE ho.id=?`).bind(id).first();
  if(!offer) throw new PlatformError(404,"ההצעה לא נמצאה");
  const user=await requireUser(request,env);if(user.id!==offer.requester_id&&user.role!=="admin")throw new PlatformError(403,"אין הרשאה");
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE help_request_offers SET status=CASE WHEN id=? THEN 'selected' ELSE 'declined' END WHERE help_request_id=? AND status='offered'").bind(id,offer.help_request_id),
    env.DB.prepare("UPDATE help_requests SET status='matched',selected_response_id=?,updated_at=? WHERE id=?").bind(id,now,offer.help_request_id)
  ]);
  return json({ok:true});
}

async function chatAttachment(request,env,requestId){
  const {user}=await loanAccess(request,env,requestId),form=await request.formData(),file=form.get("file"),type=String(form.get("type")||"image");
  if(!(file instanceof File)) throw new PlatformError(400,"לא צורף קובץ");
  const allowed=type==="audio"?["audio/webm","audio/mpeg","audio/mp4","audio/ogg"]:["image/jpeg","image/png","image/webp"];
  if(!allowed.includes(file.type)||file.size>8*1024*1024) throw new PlatformError(400,"סוג הקובץ או גודלו אינם נתמכים");
  const ext=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"").slice(0,8),key=`chat/${requestId}/${crypto.randomUUID()}.${ext}`;
  await env.ITEM_IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type}});
  const messageId=crypto.randomUUID(),attachmentId=crypto.randomUUID(),label=type==="audio"?"[הודעה קולית]":"[תמונה]";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages(id,request_id,sender_id,body,message_type,media_url) VALUES(?,?,?,?,?,?)").bind(messageId,requestId,user.id,label,type,`/media/${key}`),
    env.DB.prepare("INSERT INTO chat_attachments(id,message_id,attachment_type,storage_key,metadata_json) VALUES(?,?,?,?,?)").bind(attachmentId,messageId,type,key,JSON.stringify({name:file.name,size:file.size,mime:file.type}))
  ]);
  return json({message:{id:messageId,type,mediaUrl:`/media/${key}`}},201);
}

async function richChatMessage(request,env,requestId){
  const {user}=await loanAccess(request,env,requestId),body=await bodyJson(request),type=["location","item","help_request"].includes(body.type)?body.type:"location",id=crypto.randomUUID(),attachmentId=crypto.randomUUID();
  const metadata=body.metadata&&typeof body.metadata==="object"?body.metadata:{};
  if(type==="location"){const lat=Number(metadata.lat),lon=Number(metadata.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new PlatformError(400,"מיקום לא תקין");}
  const label={location:"[מיקום]",item:"[כרטיס מוצר]",help_request:"[כרטיס בקשה]"}[type];
  await env.DB.batch([
    env.DB.prepare("INSERT INTO request_messages(id,request_id,sender_id,body,message_type) VALUES(?,?,?,?,?)").bind(id,requestId,user.id,label,type),
    env.DB.prepare("INSERT INTO chat_attachments(id,message_id,attachment_type,metadata_json) VALUES(?,?,?,?)").bind(attachmentId,id,type,JSON.stringify(metadata))
  ]);
  return json({message:{id,type,metadata}},201);
}

async function deleteMessage(request,env,id){
  const user=await requireUser(request,env),row=await env.DB.prepare("SELECT sender_id,created_at,deleted_at FROM request_messages WHERE id=?").bind(id).first();
  if(!row||row.sender_id!==user.id) throw new PlatformError(404,"ההודעה לא נמצאה");
  if(row.deleted_at) return json({ok:true});
  if(Date.now()-new Date(row.created_at).getTime()>5*60*1000) throw new PlatformError(409,"אפשר למחוק הודעה עד חמש דקות מהשליחה");
  await env.DB.prepare("UPDATE request_messages SET body='הודעה נמחקה',media_url=NULL,deleted_at=? WHERE id=?").bind(new Date().toISOString(),id).run();
  return json({ok:true});
}

async function readMessage(request,env,id){
  const user=await requireUser(request,env),row=await env.DB.prepare(`SELECT rm.request_id FROM request_messages rm WHERE rm.id=?`).bind(id).first();if(!row)throw new PlatformError(404,"הודעה לא נמצאה");
  await loanAccess(request,env,row.request_id);await env.DB.prepare("UPDATE request_messages SET read_at=COALESCE(read_at,?) WHERE id=? AND sender_id<>?").bind(new Date().toISOString(),id,user.id).run();return json({ok:true});
}

async function reportMessage(request,env,id){
  const user=await requireUser(request,env),body=await bodyJson(request),row=await env.DB.prepare("SELECT request_id FROM request_messages WHERE id=?").bind(id).first();if(!row)throw new PlatformError(404,"הודעה לא נמצאה");
  await loanAccess(request,env,row.request_id);
  try{await env.DB.prepare("INSERT INTO chat_reports(id,message_id,reporter_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,user.id,clean(body.reason,2,500,"סיבה")).run();}
  catch(e){if(String(e).toLowerCase().includes("unique"))throw new PlatformError(409,"כבר דיווחת על ההודעה");throw e;}
  return json({ok:true},201);
}

async function blockUser(request,env,id){
  const user=await requireUser(request,env);if(user.id===id)throw new PlatformError(400,"אי אפשר לחסום את עצמך");
  const active=await env.DB.prepare(`SELECT lr.id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id
    WHERE ((lr.borrower_id=? AND o.owner_id=?) OR (lr.borrower_id=? AND o.owner_id=?)) AND lr.status='collected' LIMIT 1`).bind(user.id,id,id,user.id).first();
  await env.DB.prepare("INSERT OR REPLACE INTO user_blocks(blocker_id,blocked_id,effective_after_request_id) VALUES(?,?,?)").bind(user.id,id,active?.id||null).run();
  return json({ok:true,deferredUntilReturn:Boolean(active)});
}

async function unblockUser(request,env,id){const user=await requireUser(request,env);await env.DB.prepare("DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?").bind(user.id,id).run();return json({ok:true});}

async function pushSubscription(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request),endpoint=clean(body.endpoint,10,2000,"endpoint"),keys=body.keys||{};
  const id=crypto.randomUUID();
  await env.DB.prepare(`INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,user_agent,last_used_at) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent,last_used_at=excluded.last_used_at`)
    .bind(id,user.id,endpoint,clean(keys.p256dh,10,300,"p256dh"),clean(keys.auth,5,300,"auth"),optional(request.headers.get("User-Agent"),500),new Date().toISOString()).run();
  return json({ok:true},201);
}

async function deletePush(request,env,id){const user=await requireUser(request,env);await env.DB.prepare("DELETE FROM push_subscriptions WHERE id=? AND user_id=?").bind(id,user.id).run();return json({ok:true});}

function icsEscape(v){return String(v||"").replace(/\\/g,"\\\\").replace(/\n/g,"\\n").replace(/,/g,"\\,").replace(/;/g,"\\;");}
function icsDate(v){return new Date(v).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z$/,"Z");}
async function loanCalendar(request,env,id){
  const {loan}=await loanAccess(request,env,id);const item=await env.DB.prepare(`SELECT i.title,o.name AS organization_name,o.address,o.city FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id=?`).bind(loan.item_id).first();
  const pickup=loan.pickup_window_start||loan.requested_from,ret=loan.requested_until,now=icsDate(new Date());
  const body=`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Gmach Berega//HE\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\nUID:${id}-pickup@gmach-berega\r\nDTSTAMP:${now}\r\nDTSTART:${icsDate(pickup)}\r\nSUMMARY:${icsEscape("איסוף: "+item.title)}\r\nLOCATION:${icsEscape([item.address,item.city].filter(Boolean).join(", "))}\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:${id}-return@gmach-berega\r\nDTSTAMP:${now}\r\nDTSTART:${icsDate(ret)}\r\nSUMMARY:${icsEscape("החזרה: "+item.title)}\r\nLOCATION:${icsEscape([item.address,item.city].filter(Boolean).join(", "))}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;
  return new Response(body,{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":`attachment; filename="gmach-${id}.ics"`,"Cache-Control":"no-store"}});
}

async function createSupportTicket(request,env){
  const user=await requireUser(request,env),body=await bodyJson(request),subject=clean(body.subject,2,120,"נושא"),message=clean(body.message,10,3000,"הודעה");
  const row=await env.DB.prepare("SELECT COALESCE(MAX(ticket_number),1000)+1 AS next FROM support_tickets").first(),id=crypto.randomUUID(),number=Number(row?.next||1001),now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO support_tickets(id,ticket_number,user_id,name,email,subject,message,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'open',?,?)").bind(id,number,user.id,user.full_name,user.email,subject,message,now,now),
    env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body) VALUES(?,?,?,?)").bind(crypto.randomUUID(),id,user.id,message)
  ]);
  return json({ticket:{id,ticketNumber:number,status:"open"}},201);
}

async function supportTickets(request,env){
  const user=await requireUser(request,env);const rows=await env.DB.prepare("SELECT * FROM support_tickets WHERE user_id=? ORDER BY updated_at DESC").bind(user.id).all();return json({tickets:rows.results});
}
async function supportTicketMessage(request,env,id){
  const user=await requireUser(request,env),ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(id).first();if(!ticket||(ticket.user_id!==user.id&&user.role!=="admin"))throw new PlatformError(404,"הפנייה לא נמצאה");
  const body=await bodyJson(request),message=clean(body.message,2,3000,"הודעה"),mid=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body) VALUES(?,?,?,?)").bind(mid,id,user.id,message),env.DB.prepare("UPDATE support_tickets SET status='waiting',updated_at=? WHERE id=?").bind(now,id)]);
  return json({message:{id:mid}},201);
}
async function supportTicketStatus(request,env,id){
  const user=await requireUser(request,env),ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=?").bind(id).first();if(!ticket||(ticket.user_id!==user.id&&user.role!=="admin"))throw new PlatformError(404,"הפנייה לא נמצאה");
  const body=await bodyJson(request),status=["closed","reopened"].includes(body.status)?body.status:"closed";
  await env.DB.prepare("UPDATE support_tickets SET status=?,updated_at=? WHERE id=?").bind(status,new Date().toISOString(),id).run();return json({ok:true,status});
}

async function adminPlatform(request,env){
  await requireAdmin(request,env);
  const [alerts,security,closures,tickets,deletions,transfers,backups,dataRequests,reports]=await env.DB.batch([
    env.DB.prepare("SELECT * FROM operational_alerts WHERE status!='resolved' ORDER BY severity DESC,created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM security_events ORDER BY created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM platform_closures ORDER BY starts_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 100"),
    env.DB.prepare("SELECT id,email,full_name,deletion_requested_at FROM users WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL ORDER BY deletion_requested_at"),
    env.DB.prepare("SELECT * FROM inventory_transfers ORDER BY created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 50"),
    env.DB.prepare("SELECT dsr.*,u.full_name,u.email FROM data_subject_requests dsr JOIN users u ON u.id=dsr.user_id ORDER BY dsr.created_at DESC LIMIT 100"),
    env.DB.prepare("SELECT * FROM chat_reports WHERE status='pending' ORDER BY created_at LIMIT 100")
  ]);
  return json({alerts:alerts.results,security:security.results,closures:closures.results,tickets:tickets.results,deletions:deletions.results,transfers:transfers.results,backups:backups.results,dataRequests:dataRequests.results,chatReports:reports.results});
}

async function adminClosure(request,env){
  const admin=await requireAdmin(request,env),body=await bodyJson(request),id=crypto.randomUUID(),type=["manual","holiday","maintenance"].includes(body.type)?body.type:"manual";
  const start=clean(body.startsAt,10,40,"תחילה"),end=clean(body.endsAt,10,40,"סיום");if(new Date(end)<=new Date(start))throw new PlatformError(400,"מועד הסיום חייב להיות מאוחר מההתחלה");
  await env.DB.prepare("INSERT INTO platform_closures(id,closure_type,title_he,title_en,starts_at,ends_at,active,created_by) VALUES(?,?,?,?,?,?,1,?)").bind(id,type,clean(body.titleHe,2,120,"כותרת"),optional(body.titleEn,120),start,end,admin.id).run();
  return json({closure:{id}},201);
}
async function resolveAlert(request,env,id){
  await requireAdmin(request,env);await env.DB.prepare("UPDATE operational_alerts SET status='resolved',resolved_at=? WHERE id=?").bind(new Date().toISOString(),id).run();return json({ok:true});
}

async function csvExport(request,env,kind){
  await requireAdmin(request,env);
  const config={
    users:["SELECT id,email,full_name,role,account_status,created_at,last_login_at FROM users ORDER BY created_at DESC",["id","email","full_name","role","account_status","created_at","last_login_at"]],
    loans:["SELECT id,item_id,borrower_id,status,workflow_status,requested_from,requested_until,quantity,created_at FROM loan_requests ORDER BY created_at DESC",["id","item_id","borrower_id","status","workflow_status","requested_from","requested_until","quantity","created_at"]],
    items:["SELECT id,organization_id,title,category,condition,quantity,status,availability_status,created_at FROM items ORDER BY created_at DESC",["id","organization_id","title","category","condition","quantity","status","availability_status","created_at"]]
  }[kind];
  if(!config) throw new PlatformError(404,"סוג הייצוא אינו נתמך");
  const rows=(await env.DB.prepare(config[0]).all()).results,headers=config[1],esc=v=>`"${String(v??"").replaceAll('"','""')}"`;
  const csv="\uFEFF"+[headers.join(","),...rows.map(r=>headers.map(h=>esc(r[h])).join(","))].join("\r\n");
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="${kind}.csv"`,"Cache-Control":"no-store"}});
}

async function overview(request,env){
  const user=await requireUser(request,env);
  const [addresses,sessions,searches,comparisonsRows,transfers]=await Promise.all([
    listAddresses(request,env).then(r=>r.json()),
    env.DB.prepare("SELECT token_hash,device_label,last_seen_at,created_at,expires_at FROM sessions WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(),
    env.DB.prepare("SELECT id,name,filters_json,notify,created_at FROM saved_searches WHERE user_id=? ORDER BY created_at DESC").bind(user.id).all(),
    env.DB.prepare("SELECT item_id,created_at FROM product_comparisons WHERE user_id=? ORDER BY created_at").bind(user.id).all(),
    env.DB.prepare("SELECT * FROM ownership_transfers WHERE to_user_id=? AND status='pending' AND expires_at>? ORDER BY created_at DESC").bind(user.id,new Date().toISOString()).all()
  ]);
  return json({user:{id:user.id,fullName:user.full_name,email:user.email,language:user.preferred_language||"he",navigation:user.navigation_preference||"google",tourCompleted:Boolean(user.tour_completed),quietHoursEnabled:Boolean(user.quiet_hours_enabled),quietStart:user.quiet_start,quietEnd:user.quiet_end,deletionRequestedAt:user.deletion_requested_at},
    addresses:addresses.addresses,sessions:sessions.results.map(r=>({key:r.token_hash,deviceLabel:r.device_label||"מכשיר לא מזוהה",lastSeenAt:r.last_seen_at||r.created_at,createdAt:r.created_at,expiresAt:r.expires_at,current:r.token_hash===user.current_session_hash})),savedSearches:searches.results.map(r=>({...r,filters:safeJson(r.filters_json,{})})),comparisons:comparisonsRows.results,ownershipTransfers:transfers.results});
}

export async function completionHealth(env){
  const names=["consent_versions","inventory_holds","scheduled_jobs","inventory_transfers","chat_attachments","notification_delivery_log","ownership_transfers","data_subject_requests"];
  const result={};
  for(const name of names) result[name]=Boolean(await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first());
  return {ready:Object.values(result).every(Boolean),...result};
}

export async function runCompletionMaintenance(env){
  const ready=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_jobs'").first();
  if(!ready)return;
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE inventory_holds SET status='expired' WHERE status='active' AND expires_at<=?").bind(now),
    env.DB.prepare("UPDATE ownership_transfers SET status='expired' WHERE status='pending' AND expires_at<=?").bind(now),
    env.DB.prepare("UPDATE scheduled_jobs SET status='failed',last_error='stale running job',finished_at=? WHERE status='running' AND run_at<datetime(?,'-2 hours')").bind(now,now),
    env.DB.prepare("UPDATE support_tickets SET status='closed',updated_at=? WHERE status='waiting' AND updated_at<datetime(?,'-30 days')").bind(now,now),
    env.DB.prepare("DELETE FROM chat_attachments WHERE message_id IN (SELECT rm.id FROM request_messages rm JOIN loan_requests lr ON lr.id=rm.request_id WHERE lr.returned_at IS NOT NULL AND lr.returned_at<datetime(?,'-1 year'))").bind(now)
  ]);
  const orgs=await env.DB.prepare(`SELECT id FROM organizations WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL AND deletion_requested_at<=datetime(?,'-7 days')`).bind(now).all();
  for(const org of orgs.results){
    const active=await env.DB.prepare(`SELECT 1 FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? AND lr.status='collected' LIMIT 1`).bind(org.id).first();
    if(!active) await env.DB.prepare("UPDATE organizations SET deleted_at=?,is_hidden=1 WHERE id=?").bind(now,org.id).run();
  }
  await env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE publish_at IS NOT NULL AND publish_at<=? AND status='pending'").bind(now,now).run();
}

export async function handlePlatformApi(request,env,ctx,url){
  const method=request.method.toUpperCase(),path=url.pathname;
  if(!path.startsWith("/api/")) return null;
  try{
    if(method==="GET"&&path==="/api/platform/overview") return overview(request,env);
    if(method==="GET"&&path==="/api/me/addresses") return listAddresses(request,env);
    if(method==="POST"&&path==="/api/me/addresses") return saveAddress(request,env);
    let m=path.match(/^\/api\/me\/addresses\/([^/]+)$/); if(m&&method==="PATCH")return saveAddress(request,env,decodeURIComponent(m[1])); if(m&&method==="DELETE")return deleteAddress(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/me\/sessions\/([^/]+)$/); if(m&&method==="DELETE")return deleteSession(request,env,decodeURIComponent(m[1]));
    if(method==="POST"&&path==="/api/me/deletion/cancel")return cancelDeletion(request,env);
    if(method==="PATCH"&&path==="/api/me/preferences")return saveUserPreferences(request,env);
    if(method==="GET"&&path==="/api/me/export")return exportMyData(request,env);
    if(method==="POST"&&path==="/api/me/data-requests")return createDataRequest(request,env);
    m=path.match(/^\/api\/me\/saved-searches\/([^/]+)$/);if(m&&method==="DELETE")return deleteSavedSearch(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&path==="/api/me/comparisons")return comparisons(request,env);
    m=path.match(/^\/api\/me\/comparisons\/([^/]+)$/);if(m&&method==="POST")return addComparison(request,env,decodeURIComponent(m[1]));if(m&&method==="DELETE")return removeComparison(request,env,decodeURIComponent(m[1]));

    m=path.match(/^\/api\/organizations\/([^/]+)\/branches\/([^/]+)$/);if(m&&method==="PATCH")return updateBranch(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));if(m&&method==="DELETE")return deleteBranch(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/closure$/);if(m&&method==="POST")return closeOrganization(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/deletion-request$/);if(m&&method==="POST")return requestOrganizationDeletion(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/deletion-cancel$/);if(m&&method==="POST")return cancelOrganizationDeletion(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/ownership-transfer$/);if(m&&method==="POST")return ownershipTransfer(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/ownership-transfers\/([^/]+)\/accept$/);if(m&&method==="POST")return acceptOwnership(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/invitations$/);if(m&&method==="POST")return createInvitation(request,env,decodeURIComponent(m[1]));if(m&&method==="GET")return listInvitations(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organization-invitations\/([^/]+)$/);if(m&&method==="DELETE")return cancelInvitation(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/);if(m&&method==="PATCH")return updateMember(request,env,decodeURIComponent(m[1]),decodeURIComponent(m[2]));

    if(method==="POST"&&path==="/api/category-suggestions")return suggestCategory(request,env);
    if(method==="GET"&&path==="/api/admin/categories")return adminCategories(request,env);
    if(method==="POST"&&path==="/api/admin/categories")return createCategory(request,env);
    m=path.match(/^\/api\/admin\/categories\/([^/]+)$/);if(m&&method==="PATCH")return updateCategory(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/admin\/category-suggestions\/([^/]+)$/);if(m&&method==="PATCH")return moderateCategorySuggestion(request,env,decodeURIComponent(m[1]));

    m=path.match(/^\/api\/item-units\/([^/]+)$/);if(m&&method==="PATCH")return updateUnit(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/item-units\/([^/]+)\/transfer$/);if(m&&method==="POST")return transferUnit(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/inventory-transfers\/([^/]+)\/receive$/);if(m&&method==="POST")return receiveTransfer(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/item-units\/([^/]+)\/qr$/);if(m&&method==="GET")return unitQr(request,env,decodeURIComponent(m[1]),url);
    m=path.match(/^\/api\/items\/([^/]+)\/duplicate$/);if(m&&method==="POST")return duplicateItem(request,env,decodeURIComponent(m[1]));
    if(method==="POST"&&path==="/api/items/import")return importItems(request,env);
    m=path.match(/^\/api\/items\/([^/]+)\/delete-safe$/);if(m&&method==="DELETE")return deleteItemSafely(request,env,decodeURIComponent(m[1]));
    if(method==="GET"&&path==="/api/search/advanced")return advancedSearch(env,url);

    m=path.match(/^\/api\/loan-requests\/([^/]+)$/);if(m&&method==="PATCH")return changeLoan(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/cancel$/);if(m&&method==="POST")return cancelLoan(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/pickup-proposals\/([^/]+)\/reject$/);if(m&&method==="POST")return rejectPickup(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/extension-decision$/);if(m&&method==="POST")return extensionDecision(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/assign-units$/);if(m&&method==="POST")return assignUnits(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/items\/([^/]+)\/waitlist-manager$/);if(m&&method==="GET")return managerWaitlist(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/waitlist-offers\/([^/]+)\/respond$/);if(m&&method==="POST")return respondWaitlistOffer(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/help-offers\/([^/]+)\/select$/);if(m&&method==="POST")return selectHelpOffer(request,env,decodeURIComponent(m[1]));

    m=path.match(/^\/api\/loan-requests\/([^/]+)\/chat-attachment$/);if(m&&method==="POST")return chatAttachment(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/chat-rich$/);if(m&&method==="POST")return richChatMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/messages\/([^/]+)$/);if(m&&method==="DELETE")return deleteMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/messages\/([^/]+)\/read$/);if(m&&method==="POST")return readMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/messages\/([^/]+)\/report$/);if(m&&method==="POST")return reportMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/users\/([^/]+)\/block$/);if(m&&method==="POST")return blockUser(request,env,decodeURIComponent(m[1]));if(m&&method==="DELETE")return unblockUser(request,env,decodeURIComponent(m[1]));

    if(method==="POST"&&path==="/api/me/push-subscriptions")return pushSubscription(request,env);
    m=path.match(/^\/api\/me\/push-subscriptions\/([^/]+)$/);if(m&&method==="DELETE")return deletePush(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/loan-requests\/([^/]+)\/calendar\.ics$/);if(m&&method==="GET")return loanCalendar(request,env,decodeURIComponent(m[1]));

    if(method==="GET"&&path==="/api/me/support-tickets")return supportTickets(request,env);
    if(method==="POST"&&path==="/api/support-tickets")return createSupportTicket(request,env);
    m=path.match(/^\/api\/support-tickets\/([^/]+)\/messages$/);if(m&&method==="POST")return supportTicketMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/support-tickets\/([^/]+)\/status$/);if(m&&method==="PATCH")return supportTicketStatus(request,env,decodeURIComponent(m[1]));

    if(method==="GET"&&path==="/api/admin/platform")return adminPlatform(request,env);
    if(method==="POST"&&path==="/api/admin/platform-closures")return adminClosure(request,env);
    m=path.match(/^\/api\/admin\/operational-alerts\/([^/]+)\/resolve$/);if(m&&method==="POST")return resolveAlert(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/admin\/export\/(users|loans|items)$/);if(m&&method==="GET")return csvExport(request,env,m[1]);

    return null;
  }catch(error){
    const status=error instanceof PlatformError?error.status:500;
    if(status>=500) console.error("Platform completion API",error);
    return json({error:error instanceof PlatformError?error.message:"אירעה תקלה זמנית בשכבת ההשלמה"},status);
  }
}
