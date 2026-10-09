import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { Temporada, temporadaVisible } from '../../services/temporadas';

interface Particula { texto: string; color: string; left: number; delay: number; dur: number; tam: number; deriva: number; giro: number; }

/**
 * DECORACIÓN DE TEMPORADA (services/temporadas.ts): cosas que caen despacio
 * (pocas, solo con movimiento: no cargan el equipo), un emoji junto al logo
 * y detalles propios de algunas fechas (telarañas, murciélagos y fantasma en
 * Halloween; luces en la barra en Navidad). No se pueden tocar ni tapan
 * nada. Cada cuenta la deja automática, la quita o escoge una para verla.
 * Con "Quitar animaciones" no cae nada (queda solo lo quieto).
 */
@Component({
  selector: 'app-temporada',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="temporada() as t">
      <div class="tp-capa" aria-hidden="true">
        <span *ngFor="let p of particulas()" class="tp-p" [class.tp-papel]="!!p.color"
              [style.left.%]="p.left" [style.animation-delay.s]="p.delay" [style.animation-duration.s]="p.dur"
              [style.font-size.px]="p.tam" [style.--deriva]="p.deriva + 'px'" [style.--giro]="p.giro + 'deg'" [style.background]="p.color || null">{{ p.color ? '' : p.texto }}</span>
      </div>
      <ng-container *ngIf="t.clave === 'halloween'">
        <svg class="tp-telarana tp-izq" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20"/>
          <path d="M0 22 Q11 18 22 0 M0 44 Q24 38 44 0 M0 66 Q36 58 66 0 M0 88 Q48 78 88 0"/></g></svg>
        <svg class="tp-telarana tp-der" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20"/>
          <path d="M0 22 Q11 18 22 0 M0 44 Q24 38 44 0 M0 66 Q36 58 66 0 M0 88 Q48 78 88 0"/></g></svg>
        <div class="tp-capa" aria-hidden="true">
          <span class="tp-murcielago" style="top: 18%; animation-delay: 2s;">🦇</span>
          <span class="tp-murcielago tp-m2" style="top: 32%; animation-delay: 11s;">🦇</span>
          <span class="tp-murcielago tp-m3" style="top: 12%; animation-delay: 19s;">🦇</span>
          <span class="tp-fantasma">👻</span>
        </div>
      </ng-container>
    </ng-container>
  `
})
export class TemporadaComponent {
  private theme = inject(ThemeService);
  private hoy = signal(new Date());
  public temporada = computed<Temporada | null>(() => temporadaVisible(this.theme.temporadaPreferida(), this.hoy()));
  public particulas = computed<Particula[]>(() => {
    const t = this.temporada();
    if (!t) return [];
    const celular = typeof window !== 'undefined' && window.innerWidth < 600;
    const n = Math.round(t.cuantas * (celular ? 0.5 : 1));
    return Array.from({ length: n }, (_, i) => {
      const elemento = t.particulas[i % t.particulas.length];
      const esColor = elemento.startsWith('#');
      return {
        texto: esColor ? '' : elemento, color: esColor ? elemento : '',
        left: Math.round(((i + 0.5) / n) * 100 + (Math.random() * 6 - 3)),
        delay: -Math.round(Math.random() * 20 * 10) / 10,            // ya van cayendo al abrir
        dur: 12 + Math.round(Math.random() * 12),
        tam: (esColor ? 10 : 14) + Math.round(Math.random() * 10),
        deriva: Math.round(Math.random() * 80 - 40),
        giro: Math.round(Math.random() * 540 - 270)
      };
    });
  });

  constructor() {
    // La temporada cambia sola al pasar la medianoche (se revisa cada hora).
    if (typeof window !== 'undefined') setInterval(() => this.hoy.set(new Date()), 3600000);
    effect(() => {
      const t = this.temporada();
      if (typeof document === 'undefined') return;
      const html = document.documentElement;
      if (t) { html.setAttribute('data-temporada', t.clave); html.style.setProperty('--temporada-emoji', `"${t.emoji}"`); }
      else { html.removeAttribute('data-temporada'); html.style.removeProperty('--temporada-emoji'); }
    });
  }
}
