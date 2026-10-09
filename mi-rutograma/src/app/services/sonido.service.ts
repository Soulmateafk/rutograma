import { Injectable } from '@angular/core';

/**
 * SONIDOS — pequeños sonidos al usar la app, distintos según lo que se hace
 * (guardar, error, abrir/cerrar una ventana, borrar, aprobar, un cambio en
 * vivo, celebrar...) y con el "instrumento" de la festividad del momento:
 * campanas en Navidad, theremín de miedo en Halloween, arpa en San
 * Valentín, trompetas el 20 de julio, xilófono saltarín en Pascua...
 *
 * No hay archivos de audio: cada sonido se arma al momento con el
 * sintetizador del navegador (Web Audio), así que no pesa nada.
 * Cada cuenta los prende/apaga y escoge el volumen (Apariencia → Sonidos);
 * ThemeService le pasa esa preferencia con configurar().
 */
export type Accion = 'ok' | 'error' | 'aviso' | 'abrir' | 'cerrar' | 'eliminar' | 'aprobar' | 'vivo' | 'pagina' | 'celebrar' | 'entrar' | 'clic' | 'deshacer' | 'soltar';

export const ACCIONES_SONIDO: Array<{ clave: Accion; nombre: string }> = [
  { clave: 'ok', nombre: 'Guardar' }, { clave: 'error', nombre: 'Error' }, { clave: 'aviso', nombre: 'Aviso' },
  { clave: 'abrir', nombre: 'Abrir ventana' }, { clave: 'cerrar', nombre: 'Cerrar ventana' }, { clave: 'eliminar', nombre: 'Eliminar' },
  { clave: 'aprobar', nombre: 'Aprobar' }, { clave: 'vivo', nombre: 'Cambio en vivo' }, { clave: 'pagina', nombre: 'Cambiar de página' },
  { clave: 'soltar', nombre: 'Mover un viaje' }, { clave: 'deshacer', nombre: 'Deshacer' }, { clave: 'celebrar', nombre: 'Celebración' }
];

type Onda = OscillatorType;
interface Kit {
  base: number;            // frecuencia de la nota 0 (Hz)
  escala: number[];        // semitonos de cada grado
  onda: Onda;
  caida: number;           // segundos que dura cada nota
  ataque?: number;
  vibrato?: number;        // Hz de vibrato (theremín)
  filtro?: number;         // pasa-bajos (suaviza)
  campana?: boolean;       // agrega el armónico de campana
  cascabel?: boolean;      // cascabeles (Navidad)
  pop?: boolean;           // estallido (Año Nuevo)
  latido?: boolean;        // latido (amor)
  tambor?: boolean;        // redoble (20 de julio)
  rebote?: boolean;        // la nota sube un poquito (xilófono saltarín)
  desliza?: boolean;       // glissando (fantasma)
}

const MAYOR = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
const MENOR_ARMONICA = [0, 2, 3, 5, 7, 8, 11, 12, 14, 15];

const KITS: Record<string, Kit> = {
  normal:          { base: 659.25, escala: PENTA, onda: 'sine', caida: 0.28, filtro: 4000 },
  halloween:       { base: 293.66, escala: MENOR_ARMONICA, onda: 'triangle', caida: 0.55, ataque: 0.04, vibrato: 6, filtro: 1800, desliza: true },
  navidad:         { base: 783.99, escala: MAYOR, onda: 'sine', caida: 0.9, campana: true, cascabel: true },
  'ano-nuevo':     { base: 698.46, escala: PENTA, onda: 'triangle', caida: 0.35, pop: true, campana: true },
  'san-valentin':  { base: 523.25, escala: MAYOR, onda: 'triangle', caida: 0.6, filtro: 2400, latido: true },
  'amor-amistad':  { base: 587.33, escala: MAYOR, onda: 'triangle', caida: 0.6, filtro: 2600, latido: true },
  madre:           { base: 554.37, escala: PENTA, onda: 'sine', caida: 0.7, filtro: 2200, latido: true },
  mujer:           { base: 622.25, escala: PENTA, onda: 'triangle', caida: 0.5, filtro: 3000 },
  padre:           { base: 329.63, escala: PENTA, onda: 'sawtooth', caida: 0.45, filtro: 1400 },
  'semana-santa':  { base: 880, escala: PENTA, onda: 'square', caida: 0.18, filtro: 2600, rebote: true },
  independencia:   { base: 392, escala: MAYOR, onda: 'sawtooth', caida: 0.4, ataque: 0.03, filtro: 2000, tambor: true }
};

