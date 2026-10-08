import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

const ICONOS: Record<string, string> = {
  viaje: 'bi-signpost-2', vehiculo: 'bi-truck', ruta: 'bi-map', conductor: 'bi-person-badge', novedad: 'bi-lightning-charge', despacho: 'bi-box-seam'
};

/**
 * PAPELERA — lo eliminado (viajes, vehículos, rutas, conductores,
 * novedades y despachos) queda 30 días y se recupera con un clic. Ver
 * backend/papelera.js. La ve quien puede eliminar; recupera quien puede
 * eliminar sin esperar aprobación.
 */
@Component({
  selector: 'app-papelera',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './papelera.html',
  styleUrls: ['./papelera.css']
})
export class PapeleraComponent implements OnInit {
  public auth = inject(AuthService);
  private ds = inject(DataService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);

  cargando = true;
  error = '';
  items: any[] = [];
  dias = 30;
  puedeRecuperar = false;
  filtro = 'todos';
  recuperandoId: number | null = null;

  readonly tipos = [
    { valor: 'todos', nombre: 'Todo' }, { valor: 'viaje', nombre: 'Viajes' }, { valor: 'vehiculo', nombre: 'Vehículos' },
    { valor: 'ruta', nombre: 'Rutas' }, { valor: 'conductor', nombre: 'Conductores' }, { valor: 'novedad', nombre: 'Novedades' },
    { valor: 'despacho', nombre: 'Despachos' }
  ];

  ngOnInit(): void {
    this.cargar();
  }

  get enPapelera(): any[] {
    return this.items.filter(i => !i.restauradoEn && (this.filtro === 'todos' || i.tipo === this.filtro));
  }

  get recuperados(): any[] {
    return this.items.filter(i => i.restauradoEn && (this.filtro === 'todos' || i.tipo === this.filtro)).slice(0, 10);
  }

  cuenta(tipo: string): number {
    return this.items.filter(i => !i.restauradoEn && (tipo === 'todos' || i.tipo === tipo)).length;
  }

  icono(tipo: string): string { return ICONOS[tipo] || 'bi-trash'; }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/papelera`);
      const data = await res.json();
      if (data?.ok) {
        this.items = data.items || [];
        this.dias = data.dias || 30;
        this.puedeRecuperar = !!data.puedeRecuperar;
        this.error = '';
      } else {
        this.error = data?.msg || 'No se pudo abrir la papelera.';
      }
    } catch {
      this.error = 'Sin conexión con el servidor.';
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  async recuperar(i: any): Promise<void> {
    if (this.recuperandoId) return;
    this.recuperandoId = i.id;
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/papelera/restaurar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: i.id })
      });
      const data = await res.json();
      this.ui.mostrarToast(data?.msg || (data?.ok ? 'Recuperado.' : 'No se pudo recuperar.'), data?.ok ? 'ok' : 'err');
      if (data?.ok) {
        await this.cargar();
        // Los datos de la app (Rutograma, Vehículos...) se actualizan ya.
        this.ds.inicializarApp(true);
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se recuperó.', 'err');
    }
    this.recuperandoId = null;
    this.cdr.markForCheck();
  }

  cuando(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    const hora = d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
    if (dias <= 0 && new Date().toDateString() === d.toDateString()) return `hoy ${hora}`;
    if (dias <= 1) return `ayer ${hora}`;
    return `hace ${dias} días`;
  }

  fecha(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  }

  diasRestantes(iso: string): number {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
  }
}
