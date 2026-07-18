// EasyServe service worker — minimal offline resilience for flaky venue WiFi.
// Strategy: cache-first for static assets (fonts, JS, CSS, images),
// network-only for API calls (order data must never be stale).
const CACHE = "easyserve-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept API/WS traffic or cross-origin requests
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;
  if (event.request.method !== "GET") return;

  // Static assets: cache-first, refresh in background
  const isStatic =
    url.pathname.startsWith("/_next/static") ||
    /\.(js|css|woff2?|png|svg|webp|ico)$/.test(url.pathname);

  if (isStatic) {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
            return resp;
          })
      )
    );
  }
});
