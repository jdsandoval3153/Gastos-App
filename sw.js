// Service worker: guarda la "cáscara" de la app para que abra rápido e instalable.
// Los datos (Supabase y la función) siempre van por la red: nunca se guardan en caché.
const CACHE = "gastos-v2.0.2-b";
const ARCHIVOS = ["./", "index.html", "estilos.css", "app.js", "api.js", "config.js", "manifest.webmanifest",
  "vendor/supabase.js", "vendor/xlsx.full.min.js", "vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js",
  "iconos/icono-192.png", "iconos/icono-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // API: siempre red
  // Red primero (para recibir actualizaciones); si no hay conexión, la copia guardada.
  // cache: "no-cache" = siempre pregunta al servidor si hay versión nueva (GitHub Pages guarda 10 min si no)
  e.respondWith(fetch(e.request.url, { cache: "no-cache" }).then((r) => {
    const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request)));
});
