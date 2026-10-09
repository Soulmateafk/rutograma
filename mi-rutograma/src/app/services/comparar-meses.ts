// ============================================================
// COMPARAR DOS MESES EN DETALLE — se calcula solo cuando se oprime
// "Analizar en detalle" en el Comparativo. Toma los viajes de cada mes
// (todas las transportadoras) y dice qué cambió: totales, rutas, clientes,
// vehículos, conductores, días de la semana, cancelaciones, quejas,
// comparendos y despachos, más unas conclusiones en palabras.
// Funciones puras (sin Angular): reciben los datos y devuelven el análisis.
// ============================================================

export interface MesParaComparar {
  etiqueta: string;          // "Septiembre 2026"
  viajes: any[];
  quejas?: any[];
  comparendos?: any[];
  despachos?: { resumen: any; registros: any[] } | null;
}

export interface FilaCambio {
  nombre: string;
  detalle?: string;
  a: number;
  b: number;
  dif: number;
  pct: number | null;        // null si en A era 0
}

export interface IndicadorMes {
  nombre: string;
  a: number | null;
  b: number | null;
  formato?: 'num' | 'pct' | 'min' | 'dinero' | 'dec';
  mejorSiSube?: boolean | null;   // para el color: null = ni bueno ni malo
}

export interface GrupoCambio {
  clave: string;
  titulo: string;
  filas: FilaCambio[];       // de mayor a menor cambio
  nuevos: FilaCambio[];      // solo en B
  dejaron: FilaCambio[];     // solo en A
}

export interface AnalisisMeses {
  etiquetaA: string;
  etiquetaB: string;
  hastaDia: number | null;
  indicadores: IndicadorMes[];
  grupos: GrupoCambio[];
  cancelaciones: FilaCambio[];
  demoras: FilaCambio[];     // motivos de demora en el cargue (Despachos)
  conclusiones: string[];
}

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NOMBRES_MES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const texto = (v: any) => String(v ?? '').trim();
const placaDe = (v: any) => texto(v.p || v.placa || v.veh).toUpperCase();
const trDe = (v: any) => texto(v.tr || v.transportadora) || 'Sin transportadora';
const esMakand = (v: any) => trDe(v).toLowerCase() === 'makand';
const cancelado = (v: any) => v.estado === 'Cancelado';
const cajasDe = (v: any) => { const n = Number(v.cajas); return isFinite(n) && n > 0 ? n : 0; };

function diaDelViaje(v: any): number {
  const f = texto(v.fecha);
  if (/^\d{4}-\d{2}-\d{2}/.test(f)) return Number(f.slice(8, 10));
  const d = Number(v.salida ?? v.dia);
  return isFinite(d) ? d : 0;
}

/**
 * Viajes de un mes. Primero los de la app; si ese mes ya no está ahí
 * (se limpió), los de la foto que se guardó al cerrarlo (Histórico).
 */
export function viajesDelMes(todos: any[], historial: any[], mesIndex: number, anio: number): any[] {
  const nombre = NOMBRES_MES[mesIndex];
  const prefijo = `${anio}-${String(mesIndex + 1).padStart(2, '0')}`;
  // Mismo criterio que las tarjetas del Comparativo: el mes guardado en el
  // viaje; si no lo tiene, el de su fecha.
  const delMes = (todos || []).filter(v => v.mes
    ? v.mes === nombre && Number(v.anio) === Number(anio)
    : texto(v.fecha).startsWith(prefijo));
  if (delMes.length) return delMes;
  const foto = (historial || []).find(h => Number(h.mes) === Number(mesIndex) && Number(h.anio) === Number(anio));
  return Array.isArray(foto?.viajes) ? foto.viajes : [];
}

