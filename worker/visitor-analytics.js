const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function recordVisit(env,body,isRegistered,geo={}){
 if(!uuid.test(body.visitorId||'')||!uuid.test(body.sessionId||''))throw new Error('Invalid visit identifier');
 const path=String(body.path||'/').split(/[?#]/)[0].slice(0,180);if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid page');
 let source='direct';try{source=new URL(body.referrer).hostname.slice(0,100)||'direct'}catch{}
 const now=new Date().toISOString();
 await env.DB.batch([
 env.DB.prepare(`INSERT INTO site_visits(session_id,visitor_id,registered,source,started_at,last_seen,views) VALUES(?,?,?,?,?,?,1) ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen,views=views+1,registered=MAX(registered,excluded.registered) WHERE visitor_id=excluded.visitor_id`).bind(body.sessionId,body.visitorId,isRegistered?1:0,source,now,now),
 env.DB.prepare(`INSERT INTO site_visit_pages(session_id,path,views) SELECT session_id,?,1 FROM site_visits WHERE session_id=? AND visitor_id=? ON CONFLICT(session_id,path) DO UPDATE SET views=views+1`).bind(path,body.sessionId,body.visitorId)
 ,env.DB.prepare(`INSERT INTO site_view_events(id,session_id,visitor_id,path,city,country,created_at) SELECT ?,session_id,visitor_id,?,?,?,? FROM site_visits WHERE session_id=? AND visitor_id=?`).bind(crypto.randomUUID(),path,String(geo?.city||'').slice(0,100),String(geo?.country||'').slice(0,2),now,body.sessionId,body.visitorId)
 ]);
}
const zone='Asia/Jerusalem';
export function periodStart(period='month',now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 let wall=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day));
 if(period==='week')wall.setUTCDate(wall.getUTCDate()-wall.getUTCDay());
 if(period==='month')wall.setUTCDate(1);
 let utc=wall.getTime();for(let i=0;i<3;i++){const offset=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(utc)).find(p=>p.type==='timeZoneName').value;const m=offset.match(/GMT([+-])(\d{2}):(\d{2})/);utc=wall.getTime()-(m?(m[1]==='+'?1:-1)*(+m[2]*60 + +m[3])*60000:0)}return new Date(utc).toISOString();
}
export async function recordRegistration(env,request,userId){
 const visitor=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)gmach-visitor-id=([^;]+)/)?.[1];if(!uuid.test(visitor||''))return;
 await env.DB.prepare(`INSERT OR IGNORE INTO site_registration_attribution(user_id,visitor_id,created_at) VALUES(?,?,?)`).bind(userId,visitor,new Date().toISOString()).run();
}
export async function visitStats(env,period='month'){
 if(!['today','week','month'].includes(period))period='month';const since=periodStart(period),until=new Date().toISOString();
 const [summary,pages,sources,events,registrations,conversions,cities]=await env.DB.batch([
 env.DB.prepare(`SELECT COUNT(DISTINCT e.visitor_id) visitors,COUNT(DISTINCT e.session_id) visits,COALESCE(SUM(e.views),0) views,COUNT(DISTINCT CASE WHEN v.registered=0 THEN e.session_id END) guestVisits FROM site_view_events e JOIN site_visits v USING(session_id) WHERE e.created_at>=? AND e.created_at<=?`).bind(since,until),
 env.DB.prepare(`SELECT path,SUM(views) views,COUNT(DISTINCT visitor_id) visitors,COUNT(DISTINCT session_id) visits FROM site_view_events WHERE created_at>=? AND created_at<=? GROUP BY path ORDER BY views DESC`).bind(since,until),
 env.DB.prepare(`SELECT v.source,COUNT(DISTINCT e.session_id) visits FROM site_view_events e JOIN site_visits v USING(session_id) WHERE e.created_at>=? AND e.created_at<=? GROUP BY v.source ORDER BY visits DESC LIMIT 30`).bind(since,until),
 env.DB.prepare(`SELECT created_at,SUM(views) views,COUNT(DISTINCT session_id) visits FROM site_view_events WHERE created_at>=? AND created_at<=? GROUP BY substr(created_at,1,13) ORDER BY created_at`).bind(since,until),
 env.DB.prepare(`SELECT COUNT(*) registrations FROM users WHERE created_at>=? AND created_at<=?`).bind(since,until),
 env.DB.prepare(`SELECT COUNT(DISTINCT a.visitor_id) convertedVisitors FROM site_registration_attribution a WHERE a.created_at>=? AND a.created_at<=? AND EXISTS(SELECT 1 FROM site_view_events e WHERE e.visitor_id=a.visitor_id AND e.created_at>=? AND e.created_at<=a.created_at)`).bind(since,until,since),
 env.DB.prepare(`SELECT city,country,COUNT(DISTINCT visitor_id) visitors,SUM(views) views FROM site_view_events WHERE created_at>=? AND created_at<=? GROUP BY city,country ORDER BY visitors DESC LIMIT 100`).bind(since,until)
 ]);
 const s=summary.results[0];s.registrations=registrations.results[0].registrations;s.convertedVisitors=conversions.results[0].convertedVisitors;s.conversionRate=s.visitors?Math.round(s.convertedVisitors/s.visitors*10000)/100:0;
 const buckets=new Map();for(const e of events.results){const d=new Date(e.created_at);const day=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);const hour=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',hourCycle:'h23'}).format(d);const key=period==='today'?hour+':00':day;const b=buckets.get(key)||{label:key,views:0,visits:0};b.views+=Number(e.views);b.visits+=Number(e.visits);buckets.set(key,b)}
 return {period,since,until,timeZone:zone,summary:s,pages:pages.results,sources:sources.results,cities:cities.results,timeline:[...buckets.values()]};
}
