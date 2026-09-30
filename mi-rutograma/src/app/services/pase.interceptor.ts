import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
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
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse
          && err.status === 401
          && (err.error?.codigo === 'pase_invalido' || err.error?.codigo === 'sin_pase')) {
        cuenta.sesionExpirada();
      }
      return throwError(() => err);
    })
  );
};
