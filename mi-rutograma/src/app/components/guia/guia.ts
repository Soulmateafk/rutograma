import { Component, HostListener, OnDestroy, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GuiaService } from '../../services/guia.service';
import { zoomPagina } from '../../zoom';

interface Caja { top: number; left: number; width: number; height: number; }

/**
 * Capa de la guía de primera vez: oscurece la pantalla, ilumina el
 * elemento del paso actual y muestra el cuadro con la explicación.
 * También dibuja el botón "?" para repetir la guía de la página.
 */
@Component({
  selector: 'app-guia',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './guia.html',
  styleUrls: ['./guia.css']
})
export class GuiaComponent implements OnDestroy {
  public guia = inject(GuiaService);

  public foco = signal<Caja | null>(null);
  public cuadro = signal<{ top: number; left: number; ancho: number } | null>(null);
  private reloj: ReturnType<typeof setInterval> | null = null;
  private pasoMostrado = '';

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('click', this.alTocar, true);
    effect(() => {
      const a = this.guia.activa();
      if (!a) {
        this.detenerReloj();
        this.foco.set(null);
        this.cuadro.set(null);
        this.pasoMostrado = '';
        return;
      }
      if (a.indice < 0) { this.foco.set(null); this.cuadro.set(null); return; } // tarea buscando su primer paso
      const clavePaso = `${a.clave}-${a.indice}`;
      if (clavePaso !== this.pasoMostrado) {
        this.pasoMostrado = clavePaso;
        // Nada de la página queda con el cursor puesto: así no se puede
        // escribir en un campo mientras la guía lo explica.
        const enfocado = document.activeElement as HTMLElement | null;
        if (enfocado && enfocado !== document.body && !enfocado.closest('.guia-cuadro')) enfocado.blur();
        const el = GuiaService.elementoVisible(a.pasos[a.indice].el);
        el?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' });
      }
      // Se vuelve a medir mientras está abierta: la página puede moverse
      // (datos que llegan, scroll, cambio de tamaño de la ventana).
      this.medir();
      if (!this.reloj) this.reloj = setInterval(() => this.medir(), 250);
    });
  }

  ngOnDestroy(): void {
    this.detenerReloj();
    if (typeof document !== 'undefined') document.removeEventListener('click', this.alTocar, true);
  }

  /**
   * En un paso de "toca aquí", el clic sobre lo iluminado pasa a la página
   * (abre el formulario de verdad) y la guía sigue al paso siguiente. Se
   * escucha en captura para enterarse aunque la página detenga el clic.
   */
  private alTocar = (e: MouseEvent) => {
    const a = this.guia.activa();
    const paso = a && a.indice >= 0 ? a.pasos[a.indice] : null;
    if (!paso?.tocar) return;
    const el = GuiaService.elementoVisible(paso.el);
    if (el && e.target instanceof Node && el.contains(e.target)) this.guia.tocado();
  };

  private detenerReloj(): void {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
  }

  @HostListener('window:resize')
  public medir(): void {
    const a = this.guia.activa();
    if (!a || a.indice < 0) return;
    const el = GuiaService.elementoVisible(a.pasos[a.indice].el);
    // Con letra Pequeña/Grande (zoom en <html>) todo se mide en la escala de la página.
    const z = zoomPagina();
    const vw = window.innerWidth / z, vh = window.innerHeight / z;
    if (!el) {
      // El elemento desapareció (ej. se cerró algo): cuadro al centro.
      this.foco.set(null);
      const ancho = Math.min(360, vw - 24);
      this.cuadro.set({ top: vh / 2 - 90, left: (vw - ancho) / 2, ancho });
      return;
    }
    const rp = el.getBoundingClientRect();
    const r = { top: rp.top / z, left: rp.left / z, width: rp.width / z, height: rp.height / z };
    const margen = 6;
    const caja: Caja = {
      top: Math.max(r.top - margen, 4),
      left: Math.max(r.left - margen, 4),
      width: Math.min(r.width + margen * 2, vw - 8),
      height: Math.min(r.height + margen * 2, vh - 8)
    };
    const anterior = this.foco();
    if (!anterior || Object.keys(caja).some(k => Math.abs((caja as any)[k] - (anterior as any)[k]) > 0.5)) this.foco.set(caja);

    // Cuadro: debajo del elemento si cabe; si no, encima; si el elemento es
    // muy alto (ej. una tabla), dentro de él abajo. En celular, ancho completo.
    const ancho = Math.min(360, vw - 24);
    // Alto real del cuadro (cambia con el texto y el tamaño de letra); 190 si aún no se ve.
    const cuadroEl = document.querySelector('.guia-cuadro') as HTMLElement | null;
    const altoCuadro = cuadroEl ? cuadroEl.getBoundingClientRect().height / z : 190;
    let top: number;
    if (caja.top + caja.height + 12 + altoCuadro < vh) top = caja.top + caja.height + 12;
    else if (caja.top - 12 - altoCuadro > 0) top = caja.top - 12 - altoCuadro;
    else top = Math.max(12, vh - altoCuadro - 16);
    let left = caja.left + caja.width / 2 - ancho / 2;
    left = Math.max(12, Math.min(left, vw - ancho - 12));
    const c = this.cuadro();
    if (!c || Math.abs(c.top - top) > 0.5 || Math.abs(c.left - left) > 0.5 || c.ancho !== ancho) this.cuadro.set({ top, left, ancho });
  }

  @HostListener('document:keydown', ['$event'])
  public teclado(e: KeyboardEvent): void {
    if (!this.guia.activa()) {
      if (e.key === 'Escape' && this.guia.menuAbierto()) this.guia.menuAbierto.set(false);
      return;
    }
    if (e.key === 'Escape') { this.guia.terminar(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { this.guia.siguiente(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { this.guia.anterior(); e.preventDefault(); }
    // Tab y espacio moverían el cursor a la página o activarían sus botones
    // (como "Guardar"): mientras la guía está abierta no se permiten.
    else if (e.key === 'Tab' || e.key === ' ') e.preventDefault();
  }
}
