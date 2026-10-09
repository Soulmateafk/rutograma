import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { AtajosService } from '../../services/atajos.service';
import { InstalarService } from '../../services/instalar.service';
import { AuthService } from '../../services/auth.service';
import { AccountService } from '../../services/account.service';
import { COLORES_TR, Transportadora } from '../../services/theme.service';
import { variantesAcento } from '../../services/colores';
import { RuedaColorComponent } from './rueda-color';
import { ConexionService } from '../../services/conexion.service';
import { TemporadaComponent } from './temporada';
import { TEMPORADAS, temporadaDe } from '../../services/temporadas';
import { EFECTOS } from '../../services/theme.service';

/**
 * Panel APARIENCIA (modo claro/oscuro, tamaño de letra, instalar la app) y
 * panel ATAJOS DE TECLADO (tecla "?"). Viven en app.html: se abren desde
 * cualquier pantalla, también Mis viajes y Despachos (que no tienen barra).
 */
@Component({
  selector: 'app-apariencia',
  standalone: true,
  imports: [CommonModule, RuedaColorComponent, TemporadaComponent],
  templateUrl: './apariencia.html',
  styleUrls: ['./apariencia.css']
})
export class AparienciaComponent {
  public theme = inject(ThemeService);
  public atajos = inject(AtajosService);
  public instalar = inject(InstalarService);
  public auth = inject(AuthService);
  public conexion = inject(ConexionService);
  private account = inject(AccountService);

  public get compartida(): boolean {
    return this.account.cuentaCompartida;
  }

  public get nombreAcento(): string {
    if (this.theme.ap.acento === 'propio') return 'Tu color';
    return this.theme.acentos.find(a => a.valor === this.theme.ap.acento)?.nombre || '';
  }

  // Rueda de colores (color propio).
  public ruedaAbierta = false;
  public abrirRueda(): void {
    this.ruedaAbierta = !this.ruedaAbierta || this.theme.ap.acento !== 'propio';
    if (this.theme.ap.acento !== 'propio') this.theme.ponerColorPropio(this.theme.ap.colorPropio || '#3366ff');
  }
  public get colorAjustado(): boolean {
    return this.theme.ap.acento === 'propio' && !!this.theme.ap.colorPropio && variantesAcento(this.theme.ap.colorPropio).ajustado;
  }

  // Colores de cada transportadora en el Rutograma.
  public readonly coloresTr = COLORES_TR;
  public readonly transportadoras: Array<{ clave: Transportadora; nombre: string }> = [
    { clave: 'makand', nombre: 'Makand' }, { clave: 'arsitrans', nombre: 'Arsitrans' }, { clave: 'polar', nombre: 'Polar' }
  ];
  public colorTr(t: Transportadora): string {
    return this.theme.ap.coloresTr[t] || COLORES_TR[t];
  }

  // Efectos y temporadas (cada cuenta escoge los suyos).
  public readonly efectos = EFECTOS;
  public readonly temporadas = TEMPORADAS;
  public get temporadaDeHoy() { return temporadaDe(); }

  public verAtajos(): void {
    this.theme.panelAbierto.set(false);
    this.atajos.panelAbierto.set(true);
  }
}
