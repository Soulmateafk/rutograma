import { Injectable, Inject, PLATFORM_ID, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { isPlatformBrowser } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class UiService {

  constructor(@Inject(PLATFORM_ID) private platformId: Object, private sanitizer: DomSanitizer) {}

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  public renderDash(): void {
    if (this.isBrowser && (window as any).renderDash) {
      (window as any).renderDash();
    }
  }

  public renderHistorico(): void {
    if (this.isBrowser && (window as any).renderHistorico) {
      (window as any).renderHistorico();
    }
  }
  
  public mostrarSpinner(msg: string): void {
    // 1. Manipulación del DOM si estamos en navegador
    if (this.isBrowser) {
      const el = document.getElementById('sp-spinner');
      if (el) { 
        el.textContent = msg; 
        el.style.display = 'flex'; 
      }
      // 2. Llamada a función global solo si estamos en navegador
      if ((window as any).mostrarSpinner) {
        (window as any).mostrarSpinner(msg);
      }
    }
  }

  public ocultarSpinner(): void {
    if (this.isBrowser) {
      const el = document.getElementById('sp-spinner');
      if (el) el.style.display = 'none';
      
      if ((window as any).ocultarSpinner) {
        (window as any).ocultarSpinner();
      }
    }
  }

  public mostrarToast(msg: string, tipo: string): void {
    if (this.isBrowser) {
      const el = document.getElementById('sp-toast') as any;
      if (el) {
        // Los avisos traen HTML sencillo (<br>, íconos), pero también datos
        // guardados (nombres, títulos...): se limpia cualquier script o
        // atributo peligroso antes de mostrarlo.
        el.innerHTML = this.sanitizer.sanitize(SecurityContext.HTML, msg) || '';
        el.style.background = tipo === 'ok' ? '#052e16' : tipo === 'err' ? '#2d0a0a' : '#2d1b00';
        el.style.borderColor = tipo === 'ok' ? '#166534' : tipo === 'err' ? '#7f1d1d' : '#92400e';
        el.style.color = tipo === 'ok' ? '#bbf7d0' : tipo === 'err' ? '#fecaca' : '#fde68a';
        el.style.display = 'block';
        clearTimeout(el._t);
        el._t = setTimeout(() => { el.style.display = 'none'; }, 4000);
      }

      if ((window as any).mostrarToast) {
        (window as any).mostrarToast(this.sanitizer.sanitize(SecurityContext.HTML, msg) || '', tipo);
      }
    }
  }

  public syncFechas(): void {
    if (this.isBrowser && (window as any).syncFechas) {
      (window as any).syncFechas();
    }
  }

  /**
   * Arma el mensaje de un error HTTP sin mostrarlo — para los pocos
   * lugares que necesitan el TEXTO (ej. guardarConductorValidado, que
   * devuelve el error como string en vez de mostrar el toast él mismo).
   * mostrarErrorHttp() usa esto mismo por dentro.
   */
  public mensajeErrorHttp(e: any, contexto: string = 'completar la operación'): string {
    const msgBackend = e?.error?.msg;

    if (e?.status === 0) {
      return 'No se pudo conectar con el servidor — revisa tu conexión e intenta de nuevo.';
    }
    if (msgBackend) return msgBackend;
    if (e?.status === 401) return 'Tu sesión no es válida — inicia sesión de nuevo.';
    if (e?.status === 403) return `No tienes permiso para ${contexto}.`;
    if (e?.status === 404) return 'No se encontró lo que buscabas.';
    if (e?.status >= 500) return `El servidor tuvo un problema al ${contexto}. Intenta de nuevo en un momento.`;
    return `No se pudo ${contexto}.`;
  }

  /**
   * Traduce un error de una petición HTTP (de cualquier pantalla) a un
   * mensaje claro y lo muestra como toast — para no repetir esta lógica
   * en cada componente. Prioridad:
   *   1. El mensaje específico que el backend ya haya mandado
   *      (la mayoría de endpoints sí lo hacen, ej. "El correo ya está
   *      registrado") — es siempre el más preciso.
   *   2. Si no hay mensaje del backend, uno genérico según el código:
   *      sin conexión (status 0), sesión inválida (401), sin permiso
   *      (403), no encontrado (404), o error propio del servidor (500+).
   *
   * @param e         El error capturado en el catch de la petición HTTP.
   * @param contexto  Verbo/frase de qué se estaba intentando hacer, para
   *                  que el mensaje genérico tenga sentido en el lugar
   *                  donde se usa (ej. "enviar la solicitud", "guardar
   *                  el vehículo"). Por defecto: "completar la operación".
   */
  public mostrarErrorHttp(e: any, contexto: string = 'completar la operación'): void {
    this.mostrarToast(this.mensajeErrorHttp(e, contexto), 'err');
  }
}