import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';
import { GUIAS, Guia, PAGINAS_SIN_NAVBAR, PasoGuia, PasoTarea, TAREAS, Tarea, paginaDeUrl } from './guias';

export interface GuiaActiva {
  clave: string;
  guia: Guia;
  pasos: PasoTarea[];
  indice: number;
  /** Si es una tarea "¿Cómo hago…?" (en vez de la guía de una página). */
  tarea?: Tarea;
}

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

/**
 * GUÍAS DE PRIMERA VEZ — la primera vez que una cuenta entra a cada página
 * se oscurece la pantalla y se explica cada parte (ver guias.ts). Lo que
 * cada cuenta ya vio se guarda en el servidor, así no vuelve a salir ni en
 * este computador ni en otro. El botón "?" la repite cuando se quiera, y
 * abre las tareas "¿Cómo hago…?" (ver TAREAS en guias.ts): esas solo
 * señalan, nunca escriben ni guardan, y al terminar cierran sin guardar.
 */
@Injectable({ providedIn: 'root' })
export class GuiaService {
  private router = inject(Router);
  private auth = inject(AuthService);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  /** Guía que se está mostrando (null = ninguna). */
  public activa = signal<GuiaActiva | null>(null);
  /** Menú del botón "?" abierto. */
  public menuAbierto = signal(false);

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

  /** ¿Esta página tiene su guía? */
  public get hayGuiaEnPagina(): boolean {
    return !!GUIAS[this.paginaActual] && !!this.auth.currentUser;
  }

  /** ¿Se muestra el botón "?" en esta página? */
  public get hayAyuda(): boolean {
    return this.hayGuiaEnPagina || (!!this.auth.currentUser && this.tareasDisponibles().length > 0);
  }

  /** Tareas que esta cuenta puede hacer (no se enseña lo que no le está permitido). */
  public tareasDisponibles(): Tarea[] {
    if (!this.auth.currentUser || this.auth.esConductor || this.auth.esDespachos) return [];
    return TAREAS.filter(t =>
      t.requiere === 'editar' ? this.auth.puedeEditar
        : t.requiere === 'aprobar' ? this.auth.puedeAprobar
          : this.auth.puedeEditar && !this.auth.puedeAprobar);
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
    this.menuAbierto.set(false);
    this.activa.set(null);
    this.cola = [];
    if (!this.auth.currentUser || ['login', 'register', 'pending'].includes(pagina)) return;
    if (!(await this.cargarVistas()) || intento !== this.intento) return;

    // La cuenta de despachos no tiene la barra de arriba: no se le explica.
    if (!PAGINAS_SIN_NAVBAR.includes(pagina) && !this.auth.esDespachos && !this.vistas!.has('navegacion')) this.cola.push('navegacion');
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
    if (a.tarea) {
      if (a.pasos[a.indice]?.tocar || this.buscandoPaso) return; // se sigue tocando lo iluminado
      this.irAPasoDeTarea(a.indice + 1, 1, 1200);
      return;
    }
    if (a.indice < a.pasos.length - 1) this.activa.set({ ...a, indice: a.indice + 1 });
    else this.terminar();
  }

  public anterior(): void {
    const a = this.activa();
    if (!a || !this.puedeIrAtras()) return;
    if (a.tarea) { if (!this.buscandoPaso) this.irAPasoDeTarea(a.indice - 1, -1, 0); }
    else this.activa.set({ ...a, indice: a.indice - 1 });
  }

  /**
   * En una tarea no se vuelve a un paso de "toca aquí" ya hecho (ni a los
   * de antes): lo que se abrió sigue abierto y repetirlo confundiría.
   */
  public puedeIrAtras(): boolean {
    const a = this.activa();
    if (!a || a.indice <= 0) return false;
    if (!a.tarea) return true;
    for (let i = a.indice - 1; i >= 0; i--) {
      if (a.pasos[i].tocar) return false;
      if (!a.pasos[i].el || GuiaService.elementoVisible(a.pasos[i].el)) return true;
    }
    return false;
  }

