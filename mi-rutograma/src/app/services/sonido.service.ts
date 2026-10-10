import { Injectable } from '@angular/core';

/**
 * SONIDOS — pequeños sonidos al usar la app, distintos según lo que se hace
 * (guardar, error, abrir/cerrar una ventana, borrar, aprobar, un cambio en
 * vivo, celebrar...) y con la música y los efectos de la festividad:
 *  - Navidad: cajita de música y campanas, cascabeles de trineo y "Jingle Bells".
 *  - Halloween: órgano de iglesia (la Tocata), theremín, puerta que rechina,
 *    risa de bruja, murciélagos, viento y aullido de lobo.
 *  - Año Nuevo: corcho de champaña, copas que chocan, cohetes y "Auld Lang Syne".
 *  - San Valentín / Amor y Amistad: arpa, latidos y destellos.
 *  - Día de la Madre: cajita de música y pajaritos. Día de la Mujer: flauta.
 *  - Día del Padre: guitarra rasgueada.
 *  - Semana Santa: xilófono saltarín, "boing" y pajaritos.
 *  - 20 de Julio: trompetas, redoble y platillos.
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
  { clave: 'soltar', nombre: 'Mover un viaje' }, { clave: 'deshacer', nombre: 'Deshacer' }, { clave: 'entrar', nombre: 'Al entrar' },
  { clave: 'celebrar', nombre: 'Celebración' }
];

type Instrumento = 'marimba' | 'campana' | 'cajita' | 'arpa' | 'theremin' | 'organo' | 'trompeta' | 'flauta' | 'guitarra' | 'xilofono';
type Efecto = 'cascabeles' | 'pop' | 'corcho' | 'copas' | 'cohete' | 'latido' | 'redoble' | 'platillo' | 'soplo' | 'viento' | 'aullido' | 'risa' | 'murcielago'
  | 'puerta' | 'portazo' | 'pajaritos' | 'boing' | 'destellos' | 'rasgueo' | 'trombon' | 'fantasma' | 'trueno' | 'pito' | 'martillo';

/** Una nota: semitonos sobre la base, cuánto falta para la siguiente (s) y cuánto suena (s). */
type Nota = [semitono: number, paso?: number, dura?: number];
interface Frase { notas: Nota[]; vol?: number; inst?: Instrumento; acorde?: boolean }
interface Tema {
  inst: Instrumento;
  base: number;                                         // Hz de la nota 0
  eco: number;                                          // cuánta reverberación (0-1)
  frases: Partial<Record<Accion, Frase>>;
  efectos: Partial<Record<Accion, Array<Efecto | [Efecto, number]>>>;   // [efecto, segundos de retraso]
}

const n = (semis: number[], paso: number, dura?: number): Nota[] => semis.map(s => [s, paso, dura]);

/** Frases de siempre (si la temporada no trae una propia). Semitonos sobre la base. */
const COMUNES: Record<Accion, Frase> = {
  ok:       { notas: n([0, 4, 7], 0.08) },
  aprobar:  { notas: n([0, 4, 7, 12], 0.09) },
  error:    { notas: n([3, -2], 0.15), vol: 0.9 },
  aviso:    { notas: n([7, 7], 0.13), vol: 0.8 },
  abrir:    { notas: n([2, 9], 0.06), vol: 0.45 },
  cerrar:   { notas: n([9, 2], 0.06), vol: 0.4 },
  eliminar: { notas: n([7, 4, 0], 0.07), vol: 0.7 },
  vivo:     { notas: n([12], 0.1), vol: 0.5 },
  pagina:   { notas: n([4], 0.05), vol: 0.22 },
  clic:     { notas: n([7], 0.05), vol: 0.2 },
  soltar:   { notas: n([0, 7], 0.06), vol: 0.55 },
  deshacer: { notas: n([7, 4, 7], 0.06), vol: 0.55 },
  entrar:   { notas: n([0, 4, 7, 9, 12], 0.11) },
  celebrar: { notas: n([0, 4, 7, 12, 7, 12, 16], 0.11) }
};

