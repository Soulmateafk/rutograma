import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { TEMPORADAS, Temporada, aniversarioActual, delDia } from '../../services/temporadas';

/**
 * CALENDARIO DE FIESTAS (Apariencia → Decoración de temporada → "Calendario"):
 * todas las fechas del año, cuánto falta para cada una, y "Ver cómo se ve"
 * para mirar la decoración de una fiesta por un rato sin cambiar nada.
 */
interface Fila { t: Temporada; fecha: Date; faltan: number; ahora: boolean; frase: string; }

@Component({
  selector: 'app-calendario-fiestas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="cf-fondo" (click)="cerrar.emit()">
      <div class="cf-caja" (click)="$event.stopPropagation()" role="dialog" aria-label="Calendario de fiestas">
        <div class="cf-cab">
          <strong>📅 Calendario de fiestas</strong>
          <button class="cf-x" (click)="cerrar.emit()" aria-label="Cerrar">×</button>
        </div>
        <p class="cf-nota">La app se decora sola en cada fecha. Toca "Ver cómo se ve" para mirarla ahora (no cambia nada; vuelve con "Volver").</p>
        <div class="cf-lista">
          <div class="cf-fila" *ngFor="let f of filas" [class.ahora]="f.ahora" [style.--c1]="f.t.colores[0]" [style.--c2]="f.t.colores[1]">
            <span class="cf-emoji">{{ f.t.emoji }}</span>
            <div class="cf-info">
              <strong>{{ f.t.nombre }}</strong>
              <small>{{ f.fecha | date:"EEEE d 'de' MMMM":'':'es' }}</small>
              <small class="cf-frase" *ngIf="f.frase">“{{ f.frase }}”</small>
            </div>
            <div class="cf-lado">
              <span class="cf-faltan" [class.hoy]="f.ahora">{{ f.ahora ? '¡Ahora!' : f.faltan === 1 ? 'Mañana' : 'en ' + f.faltan + ' días' }}</span>
              <button class="cf-ver" (click)="ver(f.t.clave)"><i class="bi bi-eye"></i> Ver cómo se ve</button>
            </div>
          </div>
          <div class="cf-sin-aniv" *ngIf="!tieneAniversario">🎂 El aniversario de MAKAND aparece aquí cuando la oficina ponga la fecha en Configuración.</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .cf-fondo { position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 10060; display: flex; align-items: center; justify-content: center; padding: 14px; }
    .cf-caja { width: 100%; max-width: 560px; max-height: calc(100vh - 28px); display: flex; flex-direction: column; background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 1px solid var(--color-borde, #374151); border-radius: 16px; padding: 14px; box-shadow: 0 20px 50px rgba(0,0,0,.5); }
    :host-context(html.con-fondo) .cf-caja { background: #111827; }
    :host-context(body.tema-claro) .cf-caja { background: #fff; }
    .cf-cab { display: flex; align-items: center; justify-content: space-between; font-size: 16px; }
    .cf-x { background: none; border: 1px solid var(--color-borde, #374151); color: inherit; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 18px; }
    .cf-nota { font-size: 12px; color: var(--color-texto-apagado, #94a3b8); margin: 6px 0 10px; }
    .cf-lista { overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
    .cf-fila { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--color-borde, #374151); border-left: 5px solid var(--c1);
      background: linear-gradient(90deg, color-mix(in srgb, var(--c1) 12%, transparent), transparent 60%); }
    .cf-fila.ahora { box-shadow: 0 0 0 2px var(--c1), 0 0 18px color-mix(in srgb, var(--c2) 40%, transparent); }
    .cf-emoji { font-size: 28px; width: 36px; text-align: center; }
    .cf-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
    .cf-info small { font-size: 12px; color: var(--color-texto-apagado, #94a3b8); }
    .cf-info small:first-of-type { text-transform: capitalize; }
    .cf-frase { font-style: italic; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cf-lado { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; }
    .cf-faltan { font-size: 12px; font-weight: 800; color: var(--c1); white-space: nowrap; }
    .cf-faltan.hoy { animation: cf-latir 1.2s ease-in-out infinite; }
    @keyframes cf-latir { 50% { transform: scale(1.12); } }
    .cf-ver { background: var(--color-fondo-input, #1f2937); border: 1px solid var(--color-borde, #374151); color: inherit; border-radius: 8px; padding: 4px 9px; font-size: 12px; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .cf-ver:hover { border-color: var(--c1); }
    .cf-sin-aniv { font-size: 12px; color: var(--color-texto-apagado, #94a3b8); text-align: center; padding: 8px; }
    @media (max-width: 480px) { .cf-frase { display: none; } }
  `]
})
export class CalendarioFiestasComponent {
  @Output() cerrar = new EventEmitter<void>();
  private theme = inject(ThemeService);
  public tieneAniversario = !!aniversarioActual();
  public filas: Fila[] = this.armar();

  private armar(): Fila[] {
    const hoy = new Date(); const h0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
    return TEMPORADAS.filter(t => t.clave !== 'aniversario' || aniversarioActual()).map(t => {
      let fecha = t.diaGrande(hoy.getFullYear());
      const ahora = t.activa(hoy);
      if (!ahora && fecha.getTime() < h0) fecha = t.diaGrande(hoy.getFullYear() + 1);
      return { t, fecha, ahora, faltan: Math.round((fecha.getTime() - h0) / 86400000), frase: delDia(t.frases) || '' };
    }).sort((a, b) => Number(b.ahora) - Number(a.ahora) || a.faltan - b.faltan);
  }

  public ver(clave: string): void {
    this.theme.verTemporada(clave);
    this.cerrar.emit();
    this.theme.panelAbierto.set(false);
  }
}
