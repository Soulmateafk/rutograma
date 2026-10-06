import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

/**
 * Botón "Ver foto" de una novedad que mandó un conductor. La foto se pide
 * con la sesión (no se puede con un <img src> directo) y se muestra
 * grande encima de todo; un clic fuera la cierra.
 */
@Component({
  selector: 'app-foto-novedad',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="fn-btn" (click)="$event.stopPropagation(); abrir()" [disabled]="cargando">
      <i class="bi bi-image"></i> {{ cargando ? 'Cargando…' : 'Ver foto' }}
    </button>
    <div class="fn-fondo" *ngIf="url" (click)="cerrar()">
      <img [src]="url" alt="Foto de la novedad" class="fn-img">
      <button type="button" class="fn-cerrar" (click)="cerrar()" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
    </div>
  `,
  styles: [`
    .fn-btn { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(96, 165, 250, 0.5); background: rgba(96, 165, 250, 0.15); color: #bfdbfe; font-size: 12px; cursor: pointer; font-family: inherit; flex-shrink: 0; }
    .fn-btn:disabled { opacity: .6; cursor: wait; }
    .fn-fondo { position: fixed; inset: 0; z-index: 20000; background: rgba(0, 0, 0, 0.85); display: flex; align-items: center; justify-content: center; padding: 16px; cursor: zoom-out; }
    .fn-img { max-width: 100%; max-height: 100%; border-radius: 8px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5); }
    .fn-cerrar { position: absolute; top: 14px; right: 14px; width: 40px; height: 40px; border-radius: 50%; border: none; background: rgba(255, 255, 255, 0.15); color: #fff; font-size: 18px; cursor: pointer; }
  `]
})
export class FotoNovedadComponent implements OnDestroy {
  @Input({ required: true }) id = '';
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  url: string | null = null;
  cargando = false;

  async abrir(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/novedades/foto/${encodeURIComponent(this.id)}`);
      if (!res.ok) throw new Error(String(res.status));
      this.cerrar();
      this.url = URL.createObjectURL(await res.blob());
    } catch {
      this.ui.mostrarToast('No se pudo cargar la foto.', 'err');
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  cerrar(): void {
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    if (this.url) URL.revokeObjectURL(this.url);
  }
}