const TEMAS: Record<string, Tema> = {
  normal: { inst: 'marimba', base: 523.25, eco: 0.12, frases: {}, efectos: {} },

  navidad: {
    inst: 'cajita', base: 659.25, eco: 0.35,
    frases: {
      // "Jingle Bells": mi mi mi, mi mi mi, mi sol do re mi
      celebrar: { notas: [[4, .17], [4, .17], [4, .34], [4, .17], [4, .17], [4, .34], [4, .17], [7, .17], [0, .25], [2, .09], [4, .5, .9]] },
      entrar: { notas: [[4, .16], [4, .16], [4, .3, .7]] },
      ok: { notas: n([0, 4, 7], 0.09), inst: 'campana' },
      aprobar: { notas: n([0, 4, 7, 12], 0.1), inst: 'campana' },
      error: { notas: n([1, 0], 0.2), inst: 'campana', vol: 0.8 },
      eliminar: { notas: n([12, 7, 4, 0], 0.08) },
      abrir: { notas: n([12], 0.1), inst: 'campana', vol: 0.4 },
      cerrar: { notas: n([7], 0.1), inst: 'campana', vol: 0.35 }
    },
    efectos: { ok: ['cascabeles'], aprobar: ['cascabeles'], celebrar: ['cascabeles', ['cascabeles', 1.1], ['cascabeles', 2.2]], entrar: ['cascabeles'], vivo: ['cascabeles'], soltar: ['cascabeles'] }
  },

  halloween: {
    inst: 'theremin', base: 293.66, eco: 0.55,
    frases: {
      // La Tocata y fuga en re menor: la sol la, sol fa mi re do# re
      celebrar: { inst: 'organo', notas: [[7, .14, .2], [5, .14, .2], [7, .7, .9], [5, .12], [3, .12], [2, .12], [0, .12], [-1, .4, .5], [0, .9, 1.4]] },
      entrar: { inst: 'organo', notas: [[0, 0, 1.3], [3, 0, 1.3], [7, .0, 1.3]], acorde: true, vol: 0.7 },
      ok: { notas: [[0, .22, .4], [7, .3, .6]] },
      aprobar: { inst: 'organo', notas: [[0, 0, .9], [3, 0, .9], [7, 0, .9], [12, 0, .9]], acorde: true, vol: 0.7 },
      error: { notas: [[6, .25, .6], [0, .4, .8]], vol: 0.8 },
      aviso: { inst: 'organo', notas: [[1, 0, .5], [7, 0, .5]], acorde: true, vol: 0.6 },
      eliminar: { notas: [[12, .25, 1.0]], vol: 0.6 },
      vivo: { notas: [[12, .2, .5]], vol: 0.35 },
      pagina: { notas: [[7, .1, .25]], vol: 0.18 },
      deshacer: { notas: [[0, .15, .3], [12, .2, .4]], vol: 0.5 }
    },
    efectos: { error: ['risa'], eliminar: ['fantasma', 'viento'], abrir: ['puerta'], cerrar: ['portazo'], vivo: ['murcielago'], entrar: ['viento', ['aullido', 0.6]],
      celebrar: [['trueno', 0], ['murcielago', 2.3], ['risa', 2.7]], aprobar: ['murcielago'], soltar: ['portazo'], pagina: [] }
  },

  'ano-nuevo': {
    inst: 'campana', base: 523.25, eco: 0.3,
    frases: {
      // "Auld Lang Syne": sol do do do mi re do re mi do
      celebrar: { notas: [[-5, .3], [0, .45], [0, .15], [0, .3], [4, .3], [2, .45], [0, .15], [2, .3], [4, .3], [0, .6, 1.2]], inst: 'cajita' },
      entrar: { notas: [[-5, .28], [0, .42], [0, .14], [0, .3], [4, .6, 1]], inst: 'cajita' },
      ok: { notas: n([12, 19], 0.06), vol: 0.5 },
      aprobar: { notas: n([7, 12, 16, 19], 0.08) },
      eliminar: { notas: n([12, 7, 0], 0.07), vol: 0.5 },
      abrir: { notas: [], vol: 0 }, cerrar: { notas: [], vol: 0 }
    },
    efectos: { ok: ['corcho'], aprobar: ['cohete'], celebrar: ['cohete', ['cohete', 0.9], ['cohete', 1.7], ['copas', 2.6]], entrar: ['corcho', ['copas', 0.6]],
      abrir: ['copas'], cerrar: ['soplo'], vivo: ['destellos'], error: ['trombon'], soltar: ['corcho'] }
  },

  'san-valentin': {
    inst: 'arpa', base: 523.25, eco: 0.45,
    frases: {
      celebrar: { notas: [...n([0, 4, 7, 11, 12, 16, 19, 23, 24], 0.06), [19, .2], [24, .6, 1.4]] },
      entrar: { notas: n([0, 4, 7, 11, 12, 16, 19], 0.07) },
      error: { notas: n([3, -1], 0.18), vol: 0.8 },
      eliminar: { notas: n([12, 11, 7, 4, 0], 0.05), vol: 0.6 }
    },
    efectos: { vivo: ['latido'], aprobar: ['latido'], celebrar: [['latido', 1.0], ['destellos', 0.2]], entrar: [['latido', 0.6]], ok: ['destellos'] }
  },

  'amor-amistad': {
    inst: 'arpa', base: 587.33, eco: 0.4,
    frases: {
      celebrar: { notas: [[0, .14], [4, .14], [7, .14], [12, .3], [11, .14], [7, .14], [9, .14], [12, .5, 1.2]], inst: 'cajita' },
      entrar: { notas: n([0, 4, 7, 12, 16], 0.08) }
    },
    efectos: { vivo: ['latido'], aprobar: ['latido', 'destellos'], celebrar: [['latido', 1.4], 'destellos'], ok: ['destellos'] }
  },

  madre: {
    inst: 'cajita', base: 698.46, eco: 0.4,
    frases: {
      // Canción de cuna (Brahms): mi mi sol, mi mi sol, mi sol do' si la la sol
      celebrar: { notas: [[4, .18], [4, .18], [7, .5], [4, .18], [4, .18], [7, .5], [4, .18], [7, .18], [12, .3], [11, .3], [9, .3], [9, .3], [7, .6, 1.2]] },
      entrar: { notas: [[4, .18], [4, .18], [7, .5, 1]] }
    },
    efectos: { entrar: [['pajaritos', 0.6]], celebrar: [['pajaritos', 3.4]], vivo: ['pajaritos'], aprobar: ['latido'] }
  },

  mujer: {
    inst: 'flauta', base: 587.33, eco: 0.35,
    frases: {
      celebrar: { notas: [[0, .2], [4, .2], [7, .2], [12, .4], [9, .2], [7, .2], [9, .2], [12, .7, 1.2]] },
      entrar: { notas: [[0, .22], [7, .22], [12, .6, 1]] }
    },
    efectos: { entrar: [['pajaritos', 0.8]], vivo: ['pajaritos'], celebrar: ['destellos', ['pajaritos', 2.4]], ok: [] }
  },

  padre: {
    inst: 'guitarra', base: 196.0, eco: 0.25,
    frases: {
      // Rasgueos: Do, Sol, La menor, Fa
      celebrar: { notas: [], vol: 0 },
      entrar: { notas: [], vol: 0 },
      ok: { notas: [[0, 0.025], [4, 0.025], [7, 0.025], [12, 0.025, 1.2]] },
      aprobar: { notas: [[0, 0.03], [4, 0.03], [7, 0.03], [12, 0.03], [16, 0.03, 1.4]] }
    },
    efectos: { celebrar: [['rasgueo', 0]], entrar: [['rasgueo', 0]], error: ['trombon'] }
  },

  'semana-santa': {
    inst: 'xilofono', base: 783.99, eco: 0.2,
    frases: {
      celebrar: { notas: [[0, .12], [4, .12], [7, .12], [12, .24], [7, .12], [12, .12], [16, .4, .6]] },
      entrar: { notas: n([0, 4, 7, 12], 0.1) }
    },
    efectos: { ok: ['boing'], aprobar: ['boing', ['boing', 0.2]], soltar: ['boing'], celebrar: [['boing', 1.0], ['boing', 1.25], ['pajaritos', 1.5]], entrar: [['pajaritos', 0.4]], vivo: ['pajaritos'] }
  },

  independencia: {
    inst: 'trompeta', base: 392.0, eco: 0.3,
    frases: {
      // Fanfarria de corneta: sol do mi sol — mi sol
      celebrar: { notas: [[-5, .14], [0, .14], [4, .14], [7, .42], [4, .14], [7, .7, 1.2]] },
      entrar: { notas: [[-5, .14], [0, .14], [4, .14], [7, .6, .9]] },
      ok: { notas: [[0, .1], [7, .3, .4]] },
      aprobar: { notas: [[0, .1], [4, .1], [7, .1], [12, .4, .6]] },
      error: { notas: [], vol: 0 }
    },
    efectos: { celebrar: ['redoble', ['platillo', 1.5]], entrar: [['redoble', 0]], aprobar: [['platillo', 0.32]], error: ['trombon'], soltar: ['redoble'] }
  }
};

