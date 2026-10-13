import { Component, Input, booleanAttribute, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { temporadaVisible, diasParaElDia, delDia } from '../../services/temporadas';

/**
 * LETRERO DE LA FIESTA para las pantallas sin barra (login, registro,
 * cuenta pendiente, resumen, Mis viajes, Despachos): el saludo de la
 * temporada, cuánto falta para el día grande y la frase del día.
 * Solo sale si hay una fiesta y la cuenta no quitó la decoración.
 */
@Component({
  selector: 'app-saludo-fiesta',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sf" *ngIf="info() as i" [class.sf-chico]="chico" [style.--c1]="i.c1" [style.--c2]="i.c2">
      <span class="sf-emoji">{{ i.emoji }}</span>
      <span class="sf-texto">
        <strong>{{ i.titulo }}</strong>
        <small *ngIf="i.frase && !chico">{{ i.frase }}</small>
      </span>
    </div>
  `,
  styles: [`
    .sf { display: flex; align-items: center; gap: 10px; margin: 10px auto 0; padding: 8px 14px; border-radius: 14px; max-width: 100%; box-sizing: border-box; text-align: left;
      background: linear-gradient(135deg, color-mix(in srgb, var(--c1) 22%, transparent), color-mix(in srgb, var(--c2) 18%, transparent));
      border: 1px solid color-mix(in srgb, var(--c1) 55%, transparent); box-shadow: 0 0 18px color-mix(in srgb, var(--c2) 25%, transparent); animation: sf-entrar .6s cubic-bezier(.2,.9,.3,1.3); }
    .sf-emoji { font-size: 26px; line-height: 1; animation: sf-balanceo 2.8s ease-in-out infinite; }
    .sf-texto { display: flex; flex-direction: column; line-height: 1.3; min-width: 0; }
    .sf-texto strong { font-size: 13.5px; color: color-mix(in srgb, var(--c1) 70%, #ffffff); }
    :host-context(body.tema-claro) .sf-texto strong { color: color-mix(in srgb, var(--c1) 70%, #000000); }
    .sf-texto small { font-size: 11.5px; color: var(--color-texto-apagado, #94a3b8); }
    .sf-chico { padding: 4px 10px; gap: 6px; margin: 6px 0 0; display: inline-flex; }
    .sf-chico .sf-emoji { font-size: 16px; }
    .sf-chico .sf-texto strong { font-size: 12px; }
    @keyframes sf-entrar { from { opacity: 0; transform: translateY(6px) scale(.96); } to { opacity: 1; transform: none; } }
    @keyframes sf-balanceo { 0%, 100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg) scale(1.08); } }
    :host-context(html.sin-animaciones) .sf, :host-context(html.sin-animaciones) .sf-emoji { animation: none; }
  `]
})
export class SaludoFiestaComponent {
  @Input({ transform: booleanAttribute }) chico = false;
  private theme = inject(ThemeService);
  public info = computed(() => {
    const t = temporadaVisible(this.theme.temporadaPreferida());
    if (!t) return null;
    const n = diasParaElDia(t);
    const titulo = n === 0 ? `¡Hoy es ${t.nombreDia}! ${t.saludo}` : n === 1 ? `¡Mañana es ${t.nombreDia}!` : n > 1 && n <= 60 ? `${t.saludo} Faltan ${n} días.` : t.saludo;
    return { emoji: t.emoji, titulo, frase: delDia(t.frases) || '', c1: t.colores[0], c2: t.colores[1] };
  });
}
