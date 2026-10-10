import { signal } from '@angular/core';
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
  /** Algo nuevo cada día: una frase o dato distinto (se escoge según el día del año). */
  frases?: string[];
  /** Lo que cruza la pantalla puede cambiar cada día. */
  cruzas?: Array<{ emoji: string; clase: string }>;
  /** Un adorno extra que cae, distinto cada día. */
  extras?: string[];
}

/** Número de día del año (para que cada día salga algo distinto). */
export function diaDelAnio(d = new Date()): number {
  return Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000);
}
/** El elemento que le toca a ese día. */
export function delDia<T>(lista: T[] | undefined, d = new Date()): T | undefined {
  return lista && lista.length ? lista[diaDelAnio(d) % lista.length] : undefined;
}

// Aniversario de MAKAND: la fecha la pone la oficina en Configuración ("MM-DD").
let aniversario = '';
/** Cambia cuando cambia la fecha del aniversario (para que la decoración se recalcule). */
export const versionCelebraciones = signal(0);
export function ponerAniversario(mmdd: string): void {
  const nuevo = /^\d{2}-\d{2}$/.test(mmdd || '') ? mmdd : '';
  if (nuevo !== aniversario) { aniversario = nuevo; versionCelebraciones.update(v => v + 1); }
}
export function aniversarioActual(): string { return aniversario; }
const fechaAniversario = (anio: number) => aniversario ? new Date(anio, Number(aniversario.slice(0, 2)) - 1, Number(aniversario.slice(3))) : new Date(anio, 0, 1);

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
    clave: 'aniversario', nombre: 'Aniversario de MAKAND', emoji: '🎂', saludo: '¡Feliz aniversario, MAKAND!',
    particulas: ['#3b82f6', '#facc15', '#fb923c', 'estrella:#facc15', 'bokeh:#3b82f6', 'bokeh:#fb923c', '🎉', '🎈'], cuantas: 36,
    colores: ['#3b82f6', '#fb923c'], cinta: 'linear-gradient(90deg, #1d4ed8, #3b82f6, #fb923c, #3b82f6, #1d4ed8)', suelo: ['🎈', '🎂', '🎈'], fuegos: ['#3b82f6', '#fb923c', '#facc15', '#ffffff'],
    cruzas: [{ emoji: '🚚💨', clase: 'tp-camion' }, { emoji: '🎈🎈🎈', clase: 'tp-globos' }],
    frases: ['Gracias a cada conductor, despachador y persona de la oficina: MAKAND es su gente.', 'Cada viaje entregado es parte de esta historia.', 'Un año más moviendo lo que importa.'],
    diaGrande: a => fechaAniversario(a), nombreDia: 'el aniversario de MAKAND',
    activa: d => { if (!aniversario) return false; const f = fechaAniversario(d.getFullYear()); return entre(d, masDias(f, -2), f); }
  },
  {
    clave: 'ano-nuevo', nombre: 'Año Nuevo', emoji: '🎆', saludo: '¡Feliz Año Nuevo!',
    particulas: ['#facc15', '#f472b6', '#60a5fa', '#34d399', 'estrella:#facc15', 'estrella:#fde68a', 'bokeh:#facc15', 'bokeh:#f472b6', 'bokeh:#60a5fa', '✨'], cuantas: 36,
    colores: ['#facc15', '#a855f7'], cinta: 'linear-gradient(90deg, #facc15, #f472b6, #60a5fa, #34d399, #facc15)', suelo: ['🥂', '🍾', '🎉'], fuegos: ['#facc15', '#f472b6', '#60a5fa', '#34d399', '#f97316'],
    frases: ['Año nuevo, rutas nuevas: que todas lleguen a tiempo.', 'Dicen que comer 12 uvas a medianoche trae suerte… ¡y que el SOAT esté al día también!', 'Buen momento para revisar los documentos de la flota del año.', 'El mejor viaje del año es el que aún no empieza.', 'Que este año haya más "Entregado" que nunca.', 'Gracias por el año que pasó. ¡Vamos por este!', 'Brindemos por un año sin varados.'],
    cruzas: [{ emoji: '🍾', clase: 'tp-flecha' }, { emoji: '🎆', clase: 'tp-globos' }],
    diaGrande: a => new Date(a, 0, 1), nombreDia: 'Año Nuevo',
    activa: d => (d.getMonth() === 11 && d.getDate() === 31) || (d.getMonth() === 0 && d.getDate() <= 6)
  },
  {
    clave: 'san-valentin', nombre: 'San Valentín', emoji: '💘', saludo: '¡Feliz San Valentín!',
    particulas: ['corazon:#ec4899', 'corazon:#f43f5e', 'corazon:#fda4af', 'corazon:#e11d48', 'bokeh:#ec4899', 'bokeh:#fb7185', 'petalo:#e11d48', '💕'], cuantas: 30,
    colores: ['#ec4899', '#ef4444'], cinta: 'repeating-linear-gradient(90deg, #ec4899 0 14px, #fbcfe8 14px 22px)', sube: true, suelo: ['🌹', '💝', '🌹'], cruza: { emoji: '💘', clase: 'tp-flecha' },
    frases: ['El amor también es avisar cuando el viaje va a llegar tarde.', 'Un mensaje bonito para alguien del equipo hoy no cuesta nada.', 'En Colombia celebramos Amor y Amistad en septiembre, pero el cariño es todo el año.', 'Los corazones de hoy suben en vez de caer.', 'Gracias por cuidar cada carga como si fuera propia.', 'Que hoy todas las rutas sean de amor… y sin trancón.', 'Un abrazo al conductor que madruga.', 'Feliz día a quienes nos acompañan en cada viaje.'],
    diaGrande: a => new Date(a, 1, 14), nombreDia: 'San Valentín',
    activa: d => d.getMonth() === 1 && d.getDate() >= 7 && d.getDate() <= 14
  },
  {
    clave: 'mujer', nombre: 'Día de la Mujer', emoji: '💐', saludo: '¡Feliz Día de la Mujer!',
    particulas: ['petalo:#c084fc', 'petalo:#f0abfc', 'petalo:#f9a8d4', 'petalo:#a855f7', 'bokeh:#a855f7', 'bokeh:#ec4899', '🌸'], cuantas: 30,
    colores: ['#a855f7', '#ec4899'], cinta: 'linear-gradient(90deg, #a855f7, #ec4899, #a855f7)', suelo: ['💐', '🌸', '🌷', '🌸', '💐'],
    frases: ['Gracias a todas las mujeres que hacen que MAKAND funcione.', 'Cada vez más mujeres manejan, despachan y dirigen la logística.', 'Hoy es un buen día para reconocer el trabajo de las compañeras.'],
    diaGrande: a => new Date(a, 2, 8), nombreDia: 'el Día de la Mujer',
    activa: d => d.getMonth() === 2 && d.getDate() >= 6 && d.getDate() <= 8
  },
  {
    clave: 'semana-santa', nombre: 'Semana Santa y Pascua', emoji: '🐣', saludo: '¡Felices Pascuas!',
    particulas: ['bokeh:#fde68a', 'bokeh:#a5f3fc', 'bokeh:#f9a8d4', 'bokeh:#bbf7d0', 'petalo:#fbcfe8', 'petalo:#fef08a', '🥚', '🐣'], cuantas: 30,
    colores: ['#a3e635', '#f9a8d4'], cinta: 'repeating-linear-gradient(90deg, #fde68a 0 12px, #a5f3fc 12px 24px, #f9a8d4 24px 36px, #bbf7d0 36px 48px)', suelo: ['🥚', '🌷', '🥚'], cruza: { emoji: '🐇', clase: 'tp-conejo' },
    frases: ['Semana Santa: muchas vías se llenan, mejor salir temprano.', 'Revisa los festivos: el jueves y el viernes santo cambian la operación.', 'El conejo de Pascua esconde huevos… y nosotros entregamos cajas.', 'Buen viaje a quienes viajan en estos días.', 'Paciencia en las carreteras: todos vuelven a casa.', 'Que la semana sea tranquila y sin varados.', 'Domingo de Pascua: ¡a buscar huevitos!', 'Descansa, que el lunes vuelve la operación.'],
    diaGrande: a => pascua(a), nombreDia: 'el Domingo de Pascua',
    activa: d => { const p = pascua(d.getFullYear()); return entre(d, masDias(p, -7), p); }
  },
  {
    clave: 'trabajo', nombre: 'Día del Trabajo', emoji: '🛠️', saludo: '¡Feliz Día del Trabajo!',
    particulas: ['estrella:#f59e0b', 'estrella:#fde68a', 'bokeh:#f59e0b', 'bokeh:#ef4444', '⚙️', '🔧', '#f59e0b'], cuantas: 30,
    colores: ['#f59e0b', '#ef4444'], cinta: 'repeating-linear-gradient(45deg, #f59e0b 0 12px, #1f2937 12px 24px)', suelo: ['🛠️', '🚚', '📦'],
    cruzas: [{ emoji: '🚚💨', clase: 'tp-camion' }, { emoji: '🚛💨', clase: 'tp-camion' }, { emoji: '📦📦📦', clase: 'tp-camion' }],
    frases: ['Gracias a cada persona que mueve a MAKAND: conductores, despachadores, oficina.', 'El 1 de mayo es festivo: revisa la programación.', 'Detrás de cada entrega hay mucho trabajo bien hecho.'],
    diaGrande: a => new Date(a, 4, 1), nombreDia: 'el Día del Trabajo',
    activa: d => (d.getMonth() === 3 && d.getDate() >= 29) || (d.getMonth() === 4 && d.getDate() === 1)
  },
  {
    clave: 'madre', nombre: 'Día de la Madre', emoji: '🌷', saludo: '¡Feliz Día de la Madre!',
    particulas: ['petalo:#f472b6', 'petalo:#fb7185', 'petalo:#fecdd3', 'petalo:#e11d48', 'corazon:#f472b6', 'bokeh:#fb7185', '🌷'], cuantas: 30,
    colores: ['#f472b6', '#fb7185'], cinta: 'linear-gradient(90deg, #f472b6, #fda4af, #f472b6)', suelo: ['🌷', '🌹', '💐', '🌹', '🌷'],
    frases: ['Un abrazo a todas las mamás del equipo.', 'Muchos conductores viajan pensando en su mamá: ¡que lleguen a celebrar!', 'Hoy es buen día para llamar a mamá.', 'Las mamás también organizan rutas: las de toda la casa.', 'Gracias a las madres que trabajan y cuidan al mismo tiempo.', 'Que nadie se quede sin su almuerzo con mamá el domingo.', '¡Feliz día a las mamás de MAKAND!'],
    diaGrande: a => nEsimo(a, 4, 0, 2), nombreDia: 'el Día de la Madre',
    activa: d => { const dom = nEsimo(d.getFullYear(), 4, 0, 2); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'padre', nombre: 'Día del Padre', emoji: '👔', saludo: '¡Feliz Día del Padre!',
    particulas: ['estrella:#60a5fa', 'estrella:#facc15', 'estrella:#93c5fd', 'bokeh:#3b82f6', 'bokeh:#0ea5e9', '⭐'], cuantas: 30,
    colores: ['#3b82f6', '#0ea5e9'], cinta: 'linear-gradient(90deg, #1e3a8a, #3b82f6, #1e3a8a)', suelo: ['🏆', '👔', '⭐'],
    frases: ['Un saludo a todos los papás del equipo.', 'Muchos papás están en ruta: ¡que lleguen a celebrar!', 'Ser papá y conductor: dos trabajos de tiempo completo.', 'Gracias a los papás que madrugan por su familia.', 'Hoy es buen día para llamar a papá.', 'Feliz día a los papás de MAKAND.', 'Papá también sabe de rutas: siempre encuentra el atajo.'],
    diaGrande: a => nEsimo(a, 5, 0, 3), nombreDia: 'el Día del Padre',
    activa: d => { const dom = nEsimo(d.getFullYear(), 5, 0, 3); return entre(d, masDias(dom, -6), dom); }
  },
  {
    clave: 'conductor', nombre: 'Día del Conductor', emoji: '🚚', saludo: '¡Feliz Día del Conductor!',
    particulas: ['estrella:#facc15', 'estrella:#7dd3fc', 'bokeh:#0ea5e9', 'bokeh:#facc15', '⭐', '🛣️'], cuantas: 30,
    colores: ['#0ea5e9', '#facc15'], cinta: 'repeating-linear-gradient(90deg, #1f2937 0 18px, #facc15 18px 30px)', suelo: ['🚚', '⭐', '🚛'],
    cruzas: [{ emoji: '🚚💨', clase: 'tp-camion' }, { emoji: '🚛💨', clase: 'tp-camion' }, { emoji: '🚐💨', clase: 'tp-camion' }],
    frases: ['El 16 de julio es el día de la Virgen del Carmen, patrona de los conductores.', 'Gracias a cada conductor de MAKAND por llevar la carga segura.', 'Un pito de saludo a todos los que están en la vía hoy. 📯'],
    diaGrande: a => new Date(a, 6, 16), nombreDia: 'el Día del Conductor',
    activa: d => d.getMonth() === 6 && d.getDate() >= 14 && d.getDate() <= 16
  },
  {
    clave: 'independencia', nombre: '20 de Julio', emoji: '⭐', saludo: '¡Feliz Día de la Independencia!',
    particulas: ['#fcd116', '#fcd116', '#003893', '#ce1126', 'estrella:#fcd116', 'bokeh:#fcd116', 'bokeh:#ce1126'], cuantas: 34,
    colores: ['#fcd116', '#ce1126'], cinta: 'linear-gradient(180deg, #fcd116 0 50%, #003893 50% 75%, #ce1126 75%)', suelo: ['🎉', '⭐', '🎉'], fuegos: ['#fcd116', '#003893', '#ce1126', '#fcd116'],
    frases: ['El 20 de julio de 1810 empezó el camino a la independencia de Colombia.', 'El Florero de Llorente: un florero que cambió la historia.', 'Festivo nacional: revisa la programación de esos días.', '¡Viva Colombia y viva su gente trabajadora!'],
    diaGrande: a => new Date(a, 6, 20), nombreDia: 'el 20 de Julio',
    activa: d => d.getMonth() === 6 && d.getDate() >= 18 && d.getDate() <= 20
  },
  {
    clave: 'boyaca', nombre: 'Batalla de Boyacá', emoji: '⚔️', saludo: '¡Feliz 7 de agosto!',
    particulas: ['#fcd116', '#003893', '#ce1126', 'estrella:#fcd116', 'bokeh:#003893', 'bokeh:#fcd116'], cuantas: 30,
    colores: ['#fcd116', '#003893'], cinta: 'linear-gradient(180deg, #fcd116 0 50%, #003893 50% 75%, #ce1126 75%)', suelo: ['🏇', '⭐', '🏇'], fuegos: ['#fcd116', '#003893', '#ce1126'],
    cruzas: [{ emoji: '🏇', clase: 'tp-camion' }],
    frases: ['El 7 de agosto de 1819, en el Puente de Boyacá, se selló la independencia.', 'Ese día también se posesiona cada nuevo presidente de Colombia.', 'Festivo nacional: revisa la programación.'],
    diaGrande: a => new Date(a, 7, 7), nombreDia: 'el 7 de agosto',
    activa: d => d.getMonth() === 7 && d.getDate() >= 5 && d.getDate() <= 7
  },
  {
    clave: 'amor-amistad', nombre: 'Amor y Amistad', emoji: '💛', saludo: '¡Feliz Amor y Amistad!',
    particulas: ['corazon:#facc15', 'corazon:#ec4899', 'corazon:#fde047', 'bokeh:#facc15', 'bokeh:#ec4899', '💛', '🎁'], cuantas: 30,
    colores: ['#facc15', '#ec4899'], cinta: 'repeating-linear-gradient(90deg, #facc15 0 14px, #fde68a 14px 22px)', sube: true, suelo: ['🎁', '💛', '🎁'], cruza: { emoji: '💌', clase: 'tp-flecha' },
    frases: ['¿Ya hiciste el amigo secreto de la oficina?', 'Un dulce para el compañero que siempre ayuda.', 'La amistad también es cubrir el turno del otro.', 'En Colombia, septiembre es el mes del amor y la amistad.', 'Gracias a los amigos que hacen el trabajo más bonito.', 'Un mensaje de cariño a alguien del equipo hoy.', '¡Hoy se revela el amigo secreto!', 'Feliz Amor y Amistad a todos.'],
    diaGrande: a => nEsimo(a, 8, 6, 3), nombreDia: 'Amor y Amistad',
    activa: d => { const sab = nEsimo(d.getFullYear(), 8, 6, 3); return entre(d, masDias(sab, -6), masDias(sab, 1)); }
  },
  {
    clave: 'halloween', nombre: 'Halloween', emoji: '🎃', saludo: '¡Feliz Halloween!',
    particulas: ['petalo:#ea580c', 'petalo:#b45309', 'petalo:#9a3412', 'petalo:#f59e0b', 'bokeh:#f97316', 'bokeh:#7c3aed', '🎃', '👻'], cuantas: 30,
    colores: ['#f97316', '#7c3aed'], cinta: 'repeating-linear-gradient(45deg, #f97316 0 10px, #111 10px 20px)', suelo: ['🎃', '🕯️', '🎃'], cruza: { emoji: '🧙‍♀️', clase: 'tp-bruja' },
    cruzas: [{ emoji: '🧙‍♀️', clase: 'tp-bruja' }, { emoji: '🦇🦇🦇', clase: 'tp-bruja' }, { emoji: '🧙‍♂️', clase: 'tp-bruja' }, { emoji: '👻', clase: 'tp-flecha' }, { emoji: '🎃🛸', clase: 'tp-bruja' }],
    extras: ['🍬', '🕸️', '💀', '🍭', '🦉', '🕯️', '🧹'],
    frases: ['Cuidado: dicen que en octubre los viajes sin conductor asignado… se asustan solos.', 'Un fantasma revisa los documentos vencidos de noche. 👻', 'El 31 los niños piden dulces: ¡ojo en las calles!', 'Las brujas vuelan en escoba; nosotros, en furgón refrigerado.', 'Si ves una calabaza sonriendo en el Rutograma, salúdala.', 'La luna llena dice que todo va a salir bien.', 'Cuentan que hay un viaje que nunca se marca como entregado… 😱', 'Hoy el murciélago trae buenas noticias.', 'Truco o trato: ¿revisaste el pico y placa?', 'El órgano de la Tocata suena cuando celebras. Pruébalo en Apariencia → Sonidos.'],
    diaGrande: a => new Date(a, 9, 31), nombreDia: 'Halloween',
    activa: d => d.getMonth() === 9 || (d.getMonth() === 10 && d.getDate() === 1)
  },
  {
    clave: 'velitas', nombre: 'Día de las Velitas', emoji: '🕯️', saludo: '¡Feliz noche de velitas!',
    particulas: ['bokeh:#fbbf24', 'bokeh:#f59e0b', 'bokeh:#fde68a', 'bokeh:#fb923c', 'estrella:#fde68a', '✨'], cuantas: 34,
    colores: ['#f59e0b', '#fde68a'], cinta: 'repeating-linear-gradient(90deg, #f59e0b 0 6px, #fde68a 6px 10px, transparent 10px 22px)', suelo: ['🏮', '🕯️', '🏮'],
    cruzas: [{ emoji: '🏮', clase: 'tp-globos' }],
    frases: ['El 7 de diciembre, en la noche, se prenden velitas y faroles: arranca la Navidad colombiana.', 'Las velitas del día 8 celebran la Inmaculada Concepción.', 'Prende tu velita y pide un deseo: que todos los viajes lleguen bien.'],
    diaGrande: a => new Date(a, 11, 7), nombreDia: 'la noche de velitas',
    activa: d => d.getMonth() === 11 && (d.getDate() === 7 || d.getDate() === 8)
  },
  {
    clave: 'navidad', nombre: 'Navidad', emoji: '🎄', saludo: '¡Feliz Navidad!',
    particulas: ['nieve:#ffffff', 'nieve:#ffffff', 'nieve:#e0f2fe', 'nieve:#ffffff', 'nieve:#ffffff', 'bokeh:#ef4444', 'bokeh:#22c55e', 'estrella:#facc15', '❄'], cuantas: 48,
    colores: ['#ef4444', '#22c55e'], cinta: 'repeating-linear-gradient(45deg, #ef4444 0 10px, #ffffff 10px 20px)', suelo: ['🎁', '⛄', '🎄', '🎁'], cruza: { emoji: '🦌🦌🛷', clase: 'tp-trineo' },
    cruzas: [{ emoji: '🦌🦌🛷', clase: 'tp-trineo' }, { emoji: '⛄', clase: 'tp-flecha' }, { emoji: '🦌🦌🦌🛷🎅', clase: 'tp-trineo' }, { emoji: '⭐', clase: 'tp-globos' }],
    extras: ['🎁', '🔔', '🍪', '🧦', '🕯️', '🍬', '⭐', '🎀'],
    frases: ['Diciembre: más pedidos, más viajes. ¡Ánimo, equipo!', 'Novenas del 16 al 24: ¡a rezar y comer buñuelos!', 'Revisa los festivos de diciembre en la programación.', 'Papá Noel también tiene ruta fija: una sola noche, todo el mundo.', 'El trineo pasa por la pantalla: ¿ya lo viste?', 'Natilla, buñuelos y viajes entregados: diciembre perfecto.', 'Que todos los conductores lleguen a casa en Navidad.', 'Si escuchas cascabeles al guardar, es Navidad en Apariencia → Sonidos.', 'Un regalo para la oficina: cero viajes sin conductor.', 'El 24 Papá Noel cruza la pantalla más seguido. 🎅'],
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
