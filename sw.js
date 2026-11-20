/*
 * Offline support.
 * Pages and the word list: network first, so edits show up straight away when online.
 * Everything else (CSS, JS, fonts, icons): served from cache and refreshed in the background.
 * Bump VERSION when files are added, renamed or removed so old caches are cleared.
 */
var VERSION = "v1";
var CACHE = "norsk-" + VERSION;
var PRECACHE = [
  "./", "index.html", "grammatikk.html", "ordkort.html", "manifest.webmanifest",
  "data/words.json",
  "assets/common.css", "assets/ordkort.css", "assets/grammatikk.css",
  "assets/srs.js", "assets/ordkort.js", "assets/grammatikk.js", "assets/register-sw.js",
  "assets/fonts/source-sans-3-latin-wght-normal.woff2",
  "assets/fonts/source-sans-3-latin-wght-italic.woff2",
  "assets/fonts/bricolage-grotesque-latin-opsz-normal.woff2",
  "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/apple-touch-icon.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("norsk-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  var networkFirst = req.mode === "navigate" || /\.json$/.test(new URL(req.url).pathname);

  if (networkFirst) {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    }));
    return;
  }

  e.respondWith(caches.match(req).then(function (hit) {
    var refresh = fetch(req).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
      return res;
    });
    if (hit) { refresh.catch(function () {}); return hit; }
    return refresh;
  }));
});
