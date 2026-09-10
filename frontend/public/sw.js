// EasyServe service worker — minimal offline resilience for flaky venue WiFi.
// Strategy: cache-first for static assets (fonts, JS, CSS, images),
// network-only for API calls (order data must never be stale).
const CACHE = "easyserve-static-v2";
const MENU_CACHE = "easyserve-menu-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE && k !== MENU_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (event.request.method !== "GET") return;

  // The guest menu is the one API read worth keeping: without it a scanned QR
  // shows an empty screen on a dead network, and a slightly stale menu is far
  // better than nothing. Safe to serve stale because the server reprices every
  // order from its own records — a cached price can never become a charged one.
  // Network-first so a live menu always wins when there is one.
  if (url.pathname.includes("/customer/menu/")) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const copy = resp.clone();
          caches.open(MENU_CACHE).then((c) => c.put(event.request, copy));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else on the API stays network-only: order state must never be
  // served stale.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api")) return;

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
