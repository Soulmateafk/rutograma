// ============================================================
// UTILIDADES DE COLOR para la apariencia de cada cuenta: el color propio
// (rueda de colores) y los colores de cada transportadora. De un color
// escogido saca sus tonos (para botones, textos sobre fondo oscuro, fondos
// suaves) y se asegura de que el texto blanco encima se lea.
// ============================================================

export interface Hsl { h: number; s: number; l: number; }   // h 0-360, s y l 0-100

export const HEX = /^#[0-9a-f]{6}$/i;

export function hexAHsl(hex: string): Hsl {
  const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  const l = (max + min) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return { h: Math.round((h * 60 + 360) % 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslAHex({ h, s, l }: Hsl): string {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

function luminancia(hex: string): number {
  const c = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Contraste entre dos colores (1 a 21). 4.5 o más se lee bien. */
export function contraste(a: string, b: string): number {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** El mismo tono, oscurecido lo justo para que el texto blanco encima se lea. */
export function paraTextoBlanco(hex: string, minimo = 4.5): string {
  const c = hexAHsl(hex);
  let actual = hex;
  while (contraste(actual, '#ffffff') < minimo && c.l > 5) { c.l -= 2; actual = hslAHex(c); }
  return actual;
}

/** El mismo tono, aclarado lo justo para leerse como texto sobre el fondo oscuro de la app. */
export function paraFondoOscuro(hex: string, fondo = '#111827', minimo = 4.5): string {
  const c = hexAHsl(hex);
  let actual = hex;
  while (contraste(actual, fondo) < minimo && c.l < 95) { c.l += 2; actual = hslAHex(c); }
  return actual;
}

/** Tonos de un color propio para la app (ver styles.css, data-acento="propio"). */
export function variantesAcento(hex: string): { base: string; boton: string; claro: string; fondo: string; ajustado: boolean } {
  const boton = paraTextoBlanco(hex);
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return { base: hex, boton, claro: paraFondoOscuro(hex), fondo: `rgba(${r}, ${g}, ${b}, 0.15)`, ajustado: boton.toLowerCase() !== hex.toLowerCase() };
}