// Qué notas (grados de la escala) toca cada acción, y cada cuánto (s).
const FRASES: Record<Accion, { notas: number[]; paso: number; vol?: number }> = {
  ok:       { notas: [0, 2, 4], paso: 0.08 },
  aprobar:  { notas: [0, 2, 4, 7], paso: 0.09 },
  error:    { notas: [3, 0], paso: 0.14, vol: 0.9 },
  aviso:    { notas: [2, 2], paso: 0.12, vol: 0.8 },
  abrir:    { notas: [1, 4], paso: 0.06, vol: 0.45 },
  cerrar:   { notas: [4, 1], paso: 0.06, vol: 0.4 },
  eliminar: { notas: [4, 2, 0], paso: 0.07, vol: 0.7 },
  vivo:     { notas: [7], paso: 0.1, vol: 0.5 },
  pagina:   { notas: [2], paso: 0.05, vol: 0.25 },
  clic:     { notas: [4], paso: 0.05, vol: 0.2 },
  soltar:   { notas: [0, 4], paso: 0.05, vol: 0.55 },
  deshacer: { notas: [4, 2, 4], paso: 0.06, vol: 0.55 },
  entrar:   { notas: [0, 2, 4, 7, 9], paso: 0.11 },
  celebrar: { notas: [0, 2, 4, 7, 4, 7, 9], paso: 0.11 }
};

@Injectable({ providedIn: 'root' })
export class SonidoService {
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;
  private activo = false;
  private volumen = 0.5;
  private conTemporada = true;
  private ultimo: Record<string, number> = {};
  private listo = false;

  constructor() {
    if (typeof document === 'undefined') return;
    // El navegador solo deja sonar después de que la persona toca algo.
    const despertar = () => { this.listo = true; if (this.activo) this.contexto(); };
    document.addEventListener('pointerdown', despertar, { capture: true });
    document.addEventListener('keydown', despertar, { capture: true });
    this.vigilarVentanas();
  }