function contar(viajes: any[], clave: (v: any) => string, valor: (v: any) => number = () => 1, detalle?: (v: any) => string) {
  const mapa = new Map<string, { n: number; detalle: string }>();
  for (const v of viajes) {
    const k = clave(v);
    if (!k) continue;
    const actual = mapa.get(k) || { n: 0, detalle: detalle ? detalle(v) : '' };
    actual.n += valor(v);
    mapa.set(k, actual);
  }
  return mapa;
}

function compararMapas(a: Map<string, { n: number; detalle: string }>, b: Map<string, { n: number; detalle: string }>): FilaCambio[] {
  const nombres = new Set([...a.keys(), ...b.keys()]);
  return [...nombres].map(nombre => {
    const na = a.get(nombre)?.n || 0;
    const nb = b.get(nombre)?.n || 0;
    return { nombre, detalle: b.get(nombre)?.detalle || a.get(nombre)?.detalle || '', a: na, b: nb, dif: nb - na, pct: na ? Math.round(((nb - na) / na) * 100) : null };
  }).sort((x, y) => Math.abs(y.dif) - Math.abs(x.dif) || y.b - x.b || x.nombre.localeCompare(y.nombre));
}

function grupo(clave: string, titulo: string, va: any[], vb: any[], fn: (v: any) => string, detalle?: (v: any) => string): GrupoCambio {
  const filas = compararMapas(contar(va, fn, undefined, detalle), contar(vb, fn, undefined, detalle));
  return {
    clave, titulo,
    filas: filas.filter(f => f.a > 0 && f.b > 0 || (f.a === 0 && f.b === 0)),
    nuevos: filas.filter(f => f.a === 0 && f.b > 0).sort((x, y) => y.b - x.b),
    dejaron: filas.filter(f => f.a > 0 && f.b === 0).sort((x, y) => y.a - x.a)
  };
}

