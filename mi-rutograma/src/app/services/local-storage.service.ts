import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

// Misma llave que ya usa rutograma.ts al hacer
// localStorage.setItem('rutograma_data', ...) directamente.
// Antes este servicio buscaba la llave en "window.LKEY", una variable
// global que nunca se definía en ningún lado del proyecto — por eso
// cargarEstado()/guardarEstado() nunca funcionaban de verdad.
const CLAVE_ESTADO = 'rutograma_data';
const CLAVE_HISTORIAL = 'rutograma_historial';

@Injectable({ providedIn: 'root' })
export class LocalStorageService {

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {}

  private esNavegador(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  // --- Estado general (vehículos, rutas, viajes, conductores, etc.) ---
  public cargarEstado(): any | null {
    if (!this.esNavegador()) return null;

    const raw = localStorage.getItem(CLAVE_ESTADO);
    if (!raw) return null;

    try {
      const data = JSON.parse(raw);
      // Aceptamos el dato tal cual viene (no exigimos ningún campo de
      // versión: rutograma.ts guarda el objeto S directamente, sin envoltorio).
      return data && typeof data === 'object' ? data : null;
    } catch (e) {
      console.error('Error leyendo estado de localStorage:', e);
      return null;
    }
  }

  public guardarEstado(S: any): void {
    if (!this.esNavegador()) return;

    try {
      localStorage.setItem(CLAVE_ESTADO, JSON.stringify(S));
    } catch (e) {
      console.error('Error guardando en LocalStorage:', e);
    }
  }

  // --- Histórico de meses cerrados ---
  public guardarHistorial(arr: any[]): void {
    if (!this.esNavegador()) return;
    localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify(arr));
  }

  public cargarHistorial(): any[] {
    if (!this.esNavegador()) return [];
    try {
      const data = localStorage.getItem(CLAVE_HISTORIAL);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  public eliminarHistorial(): void {
    if (!this.esNavegador()) return;
    localStorage.removeItem(CLAVE_HISTORIAL);
  }

  public hayDatosParaCerrar(): boolean {
    if (!this.esNavegador()) return false;
    const datos = localStorage.getItem(CLAVE_ESTADO);
    return datos !== null && datos !== '';
  }

  // --- Configuración de SharePoint / integración externa ---
  public guardarConfigSP(cfg: any): void {
    if (!this.esNavegador()) return;
    localStorage.setItem('rutograma_sp_cfg', JSON.stringify(cfg));
  }

  public cargarConfigSP(): any | null {
    if (!this.esNavegador()) return null;

    const raw = localStorage.getItem('rutograma_sp_cfg');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }
}