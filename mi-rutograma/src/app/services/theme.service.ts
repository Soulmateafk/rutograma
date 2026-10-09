import { Injectable, inject, signal } from '@angular/core';
import { AccountService } from './account.service';

export type Tema = 'claro' | 'oscuro';
export type PreferenciaTema = Tema | 'auto';
export type TamanoLetra = 'pequena' | 'normal' | 'grande' | 'muy-grande';
export type Acento = 'azul' | 'indigo' | 'morado' | 'rosa' | 'rojo' | 'naranja' | 'ambar' | 'lima' | 'verde' | 'turquesa' | 'cian' | 'grafito';

export interface Apariencia {
  tema: PreferenciaTema;
  letra: TamanoLetra;
  acento: Acento;
  contraste: boolean;
  sinAnimaciones: boolean;
}

const POR_DEFECTO: Apariencia = { tema: 'oscuro', letra: 'normal', acento: 'azul', contraste: false, sinAnimaciones: false };

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
  private readonly CLAVE_VIEJA = 'rutograma_tema';          // antes: uno solo para todo el equipo
  private readonly PREFIJO = 'rutograma_apariencia:';         // + correo de la cuenta
  private email = '';
  private sistemaOscuro = typeof window !== 'undefined' && !!window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  public ap: Apariencia = { ...POR_DEFECTO };

  public readonly temas: Array<{ valor: PreferenciaTema; nombre: string; icono: string }> = [
    { valor: 'oscuro', nombre: 'Oscuro', icono: 'bi-moon-stars-fill' },
    { valor: 'claro', nombre: 'Claro', icono: 'bi-sun-fill' },
    { valor: 'auto', nombre: 'Automático', icono: 'bi-circle-half' }
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
  }

  /** Modo que se ve ahora (con "Automático" depende del equipo). */
  public get temaActual(): Tema {
    if (this.ap.tema === 'auto') return this.sistemaOscuro && !this.sistemaOscuro.matches ? 'claro' : 'oscuro';
    return this.ap.tema;
  }
  public get letra(): TamanoLetra { return this.ap.letra; }

  /** ¿Es distinta de como viene la app? (para mostrar "Restablecer") */
  public get personalizada(): boolean {
    return (Object.keys(POR_DEFECTO) as Array<keyof Apariencia>).some(k => this.ap[k] !== POR_DEFECTO[k]);
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
      acento: this.acentos.some(t => t.valor === p.acento) ? p.acento : POR_DEFECTO.acento,
      contraste: p.contraste === true,
      sinAnimaciones: p.sinAnimaciones === true
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
      // Sin sesión (login): la de siempre.
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
  public restablecer(): void { this.cambiar({ ...POR_DEFECTO }); }

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
