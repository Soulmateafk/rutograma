import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { API } from '../../api-base';

const API_URL = API;

interface Demorado { id: number; placa: string; destino: string; fecha: string; horaLlegada: string; horaInicioCargue: string; minutos: number; }

const textoMinutos = (m: number): string => {
  const h = Math.floor(m / 60), r = Math.round(m % 60);
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
};

/**
 * CARGUE DEMORADO — aviso para la oficina en cualquier pantalla: los
 * vehículos que siguen cargando y ya pasaron el límite (backend
 * /api/despachos/demorados). Se revisa cada minuto. "Ocultar" lo esconde
 * 30 minutos en este equipo; si sigue demorado, vuelve a salir.
 */
@Component({
  selector: 'app-aviso-cargue',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ac" *ngIf="visibles().length" role="status">
      <i class="bi bi-alarm"></i>
      <div class="ac-texto">
        <strong>{{ visibles().length === 1 ? 'Cargue demorado' : visibles().length + ' cargues demorados' }}</strong>
        <span *ngFor="let d of visibles().slice(0, 3); let ultimo = last">
          {{ d.placa }} → {{ d.destino }} lleva {{ texto(d.minutos) }} cargando{{ ultimo ? '' : ' ·' }}
        </span>
        <span *ngIf="visibles().length > 3"> y {{ visibles().length - 3 }} más</span>
        <small>(límite {{ texto(limite()) }})</small>
      </div>
      <a routerLink="/despachos" class="ac-btn">Ver</a>
      <button class="ac-cerrar" (click)="ocultar()" title="Ocultar 30 minutos"><i class="bi bi-x-lg"></i></button>
    </div>
  `,
  styles: [`
    .ac { display: flex; gap: 10px; align-items: center; margin: 10px 16px 0; padding: 9px 12px; border-radius: 10px; font-size: 13px;
          background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.5); color: #fecaca; }
    .ac > i { font-size: 18px; color: #f87171; }
    .ac-texto { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
    .ac-texto small { opacity: .8; }
    .ac-btn { background: #dc2626; color: #fff; border-radius: 7px; padding: 5px 12px; text-decoration: none; font-weight: 600; white-space: nowrap; }
    .ac-cerrar { background: none; border: none; color: #fecaca; cursor: pointer; padding: 4px; }
  `]
})
export class AvisoCargueComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));
  private reloj: ReturnType<typeof setInterval> | null = null;
  private static readonly CLAVE = 'aviso-cargue-oculto-hasta';

  readonly demorados = signal<Demorado[]>([]);
  readonly limite = signal(90);
  private ocultoHasta = signal(0);
  readonly visibles = () => Date.now() < this.ocultoHasta() ? [] : this.demorados();

  ngOnInit(): void {
    if (!this.esNavegador) return;
    try { this.ocultoHasta.set(Number(sessionStorage.getItem(AvisoCargueComponent.CLAVE)) || 0); } catch { /* nada */ }
    this.revisar();
    this.reloj = setInterval(() => { if (document.visibilityState === 'visible') this.revisar(); }, 60000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  texto(m: number): string { return textoMinutos(m); }

  ocultar(): void {
    const hasta = Date.now() + 30 * 60000;
    this.ocultoHasta.set(hasta);
    try { sessionStorage.setItem(AvisoCargueComponent.CLAVE, String(hasta)); } catch { /* nada */ }
  }

  private async revisar(): Promise<void> {
    // Solo la oficina (la cuenta de despachos ya lo ve en su pantalla).
    if (!this.auth.currentUser || this.auth.esConductor || this.auth.esDespachos) return;
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/despachos/demorados`);
      const data = await res.json();
      if (data?.ok) {
        this.demorados.set(data.demorados || []);
        this.limite.set(data.limiteMin || 90);
      }
    } catch { /* sin conexión: se revisa en el próximo minuto */ }
  }
}
