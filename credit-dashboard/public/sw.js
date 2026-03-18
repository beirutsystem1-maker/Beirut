// sw.js — versión corregida
const CACHE_NAME = 'app-cache-v2';

// Dominios que NUNCA deben cachearse (APIs externas)
const API_HOSTS = [
  'supabase.co',
  'supabase.io',
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ❌ NUNCA cachear requests a APIs externas (Supabase, etc.)
  if (API_HOSTS.some((host) => url.hostname.includes(host))) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ❌ NUNCA cachear index.html ni archivos JS/CSS del bundle (siempre frescos)
  if (
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // ✅ Solo cachear assets estáticos (imágenes, fuentes, iconos)
  if (
    url.pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|otf)$/)
  ) {
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
    return;
  }

  // Para todo lo demás: ir siempre a la red
  event.respondWith(fetch(event.request));
});

// Limpiar caches viejos al activar (incluyendo 'app-cache-v1')
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  // Tomar control inmediato de todas las pestañas abiertas
  self.clients.claim();
});

self.addEventListener('install', () => {
  self.skipWaiting();
});
