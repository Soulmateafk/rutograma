import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

const pegada = (p: any): string => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * MULTAS Y COMPARENDOS — cada comparendo con vehículo, conductor, fecha,
 * motivo, valor y si ya se pagó. Sale también en la hoja de vida del
 * vehículo y en el detalle del conductor. Se guarda para todos los equipos
 * (configuración compartida "comparendos").
 */
@Component({
  selector: 'app-comparendos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comparendos.html',
  styleUrls: ['./comparendos.css']
})
export class ComparendosComponent implements OnInit, OnDestroy {
  public ds = inject(DataService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  filtro: 'pendientes' | 'todos' = 'pendientes';
  buscar = '';
  agregando = false;
  guardando = false;
  nuevo = this.vacio();

  get puedeEditar(): boolean { return this.auth.puedeEditar; }
  get todos(): any[] { return this.ds.S?.comparendos || []; }

  get lista(): any[] {
    const q = this.buscar.trim().toLowerCase();
    return this.todos
      .filter((c: any) => this.filtro === 'todos' || !c.pagado)
      .filter((c: any) => !q || [c.placa, c.conductor, c.motivo, c.numero].some(x => String(x || '').toLowerCase().includes(q)))
      .sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  get totalPendiente(): number { return this.todos.filter((c: any) => !c.pagado).reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0); }
  get cantidadPendiente(): number { return this.todos.filter((c: any) => !c.pagado).length; }

  get placas(): string[] { return (this.ds.S?.vehiculos || []).map((v: any) => String(v.p || v.placa || '')).filter(Boolean).sort(); }
  get conductores(): string[] { return (this.ds.S?.conductores || []).map((c: any) => String(c.nom || c.nombre || '')).filter(Boolean).sort(); }

  ngOnInit(): void {
    this.sub = this.ds.dataChanged.subscribe(() => this.cdr.detectChanges());
    if (!(this.ds.S?.vehiculos || []).length) this.ds.inicializarApp(true);
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private vacio() {
    const h = new Date();
    return { fecha: `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`, placa: '', conductor: '', numero: '', motivo: '', valor: null as number | null, pagado: false };
  }

  /** Al elegir la placa, se propone su conductor titular. */
  alElegirPlaca(): void {
    if (this.nuevo.conductor) return;
    const titular = (this.ds.S?.conductores || []).find((c: any) => pegada(c.veh ?? c.placa) === pegada(this.nuevo.placa));
    if (titular) this.nuevo.conductor = String(titular.nom || titular.nombre || '');
  }

  async agregar(): Promise<void> {
    const n = this.nuevo;
    if (!n.fecha || !n.placa) { this.ui.mostrarToast('Pon la fecha y el vehículo.', 'err'); return; }
    if (!String(n.motivo).trim()) { this.ui.mostrarToast('Escribe el motivo (ej. exceso de velocidad).', 'err'); return; }
    const valor = Number(n.valor);
    if (n.valor !== null && String(n.valor) !== '' && (!isFinite(valor) || valor < 0)) { this.ui.mostrarToast('El valor debe ser un número.', 'err'); return; }
    const c = {
      id: Math.random().toString(36).slice(2, 10), fecha: n.fecha, placa: n.placa.toUpperCase().trim(), conductor: String(n.conductor).trim(),
      numero: String(n.numero).trim(), motivo: String(n.motivo).trim(), valor: Number(n.valor) || 0, pagado: !!n.pagado,
      pagadoEn: n.pagado ? new Date().toISOString().slice(0, 10) : '', registradoPor: this.auth.currentUser?.email || ''
    };
    await this.guardar([c, ...this.todos], 'Comparendo registrado.');
    this.nuevo = this.vacio();
    this.agregando = false;
  }

  async marcarPagado(c: any, pagado: boolean): Promise<void> {
    const lista = this.todos.map((x: any) => x.id === c.id ? { ...x, pagado, pagadoEn: pagado ? new Date().toISOString().slice(0, 10) : '' } : x);
    await this.guardar(lista, pagado ? 'Marcado como pagado.' : 'Marcado como pendiente.');
  }

  async eliminar(c: any): Promise<void> {
    if (!confirm(`¿Borrar el comparendo de ${c.placa} del ${c.fecha}?`)) return;
    await this.guardar(this.todos.filter((x: any) => x.id !== c.id), 'Comparendo borrado.');
  }

  private async guardar(lista: any[], mensaje: string): Promise<void> {
    this.guardando = true;
    this.ds.S.comparendos = lista;
    await this.ds.guardarConfigCompartida('comparendos');
    await this.ds.autoSave();
    this.guardando = false;
    this.ui.mostrarToast(mensaje, 'ok');
    this.cdr.detectChanges();
  }
}
