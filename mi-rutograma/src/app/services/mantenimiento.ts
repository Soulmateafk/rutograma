// ============================================================
// MANTENIMIENTO vs VIAJES — la MISMA regla que usa el servidor
// (backend/server.js, mantenimientoQueChoca): un vehículo en
// mantenimiento no puede tener ningún viaje que lo ocupe en esos días.
// La única excepción es un viaje que SALGA el último día del
// mantenimiento (ese día ya vuelve del taller). Se revisan todos los
// días del viaje (de la salida al retorno), no solo el de salida.
// ============================================================

export interface RangoMantenimiento {
  inicio: string; // 'YYYY-MM-DD'
  fin: string;    // 'YYYY-MM-DD'
}

export function sumarDiasFecha(fecha: string, dias: number): string {
  const d = new Date(fecha + 'T00:00:00');
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Mantenimiento activo + los ya cerrados (historialMantenimiento). */
export function rangosMantenimiento(vehiculo: any): RangoMantenimiento[] {
  const rangos: RangoMantenimiento[] = [];
  if (!vehiculo) return rangos;
  if (vehiculo.mantInicio && vehiculo.mantFin) rangos.push({ inicio: vehiculo.mantInicio, fin: vehiculo.mantFin });
  let historial = vehiculo.historialMantenimiento;
  if (typeof historial === 'string') {
    try { historial = JSON.parse(historial); } catch { historial = []; }
  }
  if (Array.isArray(historial)) {
    historial.forEach((m: any) => { if (m && m.inicio && m.fin) rangos.push({ inicio: m.inicio, fin: m.fin }); });
  }
  return rangos;
}

/** Días que el viaje ocupa al vehículo (de la salida al día en que ya está libre, "retorno"). */
export function diasOcupadoViaje(viaje: any): number {
  const salida = Number(viaje?.salida || viaje?.dia || 0);
  const retorno = Number(viaje?.retorno || 0);
  return retorno > salida ? retorno - salida : 1;
}

/** Devuelve el mantenimiento con el que choca el viaje, o null. */
export function mantenimientoQueChoca(rangos: RangoMantenimiento[], fechaSalida: string, dias: number): RangoMantenimiento | null {
  if (!fechaSalida) return null;
  const fechaLibre = sumarDiasFecha(fechaSalida, Math.max(1, dias));
  return rangos.find(r => fechaSalida < r.fin && fechaLibre > r.inicio) || null;
}

export interface ViajeEnMantenimiento {
  viaje: any;
  placa: string;
  mantenimiento: RangoMantenimiento;
}

/**
 * Viajes que YA existen y quedan encima de un mantenimiento (por
 * ejemplo, porque se crearon antes de que existiera esta regla, o antes
 * de registrar el mantenimiento). Los cancelados no cuentan.
 */
export function viajesEnMantenimiento(vehiculos: any[], viajes: any[]): ViajeEnMantenimiento[] {
  const rangosPorPlaca = new Map<string, RangoMantenimiento[]>();
  (vehiculos || []).forEach(v => {
    const placa = String(v.p || v.placa || '').toUpperCase().trim();
    const rangos = rangosMantenimiento(v);
    if (placa && rangos.length) rangosPorPlaca.set(placa, rangos);
  });
  if (!rangosPorPlaca.size) return [];

  const resultado: ViajeEnMantenimiento[] = [];
  (viajes || []).forEach(vj => {
    if (!vj?.fecha || vj.estado === 'Cancelado' || vj.estado === 'Mantenimiento') return;
    const placa = String(vj.p || vj.placa || '').toUpperCase().trim();
    const rangos = rangosPorPlaca.get(placa);
    if (!rangos) return;
    const choque = mantenimientoQueChoca(rangos, vj.fecha, diasOcupadoViaje(vj));
    if (choque) resultado.push({ viaje: vj, placa, mantenimiento: choque });
  });
  return resultado.sort((a, b) => String(a.viaje.fecha).localeCompare(String(b.viaje.fecha)));
}
