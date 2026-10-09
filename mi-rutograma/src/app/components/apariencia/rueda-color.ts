import { Component, ElementRef, EventEmitter, Input, OnChanges, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Hsv { h: number; s: number; v: number; }

/**
 * RUEDA DE COLORES para escoger un color propio: en la rueda se escoge el
 * tono (vuelta) y qué tan vivo es (centro = blanco, borde = vivo); con la
 * barra, qué tan claro u oscuro; también se puede escribir el código.
 * (cambio) mientras se arrastra (vista previa), (listo) al soltar o al
 * escribir un código válido (se guarda).
 */
@Component({
  selector: 'app-rueda-color',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="rc">
      <div class="rc-rueda" #rueda (pointerdown)="empezar($event)" (pointermove)="mover($event)" (pointerup)="soltar($event)" (pointercancel)="soltar($event)"
           role="slider" aria-label="Tono y viveza del color" tabindex="0" (keydown)="teclaRueda($event)">
        <div class="rc-oscuro" [style.opacity]="1 - hsv.v / 100"></div>
        <div class="rc-marca" [style.left.%]="marcaX" [style.top.%]="marcaY" [style.background]="hex"></div>
      </div>
      <div class="rc-lado">
        <div class="rc-muestra" [style.background]="hex"></div>
        <label class="rc-etq">Claro u oscuro</label>
        <input class="rc-barra" type="range" min="15" max="100" [ngModel]="hsv.v" (ngModelChange)="ponerV($event)" (change)="listo.emit(hex)"
               [style.background]="'linear-gradient(90deg, #000, ' + vivo + ')'">
        <label class="rc-etq">Código</label>
        <input class="rc-hex" [ngModel]="hex" (ngModelChange)="escribir($event)" maxlength="7" spellcheck="false" placeholder="#3366ff">
      </div>
    </div>
  `,
  styles: [`
    .rc { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
    .rc-rueda { position: relative; width: 168px; height: 168px; border-radius: 50%; cursor: crosshair; touch-action: none; flex-shrink: 0;
      background: radial-gradient(circle closest-side, #fff, rgba(255,255,255,0)), conic-gradient(red, #ff0, lime, cyan, blue, #f0f, red);
      box-shadow: 0 0 0 1px var(--color-borde), 0 4px 14px rgba(0,0,0,.25); }
    .rc-rueda:focus-visible { outline: 3px solid var(--acento); outline-offset: 3px; }
    .rc-oscuro { position: absolute; inset: 0; border-radius: 50%; background: #000; pointer-events: none; }
    .rc-marca { position: absolute; width: 18px; height: 18px; margin: -9px 0 0 -9px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.5), 0 2px 6px rgba(0,0,0,.4); pointer-events: none; }
    .rc-lado { flex: 1; min-width: 150px; display: flex; flex-direction: column; gap: 4px; }
    .rc-muestra { height: 34px; border-radius: 8px; box-shadow: 0 0 0 1px var(--color-borde); margin-bottom: 6px; }
    .rc-etq { font-size: 11px; color: var(--color-texto-apagado); }
    .rc-barra { -webkit-appearance: none; appearance: none; height: 12px; border-radius: 999px; outline: none; margin: 4px 0 8px; }
    .rc-barra::-webkit-slider-thumb { -webkit-appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #fff; border: 2px solid #334155; cursor: pointer; }
    .rc-barra::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: #fff; border: 2px solid #334155; cursor: pointer; }
    .rc-hex { background: var(--color-fondo-input); color: var(--color-texto-principal); border: 1px solid var(--color-borde); border-radius: 8px; padding: 7px 10px; font-family: monospace; font-size: 14px; text-transform: lowercase; }
  `]
})
export class RuedaColorComponent implements OnChanges {
  @Input() color = '#3366ff';
  @Output() cambio = new EventEmitter<string>();
  @Output() listo = new EventEmitter<string>();
  @ViewChild('rueda') rueda!: ElementRef<HTMLDivElement>;

  public hsv: Hsv = { h: 225, s: 80, v: 100 };
  private arrastrando = false;

  ngOnChanges(): void {
    if (!this.arrastrando && /^#[0-9a-f]{6}$/i.test(this.color) && this.color.toLowerCase() !== this.hex) this.hsv = RuedaColorComponent.hexAHsv(this.color);
  }

  get hex(): string { return RuedaColorComponent.hsvAHex(this.hsv); }
  get vivo(): string { return RuedaColorComponent.hsvAHex({ ...this.hsv, v: 100 }); }
  // Marca: ángulo = tono (0° arriba, sentido del reloj, como la rueda), distancia = viveza.
  get marcaX(): number { return 50 + Math.sin(this.hsv.h * Math.PI / 180) * this.hsv.s / 2; }
  get marcaY(): number { return 50 - Math.cos(this.hsv.h * Math.PI / 180) * this.hsv.s / 2; }

  empezar(e: PointerEvent): void {
    this.arrastrando = true;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.mover(e);
  }
  mover(e: PointerEvent): void {
    if (!this.arrastrando) return;
    const r = this.rueda.nativeElement.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const h = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)) * 100;
    this.hsv = { ...this.hsv, h: Math.round(h), s: Math.round(s) };
    this.cambio.emit(this.hex);
  }
  soltar(e: PointerEvent): void {
    if (!this.arrastrando) return;
    this.arrastrando = false;
    this.listo.emit(this.hex);
  }
  ponerV(v: number): void {
    this.hsv = { ...this.hsv, v: Number(v) };
    this.cambio.emit(this.hex);
  }
  escribir(texto: string): void {
    let t = String(texto || '').trim().toLowerCase();
    if (/^[0-9a-f]{6}$/.test(t)) t = '#' + t;
    if (/^#[0-9a-f]{6}$/.test(t)) { this.hsv = RuedaColorComponent.hexAHsv(t); this.listo.emit(t); }
  }
  /** Con el teclado: flechas giran el tono (izq/der) y cambian la viveza (arriba/abajo). */
  teclaRueda(e: KeyboardEvent): void {
    const pasos: Record<string, Partial<Hsv>> = {
      ArrowLeft: { h: (this.hsv.h + 355) % 360 }, ArrowRight: { h: (this.hsv.h + 5) % 360 },
      ArrowUp: { s: Math.min(100, this.hsv.s + 5) }, ArrowDown: { s: Math.max(0, this.hsv.s - 5) }
    };
    if (!pasos[e.key]) return;
    e.preventDefault(); e.stopPropagation();
    this.hsv = { ...this.hsv, ...pasos[e.key] };
    this.listo.emit(this.hex);
  }

  static hsvAHex({ h, s, v }: Hsv): string {
    s /= 100; v /= 100;
    const f = (n: number) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
  }
  static hexAHsv(hex: string): Hsv {
    const r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: Math.round((h * 60 + 360) % 360), s: Math.round(max ? d / max * 100 : 0), v: Math.round(max * 100) };
  }
}
