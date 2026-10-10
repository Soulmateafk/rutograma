import { Injectable, NgZone, inject } from '@angular/core';

/**
 * SONIDO AMBIENTE (Apariencia → Sonidos → Ambiente): un fondo muy suave
 * para trabajar — lluvia, café, mar, campo con pajaritos, grillos, fogata,
 * villancicos en cajita de música, noche de miedo o cajita de música.
 * "El de la temporada" cambia solo: villancicos en Navidad, noche de miedo
 * en Halloween, cajita de música en San Valentín, campo el 20 de julio...
 * Todo se arma con el sintetizador del navegador: no hay archivos.
 * Cada cuenta lo escoge y le pone volumen; ThemeService llama a configurar().
 */
type Generador = 'lluvia' | 'cafe' | 'mar' | 'campo' | 'grillos' | 'fogata' | 'villancicos' | 'misterio' | 'cajita';

const DE_TEMPORADA: Record<string, Generador> = {
  navidad: 'villancicos', velitas: 'villancicos', halloween: 'misterio', 'san-valentin': 'cajita', 'amor-amistad': 'cajita',
  madre: 'cajita', mujer: 'campo', padre: 'fogata', 'semana-santa': 'campo', independencia: 'campo', boyaca: 'campo',
  trabajo: 'cafe', conductor: 'campo', 'ano-nuevo': 'cafe', aniversario: 'cafe'
};

// Villancicos (melodías tradicionales): [semitono sobre Do5, duración en tiempos].
const VILLANCICOS: Array<Array<[number, number]>> = [
  // Jingle Bells (estribillo)
  [[4, 1], [4, 1], [4, 2], [4, 1], [4, 1], [4, 2], [4, 1], [7, 1], [0, 1.5], [2, .5], [4, 4], [5, 1], [5, 1], [5, 1.5], [5, .5], [5, 1], [4, 1], [4, 1], [4, .5], [4, .5], [4, 1], [2, 1], [2, 1], [4, 1], [2, 2], [7, 2]],
  // Noche de paz
  [[7, 1.5], [9, .5], [7, 1], [4, 3], [7, 1.5], [9, .5], [7, 1], [4, 3], [14, 2], [14, 1], [11, 3], [12, 2], [12, 1], [7, 3]],
  // Los peces en el río
  [[0, 1], [4, 1], [7, 1], [7, 1], [5, 1], [4, 1], [2, 2], [2, 1], [5, 1], [9, 1], [9, 1], [7, 1], [5, 1], [4, 2], [4, 1], [7, 1], [12, 1], [11, 1], [9, 1], [7, 1], [5, 1], [4, 1], [2, 2], [0, 3]],
  // Campana sobre campana
  [[7, 1], [7, 1], [9, 1], [7, 1], [5, 1], [4, 2], [4, 1], [5, 1], [7, 1], [5, 1], [4, 1], [2, 3], [2, 1], [4, 1], [5, 1], [7, 2], [9, 1], [7, 1], [5, 1], [4, 1], [0, 3]]
];

@Injectable({ providedIn: 'root' })
export class AmbienteService {
  private zone = inject(NgZone);
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;
  private eco: GainNode | null = null;
  private ruidoBuf: AudioBuffer | null = null;
  private listo = false;
  private eleccion = '';
  private volumen = 0.35;
  private sonando: Generador | null = null;
  private fondo: AudioNode[] = [];          // fuentes continuas (ruido)
  private reloj: any = null;
  private proximo = 0;                       // cuándo toca el siguiente evento
  private cancion = { n: 0, i: 0, t: 0 };

