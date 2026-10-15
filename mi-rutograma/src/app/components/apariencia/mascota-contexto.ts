/**
 * Lo que el furgoncito entiende ANTES de responder:
 *  - Placas dictadas o mal oídas: "L U N 428", "lun cuatro dos ocho",
 *    "lun cuatrocientos veintiocho", "luna 428" → "LUN 428".
 *  - Preguntas que siguen a la anterior: "¿y mañana?", "¿y la PRZ 065?",
 *    "¿y a Cali?", "¿y Orlando?" → se arma la pregunta completa.
 * Funciones puras. Pruebas: mascota-contexto.spec.ts
 */
import { sinTildes } from '../../services/buscar-hablado';

const UNIDADES: Record<string, number> = { cero: 0, uno: 1, un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9 };
const DECENAS: Record<string, number> = {
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiuno: 21, veintiun: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90
};
const CIENTOS: Record<string, number> = { cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900 };
const esNumeroDicho = (w: string) => w in UNIDADES || w in DECENAS || w in CIENTOS || /^\d$/.test(w);

const pegada = (t: any) => sinTildes(t).replace(/[^a-z0-9]/g, '');
const placaDe = (v: any) => String(v?.p ?? v?.placa ?? '').toUpperCase().trim();

function distancia(a: string, b: string): number {
  const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previo = fila[0]; fila[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = fila[j]; fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, previo + (a[i - 1] === b[j - 1] ? 0 : 1)); previo = t; }
  }
  return fila[b.length];
}

/** "cuatro dos ocho" → "428"; "cuatrocientos veintiocho" → "428"; null si no es un número de placa (3 cifras). */
function numeroDicho(palabras: string[]): string | null {
  if (palabras.length === 3 && palabras.every(w => w in UNIDADES || /^\d$/.test(w))) return palabras.map(w => /^\d$/.test(w) ? w : String(UNIDADES[w])).join('');
  let total = 0;
  for (const w of palabras) {
    if (w === 'y') continue;
    if (w in CIENTOS) total += CIENTOS[w]; else if (w in DECENAS) total += DECENAS[w]; else if (w in UNIDADES) total += UNIDADES[w]; else return null;
  }
  return total >= 100 && total <= 999 ? String(total) : null;
}

/**
 * Arregla las placas dichas o escritas raro. Con S (los datos) también
 * corrige letras mal oídas ("luna 428" → "LUN 428") si los números
 * coinciden con una sola placa.
 */
export function placasDichas(texto: string, S?: any): string {
  let t = String(texto || '');
  // "L U N 428", "L-U-N 428", "l.u.n 428".
  t = t.replace(/\b([a-zA-Z])[\s.\-]+([a-zA-Z])[\s.\-]+([a-zA-Z])[\s.\-]*(\d{3})\b/g, (_m, a, b, c, d) => `${(a + b + c).toUpperCase()} ${d}`);
  // "LUN 4 2 8" → "LUN 428".
  t = t.replace(/\b([a-zA-Z]{3})\s+(\d)\s+(\d)\s+(\d)\b/g, (_m, a, b, c, d) => `${a.toUpperCase()} ${b}${c}${d}`);
  // Números dichos con palabras después de tres letras.
  const ws = t.split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if (/^[a-zA-Z]{3}$/.test(w) && esNumeroDicho(sinTildes(ws[i + 1] || ''))) {
      const nums: string[] = [];
      let j = i + 1;
      while (j < ws.length && nums.length < 5 && (esNumeroDicho(sinTildes(ws[j])) || (sinTildes(ws[j]) === 'y' && nums.length))) { nums.push(sinTildes(ws[j])); j++; }
      while (nums.length && nums[nums.length - 1] === 'y') { nums.pop(); j--; }
      const n = numeroDicho(nums);
      const placa = n ? `${w.toUpperCase()} ${n}` : '';
      // Solo si es una placa de verdad (sin datos, si suena a placa: 3 cifras).
      if (n && (!S || (S.vehiculos || []).some((v: any) => pegada(placaDe(v)) === pegada(placa)))) { out.push(placa); i = j - 1; continue; }
    }
    out.push(w);
  }
  t = out.join(' ');
  if (!S) return t;
  // "luna 428", "lum 428": letras mal oídas; se busca la placa con esos números.
  const placas: string[] = (S.vehiculos || []).map(placaDe).filter((p: string) => /^[A-Z]{3} \d{3}$/.test(p));
  return t.replace(/\b([a-zA-ZñÑ]{2,6})\s?-?(\d{3})\b/g, (m, letras, num) => {
    const tal = `${letras.toUpperCase()} ${num}`;
    if (placas.includes(tal)) return tal;
    const mismas = placas.filter(p => p.endsWith(num));
    if (mismas.length === 1 && distancia(sinTildes(letras), mismas[0].slice(0, 3).toLowerCase()) <= 2) return mismas[0];
    const cerca = mismas.filter(p => distancia(sinTildes(letras), p.slice(0, 3).toLowerCase()) <= 1);
    return cerca.length === 1 ? cerca[0] : m;
  });
}

