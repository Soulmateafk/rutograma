import { Injectable, NgZone, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { PresenciaService } from './presencia.service';
import { ThemeService } from './theme.service';
import { DataService } from './data';
import { API } from '../api-base';

/** Dónde tiene el mouse otra persona (qué vehículo, qué día y en qué parte de la celda). */
export interface CursorVivo {
  pestana: string; nombre: string; color: string; avatar?: string; aid?: string; fotoV?: string;
  pagina: string; placa: string; dia: number; fx: number; fy: number; viaje?: string; en: number;
}
/** Quién acaba de guardar algo (para pintar el destello con su color). */
export interface AutorCambio { nombre: string; color: string; en: number; }

/**
 * EN VIVO (backend/vivo.js): un canal abierto con el servidor que trae
 *  - las cabecitas de los demás en el Rutograma (dónde tienen el mouse), y
 *  - el aviso de que alguien guardó algo: se recargan los datos al instante
 *    (sin esperar los 20 s de siempre) y se recuerda quién fue.
 * Se lee con fetch (lleva la sesión en las cabeceras, cosa que EventSource
 * no puede). Si se corta, se vuelve a conectar solo.
 */
@Injectable({ providedIn: 'root' })
export class VivoService {
  private auth = inject(AuthService);
  private presencia = inject(PresenciaService);
  private theme = inject(ThemeService);
  private ds = inject(DataService);
  private zone = inject(NgZone);

  /** Cabecitas de los demás (pestaña → dónde está). */
  readonly cursores = signal<Map<string, CursorVivo>>(new Map());
  /** El último que guardó algo (dura unos segundos). */
  readonly ultimoAutor = signal<AutorCambio | null>(null);

  private activo = false;
  private control: AbortController | null = null;
  private reintento: any = null;
  private recarga: any = null;
  private limpieza: any = null;
  private ultimoEnvio = 0;
  private pendiente: any = null;
  private ultimoMandado = '';

  iniciar(): void {
    if (this.activo || typeof window === 'undefined') return;
    if (!this.auth.currentUser?.email || ['conductor', 'despachos'].includes(this.auth.rolActual)) return;
    this.activo = true;
    this.conectar();
    // Cabecitas viejas (alguien que se fue sin avisar): fuera a los 10 min sin moverse.
    this.limpieza = setInterval(() => {
      const ahora = Date.now();
      const m = new Map([...this.cursores()].filter(([, c]) => ahora - c.en < 10 * 60000));
      if (m.size !== this.cursores().size) this.cursores.set(m);
    }, 30000);
  }

  detener(): void {
    this.activo = false;
    this.control?.abort();
    clearTimeout(this.reintento); clearInterval(this.limpieza);
    this.cursores.set(new Map());
  }

  private async conectar(): Promise<void> {
    if (!this.activo) return;
    this.control?.abort();
    const control = new AbortController();
    this.control = control;
    try {
      const q = new URLSearchParams({ pestana: this.presencia.pestana, color: this.theme.colorMio });
      const res = await this.auth.fetchAutenticado(`${API}/vivo?${q}`, { signal: control.signal, cache: 'no-store' });
      if (!res.ok || !res.body) throw new Error('sin canal');
      const lector = res.body.getReader();
      const deco = new TextDecoder();
      let resto = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        resto += deco.decode(value, { stream: true });
        let corte: number;
        while ((corte = resto.indexOf('\n\n')) >= 0) {
          const bloque = resto.slice(0, corte); resto = resto.slice(corte + 2);
          const linea = bloque.split('\n').find(l => l.startsWith('data:'));
          if (linea) { try { this.recibir(JSON.parse(linea.slice(5))); } catch { /* evento dañado */ } }
        }
      }
    } catch { /* sin conexión o se cerró: se reintenta abajo */ }
    if (this.activo && this.control === control) this.reintento = setTimeout(() => this.conectar(), 4000);
  }

  private recibir(e: any): void {
    if (e?.tipo === 'cursor') {
      const m = new Map(this.cursores());
      if (e.salir) m.delete(e.pestana);
      else m.set(e.pestana, { ...e, en: Date.now() });
      this.cursores.set(m);
    } else if (e?.tipo === 'cambio') {
      this.ultimoAutor.set({ nombre: e.nombre, color: e.color, en: Date.now() });
      // Recargar ya (si llegan varios seguidos, una sola vez).
      clearTimeout(this.recarga);
      this.recarga = setTimeout(() => this.zone.run(() => { if (!this.ds.guardandoEnCurso) this.ds.inicializarApp(true); }), 350);
    }
  }

  /**
   * Dónde tengo el mouse (o null si salí del Rutograma). Se manda máximo
   * unas 7 veces por segundo y solo si cambió algo.
   */
  enviarCursor(donde: { pagina: string; placa: string; dia: number; fx: number; fy: number; viaje?: string } | null): void {
    if (!this.activo) return;
    const mandar = () => {
      this.pendiente = null;
      this.ultimoEnvio = Date.now();
      const q: Record<string, string> = donde
        ? { pestana: this.presencia.pestana, pagina: donde.pagina, placa: donde.placa, dia: String(donde.dia), fx: donde.fx.toFixed(3), fy: donde.fy.toFixed(3), viaje: donde.viaje || '', color: this.theme.colorMio }
        : { pestana: this.presencia.pestana, salir: '1' };
      const firma = JSON.stringify(q);
      if (firma === this.ultimoMandado) return;
      this.ultimoMandado = firma;
      this.auth.fetchAutenticado(`${API}/vivo/cursor?${new URLSearchParams(q)}`, { cache: 'no-store' }).catch(() => {});
    };
    clearTimeout(this.pendiente);
    const espera = 140 - (Date.now() - this.ultimoEnvio);
    if (espera <= 0 || !donde) mandar(); else this.pendiente = setTimeout(mandar, espera);
  }
}
