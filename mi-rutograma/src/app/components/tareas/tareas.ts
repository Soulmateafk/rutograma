import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { TareasService, Tarea } from '../../services/tareas.service';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';
import { VacioComponent } from '../comunes/vacio';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * TAREAS DEL EQUIPO: pendientes que se asignan entre las cuentas de la
 * oficina, con fecha límite, prioridad, de qué tratan y comentarios. A
 * quien se le asigna le llega un correo, y quien la creó se entera cuando
 * queda hecha.
 */
@Component({
  selector: 'app-tareas',
  standalone: true,
  imports: [CommonModule, FormsModule, VacioComponent],
  templateUrl: './tareas.html',
  styleUrl: './tareas.css'
})
export class TareasComponent implements OnInit {
  public t = inject(TareasService);
  private ds = inject(DataService);
  private ui = inject(UiService);
  private router = inject(Router);
  private ruta = inject(ActivatedRoute);

  public filtro = signal<'mias' | 'asigne' | 'todas'>('mias');
  public verHechas = signal(false);
  public abierta = signal<string | null>(null);
  public comentario = '';
  public formulario = signal<Partial<Tarea> | null>(null);
  public guardando = false;

  public visibles = computed(() => {
    const yo = this.t.yo();
    const h = this.hoy();
    // Vencidas, luego urgentes, luego por fecha límite (las hechas: las más recientes primero).
    const peso = (x: Tarea) => x.vence && x.vence < h ? 0 : x.prioridad === 'alta' ? 1 : 2;
    return this.t.tareas().filter(x => x.hecha === this.verHechas())
      .filter(x => this.filtro() === 'todas' || (this.filtro() === 'mias' ? x.para === yo : x.de === yo))
      .sort((a, b) => a.hecha ? String(b.hechaEn).localeCompare(String(a.hechaEn))
        : peso(a) - peso(b) || String(a.vence || '9999').localeCompare(String(b.vence || '9999')) || String(b.creada).localeCompare(String(a.creada)));
  });
  public cuenta = computed(() => {
    const yo = this.t.yo(), pend = this.t.tareas().filter(x => !x.hecha);
    return { mias: pend.filter(x => x.para === yo).length, asigne: pend.filter(x => x.de === yo).length, todas: pend.length };
  });

  ngOnInit(): void {
    this.t.empezar();
    this.t.cargar();
    // "?nueva=vehiculo:LUN 428" abre el formulario ya con eso (desde el perfil o la hoja de vida).
    const nueva = this.ruta.snapshot.queryParamMap.get('nueva');
    if (nueva) { const [tipo, ...resto] = nueva.split(':'); this.nueva({ tipo, valor: resto.join(':') }); }
  }

