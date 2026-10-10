import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * CARGA CON ESQUELETO: mientras llega la información se ven las formas de
 * lo que va a aparecer (filas o tarjetas) brillando suave, en vez de una
 * pantalla vacía o "Cargando…".
 */
@Component({
  selector: 'app-esqueleto',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sk" [ngClass]="'sk-' + tipo" role="status" aria-label="Cargando">
      <ng-container *ngIf="tipo === 'tarjetas'">
        <div class="sk-tarjeta" *ngFor="let f of lista">
          <div class="sk-b" style="width: 45%; height: 10px;"></div>
          <div class="sk-b" style="width: 30%; height: 26px; margin-top: 10px;"></div>
          <div class="sk-b" style="width: 60%; height: 9px; margin-top: 10px;"></div>
        </div>
      </ng-container>
      <ng-container *ngIf="tipo !== 'tarjetas'">
        <div class="sk-fila" *ngFor="let f of lista; let i = index">
          <div class="sk-b sk-circulo" *ngIf="tipo === 'lista'"></div>
          <div class="sk-col">
            <div class="sk-b" [style.width.%]="70 - (i % 3) * 12" style="height: 11px;"></div>
            <div class="sk-b" [style.width.%]="45 - (i % 2) * 10" style="height: 9px; margin-top: 7px;"></div>
          </div>
          <div class="sk-b" *ngIf="tipo === 'tabla'" style="width: 70px; height: 20px; border-radius: 6px;"></div>
        </div>
      </ng-container>
      <span class="sk-texto">{{ texto }}</span>
    </div>
  `,
  styles: [`
    .sk { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
    .sk-tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }
    .sk-tarjeta { border: 1px solid var(--border2, #374151); border-radius: 12px; padding: 14px; background: var(--bg2, #111827); }
    .sk-fila { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid var(--border, #1f2937); border-radius: 10px; background: var(--bg2, #111827); }
    .sk-col { flex: 1; min-width: 0; }
    .sk-circulo { width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0; }
    .sk-b { border-radius: 6px; background: linear-gradient(90deg, var(--bg3, #1f2937) 0%, color-mix(in srgb, var(--acento, #2563eb) 18%, var(--bg4, #374151)) 50%, var(--bg3, #1f2937) 100%);
      background-size: 200% 100%; animation: sk-brillo 1.4s ease-in-out infinite; }
    .sk-texto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    :host-context(html.sin-animaciones) .sk-b { animation: none; }
    @keyframes sk-brillo { from { background-position: 100% 0; } to { background-position: -100% 0; } }
  `]
})
export class EsqueletoComponent {
  @Input() filas = 4;
  @Input() tipo: 'lista' | 'tabla' | 'tarjetas' = 'lista';
  @Input() texto = 'Cargando…';
  get lista(): number[] { return Array.from({ length: this.filas }, (_, i) => i); }
}
