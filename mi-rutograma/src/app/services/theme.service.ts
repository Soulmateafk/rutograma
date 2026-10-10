import { Injectable, inject, signal } from '@angular/core';
import { AccountService } from './account.service';
import { HEX, paraTextoBlanco, variantesAcento } from './colores';
import { temporadaVisible } from './temporadas';
import { SonidoService } from './sonido.service';


export type Tema = 'claro' | 'oscuro';
export type PreferenciaTema = Tema | 'auto' | 'horario';
export type TamanoLetra = 'pequena' | 'normal' | 'grande' | 'muy-grande';
export type Acento = 'azul' | 'indigo' | 'morado' | 'rosa' | 'rojo' | 'naranja' | 'ambar' | 'lima' | 'verde' | 'turquesa' | 'cian' | 'grafito' | 'propio';
export type Esquinas = 'normal' | 'muy' | 'rectas';
export type Transportadora = 'makand' | 'arsitrans' | 'polar';
export type Efecto = 'onda' | 'progreso' | 'cascada' | 'mes' | 'vivo' | 'temblor' | 'destello' | 'brillo' | 'previa' | 'confeti';
export type Fondo = 'ninguno' | 'aurora' | 'montanas' | 'carretera' | 'ciudad' | 'camiones' | 'puntos' | 'olas' | 'atardecer' | 'foto';
export type Fuente = 'sistema' | 'redonda' | 'lectura' | 'facil' | 'clasica';
export type Densidad = 'normal' | 'compacta' | 'comoda';
export type Barra = 'arriba' | 'lado' | 'flotante';

export interface Apariencia {
  tema: PreferenciaTema;
  letra: TamanoLetra;
  acento: Acento;
  contraste: boolean;
  sinAnimaciones: boolean;
  colorPropio: string;                              // '#rrggbb' de la rueda de colores ('' = ninguno)
  fondoTinte: boolean;                              // fondo con un toque del color principal
  coloresTr: Record<Transportadora, string>;        // tarjetas del Rutograma ('' = el de siempre)
  daltonismo: boolean;                              // estados con colores que se distinguen sin rojo/verde
  esquinas: Esquinas;
  saludo: boolean;                                  // "Buenos días, Ana" al entrar
  efectos: Record<Efecto, boolean>;                 // cada efecto se puede quitar por separado
  temporada: string;                                // 'auto' (según la fecha), 'no' o una temporada para verla
  fondo: Fondo;                                     // dibujo de fondo ('foto' = una foto propia, guardada solo en este equipo)
  fuente: Fuente;                                   // tipo de letra
  densidad: Densidad;                               // más filas en pantalla (compacta) o más aire (cómoda)
  barra: Barra;                                     // menú arriba, a un lado o flotante
  inicio: string;                                   // pantalla al entrar ('' = la de siempre)
  avatar: string;                                   // emoji de la cuenta
  foto: string;                                     // foto de perfil pequeña (data:image/jpeg)
  fijados: string[];                                // placas fijadas arriba en el Rutograma
  tablero: { orden: string[]; ocultos: string[] };  // cuadros del Dashboard
  sonidos: boolean;
  volumen: number;                                  // 0-100
  sonidoTemporada: boolean;                         // instrumentos de la festividad (si no, el sonido de siempre)
}

