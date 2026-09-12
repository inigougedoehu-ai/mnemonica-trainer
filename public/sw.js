const CACHE_NAME = "mnemonica-v4";
const APP_ROOT = self.registration.scope;
const scoped = (path = "") => new URL(path.replace(/^\/+/, ""), APP_ROOT).toString();
const CARD_URLS = [
  "4c", "2h", "7d", "3c", "4h", "6d", "1s", "5h", "9s", "2s",
  "12h", "3d", "12c", "8h", "6s", "5s", "9h", "13c", "2d", "11h",
  "3s", "8s", "6h", "10c", "5d", "13d", "2c", "3h", "8d", "5c",
  "13s", "11d", "8c", "10s", "13h", "11c", "7s", "10h", "1d", "4s",
  "7h", "4d", "1c", "9c", "11s", "12d", "7c", "12s", "10d", "6c",
  "1h", "9d",
].map((card) => scoped(`cards/standard/${card}.svg`));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const response = await fetch(APP_ROOT);
    await cache.put(APP_ROOT, response.clone());
    const html = await response.text();
    const assetUrls = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .map((url) => new URL(url, APP_ROOT).toString())
      .filter((url) => url.startsWith(self.location.origin));
    await cache.addAll([...new Set([
      scoped("manifest.webmanifest"), scoped("favicon.svg"), scoped("apple-touch-icon.png"), scoped("icon-192.png"), scoped("icon-512.png"),
      ...CARD_URLS, ...assetUrls,
    ])]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(APP_ROOT, response.clone());
        return response;
      } catch {
        return (await caches.match(APP_ROOT)) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
