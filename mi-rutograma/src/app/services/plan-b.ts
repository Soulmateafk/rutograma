// ============================================================
// PLAN B — un vehículo se vara o entra al taller: para cada viaje suyo que
// todavía no sale, se propone con qué vehículo cubrirlo. Primero vehículos
// propios (el mismo motor de "Sugerencia de vehículo": libres esos días,
// documentos al día, reglas de la oficina y pico y placa, capacidad), y si
// no hay, un cupo de tercero libre (Arsitrans / Polar).
// Las propuestas se arman en orden de fecha y cada una "ocupa" al vehículo
// propuesto, así dos viajes del mismo día no terminan en el mismo camión.
// Funciones puras (sin Angular).
// ============================================================

import { sugerirVehiculos } from './sugerencias';
import { diasOcupadoViaje, sumarDiasFecha } from './mantenimiento';
import { horaDelViaje, clienteDelViaje } from './reglas-asignacion';
import { buscarVehiculosDisponiblesParaVarado } from '../components/rutograma/rutograma.utils.js';

export interface OpcionPlanB {
  placa: string;
  tr: string;
  conductor: string;
  detalle: string;
  tercero: boolean;
}

export interface PropuestaPlanB {
  viaje: any;
  opciones: OpcionPlanB[];
  elegida: number;          // índice en opciones (-1 = ninguna)
}

const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const ESTADOS_QUE_NO_SE_MUEVEN = ['Cancelado', 'Entregado', 'Mantenimiento', 'En ruta', 'Varado'];

/** Viajes del vehículo que salen entre "desde" y "hasta" (AAAA-MM-DD) y todavía se pueden mover. */
export function viajesAfectados(S: any, placa: string, desde: string, hasta: string): any[] {
  const p = pegada(placa);
  return (S?.viajes || [])
    .filter((v: any) => pegada(v.p ?? v.placa) === p && !ESTADOS_QUE_NO_SE_MUEVEN.includes(v.estado)
      && /^\d{4}-\d{2}-\d{2}/.test(String(v.fecha || '')) && v.fecha.slice(0, 10) >= desde && v.fecha.slice(0, 10) <= hasta)
    .sort((a: any, b: any) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.ruta || '').localeCompare(String(b.ruta || '')));
}

/** Hasta qué fecha mirar por defecto: el fin del mantenimiento, o una semana. */
export function hastaPorDefecto(vehiculo: any, hoy: string): string {
  const fin = String(vehiculo?.mantFin || '').slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(fin) && fin >= hoy) return fin;
  return sumarDiasFecha(hoy, 7);
}

export function armarPlanB(S: any, placa: string, viajes: any[]): PropuestaPlanB[] {
  const ids = new Set(viajes.map(v => v.id));
  const p = pegada(placa);
  // Copia de trabajo: los viajes afectados se van "moviendo" a lo propuesto.
  const trabajo: any = { ...S, viajes: [...(S?.viajes || [])] };
  const conductores = S?.conductores || [];
  const titularDe = (pl: string) => {
    const c = conductores.find((x: any) => pegada(x.veh ?? x.placa) === pegada(pl));
    return String(c?.nom || c?.nombre || '').trim();
  };

  return [...viajes].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha))).map(v => {
    const pedido = {
      fecha: String(v.fecha).slice(0, 10), dias: diasOcupadoViaje(v), ruta: v.ruta || v.codigo || '',
      cliente: clienteDelViaje(v, S?.rutas || []) || v.cliente || v.cli || '', hora: horaDelViaje(v, S?.rutas || []) || '',
      cajas: Number(v.cajas) || 0
    };
    // El viaje que se está resolviendo no cuenta como ocupación del vehículo dañado.
    const sinEste = { ...trabajo, viajes: trabajo.viajes.filter((x: any) => x.id !== v.id) };
    const propias: OpcionPlanB[] = sugerirVehiculos(sinEste, pedido, 4)
      .filter(s => pegada(s.placa) !== p)
      .slice(0, 3)
      .map(s => ({ placa: s.placa, tr: 'Makand', conductor: s.conductor, tercero: false,
        detalle: [s.conductor || 'sin conductor fijo', `${s.viajesMes} viaje${s.viajesMes === 1 ? '' : 's'} este mes`, s.cajas ? `${s.cajas} cajas` : ''].filter(Boolean).join(' · ') }));

    let terceros: OpcionPlanB[] = [];
    try {
      const dia = Number(v.salida ?? v.dia);
      terceros = (buscarVehiculosDisponiblesParaVarado(dia, sinEste, placa, v.mes, v.anio) || [])
        .filter((c: any) => c.libre && /polar|arsitran/i.test(String(c.tr)))
        .slice(0, 2)
        .map((c: any) => ({ placa: c.placa, tr: c.tr, conductor: titularDe(c.placa), tercero: true, detalle: `Cupo de ${c.tr} libre ese día` }));
    } catch { /* sin cupos de terceros */ }

    const opciones = [...propias, ...terceros];
    const propuesta: PropuestaPlanB = { viaje: v, opciones, elegida: opciones.length ? 0 : -1 };

    // La opción elegida queda ocupada para los siguientes viajes.
    if (opciones.length) {
      const o = opciones[0];
      trabajo.viajes = trabajo.viajes.map((x: any) => x.id === v.id ? { ...x, p: o.placa, placa: o.placa, tr: o.tr } : x);
    } else if (ids.has(v.id)) {
      trabajo.viajes = trabajo.viajes.filter((x: any) => x.id !== v.id);
    }
    return propuesta;
  });
}
