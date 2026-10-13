import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { armarPlanB, viajesAfectados, hastaPorDefecto, PropuestaPlanB } from '../../services/plan-b';
import { transferirViajeAOtroVehiculo } from '../rutograma/rutograma.utils.js';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * PLAN B (Vehículos, Dashboard y Rutograma): un vehículo se varó o entró al
 * taller y tiene viajes por delante. Lista esos viajes y, para cada uno,
 * propone con qué vehículo cubrirlo (services/plan-b.ts). Se reasigna uno
 * por uno o todos de una vez; cada viaje queda marcado con el vehículo
 * que lo tenía antes.
 */
@Component({
  selector: 'app-plan-b',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plan-b.html',
  styleUrl: './plan-b.css'
})
export class PlanBComponent implements OnInit {
  @Input({ required: true }) placa!: string;
  /** Opcional: viajes ya escogidos (por ejemplo, los que quedaron encima de un mantenimiento). */
  @Input() viajes: any[] | null = null;
  @Output() cerrar = new EventEmitter<void>();

  public ds = inject(DataService);
  public auth = inject(AuthService);
  private ui = inject(UiService);

  public desde = hoyISO();
  public hasta = hoyISO();
  public cambiarConductor = true;
  public propuestas = signal<PropuestaPlanB[]>([]);
  public listos = new Set<string>();
  public trabajando = false;

  get vehiculo(): any {
    const p = String(this.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (this.ds.S?.vehiculos || []).find((v: any) => String(v.p || v.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === p);
  }
  get estado(): string { return String(this.vehiculo?.est || this.vehiculo?.estado || ''); }
  get pendientes(): PropuestaPlanB[] { return this.propuestas().filter(p => !this.listos.has(p.viaje.id) && p.elegida >= 0); }

  ngOnInit(): void {
    this.hasta = hastaPorDefecto(this.vehiculo, this.desde);
    this.calcular();
  }

  public calcular(): void {
    const lista = this.viajes?.length ? this.viajes : viajesAfectados(this.ds.S, this.placa, this.desde, this.hasta);
    this.listos = new Set();
    this.propuestas.set(armarPlanB(this.ds.S, this.placa, lista));
  }

  public fechaCorta(f: string): string {
    const [a, m, d] = String(f).slice(0, 10).split('-').map(Number);
    return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d}/${m}`;
  }

  private async aplicar(p: PropuestaPlanB): Promise<boolean> {
    const o = p.opciones[p.elegida];
    const real = (this.ds.S.viajes || []).find((v: any) => v.id === p.viaje.id);
    if (!o || !real) return false;
    const copia: any = { ...real };
    copia.planBDe = String(this.placa).toUpperCase().trim();
    copia.placaOriginal = copia.placaOriginal || copia.planBDe;
    transferirViajeAOtroVehiculo(copia, o.placa, o.tr, this.ds.S);
    if (this.cambiarConductor && o.conductor) copia.cond = o.conductor;
    const ok = await this.ds.guardarViaje(copia, false, { motivoCambio: `Plan B: ${copia.planBDe} ${this.estado ? '(' + this.estado.toLowerCase() + ')' : ''} → ${o.placa}` });
    if (ok !== false) this.listos.add(p.viaje.id);
    return ok !== false;
  }

  public async reasignar(p: PropuestaPlanB): Promise<void> {
    if (this.trabajando) return;
    this.trabajando = true;
    try {
      if (await this.aplicar(p)) this.ui.mostrarToast(`Viaje ${p.viaje.ruta || ''} del ${this.fechaCorta(p.viaje.fecha)} pasó a ${p.opciones[p.elegida].placa}.`, 'ok');
    } finally { this.trabajando = false; }
  }

  public async reasignarTodos(): Promise<void> {
    const lista = this.pendientes;
    if (!lista.length || this.trabajando) return;
    if (!confirm(`¿Reasignar ${lista.length} viaje${lista.length === 1 ? '' : 's'} de ${this.placa} como propone el Plan B?`)) return;
    this.trabajando = true;
    let hechos = 0;
    try {
      for (const p of lista) if (await this.aplicar(p)) hechos++;
      this.ui.mostrarToast(`Plan B: ${hechos} de ${lista.length} viajes reasignados.`, hechos === lista.length ? 'ok' : 'err');
    } finally { this.trabajando = false; }
  }
}
