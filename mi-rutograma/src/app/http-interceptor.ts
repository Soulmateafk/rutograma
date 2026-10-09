import { SERVIDOR } from './api-base';
import { HttpInterceptorFn } from '@angular/common/http';

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  // Si la petición va hacia tu API, nos aseguramos de que lleve la URL absoluta limpia
  if (req.url.includes('/api/')) {
    const apiReq = req.clone({
      url: req.url.startsWith('http') ? req.url : `${SERVIDOR}${req.url}`
    });
    return next(apiReq);
  }
  return next(req);
};