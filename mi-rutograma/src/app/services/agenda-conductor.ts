// ============================================================
// AGENDA DEL CONDUCTOR — su mes día por día: en qué viaje sale, qué días
// va en ruta, cuáles descansa y cuáles tiene libres. Un viaje es suyo si
// lo tiene anotado; si el viaje no tiene conductor, es del titular de la
// placa (igual que en carga-conductores.ts). El vehículo queda ocupado
// desde la salida hasta el día "retorno" (ese día ya está libre).
// Funciones puras.
// ============================================================

import { esViajeDe } from './carga-conductores';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export type TipoDia = 'sale' | 'en-ruta' | 'descanso' | 'libre';

export interface DiaAgenda {
  dia: number;
  fecha: string;
  enMes: boolean;
  hoy: boolean;
  tipo: TipoDia;
  /** Viajes que SALEN este día. */
  salidas: any[];
  /** Viaje en curso (salió antes y sigue en ruta). */
  enCurso: any | null;
  descanso: boolean;
}

export interface Agenda {
  semanas: DiaAgenda[][];
  resumen: { viajes: number; diasEnRuta: number; descansos: number; libres: number; descansoConViaje: number };
}

const aTexto = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function diasOcupado(v: any): number {
  const salida = Number(v.salida || v.dia || 0);
  const retorno = Number(v.retorno || 0);
  return retorno > salida ? retorno - salida : 1;
}

/** Días de descanso del conductor en ese mes ({ 'Octubre-2026': '20,21' }). */
export function diasDescanso(c: any, anio: number, mes: number): Set<number> {
  const texto = c?.descansosPorMes?.[`${MESES[mes]}-${anio}`];
  return new Set(String(texto || '').split(',').map(x => Number(x.trim())).filter(n => Number.isInteger(n) && n >= 1 && n <= 31));
}

/** mes: 0-11. hoy: para marcar el día de hoy. */
export function armarAgenda(conductor: any, viajes: any[], anio: number, mes: number, hoy: Date = new Date()): Agenda {
  const nombre = String(conductor?.nom ?? conductor?.nombre ?? '').trim();
  const placa = String(conductor?.veh ?? conductor?.placa ?? '').trim();
  const suyos = nombre
    ? (viajes || []).filter(v => v.fecha && v.estado !== 'Cancelado' && esViajeDe(v, nombre, placa))
    : [];

  // Día -> viajes que salen / viaje en curso.
  const salidas = new Map<string, any[]>();
  const enCurso = new Map<string, any>();
  suyos.forEach(v => {
    const [a, m, d] = String(v.fecha).split('-').map(Number);
    if (!a || !m || !d) return;
    const f = aTexto(new Date(a, m - 1, d));
    salidas.set(f, [...(salidas.get(f) || []), v]);
    for (let i = 1; i < diasOcupado(v); i++) {
      const sig = aTexto(new Date(a, m - 1, d + i));
      if (!enCurso.has(sig)) enCurso.set(sig, v);
    }
  });
  salidas.forEach(lista => lista.sort((x, y) => String(x.hora || '').localeCompare(String(y.hora || ''))));

  const descansos = diasDescanso(conductor, anio, mes);
  const textoHoy = aTexto(hoy);
  const primero = new Date(anio, mes, 1);
  // La semana empieza el lunes.
  const corrimiento = (primero.getDay() + 6) % 7;
  const ultimoDia = new Date(anio, mes + 1, 0).getDate();
  const totalCeldas = Math.ceil((corrimiento + ultimoDia) / 7) * 7;

  const resumen = { viajes: 0, diasEnRuta: 0, descansos: 0, libres: 0, descansoConViaje: 0 };
  const celdas: DiaAgenda[] = [];
  for (let i = 0; i < totalCeldas; i++) {
    const f = new Date(anio, mes, 1 - corrimiento + i);
    const fecha = aTexto(f);
    const enMes = f.getMonth() === mes;
    const sale = salidas.get(fecha) || [];
    const curso = enCurso.get(fecha) || null;
    const descanso = enMes && descansos.has(f.getDate());
    const tipo: TipoDia = sale.length ? 'sale' : curso ? 'en-ruta' : descanso ? 'descanso' : 'libre';
    if (enMes) {
      resumen.viajes += sale.length;
      if (sale.length || curso) resumen.diasEnRuta++;
      if (descanso) resumen.descansos++;
      if (tipo === 'libre') resumen.libres++;
      if (descanso && (sale.length || curso)) resumen.descansoConViaje++;
    }
    celdas.push({ dia: f.getDate(), fecha, enMes, hoy: fecha === textoHoy, tipo, salidas: sale, enCurso: curso, descanso });
  }

  const semanas: DiaAgenda[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));
  return { semanas, resumen };
}
