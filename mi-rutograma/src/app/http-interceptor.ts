import { SERVIDOR } from './api-base';
import { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { iniciarProgreso, terminarProgreso } from './progreso';

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  // Si la petición va hacia tu API, nos aseguramos de que lleve la URL absoluta limpia
  if (req.url.includes('/api/')) {
    const apiReq = req.clone({
      url: req.url.startsWith('http') ? req.url : `${SERVIDOR}${req.url}`
    });
    // Guardar, eliminar...: barra de progreso arriba (las consultas de fondo no).
    if (req.method === 'GET') return next(apiReq);
    iniciarProgreso();
    return next(apiReq).pipe(finalize(() => terminarProgreso()));
  }
  return next(req);
};