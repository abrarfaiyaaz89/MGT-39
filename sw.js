// MGT-39 service worker v2: caches Firebase SDK + fonts (fast repeat loads), app files network-first with a 3s timeout.
const C="mgt39-v3";
const LIB=/^https:\/\/(www\.gstatic\.com\/firebasejs|fonts\.(googleapis|gstatic)\.com)\//;
self.addEventListener("install",e=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{
  const r=e.request;if(r.method!=="GET")return;
  if(LIB.test(r.url)){
    e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})));
    return;
  }
  if(new URL(r.url).origin!==location.origin)return;
  const net=new Promise((ok,bad)=>{const t=setTimeout(()=>bad("timeout"),3000);fetch(r).then(res=>{clearTimeout(t);ok(res)},err=>{clearTimeout(t);bad(err)})});
  e.respondWith(net.then(res=>{const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));return res}).catch(()=>caches.match(r).then(m=>m||caches.match("./"))));
});