  constructor() {
    if (typeof document === 'undefined') return;
    const despertar = () => { if (this.listo) return; this.listo = true; this.actualizar(); };
    document.addEventListener('pointerdown', despertar, { capture: true });
    document.addEventListener('keydown', despertar, { capture: true });
    // Si la temporada cambia (o la cuenta escoge otra), "el de la temporada" se ajusta solo.
    new MutationObserver(() => { if (this.eleccion === 'temporada') this.actualizar(); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-temporada'] });
  }

  public configurar(eleccion: string, volumen: number): void {
    this.eleccion = eleccion || '';
    this.volumen = Math.max(0, Math.min(1, volumen / 100));
    if (this.salida && this.ctx) this.salida.gain.setTargetAtTime(this.volumen * 0.5, this.ctx.currentTime, 0.3);
    this.actualizar();
  }

  private generadorElegido(): Generador | null {
    if (!this.eleccion) return null;
    if (this.eleccion === 'temporada') return DE_TEMPORADA[document.documentElement.getAttribute('data-temporada') || ''] || 'lluvia';
    return this.eleccion as Generador;
  }

  private actualizar(): void {
    const g = this.generadorElegido();
    if (g === this.sonando) return;
    this.detener();
    if (!g || !this.listo) return;
    const ctx = this.contexto();
    if (!ctx) return;
    this.sonando = g;
    this.empezar(g);
  }

  private contexto(): AudioContext | null {
    if (!this.ctx) {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      const ctx = new C() as AudioContext;
      this.ctx = ctx;
      this.salida = ctx.createGain();
      this.salida.gain.value = this.volumen * 0.5;
      this.salida.connect(ctx.destination);
      const conv = ctx.createConvolver();
      const largo = Math.floor(ctx.sampleRate * 2.5);
      const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 2.5); }
      conv.buffer = ir;
      this.eco = ctx.createGain(); this.eco.gain.value = 0.35;
      this.eco.connect(conv).connect(this.salida);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const r = buf.getChannelData(0);
      for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
      this.ruidoBuf = buf;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private detener(): void {
    clearInterval(this.reloj);
    this.reloj = null;
    const ctx = this.ctx;
    for (const n of this.fondo) {
      try {
        if (ctx && (n as any).gain) (n as GainNode).gain.setTargetAtTime(0, ctx.currentTime, 0.4);
        setTimeout(() => { try { (n as any).stop?.(); n.disconnect(); } catch { /* ya paró */ } }, 1500);
      } catch { /* nada */ }
    }
    this.fondo = [];
    this.sonando = null;
  }

  // ---------- piezas ----------
  /** Ruido continuo filtrado, con su volumen (y opcionalmente un vaivén lento). */
  private ruidoContinuo(filtros: Array<[BiquadFilterType, number, number?]>, vol: number, vaiven = 0, velocidad = 0.08): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.ruidoBuf; src.loop = true;
    let nodo: AudioNode = src;
    for (const [tipo, f, q] of filtros) { const b = ctx.createBiquadFilter(); b.type = tipo; b.frequency.value = f; if (q) b.Q.value = q; nodo.connect(b); nodo = b; }
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(vol, ctx.currentTime, 1.2);
    nodo.connect(g).connect(this.salida!);
    if (vaiven) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = velocidad; lg.gain.value = vol * vaiven;
      lfo.connect(lg).connect(g.gain); lfo.start(); this.fondo.push(lfo);
    }
    src.start(0, Math.random() * 3);
    this.fondo.push(src, g);
  }

