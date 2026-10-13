import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';

/**
 * PRECARGA DE PANTALLAS: cada pantalla se descarga la primera vez que se
 * abre (app.routes.ts). Para que cambiar de página siga siendo inmediato,
 * unos segundos después de entrar se bajan las demás en segundo plano —
 * solo en las cuentas de la oficina: el login, Mis viajes (conductores) y
 * Despachos no se cargan con pantallas que nunca van a usar.
 */
@Injectable({ providedIn: 'root' })
export class PrecargaOficina implements PreloadingStrategy {
  preload(route: Route, cargar: () => Observable<any>): Observable<any> {
    if (typeof window === 'undefined') return of(null);
    const ruta = window.location.pathname;
    if (['/login', '/register', '/pending', '/mis-viajes', '/despachos'].some(r => ruta.startsWith(r))) return of(null);
    if (['register', 'pending', 'mis-viajes', 'despachos'].includes(route.path || '')) return of(null);
    return timer(4000).pipe(mergeMap(() => cargar()));
  }
}
