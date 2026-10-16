import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './pages/auth.guard/auth.guard';

// Componentes Base
// Solo el login va en la carga inicial; cada pantalla se descarga la primera
// vez que se abre (loadComponent) y queda guardada en el navegador.
import { LoginComponent } from './pages/login/login';

// Componentes del Dashboard

export const routes: Routes = [
  // 1. Redirección automática
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  
  // 2. Rutas Públicas (Sin protección)
  { path: 'login', component: LoginComponent },
  { path: 'register', loadComponent: () => import('./pages/register/register').then(m => m.RegisterComponent) },
  { path: 'pending', loadComponent: () => import('./pages/pending/pending').then(m => m.PendingComponent) }, // Accesible para el usuario en espera
  
  // 3. Rutas Protegidas (Solo accesibles si authGuard permite el paso)
  { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard').then(m => m.Dashboard), canActivate: [authGuard] },
  { path: 'rutograma', loadComponent: () => import('./components/rutograma/rutograma').then(m => m.RutogramaComponent), canActivate: [authGuard] },
  { path: 'vehiculos', loadComponent: () => import('./components/vehiculos/vehiculos').then(m => m.VehiculosComponent), canActivate: [authGuard] },
  { path: 'hoja-de-vida/:placa', loadComponent: () => import('./components/hoja-vida/hoja-vida').then(m => m.HojaVidaComponent), canActivate: [authGuard] },
  { path: 'rutas', loadComponent: () => import('./components/rutas/rutas').then(m => m.RutasComponent), canActivate: [authGuard] },
  { path: 'conductores', loadComponent: () => import('./components/conductores/conductores').then(m => m.ConductoresComponent), canActivate: [authGuard] }, 
  { path: 'agenda/:nombre', loadComponent: () => import('./components/agenda-conductor/agenda-conductor').then(m => m.AgendaConductorComponent), canActivate: [authGuard] },
  { path: 'reglas', loadComponent: () => import('./components/reglas/reglas').then(m => m.ReglasComponent), canActivate: [authGuard] },
  { path: 'comparendos', loadComponent: () => import('./components/comparendos/comparendos').then(m => m.ComparendosComponent), canActivate: [authGuard] },
  { path: 'quejas', loadComponent: () => import('./components/quejas/quejas').then(m => m.QuejasComponent), canActivate: [authGuard] },
  { path: 'mapa', loadComponent: () => import('./components/mapa/mapa').then(m => m.MapaComponent), canActivate: [authGuard] },
  { path: 'despachos', loadComponent: () => import('./components/despachos/despachos').then(m => m.DespachosComponent), canActivate: [authGuard] },
  { path: 'papelera', loadComponent: () => import('./components/papelera/papelera').then(m => m.PapeleraComponent), canActivate: [authGuard] },
  { path: 'configuracion', loadComponent: () => import('./components/configuracion/configuracion').then(m => m.Configuracion), canActivate: [authGuard] },
  { path: 'historico', loadComponent: () => import('./components/historico/historico').then(m => m.Historico), canActivate: [authGuard] },
  { path: 'comparativo', loadComponent: () => import('./components/comparativo/comparativo').then(m => m.Comparativo), canActivate: [authGuard] },
  { path: 'tareas', loadComponent: () => import('./components/tareas/tareas').then(m => m.TareasComponent), canActivate: [authGuard] },
  { path: 'conductor/:nombre', loadComponent: () => import('./components/perfil-conductor/perfil-conductor').then(m => m.PerfilConductorComponent), canActivate: [authGuard] },
  { path: 'presentacion', loadComponent: () => import('./components/presentacion/presentacion').then(m => m.PresentacionComponent), canActivate: [authGuard] },
  { path: 'cumplimiento', loadComponent: () => import('./components/cumplimiento/cumplimiento').then(m => m.CumplimientoComponent), canActivate: [authGuard] },
  { path: 'pronostico', loadComponent: () => import('./components/pronostico/pronostico').then(m => m.PronosticoComponent), canActivate: [authGuard] },
  { path: 'resumen', loadComponent: () => import('./components/resumen/resumen').then(m => m.ResumenComponent), canActivate: [authGuard] },
  { path: 'sesiones', loadComponent: () => import('./components/sesiones/sesiones').then(m => m.SesionesComponent), canActivate: [authGuard] },
  { path: 'aprobaciones', loadComponent: () => import('./components/aprobaciones/aprobaciones').then(m => m.AprobacionesComponent), canActivate: [authGuard] },
  { path: 'mis-viajes', loadComponent: () => import('./components/mis-viajes/mis-viajes').then(m => m.MisViajesComponent), canActivate: [authGuard] },
  
  // 4. Ruta de Administración (Protegida)
  { path: 'admin', loadComponent: () => import('./pages/admin/admin').then(m => m.Admin), canActivate: [authGuard, adminGuard] },

  // 5. Ruta comodín
  { path: '**', redirectTo: '/login' }
];