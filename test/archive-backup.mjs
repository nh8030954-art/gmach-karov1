import assert from 'node:assert/strict';
import {readArchiveBackup,monitorArchiveBackup,LEGACY_BACKUP_ALERTS} from '../worker/archive-backup.js';
import {runRemainingMaintenance} from '../worker/remaining-features.js';
const now=Date.parse('2026-10-08T19:10:00Z');
const current={key:'backups/gmach-full-20261008T062808Z.zip',size:1234,sha256:'a'.repeat(64),updated_at:'2026-10-08T06:28:08Z'};
const objects=new Map([['CURRENT.json',current],['PREVIOUS.json',{...current,key:'backups/gmach-full-20261007T003000Z.zip'}],['STATUS.json',{status:'success'}],['VERIFY.json',{status:'success',key:current.key,sha256:current.sha256,verified_at:'2026-10-08T06:29:19Z'}]]);
const alerts=LEGACY_BACKUP_ALERTS.map(alert_type=>({id:alert_type,alert_type,resolved_at:null}));alerts.push({id:'unrelated',alert_type:'security_warning',resolved_at:null});
const statements=[];
const DB={prepare(sql){statements.push(sql);let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.startsWith('PRAGMA')?['backup_type','started_at','finished_at','manifest_json'].map(name=>({name})):[]}},async first(){return alerts.find(a=>a.alert_type===args[0]&&!a.resolved_at)||null},async run(){
 if(sql.startsWith('UPDATE system_alerts')){const types=sql.includes(' IN ')?LEGACY_BACKUP_ALERTS:[args[1]];for(const a of alerts)if(types.includes(a.alert_type)&&!a.resolved_at)a.resolved_at=args[0]}
 if(sql.startsWith('INSERT INTO system_alerts'))alerts.push({id:args[0],alert_type:args[1],resolved_at:null});return {success:true}
}}}};
const env={DB,BACKUP_STORAGE:{async get(key){return objects.has(key)?{async text(){return JSON.stringify(objects.get(key))}}:null},async head(key){return key===current.key?{size:1234}:null}}};
let result=await monitorArchiveBackup(env,now);assert.equal(result.latestBackup.source,'github-archive');assert.equal(result.latestVerification.status,'success');assert.equal(result.previous.key,'backups/gmach-full-20261007T003000Z.zip');assert.ok(alerts.filter(a=>LEGACY_BACKUP_ALERTS.includes(a.alert_type)).every(a=>a.resolved_at));assert.equal(alerts.find(a=>a.id==='unrelated').resolved_at,null);assert.equal(alerts.filter(a=>a.alert_type.startsWith('archive_')&&!a.resolved_at).length,0);
objects.set('STATUS.json',{status:'failed',last_attempt_at:'2026-10-08T18:00:00Z'});await monitorArchiveBackup(env,now);await monitorArchiveBackup(env,now);assert.equal(alerts.filter(a=>a.alert_type==='archive_backup_failed'&&!a.resolved_at).length,1);assert.equal((await readArchiveBackup(env,now)).latestBackup.status,'completed','Failed attempts retain the prior successful archive');
objects.set('STATUS.json',{status:'success'});await monitorArchiveBackup(env,now+48*3600000);assert.ok(alerts.some(a=>a.alert_type==='archive_backup_stale'&&!a.resolved_at));assert.ok(alerts.find(a=>a.alert_type==='archive_backup_failed').resolved_at);
objects.set('VERIFY.json',{status:'success',key:'old.zip',sha256:'b'.repeat(64)});assert.equal((await readArchiveBackup(env,now)).latestVerification,null,'Verification for a different archive is not reused');
env.BACKUP_STORAGE.head=async()=>null;await monitorArchiveBackup(env,now);assert.ok(alerts.some(a=>a.alert_type==='archive_backup_missing'&&!a.resolved_at));
const reads=objects.size;await runRemainingMaintenance(env);assert.equal(objects.size,reads);assert.ok(!statements.some(s=>s.includes('sqlite_master')||s.startsWith('INSERT INTO backup_runs')),'Routine maintenance must not create internal backups');
console.log('Full archive status, failed/stale/missing alerts, verification matching, historical alert retirement and disabled internal scheduler passed');
