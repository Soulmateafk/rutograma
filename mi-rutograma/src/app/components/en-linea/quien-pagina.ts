import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NOMBRES_PAGINA, PersonaEnLinea, PresenciaService, nivelAusencia, textoAusencia } from '../../services/presencia.service';
import { CaraComponent } from './cara';
import { ThemeService } from '../../services/theme.service';

/**
 * Puntitos en vivo de quién está en una página (en las pestañas de arriba)
 * o con un viaje abierto (en el Rutograma). El borde dice cómo está:
 * verde activo, amarillo ausente +5 min, rojo ausente +10 min.
 * Datos: services/presencia.service.ts (se actualiza solo).
 */
@Component({
  selector: 'app-quien-aqui',
  standalone: true,
  imports: [CommonModule, CaraComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="qa" *ngIf="personas().length" [title]="titulo()">
      <span *ngFor="let p of personas().slice(0, max)" class="qa-cara" [ngClass]="nivel(p.ausenteSeg, p.oculta) || 'activo'" [class.edita]="p.editando">
        <app-cara [nombre]="p.nombre" [avatar]="p.avatar || ''" [aid]="p.aid || ''" [fotoV]="p.fotoV || ''" [tam]="tam"></app-cara>
      </span>
      <span class="qa-mas" *ngIf="personas().length > max">+{{ personas().length - max }}</span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .qa { display: inline-flex; align-items: center; margin-left: 5px; }
    .qa-cara { display: inline-flex; border-radius: 50%; box-shadow: 0 0 0 2px #22c55e; animation: qa-entra .25s ease-out; }
    .qa-cara + .qa-cara { margin-left: -4px; }
    .qa-cara.amarillo { box-shadow: 0 0 0 2px #facc15; }
    .qa-cara.rojo { box-shadow: 0 0 0 2px #ef4444; }
    .qa-cara.edita.activo { box-shadow: 0 0 0 2px #f59e0b; }
    .qa-mas { font-size: 10px; font-weight: 700; margin-left: 3px; opacity: .85; }
    @keyframes qa-entra { from { transform: scale(.4); opacity: 0; } }
    @media (prefers-reduced-motion: reduce) { .qa-cara { animation: none; } }
  `]
})
export class QuienAquiComponent {
  private presencia = inject(PresenciaService);
  private theme = inject(ThemeService);
  private rutas = signal<string[]>([]);
  private viaje = signal('');
  /** Rutas de la app ("/rutograma", o varias separadas por coma) cuyas personas se muestran. */
  @Input() set en(x: string) { this.rutas.set(String(x || '').split(',').filter(Boolean)); }
  /** O el id de un viaje abierto. */
  @Input() set viajeId(x: any) { this.viaje.set(x === null || x === undefined ? '' : String(x)); }
  @Input() tam = 16;
  @Input() max = 3;
  readonly nivel = nivelAusencia;

  readonly personas = computed<PersonaEnLinea[]>(() => {
    if (!this.theme.veoEnVivo('puntos')) return [];
    if (this.viaje()) return this.presencia.porViaje().get(this.viaje()) || [];
    const mapa = this.presencia.porPagina();
    return this.rutas().flatMap(r => mapa.get(NOMBRES_PAGINA[r.replace(/^\//, '').split('/')[0]] || '') || []);
  });

  readonly titulo = computed(() => this.personas().map(p => {
    const estado = nivelAusencia(p.ausenteSeg, p.oculta) ? textoAusencia(p.ausenteSeg, p.oculta) : 'activo';
    return `${p.nombre} · ${p.pagina}${p.accion ? ` · ${p.accion}` : ''} (${estado})`;
  }).join('\n'));
}
