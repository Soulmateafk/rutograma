import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { API } from '../../api-base';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * PRONÓSTICO — cuántos viajes vienen en un mes, con los meses anteriores
 * (lo calcula backend/pronostico.js). Solo muestra; no cambia nada.
 */
@Component({
  selector: 'app-pronostico',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pronostico.html',
  styleUrls: ['./pronostico.css']
})
export class PronosticoComponent implements OnInit {
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  // Empieza en el mes que viene.
  anio = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getFullYear();
  mes = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).getMonth();
  cargando = true;
  error = '';
  datos: any = null;
  vista: 'cliente' | 'destino' = 'cliente';

  get nombreMes(): string { return `${MESES[this.mes]} ${this.anio}`; }
  nombre(m: number): string { return MESES[m]; }

  ngOnInit(): void { this.cargar(); }

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
      const res = await this.auth.fetchAutenticado(`${API}/pronostico?anio=${this.anio}&mes=${this.mes}`);
      const data = await res.json();
      if (!data?.ok) this.error = data?.msg || 'No se pudo calcular el pronóstico.';
      else this.datos = data;
    } catch {
      this.error = 'Sin conexión con el servidor.';
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  get filas(): any[] {
    if (!this.datos?.hayDatos) return [];
    return this.vista === 'cliente' ? this.datos.porCliente : this.datos.porDestino;
  }

  /** Ancho de la barra de cada fila, contra la más grande. */
  ancho(n: number): number {
    const max = Math.max(1, ...this.filas.map(f => Math.max(f.pronostico, f.ultimoMes)));
    return Math.round(n / max * 100);
  }

  maxDia(): number { return Math.max(0.1, ...(this.datos?.porDiaSemana || []).map((d: any) => d.porDia)); }

  /** Sube / baja frente al último mes. */
  cambio(f: any): number { return f.pronostico - f.ultimoMes; }

  textoTendencia(t: number | null): string {
    if (t === null || t === undefined) return '';
    if (Math.abs(t) < 3) return 'igual que el mes anterior';
    return t > 0 ? `${t}% más viajes por día que el mes anterior` : `${-t}% menos viajes por día que el mes anterior`;
  }
}
