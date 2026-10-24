// MGT-39 service worker v4: Firebase SDK + fonts are cached (fast repeat loads).
// App files are ALWAYS fetched fresh from the server (HTTP cache bypassed), so a new upload shows up straight away.
// The cached copy is only used when the phone is offline.
const C="mgt39-v6";
const LIB=/^https:\/\/(www\.gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com)\//;
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET"||/\.mp4(\?|$)/.test(r.url))return;
  if(LIB.test(r.url)){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));
    return;
  }
  if(new URL(r.url).origin!==location.origin)return;
  const net=new Promise((ok,bad)=>{const t=setTimeout(()=>bad("timeout"),5000);fetch(r.url,{cache:"no-store",credentials:"same-origin"}).then(res=>{clearTimeout(t);ok(res)},err=>{clearTimeout(t);bad(err)})});
  e.respondWith(net.then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res}).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("./"))));
});

// Push notifications (sent by the free GitHub Actions sender through Firebase Cloud Messaging)
self.addEventListener("push",e=>{
  let p={};try{p=e.data?e.data.json():{}}catch(_){}
  const d=p.data||p.notification||p||{};
  e.waitUntil(self.registration.showNotification(d.title||"MGT-39",{body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||undefined,data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();const url=(e.notification.data&&e.notification.data.url)||"./";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("focus" in c)return c.focus()}return clients.openWindow(url)}));
});
