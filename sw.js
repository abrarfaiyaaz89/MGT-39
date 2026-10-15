// MGT-39 service worker: network first, cache fallback (keeps the app opening offline).
const C="mgt39-v1";
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const r=e.request;
  if(r.method!=="GET"||new URL(r.url).origin!==location.origin)return;
  e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(C).then(c=>c.put(r,copy));return res}).catch(()=>caches.match(r).then(m=>m||caches.match("./"))));
});
