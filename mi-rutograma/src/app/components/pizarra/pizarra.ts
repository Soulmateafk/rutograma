import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

/**
 * PIZARRA DE ANUNCIOS — avisos que ve todo el equipo ("Mañana cierre en la
 * vía al Llano, salir por Girardot"). Quedan fijos hasta que alguien los
 * quita o hasta su fecha de vencimiento. Los "para todos" también los ven
 * los conductores en Mis viajes; los "solo oficina", no. Se guardan para
 * todos los equipos (configuración compartida "anuncios").
 * conFormulario: muestra el formulario para agregar (en el Dashboard);
 * en las demás pantallas solo se ve si hay anuncios.
 */
@Component({
  selector: 'app-pizarra',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pz" *ngIf="vigentes.length || (conFormulario && puedeEditar)" data-guia="pizarra">
      <div class="pz-cab">
        <span class="pz-titulo"><i class="bi bi-pin-angle-fill"></i> Pizarra</span>
        <button *ngIf="puedeEditar && !agregando" class="pz-mas" (click)="agregando = true"><i class="bi bi-plus-lg"></i> Anuncio</button>
      </div>
      <div *ngIf="!vigentes.length && !agregando" class="pz-vacio">No hay anuncios. Lo que pongas aquí lo ve todo el equipo.</div>
      <div *ngFor="let a of vigentes" class="pz-anuncio" [class.importante]="a.importante">
        <div class="pz-texto">
          <i *ngIf="a.importante" class="bi bi-exclamation-triangle-fill"></i>
          {{ a.texto }}
          <span class="pz-meta">{{ autorDe(a) }}{{ a.para === 'oficina' ? ' · solo oficina' : ' · también conductores' }}{{ a.vence ? ' · hasta el ' + (a.vence | date:'d MMM':'':'es') : '' }}</span>
        </div>
        <button *ngIf="puedeEditar" class="pz-quitar" [disabled]="guardando" (click)="quitar(a.id)" title="Quitar anuncio"><i class="bi bi-x-lg"></i></button>
      </div>
      <div class="pz-form" *ngIf="agregando">
        <textarea [(ngModel)]="nuevo.texto" maxlength="300" rows="2" placeholder="Ej: Mañana cierre en la vía al Llano, salir por Bogotá–Girardot."></textarea>
        <div class="pz-opciones">
          <select [(ngModel)]="nuevo.para" aria-label="Quién lo ve">
            <option value="todos">Oficina y conductores</option>
            <option value="oficina">Solo oficina</option>
          </select>
          <label><input type="checkbox" [(ngModel)]="nuevo.importante"> Importante</label>
          <label>Hasta <input type="date" [(ngModel)]="nuevo.vence"></label>
          <button class="pz-btn" [disabled]="guardando" (click)="agregar()">Publicar</button>
          <button class="pz-cancelar" (click)="agregando = false">Cancelar</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .pz { margin: 12px 16px 0; padding: 10px 14px; border-radius: 10px; background: rgba(250, 204, 21, 0.08); border: 1px solid rgba(250, 204, 21, 0.35); color: var(--color-texto-principal); }
    .pz-cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .pz-titulo { font-weight: 700; font-size: 13px; color: #fde68a; display: inline-flex; gap: 6px; align-items: center; }
    .pz-mas { background: none; border: 1px solid rgba(250, 204, 21, 0.5); color: #fde68a; border-radius: 6px; padding: 3px 10px; cursor: pointer; font-family: inherit; font-size: 12.5px; }
    .pz-vacio { font-size: 12.5px; color: var(--color-texto-secundario); margin-top: 4px; }
    .pz-anuncio { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; padding: 7px 0 2px; border-top: 1px solid rgba(250, 204, 21, 0.18); margin-top: 6px; font-size: 13.5px; }
    .pz-anuncio.importante .pz-texto { color: #fca5a5; font-weight: 600; }
    .pz-meta { display: block; font-size: 11.5px; font-weight: 400; color: var(--color-texto-secundario); margin-top: 2px; }
    .pz-quitar { background: none; border: none; color: var(--color-texto-secundario); cursor: pointer; padding: 2px 4px; flex-shrink: 0; }
    .pz-form { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .pz-form textarea, .pz-form select, .pz-form input[type=date] { background: var(--color-fondo-input, #0f172a); color: var(--color-texto-principal); border: 1px solid var(--color-borde, #334155); border-radius: 7px; padding: 6px 8px; font-family: inherit; font-size: 13px; }
    .pz-form textarea { resize: vertical; }
    .pz-opciones { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; font-size: 12.5px; }
    .pz-opciones label { display: inline-flex; gap: 5px; align-items: center; }
    .pz-btn { background: #ca8a04; color: #fff; border: none; border-radius: 7px; padding: 6px 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .pz-cancelar { background: none; border: none; color: var(--color-texto-secundario); cursor: pointer; font-family: inherit; }
  `]
})
export class PizarraComponent implements OnInit, OnDestroy {
  @Input() conFormulario = false;
  private ds = inject(DataService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;
  agregando = false;
  guardando = false;
  nuevo = this.vacio();

  get puedeEditar(): boolean { return this.auth.puedeEditar; }

  get vigentes(): any[] {
    const h = new Date();
    const hoy = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    return (this.ds.S?.anuncios || [])
      .filter((a: any) => a && (!a.vence || String(a.vence) >= hoy))
      .sort((a: any, b: any) => Number(!!b.importante) - Number(!!a.importante) || String(b.fecha).localeCompare(String(a.fecha)));
  }

  ngOnInit(): void { this.sub = this.ds.dataChanged.subscribe(() => this.cdr.markForCheck()); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  /** Primer nombre de quien lo publicó (no el correo). */
  autorDe(a: any): string { return this.ds.nombreDe(a.autorEmail || a.autor) || ''; }

  private vacio() { return { texto: '', para: 'todos', importante: false, vence: '' }; }

  async agregar(): Promise<void> {
    const texto = String(this.nuevo.texto || '').trim().replace(/\s+/g, ' ');
    if (texto.length < 5) { this.ui.mostrarToast('Escribe el anuncio (mínimo 5 letras).', 'err'); return; }
    const anuncio = { id: Math.random().toString(36).slice(2, 10), texto, para: this.nuevo.para, importante: !!this.nuevo.importante, vence: this.nuevo.vence || '', fecha: new Date().toISOString(), autorEmail: this.auth.currentUser?.email || '' };
    // Al guardar se limpian los vencidos (no se acumulan para siempre).
    await this.guardar([anuncio, ...this.vigentes]);
    this.nuevo = this.vacio();
    this.agregando = false;
    this.ui.mostrarToast(anuncio.para === 'todos' ? 'Anuncio publicado: lo ve la oficina y los conductores.' : 'Anuncio publicado para la oficina.', 'ok');
  }

  async quitar(id: string): Promise<void> {
    await this.guardar(this.vigentes.filter((a: any) => a.id !== id));
  }

  private async guardar(lista: any[]): Promise<void> {
    this.guardando = true;
    this.cdr.markForCheck();
    this.ds.S.anuncios = lista;
    await this.ds.guardarConfigCompartida('anuncios');
    await this.ds.autoSave();
    this.guardando = false;
    this.cdr.markForCheck();
  }
}
