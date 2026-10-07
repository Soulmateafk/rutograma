// ============================================================
// SUGERENCIA DE VEHÍCULO — al crear un viaje extra, los mejores vehículos
// propios para esas fechas: libres (sin otro viaje ni mantenimiento), con
// documentos al día, que cumplen las reglas de la oficina (cliente, ruta,
// pico y placa) y con capacidad para las cajas. Entre esos, primero los
// que menos viajes llevan en el mes, y a igual carga el más pequeño que
// alcance (no mandar un camión grande para poca carga). Funciones puras.
// ============================================================

import { choquesDeAgenda, documentosVencidos, esPlacaCupo } from './revision-viajes';
import { reglasIncumplidas } from './reglas-asignacion';
import { mantenimientoQueChoca, rangosMantenimiento } from './mantenimiento';
import { esViajeDe } from './carga-conductores';

export interface Sugerencia {
  placa: string;
  conductor: string;
  cajas: number;
  viajesMes: number;
  motivos: string[];
}

export interface PedidoSugerencia {
  fecha: string;      // 'AAAA-MM-DD'
  dias: number;       // días que ocupa el vehículo (salida hasta el día en que queda libre)
  ruta?: string;
  cliente?: string;
  hora?: string;
  cajas?: number;
}

const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function sugerirVehiculos(S: any, pedido: PedidoSugerencia, cuantos = 3): Sugerencia[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha || '')) return [];
  const dia = Number(pedido.fecha.slice(8));
  const dias = Math.max(1, Number(pedido.dias) || 1);
  const prefijoMes = pedido.fecha.slice(0, 7);
  const cajasPedidas = Number(pedido.cajas) || 0;
  const conductores = S?.conductores || [];
  const viajes = S?.viajes || [];

  const candidatos = (S?.vehiculos || []).filter((v: any) => {
    const placa = String(v.p || v.placa || '').trim();
    const tr = String(v.tr || v.transportadora || 'Makand').toLowerCase();
    return placa && !esPlacaCupo(placa) && !tr.includes('arsitran') && !tr.includes('polar')
      && String(v.categoria || 'Viajero').trim() !== 'Urbano';
  });

  const lista: Sugerencia[] = [];
  candidatos.forEach((veh: any) => {
    const placa = String(veh.p || veh.placa).toUpperCase().trim();
    const estado = String(veh.est || veh.estado || '').toLowerCase();
    if (estado.includes('mant') && !(veh.mantInicio && veh.mantFin)) return;
    if (mantenimientoQueChoca(rangosMantenimiento(veh), pedido.fecha, dias)) return;
    const capacidad = Number(veh.cajas || veh.cap) || 0;
    if (cajasPedidas && capacidad && capacidad < cajasPedidas) return;

    const prueba = { p: placa, placa, fecha: pedido.fecha, salida: dia, dia, retorno: dia + dias, ruta: pedido.ruta || '', cliente: pedido.cliente || '', hora: pedido.hora || '', estado: 'Programado' };
    if (choquesDeAgenda(prueba, viajes, conductores).length) return;
    if (documentosVencidos(prueba, S).length) return;
    if (reglasIncumplidas(prueba, S).length) return;

    const titular = conductores.find((c: any) => pegada(c.veh ?? c.placa) === pegada(placa));
    const nombre = String(titular?.nom || titular?.nombre || '').trim();
    const viajesMes = viajes.filter((x: any) => String(x.fecha || '').startsWith(prefijoMes) && x.estado !== 'Cancelado'
      && (nombre ? esViajeDe(x, nombre, placa) : pegada(x.p ?? x.placa) === pegada(placa))).length;

    lista.push({
      placa, conductor: nombre, cajas: capacidad, viajesMes,
      motivos: ['Libre esos días', 'Documentos al día', `${viajesMes} viaje${viajesMes === 1 ? '' : 's'} este mes`, capacidad ? `${capacidad} cajas` : 'capacidad sin dato']
    });
  });

  return lista
    .sort((a, b) => a.viajesMes - b.viajesMes || (a.cajas || 99999) - (b.cajas || 99999) || a.placa.localeCompare(b.placa))
    .slice(0, cuantos);
}
