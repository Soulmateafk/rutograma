import { Component, inject, OnInit, OnDestroy, NgZone, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DataService } from '../../services/data'; // <--- Usamos este
import { UiService } from '../../services/ui.service';
import { AuthService } from '../../services/auth.service';
import { Configuracion } from '../configuracion/configuracion';

// 🚀 IMPORTAMOS LA LÓGICA PURA DESDE EL JAVASCRIPT
// @ts-ignore
import { 
  traducirTransportadoraJS, 
  exportarMesAExcelJS, 
  exportarHistoricoCompletoJS 
} from './historico.utils.js';

@Component({
  selector: 'app-historico',
  standalone: true,
  imports: [CommonModule, FormsModule, Configuracion],
  templateUrl: './historico.html',
  styleUrl: './historico.css',
})
export class Historico implements OnInit, OnDestroy {
  private ds = inject(DataService); // Inyectamos DataService
  private ui = inject(UiService);
  public auth = inject(AuthService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  public vista: string = 'historico';
  public detalle: any = null;
  
  // Accedemos al historial desde el estado global del servicio
  get historial() {
    return this.ds.S.historial || [];
  }

  public mesesShorthand: string[] = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  public coloresTransportadora: any = { makand: '#3b82f6', arsi: '#10b981', polar: '#f59e0b', tercero: '#8b5cf6' };

  // --- Filtros del listado "Meses guardados" — filtran sobre lo que ya
  // está cargado, sin pedirle nada nuevo al servidor. ---
  public filtroTransportadoraHist: string = '';
  public filtroAnioDesde: number | null = null;
  public filtroAnioHasta: number | null = null;

  public get historialFiltrado(): any[] {
    return this.historial.filter((h: any) => {
      if (this.filtroTransportadoraHist) {
        const datosTr = h.porTr?.[this.filtroTransportadoraHist];
        if (!datosTr || !datosTr.n) return false;
      }
      if (this.filtroAnioDesde != null && Number(h.anio) < this.filtroAnioDesde) return false;
      if (this.filtroAnioHasta != null && Number(h.anio) > this.filtroAnioHasta) return false;
      return true;
    });
  }

  public get hayFiltrosHistActivos(): boolean {
    return !!(this.filtroTransportadoraHist || this.filtroAnioDesde != null || this.filtroAnioHasta != null);
  }

  public limpiarFiltrosHistorico(): void {
    this.filtroTransportadoraHist = '';
    this.filtroAnioDesde = null;
    this.filtroAnioHasta = null;
  }

  ngOnInit(): void {
    // Los meses cerrados viven en el servidor (los ven todos los equipos).
    this.ds.cargarHistorico();
    // Sin esto, esta pantalla se queda mostrando los datos de cuando se
    // abrió para siempre, sin enterarse de la sincronización automática
    // de cada 20s (mismo bug ya encontrado y corregido en otras pantallas).
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  ngOnDestroy(): void {
    this.subDataChanged?.unsubscribe();
  }

  private subDataChanged?: Subscription;

  // Modal de confirmación propio — reemplaza confirm() nativo.
  public confirmDialogAbierto: boolean = false;
  public confirmDialogMensaje: string = '';
  public confirmDialogBtnAceptar: string = 'Aceptar';
  public confirmDialogBtnCancelar: string = 'Cancelar';
  private confirmDialogResolve: ((valor: boolean) => void) | null = null;

  private mostrarConfirmPersonalizado(mensaje: string, btnAceptar: string = 'Aceptar', btnCancelar: string = 'Cancelar'): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.confirmDialogMensaje = mensaje;
      this.confirmDialogBtnAceptar = btnAceptar;
      this.confirmDialogBtnCancelar = btnCancelar;
      this.confirmDialogResolve = resolve;
      this.confirmDialogAbierto = true;
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public confirmDialogElegir(valor: boolean): void {
    this.confirmDialogAbierto = false;
    const resolver = this.confirmDialogResolve;
    this.confirmDialogResolve = null;
    resolver?.(valor);
  }

  // ============================================================
  // TENDENCIA HISTÓRICA (gráficas de costo y viajes por mes)
  // ============================================================
  public readonly anchoGrafica = 600;
  public readonly altoGrafica = 160;

  /** Historial ordenado cronológicamente (el más viejo primero). */
  public get historialOrdenado(): any[] {
    return [...this.historial].sort((a, b) => {
      if (a.anio !== b.anio) return a.anio - b.anio;
      return a.mes - b.mes;
    });
  }

  public get etiquetasTendencia(): string[] {
    return this.historialOrdenado.map(h => `${this.mesesShorthand[h.mes] ?? ''} ${String(h.anio).slice(2)}`);
  }

  private calcularPuntos(valores: number[]): { x: number; y: number }[] {
    if (!valores.length) return [];
    const padding = 20;
    const max = Math.max(...valores, 1);
    const rango = max || 1; // la escala siempre arranca en 0, así se ve la magnitud real
    const pasoX = valores.length > 1 ? (this.anchoGrafica - padding * 2) / (valores.length - 1) : 0;

    return valores.map((v, i) => ({
      x: padding + i * pasoX,
      y: this.altoGrafica - padding - (v / rango) * (this.altoGrafica - padding * 2)
    }));
  }

  public get puntosCosto() {
    return this.calcularPuntos(this.historialOrdenado.map(h => h.costo || 0));
  }
  public get puntosViajes() {
    return this.calcularPuntos(this.historialOrdenado.map(h => h.totalViajes || 0));
  }
  public get lineaCosto(): string {
    return this.puntosCosto.map(p => `${p.x},${p.y}`).join(' ');
  }
  public get lineaViajes(): string {
    return this.puntosViajes.map(p => `${p.x},${p.y}`).join(' ');
  }

  public async cerrarMes(): Promise<void> {
    const nombreMes = new Date(this.ds.S.anio, this.ds.S.mes, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
    const viajes = this.ds.viajesDelMesVisible().filter((v: any) => v.estado !== 'Cancelado').length;
    if (!viajes) {
      this.ui.mostrarToast(`No hay viajes en ${nombreMes} para cerrar.`, 'err');
      return;
    }
    const yaCerrado = this.historial.some((h: any) => h.mes === this.ds.S.mes && h.anio === this.ds.S.anio);
    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Cerrar ${nombreMes} (${viajes} viajes) y guardarlo en el histórico?\n\n` +
      (yaCerrado ? 'Este mes ya estaba cerrado: se reemplaza con lo que hay ahora.\n' : '') +
      'Los viajes no se borran. Para cerrar otro mes, cámbialo arriba antes.',
      'Cerrar mes'
    );
    if (!confirmado) return;
    const r = await this.ds.cerrarMesActual();
    if (r.msg) this.ui.mostrarToast(r.msg, r.ok ? 'ok' : 'err');
    this.zone.run(() => this.cdr.detectChanges());
  }

  public getKeys(obj: any): string[] {
    return obj && typeof obj === 'object' ? Object.keys(obj) : [];
  }

  public tNom(k: string): string {
    return traducirTransportadoraJS(k);
  }

  public verDetHist(item: any): void {
    if (!item) return;
    this.detalle = item;
  }

  public exportarMes(item: any, event?: Event): void {
    if (event) event.stopPropagation();
    if (!item) return;

    const { blob, nombreArchivo } = exportarMesAExcelJS(item, new Date().toLocaleString());
    this.descargarArchivo(blob, nombreArchivo);
  }

  // Reporte mensual en PDF — mismo contenido que se ve en el panel de
  // detalle (resumen + liquidación por transportadora), pero en un
  // documento listo para imprimir o enviar por correo. Se genera del
  // lado del navegador (no toca el servidor para nada).
  public descargarPDF(item: any, event?: Event): void {
    if (event) event.stopPropagation();
    if (!item) return;
    const h = item;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text(`Reporte Mensual — ${h.label}`, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Generado el ${new Date().toLocaleString()}`, 14, 24);

    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(`Viajes totales: ${h.totalViajes}`, 14, 36);
    doc.text(`Cajas: ${h.totalCajas}`, 14, 43);
    doc.text(`Viajes extra: ${h.viajesExtra}`, 14, 50);
    doc.setFontSize(13);
    doc.text(`Costo total de operación: $ ${Number(h.costo || 0).toLocaleString('es-CO')}`, 14, 60);

    const filas = this.getKeys(h.porTr).map(k => {
      const fila = h.porTr[k];
      const pct = h.costo ? ((fila.costo / h.costo) * 100).toFixed(0) : '0';
      return [this.tNom(k), fila.n, fila.cajas, `$ ${Number(fila.costo || 0).toLocaleString('es-CO')}`, `${pct}%`];
    });

    autoTable(doc, {
      startY: 68,
      head: [['Transportadora', 'Viajes', 'Cajas', 'Costo', '% del total']],
      body: filas,
      headStyles: { fillColor: [30, 41, 59] }
    });

    doc.save(`reporte_${h.label.replace(/\s+/g, '_')}.pdf`);
  }

  public exportarHistorico(): void {
    if (!this.historial.length) { 
      this.ui.mostrarToast('Sin datos en histórico.', 'err');
      return; 
    }

    const { blob, nombreArchivo } = exportarHistoricoCompletoJS(this.historial, new Date().toLocaleString(), new Date().getFullYear());
    this.descargarArchivo(blob, nombreArchivo);
  }

  public async limpiarHistorico(): Promise<void> {
    const confirmado = await this.mostrarConfirmPersonalizado(
      '¿Borrar todo el histórico? Se guarda un respaldo antes, y se puede deshacer.',
      'Borrar todo'
    );
    if (!confirmado) return;
    const r = await this.ds.limpiarHistorial();
    if (r.msg) this.ui.mostrarToast(r.msg, r.ok ? 'ok' : 'err');
    this.zone.run(() => this.cdr.detectChanges());
  }


  private descargarArchivo(blob: Blob, nombre: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    a.click();
  }
}