  private tono(f: number, t: number, dura: number, vol: number, tipo: OscillatorType = 'sine', aEco = true, desliz?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    if (desliz) o.frequency.exponentialRampToValueAtTime(desliz, t + dura * 0.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dura / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    o.connect(g); g.connect(this.salida!); if (aEco) g.connect(this.eco!);
    o.start(t); o.stop(t + dura + 0.05);
  }

  private chasquido(t: number, vol: number, filtro: number, dura = 0.02): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource(); src.buffer = this.ruidoBuf;
    const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = filtro; b.Q.value = 2;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dura);
    src.connect(b).connect(g).connect(this.salida!);
    src.start(t, Math.random() * 3, dura + 0.02);
  }

  private cajita(f: number, t: number, dura: number, vol: number): void {
    this.tono(f, t, dura, vol);
    this.tono(f * 3, t, dura * 0.35, vol * 0.22);
    this.tono(f * 6.3, t, dura * 0.15, vol * 0.08);
  }

  private pajarito(t: number, vol: number): void {
    const base = 2400 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tono(base, t + i * 0.11, 0.08, vol, 'sine', true, base * (1.3 + Math.random() * 0.4));
  }

  // ---------- cada ambiente ----------
  private empezar(g: Generador): void {
    const ctx = this.ctx!;
    this.proximo = ctx.currentTime + 0.5;
    this.cancion = { n: Math.floor(Math.random() * VILLANCICOS.length), i: 0, t: 0 };
    switch (g) {
      case 'lluvia': this.ruidoContinuo([['highpass', 400], ['lowpass', 5000]], 0.22, 0.15, 0.05); this.ruidoContinuo([['lowpass', 300]], 0.12); break;
      case 'cafe': this.ruidoContinuo([['bandpass', 450, 0.8]], 0.16, 0.35, 0.3); this.ruidoContinuo([['lowpass', 220]], 0.1); break;
      case 'mar': this.ruidoContinuo([['lowpass', 900]], 0.32, 0.85, 0.09); this.ruidoContinuo([['highpass', 2500]], 0.05, 0.9, 0.09); break;
      case 'campo': this.ruidoContinuo([['bandpass', 600, 0.6]], 0.06, 0.6, 0.07); break;
      case 'grillos': this.ruidoContinuo([['lowpass', 400]], 0.05, 0.5, 0.05); break;
      case 'fogata': this.ruidoContinuo([['lowpass', 260]], 0.2, 0.25, 0.4); break;
      case 'misterio': this.ruidoContinuo([['bandpass', 420, 3]], 0.22, 0.8, 0.06); this.dron(); break;
      case 'villancicos': case 'cajita': this.ruidoContinuo([['lowpass', 500]], 0.015); break;
    }
    this.zone.runOutsideAngular(() => { this.reloj = setInterval(() => this.programar(g), 200); });
  }

  /** Acorde grave de órgano que respira (noche de miedo). */
  private dron(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.gain.value = 0; g.gain.setTargetAtTime(0.05, ctx.currentTime, 3);
    g.connect(this.salida!); g.connect(this.eco!);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 0.03; lfo.connect(lg).connect(g.gain); lfo.start();
    [73.4, 87.3, 110, 146.8].forEach(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); this.fondo.push(o); });
    this.fondo.push(g, lfo);
  }

  /** Eventos sueltos (gotas, pajaritos, tazas, notas...) programados un poco adelante. */
  private programar(g: Generador): void {
    const ctx = this.ctx;
    if (!ctx || this.sonando !== g) return;
    const hasta = ctx.currentTime + 0.6;
    while (this.proximo < hasta) {
      const t = this.proximo;
      switch (g) {
        case 'lluvia':
          this.chasquido(t, 0.05 + Math.random() * 0.08, 2500 + Math.random() * 3000, 0.015);
          this.proximo += 0.03 + Math.random() * 0.12; break;
        case 'cafe':
          if (Math.random() < 0.5) { this.tono(2600 + Math.random() * 600, t, 0.5, 0.03); this.tono(3400 + Math.random() * 500, t + 0.01, 0.4, 0.02); }
          else this.chasquido(t, 0.08, 1800, 0.05);
          this.proximo += 3 + Math.random() * 7; break;
        case 'mar':
          this.chasquido(t, 0.03, 6000, 0.3);
          this.proximo += 1 + Math.random() * 2; break;
        case 'campo':
          this.pajarito(t, 0.03 + Math.random() * 0.03);
          this.proximo += 1.2 + Math.random() * 3.5; break;
        case 'grillos':
          for (let k = 0; k < 3; k++) this.tono(4500 + Math.random() * 300, t + k * 0.045, 0.03, 0.025, 'sine', false);
          if (Math.random() < 0.06) this.tono(380, t + 0.3, 0.5, 0.03, 'sine', true, 340);   // un sapito
          this.proximo += 0.45 + Math.random() * 0.6; break;
        case 'fogata':
          this.chasquido(t, 0.12 + Math.random() * 0.25, 1500 + Math.random() * 3000, 0.01 + Math.random() * 0.03);
          this.proximo += 0.05 + Math.random() * 0.35; break;
        case 'misterio': {
          const r = Math.random();
          if (r < 0.4) { this.tono(400, t, 0.35, 0.04, 'sine', true, 360); this.tono(400, t + 0.5, 0.6, 0.04, 'sine', true, 330); }   // búho
          else if (r < 0.7) [1, 2.76, 5.4].forEach((m, i) => this.tono(196 * m, t, 3.5 / (i + 1), 0.03 / (i + 1)));            // campana lejana
          else this.tono(900, t, 1.2, 0.015, 'sine', true, 500);                                                                // un quejido
          this.proximo += 5 + Math.random() * 7; break;
        }
        case 'villancicos': {
          const melodia = VILLANCICOS[this.cancion.n];
          const [semi, tiempos] = melodia[this.cancion.i];
          const negra = 0.42;
          this.cajita(523.25 * Math.pow(2, semi / 12), t, Math.max(0.6, tiempos * negra * 1.6), 0.07);
          if (this.cancion.i % 4 === 0) this.cajita(130.81 * Math.pow(2, ([0, 7, 5, 0][(this.cancion.i / 4) % 4] || 0) / 12), t, 1.4, 0.035);   // un bajo suave
          this.cancion.i++;
          this.proximo += tiempos * negra;
          if (this.cancion.i >= melodia.length) { this.cancion = { n: (this.cancion.n + 1) % VILLANCICOS.length, i: 0, t: 0 }; this.proximo += 4; }
          break;
        }
        case 'cajita': {
          const escala = [0, 2, 4, 7, 9, 12, 14, 16, 19];
          this.cancion.t = Math.max(0, Math.min(escala.length - 1, this.cancion.t + Math.round(Math.random() * 4 - 2)));
          this.cajita(659.25 * Math.pow(2, escala[this.cancion.t] / 12) / 2, t, 1.6, 0.06);
          if (Math.random() < 0.25) this.cajita(329.63 * Math.pow(2, escala[Math.floor(Math.random() * 4)] / 12) / 2, t, 2, 0.035);
          this.proximo += [0.38, 0.38, 0.76, 1.14][Math.floor(Math.random() * 4)]; break;
        }
      }
    }
  }
}
