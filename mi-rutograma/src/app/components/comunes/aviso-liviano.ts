import { Component, inject } from '@angular/core';
import { ThemeService } from '../../services/theme.service';

/** Aviso pequeño cuando la app se puso sola en modo liviano (equipo lento). */
@Component({
  selector: 'app-aviso-liviano',
  standalone: true,
  template: `
    @if (theme.liviano() && !cerrado) {
      <div class="al-aviso" role="status">
        <i class="bi bi-lightning-charge-fill"></i>
        <span><b>Modo liviano.</b> Este equipo iba lento, así que apagué las animaciones y decoraciones para que todo vaya más rápido.</span>
        <button type="button" class="al-prender" (click)="theme.quitarLiviano()">Volver a prenderlas</button>
        <button type="button" class="al-x" (click)="cerrado = true" aria-label="Cerrar aviso" title="Dejarlo así">×</button>
      </div>
    }
  `,
  styles: [`
    .al-aviso { position: fixed; left: 16px; bottom: 16px; z-index: 9993; max-width: min(520px, calc(100vw - 32px)); display: flex; align-items: center; gap: 10px;
      background: var(--color-fondo-tarjeta, #0f172a); color: var(--color-texto-principal, #e2e8f0); border: 1px solid #f59e0b; border-radius: 12px;
      padding: 10px 12px; box-shadow: 0 10px 30px rgba(0,0,0,.45); font-size: 13px; }
    .al-aviso i { color: #fbbf24; font-size: 18px; }
    .al-aviso span { flex: 1; line-height: 1.35; }
    .al-prender { background: #f59e0b; color: #1c1300; border: none; border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer; white-space: nowrap; }
    .al-x { background: transparent; border: none; color: var(--color-texto-secundario, #94a3b8); font-size: 18px; cursor: pointer; padding: 0 4px; }
    @media (max-width: 600px) { .al-aviso { flex-wrap: wrap; } }
  `]
})
export class AvisoLivianoComponent {
  theme = inject(ThemeService);
  cerrado = false;
}
