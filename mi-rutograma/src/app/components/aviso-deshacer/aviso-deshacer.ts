import { Component, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';

/**
 * DESHACER AL MOMENTO: después de cada cambio sale abajo a la izquierda
 * "Viaje movido — Deshacer" por unos segundos. También con Ctrl+Z
 * (AtajosService). Usa el mismo historial que los botones Deshacer/Rehacer
 * de la barra.
 */
@Component({
  selector: 'app-aviso-deshacer',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ad-aviso" *ngIf="visible() as v" animate.leave="ap-ocultar" role="status">
      <i class="bi bi-check2-circle ad-icono"></i>
      <span class="ad-texto">{{ v.texto }}</span>
      <button class="ad-boton" (click)="deshacer()" [disabled]="trabajando"><i class="bi bi-arrow-counterclockwise"></i> Deshacer</button>
      <kbd class="ad-tecla">Ctrl+Z</kbd>
      <button class="ad-cerrar" (click)="visible.set(null)" aria-label="Cerrar"><i class="bi bi-x"></i></button>
      <span class="ad-tiempo" [style.animation-duration.ms]="DURA"></span>
    </div>
  `,
  styles: [`
    .ad-aviso { position: fixed; left: 20px; bottom: 22px; z-index: 10040; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 40px);
      background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 1px solid var(--acento); border-radius: 12px;
      padding: 9px 10px 9px 14px; font-size: 13px; box-shadow: 0 14px 30px rgba(0,0,0,.4); overflow: hidden; animation: ad-entrar .4s cubic-bezier(.2,.9,.3,1.25); }
    .ad-icono { color: #22c55e; font-size: 17px; }
    .ad-texto { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 360px; }
    .ad-boton { background: var(--acento); color: #fff; border: none; border-radius: 8px; padding: 5px 10px; font-weight: 700; font-family: inherit; cursor: pointer; display: inline-flex; gap: 5px; align-items: center; }
    .ad-boton:hover { filter: brightness(1.1); }
    .ad-tecla { font-size: 10px; opacity: .7; }
    .ad-cerrar { background: none; border: none; color: inherit; opacity: .6; cursor: pointer; font-size: 16px; padding: 0 2px; }
    .ad-tiempo { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--acento); transform-origin: left; animation: ad-tiempo linear forwards; }
    @keyframes ad-entrar { from { opacity: 0; transform: translateY(20px) scale(.95); } to { opacity: 1; transform: none; } }
    @keyframes ad-tiempo { from { transform: scaleX(1); } to { transform: scaleX(0); } }
    @media (max-width: 600px) { .ad-aviso { left: 10px; right: 10px; bottom: 12px; } .ad-tecla { display: none; } .ad-texto { max-width: none; flex: 1; } }
  `]
})
export class AvisoDeshacerComponent {
  private ds = inject(DataService);
  private ui = inject(UiService);
  public readonly DURA = 7000;
  public visible = signal<{ texto: string } | null>(null);
  public trabajando = false;
  private reloj: any = null;

  constructor() {
    effect(() => {
      const a = this.ds.avisoDeshacer();
      if (!a) return;
      this.visible.set({ texto: a.texto });
      clearTimeout(this.reloj);
      this.reloj = setTimeout(() => this.visible.set(null), this.DURA);
    });
  }

  public async deshacer(): Promise<void> {
    if (this.trabajando) return;
    this.trabajando = true;
    this.visible.set(null);
    const r = await this.ds.deshacerUltimoCambio();
    this.trabajando = false;
    this.ui.mostrarToast(r.mensaje, r.ok ? 'ok' : 'err');
  }
}
