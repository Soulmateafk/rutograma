// ============================================================
// MODO PRESENTACIÓN — números de una semana o un mes para mostrarlos en
// diapositivas, y la comparación entre varios períodos (semanas, meses o
// mezclados: por eso también va el promedio por día). Funciones puras.
// Pruebas: presentacion.spec.ts
// ============================================================

import { titularesPorPlaca, conductorDelViaje } from './buscar-hablado';

export interface Periodo { tipo: 'semana' | 'mes'; desde: string; hasta: string; etiqueta: string; corta: string; }
export interface Cuenta { nombre: string; n: number; }
export interface Metricas {
  periodo: Periodo;
  dias: number;
  total: number; entregados: number; enRuta: number; porSalir: number; cancelados: number;
  cumplimiento: number | null;     // de lo que ya debía salir, cuánto salió o se entregó
  cajas: number; extras: number; terceros: number; partePropia: number;
  vehiculos: number; viajesPorVehiculo: number; promedioDia: number;
  porTransportadora: Cuenta[]; porCliente: Cuenta[]; porDestino: Cuenta[];
  conductores: Cuenta[]; vehiculosTop: Cuenta[]; motivosCancelacion: Cuenta[];
  serie: Array<{ etiqueta: string; n: number; entregados: number }>;   // por día (semana) o por semana (mes)
  quejas: number; comparendos: number; valorComparendos: number; novedades: number; novedadesAbiertas: number;
  mejorDia: { etiqueta: string; n: number } | null;
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const aFecha = (f: string) => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };
const sumar = (f: string, n: number) => { const d = aFecha(f); d.setDate(d.getDate() + n); return iso(d); };
const lunesDe = (f: string) => { const d = aFecha(f); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const corto = (f: string) => { const d = aFecha(f); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3).toLowerCase()}`; };

/** "5/10/2026, 7:06 p. m." o "2026-10-05" -> "2026-10-05". */
export function fechaDeTexto(t: any): string {
  const s = String(t || '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
}

export function periodoSemana(lunes: string): Periodo {
  const desde = lunesDe(lunes), hasta = sumar(desde, 6);
  return { tipo: 'semana', desde, hasta, etiqueta: `Semana del ${corto(desde)} al ${corto(hasta)}`, corta: `Sem. ${corto(desde)}` };
}
export function periodoMes(anio: number, mes: number): Periodo {
  const desde = iso(new Date(anio, mes, 1)), hasta = iso(new Date(anio, mes + 1, 0));
  return { tipo: 'mes', desde, hasta, etiqueta: `${MESES[mes]} ${anio}`, corta: `${MESES[mes].slice(0, 3)} ${String(anio).slice(2)}` };
}

/** Semanas y meses que tienen viajes (los más recientes primero). */
export function periodosDisponibles(S: any, hoy: Date = new Date()): { semanas: Periodo[]; meses: Periodo[] } {
  const fechas = (S?.viajes || []).map((v: any) => String(v.fecha || '').slice(0, 10)).filter((f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort();
  if (!fechas.length) return { semanas: [], meses: [] };
  const hasta = fechas[fechas.length - 1] < iso(hoy) ? fechas[fechas.length - 1] : iso(hoy);
  const semanas: Periodo[] = [];
  for (let l = lunesDe(hasta); l >= lunesDe(fechas[0]) && semanas.length < 30; l = sumar(l, -7)) semanas.push(periodoSemana(l));
  const meses: Periodo[] = [];
  const fin = aFecha(fechas[fechas.length - 1]), ini = aFecha(fechas[0]);
  for (let d = new Date(fin.getFullYear(), fin.getMonth(), 1); d >= new Date(ini.getFullYear(), ini.getMonth(), 1) && meses.length < 24; d.setMonth(d.getMonth() - 1)) meses.push(periodoMes(d.getFullYear(), d.getMonth()));
  return { semanas, meses };
}

function contar(lista: any[], clave: (x: any) => string): Cuenta[] {
  const m = new Map<string, number>();
  lista.forEach(x => { const k = String(clave(x) || '').trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre));
}
const esTercero = (v: any) => /polar|arsitran/i.test(String(v.tr || v.transportadora || ''));

export function metricas(S: any, p: Periodo, hoy: Date = new Date()): Metricas {
  const hoyIso = iso(hoy);
  const titular = titularesPorPlaca(S);
  const en = (f: string) => f >= p.desde && f <= p.hasta;
  const todos = (S?.viajes || []).filter((v: any) => en(String(v.fecha || '').slice(0, 10)));
  const act = todos.filter((v: any) => v.estado !== 'Cancelado');
  const canc = todos.filter((v: any) => v.estado === 'Cancelado');
  const yaDebian = act.filter((v: any) => String(v.fecha).slice(0, 10) <= hoyIso);
  const salieron = yaDebian.filter((v: any) => v.estado === 'Entregado' || v.estado === 'En ruta').length;
  const propios = act.filter((v: any) => !esTercero(v));
  const vehPropios = new Set(propios.map((v: any) => String(v.p || v.placa || '').toUpperCase())).size;
  const dias = Math.round((aFecha(p.hasta).getTime() - aFecha(p.desde).getTime()) / 86400000) + 1;

  // Serie: por día en una semana, por semana en un mes.
  const serie: Array<{ etiqueta: string; n: number; entregados: number }> = [];
  if (p.tipo === 'semana') {
    for (let i = 0; i < 7; i++) {
      const f = sumar(p.desde, i); const l = act.filter((v: any) => String(v.fecha).slice(0, 10) === f);
      serie.push({ etiqueta: `${DIAS[aFecha(f).getDay()]} ${aFecha(f).getDate()}`, n: l.length, entregados: l.filter((v: any) => v.estado === 'Entregado').length });
    }
  } else {
    for (let l = lunesDe(p.desde); l <= p.hasta; l = sumar(l, 7)) {
      const ini = l < p.desde ? p.desde : l, fin = sumar(l, 6) > p.hasta ? p.hasta : sumar(l, 6);
      const lista = act.filter((v: any) => { const f = String(v.fecha).slice(0, 10); return f >= ini && f <= fin; });
      serie.push({ etiqueta: `${aFecha(ini).getDate()}-${aFecha(fin).getDate()}`, n: lista.length, entregados: lista.filter((v: any) => v.estado === 'Entregado').length });
    }
  }
  const porDia = contar(act, (v: any) => String(v.fecha).slice(0, 10));
  const novedades = (S?.novedades || []).filter((n: any) => en(fechaDeTexto(n.fecha)));
  const comparendos = (S?.comparendos || []).filter((c: any) => en(fechaDeTexto(c.fecha)));

  return {
    periodo: p, dias,
    total: act.length, entregados: act.filter((v: any) => v.estado === 'Entregado').length, enRuta: act.filter((v: any) => v.estado === 'En ruta').length,
    porSalir: act.filter((v: any) => !v.estado || v.estado === 'Programado' || v.estado === 'Planificado').length, cancelados: canc.length,
    cumplimiento: yaDebian.length ? Math.round((salieron / yaDebian.length) * 100) : null,
    cajas: act.reduce((s: number, v: any) => s + (Number(v.cajas) || 0), 0), extras: act.filter((v: any) => v.tipo === 'extra').length,
    terceros: act.length - propios.length, partePropia: act.length ? Math.round((propios.length / act.length) * 100) : 0,
    vehiculos: vehPropios, viajesPorVehiculo: vehPropios ? Math.round((propios.length / vehPropios) * 10) / 10 : 0,
    promedioDia: Math.round((act.length / dias) * 10) / 10,   // los viajes programados ya están: se divide por todo el período
    porTransportadora: contar(act, (v: any) => v.tr || v.transportadora || 'Makand'),
    porCliente: contar(act, (v: any) => String(v.cliente || v.cli || '').split(',')[0]),
    porDestino: contar(act, (v: any) => String(v.destinoReal || v.destino || '').split('/')[0]).filter(c => c.nombre !== 'No definido'),
    conductores: contar(propios, (v: any) => conductorDelViaje(v, titular)),
    vehiculosTop: contar(propios, (v: any) => String(v.p || v.placa || '').toUpperCase()),
    motivosCancelacion: contar(canc, (v: any) => v.motivoCancelacion || 'Sin motivo escrito'),
    serie,
    quejas: (S?.quejas || []).filter((q: any) => en(fechaDeTexto(q.fecha))).length,
    comparendos: comparendos.length, valorComparendos: comparendos.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0),
    novedades: novedades.length, novedadesAbiertas: novedades.filter((n: any) => !n.resuelta).length,
    mejorDia: porDia[0] ? { etiqueta: `${DIAS[aFecha(porDia[0].nombre).getDay()]} ${corto(porDia[0].nombre)}`, n: porDia[0].n } : null
  };
}

const pct = (a: number, b: number) => a ? Math.round(((b - a) / a) * 100) : null;
const signo = (n: number) => (n > 0 ? '+' : '') + n;

/** Frases con lo más importante de la comparación (en orden de los períodos). */
export function conclusiones(lista: Metricas[]): string[] {
  if (lista.length < 2) return [];
  const out: string[] = [];
  const orden = [...lista].sort((a, b) => a.periodo.desde.localeCompare(b.periodo.desde));
  const primero = orden[0], ultimo = orden[orden.length - 1];
  const mezcla = new Set(lista.map(m => m.periodo.tipo)).size > 1;
  const cuanto = (m: Metricas) => mezcla ? m.promedioDia : m.total;
  const unidad = mezcla ? 'viajes por día' : 'viajes';
  const d = pct(cuanto(primero), cuanto(ultimo));
  if (d !== null) out.push(`De ${primero.periodo.etiqueta} a ${ultimo.periodo.etiqueta} los ${unidad} ${d === 0 ? 'se mantuvieron' : d > 0 ? `subieron ${d}%` : `bajaron ${Math.abs(d)}%`} (${cuanto(primero)} → ${cuanto(ultimo)}).`);
  const mejor = [...lista].sort((a, b) => cuanto(b) - cuanto(a))[0];
  out.push(`El período con más ${unidad}: ${mejor.periodo.etiqueta} (${cuanto(mejor)}).`);
  const conCumpl = lista.filter(m => m.cumplimiento !== null);
  if (conCumpl.length >= 2) { const c = [...conCumpl].sort((a, b) => b.cumplimiento! - a.cumplimiento!)[0]; out.push(`Mejor cumplimiento: ${c.periodo.etiqueta} con ${c.cumplimiento}%.`); }
  if (primero.partePropia !== ultimo.partePropia) out.push(`La flota propia pasó de hacer el ${primero.partePropia}% al ${ultimo.partePropia}% de los viajes${ultimo.partePropia > primero.partePropia ? ': se usaron menos terceros' : ': se usaron más terceros'}.`);
  if (primero.cancelados !== ultimo.cancelados) out.push(`Cancelados: ${primero.cancelados} → ${ultimo.cancelados} (${signo(ultimo.cancelados - primero.cancelados)}).`);
  const cliA = new Map(primero.porCliente.map(c => [c.nombre, c.n]));
  const cambios = ultimo.porCliente.map(c => ({ nombre: c.nombre, dif: c.n - (cliA.get(c.nombre) || 0) })).filter(c => c.dif !== 0).sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
  if (cambios[0] && !mezcla) out.push(`El cliente que más cambió fue ${cambios[0].nombre}: ${signo(cambios[0].dif)} viajes.`);
  if (primero.quejas !== ultimo.quejas || primero.comparendos !== ultimo.comparendos) out.push(`Quejas ${primero.quejas} → ${ultimo.quejas} · Comparendos ${primero.comparendos} → ${ultimo.comparendos}.`);
  const cond = ultimo.conductores[0]; if (cond) out.push(`En ${ultimo.periodo.etiqueta}, quien más viajó fue ${cond.nombre} (${cond.n}).`);
  return out;
}
