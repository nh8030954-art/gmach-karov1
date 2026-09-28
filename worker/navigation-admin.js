const SESSION_COOKIE="gmach_session";
class NavigationError extends Error{constructor(status,message){super(message);this.status=status}}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
let schemaPromise=null;

export async function ensureNavigationAdminSchema(env){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    const statements=[
      "CREATE TABLE IF NOT EXISTS navigation_links (id TEXT PRIMARY KEY,link_key TEXT NOT NULL UNIQUE,label_he TEXT NOT NULL,label_en TEXT,href TEXT NOT NULL,location TEXT NOT NULL CHECK(location IN ('header','footer_find','footer_share','footer_info','account')),sort_order INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),requires_auth INTEGER NOT NULL DEFAULT 0 CHECK(requires_auth IN (0,1)),open_new_tab INTEGER NOT NULL DEFAULT 0 CHECK(open_new_tab IN (0,1)),created_by TEXT REFERENCES users(id) ON DELETE SET NULL,updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))",
      "CREATE INDEX IF NOT EXISTS navigation_links_location_idx ON navigation_links(location,enabled,sort_order)",
      "INSERT OR IGNORE INTO navigation_links(id,link_key,label_he,label_en,href,location,sort_order) VALUES ('nav-catalog','catalog','כל הפריטים','All items','#/catalog','footer_find',10),('nav-how','how-it-works','איך זה עובד','How it works','#how-it-works','footer_find',20),('nav-safety','safety','כללי השאלה בטוחה','Safe borrowing rules','#info:safety','footer_info',10),('nav-terms','terms','תנאי שימוש','Terms of use','#info:terms','footer_info',20),('nav-privacy','privacy','פרטיות','Privacy','#info:privacy','footer_info',30),('nav-accessibility','accessibility','הצהרת נגישות','Accessibility statement','#action:accessibility','footer_info',40),('nav-support','support','יצירת קשר ותמיכה','Contact and support','#action:support','footer_info',50),('nav-add-gmach','add-gmach','פרסום גמ״ח','Publish a gmach','#action:add-gmach','footer_share',10),('nav-add-item','add-item','הוספת פריט','Add an item','#action:add-item','footer_share',20)"
    ];
    for(const sql of statements)await env.DB.prepare(sql).run();
    return true;
  })().catch(e=>{schemaPromise=null;throw e});
  return schemaPromise;
}
function cookieValue(request,name){for(const p of String(request.headers.get("Cookie")||"").split(";")){const [k,...v]=p.trim().split("=");if(k===name)return decodeURIComponent(v.join("="))}return""}
async function sha256(v){const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(v))));let out="";for(const b of bytes)out+=String.fromCharCode(b);return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"")}
async function requireUser(request,env){const token=cookieValue(request,SESSION_COOKIE);if(!token)throw new NavigationError(401,"יש להתחבר");const u=await env.DB.prepare("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha256(token),new Date().toISOString()).first();if(!u)throw new NavigationError(401,"החיבור פג");return u}
async function requireAdmin(request,env){const u=await requireUser(request,env);if(u.role!=="admin")throw new NavigationError(403,"נדרשת הרשאת מנהל");if(Number(u.totp_enabled||0)!==1)throw new NavigationError(403,"יש להפעיל אימות דו שלבי לפני כניסה להנהלת האתר");return u;}
async function body(request){try{const b=await request.json();return b&&typeof b==="object"?b:{}}catch{throw new NavigationError(400,"תוכן הבקשה אינו תקין")}}
const clean=(v,max=500)=>{const s=String(v??"").trim();return s?s.slice(0,max):null};
function validHref(v){const s=clean(v,500);if(!s)throw new NavigationError(400,"נדרש קישור");if(s.startsWith("#")||s.startsWith("/")||s.startsWith("mailto:")||s.startsWith("tel:"))return s;try{const u=new URL(s);if(["https:","http:"].includes(u.protocol))return u.toString()}catch{}throw new NavigationError(400,"הקישור אינו תקין")}
function dto(r){return{id:r.id,key:r.link_key,labelHe:r.label_he,labelEn:r.label_en,href:r.href,location:r.location,sortOrder:Number(r.sort_order||0),enabled:Boolean(r.enabled),requiresAuth:Boolean(r.requires_auth),openNewTab:Boolean(r.open_new_tab),updatedAt:r.updated_at}}
async function publicLinks(env){const rows=await env.DB.prepare("SELECT * FROM navigation_links WHERE enabled=1 ORDER BY location,sort_order,label_he").all();return json({links:(rows.results||[]).map(dto)})}
async function adminLinks(request,env){
 const admin=await requireAdmin(request,env);
 if(request.method==="GET"){const rows=await env.DB.prepare("SELECT * FROM navigation_links ORDER BY location,sort_order,label_he").all();return json({links:(rows.results||[]).map(dto)})}
 const b=await body(request),location=["header","footer_find","footer_share","footer_info","account"].includes(b.location)?b.location:null;if(!location)throw new NavigationError(400,"מיקום הקישור אינו תקין");
 const labelHe=clean(b.labelHe,100),labelEn=clean(b.labelEn,100);if(!labelHe)throw new NavigationError(400,"נדרשת תווית בעברית");
 const id=crypto.randomUUID(),key=(clean(b.key,100)||("link-"+id)).toLowerCase().replace(/[^a-z0-9_-]+/g,"-"),href=validHref(b.href),sortOrder=Math.max(0,Math.min(9999,Number(b.sortOrder)||0));
 await env.DB.batch([
  env.DB.prepare("INSERT INTO navigation_links(id,link_key,label_he,label_en,href,location,sort_order,enabled,requires_auth,open_new_tab,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,key,labelHe,labelEn,href,location,sortOrder,b.enabled===false?0:1,b.requiresAuth?1:0,b.openNewTab?1:0,admin.id,admin.id),
  env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,metadata_json) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"navigation.create","navigation_link",id,JSON.stringify({key,location,href}))
 ]);
 return json({link:{id,key,labelHe,labelEn,href,location,sortOrder,enabled:b.enabled!==false,requiresAuth:Boolean(b.requiresAuth),openNewTab:Boolean(b.openNewTab)}},201)
}
async function adminLinkDetail(request,env,id){
 const admin=await requireAdmin(request,env),old=await env.DB.prepare("SELECT * FROM navigation_links WHERE id=?").bind(id).first();if(!old)throw new NavigationError(404,"הקישור לא נמצא");
 if(request.method==="DELETE"){
  await env.DB.batch([env.DB.prepare("DELETE FROM navigation_links WHERE id=?").bind(id),env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,old_value_json,metadata_json) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"navigation.delete","navigation_link",id,JSON.stringify(dto(old)),JSON.stringify({key:old.link_key}))]);
  return json({ok:true})
 }
 const b=await body(request),location=b.location===undefined?old.location:(["header","footer_find","footer_share","footer_info","account"].includes(b.location)?b.location:null);if(!location)throw new NavigationError(400,"מיקום הקישור אינו תקין");
 const labelHe=b.labelHe===undefined?old.label_he:clean(b.labelHe,100),labelEn=b.labelEn===undefined?old.label_en:clean(b.labelEn,100),href=b.href===undefined?old.href:validHref(b.href),sortOrder=b.sortOrder===undefined?Number(old.sort_order||0):Math.max(0,Math.min(9999,Number(b.sortOrder)||0)),enabled=b.enabled===undefined?Number(old.enabled):b.enabled?1:0,requiresAuth=b.requiresAuth===undefined?Number(old.requires_auth):b.requiresAuth?1:0,openNewTab=b.openNewTab===undefined?Number(old.open_new_tab):b.openNewTab?1:0;
 if(!labelHe)throw new NavigationError(400,"נדרשת תווית בעברית");
 await env.DB.batch([
  env.DB.prepare("UPDATE navigation_links SET label_he=?,label_en=?,href=?,location=?,sort_order=?,enabled=?,requires_auth=?,open_new_tab=?,updated_by=?,updated_at=? WHERE id=?").bind(labelHe,labelEn,href,location,sortOrder,enabled,requiresAuth,openNewTab,admin.id,new Date().toISOString(),id),
  env.DB.prepare("INSERT INTO audit_log(id,actor_id,action,entity_type,entity_id,old_value_json,new_value_json,metadata_json) VALUES(?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"navigation.update","navigation_link",id,JSON.stringify(dto(old)),JSON.stringify({labelHe,labelEn,href,location,sortOrder,enabled:Boolean(enabled),requiresAuth:Boolean(requiresAuth),openNewTab:Boolean(openNewTab)}),JSON.stringify({key:old.link_key}))
 ]);
 return json({ok:true})
}
export async function handleNavigationAdmin(request,env,ctx,url){
 try{
  await ensureNavigationAdminSchema(env);const path=url.pathname,method=request.method.toUpperCase();let m;
  if(method==="GET"&&path==="/api/navigation-links")return publicLinks(env);
  if(path==="/api/admin/navigation-links"&&(method==="GET"||method==="POST"))return adminLinks(request,env);
  if((m=path.match(/^\/api\/admin\/navigation-links\/([^/]+)$/))&&["PATCH","DELETE"].includes(method))return adminLinkDetail(request,env,decodeURIComponent(m[1]));
  return null;
 }catch(e){if(e instanceof NavigationError)return json({error:e.message},e.status);throw e}
}
