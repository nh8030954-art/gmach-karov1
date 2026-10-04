const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function recordVisit(env,body,isRegistered){
 if(!uuid.test(body.visitorId||'')||!uuid.test(body.sessionId||''))throw new Error('Invalid visit identifier');
 const path=String(body.path||'/').split(/[?#]/)[0].slice(0,180);if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Invalid page');
 let source='direct';try{source=new URL(body.referrer).hostname.slice(0,100)||'direct'}catch{}
 const now=new Date().toISOString();
 await env.DB.batch([
 env.DB.prepare(`INSERT INTO site_visits(session_id,visitor_id,registered,source,started_at,last_seen,views) VALUES(?,?,?,?,?,?,1) ON CONFLICT(session_id) DO UPDATE SET last_seen=excluded.last_seen,views=views+1,registered=MAX(registered,excluded.registered) WHERE visitor_id=excluded.visitor_id`).bind(body.sessionId,body.visitorId,isRegistered?1:0,source,now,now),
 env.DB.prepare(`INSERT INTO site_visit_pages(session_id,path,views) SELECT session_id,?,1 FROM site_visits WHERE session_id=? AND visitor_id=? ON CONFLICT(session_id,path) DO UPDATE SET views=views+1`).bind(path,body.sessionId,body.visitorId)
 ]);
}
export async function visitStats(env,days=30){
 const since=new Date(Date.now()-days*86400000).toISOString();const [summary,pages,sources,daily]=await env.DB.batch([
 env.DB.prepare(`SELECT COUNT(DISTINCT visitor_id) visitors,COUNT(*) visits,COALESCE(SUM(views),0) views,COALESCE(SUM(CASE WHEN registered=0 THEN 1 ELSE 0 END),0) guestVisits FROM site_visits WHERE started_at>=?`).bind(since),
 env.DB.prepare(`SELECT p.path,SUM(p.views) views FROM site_visit_pages p JOIN site_visits v USING(session_id) WHERE v.started_at>=? GROUP BY p.path ORDER BY views DESC LIMIT 15`).bind(since),
 env.DB.prepare(`SELECT source,COUNT(*) visits FROM site_visits WHERE started_at>=? GROUP BY source ORDER BY visits DESC LIMIT 15`).bind(since),
 env.DB.prepare(`SELECT substr(started_at,1,10) day,COUNT(DISTINCT visitor_id) visitors,COUNT(*) visits,SUM(views) views FROM site_visits WHERE started_at>=? GROUP BY day ORDER BY day DESC LIMIT 30`).bind(since)
 ]);return {days,summary:summary.results[0],pages:pages.results,sources:sources.results,daily:daily.results};
}
