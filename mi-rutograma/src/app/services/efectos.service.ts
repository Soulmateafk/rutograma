import { Injectable, inject } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { zoomPagina } from '../zoom';
import { iniciarProgreso, terminarProgreso } from '../progreso';

/**
 * EFECTOS GENERALES (styles.css, "ONDA" y "BARRA DE PROGRESO"):
 *  - Onda al tocar: sale una onda desde el dedo o el mouse en cualquier
 *    botón. Se dibuja en una capa aparte encima del botón (no se mete en
 *    el botón: así no se recortan sus contadores ni cambia su tamaño).
 *  - Barra de progreso arriba al cambiar de pantalla.
 * Con "Quitar animaciones" (o si el equipo pide menos movimiento) no hay onda.
 */
@Injectable({ providedIn: 'root' })
export class EfectosService {
  private router = inject(Router);

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('pointerdown', e => this.onda(e), { passive: true, capture: true });
    this.router.events.subscribe(ev => {
      if (ev instanceof NavigationStart) iniciarProgreso();
      if (ev instanceof NavigationEnd || ev instanceof NavigationCancel || ev instanceof NavigationError) terminarProgreso();
    });
  }

  public static sinMovimiento(): boolean {
    return document.documentElement.classList.contains('sin-animaciones')
      || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  private onda(e: PointerEvent): void {
    if (e.button !== 0 || EfectosService.sinMovimiento() || document.documentElement.classList.contains('sin-onda')) return;
    const b = (e.target as Element | null)?.closest?.('button, .btn, .tab, a.mv-btn, a.dp-btn-icono, .ap-opcion, [role="button"]') as HTMLElement | null;
    if (!b || (b as HTMLButtonElement).disabled || b.closest('.rc-rueda')) return;
    const z = zoomPagina(), r = b.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) return;
    const estilo = getComputedStyle(b);
    const capa = document.createElement('span');
    capa.className = 'ap-onda-capa';
    Object.assign(capa.style, { left: r.left / z + 'px', top: r.top / z + 'px', width: r.width / z + 'px', height: r.height / z + 'px', borderRadius: estilo.borderRadius });
    const d = Math.max(r.width, r.height) * 2.2 / z;
    const onda = document.createElement('span');
    onda.className = 'ap-onda';
    Object.assign(onda.style, { width: d + 'px', height: d + 'px', left: (e.clientX - r.left) / z - d / 2 + 'px', top: (e.clientY - r.top) / z - d / 2 + 'px', background: estilo.color });
    capa.appendChild(onda);
    document.body.appendChild(capa);
    setTimeout(() => capa.remove(), 700);
  }
}
