// ============================================================
// BÚSQUEDA HABLADA — se escribe como se habla y la app lo entiende:
//   "viajes de D1 la semana pasada con LUN 428"
//   "cuántos viajes a Cali entregados en septiembre"
//   "lo que tiene Moya mañana en la tarde"
//   "extras sin conductor del 5 al 10 de octubre, sin Polar"
// interpretar() convierte la frase en filtros (fechas, días de la semana,
// horario, placas, conductores, clientes, destinos, rutas, transportadoras,
// estados, tipos, cajas, negaciones, orden y cantidad) y dice qué entendió;
// filtrarViajes() aplica esos filtros. Funciones puras (sin Angular).
// Pruebas: buscar-hablado.spec.ts
// ============================================================

export interface Filtros {
  desde: string | null;            // AAAA-MM-DD (incluido)
  hasta: string | null;            // AAAA-MM-DD (incluido)
  diasSemana: number[];            // 0 = domingo
  horaDesde: number | null;        // minutos desde medianoche (incluido)
  horaHasta: number | null;        // minutos (excluido)
  placas: string[]; conductores: string[]; clientes: string[]; destinos: string[]; rutas: string[];
  transportadoras: string[]; estados: string[]; tiposVehiculo: string[];
  no: { placas: string[]; conductores: string[]; clientes: string[]; destinos: string[]; rutas: string[]; transportadoras: string[]; estados: string[] };
  extra: boolean | null; urgente: boolean | null; dobleEntrega: boolean | null; split: boolean | null;
  sinConductor: boolean | null; conNovedad: boolean | null; reasignado: boolean | null; conObservacion: boolean | null;
  cajasMin: number | null; cajasMax: number | null;
  incluirCancelados: boolean;
  libres: string[];                // palabras que no se entendieron: se buscan como texto
  orden: 'cercano' | 'asc' | 'desc';
  limite: number | null;
  soloFuturos: boolean;
}

export interface Entendido { tipo: string; texto: string; icono: string; }
export interface Interpretacion { filtros: Filtros; entendidos: Entendido[]; pregunta: 'listar' | 'contar'; algo: boolean; }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTOS: Record<string, number> = { ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, set: 8, setiembre: 8, oct: 9, nov: 10, dic: 11 };
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const DIAS_CORTOS: Record<string, number> = { dom: 0, lun: 1, mie: 3, mier: 3, jue: 4, vie: 5, sab: 6 };
const NUMEROS: Record<string, number> = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20, treinta: 30 };
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const NOMBRE_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Palabras de relleno: no cambian la búsqueda.
const RELLENO = new Set(('a al el la los las lo le les de del en y e o u con para por que cual cuales quien quienes como cuando donde ' +
  'viaje viajes viajecito recorrido recorridos despacho despachos salida salidas carga cargas servicio servicios ruta rutas ' +
  'ver ve mira mirar muestra muestrame mostrar dame dime quiero necesito busca buscar buscame encuentra encontrar trae traeme lista listar ' +
  'hay habia tiene tienen tenia tuvo tuvieron hizo hicieron hace hacen va van iba iban fue fueron sale salen salio salieron ' +
  'me mi mis su sus un una unos unas todo todos toda todas este esta estos estas ese esa esos esas aquel ' +
  'del dia dias fecha fechas hacia rumbo destino destinos camino cliente clientes vehiculo vehiculos carro carros camion camiones placa placas ' +
  'conductor conductores chofer choferes manejado manejo maneja manejaron llevado llevo lleva llevaron hecho hechos asignado asignados asignada ' +
  'favor porfa porfavor gracias hola oye bueno pues entonces tambien ademas solo solamente nada mas ya cuantos cuantas cuanto cuanta numero total ' +
  'desde bogota bog origen yo nosotros tenemos tengo hubo han ha sido sean sea es son estan esta estaba se mes semana ano cada proximo proxima siguiente pasado pasada entrante').split(/\s+/));

const ESTADOS: Array<[string[], string[], string]> = [
  [['entregado', 'entregados', 'entregada', 'entregadas', 'cumplido', 'cumplidos', 'completado', 'completados', 'terminado', 'terminados', 'finalizado', 'finalizados', 'llegaron', 'llego', 'listos', 'se entregaron', 'entregaron', 'se entrego', 'entrego', 'ya llegaron', 'ya entregados'], ['Entregado'], 'entregados'],
  [['en ruta', 'en camino', 'en transito', 'rodando', 'viajando', 'andando', 'en carretera', 'ya salieron', 'ya salio', 'saliendo'], ['En ruta'], 'en ruta'],
  [['programado', 'programados', 'programada', 'programadas', 'planificado', 'planificados', 'pendiente', 'pendientes', 'por salir', 'sin salir', 'no han salido', 'no ha salido', 'que faltan', 'faltantes', 'por hacer'], ['Programado', 'Planificado'], 'por salir'],
  [['cancelado', 'cancelados', 'cancelada', 'canceladas', 'anulado', 'anulados', 'cancelaciones'], ['Cancelado'], 'cancelados'],
  [['en mantenimiento', 'en taller', 'mantenimiento'], ['Mantenimiento'], 'en mantenimiento']
];

export const sinTildes = (t: any): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const pegada = (t: any): string => sinTildes(t).replace(/[^a-z0-9]/g, '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const sumar = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const finDeMes = (a: number, m: number) => new Date(a, m + 1, 0);
const lunesDe = (d: Date) => sumar(d, -((d.getDay() + 6) % 7));
const fechaBonita = (f: string) => { const [a, m, d] = f.split('-').map(Number); return `${d} de ${NOMBRE_MES[m - 1]}${a !== new Date().getFullYear() ? ' de ' + a : ''}`; };

function distancia(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]; fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const t = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1));
      previo = t;
    }
  }
  return fila[b.length];
}
// Mal escrito pero reconocible: 1 letra de diferencia, o 2 si empieza igual ("torez" -> "torres").
const parecido = (palabra: string, objetivo: string) => palabra === objetivo
  || (palabra.length >= 5 && objetivo.length >= 5 && distancia(palabra, objetivo) <= (palabra.length >= 8 || palabra.slice(0, 2) === objetivo.slice(0, 2) ? 2 : 1));

/** Diccionarios armados con los datos de la app (placas, conductores, clientes, destinos, rutas). */
interface Diccionario {
  placas: Map<string, string>;               // pegada -> placa
  numerosPlaca: Map<string, string[]>;       // "428" -> placas
  conductores: string[];
  palabrasConductor: Map<string, Set<string>>;
  clientes: Map<string, string>;             // frase normalizada -> nombre
  destinos: Map<string, string>;             // frase normalizada -> nombre
  rutas: Map<string, string>;                // código normalizado -> código
  tiposVehiculo: Map<string, string>;
}

