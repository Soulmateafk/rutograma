import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';
import { PresenciaService } from '../../services/presencia.service';
import { Agenda, DiaAgenda, armarAgenda } from '../../services/agenda-conductor';
import { enlaceWhatsApp, horaDelViaje, mensajeViajes, numeroWhatsApp } from '../../services/whatsapp';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/**
 * AGENDA DEL CONDUCTOR — su mes en un calendario: el día que sale a cada
 * viaje (ruta, destino, vehículo, hora), los días en ruta, los descansos y
 * los días libres (services/agenda-conductor.ts).
 */
@Component({
  selector: 'app-agenda-conductor',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './agenda-conductor.html',
  styleUrls: ['./agenda-conductor.css']
})
export class AgendaConductorComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private ui = inject(UiService);
  private presencia = inject(PresenciaService);
  public ds = inject(DataService);

  readonly diasSemana = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  nombre = '';
  anio = new Date().getFullYear();
  mes = new Date().getMonth();
  conductor: any = null;
  agenda: Agenda | null = null;
  private sub?: Subscription;

  ngOnInit(): void {
    this.route.paramMap.subscribe(p => {
      this.nombre = decodeURIComponent(p.get('nombre') || '');
      this.recalcular();
      this.presencia.establecer(`viendo la agenda de ${this.nombre}`);
    });
    this.sub = this.ds.dataChanged.subscribe(() => { this.recalcular(); this.cdr.detectChanges(); });
    if (!(this.ds.S?.conductores || []).length) this.ds.inicializarApp(true);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  get conductores(): any[] {
    return [...(this.ds.S?.conductores || [])]
      .filter((c: any) => String(c.nom || c.nombre || '').trim())
      .sort((a: any, b: any) => String(a.nom || a.nombre).localeCompare(String(b.nom || b.nombre)));
  }

  get tituloMes(): string { return `${MESES[this.mes]} ${this.anio}`; }

  recalcular(): void {
    const clave = this.nombre.toLowerCase().trim();
    this.conductor = (this.ds.S?.conductores || []).find((c: any) => String(c.nom || c.nombre || '').toLowerCase().trim() === clave) || null;
    this.agenda = this.conductor ? armarAgenda(this.conductor, this.ds.S?.viajes || [], this.anio, this.mes) : null;
  }

  cambiarMes(delta: number): void {
    const f = new Date(this.anio, this.mes + delta, 1);
    this.anio = f.getFullYear();
    this.mes = f.getMonth();
    this.recalcular();
  }

  irAHoy(): void {
    const h = new Date();
    this.anio = h.getFullYear();
    this.mes = h.getMonth();
    this.recalcular();
  }

  elegirConductor(nombre: string): void {
    if (nombre) this.router.navigate(['/agenda', nombre]);
  }

  hora(v: any): string { return horaDelViaje(v, this.ds.S?.rutas || []); }

  destino(v: any): string {
    const d = String(v.destino || '').trim();
    return d && d !== 'No definido' ? d : '';
  }

  textoDia(d: DiaAgenda): string {
    if (d.tipo === 'en-ruta') return `En ruta · ${d.enCurso?.ruta || d.enCurso?.codigo || ''}`;
    if (d.tipo === 'descanso') return 'Descanso';
    return d.enMes ? 'Libre' : '';
  }

  get tieneWhatsApp(): boolean { return !!numeroWhatsApp(this.conductor?.tel); }

  avisarPorWhatsApp(): void {
    const enlace = enlaceWhatsApp(this.conductor?.tel, mensajeViajes(this.conductor, this.ds.S?.viajes || [], this.ds.S?.rutas || [], new Date()));
    if (!enlace) { this.ui.mostrarToast('Este conductor no tiene un celular válido.', 'err'); return; }
    window.open(enlace, '_blank', 'noopener');
  }

  /** Imprime solo la agenda (sin la barra de arriba); ver styles.css. */
  imprimir(): void {
    document.body.classList.add('imprimiendo-hoja');
    window.print();
    setTimeout(() => document.body.classList.remove('imprimiendo-hoja'), 500);
  }
}
