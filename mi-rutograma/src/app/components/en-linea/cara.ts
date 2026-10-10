import { ChangeDetectionStrategy, Component, Input, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvatarService } from '../../services/avatar.service';

/** La carita de una persona: su foto, su emoji o su inicial (Apariencia → Mi foto). */
@Component({
  selector: 'app-cara',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="cara" [class.emoji]="!foto() && avatar" [style.width.px]="tam" [style.height.px]="tam" [style.font-size.px]="tam * (avatar && !foto() ? 0.6 : 0.45)" [title]="nombre">
      <img *ngIf="foto()" [src]="foto()" alt="">
      <ng-container *ngIf="!foto()">{{ avatar || texto || (nombre || '?').charAt(0).toUpperCase() }}</ng-container>
    </span>
  `,
  styles: [`
    .cara { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; overflow: hidden; flex-shrink: 0; font-weight: 700;
      background: rgba(96, 165, 250, 0.2); color: #93c5fd; }
    .cara.emoji { background: var(--bg3, #1f2937); }
    .cara img { width: 100%; height: 100%; object-fit: cover; }
  `]
})
export class CaraComponent {
  private avatares = inject(AvatarService);
  private datos = signal({ aid: '', v: '' });
  @Input() nombre = '';
  @Input() avatar = '';
  @Input() texto = '';
  @Input() tam = 28;
  @Input() set aid(x: string) { this.datos.update(d => ({ ...d, aid: x || '' })); }
  @Input() set fotoV(x: string) { this.datos.update(d => ({ ...d, v: x || '' })); }
  readonly foto = computed(() => { const d = this.datos(); return d.aid && d.v ? this.avatares.foto(d.aid, d.v)() : ''; });
}
