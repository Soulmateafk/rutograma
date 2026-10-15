/**
 * Respuestas DIRECTAS del furgoncito con los datos de la app (no solo de
 * viajes): documentos y estado de los vehículos, conductores (licencia,
 * teléfono, descansos, qué vehículo manejan), pico y placa, mantenimiento,
 * vehículos libres, novedades, quejas, comparendos, tareas, aprobaciones,
 * rutas, quién va en ruta y los números del mes. Cada respuesta trae un
 * botón para ir a verlo. Si la pregunta no es de esto, devuelve null y
 * sigue el resto (viajes, guías, pantallas; ver mascota-respuestas.ts).
 */
import type { Respuesta, Accion } from './mascota-respuestas';
import { sinTildes, conductorDelViaje, titularesPorPlaca } from '../../services/buscar-hablado';

export interface Extra {
  /** Tareas del equipo (services/tareas.service.ts) y el correo de quien pregunta. */
  tareas?: Array<{ titulo: string; para: string; de: string; vence: string; hecha: boolean; prioridad: string }>;
  yo?: string;
  /** Cambios esperando aprobación (null = no se sabe). */
  pendientesAprobacion?: number | null;
  puedeAprobar?: boolean;
  /** Para "cuéntame un chiste". */
  chistes?: string[];
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CAP = MESES.map(m => m[0].toUpperCase() + m.slice(1));
const DIAS_CLAVE = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

const n = (t: any) => sinTildes(String(t ?? '')).replace(/[¿?¡!.,;:"']/g, ' ').replace(/\s+/g, ' ').trim();
const pegada = (t: any) => sinTildes(String(t ?? '')).replace(/[^a-z0-9]/g, '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumar = (d: Date, dias: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias);
const fechaLarga = (f: string) => { const d = new Date(f.slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }); };
const fechaCorta = (f: string) => { const d = new Date(f.slice(0, 10) + 'T00:00:00'); return isNaN(d.getTime()) ? f : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' }); };
const diasEntre = (desde: string, hasta: string) => Math.round((new Date(hasta + 'T00:00:00').getTime() - new Date(desde + 'T00:00:00').getTime()) / 86400000);
const plata = (v: number) => '$' + Math.round(v).toLocaleString('es-CO');
const titulo = (s: string) => String(s || '').toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase());
const tiene = (q: string, re: RegExp) => re.test(q);

/** "A, B, C y 4 más". */
function listar(items: string[], max = 6): string {
  if (!items.length) return '';
  if (items.length <= max) return items.length === 1 ? items[0] : `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
  return `${items.slice(0, max).join(', ')} y ${items.length - max} más`;
}

const ruta = (texto: string, valor: string, queryParams?: any): Accion => ({ texto, tipo: 'ruta', valor: queryParams ? `${valor}?${new URLSearchParams(queryParams).toString()}` : valor });
const resp = (texto: string, acciones: Accion[] = []): Respuesta => ({ texto, acciones, entendio: true, opciones: [] });

const esCupo = (p: string) => /^(arsitrans|polar)\s*\d+$/i.test(String(p || '').trim());
const placaDe = (v: any) => String(v?.p ?? v?.placa ?? '').toUpperCase().trim();
const nombreCond = (c: any) => String(c?.nom || c?.nombre || '').trim();

// ---------- Qué nombra la pregunta ----------

/** El vehículo nombrado (la placa más larga que aparezca: "LUN 428", "lun428", "POLAR 1"). */
function vehiculoNombrado(q: string, S: any): any | null {
  const qp = ` ${n(q)} `, qPeg = pegada(q);
  let mejor: any = null, largo = 0;
  for (const v of S?.vehiculos || []) {
    const p = placaDe(v);
    if (!p) continue;
    const peg = pegada(p);
    const conEspacio = ` ${n(p)} `;
    // "POLAR 1" no debe calzar dentro de "POLAR 10": se exige que no siga otro número.
    const ok = qp.includes(conEspacio) || (peg.length >= 5 && new RegExp(`${peg}(?![0-9])`).test(qPeg));
    if (ok && peg.length > largo) { mejor = v; largo = peg.length; }
  }
  return mejor;
}

/** El conductor nombrado (el que más palabras de su nombre tenga en la pregunta). */
function conductorNombrado(q: string, S: any): any | null {
  const palabras = new Set(n(q).split(' ').filter(w => w.length >= 4));
  const comunes = new Set(['conductor', 'conductores', 'vehiculo', 'placa', 'viaje', 'viajes', 'telefono', 'licencia', 'descanso', 'cuando', 'cuantos', 'cuantas', 'tiene', 'tienen', 'maneja', 'manejan', 'quien', 'donde', 'comparendos', 'multas', 'numero', 'celular', 'esta', 'semana']);
  let mejor: any = null, puntos = 0;
  for (const c of S?.conductores || []) {
    const partes = n(nombreCond(c)).split(' ').filter(w => w.length >= 3 && !comunes.has(w));
    const p = partes.filter(w => palabras.has(w)).length;
    if (p > puntos) { mejor = c; puntos = p; }
  }
  return mejor;
}

/** Código de ruta nombrado (BOG-CAL-D1, "bog cal d1"…). */
function rutaNombrada(q: string, S: any): any | null {
  const qPeg = pegada(q);
  let mejor: any = null, largo = 0;
  for (const r of S?.rutas || []) {
    const c = pegada(r.cod || r.codigo);
    if (c.length >= 5 && qPeg.includes(c) && c.length > largo) { mejor = r; largo = c.length; }
  }
  return mejor;
}

/** Cliente nombrado (de los que aparecen en viajes, rutas y quejas). */
function clienteNombrado(q: string, S: any): string {
  const qp = ` ${n(q)} `;
  const clientes = new Set<string>();
  (S?.viajes || []).forEach((v: any) => { if (v.cliente) clientes.add(String(v.cliente).trim()); });
  (S?.quejas || []).forEach((x: any) => { if (x.cliente) clientes.add(String(x.cliente).trim()); });
  let mejor = '';
  clientes.forEach(c => { const cn = n(c); if (cn.length >= 2 && qp.includes(` ${cn} `) && cn.length > mejor.length) mejor = c; });
  return mejor;
}

/** El día del que se pregunta (hoy si no dice): "mañana", "pasado mañana", "ayer", "el viernes", "el 20". */
function diaPreguntado(q: string, hoy: Date): { fecha: string; texto: string } {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (/pasado manana/.test(q)) return { fecha: iso(sumar(h, 2)), texto: 'pasado mañana' };
  if (/\bmanana\b/.test(q)) return { fecha: iso(sumar(h, 1)), texto: 'mañana' };
  if (/\bayer\b/.test(q)) return { fecha: iso(sumar(h, -1)), texto: 'ayer' };
  const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const i = dias.findIndex(d => new RegExp(`\\b${d}\\b`).test(q));
  if (i >= 0) { const f = sumar(h, (i - h.getDay() + 7) % 7); return { fecha: iso(f), texto: `el ${fechaLarga(iso(f))}` }; }
  const m = q.match(/\b(?:el|dia)\s+(\d{1,2})\b/);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 31) { const f = new Date(h.getFullYear(), h.getMonth(), Number(m[1])); return { fecha: iso(f), texto: `el ${fechaLarga(iso(f))}` }; }
  return { fecha: iso(h), texto: 'hoy' };
}

/** Mes del que se pregunta ("en septiembre", "el mes pasado"; si no, el actual). */
function mesPreguntado(q: string, hoy: Date): { anio: number; mes: number } {
  const i = MESES.findIndex(m => new RegExp(`\\b${m}\\b`).test(q));
  if (i >= 0) return { anio: i > hoy.getMonth() + 1 ? hoy.getFullYear() - 1 : hoy.getFullYear(), mes: i };
  if (/mes pasado/.test(q)) { const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); return { anio: d.getFullYear(), mes: d.getMonth() }; }
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() };
}

// ---------- Datos que se calculan ----------

/** ¿El vehículo está en mantenimiento ese día? */
function enMantenimiento(v: any, fecha: string): boolean {
  const est = n(v.est || v.estado);
  if (v.mantInicio && v.mantFin) return fecha >= String(v.mantInicio).slice(0, 10) && fecha <= String(v.mantFin).slice(0, 10);
  return est.includes('mant') || est.includes('taller');
}

/** ¿El viaje ocupa al vehículo ese día? (del día de salida al último día; el de retorno queda libre para salir) */
function ocupaElDia(v: any, fecha: string): boolean {
  if (!v?.fecha || ['Cancelado', 'Mantenimiento'].includes(v.estado)) return false;
  const salida = Number(v.salida || v.dia || 0), retorno = Number(v.retorno || 0);
  const dias = retorno > salida ? retorno - salida : 1;
  const desde = String(v.fecha).slice(0, 10);
  const hasta = iso(sumar(new Date(desde + 'T00:00:00'), dias - 1));
  return fecha >= desde && fecha <= hasta;
}

function estadoDoc(f: string | null | undefined, hoy: string): string {
  if (!f) return 'sin fecha registrada';
  const d = diasEntre(hoy, String(f).slice(0, 10));
  return d < 0 ? `VENCIDO desde el ${fechaCorta(f)} ⚠️` : d === 0 ? 'vence HOY ⚠️' : `vence el ${fechaCorta(f)} (en ${d} día${d === 1 ? '' : 's'})${d <= 30 ? ' ⚠️' : ''}`;
}

function descansosDelMes(c: any, anio: number, mes: number): number[] {
  const lista = String(c?.descansosPorMes?.[`${MESES_CAP[mes]}-${anio}`] || '');
  return lista.split(',').map(x => Number(x.trim())).filter(x => x > 0).sort((a, b) => a - b);
}

function picoDelDia(S: any, fecha: string): Array<{ placa: string; desde: string; hasta: string }> {
  const dia = DIAS_CLAVE[new Date(fecha + 'T00:00:00').getDay()];
  const out: Array<{ placa: string; desde: string; hasta: string }> = [];
  for (const r of S?.picoPlaca || []) {
    if (!(r.dias || []).includes(dia)) continue;
    const digitos = String(r.digitos || '').split(/[^0-9]+/).filter(Boolean);
    for (const v of S?.vehiculos || []) {
      const p = placaDe(v);
      if (p && !esCupo(p) && digitos.includes(p.replace(/\D/g, '').slice(-1)) && !out.some(x => x.placa === p)) out.push({ placa: p, desde: r.desde, hasta: r.hasta });
    }
  }
  return out;
}

function viajesDelMes(S: any, anio: number, mes: number): any[] {
  const pref = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  return (S?.viajes || []).filter((v: any) => String(v.fecha || '').startsWith(pref) && v.estado !== 'Cancelado');
}

function elQueMas(lista: string[]): [string, number] | null {
  const c = new Map<string, number>();
  lista.forEach(x => { if (x) c.set(x, (c.get(x) || 0) + 1); });
  let mejor: [string, number] | null = null;
  c.forEach((k, x) => { if (!mejor || k > mejor[1]) mejor = [x, k]; });
  return mejor;
}

// ---------- La respuesta ----------

export function responderDatos(pregunta: string, S: any, extra: Extra = {}, ahora = new Date()): Respuesta | null {
  const q = n(pregunta);
  if (!q) return null;
  const hoy = iso(ahora);
  const esComo = /\bcomo\b/.test(q) && !/\bcomo (va|van|esta|estan|vamos)\b/.test(q);
  const veh = vehiculoNombrado(q, S);
  const cond = conductorNombrado(q, S);
  const placa = veh ? placaDe(veh) : '';
  const nombre = cond ? nombreCond(cond) : '';

  // --- Charla ---
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|que mas|quiubo)\b/.test(q) && q.split(' ').length <= 4) return resp('¡Hola! 😄 Pregúntame lo que quieras de la operación: viajes, vehículos, conductores, pico y placa, tareas…');
  if (/^(gracias|muchas gracias|mil gracias|ok gracias|listo gracias)/.test(q)) return resp('¡Con gusto! Para eso estoy. 🚚💨');
  if (/chiste|algo gracioso|hazme reir|cuentame algo/.test(q) && extra.chistes?.length) return resp(extra.chistes[Math.floor(Math.random() * extra.chistes.length)]);
  if (/quien eres|como te llamas|que eres/.test(q)) return resp('Soy el furgoncito de MAKAND: un furgón refrigerado con carita. Te ayudo con la operación y de vez en cuando digo tonterías. 🚚');
  if (/que (dia|fecha) es hoy|a cuantos estamos|que hora es/.test(q)) return resp(`Hoy es ${fechaLarga(hoy)} y son las ${ahora.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })} 🕒`);

  if (esComo && !veh && !cond) return null; // "¿cómo hago…?" lo responden las guías

  // --- Aprobaciones ---
  if (/aprob/.test(q) && !/como/.test(q)) {
    const k = extra.pendientesAprobacion;
    const txt = k === null || k === undefined ? 'No pude contar los cambios ahora mismo; míralos en Aprobaciones.'
      : extra.puedeAprobar ? (k ? `Hay ${k} cambio${k === 1 ? '' : 's'} esperando tu aprobación. 📥` : 'No hay cambios esperando aprobación. ✅')
        : (k ? `Tienes ${k} cambio${k === 1 ? '' : 's'} esperando que el jefe los apruebe. ⏳` : 'No tienes cambios pendientes de aprobación. ✅');
    return resp(txt, [ruta('Ir a Aprobaciones', '/aprobaciones')]);
  }

  // --- Tareas ---
  if (/\btareas?\b|que tengo (que hacer|pendiente)|mis pendientes/.test(q)) {
    const yo = String(extra.yo || '').toLowerCase();
    const todas = (extra.tareas || []).filter(t => !t.hecha);
    const mias = todas.filter(t => String(t.para).toLowerCase() === yo);
    const lista = /equipo|todos|todas/.test(q) ? todas : mias;
    if (!lista.length) return resp(/equipo|todos|todas/.test(q) ? 'El equipo no tiene tareas pendientes. 🎉' : 'No tienes tareas pendientes. 🎉', [ruta('Ir a Tareas', '/tareas')]);
    const vencidas = lista.filter(t => t.vence && t.vence < hoy).length;
    const deHoy = lista.filter(t => t.vence === hoy).length;
    const extraTxt = [vencidas ? `${vencidas} vencida${vencidas === 1 ? '' : 's'} ⚠️` : '', deHoy ? `${deHoy} para hoy` : ''].filter(Boolean).join(' y ');
    return resp(`${/equipo|todos|todas/.test(q) ? 'El equipo tiene' : 'Tienes'} ${lista.length} tarea${lista.length === 1 ? '' : 's'} pendiente${lista.length === 1 ? '' : 's'}${extraTxt ? ` (${extraTxt})` : ''}: ${listar(lista.map(t => `"${t.titulo}"`), 4)}.`, [ruta('Ir a Tareas', '/tareas')]);
  }

  // --- Pico y placa ---
  if (/\bpico\b/.test(q)) {
    const escrita = q.match(/\b([a-z]{3})\s?-?(\d{3})\b/);
    if (!veh && escrita) return resp(`No encontré la placa ${escrita[1].toUpperCase()} ${escrita[2]} entre los vehículos. Revisa cómo la escribiste.`, [ruta('Ir a Vehículos', '/vehiculos')]);
    if (veh) {
      for (let i = 0; i <= 7; i++) {
        const f = iso(sumar(new Date(hoy + 'T00:00:00'), i));
        const r = picoDelDia(S, f).find(x => x.placa === placa);
        if (r) return resp(`${placa} tiene pico y placa ${i === 0 ? 'hoy' : i === 1 ? 'mañana' : `el ${fechaLarga(f)}`}, de ${r.desde} a ${r.hasta}. 🚫`, [ruta('Ver las reglas', '/reglas')]);
      }
      return resp(`${placa} no tiene pico y placa en los próximos 7 días. ✅`, [ruta('Ver las reglas', '/reglas')]);
    }
    const d = diaPreguntado(q, ahora);
    const lista = picoDelDia(S, d.fecha);
    if (!(S?.picoPlaca || []).length) return resp('Todavía no hay reglas de pico y placa configuradas.', [ruta('Ir a Reglas', '/reglas')]);
    return resp(lista.length ? `${titulo(d.texto)} tienen pico y placa: ${listar(lista.map(x => x.placa), 10)} (de ${lista[0].desde} a ${lista[0].hasta}). 🚫` : `${titulo(d.texto)} ningún vehículo tiene pico y placa. ✅`, [ruta('Ver las reglas', '/reglas')]);
  }

  // --- Documentos del vehículo (SOAT, tecnomecánica) ---
  if (/\bsoat\b|tecno|documento|papeles/.test(q)) {
    if (veh) return resp(`${placa} → SOAT: ${estadoDoc(veh.soatVence, hoy)}. Tecnomecánica: ${estadoDoc(veh.tecnoVence, hoy)}.`, [ruta('Ver la hoja de vida', `/hoja-de-vida/${encodeURIComponent(placa)}`)]);
    const malos: string[] = [];
    for (const v of S?.vehiculos || []) {
      const p = placaDe(v); if (!p || esCupo(p)) continue;
      for (const [doc, f] of [['SOAT', v.soatVence], ['tecno', v.tecnoVence]] as const) {
        if (f && diasEntre(hoy, String(f).slice(0, 10)) <= 30) malos.push(`${p} (${doc} ${diasEntre(hoy, String(f).slice(0, 10)) < 0 ? 'vencido' : 'el ' + fechaCorta(f)})`);
      }
    }
    return resp(malos.length ? `Documentos vencidos o por vencer (30 días): ${listar(malos, 8)}. 📄` : 'Ningún vehículo tiene SOAT ni tecnomecánica vencidos o por vencer en 30 días. ✅', [ruta('Ir a Vehículos', '/vehiculos')]);
  }

  // --- Licencia ---
  if (/licencia|pase de conduc/.test(q)) {
    if (cond) return resp(`Licencia de ${nombre}: ${estadoDoc(cond.licVence, hoy)}.`, [ruta('Ver su perfil', `/conductor/${encodeURIComponent(nombre)}`)]);
    const malos = (S?.conductores || []).filter((c: any) => c.licVence && diasEntre(hoy, String(c.licVence).slice(0, 10)) <= 30)
      .map((c: any) => `${nombreCond(c)} (${diasEntre(hoy, String(c.licVence).slice(0, 10)) < 0 ? 'vencida' : 'el ' + fechaCorta(c.licVence)})`);
    return resp(malos.length ? `Licencias vencidas o por vencer (30 días): ${listar(malos, 8)}. 🪪` : 'Ninguna licencia está vencida ni vence en los próximos 30 días. ✅', [ruta('Ir a Conductores', '/conductores')]);
  }

  // --- Teléfono ---
  if (/telefono|celular|numero de|whatsapp|llamar|contacto/.test(q) && cond) {
    const tel = String(cond.tel || cond.telefono || '').trim();
    return resp(tel ? `El teléfono de ${nombre} es ${tel}. 📞` : `${nombre} no tiene teléfono registrado.`, [ruta('Ver su perfil', `/conductor/${encodeURIComponent(nombre)}`)]);
  }

  // --- Descansos ---
  if (/descans/.test(q)) {
    if (cond) {
      const { anio, mes } = mesPreguntado(q, ahora);
      const dias = descansosDelMes(cond, anio, mes);
      return resp(dias.length ? `${nombre} descansa en ${MESES[mes]} los días ${listar(dias.map(String), 15)}. 😴` : `${nombre} no tiene descansos anotados en ${MESES[mes]}.`, [ruta('Ver su agenda', `/agenda/${encodeURIComponent(nombre)}`)]);
    }
    const d = diaPreguntado(q, ahora);
    const f = new Date(d.fecha + 'T00:00:00');
    const quienes = (S?.conductores || []).filter((c: any) => descansosDelMes(c, f.getFullYear(), f.getMonth()).includes(f.getDate())).map(nombreCond);
    return resp(quienes.length ? `${titulo(d.texto)} descansa${quienes.length === 1 ? '' : 'n'}: ${listar(quienes, 8)}. 😴` : `${titulo(d.texto)} no descansa nadie.`, [ruta('Ir a Conductores', '/conductores')]);
  }

  // --- Mantenimiento / taller ---
  if (/taller|mantenimiento|reparacion|en arreglo/.test(q) && !/mandar|mando|poner|meter/.test(q)) {
    if (veh) {
      const en = enMantenimiento(veh, hoy);
      const txt = en ? `${placa} está en mantenimiento${veh.mantInicio && veh.mantFin ? ` del ${fechaCorta(veh.mantInicio)} al ${fechaCorta(veh.mantFin)}` : ''}. 🔧`
        : veh.mantInicio && String(veh.mantInicio) > hoy ? `${placa} entra a mantenimiento el ${fechaCorta(veh.mantInicio)}.` : `${placa} no está en mantenimiento. ✅`;
      return resp(txt, [ruta('Ver la hoja de vida', `/hoja-de-vida/${encodeURIComponent(placa)}`)]);
    }
    const d = diaPreguntado(q, ahora);
    const lista = (S?.vehiculos || []).filter((v: any) => !esCupo(placaDe(v)) && enMantenimiento(v, d.fecha)).map(placaDe);
    return resp(lista.length ? `${titulo(d.texto)} están en mantenimiento: ${listar(lista, 10)}. 🔧` : `${titulo(d.texto)} ningún vehículo está en mantenimiento. ✅`, [ruta('Ir a Vehículos', '/vehiculos')]);
  }

  // --- Vehículos libres ---
  if (/\b(libres?|disponibles?|desocupad\w*|sin viajes?)\b/.test(q) && /vehicul|carro|camion|furgon|placa|flota|\blibres?\b|disponibles?/.test(q) && !/conductor/.test(q)) {
    const d = diaPreguntado(q, ahora);
    const propios = (S?.vehiculos || []).filter((v: any) => { const p = placaDe(v); return p && !esCupo(p) && String(v.categoria || 'Viajero') !== 'Urbano'; });
    const libres = propios.filter((v: any) => !enMantenimiento(v, d.fecha) && !(S?.viajes || []).some((x: any) => placaDe(x) === placaDe(v) && ocupaElDia(x, d.fecha))).map(placaDe);
    return resp(libres.length ? `${titulo(d.texto)} hay ${libres.length} vehículo${libres.length === 1 ? '' : 's'} libre${libres.length === 1 ? '' : 's'}: ${listar(libres, 10)}. 🚚` : `${titulo(d.texto)} no hay vehículos propios libres.`, [ruta('Ver el Rutograma', '/rutograma')]);
  }

  // --- En ruta ahora ---
  if (/en ruta|en camino|en carretera|quien(es)? (esta|estan|va|van) (de )?(viaje|ruta)|quien(es)? (ya )?salio|quien(es)? (ya )?salieron/.test(q) && !rutaNombrada(q, S)) {
    // Los que marcaron "Ya salí" y no han llegado, o los "En ruta" que siguen en camino hoy; uno por vehículo.
    const vistos = new Set<string>();
    const enRuta = (S?.viajes || [])
      .filter((v: any) => v.estado !== 'Cancelado' && ((v.salidaReal && !v.llegadaReal) || (v.estado === 'En ruta' && ocupaElDia(v, hoy))))
      .sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)))
      .filter((v: any) => { const p = placaDe(v); if (vistos.has(p)) return false; vistos.add(p); return true; });
    const tit = titularesPorPlaca(S);
    return resp(enRuta.length ? `Van en ruta ${enRuta.length} vehículo${enRuta.length === 1 ? '' : 's'}: ${listar(enRuta.map((v: any) => `${placaDe(v)} → ${v.destino || v.ruta}${conductorDelViaje(v, tit) ? ` (${conductorDelViaje(v, tit).split(' ').slice(-1)[0]})` : ''}`), 8)}. 🚚` : 'Ahora mismo nadie aparece en ruta.', [ruta('Ver el Rutograma', '/rutograma')]);
  }

  // --- Novedades ---
  if (/novedad|varad|accidente/.test(q) && !/registr|reportar|reporto|crear|nueva/.test(q)) {
    const lista = (S?.novedades || []).filter((x: any) => !x.resuelta);
    return resp(lista.length ? `Hay ${lista.length} novedad${lista.length === 1 ? '' : 'es'} sin resolver: ${listar([...new Set(lista.slice().reverse().map((x: any) => String(x.titulo || x.tipo || 'Sin título')))].slice(0, 4) as string[], 4)}. 📝` : 'No hay novedades sin resolver. ✅', [ruta('Ver en el Dashboard', '/dashboard')]);
  }

  // --- Quejas ---
  if (/queja|reclamo/.test(q)) {
    const cliente = clienteNombrado(q, S);
    const todas = (S?.quejas || []).filter((x: any) => !cliente || n(x.cliente) === n(cliente));
    const abiertas = todas.filter((x: any) => x.estado !== 'cerrada');
    if (!todas.length) return resp(cliente ? `${cliente} no tiene quejas registradas. ✅` : 'No hay quejas registradas. ✅', [ruta('Ir a Quejas', '/quejas')]);
    const ultima = [...todas].sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)))[0];
    return resp(`${cliente || 'En total hay'} ${cliente ? 'tiene ' : ''}${todas.length} queja${todas.length === 1 ? '' : 's'} (${abiertas.length} abierta${abiertas.length === 1 ? '' : 's'}). La última: "${ultima.tipo}" del ${fechaCorta(ultima.fecha)}${cliente ? '' : ` de ${ultima.cliente}`}.`, [ruta('Ir a Quejas', '/quejas')]);
  }

  // --- Comparendos ---
  if (/comparendo|multa/.test(q)) {
    const todas = (S?.comparendos || []).filter((x: any) => (!cond || n(x.conductor) === n(nombre)) && (!veh || pegada(x.placa) === pegada(placa)));
    const quien = cond ? nombre : veh ? placa : '';
    if (!todas.length) return resp(quien ? `${quien} no tiene comparendos registrados. ✅` : 'No hay comparendos registrados. ✅', [ruta('Ir a Comparendos', '/comparendos')]);
    const sinPagar = todas.filter((x: any) => !x.pagado);
    const total = sinPagar.reduce((s: number, x: any) => s + (Number(x.valor) || 0), 0);
    return resp(`${quien || 'En total hay'} ${quien ? 'tiene ' : ''}${todas.length} comparendo${todas.length === 1 ? '' : 's'}; ${sinPagar.length} sin pagar${total ? ` por ${plata(total)}` : ''}. 🚓`, [ruta('Ir a Comparendos', '/comparendos')]);
  }

  // --- Rutas ---
  const r = rutaNombrada(q, S);
  if (r && /dura|dias|tarifa|precio|cuesta|cuanto vale|km|kilometr|distancia|destino|cliente|info|datos|cuentame/.test(q) && !/\bviajes?\b/.test(q)) {
    const cod = r.cod || r.codigo;
    const tarifas = [r.tarifaMakand && `Makand ${plata(r.tarifaMakand)}`, (r.tarifaArsitrans || r.tarifaArsitran) && `Arsitrans ${plata(r.tarifaArsitrans || r.tarifaArsitran)}`, r.tarifaPolar && `Polar ${plata(r.tarifaPolar)}`].filter(Boolean);
    return resp(`${cod} va a ${r.dest || r.destino}${r.km ? ` (${r.km} km)` : ''}: ${r.diasTrans || 1} día${Number(r.diasTrans || 1) === 1 ? '' : 's'} en tránsito${Number(r.diasDesc) ? ` + ${r.diasDesc} de retorno` : ''}.${r.clientes ? ` Clientes: ${r.clientes}.` : ''}${tarifas.length ? ` Tarifas: ${tarifas.join(', ')}.` : ''}`, [ruta('Ver la ruta', '/rutas', { buscarCod: cod })]);
  }
  if (/que rutas|rutas (van|para|hacia|a )/.test(q)) {
    const destinos = (S?.rutas || []).filter((x: any) => { const d = n(x.dest || x.destino); return d && ` ${q} `.includes(` ${d.split(/[ /]/)[0]} `); });
    if (destinos.length) return resp(`Rutas a ${destinos[0].dest || destinos[0].destino}: ${listar(destinos.map((x: any) => x.cod || x.codigo), 10)}.`, [ruta('Ir a Rutas', '/rutas')]);
  }

  // --- Quién maneja / qué vehículo maneja ---
  if (veh && /quien|conductor|maneja|titular|chofer|lleva/.test(q) && !rutaNombrada(q, S) && !/\bviajes?\b/.test(q)) {
    const c = String(veh.cond || veh.conductor || '').trim();
    const sinCond = !c || /^sin /i.test(c);
    return resp(sinCond ? `${placa} no tiene conductor titular asignado.` : `El titular de ${placa} es ${c}. 👤`, sinCond ? [ruta('Ir a Vehículos', '/vehiculos', { buscarPlaca: placa })] : [ruta('Ver su perfil', `/conductor/${encodeURIComponent(c)}`)]);
  }
  if (cond && !veh && /vehiculo|placa|carro|camion|furgon|que maneja/.test(q) && !/\bviajes?\b/.test(q)) {
    const p = String(cond.veh || cond.placa || '').trim();
    return resp(p ? `${nombre} maneja ${p}. 🚚` : `${nombre} no tiene vehículo asignado.`, p ? [ruta('Ver la hoja de vida', `/hoja-de-vida/${encodeURIComponent(p)}`)] : [ruta('Ver su perfil', `/conductor/${encodeURIComponent(nombre)}`)]);
  }

  // --- Números del mes ---
  if (/cajas/.test(q) && /(cuantas|total|movimos|mes|llevamos|van)/.test(q) && !veh && !cond) {
    const { anio, mes } = mesPreguntado(q, ahora);
    const lista = viajesDelMes(S, anio, mes);
    const cajas = lista.reduce((s: number, v: any) => s + (Number(v.cajas) || 0), 0);
    return resp(`En ${MESES[mes]} ${anio} van ${cajas.toLocaleString('es-CO')} cajas en ${lista.length} viajes. 📦`, [ruta('Ver el Comparativo', '/comparativo')]);
  }
  const top = q.match(/(cliente|destino|vehiculo|placa|conductor|ruta)\w* (?:\w+ )?(con mas|que mas|mas)\b/) || q.match(/(quien) (viaja|tiene|hace) mas/);
  if (top) {
    const { anio, mes } = mesPreguntado(q, ahora);
    const lista = viajesDelMes(S, anio, mes);
    const tit = titularesPorPlaca(S);
    const tipo = top[1] === 'quien' || top[1] === 'que' ? 'conductor' : top[1].startsWith('placa') ? 'vehiculo' : top[1];
    const valor = (v: any) => tipo === 'cliente' ? String(v.cliente || '') : tipo === 'destino' ? titulo(v.destino || '') : tipo === 'ruta' ? String(v.codigo || v.ruta || '') : tipo === 'conductor' ? conductorDelViaje(v, tit) : placaDe(v);
    const m = elQueMas(lista.map(valor).filter(Boolean));
    const nombreTipo: Record<string, string> = { cliente: 'El cliente con más viajes', destino: 'El destino con más viajes', ruta: 'La ruta más usada', conductor: 'Quien más viaja', vehiculo: 'El vehículo con más viajes' };
    return resp(m ? `${nombreTipo[tipo]} en ${MESES[mes]}: ${m[0]}, con ${m[1]} viajes. 🏆` : `No hay viajes en ${MESES[mes]} para contar.`, [ruta('Ver el Comparativo', '/comparativo')]);
  }
  const cuantos = q.match(/cuant[oa]s (vehiculos|carros|camiones|conductores|rutas|clientes)\b/);
  if (cuantos && !/viaje/.test(q)) {
    const t = cuantos[1];
    if (/vehiculos|carros|camiones/.test(t)) { const v = (S?.vehiculos || []).filter((x: any) => !esCupo(placaDe(x))); const porTr = elQueMas(v.map((x: any) => String(x.tr || 'Makand'))); return resp(`Hay ${v.length} vehículos registrados${porTr ? ` (la mayoría de ${porTr[0]})` : ''}. 🚛`, [ruta('Ir a Vehículos', '/vehiculos')]); }
    if (t === 'conductores') return resp(`Hay ${(S?.conductores || []).length} conductores registrados. 👷`, [ruta('Ir a Conductores', '/conductores')]);
    if (t === 'rutas') return resp(`Hay ${(S?.rutas || []).length} rutas registradas. 🛣️`, [ruta('Ir a Rutas', '/rutas')]);
    const clientes = new Set((S?.viajes || []).map((v: any) => String(v.cliente || '').trim()).filter(Boolean));
    return resp(`Hay ${clientes.size} clientes con viajes: ${listar([...clientes] as string[], 8)}.`, [ruta('Ver el Comparativo', '/comparativo')]);
  }

  // --- Ficha de un conductor o de un vehículo ("cuéntame de…", "info de…") ---
  if (cond && !veh && /cuentame|info|datos|quien es|perfil|como va|como esta/.test(q)) {
    const { anio, mes } = { anio: ahora.getFullYear(), mes: ahora.getMonth() };
    const tit = titularesPorPlaca(S);
    const suyos = viajesDelMes(S, anio, mes).filter((v: any) => n(conductorDelViaje(v, tit)) === n(nombre));
    return resp(`${nombre}: maneja ${cond.veh || cond.placa || 'sin vehículo'}, ${suyos.length} viaje${suyos.length === 1 ? '' : 's'} en ${MESES[mes]}. Licencia ${estadoDoc(cond.licVence, hoy)}.${cond.tel || cond.telefono ? ` Tel: ${cond.tel || cond.telefono}.` : ''}`, [ruta('Ver su perfil', `/conductor/${encodeURIComponent(nombre)}`)]);
  }
  if (veh && /cuentame|info|datos|hoja de vida|como esta|estado del|estado de/.test(q) && !/\bviajes?\b/.test(q)) {
    const suyos = viajesDelMes(S, ahora.getFullYear(), ahora.getMonth()).filter((v: any) => placaDe(v) === placa);
    return resp(`${placa} (${veh.tipo || 'vehículo'}, ${veh.tr || 'Makand'}): titular ${veh.cond || 'sin asignar'}, ${enMantenimiento(veh, hoy) ? 'en mantenimiento 🔧' : 'disponible'}, ${suyos.length} viajes en ${MESES[ahora.getMonth()]}. SOAT ${estadoDoc(veh.soatVence, hoy)}.`, [ruta('Ver la hoja de vida', `/hoja-de-vida/${encodeURIComponent(placa)}`)]);
  }

  return null;
}

/** Ejemplos para las sugerencias (se rotan). */
export const EJEMPLOS_DATOS = [
  '¿Qué vehículos están libres mañana?',
  '¿Quién tiene pico y placa hoy?',
  '¿Qué documentos están por vencer?',
  '¿Quién descansa hoy?',
  '¿Quién va en ruta?',
  '¿Qué tareas tengo?',
  '¿Cuántas cajas llevamos este mes?',
  '¿Qué cliente tiene más viajes?'
];
