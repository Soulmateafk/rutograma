import { Component, NgZone, OnDestroy, OnInit, effect, inject } from '@angular/core';
import { VivoService, CursorVivo } from '../../services/vivo.service';
import { PresenciaService, nivelAusencia } from '../../services/presencia.service';
import { zoomPagina } from '../../zoom';
import { ThemeService } from '../../services/theme.service';

/**
 * CABECITAS EN VIVO del Rutograma: la de cada persona de la oficina, de su
 * color (Apariencia), moviéndose a donde tiene el mouse, con una flechita
 * hacia donde va y su nombre. No se usa la posición en la pantalla sino la
 * celda (vehículo + día + parte de la celda): así cae en el mismo sitio
 * aunque cada computador tenga otro tamaño de pantalla o zoom.
 * También manda dónde tengo yo el mouse (services/vivo.service.ts).
 * Todo se dibuja fuera de Angular, moviendo elementos directo (no traba).
 */
@Component({ selector: 'app-cabecitas', standalone: true, template: '' })
export class CabecitasComponent implements OnInit, OnDestroy {
  private vivo = inject(VivoService);
  private presencia = inject(PresenciaService);
  private theme = inject(ThemeService);
  private zone = inject(NgZone);
  private capa: HTMLDivElement | null = null;
  private elementos = new Map<string, { el: HTMLDivElement; x: number; y: number; tx: number; ty: number; angulo: number; celda?: HTMLElement | null }>();
  private cuadro = 0;
  private ultimoCuadro = 0;
  private quitar: Array<() => void> = [];
  private salida: any = null;
  private reloj: any = null;

  constructor() {
    // Cada vez que llega una posición nueva, se redibuja.
    effect(() => { this.vivo.cursores(); this.presencia.enLinea(); this.theme.cambio(); this.dibujar(); });
  }

  ngOnInit(): void {
    if (typeof document === 'undefined') return;
    this.capa = document.createElement('div');
    this.capa.className = 'cab-capa';
    document.body.appendChild(this.capa);
    this.zone.runOutsideAngular(() => {
      let ultimo = 0;
      const mover = (e: PointerEvent) => { const t = performance.now(); if (t - ultimo > 30) { ultimo = t; this.alMover(e); } };
      const redibujar = () => this.dibujar(true);
      document.addEventListener('pointermove', mover, { passive: true });
      window.addEventListener('scroll', redibujar, { passive: true, capture: true });
      window.addEventListener('resize', redibujar);
      // La tabla se vuelve a pintar cuando llegan datos: se reubica cada segundo.
      this.reloj = setInterval(() => this.dibujar(), 1000);
      this.quitar.push(() => document.removeEventListener('pointermove', mover), () => window.removeEventListener('scroll', redibujar, true), () => window.removeEventListener('resize', redibujar));
    });
  }

  ngOnDestroy(): void {
    this.quitar.forEach(f => f());
    clearInterval(this.reloj); clearTimeout(this.salida); cancelAnimationFrame(this.cuadro);
    this.vivo.enviarCursor(null);
    this.elementos.forEach(x => this.soltarCelda(x.celda));
    this.capa?.remove();
    this.elementos.clear();
  }

  /** Dónde tengo yo el mouse: la celda (vehículo + día) y en qué parte de ella. */
  private alMover(e: PointerEvent): void {
    const objetivo = e.target as Element | null;
    const celda = objetivo?.closest?.('td.ruto-td-day-cell[data-dia]') as HTMLElement | null;
    const fila = celda?.closest('tr[data-placa]') as HTMLElement | null;
    if (!celda || !fila) {
      // Fuera de la tabla: se avisa que salí, con un respiro (pasar entre celdas no cuenta).
      if (!this.salida) this.salida = setTimeout(() => { this.salida = null; this.vivo.enviarCursor(null); }, 900);
      return;
    }
    clearTimeout(this.salida); this.salida = null;
    const b = celda.getBoundingClientRect();
    const viaje = (objetivo?.closest?.('[data-viaje]') as HTMLElement | null)?.dataset['viaje'] || '';
    this.vivo.enviarCursor({ pagina: 'Rutograma', placa: fila.dataset['placa'] || '', dia: Number(celda.dataset['dia']) || 0,
      fx: b.width ? (e.clientX - b.left) / b.width : 0.5, fy: b.height ? (e.clientY - b.top) / b.height : 0.5, viaje });
  }

