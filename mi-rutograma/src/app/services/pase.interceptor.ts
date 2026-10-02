import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, tap, throwError } from 'rxjs';
import { AccountService } from './account.service';

/**
 * Agrega el "pase" de sesión (cabecera Authorization) a cada llamada que
 * la app le hace al servidor, y reacciona si el servidor dice que la
 * sesión ya no es válida.
 *
 * - Solo se manda a rutas del propio servidor de la app (las que llevan
 *   "/api/"): el pase nunca debe viajar a otros sitios.
 * - Si el servidor responde 401 con código "pase_invalido" o "sin_pase"
 *   (la sesión expiró, la contraseña cambió, la cuenta ya no existe...),
 *   se cierra la sesión local y se manda a la persona al login. Un 401 de
 *   otro tipo (por ejemplo, "contraseña incorrecta" en el login) NO cierra
 *   nada: ese no trae ese código.
 *
 * Las llamadas hechas con fetch() directo no pasan por aquí: usan
 * AuthService.fetchAutenticado(), que hace lo mismo.
 */
export const paseInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.includes('/api/')) return next(req);

  const cuenta = inject(AccountService);
  const token = cuenta.token;
  const peticion = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(peticion).pipe(
    // Cuenta auxiliar: el servidor no aplicó el cambio, lo dejó pendiente
    // de aprobación (202 + pendiente:true).
    tap(evento => {
      if (evento instanceof HttpResponse && evento.status === 202 && (evento.body as any)?.pendiente) {
        cuenta.alCambioPendiente.next((evento.body as any).msg || 'Enviado para aprobación del jefe.');
      }
    }),
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse
          && err.status === 401
          && (err.error?.codigo === 'pase_invalido' || err.error?.codigo === 'sin_pase' || err.error?.codigo === 'sesion_cerrada')) {
        cuenta.sesionExpirada(err.error?.codigo === 'sesion_cerrada' ? err.error?.msg : undefined);
      }
      return throwError(() => err);
    })
  );
};
