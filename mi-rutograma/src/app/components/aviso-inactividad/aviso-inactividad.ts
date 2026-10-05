import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InactividadService } from '../../services/inactividad.service';

/** Aviso con cuenta regresiva antes de cerrar la sesión por inactividad. */
@Component({
  selector: 'app-aviso-inactividad',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ina-fondo" *ngIf="inactividad.segundosRestantes() as s" role="alertdialog" aria-live="assertive">
      <div class="ina-cuadro">
        <i class="bi bi-hourglass-split ina-icono"></i>
        <h3>¿Sigues ahí?</h3>
        <p>No has usado la app en casi una hora. Por seguridad, tu sesión se cerrará en</p>
        <div class="ina-cuenta">{{ formato(s) }}</div>
        <button class="ina-btn" (click)="inactividad.seguirConectado()">Seguir conectado</button>
      </div>
    </div>
  `,
  styles: [`
    .ina-fondo { position: fixed; inset: 0; z-index: 30000; background: rgba(2, 6, 23, 0.72); display: flex; align-items: center; justify-content: center; padding: 16px; }
    .ina-cuadro { width: min(380px, 100%); box-sizing: border-box; background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 24px 22px 20px; text-align: center; color: #e2e8f0; box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5); }
    .ina-icono { font-size: 30px; color: #f59e0b; }
    h3 { margin: 10px 0 6px; font-size: 18px; color: #f8fafc; }
    p { margin: 0; font-size: 13.5px; line-height: 1.5; color: #cbd5e1; }
    .ina-cuenta { font-size: 34px; font-weight: 700; margin: 10px 0 16px; color: #fbbf24; font-variant-numeric: tabular-nums; }
    .ina-btn { width: 100%; background: #2563eb; border: 1px solid #3b82f6; color: #fff; font-weight: 600; font-size: 14px; border-radius: 9px; padding: 10px 14px; cursor: pointer; font-family: inherit; }
    .ina-btn:hover { filter: brightness(1.1); }
  `]
})
export class AvisoInactividadComponent {
  public inactividad = inject(InactividadService);

  public formato(s: number): string {
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
