import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, CommonModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {

  private auth = inject(AuthService);
  private router = inject(Router);
  private ui = inject(UiService);
  private platformId = inject(PLATFORM_ID);

  // Datos vinculados al formulario
  email: string = '';
  pass: string = '';
  recordarme: boolean = true;

  // Si ya hay una sesión guardada en este equipo, entra directo
  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const restaurada = await this.auth.intentarRestaurarSesion();
    if (restaurada && this.auth.currentUserStatus === 'APPROVED') {
      this.ui.mostrarToast(this.mensajeBienvenida(), 'ok');
      this.router.navigate(['/resumen']);
    }
  }

  // Saludo según la hora + mensaje según el rol
  private mensajeBienvenida(): string {
    const hora = new Date().getHours();
    const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';

    let detalle: string;
    if (this.auth.isAdmin) {
      detalle = 'Bienvenido, administrador. Tienes acceso completo al Rutograma.';
    } else if (this.auth.esJefe) {
      detalle = 'Bienvenido, jefe. Puedes editar el Rutograma y aprobar o rechazar los cambios de tus auxiliares en la pestaña Aprobaciones.';
    } else if (this.auth.esConductor) {
      detalle = 'Bienvenido. Aquí ves tus viajes de los próximos días.';
    } else if (this.auth.esAuxiliar) {
      detalle = 'Bienvenido. Eres auxiliar: puedes hacer cambios, pero cada uno se aplica cuando un jefe lo aprueba. Revisa en qué quedaron en la pestaña Aprobaciones.';
    } else if (this.auth.rolActual === 'lector') {
      detalle = 'Bienvenido. Puedes consultar y exportar la información del Rutograma.';
    } else {
      detalle = 'Bienvenido. Ya puedes gestionar el Rutograma.';
    }
    // Aviso del cierre por inactividad (no aplica a conductores).
    const avisoInactividad = this.auth.esConductor ? ''
      : '<br><small>Si te ausentas 1 hora o más sin usar la app, tu sesión se cerrará sola por seguridad.</small>';
    return `${saludo}. ${detalle}${avisoInactividad}`;
  }

  // 1. Botón para Microsoft
  async loginMicrosoft() {
    const success = await this.auth.iniciarSesionMicrosoft();

    if (success) {
      this.router.navigate(['/dashboard']);
    }
  }

  // 2. Botón para Email/Password
  async loginTradicional() {
    if (!this.email || !this.pass) {
      this.ui.mostrarToast('Escribe tu correo y contraseña.', 'err');
      return;
    }

    const estado = await this.auth.iniciarSesionEmail(this.email, this.pass);

    if (estado === 'APPROVED') {
      this.auth.marcarSesion(this.recordarme);
      // Si al entrar se pasó del máximo de sesiones, el servidor cerró la
      // que llevaba más tiempo sin usarse — se avisa para que no sorprenda.
      const cerradas = this.auth.sesionesCerradasAlEntrar;
      const avisoTope = cerradas > 0
        ? `<br>Tu cuenta llegó al máximo de ${this.auth.maxSesiones} sesiones: se cerró ${cerradas === 1 ? 'la que llevaba' : cerradas + ' que llevaban'} más tiempo sin usarse.`
        : '';
      this.ui.mostrarToast(this.mensajeBienvenida() + avisoTope, 'ok');
      this.router.navigate(['/resumen']);

    } else if (estado === 'PENDING') {
      this.router.navigate(['/pending']);

    } else if (estado === 'REJECTED') {
      this.ui.mostrarToast('Tu cuenta fue rechazada. Contacta al administrador.', 'err');
      this.router.navigate(['/pending']);

    } else {
      const codigo = this.auth.ultimoErrorLoginCodigo;
      if (codigo === 'red') {
        this.ui.mostrarToast('No se pudo conectar con el servidor — revisa tu conexión e intenta de nuevo.', 'err');
      } else if (codigo === 'bloqueado') {
        this.ui.mostrarToast(this.auth.ultimoMensajeLogin || 'Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.', 'err');
      } else if (codigo === 'servidor') {
        this.ui.mostrarToast('El servidor tuvo un problema al procesar el inicio de sesión. Intenta de nuevo en un momento.', 'err');
      } else {
        this.ui.mostrarToast('Correo o contraseña incorrectos.', 'err');
      }
    }
  }
}