  /** Terminar o saltar: no vuelve a salir esta guía. */
  public terminar(): void {
    const a = this.activa();
    if (!a) return;
    this.activa.set(null);
    this.buscandoPaso = false;
    if (a.tarea) {
      this.cerrarLoQueAbrioLaTarea(a.tarea);
      return;
    }
    this.marcarVista(a.clave);
    this.mostrarSiguienteDeCola(this.intento);
  }

  /** Botón "?": abre el menú (guía de la página + tareas). */
  public alternarMenu(): void {
    // Sin tareas para esta cuenta, el "?" repite la guía de la página de una.
    if (!this.tareasDisponibles().length) { this.repetirPaginaActual(); return; }
    this.menuAbierto.set(!this.menuAbierto());
  }

  /** Empieza una tarea "¿Cómo hago…?" (va a su página si hace falta). */
  public async iniciarTarea(tarea: Tarea): Promise<void> {
    this.menuAbierto.set(false);
    ++this.intento;
    this.buscandoPaso = false;
    this.activa.set(null);
    this.cola = [];
    const destino = tarea.pagina || (PAGINAS_SIN_NAVBAR.includes(this.paginaActual) ? 'dashboard' : '');
    if (destino && destino !== this.paginaActual) {
      const ok = await this.router.navigate(['/' + destino]);
      if (!ok) return;
    }
    this.activa.set({ clave: 'tarea:' + tarea.clave, guia: { titulo: tarea.titulo, pasos: tarea.pasos }, pasos: tarea.pasos, indice: -1, tarea });
    this.irAPasoDeTarea(0, 1, 8000);
  }

  /** La persona tocó lo iluminado en un paso de "toca aquí": se sigue. */
  public tocado(): void {
    const a = this.activa();
    if (!a?.tarea || !a.pasos[a.indice]?.tocar) return;
    this.irAPasoDeTarea(a.indice + 1, 1, 8000); // lo que se abrió puede tardar un poco
  }

  /**
   * Va al paso pedido de la tarea esperando a que su elemento aparezca
   * (ej. el formulario que se acaba de abrir). Si no aparece (la cuenta no
   * ve ese botón, o no hay nada que mostrar), se salta ese paso. Solo se
   * espera por el primero; los siguientes, si no están ya, se saltan.
   */
  private buscandoPaso = false;
  private async irAPasoDeTarea(indice: number, direccion: 1 | -1, esperaMs: number): Promise<void> {
    const intento = ++this.intento;
    const a = this.activa();
    if (!a?.tarea) return;
    this.buscandoPaso = true;
    let i = indice;
    try {
      while (i >= 0 && i < a.pasos.length) {
        const el = a.pasos[i].el;
        if (!el || await this.esperarElemento(el, intento, i === indice ? esperaMs : 0)) break;
        if (intento !== this.intento) return;
        if (direccion < 0 && a.pasos[i].tocar) return;
        i += direccion;
      }
    } finally {
      if (intento === this.intento) this.buscandoPaso = false;
    }
    if (intento !== this.intento || this.activa()?.tarea !== a.tarea) return;
    if (i >= a.pasos.length) { this.terminar(); return; }
    if (i < 0) return;
    this.activa.set({ ...a, indice: i });
  }

  private async esperarElemento(el: string, intento: number, maxMs: number): Promise<boolean> {
    const inicio = Date.now();
    while (true) {
      if (intento !== this.intento) return false;
      if (!document.querySelector('.pantalla-carga-inicial') && GuiaService.elementoVisible(el)) return true;
      if (Date.now() - inicio >= maxMs) return false;
      await new Promise(r => setTimeout(r, 150));
    }
  }

  /** Cierra (con su botón Cancelar/Cerrar) lo que se abrió en la tarea: nada se guarda. */
  private cerrarLoQueAbrioLaTarea(tarea: Tarea): void {
    for (const sel of tarea.cerrar || []) GuiaService.elementoVisible(sel)?.click();
  }

  /** Botón "?": repite la guía de la página actual. */
  public async repetirPaginaActual(): Promise<void> {
    this.menuAbierto.set(false);
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
