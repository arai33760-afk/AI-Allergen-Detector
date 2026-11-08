'use strict';
const PREFIX='allergenguard-v10-';
const CACHE=PREFIX+'20261109';
const ASSETS=['./','index.html','styles.css?v=10.1','database.js?v=10.1','catalog.js?v=10.1','engine.js?v=10.1','i18n.js?v=10.1','app.js?v=10.1','manifest.json','icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith(PREFIX)||key.startsWith('allergen-detector-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
 const path=new URL(event.request.url).pathname;
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('index.html',copy)));}return response;}).catch(()=>caches.match('index.html')));return;
 }
 if(!/\.(js|css|json|svg)$/.test(path))return;
 event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;})));
});
