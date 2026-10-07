import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { DIAS } from '../../services/reglas-asignacion';

const NOMBRES_DIA: Record<string, string> = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' };

/**
 * REGLAS DE ASIGNACIÓN — lo que la oficina configura y la app revisa al
 * guardar un viaje (avisa, se puede guardar igual) y en "Viajes por
 * revisar" del Rutograma (services/reglas-asignacion.ts):
 *  - por cliente o ruta: tipo de vehículo y/o mínimo de cajas;
 *  - pico y placa: días, últimos dígitos y horario.
 * Se guardan para todos los equipos (configuración compartida).
 */
@Component({
  selector: 'app-reglas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reglas.html',
  styleUrls: ['./reglas.css']
})
export class ReglasComponent implements OnInit, OnDestroy {
  public ds = inject(DataService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;

  readonly dias = [...DIAS.slice(1), DIAS[0]].map(clave => ({ clave, nombre: NOMBRES_DIA[clave] }));
  nuevaRegla = this.reglaVacia();
  nuevoPico = this.picoVacio();
  guardando = false;

  get puedeEditar(): boolean { return this.auth.puede('editarConfiguracion'); }
  get reglas(): any[] { return this.ds.S?.reglasAsignacion || []; }
  get picos(): any[] { return this.ds.S?.picoPlaca || []; }

  /** Tipos de vehículo que ya existen (para sugerir al escribir). */
  get tiposVehiculo(): string[] {
    return [...new Set((this.ds.S?.vehiculos || []).map((v: any) => String(v.tipo || v.t || '').trim()).filter(Boolean))] as string[];
  }
  get clientes(): string[] {
    const todos = (this.ds.S?.rutas || []).flatMap((r: any) => String(r.clientes || '').split(/[,/]/).map((c: string) => c.trim()));
    return [...new Set(todos.filter(Boolean))] as string[];
  }
  get codigosRuta(): string[] {
    return (this.ds.S?.rutas || []).map((r: any) => String(r.cod || r.codigo || '').trim()).filter(Boolean);
  }

  ngOnInit(): void {
    this.sub = this.ds.dataChanged.subscribe(() => this.cdr.detectChanges());
    if (!(this.ds.S?.vehiculos || []).length) this.ds.inicializarApp(true);
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private reglaVacia() { return { aplicaA: 'cliente', valor: '', tipoVehiculo: '', cajasMin: null as number | null, nota: '' }; }
  private picoVacio() { return { dias: [] as string[], digitos: '', desde: '06:00', hasta: '20:00', nota: '' }; }
  private id(): string { return Math.random().toString(36).slice(2, 10); }

  textoRegla(r: any): string {
    const partes = [];
    if (r.tipoVehiculo) partes.push(`vehículo "${r.tipoVehiculo}"`);
    if (Number(r.cajasMin)) partes.push(`mínimo ${r.cajasMin} cajas`);
    return partes.join(' y ');
  }
  textoDias(p: any): string { return (p.dias || []).map((d: string) => NOMBRES_DIA[d]).join(', '); }

  alternarDia(dia: string): void {
    const i = this.nuevoPico.dias.indexOf(dia);
    if (i === -1) this.nuevoPico.dias.push(dia); else this.nuevoPico.dias.splice(i, 1);
  }

  async agregarRegla(): Promise<void> {
    const r = this.nuevaRegla;
    if (!String(r.valor).trim()) { this.ui.mostrarToast(`Escribe ${r.aplicaA === 'ruta' ? 'el código de la ruta' : 'el cliente'}.`, 'err'); return; }
    if (!String(r.tipoVehiculo).trim() && !Number(r.cajasMin)) { this.ui.mostrarToast('Pon un tipo de vehículo, un mínimo de cajas o los dos.', 'err'); return; }
    const nueva = { id: this.id(), aplicaA: r.aplicaA, valor: String(r.valor).trim(), tipoVehiculo: String(r.tipoVehiculo).trim(), cajasMin: Number(r.cajasMin) || null, nota: String(r.nota).trim() };
    await this.guardar('reglasAsignacion', [...this.reglas, nueva], 'Regla agregada.');
    this.nuevaRegla = this.reglaVacia();
  }

  async agregarPico(): Promise<void> {
    const p = this.nuevoPico;
    const digitos = String(p.digitos).split(/[^0-9]+/).filter(Boolean);
    if (!p.dias.length) { this.ui.mostrarToast('Elige al menos un día.', 'err'); return; }
    if (!digitos.length) { this.ui.mostrarToast('Escribe los últimos dígitos de placa (ej. 1, 2).', 'err'); return; }
    if (!p.desde || !p.hasta || p.desde >= p.hasta) { this.ui.mostrarToast('El horario debe ir de una hora a otra más tarde.', 'err'); return; }
    const nuevo = { id: this.id(), dias: [...p.dias], digitos: digitos.join(', '), desde: p.desde, hasta: p.hasta, nota: String(p.nota).trim() };
    await this.guardar('picoPlaca', [...this.picos, nuevo], 'Pico y placa agregado.');
    this.nuevoPico = this.picoVacio();
  }

  async quitar(clave: 'reglasAsignacion' | 'picoPlaca', id: string): Promise<void> {
    const lista = (clave === 'reglasAsignacion' ? this.reglas : this.picos).filter((x: any) => x.id !== id);
    await this.guardar(clave, lista, 'Quitado.');
  }

  private async guardar(clave: string, lista: any[], mensaje: string): Promise<void> {
    this.guardando = true;
    this.ds.S[clave] = lista;
    await this.ds.guardarConfigCompartida(clave);
    await this.ds.autoSave();
    this.guardando = false;
    this.ui.mostrarToast(mensaje, 'ok');
    this.cdr.detectChanges();
  }
}