const distintos = (viajes: any[], fn: (v: any) => string) => new Set(viajes.map(fn).filter(Boolean)).size;
const promedio = (total: number, n: number) => n ? Math.round((total / n) * 10) / 10 : null;
const conSigno = (n: number) => (n > 0 ? '+' : '') + n;
const pctTexto = (a: number, b: number) => a ? ` (${conSigno(Math.round(((b - a) / a) * 100))}%)` : '';
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El análisis completo. hastaDia: contar solo hasta ese día en los dos meses (null = mes completo). */
export function analizarMeses(A: MesParaComparar, B: MesParaComparar, hastaDia: number | null = null): AnalisisMeses {
  const corte = (lista: any[]) => hastaDia === null ? lista : lista.filter(v => diaDelViaje(v) <= hastaDia);
  const corteFecha = (lista: any[]) => hastaDia === null ? lista : lista.filter(x => Number(texto(x.fecha).slice(8, 10)) <= hastaDia);
  const todosA = corte(A.viajes || []), todosB = corte(B.viajes || []);
  const va = todosA.filter(v => !cancelado(v)), vb = todosB.filter(v => !cancelado(v));
  const canA = todosA.filter(cancelado), canB = todosB.filter(cancelado);
  const makA = va.filter(esMakand), makB = vb.filter(esMakand);
  const cajasA = va.reduce((s, v) => s + cajasDe(v), 0), cajasB = vb.reduce((s, v) => s + cajasDe(v), 0);
  const vehA = distintos(makA, placaDe), vehB = distintos(makB, placaDe);
  const qA = corteFecha(A.quejas || []), qB = corteFecha(B.quejas || []);
  const cA = corteFecha(A.comparendos || []), cB = corteFecha(B.comparendos || []);
  const valor = (l: any[]) => l.reduce((s, c) => s + (Number(c.valor) || 0), 0);
  const dA = A.despachos?.resumen || null, dB = B.despachos?.resumen || null;

  const indicadores: IndicadorMes[] = [
    { nombre: 'Viajes (sin cancelados)', a: va.length, b: vb.length, mejorSiSube: true },
    { nombre: 'Con Makand', a: makA.length, b: makB.length, mejorSiSube: true },
    { nombre: 'Con terceros (Arsitrans, Polar…)', a: va.length - makA.length, b: vb.length - makB.length, mejorSiSube: null },
    { nombre: 'Viajes extra', a: va.filter(v => v.tipo === 'extra').length, b: vb.filter(v => v.tipo === 'extra').length, mejorSiSube: null },
    { nombre: 'Cancelados', a: canA.length, b: canB.length, mejorSiSube: false },
    { nombre: 'Cajas programadas', a: cajasA, b: cajasB, mejorSiSube: true },
    { nombre: 'Cajas promedio por viaje', a: promedio(cajasA, va.length), b: promedio(cajasB, vb.length), formato: 'dec', mejorSiSube: true },
    { nombre: 'Vehículos de Makand usados', a: vehA, b: vehB, mejorSiSube: null },
    { nombre: 'Viajes por vehículo de Makand', a: promedio(makA.length, vehA), b: promedio(makB.length, vehB), formato: 'dec', mejorSiSube: true },
    { nombre: 'Conductores que viajaron', a: distintos(va, v => texto(v.cond)), b: distintos(vb, v => texto(v.cond)), mejorSiSube: null },
    { nombre: 'Rutas distintas', a: distintos(va, v => texto(v.ruta || v.codigo)), b: distintos(vb, v => texto(v.ruta || v.codigo)), mejorSiSube: null },
    { nombre: 'Clientes atendidos', a: distintos(va, v => texto(v.cliente || v.cli)), b: distintos(vb, v => texto(v.cliente || v.cli)), mejorSiSube: true },
    { nombre: 'Quejas de clientes', a: qA.length, b: qB.length, mejorSiSube: false },
    { nombre: 'Comparendos', a: cA.length, b: cB.length, mejorSiSube: false },
    { nombre: 'Valor de comparendos', a: valor(cA), b: valor(cB), formato: 'dinero', mejorSiSube: false }
  ];
  if (dA || dB) {
    indicadores.push(
      { nombre: 'Despachos anotados', a: dA?.total ?? null, b: dB?.total ?? null, mejorSiSube: null },
      { nombre: 'Cajas cargadas (Despachos)', a: dA?.totalCajas ?? null, b: dB?.totalCajas ?? null, mejorSiSube: true },
      { nombre: 'Tiempo promedio de cargue', a: dA?.promedioMin ?? null, b: dB?.promedioMin ?? null, formato: 'min', mejorSiSube: false },
      { nombre: 'Cargues demorados', a: dA?.conDemora ?? null, b: dB?.conDemora ?? null, mejorSiSube: false }
    );
  }

  const nombreRuta = (v: any) => texto(v.ruta || v.codigo).toUpperCase();
  const destino = (v: any) => texto(v.destinoReal || v.destino);
  const grupos: GrupoCambio[] = [
    grupo('ruta', 'Rutas', va, vb, nombreRuta, destino),
    grupo('cliente', 'Clientes', va, vb, v => texto(v.cliente || v.cli)),
    grupo('vehiculo', 'Vehículos de Makand', makA, makB, placaDe, v => texto(v.cond)),
    grupo('conductor', 'Conductores', va, vb, v => texto(v.cond)),
    grupo('transportadora', 'Transportadoras', va, vb, trDe),
    grupo('dia', 'Días de la semana', va, vb, v => {
      const f = texto(v.fecha);
      if (!/^\d{4}-\d{2}-\d{2}/.test(f)) return '';
      const [y, m, d] = f.slice(0, 10).split('-').map(Number);
      return DIAS_SEMANA[new Date(y, m - 1, d).getDay()];
    })
  ];
  // Los días de la semana van en su orden, no por cambio.
  const dias = grupos[5];
  const orden = (f: FilaCambio) => (DIAS_SEMANA.indexOf(f.nombre) + 6) % 7;
  dias.filas = [...dias.filas, ...dias.nuevos, ...dias.dejaron].sort((x, y) => orden(x) - orden(y));
  dias.nuevos = []; dias.dejaron = [];

  const cancelaciones = compararMapas(
    contar(canA, v => texto(v.motivoCancelacion) || 'Sin motivo escrito'),
    contar(canB, v => texto(v.motivoCancelacion) || 'Sin motivo escrito'));

  const demoras = compararMapas(
    contar(corteFecha(A.despachos?.registros || []), r => texto(r.motivoDemora)),
    contar(corteFecha(B.despachos?.registros || []), r => texto(r.motivoDemora)));

  const analisis: AnalisisMeses = { etiquetaA: A.etiqueta, etiquetaB: B.etiqueta, hastaDia, indicadores, grupos, cancelaciones, demoras, conclusiones: [] };
  analisis.conclusiones = conclusiones(analisis, { va, vb, makA, makB, canA, canB, A, B });
  return analisis;
}

