import { VacioComponent } from '../comunes/vacio';
import { EsqueletoComponent } from '../comunes/esqueleto';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

export const TIPOS_QUEJA = ['Devolución', 'Carga rechazada', 'Reclamo', 'Demora en la entrega', 'Carga dañada', 'Otro'];
const limpiar = (t: any): string => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');

/**
 * QUEJAS DE CLIENTES — devoluciones, carga rechazada, reclamos, demoras...
 * por cliente, con el viaje si se sabe. Arriba, los clientes con más
 * quejas en los últimos 90 días. Se guardan para todos los equipos
 * (configuración compartida "quejas"). Desde el detalle de un viaje del
 * Rutograma se llega aquí con el viaje ya puesto (?viaje=<id>).
 */
@Component({
  selector: 'app-quejas',
  standalone: true,
  imports: [VacioComponent, EsqueletoComponent, CommonModule, FormsModule],
  templateUrl: './quejas.html',
  styleUrls: ['./quejas.css']
})
export class QuejasComponent implements OnInit, OnDestroy {
  public ds = inject(DataService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private sub?: Subscription;

  readonly tipos = TIPOS_QUEJA;
  filtro: 'abiertas' | 'todas' = 'abiertas';
  buscar = '';
  agregando = false;
  guardando = false;
  nuevo = this.vacio();
  cerrando: any = null;
  solucion = '';

  get puedeEditar(): boolean { return this.auth.puedeEditar; }
  get todas(): any[] { return this.ds.S?.quejas || []; }

  get lista(): any[] {
    const q = limpiar(this.buscar);
    return this.todas
      .filter((x: any) => this.filtro === 'todas' || x.estado !== 'cerrada')
      .filter((x: any) => !q || [x.cliente, x.tipo, x.descripcion, x.placa, x.conductor, x.ruta].some(v => limpiar(v).includes(q)))
      .sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  get abiertas(): number { return this.todas.filter((x: any) => x.estado !== 'cerrada').length; }

  /** Clientes con más quejas en los últimos 90 días (y de qué tipo). */
  get ranking(): { cliente: string; total: number; abiertas: number; tipos: string }[] {
    const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const porCliente = new Map<string, any[]>();
    this.todas.filter((x: any) => String(x.fecha) >= desde).forEach((x: any) => {
      const clave = String(x.cliente || 'Sin cliente').trim();
      porCliente.set(clave, [...(porCliente.get(clave) || []), x]);
    });
    return [...porCliente.entries()].map(([cliente, xs]) => {
      const conteo = new Map<string, number>();
      xs.forEach(x => conteo.set(x.tipo, (conteo.get(x.tipo) || 0) + 1));
      return {
        cliente, total: xs.length, abiertas: xs.filter(x => x.estado !== 'cerrada').length,
        tipos: [...conteo.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t.toLowerCase()}`).join(', ')
      };
    }).sort((a, b) => b.total - a.total).slice(0, 8);
  }

  get maxRanking(): number { return Math.max(1, ...this.ranking.map(r => r.total)); }

  get clientes(): string[] {
    const todos = [
      ...(this.ds.S?.rutas || []).flatMap((r: any) => String(r.clientes || '').split(/[,/]/)),
      ...(this.ds.S?.viajes || []).map((v: any) => String(v.cliente || v.cli || ''))
    ].map(c => c.trim()).filter(c => c && c !== 'No definido');
    return [...new Set(todos)].sort();
  }

  ngOnInit(): void {
    this.sub = this.ds.dataChanged.subscribe(() => this.cdr.detectChanges());
    if (!(this.ds.S?.viajes || []).length) this.ds.inicializarApp(true);
    this.route.queryParamMap.subscribe(p => {
      const id = p.get('viaje');
      if (id) this.desdeViaje(id);
    });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  private hoy(): string {
    const h = new Date();
    return `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
  }
  private vacio() {
    return { fecha: this.hoy(), cliente: '', tipo: 'Reclamo', descripcion: '', viajeId: '', placa: '', conductor: '', ruta: '', fechaViaje: '', valor: null as number | null };
  }

  /** Abre el formulario con los datos del viaje (cliente, placa, conductor, ruta). */
  private desdeViaje(id: string): void {
    const v = (this.ds.S?.viajes || []).find((x: any) => String(x.id) === String(id));
    if (!v) { if (!(this.ds.S?.viajes || []).length) setTimeout(() => this.desdeViaje(id), 800); return; }
    const placa = String(v.p || v.placa || '').toUpperCase();
    const cond = String(v.cond || '').trim();
    const titular = (this.ds.S?.conductores || []).find((c: any) => String(c.veh || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placa.replace(/[^A-Z0-9]/g, ''));
    this.nuevo = {
      ...this.vacio(), cliente: String(v.cliente || v.cli || '').trim(), viajeId: String(v.id), placa,
      conductor: cond && !['SIN ASIGNAR', 'ASIGNADO'].includes(cond.toUpperCase()) ? cond : String(titular?.nom || ''),
      ruta: String(v.ruta || v.codigo || ''), fechaViaje: String(v.fecha || '')
    };
    this.agregando = true;
    this.cdr.detectChanges();
  }

  async agregar(): Promise<void> {
    const n = this.nuevo;
    if (!String(n.cliente).trim()) { this.ui.mostrarToast('Escribe el cliente.', 'err'); return; }
    if (String(n.descripcion).trim().length < 5) { this.ui.mostrarToast('Cuenta qué pasó (mínimo 5 letras).', 'err'); return; }
    const q = {
      id: Math.random().toString(36).slice(2, 10), fecha: n.fecha || this.hoy(), cliente: String(n.cliente).trim(), tipo: n.tipo,
      descripcion: String(n.descripcion).trim(), viajeId: n.viajeId, placa: n.placa, conductor: n.conductor, ruta: n.ruta, fechaViaje: n.fechaViaje,
      valor: Number(n.valor) || 0, estado: 'abierta', solucion: '', registradoPor: this.auth.currentUser?.email || ''
    };
    await this.guardar([q, ...this.todas], 'Queja registrada.');
    this.nuevo = this.vacio();
    this.agregando = false;
  }

  abrirCierre(q: any): void { this.cerrando = q; this.solucion = ''; }

  async cerrar(): Promise<void> {
    const q = this.cerrando;
    if (!q) return;
    const lista = this.todas.map((x: any) => x.id === q.id ? { ...x, estado: 'cerrada', solucion: this.solucion.trim(), cerradaEn: this.hoy() } : x);
    this.cerrando = null;
    await this.guardar(lista, 'Queja cerrada.');
  }

  async reabrir(q: any): Promise<void> {
    await this.guardar(this.todas.map((x: any) => x.id === q.id ? { ...x, estado: 'abierta' } : x), 'Queja reabierta.');
  }

  async eliminar(q: any): Promise<void> {
    if (!confirm(`¿Borrar la queja de ${q.cliente} del ${q.fecha}?`)) return;
    await this.guardar(this.todas.filter((x: any) => x.id !== q.id), 'Queja borrada.');
  }

  quien(email: string): string { return this.ds.nombreDe(email); }

  private async guardar(lista: any[], mensaje: string): Promise<void> {
    this.guardando = true;
    this.ds.S.quejas = lista;
    await this.ds.guardarConfigCompartida('quejas');
    await this.ds.autoSave();
    this.guardando = false;
    this.ui.mostrarToast(mensaje, 'ok');
    this.cdr.detectChanges();
  }
}