// Fiestas que usan los sonidos de otra, con su toque propio.
TEMAS['boyaca'] = { ...TEMAS['independencia'], frases: { ...TEMAS['independencia'].frases } };
TEMAS['velitas'] = { ...TEMAS['navidad'], frases: { ...TEMAS['navidad'].frases, celebrar: TEMAS['madre'].frases.celebrar! }, efectos: { ...TEMAS['navidad'].efectos, celebrar: ['destellos', ['destellos', 1.2]] } };
TEMAS['conductor'] = {
  inst: 'marimba', base: 523.25, eco: 0.2,
  frases: { celebrar: { notas: [[0, .14], [4, .14], [7, .14], [12, .5, .8]] }, entrar: { notas: [[0, .12], [7, .3]] } },
  efectos: { ok: [['pito', 0.18]], celebrar: ['pito', ['pito', 0.45], ['destellos', 0.9]], entrar: [['pito', 0.3]], soltar: ['pito'], aprobar: [['pito', 0.25]] }
};
TEMAS['trabajo'] = {
  inst: 'xilofono', base: 659.25, eco: 0.2,
  frases: { celebrar: { notas: n([0, 4, 7, 12, 7, 12], 0.12) } },
  efectos: { ok: ['martillo'], soltar: ['martillo'], celebrar: ['martillo', ['martillo', 0.3], ['martillo', 0.6]], aprobar: ['martillo'] }
};
TEMAS['aniversario'] = { ...TEMAS['ano-nuevo'], frases: { ...TEMAS['ano-nuevo'].frases, celebrar: { notas: [[0, .3], [0, .15], [2, .45], [0, .45], [5, .45], [4, .9, 1.2]], inst: 'cajita' } } };   // "Cumpleaños feliz"

