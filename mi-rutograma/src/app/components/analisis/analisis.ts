import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Directive, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import {
  DiaCapacidad, DuracionRuta, OcupacionVehiculo,
  capacidadProximosDias, duracionRealRutas, ocupacionCarga, textoHoras
} from '../../services/analisis-flota';

const ESTILOS = `
  .af-card { background: var(--color-fondo-tarjeta, #0f172a); border: 1px solid var(--color-borde, #1e293b); border-radius: 12px; padding: 14px 16px; margin-top: 16px; color: var(--color-texto-principal); }
  .af-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }
  .af-cab h2 { font-size: 15px; margin: 0; display: flex; gap: 8px; align-items: center; }
  .af-sub { font-size: 12px; color: var(--color-texto-secundario); }
  .af-vacio { font-size: 13px; color: var(--color-texto-secundario); }
  .af-fila { display: grid; grid-template-columns: 88px 1fr auto; gap: 10px; align-items: center; padding: 5px 0; font-size: 13px; }
  .af-barra { height: 12px; border-radius: 6px; background: rgba(148, 163, 184, 0.18); overflow: hidden; display: flex; }
  .af-barra span { display: block; height: 100%; }
  .af-propios { background: #3b82f6; }
  .af-terceros { background: #f59e0b; }
  .af-libre { background: rgba(34, 197, 94, 0.35); }
  .af-bajo { background: #f87171; } .af-medio { background: #fbbf24; } .af-alto { background: #22c55e; }
  .af-dato { font-size: 12px; color: var(--color-texto-secundario); white-space: nowrap; }
  .af-alerta { color: #fbbf24; font-weight: 700; }
  .af-leyenda { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--color-texto-secundario); margin-top: 6px; }
  .af-leyenda i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 4px; vertical-align: -1px; }
  .af-tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
  .af-tabla th { text-align: left; font-size: 11.5px; color: var(--color-texto-secundario); font-weight: 600; padding: 4px 6px; }
  .af-tabla td { padding: 6px; border-top: 1px solid var(--color-borde, #1e293b); }
  .af-mas { color: #f87171; font-weight: 700; } .af-menos { color: #4ade80; font-weight: 700; }
  @media (max-width: 600px) { .af-fila { grid-template-columns: 70px 1fr; } .af-fila .af-dato { grid-column: 1 / -1; } }
`;

/** Base: recalcula cuando cambian los datos (no en cada repintado). */
@Directive()
abstract class TarjetaAnalisis implements OnInit, OnDestroy {
  protected ds = inject(DataService);
  protected cdr = inject(ChangeDetectorRef);
  private sub?: Subscription;
  ngOnInit(): void {
    this.calcular();
    this.sub = this.ds.dataChanged.subscribe(() => { this.calcular(); this.cdr.markForCheck(); });
  }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }
  protected abstract calcular(): void;
}

/** Dashboard: viajes de los próximos 7 días frente a vehículos propios. */
@Component({
  selector: 'app-capacidad-semana',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ESTILOS],
  template: `
    <div class="af-card" data-guia="dash-capacidad">
      <div class="af-cab">
        <h2><i class="bi bi-calendar-week"></i> Capacidad de los próximos 7 días</h2>
        <span class="af-sub" *ngIf="dias.length">{{ dias[0].operativos }} vehículos propios operativos</span>
      </div>
      <div *ngFor="let d of dias" class="af-fila">
        <b>{{ d.nombre }}</b>
        <div class="af-barra" [title]="d.enPropios + ' en propios, ' + d.enTerceros + ' en terceros, ' + d.libres + ' propios libres'">
          <span class="af-propios" [style.width.%]="pct(d.enPropios, d)"></span>
          <span class="af-terceros" [style.width.%]="pct(d.enTerceros, d)"></span>
          <span class="af-libre" [style.width.%]="pct(d.libres, d)"></span>
        </div>
        <span class="af-dato">
          {{ d.viajes }} viaje{{ d.viajes === 1 ? '' : 's' }} · {{ d.libres }} libre{{ d.libres === 1 ? '' : 's' }}
          <span *ngIf="d.faltan" class="af-alerta"> · faltan {{ d.faltan }}</span>
        </span>
      </div>
      <div class="af-leyenda">
        <span><i class="af-propios"></i>Viajes en vehículos propios</span>
        <span><i class="af-terceros"></i>En terceros (Arsitrans, Polar…)</span>
        <span><i class="af-libre"></i>Propios libres</span>
      </div>
    </div>
  `
})
export class CapacidadSemanaComponent extends TarjetaAnalisis {
  dias: DiaCapacidad[] = [];
  protected calcular(): void { this.dias = capacidadProximosDias(this.ds.S, new Date(), 7); }
  pct(n: number, d: DiaCapacidad): number {
    const total = Math.max(1, d.enPropios + d.enTerceros + d.libres);
    return (n / total) * 100;
  }
}

