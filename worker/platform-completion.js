const SESSION_COOKIE="gmach_session";

class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}


export async function ensurePlatformCompletionSchema(env){
  const alters={
    sessions:[["user_agent_hash","TEXT"],["trusted","INTEGER NOT NULL DEFAULT 0 CHECK (trusted IN (0,1))"]],
    users:[["consent_version","TEXT NOT NULL DEFAULT '2026-09-25'"],["deletion_reminder_sent_at","TEXT"]],
    organizations:[["deletion_cancelled_at","TEXT"],["transfer_pending_to","TEXT"],["draft_json","TEXT NOT NULL DEFAULT '{}'"]],
    items:[["primary_image_url","TEXT"],["material_version","INTEGER NOT NULL DEFAULT 1"],["last_material_change_at","TEXT"]],
    loan_requests:[["hold_expires_at","TEXT"],["pickup_expires_at","TEXT"],["no_show_at","TEXT"],["cancellation_undo_until","TEXT"],["change_pending_json","TEXT"]],
    waitlist_entries:[["response_minutes","INTEGER NOT NULL DEFAULT 120"],["offer_expires_at","TEXT"]],
    request_messages:[["metadata_json","TEXT NOT NULL DEFAULT '{}'"]],
    reviews:[["branch_id","TEXT"],["edited_until","TEXT"]],
    saved_searches:[["last_checked_at","TEXT"],["last_result_signature","TEXT"]],
    push_subscriptions:[["user_agent","TEXT"]]
  };
  for(const [table,defs] of Object.entries(alters)){
    const info=await env.DB.prepare(`PRAGMA table_info(${table})`).all().catch(()=>({results:[]}));
    const cols=new Set((info.results||[]).map(r=>r.name));
    for(const [name,def] of defs) if(!cols.has(name)) await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`).run();
  }
  const statements=[
    "CREATE TABLE IF NOT EXISTS organization_transfers (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),responded_at TEXT)",
    "CREATE TABLE IF NOT EXISTS branch_transfers (id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,unit_id TEXT REFERENCES item_units(id) ON DELETE SET NULL,from_branch_id TEXT REFERENCES organization_branches(id) ON DELETE SET NULL,to_branch_id TEXT NOT NULL REFERENCES organization_branches(id) ON DELETE CASCADE,status TEXT NOT NULL DEFAULT 'in_transit' CHECK (status IN ('in_transit','received','cancelled')),quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),received_at TEXT)",
    "CREATE TABLE IF NOT EXISTS inventory_holds (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT REFERENCES loan_requests(id) ON DELETE CASCADE,quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 999),starts_at TEXT NOT NULL,ends_at TEXT NOT NULL,expires_at TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','converted','released','expired')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS item_images (id TEXT PRIMARY KEY,item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,storage_key TEXT NOT NULL,url TEXT NOT NULL,sort_order INTEGER NOT NULL DEFAULT 0,is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0,1)),moderation_status TEXT NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending','approved','hidden','rejected')),report_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS message_reports (id TEXT PRIMARY KEY,message_id TEXT NOT NULL REFERENCES request_messages(id) ON DELETE CASCADE,reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,reason TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','reviewed','dismissed','removed')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),UNIQUE(message_id,reporter_id))",
    "CREATE TABLE IF NOT EXISTS security_blocks (identity_hash TEXT PRIMARY KEY,reason TEXT NOT NULL,level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),blocked_until TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS admin_action_challenges (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,action TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS calendar_preferences (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,preferred_app TEXT NOT NULL DEFAULT 'ics' CHECK (preferred_app IN ('ics','google','apple','outlook')),reminder_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (reminder_minutes BETWEEN 0 AND 10080),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS user_data_requests (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_type TEXT NOT NULL CHECK (request_type IN ('export','access','correction')),details TEXT,status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','processing','completed','rejected')),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),completed_at TEXT)",
    "CREATE TABLE IF NOT EXISTS notification_queue (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,notification_type TEXT NOT NULL,channel TEXT NOT NULL CHECK (channel IN ('email','push','digest')),title TEXT NOT NULL,body TEXT NOT NULL,payload_json TEXT NOT NULL DEFAULT '{}',scheduled_at TEXT NOT NULL,sent_at TEXT,failed_at TEXT,error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS backup_runs (id TEXT PRIMARY KEY,backup_key TEXT,status TEXT NOT NULL CHECK (status IN ('started','completed','failed')),row_count INTEGER NOT NULL DEFAULT 0,size_bytes INTEGER NOT NULL DEFAULT 0,error TEXT,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),completed_at TEXT)",
    "CREATE TABLE IF NOT EXISTS geo_cache (query_key TEXT PRIMARY KEY,response_json TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS content_reports (id TEXT PRIMARY KEY,entity_type TEXT NOT NULL,entity_id TEXT NOT NULL,reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,reason TEXT NOT NULL,severity TEXT NOT NULL DEFAULT 'normal',status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE TABLE IF NOT EXISTS cms_versions (id TEXT PRIMARY KEY,content_key TEXT NOT NULL,locale TEXT NOT NULL DEFAULT 'he',content_json TEXT NOT NULL,created_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
    "CREATE INDEX IF NOT EXISTS inventory_holds_lookup_idx ON inventory_holds(item_id,status,starts_at,ends_at,expires_at)",
    "CREATE INDEX IF NOT EXISTS branch_transfers_org_status_idx ON branch_transfers(organization_id,status,created_at DESC)",
    "CREATE INDEX IF NOT EXISTS notification_queue_due_idx ON notification_queue(channel,scheduled_at,sent_at,failed_at)",
    "CREATE INDEX IF NOT EXISTS geo_cache_expiry_idx ON geo_cache(expires_at)",
    "CREATE INDEX IF NOT EXISTS content_reports_status_idx ON content_reports(status,severity,created_at)"
  ];
  for(const s of statements) await env.DB.prepare(s).run();
  await env.DB.prepare("DROP TRIGGER IF EXISTS notifications_enqueue_delivery").run();
  await env.DB.prepare(`CREATE TRIGGER notifications_enqueue_delivery AFTER INSERT ON notifications BEGIN
    INSERT INTO notification_queue(id,user_id,notification_type,channel,title,body,payload_json,scheduled_at)
    SELECT lower(hex(randomblob(16))),NEW.user_id,
      CASE WHEN NEW.type IN ('request','status') THEN 'loan_status' WHEN NEW.type='message' THEN 'messages' ELSE 'security' END,
      CASE WHEN p.digest='daily' THEN 'digest' ELSE 'email' END,NEW.title,NEW.body,
      json_object('requestId',NEW.request_id,'notificationId',NEW.id),
      CASE WHEN p.digest='daily' THEN datetime('now','+1 day','start of day','+8 hours') ELSE strftime('%Y-%m-%dT%H:%M:%fZ','now') END
    FROM notification_preferences p JOIN users u ON u.id=p.user_id
    WHERE p.user_id=NEW.user_id
      AND p.notification_type=CASE WHEN NEW.type IN ('request','status') THEN 'loan_status' WHEN NEW.type='message' THEN 'messages' ELSE 'security' END
      AND p.email=1 AND u.operational_emails_accepted=1;
    INSERT INTO notification_queue(id,user_id,notification_type,channel,title,body,payload_json,scheduled_at)
    SELECT lower(hex(randomblob(16))),NEW.user_id,
      CASE WHEN NEW.type IN ('request','status') THEN 'loan_status' WHEN NEW.type='message' THEN 'messages' ELSE 'security' END,
      'push',NEW.title,NEW.body,json_object('requestId',NEW.request_id,'notificationId',NEW.id),strftime('%Y-%m-%dT%H:%M:%fZ','now')
    FROM notification_preferences p
    WHERE p.user_id=NEW.user_id
      AND p.notification_type=CASE WHEN NEW.type IN ('request','status') THEN 'loan_status' WHEN NEW.type='message' THEN 'messages' ELSE 'security' END
      AND p.push=1;
  END`).run();
  const defaults=[
    ["loan_status","operational_emails_accepted","immediate"],
    ["messages","0","immediate"],["security","operational_emails_accepted","immediate"],
    ["support","operational_emails_accepted","immediate"],["community","community_emails_accepted","daily"],
    ["waitlist","operational_emails_accepted","immediate"]
  ];
  for(const [type,emailExpr,digest] of defaults) await env.DB.prepare(`INSERT OR IGNORE INTO notification_preferences(user_id,notification_type,in_app,email,push,digest) SELECT id,?,1,${emailExpr},0,? FROM users WHERE account_status='active'`).bind(type,digest).run();
}

export async function platformPreflight(request,env,url){
  if(url.pathname==="/api/health") return null;
  const block=await currentSecurityBlock(request,env);
  if(block) return json({error:"הגישה הוגבלה זמנית בעקבות פעילות חריגה",blockedUntil:block.blocked_until},429);
  if(!["POST","PUT","PATCH","DELETE"].includes(request.method.toUpperCase())) return null;
  if(!env.TURNSTILE_SECRET_KEY||!["/api/auth/register","/api/support"].includes(url.pathname)) return null;
  let body={}; try{body=await request.clone().json();}catch{return null;}
  const token=String(body.turnstileToken||"").trim();
  if(!token) return json({error:"נדרש אימות אנושי"},400);
  const ok=await verifyTurnstile(env,token,request.headers.get("CF-Connecting-IP"));
  if(!ok){await recordSecurityFailure(request,env,"turnstile_failed");return json({error:"האימות האנושי נכשל. נסו שוב"},400);}
  return null;
}

export async function sessionMetadata(request,env,userId){
  const ua=request.headers.get("User-Agent")||"unknown",ip=request.headers.get("CF-Connecting-IP")||"unknown";
  const userAgentHash=await sha256(ua),ipHash=await sha256(ip),deviceLabel=labelDevice(ua);
  let isNew=false;
  try{
    const known=await env.DB.prepare("SELECT 1 FROM sessions WHERE user_id=? AND user_agent_hash=? LIMIT 1").bind(userId,userAgentHash).first();
    isNew=!known;
    if(isNew) await env.DB.prepare("INSERT INTO security_events(id,user_id,event_type,severity,ip_hash,device_label,details_json) VALUES(?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(),userId,"new_device_login","warning",ipHash,deviceLabel,JSON.stringify({userAgentHash})).run();
  }catch{}
  if(isNew) await sendSecurityEmail(env,userId,"כניסה ממכשיר חדש",`זוהתה כניסה חדשה ממכשיר: ${deviceLabel}. אם זו לא הייתה כניסה שלך, החלף סיסמה ונתק מכשירים אחרים.`);
  return {deviceLabel,ipHash,userAgentHash,isNew};
}

export async function handlePlatformCompletionApi(request,env,ctx,url){
  const method=request.method.toUpperCase(),path=url.pathname;
  if(method==="GET"&&path==="/api/platform/features") return json({
    release:"complete-platform-2026-09-25.6",
    turnstileEnabled:Boolean(env.TURNSTILE_SECRET_KEY&&env.TURNSTILE_SITE_KEY),
    turnstileSiteKey:env.TURNSTILE_SITE_KEY||null,
    pushConfigured:Boolean(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY),
    vapidPublicKey:env.VAPID_PUBLIC_KEY||null,geocoding:true,backups:true,calendar:true,chatMedia:true
  });
  if(method==="GET"&&path==="/api/geocode") return geocode(env,url);
  if(method==="GET"&&path==="/api/search/nearby") return nearbySearch(env,url);
  if(method==="GET"&&path==="/api/compare") return compareItems(env,url);

  let m=path.match(/^\/api\/organizations\/([^/]+)\/categories$/);
  if(m&&method==="GET") return getOrgCategories(request,env,decodeURIComponent(m[1]));
  if(m&&method==="PUT") return setOrgCategories(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/items\/([^/]+)\/categories$/);
  if(m&&method==="GET") return getItemCategories(request,env,decodeURIComponent(m[1]));
  if(m&&method==="PUT") return setItemCategories(request,env,decodeURIComponent(m[1]));
  if(method==="POST"&&path==="/api/category-suggestions") return createCategorySuggestion(request,env);
  if(method==="GET"&&path==="/api/admin/category-suggestions") return listCategorySuggestions(request,env);
  m=path.match(/^\/api\/admin\/category-suggestions\/([^/]+)$/);
  if(m&&method==="PATCH") return reviewCategorySuggestion(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if(m&&method==="PATCH") return updateAdminCategory(request,env,decodeURIComponent(m[1]));

  m=path.match(/^\/api\/organizations\/([^/]+)\/lifecycle$/);
  if(m&&method==="PATCH") return orgLifecycle(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/organizations\/([^/]+)\/transfer$/);
  if(m&&method==="POST") return createOrgTransfer(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/organization-transfers\/([^/]+)\/respond$/);
  if(m&&method==="POST") return respondOrgTransfer(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/branches\/([^/]+)$/);
  if(m&&method==="PATCH") return updateBranch(request,env,decodeURIComponent(m[1]));
  if(m&&method==="DELETE") return archiveBranch(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/organizations\/([^/]+)\/branch-transfers$/);
  if(m&&method==="GET") return listBranchTransfers(request,env,decodeURIComponent(m[1]));
  if(m&&method==="POST") return createBranchTransfer(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/branch-transfers\/([^/]+)\/receive$/);
  if(m&&method==="POST") return receiveBranchTransfer(request,env,decodeURIComponent(m[1]));

  m=path.match(/^\/api\/item-units\/([^/]+)$/);
  if(m&&method==="PATCH") return updateUnit(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/item-units\/([^/]+)\/qr$/);
  if(m&&method==="GET") return unitQr(request,env,decodeURIComponent(m[1]),url);
  if(method==="POST"&&path==="/api/items/bulk") return bulkItems(request,env);
  m=path.match(/^\/api\/items\/([^/]+)\/clone$/);
  if(m&&method==="POST") return cloneItem(request,env,decodeURIComponent(m[1]));
  if(method==="POST"&&path==="/api/items/import") return importItems(request,env);
  m=path.match(/^\/api\/items\/([^/]+)\/remove$/);
  if(m&&method==="POST") return removeItem(request,env,decodeURIComponent(m[1]));

  m=path.match(/^\/api\/loan-requests\/([^/]+)\/change$/);
  if(m&&method==="POST") return requestLoanChange(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/change\/respond$/);
  if(m&&method==="POST") return respondLoanChange(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/undo-cancel$/);
  if(m&&method==="POST") return undoCancel(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/extension\/respond$/);
  if(m&&method==="POST") return respondExtension(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/assign-units$/);
  if(m&&method==="POST") return assignUnits(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/organizations\/([^/]+)\/waitlist$/);
  if(m&&method==="GET") return orgWaitlist(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/waitlist-offers\/([^/]+)\/respond$/);
  if(m&&method==="POST") return respondWaitlist(request,env,decodeURIComponent(m[1]));

  m=path.match(/^\/api\/loan-requests\/([^/]+)\/media$/);
  if(m&&method==="POST") return uploadChatMedia(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/messages\/([^/]+)$/);
  if(m&&method==="DELETE") return deleteMessage(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/messages\/([^/]+)\/report$/);
  if(m&&method==="POST") return reportMessage(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/messages\/read$/);
  if(m&&method==="POST") return markRead(request,env,decodeURIComponent(m[1]));
  m=path.match(/^\/api\/users\/([^/]+)\/block$/);
  if(m&&method==="POST") return blockUser(request,env,decodeURIComponent(m[1]));
  if(m&&method==="DELETE") return unblockUser(request,env,decodeURIComponent(m[1]));

  if(method==="POST"&&path==="/api/push-subscriptions") return savePushSubscription(request,env);
  if(method==="DELETE"&&path==="/api/push-subscriptions") return deletePushSubscription(request,env);
  m=path.match(/^\/api\/loan-requests\/([^/]+)\/calendar\.ics$/);
  if(m&&method==="GET") return loanCalendar(request,env,decodeURIComponent(m[1]));
  if(method==="GET"&&path==="/api/me/calendar-preferences") return calendarPreferences(request,env);
  if(method==="PUT"&&path==="/api/me/calendar-preferences") return saveCalendarPreferences(request,env);
  if(method==="GET"&&path==="/api/me/export") return exportMyData(request,env);
  if(method==="POST"&&path==="/api/me/data-request") return dataRequest(request,env);

  if(method==="GET"&&path==="/api/admin/operations/export.csv") return adminCsv(request,env);
  if(method==="GET"&&path==="/api/admin/backups") return listBackups(request,env);
  if(method==="POST"&&path==="/api/admin/backups/run") return runBackupNow(request,env,ctx);
  if(method==="GET"&&path==="/api/admin/reports/all") return adminReports(request,env);
  return null;
}

export async function runPlatformCompletionMaintenance(env){
  const now=new Date().toISOString();
  await qrun(env,"UPDATE items SET status='active',updated_at=? WHERE status!='active' AND publish_at IS NOT NULL AND publish_at<=? AND deleted_at IS NULL",[now,now]);
  await qrun(env,"UPDATE inventory_holds SET status='expired' WHERE status='active' AND expires_at<=?",[now]);
  await qrun(env,"UPDATE waitlist_entries SET status='waiting',offer_expires_at=NULL WHERE status='notified' AND offer_expires_at IS NOT NULL AND offer_expires_at<=?",[now]);

  const overdue=await qall(env,"SELECT lr.id,lr.borrower_id,o.owner_id,i.title FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.status='collected' AND lr.requested_until<? AND lr.workflow_status!='overdue' LIMIT 200",[now]);
  for(const row of overdue){
    await env.DB.batch([
      env.DB.prepare("UPDATE loan_requests SET workflow_status='overdue',updated_at=? WHERE id=?").bind(now,row.id),
      notify(env,row.borrower_id,"status","ההשאלה באיחור",`מועד ההחזרה של ${row.title} עבר. אפשר לבקש הארכה.`,row.id),
      notify(env,row.owner_id,"status","פריט באיחור",`${row.title} טרם הוחזר במועד.`,row.id)
    ]);
  }
  await processWaitlist(env,now);
  await processDeletionLifecycle(env,now);
  await processSavedSearches(env,now);
  await processNotificationQueue(env,now);
  await maybeBackup(env,now);
}

/* ---------- discovery ---------- */
async function geocode(env,url){
  const q=clean(url.searchParams.get("q"),3,180,"כתובת"),key=q.toLowerCase().replace(/\s+/g," ");
  const cached=await qfirst(env,"SELECT response_json FROM geo_cache WHERE query_key=? AND expires_at>?",[key,new Date().toISOString()]);
  if(cached) return json({results:safeJson(cached.response_json,[])});
  const endpoint=new URL(env.GEOCODING_ENDPOINT||"https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("format","jsonv2");endpoint.searchParams.set("countrycodes","il");endpoint.searchParams.set("limit","8");endpoint.searchParams.set("addressdetails","1");endpoint.searchParams.set("q",q);
  const res=await fetch(endpoint,{headers:{"Accept":"application/json","User-Agent":"Gmach-Berega/1.0"}});
  if(!res.ok) throw new HttpError(503,"שירות הכתובות אינו זמין כרגע");
  const raw=await res.json(),results=(Array.isArray(raw)?raw:[]).slice(0,8).map(x=>({displayName:x.display_name,lat:Number(x.lat),lon:Number(x.lon),type:x.type,address:x.address||{}}));
  await qrun(env,"INSERT INTO geo_cache(query_key,response_json,expires_at) VALUES(?,?,datetime('now','+30 days')) ON CONFLICT(query_key) DO UPDATE SET response_json=excluded.response_json,expires_at=excluded.expires_at",[key,JSON.stringify(results)]);
  return json({results});
}
async function nearbySearch(env,url){
  const lat=Number(url.searchParams.get("lat")),lon=Number(url.searchParams.get("lon")),radius=Math.min(200,Math.max(1,Number(url.searchParams.get("radius")||20)));
  if(!Number.isFinite(lat)||!Number.isFinite(lon)) throw new HttpError(400,"מיקום אינו תקין");
  const rows=await qall(env,`SELECT i.id,i.title,i.category,i.condition,i.condition_detail,i.availability_status,i.city,o.id organization_id,o.name organization_name,b.id branch_id,b.name branch_name,b.address,b.city branch_city,b.latitude,b.longitude FROM items i JOIN organizations o ON o.id=i.organization_id JOIN organization_branches b ON b.organization_id=o.id WHERE i.status='active' AND i.is_free=1 AND o.status='approved' AND o.is_hidden=0 AND b.status='active' AND b.latitude IS NOT NULL AND b.longitude IS NOT NULL LIMIT 500`,[]);
  return json({results:rows.map(r=>({...r,distanceKm:haversine(lat,lon,+r.latitude,+r.longitude)})).filter(r=>r.distanceKm<=radius).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,100)});
}
async function compareItems(env,url){
  const ids=[...new Set(String(url.searchParams.get("ids")||"").split(",").map(x=>x.trim()).filter(Boolean))].slice(0,5);if(!ids.length)return json({items:[]});
  const rows=await qall(env,`SELECT i.id,i.title,i.category,i.subcategory,i.description,i.condition,i.condition_detail,i.quantity,i.availability_status,i.city,i.pickup_method,i.min_loan_minutes,i.max_loan_minutes,i.deposit_required,i.deposit_amount_agorot,i.service_radius_km,o.name organization_name FROM items i JOIN organizations o ON o.id=i.organization_id WHERE i.id IN (${ids.map(()=>"?").join(",")}) AND i.status='active'`,ids);return json({items:rows});
}

/* ---------- categories ---------- */
async function getOrgCategories(request,env,id){
  await requireOrg(request,env,id,["owner","inventory","requests","reports"]);
  return json({categories:await qall(env,`SELECT c.* FROM categories c JOIN organization_categories x ON x.category_id=c.id WHERE x.organization_id=? ORDER BY c.sort_order,c.name_he`,[id])});
}
async function setOrgCategories(request,env,id){
  const {user}=await requireOrg(request,env,id,["owner"]),b=await readJson(request),ids=[...new Set(Array.isArray(b.categoryIds)?b.categoryIds.map(String):[])].slice(0,20);
  if(!ids.length)throw new HttpError(400,"יש לבחור לפחות קטגוריה אחת");
  const valid=await qall(env,`SELECT id FROM categories WHERE status='active' AND id IN (${ids.map(()=>"?").join(",")})`,ids);
  if(valid.length!==ids.length)throw new HttpError(400,"אחת הקטגוריות אינה זמינה");
  const statements=[env.DB.prepare("DELETE FROM organization_categories WHERE organization_id=?").bind(id)];
  for(const cid of ids)statements.push(env.DB.prepare("INSERT INTO organization_categories(organization_id,category_id) VALUES(?,?)").bind(id,cid));
  await env.DB.batch(statements);await audit(env,user.id,"organization.categories",id,{categoryIds:ids});return json({ok:true,categoryIds:ids});
}
async function getItemCategories(request,env,id){
  const user=await requireUser(request,env),item=await qfirst(env,"SELECT organization_id FROM items WHERE id=?",[id]);if(!item)throw new HttpError(404,"הפריט לא נמצא");
  await requireOrg(request,env,item.organization_id,["owner","inventory","requests","reports"]);
  return json({categories:await qall(env,`SELECT c.* FROM categories c JOIN item_categories x ON x.category_id=c.id WHERE x.item_id=? ORDER BY c.sort_order,c.name_he`,[id])});
}
async function setItemCategories(request,env,id){
  const user=await requireUser(request,env),item=await itemPermission(env,user,id);if(!item)throw new HttpError(403,"אין הרשאה");
  const b=await readJson(request),ids=[...new Set(Array.isArray(b.categoryIds)?b.categoryIds.map(String):[])].slice(0,20);if(!ids.length)throw new HttpError(400,"יש לבחור לפחות קטגוריה אחת");
  const valid=await qall(env,`SELECT id FROM categories WHERE status='active' AND id IN (${ids.map(()=>"?").join(",")})`,ids);if(valid.length!==ids.length)throw new HttpError(400,"אחת הקטגוריות אינה זמינה");
  const s=[env.DB.prepare("DELETE FROM item_categories WHERE item_id=?").bind(id)];for(const cid of ids)s.push(env.DB.prepare("INSERT INTO item_categories(item_id,category_id) VALUES(?,?)").bind(id,cid));await env.DB.batch(s);return json({ok:true,categoryIds:ids});
}
async function createCategorySuggestion(request,env){
  const user=await requireUser(request,env),b=await readJson(request),id=crypto.randomUUID(),orgId=optional(b.organizationId,100);
  if(orgId)await requireOrg(request,env,orgId,["owner","inventory"]);
  await qrun(env,"INSERT INTO category_suggestions(id,organization_id,suggested_by,parent_category_id,name,description) VALUES(?,?,?,?,?,?)",[id,orgId,user.id,optional(b.parentCategoryId,100),clean(b.name,2,80,"שם הקטגוריה"),optional(b.description,500)]);
  return json({suggestion:{id,status:"pending"}},201);
}
async function listCategorySuggestions(request,env){await requireAdmin(request,env);return json({suggestions:await qall(env,`SELECT s.*,u.full_name suggested_by_name,o.name organization_name FROM category_suggestions s JOIN users u ON u.id=s.suggested_by LEFT JOIN organizations o ON o.id=s.organization_id ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.created_at DESC LIMIT 300`,[])});}
async function reviewCategorySuggestion(request,env,id){
  const admin=await requireAdmin(request,env),b=await readJson(request),x=await qfirst(env,"SELECT * FROM category_suggestions WHERE id=?",[id]);if(!x)throw new HttpError(404,"ההצעה לא נמצאה");
  const status=b.status==="approved"?"approved":b.status==="rejected"?"rejected":null;if(!status)throw new HttpError(400,"סטטוס אינו תקין");
  let categoryId=null;if(status==="approved"){categoryId=optional(b.categoryId,80)||("cat-"+crypto.randomUUID().slice(0,8));await qrun(env,"INSERT OR IGNORE INTO categories(id,parent_id,name_he,name_en,icon,synonyms_json,status,sort_order) VALUES(?,?,?,?,?,'[]','active',999)",[categoryId,x.parent_category_id,x.name,optional(b.nameEn,80),optional(b.icon,50)]);}
  await qrun(env,"UPDATE category_suggestions SET status=?,reviewed_at=? WHERE id=?",[status,new Date().toISOString(),id]);await audit(env,admin.id,"category.suggestion.review",id,{status,categoryId});return json({ok:true,status,categoryId});
}
async function updateAdminCategory(request,env,id){
  const admin=await requireAdmin(request,env),b=await readJson(request),x=await qfirst(env,"SELECT * FROM categories WHERE id=?",[id]);if(!x)throw new HttpError(404,"הקטגוריה לא נמצאה");
  const mergeInto=optional(b.mergeInto,80);if(mergeInto){
    if(!await qfirst(env,"SELECT id FROM categories WHERE id=?",[mergeInto]))throw new HttpError(400,"קטגוריית היעד אינה קיימת");
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO organization_categories(organization_id,category_id) SELECT organization_id,? FROM organization_categories WHERE category_id=?").bind(mergeInto,id),
      env.DB.prepare("INSERT OR IGNORE INTO item_categories(item_id,category_id) SELECT item_id,? FROM item_categories WHERE category_id=?").bind(mergeInto,id),
      env.DB.prepare("DELETE FROM organization_categories WHERE category_id=?").bind(id),
      env.DB.prepare("DELETE FROM item_categories WHERE category_id=?").bind(id),
      env.DB.prepare("UPDATE categories SET status='hidden',updated_at=? WHERE id=?").bind(new Date().toISOString(),id)
    ]);await audit(env,admin.id,"category.merge",id,{mergeInto});return json({ok:true,mergedInto:mergeInto});
  }
  const status=["active","hidden","pending"].includes(b.status)?b.status:x.status,parent=b.parentId===undefined?x.parent_id:optional(b.parentId,80);
  await qrun(env,"UPDATE categories SET parent_id=?,name_he=?,name_en=?,icon=?,image_url=?,synonyms_json=?,status=?,sort_order=?,updated_at=? WHERE id=?",[parent,b.nameHe===undefined?x.name_he:clean(b.nameHe,2,80,"שם"),b.nameEn===undefined?x.name_en:optional(b.nameEn,80),b.icon===undefined?x.icon:optional(b.icon,50),b.imageUrl===undefined?x.image_url:optional(b.imageUrl,500),b.synonyms===undefined?x.synonyms_json:JSON.stringify(Array.isArray(b.synonyms)?b.synonyms.slice(0,80):[]),status,b.sortOrder===undefined?x.sort_order:Math.max(0,Math.min(9999,Number(b.sortOrder)||0)),new Date().toISOString(),id]);await audit(env,admin.id,"category.update",id,{status,parent});return json({ok:true});
}

/* ---------- organizations / branches ---------- */
async function orgLifecycle(request,env,id){
  const {user}=await requireOrg(request,env,id,["owner"]),b=await readJson(request),a=String(b.action||""),now=new Date().toISOString();
  if(a==="close") await qrun(env,"UPDATE organizations SET temporarily_closed=1,reopens_at=?,updated_at=? WHERE id=?",[b.reopensAt?iso(b.reopensAt,"מועד פתיחה"):null,now,id]);
  else if(a==="reopen") await qrun(env,"UPDATE organizations SET temporarily_closed=0,reopens_at=NULL,updated_at=? WHERE id=?",[now,id]);
  else if(a==="request_delete") await qrun(env,"UPDATE organizations SET deletion_requested_at=?,is_hidden=1,updated_at=? WHERE id=?",[now,now,id]);
  else if(a==="cancel_delete") await qrun(env,"UPDATE organizations SET deletion_requested_at=NULL,deletion_cancelled_at=?,is_hidden=0,updated_at=? WHERE id=?",[now,now,id]);
  else throw new HttpError(400,"פעולת גמ״ח אינה תקינה");await audit(env,user.id,"organization.lifecycle",id,{action:a});return json({ok:true});
}
async function createOrgTransfer(request,env,id){
  const {user}=await requireOrg(request,env,id,["owner"]),b=await readJson(request),target=await qfirst(env,"SELECT id FROM users WHERE email=? COLLATE NOCASE AND account_status='active'",[String(b.email||"").trim().toLowerCase()]);
  if(!target)throw new HttpError(404,"לא נמצא משתמש פעיל");if(target.id===user.id)throw new HttpError(400,"הבעלות כבר שלך");
  const tid=crypto.randomUUID(),expires=new Date(Date.now()+7*86400000).toISOString(),now=new Date().toISOString();
  await env.DB.batch([env.DB.prepare("UPDATE organization_transfers SET status='cancelled',responded_at=? WHERE organization_id=? AND status='pending'").bind(now,id),env.DB.prepare("INSERT INTO organization_transfers(id,organization_id,from_user_id,to_user_id,expires_at) VALUES(?,?,?,?,?)").bind(tid,id,user.id,target.id,expires),env.DB.prepare("UPDATE organizations SET transfer_pending_to=? WHERE id=?").bind(target.id,id),notify(env,target.id,"status","העברת בעלות ממתינה","הוזמנת לקבל בעלות על גמ״ח.",null)]);return json({transfer:{id:tid,expiresAt:expires}},201);
}
async function respondOrgTransfer(request,env,id){
  const user=await requireUser(request,env),b=await readJson(request),now=new Date().toISOString(),row=await qfirst(env,"SELECT * FROM organization_transfers WHERE id=? AND to_user_id=? AND status='pending' AND expires_at>?",[id,user.id,now]);if(!row)throw new HttpError(404,"העברת הבעלות אינה זמינה");
  if(b.accept===true)await env.DB.batch([env.DB.prepare("UPDATE organization_transfers SET status='accepted',responded_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE organizations SET owner_id=?,transfer_pending_to=NULL,updated_at=? WHERE id=?").bind(user.id,now,row.organization_id),env.DB.prepare("INSERT OR REPLACE INTO organization_members(organization_id,user_id,role) VALUES(?,?,'owner')").bind(row.organization_id,user.id),notify(env,row.from_user_id,"status","העברת הבעלות הושלמה","הבעלות על הגמ״ח הועברה.",null)]);
  else await env.DB.batch([env.DB.prepare("UPDATE organization_transfers SET status='declined',responded_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE organizations SET transfer_pending_to=NULL WHERE id=?").bind(row.organization_id)]);return json({ok:true});
}
async function updateBranch(request,env,id){
  const x=await qfirst(env,"SELECT * FROM organization_branches WHERE id=?",[id]);if(!x)throw new HttpError(404,"הסניף לא נמצא");await requireOrg(request,env,x.organization_id,["owner"]);const b=await readJson(request),now=new Date().toISOString();
  const status=["active","temporarily_closed","archived"].includes(b.status)?b.status:x.status,mode=["separate","shared","hybrid"].includes(b.inventoryMode)?b.inventoryMode:x.inventory_mode;
  await qrun(env,"UPDATE organization_branches SET name=?,address=?,city=?,latitude=?,longitude=?,phone=?,hours_json=?,inventory_mode=?,status=?,reopens_at=?,updated_at=? WHERE id=?",[b.name===undefined?x.name:clean(b.name,2,80,"שם"),b.address===undefined?x.address:clean(b.address,5,180,"כתובת"),b.city===undefined?x.city:clean(b.city,2,80,"עיר"),numOrNull(b.latitude,x.latitude),numOrNull(b.longitude,x.longitude),b.phone===undefined?x.phone:optional(b.phone,30),b.hours===undefined?x.hours_json:JSON.stringify(b.hours||{}),mode,status,b.reopensAt===undefined?x.reopens_at:(b.reopensAt?iso(b.reopensAt,"מועד פתיחה"):null),now,id]);return json({ok:true});
}
async function archiveBranch(request,env,id){const x=await qfirst(env,"SELECT organization_id FROM organization_branches WHERE id=?",[id]);if(!x)throw new HttpError(404,"הסניף לא נמצא");await requireOrg(request,env,x.organization_id,["owner"]);if(await qfirst(env,"SELECT 1 FROM loan_requests WHERE branch_id=? AND status IN ('pending','approved','collected') LIMIT 1",[id]))throw new HttpError(409,"לא ניתן לארכב סניף עם השאלה פעילה");await qrun(env,"UPDATE organization_branches SET status='archived',updated_at=? WHERE id=?",[new Date().toISOString(),id]);return json({ok:true});}
async function listBranchTransfers(request,env,id){await requireOrg(request,env,id,["owner","inventory"]);return json({transfers:await qall(env,`SELECT t.*,i.title,u.serial_number,fb.name from_branch_name,tb.name to_branch_name FROM branch_transfers t JOIN items i ON i.id=t.item_id LEFT JOIN item_units u ON u.id=t.unit_id LEFT JOIN organization_branches fb ON fb.id=t.from_branch_id JOIN organization_branches tb ON tb.id=t.to_branch_id WHERE t.organization_id=? ORDER BY t.created_at DESC LIMIT 200`,[id])});}
async function createBranchTransfer(request,env,orgId){
  const {user}=await requireOrg(request,env,orgId,["owner","inventory"]),b=await readJson(request),itemId=clean(b.itemId,1,100,"פריט"),to=clean(b.toBranchId,1,100,"סניף יעד"),unitId=optional(b.unitId,100);if(!await qfirst(env,"SELECT 1 FROM items WHERE id=? AND organization_id=?",[itemId,orgId]))throw new HttpError(404,"הפריט לא נמצא");if(!await qfirst(env,"SELECT 1 FROM organization_branches WHERE id=? AND organization_id=? AND status!='archived'",[to,orgId]))throw new HttpError(404,"סניף היעד לא נמצא");
  let from=optional(b.fromBranchId,100);if(unitId){const u=await qfirst(env,"SELECT branch_id,status FROM item_units WHERE id=? AND item_id=?",[unitId,itemId]);if(!u)throw new HttpError(404,"היחידה לא נמצאה");if(["loaned","held","repair","retired"].includes(u.status))throw new HttpError(409,"לא ניתן להעביר יחידה במצב הנוכחי");from=u.branch_id;await qrun(env,"UPDATE item_units SET status='inactive',updated_at=? WHERE id=?",[new Date().toISOString(),unitId]);}
  const id=crypto.randomUUID();await qrun(env,"INSERT INTO branch_transfers(id,organization_id,item_id,unit_id,from_branch_id,to_branch_id,quantity,created_by) VALUES(?,?,?,?,?,?,?,?)",[id,orgId,itemId,unitId,from,to,Math.max(1,Math.min(999,Number(b.quantity)||1)),user.id]);return json({transfer:{id,status:"in_transit"}},201);
}
async function receiveBranchTransfer(request,env,id){const x=await qfirst(env,"SELECT * FROM branch_transfers WHERE id=?",[id]);if(!x)throw new HttpError(404,"ההעברה לא נמצאה");await requireOrg(request,env,x.organization_id,["owner","inventory"]);if(x.status!=="in_transit")throw new HttpError(409,"ההעברה כבר טופלה");const now=new Date().toISOString(),s=[env.DB.prepare("UPDATE branch_transfers SET status='received',received_at=? WHERE id=?").bind(now,id)];if(x.unit_id)s.push(env.DB.prepare("UPDATE item_units SET branch_id=?,status='available',updated_at=? WHERE id=?").bind(x.to_branch_id,now,x.unit_id));await env.DB.batch(s);return json({ok:true});}

/* ---------- inventory ---------- */
async function updateUnit(request,env,id){const u=await qfirst(env,"SELECT u.*,i.organization_id FROM item_units u JOIN items i ON i.id=u.item_id WHERE u.id=?",[id]);if(!u)throw new HttpError(404,"היחידה לא נמצאה");await requireOrg(request,env,u.organization_id,["owner","inventory"]);const b=await readJson(request),st=["available","held","loaned","repair","inactive","retired"].includes(b.status)?b.status:u.status,cond=b.condition===undefined?u.condition:clean(b.condition,2,50,"מצב");await qrun(env,"UPDATE item_units SET status=?,condition=?,branch_id=?,retired_at=CASE WHEN ?='retired' THEN COALESCE(retired_at,?) ELSE retired_at END,updated_at=? WHERE id=?",[st,cond,b.branchId===undefined?u.branch_id:optional(b.branchId,100),st,new Date().toISOString(),new Date().toISOString(),id]);if(st==="retired")await qrun(env,"INSERT OR IGNORE INTO retired_serials(serial_number,item_unit_id) VALUES(?,?)",[u.serial_number,id]);return json({ok:true,status:st});}
async function unitQr(request,env,id,url){const u=await qfirst(env,"SELECT u.id,u.serial_number,u.status,i.title,i.organization_id FROM item_units u JOIN items i ON i.id=u.item_id WHERE u.id=?",[id]);if(!u)throw new HttpError(404,"היחידה לא נמצאה");await requireOrg(request,env,u.organization_id,["owner","inventory","requests"]);return json({unit:u,payload:`${url.origin}/#/unit/${encodeURIComponent(id)}`,actions:["open","collect","return","edit","history","report"]});}
async function bulkItems(request,env){const user=await requireUser(request,env),b=await readJson(request),ids=[...new Set(Array.isArray(b.itemIds)?b.itemIds.map(String):[])].slice(0,200);if(!ids.length)throw new HttpError(400,"לא נבחרו פריטים");let changed=0;for(const id of ids){const x=await itemPermission(env,user,id);if(!x)continue;if(b.action==="activate")changed+=(await env.DB.prepare("UPDATE items SET status='active',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run()).meta.changes;else if(b.action==="deactivate")changed+=(await env.DB.prepare("UPDATE items SET status='archived',updated_at=? WHERE id=?").bind(new Date().toISOString(),id).run()).meta.changes;else if(b.action==="availability")changed+=(await env.DB.prepare("UPDATE items SET availability_status=?,updated_at=? WHERE id=?").bind(["available","unavailable","reserved"].includes(b.value)?b.value:"available",new Date().toISOString(),id).run()).meta.changes;else if(b.action==="category")changed+=(await env.DB.prepare("UPDATE items SET category=?,updated_at=? WHERE id=?").bind(clean(b.value,2,50,"קטגוריה"),new Date().toISOString(),id).run()).meta.changes;else throw new HttpError(400,"פעולה לא תקינה");}return json({ok:true,changed});}
async function cloneItem(request,env,id){const user=await requireUser(request,env),x=await itemPermission(env,user,id);if(!x)throw new HttpError(404,"הפריט לא נמצא או שאין הרשאה");const row=await qfirst(env,"SELECT * FROM items WHERE id=?",[id]),b=await readJson(request),nid=crypto.randomUUID();await qrun(env,`INSERT INTO items(id,organization_id,title,category,description,condition,quantity,loan_conditions,city,neighborhood,image_urls,status,availability_status,is_free,icon,cover_color,item_type,subcategory,tags_json,pickup_method,min_loan_minutes,max_loan_minutes,booking_notice_minutes,turnaround_minutes,booking_horizon_days,approval_mode,deposit_required,deposit_amount_agorot,condition_detail) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[nid,row.organization_id,clean(b.title||row.title+" — עותק",2,120,"שם"),row.category,row.description,row.condition,row.quantity,row.loan_conditions,row.city,row.neighborhood,row.image_urls,"active",row.availability_status,1,row.icon,row.cover_color,row.item_type,row.subcategory,row.tags_json,row.pickup_method,row.min_loan_minutes,row.max_loan_minutes,row.booking_notice_minutes,row.turnaround_minutes,row.booking_horizon_days,row.approval_mode,row.deposit_required,row.deposit_amount_agorot,row.condition_detail]);return json({item:{id:nid}},201);}
async function importItems(request,env){const b=await readJson(request),orgId=clean(b.organizationId,1,100,"גמ״ח");await requireOrg(request,env,orgId,["owner","inventory"]);const rows=Array.isArray(b.items)?b.items.slice(0,500):[];if(!rows.length)throw new HttpError(400,"אין שורות לייבוא");const created=[],errors=[];for(let i=0;i<rows.length;i++){const x=rows[i];try{const id=crypto.randomUUID(),detail=clean(x.condition||"מצב טוב",2,50,"מצב"),base=normalizeCondition(detail);await qrun(env,"INSERT INTO items(id,organization_id,title,category,description,condition,condition_detail,quantity,loan_conditions,city,neighborhood,status,availability_status,is_free) VALUES(?,?,?,?,?,?,?,?,?,?,?,'active','available',1)",[id,orgId,clean(x.title,2,120,"שם"),clean(x.category||"כללי",2,50,"קטגוריה"),clean(x.description||"פריט להשאלה ללא תשלום",10,1000,"תיאור"),base,detail,Math.max(1,Math.min(999,Number(x.quantity)||1)),optional(x.loanConditions,800),clean(x.city,2,80,"עיר"),optional(x.neighborhood,80)]);created.push({row:i+1,id});}catch(e){errors.push({row:i+1,error:e.message||"שגיאה"});}}return json({created,errors,ok:!errors.length},errors.length?207:201);}
async function removeItem(request,env,id){const user=await requireUser(request,env);if(!await itemPermission(env,user,id))throw new HttpError(404,"הפריט לא נמצא");const active=await qfirst(env,"SELECT 1 FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') LIMIT 1",[id]),now=new Date().toISOString();if(active){await qrun(env,"UPDATE items SET status='archived',deleted_at=?,updated_at=? WHERE id=?",[now,now,id]);return json({ok:true,deferred:true});}const history=await qfirst(env,"SELECT 1 FROM loan_requests WHERE item_id=? LIMIT 1",[id]);if(history)await qrun(env,"UPDATE items SET status='archived',deleted_at=?,title='פריט שהוסר',description='הפריט אינו פעיל עוד',image_urls='[]',updated_at=? WHERE id=?",[now,now,id]);else await qrun(env,"DELETE FROM items WHERE id=?",[id]);return json({ok:true,deferred:false});}

/* ---------- loan lifecycle ---------- */
async function requestLoanChange(request,env,id){const user=await requireUser(request,env),b=await readJson(request),x=await qfirst(env,"SELECT lr.*,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?",[id]);if(!x||x.borrower_id!==user.id)throw new HttpError(404,"ההשאלה לא נמצאה");if(!["pending","approved"].includes(x.status))throw new HttpError(409,"לא ניתן לשנות בשלב הזה");const change={requestedFrom:b.requestedFrom?iso(b.requestedFrom,"מועד התחלה"):x.requested_from,requestedUntil:b.requestedUntil?iso(b.requestedUntil,"מועד סיום"):x.requested_until,quantity:Math.max(1,Math.min(999,Number(b.quantity)||Number(x.quantity)||1))};if(change.requestedUntil<=change.requestedFrom)throw new HttpError(400,"מועד הסיום חייב להיות מאוחר יותר");await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET change_pending_json=?,workflow_status='change_pending',updated_at=? WHERE id=?").bind(JSON.stringify(change),new Date().toISOString(),id),notify(env,x.owner_id,"status","בקשת שינוי להשאלה","השואל ביקש לשנות מועד או כמות.",id)]);return json({ok:true,change},201);}
async function respondLoanChange(request,env,id){const b=await readJson(request),x=await qfirst(env,"SELECT lr.*,i.organization_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE lr.id=?",[id]);if(!x)throw new HttpError(404,"ההשאלה לא נמצאה");await requireOrg(request,env,x.organization_id,["owner","requests"]);const c=safeJson(x.change_pending_json,null);if(!c)throw new HttpError(409,"אין שינוי ממתין");const now=new Date().toISOString();if(b.accept===true)await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET requested_from=?,requested_until=?,quantity=?,change_pending_json=NULL,workflow_status='inventory_held',updated_at=? WHERE id=?").bind(c.requestedFrom,c.requestedUntil,c.quantity,now,id),notify(env,x.borrower_id,"status","השינוי אושר","השינוי שביקשת אושר.",id)]);else await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET change_pending_json=NULL,workflow_status=?,updated_at=? WHERE id=?").bind(x.status==="approved"?"approved_ready_for_pickup":"inventory_held",now,id),notify(env,x.borrower_id,"status","השינוי לא אושר","בקשת השינוי לא אושרה.",id)]);return json({ok:true});}
async function undoCancel(request,env,id){const user=await requireUser(request,env),x=await qfirst(env,"SELECT * FROM loan_requests WHERE id=?",[id]);if(!x||x.borrower_id!==user.id)throw new HttpError(404,"הבקשה לא נמצאה");if(x.status!=="cancelled"||!x.cancellation_undo_until||x.cancellation_undo_until<=new Date().toISOString())throw new HttpError(409,"חלון הביטול החוזר הסתיים");await qrun(env,"UPDATE loan_requests SET status='pending',cancelled_at=NULL,cancellation_undo_until=NULL,workflow_status='inventory_held',updated_at=? WHERE id=?",[new Date().toISOString(),id]);return json({ok:true});}
async function respondExtension(request,env,id){const b=await readJson(request),x=await qfirst(env,"SELECT lr.*,i.organization_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE lr.id=?",[id]);if(!x)throw new HttpError(404,"ההשאלה לא נמצאה");await requireOrg(request,env,x.organization_id,["owner","requests"]);if(x.extension_status!=="pending"||!x.extension_until)throw new HttpError(409,"אין בקשת הארכה ממתינה");const now=new Date().toISOString(),until=b.alternativeUntil?iso(b.alternativeUntil,"מועד חלופי"):x.extension_until;if(b.accept===true)await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET requested_until=?,extension_status='approved',workflow_status=CASE WHEN status='collected' THEN 'awaiting_return' ELSE 'approved_ready_for_pickup' END,updated_at=? WHERE id=?").bind(until,now,id),notify(env,x.borrower_id,"status","הארכה אושרה","בקשת ההארכה אושרה.",id)]);else if(b.alternativeUntil)await qrun(env,"UPDATE loan_requests SET extension_until=?,extension_status='pending',updated_at=? WHERE id=?",[until,now,id]);else await env.DB.batch([env.DB.prepare("UPDATE loan_requests SET extension_status='declined',updated_at=? WHERE id=?").bind(now,id),notify(env,x.borrower_id,"status","הארכה לא אושרה","בקשת ההארכה לא אושרה.",id)]);return json({ok:true});}
async function assignUnits(request,env,id){const x=await qfirst(env,"SELECT lr.*,i.organization_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE lr.id=?",[id]);if(!x)throw new HttpError(404,"ההשאלה לא נמצאה");await requireOrg(request,env,x.organization_id,["owner","requests","inventory"]);const b=await readJson(request),ids=[...new Set(Array.isArray(b.unitIds)?b.unitIds.map(String):[])];if(ids.length!==Number(x.quantity||1))throw new HttpError(400,"מספר היחידות אינו מתאים לכמות");const now=new Date().toISOString(),s=[];for(const unitId of ids){const u=await qfirst(env,"SELECT id,status FROM item_units WHERE id=? AND item_id=?",[unitId,x.item_id]);if(!u||u.status!=="available")throw new HttpError(409,"יחידה אינה זמינה");s.push(env.DB.prepare("INSERT OR IGNORE INTO loan_unit_assignments(request_id,unit_id) VALUES(?,?)").bind(id,unitId),env.DB.prepare("UPDATE item_units SET status='loaned',updated_at=? WHERE id=?").bind(now,unitId));}s.push(env.DB.prepare("UPDATE loan_requests SET status='collected',workflow_status='awaiting_return',collected_at=?,updated_at=? WHERE id=?").bind(now,now,id));await env.DB.batch(s);return json({ok:true,units:ids});}
async function orgWaitlist(request,env,id){await requireOrg(request,env,id,["owner","requests"]);return json({entries:await qall(env,`SELECT w.*,i.title,u.full_name FROM waitlist_entries w JOIN items i ON i.id=w.item_id JOIN users u ON u.id=w.user_id WHERE i.organization_id=? AND w.status IN ('waiting','notified') ORDER BY w.created_at`,[id])});}
async function respondWaitlist(request,env,id){const user=await requireUser(request,env),b=await readJson(request),x=await qfirst(env,"SELECT o.*,w.user_id,w.item_id,w.requested_from,w.requested_until,w.quantity FROM waitlist_offers o JOIN waitlist_entries w ON w.id=o.waitlist_entry_id WHERE o.id=?",[id]);if(!x||x.user_id!==user.id||x.accepted_at||x.declined_at||x.expires_at<=new Date().toISOString())throw new HttpError(404,"ההצעה אינה זמינה");const now=new Date().toISOString();if(b.accept===true){await env.DB.batch([env.DB.prepare("UPDATE waitlist_offers SET accepted_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE waitlist_entries SET status='converted' WHERE id=?").bind(x.waitlist_entry_id)]);return json({ok:true,accepted:true,itemId:x.item_id,requestedFrom:x.requested_from,requestedUntil:x.requested_until,quantity:x.quantity});}await env.DB.batch([env.DB.prepare("UPDATE waitlist_offers SET declined_at=? WHERE id=?").bind(now,id),env.DB.prepare("UPDATE waitlist_entries SET status='cancelled' WHERE id=?").bind(x.waitlist_entry_id)]);return json({ok:true,accepted:false});}

/* ---------- chat ---------- */
async function uploadChatMedia(request,env,id){const {user,loan,otherUserId}=await loanParticipant(request,env,id);if(await blockedPair(env,user.id,otherUserId,id))throw new HttpError(403,"לא ניתן לשלוח הודעות");if(loan.returned_at&&Date.now()-Date.parse(loan.returned_at)>14*86400000)throw new HttpError(409,"השיחה נסגרה 14 ימים לאחר ההחזרה");const f=await request.formData(),file=f.get("file");if(!(file instanceof File))throw new HttpError(400,"לא נבחר קובץ");const types={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","audio/webm":"webm","audio/ogg":"ogg","audio/mpeg":"mp3"},ext=types[file.type];if(!ext)throw new HttpError(400,"סוג קובץ אינו נתמך");if(file.size>(file.type.startsWith("image/")?8:12)*1024*1024)throw new HttpError(413,"הקובץ גדול מדי");const key=`chat/${id}/${crypto.randomUUID()}.${ext}`;await env.ITEM_IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type}});const mid=crypto.randomUUID(),kind=file.type.startsWith("image/")?"image":"voice",url=`/media/${encodeURIComponent(key)}`;await env.DB.batch([env.DB.prepare("INSERT INTO request_messages(id,request_id,sender_id,body,message_type,media_url,metadata_json) VALUES(?,?,?,?,?,?,?)").bind(mid,id,user.id,kind==="image"?"תמונה":"הודעה קולית",kind,url,JSON.stringify({size:file.size,mime:file.type})),notify(env,otherUserId,"message","הודעה חדשה","נשלחה אליך הודעת מדיה.",id)]);return json({message:{id:mid,type:kind,mediaUrl:url}},201);}
async function deleteMessage(request,env,id){const user=await requireUser(request,env),x=await qfirst(env,"SELECT * FROM request_messages WHERE id=?",[id]);if(!x||x.sender_id!==user.id)throw new HttpError(404,"ההודעה לא נמצאה");if(Date.now()-Date.parse(x.created_at)>300000)throw new HttpError(409,"ניתן למחוק עד חמש דקות");await qrun(env,"UPDATE request_messages SET body='הודעה נמחקה',media_url=NULL,deleted_at=? WHERE id=?",[new Date().toISOString(),id]);return json({ok:true});}
async function reportMessage(request,env,id){const user=await requireUser(request,env),b=await readJson(request);try{await qrun(env,"INSERT INTO message_reports(id,message_id,reporter_id,reason) VALUES(?,?,?,?)",[crypto.randomUUID(),id,user.id,clean(b.reason,2,500,"סיבה")]);}catch(e){if(String(e).toLowerCase().includes("unique"))throw new HttpError(409,"כבר דווח");throw e;}return json({ok:true},201);}
async function markRead(request,env,id){const {user}=await loanParticipant(request,env,id);await qrun(env,"UPDATE request_messages SET read_at=? WHERE request_id=? AND sender_id<>? AND read_at IS NULL",[new Date().toISOString(),id,user.id]);return json({ok:true});}
async function blockUser(request,env,id){const user=await requireUser(request,env),b=await readJson(request);if(user.id===id)throw new HttpError(400,"אי אפשר לחסום את עצמך");await qrun(env,"INSERT INTO user_blocks(blocker_id,blocked_id,effective_after_request_id) VALUES(?,?,?) ON CONFLICT(blocker_id,blocked_id) DO UPDATE SET effective_after_request_id=excluded.effective_after_request_id",[user.id,id,optional(b.effectiveAfterRequestId,100)]);return json({ok:true});}
async function unblockUser(request,env,id){const user=await requireUser(request,env);await qrun(env,"DELETE FROM user_blocks WHERE blocker_id=? AND blocked_id=?",[user.id,id]);return json({ok:true});}

/* ---------- notifications, calendar, privacy ---------- */
async function savePushSubscription(request,env){const user=await requireUser(request,env),b=await readJson(request),endpoint=clean(b.endpoint,10,2000,"endpoint"),keys=b.keys||{};await qrun(env,"INSERT INTO push_subscriptions(id,user_id,endpoint,p256dh,auth,user_agent) VALUES(?,?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id,p256dh=excluded.p256dh,auth=excluded.auth,user_agent=excluded.user_agent",[crypto.randomUUID(),user.id,endpoint,clean(keys.p256dh,10,500,"p256dh"),clean(keys.auth,5,500,"auth"),optional(request.headers.get("User-Agent"),500)]);return json({ok:true},201);}
async function deletePushSubscription(request,env){const user=await requireUser(request,env),b=await readJson(request);await qrun(env,"DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?",[user.id,clean(b.endpoint,10,2000,"endpoint")]);return json({ok:true});}
async function loanCalendar(request,env,id){const user=await requireUser(request,env),x=await qfirst(env,`SELECT lr.*,i.title,o.name organization_name,o.address,o.city,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`,[id]);if(!x||(x.borrower_id!==user.id&&x.owner_id!==user.id&&user.role!=="admin"))throw new HttpError(404,"ההשאלה לא נמצאה");const uid=id.replace(/[^a-zA-Z0-9-]/g,""),location=[x.address,x.city].filter(Boolean).join(", "),ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gmach Berega//HE","CALSCALE:GREGORIAN",eventIcs(uid+"-pickup","איסוף: "+x.title,x.pickup_window_start||x.requested_from,x.pickup_window_end||x.requested_from,location),eventIcs(uid+"-return","החזרה: "+x.title,x.requested_until,x.requested_until,location),"END:VCALENDAR"].join("\r\n");return new Response(ics,{headers:{"Content-Type":"text/calendar; charset=utf-8","Content-Disposition":`attachment; filename="gmach-${uid}.ics"`}});}
async function calendarPreferences(request,env){const u=await requireUser(request,env),x=await qfirst(env,"SELECT * FROM calendar_preferences WHERE user_id=?",[u.id]);return json({preferences:x||{preferred_app:"ics",reminder_minutes:1440}});}
async function saveCalendarPreferences(request,env){const u=await requireUser(request,env),b=await readJson(request),app=["ics","google","apple","outlook"].includes(b.preferredApp)?b.preferredApp:"ics",mins=Math.max(0,Math.min(10080,Number(b.reminderMinutes)||1440));await qrun(env,"INSERT INTO calendar_preferences(user_id,preferred_app,reminder_minutes) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET preferred_app=excluded.preferred_app,reminder_minutes=excluded.reminder_minutes,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",[u.id,app,mins]);return json({ok:true});}
async function exportMyData(request,env){const u=await requireUser(request,env);const [profile,orgs,items,loans,reviews,messages]=await Promise.all([qfirst(env,"SELECT id,email,full_name,role,phone,city,preferred_language,created_at,last_login_at FROM users WHERE id=?",[u.id]),qall(env,"SELECT * FROM organizations WHERE owner_id=?",[u.id]),qall(env,"SELECT i.* FROM items i JOIN organizations o ON o.id=i.organization_id WHERE o.owner_id=?",[u.id]),qall(env,"SELECT * FROM loan_requests WHERE borrower_id=?",[u.id]),qall(env,"SELECT * FROM reviews WHERE author_id=?",[u.id]),qall(env,"SELECT m.* FROM request_messages m JOIN loan_requests l ON l.id=m.request_id WHERE m.sender_id=? OR l.borrower_id=?",[u.id,u.id])]);return json({exportedAt:new Date().toISOString(),profile,organizations:orgs,items,loans,reviews,messages});}
async function dataRequest(request,env){const u=await requireUser(request,env),b=await readJson(request),type=["export","access","correction"].includes(b.type)?b.type:"access",id=crypto.randomUUID();await qrun(env,"INSERT INTO user_data_requests(id,user_id,request_type,details) VALUES(?,?,?,?)",[id,u.id,type,optional(b.details,2000)]);return json({request:{id,type,status:"open"}},201);}

/* ---------- admin / backup ---------- */
async function adminCsv(request,env){await requireAdmin(request,env);const rows=await qall(env,`SELECT lr.id,lr.status,lr.workflow_status,lr.requested_from,lr.requested_until,lr.created_at,i.title item,o.name organization,u.full_name borrower FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id JOIN users u ON u.id=lr.borrower_id ORDER BY lr.created_at DESC LIMIT 5000`,[]);const cols=["id","status","workflow_status","requested_from","requested_until","created_at","item","organization","borrower"];const csv=[cols.join(","),...rows.map(r=>cols.map(k=>csvCell(r[k])).join(","))].join("\n");return new Response("\uFEFF"+csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="gmach-operations.csv"'}});}
async function listBackups(request,env){await requireAdmin(request,env);return json({backups:await qall(env,"SELECT * FROM backup_runs ORDER BY created_at DESC LIMIT 100",[])});}
async function runBackupNow(request,env,ctx){const u=await requireAdmin(request,env);const id=crypto.randomUUID();await qrun(env,"INSERT INTO backup_runs(id,status) VALUES(?,'started')",[id]);const job=createBackup(env,id,u.id);ctx.waitUntil(job);return json({backup:{id,status:"started"}},202);}
async function adminReports(request,env){await requireAdmin(request,env);const [item,reviews,messages,content]=await Promise.all([qall(env,"SELECT 'item' type,id,reason,details,status,created_at FROM reports ORDER BY created_at DESC LIMIT 300",[]),qall(env,"SELECT 'review' type,id,reason,status,created_at FROM review_reports ORDER BY created_at DESC LIMIT 300",[]),qall(env,"SELECT 'message' type,id,reason,status,created_at FROM message_reports ORDER BY created_at DESC LIMIT 300",[]),qall(env,"SELECT entity_type type,id,reason,status,created_at FROM content_reports ORDER BY created_at DESC LIMIT 300",[])]);return json({reports:[...item,...reviews,...messages,...content].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,600)});}

/* ---------- maintenance helpers ---------- */
async function processWaitlist(env,now){const items=await qall(env,"SELECT DISTINCT item_id FROM waitlist_entries WHERE status='waiting' LIMIT 200",[]);for(const {item_id} of items){const w=await qfirst(env,"SELECT * FROM waitlist_entries WHERE item_id=? AND status='waiting' ORDER BY created_at LIMIT 1",[item_id]);if(!w)continue;const item=await qfirst(env,"SELECT quantity FROM items WHERE id=? AND status='active'",[item_id]);if(!item)continue;const used=await qfirst(env,"SELECT COALESCE(SUM(quantity),0) n FROM loan_requests WHERE item_id=? AND status IN ('pending','approved','collected') AND requested_from<? AND requested_until>?",[item_id,w.requested_until,w.requested_from]);if(Number(item.quantity)-Number(used?.n||0)<Number(w.quantity))continue;const minutes=Math.max(5,Math.min(10080,Number(w.response_minutes||120))),expires=new Date(Date.now()+minutes*60000).toISOString(),offerId=crypto.randomUUID();const changed=await env.DB.prepare("UPDATE waitlist_entries SET status='notified',offer_expires_at=? WHERE id=? AND status='waiting'").bind(expires,w.id).run();if(changed.meta.changes)await env.DB.batch([env.DB.prepare("INSERT INTO waitlist_offers(id,waitlist_entry_id,offered_at,expires_at) VALUES(?,?,?,?)").bind(offerId,w.id,now,expires),notify(env,w.user_id,"waitlist","התפנה פריט","התפנה מלאי עבורך. אשרו לפני שתוקף ההצעה יסתיים.",null)]);}}
async function processDeletionLifecycle(env,now){const users=await qall(env,"SELECT id,deletion_requested_at,deletion_reminder_sent_at FROM users WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL LIMIT 200",[]);for(const u of users){const t=Date.parse(u.deletion_requested_at);if(!t)continue;if(!u.deletion_reminder_sent_at&&Date.now()-t>=5*86400000){await queueEmail(env,u.id,"account_deletion","מחיקת החשבון מתקרבת","בקשת המחיקה תושלם בתום שבעה ימים אם אין השאלה פעילה.");await qrun(env,"UPDATE users SET deletion_reminder_sent_at=? WHERE id=?",[now,u.id]);}if(Date.now()-t>=7*86400000&&!await qfirst(env,"SELECT 1 FROM loan_requests WHERE borrower_id=? AND status IN ('pending','approved','collected') LIMIT 1",[u.id]))await qrun(env,"UPDATE users SET deleted_at=?,account_status='suspended',email='deleted-'||id||'@invalid.local',full_name='משתמש שנמחק',phone=NULL,city=NULL,address_cipher=NULL WHERE id=?",[now,u.id]);}
const orgs=await qall(env,"SELECT id,deletion_requested_at FROM organizations WHERE deletion_requested_at IS NOT NULL AND deleted_at IS NULL LIMIT 100",[]);for(const o of orgs){if(Date.now()-Date.parse(o.deletion_requested_at)<7*86400000)continue;if(await qfirst(env,"SELECT 1 FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? AND lr.status IN ('pending','approved','collected') LIMIT 1",[o.id]))continue;const h=await qfirst(env,"SELECT 1 FROM loan_requests lr JOIN items i ON i.id=lr.item_id WHERE i.organization_id=? LIMIT 1",[o.id]);if(h)await qrun(env,"UPDATE organizations SET deleted_at=?,is_hidden=1,name='גמ״ח שנמחק',description='הגמ״ח אינו פעיל עוד' WHERE id=?",[now,o.id]);else await qrun(env,"DELETE FROM organizations WHERE id=?",[o.id]);}}
async function processSavedSearches(env,now){const searches=await qall(env,"SELECT id,user_id,filters_json,last_result_signature FROM saved_searches WHERE notify=1 LIMIT 300",[]);for(const s of searches){const f=safeJson(s.filters_json,{}),q=String(f.q||"").trim(),city=String(f.city||"").trim(),category=String(f.category||"").trim();let sql="SELECT id FROM items WHERE status='active' AND is_free=1",args=[];if(q){sql+=" AND (title LIKE ? OR description LIKE ?)";args.push("%"+q+"%","%"+q+"%");}if(city){sql+=" AND city=?";args.push(city);}if(category){sql+=" AND category=?";args.push(category);}sql+=" ORDER BY updated_at DESC LIMIT 20";const ids=(await qall(env,sql,args)).map(x=>x.id),sig=await sha256(ids.join("|"));if(s.last_result_signature&&s.last_result_signature!==sig&&ids.length)await env.DB.batch([notify(env,s.user_id,"saved_search","נמצאו תוצאות חדשות","נוספו תוצאות חדשות לחיפוש השמור שלך.",null),env.DB.prepare("UPDATE saved_searches SET last_result_signature=?,last_checked_at=? WHERE id=?").bind(sig,now,s.id)]);else await qrun(env,"UPDATE saved_searches SET last_result_signature=?,last_checked_at=? WHERE id=?",[sig,now,s.id]);}}
async function processNotificationQueue(env,now){
  const rows=await qall(env,"SELECT q.*,u.email,u.full_name,u.preferred_language FROM notification_queue q JOIN users u ON u.id=q.user_id WHERE q.sent_at IS NULL AND q.failed_at IS NULL AND q.scheduled_at<=? ORDER BY q.scheduled_at LIMIT 200",[now]);
  const digestGroups=new Map();
  for(const n of rows){
    try{
      const prefType=n.notification_type||"loan_status";
      const pref=await qfirst(env,"SELECT quiet_start,quiet_end FROM notification_preferences WHERE user_id=? AND notification_type=?",[n.user_id,prefType]);
      const deferUntil=quietHoursEnd(pref?.quiet_start,pref?.quiet_end);
      if(deferUntil){await qrun(env,"UPDATE notification_queue SET scheduled_at=? WHERE id=?",[deferUntil,n.id]);continue;}
      if(n.channel==="digest"){
        const key=n.user_id; if(!digestGroups.has(key))digestGroups.set(key,{user:n,items:[]});digestGroups.get(key).items.push(n);continue;
      }
      if(n.channel==="email")await sendEmail(env,n.email,n.title,n.body,n.full_name,n.preferred_language);
      else if(n.channel==="push")await sendPushPlaceholder(env,n.user_id,n.title,n.body);
      await qrun(env,"UPDATE notification_queue SET sent_at=? WHERE id=?",[now,n.id]);
    }catch(e){await markNotificationFailure(env,n,now,e);}
  }
  for(const {user,items} of digestGroups.values()){
    try{
      const he=user.preferred_language!=="en";
      const title=he?"הסיכום היומי שלך מגמ״ח ברגע":"Your daily Gmach Berega summary";
      const body=items.map(x=>"• "+x.title+" — "+x.body).join("\n");
      await sendEmail(env,user.email,title,body,user.full_name,user.preferred_language);
      for(const x of items)await qrun(env,"UPDATE notification_queue SET sent_at=? WHERE id=?",[now,x.id]);
    }catch(e){for(const x of items)await markNotificationFailure(env,x,now,e);}
  }
}
function quietHoursEnd(start,end){
  if(!/^\d{2}:\d{2}$/.test(String(start||""))||!/^\d{2}:\d{2}$/.test(String(end||"")))return null;
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Jerusalem",hour:"2-digit",minute:"2-digit",hourCycle:"h23",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const p=Object.fromEntries(parts.filter(x=>x.type!=="literal").map(x=>[x.type,x.value])),cur=p.hour+":"+p.minute;
  const inside=start<end?(cur>=start&&cur<end):(cur>=start||cur<end);if(!inside)return null;
  const target=new Date();target.setUTCMinutes(target.getUTCMinutes()+60);return target.toISOString();
}
async function markNotificationFailure(env,n,now,e){
  await qrun(env,"UPDATE notification_queue SET failed_at=?,error=? WHERE id=?",[now,String(e).slice(0,500),n.id]);
  await qrun(env,"INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,?,?)",[crypto.randomUUID(),"notification_failure","warning",JSON.stringify({queueId:n.id,error:String(e).slice(0,300)})]);
}
async function maybeBackup(env,now){const last=await qfirst(env,"SELECT created_at FROM backup_runs WHERE status='completed' ORDER BY created_at DESC LIMIT 1",[]);if(last&&Date.now()-Date.parse(last.created_at)<20*3600000)return;const id=crypto.randomUUID();await qrun(env,"INSERT INTO backup_runs(id,status) VALUES(?,'started')",[id]);await createBackup(env,id,null);}
async function createBackup(env,id,actorId){try{const tables=["users","organizations","items","loan_requests","item_units","organization_branches","reviews","help_requests","support_tickets","categories","managed_content","site_settings"];const data={version:1,createdAt:new Date().toISOString(),tables:{}};let count=0;for(const t of tables){const rows=await qall(env,`SELECT * FROM ${t} LIMIT 50000`,[]);data.tables[t]=rows;count+=rows.length;}const bytes=new TextEncoder().encode(JSON.stringify(data)),key=`backups/${new Date().toISOString().slice(0,10)}/${id}.json`;await env.ITEM_IMAGES.put(key,bytes,{httpMetadata:{contentType:"application/json"}});await qrun(env,"UPDATE backup_runs SET backup_key=?,status='completed',row_count=?,size_bytes=?,completed_at=? WHERE id=?",[key,count,bytes.byteLength,new Date().toISOString(),id]);if(actorId)await audit(env,actorId,"backup.run",id,{key,count});}catch(e){await qrun(env,"UPDATE backup_runs SET status='failed',error=?,completed_at=? WHERE id=?",[String(e).slice(0,500),new Date().toISOString(),id]);}}

/* ---------- helpers ---------- */
async function requireUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)throw new HttpError(401,"יש להתחבר");const hash=await sha256(token),u=await qfirst(env,"SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.account_status='active'",[hash,new Date().toISOString()]);if(!u)throw new HttpError(401,"החיבור פג");return u;}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new HttpError(403,"נדרשת הרשאת מנהל");return u;}
async function requireOrg(request,env,id,roles){const user=await requireUser(request,env);if(user.role==="admin")return{user,role:"owner"};const o=await qfirst(env,"SELECT owner_id FROM organizations WHERE id=?",[id]);if(!o)throw new HttpError(404,"הגמ״ח לא נמצא");if(o.owner_id===user.id)return{user,role:"owner"};const m=await qfirst(env,"SELECT role,branch_scope_json,category_scope_json,expires_at FROM organization_members WHERE organization_id=? AND user_id=?",[id,user.id]);if(!m||(m.expires_at&&m.expires_at<=new Date().toISOString())||!roles.includes(m.role))throw new HttpError(403,"אין הרשאה");return{user,role:m.role,member:m};}
async function itemPermission(env,user,id){return qfirst(env,`SELECT i.id,i.organization_id FROM items i JOIN organizations o ON o.id=i.organization_id LEFT JOIN organization_members m ON m.organization_id=o.id AND m.user_id=? WHERE i.id=? AND (o.owner_id=? OR m.role IN ('owner','inventory') OR ?='admin') LIMIT 1`,[user.id,id,user.id,user.role]);}
async function loanParticipant(request,env,id){const user=await requireUser(request,env),loan=await qfirst(env,`SELECT lr.*,o.owner_id FROM loan_requests lr JOIN items i ON i.id=lr.item_id JOIN organizations o ON o.id=i.organization_id WHERE lr.id=?`,[id]);if(!loan)throw new HttpError(404,"ההשאלה לא נמצאה");if(loan.borrower_id!==user.id&&loan.owner_id!==user.id&&user.role!=="admin")throw new HttpError(403,"אין הרשאה");return{user,loan,otherUserId:loan.borrower_id===user.id?loan.owner_id:loan.borrower_id};}
async function blockedPair(env,a,b,requestId){const rows=await qall(env,"SELECT blocker_id,effective_after_request_id FROM user_blocks WHERE (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?)",[a,b,b,a]);for(const r of rows){if(!r.effective_after_request_id)return true;if(r.effective_after_request_id!==requestId)return true;const x=await qfirst(env,"SELECT status FROM loan_requests WHERE id=?",[requestId]);if(!x||["returned","cancelled","declined"].includes(x.status))return true;}return false;}
function notify(env,userId,type,title,body,requestId){const mapped=type==="message"?"message":type==="request"?"request":type==="system"?"system":"status";return env.DB.prepare("INSERT INTO notifications(id,user_id,type,title,body,request_id) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,mapped,title,body,requestId);}
async function queueEmail(env,userId,type,title,body){await qrun(env,"INSERT INTO notification_queue(id,user_id,notification_type,channel,title,body,scheduled_at) VALUES(?,?,?,?,?,?,?)",[crypto.randomUUID(),userId,type,"email",title,body,new Date().toISOString()]);}
async function audit(env,userId,action,entityId,details){try{await qrun(env,"INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,details_json) VALUES(?,?,?,?,?,?)",[crypto.randomUUID(),userId,action,"platform",entityId,JSON.stringify(details||{})]);}catch{}}
async function readJson(request){const n=Number(request.headers.get("Content-Length")||0);if(n>128*1024)throw new HttpError(413,"הבקשה גדולה מדי");let b;try{b=await request.json();}catch{throw new HttpError(400,"JSON לא תקין");}return b||{};}
function clean(v,min,max,label){const s=String(v??"").trim();if(s.length<min||s.length>max)throw new HttpError(400,`${label} אינו תקין`);return s;}
function optional(v,max){const s=String(v??"").trim();return s?s.slice(0,max):null;}
function iso(v,label){const d=new Date(v);if(Number.isNaN(d.getTime()))throw new HttpError(400,`${label} אינו תקין`);return d.toISOString();}
function numOrNull(v,fallback=null){if(v===undefined)return fallback;const n=Number(v);return Number.isFinite(n)?n:null;}
function safeJson(v,f){try{return JSON.parse(v)}catch{return f}}
function normalizeCondition(v){if(/חדש/.test(v))return"כמו חדש";if(/סביר|בלאי/.test(v))return"טוב";if(/מצוין/.test(v))return"מצוין";return"טוב";}
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});}
function cookieValue(request,name){const raw=request.headers.get("Cookie")||"";for(const p of raw.split(";")){const [k,...rest]=p.trim().split("=");if(k===name)return rest.join("=");}return null;}
async function sha256(v){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");}
function labelDevice(ua){if(/android/i.test(ua))return"Android";if(/iphone|ipad/i.test(ua))return"iPhone / iPad";if(/windows/i.test(ua))return"Windows";if(/macintosh|mac os/i.test(ua))return"Mac";if(/linux/i.test(ua))return"Linux";return"דפדפן לא מזוהה";}
async function qfirst(env,sql,args){try{return await env.DB.prepare(sql).bind(...args).first()}catch{return null}}
async function qall(env,sql,args){try{return (await env.DB.prepare(sql).bind(...args).all()).results||[]}catch{return[]}}
async function qrun(env,sql,args){try{return await env.DB.prepare(sql).bind(...args).run()}catch{return{meta:{changes:0}}}}
function haversine(a,b,c,d){const R=6371,r=x=>x*Math.PI/180,dp=r(c-a),dl=r(d-b),x=Math.sin(dp/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(dl/2)**2;return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));}
function csvCell(v){const s=String(v??"");return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;}
function eventIcs(uid,summary,start,end,location){const dt=x=>new Date(x).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");return["BEGIN:VEVENT",`UID:${uid}@gmach-berega`,`DTSTART:${dt(start)}`,`DTEND:${dt(end)}`,`SUMMARY:${summary.replace(/[;,]/g," ")}`,`LOCATION:${String(location||"").replace(/[;,]/g," ")}`,"END:VEVENT"].join("\r\n");}
async function verifyTurnstile(env,token,ip){const form=new FormData();form.set("secret",env.TURNSTILE_SECRET_KEY);form.set("response",token);if(ip)form.set("remoteip",ip);const r=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form});if(!r.ok)return false;return Boolean((await r.json()).success);}
async function currentSecurityBlock(request,env){const id=await sha256(request.headers.get("CF-Connecting-IP")||"unknown");return qfirst(env,"SELECT * FROM security_blocks WHERE identity_hash=? AND blocked_until>?",[id,new Date().toISOString()]);}
async function recordSecurityFailure(request,env,type){const id=await sha256(request.headers.get("CF-Connecting-IP")||"unknown"),now=new Date().toISOString();await qrun(env,"INSERT INTO security_events(id,event_type,severity,ip_hash,details_json) VALUES(?,?,?,?,?)",[crypto.randomUUID(),type,"warning",id,"{}"]);const recent=await qfirst(env,"SELECT COUNT(*) n FROM security_events WHERE ip_hash=? AND created_at>datetime('now','-1 hour')",[id]);if(Number(recent?.n||0)>=5)await qrun(env,"INSERT INTO security_blocks(identity_hash,reason,level,blocked_until) VALUES(?,?,?,datetime('now','+1 hour')) ON CONFLICT(identity_hash) DO UPDATE SET reason=excluded.reason,level=MIN(10,security_blocks.level+1),blocked_until=datetime('now','+'||(MIN(24,security_blocks.level+1))||' hours'),updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",[id,type,1]);}
async function sendSecurityEmail(env,userId,subject,body){const u=await qfirst(env,"SELECT email,full_name,preferred_language FROM users WHERE id=?",[userId]);if(u)try{await sendEmail(env,u.email,subject,body,u.full_name,u.preferred_language)}catch{}}
async function sendEmail(env,email,subject,body,name,language){if(!env.RESEND_API_KEY)return;const he=language!=="en",r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${env.RESEND_API_KEY}`},body:JSON.stringify({from:env.RESEND_FROM_EMAIL||"Gmach Berega <onboarding@resend.dev>",to:[email],subject,text:body,html:`<div dir="${he?"rtl":"ltr"}" style="font-family:Arial,sans-serif;max-width:600px;margin:auto"><h2>גמ״ח ברגע</h2><p>${escapeHtml(name||"")}</p><p>${escapeHtml(body)}</p></div>`,reply_to:env.SUPPORT_EMAIL||undefined})});if(!r.ok)throw new Error("Email "+r.status);}
function b64uEncode(input){const bytes=input instanceof Uint8Array?input:new Uint8Array(input);let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");}
function b64uDecode(value){let s=String(value||"").replace(/-/g,"+").replace(/_/g,"/");while(s.length%4)s+="=";const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;}
function concatBytes(...parts){const arrays=parts.map(p=>p instanceof Uint8Array?p:new Uint8Array(p)),n=arrays.reduce((s,a)=>s+a.length,0),out=new Uint8Array(n);let o=0;for(const a of arrays){out.set(a,o);o+=a.length}return out;}
async function hmac256(keyBytes,data){const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",key,data));}
async function hkdfExpand(prk,info,length){const t=await hmac256(prk,concatBytes(info,new Uint8Array([1])));return t.slice(0,length);}
async function vapidHeaders(env,endpoint){
  const pub=b64uDecode(env.VAPID_PUBLIC_KEY),priv=b64uDecode(env.VAPID_PRIVATE_KEY);
  if(pub.length!==65||pub[0]!==4||priv.length!==32)throw new Error("Invalid VAPID key format");
  const enc=new TextEncoder(),header=b64uEncode(enc.encode(JSON.stringify({typ:"JWT",alg:"ES256"})));
  const payload=b64uEncode(enc.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(Date.now()/1000)+12*3600,sub:env.VAPID_SUBJECT||("mailto:"+(env.SUPPORT_EMAIL||"support@example.com"))})));
  const key=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:b64uEncode(pub.slice(1,33)),y:b64uEncode(pub.slice(33,65)),d:b64uEncode(priv),ext:true},{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const sig=new Uint8Array(await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(header+"."+payload)));
  const jwt=header+"."+payload+"."+b64uEncode(sig);
  return {Authorization:`vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,TTL:"86400"};
}
async function encryptWebPush(subscription,payload){
  const clientPub=b64uDecode(subscription.p256dh),auth=b64uDecode(subscription.auth),enc=new TextEncoder();
  const serverKeys=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const serverPub=new Uint8Array(await crypto.subtle.exportKey("raw",serverKeys.publicKey));
  const clientKey=await crypto.subtle.importKey("raw",clientPub,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const shared=new Uint8Array(await crypto.subtle.deriveBits({name:"ECDH",public:clientKey},serverKeys.privateKey,256));
  const prkKey=await hmac256(auth,shared);
  const ikm=await hkdfExpand(prkKey,concatBytes(enc.encode("WebPush: info\0"),clientPub,serverPub),32);
  const salt=crypto.getRandomValues(new Uint8Array(16)),prk=await hmac256(salt,ikm);
  const cek=await hkdfExpand(prk,enc.encode("Content-Encoding: aes128gcm\0"),16),nonce=await hkdfExpand(prk,enc.encode("Content-Encoding: nonce\0"),12);
  const aes=await crypto.subtle.importKey("raw",cek,"AES-GCM",false,["encrypt"]);
  const plain=concatBytes(enc.encode(payload),new Uint8Array([2]));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce},aes,plain));
  const rs=new Uint8Array(4);new DataView(rs.buffer).setUint32(0,4096);
  return concatBytes(salt,rs,new Uint8Array([serverPub.length]),serverPub,cipher);
}
async function sendPushPlaceholder(env,userId,title,body){
  if(!env.VAPID_PUBLIC_KEY||!env.VAPID_PRIVATE_KEY)return;
  const subs=await qall(env,"SELECT endpoint,p256dh,auth FROM push_subscriptions WHERE user_id=?",[userId]);
  if(!subs.length)return;
  const payload=JSON.stringify({title,body,url:"/#/dashboard",tag:"gmach-"+userId});
  let delivered=0,lastError=null;
  for(const sub of subs){
    try{
      const [headers,encrypted]=await Promise.all([vapidHeaders(env,sub.endpoint),encryptWebPush(sub,payload)]);
      const response=await fetch(sub.endpoint,{method:"POST",headers:{...headers,"Content-Encoding":"aes128gcm","Content-Type":"application/octet-stream","Urgency":"normal"},body:encrypted});
      if(response.status===404||response.status===410){await qrun(env,"DELETE FROM push_subscriptions WHERE endpoint=?",[sub.endpoint]);continue}
      if(!response.ok)throw new Error("Push "+response.status);
      delivered++;
    }catch(e){lastError=e;}
  }
  if(!delivered&&lastError)throw lastError;
}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
