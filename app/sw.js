/* Shell cache. data.enc.json and data.sample.json are network-first. */
var CACHE = "benji-day-shell-v7";
var SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./crypto.js",
  "./manifest.webmanifest",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./favicon-32.png",
  "./favicon-16.png",
  "./data.sample.json",
];

self.addEventListener("install", function (event) {
  event.waitUntil((async function () {
    var cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async function (url) {
      try {
        var res = await fetch(new Request(url, { cache: "reload" }));
        if (res && res.ok) await cache.put(url, res);
      } catch (e) { /* skip a missing extra */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    var keys = await caches.keys();
    await Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
  })());
});

function isData(url) {
  return /\/data\.enc\.json$/.test(url.pathname) || /\/data\.sample\.json$/.test(url.pathname);
}

async function networkFirstData(req) {
  var cache = await caches.open(CACHE);
  var stable = new URL(req.url);
  stable.search = "";
  try {
    var res = await fetch(req, { cache: "no-store" });
    if (res && res.ok) await cache.put(stable.href, res.clone());
    return res;
  } catch (e) {
    var hit = await cache.match(stable.href);
    if (hit) return hit;
    throw e;
  }
}

async function shell(req) {
  var cache = await caches.open(CACHE);
  var hit = await cache.match(req, { ignoreSearch: true });
  var network = fetch(req).then(function (res) {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(function () { return null; });
  if (hit) return hit;
  var res = await network;
  if (res) return res;
  var fallback = await cache.match("./index.html");
  if (fallback) return fallback;
  return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;
  if (isData(url)) {
    event.respondWith(networkFirstData(req));
    return;
  }
  event.respondWith(shell(req));
});