  // ---- Fechas ----
  public hoy = () => iso(new Date());
  public estadoVence(x: Tarea): 'vencida' | 'hoy' | 'pronto' | '' {
    if (!x.vence || x.hecha) return '';
    const h = this.hoy(); if (x.vence < h) return 'vencida'; if (x.vence === h) return 'hoy';
    const m = new Date(); m.setDate(m.getDate() + 2); return x.vence <= iso(m) ? 'pronto' : '';
  }
  public textoVence(x: Tarea): string {
    if (!x.vence) return 'Sin fecha';
    const e = this.estadoVence(x); const [a, m, d] = x.vence.split('-').map(Number); const f = new Date(a, m - 1, d);
    const base = `${DIAS[f.getDay()]} ${d} ${MESES[m - 1]}`;
    return e === 'vencida' ? `Venció ${base}` : e === 'hoy' ? 'Para hoy' : base;
  }
  public atajoFecha(cual: 'hoy' | 'manana' | 'viernes' | 'semana'): void {
    const d = new Date();
    if (cual === 'manana') d.setDate(d.getDate() + 1);
    if (cual === 'viernes') d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7));
    if (cual === 'semana') d.setDate(d.getDate() + 7);
    this.formulario.update(f => ({ ...f, vence: iso(d) }));
  }

  // ---- Formulario ----
  public nueva(sobre?: { tipo: string; valor: string }): void {
    this.formulario.set({ titulo: '', detalle: '', para: this.t.yo(), vence: '', prioridad: 'normal', sobre: sobre?.tipo ? sobre : { tipo: '', valor: '' } });
  }
  public editar(x: Tarea): void { this.formulario.set({ ...x, sobre: x.sobre ? { ...x.sobre } : { tipo: '', valor: '' } }); }
  public opcionesSobre(tipo: string): string[] {
    const S = this.ds.S || {};
    if (tipo === 'vehiculo') return (S.vehiculos || []).map((v: any) => v.p || v.placa).filter(Boolean);
    if (tipo === 'conductor') return (S.conductores || []).map((c: any) => c.nom || c.nombre).filter(Boolean);
    if (tipo === 'ruta') return (S.rutas || []).map((r: any) => r.cod || r.codigo).filter(Boolean);
    if (tipo === 'cliente') return [...new Set((S.viajes || []).map((v: any) => String(v.cliente || '').split(',')[0].trim()).filter(Boolean))] as string[];
    return [];
  }
  public async guardar(): Promise<void> {
    const f = this.formulario(); if (!f || this.guardando) return;
    this.guardando = true;
    const sobre = f.sobre?.tipo && f.sobre.valor ? f.sobre : null;
    const error = await this.t.guardar({ ...f, sobre });
    this.guardando = false;
    if (error) { this.ui.mostrarToast(error, 'err'); return; }
    this.ui.mostrarToast(f.id ? 'Tarea actualizada.' : (f.para === this.t.yo() ? 'Tarea anotada.' : `Tarea asignada a ${this.t.nombre(f.para || '')}. Le llega un correo.`), 'ok');
    this.formulario.set(null);
  }

  // ---- Acciones ----
  public async marcar(x: Tarea, ev?: Event): Promise<void> {
    ev?.stopPropagation();
    const e = await this.t.marcar(x, !x.hecha);
    if (e) this.ui.mostrarToast(e, 'err');
    else if (!x.hecha) this.ui.mostrarToast(`<i class="bi bi-check2-circle"></i> ¡Hecha! "${x.titulo}"`, 'ok');
  }
  public async comentar(x: Tarea): Promise<void> {
    const texto = this.comentario.trim(); if (!texto) return;
    const e = await this.t.comentar(x, texto);
    if (e) this.ui.mostrarToast(e, 'err'); else this.comentario = '';
  }
  public async borrar(x: Tarea): Promise<void> {
    if (!confirm(`¿Borrar la tarea "${x.titulo}"?`)) return;
    const e = await this.t.borrar(x); if (e) this.ui.mostrarToast(e, 'err');
  }
  public puedeTocar(x: Tarea): boolean { return this.t.esJefe() || x.de === this.t.yo() || x.para === this.t.yo(); }
  public irASobre(x: Tarea, ev: Event): void {
    ev.stopPropagation(); const s = x.sobre; if (!s) return;
    if (s.tipo === 'vehiculo') this.router.navigate(['/hoja-de-vida', s.valor]);
    else if (s.tipo === 'conductor') this.router.navigate(['/conductor', s.valor]);
    else if (s.tipo === 'ruta') this.router.navigate(['/rutas'], { queryParams: { buscarCod: s.valor } });
    else if (s.tipo === 'viaje') this.router.navigate(['/rutograma'], { queryParams: { verViaje: s.valor } });
  }
  public iconoSobre(tipo: string): string { return ({ vehiculo: 'bi-truck', conductor: 'bi-person', ruta: 'bi-signpost-split', viaje: 'bi-geo-alt', cliente: 'bi-shop' } as any)[tipo] || 'bi-tag'; }
  public inicial(email: string): string { return (this.t.nombre(email) || '?').trim().charAt(0).toUpperCase(); }
  public hace(fecha: string): string {
    const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
    if (min < 1) return 'ahora'; if (min < 60) return `hace ${min} min`; const h = Math.round(min / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24); return `hace ${d} día${d === 1 ? '' : 's'}`;
  }
}