const POR_DEFECTO: Apariencia = {
  tema: 'oscuro', letra: 'normal', acento: 'azul', contraste: false, sinAnimaciones: false,
  colorPropio: '', fondoTinte: false, coloresTr: { makand: '', arsitrans: '', polar: '' }, daltonismo: false, esquinas: 'normal', saludo: true,
  efectos: { onda: true, progreso: true, cascada: true, mes: true, vivo: true, temblor: true, destello: true, brillo: true, previa: true, confeti: true }, temporada: 'auto',
  fondo: 'ninguno', fuente: 'sistema', densidad: 'normal', barra: 'arriba', inicio: '', avatar: '', foto: '', fijados: [],
  tablero: { orden: [], ocultos: [] }, sonidos: true, volumen: 50, sonidoTemporada: true
};
export const FONDOS: Array<{ valor: Fondo; nombre: string }> = [
  { valor: 'ninguno', nombre: 'Ninguno' }, { valor: 'aurora', nombre: 'Aurora' }, { valor: 'atardecer', nombre: 'Atardecer' },
  { valor: 'montanas', nombre: 'Montañas' }, { valor: 'carretera', nombre: 'Carretera de noche' }, { valor: 'ciudad', nombre: 'Ciudad' },
  { valor: 'camiones', nombre: 'Camioncitos' }, { valor: 'puntos', nombre: 'Puntos' }, { valor: 'olas', nombre: 'Olas' }, { valor: 'foto', nombre: 'Mi foto' }
];
export const FUENTES: Array<{ valor: Fuente; nombre: string; familia: string; ayuda: string }> = [
  { valor: 'sistema', nombre: 'Moderna', familia: "'Segoe UI', system-ui, sans-serif", ayuda: 'La de siempre' },
  { valor: 'redonda', nombre: 'Redondita', familia: "'Nunito', sans-serif", ayuda: 'Suave y amigable' },
  { valor: 'lectura', nombre: 'Muy clara', familia: "'Atkinson Hyperlegible', sans-serif", ayuda: 'Cada letra se distingue (0 y O, 1 e I)' },
  { valor: 'facil', nombre: 'Fácil de leer', familia: "'Lexend', sans-serif", ayuda: 'Más espacio entre letras; ayuda con la dislexia' },
  { valor: 'clasica', nombre: 'Clásica', familia: "Georgia, 'Times New Roman', serif", ayuda: 'Con remates, como un libro' }
];
export const AVATARES = ['🚚', '🚛', '🛻', '🚐', '🧑‍✈️', '👩‍💼', '👨‍💼', '🦁', '🐯', '🦊', '🐼', '🐨', '🦉', '🐬', '🌻', '🌵', '⚽', '🎸', '☕', '⭐', '🔥', '💎', '🌈', '🍀'];
export const INICIOS: Array<{ valor: string; nombre: string }> = [
  { valor: '', nombre: 'La de siempre' }, { valor: '/dashboard', nombre: 'Dashboard' }, { valor: '/rutograma', nombre: 'Rutograma' },
  { valor: '/vehiculos', nombre: 'Vehículos' }, { valor: '/rutas', nombre: 'Rutas' }, { valor: '/conductores', nombre: 'Conductores' },
  { valor: '/despachos', nombre: 'Despachos' }, { valor: '/aprobaciones', nombre: 'Aprobaciones' }, { valor: '/mapa', nombre: 'Mapa' }, { valor: '/historico', nombre: 'Histórico' }
];
export const EFECTOS: Array<{ clave: Efecto; nombre: string; ayuda: string }> = [
  { clave: 'onda', nombre: 'Onda al tocar', ayuda: 'Una onda sale desde donde tocas un botón.' },
  { clave: 'progreso', nombre: 'Barra de progreso', ayuda: 'Una línea arriba avanza mientras carga una pantalla o se guarda algo.' },
  { clave: 'cascada', nombre: 'Filas en cascada', ayuda: 'Al entrar a una pantalla, las filas aparecen una tras otra.' },
  { clave: 'mes', nombre: 'Deslizar al cambiar de mes', ayuda: 'En el Rutograma, la tabla se desliza hacia el mes que escoges.' },
  { clave: 'vivo', nombre: 'Resaltar cambios en vivo', ayuda: 'Si otra persona cambia un viaje mientras lo ves, su tarjeta brilla un momento.' },
  { clave: 'temblor', nombre: 'Avisar si falta algo', ayuda: 'Si al guardar falta un dato, la ventana se sacude y marca lo que falta.' },
  { clave: 'destello', nombre: 'Destello al buscar', ayuda: 'Al ir a un viaje desde el buscador, la pantalla baja hasta él y destella.' },
  { clave: 'brillo', nombre: 'Detalles que brillan', ayuda: 'El logo brilla de vez en cuando, las tarjetas se levantan al pasar el mouse y otros toques.' },
  { clave: 'previa', nombre: 'Vista previa de viajes', ayuda: 'En el Rutograma, al dejar el mouse sobre un viaje sale su detalle sin abrirlo.' },
  { clave: 'confeti', nombre: 'Celebrar el mes completo', ayuda: 'Cuando todos los viajes del mes quedan entregados, cae confeti.' }
];
/** Colores de siempre de las tarjetas de cada transportadora (rutograma.css). */
export const COLORES_TR: Record<Transportadora, string> = { makand: '#1e3a8a', arsitrans: '#064e3b', polar: '#0c4a6e' };

