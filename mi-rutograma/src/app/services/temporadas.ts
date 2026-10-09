// ============================================================
// TEMPORADAS DEL AÑO — decoraciones que salen solas según la fecha
// (Colombia). Cada cuenta puede dejarla automática, quitarla o ver una en
// particular (Apariencia → Decoración de temporada). La decoración la
// dibuja components/apariencia/temporada.ts; el estilo, styles.css.
// ============================================================

export interface Temporada {
  clave: string;
  nombre: string;
  emoji: string;                 // junto al logo y en el saludo
  saludo: string;                // "¡Feliz Halloween!"
  particulas: string[];          // lo que cae: "tipo:#color" (nieve, bokeh, petalo, corazon, estrella), "#color" (papelito) o un emoji
  cuantas: number;               // en computador (en celular, la mitad)
  colores: [string, string];     // brillo en los bordes y degradado de la barra
  cinta: string;                 // franja bajo la barra (CSS background)
  sube?: boolean;                // las partículas suben (corazones) en vez de caer
  suelo?: string[];              // adornos quietos en las esquinas de abajo
  cruza?: { emoji: string; clase: string };   // algo que cruza la pantalla de vez en cuando
  fuegos?: string[];             // fuegos artificiales con estos colores

  /** El día grande de la temporada (para la cuenta regresiva y la celebración). */
  diaGrande: (anio: number) => Date;
  /** Cómo se nombra ese día: "Halloween", "Navidad"... */
  nombreDia: string;
  /** ¿Está activa ese día? */
  activa: (d: Date) => boolean;
}

const dia = (a: number, m: number, d: number) => new Date(a, m, d).getTime();
const entre = (d: Date, desde: Date, hasta: Date) => {
  const t = dia(d.getFullYear(), d.getMonth(), d.getDate());
  return t >= dia(desde.getFullYear(), desde.getMonth(), desde.getDate()) && t <= dia(hasta.getFullYear(), hasta.getMonth(), hasta.getDate());
};
const masDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Domingo de Pascua (algoritmo de Meeus/Butcher). */
export function pascua(anio: number): Date {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31) - 1, diaMes = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes, diaMes);
}

/** El n-ésimo día de la semana de un mes (ej. 2.º domingo de mayo). dow: 0 domingo … 6 sábado. */
export function nEsimo(anio: number, mes: number, dow: number, n: number): Date {
  const primero = new Date(anio, mes, 1);
  return new Date(anio, mes, 1 + ((dow - primero.getDay() + 7) % 7) + (n - 1) * 7);
}

