import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { DataService } from '../../services/data';
import { API } from '../../api-base';

const API_URL = API;

interface Solicitud {
  id: string;
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';
  solicitante: string;
  nombreSolicitante?: string;
  descripcion: string;
  ruta: string;
  metodo: string;
  cuerpo: any;
  modo: string;
  creada: string;
  decididaPor?: string;
  decididaEn?: string;
  motivo?: string;
}

/**
 * APROBACIONES
 * - Jefe / admin: ven los cambios que pidieron los auxiliares y los
 *   aprueban (se aplican tal cual) o rechazan (con motivo).
 * - Auxiliar: ve sus propias solicitudes y en qué quedaron.
 */
@Component({
  selector: 'app-aprobaciones',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './aprobaciones.html',
  styleUrls: ['./aprobaciones.css']
})
export class AprobacionesComponent implements OnInit, OnDestroy {
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private ds = inject(DataService);
  private cdr = inject(ChangeDetectorRef);
  private platformId = inject(PLATFORM_ID);

  solicitudes: Solicitud[] = [];
  puedeAprobar = false;
  cargando = true;
  vista: 'pendientes' | 'historial' = 'pendientes';
  abiertaId: string | null = null;
  procesandoId: string | null = null;

  rechazando: Solicitud | null = null;
  motivoRechazo = '';

  // Selección para aprobar/rechazar varios de una vez.
  seleccion = new Set<string>();
  rechazandoVarios = false;
  progreso = '';

  private intervalo: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.cargar();
    this.intervalo = setInterval(() => {
      if (document.visibilityState === 'visible' && !this.procesandoId) this.cargar(true);
    }, 20000);
  }

  ngOnDestroy() {
    if (this.intervalo) clearInterval(this.intervalo);
  }

  get pendientes(): Solicitud[] {
    return this.solicitudes.filter(s => s.estado === 'PENDIENTE');
  }

  get historial(): Solicitud[] {
    return this.solicitudes.filter(s => s.estado !== 'PENDIENTE');
  }

  get visibles(): Solicitud[] {
    return this.vista === 'pendientes' ? this.pendientes : this.historial;
  }

  async cargar(silencioso = false) {
    if (!silencioso) { this.cargando = true; this.cdr.markForCheck(); }
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/aprobaciones`);
      const data = await res.json();
      if (data.ok) {
        this.solicitudes = data.solicitudes || [];
        this.puedeAprobar = !!data.puedeAprobar;
      } else if (!silencioso) {
        this.ui.mostrarToast(data.msg || 'No se pudieron cargar las solicitudes.', 'err');
      }
    } catch {
      if (!silencioso) this.ui.mostrarToast('No se pudieron cargar las solicitudes.', 'err');
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  alternarSeleccion(s: Solicitud) {
    if (this.seleccion.has(s.id)) this.seleccion.delete(s.id); else this.seleccion.add(s.id);
  }

  get todosSeleccionados(): boolean {
    return this.pendientes.length > 0 && this.pendientes.every(s => this.seleccion.has(s.id));
  }

  alternarTodos() {
    if (this.todosSeleccionados) this.seleccion.clear();
    else this.pendientes.forEach(s => this.seleccion.add(s.id));
  }

  private get seleccionadas(): Solicitud[] {
    // En el orden en que se pidieron: un cambio puede depender de uno anterior.
    return this.pendientes.filter(s => this.seleccion.has(s.id))
      .sort((a, b) => a.creada.localeCompare(b.creada));
  }

  async aprobarSeleccionadas() {
    await this.decidirVarias('APROBAR');
  }

  pedirMotivoVarias() {
    this.rechazandoVarios = true;
    this.motivoRechazo = '';
  }

  private async decidirVarias(accion: 'APROBAR' | 'RECHAZAR', motivo = '') {
    const lista = this.seleccionadas;
    if (!lista.length || this.procesandoId) return;
    let bien = 0;
    const errores: string[] = [];
    for (let i = 0; i < lista.length; i++) {
      const s = lista[i];
      this.procesandoId = s.id;
      this.progreso = `${accion === 'APROBAR' ? 'Aprobando' : 'Rechazando'} ${i + 1} de ${lista.length}…`;
      this.cdr.markForCheck();
      try {
        const res = await this.auth.fetchAutenticado(`${API_URL}/aprobaciones/decidir`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: s.id, accion, motivo })
        });
        const data = await res.json();
        if (data.ok) bien++; else errores.push(`${s.descripcion}: ${data.msg}`);
      } catch {
        errores.push(`${s.descripcion}: sin conexión`);
      }
    }
    this.procesandoId = null;
    this.progreso = '';
    this.seleccion.clear();
    const verbo = accion === 'APROBAR' ? 'aprobados' : 'rechazados';
    if (errores.length) {
      this.ui.mostrarToast(`${bien} ${verbo}. No se pudieron ${errores.length}: ${errores.slice(0, 3).join(' · ')}`, 'err');
    } else {
      this.ui.mostrarToast(`${bien} cambio(s) ${verbo}.`, 'ok');
    }
    if (accion === 'APROBAR' && bien) await this.ds.inicializarApp(true);
    await this.cargar(true);
  }

  alternarDetalle(s: Solicitud) {
    this.abiertaId = this.abiertaId === s.id ? null : s.id;
  }

  async aprobar(s: Solicitud) {
    await this.decidir(s, 'APROBAR');
  }

  pedirMotivoRechazo(s: Solicitud) {
    this.rechazando = s;
    this.motivoRechazo = '';
  }

  cancelarRechazo() {
    this.rechazando = null;
    this.rechazandoVarios = false;
  }

  async confirmarRechazo() {
    if (this.rechazandoVarios) {
      this.rechazandoVarios = false;
      await this.decidirVarias('RECHAZAR', this.motivoRechazo.trim());
      return;
    }
    if (!this.rechazando) return;
    const s = this.rechazando;
    this.rechazando = null;
    await this.decidir(s, 'RECHAZAR', this.motivoRechazo.trim());
  }

  private async decidir(s: Solicitud, accion: 'APROBAR' | 'RECHAZAR', motivo = '') {
    if (this.procesandoId) return;
    this.procesandoId = s.id;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/aprobaciones/decidir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id, accion, motivo })
      });
      const data = await res.json();
      if (data.ok) {
        this.ui.mostrarToast(accion === 'APROBAR'
          ? `Aprobado y aplicado: ${s.descripcion}`
          : `Rechazado: ${s.descripcion}`, 'ok');
        // Lo aprobado ya está en el servidor: se trae para verlo en toda la app.
        if (accion === 'APROBAR') await this.ds.inicializarApp(true);
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudo completar la acción.', 'err');
      }
    } catch {
      this.ui.mostrarToast('No se pudo comunicar con el servidor.', 'err');
    }
    this.procesandoId = null;
    await this.cargar(true);
  }

  fecha(iso?: string): string {
    return iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  }

  detalle(s: Solicitud): string {
    return JSON.stringify(s.cuerpo || {}, null, 2);
  }
}
