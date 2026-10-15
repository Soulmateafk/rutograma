/**
 * "Pregúntale al furgoncito" (components/apariencia/mascota.ts): entiende
 * preguntas escritas como se habla y responde con algo útil.
 *
 *  - De un viaje: "¿qué pasa con el viaje BOG-BAQ-EX de la LUN 428?" →
 *    cuándo es, quién lo maneja, si ya salió o llegó, novedades… (usa el
 *    mismo intérprete del buscador hablado, services/buscar-hablado.ts).
 *  - De viajes en general: "¿cuántos viajes salen mañana?" → cuántos hay y
 *    un botón para ver la lista.
 *  - De cómo hacer algo o dónde está: "¿cómo pongo un viaje extra?",
 *    "¿dónde veo los comparendos?" → lleva a la pantalla o abre la guía.
 *  - Lo que no entiende lo pregunta ("¿te refieres a…?") y APRENDE la
 *    respuesta que la persona escoja: la próxima vez ya lo sabe.
 */
import { interpretar, filtrarViajes, conductorDelViaje, titularesPorPlaca, sinTildes } from '../../services/buscar-hablado';
import { TAREAS } from '../../services/guias';
import { responderDatos, Extra, EJEMPLOS_DATOS } from './mascota-datos';

export type TipoAccion = 'ruta' | 'viaje' | 'buscar' | 'tarea' | 'apariencia' | 'viaje-extra' | 'novedad';
export interface Accion { texto: string; tipo: TipoAccion; valor?: string; }
export interface Tema { clave: string; texto: string; palabras: string[]; accion: Accion; }
export interface Respuesta { texto: string; acciones: Accion[]; entendio: boolean; opciones: Tema[]; }

