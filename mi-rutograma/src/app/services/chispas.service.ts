import { Injectable, NgZone, inject } from '@angular/core';

/**
 * CHISPAS DE TEMPORADA (Apariencia → Efectos → "Detalles de la temporada"):
 *  - un rastro suave que sigue al mouse (copos en Navidad, chispas naranjas
 *    en Halloween, corazones en San Valentín...);
 *  - un estallido chiquito al guardar.
 * Solo en la temporada, con el efecto prendido y sin "Quitar animaciones".
 * Se dibuja fuera de Angular (no carga la pantalla) y nunca pasan de 24 a la vez.
 */
const RASTRO: Record<string, string[]> = {
  navidad: ['❄', '✦', '❄'], halloween: ['✦', '•', '✦'], 'ano-nuevo': ['✦', '✧', '•'], 'san-valentin': ['♥', '✦', '♥'],
  'amor-amistad': ['♥', '✦', '•'], madre: ['✿', '•', '✦'], mujer: ['✿', '✦', '•'], padre: ['✦', '•', '★'],
  'semana-santa': ['✿', '•', '✦'], independencia: ['★', '✦', '•']
};

@Injectable({ providedIn: 'root' })
export class ChispasService {
  private zone = inject(NgZone);
  private vivas = 0;
  private ultimo = 0;

  constructor() {
    if (typeof document === 'undefined') return;
    this.zone.runOutsideAngular(() => document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      const ahora = performance.now();
      if (ahora - this.ultimo < 55) return;
      this.ultimo = ahora;
      const t = this.temporada();
      if (t) this.chispa(e.clientX, e.clientY, t, false);
    }, { passive: true }));
  }

  private temporada(): string {
    const html = document.documentElement;
    if (html.classList.contains('sin-animaciones') || html.classList.contains('sin-rastro')) return '';
    // La decoración de temporada (components/apariencia/temporada.ts) deja la clave en <html>.
    return html.getAttribute('data-temporada') || '';
  }

  /** Estallido chiquito (al guardar) en ese punto de la pantalla. */
  public estallar(x: number, y: number): void {
    const t = this.temporada();
    if (!t) return;
    for (let i = 0; i < 12; i++) this.chispa(x, y, t, true, i);
  }

  private chispa(x: number, y: number, t: string, estallido: boolean, i = 0): void {
    if (this.vivas > 24 && !estallido) return;
    const z = parseFloat(getComputedStyle(document.documentElement).zoom || '1') || 1;
    const el = document.createElement('span');
    const formas = RASTRO[t] || ['✦'];
    el.className = 'ch-chispa';
    el.textContent = formas[Math.floor(Math.random() * formas.length)];
    el.style.left = x / z + 'px';
    el.style.top = y / z + 'px';
    el.style.color = Math.random() < 0.5 ? 'var(--tp-c1, var(--acento))' : 'var(--tp-c2, var(--acento-texto))';
    el.style.fontSize = (estallido ? 10 + Math.random() * 10 : 8 + Math.random() * 8) + 'px';
    const ang = estallido ? (i / 12) * Math.PI * 2 + Math.random() * 0.4 : Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const dist = estallido ? 40 + Math.random() * 50 : 18 + Math.random() * 22;
    el.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    el.style.setProperty('--dy', Math.sin(ang) * dist + (estallido ? 0 : 10) + 'px');
    el.style.animationDuration = (estallido ? 0.9 : 0.8 + Math.random() * 0.4) + 's';
    document.body.appendChild(el);
    this.vivas++;
    setTimeout(() => { el.remove(); this.vivas--; }, estallido ? 950 : 1250);
  }
}