export const TEMPORADAS: Temporada[] = [
  {
    clave: 'ano-nuevo', nombre: 'Año Nuevo', emoji: '🎆', saludo: '¡Feliz Año Nuevo!',
    particulas: ['#facc15', '#f472b6', '#60a5fa', '#34d399', 'estrella:#facc15', 'estrella:#fde68a', 'bokeh:#facc15', 'bokeh:#f472b6', 'bokeh:#60a5fa', '✨'], cuantas: 36,
    colores: ['#facc15', '#a855f7'], cinta: 'linear-gradient(90deg, #facc15, #f472b6, #60a5fa, #34d399, #facc15)', suelo: ['🥂', '🍾', '🎉'], fuegos: ['#facc15', '#f472b6', '#60a5fa', '#34d399', '#f97316'],
    diaGrande: a => new Date(a, 0, 1), nombreDia: 'Año Nuevo',
    activa: d => (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() <= 6)
  },
  {
    clave: 'san-valentin', nombre: 'San Valentín', emoji: '💘', saludo: '¡Feliz San Valentín!',
    particulas: ['corazon:#ec4899', 'corazon:#f43f5e', 'corazon:#fda4af', 'corazon:#e11d48', 'bokeh:#ec4899', 'bokeh:#fb7185', 'petalo:#e11d48', '💕'], cuantas: 30,
    colores: ['#ec4899', '#ef4444'], cinta: 'repeating-linear-gradient(90deg, #ec4899 0 14px, #fbcfe8 14px 22px)', sube: true, suelo: ['🌹', '💝', '🌹'], cruza: { emoji: '💘', clase: 'tp-flecha' },
    diaGrande: a => new Date(a, 1, 14), nombreDia: 'San Valentín',
    activa: d => d.getMonth() === 1 && d.getDate() >= 7 && d.getDate() <= 14
  },
  {
    clave: 'mujer', nombre: 'Día de la Mujer', emoji: '💐', saludo: '¡Feliz Día de la Mujer!',
    particulas: ['petalo:#c084fc', 'petalo:#f0abfc', 'petalo:#f9a8d4', 'petalo:#a855f7', 'bokeh:#a855f7', 'bokeh:#ec4899', '🌸'], cuantas: 30,
    colores: ['#a855f7', '#ec4899'], cinta: 'linear-gradient(90deg, #a855f7, #ec4899, #a855f7)', suelo: ['💐', '🌸', '🌷', '🌸', '💐'],
    diaGrande: a => new Date(a, 2, 8), nombreDia: 'el Día de la Mujer',
    activa: d => d.getMonth() === 2 && d.getDate() >= 6 && d.getDate() <= 8
  },
  {
    clave: 'semana-santa', nombre: 'Semana Santa y Pascua', emoji: '🐣', saludo: '¡Felices Pascuas!',
    particulas: ['bokeh:#fde68a', 'bokeh:#a5f3fc', 'bokeh:#f9a8d4', 'bokeh:#bbf7d0', 'petalo:#fbcfe8', 'petalo:#fef08a', '🥚', '🐣'], cuantas: 30,
    colores: ['#a3e635', '#f9a8d4'], cinta: 'repeating-linear-gradient(90deg, #fde68a 0 12px, #a5f3fc 12px 24px, #f9a8d4 24px 36px, #bbf7d0 36px 48px)', suelo: ['🥚', '🌷', '🥚'], cruza: { emoji: '🐇', clase: 'tp-conejo' },
    diaGrande: a => pascua(a), nombreDia: 'el Domingo de Pascua',
    activa: d => { const p = pascua(d.getFullYear()); return entre(d, masDias(p, -7), p); }
  },
  {
    clave: 'madre', nombre: 'Día de la Madre', emoji: '🌷', saludo: '¡Feliz Día de la Madre!',
    particulas: ['petalo:#f472b6', 'petalo:#fb7185', 'petalo:#fecdd3', 'petalo:#e11d48', 'corazon:#f472b6', 'bokeh:#fb7185', '🌷'], cuantas: 30,
    colores: ['#f472b6', '#fb7185'], cinta: 'linear-gradient(90deg, #f472b6, #fda4af, #f472b6)', suelo: ['🌷', '🌹', '💐', '🌹', '🌷'],
    diaGrande: a => nEsimo(a, 4, 0, 2), nombreDia: 'el Día de la Madre',
    activa: d => { const dom = nEsimo(d.getFullYear(), 4, 0, 2); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'padre', nombre: 'Día del Padre', emoji: '👔', saludo: '¡Feliz Día del Padre!',
    particulas: ['estrella:#60a5fa', 'estrella:#facc15', 'estrella:#93c5fd', 'bokeh:#3b82f6', 'bokeh:#0ea5e9', '⭐'], cuantas: 30,
    colores: ['#3b82f6', '#0ea5e9'], cinta: 'linear-gradient(90deg, #1e3a8a, #3b82f6, #1e3a8a)', suelo: ['🏆', '👔', '⭐'],
    diaGrande: a => nEsimo(a, 5, 0, 3), nombreDia: 'el Día del Padre',
    activa: d => { const dom = nEsimo(d.getFullYear(), 5, 0, 3); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'independencia', nombre: '20 de Julio', emoji: '⭐', saludo: '¡Feliz Día de la Independencia!',
    particulas: ['#fcd116', '#fcd116', '#003893', '#ce1126', 'estrella:#fcd116', 'bokeh:#fcd116', 'bokeh:#ce1126'], cuantas: 34,
    colores: ['#fcd116', '#ce1126'], cinta: 'linear-gradient(180deg, #fcd116 0 50%, #003893 50% 75%, #ce1126 75%)', suelo: ['🎉', '⭐', '🎉'], fuegos: ['#fcd116', '#003893', '#ce1126', '#fcd116'],
    diaGrande: a => new Date(a, 6, 20), nombreDia: 'el 20 de Julio',
    activa: d => d.getMonth() === 6 && d.getDate() >= 18 && d.getDate() <= 20
  },
  {
    clave: 'amor-amistad', nombre: 'Amor y Amistad', emoji: '💛', saludo: '¡Feliz Amor y Amistad!',
    particulas: ['corazon:#facc15', 'corazon:#ec4899', 'corazon:#fde047', 'bokeh:#facc15', 'bokeh:#ec4899', '💛', '🎁'], cuantas: 30,
    colores: ['#facc15', '#ec4899'], cinta: 'repeating-linear-gradient(90deg, #facc15 0 14px, #fde68a 14px 22px)', sube: true, suelo: ['🎁', '💛', '🎁'], cruza: { emoji: '💌', clase: 'tp-flecha' },
    diaGrande: a => nEsimo(a, 8, 6, 3), nombreDia: 'Amor y Amistad',
    activa: d => { const sab = nEsimo(d.getFullYear(), 8, 6, 3); return entre(d, masDias(sab, -6), masDias(sab, 1)); }
  },
  {
    clave: 'halloween', nombre: 'Halloween', emoji: '🎃', saludo: '¡Feliz Halloween!',
    particulas: ['petalo:#ea580c', 'petalo:#b45309', 'petalo:#9a3412', 'petalo:#f59e0b', 'bokeh:#f97316', 'bokeh:#7c3aed', '🎃', '👻'], cuantas: 30,
    colores: ['#f97316', '#7c3aed'], cinta: 'repeating-linear-gradient(45deg, #f97316 0 10px, #111 10px 20px)', suelo: ['🎃', '🕯️', '🎃'], cruza: { emoji: '🧙‍♀️', clase: 'tp-bruja' },
    diaGrande: a => new Date(a, 9, 31), nombreDia: 'Halloween',
    activa: d => d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() === 1)
  },
  {
    clave: 'navidad', nombre: 'Navidad', emoji: '🎄', saludo: '¡Feliz Navidad!',
    particulas: ['nieve:#ffffff', 'nieve:#ffffff', 'nieve:#e0f2fe', 'nieve:#ffffff', 'nieve:#ffffff', 'bokeh:#ef4444', 'bokeh:#22c55e', 'estrella:#facc15', '❄'], cuantas: 48,
    colores: ['#ef4444', '#22c55e'], cinta: 'repeating-linear-gradient(45deg, #ef4444 0 10px, #ffffff 10px 20px)', suelo: ['🎁', '⛄', '🎄', '🎁'], cruza: { emoji: '🦌🦌🛷', clase: 'tp-trineo' },
    diaGrande: a => new Date(a, 11, 24), nombreDia: 'Nochebuena',
    activa: d => d.getMonth() === 11 && d.getDate() <= 30
  }
];

/** La temporada de esa fecha (o null). */
export function temporadaDe(fecha = new Date()): Temporada | null {
  return TEMPORADAS.find(t => t.activa(fecha)) || null;
}

/** Lo que se ve según la preferencia de la cuenta: 'auto', 'no' o una clave. */
export function temporadaVisible(preferencia: string, fecha = new Date()): Temporada | null {
  if (preferencia === 'no') return null;
  if (preferencia && preferencia !== 'auto') return TEMPORADAS.find(t => t.clave === preferencia) || temporadaDe(fecha);
  return temporadaDe(fecha);
}

/** Días que faltan para el día grande de la temporada (0 = hoy). Año Nuevo en diciembre cuenta hacia el 1 de enero siguiente. */
export function diasParaElDia(t: Temporada, hoy = new Date()): number {
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  let dia = t.diaGrande(h.getFullYear());
  if (dia.getTime() < h.getTime() && t.clave === 'ano-nuevo') dia = t.diaGrande(h.getFullYear() + 1);
  return Math.round((dia.getTime() - h.getTime()) / 86400000);
}
