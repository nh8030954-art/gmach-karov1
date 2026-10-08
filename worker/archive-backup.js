// Full GitHub backup metadata is the source of truth; legacy internal records stay available as history.
export const LEGACY_BACKUP_ALERTS=['backup_failed','backup_missing','backup_stale','backup_restore_failed'];
const ARCHIVE_ALERTS=['archive_backup_missing','archive_backup_stale','archive_backup_failed','archive_verification_failed'];
export async function readArchiveBackup(env,now=Date.now()){
  const read=async key=>{if(!env.BACKUP_STORAGE?.get)return null;const object=await env.BACKUP_STORAGE.get(key);if(!object)return null;try{return JSON.parse(await object.text())}catch{return null}};
  const [status,current,previous,verify]=await Promise.all(['STATUS.json','CURRENT.json','PREVIOUS.json','VERIFY.json'].map(read));
  const date=Date.parse(current?.updated_at||'');
  let valid=Boolean(current&&/^backups\/gmach-full-[A-Za-z0-9TZ_-]+\.zip$/.test(current.key||'')&&Number(current.size)>0&&/^[a-f0-9]{64}$/i.test(current.sha256||'')&&Number.isFinite(date));
  if(valid&&env.BACKUP_STORAGE.head){const object=await env.BACKUP_STORAGE.head(current.key);valid=Boolean(object&&Number(object.size)===Number(current.size))}
  const latestBackup=valid?{id:current.key,status:'completed',source:'github-archive',finished_at:current.updated_at,size_bytes:current.size,checksum:current.sha256}:null;
  const matches=valid&&verify?.key===current.key&&verify?.sha256===current.sha256;
  const latestVerification=matches?{status:verify.status,source:'archive-integrity',started_at:verify.verified_at||verify.attempted_at,finished_at:verify.verified_at||null}:null;
  return {status,current,previous,verify,latestBackup,latestVerification,backupAgeHours:valid?(now-date)/3600000:null};
}
export async function monitorArchiveBackup(env,now=Date.now()){
  const state=await readArchiveBackup(env,now),at=new Date(now).toISOString();
  // Retire alerts from the cancelled internal mechanism without deleting their history.
  await env.DB.prepare("UPDATE system_alerts SET resolved_at=? WHERE alert_type IN ('backup_failed','backup_missing','backup_stale','backup_restore_failed') AND resolved_at IS NULL").bind(at).run();
  const active=new Map();
  if(!state.latestBackup)active.set('archive_backup_missing',{message:'No complete full-site archive is available'});
  else if(state.backupAgeHours>30)active.set('archive_backup_stale',{lastBackupAt:state.latestBackup.finished_at});
  if(state.status?.status==='failed')active.set('archive_backup_failed',{lastAttemptAt:state.status.last_attempt_at});
  if(state.verify?.status==='failed')active.set('archive_verification_failed',{lastAttemptAt:state.verify.attempted_at});
  for(const type of ARCHIVE_ALERTS){
    if(!active.has(type)){await env.DB.prepare('UPDATE system_alerts SET resolved_at=? WHERE alert_type=? AND resolved_at IS NULL').bind(at,type).run();continue}
    const existing=await env.DB.prepare('SELECT id FROM system_alerts WHERE alert_type=? AND resolved_at IS NULL LIMIT 1').bind(type).first();
    if(!existing)await env.DB.prepare("INSERT INTO system_alerts(id,alert_type,severity,details_json) VALUES(?,?,'critical',?)").bind(crypto.randomUUID(),type,JSON.stringify({source:'github-archive',...active.get(type)})).run();
  }
  return state;
}