function armarDiccionario(S: any): Diccionario {
  const d: Diccionario = { placas: new Map(), numerosPlaca: new Map(), conductores: [], palabrasConductor: new Map(), clientes: new Map(), destinos: new Map(), rutas: new Map(), tiposVehiculo: new Map() };
  const placas = new Set<string>();
  (S?.vehiculos || []).forEach((v: any) => { const p = String(v.p || v.placa || '').toUpperCase().trim(); if (p) placas.add(p); const t = String(v.tipo || v.t || '').trim(); if (t) d.tiposVehiculo.set(sinTildes(t), t); });
  (S?.viajes || []).forEach((v: any) => { const p = String(v.p || v.placa || '').toUpperCase().trim(); if (p) placas.add(p); });
  placas.forEach(p => {
    d.placas.set(pegada(p), p);
    const num = p.replace(/\D/g, '');
    if (num.length >= 2 && !/^(ARSITRANS|POLAR)/.test(p)) d.numerosPlaca.set(num, [...(d.numerosPlaca.get(num) || []), p]);
  });

  const nombres = new Set<string>();
  (S?.conductores || []).forEach((c: any) => { const n = String(c.nom || c.nombre || '').trim(); if (n) nombres.add(n); });
  (S?.viajes || []).forEach((v: any) => { const n = String(v.cond || '').trim(); if (n && n.length > 3) nombres.add(n); });
  d.conductores = [...nombres];
  d.conductores.forEach(n => sinTildes(n).split(/\s+/).filter(w => w.length >= 3 && !RELLENO.has(w)).forEach(w => {
    if (!d.palabrasConductor.has(w)) d.palabrasConductor.set(w, new Set());
    d.palabrasConductor.get(w)!.add(n);
  }));

  const agregarCliente = (txt: string) => String(txt || '').split(/[,/;.]|\sy\s/).map(x => x.trim()).filter(x => x && x.length >= 2).forEach(c => {
    const k = sinTildes(c).replace(/[^a-z0-9 ]/g, '').trim();
    if (k && !d.clientes.has(k)) d.clientes.set(k, c);
  });
  const agregarDestino = (txt: string) => String(txt || '').split(/[/,]/).map(x => x.trim()).filter(x => x && x !== 'No definido').forEach(c => {
    const k = sinTildes(c).replace(/[^a-z0-9 ]/g, '').trim();
    if (k && !d.destinos.has(k)) d.destinos.set(k, c);
  });
  (S?.rutas || []).forEach((r: any) => {
    const cod = String(r.cod || r.codigo || '').toUpperCase().trim();
    if (cod) d.rutas.set(pegada(cod), cod);
    const dest = String(r.dest || r.destino || '');
    agregarDestino(dest);
    // El segmento del código (BOG-CAL-D1 -> "cal") también nombra al destino.
    const partes = cod.split('-');
    const primero = dest.split('/')[0].trim();
    if (partes.length >= 2 && primero && partes[1].length >= 3 && !d.destinos.has(sinTildes(partes[1]))) d.destinos.set(sinTildes(partes[1]), primero);
    // Los clientes de la ruta, sin repetir la ciudad (".. D1, Cali.").
    String(r.clientes || '').split(/[,/;.]/).map((x: string) => x.trim()).filter(Boolean)
      .filter((x: string) => !sinTildes(dest).includes(sinTildes(x))).forEach((x: string) => agregarCliente(x));
  });
  (S?.viajes || []).forEach((v: any) => {
    const c = String(v.cliente || '').split(',')[0]; if (c && c !== 'No definido') agregarCliente(c);
    agregarDestino(v.destino); agregarDestino(v.destinoReal);
    const cod = String(v.ruta || v.codigo || '').toUpperCase().trim(); if (cod && !d.rutas.has(pegada(cod))) d.rutas.set(pegada(cod), cod);
  });
  // Los clientes que también son ciudad no se confunden: gana el cliente solo si no es destino.
  return d;
}

export function filtrosVacios(): Filtros {
  return {
    desde: null, hasta: null, diasSemana: [], horaDesde: null, horaHasta: null,
    placas: [], conductores: [], clientes: [], destinos: [], rutas: [], transportadoras: [], estados: [], tiposVehiculo: [],
    no: { placas: [], conductores: [], clientes: [], destinos: [], rutas: [], transportadoras: [], estados: [] },
    extra: null, urgente: null, dobleEntrega: null, split: null, sinConductor: null, conNovedad: null, reasignado: null, conObservacion: null,
    cajasMin: null, cajasMax: null, incluirCancelados: false, libres: [], orden: 'cercano', limite: null, soloFuturos: false
  };
}

