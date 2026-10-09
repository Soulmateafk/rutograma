import { Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';

/**
 * Números que CUENTAN: [appContar]="valor" muestra el número subiendo (o
 * bajando) hasta su valor, en vez de aparecer de golpe. La primera vez
 * cuenta desde 0; después, desde el número que había. Lo que no es número
 * se muestra tal cual. Con "Quitar animaciones" aparece de una.
 */
@Directive({ selector: '[appContar]', standalone: true })
export class ContarDirective implements OnChanges, OnDestroy {
  @Input('appContar') valor: any;
  @Input() contarMs = 900;
  private actual = 0;
  private cuadro = 0;

  constructor(private el: ElementRef<HTMLElement>) {}

  ngOnChanges(): void {
    const destino = Number(this.valor);
    const texto = this.valor === null || this.valor === undefined ? '' : String(this.valor);
    cancelAnimationFrame(this.cuadro);
    const quieto = typeof document === 'undefined' || document.documentElement.classList.contains('sin-animaciones')
      || !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (texto === '' || !Number.isFinite(destino) || quieto || destino === this.actual) {
      this.el.nativeElement.textContent = texto;
      if (Number.isFinite(destino)) this.actual = destino;
      return;
    }
    const desde = this.actual, decimales = (texto.split('.')[1] || '').length, inicio = performance.now();
    const paso = (ahora: number) => {
      const t = Math.min(1, (ahora - inicio) / this.contarMs);
      const suave = 1 - Math.pow(1 - t, 3);            // empieza rápido y frena al final
      const v = desde + (destino - desde) * suave;
      this.el.nativeElement.textContent = t < 1 ? v.toFixed(decimales) : texto;
      if (t < 1) this.cuadro = requestAnimationFrame(paso);
    };
    this.actual = destino;
    this.cuadro = requestAnimationFrame(paso);
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.cuadro); }
}
