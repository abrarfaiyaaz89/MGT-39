// MGT-39 service worker v3: caches Firebase SDK + fonts; app files open instantly from cache and refresh in the background (a Refresh bar appears when a new version is ready).
const C="mgt39-v4";
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
  e.respondWith((async()=>{
    const c=await caches.open(C),m=await c.match(r);
    const upd=fetch(r).then(async res=>{
      if(res.ok){
        if(m&&r.mode==="navigate"){const [a,b]=await Promise.all([m.clone().text(),res.clone().text()]);if(a!==b){await c.put(r,res.clone());(await self.clients.matchAll()).forEach(k=>k.postMessage("upd"))}}
        else await c.put(r,res.clone());
      }
      return res;
    });
    if(m){e.waitUntil(upd.catch(()=>{}));return m}
    try{return await upd}catch(err){return (await c.match("./"))||Response.error()}
  })());
});
