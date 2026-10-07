// ============================================================
// REVISIÓN DE VIAJES — dos cosas que se revisan al asignar un viaje:
//  1. Documentos vencidos: el vehículo no puede salir con el SOAT o la
//     tecnomecánica vencidos, ni el conductor con la licencia vencida,
//     en algún día del viaje (de la salida al último día ocupado).
//  2. Choques de agenda: el mismo vehículo o el mismo conductor en dos
//     viajes que se cruzan (un viaje que sale el día en que el otro ya
//     regresó, "retorno", NO choca).
// Las filas de cupo (ARSITRANS 1, POLAR 2...) no son vehículos reales y
// no se revisan. Un viaje es del conductor anotado; si no tiene, del
// titular de la placa. Funciones puras.
// Rendimiento: el Rutograma revisa el mes entero (cientos de viajes contra
// más de mil). Por eso cada viaje se "prepara" UNA vez (fechas, placa,
// conductor) y solo se comparan los viajes de la misma placa o del mismo
// conductor — antes se comparaba todo contra todo y tardaba ~0,5 s.
// Espejo de backend/revision-viajes.js (el servidor es el que manda).
// ============================================================

import { reglasIncumplidas } from './reglas-asignacion';

function sumarDiasFecha(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diasOcupadoViaje(v: any): number {
  const salida = Number(v.salida || v.dia || 0);
  const retorno = Number(v.retorno || 0);
  return retorno > salida ? retorno - salida : 1;
}

export interface Choque { viaje: any; por: 'vehículo' | 'conductor'; texto: string; }
export interface ProblemaViaje { viaje: any; vencidos: string[]; choques: Choque[]; reglas: string[]; }
interface Quien { clave: string; nombre: string; titular: boolean; }
interface Indice { porNombre: Map<string, any>; porPlaca: Map<string, any>; }
interface Preparado { v: any; rango: { desde: string; hasta: string }; placa: string; clavePlaca: string; quien: Quien | null; }
interface Grupos { porPlaca: Map<string, Preparado[]>; porConductor: Map<string, Preparado[]>; }

const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
const ESTADOS_SIN_VIAJE = ['Cancelado', 'Mantenimiento'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const limpiar = (t: any): string => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const esPlacaCupo = (p: any): boolean => /^(ARSITRANS|POLAR)\s*\d+$/i.test(String(p || '').trim());
const placaDe = (v: any): string => String(v.p ?? v.placa ?? '').toUpperCase().trim();

/** Días que ocupa el viaje: { desde, hasta } ('hasta' = día en que ya está libre). */
export function rangoViaje(v: any): { desde: string; hasta: string } | null {
  if (!FECHA.test(String(v.fecha || ''))) return null;
  return { desde: v.fecha, hasta: sumarDiasFecha(v.fecha, Math.max(1, diasOcupadoViaje(v))) };
}

const seCruzan = (a: { desde: string; hasta: string }, b: { desde: string; hasta: string }): boolean => a.desde < b.hasta && b.desde < a.hasta;

/** ¿Este viaje cuenta? (no cancelado, con fecha, no es mantenimiento) */
const cuenta = (v: any): boolean => v && !ESTADOS_SIN_VIAJE.includes(v.estado) && !!rangoViaje(v);

/** Conductores por nombre y por placa, para no buscarlos uno por uno. */
function indiceConductores(conductores: any[]): Indice {
  const porNombre = new Map<string, any>(), porPlaca = new Map<string, any>();
  (conductores || []).forEach((c: any) => {
    const nombre = limpiar(c.nom ?? c.nombre);
    if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, c);
    const placa = pegada(c.veh ?? c.placa);
    if (placa && !porPlaca.has(placa)) porPlaca.set(placa, c);
  });
  return { porNombre, porPlaca };
}

function quienHace(v: any, indice: Indice): Quien | null {
  const anotado = limpiar(v.cond ?? v.conductor);
  if (!SIN_CONDUCTOR.includes(anotado)) {
    const c = indice.porNombre.get(anotado);
    return { clave: anotado, nombre: String(c?.nom ?? c?.nombre ?? v.cond ?? v.conductor).trim(), titular: false };
  }
  const placa = pegada(placaDe(v));
  const titular = placa ? indice.porPlaca.get(placa) : null;
  return titular ? { clave: limpiar(titular.nom ?? titular.nombre), nombre: String(titular.nom ?? titular.nombre).trim(), titular: true } : null;
}

/** Quién hace el viaje: clave para comparar, nombre para mostrar y si es por ser titular de la placa. */
export function conductorDelViaje(v: any, conductores: any[]): Quien | null {
  return quienHace(v, indiceConductores(conductores));
}

const fechaBonita = (f: string): string => { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; };

/**
 * Documentos vencidos en algún día del viaje. Devuelve una lista de textos
 * (vacía = todo al día). data: { vehiculos, conductores }.
 */
export function documentosVencidos(v: any, data: any, indice: Indice = indiceConductores(data.conductores)): string[] {
  const rango = rangoViaje(v);
  if (!rango || ESTADOS_SIN_VIAJE.includes(v.estado)) return [];
  const ultimoDia = sumarDiasFecha(rango.hasta, -1);
  const faltas: string[] = [];
  const placa = placaDe(v);
  if (placa && !esPlacaCupo(placa)) {
    const vehiculo = (data.vehiculos || []).find((x: any) => pegada(x.p ?? x.placa) === pegada(placa));
    if (vehiculo) {
      [['soatVence', 'el SOAT'], ['tecnoVence', 'la tecnomecánica']].forEach(([campo, nombre]) => {
        const vence = String((vehiculo as any)[campo] || '').trim();
        if (FECHA.test(vence) && vence < ultimoDia) faltas.push(`${placa}: ${nombre} venció o vence el ${fechaBonita(vence)}`);
      });
    }
  }
  const quien = quienHace(v, indice);
  if (quien) {
    const conductor = indice.porNombre.get(quien.clave);
    const vence = String(conductor?.licVence || '').trim();
    if (conductor && FECHA.test(vence) && vence < ultimoDia) {
      faltas.push(`${String(conductor.nom ?? conductor.nombre).trim()}: la licencia venció o vence el ${fechaBonita(vence)}`);
    }
  }
  return faltas;
}

/** Lo que hace falta de cada viaje para compararlo (se calcula una vez). */
function preparar(v: any, indice: Indice): Preparado | null {
  if (!cuenta(v)) return null;
  const placa = placaDe(v);
  return { v, rango: rangoViaje(v)!, placa, clavePlaca: esPlacaCupo(placa) ? '' : pegada(placa), quien: quienHace(v, indice) };
}

function choquesEntre(a: Preparado, candidatos: Preparado[]): Choque[] {
  const choques: Choque[] = [];
  const vistos = new Set<Preparado>();
  candidatos.forEach(b => {
    if (!b || b === a || vistos.has(b)) return;
    vistos.add(b);
    const o = b.v;
    if (a.v.id !== undefined && a.v.id !== null && o.id === a.v.id) return;
    if (!seCruzan(a.rango, b.rango)) return;
    const nombreRuta = `${o.ruta || o.codigo || ''} del ${fechaBonita(o.fecha)}`.trim();
    if (a.clavePlaca && b.clavePlaca === a.clavePlaca) {
      choques.push({ viaje: o, por: 'vehículo', texto: `${a.placa} ya tiene el viaje ${nombreRuta}` });
      return;
    }
    const quien = a.quien, otro = b.quien;
    if (!quien || !otro || otro.clave !== quien.clave) return;
    const texto = quien.titular
      ? `${a.placa} no tiene conductor anotado y su titular, ${quien.nombre}, va en ${b.placa} (viaje ${nombreRuta})`
      : otro.titular
        ? `${quien.nombre} es el titular de ${b.placa}, que tiene el viaje ${nombreRuta} sin conductor anotado`
        : `${quien.nombre} ya tiene el viaje ${nombreRuta} (en ${b.placa})`;
    choques.push({ viaje: o, por: 'conductor', texto });
  });
  return choques;
}

/** Agrupa los viajes preparados por placa y por conductor. */
function agrupar(preparados: (Preparado | null)[]): Grupos {
  const porPlaca = new Map<string, Preparado[]>(), porConductor = new Map<string, Preparado[]>();
  const meter = (mapa: Map<string, Preparado[]>, clave: string | undefined, p: Preparado) => { if (!clave) return; const l = mapa.get(clave); if (l) l.push(p); else mapa.set(clave, [p]); };
  preparados.forEach(p => { if (!p) return; meter(porPlaca, p.clavePlaca, p); meter(porConductor, p.quien?.clave, p); });
  return { porPlaca, porConductor };
}

const candidatosDe = (a: Preparado, grupos: Grupos): Preparado[] => [...(grupos.porPlaca.get(a.clavePlaca) || []), ...(a.quien ? grupos.porConductor.get(a.quien.clave) || [] : [])];

/**
 * Otros viajes que se cruzan con este: mismo vehículo o mismo conductor.
 * Devuelve [{ viaje, por: 'vehículo' | 'conductor', texto }].
 */
export function choquesDeAgenda(v: any, viajes: any[], conductores: any[]): Choque[] {
  const indice = indiceConductores(conductores);
  const a = preparar(v, indice);
  if (!a) return [];
  const otros = (viajes || []).filter((o: any) => o !== v).map((o: any) => preparar(o, indice));
  return choquesEntre(a, candidatosDe(a, agrupar(otros)));
}

/**
 * Todos los problemas de los viajes de un mes ('AAAA-MM'), para el aviso
 * del Rutograma: [{ viaje, vencidos: [...], choques: [...], reglas: [...] }]
 * (reglas: las de cliente/ruta y pico y placa, ver reglas-asignacion.ts).
 */
export function revisarMes(data: any, prefijoMes: string): ProblemaViaje[] {
  const indice = indiceConductores(data.conductores);
  const preparados: (Preparado | null)[] = (data.viajes || []).map((v: any) => preparar(v, indice));
  const grupos = agrupar(preparados);
  return preparados
    .filter((p): p is Preparado => !!p && String(p.v.fecha).startsWith(prefijoMes))
    .map(p => ({ viaje: p.v, vencidos: documentosVencidos(p.v, data, indice), choques: choquesEntre(p, candidatosDe(p, grupos)), reglas: reglasIncumplidas(p.v, data) }))
    .filter(x => x.vencidos.length || x.choques.length || x.reglas.length)
    .sort((a, b) => String(a.viaje.fecha).localeCompare(String(b.viaje.fecha)));
}

/** Un dato que ya tenía valor y cambió. Llenar uno que estaba vacío no cuenta:
 * la pantalla de edición rellena sola la hora o el cliente de la ruta. */
const VACIOS = ['', '--:--', 'NO DEFINIDO'];
const cambioDeDato = (antes: any, despues: any): boolean => {
  const a = limpiar(antes), d = limpiar(despues);
  return !VACIOS.includes(a) && a !== d;
};

/**
 * ¿Cambió algo que obliga a revisar? (nuevo, o cambió vehículo, conductor,
 * fechas, ruta, hora o cliente — estos tres por las reglas de la oficina). Así marcar Entregado o cancelar un viaje viejo nunca se frena.
 */
export function cambioLoQueSeRevisa(previo: any, nuevo: any): boolean {
  if (!previo) return true;
  return pegada(placaDe(previo)) !== pegada(placaDe(nuevo))
    || limpiar(previo.cond) !== limpiar(nuevo.cond)
    || previo.fecha !== nuevo.fecha
    || Number(previo.salida || 0) !== Number(nuevo.salida || 0)
    || Number(previo.retorno || 0) !== Number(nuevo.retorno || 0)
    || limpiar(previo.ruta || previo.codigo) !== limpiar(nuevo.ruta || nuevo.codigo)
    || cambioDeDato(previo.hora, nuevo.hora)
    || cambioDeDato(previo.cliente || previo.cli, nuevo.cliente || nuevo.cli)
    || (ESTADOS_SIN_VIAJE.includes(previo.estado) && !ESTADOS_SIN_VIAJE.includes(nuevo.estado));
}