/** Lo que el furgoncito sabe explicar: pantallas, acciones y las guías "¿Cómo hago…?". */
const TEMAS_BASE: Tema[] = [
  { clave: 'p:rutograma', texto: 'El Rutograma es el calendario de todos los viajes del mes.', palabras: ['rutograma', 'calendario', 'matriz', 'programacion', 'mover viaje'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:dashboard', texto: 'En el Dashboard ves el día de un vistazo: alertas, viajes de hoy y capacidad.', palabras: ['dashboard', 'inicio', 'alertas', 'capacidad', 'resumen general'], accion: { texto: 'Ir al Dashboard', tipo: 'ruta', valor: '/dashboard' } },
  { clave: 'p:resumen', texto: 'El Resumen del día te muestra los números de hoy.', palabras: ['resumen del dia', 'resumen de hoy', 'bienvenida'], accion: { texto: 'Ver el Resumen', tipo: 'ruta', valor: '/resumen' } },
  { clave: 'p:vehiculos', texto: 'En Vehículos están la flota, el SOAT, la tecnomecánica y el mantenimiento.', palabras: ['vehiculo', 'vehiculos', 'flota', 'soat', 'tecnomecanica', 'camion', 'furgon', 'placa'], accion: { texto: 'Ir a Vehículos', tipo: 'ruta', valor: '/vehiculos' } },
  { clave: 'p:conductores', texto: 'En Conductores están los datos, licencias, descansos y los viajes de cada uno.', palabras: ['conductor', 'conductores', 'licencia', 'chofer', 'descanso', 'descansos'], accion: { texto: 'Ir a Conductores', tipo: 'ruta', valor: '/conductores' } },
  { clave: 'p:rutas', texto: 'En Rutas están todas las rutas con su destino y duración.', palabras: ['ruta', 'rutas', 'destinos', 'codigo de ruta'], accion: { texto: 'Ir a Rutas', tipo: 'ruta', valor: '/rutas' } },
  { clave: 'p:tareas', texto: 'En Tareas asignas pendientes al equipo con fecha límite.', palabras: ['tarea', 'tareas', 'pendiente', 'pendientes', 'asignar algo', 'recordatorio'], accion: { texto: 'Ir a Tareas', tipo: 'ruta', valor: '/tareas' } },
  { clave: 'p:comparendos', texto: 'En Comparendos llevas las multas de cada conductor.', palabras: ['comparendo', 'comparendos', 'multa', 'multas', 'fotomulta'], accion: { texto: 'Ir a Comparendos', tipo: 'ruta', valor: '/comparendos' } },
  { clave: 'p:quejas', texto: 'En Quejas anotas los reclamos de los clientes.', palabras: ['queja', 'quejas', 'reclamo', 'reclamos'], accion: { texto: 'Ir a Quejas', tipo: 'ruta', valor: '/quejas' } },
  { clave: 'p:mapa', texto: 'El Mapa muestra a qué destinos vamos.', palabras: ['mapa', 'donde vamos', 'ciudades'], accion: { texto: 'Abrir el Mapa', tipo: 'ruta', valor: '/mapa' } },
  { clave: 'p:comparativo', texto: 'El Comparativo compara meses, con gráficos en "Analizar en detalle".', palabras: ['comparativo', 'comparar', 'grafico', 'graficos', 'estadisticas'], accion: { texto: 'Ir al Comparativo', tipo: 'ruta', valor: '/comparativo' } },
  { clave: 'p:presentacion', texto: 'El Modo presentación muestra los números como diapositivas, por semanas o meses.', palabras: ['presentacion', 'diapositivas', 'reunion', 'mostrar numeros'], accion: { texto: 'Abrir la Presentación', tipo: 'ruta', valor: '/presentacion' } },
  { clave: 'p:historico', texto: 'En el Histórico ves cómo quedó cada mes.', palabras: ['historico', 'historial', 'meses pasados', 'mes pasado'], accion: { texto: 'Ir al Histórico', tipo: 'ruta', valor: '/historico' } },
  { clave: 'p:cumplimiento', texto: 'Cumplimiento te dice qué tan a tiempo salen y llegan los viajes.', palabras: ['cumplimiento', 'a tiempo', 'puntualidad', 'retrasos'], accion: { texto: 'Ir a Cumplimiento', tipo: 'ruta', valor: '/cumplimiento' } },
  { clave: 'p:reglas', texto: 'En Reglas configuras qué vehículo sirve para cada cliente y el pico y placa.', palabras: ['reglas', 'pico y placa', 'pico', 'restriccion'], accion: { texto: 'Ir a Reglas', tipo: 'ruta', valor: '/reglas' } },
  { clave: 'p:despachos', texto: 'En Despachos se anota a qué hora llega y termina de cargar cada vehículo.', palabras: ['despacho', 'despachos', 'cargue', 'cargar', 'bodega'], accion: { texto: 'Ir a Despachos', tipo: 'ruta', valor: '/despachos' } },
  { clave: 'p:aprobaciones', texto: 'En Aprobaciones están los cambios que esperan el visto bueno del jefe.', palabras: ['aprobacion', 'aprobaciones', 'aprobar', 'aprobaron', 'rechazar', 'pendiente de aprobar'], accion: { texto: 'Ir a Aprobaciones', tipo: 'ruta', valor: '/aprobaciones' } },
  { clave: 'p:papelera', texto: 'En la Papelera está lo eliminado de los últimos 30 días.', palabras: ['papelera', 'borre', 'borro', 'eliminado', 'elimine', 'recuperar', 'recupero', 'borrado', 'deshacer'], accion: { texto: 'Ir a la Papelera', tipo: 'ruta', valor: '/papelera' } },
  { clave: 'p:configuracion', texto: 'En Configuración están los respaldos, el modo prueba y los ajustes generales.', palabras: ['configuracion', 'respaldo', 'respaldos', 'modo prueba', 'ajustes', 'backup'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'p:sesiones', texto: 'En Sesiones ves dónde está abierta tu cuenta.', palabras: ['sesion', 'sesiones', 'cerrar sesion', 'equipos conectados'], accion: { texto: 'Ir a Sesiones', tipo: 'ruta', valor: '/sesiones' } },
  { clave: 'a:apariencia', texto: 'En Apariencia cambias el tema, los colores, la letra, el fondo y más.', palabras: ['apariencia', 'tema', 'color', 'colores', 'letra', 'fondo', 'oscuro', 'claro', 'mascota'], accion: { texto: 'Abrir Apariencia', tipo: 'apariencia' } },
  { clave: 'a:viaje-extra', texto: 'Con "+ Viaje Extra" (o la tecla N) agregas un viaje que no estaba programado.', palabras: ['viaje extra', 'extra', 'nuevo viaje', 'agregar viaje', 'crear viaje'], accion: { texto: 'Abrir Viaje Extra', tipo: 'viaje-extra' } },
  { clave: 'a:novedad', texto: 'Con "Novedad" (o Shift+N) registras algo que pasó: varado, retraso, accidente…', palabras: ['novedad', 'novedades', 'varado', 'varo', 'se varo', 'accidente', 'reportar', 'reporto', 'reporte', 'pinchazo', 'se daño', 'retraso', 'choque'], accion: { texto: 'Abrir Novedad', tipo: 'novedad' } }
];

/** Palabras clave extra para las guías "¿Cómo hago…?" (además de su título). */
const PALABRAS_TAREA: Record<string, string[]> = {
  'viaje-extra': ['viaje extra', 'agregar viaje', 'crear viaje'],
  'cambiar-conductor': ['cambiar conductor', 'otro conductor', 'cambiar el conductor'],
  'descanso': ['descanso', 'descansos', 'dia libre'],
  'asignar-vehiculo': ['asignar vehiculo', 'conductor a un vehiculo', 'titular'],
  'mantenimiento': ['mantenimiento', 'taller'],
  'novedad': ['registrar novedad'],
  'mover-viaje': ['mover viaje', 'arrastrar', 'cambiar de dia'],
  'atajos': ['atajos', 'teclado'],
  'instalar': ['instalar', 'aplicacion', 'celular'],
  'mis-notas': ['notas', 'apuntar'],
  'aprobar': ['aprobar', 'rechazar cambios'],
  'mis-solicitudes': ['me aprobaron', 'mis cambios']
};

/** Todos los temas: los de arriba más una guía paso a paso por cada "¿Cómo hago…?". */
export const TEMAS: Tema[] = [
  ...TEMAS_BASE,
  ...TAREAS.map(t => ({
    clave: 't:' + t.clave,
    texto: `Te muestro paso a paso: "${t.titulo}".`,
    palabras: [sinTildes(t.titulo), ...(PALABRAS_TAREA[t.clave] || [])],
    accion: { texto: 'Mostrarme cómo', tipo: 'tarea' as TipoAccion, valor: t.clave }
  }))
];

const VACIAS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'en', 'y', 'a', 'al', 'con', 'por', 'para', 'me', 'mi', 'se', 'como', 'donde',
  'cual', 'cuales', 'hago', 'hacer', 'algo', 'cosa', 'app', 'aplicacion', 'puedo', 'veo', 'ver', 'esta', 'estan', 'es', 'hay', 'quiero', 'necesito', 'favor', 'porfa', 'porfavor', 'lo', 'le', 'su', 'sus', 'o', 'tu', 'te']);

/** Pregunta en minúsculas, sin tildes ni signos (para comparar y para lo aprendido). */
export const normalizarPregunta = (t: string): string => sinTildes(t).replace(/[¿?¡!.,;:"']/g, ' ').replace(/\s+/g, ' ').trim();
const palabrasDe = (t: string) => normalizarPregunta(t).split(' ').filter(p => p.length > 1 && !VACIAS.has(p));

/** Qué tanto se parece la pregunta a un tema (frases completas valen más que palabras sueltas). */
function puntaje(pregunta: string, tema: Tema): number {
  const q = ` ${normalizarPregunta(pregunta)} `;
  let p = 0;
  for (const clave of tema.palabras) {
    const c = sinTildes(clave);
    if (c.includes(' ') ? q.includes(` ${c} `) || q.includes(c) : q.includes(` ${c} `)) p += c.includes(' ') ? 3 : 2;
  }
  // Palabras sueltas del título o de las claves (para "¿dónde quedan las multas?").
  const sueltas = new Set(tema.palabras.flatMap(c => sinTildes(c).split(' ')).filter(w => w.length > 3 && !VACIAS.has(w)));
  for (const w of palabrasDe(pregunta)) if (sueltas.has(w)) p += 1;
  return p;
}

/** Parecido entre dos preguntas (palabras en común), de 0 a 1. */
function parecido(a: string, b: string): number {
  const A = new Set(palabrasDe(a)), B = new Set(palabrasDe(b));
  if (!A.size || !B.size) return 0;
  let comun = 0; A.forEach(w => { if (B.has(w)) comun++; });
  return comun / Math.max(A.size, B.size);
}

const fechaLarga = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
};
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const isoHoy = (h: Date) => `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;

/** "El viaje BOG-BAQ-EX de LUN 428 es el jueves 16 de octubre…": todo lo que se sabe de un viaje. */
export function contarViaje(v: any, S: any, hoy = new Date()): string {
  const ruta = v.codigo || v.ruta || 'sin ruta';
  const placa = v.p || v.placa || 'sin placa';
  const cond = conductorDelViaje(v, titularesPorPlaca(S));
  const hoyIso = isoHoy(hoy);
  const fecha = String(v.fecha || '').slice(0, 10);
  const cuando = fecha === hoyIso ? 'es hoy' : fecha < hoyIso ? `fue el ${fechaLarga(fecha)}` : `es el ${fechaLarga(fecha)}`;
  const partes = [`El viaje ${ruta} de ${placa} ${cuando}${v.hora && v.hora !== '--:--' ? `, a las ${v.hora}` : ''}`];
  if (v.destino) partes[0] += ` hacia ${v.destino}`;
  partes[0] += '.';
  partes.push(cond ? `Lo maneja ${cond}.` : 'Todavía no tiene conductor. ⚠️');
  if (v.cliente) partes.push(`Cliente: ${v.cliente}${v.cajas ? `, ${v.cajas} cajas` : ''}.`);
  if (v.estado === 'Cancelado') partes.push(`Está CANCELADO${v.motivoCancelacion ? ` (${v.motivoCancelacion})` : ''}. ❌`);
  else if (v.llegadaReal) partes.push(`Ya llegó: salió a las ${horaDe(v.salidaReal)} y llegó a las ${horaDe(v.llegadaReal)}. ✅`);
  else if (v.salidaReal) partes.push(`Va en camino: salió a las ${horaDe(v.salidaReal)}. 🚚`);
  else if (v.estado) partes.push(`Estado: ${v.estado}.`);
  const nov = Array.isArray(v.novedades) ? v.novedades.length : 0;
  if (nov) partes.push(`Tiene ${nov} novedad${nov === 1 ? '' : 'es'}. 📝`);
  return partes.join(' ');
}

/**
 * Responde una pregunta. `aprendido` son las preguntas que la persona ya le
 * enseñó (pregunta normalizada → clave del tema).
 */
export function responder(pregunta: string, S: any, aprendido: Record<string, string> = {}, hoy = new Date(), extra: Extra = {}): Respuesta {
  const q = normalizarPregunta(pregunta);
  if (!q) return { texto: 'Escríbeme una pregunta y te ayudo. 🙂', acciones: [], entendio: false, opciones: [] };

  // 1. Algo que ya le enseñaron (igual o muy parecido).
  const ya = aprendido[q] || Object.entries(aprendido).find(([k]) => parecido(k, q) >= 0.8)?.[1];
  const temaAprendido = ya ? TEMAS.find(t => t.clave === ya) : null;
  if (temaAprendido) return { texto: `${temaAprendido.texto} (Esto me lo enseñaste tú. 😉)`, acciones: [temaAprendido.accion], entendio: true, opciones: [] };

  // 1b. Datos directos de la app: vehículos, conductores, pico y placa, tareas… (mascota-datos.ts)
  const directa = responderDatos(pregunta, S, extra, hoy);
  if (directa) return directa;

  // Qué tan bien encaja con cada tema (pantallas, acciones, guías).
  const puntuados = TEMAS.map(t => ({ t, p: puntaje(pregunta, t) })).filter(x => x.p > 0);
  // Si pregunta "cómo", la guía paso a paso gana sobre la pantalla.
  const quiereComo = /\bcomo\b|\bpaso a paso\b|\bensena/.test(q);
  if (quiereComo) puntuados.forEach(x => { if (x.t.accion.tipo === 'tarea' && x.p >= 2) x.p += 3; });
  puntuados.sort((a, b) => b.p - a.p);
  const temaClaro = puntuados.length && puntuados[0].p >= 3 && (puntuados.length === 1 || puntuados[0].p > puntuados[1].p) ? puntuados[0] : null;
  const respuestaTema = (): Respuesta => {
    const t = temaClaro!.t;
    // Un segundo botón si hay otro tema casi igual de bueno (ej. la guía y la pantalla).
    const seg = puntuados[1];
    const otro = seg && seg.p >= 3 && seg.p >= temaClaro!.p - 3 && seg.t.accion.tipo !== t.accion.tipo ? seg.t.accion : null;
    return { texto: t.texto, acciones: otro ? [t.accion, otro] : [t.accion], entendio: true, opciones: [] };
  };

  // "¿Cómo agrego un viaje extra?" es de cómo hacer algo, no una búsqueda de viajes
  // (salvo que nombre una ruta o una placa: "¿cómo va el viaje BOG-CAL-D1?").
  const nombraViaje = /\b[a-z]{3}\s*-\s*[a-z]{3}\b|\b[a-z]{3}\s?-?\d{3}\b|\b(polar|arsi|makand)\s*\d+\b/i.test(q);
  const esComoODonde = /\b(como|donde|que es|para que|sirve|ensena|explica)\b/.test(q) && !/\bcomo va\b|\bdonde esta\b|\bdonde va\b/.test(q);
  if (temaClaro && (esComoODonde || !nombraViaje)) {
    if (esComoODonde || temaClaro.p >= 4) return respuestaTema();
  }

  // 2. Un viaje o viajes (ruta, placa, conductor, fechas…). Las palabras de la
  // pregunta ("qué pasa con", "cómo va") no son filtros.
  const limpia = normalizarPregunta(pregunta).replace(/\b(que pasa con|como va|como van|donde esta|donde va|quien maneja|quien lleva|cuentame de|informacion de|el viaje|la placa|el vehiculo|del vehiculo|de la placa|que paso con|estado de)\b/g, ' ');
  const pideViaje = /\bviajes?\b|\bpasa\b|\bva\b|\bsalio\b|\bllego\b|\bsale\b|\bsalen\b|\bentreg|\bmaneja\b|\besta\b/.test(q);
  const interp = interpretar(limpia, S, hoy);
  const f = interp.filtros;
  const especifico = f.rutas.length > 0 || f.placas.length > 0 || (f.conductores.length > 0 && nombraViaje);
  if (interp.algo && (especifico || pideViaje || f.conductores.length > 0)) {
    const buscar = (filtros: any) => filtrarViajes({ ...filtros, soloFuturos: false, libres: especifico ? [] : filtros.libres }, S, (v: any) => v.hora || '', hoy);
    let encontrados = buscar(f);
    let sinFecha = false;
    // "¿Cómo va el viaje de la LUN 429 hoy?" y hoy no tiene: el más cercano.
    if (!encontrados.length && especifico && (f.desde || f.hasta)) { encontrados = buscar({ ...f, desde: null, hasta: null, diasSemana: [] }); sinFecha = encontrados.length > 0; }
    const hoyIso = isoHoy(hoy);
    // El más cercano a hoy primero (hoy, luego lo que viene, luego lo pasado).
    const orden = (v: any) => { const d = String(v.fecha || '').slice(0, 10); return d >= hoyIso ? `0${d}` : `1${9e7 - Number(d.replace(/-/g, ''))}`; };
    const lista = [...encontrados].sort((a, b) => orden(a).localeCompare(orden(b)));
    const entendi = interp.entendidos.map(e => e.texto).join(', ');
    if (!lista.length) {
      return { texto: `Busqué ${entendi ? `(${entendi}) ` : ''}y no encontré viajes. 🤔 Revisa la ruta o la placa.`, acciones: [{ texto: 'Buscar en todos los viajes', tipo: 'buscar', valor: pregunta }], entendio: true, opciones: [] };
    }
    if (especifico) {
      const otros = lista.length - 1;
      return {
        texto: (sinFecha ? 'Ese día no tiene viaje; el más cercano: e' + contarViaje(lista[0], S, hoy).slice(1) : contarViaje(lista[0], S, hoy))
          + (otros ? ` Tiene ${otros} viaje${otros === 1 ? '' : 's'} más con esos datos.` : ''),
        acciones: [{ texto: 'Ver el viaje', tipo: 'viaje', valor: String(lista[0].id) }, ...(otros ? [{ texto: `Ver los ${lista.length}`, tipo: 'buscar' as TipoAccion, valor: pregunta }] : [])],
        entendio: true, opciones: []
      };
    }
    return {
      texto: `${interp.pregunta === 'contar' ? 'Hay' : 'Encontré'} ${lista.length} viaje${lista.length === 1 ? '' : 's'}${entendi ? ` (${entendi})` : ''}. 🚚`,
      acciones: [{ texto: 'Ver la lista', tipo: 'buscar', valor: pregunta }], entendio: true, opciones: []
    };
  }

  // 3. Cómo hacer algo / dónde está algo.
  if (temaClaro) return respuestaTema();

  // 4. No está claro: pregunta "¿te refieres a…?" (lo que escoja, lo aprende).
  const opciones = (puntuados.length ? puntuados.map(x => x.t) : TEMAS.filter(t => t.clave.startsWith('t:'))).slice(0, 3);
  return {
    texto: puntuados.length ? '¿Te refieres a alguna de estas? Si escoges una, me la aprendo. 🧠' : 'Uy, esa no me la sé todavía. 🤔 ¿Es alguna de estas? Si escoges una, me la aprendo.',
    acciones: [{ texto: 'Buscarlo en los viajes', tipo: 'buscar', valor: pregunta }], entendio: false, opciones
  };
}

/** Preguntas de ejemplo para quien no sabe qué preguntar. */
export const EJEMPLOS = [
  '¿Cuántos viajes salen mañana?',
  '¿Cómo agrego un viaje extra?',
  '¿Dónde veo los comparendos?',
  '¿Qué viajes tiene Polar esta semana?',
  ...EJEMPLOS_DATOS
];
