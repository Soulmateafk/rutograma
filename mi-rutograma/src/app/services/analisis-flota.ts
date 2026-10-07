// ============================================================
// ANÁLISIS DE LA FLOTA — tres miradas, funciones puras:
//  1. Capacidad de los próximos días: viajes que ocupan cada día frente a
//     vehículos propios operativos (sin mantenimiento). "Faltan 2" = esos
//     viajes van en terceros o hay que conseguir cupo.
//  2. Ocupación de carga: cajas de cada viaje frente a la capacidad del
//     vehículo, en promedio por vehículo en el mes.
//  3. Duración real de las rutas: con "Ya salí / Ya llegué", cuánto tarda
//     de verdad cada ruta frente a los días en tránsito programados.
// ============================================================

import { esPlacaCupo } from './revision-viajes';
import { mantenimientoQueChoca, rangosMantenimiento } from './mantenimiento';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const aTexto = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaLocal = (f: string): Date => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };

function diasOcupado(v: any): number {
  const salida = Number(v.salida || v.dia || 0);
  const retorno = Number(v.retorno || 0);
  return retorno > salida ? retorno - salida : 1;
}

/** Vehículos propios que salen a viaje (no cupos de terceros, no urbanos). */
export function vehiculosPropios(S: any): any[] {
  return (S?.vehiculos || []).filter((v: any) => {
    const placa = String(v.p || v.placa || '').trim();
    const tr = String(v.tr || v.transportadora || 'Makand').toLowerCase();
    return placa && !esPlacaCupo(placa) && !tr.includes('arsitran') && !tr.includes('polar')
      && String(v.categoria || 'Viajero').trim() !== 'Urbano';
  });
}

export interface DiaCapacidad {
  fecha: string;
  nombre: string;
  viajes: number;
  enPropios: number;
  enTerceros: number;
  operativos: number;
  libres: number;
  faltan: number;
}

/** Los próximos `n` días desde `hoy`. */
export function capacidadProximosDias(S: any, hoy: Date, n = 7): DiaCapacidad[] {
  const propios = vehiculosPropios(S);
  const placasPropias = new Set(propios.map((v: any) => pegada(v.p || v.placa)));
  const viajes = (S?.viajes || []).filter((v: any) => v.fecha && !['Cancelado', 'Mantenimiento'].includes(v.estado));
  const dias: DiaCapacidad[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + i);
    const fecha = aTexto(d);
    const delDia = viajes.filter((v: any) => {
      const inicio = fechaLocal(v.fecha);
      const fin = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + diasOcupado(v));
      return inicio <= d && d < fin;
    });
    const ocupadas = new Set(delDia.map((v: any) => pegada(v.p ?? v.placa)).filter((p: string) => placasPropias.has(p)));
    const operativos = propios.filter((v: any) => !mantenimientoQueChoca(rangosMantenimiento(v), fecha, 1)
      && !(String(v.est || v.estado || '').toLowerCase().includes('mant') && !(v.mantInicio && v.mantFin))).length;
    const enPropios = delDia.filter((v: any) => placasPropias.has(pegada(v.p ?? v.placa))).length;
    dias.push({
      fecha, nombre: `${DIAS[d.getDay()]} ${d.getDate()}`,
      viajes: delDia.length, enPropios, enTerceros: delDia.length - enPropios,
      operativos, libres: Math.max(0, operativos - ocupadas.size),
      faltan: Math.max(0, delDia.length - operativos)
    });
  }
  return dias;
}

export interface OcupacionVehiculo { placa: string; capacidad: number; viajes: number; promedioCajas: number; pct: number; }

/** Promedio de cajas por viaje frente a la capacidad, por vehículo, en el mes (mes: 0-11). */
export function ocupacionCarga(S: any, anio: number, mes: number): OcupacionVehiculo[] {
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  return vehiculosPropios(S).map((veh: any) => {
    const placa = String(veh.p || veh.placa).toUpperCase().trim();
    const capacidad = Number(veh.cajas || veh.cap) || 0;
    const suyos = (S?.viajes || []).filter((v: any) => String(v.fecha || '').startsWith(prefijo) && v.estado !== 'Cancelado'
      && pegada(v.p ?? v.placa) === pegada(placa) && Number(v.cajas) > 0);
    const total = suyos.reduce((s: number, v: any) => s + Number(v.cajas), 0);
    const promedioCajas = suyos.length ? Math.round(total / suyos.length) : 0;
    return { placa, capacidad, viajes: suyos.length, promedioCajas, pct: capacidad && suyos.length ? Math.round((promedioCajas / capacidad) * 100) : 0 };
  })
    .filter((x: OcupacionVehiculo) => x.viajes > 0 && x.capacidad > 0)
    .sort((a: OcupacionVehiculo, b: OcupacionVehiculo) => a.pct - b.pct);
}

export interface DuracionRuta { ruta: string; destino: string; medidos: number; horasReales: number; diasProgramados: number; diferenciaHoras: number; }

/** Rutas con viajes medidos (salió y llegó marcados), de la más atrasada a la más rápida. */
export function duracionRealRutas(S: any): DuracionRuta[] {
  const porRuta = new Map<string, number[]>();
  (S?.viajes || []).forEach((v: any) => {
    if (!v.salidaReal || !v.llegadaReal) return;
    const horas = (new Date(v.llegadaReal).getTime() - new Date(v.salidaReal).getTime()) / 3600000;
    if (!isFinite(horas) || horas <= 0 || horas > 24 * 20) return;
    const ruta = String(v.ruta || v.codigo || '').toUpperCase().trim();
    if (!ruta) return;
    porRuta.set(ruta, [...(porRuta.get(ruta) || []), horas]);
  });
  return [...porRuta.entries()].map(([ruta, horas]) => {
    const info = (S?.rutas || []).find((r: any) => String(r.cod || r.codigo || '').toUpperCase().trim() === ruta) || {};
    const horasReales = Math.round((horas.reduce((a, b) => a + b, 0) / horas.length) * 10) / 10;
    const diasProgramados = Number(info.diasTrans) || 1;
    return { ruta, destino: String(info.dest || info.destino || ''), medidos: horas.length, horasReales, diasProgramados, diferenciaHoras: Math.round((horasReales - diasProgramados * 24) * 10) / 10 };
  }).sort((a, b) => b.diferenciaHoras - a.diferenciaHoras);
}

/** "30 h" -> "1 día 6 h". */
export function textoHoras(horas: number): string {
  const h = Math.round(Math.abs(horas));
  const d = Math.floor(h / 24), r = h % 24;
  if (!d) return `${r} h`;
  return `${d} día${d === 1 ? '' : 's'}${r ? ` ${r} h` : ''}`;
}
