import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
// 1. IMPORTA withFetch
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http'; 
import { DataService } from './services/data';
import { paseInterceptor } from './services/pase.interceptor'; 

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    //provideClientHydration(withEventReplay()),
    // El interceptor agrega el pase de sesión a cada llamada al servidor.
    provideHttpClient(withFetch(), withInterceptors([paseInterceptor])), 
    DataService 
  ]
};