/* Offline service worker — caches the app shell so it works without internet
   after the first visit. Only active when served over http(s) (not file://). */
const CACHE = "allergen-detector-v7";
const ASSETS = [
  "index.html",
  "styles.css",
  "app.js",
  "database.js",
  "manifest.json",
  "icon.svg",
  "lib/jspdf.umd.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never cache the Tesseract CDN / cross-origin requests; just pass through.
  if (url.origin !== location.origin) return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("index.html")))
  );
});
