import { Injectable, NgZone, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { DataService } from './data';
import { UiService } from './ui.service';

/**
 * ATAJOS DE TECLADO — para trabajar en la oficina sin el mouse.
 * Se ignoran mientras se escribe en un campo y mientras hay una ventana
 * abierta (para no abrir otra encima). La lista completa se ve con "?"
 * (panel en components/apariencia). Ctrl+K (buscar) y "/" (resaltar placa)
 * siguen en navbar.ts; los del Rutograma (mes, hoy) en rutograma.ts.
 */
export interface Atajo { teclas: string[]; que: string; }
export interface GrupoAtajos { titulo: string; atajos: Atajo[]; }

// "G" y luego una letra: ir a esa página.
const PAGINAS: Array<{ tecla: string; ruta: string; nombre: string; permiso?: string; soloAdmin?: boolean }> = [
  { tecla: 'd', ruta: '/dashboard', nombre: 'Dashboard' },
  { tecla: 'r', ruta: '/rutograma', nombre: 'Rutograma' },
  { tecla: 'v', ruta: '/vehiculos', nombre: 'Vehículos' },
  { tecla: 'u', ruta: '/rutas', nombre: 'Rutas' },
  { tecla: 'c', ruta: '/conductores', nombre: 'Conductores' },
  { tecla: 'p', ruta: '/despachos', nombre: 'Despachos' },
  { tecla: 'o', ruta: '/comparativo', nombre: 'Comparativo' },
  { tecla: 'h', ruta: '/historico', nombre: 'Histórico' },
  { tecla: 'q', ruta: '/quejas', nombre: 'Quejas' },
  { tecla: 'm', ruta: '/mapa', nombre: 'Mapa' },
  { tecla: 'a', ruta: '/aprobaciones', nombre: 'Aprobaciones', permiso: 'aprobarCambios' },
  { tecla: 'l', ruta: '/papelera', nombre: 'Papelera', permiso: 'eliminar' },
  { tecla: 'x', ruta: '/configuracion', nombre: 'Configuración' },
  { tecla: 'z', ruta: '/admin', nombre: 'Administración', soloAdmin: true }
];

@Injectable({ providedIn: 'root' })
export class AtajosService {
  private router = inject(Router);
  private auth = inject(AuthService);
  private theme = inject(ThemeService);
  private zone = inject(NgZone);
  private ds = inject(DataService);
  private ui = inject(UiService);

  public panelAbierto = signal(false);
  /** Se oprimió "G": esperando la letra de la página (se muestra una ayuda). */
  public esperandoIr = signal(false);
  private relojIr: any = null;

  /** Acciones que hace otra parte de la app (la barra abre Viaje Extra y Novedad). */
  public acciones = new Subject<'viaje-extra' | 'novedad'>();

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('keydown', e => this.zone.run(() => this.tecla(e)));
  }

  /** Cuentas de oficina (con barra de menú): conductores y despachos solo tienen su pantalla. */
  public get esOficina(): boolean {
    return !!this.auth.currentUser && !this.auth.esConductor && !this.auth.esDespachos;
  }

  public get paginasDisponibles() {
    return PAGINAS.filter(p => (!p.permiso || this.auth.puede(p.permiso)) && (!p.soloAdmin || this.auth.isAdmin));
  }

  /** Lista para el panel "?" (solo lo que esta cuenta puede usar). */
  public get grupos(): GrupoAtajos[] {
    const grupos: GrupoAtajos[] = [];
    if (this.esOficina) {
      grupos.push({ titulo: 'Moverse', atajos: [
        { teclas: ['Ctrl', 'K'], que: 'Buscar un viaje, placa, conductor, ruta o acción' },
        { teclas: ['/'], que: 'Ir al Rutograma y resaltar una placa' },
        ...this.paginasDisponibles.map(p => ({ teclas: ['G', p.tecla.toUpperCase()], que: `Ir a ${p.nombre}` }))
      ] });
      const crear: Atajo[] = [];
      if (this.auth.puedeEditar) {
        crear.push({ teclas: ['N'], que: 'Nuevo viaje extra' });
        crear.push({ teclas: ['Shift', 'N'], que: 'Nueva novedad' });
      }
      if (crear.length) grupos.push({ titulo: 'Crear', atajos: crear });
      grupos.push({ titulo: 'En el Rutograma', atajos: [
        { teclas: ['Shift', '←'], que: 'Mes anterior' },
        { teclas: ['Shift', '→'], que: 'Mes siguiente' },
        { teclas: ['H'], que: 'Volver al mes de hoy' },
        { teclas: ['Ctrl', 'Z'], que: 'Deshacer el último cambio' },
        { teclas: ['F'], que: 'Modo enfoque: solo el Rutograma, a pantalla completa (F o Esc para salir)' },
        { teclas: ['Esc'], que: 'Cerrar el viaje abierto o la ventana' }
      ] });
    }
    grupos.push({ titulo: 'Apariencia', atajos: [
      { teclas: ['A'], que: 'Abrir Apariencia (modo y tamaño de letra)' },
      { teclas: ['T'], que: 'Cambiar entre modo claro y oscuro' },
      { teclas: ['+'], que: 'Letra más grande' },
      { teclas: ['-'], que: 'Letra más pequeña' },
      { teclas: ['B'], que: 'Abrir o cerrar mis notas' }
    ] });
    grupos.push({ titulo: 'Ayuda', atajos: [{ teclas: ['?'], que: 'Ver esta lista de atajos' }] });
    return grupos;
  }

  /** ¿Se está escribiendo en un campo? (ahí las letras son letras, no atajos) */
  public static escribiendo(): boolean {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  /** ¿Hay una ventana, guía o panel abierto encima? */
  public static ventanaAbierta(): boolean {
    return !!document.querySelector('.mbg, .nb-modal-backdrop, .ruto-modal-backdrop, .modal-backdrop, .guia-cuadro, .ap-fondo');
  }

  private tecla(e: KeyboardEvent): void {
    // Ctrl+Z: deshacer el último cambio (fuera de los campos, donde deshace lo escrito).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.defaultPrevented
        && !AtajosService.escribiendo() && !AtajosService.ventanaAbierta() && this.auth.puedeEditar && !this.auth.necesitaAprobacion && this.ds.pilaDeshacer.length) {
      e.preventDefault();
      this.ds.deshacerUltimoCambio().then(r => this.ui.mostrarToast(r.mensaje, r.ok ? 'ok' : 'err'));
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.key === 'Escape' && (this.panelAbierto() || this.theme.panelAbierto())) {
      this.panelAbierto.set(false); this.theme.panelAbierto.set(false); return;
    }
    if (e.key === 'Escape' && this.theme.enfoque() && !AtajosService.ventanaAbierta()) { this.theme.alternarEnfoque(false); return; }
    if (AtajosService.escribiendo() || !this.auth.currentUser) return;

    if (this.esperandoIr()) {
      this.dejarDeEsperar();
      const p = this.paginasDisponibles.find(x => x.tecla === e.key.toLowerCase());
      if (p && this.esOficina) { e.preventDefault(); this.router.navigate([p.ruta]); }
      return;
    }
    if (e.key === '?') { e.preventDefault(); this.theme.panelAbierto.set(false); this.panelAbierto.update(v => !v); return; }
    if (AtajosService.ventanaAbierta()) return;

    switch (e.key) {
      case 'a': case 'A': e.preventDefault(); this.theme.panelAbierto.set(true); return;
      case 't': case 'T': e.preventDefault(); this.theme.alternarTema(); return;
      case '+': case '=': e.preventDefault(); this.theme.cambiarLetra(1); return;
      case '-': case '_': e.preventDefault(); this.theme.cambiarLetra(-1); return;
    }
    if (!this.esOficina) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      if (!this.theme.enfoque() && !this.router.url.startsWith('/rutograma')) this.router.navigate(['/rutograma']);
      this.theme.alternarEnfoque();
      return;
    }
    if (e.key === 'b' || e.key === 'B') { e.preventDefault(); this.theme.notasAbiertas.update(v => !v); return; }
    if (e.key === 'g' || e.key === 'G') {
      e.preventDefault();
      this.esperandoIr.set(true);
      this.relojIr = setTimeout(() => this.zone.run(() => this.dejarDeEsperar()), 2000);
      return;
    }
    if ((e.key === 'n' || e.key === 'N') && this.auth.puedeEditar) {
      e.preventDefault();
      this.acciones.next(e.shiftKey ? 'novedad' : 'viaje-extra');
    }
  }

  private dejarDeEsperar(): void {
    clearTimeout(this.relojIr);
    this.esperandoIr.set(false);
  }

  public paginasParaIr() { return this.paginasDisponibles; }
}
