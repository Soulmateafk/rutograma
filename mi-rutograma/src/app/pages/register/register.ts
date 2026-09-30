import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink], 
  templateUrl: './register.html',
  // Asegúrate de que esta ruta sea correcta según donde guardaste tu CSS
  // BUG REAL encontrado y corregido: esto apuntaba al CSS de LOGIN
  // ('../login/login.css'), no al propio de esta página — por eso
  // register.html no coincidía con su diseño real (register.css, con
  // el degradado animado y las tarjetas). Se corrige a su propio archivo.
  styleUrls: ['./register.css']
})
export class RegisterComponent {
  nombre: string = '';
  email: string = '';
  pass: string = '';
  departamento: string = '';

  // Desplegable propio de "Departamento" — reemplaza el <select> nativo,
  // ya que la mayoría de navegadores IGNORAN el estilo personalizado de
  // sus opciones (siempre salen en blanco, sin importar el CSS puesto).
  public departamentos: string[] = ['Logística', 'Transporte', 'Recursos Humanos', 'Contabilidad'];
  public isDropdownOpen: boolean = false;

  public toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  public seleccionarDepartamento(d: string): void {
    this.departamento = d;
    this.isDropdownOpen = false;
  }

  constructor(
    private auth: AuthService, 
    private ui: UiService,
    private router: Router
  ) {}

  async enviarSolicitud() {
    // 1. Validación de campos
    if (!this.nombre || !this.email || !this.pass || !this.departamento) {
      this.ui.mostrarToast('Por favor, completa todos los campos y selecciona un departamento', 'err');
      return;
    }
    if (this.pass.length < 6) {
      this.ui.mostrarToast('La contraseña debe tener al menos 6 caracteres', 'err');
      return;
    }

    // 2. Enviar la solicitud AL BACKEND (queda pendiente de aprobación).
    try {
      await this.auth.registrarSolicitud({
        nombre: this.nombre,
        email: this.email,
        pass: this.pass,
        departamento: this.departamento
      });

      this.ui.mostrarToast('Solicitud enviada correctamente. Espera aprobación del administrador.', 'ok');

      // 3. Redirección al login tras éxito
      setTimeout(() => {
        this.router.navigate(['/login']);
      }, 2000);
    } catch (e: any) {
      // Antes esto solo revisaba el 409 (correo repetido) y para
      // cualquier otro problema (sin conexión, servidor caído, etc.)
      // mostraba el mismo mensaje genérico de "intenta de nuevo". Con
      // el helper compartido, cada tipo de falla dice lo que de verdad
      // pasó.
      this.ui.mostrarErrorHttp(e, 'enviar la solicitud');
    }
  }
}