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
import { AprobacionesComponent } from './components/aprobaciones/aprobaciones';
import { MisViajesComponent } from './components/mis-viajes/mis-viajes';
import { HojaVidaComponent } from './components/hoja-vida/hoja-vida';
import { CumplimientoComponent } from './components/cumplimiento/cumplimiento';

import { AgendaConductorComponent } from './components/agenda-conductor/agenda-conductor';
import { ReglasComponent } from './components/reglas/reglas';
import { ComparendosComponent } from './components/comparendos/comparendos';
import { QuejasComponent } from './components/quejas/quejas';
import { MapaComponent } from './components/mapa/mapa';
import { DespachosComponent } from './components/despachos/despachos';
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
  { path: 'hoja-de-vida/:placa', component: HojaVidaComponent, canActivate: [authGuard] },
  { path: 'rutas', component: RutasComponent, canActivate: [authGuard] },
  { path: 'conductores', component: ConductoresComponent, canActivate: [authGuard] }, 
  { path: 'agenda/:nombre', component: AgendaConductorComponent, canActivate: [authGuard] },
  { path: 'reglas', component: ReglasComponent, canActivate: [authGuard] },
  { path: 'comparendos', component: ComparendosComponent, canActivate: [authGuard] },
  { path: 'quejas', component: QuejasComponent, canActivate: [authGuard] },
  { path: 'mapa', component: MapaComponent, canActivate: [authGuard] },
  { path: 'despachos', component: DespachosComponent, canActivate: [authGuard] },
  { path: 'configuracion', component: Configuracion, canActivate: [authGuard] },
  { path: 'historico', component: Historico, canActivate: [authGuard] },
  { path: 'comparativo', component: Comparativo, canActivate: [authGuard] },
  { path: 'cumplimiento', component: CumplimientoComponent, canActivate: [authGuard] },
  { path: 'resumen', component: ResumenComponent, canActivate: [authGuard] },
  { path: 'sesiones', component: SesionesComponent, canActivate: [authGuard] },
  { path: 'aprobaciones', component: AprobacionesComponent, canActivate: [authGuard] },
  { path: 'mis-viajes', component: MisViajesComponent, canActivate: [authGuard] },
  
  // 4. Ruta de Administración (Protegida)
  { path: 'admin', component: Admin, canActivate: [authGuard, adminGuard] },

  // 5. Ruta comodín
  { path: '**', redirectTo: '/login' }
];