/** Convierte la frase en filtros. hoy: la fecha de referencia (por defecto, hoy). */
export function interpretar(frase: string, S: any, hoy: Date = new Date()): Interpretacion {
  hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const dic = armarDiccionario(S);
  const f = filtrosVacios();
  const entendidos: Entendido[] = [];
  let pregunta: 'listar' | 'contar' = 'listar';
  const anota = (tipo: string, texto: string, icono: string) => { if (!entendidos.some(e => e.tipo === tipo && e.texto === texto)) entendidos.push({ tipo, texto, icono }); };

  // Texto normalizado: sin tildes, "13/10" y "bog-cal-d1" se mantienen, el resto de signos se vuelven espacio.
  let texto = sinTildes(frase).replace(/[¿?¡!"'“”()[\]{};]/g, ' ').replace(/,/g, ' , ').replace(/\s+/g, ' ').trim();
  texto = texto.replace(/(\d)\s*(am|pm|a\.m\.|p\.m\.)/g, '$1$2').replace(/\ba\.m\.|\bp\.m\./g, m => m.replace(/\./g, ''));
  if (/\b(cuantos|cuantas|cuanto|cuanta|numero de|total de)\b/.test(texto)) pregunta = 'contar';
  const t = texto.split(' ').filter(Boolean);

  // ---- Fechas ----
  let rango: { desde: Date; hasta: Date; texto: string } | null = null;
  let mesContexto: { m: number; a: number } | null = null;
  const ponerRango = (desde: Date, hasta: Date, txt: string) => {
    if (rango && txt) {
      // Dos fechas (ej. "lunes ... de la semana pasada"): se cruzan.
      const d = desde > rango.desde ? desde : rango.desde, h = hasta < rango.hasta ? hasta : rango.hasta;
      rango = d <= h ? { desde: d, hasta: h, texto: `${rango.texto} · ${txt}` } : { desde, hasta, texto: txt };
    } else rango = { desde, hasta, texto: txt };
  };
  const diasSueltos: Array<{ dia: number; modo: 'todos' | 'este' | 'pasado' | 'proximo' }> = [];
  const anioDe = (m: number, a?: number) => a ?? hoy.getFullYear();

  /** Lee una fecha en t[i]: "13/10", "13-10-2026", "2026-10-13", "13 de octubre", "13" (con mes de contexto). */
  const leerFecha = (i: number): { fecha: Date; usa: number } | null => {
    const w = t[i]; if (!w) return null;
    let m = w.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return { fecha: new Date(+m[1], +m[2] - 1, +m[3]), usa: 1 };
    m = w.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) {
      const a = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : anioDe(+m[2] - 1);
      return { fecha: new Date(a, +m[2] - 1, +m[1]), usa: 1 };
    }
    if (/^\d{1,2}$/.test(w) && +w >= 1 && +w <= 31) {
      // "13 de octubre (de 2026)"
      let j = i + 1; if (t[j] === 'de') j++;
      const mes = mesEn(j);
      if (mes !== null) {
        let usa = j - i + 1; let a = anioDe(mes);
        let k = j + 1; if (t[k] === 'de' || t[k] === 'del') k++;
        if (/^20\d{2}$/.test(t[k] || '')) { a = +t[k]; usa = k - i + 1; }
        mesContexto = { m: mes, a };
        return { fecha: new Date(a, mes, +w), usa };
      }
      // Número suelto: día del mes del que se esté hablando (o el actual).
      const ctx = mesContexto || { m: hoy.getMonth(), a: hoy.getFullYear() };
      // No confundir con cajas, horas o cantidades.
      if (/^(cajas?|caja|horas?|am|pm|dias|viajes|semanas|meses)$/.test(t[i + 1] || '')) return null;
      return { fecha: new Date(ctx.a, ctx.m, +w), usa: 1 };
    }
    return null;
  };
  const mesEn = (j: number): number | null => {
    const w = t[j]; if (!w) return null;
    const k = MESES.indexOf(w); if (k >= 0) return k;
    if (w in MESES_CORTOS) return MESES_CORTOS[w];
    return null;
  };
  const diaSemanaEn = (j: number): number | null => {
    const w = t[j]; if (!w) return null;
    let k = DIAS.indexOf(w); if (k >= 0) return k;
    k = DIAS.indexOf(w.replace(/s$/, '')); if (k >= 0) return k;   // sábados, domingos
    if (w in DIAS_CORTOS) return DIAS_CORTOS[w];
    return null;
  };
  const numeroEn = (j: number): number | null => {
    const w = t[j]; if (!w) return null;
    if (/^\d+$/.test(w)) return +w;
    return NUMEROS[w] ?? null;
  };
  /** Hora en t[j]: "3", "3pm", "15", "15:30", "3:30pm" (+ "de la tarde"). */
  const leerHora = (j: number): { min: number; usa: number } | null => {
    const w = t[j]; if (!w) return null;
    const m = w.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|h|hrs)?$/);
    if (!m || +m[1] > 23) return null;
    let h = +m[1]; const mm = m[2] ? +m[2] : 0; let usa = 1;
    let sufijo = m[3] || '';
    if (!sufijo && (t[j + 1] === 'am' || t[j + 1] === 'pm')) { sufijo = t[j + 1]; usa++; }
    const resto = t.slice(j + usa, j + usa + 3).join(' ');
    if (/^(de la|en la|por la) (tarde|noche)/.test(resto)) { if (h < 12) h += 12; usa += 3; }
    else if (/^(de la|en la|por la) manana/.test(resto)) { usa += 3; }
    else if (sufijo === 'pm' && h < 12) h += 12;
    else if (sufijo === 'am' && h === 12) h = 0;
    else if (!sufijo && h >= 1 && h <= 5) h += 12;     // "a las 3" = 3 de la tarde; "a las 6" = 6 de la mañana
    return { min: h * 60 + mm, usa };
  };
  const textoHora = (min: number) => { const h = Math.floor(min / 60), m = min % 60; const h12 = h % 12 || 12; return `${h12}${m ? ':' + String(m).padStart(2, '0') : ''} ${h < 12 ? 'a. m.' : 'p. m.'}`; };

  let negar = false;
  let i = 0;
  const frase2 = (j: number, n: number) => t.slice(j, j + n).join(' ');
  const consumir = (n: number) => { i += n; };

  while (i < t.length) {
    const w = t[i];
    const sig = t[i + 1] || '';
    let hecho = 0;

    // ---------- Negaciones ----------
    if (['sin', 'excepto', 'menos', 'salvo', 'quitando', 'excluyendo', 'ni'].includes(w) || (w === 'no' && !/^(han|ha|hayan|haya)$/.test(sig)) || (w === 'que' && sig === 'no' && !/^(han|ha)$/.test(t[i + 2] || ''))) {
      // Casos que no son negación de una cosa: "sin conductor", "sin salir", "menos de 300 cajas".
      if (w === 'sin' && /^(conductor|chofer|asignar|asignacion|piloto)$/.test(sig)) { f.sinConductor = true; anota('Conductor', 'sin conductor', 'bi-person-x'); consumir(2); continue; }
      if (w === 'sin' && sig === 'salir') { /* lo toma el bloque de estados */ }
      else if (w === 'menos' && /^(de|que)$/.test(sig)) { /* lo toma el bloque de cajas */ }
      else { negar = true; consumir(w === 'que' ? 2 : 1); continue; }
    }

    // ---------- Placas (antes que las fechas: "LUN 428" no es "lunes") ----------
    {
      let placa: string | null = null; let usa = 0;
      for (let n = 3; n >= 1 && !placa; n--) { const k = pegada(frase2(i, n)); if (k.length >= 4 && dic.placas.has(k)) { placa = dic.placas.get(k)!; usa = n; } }
      if (!placa && /^\d{3}$/.test(w) && dic.numerosPlaca.has(w) && !/^(cajas?)$/.test(sig)) {
        const lista = dic.numerosPlaca.get(w)!;
        if (negar) f.no.placas.push(...lista); else f.placas.push(...lista);
        anota(negar ? 'Excluye' : 'Placa', (negar ? 'sin ' : '') + lista.join(' o '), 'bi-truck'); negar = false; consumir(1); continue;
      }
      if (placa) { if (negar) f.no.placas.push(placa); else f.placas.push(placa); anota(negar ? 'Excluye' : 'Placa', (negar ? 'sin ' : '') + placa, 'bi-truck'); negar = false; consumir(usa); continue; }
    }

    // ---------- Pregunta y orden ----------
    if (/^(ultimo|ultima)$/.test(w) && /^(viaje|viajes|vez|salida)$/.test(sig)) { f.orden = 'desc'; f.limite = 1; f.hasta = f.hasta || iso(hoy); anota('Orden', 'el último', 'bi-sort-down'); consumir(2); continue; }
    if (/^(ultimos|ultimas)$/.test(w) && numeroEn(i + 1) !== null && /^(viajes|salidas)$/.test(t[i + 2] || '')) { f.orden = 'desc'; f.limite = numeroEn(i + 1)!; f.hasta = f.hasta || iso(hoy); anota('Orden', `los últimos ${f.limite}`, 'bi-sort-down'); consumir(3); continue; }
    if (/^(proximo|proxima|siguiente)$/.test(w) && /^(viaje|salida)$/.test(sig)) { f.orden = 'asc'; f.limite = 1; f.soloFuturos = true; anota('Orden', 'el próximo', 'bi-sort-up'); consumir(2); continue; }
    if (/^(proximos|siguientes)$/.test(w) && numeroEn(i + 1) !== null && /^(viajes|salidas)$/.test(t[i + 2] || '')) { f.orden = 'asc'; f.limite = numeroEn(i + 1)!; f.soloFuturos = true; anota('Orden', `los próximos ${f.limite}`, 'bi-sort-up'); consumir(3); continue; }
    if (/^(primer|primero|primera)$/.test(w) && /^(viaje|salida)$/.test(sig)) { f.orden = 'asc'; f.limite = 1; anota('Orden', 'el primero', 'bi-sort-up'); consumir(2); continue; }
    if (/^(ordenado|ordenados|ordena)$/.test(w) || (w === 'mas' && /^(recientes|nuevos)$/.test(sig))) { if (w === 'mas') { f.orden = 'desc'; anota('Orden', 'más recientes primero', 'bi-sort-down'); consumir(2); continue; } }
    if (w === 'incluye' || w === 'incluyendo' || w === 'con' && /^(cancelados|canceladas)$/.test(sig) && t[i - 1] === 'incluso') { f.incluirCancelados = true; consumir(1); continue; }

    // ---------- Fechas relativas ----------
    const tres = frase2(i, 3), dos = frase2(i, 2);
    if (tres === 'pasado manana' || dos === 'pasado manana') { const d = sumar(hoy, 2); ponerRango(d, d, 'pasado mañana'); consumir(2); continue; }
    if ((w === 'antes' && dos === 'antes de' && t[i + 2] === 'ayer') ) { const d = sumar(hoy, -2); ponerRango(d, d, 'antier'); consumir(3); continue; }
    if (w === 'antier' || w === 'anteayer' || w === 'antenoche') { const d = sumar(hoy, -2); ponerRango(d, d, 'antier'); consumir(1); continue; }
    if (w === 'hoy' || (w === 'esta' && sig === 'noche' && false)) { ponerRango(hoy, hoy, 'hoy'); consumir(1); continue; }
    if (w === 'ayer') { const d = sumar(hoy, -1); ponerRango(d, d, 'ayer'); consumir(1); continue; }
    if (w === 'manana') {
      const antes = t[i - 1] || '';
      if (/^(la|las)$/.test(antes) || /^(en|por|de|a)$/.test(antes)) {
        // "en la mañana", "por la mañana": horario.
        f.horaDesde = 0; f.horaHasta = 12 * 60; anota('Horario', 'en la mañana', 'bi-sunrise');
      } else { const d = sumar(hoy, 1); ponerRango(d, d, 'mañana'); }
      consumir(1); continue;
    }
    // Horario del día.
    if (/^(madrugada)$/.test(w)) { f.horaDesde = 0; f.horaHasta = 6 * 60; anota('Horario', 'de madrugada', 'bi-moon'); consumir(1); continue; }
    if (/^(tarde)$/.test(w) && /^(la|en|por|de)$/.test(t[i - 1] || '')) { f.horaDesde = 12 * 60; f.horaHasta = 18 * 60; anota('Horario', 'en la tarde', 'bi-brightness-high'); consumir(1); continue; }
    if (/^(noche)$/.test(w) && /^(la|en|por|de)$/.test(t[i - 1] || '')) { f.horaDesde = 18 * 60; f.horaHasta = 24 * 60; anota('Horario', 'en la noche', 'bi-moon-stars'); consumir(1); continue; }
    if (w === 'temprano') { f.horaDesde = 0; f.horaHasta = 9 * 60; anota('Horario', 'temprano (antes de las 9)', 'bi-sunrise'); consumir(1); continue; }
    if (/^(antes|despues|luego|pasadas)$/.test(w) && /^(de|del)$/.test(sig) && /^(las|la)$/.test(t[i + 2] || '')) {
      const h = leerHora(i + 3);
      if (h) { if (w === 'antes') { f.horaHasta = h.min; anota('Horario', `antes de las ${textoHora(h.min)}`, 'bi-clock'); } else { f.horaDesde = h.min; anota('Horario', `después de las ${textoHora(h.min)}`, 'bi-clock'); } consumir(3 + h.usa); continue; }
    }
    if (w === 'a' && /^(las|la)$/.test(sig)) {
      const h = leerHora(i + 2);
      if (h) { f.horaDesde = h.min; f.horaHasta = h.min + 60; anota('Horario', `a las ${textoHora(h.min)}`, 'bi-clock'); consumir(2 + h.usa); continue; }
    }
    if (w === 'entre' && /^(las|la)$/.test(sig)) {
      const h1 = leerHora(i + 2);
      if (h1 && /^(y|a)$/.test(t[i + 2 + h1.usa] || '')) {
        let j = i + 3 + h1.usa; if (/^(las|la)$/.test(t[j] || '')) j++;
        const h2 = leerHora(j);
        if (h2) { f.horaDesde = h1.min; f.horaHasta = h2.min; anota('Horario', `entre las ${textoHora(h1.min)} y las ${textoHora(h2.min)}`, 'bi-clock'); consumir(j - i + h2.usa); continue; }
      }
    }

    // Semanas, meses, años.
    const semana = (desplaza: number, txt: string, usa: number) => { const l = sumar(lunesDe(hoy), desplaza * 7); ponerRango(l, sumar(l, 6), txt); consumir(usa); };
    if (dos === 'esta semana' || dos === 'semana actual' || tres === 'en la semana') { semana(0, 'esta semana', tres === 'en la semana' ? 3 : 2); continue; }
    if (dos === 'semana pasada' || dos === 'semana anterior' || tres === 'la anterior semana' || dos === 'pasada semana') { semana(-1, 'la semana pasada', tres === 'la anterior semana' ? 3 : 2); continue; }
    if (dos === 'proxima semana' || dos === 'siguiente semana' || dos === 'semana entrante' || tres === 'semana que viene' || tres === 'la otra semana') { semana(1, 'la próxima semana', tres === 'semana que viene' || tres === 'la otra semana' ? 3 : 2); continue; }
    if (tres === 'fin de semana') {
      const despues = t[i + 3] || '';
      const desplaza = /^(pasado|anterior)$/.test(despues) || /^(el|este)$/.test(t[i - 1] || '') && false ? -1 : (/^(proximo|siguiente)$/.test(t[i - 1] || '') ? 1 : 0);
      const des = /^(pasado|anterior)$/.test(despues) ? -1 : desplaza;
      const sab = sumar(lunesDe(hoy), 5 + des * 7);
      ponerRango(sab, sumar(sab, 1), des === -1 ? 'el fin de semana pasado' : des === 1 ? 'el próximo fin de semana' : 'este fin de semana');
      consumir(/^(pasado|anterior)$/.test(despues) ? 4 : 3); continue;
    }
    if (dos === 'este mes' || dos === 'mes actual' || tres === 'en el mes') { ponerRango(new Date(hoy.getFullYear(), hoy.getMonth(), 1), finDeMes(hoy.getFullYear(), hoy.getMonth()), 'este mes'); mesContexto = { m: hoy.getMonth(), a: hoy.getFullYear() }; consumir(tres === 'en el mes' ? 3 : 2); continue; }
    if (dos === 'mes pasado' || dos === 'mes anterior' || tres === 'el anterior mes') { const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1); ponerRango(d, finDeMes(d.getFullYear(), d.getMonth()), 'el mes pasado'); mesContexto = { m: d.getMonth(), a: d.getFullYear() }; consumir(tres === 'el anterior mes' ? 3 : 2); continue; }
    if (dos === 'proximo mes' || dos === 'siguiente mes' || tres === 'mes que viene' || dos === 'mes entrante') { const d = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1); ponerRango(d, finDeMes(d.getFullYear(), d.getMonth()), 'el próximo mes'); mesContexto = { m: d.getMonth(), a: d.getFullYear() }; consumir(tres === 'mes que viene' ? 3 : 2); continue; }
    if (dos === 'este ano' || dos === 'ano actual') { ponerRango(new Date(hoy.getFullYear(), 0, 1), new Date(hoy.getFullYear(), 11, 31), 'este año'); consumir(2); continue; }
    if (dos === 'ano pasado' || dos === 'ano anterior') { const a = hoy.getFullYear() - 1; ponerRango(new Date(a, 0, 1), new Date(a, 11, 31), `${a}`); consumir(2); continue; }
    if (dos === 'primera quincena' || dos === 'segunda quincena') {
      let usa = 2; let mes: number | null = null;
      if (/^(de|del)$/.test(t[i + 2] || '') && mesEn(i + 3) !== null) { mes = mesEn(i + 3); usa = 4; } else if (mesEn(i + 2) !== null) { mes = mesEn(i + 2); usa = 3; }
      const ctx = mes !== null ? { m: mes, a: anioDe(mes) } : (mesContexto || { m: hoy.getMonth(), a: hoy.getFullYear() });
      const primera = w === 'primera';
      ponerRango(new Date(ctx.a, ctx.m, primera ? 1 : 16), primera ? new Date(ctx.a, ctx.m, 15) : finDeMes(ctx.a, ctx.m), `${primera ? 'primera' : 'segunda'} quincena de ${NOMBRE_MES[ctx.m]}`);
      consumir(usa); continue;
    }
    if (tres === 'inicio de mes' || tres === 'principio de mes' || tres === 'comienzo de mes') { const ctx = mesContexto || { m: hoy.getMonth(), a: hoy.getFullYear() }; ponerRango(new Date(ctx.a, ctx.m, 1), new Date(ctx.a, ctx.m, 10), 'inicio de mes'); consumir(3); continue; }
    if (tres === 'fin de mes' || tres === 'final de mes' || tres === 'cierre de mes') { const ctx = mesContexto || { m: hoy.getMonth(), a: hoy.getFullYear() }; const fin = finDeMes(ctx.a, ctx.m); ponerRango(sumar(fin, -6), fin, 'fin de mes'); consumir(3); continue; }
    // "últimos 7 días", "próximas 2 semanas", "hace 3 días", "dentro de 5 días", "en 2 semanas".
    if (/^(ultimos|ultimas|pasados|pasadas|proximos|proximas|siguientes)$/.test(w) && numeroEn(i + 1) !== null && /^(dias|semanas|meses)$/.test(t[i + 2] || '')) {
      const n = numeroEn(i + 1)!; const u = t[i + 2]; const pasado = /^(ultimos|ultimas|pasados|pasadas)$/.test(w);
      const dias = u === 'dias' ? n : u === 'semanas' ? n * 7 : n * 30;
      if (pasado) ponerRango(sumar(hoy, -dias + 1), hoy, `últimos ${n} ${u}`); else ponerRango(hoy, sumar(hoy, dias - 1), `próximos ${n} ${u}`);
      consumir(3); continue;
    }
    if (/^(ultimos|ultimas)$/.test(w) && /^(dias|semanas)$/.test(sig)) { const dias = sig === 'dias' ? 7 : 14; ponerRango(sumar(hoy, -dias + 1), hoy, `últimos ${dias} días`); consumir(2); continue; }
    if (w === 'hace' && numeroEn(i + 1) !== null && /^(dia|dias|semana|semanas|mes|meses)$/.test(t[i + 2] || '')) {
      const n = numeroEn(i + 1)!; const u = t[i + 2];
      if (u.startsWith('dia')) { const d = sumar(hoy, -n); ponerRango(d, d, `hace ${n} día${n > 1 ? 's' : ''}`); }
      else if (u.startsWith('semana')) { const l = sumar(lunesDe(hoy), -7 * n); ponerRango(l, sumar(l, 6), `hace ${n} semana${n > 1 ? 's' : ''}`); }
      else { const d = new Date(hoy.getFullYear(), hoy.getMonth() - n, 1); ponerRango(d, finDeMes(d.getFullYear(), d.getMonth()), `hace ${n} mes${n > 1 ? 'es' : ''}`); }
      consumir(3); continue;
    }
    if ((w === 'dentro' && sig === 'de' && numeroEn(i + 2) !== null && /^(dias|semanas)$/.test(t[i + 3] || '')) || (w === 'en' && numeroEn(i + 1) !== null && /^(dias|semanas)$/.test(t[i + 2] || ''))) {
      const off = w === 'dentro' ? 1 : 0; const n = numeroEn(i + 1 + off)!; const u = t[i + 2 + off];
      if (u === 'dias') { const d = sumar(hoy, n); ponerRango(d, d, `dentro de ${n} días`); } else { const l = sumar(lunesDe(hoy), 7 * n); ponerRango(l, sumar(l, 6), `dentro de ${n} semanas`); }
      consumir(3 + off); continue;
    }
    // "del 5 al 10 (de octubre)", "entre el 5 y el 10", "desde el 5 hasta el 20", "de octubre a diciembre".
    if (/^(del|de|entre|desde)$/.test(w)) {
      let j = i + 1; if (t[j] === 'el' || t[j] === 'la') j++;
      const mesIni = mesEn(j);
      if (mesIni !== null && /^(a|al|hasta|y)$/.test(t[j + 1] || '') && mesEn(j + 2) !== null) {
        const mesFin = mesEn(j + 2)!; let a = hoy.getFullYear(); let usa = j + 3 - i;
        if (/^20\d{2}$/.test(t[j + 3] || '')) { a = +t[j + 3]; usa++; } else if ((t[j + 3] === 'de' || t[j + 3] === 'del') && /^20\d{2}$/.test(t[j + 4] || '')) { a = +t[j + 4]; usa += 2; }
        ponerRango(new Date(a, mesIni, 1), finDeMes(mesFin < mesIni ? a + 1 : a, mesFin), `de ${NOMBRE_MES[mesIni]} a ${NOMBRE_MES[mesFin]}`);
        consumir(usa); continue;
      }
      // Fechas por número: se mira primero si después viene el mes (para que "del 5 al 10 de octubre" use octubre).
      if (/^\d/.test(t[j] || '')) {
        let k = j + 1;
        while (k < t.length && !/^(al|a|y|hasta)$/.test(t[k]) && k - j < 4) k++;
        if (/^(al|a|y|hasta)$/.test(t[k] || '')) {
          let k2 = k + 1; if (t[k2] === 'el' || t[k2] === 'la') k2++;
          // Mes que viene después del segundo número, si hay.
          const guarda = mesContexto;
          const mesDespues = (() => { let q = k2 + 1; if (t[q] === 'de' || t[q] === 'del') q++; return mesEn(q); })();
          if (mesDespues !== null && mesEn(j + 1) === null && mesEn(j + 2) === null) mesContexto = { m: mesDespues, a: anioDe(mesDespues) };
          const f1 = leerFecha(j); const f2 = f1 ? leerFecha(k2) : null;
          if (f1 && f2) {
            let hastaF = f2.fecha; if (hastaF < f1.fecha && f2.usa === 1 && /^\d{1,2}$/.test(t[k2])) hastaF = new Date(f1.fecha.getFullYear(), f1.fecha.getMonth() + 1, hastaF.getDate());
            ponerRango(f1.fecha, hastaF, `del ${fechaBonita(iso(f1.fecha))} al ${fechaBonita(iso(hastaF))}`);
            consumir(k2 - i + f2.usa); continue;
          }
          mesContexto = guarda;
        }
        if (w === 'desde') { const f1 = leerFecha(j); if (f1) { ponerRango(f1.fecha, new Date(2100, 0, 1), `desde el ${fechaBonita(iso(f1.fecha))}`); consumir(j - i + f1.usa); continue; } }
      }
      if (w === 'desde' && diaSemanaEn(j) !== null) { /* "desde el lunes": cae abajo */ }
    }
    if (w === 'hasta') {
      let j = i + 1; if (t[j] === 'el' || t[j] === 'la') j++;
      const f1 = leerFecha(j);
      if (f1) { const desdeR: Date = rango ? (rango as any).desde : new Date(2000, 0, 1); rango = { desde: desdeR, hasta: f1.fecha, texto: `${rango ? (rango as any).texto + ' ' : ''}hasta el ${fechaBonita(iso(f1.fecha))}` }; consumir(j - i + f1.usa); continue; }
      if (dos === 'hasta hoy' || tres === 'hasta el dia de hoy') { const desdeR: Date = rango ? (rango as any).desde : new Date(2000, 0, 1); rango = { desde: desdeR, hasta: hoy, texto: 'hasta hoy' }; consumir(dos === 'hasta hoy' ? 2 : 5); continue; }
    }
    // Fecha suelta: "13/10", "2026-10-13", "13 de octubre", "el 13".
    if (/^\d/.test(w) && !(/^\d{3,}$/.test(w) && w.length !== 4)) {
      const esCajas = /^(cajas?|caja)$/.test(sig);
      if (!esCajas && !/^20\d{2}$/.test(w)) {
        const f1 = leerFecha(i);
        // Un número suelto solo es fecha si viene precedido de "el"/"día" o es tipo 13/10.
        if (f1 && (f1.usa > 1 || /[/-]/.test(w) || /^(el|dia|los|del)$/.test(t[i - 1] || ''))) { ponerRango(f1.fecha, f1.fecha, `el ${fechaBonita(iso(f1.fecha))}`); consumir(f1.usa); continue; }
      }
    }
    // Mes solo ("en septiembre", "octubre 2025", "sep").
    const mesSolo = mesEn(i);
    if (mesSolo !== null && !(w === 'mar' && !/^(de|en|del)$/.test(t[i - 1] || ''))) {
      let a = anioDe(mesSolo); let usa = 1;
      if (/^20\d{2}$/.test(sig)) { a = +sig; usa = 2; } else if ((sig === 'de' || sig === 'del') && /^20\d{2}$/.test(t[i + 2] || '')) { a = +t[i + 2]; usa = 3; }
      mesContexto = { m: mesSolo, a };
      ponerRango(new Date(a, mesSolo, 1), finDeMes(a, mesSolo), `${NOMBRE_MES[mesSolo]}${a !== hoy.getFullYear() ? ' ' + a : ''}`);
      consumir(usa); continue;
    }
    if (/^20\d{2}$/.test(w) && !/^(cajas?)$/.test(sig)) { ponerRango(new Date(+w, 0, 1), new Date(+w, 11, 31), w); consumir(1); continue; }
    // Días de la semana: "el lunes", "los viernes", "el martes pasado", "el próximo jueves".
    const ds = diaSemanaEn(i);
    if (ds !== null && !(w === 'mar' && !/^(el|los|del|este|proximo)$/.test(t[i - 1] || ''))) {
      const antes = t[i - 1] || '', antes2 = t[i - 2] || '';
      let modo: 'todos' | 'este' | 'pasado' | 'proximo' = 'este'; let usa = 1;
      if (/^(sabados|domingos)$/.test(w) || antes === 'los' || antes === 'todos' || (antes === 'cada')) modo = 'todos';
      if (/^(pasado|anterior)$/.test(sig)) { modo = 'pasado'; usa = 2; }
      if (/^(proximo|siguiente|entrante)$/.test(antes) || /^(que)$/.test(sig) && t[i + 2] === 'viene') { modo = 'proximo'; if (sig === 'que') usa = 3; }
      if (/^(proximo|siguiente|entrante)$/.test(sig)) { modo = 'proximo'; usa = 2; }
      void antes2;
      diasSueltos.push({ dia: ds, modo });
      consumir(usa); continue;
    }

    // ---------- Cajas ----------
    {
      const m1 = /^(mas|mayor|mayores|arriba|encima|sobre|superior|>|>=|minimo|almenos)$/.test(w);
      const m2 = /^(menos|menor|menores|debajo|bajo|inferior|<|<=|maximo|hasta)$/.test(w);
      if (m1 || m2) {
        let j = i + 1; while (/^(de|que|a|al|las|los|del)$/.test(t[j] || '')) j++;
        const n = numeroEn(j);
        if (n !== null && /^(cajas?|caja)$/.test(t[j + 1] || '')) {
          if (m1) { f.cajasMin = n + (/^(mas|mayor|mayores|arriba|encima|sobre|superior|>)$/.test(w) ? 1 : 0); anota('Cajas', `más de ${n} cajas`, 'bi-box-seam'); }
          else { f.cajasMax = n - (/^(menos|menor|menores|debajo|bajo|inferior|<)$/.test(w) ? 1 : 0); anota('Cajas', `menos de ${n} cajas`, 'bi-box-seam'); }
          consumir(j - i + 2); continue;
        }
      }
      if (/^\d+$/.test(w) && /^(cajas?|caja)$/.test(sig)) { f.cajasMin = +w; f.cajasMax = +w; anota('Cajas', `${w} cajas`, 'bi-box-seam'); consumir(2); continue; }
      if (w === 'entre' && /^\d+$/.test(sig) && t[i + 2] === 'y' && /^\d+$/.test(t[i + 3] || '') && /^cajas?$/.test(t[i + 4] || '')) { f.cajasMin = +sig; f.cajasMax = +t[i + 3]; anota('Cajas', `entre ${sig} y ${t[i + 3]} cajas`, 'bi-box-seam'); consumir(5); continue; }
      if (/^(llenos|llenas|completos|full)$/.test(w)) { f.cajasMin = 600; anota('Cajas', 'llenos (600+ cajas)', 'bi-box-seam'); consumir(1); continue; }
    }

    // ---------- Estados ----------
    {
      let est: [string[], string[], string] | null = null; let usa = 0;
      for (const e of ESTADOS) {
        for (const pal of e[0]) { const n = pal.split(' ').length; if (frase2(i, n) === pal && n > usa) { est = e; usa = n; } }
      }
      if (est) {
        if (negar) { f.no.estados.push(...est[1]); anota('Excluye', `sin ${est[2]}`, 'bi-dash-circle'); negar = false; }
        else { f.estados.push(...est[1]); if (est[1].includes('Cancelado')) f.incluirCancelados = true; anota('Estado', est[2], 'bi-flag'); }
        consumir(usa); continue;
      }
    }

    // ---------- Tipos y marcas del viaje ----------
    if (/^(extra|extras|adicional|adicionales)$/.test(w)) { f.extra = !negar; anota('Tipo', negar ? 'sin extras' : 'extras', 'bi-plus-circle'); negar = false; consumir(1); continue; }
    if (/^(fijo|fijos|normales|regulares)$/.test(w) || dos === 'de matriz' || dos === 'de la matriz') { f.extra = false; anota('Tipo', 'fijos (de la matriz)', 'bi-grid-3x3'); consumir(w.startsWith('de') ? (dos === 'de matriz' ? 2 : 3) : 1); continue; }
    if (/^(urgente|urgentes|prioritario|prioritarios|prioridad|afan|afanes)$/.test(w)) { f.urgente = !negar; anota('Tipo', negar ? 'no urgentes' : 'urgentes', 'bi-exclamation-octagon'); negar = false; consumir(1); continue; }
    if (dos === 'doble entrega' || dos === 'dos entregas' || dos === 'dos clientes' || dos === 'dobles entregas') { f.dobleEntrega = !negar; anota('Tipo', negar ? 'una sola entrega' : 'doble entrega', 'bi-pin-map'); negar = false; consumir(2); continue; }
    if (/^(split|splits|divididos|dividido|partidos|partido)$/.test(w)) { f.split = !negar; anota('Tipo', negar ? 'sin dividir' : 'divididos (split)', 'bi-scissors'); negar = false; consumir(1); continue; }
    if (/^(novedad|novedades|problema|problemas|incidente|incidentes)$/.test(w)) { f.conNovedad = !negar; anota('Tipo', negar ? 'sin novedades' : 'con novedades', 'bi-lightning'); negar = false; consumir(1); continue; }
    if (/^(reasignado|reasignados|reasignada|cambiados|movidos|varado|varados|averiados|averia)$/.test(w) || dos === 'plan b') { f.reasignado = !negar; anota('Tipo', negar ? 'no reasignados' : 'reasignados / varados', 'bi-life-preserver'); negar = false; consumir(dos === 'plan b' ? 2 : 1); continue; }
    if (/^(observacion|observaciones|nota|notas|comentario|comentarios)$/.test(w)) { f.conObservacion = !negar; anota('Tipo', negar ? 'sin observaciones' : 'con observaciones', 'bi-chat-left-text'); negar = false; consumir(1); continue; }
    if (/^(cancelados|canceladas)$/.test(w) && /^(incluso|incluye|incluyendo|tambien)$/.test(t[i - 1] || '')) { f.incluirCancelados = true; consumir(1); continue; }
    if (w === 'con' && /^(conductor|chofer)$/.test(sig) && !dic.palabrasConductor.has(t[i + 2] || '')) { f.sinConductor = false; anota('Conductor', 'con conductor', 'bi-person-check'); consumir(2); continue; }

    // ---------- Transportadoras ----------
    {
      const tr = /^(makand|propio|propios|propia|propias|nuestros|nuestras|flota)$/.test(w) ? ['Makand'] : /^(polar)$/.test(w) ? ['Polar']
        : /^(arsitrans|arsi|arsitran)$/.test(w) ? ['Arsitrans'] : /^(terceros|tercero|externos|externo|tercerizados|subcontratados)$/.test(w) ? ['Polar', 'Arsitrans'] : null;
      if (tr) {
        if (negar) { f.no.transportadoras.push(...tr); anota('Excluye', 'sin ' + tr.join(' ni '), 'bi-dash-circle'); }
        else { f.transportadoras.push(...tr); anota('Transportadora', tr.join(' o '), 'bi-building'); }
        negar = false; consumir(w === 'flota' && sig === 'propia' ? 2 : 1); continue;
      }
    }

    // ---------- Rutas por código ----------
    {
      const k = pegada(w);
      if (k.length >= 5 && /[a-z]/.test(k) && /-/.test(w)) {
        const cods = [...dic.rutas.entries()].filter(([c]) => c === k || c.includes(k)).map(([, v]) => v);
        if (cods.length) { if (negar) f.no.rutas.push(...cods); else f.rutas.push(...cods); anota(negar ? 'Excluye' : 'Ruta', (negar ? 'sin ' : '') + (cods.length > 3 ? `${cods.length} rutas con "${w.toUpperCase()}"` : cods.join(' o ')), 'bi-signpost-split'); negar = false; consumir(1); continue; }
      }
      if (dic.rutas.has(k)) { const c = dic.rutas.get(k)!; if (negar) f.no.rutas.push(c); else f.rutas.push(c); anota(negar ? 'Excluye' : 'Ruta', (negar ? 'sin ' : '') + c, 'bi-signpost-split'); negar = false; consumir(1); continue; }
    }

    // ---------- Clientes y destinos (frases de varias palabras primero) ----------
    {
      let hit: { tipo: 'cliente' | 'destino'; nombre: string; usa: number } | null = null;
      for (let n = 3; n >= 1 && !hit; n--) {
        const k = frase2(i, n).replace(/[^a-z0-9 ]/g, '').trim();
        if (!k || RELLENO.has(k)) continue;
        // "cali" puede ser cliente "D1, Cali" y destino: se prefiere destino si existe.
        if (dic.destinos.has(k)) hit = { tipo: 'destino', nombre: dic.destinos.get(k)!, usa: n };
        else if (dic.clientes.has(k)) hit = { tipo: 'cliente', nombre: dic.clientes.get(k)!, usa: n };
      }
      if (!hit && w.length >= 5 && !RELLENO.has(w)) {
        const d = [...dic.destinos.keys()].find(k => !k.includes(' ') && parecido(w, k));
        const c = d ? null : [...dic.clientes.keys()].find(k => !k.includes(' ') && parecido(w, k));
        if (d) hit = { tipo: 'destino', nombre: dic.destinos.get(d)!, usa: 1 }; else if (c) hit = { tipo: 'cliente', nombre: dic.clientes.get(c)!, usa: 1 };
      }
      if (hit) {
        if (hit.tipo === 'destino') { if (negar) f.no.destinos.push(hit.nombre); else f.destinos.push(hit.nombre); anota(negar ? 'Excluye' : 'Destino', (negar ? 'sin ' : '') + hit.nombre, 'bi-geo-alt'); }
        else { if (negar) f.no.clientes.push(hit.nombre); else f.clientes.push(hit.nombre); anota(negar ? 'Excluye' : 'Cliente', (negar ? 'sin ' : '') + hit.nombre, 'bi-shop'); }
        negar = false; consumir(hit.usa); continue;
      }
    }

    // ---------- Tipo de vehículo ----------
    {
      const tv = /^(tractomula|tractomulas|mula|mulas)$/.test(w) ? 'tractomula' : /^(furgon|furgones|refrigerado|refrigerados|thermo|termo)$/.test(w) ? 'furgon' : (dos === 'camion sencillo' || /^(sencillo|sencillos)$/.test(w)) ? 'sencillo' : null;
      if (tv) {
        const tipos = [...dic.tiposVehiculo.entries()].filter(([k]) => k.includes(tv)).map(([, v]) => v);
        // Si la flota no tiene ese tipo, se filtra igual (no hay viajes así) y se dice.
        f.tiposVehiculo.push(...(tipos.length ? tipos : [tv]));
        anota('Vehículo', tipos.length ? tipos.join(' o ') : `${tv} (no hay en la flota)`, 'bi-truck-front');
        consumir(dos === 'camion sencillo' ? 2 : 1); continue;
      }
    }

    // ---------- Conductores (por apellido o nombre, aunque esté mal escrito) ----------
    if (w.length >= 3 && !RELLENO.has(w) && !/^\d+$/.test(w)) {
      let candidatos: Set<string> | null = null; let usa = 0;
      for (let n = 0; n < 4; n++) {
        const pal = t[i + n]; if (!pal || RELLENO.has(pal) || pal.length < 3) break;
        let set = dic.palabrasConductor.get(pal);
        if (!set) { const parecida = [...dic.palabrasConductor.keys()].find(k => parecido(pal, k)); if (parecida) set = dic.palabrasConductor.get(parecida); }
        if (!set) break;
        const cruce: Set<string> = candidatos ? new Set([...candidatos].filter(x => set!.has(x))) : new Set(set);
        if (!cruce.size) break;
        candidatos = cruce; usa = n + 1;
      }
      if (candidatos && usa) {
        const lista = [...candidatos];
        if (negar) f.no.conductores.push(...lista); else f.conductores.push(...lista);
        anota(negar ? 'Excluye' : 'Conductor', (negar ? 'sin ' : '') + (lista.length > 2 ? `${lista.length} conductores "${t.slice(i, i + usa).join(' ')}"` : lista.join(' o ')), 'bi-person');
        negar = false; consumir(usa); continue;
      }
    }

    // ---------- Relleno y lo que no se entendió ----------
    if (!RELLENO.has(w) && w !== ',' && w.length >= 2 && !/^(conductor|chofer|placa|cliente|ruta)$/.test(w)) f.libres.push(w);
    negar = negar && RELLENO.has(w);
    consumir(1);
  }

  // Días de la semana sueltos.
  diasSueltos.forEach(d => {
    if (d.modo === 'todos' || rango) { if (!f.diasSemana.includes(d.dia)) f.diasSemana.push(d.dia); anota('Día', `los ${NOMBRE_DIA[d.dia]}${d.dia === 0 || d.dia === 6 ? 's' : ''}`, 'bi-calendar-week'); return; }
    const l = lunesDe(hoy); let fecha = sumar(l, (d.dia + 6) % 7);
    if (d.modo === 'pasado') { if (fecha >= hoy) fecha = sumar(fecha, -7); }
    else if (d.modo === 'proximo') { if (fecha <= hoy) fecha = sumar(fecha, 7); }
    ponerRango(fecha, fecha, `el ${NOMBRE_DIA[d.dia]} ${fecha.getDate()}/${fecha.getMonth() + 1}`);
  });
  if (rango) {
    const r = rango as { desde: Date; hasta: Date; texto: string };
    f.desde = iso(r.desde); f.hasta = r.hasta.getFullYear() >= 2100 ? null : iso(r.hasta);
    if (r.desde.getFullYear() <= 2000) f.desde = null;
    entendidos.unshift({ tipo: 'Fecha', texto: r.texto, icono: 'bi-calendar-event' });
  }
  if (f.libres.length) entendidos.push({ tipo: 'Texto', texto: f.libres.map(x => `"${x}"`).join(' '), icono: 'bi-fonts' });

  const algo = entendidos.some(e => e.tipo !== 'Texto') || f.libres.length > 0;
  return { filtros: f, entendidos, pregunta, algo };
}

