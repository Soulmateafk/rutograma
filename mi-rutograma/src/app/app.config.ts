import { ApplicationConfig } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';
import { provideRouter } from '@angular/router';
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
    provideRouter(routes),
    //provideClientHydration(withEventReplay()),
    // El interceptor agrega el pase de sesión a cada llamada al servidor.
    provideHttpClient(withFetch(), withInterceptors([paseInterceptor])), 
    DataService 
  ]
};