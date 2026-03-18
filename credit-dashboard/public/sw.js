// sw.js
const CACHE_NAME = 'app-cache-v1';

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ❌ NUNCA cachear index.html ni archivos JS del bundle
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js')   // ← esto evita el MIME error
  ) {
    event.respondWith(fetch(event.request)); // siempre va a la red
    return;
  }

  // Solo cachear assets estáticos (imágenes, fuentes, CSS)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});

// Limpiar caches viejos al activar
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
});
