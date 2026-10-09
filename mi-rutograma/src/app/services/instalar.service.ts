import { Injectable, NgZone, inject, signal } from '@angular/core';

/**
 * INSTALAR COMO APLICACIÓN — el navegador avisa (beforeinstallprompt) cuando
 * la app se puede instalar en este equipo o celular: entonces el panel
 * Apariencia muestra el botón "Instalar". Se crea al arrancar (app.ts) para
 * no perderse ese aviso. En iPhone no hay aviso: se instala desde Safari,
 * Compartir → "Agregar a inicio" (lo explica la guía).
 */
@Injectable({ providedIn: 'root' })
export class InstalarService {
  private zone = inject(NgZone);
  private aviso: any = null;
  public sePuedeInstalar = signal(false);
  public instalada = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;
    this.instalada.set(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);
    window.addEventListener('beforeinstallprompt', (e: any) => {
      e.preventDefault();
      this.zone.run(() => { this.aviso = e; this.sePuedeInstalar.set(true); });
    });
    window.addEventListener('appinstalled', () => this.zone.run(() => { this.aviso = null; this.sePuedeInstalar.set(false); this.instalada.set(true); }));
    // Revisa si hay una versión nueva de la app cada vez que se abre (ver public/sw.js).
    if ('serviceWorker' in navigator && window.isSecureContext) navigator.serviceWorker.register('sw.js').catch(() => { /* sin HTTPS o bloqueado */ });
  }

  /** ¿Está en HTTPS? (sin HTTPS el celular no deja instalarla como aplicación) */
  public get conHttps(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext;
  }

  public get esIphone(): boolean {
    return typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  public async instalar(): Promise<void> {
    if (!this.aviso) return;
    this.aviso.prompt();
    try { await this.aviso.userChoice; } catch { /* nada */ }
    this.aviso = null;
    this.sePuedeInstalar.set(false);
  }
}
