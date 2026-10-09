import { Injectable, inject, signal } from '@angular/core';
import { AccountService } from './account.service';

export type Tema = 'claro' | 'oscuro';
export type TamanoLetra = 'normal' | 'grande' | 'muy-grande';

/**
 * ThemeService — la APARIENCIA de la app: modo Claro/Oscuro y tamaño de letra.
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
 * Cómo se aplica: la clase "tema-claro" en el <body> (las variables de
 * color de theme-variables.css cambian con ella) y "letra-grande" /
 * "letra-muy-grande" en <html> (agranda toda la app, ver styles.css).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private account = inject(AccountService);
  private readonly CLAVE_VIEJA = 'rutograma_tema';          // antes: uno solo para todo el equipo
  private readonly PREFIJO = 'rutograma_apariencia:';         // + correo de la cuenta
  private readonly CLASE_TEMA_CLARO = 'tema-claro';
  private email = '';

  public temaActual: Tema = 'oscuro';
  public letra: TamanoLetra = 'normal';
  public readonly tamanos: Array<{ valor: TamanoLetra; nombre: string }> = [
    { valor: 'normal', nombre: 'Normal' },
    { valor: 'grande', nombre: 'Grande' },
    { valor: 'muy-grande', nombre: 'Muy grande' }
  ];

  /** Panel "Apariencia" (app.html) — se abre desde la barra, Mis viajes, Despachos o con la tecla A. */
  public panelAbierto = signal(false);

  constructor() {
    // Lo de la última cuenta que usó este equipo, mientras responde el servidor.
    this.email = this.leer('rutograma_admin_email');
    const local = this.desdeEquipo(this.email);
    this.temaActual = local?.tema ?? (this.leer(this.CLAVE_VIEJA) === 'claro' ? 'claro' : 'oscuro');
    this.letra = local?.letra ?? 'normal';
    this.aplicar();
    this.account.alCargarCuenta.subscribe(c => this.alCargarCuenta(c));
  }

  private leer(clave: string): string {
    try { return localStorage.getItem(clave) || ''; } catch { return ''; }
  }

  private desdeEquipo(email: string): { tema: Tema; letra: TamanoLetra } | null {
    if (!email) return null;
    try {
      const p = JSON.parse(this.leer(this.PREFIJO + email) || 'null');
      return p ? { tema: p.tema === 'claro' ? 'claro' : 'oscuro', letra: this.tamanos.some(t => t.valor === p.letra) ? p.letra : 'normal' } : null;
    } catch { return null; }
  }

  private recordarEnEquipo(): void {
    if (!this.email) return;
    try { localStorage.setItem(this.PREFIJO + this.email, JSON.stringify({ tema: this.temaActual, letra: this.letra })); } catch { /* sin espacio */ }
  }

  private alCargarCuenta(c: { email: string; preferencias: any; compartida: boolean } | null): void {
    if (!c) {
      // Sin sesión (login): la de siempre.
      this.email = '';
      this.temaActual = 'oscuro';
      this.letra = 'normal';
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
      this.temaActual = local?.tema ?? (c.compartida ? 'oscuro' : viejo);
      this.letra = local?.letra ?? 'normal';
      if (!c.compartida && (this.temaActual !== 'oscuro' || this.letra !== 'normal')) this.account.guardarPreferencias({ tema: this.temaActual, letra: this.letra });
    } else {
      this.temaActual = c.preferencias.tema === 'claro' ? 'claro' : 'oscuro';
      this.letra = this.tamanos.some(t => t.valor === c.preferencias.letra) ? c.preferencias.letra : 'normal';
    }
    this.recordarEnEquipo();
    this.aplicar();
  }

  private aplicar(): void {
    if (typeof document === 'undefined') return; // por si corre fuera del navegador (SSR)
    document.body.classList.toggle(this.CLASE_TEMA_CLARO, this.temaActual === 'claro');
    const html = document.documentElement;
    html.classList.toggle('letra-grande', this.letra === 'grande');
    html.classList.toggle('letra-muy-grande', this.letra === 'muy-grande');
    // Color de la barra del celular cuando está instalada como aplicación.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.temaActual === 'claro' ? '#f8fafc' : '#0f172a');
  }

  private cambiar(): void {
    this.aplicar();
    this.recordarEnEquipo();
    this.account.guardarPreferencias({ tema: this.temaActual, letra: this.letra });
  }

  public alternarTema(): void {
    this.ponerTema(this.temaActual === 'claro' ? 'oscuro' : 'claro');
  }

  public ponerTema(tema: Tema): void {
    if (tema === this.temaActual) return;
    this.temaActual = tema;
    this.cambiar();
  }

  public ponerLetra(letra: TamanoLetra): void {
    if (letra === this.letra) return;
    this.letra = letra;
    this.cambiar();
  }

  /** Un paso más grande o más pequeño (atajos + y -). */
  public cambiarLetra(paso: 1 | -1): void {
    const i = this.tamanos.findIndex(t => t.valor === this.letra);
    const nuevo = this.tamanos[Math.max(0, Math.min(this.tamanos.length - 1, i + paso))];
    this.ponerLetra(nuevo.valor);
  }
}
