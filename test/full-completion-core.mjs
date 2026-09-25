import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const base="http://local.test";
const mf=new Miniflare({
  workers:[{
    name:"app",
    config:{type:"worker",name:"app",compatibilityDate:"2026-09-20"},
    modules:[
      {type:"ESModule",path:"worker/index.js"},
      {type:"ESModule",path:"worker/platform-completion.js"}
    ],
    compatibilityDate:"2026-09-20",
    d1Databases:{DB:"full-completion-smoke-db"},
    r2Buckets:["ITEM_IMAGES"],
    bindings:{
      ADMIN_EMAILS:"",
      DATA_ENCRYPTION_KEY:"test-only-private-data-key-123456789"
    }
  }]
});

function b64(bytes){
  let out="";
  for(const byte of bytes)out+=String.fromCharCode(byte);
  return btoa(out).replaceAll("+","-").replaceAll("/","_").replace(/=+$/g,"");
}
async function sha(value){
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(String(value)))));
}
async function request(path,{method="GET",body,cookie}={}){
  const headers=new Headers();
  if(!["GET","HEAD"].includes(method)){
    headers.set("Origin",base);
    headers.set("Sec-Fetch-Site","same-origin");
  }
  if(cookie)headers.set("Cookie",cookie);
  let payload;
  if(body!==undefined){
    headers.set("Content-Type","application/json");
    payload=JSON.stringify(body);
  }
  const response=await mf.dispatchFetch(base+path,{method,headers,body:payload});
  const type=response.headers.get("content-type")||"";
  const data=type.includes("application/json")?await response.json():await response.text();
  return {response,data};
}

try{
  const db=await mf.getD1Database("DB");
  const migrations=[
    "0001_initial.sql","0002_remove_demo_catalog.sql","0003_communication_and_management.sql",
    "0004_admin_console_and_security.sql","0005_visual_editor.sql","0006_refresh_public_copy.sql",
    "0007_platform_expansion.sql","0008_advanced_inventory_and_booking.sql","0009_production_hardening.sql",
    "0010_open_gmach_and_dual_ratings.sql","0011_production_platform.sql","0012_complete_platform.sql",
    "0013_full_completion.sql","0014_final_features.sql"
  ];
  for(const filename of migrations){
    const sql=(await readFile(`migrations/${filename}`,"utf8")).replace(/^\s*--.*$/gm,"");
    const statements=sql.split(/;\s*(?:\r?\n|$)/).map(s=>s.trim()).filter(Boolean);
    await db.batch(statements.map(s=>db.prepare(s)));
  }

  let result=await request("/api/health");
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.release,"complete-platform-2026-09-25.6");
  assert.equal(result.data.completionSchema.ready,true);
  assert.equal(result.data.finalFeaturesSchema.ready,true);

  const userId=crypto.randomUUID();
  const token="smoke-session-token-"+crypto.randomUUID();
  const tokenHash=await sha(token);
  const future=new Date(Date.now()+86400000).toISOString();
  const now=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO users(id,email,password_hash,password_salt,password_iterations,full_name,role,phone,city,email_verified,terms_accepted_at,privacy_accepted_at,operational_emails_accepted) VALUES(?,?,?,?,?,?,?,?,?,1,?,?,1)")
      .bind(userId,"completion-user@example.org","hash","salt",1,"משתמש בדיקה","member","0501234567","פתח תקווה",now,now),
    db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,device_label,last_seen_at) VALUES(?,?,?,?,?)")
      .bind(tokenHash,userId,future,"CI smoke",now)
  ]);
  const cookie="gmach_session="+token;

  result=await request("/api/platform/overview",{cookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.user.email,"completion-user@example.org");

  result=await request("/api/me/addresses",{method:"POST",cookie,body:{
    label:"בית",city:"פתח תקווה",address:"רחוב בדיקה 1",isDefault:true
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  result=await request("/api/organizations",{method:"POST",cookie,body:{
    name:"גמ״ח בדיקה",primaryCategory:"אירועים",city:"פתח תקווה",
    description:"גמ״ח בדיקה אוטומטי לבדיקת המערכת",phone:"0501234567",
    address:"רחוב בדיקה 2",serviceArea:"פתח תקווה",
    hours:{"שעות":"09:00-18:00"},pickupOptions:["pickup"]
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  const orgId=result.data.organization.id;

  result=await request("/api/items",{method:"POST",cookie,body:{
    organizationId:orgId,title:"שולחן מתקפל",category:"אירועים",
    description:"פריט בדיקה תקין להשאלה קהילתית",condition:"מצוין",quantity:2,
    itemType:"loan",pickupMethod:"pickup",minLoanMinutes:60,maxLoanMinutes:1440
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  result=await request("/api/search/advanced?q=שולחן",{cookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));

  result=await request("/api/me/data-requests",{method:"POST",cookie,body:{
    type:"access",details:"בדיקת בקשת מידע"
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  console.log("Full completion smoke passed.");
}finally{
  await mf.dispose();
}
