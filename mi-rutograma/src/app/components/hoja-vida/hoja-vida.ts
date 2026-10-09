import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { API } from '../../api-base';

const API_URL = API;

/**
 * HOJA DE VIDA DEL VEHÍCULO — todo lo de una placa en una pantalla:
 * datos, documentos, conductores, viajes por mes, destinos,
 * mantenimientos, averías y novedades (lo arma backend/hoja-vida.js).
 */
@Component({
  selector: 'app-hoja-vida',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './hoja-vida.html',
  styleUrls: ['./hoja-vida.css']
})
export class HojaVidaComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private ds = inject(DataService);

  placa = '';
  cargando = true;
  error = '';
  hoja: any = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => {
      this.placa = decodeURIComponent(p.get('placa') || '');
      this.cargar();
    });
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    this.error = '';
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/vehiculos/hoja-de-vida?placa=${encodeURIComponent(this.placa)}`);
      const data = await res.json();
      if (!data?.ok) this.error = data?.msg || 'No se pudo cargar la hoja de vida.';
      else this.hoja = data;
    } catch {
      this.error = 'Sin conexión con el servidor.';
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  /**
   * Fecha de una novedad para mostrar. Las que mandan los conductores
   * guardan la fecha como texto ("6/10/2026, 4:59 p. m."): el pipe "date"
   * fallaba con ella y dejaba de pintar el resto de la hoja. Lo que no es
   * una fecha AAAA-MM-DD se muestra tal cual.
   */
  fechaTexto(f: any): string {
    const t = String(f || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
    if (!m) return t;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Comparendos de esta placa (página Comparendos; configuración compartida). */
  get comparendos(): any[] {
    const placa = this.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return (this.ds.S?.comparendos || [])
      .filter((c: any) => String(c.placa || '').toUpperCase().replace(/[^A-Z0-9]/g, '') === placa)
      .sort((a: any, b: any) => String(b.fecha).localeCompare(String(a.fecha)));
  }

  get maxViajesMes(): number {
    return Math.max(1, ...(this.hoja?.porMes || []).map((m: any) => m.viajes + m.cancelados));
  }

  textoDocumento(d: any): string {
    if (d.estado === 'sin dato') return 'Sin fecha registrada';
    if (d.estado === 'vencido') return `Vencido hace ${-d.dias} día${d.dias === -1 ? '' : 's'}`;
    if (d.dias === 0) return 'Vence hoy';
    return `Vence en ${d.dias} día${d.dias === 1 ? '' : 's'}`;
  }

  /** Imprime solo la hoja (sin la barra de arriba ni el botón "?"); ver styles.css. */
  imprimir(): void {
    document.body.classList.add('imprimiendo-hoja');
    window.print();
    setTimeout(() => document.body.classList.remove('imprimiendo-hoja'), 500);
  }
}
