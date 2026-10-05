import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

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
