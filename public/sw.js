/*
 * Offline shell for the installed app.
 *
 * Only two things are ever stored: Next's immutable build assets, and the last
 * HTML document for a top-level navigation. Everything else — the API, the
 * artwork CDNs, RSC payloads — goes straight to the network, so a stale cache
 * can never serve an out-of-date page shell or someone else's audio.
 *
 * v5: the icon's black frame was screened out onto the app's own background,
 * so the old copies have to go the same way. /icons/* keeps its file names,
 * which is what the version above is for.
 */
const SHELL = "zyrava-shell-v5";
const ASSETS = "zyrava-assets-v5";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      // A stamped copy of the shell, so a launched app with no network still
      // opens on its first run rather than staring at a dinosaur.
      try {
        const response = await fetch("/", { cache: "no-store" });
        if (response.ok) {
          const cache = await caches.open(SHELL);
          await cache.put("/index.html", response.clone());
        }
      } catch {
        /* offline install — the first normal load will fill the shell */
      }
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== SHELL && key !== ASSETS).map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Build assets are content-hashed, so a cached copy can never be the wrong
  // one. The icons keep their names, which is what the version above is for.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.open(ASSETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          caches.open(SHELL).then((cache) => cache.put("/index.html", response.clone()));
          return response;
        })
        .catch(async () => (await caches.match("/index.html")) ?? Response.error())
    );
  }
});
