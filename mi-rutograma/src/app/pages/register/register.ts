import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { DEPARTAMENTOS, REQUISITOS_CLAVE, errorDepartamento, errorEmail, errorNombre, faltasDeClave, nombreLimpio } from '../../services/validaciones';

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
  confirmarPass: string = '';
  departamento: string = '';

  // Botón del ojo de cada campo de contraseña.
  verPass = false;
  verConfirmacion = false;

  get coinciden(): boolean {
    return this.pass === this.confirmarPass;
  }

  // Cada campo muestra su error cuando la persona sale de él (o al intentar
  // enviar), no mientras apenas empieza a escribir.
  public tocado: Record<string, boolean> = {};
  public intentoEnviar = false;
  public mostrarError(campo: string): boolean {
    return this.intentoEnviar || !!this.tocado[campo];
  }

  get errorNombre(): string { return errorNombre(this.nombre); }
  get errorEmail(): string { return errorEmail(this.email); }
  get errorDepartamento(): string { return errorDepartamento(this.departamento); }

  /** Requisitos de la contraseña, marcados en vivo. */
  get requisitosClave(): Array<{ texto: string; ok: boolean }> {
    const faltas = faltasDeClave(this.pass, { email: this.email, nombre: this.nombre });
    const lista = REQUISITOS_CLAVE.filter(r => r.clave !== 'maximo' || this.pass.length > 64)
      .map(r => ({ texto: r.texto, ok: !faltas.includes(r.texto) }));
    for (const extra of ['Que no contenga tu correo', 'Que no contenga tu nombre']) {
      if (faltas.includes(extra)) lista.push({ texto: extra, ok: false });
    }
    return lista;
  }

  get claveSegura(): boolean {
    return faltasDeClave(this.pass, { email: this.email, nombre: this.nombre }).length === 0;
  }

  /** 0 a 4, para la barrita de fuerza. */
  get fuerzaClave(): number {
    if (!this.pass) return 0;
    const cumplidos = this.requisitosClave.filter(r => r.ok).length;
    const total = this.requisitosClave.length;
    if (this.claveSegura) return this.pass.length >= 12 ? 4 : 3;
    return cumplidos >= total - 2 ? 2 : 1;
  }
  get textoFuerza(): string {
    return ['', 'Débil', 'Le falta poco', 'Segura', 'Muy segura'][this.fuerzaClave];
  }

  // Desplegable propio de "Departamento" — reemplaza el <select> nativo,
  // ya que la mayoría de navegadores IGNORAN el estilo personalizado de
  // sus opciones (siempre salen en blanco, sin importar el CSS puesto).
  public departamentos: string[] = DEPARTAMENTOS;
  public isDropdownOpen: boolean = false;

  public toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
    // Que se vea la lista completa (en celular quedaba debajo del borde).
    if (this.isDropdownOpen && typeof document !== 'undefined') {
      setTimeout(() => document.querySelector('.reg-dropdown-panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
    }
  }

  public seleccionarDepartamento(d: string): void {
    this.departamento = d;
    this.isDropdownOpen = false;
    this.tocado['departamento'] = true;
  }

  constructor(
    private auth: AuthService, 
    private ui: UiService,
    private router: Router
  ) {}

  async enviarSolicitud() {
    // 1. Validación de campos (el servidor lo revisa otra vez).
    this.intentoEnviar = true;
    const error = this.errorNombre || this.errorEmail;
    if (error) {
      this.ui.mostrarToast(error, 'err');
      return;
    }
    if (!this.claveSegura) {
      this.ui.mostrarToast('La contraseña todavía no es segura: revisa los requisitos en rojo.', 'err');
      return;
    }
    if (!this.confirmarPass) {
      this.ui.mostrarToast('Confirma tu contraseña escribiéndola otra vez', 'err');
      return;
    }
    if (!this.coinciden) {
      this.ui.mostrarToast('Las contraseñas no coinciden', 'err');
      return;
    }
    if (this.errorDepartamento) {
      this.ui.mostrarToast('Selecciona tu departamento', 'err');
      return;
    }

    // 2. Enviar la solicitud AL BACKEND (queda pendiente de aprobación).
    try {
      await this.auth.registrarSolicitud({
        nombre: nombreLimpio(this.nombre),
        email: this.email.trim(),
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