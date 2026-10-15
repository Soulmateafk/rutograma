/**
 * Conductores → "Viajes del mes": buscas un conductor, una placa o una
 * transportadora (Makand, Polar, Arsitrans) y salen los viajes del mes
 * activo separados por transportadora.
 * Un viaje es del conductor que tiene anotado; si no tiene, del titular de
 * la placa (igual que en el resto de la app, ver buscar-hablado.ts).
 */
import { conductorDelViaje, sinTildes, titularesPorPlaca } from './buscar-hablado';

export const TRANSPORTADORAS = ['Makand', 'Polar', 'Arsitrans'] as const;
export interface FilaViaje { id: string; fecha: string; dia: number; ruta: string; destino: string; cliente: string; placa: string; conductor: string; estado: string; cajas: number; tr: string; }
export interface GrupoViajes { tr: string; viajes: FilaViaje[]; conductores: number; cajas: number; }
export interface ResultadoViajes { grupos: GrupoViajes[]; total: number; buscaTr: string | null; }

const pegada = (t: string) => sinTildes(t).replace(/[^a-z0-9]/g, '');

/** La transportadora de un viaje, con el nombre bonito (Makand, Polar, Arsitrans u otra). */
export function transportadoraDe(v: any): string {
  const t = sinTildes(v?.tr || v?.transportadora || '');
  if (t.includes('polar')) return 'Polar';
  if (t.includes('arsi')) return 'Arsitrans';
  if (t.includes('makand') || !t) return 'Makand';
  return String(v.tr || v.transportadora);
}

/** Todos los viajes del mes (mes 0-11), listos para mostrar. */
export function viajesDelMes(S: any, anio: number, mes: number): FilaViaje[] {
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const titular = titularesPorPlaca(S);
  return ((S?.viajes || []) as any[])
    .filter(v => String(v.fecha || '').startsWith(prefijo))
    .map(v => ({
      id: String(v.id), fecha: String(v.fecha).slice(0, 10), dia: Number(String(v.fecha).slice(8, 10)),
      ruta: v.codigo || v.ruta || '', destino: v.destino || '', cliente: v.cliente || '', placa: v.p || v.placa || '',
      conductor: conductorDelViaje(v, titular) || '', estado: v.estado || '', cajas: Number(v.cajas) || 0, tr: transportadoraDe(v)
    }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.placa.localeCompare(b.placa));
}

/**
 * Busca en los viajes del mes. "makand"/"polar"/"arsitrans" filtran por
 * transportadora; lo demás se busca en el conductor y en la placa (todas las
 * palabras deben estar: "orlando moya" o "lun 428").
 */
export function buscarViajesDelMes(filas: FilaViaje[], texto: string, trElegida = ''): ResultadoViajes {
  let palabras = sinTildes(texto).split(/\s+/).filter(Boolean);
  let buscaTr: string | null = trElegida || null;
  // "POLAR 1" es una placa, no la transportadora Polar.
  const todo = pegada(texto);
  const esPlaca = todo.length >= 3 && filas.some(f => pegada(f.placa).includes(todo));
  for (const tr of esPlaca ? [] : TRANSPORTADORAS) {
    const clave = sinTildes(tr).slice(0, 4);
    if (palabras.some(p => p.length >= 4 && (p.startsWith(clave) || clave.startsWith(p)))) {
      buscaTr = tr;
      palabras = palabras.filter(p => !(p.length >= 4 && (p.startsWith(clave) || clave.startsWith(p))));
    }
  }
  const buscado = pegada(palabras.join(' '));
  const coincide = (f: FilaViaje) => {
    if (buscaTr && f.tr !== buscaTr) return false;
    if (!palabras.length) return true;
    const cond = sinTildes(f.conductor);
    return palabras.every(p => cond.includes(p)) || (buscado.length >= 3 && pegada(f.placa).includes(buscado));
  };
  const encontradas = filas.filter(coincide);
  const orden = [...TRANSPORTADORAS, ...new Set(encontradas.map(f => f.tr).filter(t => !(TRANSPORTADORAS as readonly string[]).includes(t)))];
  const grupos = orden
    .map(tr => {
      const viajes = encontradas.filter(f => f.tr === tr);
      return { tr, viajes, conductores: new Set(viajes.map(v => v.conductor).filter(Boolean)).size, cajas: viajes.reduce((s, v) => s + v.cajas, 0) };
    })
    .filter(g => g.viajes.length);
  return { grupos, total: encontradas.length, buscaTr };
}
