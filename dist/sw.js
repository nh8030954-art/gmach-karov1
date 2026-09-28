const CACHE_NAME="gmach-shell-v4";
const SHELL=["/","/index.html","/manifest.webmanifest","/release-shell.js"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(SHELL)).catch(()=>{}).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("gmach-shell-")&&k!==CACHE_NAME).map(k=>caches.delete(k))))])));
self.addEventListener("fetch",event=>{
 const req=event.request;if(req.method!=="GET")return;const url=new URL(req.url);if(url.origin!==location.origin||url.pathname.startsWith("/api/")||url.pathname.startsWith("/media/"))return;
 if(req.mode==="navigate"){event.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE_NAME).then(c=>c.put("/index.html",copy));return r}).catch(()=>caches.match("/index.html")));return}
 event.respondWith(caches.match(req).then(hit=>{const network=fetch(req).then(r=>{if(r.ok)caches.open(CACHE_NAME).then(c=>c.put(req,r.clone()));return r}).catch(()=>hit);return hit||network}));
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