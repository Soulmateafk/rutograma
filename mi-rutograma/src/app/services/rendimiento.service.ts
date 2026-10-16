import { Injectable, inject } from '@angular/core';
import { ThemeService } from './theme.service';

/**
 * MODO LIVIANO AUTOMÁTICO: cada tanto mide, durante 2 segundos, cuántos
 * cuadros por segundo logra pintar la pantalla. Si dos veces seguidas va
 * muy lento (menos de ~20 cuadros por segundo con la pestaña a la vista),
 * apaga las animaciones y decoraciones (ThemeService.activarLiviano).
 * Medir así casi no gasta: es contar cuadros, nada más.
 */
@Injectable({ providedIn: 'root' })
export class RendimientoService {
  private theme = inject(ThemeService);
  private lentasSeguidas = 0;
  private reloj: any = null;
  private midiendo = false;

  static readonly FPS_LENTO = 20;
  static readonly CADA_MS = 30000;

  iniciar(): void {
    if (typeof window === 'undefined' || typeof requestAnimationFrame === 'undefined' || this.reloj) return;
    // Se espera a que termine de cargar todo: al arrancar siempre hay trabajo.
    this.reloj = setTimeout(() => this.ciclo(), 12000);
  }

  private ciclo(): void {
    this.reloj = setTimeout(() => this.ciclo(), RendimientoService.CADA_MS);
    if (this.midiendo || !this.debeMedir()) { this.lentasSeguidas = 0; return; }
    this.medir(2000).then(fps => {
      if (fps === null) return;
      this.lentasSeguidas = fps < RendimientoService.FPS_LENTO ? this.lentasSeguidas + 1 : 0;
      if (this.lentasSeguidas >= 2 && this.debeMedir()) this.theme.activarLiviano();
    });
  }

  private debeMedir(): boolean {
    const ap = this.theme.ap;
    return ap.livianoAuto && !ap.sinAnimaciones && !this.theme.liviano() && document.visibilityState === 'visible' && document.hasFocus();
  }

  /** Cuadros por segundo durante "ms" (null si la pestaña se fue a segundo plano). */
  medir(ms: number): Promise<number | null> {
    this.midiendo = true;
    return new Promise(resolver => {
      let cuadros = 0;
      const inicio = performance.now();
      const paso = (t: number) => {
        if (document.visibilityState !== 'visible') { this.midiendo = false; resolver(null); return; }
        cuadros++;
        if (t - inicio < ms) requestAnimationFrame(paso);
        else { this.midiendo = false; resolver(cuadros * 1000 / (t - inicio)); }
      };
      requestAnimationFrame(paso);
    });
  }
}
