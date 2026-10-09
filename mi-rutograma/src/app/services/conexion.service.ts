import { Injectable, NgZone, inject, signal } from '@angular/core';
import { API } from '../api-base';

/**
 * ¿HAY CONEXIÓN CON EL SERVIDOR? Para el aviso de arriba (components/apariencia):
 * "Sin conexión" cuando no se alcanza el computador de la oficina (sin señal,
 * Tailscale apagado, servidor cerrado) y "Conectado de nuevo" al volver.
 * Pregunta a /api/auth/ping cada 15 s (cada 5 s mientras no hay conexión) y
 * cuando el equipo avisa que perdió o recuperó la red. Para no asustar por
 * un tropiezo, declara "sin conexión" después de dos fallos seguidos.
 */
@Injectable({ providedIn: 'root' })
export class ConexionService {
  private zone = inject(NgZone);
  public estado = signal<'ok' | 'sin' | 'volvio'>('ok');
  public reintentando = signal(false);
  private fallos = 0;
  private reloj: any = null;
  private relojVolvio: any = null;

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('offline', () => this.zone.run(() => { this.fallos = 2; this.marcarSin(); }));
    window.addEventListener('online', () => this.revisar());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.revisar(); });
    if (navigator.onLine === false) { this.fallos = 2; this.marcarSin(); }
    this.programar();
  }

  private programar(): void {
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => this.revisar(), this.estado() === 'sin' ? 5000 : 15000);
  }

  public async revisar(): Promise<void> {
    if (document.visibilityState !== 'visible' && this.estado() !== 'sin') { this.programar(); return; }
    this.reintentando.set(true);
    let ok = false;
    try {
      const control = new AbortController();
      const corte = setTimeout(() => control.abort(), 6000);
      const r = await fetch(`${API}/auth/ping`, { cache: 'no-store', signal: control.signal });
      clearTimeout(corte);
      ok = r.status > 0;              // cualquier respuesta del servidor = hay conexión
    } catch { ok = false; }
    this.zone.run(() => {
      this.reintentando.set(false);
      if (ok) {
        this.fallos = 0;
        if (this.estado() === 'sin') {
          this.estado.set('volvio');
          clearTimeout(this.relojVolvio);
          this.relojVolvio = setTimeout(() => { if (this.estado() === 'volvio') this.estado.set('ok'); }, 3000);
        }
      } else {
        this.fallos++;
        if (this.fallos >= 2) this.marcarSin();
      }
      this.programar();
    });
  }

  private marcarSin(): void {
    clearTimeout(this.relojVolvio);
    this.estado.set('sin');
    this.programar();
  }

  public cerrarAviso(): void { if (this.estado() === 'volvio') this.estado.set('ok'); }
}
