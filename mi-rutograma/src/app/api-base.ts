// ============================================================
// DIRECCIÓN DEL SERVIDOR — una sola, para toda la app.
// La app la sirve el mismo servidor (puerto 5000), o Tailscale con HTTPS
// (https://equipo.tailnet.ts.net, sin puerto) para poder instalarla como
// aplicación en el celular: en los dos casos el servidor es la misma
// dirección de la página. Solo en desarrollo (ng serve, otro puerto) el
// servidor está aparte, en el puerto 5000 del mismo equipo.
// ============================================================
export const SERVIDOR: string = (() => {
  if (typeof window === 'undefined') return 'http://localhost:5000';
  const { protocol, hostname, port, origin } = window.location;
  return port === '' || port === '5000' ? origin : `${protocol}//${hostname}:5000`;
})();

export const API: string = `${SERVIDOR}/api`;
