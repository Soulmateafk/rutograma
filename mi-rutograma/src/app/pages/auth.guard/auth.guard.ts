import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../../services/auth.service';

export const authGuard: CanActivateFn = async (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('GUARD: Verificando acceso...');
  console.log('GUARD: Usuario actual:', authService.currentUser);
  console.log('GUARD: Estado actual:', authService.currentUserStatus);

  // 1. No hay sesión iniciada (currentUser es null) -> al login.
  //    Esto es DISTINTO de estar "pendiente": aquí simplemente nadie
  //    ha iniciado sesión todavía.
  //
  // BUG REAL encontrado y corregido: currentUser/currentUserStatus solo
  // viven en memoria — con solo recargar la página (F5), currentUser
  // quedaba en null aunque el correo siguiera guardado en el
  // navegador, así que esto mandaba a Login incluso con una sesión
  // válida. Ahora, antes de rendirse, intenta recuperar la sesión con
  // ese correo guardado (sin pedir la contraseña de nuevo).
  if (!authService.currentUser) {
    const recuperada = await authService.intentarRestaurarSesion();
    if (!recuperada) {
      console.log('GUARD: No hay sesión -> /login');
      return router.createUrlTree(['/login']);
    }
    console.log('GUARD: Sesión recuperada tras recargar la página');
  }

  // 2. Usuario con sesión y aprobado -> entra
  if (authService.currentUserStatus === 'APPROVED') {
    // Cuenta de conductor: solo "Mis viajes" (y sus sesiones).
    const pagina = String(state?.url || '').split(/[?#]/)[0];
    if (authService.esConductor && !['/mis-viajes', '/sesiones'].includes(pagina)) {
      return router.createUrlTree(['/mis-viajes']);
    }
    if (!authService.esConductor && pagina === '/mis-viajes') {
      return router.createUrlTree(['/dashboard']);
    }
    console.log('GUARD: Acceso concedido -> Dashboard');
    return true;
  }

  // 3. Usuario con sesión pero pendiente de aprobación
  if (authService.currentUserStatus === 'PENDING') {
    console.log('GUARD: Usuario pendiente -> /pending');
    return router.createUrlTree(['/pending']);
  }

  // 4. Usuario con sesión pero rechazado
  if (authService.currentUserStatus === 'REJECTED') {
    console.log('GUARD: Usuario rechazado -> /pending');
    return router.createUrlTree(['/pending']);
  }

  // 5. Cualquier otro caso raro -> al login
  console.log('GUARD: Estado inválido -> /login');
  return router.createUrlTree(['/login']);
};

// BUG REAL encontrado y corregido: la ruta /admin no tenía ninguna
// protección de "solo administrador" — cualquier cuenta aprobada
// (incluida un "lector") podía escribir /admin en la barra de
// direcciones y VER la lista de cuentas y toda la Auditoría, aunque los
// botones de acción sí fallaran al presionarlos (esos sí estaban
// protegidos en el servidor). Este guardián nuevo bloquea el simple
// hecho de ver la pantalla a quien no sea el admin.
export const adminGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Angular corre los guardianes de una ruta AL MISMO TIEMPO: al recargar la
  // página (o entrar directo a /admin) los permisos todavía no estaban
  // cargados y mandaba al Dashboard incluso al admin. Se espera la sesión.
  if (!authService.currentUser) {
    const recuperada = await authService.intentarRestaurarSesion();
    if (!recuperada) return router.createUrlTree(['/login']);
  }

  // Con permiso "Ver cuentas y auditoría" (el jefe, por defecto) también entra.
  if (authService.puedeVerAdministracion) return true;

  console.log('GUARD: No es admin ni jefe -> /dashboard');
  return router.createUrlTree(['/dashboard']);
};