// ============================================================
// PERFIL DEL CONDUCTOR — todo lo de un conductor en un vistazo: rutas,
// destinos y clientes que más conoce, vehículos que ha manejado, viajes
// por mes, calidad (novedades, comparendos, quejas) y próximos viajes.
// Sirve para asignar al que conoce el camino. Funciones puras.
// El conductor de un viaje es el anotado o, si no hay, el titular del vehículo.
// ============================================================

import { titularesPorPlaca, conductorDelViaje, sinTildes } from './buscar-hablado';
import { fechaDeTexto } from './presentacion';

export interface Conteo { nombre: string; n: number; ultima: string; }
export interface PerfilConductor {
  conductor: any | null; nombre: string;
  total: number; esteMes: number; entregados: number; cancelados: number; diasEnRuta: number;
  primerViaje: string; ultimoViaje: string;
  rutas: Conteo[]; destinos: Conteo[]; clientes: Conteo[]; vehiculos: Conteo[];
  porMes: Array<{ etiqueta: string; n: number }>;
  proximos: any[]; recientes: any[];
  novedades: any[]; comparendos: any[]; quejas: any[]; valorComparendos: number;
  idealPara: string[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const mismo = (a: any, b: any) => sinTildes(a).replace(/\s+/g, ' ').trim() === sinTildes(b).replace(/\s+/g, ' ').trim();

function contar(lista: any[], clave: (v: any) => string): Conteo[] {
  const m = new Map<string, Conteo>();
  lista.forEach(v => {
    const k = String(clave(v) || '').trim(); if (!k || k === 'No definido') return;
    const f = String(v.fecha || '').slice(0, 10);
    const c = m.get(k) || { nombre: k, n: 0, ultima: '' };
    c.n++; if (f > c.ultima) c.ultima = f; m.set(k, c);
  });
  return [...m.values()].sort((a, b) => b.n - a.n || b.ultima.localeCompare(a.ultima));
}

export function perfilConductor(S: any, nombre: string, hoy: Date = new Date()): PerfilConductor {
  const conductor = (S?.conductores || []).find((c: any) => mismo(c.nom || c.nombre, nombre)) || null;
  const nom = String(conductor?.nom || conductor?.nombre || nombre);
  const titular = titularesPorPlaca(S);
  const hoyIso = iso(hoy), mes = hoyIso.slice(0, 7);
  const suyos = (S?.viajes || []).filter((v: any) => /^\d{4}-\d{2}-\d{2}/.test(String(v.fecha || '')) && mismo(conductorDelViaje(v, titular), nom))
    .sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)));
  const activos = suyos.filter((v: any) => v.estado !== 'Cancelado');
  const hechos = activos.filter((v: any) => String(v.fecha).slice(0, 10) <= hoyIso);

  const porMes: Array<{ etiqueta: string; n: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1); const k = iso(d).slice(0, 7);
    porMes.push({ etiqueta: `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, n: activos.filter((v: any) => String(v.fecha).startsWith(k)).length });
  }
  const diasDe = (v: any) => { const s = Number(v.salida ?? v.dia), r = Number(v.retorno); return r > s ? r - s : 1; };
  const destinos = contar(hechos, (v: any) => String(v.destinoReal || v.destino || '').split('/')[0]);
  const delConductor = (x: any) => mismo(x?.conductor || x?.cond || '', nom);
  const comparendos = (S?.comparendos || []).filter(delConductor);
  return {
    conductor, nombre: nom,
    total: activos.length, esteMes: activos.filter((v: any) => String(v.fecha).startsWith(mes)).length,
    entregados: activos.filter((v: any) => v.estado === 'Entregado').length, cancelados: suyos.length - activos.length,
    diasEnRuta: hechos.reduce((s: number, v: any) => s + diasDe(v), 0),
    primerViaje: activos[0] ? String(activos[0].fecha).slice(0, 10) : '', ultimoViaje: hechos.length ? String(hechos[hechos.length - 1].fecha).slice(0, 10) : '',
    rutas: contar(hechos, (v: any) => v.ruta || v.codigo), destinos, clientes: contar(hechos, (v: any) => String(v.cliente || v.cli || '').split(',')[0]),
    vehiculos: contar(activos, (v: any) => String(v.p || v.placa || '').toUpperCase()),
    porMes,
    proximos: activos.filter((v: any) => String(v.fecha).slice(0, 10) >= hoyIso).slice(0, 6),
    recientes: hechos.slice(-6).reverse(),
    novedades: (S?.novedades || []).filter((n: any) => sinTildes(`${n.titulo} ${n.desc || ''}`).includes(sinTildes(nom.split(' ').slice(0, 2).join(' '))))
      .sort((a: any, b: any) => fechaDeTexto(b.fecha).localeCompare(fechaDeTexto(a.fecha))),
    comparendos, valorComparendos: comparendos.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0),
    quejas: (S?.quejas || []).filter(delConductor),
    idealPara: destinos.filter(d => d.n >= 3).slice(0, 3).map(d => d.nombre)
  };
}
