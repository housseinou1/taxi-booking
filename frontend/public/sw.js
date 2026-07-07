const CACHE_NAME = "yala-app-v4";
const APP_SHELL = [
  "/",
  "/login",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  // Never cache JS/CSS bundles — they change on every deploy.
  if (url.pathname.startsWith("/static/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/"))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      })
      .catch(() =>
        caches.match(request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return caches.match("/");
        })
      )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/";
  const absoluteUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        const matchingClient = clientList.find((client) =>
          client.url.startsWith(self.location.origin)
        );

        if (matchingClient) {
          matchingClient.focus();
          return matchingClient.navigate(absoluteUrl);
        }

        return self.clients.openWindow(absoluteUrl);
      })
  );
});
