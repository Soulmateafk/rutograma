import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  // Página con la placa en la dirección: se arma en el navegador (no se
  // puede preparar de antemano una por cada placa).
  {
    path: 'hoja-de-vida/:placa',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
