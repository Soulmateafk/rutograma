// ============================================================
// CARGA DE TRABAJO POR CONDUCTOR — en el mes: viajes, días en ruta,
// kilómetros de las rutas, días de descanso y la racha más larga de días
// seguidos en ruta (cansancio). Compara cada conductor con el promedio
// para ver quién va sobrecargado y quién tiene poca carga.
// Un viaje es del conductor si lo tiene anotado; si el viaje no tiene
// conductor, es del titular de la placa. Funciones puras.
// ============================================================

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
/** Días seguidos en ruta a partir de los cuales se avisa. */
export const RACHA_ALERTA = 6;

const limpiar = (t: any): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export type NivelCarga = 'sobrecargado' | 'normal' | 'poca' | 'sin-viajes';

export interface CargaConductor {
  nombre: string;
  placa: string;
  estado: string;
  viajes: any[];
  totalViajes: number;
  diasEnRuta: number;
  km: number;
  diasDescanso: number;
  rachaMax: number;
  nivel: NivelCarga;
  /** Viajes frente al promedio, en % (100 = igual al promedio). */
  pctDelPromedio: number | null;
}

export interface ResumenCarga {
  conductores: CargaConductor[];
  promedioViajes: number;
  sobrecargados: number;
  pocaCarga: number;
  conRachaLarga: number;
}

/** ¿Es este viaje del conductor? (anotado por nombre; sin conductor -> titular de la placa) */
export function esViajeDe(v: any, nombre: string, placa: string): boolean {
  const cond = limpiar(v.cond ?? v.conductor);
  if (!SIN_CONDUCTOR.includes(cond)) return cond === limpiar(nombre);
  return !!placa && pegada(v.p ?? v.placa) === pegada(placa);
}

/** Días del mes de un descanso guardado como { 'Octubre-2026': '20,21,22' }. */
function diasDescanso(c: any, anio: number, mes: number): number[] {
  const texto = c?.descansosPorMes?.[`${MESES[mes]}-${anio}`];
  return String(texto || '').split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 31);
}

function rachaMasLarga(dias: Set<number>): number {
  let max = 0, actual = 0;
  for (let d = 1; d <= 31; d++) {
    actual = dias.has(d) ? actual + 1 : 0;
    if (actual > max) max = actual;
  }
  return max;
}

/**
 * conductores, viajes y rutas como están en la app. mes: 0-11.
 * excluir: viajes que no cuentan (ej. los que caen en un mantenimiento).
 */
export function armarCargaConductores(
  conductores: any[], viajes: any[], rutas: any[], anio: number, mes: number,
  excluir: (v: any) => boolean = () => false
): ResumenCarga {
  const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
  const diasDelMes = new Date(anio, mes + 1, 0).getDate();
  const kmRuta = new Map((rutas || []).map((r: any) => [limpiar(r.cod ?? r.codigo), Number(r.km) || 0]));

  const delMes = (viajes || []).filter(v => {
    if (String(v.estado || '').toLowerCase() === 'cancelado' || excluir(v)) return false;
    if (v.fecha) return String(v.fecha).startsWith(prefijo);
    // Viajes viejos sin fecha: por el mes/año guardados.
    return v.mes === MESES[mes] && Number(v.anio) === anio;
  });

  const lista: CargaConductor[] = (conductores || []).map(c => {
    const nombre = String(c.nom ?? c.nombre ?? '').trim();
    const placa = String(c.veh ?? c.placa ?? '').toUpperCase().trim();
    const suyos = nombre ? delMes.filter(v => esViajeDe(v, nombre, placa)) : [];
    const ocupados = new Set<number>();
    let km = 0;
    suyos.forEach(v => {
      const salida = Number(v.salida ?? v.dia ?? 0);
      const retorno = Number(v.retorno || 0);
      const dias = retorno > salida ? retorno - salida + 1 : 1;
      for (let i = 0; i < dias; i++) if (salida + i >= 1 && salida + i <= diasDelMes) ocupados.add(salida + i);
      km += kmRuta.get(limpiar(v.ruta ?? v.codigo)) || 0;
    });
    return {
      nombre: nombre || 'Sin nombre', placa, estado: String(c.est ?? c.estado ?? 'activo'),
      viajes: suyos.sort((a, b) => Number(a.dia ?? a.salida ?? 0) - Number(b.dia ?? b.salida ?? 0)),
      totalViajes: suyos.length, diasEnRuta: ocupados.size, km,
      diasDescanso: diasDescanso(c, anio, mes).length,
      rachaMax: rachaMasLarga(ocupados), nivel: 'normal', pctDelPromedio: null
    };
  });

  // El promedio solo con quienes están trabajando (activos o con viajes).
  const cuentan = lista.filter(c => c.totalViajes > 0 || String(c.estado).toLowerCase() === 'activo');
  const promedio = cuentan.length ? cuentan.reduce((s, c) => s + c.totalViajes, 0) / cuentan.length : 0;
  lista.forEach(c => {
    c.pctDelPromedio = promedio ? Math.round((c.totalViajes / promedio) * 100) : null;
    if (!c.totalViajes) c.nivel = 'sin-viajes';
    else if (promedio && c.totalViajes >= promedio * 1.25 && c.totalViajes - promedio >= 2) c.nivel = 'sobrecargado';
    else if (promedio && c.totalViajes <= promedio * 0.75 && promedio - c.totalViajes >= 2) c.nivel = 'poca';
  });

  return {
    conductores: lista.sort((a, b) => b.totalViajes - a.totalViajes || b.diasEnRuta - a.diasEnRuta || a.nombre.localeCompare(b.nombre)),
    promedioViajes: Math.round(promedio * 10) / 10,
    sobrecargados: lista.filter(c => c.nivel === 'sobrecargado').length,
    pocaCarga: lista.filter(c => c.nivel === 'poca' && String(c.estado).toLowerCase() === 'activo').length,
    conRachaLarga: lista.filter(c => c.rachaMax >= RACHA_ALERTA).length
  };
}
