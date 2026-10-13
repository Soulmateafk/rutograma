import { ApplicationConfig, ApplicationRef, inject } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideRouter, withViewTransitions } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
// 1. IMPORTA withFetch
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http'; 
import { DataService } from './services/data';
import { paseInterceptor } from './services/pase.interceptor'; 

// Fechas en español donde se pida con | date:'...':'':'es' (el idioma por
// defecto de la app no cambia, para no mover el formato de los números).
registerLocaleData(localeEs, 'es');

export const appConfig: ApplicationConfig = {
  providers: [
    // Cambio de página animado: la página que se va sale deslizándose y la
    // nueva entra (styles.css, "TRANSICIÓN ENTRE PÁGINAS"). Se salta si la
    // cuenta apagó "Deslizar entre páginas" o "Quitar animaciones".
    provideRouter(routes, withViewTransitions({
      skipInitialTransition: true,
      onViewTransitionCreated: ({ transition }) => {
        const html = document.documentElement;
        if (html.classList.contains('sin-transicion') || html.classList.contains('sin-animaciones')
          || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { transition.skipTransition(); return; }
        html.classList.add('vt-activa');
        transition.finished.finally(() => html.classList.remove('vt-activa'));
        // Algunas páginas (p. ej. Vehículos) se pintan sin pedir un segundo
        // repintado y el navegador se quedaba esperando hasta 4 s con la
        // pantalla congelada: se fuerza ese repintado y, si aun así tarda
        // más de 700 ms, se cambia de página sin animación.
        const app = inject(ApplicationRef);
        let listo = false;
        transition.updateCallbackDone.finally(() => { listo = true; });
        setTimeout(() => { if (!listo) app.tick(); }, 40);
        setTimeout(() => { if (!listo) transition.skipTransition(); }, 700);
      }
    })),
    //provideClientHydration(withEventReplay()),
    // El interceptor agrega el pase de sesión a cada llamada al servidor.
    provideHttpClient(withFetch(), withInterceptors([paseInterceptor])), 
    DataService 
  ]
};