import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';
import { GUIAS, Guia, PAGINAS_SIN_NAVBAR, PasoGuia, paginaDeUrl } from './guias';

export interface GuiaActiva {
  clave: string;
  guia: Guia;
  pasos: PasoGuia[];
  indice: number;
}

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

/**
 * GUÍAS DE PRIMERA VEZ — la primera vez que una cuenta entra a cada página
 * se oscurece la pantalla y se explica cada parte (ver guias.ts). Lo que
 * cada cuenta ya vio se guarda en el servidor, así no vuelve a salir ni en
 * este computador ni en otro. El botón "?" la repite cuando se quiera.
 */
@Injectable({ providedIn: 'root' })
export class GuiaService {
  private router = inject(Router);
  private auth = inject(AuthService);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Guía que se está mostrando (null = ninguna). */
  public activa = signal<GuiaActiva | null>(null);

  private vistas: Set<string> | null = null;
  private vistasDe = '';
  private cola: string[] = [];
  private paginaActual = '';
  private intento = 0; // cada navegación invalida las esperas anteriores

  constructor() {
    if (!this.esNavegador) return;
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.alNavegar(e.urlAfterRedirects || e.url));
    // Si el servicio nace después de la primera navegación (al recargar la
    // página), se revisa la página en la que ya se está.
    if (this.router.navigated) this.alNavegar(this.router.url);
  }

  /** ¿Se muestra el botón "?" en esta página? */
  public get hayGuiaEnPagina(): boolean {
    return !!GUIAS[this.paginaActual] && !!this.auth.currentUser;
  }

  private get correo(): string {
    return String(this.auth.currentUser?.email || '').toLowerCase();
  }

  private async cargarVistas(): Promise<boolean> {
    if (this.vistas && this.vistasDe === this.correo) return true;
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/guias`);
      const data = await res.json();
      if (!data?.ok) return false;
      this.vistas = new Set(data.vistas || []);
      this.vistasDe = this.correo;
      return true;
    } catch {
      return false; // sin conexión: no se muestran guías (mejor que repetirlas)
    }
  }

  private async alNavegar(url: string): Promise<void> {
    const pagina = paginaDeUrl(url);
    this.paginaActual = pagina;
    const intento = ++this.intento;
    this.activa.set(null);
    this.cola = [];
    if (!this.auth.currentUser || ['login', 'register', 'pending'].includes(pagina)) return;
    if (!(await this.cargarVistas()) || intento !== this.intento) return;

    if (!PAGINAS_SIN_NAVBAR.includes(pagina) && !this.vistas!.has('navegacion')) this.cola.push('navegacion');
    if (GUIAS[pagina] && !this.vistas!.has(pagina)) this.cola.push(pagina);
    this.mostrarSiguienteDeCola(intento);
  }

  private async mostrarSiguienteDeCola(intento: number): Promise<void> {
    const clave = this.cola.shift();
    if (!clave) return;
    const guia = GUIAS[clave];
    // Se espera a que la página termine de cargar y aparezca algo que señalar.
    const pasos = await this.esperarPasos(guia, intento);
    if (intento !== this.intento) return;
    if (!pasos.length) {
      // Nada visible que explicar (ej. sin permisos para nada de esa página).
      this.marcarVista(clave);
      this.mostrarSiguienteDeCola(intento);
      return;
    }
    this.activa.set({ clave, guia, pasos, indice: 0 });
  }

  private async esperarPasos(guia: Guia, intento: number): Promise<PasoGuia[]> {
    const inicio = Date.now();
    let anterior = -1;
    // Espera a que no haya pantalla de carga y a que los elementos dejen de
    // aparecer (las páginas cargan por partes), máximo ~8 s.
    while (Date.now() - inicio < 8000) {
      await new Promise(r => setTimeout(r, 400));
      if (intento !== this.intento) return [];
      if (document.querySelector('.pantalla-carga-inicial')) continue;
      const visibles = guia.pasos.filter(p => !!GuiaService.elementoVisible(p.el));
      if (visibles.length && visibles.length === anterior) return visibles;
      anterior = visibles.length;
    }
    return guia.pasos.filter(p => !!GuiaService.elementoVisible(p.el));
  }

  /** Selector del paso: una marca data-guia ("dash-alertas") o un selector CSS. */
  public static selector(el: string): string {
    return /^[a-z][a-z0-9-]*$/.test(el) && el.includes('-') ? `[data-guia="${el}"]` : el;
  }

  public static elementoVisible(el: string): HTMLElement | null {
    let encontrados: HTMLElement[] = [];
    try {
      encontrados = Array.from(document.querySelectorAll<HTMLElement>(GuiaService.selector(el)));
    } catch {
      return null;
    }
    return encontrados.find(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    }) || null;
  }

  public siguiente(): void {
    const a = this.activa();
    if (!a) return;
    if (a.indice < a.pasos.length - 1) this.activa.set({ ...a, indice: a.indice + 1 });
    else this.terminar();
  }

  public anterior(): void {
    const a = this.activa();
    if (a && a.indice > 0) this.activa.set({ ...a, indice: a.indice - 1 });
  }

  /** Terminar o saltar: no vuelve a salir esta guía. */
  public terminar(): void {
    const a = this.activa();
    if (!a) return;
    this.activa.set(null);
    this.marcarVista(a.clave);
    this.mostrarSiguienteDeCola(this.intento);
  }

  /** Botón "?": repite la guía de la página actual. */
  public async repetirPaginaActual(): Promise<void> {
    if (!GUIAS[this.paginaActual]) return;
    const intento = ++this.intento;
    this.activa.set(null);
    this.cola = [this.paginaActual];
    this.mostrarSiguienteDeCola(intento);
  }

  /** Vuelven a salir todas las guías (de esta cuenta, o de otra si es el admin). */
  public async reiniciarTodas(email?: string): Promise<boolean> {
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/guias/reiniciar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(email ? { email } : {})
      });
      const data = await res.json();
      if (!data?.ok) return false;
      if (!email || email.toLowerCase() === this.correo) {
        this.vistas = new Set();
        this.vistasDe = this.correo;
        this.alNavegar(this.router.url);
      }
      return true;
    } catch {
      return false;
    }
  }

  private marcarVista(clave: string): void {
    this.vistas?.add(clave);
    this.auth.fetchAutenticado(`${API_URL}/guias/vista`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pagina: clave })
    }).catch(() => { /* si no se pudo guardar, saldrá otra vez; no pasa nada grave */ });
  }
}
