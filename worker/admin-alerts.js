import {deferNonessentialD1} from './d1-conservation.js';
// All private bell sources pass through the authenticated super-administrator path.
const labels = {
  archive_backup_failed:'הגיבוי המלא נכשל', archive_backup_stale:'הגיבוי המלא אינו עדכני',
  archive_backup_missing:'חסר גיבוי מלא', archive_verify_failed:'בדיקת תקינות הגיבוי נכשלה', archive_verification_failed:'בדיקת תקינות הגיבוי נכשלה', archive_integrity_failed:'בדיקת תקינות הגיבוי נכשלה',
  gmach_business_suspected:'גמ״ח דורש בדיקה: חשד לפעילות עסקית',
  gmach_research_stale:'בדיקת הגמ״חים לא הושלמה בזמן'
};
export async function syncAdminBell(env, user) {
  if(deferNonessentialD1(env))return;
  if(user.role!=='admin'||Number(user.totp_enabled)!==1)return;
  const sources = [
    ['alert', `SELECT a.id,a.alert_type,a.details_json,a.created_at FROM system_alerts a WHERE a.resolved_at IS NULL AND a.severity IN ('warning','critical') AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='admin:'||?||':alert:'||a.id) ORDER BY a.created_at DESC LIMIT 20`],
    ['error', `SELECT e.id,e.path,e.message,e.created_at FROM server_errors e WHERE e.resolved_at IS NULL AND COALESCE(e.method,'')!='CLIENT' AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='admin:'||?||':error:'||e.id) ORDER BY e.created_at DESC LIMIT 20`],
    ['support', `SELECT m.id,t.id AS target_id,t.ticket_number,t.subject,m.created_at FROM support_tickets t JOIN support_ticket_messages m ON m.ticket_id=t.id LEFT JOIN users u ON u.id=m.sender_id WHERE t.status!='closed' AND COALESCE(u.role,'member')!='admin' AND m.id=(SELECT m2.id FROM support_ticket_messages m2 LEFT JOIN users u2 ON u2.id=m2.sender_id WHERE m2.ticket_id=t.id AND COALESCE(u2.role,'member')!='admin' ORDER BY m2.created_at DESC,m2.id DESC LIMIT 1) AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='admin:'||?||':support:'||m.id) ORDER BY m.created_at DESC LIMIT 20`],
    ['report', `SELECT r.id,r.entity_type,r.reason,r.created_at FROM content_reports r WHERE r.status='pending' AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='admin:'||?||':report:'||r.id) ORDER BY r.created_at DESC LIMIT 20`],
    ['legacy-report', `SELECT r.id,r.reason,r.created_at FROM reports r WHERE r.status='pending' AND NOT EXISTS(SELECT 1 FROM notifications n WHERE n.id='admin:'||?||':legacy-report:'||r.id) ORDER BY r.created_at DESC LIMIT 20`]
  ];
  const results=await env.DB.batch(sources.map(([,sql])=>env.DB.prepare(sql).bind(user.id)));
  const writes=[];
  for(let i=0;i<sources.length;i++)for(const row of results[i].results||[]){
    let kind=sources[i][0],target=row.target_id||row.id,title,body;
    if(kind==='alert'){
      let details={};try{details=JSON.parse(row.details_json)}catch{}
      title=labels[row.alert_type]||'התראת מערכת חשובה';
      body=String(details.summary||details.error||details.message||row.alert_type).slice(0,350);
      if(row.alert_type==='gmach_business_suspected'){kind='research';target=details.resultId;body=(details.name?details.name+' — ':'')+body}
      else if(row.alert_type==='gmach_research_stale')kind='research-status';
    }else if(kind==='support'){title='פנייה או הודעה חדשה לתמיכה';body=`#${row.ticket_number} · ${row.subject}`}
    else if(kind==='error'){title='תקלה באתר דורשת טיפול';body=`${row.path} — ${row.message}`.slice(0,350)}
    else {title='דיווח תוכן ממתין לבדיקה';body=String(row.reason||'דיווח משתמש')}
    const id=`admin:${user.id}:${sources[i][0]}:${row.id}`;
    writes.push(env.DB.prepare("INSERT OR IGNORE INTO notifications(id,user_id,type,title,body,created_at) VALUES(?,?,'system',?,?,?)").bind(id,user.id,title,body,row.created_at));
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO admin_notification_links(notification_id,kind,target_id) VALUES(?,?,?)').bind(id,kind,String(target||row.id)));
  }
  // Stay within D1's batch limits and only write genuinely new source events.
  for(let i=0;i<writes.length;i+=80)await env.DB.batch(writes.slice(i,i+80));
}

export async function monitorGmachResearch(env,now=Date.now()){
  if(deferNonessentialD1(env,now))return;
  const latest=await env.DB.prepare('SELECT checked_at FROM gmach_research_runs WHERE checked_count=candidate_count ORDER BY checked_at DESC LIMIT 1').first();
  const installed=await env.BACKUP_STORAGE?.get('_system-research/public-jwk.json');
  if(!installed)return;
  const metadata=await installed.json();
  const last=Date.parse(latest?.checked_at||metadata.createdAt);
  if(!Number.isFinite(last)||now-last<18*86400000)return;
  const open=await env.DB.prepare("SELECT id FROM system_alerts WHERE alert_type='gmach_research_stale' AND resolved_at IS NULL LIMIT 1").first();
  if(!open)await env.DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,'gmach_research_stale','warning',?)").bind(crypto.randomUUID(),JSON.stringify({summary:'לא הושלמה בדיקת כל הגמ״חים במשך יותר מ־18 ימים. יש לבדוק את משימת המחקר.'})).run();
}