function conclusiones(an: AnalisisMeses, d: any): string[] {
  const out: string[] = [];
  const { va, vb, makA, makB, canA, canB } = d;
  const A = an.etiquetaA, B = an.etiquetaB;
  const corte = an.hastaDia ? ` (del 1 al ${an.hastaDia})` : '';

  if (!va.length && !vb.length) return ['No hay viajes en ninguno de los dos meses para comparar.'];
  if (!va.length) return [`${A} no tiene viajes guardados${corte}: no hay contra qué comparar ${B}.`];

  const dif = vb.length - va.length;
  out.push(dif === 0
    ? `${B} tuvo los mismos viajes que ${A}${corte}: ${va.length}.`
    : `${B} tuvo ${plural(vb.length, 'viaje', 'viajes')}${corte}, ${Math.abs(dif)} ${dif > 0 ? 'más' : 'menos'} que ${A}${pctTexto(va.length, vb.length)}.`);

  if (makA.length !== makB.length) out.push(`Con Makand (flota propia): ${makA.length} → ${makB.length} viajes${pctTexto(makA.length, makB.length)}.`);
  // Makand frente a terceros.
  const parteA = va.length ? Math.round(((va.length - makA.length) / va.length) * 100) : 0;
  const parteB = vb.length ? Math.round(((vb.length - makB.length) / vb.length) * 100) : 0;
  if (Math.abs(parteB - parteA) >= 5) out.push(`Los terceros (Arsitrans, Polar…) pasaron de hacer el ${parteA}% al ${parteB}% de los viajes${parteB > parteA ? ': la flota propia alcanzó para menos' : ': la flota propia hizo más'}.`);

  const [rutas, clientes, vehiculos, conductores] = an.grupos;
  const sube = (g: GrupoCambio) => g.filas.filter(f => f.dif > 0)[0];
  const baja = (g: GrupoCambio) => g.filas.filter(f => f.dif < 0)[0];
  const r1 = sube(rutas), r2 = baja(rutas);
  if (r1) out.push(`La ruta que más creció fue ${r1.nombre}${r1.detalle ? ' (' + r1.detalle + ')' : ''}: de ${r1.a} a ${r1.b} viajes.`);
  if (r2) out.push(`La que más bajó fue ${r2.nombre}${r2.detalle ? ' (' + r2.detalle + ')' : ''}: de ${r2.a} a ${r2.b}.`);
  if (rutas.nuevos.length) out.push(`${plural(rutas.nuevos.length, 'ruta nueva', 'rutas nuevas')} en ${B}: ${rutas.nuevos.slice(0, 4).map(f => f.nombre).join(', ')}${rutas.nuevos.length > 4 ? '…' : ''}.`);
  if (rutas.dejaron.length) out.push(`${plural(rutas.dejaron.length, 'ruta dejó', 'rutas dejaron')} de tener viajes: ${rutas.dejaron.slice(0, 4).map(f => `${f.nombre} (${f.a} en ${A})`).join(', ')}${rutas.dejaron.length > 4 ? '…' : ''}.`);

  const c1 = sube(clientes), c2 = baja(clientes);
  if (c1) out.push(`El cliente que más creció fue ${c1.nombre}: ${c1.a} → ${c1.b} viajes.`);
  if (c2) out.push(`${c2.nombre} bajó de ${c2.a} a ${c2.b} viajes.`);
  if (clientes.nuevos.length) out.push(`Clientes nuevos: ${clientes.nuevos.slice(0, 4).map(f => `${f.nombre} (${f.b})`).join(', ')}.`);
  if (clientes.dejaron.length) out.push(`Clientes sin viajes en ${B}: ${clientes.dejaron.slice(0, 4).map(f => `${f.nombre} (tenía ${f.a})`).join(', ')}.`);

  const todosVeh = [...vehiculos.filas, ...vehiculos.nuevos].sort((x, y) => y.b - x.b);
  if (todosVeh.length) out.push(`El vehículo de Makand con más viajes en ${B} fue ${todosVeh[0].nombre} (${todosVeh[0].b}).`);
  const v2 = baja(vehiculos);
  if (v2 && v2.dif <= -3) out.push(`${v2.nombre} hizo ${Math.abs(v2.dif)} viajes menos que en ${A} (${v2.a} → ${v2.b}): ¿estuvo en taller o sin conductor?`);
  if (vehiculos.dejaron.length) out.push(`${plural(vehiculos.dejaron.length, 'vehículo de Makand no viajó', 'vehículos de Makand no viajaron')} en ${B}: ${vehiculos.dejaron.slice(0, 5).map(f => f.nombre).join(', ')}.`);

  const todosCond = [...conductores.filas, ...conductores.nuevos].sort((x, y) => y.b - x.b);
  if (todosCond.length) out.push(`El conductor con más viajes en ${B} fue ${todosCond[0].nombre} (${todosCond[0].b}).`);

  const difCan = canB.length - canA.length;
  if (canA.length || canB.length) {
    const top = an.cancelaciones.filter(f => f.b > 0).sort((x, y) => y.b - x.b)[0];
    out.push(`Cancelados: ${canA.length} → ${canB.length}${difCan ? ` (${difCan > 0 ? 'más' : 'menos'} cancelaciones)` : ''}.${top ? ` En ${B} el motivo más común fue "${top.nombre}" (${top.b}).` : ''}`);
  }

  const ind = (nombre: string) => an.indicadores.find(i => i.nombre === nombre);
  const cpv = ind('Cajas promedio por viaje');
  if (cpv?.a && cpv?.b && Math.abs(cpv.b - cpv.a) / cpv.a >= 0.05) out.push(`Cada viaje llevó en promedio ${cpv.b} cajas, frente a ${cpv.a} en ${A}${cpv.b > cpv.a ? ': los camiones van más llenos' : ': van más vacíos'}.`);
  const q = ind('Quejas de clientes');
  if (q && (q.a || q.b) && q.a !== q.b) out.push(`Quejas de clientes: ${q.a} → ${q.b}.`);
  const cmp = ind('Comparendos');
  if (cmp && (cmp.a || cmp.b) && cmp.a !== cmp.b) out.push(`Comparendos: ${cmp.a} → ${cmp.b}.`);
  const tc = ind('Tiempo promedio de cargue');
  if (tc?.a && tc?.b && tc.a !== tc.b) out.push(`El cargue promedio pasó de ${tc.a} a ${tc.b} minutos${tc.b > tc.a ? ': se está demorando más' : ': está más ágil'}.`);
  const dem = ind('Cargues demorados');
  if (dem && dem.b && dem.a !== dem.b) {
    const top = an.demoras.filter(f => f.b > 0).sort((x, y) => y.b - x.b)[0];
    out.push(`Cargues demorados: ${dem.a ?? 0} → ${dem.b}.${top ? ` La causa más común en ${B}: "${top.nombre}" (${top.b}).` : ''}`);
  }
  return out;
}
