/**
 * MODO SIN SEÑAL del conductor (Mis viajes).
 *
 * - Copia de la ruta: cada vez que "Mis viajes" carga bien, se guarda en el
 *   celular. Si luego no hay señal, se muestra esa copia con la hora en que
 *   se guardó.
 * - Pendientes: "Ya salí", "Ya llegué" y las novedades tocados sin señal se
 *   guardan con la hora real y se envían solos cuando vuelve la señal (el
 *   servidor respeta esa hora, ver backend/sin-senal.js).
 * - La app en el celular: public/sw.js solo guarda los archivos de la app
 *   cuando existe la marca MARCA_SW (la pone solo la cuenta de conductor), así
 *   los computadores de la oficina siguen igual que siempre.
 */

const CLAVE_COPIA = 'mis-viajes-copia';
const CLAVE_PENDIENTES = 'mis-viajes-pendientes';
const CACHE_APP = 'makand-sin-senal';
const MARCA_SW = '/__sin-senal__';

export interface CopiaMisViajes { email: string; guardadoEn: string; elegido: { ced: string; placa: string } | null; data: any; }

export interface Pendiente {
  id: string;
  tipo: 'marcar' | 'novedad';
  cuando: string;
  body: any;
  /** Texto para mostrar: "Salida del viaje a Cali". */
  texto: string;
}

function leer<T>(clave: string, porDefecto: T): T {
  try { const v = localStorage.getItem(clave); return v ? JSON.parse(v) as T : porDefecto; } catch { return porDefecto; }
}
function escribir(clave: string, valor: any): boolean {
  try { localStorage.setItem(clave, JSON.stringify(valor)); return true; } catch { return false; }
}

export function guardarCopia(email: string, elegido: CopiaMisViajes['elegido'], data: any): void {
  escribir(CLAVE_COPIA, { email, guardadoEn: new Date().toISOString(), elegido, data } as CopiaMisViajes);
}

/** La copia guardada de esta cuenta (null si es de otra cuenta o no hay). */
export function leerCopia(email: string): CopiaMisViajes | null {
  const c = leer<CopiaMisViajes | null>(CLAVE_COPIA, null);
  return c && c.email === email && c.data ? c : null;
}

export function leerPendientes(): Pendiente[] {
  return leer<Pendiente[]>(CLAVE_PENDIENTES, []);
}

/** Guarda una acción para enviarla después. false si el celular no tiene espacio. */
export function agregarPendiente(p: Omit<Pendiente, 'id'>): boolean {
  const lista = leerPendientes();
  lista.push({ ...p, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` });
  return escribir(CLAVE_PENDIENTES, lista);
}

export function quitarPendiente(id: string): void {
  escribir(CLAVE_PENDIENTES, leerPendientes().filter(p => p.id !== id));
}

/** Al cerrar sesión: nada de esta cuenta se queda en el celular. */
export function borrarTodoSinSenal(): void {
  try { localStorage.removeItem(CLAVE_COPIA); localStorage.removeItem(CLAVE_PENDIENTES); } catch { /* nada */ }
  if (typeof caches !== 'undefined') caches.delete(CACHE_APP).catch(() => { /* nada */ });
}

/**
 * ¿El error fue por falta de señal? (fetch no llegó al servidor). Un error
 * del servidor (respuesta con status) no cuenta: eso se muestra tal cual.
 */
export function esFaltaDeSenal(e: unknown): boolean {
  return e instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/**
 * Deja la app guardada en el celular para abrirla sin señal: pone la marca
 * para sw.js y guarda ya los archivos que esta página cargó (los que se
 * carguen después los guarda sw.js solo). Borra los de versiones viejas.
 */
export async function prepararAppSinSenal(): Promise<void> {
  if (typeof caches === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const cache = await caches.open(CACHE_APP);
    await cache.put(MARCA_SW, new Response('1'));
    navigator.serviceWorker.controller?.postMessage('sin-senal');
    const origen = location.origin;
    const actuales = new Set<string>();
    performance.getEntriesByType('resource').forEach(r => {
      const u = new URL(r.name);
      if (u.origin === origen && !u.pathname.startsWith('/api/') && /\.(js|css|woff2?|ttf|png|svg|ico|webmanifest)$/.test(u.pathname)) actuales.add(u.origin + u.pathname);
    });
    for (const url of actuales) {
      if (!(await cache.match(url))) {
        const res = await fetch(url).catch(() => null);
        if (res?.ok) await cache.put(url, res);
      }
    }
    const app = await fetch('/', { cache: 'no-store' }).catch(() => null);
    if (app?.ok) await cache.put('/__app__', app);
    // Archivos de versiones anteriores de la app (cambian de nombre en cada actualización).
    for (const req of await cache.keys()) {
      const u = new URL(req.url);
      if (u.pathname.startsWith('/__')) continue;
      if (/-[A-Z0-9]{8}\.(js|css)$/.test(u.pathname) && !actuales.has(u.origin + u.pathname)) await cache.delete(req);
    }
  } catch { /* sin espacio o navegador sin soporte: la app sigue normal con señal */ }
}
