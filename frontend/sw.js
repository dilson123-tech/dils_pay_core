// 💾 Cache básico com tolerância a arquivos ausentes e ignoreSearch (v=…)
const CACHE = "dilspay-v15";
const PRECACHE = [
  "/frontend/extrato.html",
  // Adicione aqui o(s) seu(s) CSS/JS reais se quiser pré-cachear.
  // Ex.: "/frontend/css/style.css", "/frontend/extrato.js"
];

// Instala: adiciona o que der (ignora faltantes)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

// Ativa: limpa versões antigas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});
// 💾 Cache básico com tolerância a arquivos ausentes e ignoreSearch (v=…)
const CACHE = "dilspay-v15";
const PRECACHE = [
  "/frontend/extrato.html",
  // Adicione aqui o(s) seu(s) CSS/JS reais se quiser pré-cachear.
  // Ex.: "/frontend/css/style.css", "/frontend/extrato.js"
];

// Instala: adiciona o que der (ignora faltantes)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) =>
        Promise.allSettled(PRECACHE.map((url) => cache.add(url)))
      )
      .then(() => self.skipWaiting())
  );
});

// Ativa: limpa versões antigas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

// Fetch: API = network-first; estático = cache-first (ignoreSearch p/ ?v=14)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isAPI = req.url.includes("/api/v1/");
  if (isAPI) {
    event.respondWith(
      fetch(req).then((res) => {
        // opcional: cache besta de API para offline curto
        const resClone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, resClone)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
  } else {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
    );
  }
});

// Fetch: API = network-first; estático = cache-first (ignoreSearch p/ ?v=14)
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const isAPI = req.url.includes("/api/v1/");
  if (isAPI) {
    event.respondWith(
      fetch(req).then((res) => {
        // opcional: cache besta de API para offline curto
        const resClone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, resClone)).catch(()=>{});
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }))
    );
  } else {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
    );
  }
});
