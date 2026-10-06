import { ChangeDetectionStrategy, Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenciaService } from '../../services/presencia.service';

/**
 * "En línea" de la barra de arriba: quién más está usando la app ahora
 * mismo, en qué página y qué está haciendo. Se actualiza solo (cada 8 s)
 * y no guarda nada: es lo que pasa en este momento.
 */
@Component({
  selector: 'app-en-linea',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="el-caja" data-guia="nav-en-linea">
      <button type="button" class="el-boton" (click)="$event.stopPropagation(); abierto = !abierto"
              [title]="personas().length ? 'Quién más está en la app ahora (también tus otras ventanas o equipos)' : 'Nadie más está en la app ahora'">
        <i class="bi bi-people-fill"></i>
        <span class="el-punto" [class.hay]="personas().length"></span>
        <span class="el-num">{{ personas().length }}</span>
      </button>
      <div class="el-panel" *ngIf="abierto" (click)="$event.stopPropagation()">
        <div class="el-titulo">En línea ahora</div>
        <div *ngIf="!personas().length" class="el-vacio">Nadie más: solo esta ventana.</div>
        <div *ngFor="let p of personas()" class="el-fila" [class.yo]="p.esYo">
          <span class="el-avatar" [class.edita]="p.editando" [class.yo]="p.esYo">{{ p.esYo ? 'Tú' : p.nombre.charAt(0) }}</span>
          <div class="el-texto">
            <div><b>{{ p.esYo ? 'Tú' : p.nombre }}</b> · {{ p.pagina || 'en la app' }}</div>
            <div class="el-equipo" *ngIf="p.esYo">en otra ventana o equipo<ng-container *ngIf="p.dispositivo"> ({{ p.dispositivo }})</ng-container></div>
            <div class="el-equipo" *ngIf="!p.esYo && p.oculta">ventana minimizada o en segundo plano</div>
            <div class="el-accion" [class.edita]="p.editando">
              <i *ngIf="p.editando" class="bi bi-pencil-fill"></i>
              {{ p.accion || 'mirando' }} · {{ hace(p.haceSeg) }}
            </div>
          </div>
        </div>
        <div class="el-pie">Se actualiza solo. No queda en ningún historial.</div>
      </div>
    </div>
  `,
  styles: [`
    .el-caja { position: relative; }
    .el-boton { position: relative; display: inline-flex; align-items: center; gap: 5px; height: 30px; padding: 0 10px; border-radius: 7px; border: 1px solid var(--color-borde, #334155); background: var(--color-fondo-tarjeta, #1e293b); color: var(--color-texto-principal, #e2e8f0); cursor: pointer; font-size: 13px; font-family: inherit; }
    .el-punto { position: absolute; top: 4px; left: 20px; width: 7px; height: 7px; border-radius: 50%; background: #64748b; }
    .el-punto.hay { background: #22c55e; box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.25); }
    .el-num { font-weight: 700; }
    .el-panel { position: absolute; right: 0; top: calc(100% + 6px); z-index: 3000; width: min(340px, calc(100vw - 24px)); max-height: 60vh; overflow-y: auto; background: var(--color-fondo-tarjeta, #0f172a); border: 1px solid var(--color-borde, #334155); border-radius: 10px; box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45); padding: 10px; color: var(--color-texto-principal, #e2e8f0); }
    .el-titulo { font-weight: 700; font-size: 13px; margin-bottom: 8px; }
    .el-vacio { font-size: 13px; opacity: .75; padding: 4px 0 8px; }
    .el-fila { display: flex; gap: 10px; align-items: flex-start; padding: 7px 0; border-top: 1px solid var(--color-borde, #334155); font-size: 13px; }
    .el-avatar { flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; background: rgba(96, 165, 250, 0.2); color: #93c5fd; }
    .el-avatar.edita { background: rgba(245, 158, 11, 0.22); color: #fbbf24; }
    .el-avatar.yo { font-size: 10px; background: rgba(148, 163, 184, 0.2); color: #cbd5e1; }
    .el-equipo { font-size: 11.5px; opacity: .7; }
    .el-texto { min-width: 0; }
    .el-accion { font-size: 12px; opacity: .8; }
    .el-accion.edita { color: #fbbf24; opacity: 1; }
    .el-pie { margin-top: 6px; font-size: 11px; opacity: .55; }
  `]
})
export class EnLineaComponent {
  private presencia = inject(PresenciaService);
  readonly personas = this.presencia.enLinea;
  abierto = false;

  // El aviso lo arranca app.ts en cualquier pantalla con sesión; esto solo lo muestra.
  @HostListener('document:click') cerrar(): void { this.abierto = false; }

  hace(seg: number): string {
    if (seg < 60) return 'ahora';
    const min = Math.floor(seg / 60);
    return min < 60 ? `hace ${min} min` : `hace ${Math.floor(min / 60)} h`;
  }
}
