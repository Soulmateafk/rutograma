import { Injectable, NgZone, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { AuthService } from './auth.service';
import { UiService } from './ui.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

/** Tiempo sin usar la app tras el que se cierra la sesión. */
export const MINUTOS_INACTIVIDAD = 60;
/** Cuánto antes se avisa, con cuenta regresiva. */
const MINUTOS_AVISO = 5;
const CLAVE_ULTIMA_ACTIVIDAD = 'ultima-actividad';

/**
 * CIERRE POR INACTIVIDAD — si nadie usa la app durante 1 hora en este
 * equipo, se cierra la sesión (alguien podría usar la cuenta abierta en un
 * PC desatendido). 5 minutos antes sale un aviso para seguir conectado.
 * La última actividad se comparte entre pestañas (localStorage), así una
 * pestaña olvidada no cierra la sesión de la que sí se está usando. Usa la
 * hora real, no un temporizador: si el PC se suspende, al volver se revisa
 * cuánto pasó de verdad. Las cuentas de conductor no se cierran (miran sus
 * viajes en el celular de vez en cuando).
 */
@Injectable({ providedIn: 'root' })
export class InactividadService {
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private zone = inject(NgZone);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Segundos que faltan para cerrar (null = no hay aviso en pantalla). */
  public segundosRestantes = signal<number | null>(null);

  private ultimaLocal = Date.now();
  private ultimaEscritura = 0;
  private cerrando = false;

  constructor() {
    if (!this.esNavegador) return;
    const registrar = () => this.registrarActividad();
    this.zone.runOutsideAngular(() => {
      for (const ev of ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart', 'scroll']) {
        window.addEventListener(ev, registrar, { passive: true, capture: true });
      }
      setInterval(() => this.revisar(), 1000);
    });
  }

  private get aplica(): boolean {
    return !!this.auth.currentUser && !this.auth.esConductor && !this.auth.esDespachos;
  }

  /** Movimiento del usuario. Mientras el aviso está en pantalla solo cuenta el botón. */
  private registrarActividad(): void {
    if (this.segundosRestantes() !== null) return;
    this.marcarActividad();
  }

  private marcarActividad(): void {
    const ahora = Date.now();
    this.ultimaLocal = ahora;
    // Se escribe como mucho cada 5 s (mousemove se dispara muchísimo).
    if (ahora - this.ultimaEscritura < 5000) return;
    this.ultimaEscritura = ahora;
    try { localStorage.setItem(CLAVE_ULTIMA_ACTIVIDAD, String(ahora)); } catch { /* sin almacenamiento: vale solo esta pestaña */ }
  }

  private ultimaActividad(): number {
    let compartida = 0;
    try { compartida = Number(localStorage.getItem(CLAVE_ULTIMA_ACTIVIDAD)) || 0; } catch { /* nada */ }
    return Math.max(this.ultimaLocal, compartida);
  }

  /** Botón "Seguir conectado". */
  public seguirConectado(): void {
    this.ultimaEscritura = 0;
    this.segundosRestantes.set(null);
    this.marcarActividad();
  }

  private revisar(): void {
    if (!this.aplica) {
      if (this.segundosRestantes() !== null) this.zone.run(() => this.segundosRestantes.set(null));
      // Al entrar se cuenta desde ese momento, no desde la última vez.
      this.ultimaLocal = Date.now();
      return;
    }
    const restante = MINUTOS_INACTIVIDAD * 60_000 - (Date.now() - this.ultimaActividad());
    if (restante <= 0) {
      this.zone.run(() => this.cerrarPorInactividad());
    } else if (restante <= MINUTOS_AVISO * 60_000) {
      const s = Math.ceil(restante / 1000);
      if (this.segundosRestantes() !== s) this.zone.run(() => this.segundosRestantes.set(s));
    } else if (this.segundosRestantes() !== null) {
      // Otra pestaña siguió usando la app: se quita el aviso.
      this.zone.run(() => this.segundosRestantes.set(null));
    }
  }

  private async cerrarPorInactividad(): Promise<void> {
    if (this.cerrando) return;
    this.cerrando = true;
    this.segundosRestantes.set(null);
    try {
      // La sesión también se cierra en el servidor (deja de contar en Sesiones).
      await this.auth.fetchAutenticado(`${API_URL}/sesiones/cerrar-actual`, { method: 'POST' }).catch(() => null);
      await this.auth.cerrarSesion();
      this.ui.mostrarToast(`Se cerró tu sesión porque no usaste la app durante ${MINUTOS_INACTIVIDAD / 60 === 1 ? '1 hora' : MINUTOS_INACTIVIDAD + ' minutos'}. Vuelve a entrar cuando quieras.`, 'info');
    } finally {
      this.cerrando = false;
    }
  }
}
