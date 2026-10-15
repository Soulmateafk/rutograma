import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NOMBRES_PAGINA, PersonaEnLinea, PresenciaService, nivelAusencia } from '../../services/presencia.service';
import { elementosDeClave } from './marcador';
import { ThemeService } from '../../services/theme.service';

/**
 * "EDITANDO AHORA": avisos arriba a la derecha, siempre a la vista, de quién
 * está editando algo en este momento ("Carla está editando la ruta
 * BOG-CAL-D1"), con su color. Así se ve aunque la fila esté más abajo,
 * filtrada o en otra página. "Ver dónde" lleva a la página y baja hasta eso.
 * Datos: la presencia (services/presencia.service.ts).
 */
@Component({
  selector: 'app-editando-ahora',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ea" *ngIf="editando().length">
      <div *ngFor="let p of editando()" class="ea-item" [style.--ea]="p.color || '#f59e0b'" [class.ausente]="ausente(p)">
        <span class="ea-cara">{{ p.avatar || p.nombre.charAt(0).toUpperCase() }}</span>
        <span class="ea-texto"><b>{{ p.nombre }}</b> está {{ p.accion || 'editando' }}<ng-container *ngIf="!aqui(p)"> en {{ p.pagina }}</ng-container><ng-container *ngIf="ausente(p)"> (ausente)</ng-container></span>
        <button type="button" (click)="ver(p)">{{ aqui(p) ? 'Ver dónde' : 'Ir' }} →</button>
      </div>
    </div>
  `,
  styles: [`
    .ea { position: fixed; top: 64px; right: 14px; z-index: 9984; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; pointer-events: none; max-width: min(440px, calc(100vw - 28px)); }
    .ea-item { pointer-events: auto; display: flex; align-items: center; gap: 8px; padding: 6px 8px 6px 6px; border-radius: 999px; background: var(--color-fondo-tarjeta, #0f172a);
      border: 2px solid var(--ea); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ea) 30%, transparent), 0 6px 18px rgba(0, 0, 0, .4); color: var(--color-texto-principal, #e2e8f0); font-size: 12.5px; animation: ea-entra .3s ease-out; }
    .ea-item.ausente { border-style: dashed; opacity: .85; }
    .ea-cara { width: 24px; height: 24px; border-radius: 50%; background: var(--ea); color: #fff; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; animation: ea-late 1.4s ease-in-out infinite; }
    .ea-texto { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ea-texto b { color: var(--ea); filter: brightness(1.35); }
    .ea-item button { flex-shrink: 0; border: 0; border-radius: 999px; padding: 3px 10px; background: var(--ea); color: #fff; font-weight: 700; font-size: 11.5px; cursor: pointer; }
    @keyframes ea-entra { from { opacity: 0; transform: translateX(20px); } }
    @keyframes ea-late { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--ea) 35%, transparent); } }
    :host-context(html.sin-animaciones) .ea-item, :host-context(html.sin-animaciones) .ea-cara { animation: none; }
    @media (max-width: 600px) { .ea { top: auto; bottom: 74px; right: 8px; } }
  `]
})
export class EditandoAhoraComponent {
  private presencia = inject(PresenciaService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  /** Los demás que están editando algo ahora (no mis otras ventanas). */
  readonly editando = computed(() => this.theme.veoEnVivo('aviso') ? this.presencia.enLinea().filter(p => !p.esYo && p.editando).slice(0, 4) : []);

  ausente(p: PersonaEnLinea): boolean { return !!nivelAusencia(p.ausenteSeg, p.oculta); }

  private rutaDe(p: PersonaEnLinea): string {
    return '/' + (Object.entries(NOMBRES_PAGINA).find(([, n]) => n === p.pagina)?.[0] || '');
  }

  /** ¿Está en la misma página que yo? */
  aqui(p: PersonaEnLinea): boolean { return this.router.url.split(/[?#]/)[0].startsWith(this.rutaDe(p)) && this.rutaDe(p) !== '/'; }

  /** Lleva a su página (si hace falta) y baja hasta lo que está editando. */
  ver(p: PersonaEnLinea): void {
    const bajar = (intentos = 0) => {
      const el = p.clave ? elementosDeClave(p.clave)[0] : null;
      if (!el) { if (intentos < 12) setTimeout(() => bajar(intentos + 1), 250); return; }
      el.scrollIntoView({ behavior: document.documentElement.classList.contains('sin-animaciones') ? 'auto' : 'smooth', block: 'center', inline: 'nearest' });
    };
    if (this.aqui(p)) bajar();
    else if (this.rutaDe(p) !== '/') this.router.navigateByUrl(this.rutaDe(p)).then(() => bajar());
  }
}
