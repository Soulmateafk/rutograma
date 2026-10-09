import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { API } from '../../api-base';

const API_URL = API;

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * CUMPLIMIENTO — qué tanto se cumple lo programado, con lo que marcan los
 * conductores en "Mis viajes" (lo calcula backend/cumplimiento.js).
 */
@Component({
  selector: 'app-cumplimiento',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cumplimiento.html',
  styleUrls: ['./cumplimiento.css']
})
export class CumplimientoComponent implements OnInit {
  private auth = inject(AuthService);
  private ds = inject(DataService);
  private cdr = inject(ChangeDetectorRef);

  anio = new Date().getFullYear();
  mes = new Date().getMonth();
  cargando = true;
  error = '';
  datos: any = null;
  vista: 'conductor' | 'ruta' | 'transportadora' = 'conductor';

  get nombreMes(): string { return `${MESES[this.mes]} ${this.anio}`; }

  ngOnInit(): void {
    // Empieza en el mes que se está trabajando en la app.
    const S: any = this.ds.S;
    if (S && Number.isInteger(Number(S.mes)) && Number(S.anio)) { this.mes = Number(S.mes); this.anio = Number(S.anio); }
    this.cargar();
  }

  cambiarMes(delta: number): void {
    const d = new Date(this.anio, this.mes + delta, 1);
    this.anio = d.getFullYear();
    this.mes = d.getMonth();
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/cumplimiento?anio=${this.anio}&mes=${this.mes}`);
      const data = await res.json();
      if (!data?.ok) this.error = data?.msg || 'No se pudo cargar el cumplimiento.';
      else this.datos = data;
    } catch {
      this.error = 'Sin conexión con el servidor.';
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  get filas(): any[] {
    if (!this.datos) return [];
    return this.vista === 'conductor' ? this.datos.porConductor : this.vista === 'ruta' ? this.datos.porRuta : this.datos.porTransportadora;
  }

  textoPct(n: number | null): string { return n === null || n === undefined ? '—' : `${n}%`; }

  textoMinutos(n: number | null): string {
    if (n === null || n === undefined) return '—';
    return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`;
  }

  textoHoras(n: number | null): string { return n === null || n === undefined ? '—' : `${n} h`; }

  /** Color según qué tan bien va: verde ≥ 85 %, amarillo ≥ 60 %, rojo menos. */
  clase(n: number | null): string {
    if (n === null || n === undefined) return '';
    return n >= 85 ? 'cu-bien' : n >= 60 ? 'cu-regular' : 'cu-mal';
  }
}
