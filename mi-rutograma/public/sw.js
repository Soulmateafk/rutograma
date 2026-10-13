// ============================================================
// MAKAND como aplicación instalada (ver services/instalar.service.ts).
// Siempre pide la app al servidor, así una actualización se ve enseguida
// y nunca queda una versión vieja. Si el servidor no responde (sin señal,
// PC de la oficina apagado):
//  - En el celular de un conductor (marca '/__sin-senal__', la pone
//    services/sin-senal.ts): abre la última copia de la app, y "Mis
//    viajes" muestra la ruta guardada.
//  - En cualquier otro equipo: la pantalla de "Sin conexión", como antes.
// Sin la marca no se guarda nada: los computadores de la oficina siguen igual.
// ============================================================
const PAGINA_SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MAKAND — sin conexión</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{color:#94a3b8;margin:0 0 20px;line-height:1.5}button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-size:16px;font-weight:700}</style></head>
<body><div><h1>Sin conexión con MAKAND</h1><p>No hay señal o el computador de la oficina está apagado.<br>Revisa que Tailscale esté conectado y vuelve a intentar.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;

const CACHE_APP = 'makand-sin-senal';
const MARCA = '/__sin-senal__';
const ARCHIVO_APP = /\.(js|css|woff2?|ttf|png|svg|ico|webmanifest)$/;

// ¿Entró un conductor en este equipo? Se recuerda para no tocar los
// archivos en los computadores de la oficina (null = aún no se sabe).
let hayConductor = null;

/** El caché solo existe si un conductor entró en este equipo. */
async function cacheSiConductor() {
  let cache = null;
  if (await caches.has(CACHE_APP)) {
    const c = await caches.open(CACHE_APP);
    if (await c.match(MARCA)) cache = c;
  }
  hayConductor = !!cache;
  return cache;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(Promise.all([self.clients.claim(), cacheSiConductor()])));
self.addEventListener('message', e => { if (e.data === 'sin-senal') cacheSiConductor(); });

async function pagina(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await cacheSiConductor();
      if (cache) cache.put('/__app__', res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cache = await cacheSiConductor();
    const copia = cache && await cache.match('/__app__');
    return copia || new Response(PAGINA_SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
}

async function archivo(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const cache = await cacheSiConductor();
      if (cache) cache.put(req.url.split('?')[0], res.clone()).catch(() => {});
    }
    return res;
  } catch (err) {
    const cache = await cacheSiConductor();
    const copia = cache && await cache.match(req.url.split('?')[0]);
    if (copia) return copia;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.mode === 'navigate') { e.respondWith(pagina(req)); return; }
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Los datos (/api) van directo al servidor, como siempre: "Mis viajes" guarda su propia copia.
  if (hayConductor === false || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || !ARCHIVO_APP.test(url.pathname)) return;
  e.respondWith(archivo(req));
});
