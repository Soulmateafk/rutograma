import { Component, EventEmitter, Input, OnInit, Output, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DataService } from '../../services/data';
import { interpretar, filtrarViajes, Interpretacion, titularesPorPlaca, conductorDelViaje } from '../../services/buscar-hablado';
import { horaDelViaje } from '../../services/reglas-asignacion';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const EJEMPLOS = [
  'viajes de D1 la semana pasada', 'qué tiene LUN 428 mañana', 'cuántos viajes a Cali entregados en septiembre',
  'extras sin conductor esta semana', 'los viernes de octubre a Barranquilla', 'último viaje de Torres',
  'terceros del 1 al 15', 'por salir hoy en la tarde', 'Éxito sin Cali el mes pasado', 'más de 400 cajas la próxima semana'
];

/**
 * BÚSQUEDA HABLADA (desde el buscador de arriba): muestra qué entendió la
 * app de la frase, cuántos viajes encontró, un resumen y la lista. Al tocar
 * un viaje se abre en el Rutograma. La frase se puede seguir cambiando aquí.
 */
@Component({
  selector: 'app-busqueda-hablada',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './busqueda-hablada.html',
  styleUrl: './busqueda-hablada.css'
})
export class BusquedaHabladaComponent implements OnInit {
  @Input() consulta = '';
  @Output() cerrar = new EventEmitter<void>();
  private ds = inject(DataService);
  private router = inject(Router);

  public readonly ejemplos = EJEMPLOS;
  public texto = signal('');
  public mostrar = signal(80);
  private reloj: any;

  public interp = computed<Interpretacion | null>(() => this.texto().trim() ? interpretar(this.texto(), this.ds.S) : null);
  public viajes = computed<any[]>(() => {
    const it = this.interp();
    return it ? filtrarViajes(it.filtros, this.ds.S, v => horaDelViaje(v, this.ds.S?.rutas || [])) : [];
  });
  public ignoradas = computed<string[]>(() => (this.viajes() as any).ignoradas || []);
  public resumen = computed(() => {
    const l = this.viajes();
    const cuenta = (fn: (v: any) => boolean) => l.filter(fn).length;
    const porTr = new Map<string, number>();
    l.forEach(v => { const t = String(v.tr || v.transportadora || 'Makand'); porTr.set(t, (porTr.get(t) || 0) + 1); });
    return {
      total: l.length,
      entregados: cuenta(v => v.estado === 'Entregado'), enRuta: cuenta(v => v.estado === 'En ruta'),
      porSalir: cuenta(v => !v.estado || v.estado === 'Programado' || v.estado === 'Planificado'), cancelados: cuenta(v => v.estado === 'Cancelado'),
      cajas: l.reduce((s, v) => s + (Number(v.cajas) || 0), 0),
      vehiculos: new Set(l.map(v => String(v.p || v.placa || '').toUpperCase())).size,
      transportadoras: [...porTr.entries()].sort((a, b) => b[1] - a[1])
    };
  });

  ngOnInit(): void { this.texto.set(this.consulta || ''); }

  public escribir(valor: string): void {
    clearTimeout(this.reloj);
    this.reloj = setTimeout(() => { this.texto.set(valor); this.mostrar.set(80); }, 180);
  }
  public usarEjemplo(e: string): void { this.texto.set(e); this.mostrar.set(80); }

  public fecha(v: any): string {
    const [a, m, d] = String(v.fecha).slice(0, 10).split('-').map(Number);
    return `${DIAS[new Date(a, m - 1, d).getDay()]} ${d}/${m}`;
  }
  public hora(v: any): string { return horaDelViaje(v, this.ds.S?.rutas || []); }
  private titulares = computed(() => { this.texto(); return titularesPorPlaca(this.ds.S); });
  public conductor(v: any): string { return conductorDelViaje(v, this.titulares()); }
  public claseEstado(v: any): string { return 'bh-est-' + String(v.estado || 'Programado').toLowerCase().replace(/\s+/g, '-'); }

  public abrir(v: any): void {
    this.router.navigate(['/rutograma'], { queryParams: { verViaje: v.id } });
    this.cerrar.emit();
  }

  /** Lo encontrado en un CSV que abre Excel (separado por ";" y con tildes). */
  public descargar(): void {
    const filas = [['Fecha', 'Hora', 'Placa', 'Conductor', 'Ruta', 'Destino', 'Cliente', 'Transportadora', 'Estado', 'Cajas']];
    this.viajes().forEach(v => filas.push([String(v.fecha).slice(0, 10), this.hora(v), v.p || v.placa || '', this.conductor(v), v.ruta || v.codigo || '',
      v.destinoReal || v.destino || '', v.cliente || v.cli || '', v.tr || '', v.estado || 'Programado', String(v.cajas ?? '')]));
    const csv = '﻿' + filas.map(f => f.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `Busqueda_${this.texto().trim().slice(0, 40).replace(/[^\w\s-]/g, '').replace(/\s+/g, '_') || 'viajes'}.csv`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
}