/** Vehículos: cuánto se llena cada camión en el mes. */
@Component({
  selector: 'app-ocupacion-carga',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ESTILOS],
  template: `
    <div class="af-card" data-guia="veh-ocupacion">
      <div class="af-cab">
        <h2><i class="bi bi-box-seam"></i> Qué tan lleno va cada camión</h2>
        <span class="af-sub">Promedio de cajas por viaje frente a su capacidad · mes activo</span>
      </div>
      <div *ngIf="!lista.length" class="af-vacio">No hay viajes con cajas anotadas este mes.</div>
      <div *ngFor="let o of lista" class="af-fila">
        <b>{{ o.placa }}</b>
        <div class="af-barra"><span [class]="o.pct < 50 ? 'af-bajo' : o.pct < 80 ? 'af-medio' : 'af-alto'" [style.width.%]="o.pct > 100 ? 100 : o.pct"></span></div>
        <span class="af-dato"><b>{{ o.pct }}%</b> · {{ o.promedioCajas }} de {{ o.capacidad }} cajas · {{ o.viajes }} viaje{{ o.viajes === 1 ? '' : 's' }}</span>
      </div>
      <div class="af-leyenda" *ngIf="lista.length">
        <span><i class="af-bajo"></i>Menos de la mitad: se podría juntar carga o usar uno más pequeño</span>
        <span><i class="af-medio"></i>50–80%</span>
        <span><i class="af-alto"></i>80% o más</span>
      </div>
    </div>
  `
})
export class OcupacionCargaComponent extends TarjetaAnalisis {
  lista: OcupacionVehiculo[] = [];
  protected calcular(): void { this.lista = ocupacionCarga(this.ds.S, Number(this.ds.S?.anio), Number(this.ds.S?.mes)); }
}

/** Rutas: duración real (Ya salí / Ya llegué) frente a la programada. */
@Component({
  selector: 'app-duracion-rutas',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ESTILOS],
  template: `
    <div class="af-card" data-guia="rutas-duracion">
      <div class="af-cab">
        <h2><i class="bi bi-stopwatch"></i> Cuánto tarda de verdad cada ruta</h2>
        <span class="af-sub">De "Ya salí" a "Ya llegué" que marcan los conductores</span>
      </div>
      <div *ngIf="!lista.length" class="af-vacio">Todavía no hay viajes con salida y llegada marcadas por los conductores.</div>
      <table class="af-tabla" *ngIf="lista.length">
        <thead><tr><th>Ruta</th><th>Programado</th><th>Real (promedio)</th><th>Diferencia</th><th>Viajes medidos</th></tr></thead>
        <tbody>
          <tr *ngFor="let r of lista">
            <td><b>{{ r.ruta }}</b><span class="af-sub" *ngIf="r.destino"> · {{ r.destino }}</span></td>
            <td>{{ r.diasProgramados }} día{{ r.diasProgramados === 1 ? '' : 's' }}</td>
            <td>{{ horas(r.horasReales) }}</td>
            <td [class.af-mas]="r.diferenciaHoras > 6" [class.af-menos]="r.diferenciaHoras < -6">{{ r.diferenciaHoras > 0 ? '+' : r.diferenciaHoras < 0 ? '−' : '' }}{{ horas(r.diferenciaHoras) }}</td>
            <td>{{ r.medidos }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `
})
export class DuracionRutasComponent extends TarjetaAnalisis {
  lista: DuracionRuta[] = [];
  protected calcular(): void { this.lista = duracionRealRutas(this.ds.S); }
  horas(h: number): string { return textoHoras(h); }
}
