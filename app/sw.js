/* Benji's Day service worker.
 * Shell (HTML, CSS, JS, icons, manifest): stale-while-revalidate.
 * data.enc.json and data.sample.json: network-first, cache fallback.
 * ntfy.sh is a different origin and is not intercepted.
 */
var CACHE = "benji-day-shell-v1";
var SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./crypto.js",
  "./links.js",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./data.sample.json",
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key !== CACHE;
            })
            .map(function (key) {
              return caches.delete(key);
            })
        );
      })
      .then(function () {
        return self.clients.claim();
      })
  );
});

function isDataRequest(url) {
  return /\/data\.(enc|sample)\.json$/.test(url.pathname);
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(staleWhileRevalidate(req));
});

function networkFirst(req) {
  var freshReq = new Request(req.url, { cache: "no-store", credentials: "same-origin" });
  return caches.open(CACHE).then(function (cache) {
    return fetch(freshReq)
      .then(function (res) {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(function () {
        return cache.match(req).then(function (hit) {
          return hit || new Response("offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        });
      });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (cached) {
      var network = fetch(req)
        .then(function (res) {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(function () {
          return cached;
        });
      if (cached) return cached;
      if (req.mode === "navigate") {
        return cache.match("./index.html").then(function (index) {
          return index || network;
        });
      }
      return network;
    });
  });
}
