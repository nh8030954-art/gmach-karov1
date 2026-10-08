import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {webcrypto,generateKeyPairSync} from 'node:crypto';
import {Miniflare} from 'miniflare';
import {syncAdminBell,monitorGmachResearch} from '../worker/admin-alerts.js';
import {saveResearchReport,ingestResearch,researchCandidates,handleGmachResearch} from '../worker/gmach-research.js';
function splitMigration(sql) {
  const statements = [];
  let buffer = "";
  let trigger = false;
  for (const line of sql.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("--")) continue;
    buffer += `${line}\n`;
    if (!trigger && /^\s*CREATE\s+TRIGGER\b/i.test(buffer)) trigger = true;
    const complete = trigger ? /^\s*END;\s*$/i.test(line) : /;\s*$/.test(line);
    if (complete) {
      statements.push(buffer.trim().replace(/;\s*$/, ""));
      buffer = "";
      trigger = false;
    }
  }
  if (buffer.trim()) statements.push(buffer.trim());
  return statements;
}

const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("test")}}',compatibilityDate:'2026-08-06',d1Databases:['DB'],r2Buckets:['BACKUP_STORAGE']});
try{
 const DB=await mf.getD1Database('DB'),BACKUP_STORAGE=await mf.getR2Bucket('BACKUP_STORAGE'),env={DB,BACKUP_STORAGE,GMACH_RESEARCH_INGEST_TOKEN:'test-secret'};
 for(const file of (await readdir('migrations')).filter(f=>/^\d+.*\.sql$/.test(f)).sort()){
  const sql=(await readFile('migrations/'+file,'utf8')).replace(/^\s*--.*$/gm,'');
  await DB.batch(splitMigration(sql).map(statement=>DB.prepare(statement)));
 }
 for(const [id,role,totp] of [['admin','admin',1],['member','member',0],['unsafe-admin','admin',0]])await DB.prepare('INSERT INTO users(id,email,password_hash,password_salt,full_name,role,totp_enabled) VALUES(?,?,?,?,?,?,?)').bind(id,id+'@example.org','hash','salt',id,role,totp).run();
 await DB.prepare("INSERT INTO organizations(id,name,primary_category,city,description,status) VALUES('org','Example gmach','events','City','Lends equipment','approved')").run();
 await DB.prepare("INSERT INTO organizations(id,name,primary_category,city,description,status,is_hidden) VALUES('hidden','Private','events','City','Hidden','approved',1)").run();
 await DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES('alert','archive_backup_failed','critical','{\"error\":\"Failure\"}')").run();
 await DB.prepare("INSERT INTO server_errors(id,request_id,path,method,message) VALUES('error','req','/api/test','GET','Example error'),('client','req2','/','CLIENT','Noisy client error')").run();
 await DB.prepare("INSERT INTO support_tickets(id,ticket_number,name,email,subject,message) VALUES('ticket',1,'Tester','test@example.org','Need help','A support message')").run();
 await DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body,created_at) VALUES('msg','ticket','member','Please help','2026-10-08T10:00:00Z')").run();
 await DB.prepare("INSERT INTO content_reports(id,entity_type,entity_id,reason) VALUES('report','organization','org','commercial')").run();
 const admin={id:'admin',role:'admin',totp_enabled:1};await syncAdminBell(env,{id:'member',role:'member'});await syncAdminBell(env,{id:'unsafe-admin',role:'admin',totp_enabled:0});
 assert.equal((await DB.prepare('SELECT COUNT(*) c FROM notifications').first()).c,0);
 await syncAdminBell(env,admin);let rows=await DB.prepare('SELECT n.*,l.kind,l.target_id FROM notifications n JOIN admin_notification_links l ON l.notification_id=n.id').all();assert.equal(rows.results.length,4);assert.ok(rows.results.every(n=>n.user_id==='admin'));assert.ok(!rows.results.some(n=>n.id.includes('client')));assert.equal(rows.results.find(n=>n.kind==='support').target_id,'ticket');
 await DB.prepare("UPDATE notifications SET read_at='read'").run();await syncAdminBell(env,admin);assert.equal((await DB.prepare('SELECT COUNT(*) c FROM notifications').first()).c,4);assert.equal((await DB.prepare('SELECT COUNT(*) c FROM notifications WHERE read_at IS NULL').first()).c,0);
 await DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body,created_at) VALUES('staff','ticket','admin','Staff reply','2026-10-08T11:00:00Z')").run();await syncAdminBell(env,admin);assert.equal((await DB.prepare('SELECT COUNT(*) c FROM notifications').first()).c,4,'Staff replies do not notify staff');
 await DB.prepare("INSERT INTO support_ticket_messages(id,ticket_id,sender_id,body,created_at) VALUES('reply','ticket','member','Another question','2026-10-08T12:00:00Z')").run();await syncAdminBell(env,admin);assert.equal((await DB.prepare('SELECT COUNT(*) c FROM notifications').first()).c,5);
 assert.deepEqual((await researchCandidates(env)).candidates.map(o=>o.id),['org']);
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});const jwk=privateKey.export({format:'jwk'}),keyId='test-key';await BACKUP_STORAGE.put('_system-research/private-jwk.json',JSON.stringify({keyId,jwk}));
 const report={runId:'run-1',checkedAt:new Date().toISOString(),candidateCount:1,results:[{organizationId:'org',verdict:'suspected',summary:'Test-only conflicting commercial pricing with matched identity; requires review.',identityMatch:'Same organization, city and explicit equipment offering in this test fixture.',evidence:[{url:'https://example.org/evidence',title:'Example source',note:'Test fixture evidence only.'}]}]};
 const rsa=await webcrypto.subtle.importKey('jwk',{kty:'RSA',n:jwk.n,e:jwk.e},{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);const raw=webcrypto.getRandomValues(new Uint8Array(32)),iv=webcrypto.getRandomValues(new Uint8Array(12)),aes=await webcrypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']);const b64=x=>Buffer.from(x).toString('base64');
 const envelope={version:1,keyId,iv:b64(iv),wrappedKey:b64(await webcrypto.subtle.encrypt('RSA-OAEP',rsa,raw)),ciphertext:b64(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},aes,new TextEncoder().encode(JSON.stringify(report))))};
 const url=new URL('https://example.org/api/internal/gmach-research');
 assert.equal((await handleGmachResearch(new Request(url,{method:'POST',body:JSON.stringify(envelope)}),env,url,()=>{})).status,401);
 const response=await handleGmachResearch(new Request(url,{method:'POST',headers:{Authorization:'Bearer test-secret'},body:JSON.stringify(envelope)}),env,url,()=>{});assert.equal(response.status,200);assert.equal((await response.json()).suspected,1);
 assert.equal((await ingestResearch(env,envelope)).duplicate,true);await syncAdminBell(env,admin);rows=await DB.prepare("SELECT l.kind,n.body FROM admin_notification_links l JOIN notifications n ON n.id=l.notification_id WHERE l.kind='research'").all();assert.equal(rows.results.length,1);assert.ok(rows.results[0].body.includes('requires review'));
 await saveResearchReport(env,{...report,runId:'run-2'});await syncAdminBell(env,admin);assert.equal((await DB.prepare("SELECT COUNT(*) c FROM system_alerts WHERE alert_type='gmach_business_suspected'").first()).c,1,'Unchanged findings do not spam');
 await assert.rejects(saveResearchReport(env,{...report,runId:'bad',results:[{...report.results[0],evidence:[]}]}));await assert.rejects(saveResearchReport(env,{...report,runId:'bad2',results:[{...report.results[0],evidence:[{url:'javascript:alert(1)',title:'Bad',note:'Bad'}]}]}));
 const privateUrl=new URL('https://example.org/api/admin/gmach-research/run-1%3Aorg');await assert.rejects(handleGmachResearch(new Request(privateUrl),env,privateUrl,()=>{throw new Error('Forbidden')}));const detail=await handleGmachResearch(new Request(privateUrl),env,privateUrl,()=>admin);assert.equal((await detail.json()).result.evidence.length,1);
 await BACKUP_STORAGE.put('_system-research/public-jwk.json',JSON.stringify({createdAt:new Date(Date.now()-8*86400000).toISOString()}));await monitorGmachResearch(env,Date.now()+8*86400000);await monitorGmachResearch(env,Date.now()+8*86400000);assert.equal((await DB.prepare("SELECT COUNT(*) c FROM system_alerts WHERE alert_type='gmach_research_stale' AND resolved_at IS NULL").first()).c,1);
 await saveResearchReport(env,{...report,runId:'clear',results:[{...report.results[0],verdict:'clear'}]});assert.equal((await DB.prepare("SELECT COUNT(*) c FROM system_alerts WHERE alert_type='gmach_research_stale' AND resolved_at IS NULL").first()).c,0);
 console.log('Admin isolation, source routing, read preservation, support replies, encrypted authenticated ingestion, evidence validation, deduplication and stale research monitoring passed');
}finally{await mf.dispose()}
