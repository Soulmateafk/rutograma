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
  particulas: string[];          // lo que cae: emojis o "#color" (papelitos de colores)
  cuantas: number;               // en computador (en celular, la mitad)
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
    particulas: ['#facc15', '#f472b6', '#60a5fa', '#34d399', '✨', '🎉'], cuantas: 22,
    activa: d => (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() <= 6)
  },
  {
    clave: 'san-valentin', nombre: 'San Valentín', emoji: '💘', saludo: '¡Feliz San Valentín!',
    particulas: ['💕', '💗', '❤️', '🌹'], cuantas: 14,
    activa: d => d.getMonth() === 1 && d.getDate() >= 7 && d.getDate() <= 14
  },
  {
    clave: 'mujer', nombre: 'Día de la Mujer', emoji: '💐', saludo: '¡Feliz Día de la Mujer!',
    particulas: ['🌸', '💜', '🌷', '💐'], cuantas: 12,
    activa: d => d.getMonth() === 2 && d.getDate() >= 6 && d.getDate() <= 8
  },
  {
    clave: 'semana-santa', nombre: 'Semana Santa y Pascua', emoji: '🐣', saludo: '¡Felices Pascuas!',
    particulas: ['🥚', '🐣', '🌷', '🐰'], cuantas: 12,
    activa: d => { const p = pascua(d.getFullYear()); return entre(d, masDias(p, -7), p); }
  },
  {
    clave: 'madre', nombre: 'Día de la Madre', emoji: '🌷', saludo: '¡Feliz Día de la Madre!',
    particulas: ['🌷', '💐', '💖', '🌸'], cuantas: 12,
    activa: d => { const dom = nEsimo(d.getFullYear(), 4, 0, 2); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'padre', nombre: 'Día del Padre', emoji: '👔', saludo: '¡Feliz Día del Padre!',
    particulas: ['👔', '💙', '🏆', '⭐'], cuantas: 12,
    activa: d => { const dom = nEsimo(d.getFullYear(), 5, 0, 3); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'independencia', nombre: '20 de Julio', emoji: '⭐', saludo: '¡Feliz Día de la Independencia!',
    particulas: ['#fcd116', '#fcd116', '#003893', '#ce1126'], cuantas: 22,
    activa: d => d.getMonth() === 6 && d.getDate() >= 18 && d.getDate() <= 20
  },
  {
    clave: 'amor-amistad', nombre: 'Amor y Amistad', emoji: '💛', saludo: '¡Feliz Amor y Amistad!',
    particulas: ['💛', '🤝', '🎁', '💌'], cuantas: 12,
    activa: d => { const sab = nEsimo(d.getFullYear(), 8, 6, 3); return entre(d, masDias(sab, -6), masDias(sab, 1)); }
  },
  {
    clave: 'halloween', nombre: 'Halloween', emoji: '🎃', saludo: '¡Feliz Halloween!',
    particulas: ['🎃', '🍂', '🍬', '🕸️', '👻'], cuantas: 12,
    activa: d => d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() === 1)
  },
  {
    clave: 'navidad', nombre: 'Navidad', emoji: '🎄', saludo: '¡Feliz Navidad!',
    particulas: ['❄', '❄', '❅', '❆', '⭐'], cuantas: 22,
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
