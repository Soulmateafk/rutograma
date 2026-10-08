import { Injectable, NgZone, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './auth.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

const NOMBRES_PAGINA: Record<string, string> = {
  dashboard: 'Dashboard', rutograma: 'Rutograma', vehiculos: 'Vehículos', 'hoja-de-vida': 'Hoja de vida',
  rutas: 'Rutas', conductores: 'Conductores', agenda: 'Agenda de conductor', configuracion: 'Configuración',
  historico: 'Histórico', comparativo: 'Comparativo', cumplimiento: 'Cumplimiento', resumen: 'Resumen',
  sesiones: 'Sesiones', aprobaciones: 'Aprobaciones', admin: 'Administración', reglas: 'Reglas', comparendos: 'Comparendos', quejas: 'Quejas', mapa: 'Mapa', despachos: 'Despachos', papelera: 'Papelera'
};

export interface PersonaEnLinea { nombre: string; esYo: boolean; dispositivo: string; pagina: string; accion: string; editando: boolean; oculta: boolean; haceSeg: number; }
export interface OtroAqui { nombre: string; editando: boolean; esYo: boolean; }

/**
 * EN LÍNEA AHORA (backend/presencia.js): cada pestaña de la oficina avisa
 * cada 8 s en qué página está y qué hace ("editando el viaje BOG-CAL de
 * PRZ 065"), y recibe a los demás. Las pantallas llaman a establecer()
 * cuando abren o editan algo, y a limpiar() al cerrarlo. No queda en
 * ningún historial: es solo lo que pasa en este momento.
 */
@Injectable({ providedIn: 'root' })
export class PresenciaService {
  private auth = inject(AuthService);
  private router = inject(Router);
  private zone = inject(NgZone);

  // Una por pestaña, y la misma al recargar (F5): así recargar no deja una
  // "ventana fantasma" en la lista.
  private readonly pestana = PresenciaService.idDePestana();

  private static idDePestana(): string {
    const nuevo = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      const guardado = sessionStorage.getItem('pestanaPresencia');
      if (guardado) return guardado;
      sessionStorage.setItem('pestanaPresencia', nuevo);
    } catch { /* sin almacenamiento: uno nuevo cada vez */ }
    return nuevo;
  }
  private estado = { accion: '', clave: '', editando: false };
  private reloj: ReturnType<typeof setInterval> | null = null;
  private activo = false;
  private ultimoLatido = 0;

  /** Los demás en la app ahora. */
  readonly enLinea = signal<PersonaEnLinea[]>([]);
  /** Los demás con el mismo objeto abierto que esta pestaña. */
  readonly otros = signal<OtroAqui[]>([]);

  constructor() {
    if (typeof window === 'undefined') return;
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => {
      // Al cambiar de página se suelta lo que tenía abierto.
      this.estado = { accion: '', clave: '', editando: false };
      this.otros.set([]);
      if (this.activo) this.latir();
    });
    window.addEventListener('pagehide', () => this.salir());
    // Al volver a la ventana, avisar de una vez (sin esperar al reloj).
    document.addEventListener('visibilitychange', () => { if (this.activo) this.latir(); });
  }

  /** Lo arranca la barra de arriba (solo existe con sesión iniciada). */
  iniciar(): void {
    if (this.activo || typeof window === 'undefined') return;
    this.activo = true;
    this.latir();
    this.zone.runOutsideAngular(() => {
      // Visible: cada 8 s. Minimizada o detrás de otra ventana: cada ~25 s
      // (antes no avisaba y a los 30 s esa persona desaparecía de la lista
      // aunque siguiera con la app abierta).
      this.reloj = setInterval(() => {
        const visible = document.visibilityState === 'visible';
        if (visible || Date.now() - this.ultimoLatido >= 25000) this.latir();
      }, 8000);
    });
  }

  detener(): void {
    if (!this.activo) return;
    this.activo = false;
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    this.salir();
    this.enLinea.set([]);
    this.otros.set([]);
  }

  /** Qué está haciendo esta pestaña. clave: lo que tiene abierto ("viaje:123"). */
  establecer(accion: string, clave = '', editando = false): void {
    const nuevo = { accion, clave, editando };
    if (JSON.stringify(nuevo) === JSON.stringify(this.estado)) return;
    if (clave !== this.estado.clave) this.otros.set([]);
    this.estado = nuevo;
    if (this.activo) this.latir();
  }

  limpiar(): void {
    this.otros.set([]);
    this.establecer('', '', false);
  }

  private pagina(): string {
    const ruta = this.router.url.split('?')[0].split('/').filter(Boolean)[0] || '';
    return NOMBRES_PAGINA[ruta] || ruta;
  }

  private url(extra: Record<string, string>): string {
    const q = new URLSearchParams({ pestana: this.pestana, pagina: this.pagina(), ...extra });
    return `${API_URL}/presencia?${q.toString()}`;
  }

  /** Con sesión de la oficina (al recargar, la sesión se recupera unos instantes después). */
  private puedeAvisar(): boolean {
    return !!this.auth.currentUser?.email && this.auth.rolActual !== 'conductor';
  }

  private async latir(): Promise<void> {
    if (!this.puedeAvisar()) return;
    const { accion, clave, editando } = this.estado;
    this.ultimoLatido = Date.now();
    const oculta = document.visibilityState !== 'visible' ? '1' : '0';
    try {
      const res = await this.auth.fetchAutenticado(this.url({ accion, clave, editando: editando ? '1' : '0', oculta }));
      const data = await res.json();
      if (!data?.ok) return;
      this.zone.run(() => {
        this.enLinea.set(data.enLinea || []);
        // Si mientras tanto se abrió otra cosa, esta respuesta ya no aplica.
        if (clave === this.estado.clave) this.otros.set(clave ? data.otros || [] : []);
      });
    } catch { /* sin conexión: se intenta en el siguiente aviso */ }
  }

  private salir(): void {
    if (!this.puedeAvisar()) return;
    try {
      this.auth.fetchAutenticado(this.url({ salir: '1' }), { keepalive: true }).catch(() => {});
    } catch { /* nada */ }
  }
}
