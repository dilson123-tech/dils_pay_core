// Service Worker - cache básico (v15)
const CACHE = "dilspay-v15";
const PRECACHE = [
  "/frontend/extrato.html",
  // adicione aqui seus assets se quiser pré-cachear:
  // "/frontend/style.css",
  // "/frontend/extrato.js"
];

// Install: pré-cache (ignora faltantes) e ativa imediatamente
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// Activate: limpa caches antigos e toma controle
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Fetch:
// - API: network-first com fallback ao cache (e cache leve da resposta)
// - Estático: cache-first com ignoreSearch (funciona com ?v=...)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isAPI = req.url.includes("/api/v1/");
  if (isAPI) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, resClone)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
  } else {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
    );
  }
});
