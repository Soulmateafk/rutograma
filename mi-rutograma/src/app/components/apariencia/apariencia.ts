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
import { JuegoComponent } from './juego';
import { ClimaComponent } from './clima';
import { CalendarioFiestasComponent } from './calendario-fiestas';
import { MascotaComponent } from './mascota';
import { ConexionService } from '../../services/conexion.service';
import { TemporadaComponent } from './temporada';
import { TEMPORADAS, temporadaDe } from '../../services/temporadas';
import { EFECTOS, FONDOS, FUENTES, AVATARES, INICIOS, Fondo, TEMAS_LISTOS, TemaListo, AMBIENTES } from '../../services/theme.service';
import { SonidoService, ACCIONES_SONIDO, Accion } from '../../services/sonido.service';
import { reducirImagen } from '../../services/imagenes';

/**
 * Panel APARIENCIA (modo claro/oscuro, tamaño de letra, instalar la app) y
 * panel ATAJOS DE TECLADO (tecla "?"). Viven en app.html: se abren desde
 * cualquier pantalla, también Mis viajes y Despachos (que no tienen barra).
 */
@Component({
  selector: 'app-apariencia',
  standalone: true,
  imports: [CommonModule, RuedaColorComponent, TemporadaComponent, JuegoComponent, ClimaComponent, CalendarioFiestasComponent, MascotaComponent],
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
  public jugando = false;
  public calendario = false;
  public nombreTemporada(c: string): string { const t = TEMPORADAS.find(x => x.clave === c); return t ? t.nombre + ' ' + t.emoji : c; }
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

  // Foto, fondo, letra, sonidos.
  private sonido = inject(SonidoService);
  public readonly fondos = FONDOS;
  public readonly fuentes = FUENTES;
  public readonly avatares = AVATARES;
  public readonly acciones = ACCIONES_SONIDO;
  public kitPrueba = '';
  public readonly temasListos = TEMAS_LISTOS;
  public readonly ambientes = AMBIENTES;
  public colorDeTema(t: TemaListo): string {
    if (t.cambios.acento === 'propio') return t.cambios.colorPropio || '#3366ff';
    return this.theme.acentos.find(a => a.valor === t.cambios.acento)?.color || '#2563eb';
  }
  public get inicial(): string { return (String(this.account.nombre || this.auth.currentUser?.email || '?').trim()[0] || '?').toUpperCase(); }
  public get fotoFondo(): string { return this.theme.fotoFondo(); }
  public get iniciosDisponibles() {
    return INICIOS.filter(i => !i.valor || (i.valor === '/aprobaciones' ? this.auth.puede('aprobarCambios') : true));
  }
  public probar(a: Accion): void { this.sonido.tocar(a, { forzar: true, temporada: this.kitPrueba || undefined }); }

  public async subirFoto(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!archivo) return;
    try { this.theme.ponerFoto(await reducirImagen(archivo, 128, 0.8, true)); } catch { /* imagen dañada: no se cambia */ }
  }
  public escogerFondo(f: Fondo): void {
    if (f === 'foto' && !this.fotoFondo) { this.pedirFondo(); return; }
    this.theme.ponerFondo(f);
  }
  private pedirFondo(): void {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*';
    i.onchange = (e) => this.subirFondo(e);
    i.click();
  }
  public async subirFondo(e: Event): Promise<void> {
    const archivo = (e.target as HTMLInputElement).files?.[0];
    (e.target as HTMLInputElement).value = '';
    if (!archivo) return;
    try {
      const url = await reducirImagen(archivo, 1600, 0.72, false);
      if (!this.theme.ponerFotoFondo(url)) alert('La foto es muy pesada para guardarla en este equipo. Prueba con otra.');
    } catch { /* imagen dañada */ }
  }

  public get saltos() {
    return [
      { nombre: 'Temas', guia: 'ap-temas', si: true }, { nombre: 'Mi foto', guia: 'ap-perfil', si: !this.compartida }, { nombre: 'Modo', guia: 'ap-tema', si: true },
      { nombre: 'Color', guia: 'ap-acento', si: true }, { nombre: 'Fondo', guia: 'ap-fondo', si: true },
      { nombre: 'Letra', guia: 'ap-fuente', si: true }, { nombre: 'Sonidos', guia: 'ap-sonidos', si: true },
      { nombre: 'Temporada', guia: 'ap-temporada', si: true }, { nombre: 'Efectos', guia: 'ap-efectos', si: true }
    ].filter(x => x.si);
  }
  public saltar(guia: string): void {
    const el = document.querySelector(`.ap-panel [data-guia="${guia}"]`) as HTMLElement | null;
    el?.scrollIntoView({ behavior: document.documentElement.classList.contains('sin-animaciones') ? 'auto' : 'smooth', block: 'start' });
    el?.classList.remove('ap-resalte'); void el?.offsetWidth; el?.classList.add('ap-resalte');
  }

  public verAtajos(): void {
    this.theme.panelAbierto.set(false);
    this.atajos.panelAbierto.set(true);
  }
}
