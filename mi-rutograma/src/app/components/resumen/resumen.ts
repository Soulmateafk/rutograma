import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';

@Component({
  selector: 'app-resumen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './resumen.html',
  styleUrls: ['./resumen.css']
})
export class ResumenComponent implements OnInit, OnDestroy {

  public cargando: boolean = true;
  public hoyTexto: string = '';

  public viajesHoy: number = 0;
  public vehiculosEnMantenimiento: number = 0;
  public licenciasPorVencer: number = 0;
  public documentosPorVencer: number = 0;
  public novedadesSinResolver: number = 0;
  public vehiculosDisponibles: number = 0;

  private sub?: Subscription;

  constructor(public ds: DataService, private router: Router) {}

  ngOnInit(): void {
    const hoy = new Date();
    this.hoyTexto = hoy.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Primer cálculo (puede salir en cero si los datos reales aún no
    // han llegado del servidor) y recalcular apenas lleguen — mismo
    // patrón que ya usa el Dashboard.
    this.calcular();
    this.sub = this.ds.dataChanged.subscribe(() => this.calcular());
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private diasHasta(fechaStr: string, hoySinHora: Date): number | null {
    if (!fechaStr) return null;
    const f = new Date(fechaStr + 'T00:00:00');
    if (isNaN(f.getTime())) return null;
    return Math.round((f.getTime() - hoySinHora.getTime()) / (1000 * 60 * 60 * 24));
  }

  private calcular(): void {
    const hoy = new Date();
    const hoyISO = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const hoySinHora = new Date();
    hoySinHora.setHours(0, 0, 0, 0);

    const viajes = this.ds.S?.viajes || [];
    this.viajesHoy = viajes.filter((v: any) => v.fecha === hoyISO && v.estado !== 'Cancelado').length;

    const vehiculos = this.ds.S?.vehiculos || [];

    // Mismo criterio ya corregido en el Dashboard: solo cuenta como "en
    // mantenimiento" si hoy cae dentro del rango real (cuando existe),
    // no solo porque el campo "Estado" todavía diga "Mantenimiento".
    this.vehiculosEnMantenimiento = vehiculos.filter((v: any) => {
      if (!String(v.est || v.estado || '').toLowerCase().includes('mant')) return false;
      if (v.mantInicio && v.mantFin) return hoyISO >= v.mantInicio && hoyISO <= v.mantFin;
      return true;
    }).length;

    this.documentosPorVencer = vehiculos.filter((v: any) => {
      const diasSoat = this.diasHasta(v.soatVence, hoySinHora);
      const diasTecno = this.diasHasta(v.tecnoVence, hoySinHora);
      return (diasSoat !== null && diasSoat <= 30) || (diasTecno !== null && diasTecno <= 30);
    }).length;

    const conductores = this.ds.S?.conductores || [];
    this.licenciasPorVencer = conductores.filter((c: any) => {
      const dias = this.diasHasta(c.licVence, hoySinHora);
      return dias !== null && dias <= 30;
    }).length;

    const placasEnMantenimientoHoy = new Set(
      vehiculos.filter((v: any) => {
        if (!String(v.est || v.estado || '').toLowerCase().includes('mant')) return false;
        if (v.mantInicio && v.mantFin) return hoyISO >= v.mantInicio && hoyISO <= v.mantFin;
        return true;
      }).map((v: any) => String(v.p || v.placa || '').toUpperCase().trim())
    );
    this.vehiculosDisponibles = vehiculos.filter((v: any) =>
      !placasEnMantenimientoHoy.has(String(v.p || v.placa || '').toUpperCase().trim())
    ).length;

    this.novedadesSinResolver = (this.ds.S?.novedades || []).filter((n: any) => !n.resuelta).length;

    this.cargando = false;
  }

  public get hayAlertas(): boolean {
    return this.vehiculosEnMantenimiento > 0 || this.licenciasPorVencer > 0 || this.documentosPorVencer > 0;
  }

  public irADashboard(): void {
    this.router.navigate(['/dashboard']);
  }
}