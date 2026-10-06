import { ChangeDetectionStrategy, Component, Input, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PresenciaService } from '../../services/presencia.service';

/**
 * Aviso dentro de un formulario: quién más tiene abierto lo mismo ahora
 * ("Carla está editando este vehículo"). Usa services/presencia.service.ts.
 */
@Component({
  selector: 'app-otros-aqui',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="oa" *ngIf="otros().length" [class.edita]="alguienEdita()">
      <i class="bi" [ngClass]="alguienEdita() ? 'bi-pencil-fill' : 'bi-eye-fill'"></i>
      <span><strong>{{ texto() }}.</strong>
        <ng-container *ngIf="otroEdita()"> Espera a que termine o coordina con esa persona antes de guardar.</ng-container>
        <ng-container *ngIf="!otroEdita() && alguienEdita()"> Guarda en una sola ventana para no pisar tus propios cambios.</ng-container></span>
    </div>
  `,
  styles: [`
    .oa { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 12px; padding: 8px 12px; border-radius: 8px; font-size: 13px; text-align: left; background: rgba(96, 165, 250, 0.12); border: 1px solid rgba(96, 165, 250, 0.4); color: #bfdbfe; }
    .oa.edita { background: rgba(245, 158, 11, 0.14); border-color: rgba(245, 158, 11, 0.55); color: #fde68a; }
    .oa i { margin-top: 2px; }
  `]
})
export class OtrosAquiComponent {
  /** "este viaje", "este vehículo", "este conductor"... */
  @Input() que = 'esto';
  private presencia = inject(PresenciaService);
  readonly otros = this.presencia.otros;
  readonly alguienEdita = computed(() => this.otros().some(x => x.editando));
  readonly otroEdita = computed(() => this.otros().some(x => x.editando && !x.esYo));

  readonly texto = computed(() => {
    const lista = this.otros().filter(x => !x.esYo);
    const yo = this.otros().find(x => x.esYo);
    const nombres = (xs: { nombre: string }[]) => xs.map(x => x.nombre).join(xs.length === 2 ? ' y ' : ', ');
    const editan = lista.filter(x => x.editando), ven = lista.filter(x => !x.editando);
    const partes: string[] = [];
    if (editan.length) partes.push(`${nombres(editan)} ${editan.length === 1 ? 'está editando' : 'están editando'} ${this.que}`);
    if (ven.length) partes.push(`${nombres(ven)} ${ven.length === 1 ? 'lo tiene abierto' : 'lo tienen abierto'}`);
    // La misma cuenta en otra ventana o equipo (ej. el PC de la oficina y la laptop).
    if (yo) partes.push(yo.editando ? 'Tú lo estás editando en otra ventana o equipo' : 'Tú lo tienes abierto en otra ventana o equipo');
    return partes.join(' · ');
  });
}
