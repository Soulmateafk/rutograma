import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-pending',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './pending.html',
  styleUrls: ['./pending.css']
})
export class PendingComponent {

  constructor(private authService: AuthService) {}

  // BUG REAL encontrado y corregido: login.ts manda a esta pantalla
  // tanto cuando la cuenta está PENDING como cuando fue REJECTED — pero
  // el texto de aquí siempre decía "PENDIENTE de revisión", sin
  // importar cuál de los dos era. auth.service.ts ya guarda el estado
  // real en currentUserStatus justo antes de redirigir aquí, así que
  // solo hacía falta leerlo.
  public get fueRechazada(): boolean {
    return this.authService.currentUserStatus === 'REJECTED';
  }

  public get motivoRechazo(): string {
    return this.authService.motivoRechazo;
  }

  // Este botón simplemente limpia la sesión y los manda al login
  regresarAlLogin() {
    this.authService.cerrarSesion();
  }
}