// ---------- Preguntas que siguen a la anterior ----------

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const DIAS = 'lunes|martes|miercoles|jueves|viernes|sabado|domingo';
const FECHA = new RegExp(`\\b(hoy|ahorita|pasado manana|manana|ayer|anteayer|antier|esta semana|la (proxima|otra|siguiente) semana|la semana (pasada|que viene|entrante|anterior)|(este|el) mes( pasado| que viene| siguiente)?|el (proximo |pasado )?(${DIAS})( pasado| que viene)?|(el |los )?(${DIAS})|(en |de |del mes de )?(${MESES})|el \\d{1,2}( de (${MESES}))?|(del|desde el) \\d{1,2} al \\d{1,2}( de (${MESES}))?)\\b`, 'g');
const PLACA = /\b(la |el )?([a-z]{3} ?-?\d{3}|(polar|arsitrans) ?\d+)\b/g;

const n = (t: string) => sinTildes(t).replace(/[¿?¡!.,;:"']/g, ' ').replace(/\s+/g, ' ').trim();

/** ¿Es una pregunta que se apoya en la anterior? ("¿y mañana?", "y la PRZ 065", "¿y para Cali?") */
export function esSeguimiento(pregunta: string): boolean {
  const q = n(pregunta);
  if (!q) return false;
  if (/^(y|e|ahora|tambien|igual|lo mismo|y que tal|que tal)\b/.test(q)) return q.split(' ').length <= 8;
  // Solo una fecha o una placa sueltas: "¿mañana?", "¿el viernes?", "LUN 428?".
  const sinFecha = q.replace(FECHA, ' ').replace(PLACA, ' ').replace(/\b(para|pa|de|del|en|el|la|los|las|a)\b/g, ' ').trim();
  return !sinFecha && q.split(' ').length <= 5;
}

/**
 * Arma la pregunta completa con la anterior: cambia la fecha, la placa, el
 * conductor, el destino o el cliente por lo nuevo. null si no aplica.
 */
export function conContexto(actual: string, anterior: string, S?: any): string | null {
  if (!anterior || !esSeguimiento(actual)) return null;
  let resto = n(actual).replace(/^(y que tal|que tal|y|e|ahora|tambien|igual|lo mismo)\s*/, '').replace(/^(con|para|pa)\s+(el|la|los|las)\s+/, '$2 ').trim();
  if (!resto || /^(gracias|ok|listo|bueno|vale|nada|chao)\b/.test(resto)) return null;
  let base = n(anterior);
  let cambio = false;
  if (new RegExp(FECHA.source).test(resto)) { base = base.replace(FECHA, ' '); cambio = true; }
  if (new RegExp(PLACA.source).test(resto)) { base = base.replace(PLACA, ' '); cambio = true; }
  if (S) {
    // Un conductor, destino o cliente nuevo reemplaza al de la pregunta anterior.
    const quitarDe = (nombres: string[]) => {
      const nuevos = nombres.filter(x => x.length >= 3 && new RegExp(`\\b${x}\\b`).test(resto));
      if (!nuevos.length) return;
      nombres.filter(x => x.length >= 3 && new RegExp(`\\b${x}\\b`).test(base)).forEach(x => { base = base.replace(new RegExp(`\\b(a |para |pa |de |del )?${x}\\b`, 'g'), ' '); });
      cambio = true;
    };
    quitarDe([...new Set<string>((S.conductores || []).flatMap((c: any) => n(c.nom || c.nombre || '').split(' ')).filter((w: string) => w.length >= 4))]);
    quitarDe([...new Set<string>([...(S.rutas || []).map((r: any) => n(String(r.dest || r.destino || '').split('/')[0])), ...(S.viajes || []).map((v: any) => n(String(v.destino || '').split('/')[0]))].filter(Boolean))]);
    quitarDe([...new Set<string>((S.viajes || []).map((v: any) => n(String(v.cliente || '').split(',')[0])).filter((x: string) => x && x !== 'no definido'))]);
  }
  // Algo nuevo que no reemplaza nada ("¿y sin conductor?", "¿y de Polar?"): se suma.
  if (!cambio && resto.split(' ').length > 6) return null;
  return `${base.replace(/\s+/g, ' ').trim()} ${resto}`.trim();
}