const SIN_CONDUCTOR = /^(|sin conductor|sin asignar|asignado|no definido|-|n\/a)$/i;

/** Placa -> conductor titular (los viajes que no anotan conductor van con el del vehículo). */
export function titularesPorPlaca(S: any): Map<string, string> {
  const m = new Map<string, string>();
  (S?.vehiculos || []).forEach((v: any) => { const c = String(v.cond || v.conductor || '').trim(); if (c && !SIN_CONDUCTOR.test(c)) m.set(pegada(v.p || v.placa), c); });
  (S?.conductores || []).forEach((c: any) => { const p = pegada(c.veh || c.placa); const n = String(c.nom || c.nombre || '').trim(); if (p && n) m.set(p, n); });
  return m;
}
/** Conductor del viaje: el anotado, o el titular del vehículo. */
export function conductorDelViaje(v: any, titular: Map<string, string>): string {
  const c = String(v.cond || '').trim();
  if (c && !SIN_CONDUCTOR.test(c)) return c;
  return titular.get(pegada(v.p || v.placa)) || '';
}

const enMinutos = (h: string): number | null => { const m = String(h || '').match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };

/** Aplica los filtros a los viajes. horaDe: cómo saber la hora de salida de un viaje. */
export function filtrarViajes(f: Filtros, S: any, horaDe: (v: any) => string = v => v.hora || '', hoy: Date = new Date()): any[] {
  const hoyIso = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()));
  const tipoDe = new Map<string, string>();
  (S?.vehiculos || []).forEach((v: any) => tipoDe.set(pegada(v.p || v.placa), String(v.tipo || v.t || '')));
  const titular = titularesPorPlaca(S);
  const en = (lista: string[], valor: string) => lista.some(x => sinTildes(x) === sinTildes(valor));
  const contiene = (lista: string[], valor: string) => lista.some(x => sinTildes(valor).includes(sinTildes(x)));
  const textoViaje = (v: any) => sinTildes([v.ruta, v.codigo, v.destino, v.destinoReal, v.cliente, v.cli, v.cli2, v.cond, v.p, v.placa, v.obs, v.prod, v.manif, v.manifiesto, v.motivoCancelacion, v.estado, v.tr].join(' '));

  const aplicar = (libres: string[]) => (S?.viajes || []).filter((v: any) => {
    const fecha = String(v.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
    if (f.desde && fecha < f.desde) return false;
    if (f.hasta && fecha > f.hasta) return false;
    if (f.soloFuturos && fecha < hoyIso) return false;
    if (f.diasSemana.length) { const [a, m, d] = fecha.split('-').map(Number); if (!f.diasSemana.includes(new Date(a, m - 1, d).getDay())) return false; }
    const estado = String(v.estado || 'Programado');
    if (!f.incluirCancelados && estado === 'Cancelado' && !f.estados.includes('Cancelado')) return false;
    if (f.estados.length && !f.estados.includes(estado)) return false;
    if (f.no.estados.includes(estado)) return false;
    const placa = String(v.p || v.placa || '').toUpperCase();
    if (f.placas.length && !f.placas.some(p => pegada(p) === pegada(placa) || pegada(p) === pegada(v.placaOriginal))) return false;
    if (f.no.placas.some(p => pegada(p) === pegada(placa))) return false;
    const cond = conductorDelViaje(v, titular);
    if (f.conductores.length && !en(f.conductores, cond)) return false;
    if (f.no.conductores.length && en(f.no.conductores, cond)) return false;
    const cli = `${v.cliente || ''} ${v.cli || ''} ${v.cli2 || ''}`;
    if (f.clientes.length && !contiene(f.clientes, cli)) return false;
    if (f.no.clientes.length && contiene(f.no.clientes, cli)) return false;
    const dest = `${v.destino || ''} ${v.destinoReal || ''} ${v.dest2 || ''}`;
    if (f.destinos.length && !contiene(f.destinos, dest)) return false;
    if (f.no.destinos.length && contiene(f.no.destinos, dest)) return false;
    const ruta = String(v.ruta || v.codigo || '');
    if (f.rutas.length && !en(f.rutas, ruta)) return false;
    if (f.no.rutas.length && en(f.no.rutas, ruta)) return false;
    const tr = String(v.tr || v.transportadora || 'Makand');
    if (f.transportadoras.length && !en(f.transportadoras, tr)) return false;
    if (f.no.transportadoras.length && en(f.no.transportadoras, tr)) return false;
    if (f.tiposVehiculo.length && !en(f.tiposVehiculo, tipoDe.get(pegada(placa)) || '')) return false;
    if (f.extra !== null && (v.tipo === 'extra') !== f.extra) return false;
    if (f.urgente !== null && (!!(v.urgente || v.prioridad === 'Urgente' || v.prioridad === 'alta' || v.prioridad === 'Alta')) !== f.urgente) return false;
    if (f.dobleEntrega !== null && !!v.cli2 !== f.dobleEntrega) return false;
    if (f.split !== null && !!v.split !== f.split) return false;
    if (f.sinConductor !== null && !cond.trim() !== f.sinConductor) return false;
    if (f.conNovedad !== null && (!!(Array.isArray(v.novedades) ? v.novedades.length : v.novedades)) !== f.conNovedad) return false;
    if (f.reasignado !== null && (!!(v.placaOriginal || v.viajeVaradoDe || v.planBDe)) !== f.reasignado) return false;
    if (f.conObservacion !== null && !!String(v.obs || '').trim() !== f.conObservacion) return false;
    const cajas = Number(v.cajas) || 0;
    if (f.cajasMin !== null && cajas < f.cajasMin) return false;
    if (f.cajasMax !== null && cajas > f.cajasMax) return false;
    if (f.horaDesde !== null || f.horaHasta !== null) {
      const min = enMinutos(horaDe(v)); if (min === null) return false;
      if (f.horaDesde !== null && min < f.horaDesde) return false;
      if (f.horaHasta !== null && min >= f.horaHasta) return false;
    }
    if (libres.length) { const tx = textoViaje(v); if (!libres.every(p => tx.includes(p))) return false; }
    return true;
  });

  // Palabras que no se entendieron: se buscan como texto; si ninguna aparece, se ignoran.
  let libres = [...f.libres];
  let lista = aplicar(libres);
  while (!lista.length && libres.length) { libres = libres.slice(0, -1); lista = aplicar(libres); }
  (lista as any).ignoradas = f.libres.filter(x => !libres.includes(x));

  const t0 = new Date(hoyIso).getTime();
  const ordenada = [...lista].sort((a: any, b: any) => {
    const fa = String(a.fecha), fb = String(b.fecha);
    if (f.orden === 'asc') return fa.localeCompare(fb) || String(horaDe(a)).localeCompare(String(horaDe(b)));
    if (f.orden === 'desc') return fb.localeCompare(fa) || String(horaDe(b)).localeCompare(String(horaDe(a)));
    // "cercano": lo de hoy en adelante primero (más próximo arriba), luego lo pasado (más reciente arriba).
    const da = new Date(fa).getTime() - t0, db = new Date(fb).getTime() - t0;
    if ((da >= 0) !== (db >= 0)) return da >= 0 ? -1 : 1;
    return da >= 0 ? da - db || String(horaDe(a)).localeCompare(String(horaDe(b))) : db - da;
  });
  const final = f.limite ? ordenada.slice(0, f.limite) : ordenada;
  (final as any).ignoradas = (lista as any).ignoradas;
  return final;
}
