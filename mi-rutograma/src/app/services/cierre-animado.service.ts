import { Injectable } from '@angular/core';

/**
 * CIERRE ANIMADO de las ventanas que no se quitan de la página sino que se
 * esconden con la clase "hide" (las .mbg de Conductores, Rutas,
 * Configuración, Histórico... y las de ModalService). Cuando algo les pone
 * "hide", antes de que se vea se la quita un instante, anima la salida
 * (clase ap-cerrar, styles.css) y la vuelve a poner. Las ventanas que se
 * quitan con *ngIf usan animate.leave="ap-cerrar" en su HTML.
 * Con "Quitar animaciones" (o si el equipo pide menos movimiento) no hace nada.
 */
@Injectable({ providedIn: 'root' })
export class CierreAnimadoService {
  private propios = new WeakSet<Element>();   // el "hide" que pone este servicio no se vuelve a animar
  private saliendo = new WeakSet<Element>();
  private abiertos = new WeakSet<Element>();  // se vieron abiertas (no se anima lo que la página esconde al cargar)

  constructor() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    new MutationObserver(cambios => {
      for (const c of cambios) {
        const el = c.target as HTMLElement;
        if (!el.classList?.contains('mbg')) continue;
        const ahora = el.classList.contains('hide');
        const antes = /(^|\s)hide(\s|$)/.test(c.oldValue || '');
        if (ahora === antes) continue;
        if (this.propios.has(el)) { if (ahora) this.propios.delete(el); continue; }   // cambio hecho aquí mismo
        if (!ahora) { if (!this.saliendo.has(el)) this.abiertos.add(el); continue; }    // se abrió
        // Se cerró: solo se anima si de verdad estaba abierta (no al cargar la página).
        if (this.abiertos.has(el) && !this.saliendo.has(el)) this.animarCierre(el);
      }
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  private sinMovimiento(): boolean {
    return document.documentElement.classList.contains('sin-animaciones')
      || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private animarCierre(el: HTMLElement): void {
    if (this.sinMovimiento()) return;
    this.saliendo.add(el);
    this.abiertos.delete(el);
    this.propios.add(el);
    el.classList.remove('hide');          // sigue visible mientras anima (aún no se ha pintado)
    el.classList.add('ap-cerrar');
    const terminar = () => {
      clearTimeout(reloj);
      el.removeEventListener('animationend', alTerminar);
      if (!this.saliendo.has(el)) return;
      this.saliendo.delete(el);
      el.classList.remove('ap-cerrar');
      this.propios.add(el);
      el.classList.add('hide');
    };
    const alTerminar = (e: AnimationEvent) => { if (e.target === el) terminar(); };
    el.addEventListener('animationend', alTerminar);
    const reloj = setTimeout(terminar, 600); // por si el navegador no avisa
  }
}
