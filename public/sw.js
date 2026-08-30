const CACHE='sunrise-market-v2';
const APP_SHELL=['/','/offline.html','/manifest.webmanifest','/icon-192x192.png','/pwa-icon.svg','/apple-touch-icon.png','/logo-sunrise-market.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin) return;

  if(req.mode==='navigate'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
      return res;
    }).catch(async()=>{
      const cached=await caches.match(req);
      return cached||caches.match('/offline.html');
    }));
    return;
  }

  if(req.destination==='script'||req.destination==='style'){
    event.respondWith(fetch(req,{cache:'no-store'}).then(res=>{
      if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }

  if(['image','font'].includes(req.destination)){
    event.respondWith(caches.match(req).then(cached=>{
      const network=fetch(req).then(res=>{
        if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
        return res;
      }).catch(()=>cached);
      return cached||network;
    }));
  }
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():''};}
  const title=data.title||'Sunrise Market';
  const options={body:data.body||'Masz nowe powiadomienie.',icon:'/icon-192x192.png',badge:'/favicon-32x32.png',data:{url:data.url||'/konto'},tag:data.tag||'sunrise-market',renotify:Boolean(data.renotify)};
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'/';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if('focus' in client){client.navigate(target);return client.focus();}}
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  }));
});
