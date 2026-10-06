// Organization-wide service policy. Coordinates are resolved from saved addresses,
// never from coordinates supplied with a borrowing request.
export const serviceRangeSchema = [
  `CREATE TABLE IF NOT EXISTS organization_service_ranges (organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,radius_km INTEGER CHECK(radius_km IN (2,5,10,20,50)),allow_exception INTEGER NOT NULL DEFAULT 0 CHECK(allow_exception IN (0,1)))`,
  `CREATE TABLE IF NOT EXISTS service_location_cache (address_hash TEXT PRIMARY KEY,latitude REAL NOT NULL,longitude REAL NOT NULL,expires_at TEXT NOT NULL)`
];
const ready = new WeakMap();
export async function ensureServiceRanges(env) {
  if (!ready.has(env.DB)) ready.set(env.DB, env.DB.batch(serviceRangeSchema.map(sql => env.DB.prepare(sql))).catch(e => { ready.delete(env.DB); throw e; }));
  await ready.get(env.DB);
}
function invalid(message, status=400) { const e=new Error(message); e.status=status; return e; }
export function serviceRangeInput(body, existing={}) {
  const value=body.serviceRadiusKm===undefined?existing.radiusKm:body.serviceRadiusKm;
  const radiusKm=value==null||value===''?null:Number(value);
  if(radiusKm!==null&&![2,5,10,20,50].includes(radiusKm))throw invalid('יש לבחור טווח שירות של 2, 5, 10, 20, 50 ק״מ או ללא הגבלה');
  if(body.allowDistanceException!==undefined&&typeof body.allowDistanceException!=='boolean')throw invalid('הגדרת בקשת החריגה אינה תקינה');
  return {radiusKm,allowException:radiusKm!==null&&(body.allowDistanceException??existing.allowException??false)};
}
export async function getServiceRange(env,id) {
  await ensureServiceRanges(env);
  const row=await env.DB.prepare('SELECT radius_km,allow_exception FROM organization_service_ranges WHERE organization_id=?').bind(id).first();
  return {radiusKm:row?.radius_km??null,allowException:Boolean(row?.allow_exception)};
}
export function serviceRangeStatement(env,id,p) {
  return env.DB.prepare('INSERT INTO organization_service_ranges(organization_id,radius_km,allow_exception) VALUES(?,?,?) ON CONFLICT(organization_id) DO UPDATE SET radius_km=excluded.radius_km,allow_exception=excluded.allow_exception').bind(id,p.radiusKm,p.allowException?1:0);
}
export function distanceKm(a,b) {
  const rad=x=>x*Math.PI/180,dlat=rad(b.latitude-a.latitude),dlon=rad(b.longitude-a.longitude);
  const h=Math.sin(dlat/2)**2+Math.cos(rad(a.latitude))*Math.cos(rad(b.latitude))*Math.sin(dlon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
export function evaluateServiceRange(policy,distance) {
  if(policy.radiusKm==null)return {...policy,allowed:true,outside:false,exceptionAvailable:false,message:''};
  const outside=distance>policy.radiusKm;
  return {...policy,allowed:!outside,outside,exceptionAvailable:outside&&policy.allowException,distanceKm:Math.round(distance*10)/10,message:outside?`גמ״ח זה נותן שירות לתושבים ברדיוס של עד ${policy.radiusKm} ק״מ ממיקומו.`:''};
}
export async function resolveServiceLocation(env,address,city='') {
  if(!address||address.trim().length<5)throw invalid('כדי לבדוק את טווח השירות יש לשמור כתובת מלאה באזור האישי');
  const query=[address.trim(),city.trim()].filter(Boolean).join(', ');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(query.toLowerCase()))),x=>x.toString(16).padStart(2,'0')).join('');
  const cached=await env.DB.prepare('SELECT latitude,longitude FROM service_location_cache WHERE address_hash=? AND expires_at>?').bind(hash,new Date().toISOString()).first();
  if(cached)return cached;
  // The existing geocoding throttle prevents requests from overwhelming the provider.
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS geocode_throttle (id INTEGER PRIMARY KEY CHECK(id=1),last_request_at TEXT)').run();
  await env.DB.prepare('INSERT OR IGNORE INTO geocode_throttle(id,last_request_at) VALUES(1,NULL)').run();
  let reservation;
  for(let attempt=0;attempt<2;attempt++){
    const at=new Date();
    reservation=await env.DB.prepare('UPDATE geocode_throttle SET last_request_at=? WHERE id=1 AND (last_request_at IS NULL OR last_request_at<=?)').bind(at.toISOString(),new Date(at.getTime()-1100).toISOString()).run();
    if(reservation.meta?.changes)break;
    if(attempt===0)await new Promise(resolve=>setTimeout(resolve,1200));
  }
  if(!reservation.meta?.changes)throw invalid('בדיקת הכתובת בעיצומה. נסו שוב בעוד מספר שניות',429);
  const url=new URL('https://nominatim.openstreetmap.org/search');
  for(const [k,v] of Object.entries({format:'jsonv2',limit:'2',countrycodes:'il',addressdetails:'1',q:query}))url.searchParams.set(k,v);
  let response;
  try{response=await (env.SERVICE_RANGE_GEOCODER?env.SERVICE_RANGE_GEOCODER.fetch(new Request(url)):fetch(url,{headers:{'User-Agent':'GmachBerega/1.0 (+https://gmach-berega.co.il)','Accept-Language':'he,en'},signal:AbortSignal.timeout(8000)}));}catch{throw invalid('לא ניתן לבדוק את הכתובת כרגע. נסו שוב מאוחר יותר',503);}
  if(!response.ok)throw invalid('לא ניתן לבדוק את הכתובת כרגע. נסו שוב מאוחר יותר',503);
  const results=await response.json(),first=Array.isArray(results)?results[0]:null;
  if(!first||['administrative','city','town','village','municipality','suburb','neighbourhood','country'].includes(first.type)||first.lat==null||first.lon==null)throw invalid('לא נמצא מיקום מדויק לכתובת. יש לוודא שהכתובת כוללת רחוב, מספר בית ויישוב');
  const location={latitude:Number(first.lat),longitude:Number(first.lon)};
  if(!Number.isFinite(location.latitude)||!Number.isFinite(location.longitude)||Math.abs(location.latitude)>90||Math.abs(location.longitude)>180)throw invalid('לא נמצא מיקום תקין לכתובת');
  await env.DB.prepare('INSERT OR REPLACE INTO service_location_cache(address_hash,latitude,longitude,expires_at) VALUES(?,?,?,?)').bind(hash,location.latitude,location.longitude,new Date(Date.now()+30*86400000).toISOString()).run();
  return location;
}
