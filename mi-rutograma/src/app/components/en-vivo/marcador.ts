import { Component, NgZone, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { NOMBRES_PAGINA, PersonaEnLinea, PresenciaService, nivelAusencia } from '../../services/presencia.service';

/**
 * EL COLOR DE CADA PERSONA, BIEN NOTORIO, donde está (en toda la app):
 *  - La pestaña de arriba de la página en la que está queda pintada de su
 *    color ("Más" también, si está en una de sus páginas).
 *  - Lo que tiene abierto se marca con su color y su nombre: el viaje del
 *    Rutograma, la fila del vehículo, del conductor o de la ruta. Si lo está
 *    editando, más fuerte y latiendo ("Carla editando").
 * Lee la presencia (services/presencia.service.ts) y marca la página directo
 * (clases y atributos), sin pasar por cada pantalla. Se reubica cada segundo
 * porque las tablas se vuelven a pintar cuando llegan datos.
 */
@Component({ selector: 'app-marcador-vivo', standalone: true, template: '' })
export class MarcadorVivoComponent implements OnInit, OnDestroy {
  private presencia = inject(PresenciaService);
  private zone = inject(NgZone);
  private marcados = new Set<HTMLElement>();
  private reloj: any = null;

  constructor() { effect(() => { this.presencia.enLinea(); this.marcar(); }); }

  ngOnInit(): void {
    if (typeof document === 'undefined') return;
    this.zone.runOutsideAngular(() => { this.reloj = setInterval(() => this.marcar(), 1000); });
  }

  ngOnDestroy(): void { clearInterval(this.reloj); this.limpiar(new Set()); }

  /** Dónde está lo que esa persona tiene abierto ("viaje:123", "vehiculo:LUN 428"…). */
  private elementosDe(clave: string): HTMLElement[] {
    const [tipo, ...resto] = clave.split(':');
    const valor = CSS.escape(resto.join(':').trim());
    if (!valor) return [];
    const sel = tipo === 'viaje' ? `[data-viaje="${valor}"]`
      : tipo === 'vehiculo' ? `tr[data-placa="${valor.toUpperCase()}"]`
        : tipo === 'conductor' ? `tr[data-cedula="${valor}"]`
          : tipo === 'ruta' ? `tr[data-cod="${valor.toUpperCase()}"]` : '';
    return sel ? Array.from(document.querySelectorAll<HTMLElement>(sel)) : [];
  }

  private marcar(): void {
    if (typeof document === 'undefined') return;
    const personas = this.presencia.enLinea().filter(p => !p.esYo);
    const ahora = new Set<HTMLElement>();
    const pintar = (el: HTMLElement, p: PersonaEnLinea, clase: string, texto: string) => {
      ahora.add(el);
      el.classList.add(clase);
      el.classList.toggle('vivo-edita', p.editando);
      el.classList.toggle('vivo-ausente', !!nivelAusencia(p.ausenteSeg, p.oculta));
      el.style.setProperty('--vivo-color', p.color || '#f59e0b');
      // En las filas de tabla el letrero va en la primera celda (una fila no puede llevarlo).
      const conLetrero = el.tagName === 'TR' ? el.querySelector<HTMLElement>('td') : el;
      if (conLetrero && texto) {
        conLetrero.setAttribute('data-vivo-quien', texto);
        conLetrero.style.setProperty('--vivo-color', p.color || '#f59e0b');
        // El letrero se ubica sobre la celda: necesita que la celda sea "posicionada" (sin romper las fijas).
        if (getComputedStyle(conLetrero).position === 'static') { conLetrero.style.position = 'relative'; conLetrero.dataset['vivoPos'] = '1'; }
        ahora.add(conLetrero);
      }
    };
    // Lo que tiene abierto cada uno.
    for (const p of personas) {
      if (!p.clave) continue;
      const texto = `${p.nombre} ${p.editando ? 'editando' : 'mirando'}`;
      for (const el of this.elementosDe(p.clave)) pintar(el, p, el.tagName === 'TR' ? 'vivo-fila' : 'vivo-objeto', texto);
    }
    // Las pestañas de arriba: del color de quien está ahí (la primera persona).
    const rutaDe = (pagina: string) => '/' + (Object.entries(NOMBRES_PAGINA).find(([, n]) => n === pagina)?.[0] || '');
    const porRuta = new Map<string, PersonaEnLinea>();
    for (const p of personas) { const r = rutaDe(p.pagina); if (r !== '/' && !porRuta.has(r)) porRuta.set(r, p); }
    for (const [ruta, p] of porRuta) {
      document.querySelectorAll<HTMLElement>(`[data-ruta="${CSS.escape(ruta)}"]`).forEach(el => pintar(el, p, 'vivo-tab', ''));
      const tab = document.querySelector<HTMLElement>(`.tab[data-ruta="${CSS.escape(ruta)}"]`);
      if (tab?.classList.contains('oculta')) document.querySelectorAll<HTMLElement>('[data-ruta-mas]').forEach(el => pintar(el, p, 'vivo-tab', ''));
    }
    this.limpiar(ahora);
  }

  /** Quita la marca de lo que ya nadie tiene abierto. */
  private limpiar(siguen: Set<HTMLElement>): void {
    for (const el of this.marcados) {
      if (siguen.has(el)) continue;
      el.classList.remove('vivo-fila', 'vivo-objeto', 'vivo-tab', 'vivo-edita', 'vivo-ausente');
      el.removeAttribute('data-vivo-quien');
      if (el.dataset['vivoPos']) { el.style.removeProperty('position'); delete el.dataset['vivoPos']; }
      el.style.removeProperty('--vivo-color');
    }
    this.marcados = siguen;
  }
}
