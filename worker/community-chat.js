
const SESSION_COOKIE="gmach_session";
class CommunityChatError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
let schemaPromise=null;
export async function ensureCommunityChatSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const sqls=[
      "CREATE TABLE IF NOT EXISTS community_offer_messages (id TEXT PRIMARY KEY,offer_id TEXT NOT NULL REFERENCES help_request_offers(id) ON DELETE CASCADE,sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),read_at TEXT,edited_at TEXT,deleted_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
      "CREATE TABLE IF NOT EXISTS community_offer_message_reports (id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES community_offer_messages(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','reviewed','dismissed','removed')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(message_id,reporter_id))",
      "CREATE TABLE IF NOT EXISTS chat_retention_runs (id TEXT PRIMARY KEY,loan_messages_archived INTEGER NOT NULL DEFAULT 0,community_messages_archived INTEGER NOT NULL DEFAULT 0,media_deleted INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL CHECK(status IN ('running','success','failed')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),completed_at TEXT,error TEXT)",
      "CREATE INDEX IF NOT EXISTS community_offer_messages_offer_idx ON community_offer_messages(offer_id,created_at)",
      "CREATE INDEX IF NOT EXISTS community_offer_message_reports_status_idx ON community_offer_message_reports(status,created_at)",
      "CREATE INDEX IF NOT EXISTS chat_retention_runs_created_idx ON chat_retention_runs(created_at DESC)"
    ];
    for(const sql of sqls)await env.DB.prepare(sql).run();
    return true;
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}
function cookieValue(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const parts=p.trim().split("="),k=parts.shift();if(k===name)return decodeURIComponent(parts.join("="));}return""}
async function sha256(value){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value))));let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function requireUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)throw new CommunityChatError(401,"יש להתחבר");const hash=await sha256(token);const u=await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.account_status='active'").bind(hash,new Date().toISOString()).first();if(!u)throw new CommunityChatError(401,"החיבור פג");return u}
async function readBody(request){try{const b=await request.json();return b&&typeof b==="object"?b:{}}catch{throw new CommunityChatError(400,"תוכן הבקשה אינו תקין")}}
function clean(value,min,max,label){const s=String(value??"").trim().replace(/[\u0000-\u001F\u007F]/g," ");if(s.length<min||s.length>max)throw new CommunityChatError(400,label+" חייב להכיל "+min+"-"+max+" תווים");return s}
function assertSafeText(text){const lower=String(text).toLowerCase();if(/(?:javascript|data|vbscript):/.test(lower))throw new CommunityChatError(400,"ההודעה מכילה קישור שאינו בטוח");const urls=String(text).match(/https?:\/\/[^\s<>"']+/gi)||[];for(const raw of urls){try{const u=new URL(raw);if(!["http:","https:"].includes(u.protocol)||!u.hostname||/^(localhost|127\.|0\.0\.0\.0|::1$)/i.test(u.hostname))throw new Error()}catch{throw new CommunityChatError(400,"ההודעה מכילה קישור שאינו תקין")}}}
async function offerAccess(request,env,offerId){
  const user=await requireUser(request,env);
  const offer=await env.DB.prepare("SELECT o.id,o.help_request_id,o.responder_id,o.status,h.requester_id,h.title,h.status AS request_status,h.updated_at FROM help_request_offers o JOIN help_requests h ON h.id=o.help_request_id WHERE o.id=?").bind(offerId).first();
  if(!offer)throw new CommunityChatError(404,"ההצעה לא נמצאה");
  if(user.role!=="admin"&&user.id!==offer.responder_id&&user.id!==offer.requester_id)throw new CommunityChatError(403,"אין הרשאה לצפות בשיחה");
  const otherUserId=user.id===offer.responder_id?offer.requester_id:offer.responder_id;
  return {user,offer,otherUserId};
}
async function pairBlocked(env,a,b){const row=await env.DB.prepare("SELECT 1 FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1").bind(a,b,b,a).first().catch(()=>null);return Boolean(row)}
function writable(offer){return ["offered","selected"].includes(String(offer.status||""))}
async function listMessages(request,env,offerId){
  const {user,offer,otherUserId}=await offerAccess(request,env,offerId);
  const rows=await env.DB.prepare("SELECT m.id,m.body,m.sender_id,m.read_at,m.edited_at,m.deleted_at,m.created_at,u.full_name AS sender_name FROM community_offer_messages m JOIN users u ON u.id=m.sender_id WHERE m.offer_id=? ORDER BY m.created_at ASC LIMIT 500").bind(offerId).all();
  const now=new Date().toISOString();await env.DB.prepare("UPDATE community_offer_messages SET read_at=? WHERE offer_id=? AND sender_id<>? AND read_at IS NULL").bind(now,offerId,user.id).run();
  return json({offer:{id:offer.id,status:offer.status,helpRequestId:offer.help_request_id,title:offer.title,writable:writable(offer),blocked:await pairBlocked(env,user.id,otherUserId),otherUserId},messages:(rows.results||[]).map(m=>({...m,isMine:m.sender_id===user.id}))});
}
async function createMessage(request,env,offerId){
  const {user,offer,otherUserId}=await offerAccess(request,env,offerId);
  if(!writable(offer))throw new CommunityChatError(409,"השיחה סגורה כי ההצעה אינה פעילה עוד");
  if(await pairBlocked(env,user.id,otherUserId))throw new CommunityChatError(403,"לא ניתן לשלוח הודעות למשתמש הזה");
  const b=await readBody(request),message=clean(b.message,1,1000,"הודעה");assertSafeText(message);
  const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM community_offer_messages WHERE sender_id=? AND created_at>=datetime('now','-1 minute')").bind(user.id).first();
  if(Number(recent?.n||0)>=10)throw new CommunityChatError(429,"נשלחו יותר מדי הודעות. נסו שוב בעוד דקה");
  const id=crypto.randomUUID(),now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO community_offer_messages(id,offer_id,sender_id,body,created_at) VALUES(?,?,?,?,?)").bind(id,offerId,user.id,message,now),
    env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body) VALUES(?,?,'message',?,?)").bind(crypto.randomUUID(),otherUserId,"הודעה חדשה בבקשת קהילה",user.full_name+": "+message.slice(0,120))
  ]);
  return json({message:{id,offer_id:offerId,sender_id:user.id,sender_name:user.full_name,body:message,created_at:now,isMine:true}},201);
}
async function editMessage(request,env,messageId){
  const user=await requireUser(request,env),row=await env.DB.prepare("SELECT m.*,o.status AS offer_status FROM community_offer_messages m JOIN help_request_offers o ON o.id=m.offer_id WHERE m.id=?").bind(messageId).first();
  if(!row)throw new CommunityChatError(404,"ההודעה לא נמצאה");if(row.sender_id!==user.id)throw new CommunityChatError(403,"אפשר לערוך רק הודעה ששלחתם");if(row.deleted_at)throw new CommunityChatError(409,"הודעה שנמחקה אינה ניתנת לעריכה");if(!["offered","selected"].includes(row.offer_status))throw new CommunityChatError(409,"השיחה סגורה");if(Date.now()-Date.parse(row.created_at)>15*60000)throw new CommunityChatError(409,"אפשר לערוך הודעה רק ב-15 הדקות הראשונות");
  const b=await readBody(request),message=clean(b.message,1,1000,"הודעה");assertSafeText(message);const now=new Date().toISOString();
  await env.DB.prepare("UPDATE community_offer_messages SET body=?,edited_at=? WHERE id=?").bind(message,now,messageId).run();return json({ok:true,body:message,editedAt:now});
}
async function deleteMessage(request,env,messageId){
  const user=await requireUser(request,env),row=await env.DB.prepare("SELECT id,sender_id,created_at,deleted_at FROM community_offer_messages WHERE id=?").bind(messageId).first();
  if(!row)throw new CommunityChatError(404,"ההודעה לא נמצאה");if(row.sender_id!==user.id)throw new CommunityChatError(403,"אפשר למחוק רק הודעה ששלחתם");if(row.deleted_at)throw new CommunityChatError(409,"ההודעה כבר נמחקה");if(Date.now()-Date.parse(row.created_at)>5*60000)throw new CommunityChatError(409,"אפשר למחוק הודעה רק בחמש הדקות הראשונות");
  const now=new Date().toISOString();await env.DB.prepare("UPDATE community_offer_messages SET body='הודעה נמחקה',deleted_at=? WHERE id=?").bind(now,messageId).run();return json({ok:true,deletedAt:now});
}
async function reportMessage(request,env,messageId){
  const user=await requireUser(request,env),row=await env.DB.prepare("SELECT m.id,m.sender_id,o.responder_id,h.requester_id FROM community_offer_messages m JOIN help_request_offers o ON o.id=m.offer_id JOIN help_requests h ON h.id=o.help_request_id WHERE m.id=?").bind(messageId).first();
  if(!row)throw new CommunityChatError(404,"ההודעה לא נמצאה");if(user.id!==row.responder_id&&user.id!==row.requester_id&&user.role!=="admin")throw new CommunityChatError(403,"אין הרשאה");if(user.id===row.sender_id)throw new CommunityChatError(400,"אי אפשר לדווח על הודעה שלכם");
  const b=await readBody(request),reason=clean(b.reason,2,500,"סיבה");
  try{await env.DB.prepare("INSERT INTO community_offer_message_reports(id,message_id,reporter_id,reason) VALUES(?,?,?,?)").bind(crypto.randomUUID(),messageId,user.id,reason).run()}catch(e){if(String(e).toLowerCase().includes("unique"))throw new CommunityChatError(409,"ההודעה כבר דווחה");throw e}
  return json({ok:true},201);
}
async function archiveOldChats(env){
  const runId=crypto.randomUUID(),created=new Date().toISOString();await env.DB.prepare("INSERT INTO chat_retention_runs(id,status) VALUES(?,'running')").bind(runId).run();
  let loan=0,community=0,media=0;
  try{
    const loanRows=await env.DB.prepare("SELECT m.id,m.media_url FROM request_messages m JOIN loan_requests lr ON lr.id=m.request_id WHERE lr.returned_at IS NOT NULL AND lr.returned_at<datetime('now','-365 days') AND (m.media_url IS NOT NULL OR m.body NOT IN ('[השיחה הועברה לארכיון]','הודעה נמחקה')) LIMIT 500").all();
    for(const row of loanRows.results||[]){const url=String(row.media_url||"");if(url.startsWith("/media/")&&env.ITEM_IMAGES?.delete){try{await env.ITEM_IMAGES.delete(decodeURIComponent(url.slice(7)));media++}catch{}}await env.DB.prepare("UPDATE request_messages SET body='[השיחה הועברה לארכיון]',media_url=NULL,metadata_json='{}',deleted_at=COALESCE(deleted_at,?) WHERE id=?").bind(created,row.id).run();loan++}
    const communityRows=await env.DB.prepare("SELECT m.id FROM community_offer_messages m JOIN help_request_offers o ON o.id=m.offer_id JOIN help_requests h ON h.id=o.help_request_id WHERE h.status='closed' AND h.updated_at<datetime('now','-365 days') AND m.body NOT IN ('[השיחה הועברה לארכיון]','הודעה נמחקה') LIMIT 500").all();
    for(const row of communityRows.results||[]){await env.DB.prepare("UPDATE community_offer_messages SET body='[השיחה הועברה לארכיון]',deleted_at=COALESCE(deleted_at,?) WHERE id=?").bind(created,row.id).run();community++}
    await env.DB.prepare("UPDATE chat_retention_runs SET status='success',loan_messages_archived=?,community_messages_archived=?,media_deleted=?,completed_at=? WHERE id=?").bind(loan,community,media,new Date().toISOString(),runId).run();
    return {loan,community,media};
  }catch(e){await env.DB.prepare("UPDATE chat_retention_runs SET status='failed',loan_messages_archived=?,community_messages_archived=?,media_deleted=?,completed_at=?,error=? WHERE id=?").bind(loan,community,media,new Date().toISOString(),String(e).slice(0,800),runId).run().catch(()=>{});throw e}
}
export async function runCommunityChatMaintenance(env){await ensureCommunityChatSchema(env);return archiveOldChats(env)}
export async function handleCommunityChat(request,env,ctx,url){
  const method=request.method.toUpperCase(),path=url.pathname;
  try{
    await ensureCommunityChatSchema(env);
    let m=path.match(/^\/api\/help-offers\/([^/]+)\/messages$/);
    if(m&&method==="GET")return listMessages(request,env,decodeURIComponent(m[1]));
    if(m&&method==="POST")return createMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/help-offer-messages\/([^/]+)$/);
    if(m&&method==="PATCH")return editMessage(request,env,decodeURIComponent(m[1]));
    if(m&&method==="DELETE")return deleteMessage(request,env,decodeURIComponent(m[1]));
    m=path.match(/^\/api\/help-offer-messages\/([^/]+)\/report$/);
    if(m&&method==="POST")return reportMessage(request,env,decodeURIComponent(m[1]));
    return null;
  }catch(e){if(e instanceof CommunityChatError)return json({error:e.message},e.status);throw e}
}
