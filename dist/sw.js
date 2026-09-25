self.addEventListener("install",event=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("push",event=>{
  let data={title:"גמ״ח ברגע",body:"יש עדכון חדש באזור האישי",url:"/#/dashboard"};
  try{const incoming=event.data?.json();if(incoming&&typeof incoming==="object")data={...data,...incoming}}catch{}
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,icon:"/icons/icon-192.png",badge:"/icons/icon-192.png",data:{url:data.url},tag:data.tag||"gmach-update",renotify:false}));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||"/#/dashboard";
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if("focus" in client){client.navigate?.(url);return client.focus()}}
    return self.clients.openWindow?self.clients.openWindow(url):undefined;
  }));
});