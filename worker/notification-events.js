import {deferNonessentialD1} from './d1-conservation.js';
import {syncAdminBell} from './admin-alerts.js';

// One hibernating channel per authenticated user. No timers, polling or private message content.
export class NotificationHub {
  constructor(ctx){this.ctx=ctx}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/connect'&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      if(this.ctx.getWebSockets().length>=12)return new Response('Too many connections',{status:429});
      const pair=new WebSocketPair(),[client,server]=Object.values(pair);
      this.ctx.acceptWebSocket(server);server.serializeAttachment({expiresAt:Date.now()+86400000});
      return new Response(null,{status:101,webSocket:client});
    }
    if(url.pathname==='/changed'&&request.method==='POST'){
      const {sequence}=await request.json();
      if(!Number.isSafeInteger(sequence)||sequence<1)return new Response('Invalid event',{status:400});
      const last=await this.ctx.storage.get('lastSequence')||0;
      if(sequence<=last)return Response.json({ok:true,duplicate:true});
      // Durable storage suppresses duplicate delivery across workers and hibernation.
      for(const ws of this.ctx.getWebSockets()){
        if(ws.deserializeAttachment()?.expiresAt<Date.now()){ws.close(1000,'Reconnect');continue}
        try{ws.send(JSON.stringify({type:'notifications-changed',sequence}))}catch{try{ws.close(1011,'Disconnected')}catch{}}
      }
      await this.ctx.storage.put('lastSequence',sequence);
      return Response.json({ok:true});
    }
    return new Response('Not found',{status:404});
  }
  webSocketMessage(ws){ws.close(1008,'Read-only channel')}
  webSocketClose(ws,code,reason){try{ws.close(code,reason)}catch{}}
  webSocketError(ws){try{ws.close(1011,'Disconnected')}catch{}}
}

export async function openNotificationChannel(request,env,user){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  if(origin&&origin!==url.origin)return new Response('Forbidden',{status:403});
  if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
  if(!env.NOTIFICATION_HUB)return new Response('Channel unavailable',{status:503});
  // The authenticated user controls the hub name; query parameters and client IDs are ignored.
  const hub=env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(user.id));
  return hub.fetch(new Request('https://notification-hub/connect',{headers:{Upgrade:'websocket'}}));
}

export async function dispatchNotificationEvents(env){
  if(!env.NOTIFICATION_HUB)return;
  const dirty=deferNonessentialD1(env)?null:await env.DB.prepare('SELECT version FROM admin_bell_dirty WHERE id=1').first();
  if(dirty){
    const admins=await env.DB.prepare("SELECT id,role,totp_enabled FROM users WHERE role='admin' AND totp_enabled=1 AND deleted_at IS NULL AND account_status='active'").all();
    for(const admin of admins.results||[])await syncAdminBell(env,admin);
    // Preserve a concurrent source event instead of accidentally clearing it.
    await env.DB.prepare('DELETE FROM admin_bell_dirty WHERE id=1 AND version=?').bind(dirty.version).run();
  }
  for(let attempt=0;attempt<10;attempt++){
    const rows=(await env.DB.prepare('SELECT sequence,user_id FROM notification_event_outbox ORDER BY sequence LIMIT 90').all()).results||[];
    if(!rows.length)return;
    const byUser=new Map();for(const row of rows)byUser.set(row.user_id,Math.max(byUser.get(row.user_id)||0,Number(row.sequence)));
    const delivered=new Set();
    for(const [userId,sequence] of byUser){
      try{const hub=env.NOTIFICATION_HUB.get(env.NOTIFICATION_HUB.idFromName(userId));const response=await hub.fetch('https://notification-hub/changed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sequence})});if(response.ok)delivered.add(userId)}catch{}
    }
    const ids=rows.filter(r=>delivered.has(r.user_id)).map(r=>r.sequence);
    if(ids.length)await env.DB.prepare(`DELETE FROM notification_event_outbox WHERE sequence IN (${ids.map(()=>'?').join(',')})`).bind(...ids).run();
    if(delivered.size!==byUser.size)return; // Durable outbox retries on the next real event/maintenance run.
  }
}
