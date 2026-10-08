const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const text=(s,max)=>typeof s==='string'&&s.trim().length>0&&s.length<=max;
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
export async function researchCandidates(env,after=''){
  const rows=await env.DB.prepare(`SELECT id,name,city,neighborhood,description,updated_at FROM organizations WHERE status='approved' AND is_hidden=0 AND deleted_at IS NULL AND id>? ORDER BY id LIMIT 101`).bind(after).all();
  const candidates=(rows.results||[]).slice(0,100);
  return {candidates,nextCursor:(rows.results||[]).length>100?candidates.at(-1).id:null};
}
export async function ingestResearch(env,envelope){
  if(envelope.version!==1||!text(envelope.keyId,100)||!text(envelope.wrappedKey,1000)||!text(envelope.iv,100)||!text(envelope.ciphertext,12000000))throw new Error('Invalid envelope');
  const privateObject=await env.BACKUP_STORAGE.get('_system-research/private-jwk.json');
  if(!privateObject)throw new Error('Research key unavailable');
  const stored=await privateObject.json();
  if(stored.keyId!==envelope.keyId)throw new Error('Research key mismatch');
  const key=await crypto.subtle.importKey('jwk',stored.jwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);
  const aes=await crypto.subtle.importKey('raw',await crypto.subtle.decrypt('RSA-OAEP',key,decode(envelope.wrappedKey)),'AES-GCM',false,['decrypt']);
  const report=JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.iv)},aes,decode(envelope.ciphertext))));
  return saveResearchReport(env,report);
}
export async function saveResearchReport(env,report){
  const checked=Date.parse(report.checkedAt);
  if(!text(report.runId,100)||!Number.isFinite(checked)||checked>Date.now()+300000||checked<Date.now()-7*86400000||!Array.isArray(report.results)||report.results.length>5000||!Number.isInteger(report.candidateCount)||report.candidateCount<report.results.length||report.candidateCount>100000)throw new Error('Invalid report');
  const duplicate=await env.DB.prepare('SELECT id,checked_count FROM gmach_research_runs WHERE id=?').bind(report.runId).first();
  if(duplicate&&Number(duplicate.checked_count)===report.results.length)return {ok:true,duplicate:true};
  const seen=new Set();
  for(const r of report.results){
    if(!text(r.organizationId,100)||seen.has(r.organizationId)||!['clear','inconclusive','suspected'].includes(r.verdict)||!text(r.summary,1800)||!text(r.identityMatch,1000)||!Array.isArray(r.evidence)||r.evidence.length>6)throw new Error('Invalid finding');
    seen.add(r.organizationId);
    for(const e of r.evidence){if(!text(e.url,2000)||!text(e.title,200)||!text(e.note,1200))throw new Error('Invalid evidence');const u=new URL(e.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid evidence URL')}
    if(r.verdict==='suspected'&&(r.evidence.length===0||r.identityMatch.length<20||r.summary.length<30))throw new Error('Suspicion requires matched identity and evidence');
  }
  const writes=[];
  const organizationMap=new Map();
  for(let start=0;start<report.results.length;start+=90){const ids=report.results.slice(start,start+90).map(r=>r.organizationId);const rows=await env.DB.prepare(`SELECT id,name FROM organizations WHERE id IN (${ids.map(()=>'?').join(',')}) AND status='approved' AND is_hidden=0 AND deleted_at IS NULL`).bind(...ids).all();for(const org of rows.results||[])organizationMap.set(org.id,org);}
  if(organizationMap.size!==report.results.length)throw new Error('Candidate changed; refresh candidates');
  let accepted=0,suspected=0;
  for(const r of report.results){
    const org=organizationMap.get(r.organizationId);
    if(!org)throw new Error('Candidate changed; refresh candidates');
    const id=`${report.runId}:${org.id}`;accepted++;
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO gmach_research_results(id,run_id,organization_id,verdict,summary,evidence_json,identity_match,checked_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,report.runId,org.id,r.verdict,r.summary,JSON.stringify(r.evidence),r.identityMatch,report.checkedAt));
    if(r.verdict==='suspected'){
      suspected++;
      const fingerprint=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(org.id+'|'+r.summary+'|'+r.evidence.map(e=>e.url).sort().join('|'))));
      writes.push(env.DB.prepare("INSERT OR IGNORE INTO system_alerts(id,alert_type,severity,details_json,created_at) VALUES(?,'gmach_business_suspected','warning',?,?)").bind('research:'+fingerprint,JSON.stringify({name:org.name,summary:r.summary,resultId:id}),report.checkedAt));
    }
  }
  if(report.results.length===report.candidateCount)writes.push(env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE alert_type='gmach_research_stale' AND resolved_at IS NULL").bind(new Date().toISOString()));
  await env.DB.prepare('INSERT OR IGNORE INTO gmach_research_runs(id,checked_at,candidate_count,checked_count) VALUES(?,?,?,0)').bind(report.runId,report.checkedAt,report.candidateCount).run();
  for(let start=0;start<writes.length;start+=80)await env.DB.batch(writes.slice(start,start+80));
  await env.DB.prepare('UPDATE gmach_research_runs SET checked_count=(SELECT COUNT(*) FROM gmach_research_results WHERE run_id=?) WHERE id=?').bind(report.runId,report.runId).run();
  return {ok:true,accepted,suspected};
}
export async function handleGmachResearch(request,env,url,requireAdmin){
  const path=url.pathname;
  if(request.method==='GET'&&path==='/api/research/candidates')return json(await researchCandidates(env,url.searchParams.get('after')||''));
  if(request.method==='GET'&&path==='/api/research/public-key'){
    const object=await env.BACKUP_STORAGE?.get('_system-research/public-jwk.json');
    return object?json(await object.json()):json({error:'Research is not configured'},503);
  }
  if(request.method==='POST'&&path==='/api/internal/gmach-research'){
    const expected=env.GMACH_RESEARCH_INGEST_TOKEN;
    const provided=request.headers.get('Authorization')||'';
    if(!expected||provided!==`Bearer ${expected}`)return json({error:'Unauthorized'},401);
    if(Number(request.headers.get('Content-Length')||0)>12500000)return json({error:'Envelope too large'},413);
    const raw=await request.text();if(raw.length>12500000)return json({error:'Envelope too large'},413);
    try{return json(await ingestResearch(env,JSON.parse(raw)))}catch{return json({error:'Research report rejected'},400)}
  }
  if(path==='/api/admin/gmach-research'||path.startsWith('/api/admin/gmach-research/')){
    if(request.method!=='GET')return json({error:'Method not allowed'},405);
    await requireAdmin(request,env);
    if(path==='/api/admin/gmach-research'){
      const runs=await env.DB.prepare('SELECT * FROM gmach_research_runs ORDER BY checked_at DESC LIMIT 20').all();
      const results=await env.DB.prepare(`SELECT r.id,r.verdict,r.summary,r.checked_at,o.name,o.id AS organization_id FROM gmach_research_results r JOIN organizations o ON o.id=r.organization_id WHERE r.checked_at=(SELECT MAX(x.checked_at) FROM gmach_research_results x WHERE x.organization_id=r.organization_id) ORDER BY CASE r.verdict WHEN 'suspected' THEN 0 WHEN 'inconclusive' THEN 1 ELSE 2 END,r.checked_at DESC LIMIT 200`).all();
      return json({runs:runs.results||[],results:results.results||[]});
    }
    const id=decodeURIComponent(path.slice('/api/admin/gmach-research/'.length));
    const result=await env.DB.prepare('SELECT r.*,o.name FROM gmach_research_results r JOIN organizations o ON o.id=r.organization_id WHERE r.id=?').bind(id).first();
    return result?json({result:{...result,evidence:JSON.parse(result.evidence_json),evidence_json:undefined}}):json({error:'Not found'},404);
  }
  return null;
}
