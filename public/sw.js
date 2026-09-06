// Service worker Sunrise Market (2026-09-06): app shell + offline, stale-while-revalidate dla assetów z hashem w nazwie,
// cache obrazów/fontów, ostatnio oglądane oferty offline (odpowiedzi get_offer trzymane w cache API), push.
const CACHE='sunrise-market-v3';
const DATA_CACHE='sunrise-market-data-v1';
const APP_SHELL=['/','/offline.html','/manifest.webmanifest','/icon-192x192.png','/pwa-icon.svg','/apple-touch-icon.png','/logo-sunrise-market.png','/logo-sunrise-market-light.png'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==DATA_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

// Odpowiedzi RPC get_offer (POST) — strona aplikacji wysyła je do SW wiadomością, żeby oferta działała offline
self.addEventListener('message',event=>{
  const d=event.data||{};
  if(d.type==='cache-offer'&&d.id&&d.payload){
    caches.open(DATA_CACHE).then(c=>c.put(new Request('/__offer/'+d.id),new Response(JSON.stringify(d.payload),{headers:{'Content-Type':'application/json'}}))).catch(()=>{});
  }
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET') return;
  const url=new URL(req.url);

  // obrazy ofert z Supabase Storage / fonty Google: cache-first z odświeżeniem w tle
  if(url.origin!==self.location.origin){
    if(req.destination==='image'||req.destination==='font'||url.hostname==='fonts.googleapis.com'){
      event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(req);const network=fetch(req).then(res=>{if(res&&(res.ok||res.type==='opaque'))cache.put(req,res.clone()).catch(()=>{});return res;}).catch(()=>cached);return cached||network;}));
    }
    return;
  }

  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(res=>{const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});return res;})
      .catch(async()=>{const cached=await caches.match(req);return cached||caches.match('/')||caches.match('/offline.html');}));
    return;
  }

  // assety z hashem w nazwie (/assets/*-abc123.js) są niezmienne: cache-first
  if(url.pathname.startsWith('/assets/')){
    event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(req);if(cached)return cached;const res=await fetch(req);if(res&&res.ok)cache.put(req,res.clone()).catch(()=>{});return res;}));
    return;
  }
  if(req.destination==='script'||req.destination==='style'){
    event.respondWith(fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}return res;}).catch(()=>caches.match(req)));
    return;
  }
  if(['image','font'].includes(req.destination)){
    event.respondWith(caches.match(req).then(cached=>{const network=fetch(req).then(res=>{if(res&&res.ok){const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}return res;}).catch(()=>cached);return cached||network;}));
  }
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():''};}
  const title=data.title||'Sunrise Market';
  const options={body:data.body||'Masz nowe powiadomienie.',icon:'/icon-192x192.png',badge:'/favicon-32x32.png',data:{url:data.url||'/powiadomienia'},tag:data.tag||'sunrise-market',renotify:Boolean(data.renotify)};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.url||'/powiadomienia';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{
    for(const client of clients){if('focus' in client){client.navigate(target);return client.focus();}}
    return self.clients.openWindow?self.clients.openWindow(target):undefined;
  }));
});
