import { Injectable, signal } from '@angular/core';

// Pantalla de carga compartida (el camión recorriendo la ruta) — antes
// vivía solo dentro de app.ts, disparada por los eventos de navegación
// del router. Se saca a un servicio para que cualquier componente pueda
// mostrarla también para sus propias operaciones largas (por ejemplo,
// Configuración generando la matriz del mes), sin tener que reinventar
// una pantalla de carga propia cada vez. El comportamiento entre páginas
// no cambia — app.ts simplemente delega aquí en vez de manejarlo él solo.
@Injectable({ providedIn: 'root' })
export class LoadingService {
  cargandoRuta = signal(false);
  ocultandoRuta = signal(false);

  // Pantalla grande (logo + camión + fondo oscuro) — la misma que ya se
  // ve un momento al arrancar la app, pero reutilizable para cualquier
  // operación larga que de verdad merezca notarse (a diferencia de la
  // barrita delgada de arriba, pensada solo para cambios de página
  // rápidos). El mensaje es configurable por quien la muestre.
  cargandoGrande = signal(false);
  mensajeGrande = signal('Cargando...');

  private ocultarTimeoutId: any = null;
  private finalizarTimeoutId: any = null;

  // Muestra la pantalla de inmediato — cancela cualquier fundido de
  // salida que estuviera en curso de una llamada anterior.
  mostrar(): void {
    clearTimeout(this.ocultarTimeoutId);
    clearTimeout(this.finalizarTimeoutId);
    this.ocultandoRuta.set(false);
    this.cargandoRuta.set(true);
  }

  // Mismo tiempo mínimo visible (120ms, para que no sea un parpadeo si
  // terminó casi al instante) + fundido corto (200ms) que ya usaba
  // app.ts entre páginas.
  ocultarConFade(): void {
    clearTimeout(this.ocultarTimeoutId);
    clearTimeout(this.finalizarTimeoutId);
    this.ocultarTimeoutId = setTimeout(() => {
      this.ocultandoRuta.set(true);
      this.finalizarTimeoutId = setTimeout(() => {
        this.cargandoRuta.set(false);
      }, 200);
    }, 120);
  }

  mostrarGrande(mensaje: string): void {
    this.mensajeGrande.set(mensaje);
    this.cargandoGrande.set(true);
  }

  ocultarGrande(): void {
    this.cargandoGrande.set(false);
  }
}