  /** saltar: al hacer scroll o cambiar el tamaño, se ubica de una (no se desliza). */
  private dibujar(saltar = false): void {
    if (!this.capa) return;
    // Esta cuenta puede no querer ver a los demás (Apariencia): igual manda dónde tiene su mouse.
    const cursores = this.theme.veoEnVivo('cabecitas') ? [...this.vivo.cursores().values()].filter(c => c.pagina === 'Rutograma') : [];
    const vivos = new Set(cursores.map(c => c.pestana));
    for (const [id, x] of this.elementos) if (!vivos.has(id)) { x.el.remove(); this.soltarCelda(x.celda); this.elementos.delete(id); }
    const z = zoomPagina();
    for (const c of cursores) {
      const celda = document.querySelector(`tr[data-placa="${CSS.escape(c.placa)}"] td[data-dia="${c.dia}"]`) as HTMLElement | null;
      let item = this.elementos.get(c.pestana);
      if (!item) { item = { el: this.crear(c), x: NaN, y: NaN, tx: NaN, ty: NaN, angulo: 90 }; this.elementos.set(c.pestana, item); this.capa.appendChild(item.el); }
      this.pintar(item.el, c);
      // La celda donde tiene el mouse, teñida de su color.
      if (item.celda !== celda) { this.soltarCelda(item.celda); item.celda = celda; }
      if (celda) { celda.classList.add('cab-celda'); celda.style.setProperty('--cab', c.color || '#2563eb'); }
      if (!celda) { item.el.style.opacity = '0'; continue; }
      const b = celda.getBoundingClientRect();
      const x = (b.left + c.fx * b.width) / z, y = (b.top + c.fy * b.height) / z;
      // Fuera de lo que se ve (arriba de la barra, o la tabla corrida): no se muestra.
      const visible = b.bottom > 60 && b.top < window.innerHeight && b.right > 0 && b.left < window.innerWidth;
      // La primera vez aparece ahí mismo; después se desliza (ver animar).
      if (!Number.isFinite(item.x) || saltar) { item.x = x; item.y = y; }
      item.tx = x; item.ty = y;
      item.el.style.opacity = visible ? '' : '0';
    }
    this.animar();
  }

  /**
   * Movimiento suave: en cada cuadro de pantalla la cabecita recorre una
   * parte del camino hacia donde está el mouse de esa persona (no salta
   * entre los avisos). Corre solo mientras alguna se está moviendo.
   */
  private animar(): void {
    if (this.cuadro) return;
    this.ultimoCuadro = performance.now();
    const paso = (t: number) => {
      const dt = Math.min(64, t - this.ultimoCuadro); this.ultimoCuadro = t;
      const f = 1 - Math.pow(0.8, dt / 16.7);
      let moviendo = false;
      for (const it of this.elementos.values()) {
        if (!Number.isFinite(it.tx)) continue;
        const dx = it.tx - it.x, dy = it.ty - it.y;
        if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
          moviendo = true;
          if (Math.hypot(dx, dy) > 3) it.angulo = Math.atan2(dy, dx) * 180 / Math.PI;
          it.x += dx * f; it.y += dy * f;
        } else { it.x = it.tx; it.y = it.ty; }
        it.el.style.transform = `translate3d(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px, 0)`;
        (it.el.querySelector('.cab-flecha') as HTMLElement).style.transform = `rotate(${it.angulo.toFixed(0)}deg)`;
      }
      this.cuadro = moviendo ? requestAnimationFrame(paso) : 0;
    };
    this.cuadro = requestAnimationFrame(paso);
  }

  private soltarCelda(celda?: HTMLElement | null): void {
    if (!celda) return;
    celda.classList.remove('cab-celda'); celda.style.removeProperty('--cab');
  }

  private crear(c: CursorVivo): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'cab';
    el.innerHTML = '<span class="cab-flecha"></span><span class="cab-cabeza"></span><span class="cab-nombre"></span>';
    return el;
  }

  /** Color, inicial o emoji, nombre y si está ausente (más transparente). */
  private pintar(el: HTMLDivElement, c: CursorVivo): void {
    el.style.setProperty('--cab', c.color || '#2563eb');
    const cabeza = el.querySelector('.cab-cabeza') as HTMLElement;
    const letra = c.avatar || (c.nombre || '?').charAt(0).toUpperCase();
    if (cabeza.textContent !== letra) cabeza.textContent = letra;
    cabeza.classList.toggle('emoji', !!c.avatar);
    const nombre = el.querySelector('.cab-nombre') as HTMLElement;
    if (nombre.textContent !== c.nombre) nombre.textContent = c.nombre;
    const persona = this.presencia.enLinea().find(p => !p.esYo && p.nombre === c.nombre);
    el.classList.toggle('ausente', !!nivelAusencia(persona?.ausenteSeg, persona?.oculta));
    el.classList.toggle('quieto', Date.now() - c.en > 60000);
  }
}
