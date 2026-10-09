// ============================================================
// MAKAND como aplicación instalada (ver services/instalar.service.ts).
// No guarda la app en el celular: cada vez la pide al servidor, así una
// actualización se ve enseguida y nunca queda una versión vieja. Solo si
// el servidor no responde (sin señal, PC de la oficina apagado), muestra
// una pantalla de "Sin conexión" en vez del error del navegador.
// ============================================================
const PAGINA_SIN_CONEXION = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MAKAND — sin conexión</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0f172a;color:#e2e8f0;font-family:system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
h1{font-size:22px;margin:0 0 8px}p{color:#94a3b8;margin:0 0 20px;line-height:1.5}button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:12px 22px;font-size:16px;font-weight:700}</style></head>
<body><div><h1>Sin conexión con MAKAND</h1><p>No hay señal o el computador de la oficina está apagado.<br>Revisa que Tailscale esté conectado y vuelve a intentar.</p>
<button onclick="location.reload()">Reintentar</button></div></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return; // el resto va directo al servidor, como siempre
  e.respondWith(fetch(e.request).catch(() => new Response(PAGINA_SIN_CONEXION, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
