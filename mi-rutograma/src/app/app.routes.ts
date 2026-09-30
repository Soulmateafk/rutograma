import { Routes } from '@angular/router';
import { authGuard, adminGuard } from './pages/auth.guard/auth.guard';

// Componentes Base
import { LoginComponent } from './pages/login/login';
import { RegisterComponent } from './pages/register/register';
import { PendingComponent } from './pages/pending/pending'; // Asegúrate de tener este componente
import { Admin } from './pages/admin/admin';     // Asegúrate de tener este componente

// Componentes del Dashboard
import { Dashboard } from './components/dashboard/dashboard';
import { RutogramaComponent } from './components/rutograma/rutograma';
import { VehiculosComponent } from './components/vehiculos/vehiculos';
import { RutasComponent } from './components/rutas/rutas';
import { ConductoresComponent } from './components/conductores/conductores';
import { Configuracion } from './components/configuracion/configuracion';
import { Historico } from './components/historico/historico';
import { Comparativo } from './components/comparativo/comparativo';
import { ResumenComponent } from './components/resumen/resumen';
import { SesionesComponent } from './components/sesiones/sesiones';

export const routes: Routes = [
  // 1. Redirección automática
  { path: '', redirectTo: '/login', pathMatch: 'full' },
  
  // 2. Rutas Públicas (Sin protección)
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'pending', component: PendingComponent }, // Accesible para el usuario en espera
  
  // 3. Rutas Protegidas (Solo accesibles si authGuard permite el paso)
  { path: 'dashboard', component: Dashboard, canActivate: [authGuard] },
  { path: 'rutograma', component: RutogramaComponent, canActivate: [authGuard] },
  { path: 'vehiculos', component: VehiculosComponent, canActivate: [authGuard] },
  { path: 'rutas', component: RutasComponent, canActivate: [authGuard] },
  { path: 'conductores', component: ConductoresComponent, canActivate: [authGuard] }, 
  { path: 'configuracion', component: Configuracion, canActivate: [authGuard] },
  { path: 'historico', component: Historico, canActivate: [authGuard] },
  { path: 'comparativo', component: Comparativo, canActivate: [authGuard] },
  { path: 'resumen', component: ResumenComponent, canActivate: [authGuard] },
  { path: 'sesiones', component: SesionesComponent, canActivate: [authGuard] },
  
  // 4. Ruta de Administración (Protegida)
  { path: 'admin', component: Admin, canActivate: [authGuard, adminGuard] },

  // 5. Ruta comodín
  { path: '**', redirectTo: '/login' }
];