import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { AtajosService } from '../../services/atajos.service';
import { InstalarService } from '../../services/instalar.service';
import { AuthService } from '../../services/auth.service';
import { AccountService } from '../../services/account.service';

/**
 * Panel APARIENCIA (modo claro/oscuro, tamaño de letra, instalar la app) y
 * panel ATAJOS DE TECLADO (tecla "?"). Viven en app.html: se abren desde
 * cualquier pantalla, también Mis viajes y Despachos (que no tienen barra).
 */
@Component({
  selector: 'app-apariencia',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './apariencia.html',
  styleUrls: ['./apariencia.css']
})
export class AparienciaComponent {
  public theme = inject(ThemeService);
  public atajos = inject(AtajosService);
  public instalar = inject(InstalarService);
  public auth = inject(AuthService);
  private account = inject(AccountService);

  public get compartida(): boolean {
    return this.account.cuentaCompartida;
  }

  public get nombreAcento(): string {
    return this.theme.acentos.find(a => a.valor === this.theme.ap.acento)?.nombre || '';
  }

  public verAtajos(): void {
    this.theme.panelAbierto.set(false);
    this.atajos.panelAbierto.set(true);
  }
}
