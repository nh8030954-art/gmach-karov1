import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";

const base="http://local.test";
const sentEmails=[];
const mf=new Miniflare({
  modules:[
    {type:"ESModule",path:"worker/index.js"},
    {type:"ESModule",path:"worker/platform-completion.js"}
  ],
  compatibilityDate:"2026-09-20",
  d1Databases:{DB:"full-completion-smoke-db"},
  r2Buckets:["ITEM_IMAGES"],
  bindings:{
    ADMIN_EMAILS:"",
    RESEND_API_KEY:"re_test",
    RESEND_FROM_EMAIL:"Gmach Berega <verify@example.org>",
    SUPPORT_EMAIL:"support@example.org",
    DATA_ENCRYPTION_KEY:"test-only-private-data-key-123456789"
  },
  serviceBindings:{
    RESEND_SERVICE:async request=>{
      sentEmails.push(await request.json());
      return Response.json({id:crypto.randomUUID()});
    }
  }
});

async function request(path,{method="GET",body,cookie,form}={}){
  const headers=new Headers();
  if(!["GET","HEAD"].includes(method)){headers.set("Origin",base);headers.set("Sec-Fetch-Site","same-origin")}
  if(cookie)headers.set("Cookie",cookie);
  let payload;
  if(form)payload=form;
  else if(body!==undefined){headers.set("Content-Type","application/json");payload=JSON.stringify(body)}
  const response=await mf.dispatchFetch(base+path,{method,headers,body:payload});
  const type=response.headers.get("content-type")||"";
  const data=type.includes("application/json")?await response.json():await response.text();
  return {response,data};
}
async function verify(email){
  const mail=[...sentEmails].reverse().find(x=>x.to?.includes(email));
  assert.ok(mail,"verification mail missing");
  const code=mail.text.match(/\b\d{6}\b/)?.[0];
  assert.ok(code,"verification code missing");
  const result=await request("/api/auth/verify-email",{method:"POST",body:{email,code}});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  return result.response.headers.get("set-cookie").split(";",1)[0];
}

try{
  const db=await mf.getD1Database("DB");
  const migrations=[
    "0001_initial.sql","0002_remove_demo_catalog.sql","0003_communication_and_management.sql",
    "0004_admin_console_and_security.sql","0005_visual_editor.sql","0006_refresh_public_copy.sql",
    "0007_platform_expansion.sql","0008_advanced_inventory_and_booking.sql","0009_production_hardening.sql",
    "0010_open_gmach_and_dual_ratings.sql","0011_production_platform.sql","0012_complete_platform.sql",
    "0013_full_completion.sql"
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

  const email="completion-user@example.org";
  result=await request("/api/auth/register",{method:"POST",body:{
    email,password:"StrongPass!2026",fullName:"משתמש בדיקה",phone:"0501234567",
    city:"פתח תקווה",address:"רחוב בדיקה 1",termsAccepted:true,
    operationalEmailsAccepted:true,communityEmailsAccepted:false
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  const cookie=await verify(email);

  result=await request("/api/platform/overview",{cookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.equal(result.data.user.email,email);

  result=await request("/api/me/addresses",{method:"POST",cookie,body:{
    label:"בית",city:"פתח תקווה",address:"רחוב בדיקה 1",isDefault:true
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  result=await request("/api/organizations",{method:"POST",cookie,body:{
    name:"גמ״ח בדיקה",primaryCategory:"אירועים",city:"פתח תקווה",
    description:"גמ״ח בדיקה אוטומטי לבדיקת המערכת",phone:"0501234567",
    address:"רחוב בדיקה 2",serviceArea:"פתח תקווה",hours:{"שעות":"09:00-18:00"},
    pickupOptions:["pickup"]
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  const orgId=result.data.organization.id;

  result=await request("/api/items",{method:"POST",cookie,body:{
    organizationId:orgId,title:"שולחן מתקפל",category:"אירועים",
    description:"פריט בדיקה תקין להשאלה קהילתית",condition:"מצוין",quantity:2,
    itemType:"loan",pickupMethod:"pickup",minLoanMinutes:60,maxLoanMinutes:1440
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));

  result=await request("/api/support",{method:"POST",cookie,body:{
    name:"משתמש בדיקה",email,subject:"בדיקת תמיכה",
    message:"פניית בדיקה תקינה לצורך אימות מעקב תמיכה."
  }});
  assert.equal(result.response.status,201,JSON.stringify(result.data));
  assert.ok(result.data.ticketNumber);

  result=await request("/api/me/support-tickets",{cookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));
  assert.ok(result.data.tickets.length>=1);

  result=await request("/api/search/advanced?q=שולחן",{cookie});
  assert.equal(result.response.status,200,JSON.stringify(result.data));

  console.log("Full completion smoke passed: schema, auth, profile, addresses, gmach, item, support and advanced API.");
}finally{
  await mf.dispose();
}
