const CACHE_NAME="gmach-shell-v7";
const SHELL=["/","/index.html","/manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("gmach-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",event=>{
 const req=event.request;if(req.method!=="GET")return;const url=new URL(req.url);if(url.origin!==location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/media/"))return;
 const fallback=()=>caches.match(req).then(hit=>hit||((req.mode==="navigate")?caches.match("/index.html"):undefined));
 const networkFirst=()=>fetch(req).then(r=>{if(r.ok){const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put(req.mode==="navigate"?"/index.html":req,copy))}return r}).catch(fallback);
 if(req.mode==="navigate"||/\.(?:js|css)$/i.test(url.pathname)){event.respondWith(networkFirst());return}
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok)caches.open(CACHE_NAME).then(c=>c.put(req,r.clone()));return r})));
});
self.addEventListener("push",event=>{
  let data={title:"גמ״ח ברגע",body:"יש עדכון חדש באזור האישי",url:"/#/dashboard"};
  try{const incoming=event.data?.json();if(incoming&&typeof incoming==="object")data={...data,...incoming}}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",data:{url:data.url},tag:data.tag||"gmach-update",renotify:false}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();const url=event.notification.data?.url||"/#/dashboard";
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{for(const client of clients){if("focus" in client){client.navigate?.(url);return client.focus()}}return self.clients.openWindow?self.clients.openWindow(url):undefined}));
});