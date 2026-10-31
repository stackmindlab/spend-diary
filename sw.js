/*
  sw.js — the "service worker". It lets Spend Diary open with no internet.
  It keeps a copy of the app's own files (never your money data — that's in localStorage).
  Strategy: try the network first so updates show up; if offline, use the saved copy.
*/
const CACHE = "spend-diary-v1";
const FILES = [
  "./", "index.html", "manifest.webmanifest",
  "css/themes.css", "css/styles.css",
  "js/helpers.js", "js/i18n.js", "js/storage.js", "js/charts.js", "js/app.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  // Delete caches from older versions.
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const sameSite = new URL(event.request.url).origin === location.origin;
  if (event.request.method !== "GET" || !sameSite) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then(saved => saved || caches.match("index.html")))
  );
});