  /** Abrir/cerrar ventanas: se ve en la página (sea *ngIf o la clase "hide"). */
  private vigilarVentanas(): void {
    if (typeof MutationObserver === 'undefined') return;
    const VENTANA = '.mbg, .nb-modal-backdrop, .ruto-modal-backdrop, .modal-backdrop, .ap-fondo';
    const esVentana = (n: Node) => n instanceof HTMLElement && (n.matches(VENTANA) || !!n.querySelector?.(VENTANA));
    new MutationObserver(cambios => {
      let abrio = false, cerro = false;
      for (const c of cambios) {
        if (c.type === 'childList') {
          c.addedNodes.forEach(n => { if (esVentana(n) && !(n as HTMLElement).classList.contains('hide')) abrio = true; });
          c.removedNodes.forEach(n => { if (esVentana(n)) cerro = true; });
        } else {
          const el = c.target as HTMLElement;
          if (!el.classList?.contains('mbg') || el.classList.contains('ap-cerrar')) continue;
          const ahora = el.classList.contains('hide'), antes = /(^|\s)hide(\s|$)/.test(c.oldValue || '');
          if (ahora !== antes && !/ap-cerrar/.test(c.oldValue || '')) { if (ahora) cerro = true; else abrio = true; }
        }
      }
      if (abrio) this.tocar('abrir'); else if (cerro) this.tocar('cerrar');
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  /** Lo que escogió la cuenta (ThemeService). */
  public configurar(activo: boolean, volumen: number, conTemporada: boolean): void {
    this.activo = activo;
    this.volumen = Math.max(0, Math.min(1, volumen / 100));
    this.conTemporada = conTemporada;
    if (this.salida) this.salida.gain.value = this.volumen * 0.35;
  }

  private contexto(): AudioContext | null {
    if (!this.listo) return null;
    if (!this.ctx) {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      try {
        this.ctx = new C() as AudioContext;
        // Compresor: que ningún sonido salga más fuerte de la cuenta.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        this.salida = this.ctx.createGain();
        this.salida.gain.value = this.volumen * 0.35;
        this.salida.connect(comp).connect(this.ctx.destination);
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private kitActual(forzar?: string): Kit {
    if (forzar) return KITS[forzar] || KITS['normal'];
    if (!this.conTemporada) return KITS['normal'];
    const t = document.documentElement.getAttribute('data-temporada') || '';
    return KITS[t] || KITS['normal'];
  }

  /** Suena la acción (si la cuenta tiene los sonidos puestos). */
  public tocar(accion: Accion, opciones: { forzar?: boolean; temporada?: string } = {}): void {
    if (!opciones.forzar && !this.activo) return;
    if (typeof document === 'undefined' || document.hidden) return;
    const ahora = performance.now();
    if (ahora - (this.ultimo[accion] || 0) < 160) return;    // no repetir en ráfaga
    // Abrir/cerrar justo después de guardar o de un error: suena solo lo importante.
    if ((accion === 'cerrar' || accion === 'abrir' || accion === 'pagina') && ahora - Math.max(this.ultimo['ok'] || 0, this.ultimo['error'] || 0, this.ultimo['eliminar'] || 0, this.ultimo['aprobar'] || 0) < 500) return;
    this.ultimo[accion] = ahora;
    const ctx = this.contexto();
    if (!ctx || !this.salida) return;
    const kit = this.kitActual(opciones.temporada);
    const frase = FRASES[accion];
    const t0 = ctx.currentTime + 0.01;
    const vol = frase.vol ?? 1;

    // Para errores, en el kit de miedo suena un fantasma que baja.
    frase.notas.forEach((g, i) => {
      const f = kit.base * Math.pow(2, (kit.escala[Math.min(g, kit.escala.length - 1)] - (accion === 'error' ? 12 : 0)) / 12);
      this.nota(ctx, kit, f, t0 + i * frase.paso, vol * (accion === 'pagina' || accion === 'clic' ? 0.7 : 1), accion);
    });

    const fin = t0 + frase.notas.length * frase.paso;
    if (kit.cascabel && (accion === 'ok' || accion === 'aprobar' || accion === 'celebrar' || accion === 'entrar')) this.cascabeles(ctx, t0, accion === 'celebrar' ? 10 : 5, vol);
    if (kit.pop && (accion === 'ok' || accion === 'aprobar' || accion === 'celebrar' || accion === 'entrar' || accion === 'soltar')) this.pop(ctx, fin, vol, accion === 'celebrar' ? 4 : 1);
    if (kit.latido && (accion === 'vivo' || accion === 'entrar' || accion === 'aprobar' || accion === 'celebrar')) this.latido(ctx, accion === 'vivo' ? t0 : fin, vol);
    if (kit.tambor && (accion === 'aprobar' || accion === 'celebrar' || accion === 'entrar')) this.redoble(ctx, t0, vol);
    if (accion === 'eliminar') this.soplo(ctx, t0, vol * 0.6);
    if (accion === 'celebrar' && !kit.pop) this.pop(ctx, fin + 0.05, vol * 0.7, 2);
  }

  private nota(ctx: AudioContext, kit: Kit, f: number, t: number, vol: number, accion: Accion): void {
    const dur = accion === 'pagina' || accion === 'clic' ? Math.min(kit.caida, 0.18) : kit.caida;
    const ataque = kit.ataque ?? 0.008;
    const osc = ctx.createOscillator();
    osc.type = kit.onda;
    osc.frequency.setValueAtTime(kit.desliza && accion !== 'pagina' ? f * 1.06 : f, t);
    if (kit.desliza && accion !== 'pagina') osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    if (kit.rebote) { osc.frequency.setValueAtTime(f * 0.8, t); osc.frequency.exponentialRampToValueAtTime(f, t + 0.04); }
    if (accion === 'error' && kit.desliza) osc.frequency.exponentialRampToValueAtTime(f * 0.7, t + dur);

    const g = ctx.createGain();
    const pico = 0.22 * vol * (kit.onda === 'sawtooth' || kit.onda === 'square' ? 0.45 : 1);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pico, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    let nodo: AudioNode = osc;
    if (kit.filtro) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = kit.filtro;
      nodo.connect(lp); nodo = lp;
    }
    if (kit.vibrato) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = kit.vibrato; lg.gain.value = f * 0.018;
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    nodo.connect(g).connect(this.salida!);
    osc.start(t); osc.stop(t + dur + 0.05);

    // Campana: un armónico "metálico" que se apaga más rápido.
    if (kit.campana) {
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'sine'; o2.frequency.value = f * 2.76;
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.linearRampToValueAtTime(pico * 0.35, t + 0.005);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.45);
      o2.connect(g2).connect(this.salida!);
      o2.start(t); o2.stop(t + dur);
    }
  }

  private ruido(ctx: AudioContext, dur: number): AudioBufferSourceNode {
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private cascabeles(ctx: AudioContext, t: number, n: number, vol: number): void {
    for (let i = 0; i < n; i++) {
      const ti = t + i * 0.06 + Math.random() * 0.02;
      const src = this.ruido(ctx, 0.08), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      hp.type = 'bandpass'; hp.frequency.value = 6500 + Math.random() * 2500; hp.Q.value = 8;
      g.gain.setValueAtTime(0.18 * vol, ti); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.07);
      src.connect(hp).connect(g).connect(this.salida!);
      src.start(ti);
    }
  }

  private pop(ctx: AudioContext, t: number, vol: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const ti = t + i * 0.13;
      const src = this.ruido(ctx, 0.25), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, ti); lp.frequency.exponentialRampToValueAtTime(300, ti + 0.2);
      g.gain.setValueAtTime(0.3 * vol, ti); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.22);
      src.connect(lp).connect(g).connect(this.salida!);
      src.start(ti);
      // chispitas después del estallido
      for (let k = 0; k < 4; k++) {
        const tk = ti + 0.08 + Math.random() * 0.25, o = ctx.createOscillator(), gk = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 2500 + Math.random() * 2500;
        gk.gain.setValueAtTime(0.04 * vol, tk); gk.gain.exponentialRampToValueAtTime(0.0001, tk + 0.05);
        o.connect(gk).connect(this.salida!); o.start(tk); o.stop(tk + 0.06);
      }
    }
  }

  private latido(ctx: AudioContext, t: number, vol: number): void {
    [0, 0.2].forEach((d, i) => {
      const ti = t + d, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(90, ti); o.frequency.exponentialRampToValueAtTime(45, ti + 0.15);
      g.gain.setValueAtTime(0.0001, ti); g.gain.linearRampToValueAtTime((i ? 0.3 : 0.45) * vol, ti + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.18);
      o.connect(g).connect(this.salida!); o.start(ti); o.stop(ti + 0.2);
    });
  }

  private redoble(ctx: AudioContext, t: number, vol: number): void {
    for (let i = 0; i < 6; i++) {
      const ti = t + i * 0.045, src = this.ruido(ctx, 0.06), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
      g.gain.setValueAtTime((0.1 + i * 0.02) * vol, ti); g.gain.exponentialRampToValueAtTime(0.0001, ti + 0.05);
      src.connect(bp).connect(g).connect(this.salida!); src.start(ti);
    }
  }

  private soplo(ctx: AudioContext, t: number, vol: number): void {
    const src = this.ruido(ctx, 0.35), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25 * vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(g).connect(this.salida!); src.start(t);
  }
}