@Injectable({ providedIn: 'root' })
export class SonidoService {
  private ctx: AudioContext | null = null;
  private salida: GainNode | null = null;
  private eco: GainNode | null = null;
  private activo = false;
  private volumen = 0.5;
  private conTemporada = true;
  private ultimo: Record<string, number> = {};
  private listo = false;
  private ruidoBuf: AudioBuffer | null = null;

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
    if (this.salida) this.salida.gain.value = this.volumen * 0.4;
  }

  private contexto(): AudioContext | null {
    if (!this.listo) return null;
    if (!this.ctx) {
      const C = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!C) return null;
      try {
        const ctx = new C() as AudioContext;
        this.ctx = ctx;
        // Compresor: que ningún sonido salga más fuerte de la cuenta.
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18; comp.ratio.value = 6;
        this.salida = ctx.createGain();
        this.salida.gain.value = this.volumen * 0.4;
        this.salida.connect(comp).connect(ctx.destination);
        // Reverberación (sala): da cuerpo a campanas, órgano y arpa.
        const conv = ctx.createConvolver();
        const largo = Math.floor(ctx.sampleRate * 2.2);
        const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
        for (let canal = 0; canal < 2; canal++) {
          const d = ir.getChannelData(canal);
          for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3);
        }
        conv.buffer = ir;
        this.eco = ctx.createGain();
        this.eco.gain.value = 0.2;
        this.eco.connect(conv).connect(this.salida);
        // Ruido blanco reutilizable (viento, cascabeles, platillos...).
        const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const r = buf.getChannelData(0);
        for (let i = 0; i < r.length; i++) r[i] = Math.random() * 2 - 1;
        this.ruidoBuf = buf;
      } catch { return null; }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  private temaActual(forzar?: string): Tema {
    if (forzar) return TEMAS[forzar] || TEMAS['normal'];
    if (!this.conTemporada) return TEMAS['normal'];
    const t = document.documentElement.getAttribute('data-temporada') || '';
    return TEMAS[t] || TEMAS['normal'];
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
    const tema = this.temaActual(opciones.temporada);
    this.eco!.gain.setValueAtTime(tema.eco, ctx.currentTime);
    const frase = tema.frases[accion] ?? COMUNES[accion];
    const inst = frase.inst || tema.inst;
    const vol = (frase.vol ?? COMUNES[accion].vol ?? 1) * (accion === 'pagina' || accion === 'clic' ? 0.7 : 1);
    const t0 = ctx.currentTime + 0.02;
    let t = t0;
    for (const [semi, paso = 0.1, dura] of frase.notas) {
      const f = tema.base * Math.pow(2, semi / 12);
      const corta = accion === 'pagina' || accion === 'clic';
      this.nota(ctx, inst, f, t, dura ?? (corta ? 0.18 : undefined), vol);
      if (!frase.acorde) t += paso;
    }
    for (const e of tema.efectos[accion] ?? (accion === 'eliminar' ? ['soplo' as Efecto] : [])) {
      const [efecto, retraso] = Array.isArray(e) ? e : [e, 0];
      this.efecto(ctx, efecto, t0 + retraso, frase.vol === 0 ? (COMUNES[accion].vol ?? 1) : vol);
    }
  }

  // ============================================================
  // INSTRUMENTOS
  // ============================================================
  private env(ctx: AudioContext, t: number, pico: number, ataque: number, dura: number, destino: AudioNode, sostener = 0): GainNode {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(pico, t + ataque);
    if (sostener) g.gain.setValueAtTime(pico, t + ataque + sostener);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ataque + sostener + dura);
    g.connect(destino);
    return g;
  }
  private osc(ctx: AudioContext, tipo: OscillatorType, f: number, t: number, fin: number, destino: AudioNode): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = tipo; o.frequency.setValueAtTime(f, t);
    o.connect(destino); o.start(t); o.stop(fin + 0.05);
    return o;
  }
  /** Envía a la salida y un poco al eco. */
  private bus(ctx: AudioContext): GainNode {
    const g = ctx.createGain();
    g.connect(this.salida!); g.connect(this.eco!);
    return g;
  }

  private nota(ctx: AudioContext, inst: Instrumento, f: number, t: number, dura: number | undefined, vol: number): void {
    const v = 0.24 * vol;
    const sal = this.bus(ctx);
    switch (inst) {
      case 'marimba': {
        const d = dura ?? 0.35;
        this.osc(ctx, 'sine', f, t, t + d, this.env(ctx, t, v, 0.005, d, sal));
        this.osc(ctx, 'sine', f * 4, t, t + d * 0.3, this.env(ctx, t, v * 0.18, 0.003, d * 0.25, sal));
        break;
      }
      case 'campana': {
        const d = dura ?? 1.3;
        [[1, 1], [2.0, 0.4], [2.76, 0.35], [5.4, 0.15], [8.93, 0.06]].forEach(([m, a]) =>
          this.osc(ctx, 'sine', f * m, t, t + d, this.env(ctx, t, v * a, 0.003, d / (m > 2 ? m * 0.5 : 1), sal)));
        break;
      }
      case 'cajita': {
        const d = dura ?? 0.7;
        this.osc(ctx, 'sine', f, t, t + d, this.env(ctx, t, v * 0.9, 0.002, d, sal));
        this.osc(ctx, 'sine', f * 3, t, t + d * 0.4, this.env(ctx, t, v * 0.25, 0.002, d * 0.35, sal));
        this.osc(ctx, 'sine', f * 6.3, t, t + d * 0.2, this.env(ctx, t, v * 0.1, 0.001, d * 0.15, sal));
        break;
      }
      case 'arpa': {
        const d = dura ?? 1.1;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(5000, t); lp.frequency.exponentialRampToValueAtTime(900, t + d);
        lp.connect(sal);
        this.osc(ctx, 'triangle', f, t, t + d, this.env(ctx, t, v, 0.004, d, lp));
        this.osc(ctx, 'sine', f * 2, t, t + d * 0.5, this.env(ctx, t, v * 0.3, 0.004, d * 0.4, lp));
        break;
      }
      case 'theremin': {
        const d = dura ?? 0.55;
        const o = this.osc(ctx, 'sine', f * 0.94, t, t + d + 0.1, this.env(ctx, t, v * 1.1, 0.07, d, sal, d * 0.3));
        o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 6; lg.gain.value = f * 0.025;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + d * 1.4 + 0.2);
        break;
      }
      case 'organo': {
        const d = dura ?? 0.6;
        const g = this.env(ctx, t, v * 0.55, 0.03, 0.35, sal, d);
        [[1, 1], [2, 0.6], [3, 0.35], [4, 0.25], [0.5, 0.5]].forEach(([m, a]) => {
          const ga = ctx.createGain(); ga.gain.value = a; ga.connect(g);
          this.osc(ctx, 'sine', f * m * (1 + (Math.random() - 0.5) * 0.002), t, t + d + 0.4, ga);
        });
        break;
      }
      case 'trompeta': {
        const d = dura ?? 0.35;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
        lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3200, t + 0.06); lp.frequency.exponentialRampToValueAtTime(1500, t + d);
        lp.connect(sal);
        const o = this.osc(ctx, 'sawtooth', f * 0.96, t, t + d + 0.1, this.env(ctx, t, v * 0.5, 0.03, 0.12, lp, d));
        o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
        break;
      }
      case 'flauta': {
        const d = dura ?? 0.45;
        const o = this.osc(ctx, 'sine', f, t, t + d + 0.2, this.env(ctx, t, v, 0.06, 0.2, sal, d));
        const lfo = ctx.createOscillator(), lg = ctx.createGain();
        lfo.frequency.value = 5; lg.gain.value = f * 0.008; lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + d + 0.3);
        // soplo de aire
        const r = this.ruido(ctx, t, d), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 2; bp.Q.value = 3;
        r.connect(bp).connect(this.env(ctx, t, v * 0.25, 0.04, 0.15, sal, d * 0.6));
        break;
      }
      case 'guitarra': {
        const d = dura ?? 0.9;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(3500, t); lp.frequency.exponentialRampToValueAtTime(500, t + d * 0.7);
        lp.connect(sal);
        this.osc(ctx, 'sawtooth', f, t, t + d, this.env(ctx, t, v * 0.45, 0.003, d, lp));
        this.osc(ctx, 'triangle', f * 2, t, t + d * 0.6, this.env(ctx, t, v * 0.25, 0.003, d * 0.5, lp));
        break;
      }
      case 'xilofono': {
        const d = dura ?? 0.3;
        const o = this.osc(ctx, 'sine', f * 0.85, t, t + d, this.env(ctx, t, v, 0.002, d, sal));
        o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
        this.osc(ctx, 'sine', f * 3.9, t, t + 0.1, this.env(ctx, t, v * 0.25, 0.001, 0.08, sal));
        break;
      }
    }
  }

  // ============================================================
  // EFECTOS
  // ============================================================
  private ruido(ctx: AudioContext, t: number, dura: number): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.ruidoBuf;
    src.start(t, Math.random() * 1.2, Math.min(dura, 0.8) + 0.05);
    return src;
  }
  private filtro(ctx: AudioContext, tipo: BiquadFilterType, f: number, q = 1): BiquadFilterNode {
    const b = ctx.createBiquadFilter(); b.type = tipo; b.frequency.value = f; b.Q.value = q; return b;
  }

  private efecto(ctx: AudioContext, e: Efecto, t: number, vol: number): void {
    const sal = this.bus(ctx);
    const v = vol;
    switch (e) {
      case 'cascabeles':
        for (let i = 0; i < 9; i++) {
          const ti = t + i * 0.055 + Math.random() * 0.02;
          this.ruido(ctx, ti, 0.08).connect(this.filtro(ctx, 'bandpass', 6000 + Math.random() * 3000, 9)).connect(this.env(ctx, ti, 0.35 * v, 0.002, 0.07, sal));
          this.osc(ctx, 'sine', 4200 + Math.random() * 1500, ti, ti + 0.08, this.env(ctx, ti, 0.03 * v, 0.001, 0.06, sal));
        }
        break;
      case 'pop':
      case 'corcho': {
        const o = this.osc(ctx, 'sine', 900, t, t + 0.08, this.env(ctx, t, 0.35 * v, 0.001, 0.07, sal));
        o.frequency.exponentialRampToValueAtTime(250, t + 0.06);
        this.ruido(ctx, t, 0.04).connect(this.filtro(ctx, 'highpass', 2000)).connect(this.env(ctx, t, 0.2 * v, 0.001, 0.03, sal));
        // burbujas
        const r = this.ruido(ctx, t + 0.08, 0.7);
        r.connect(this.filtro(ctx, 'highpass', 6000)).connect(this.env(ctx, t + 0.08, 0.06 * v, 0.05, 0.6, sal));
        for (let i = 0; i < 6; i++) { const ti = t + 0.1 + Math.random() * 0.5; this.osc(ctx, 'sine', 2500 + Math.random() * 2500, ti, ti + 0.03, this.env(ctx, ti, 0.03 * v, 0.001, 0.025, sal)); }
        break;
      }
      case 'copas':
        [[2093, 0], [2637, 0.012]].forEach(([f, d]) => [[1, 1], [2.4, 0.4]].forEach(([m, a]) =>
          this.osc(ctx, 'sine', f * m, t + d, t + d + 1.2, this.env(ctx, t + d, 0.08 * a * v, 0.001, 1.1, sal))));
        break;
      case 'cohete': {
        const o = this.osc(ctx, 'sine', 900, t, t + 0.7, this.env(ctx, t, 0.08 * v, 0.05, 0.1, sal, 0.5));
        o.frequency.exponentialRampToValueAtTime(3200, t + 0.65);
        const boom = t + 0.72;
        this.ruido(ctx, boom, 0.6).connect(this.filtro(ctx, 'lowpass', 500)).connect(this.env(ctx, boom, 0.6 * v, 0.003, 0.55, sal));
        const b = this.osc(ctx, 'sine', 90, boom, boom + 0.4, this.env(ctx, boom, 0.4 * v, 0.003, 0.35, sal));
        b.frequency.exponentialRampToValueAtTime(40, boom + 0.35);
        for (let i = 0; i < 16; i++) {
          const ti = boom + 0.15 + Math.random() * 0.8;
          this.ruido(ctx, ti, 0.02).connect(this.filtro(ctx, 'highpass', 3000)).connect(this.env(ctx, ti, 0.15 * v, 0.001, 0.015, sal));
        }
        break;
      }
      case 'destellos':
        for (let i = 0; i < 6; i++) {
          const ti = t + i * 0.05;
          this.osc(ctx, 'sine', 2093 * Math.pow(2, [0, 4, 7, 12, 16, 19][i] / 12), ti, ti + 0.4, this.env(ctx, ti, 0.04 * v, 0.002, 0.35, sal));
        }
        break;
      case 'latido':
        [0, 0.22].forEach((d, i) => {
          const ti = t + d;
          const o = this.osc(ctx, 'sine', 95, ti, ti + 0.2, this.env(ctx, ti, (i ? 0.35 : 0.5) * v, 0.008, 0.17, this.salida!));
          o.frequency.exponentialRampToValueAtTime(45, ti + 0.15);
        });
        break;
      case 'redoble':
        for (let i = 0; i < 12; i++) {
          const ti = t + i * 0.04;
          this.ruido(ctx, ti, 0.05).connect(this.filtro(ctx, 'bandpass', 1800, 1.2)).connect(this.env(ctx, ti, (0.08 + i * 0.015) * v, 0.002, 0.045, sal));
        }
        break;
      case 'platillo':
        this.ruido(ctx, t, 0.8).connect(this.filtro(ctx, 'highpass', 5000)).connect(this.env(ctx, t, 0.3 * v, 0.003, 0.8, sal));
        break;
      case 'soplo': {
        const bp = this.filtro(ctx, 'bandpass', 2500, 2);
        bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(400, t + 0.3);
        this.ruido(ctx, t, 0.35).connect(bp).connect(this.env(ctx, t, 0.25 * v, 0.05, 0.28, sal));
        break;
      }
      case 'viento': {
        const bp = this.filtro(ctx, 'bandpass', 500, 4);
        bp.frequency.setValueAtTime(350, t); bp.frequency.linearRampToValueAtTime(900, t + 0.7); bp.frequency.linearRampToValueAtTime(300, t + 1.4);
        const src = ctx.createBufferSource(); src.buffer = this.ruidoBuf; src.start(t, 0, 1.5);
        src.connect(bp).connect(this.env(ctx, t, 0.3 * v, 0.4, 0.7, sal, 0.3));
        break;
      }
      case 'aullido': {
        const o = this.osc(ctx, 'sine', 320, t, t + 1.6, this.env(ctx, t, 0.12 * v, 0.25, 0.6, sal, 0.7));
        o.frequency.linearRampToValueAtTime(620, t + 0.5); o.frequency.linearRampToValueAtTime(560, t + 1.0); o.frequency.linearRampToValueAtTime(380, t + 1.55);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.5; lg.gain.value = 9;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.7);
        break;
      }
      case 'risa':
        // "¡Je je je je!" de bruja: pulsos agudos que bajan.
        for (let i = 0; i < 6; i++) {
          const ti = t + i * 0.12, f = 980 - i * 60;
          const bp = this.filtro(ctx, 'bandpass', 1400, 3);
          const o = this.osc(ctx, 'sawtooth', f, ti, ti + 0.1, bp);
          o.frequency.exponentialRampToValueAtTime(f * 0.8, ti + 0.09);
          bp.connect(this.env(ctx, ti, 0.18 * v, 0.01, 0.08, sal));
        }
        break;
      case 'murcielago':
        for (let i = 0; i < 4; i++) {
          const ti = t + i * 0.07;
          const o = this.osc(ctx, 'sine', 7000, ti, ti + 0.04, this.env(ctx, ti, 0.05 * v, 0.002, 0.035, sal));
          o.frequency.exponentialRampToValueAtTime(4200, ti + 0.035);
        }
        break;
      case 'puerta': {
        // Rechinido: diente de sierra muy grave que tiembla, por un filtro.
        const bp = this.filtro(ctx, 'bandpass', 1100, 6);
        const o = this.osc(ctx, 'sawtooth', 38, t, t + 0.75, bp);
        o.frequency.linearRampToValueAtTime(55, t + 0.25); o.frequency.linearRampToValueAtTime(30, t + 0.5); o.frequency.linearRampToValueAtTime(48, t + 0.72);
        bp.connect(this.env(ctx, t, 0.35 * v, 0.05, 0.3, sal, 0.4));
        break;
      }
      case 'portazo':
        this.ruido(ctx, t, 0.2).connect(this.filtro(ctx, 'lowpass', 300)).connect(this.env(ctx, t, 0.5 * v, 0.002, 0.18, sal));
        this.osc(ctx, 'sine', 70, t, t + 0.2, this.env(ctx, t, 0.3 * v, 0.002, 0.15, sal));
        break;
      case 'fantasma': {
        const o = this.osc(ctx, 'sine', 700, t, t + 1.1, this.env(ctx, t, 0.12 * v, 0.2, 0.6, sal, 0.2));
        o.frequency.exponentialRampToValueAtTime(260, t + 1.0);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 4; lg.gain.value = 12;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 1.2);
        break;
      }
      case 'trueno': {
        const src = ctx.createBufferSource(); src.buffer = this.ruidoBuf; src.start(t, 0, 2);
        const lp = this.filtro(ctx, 'lowpass', 900);
        lp.frequency.setValueAtTime(1200, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.8);
        src.connect(lp).connect(this.env(ctx, t, 0.7 * v, 0.01, 1.7, sal));
        break;
      }
      case 'pajaritos':
        [0, 0.12, 0.45, 0.56].forEach(d => {
          const ti = t + d;
          const o = this.osc(ctx, 'sine', 2600, ti, ti + 0.09, this.env(ctx, ti, 0.07 * v, 0.005, 0.07, sal));
          o.frequency.exponentialRampToValueAtTime(4200, ti + 0.04); o.frequency.exponentialRampToValueAtTime(3000, ti + 0.08);
        });
        break;
      case 'boing': {
        const o = this.osc(ctx, 'sine', 180, t, t + 0.4, this.env(ctx, t, 0.25 * v, 0.003, 0.35, sal));
        o.frequency.exponentialRampToValueAtTime(520, t + 0.12); o.frequency.exponentialRampToValueAtTime(300, t + 0.35);
        const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 18; lg.gain.value = 30;
        lfo.connect(lg).connect(o.frequency); lfo.start(t); lfo.stop(t + 0.45);
        break;
      }
      case 'rasgueo': {
        // Do – Sol – La menor – Fa, un rasgueo cada uno.
        const acordes = [[0, 4, 7, 12, 16], [-5, -1, 2, 7, 11], [-3, 0, 4, 9, 12], [-7, -3, 0, 5, 9]];
        acordes.forEach((ac, i) => ac.forEach((s, j) => this.nota(ctx, 'guitarra', 196 * Math.pow(2, s / 12), t + i * 0.45 + j * 0.025, 1.0, vol)));
        break;
      }
      case 'pito':
        // Pito de camión: dos notas graves a la vez, con un poco de "ronquido".
        [311, 392].forEach(f => {
          const lp = this.filtro(ctx, 'lowpass', 1600, 1.5);
          this.osc(ctx, 'sawtooth', f, t, t + 0.4, lp);
          lp.connect(this.env(ctx, t, 0.12 * v, 0.02, 0.08, sal, 0.28));
        });
        break;
      case 'martillo':
        [0, 0.14].forEach(d => {
          const ti = t + d;
          this.osc(ctx, 'sine', 1900 + Math.random() * 300, ti, ti + 0.25, this.env(ctx, ti, 0.09 * v, 0.001, 0.22, sal));
          this.ruido(ctx, ti, 0.04).connect(this.filtro(ctx, 'bandpass', 3000, 2)).connect(this.env(ctx, ti, 0.25 * v, 0.001, 0.035, sal));
        });
        break;
      case 'trombon':
        // "Wah wah wah waaah": el trombón triste.
        [[0, 0.3], [-1, 0.3], [-2, 0.3], [-3, 0.9]].forEach(([s, d], i) => {
          const ti = t + i * 0.32, f = 233 * Math.pow(2, s / 12);
          const lp = this.filtro(ctx, 'lowpass', 600, 4);
          lp.frequency.setValueAtTime(400, ti); lp.frequency.linearRampToValueAtTime(1400, ti + 0.1); lp.frequency.linearRampToValueAtTime(500, ti + d);
          const o = this.osc(ctx, 'sawtooth', f, ti, ti + d, lp);
          if (i === 3) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6; lg.gain.value = 4; lfo.connect(lg).connect(o.frequency); lfo.start(ti); lfo.stop(ti + d); }
          lp.connect(this.env(ctx, ti, 0.18 * v, 0.03, d * 0.7, sal, d * 0.2));
        });
        break;
    }
  }
}