/**
 * ThemeService — la APARIENCIA de la app: modo (oscuro, claro o automático),
 * tamaño de letra, color principal, alto contraste y menos animaciones.
 *
 * Es de cada CUENTA, no del equipo: si "Asistente Makand" pone modo claro,
 * solo lo ve ella (en cualquier equipo donde entre); las demás cuentas
 * siguen como las tengan. Se guarda en el servidor, en la cuenta
 * (POST /api/auth/preferencias). Las cuentas compartidas (conductores,
 * despachos) las usa mucha gente: ahí cada equipo recuerda la suya.
 *
 * En este equipo también queda una copia por cuenta, para ponerla apenas
 * abre la app (sin esperar al servidor y sin parpadeo del tema equivocado).
 *
 * Cómo se aplica (estilos en styles.css):
 *  - "tema-claro" en el <body> (las variables de color cambian con ella).
 *  - "letra-pequena" / "letra-grande" / "letra-muy-grande" en <html> (agranda o achica toda la app).
 *  - data-acento="verde"... en <html> (botones principales, pestaña activa).
 *  - "alto-contraste" en el <body> y "sin-animaciones" en <html>.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private account = inject(AccountService);
  private sonido = inject(SonidoService);
  private readonly CLAVE_VIEJA = 'rutograma_tema';          // antes: uno solo para todo el equipo
  private readonly PREFIJO = 'rutograma_apariencia:';         // + correo de la cuenta
  private email = '';
  private sistemaOscuro = typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  public ap: Apariencia = { ...POR_DEFECTO };

  public readonly temas: Array<{ valor: PreferenciaTema; nombre: string; icono: string }> = [
    { valor: 'oscuro', nombre: 'Oscuro', icono: 'bi-moon-stars-fill' },
    { valor: 'claro', nombre: 'Claro', icono: 'bi-sun-fill' },
    { valor: 'auto', nombre: 'Como el equipo', icono: 'bi-circle-half' },
    { valor: 'horario', nombre: 'Por hora', icono: 'bi-clock-history' }
  ];
  public readonly densidades: Array<{ valor: Densidad; nombre: string; icono: string }> = [
    { valor: 'compacta', nombre: 'Compacta', icono: 'bi-distribute-vertical' },
    { valor: 'normal', nombre: 'Normal', icono: 'bi-list' },
    { valor: 'comoda', nombre: 'Cómoda', icono: 'bi-arrows-expand' }
  ];
  public readonly barras: Array<{ valor: Barra; nombre: string; icono: string }> = [
    { valor: 'arriba', nombre: 'Arriba', icono: 'bi-window' },
    { valor: 'lado', nombre: 'A un lado', icono: 'bi-layout-sidebar' },
    { valor: 'flotante', nombre: 'Flotante', icono: 'bi-window-stack' }
  ];
  public readonly tamanos: Array<{ valor: TamanoLetra; nombre: string; px: number }> = [
    { valor: 'pequena', nombre: 'Pequeña', px: 11 },
    { valor: 'normal', nombre: 'Normal', px: 13 },
    { valor: 'grande', nombre: 'Grande', px: 16 },
    { valor: 'muy-grande', nombre: 'Muy grande', px: 19 }
  ];
  public readonly acentos: Array<{ valor: Acento; nombre: string; color: string }> = [
    { valor: 'azul', nombre: 'Azul', color: '#2563eb' },
    { valor: 'indigo', nombre: 'Índigo', color: '#4f46e5' },
    { valor: 'morado', nombre: 'Morado', color: '#7c3aed' },
    { valor: 'rosa', nombre: 'Rosa', color: '#db2777' },
    { valor: 'rojo', nombre: 'Rojo', color: '#dc2626' },
    { valor: 'naranja', nombre: 'Naranja', color: '#ea580c' },
    { valor: 'ambar', nombre: 'Ámbar', color: '#d97706' },
    { valor: 'lima', nombre: 'Lima', color: '#65a30d' },
    { valor: 'verde', nombre: 'Verde', color: '#16a34a' },
    { valor: 'turquesa', nombre: 'Turquesa', color: '#0d9488' },
    { valor: 'cian', nombre: 'Cian', color: '#0891b2' },
    { valor: 'grafito', nombre: 'Grafito', color: '#475569' }
  ];

  public readonly esquinasOpciones: Array<{ valor: Esquinas; nombre: string }> = [
    { valor: 'rectas', nombre: 'Rectas' },
    { valor: 'normal', nombre: 'Redondeadas' },
    { valor: 'muy', nombre: 'Muy redondeadas' }
  ];

  /** Saludo al entrar ("Buenos días, Ana ☀️"): lo muestra components/apariencia. */
  public saludo = signal<{ texto: string; icono: string; extra?: string } | null>(null);

  private saludar(compartida: boolean): void {
    if (!this.ap.saludo || !this.email) return;
    const clave = 'rutograma_saludo:' + this.email;
    try { if (sessionStorage.getItem(clave)) return; sessionStorage.setItem(clave, '1'); } catch { /* sin almacenamiento: saluda igual */ }
    const h = new Date().getHours();
    const [frase, icono] = h >= 5 && h < 12 ? ['Buenos días', '☀️'] : h >= 12 && h < 19 ? ['Buenas tardes', '🌤️'] : ['Buenas noches', '🌙'];
    const nombre = compartida ? '' : String(this.account.nombre || '').trim().split(/\s+/)[0];
    const t = temporadaVisible(this.ap.temporada);
    setTimeout(() => this.sonido.tocar('entrar'), 250);
    this.saludo.set({ texto: nombre ? `${frase}, ${nombre}` : `¡${frase}!`, icono: t ? t.emoji : icono, extra: t ? t.saludo : '' });
    setTimeout(() => this.saludo.set(null), 3600);
  }

  /** Panel "Apariencia" (app.html) — se abre desde la barra, Mis viajes, Despachos o con la tecla A. */
  public panelAbierto = signal(false);

  constructor() {
    // Lo de la última cuenta que usó este equipo, mientras responde el servidor.
    this.email = this.leer('rutograma_admin_email');
    this.ap = this.desdeEquipo(this.email) ?? { ...POR_DEFECTO, tema: this.leer(this.CLAVE_VIEJA) === 'claro' ? 'claro' : 'oscuro' };
    this.aplicar();
    this.account.alCargarCuenta.subscribe(c => this.alCargarCuenta(c));
    // Automático: si el equipo cambia de claro a oscuro (o al revés), la app lo sigue.
    this.sistemaOscuro?.addEventListener?.('change', () => { if (this.ap.tema === 'auto') this.aplicar(); });
    // Por hora: claro de 6 a. m. a 6 p. m., oscuro el resto (se revisa cada minuto).
    if (typeof window !== 'undefined') setInterval(() => {
      if (this.ap.tema === 'horario' && (this.temaActual === 'claro') !== document.body.classList.contains('tema-claro')) this.aplicar();
    }, 60000);
  }

  /** Modo que se ve ahora (con "Automático" depende del equipo). */
  public get temaActual(): Tema {
    if (this.ap.tema === 'auto') return this.sistemaOscuro && !this.sistemaOscuro.matches ? 'claro' : 'oscuro';
    if (this.ap.tema === 'horario') { const h = new Date().getHours(); return h >= 6 && h < 18 ? 'claro' : 'oscuro'; }
    return this.ap.tema;
  }
  public get letra(): TamanoLetra { return this.ap.letra; }

  /** ¿Es distinta de como viene la app? (para mostrar "Restablecer") */
  public get personalizada(): boolean {
    const estilo = (a: Apariencia) => { const { avatar, foto, fijados, tablero, inicio, ...resto } = this.limpiar(a); return JSON.stringify(resto); };
    return estilo(this.ap) !== estilo(POR_DEFECTO);
  }

  private leer(clave: string): string {
    try { return localStorage.getItem(clave) || ''; } catch { return ''; }
  }

  /** Lo que venga (servidor, equipo) pasado por la lista de valores válidos. */
  private limpiar(p: any): Apariencia {
    p = p || {};
    return {
      tema: this.temas.some(t => t.valor === p.tema) ? p.tema : POR_DEFECTO.tema,
      letra: this.tamanos.some(t => t.valor === p.letra) ? p.letra : POR_DEFECTO.letra,
      acento: this.acentos.some(t => t.valor === p.acento) || (p.acento === 'propio' && HEX.test(p.colorPropio || '')) ? p.acento : POR_DEFECTO.acento,
      contraste: p.contraste === true,
      sinAnimaciones: p.sinAnimaciones === true,
      colorPropio: HEX.test(p.colorPropio || '') ? String(p.colorPropio).toLowerCase() : '',
      fondoTinte: p.fondoTinte === true,
      coloresTr: {
        makand: HEX.test(p.coloresTr?.makand || '') ? p.coloresTr.makand.toLowerCase() : '',
        arsitrans: HEX.test(p.coloresTr?.arsitrans || '') ? p.coloresTr.arsitrans.toLowerCase() : '',
        polar: HEX.test(p.coloresTr?.polar || '') ? p.coloresTr.polar.toLowerCase() : ''
      },
      daltonismo: p.daltonismo === true,
      esquinas: ['normal', 'muy', 'rectas'].includes(p.esquinas) ? p.esquinas : 'normal',
      saludo: p.saludo !== false,
      efectos: Object.fromEntries(EFECTOS.map(e => [e.clave, p.efectos?.[e.clave] !== false])) as Record<Efecto, boolean>,
      temporada: typeof p.temporada === 'string' && /^[a-z-]{1,20}$/.test(p.temporada) ? p.temporada : 'auto',
      fondo: FONDOS.some(f => f.valor === p.fondo) ? p.fondo : 'ninguno',
      fuente: FUENTES.some(f => f.valor === p.fuente) ? p.fuente : 'sistema',
      densidad: ['normal', 'compacta', 'comoda'].includes(p.densidad) ? p.densidad : 'normal',
      barra: ['arriba', 'lado', 'flotante'].includes(p.barra) ? p.barra : 'arriba',
      inicio: INICIOS.some(i => i.valor === p.inicio) ? p.inicio : '',
      avatar: typeof p.avatar === 'string' && p.avatar.length <= 8 ? p.avatar : '',
      foto: typeof p.foto === 'string' && p.foto.length <= 24000 && /^data:image\/(jpeg|png|webp);base64,/.test(p.foto) ? p.foto : '',
      fijados: Array.isArray(p.fijados) ? [...new Set<string>(p.fijados.filter((x: any) => typeof x === 'string' && /^[A-Z0-9 -]{1,12}$/i.test(x)).map((x: string) => x.toUpperCase()))].slice(0, 40) : [],
      tablero: {
        orden: Array.isArray(p.tablero?.orden) ? p.tablero.orden.filter((x: any) => typeof x === 'string').slice(0, 30) : [],
        ocultos: Array.isArray(p.tablero?.ocultos) ? p.tablero.ocultos.filter((x: any) => typeof x === 'string').slice(0, 30) : []
      },
      sonidos: p.sonidos !== false,
      volumen: Number.isFinite(p.volumen) ? Math.max(0, Math.min(100, Math.round(p.volumen))) : 50,
      sonidoTemporada: p.sonidoTemporada !== false
    };
  }

  private desdeEquipo(email: string): Apariencia | null {
    if (!email) return null;
    try {
      const p = JSON.parse(this.leer(this.PREFIJO + email) || 'null');
      return p ? this.limpiar(p) : null;
    } catch { return null; }
  }

  private recordarEnEquipo(): void {
    if (!this.email) return;
    try { localStorage.setItem(this.PREFIJO + this.email, JSON.stringify(this.ap)); } catch { /* sin espacio */ }
  }

  private alCargarCuenta(c: { email: string; preferencias: any; compartida: boolean } | null): void {
    if (!c) {
      // Sin sesión (login): la de siempre. Al volver a entrar, saluda otra vez.
      try { if (this.email) sessionStorage.removeItem('rutograma_saludo:' + this.email); } catch { /* nada */ }
      this.email = '';
      this.ap = { ...POR_DEFECTO };
      this.aplicar();
      return;
    }
    this.email = c.email;
    const local = this.desdeEquipo(c.email);
    if (c.compartida || !c.preferencias) {
      // Compartida: la de este equipo. Cuenta propia que nunca la cambió: se
      // queda con lo que tenía en este equipo (o el tema viejo de todo el
      // equipo) y se guarda en la cuenta, para que la siga en otros equipos.
      const viejo: Tema = this.leer(this.CLAVE_VIEJA) === 'claro' ? 'claro' : 'oscuro';
      this.ap = local ?? { ...POR_DEFECTO, tema: c.compartida ? 'oscuro' : viejo };
      if (!c.compartida && this.personalizada) this.account.guardarPreferencias(this.ap);
    } else {
      this.ap = this.limpiar(c.preferencias);
    }
    this.recordarEnEquipo();
    this.aplicar();
    this.saludar(c.compartida);
  }

  private aplicar(): void {
    if (typeof document === 'undefined') return; // por si corre fuera del navegador (SSR)
    const body = document.body, html = document.documentElement;
    // Todo cambia de una vez: sin animaciones durante el cambio (se quitan
    // apenas el navegador lo pinta).
    html.classList.add('cambiando-apariencia');
    requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove('cambiando-apariencia')));
    body.classList.toggle('tema-claro', this.temaActual === 'claro');
    body.classList.toggle('alto-contraste', this.ap.contraste);
    html.classList.toggle('sin-animaciones', this.ap.sinAnimaciones);
    for (const t of this.tamanos) html.classList.toggle('letra-' + t.valor, t.valor !== 'normal' && this.ap.letra === t.valor);
    if (this.ap.acento === 'azul') html.removeAttribute('data-acento');
    else html.setAttribute('data-acento', this.ap.acento);
    // Color propio: sus tonos van en variables que usa styles.css.
    if (this.ap.acento === 'propio' && this.ap.colorPropio) {
      const v = variantesAcento(this.ap.colorPropio);
      html.style.setProperty('--p-acento', v.base);
      html.style.setProperty('--p-boton', v.boton);
      html.style.setProperty('--p-claro', v.claro);
      html.style.setProperty('--p-fondo', v.fondo);
    }
    html.classList.toggle('fondo-tinte', this.ap.fondoTinte);
    html.classList.toggle('daltonismo', this.ap.daltonismo);
    html.classList.toggle('esquinas-muy', this.ap.esquinas === 'muy');
    html.classList.toggle('esquinas-rectas', this.ap.esquinas === 'rectas');
    // Transportadoras: siempre con texto blanco legible encima.
    for (const tr of Object.keys(COLORES_TR) as Transportadora[]) {
      const c = this.ap.coloresTr[tr];
      if (c) html.style.setProperty('--tr-' + tr, paraTextoBlanco(c));
      else html.style.removeProperty('--tr-' + tr);
    }
    html.classList.toggle('tr-propios', Object.values(this.ap.coloresTr).some(Boolean));
    // Efectos que la cuenta quitó: html.sin-onda, html.sin-progreso...
    for (const e of EFECTOS) html.classList.toggle('sin-' + e.clave, !this.ap.efectos[e.clave]);
    this.temporadaPreferida.set(this.ap.temporada);
    // Fondo, letra, densidad y barra.
    for (const f of FONDOS) html.classList.toggle('fondo-' + f.valor, f.valor !== 'ninguno' && this.ap.fondo === f.valor);
    const fotoFondo = this.ap.fondo === 'foto' ? this.fotoFondo() : '';
    if (fotoFondo) html.style.setProperty('--fondo-foto', `url("${fotoFondo}")`); else html.style.removeProperty('--fondo-foto');
    html.classList.toggle('con-fondo', this.ap.fondo !== 'ninguno' && (this.ap.fondo !== 'foto' || !!fotoFondo));
    const fuente = FUENTES.find(f => f.valor === this.ap.fuente);
    if (fuente && fuente.valor !== 'sistema') html.style.setProperty('--fuente-app', fuente.familia); else html.style.removeProperty('--fuente-app');
    html.classList.toggle('fuente-propia', this.ap.fuente !== 'sistema');
    html.classList.toggle('densidad-compacta', this.ap.densidad === 'compacta');
    html.classList.toggle('densidad-comoda', this.ap.densidad === 'comoda');
    html.classList.toggle('barra-lado', this.ap.barra === 'lado');
    html.classList.toggle('barra-flotante', this.ap.barra === 'flotante');
    this.barra.set(this.ap.barra);
    this.sonido.configurar(this.ap.sonidos, this.ap.volumen, this.ap.sonidoTemporada);
    this.cambio.update(n => n + 1);
    // Color de la barra del celular cuando está instalada como aplicación.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.temaActual === 'claro' ? '#f8fafc' : '#0f172a');
  }

  private cambiar(parcial: Partial<Apariencia>): void {
    this.ap = this.limpiar({ ...this.ap, ...parcial });
    this.aplicar();
    this.recordarEnEquipo();
    this.account.guardarPreferencias(this.ap);
  }

  public ponerTema(tema: PreferenciaTema): void { if (tema !== this.ap.tema) this.cambiar({ tema }); }
  public ponerLetra(letra: TamanoLetra): void { if (letra !== this.ap.letra) this.cambiar({ letra }); }
  public ponerAcento(acento: Acento): void { if (acento !== this.ap.acento) this.cambiar({ acento }); }
  public alternarContraste(): void { this.cambiar({ contraste: !this.ap.contraste }); }
  public alternarAnimaciones(): void { this.cambiar({ sinAnimaciones: !this.ap.sinAnimaciones }); }
  public restablecer(): void {
    // La foto, el avatar, lo fijado y el Dashboard son de la persona, no del estilo: se quedan.
    const { avatar, foto, fijados, tablero, inicio } = this.ap;
    this.cambiar({ ...POR_DEFECTO, coloresTr: { ...POR_DEFECTO.coloresTr }, efectos: { ...POR_DEFECTO.efectos }, avatar, foto, fijados, tablero, inicio });
  }
  public alternarTinte(): void { this.cambiar({ fondoTinte: !this.ap.fondoTinte }); }
  public alternarDaltonismo(): void { this.cambiar({ daltonismo: !this.ap.daltonismo }); }
  public alternarSaludo(): void { this.cambiar({ saludo: !this.ap.saludo }); }
  public alternarEfecto(e: Efecto): void { this.cambiar({ efectos: { ...this.ap.efectos, [e]: !this.ap.efectos[e] } }); }
  public ponerTemporada(t: string): void { if (t !== this.ap.temporada) this.cambiar({ temporada: t }); }
  /** Señal para la decoración de temporada (components/temporada). */
  public temporadaPreferida = signal('auto');
  /** ¿La cuenta tiene este efecto puesto (y no quitó todas las animaciones)? */
  public efectoActivo(e: Efecto): boolean { return !!this.ap.efectos[e] && !this.ap.sinAnimaciones; }
  public ponerEsquinas(esquinas: Esquinas): void { if (esquinas !== this.ap.esquinas) this.cambiar({ esquinas }); }

  /** Color de la rueda. Mientras se arrastra se ve sin guardar; al soltar se guarda. */
  public ponerColorPropio(hex: string, guardar = true): void {
    if (!HEX.test(hex)) return;
    const nuevo = this.limpiar({ ...this.ap, acento: 'propio', colorPropio: hex });
    if (guardar) { this.cambiar(nuevo); return; }
    this.ap = nuevo;
    this.aplicar();
  }

  /** Color de las tarjetas de una transportadora ('' = el de siempre). */
  public ponerColorTr(tr: Transportadora, hex: string): void {
    this.cambiar({ coloresTr: { ...this.ap.coloresTr, [tr]: HEX.test(hex) ? hex : '' } });
  }

  /** Señales para quien necesite enterarse de un cambio (barra, Rutograma, Dashboard). */
  public barra = signal<Barra>('arriba');
  public cambio = signal(0);

  public ponerFondo(fondo: Fondo): void { if (fondo !== this.ap.fondo) this.cambiar({ fondo }); }
  public ponerFuente(fuente: Fuente): void { if (fuente !== this.ap.fuente) this.cambiar({ fuente }); }
  public ponerDensidad(densidad: Densidad): void { if (densidad !== this.ap.densidad) this.cambiar({ densidad }); }
  public ponerBarra(barra: Barra): void { if (barra !== this.ap.barra) this.cambiar({ barra }); }
  public ponerInicio(inicio: string): void { if (inicio !== this.ap.inicio) this.cambiar({ inicio }); }
  public ponerAvatar(avatar: string): void { this.cambiar({ avatar: avatar === this.ap.avatar ? '' : avatar }); }
  public ponerFoto(foto: string): void { this.cambiar({ foto }); }
  public alternarSonidos(): void { this.cambiar({ sonidos: !this.ap.sonidos }); if (this.ap.sonidos) this.sonido.tocar('ok'); }
  public ponerVolumen(volumen: number, guardar = true): void {
    if (guardar) { this.cambiar({ volumen }); return; }
    this.ap = this.limpiar({ ...this.ap, volumen });
    this.sonido.configurar(this.ap.sonidos, this.ap.volumen, this.ap.sonidoTemporada);
  }
  public alternarSonidoTemporada(): void { this.cambiar({ sonidoTemporada: !this.ap.sonidoTemporada }); this.sonido.tocar('aprobar'); }
  public estaFijado(placa: string): boolean { return this.ap.fijados.includes(String(placa || '').toUpperCase()); }
  public alternarFijado(placa: string): void {
    const p = String(placa || '').toUpperCase();
    this.cambiar({ fijados: this.estaFijado(p) ? this.ap.fijados.filter(x => x !== p) : [...this.ap.fijados, p] });
  }
  public ponerTablero(orden: string[], ocultos: string[]): void { this.cambiar({ tablero: { orden, ocultos } }); }

  /** Foto de fondo propia: pesa mucho para la cuenta, así que vive solo en este equipo. */
  public fotoFondo(): string {
    if (!this.email) return '';
    return this.leer('rutograma_fondo_foto:' + this.email);
  }
  public ponerFotoFondo(dataUrl: string): boolean {
    if (!this.email) return false;
    try { localStorage.setItem('rutograma_fondo_foto:' + this.email, dataUrl); } catch { return false; }
    this.ap.fondo === 'foto' ? this.aplicar() : this.cambiar({ fondo: 'foto' });
    return true;
  }

  /** Atajo T: pasa al contrario de lo que se ve ahora. */
  public alternarTema(): void {
    this.ponerTema(this.temaActual === 'claro' ? 'oscuro' : 'claro');
  }

  /** Un paso más grande o más pequeño (atajos + y -). */
  public cambiarLetra(paso: 1 | -1): void {
    const i = this.tamanos.findIndex(t => t.valor === this.ap.letra);
    this.ponerLetra(this.tamanos[Math.max(0, Math.min(this.tamanos.length - 1, i + paso))].valor);
  }
}
