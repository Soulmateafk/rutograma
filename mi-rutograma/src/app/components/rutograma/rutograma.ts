import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, HostListener, ViewChild, ElementRef, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { CommonModule } from '@angular/common';
import { ModalService } from '../../services/modal';
import { AuthService } from '../../services/auth.service';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser'; 
import { FormsModule } from '@angular/forms'; 
import * as XLSX from 'xlsx';
import { UiService } from '../../services/ui.service';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { viajeCerrado, motivoFechaAnterior, fechaDelDia } from '../../services/dias-cerrados';
import { FotoNovedadComponent } from '../foto-novedad/foto-novedad';
import { PresenciaService } from '../../services/presencia.service';
import { OtrosAquiComponent } from '../en-linea/otros-aqui';
import { revisarMes, rangoViaje, ProblemaViaje } from '../../services/revision-viajes';

// IMPORTACIONES DEL MOTOR LÓGICO
import { agruparViajes, prepararRutasEnriquecidas, hayConflicto, obtenerViajesEnConflicto, reprogramarSiguientesTrasEliminar, reprogramarViajesDesde, reprogramarViajeConflictivo, buscarViajesTercerosRobables, tomarViajeTerceroParaVehiculo, buscarVehiculosDisponiblesParaVarado, transferirViajeAOtroVehiculo, esDiaVarado, siguienteNumeroCupo as siguienteNumeroCupoCompartido, buscarCupoLibre as buscarCupoLibreCompartido } from './rutograma.utils.js';
import { API } from '../../api-base';
import { AtajosService } from '../../services/atajos.service';
import { zoomPagina } from '../../zoom';
import { ThemeService } from '../../services/theme.service';

interface Viaje {
  id: number;
  p: string;
  veh?: string;
  placa?: string;
  dia: number;
  estado: string; 
  tr: string;
  cssClass?: string;
  ruta?: string;
  salida?: any;
  retorno?: any;
  cond?: string;
  hora?: string;
  cajas?: number; 
  tipo?: string;
  fecha?: string;
  [key: string]: any; 
}

@Component({
  selector: 'app-rutograma',
  templateUrl: './rutograma.html',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, FotoNovedadComponent, OtrosAquiComponent], 
  styleUrls: ['./rutograma.css']
})
export class RutogramaComponent implements OnInit, OnDestroy {
  public debugStatus: string = 'Iniciando componente...';
  public debugError: string = 'Ninguno';

  public diasMes: number[] = [];
  public meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  
  public zoomPorcentaje: number = 100;

  // Resaltar una placa dentro de la cuadrícula — distinto de la
  // búsqueda global del navbar, que solo NAVEGA hasta esta pantalla
  // pero no marca ninguna fila en concreto una vez aquí.
  public busquedaVehiculoRuto: string = '';

  // Filtro por transportadora, clickeando la leyenda de colores — null
  // significa "mostrar todas". Solo Makand/Arsitrans/Polar son
  // filtrables (son categorías de VEHÍCULO); "Extra" y los de estado
  // (Entregado, En ruta, etc.) son por VIAJE, no por fila, así que se
  // quedan solo informativos como ya estaban.
  public filtroTransportadoraRuto: string | null = null;

  public alternarFiltroTransportadora(nombre: string): void {
    this.filtroTransportadoraRuto = this.filtroTransportadoraRuto === nombre ? null : nombre;
  }

  public filaVisiblePorTransportadora(v: any): boolean {
    if (!this.filtroTransportadoraRuto) return true;
    const tr = String(v.tr || v.transportadora || 'Makand').toLowerCase().trim();
    return tr === this.filtroTransportadoraRuto.toLowerCase();
  }
  @ViewChild('inputBusquedaVehiculoRuto') inputBusquedaVehiculoRuto?: ElementRef<HTMLInputElement>;

  // Quién guardó un viaje por última vez y cuándo. Lo anota el servidor en
  // cada guardado (ver guardarViajeVersionado en server.js). Un viaje que
  // nadie ha guardado desde que se activó ese registro no tiene el dato.
  public textoUltimaEdicion(v: any): string {
    const quien = this.ds.nombreDe(v?.editadoPor);
    const cuando = v?.editadoEn ? new Date(v.editadoEn) : null;
    const fechaValida = !!cuando && !isNaN(cuando.getTime());

    if (!quien && !fechaValida) {
      return 'Última edición: sin registro (nadie ha guardado este viaje desde que se activó el control de versiones)';
    }
    const fecha = fechaValida
      ? cuando!.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : '';
    return `Última edición: ${quien || 'usuario no identificado'}${fecha ? ' · ' + fecha : ''}`;
  }

  public esVehiculoResaltado(v: any): boolean {
    const q = this.busquedaVehiculoRuto.trim().toLowerCase();
    if (!q) return false;
    const placa = String(v.p || v.placa || '').toLowerCase();
    return placa.includes(q);
  }
  public isModalCupoOpen: boolean = false;
  public nuevoCupo: any = { rutaSeleccionada: null, cajas: 660 };
  public cupoError: string = '';
  public isModalDetalleOpen: boolean = false;
  public selectedViaje: any = null;

 
  public get retornoMostrado(): number {
    return this.selectedViaje ? Number(this.selectedViaje.retorno) - 1 : 0;
  }
  public set retornoMostrado(valor: number) {
    if (this.selectedViaje) {
      this.selectedViaje.retorno = Number(valor) + 1;
      
      this.selectedViaje.retornoManual = true;
    }
  }

  public selectedTr: string = ''; 
  
  public viajesAgrupados: any = {};

  
  public mapaDescansoPorPlacaDia: { [key: string]: any } = {};

  private recalcularMapaDescansoPorPlacaDia(): void {
    this.mapaDescansoPorPlacaDia = {};
    (this.ds.S.conductores || []).forEach((c: any) => {
      const placaLimpia = String(c.veh || c.placa || '').toUpperCase().trim();
      if (!placaLimpia) return;
      const dias = this.diasDescansoDelMesActivo(c);
      dias.forEach((dia: number) => {
        this.mapaDescansoPorPlacaDia[`${placaLimpia}-${dia}`] = c;
      });
    });
  }
  public rutasEnriquecidas: any[] = [];

  
  public rutasDisponiblesParaDia(): any[] {
    if (!this.nuevoCupo?.dia) return this.rutasEnriquecidas;

    const mapaDiasClave = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    const fecha = new Date(Number(this.ds.S.anio), Number(this.ds.S.mes), Number(this.nuevoCupo.dia));
    const claveDia = mapaDiasClave[fecha.getDay()];

    return this.rutasEnriquecidas.filter((r: any) => {
      if (!r.dias || typeof r.dias !== 'object') return true; // ruta sin horario = variable, cualquier día
      const cfgDia = r.dias[claveDia];
      return !!(cfgDia && cfgDia.checked);
    });
  }
  
  public conductoresMap: any = {};
  public transpMap: any = {};
  public rutasMap: any = {};

  public transpExt = [
    { clave: 'arsi', nombre: 'ARSITRANS', col: '#064e3b', colT: '#6ee7b7', placa: 'ARSI-?' },
    { clave: 'polar', nombre: 'POLAR', col: '#0c4a6e', colT: '#7dd3fc', placa: 'POLAR-?' }
  ];

  constructor(
    public ds: DataService, 
    private zone: NgZone, 
    private cdr: ChangeDetectorRef,
    private modalService: ModalService,
    public auth: AuthService,
    private sanitizer: DomSanitizer,
    private ui: UiService,
    private route: ActivatedRoute
  ) {}

  ngOnInit() {
    if (typeof window !== 'undefined') {
      this.cargarPendientesAprobacion();
      this.cargarNovedadesConductores();
      this.relojAprobaciones = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        this.cargarPendientesAprobacion();
        this.cargarNovedadesConductores();
      }, 20000);

    }
    this.ds.cargarEstadoLocal(); 
    
    this.ds.inicializarApp(true);

    
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.versionDatos++;
      this.zone.run(() => {
        this.recalcularResumenPorVehiculoMes();
        this.cdr.detectChanges();
      });
    });

    console.log("🔍 [DEBUG] ngOnInit ejecutado.");
    this.setDebugStatus('ngOnInit alcanzado. Leyendo cache...');

    // Atajo global "/" (ver navbar.ts) — llega aquí como query param
    // porque puede dispararse desde CUALQUIER pantalla, no solo estando
    // ya en el Rutograma.
    this.route.queryParams.subscribe(params => {
      if (params['enfocarBusqueda']) {
        setTimeout(() => this.inputBusquedaVehiculoRuto?.nativeElement.focus(), 0);
      }
      // Búsqueda rápida (Ctrl+K) -> abrir ese viaje. Si los datos todavía
      // no llegan, se abre apenas lleguen (ver abrirViajePedido).
      if (params['verViaje']) {
        this.viajePedido = String(params['verViaje']);
        setTimeout(() => this.abrirViajePedido(), 0);
      }
    });

    try {
      const cached = localStorage.getItem('rutograma_data');
      if (cached) { 
        this.ds.S = JSON.parse(cached);
      }
    } catch (e: any) {
      console.error("❌ [DEBUG] Error leyendo localStorage:", e);
      this.setDebugError(`Error localStorage: ${e.message}`);
    }

    try {
      if (this.ds && typeof (this.ds as any)['cargarEstadoSP'] === 'function') {
        (this.ds as any)['cargarEstadoSP']();
      }
    } catch(e: any) {
      console.error("❌ [DEBUG] Error en cargarEstadoSP():", e);
      this.setDebugError(`Error cargarEstadoSP: ${e.message}`);
    }

    this.iniciarCarga();
    this.verificarEstadosExpirados();
    this.detectarCambiosEnVivo();   // foto inicial para comparar con la próxima sincronización

    
    this.cargarDespachos(true);
    this.relojDespachos = setInterval(() => { if (document.visibilityState === 'visible') this.cargarDespachos(true); }, 60000);
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.iniciarCarga();
      this.detectarCambiosEnVivo();
      this.abrirViajePedido();
      this.cargarDespachos();
      this.cdr.detectChanges();
    });
  }

  private subDataChanged?: Subscription;

  // ============================================================
  // SEMANAS CERRADAS (backend/semana-bloqueada.js) — el jefe cierra la
  // programación de una semana; desde ahí cambiar su plan pide motivo
  // (lo pregunta data.ts) y queda en "cambios después del cierre".
  // ============================================================
  public cambiosCierreAbiertos = false;
  public cambiandoSemana = '';

  private lunesDeFecha(d: Date): Date {
    const l = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    l.setDate(l.getDate() - ((l.getDay() + 6) % 7));
    return l;
  }
  private fechaTexto(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** Semanas (lunes a domingo) que tocan el mes que se está viendo. */
  public get semanasCierre(): Array<{ lunes: string; texto: string; cerrada: any; cambios: number }> {
    const S = this.ds?.S;
    if (!S || S.anio === undefined || S.mes === undefined) return [];
    const bloqueadas: any[] = S.semanasBloqueadas || [];
    const cambios: any[] = S.cambiosSemanaBloqueada || [];
    const fin = new Date(Number(S.anio), Number(S.mes) + 1, 0);
    const semanas = [];
    for (let l = this.lunesDeFecha(new Date(Number(S.anio), Number(S.mes), 1)); l <= fin; l.setDate(l.getDate() + 7)) {
      const lunes = this.fechaTexto(l);
      const dom = new Date(l); dom.setDate(dom.getDate() + 6);
      semanas.push({
        lunes,
        texto: `${String(l.getDate()).padStart(2, '0')}/${String(l.getMonth() + 1).padStart(2, '0')} al ${String(dom.getDate()).padStart(2, '0')}/${String(dom.getMonth() + 1).padStart(2, '0')}`,
        cerrada: bloqueadas.find(b => b.lunes === lunes) || null,
        cambios: cambios.filter(c => c.lunes === lunes).length
      });
    }
    return semanas;
  }

  /** ¿Ese día del mes visible está en una semana cerrada? (candado en la cabecera) */
  public diaEnSemanaCerrada(dia: number): boolean {
    const S = this.ds?.S;
    if (!S?.semanasBloqueadas?.length) return false;
    const lunes = this.fechaTexto(this.lunesDeFecha(new Date(Number(S.anio), Number(S.mes), dia)));
    return S.semanasBloqueadas.some((b: any) => b.lunes === lunes);
  }

  /** Cambios hechos después del cierre en las semanas de este mes (más recientes primero). */
  public get cambiosDespuesCierre(): any[] {
    const lunes = new Set(this.semanasCierre.map(s => s.lunes));
    return (this.ds?.S?.cambiosSemanaBloqueada || []).filter((c: any) => lunes.has(c.lunes)).slice().reverse();
  }

  public textoSemanaDe(lunes: string): string {
    return this.semanasCierre.find(s => s.lunes === lunes)?.texto || lunes;
  }

  public fechaHoraCorta(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  public async alternarSemana(sem: { lunes: string; texto: string; cerrada: any }): Promise<void> {
    if (!this.auth.puedeAprobar || this.cambiandoSemana) return;
    const bloquear = !sem.cerrada;
    const ok = await this.mostrarConfirmPersonalizado(bloquear
      ? `¿Cerrar la semana del ${sem.texto}? Desde ahora, cambiar su programación (vehículo, conductor, ruta, cliente, cajas, fechas, cancelar o eliminar) pedirá un motivo y quedará anotado. Marcar Entregado y las observaciones siguen igual.`
      : `¿Abrir la semana del ${sem.texto}? Sus cambios ya no pedirán motivo.`,
      bloquear ? 'Cerrar semana' : 'Abrir semana', 'Cancelar');
    if (!ok) return;
    this.cambiandoSemana = sem.lunes;
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/semanas/bloqueo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lunes: sem.lunes, bloquear })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { this.ui.mostrarToast(data.msg || 'No se pudo cambiar la semana.', 'err'); return; }
      this.ds.S.semanasBloqueadas = data.semanasBloqueadas || [];
      this.ui.mostrarToast(data.msg, 'ok');
    } catch {
      this.ui.mostrarToast('Sin conexión con el servidor: la semana no cambió.', 'err');
    } finally {
      this.cambiandoSemana = '';
      this.cdr.detectChanges();
    }
  }

  // ============================================================
  // DESPACHO DE CADA VIAJE — lo que se anotó en Despachos para ese viaje
  // (cajas cargadas, horas, motivo de demora), en la tarjeta y en el
  // detalle. Se pide el mes que se está viendo, al abrir y cada minuto.
  // ============================================================
  public despachosPorViaje = new Map<string, any>();
  private mesDespachos = '';
  private despachosPedidosEn = 0;
  private relojDespachos: ReturnType<typeof setInterval> | null = null;

  private async cargarDespachos(forzar = false): Promise<void> {
    const S = this.ds?.S;
    if (!S || S.anio === undefined || S.mes === undefined || typeof window === 'undefined') return;
    const mes = `${S.anio}-${String(Number(S.mes) + 1).padStart(2, '0')}`;
    if (!forzar && mes === this.mesDespachos && Date.now() - this.despachosPedidosEn < 30000) return;
    this.despachosPedidosEn = Date.now();
    const ultimo = new Date(Number(S.anio), Number(S.mes) + 1, 0).getDate();
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/despachos?desde=${mes}-01&hasta=${mes}-${String(ultimo).padStart(2, '0')}`);
      const data = await res.json();
      if (!data?.ok) return;
      const mapa = new Map<string, any>();
      // Si un viaje tiene varios despachos, queda el más reciente.
      [...(data.registros || [])].reverse().forEach((r: any) => { if (r.viajeId) mapa.set(String(r.viajeId), r); });
      this.despachosPorViaje = mapa;
      this.mesDespachos = mes;
      this.cdr.markForCheck();
    } catch { /* sin conexión: se intenta en el próximo minuto */ }
  }

  public textoCargaDespacho(dsp: any): string {
    return (dsp?.cargas || []).map((c: any) => `${c.tipo}: ${c.cantidad}`).join(' · ');
  }

  public despachoDe(vj: any): any {
    return vj?.id !== undefined && vj?.id !== null ? this.despachosPorViaje.get(String(vj.id)) || null : null;
  }

  ngOnDestroy() {
    this.subDataChanged?.unsubscribe();
    if (this.relojDespachos) clearInterval(this.relojDespachos);
    if (this.relojAprobaciones) clearInterval(this.relojAprobaciones);
    this.presencia.limpiar();
  }

  // ============================================================
  // CAMBIOS ESPERANDO APROBACIÓN — quien puede aprobar ve un aviso
  // notable arriba; y todos ven "Cambio por aprobar" en los viajes que
  // tienen un cambio pendiente (el auxiliar, los suyos).
  // ============================================================
  public pendientesAprobacion: any[] = [];
  public viajesConCambioPendiente = new Set<string>();
  public horasPendienteMasViejo = 0;
  private relojAprobaciones: ReturnType<typeof setInterval> | null = null;

  public get textoAntiguedad(): string {
    const h = this.horasPendienteMasViejo;
    if (h < 1) return 'menos de una hora';
    if (h < 24) return `${Math.floor(h)} hora${Math.floor(h) === 1 ? '' : 's'}`;
    const d = Math.floor(h / 24);
    return `${d} día${d === 1 ? '' : 's'}`;
  }

  // ============================================================
  // NOVEDADES DE CONDUCTORES — lo que reportan desde el celular (varado,
  // retraso, accidente...) sale arriba del Rutograma hasta que alguien lo
  // marque como resuelto (se actualiza solo cada 20 s).
  // ============================================================
  public novedadesConductores: any[] = [];

  // ============================================================
  // REVISIÓN DEL MES (services/revision-viajes.ts): viajes de hoy en
  // adelante con documentos vencidos o que se cruzan con otro (mismo
  // vehículo o conductor). Se recalcula solo cuando cambian los datos (o el
  // mes, o la cantidad de viajes) y, por si acaso, cada 30 s; antes se
  // recalculaba cada 2 s y en computadores lentos trababa la página.
  // ============================================================
  private revisionCache: { clave: string; ts: number; lista: ProblemaViaje[] } = { clave: '', ts: 0, lista: [] };
  private versionDatos = 0;
  /** Minimizado por defecto: solo la línea que explica; al abrirlo, la lista. */
  public revisionAbierta = false;

  public get problemasDelMes(): ProblemaViaje[] {
    const S = this.ds.S;
    if (!S?.viajes) return [];
    const prefijo = `${S.anio}-${String(Number(S.mes) + 1).padStart(2, '0')}`;
    const clave = `${prefijo}|${S.viajes.length}|${this.versionDatos}`;
    const ahora = Date.now();
    if (clave === this.revisionCache.clave && ahora - this.revisionCache.ts < 30000) return this.revisionCache.lista;
    const h = new Date();
    const hoy = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    let lista: ProblemaViaje[] = [];
    try {
      // Lo que ya pasó no se puede corregir: solo viajes que aún no terminan.
      lista = revisarMes(S, prefijo).filter(p => (rangoViaje(p.viaje)?.hasta || '') > hoy);
    } catch (e) {
      console.error('Error revisando el mes:', e);
    }
    this.revisionCache = { clave, ts: ahora, lista };
    return lista;
  }

  public textoProblema(p: ProblemaViaje): string {
    return [...p.vencidos, ...p.choques.map(c => c.texto), ...(p.reglas || [])].join(' · ');
  }
  public resolviendoNovedad: string | null = null;

  private async cargarNovedadesConductores(): Promise<void> {
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/novedades/conductores`);
      const data = await res.json();
      if (!data?.ok) return;
      this.novedadesConductores = data.novedades || [];
      this.cdr.detectChanges();
    } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  }

  public haceCuanto(ts: number): string {
    const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if (min < 1) return 'hace un momento';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return h < 24 ? `hace ${h} h` : `hace ${Math.floor(h / 24)} día${h >= 48 ? 's' : ''}`;
  }

  public async resolverNovedadConductor(n: any): Promise<void> {
    if (this.resolviendoNovedad) return;
    this.resolviendoNovedad = n.id;
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/novedades/resolver`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: n.id })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 202) this.ui.mostrarToast('Enviado para aprobación del jefe.', 'ok');
      else if (!data?.ok) this.ui.mostrarToast(data?.msg || 'No se pudo marcar como resuelta.', 'err');
      else {
        const local = (this.ds.S.novedades || []).find((x: any) => String(x.id) === String(n.id));
        if (local) local.resuelta = true;
      }
      await this.cargarNovedadesConductores();
    } catch {
      this.ui.mostrarToast('Sin conexión: no se pudo marcar como resuelta.', 'err');
    }
    this.resolviendoNovedad = null;
    this.cdr.detectChanges();
  }

  private async cargarPendientesAprobacion(): Promise<void> {
    if (!this.auth.puedeAprobar && !this.auth.necesitaAprobacion) return;
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/aprobaciones`);
      const data = await res.json();
      if (!data?.ok) return;
      const pendientes = (data.solicitudes || [])
        .filter((s: any) => s.estado === 'PENDIENTE')
        .sort((a: any, b: any) => String(a.creada).localeCompare(String(b.creada)));
      this.pendientesAprobacion = pendientes;
      this.horasPendienteMasViejo = pendientes.length ? (Date.now() - Date.parse(pendientes[0].creada)) / 3600000 : 0;
      this.viajesConCambioPendiente = new Set(pendientes
        .filter((s: any) => String(s.ruta).startsWith('/api/viajes') && s.cuerpo?.id !== undefined)
        .map((s: any) => String(s.cuerpo.id)));
      this.cdr.detectChanges();
    } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  }

  
  public trackByViajeId(index: number, vj: any): any {
    return vj?.id ?? index;
  }

  
  public hayViajeRealEnCelda(placa: string, dia: number): boolean {
    const key = `${String(placa || '').toUpperCase().trim()}-${dia}`;
    return (this.viajesAgrupados?.[key] || []).some((x: any) => x.isStart);
  }

  
  private calcularVehiculosMakandParaEdicion(): { vehiculo: any; libre: boolean }[] {
    if (!this.selectedViaje) return [];
    const diaIni = Number(this.selectedViaje.salida ?? this.selectedViaje.dia);
    const diaFin = Number(this.selectedViaje.retorno ?? diaIni + 1);
    if (isNaN(diaIni) || isNaN(diaFin)) return [];

    return (this.ds.S.vehiculos || [])
      .filter((v: any) => {
        if (String(v.categoria || 'Viajero').trim() === 'Urbano') return false;
        if (String(v.tr || v.transportadora || '').toLowerCase().trim() !== 'makand') return false;
        return !!(v.p || v.placa);
      })
      .map((v: any) => {
        const placa = v.p || v.placa;
        const conflictos = obtenerViajesEnConflicto(placa, diaIni, diaFin, this.ds.S, this.selectedViaje.id);
        return { vehiculo: v, libre: conflictos.length === 0 };
      })
      .sort((a: any, b: any) => String(a.vehiculo.p || a.vehiculo.placa).localeCompare(String(b.vehiculo.p || b.vehiculo.placa)));
  }

  // Para la plantilla — solo LEE la caché, nunca recalcula.
  public vehiculosMakandTodosParaEdicion(): { vehiculo: any; libre: boolean }[] {
    return this.vehiculosMakandCache;
  }

  
  public vehiculosMakandDisponiblesParaEdicion(): any[] {
    return this.vehiculosMakandCache
      .filter(x => x.libre)
      .map(x => x.vehiculo);
  }

  // ============================================================
  

  // ============================================================
  public isModalConflictoPlacaOpen: boolean = false;
  public viajeConflictivoParaResolucion: any = null;
  private placaElegidaParaResolucion: string = '';

  public seleccionarPlacaMakandParaEdicion(nuevaPlaca: string): void {
    if (!nuevaPlaca || !this.selectedViaje) return;

    const diaIni = Number(this.selectedViaje.salida ?? this.selectedViaje.dia);
    const diaFin = Number(this.selectedViaje.retorno ?? diaIni + 1);
    const conflictivos = obtenerViajesEnConflicto(nuevaPlaca, diaIni, diaFin, this.ds.S, this.selectedViaje.id);

    if (!conflictivos.length) {
      // Placa libre — se aplica directo, como ya funcionaba.
      this.selectedViaje.p = nuevaPlaca;
      return;
    }

    // Placa ocupada — se pregunta qué hacer, sin aplicar nada todavía.
    this.placaElegidaParaResolucion = nuevaPlaca;
    this.viajeConflictivoParaResolucion = conflictivos[0];
    this.isModalConflictoPlacaOpen = true;
    this.zone.run(() => this.cdr.detectChanges());
  }

  public cerrarModalConflictoPlaca(): void {
    this.isModalConflictoPlacaOpen = false;
    this.viajeConflictivoParaResolucion = null;
    this.placaElegidaParaResolucion = '';
    // El selector vuelve a mostrar lo que había antes de intentar
    // elegir la placa ocupada (nunca se llegó a aplicar nada).
    this.zone.run(() => this.cdr.detectChanges());
  }

  // Opción 1: el viaje que ya estaba en esa placa se cancela, y el que
  // se está editando toma su lugar.
  public async resolverConflictoPlacaCambiar(): Promise<void> {
    const conflictivo = this.viajeConflictivoParaResolucion;
    const nuevaPlaca = this.placaElegidaParaResolucion;
    if (!conflictivo || !nuevaPlaca) return;

    conflictivo.estado = 'Cancelado';
    conflictivo.motivoCancelacion = `Reemplazado: la placa ${nuevaPlaca} se reasignó a otro viaje este mismo día.`;
    const ok = await this.ds.guardarViaje({ ...conflictivo });
    if (!ok) {
      this.ui.mostrarToast('No se pudo cancelar el viaje existente. Intenta de nuevo.', 'err');
      return;
    }

    this.selectedViaje.p = nuevaPlaca;
    this.isModalConflictoPlacaOpen = false;
    this.viajeConflictivoParaResolucion = null;
    this.placaElegidaParaResolucion = '';
    this.zone.run(() => this.cdr.detectChanges());
  }

  // Opción 2: el viaje que ya estaba se corre hacia adelante, al
  // siguiente día que le sirva sin chocar con nada más.
  public async resolverConflictoPlacaMoverAdelante(): Promise<void> {
    const conflictivo = this.viajeConflictivoParaResolucion;
    const nuevaPlaca = this.placaElegidaParaResolucion;
    if (!conflictivo || !nuevaPlaca) return;

    const nuevaFecha = reprogramarViajeConflictivo(conflictivo, this.ds.S);
    if (!nuevaFecha) {
      this.ui.mostrarToast('No hay ningún día más adelante en el mes donde quepa ese viaje sin chocar con otro.', 'err');
      return;
    }

    conflictivo.salida = nuevaFecha.dia;
    conflictivo.dia = nuevaFecha.dia;
    conflictivo.retorno = nuevaFecha.fin;
    const ok = await this.ds.guardarViaje({ ...conflictivo });
    if (!ok) {
      this.ui.mostrarToast('No se pudo mover el viaje existente. Intenta de nuevo.', 'err');
      return;
    }

    this.selectedViaje.p = nuevaPlaca;
    this.isModalConflictoPlacaOpen = false;
    this.viajeConflictivoParaResolucion = null;
    this.placaElegidaParaResolucion = '';
    this.zone.run(() => this.cdr.detectChanges());
  }

  // Opción 3: el viaje que ya estaba se pasa a un cupo de tercero
  // (Arsitrans/Polar) — se reutiliza un cupo libre de esa transportadora
  // si hay uno ese rango de días; si no, se crea uno numerado nuevo.
  public async resolverConflictoPlacaMoverATercero(nombreTr: 'Arsitrans' | 'Polar'): Promise<void> {
    const conflictivo = this.viajeConflictivoParaResolucion;
    const nuevaPlaca = this.placaElegidaParaResolucion;
    if (!conflictivo || !nuevaPlaca) return;

    let placaCupo = this.buscarCupoLibre(nombreTr, conflictivo.salida, conflictivo.retorno, conflictivo.id);
    if (!placaCupo) {
      const numeroCupo = this.siguienteNumeroCupo(nombreTr);
      placaCupo = `${nombreTr.toUpperCase()} ${numeroCupo}`;
      await this.asegurarVehiculoParaPlaca(placaCupo, nombreTr);
    }

    conflictivo.p = placaCupo;
    conflictivo.veh = placaCupo;
    conflictivo.placa = placaCupo;
    conflictivo.tr = nombreTr;
    conflictivo.transportadora = nombreTr;
    // Arsitrans/Polar siempre están libres al día siguiente, sin
    // importar la ruta que manejen.
    conflictivo.retorno = Number(conflictivo.salida) + 1;

    const ok = await this.ds.guardarViaje({ ...conflictivo });
    if (!ok) {
      this.ui.mostrarToast('No se pudo mover el viaje existente a un tercero. Intenta de nuevo.', 'err');
      return;
    }

    this.selectedViaje.p = nuevaPlaca;
    this.isModalConflictoPlacaOpen = false;
    this.viajeConflictivoParaResolucion = null;
    this.placaElegidaParaResolucion = '';
    Promise.resolve().then(() => {
      this.zone.run(() => {
        this.iniciarCarga();
        this.cdr.detectChanges();
      });
    });
  }

  // Para una celda que NO es el viaje real (isStart:false) pero sigue
  // perteneciendo a ese viaje — dice si esa celda cae dentro de los
  // "Días en tránsito" configurados en la ruta (label "Tránsito") o ya
  // en los "Días de retorno" (label "Retorno"), contando desde el día
  // de salida real del viaje al que pertenece esta celda.
  public etiquetaTransito(vj: any, diaActual: number): string {
    const ruta = (this.ds.S?.rutas || []).find((r: any) =>
      String(r.cod || r.codigo || '') === String(vj.ruta)
    );
    const diasTrans = Number(ruta?.diasTrans || 1);
    const diasDesc = Number(ruta?.diasDesc || 0);
    const diaSalida = Number(vj.salida ?? vj.dia);
    const offset = diaActual - diaSalida; // 1 = primer día después de salir

    // BUG REAL encontrado: cuando "Días de retorno" es EXACTAMENTE 1, el
    // único día conceptual de retorno coincide matemáticamente con el
    // día del viaje nuevo (que ya tiene su propia tarjeta real) — así que
    // "Retorno" nunca llegaba a aparecer, aunque la ruta sí tuviera
    // diasDesc configurado. Con diasDesc=0 (sin retorno extra) o >=2 (ya
    // queda al menos un día visible de sobra) esto no pasaba — se ajusta
    // el umbral SOLO para el caso de 1, sin tocar los otros dos.
    const umbralTransito = diasDesc === 1 ? diasTrans - 1 : diasTrans;
    return offset <= umbralTransito ? 'Tránsito' : 'Retorno';
  }

  // Pulido visual: tooltip personalizado (no el nativo del navegador, que
  // no se puede stylear) con el detalle completo de un viaje. Se posiciona
  // con "fixed" y sigue al mouse en vez de ser hijo de la celda — así no
  // lo recorta el overflow-x:auto de la tabla cuando aparece cerca de un
  // borde o de una fila de arriba.
  public tooltipVisible = false;
  public tooltipX = 0;
  public tooltipY = 0;
  public tooltipDatos: { placa: string; ruta: string; transportadora: string; conductor: string; estado: string; hora: string; cajas: number; dia: any } | null = null;

  public mostrarTooltipViaje(event: MouseEvent, vj: any, v: any): void {
    this.tooltipDatos = {
      placa: v?.p || vj?.p || vj?.placa || '',
      ruta: vj?.destino || vj?.ruta || 'Sin ruta',
      transportadora: vj?.tr || 'Makand',
      conductor: vj?.cond || this.conductoresMap[v?.p] || 'Sin conductor',
      estado: vj?.estado || 'PROG',
      hora: vj?.hora || vj?.horaEntrega || '--:--',
      cajas: vj?.cajas ?? 660,
      dia: vj?.dia ?? ''
    };
    this.posicionarTooltipViaje(event);
    this.tooltipVisible = true;
  }

  public moverTooltipViaje(event: MouseEvent): void {
    this.posicionarTooltipViaje(event);
  }

  // Evita que el tooltip se salga de la pantalla cuando el mouse está
  // cerca del borde derecho o inferior — lo "voltea" hacia el otro lado
  // del cursor en vez de recortarse.
  private posicionarTooltipViaje(event: MouseEvent): void {
    const anchoTooltip = 260;
    const altoTooltip = 160;
    const margen = 16;

    const z = zoomPagina(); // tamaño de letra: medidas en la escala de la página
    const cx = event.clientX / z, cy = event.clientY / z;
    let x = cx + margen;
    let y = cy + margen;

    if (x + anchoTooltip > window.innerWidth / z) {
      x = cx - anchoTooltip - margen;
    }
    if (y + altoTooltip > window.innerHeight / z) {
      y = cy - altoTooltip - margen;
    }

    this.tooltipX = Math.max(4, x);
    this.tooltipY = Math.max(4, y);
  }

  public ocultarTooltipViaje(): void {
    this.tooltipVisible = false;
    this.tooltipDatos = null;
  }

  public trackByVehiculo(index: number, v: any): string {
    return v.p + v.estado; 
  }

  // Los vehículos normales (Makand, etc.) quedan en su mismo orden de
  // siempre. Las placas de cupo numeradas (ARSITRANS 1, ARSITRANS 2,
  // POLAR 1, POLAR 2...) se agrupan por transportadora y se ordenan por
  // su número, en vez de aparecer mezcladas en el orden en que se fueron
  // creando. No cambia ningún dato, solo el orden en que se ven las filas.
  private clasificarCupo(v: any) {
    const tr = String(v.tr || v.transportadora || '').toLowerCase().trim();
    const esCupo = tr.includes('arsitran') || tr.includes('polar');
    if (!esCupo) return { esCupo: false, prefijo: '', numero: 0 };
    const placa = String(v.p || v.placa || '').trim();
    const m = placa.match(/(\d+)\s*$/); // el número al final de la placa, si lo tiene
    return { esCupo: true, prefijo: tr.includes('arsitran') ? 'ARSITRANS' : 'POLAR', numero: m ? Number(m[1]) : 0 };
  }

  public vehiculosOrdenados(): any[] {
    // El Rutograma solo usa placas Viajero y Tercero — las Urbano (entregas
    // locales, nunca aparecen en esta matriz) se excluyen aquí, solo para
    // esta vista. No se toca ds.S.vehiculos (eso seguiría teniendo los
    // Urbano intactos para la pantalla de Vehículos).
    const vehiculos = (this.ds?.S?.vehiculos || []).filter((v: any) => String(v.categoria || 'Viajero').trim() !== 'Urbano');

    return [...vehiculos].sort((a, b) => {
      const ca = this.clasificarCupo(a);
      const cb = this.clasificarCupo(b);

      if (!ca.esCupo && !cb.esCupo) {
        // Vehículos propios (Makand, etc.): orden alfabético/numérico por
        // placa — 'numeric: true' hace que "QIZ 764" salga antes que
        // "QIZ 765" comparando el número como número, no como texto.
        const placaA = String(a.p || a.placa || '');
        const placaB = String(b.p || b.placa || '');
        return placaA.localeCompare(placaB, 'es', { numeric: true, sensitivity: 'base' });
      }
      if (!ca.esCupo) return -1; // los normales van antes que los cupos numerados
      if (!cb.esCupo) return 1;

      if (ca.prefijo !== cb.prefijo) return ca.prefijo.localeCompare(cb.prefijo);
      return ca.numero - cb.numero;
    });
  }

  // Solo la flota propia (Makand, etc.), en el mismo orden que ya daba
  // vehiculosOrdenados(). Se usa para pintar ese bloque primero en la
  // tabla, dejando los cupos de terceros para después de "+ Añadir viaje".
  public vehiculosPropiosOrdenados(): any[] {
    return this.vehiculosOrdenados().filter(v => !this.clasificarCupo(v).esCupo);
  }

  // Solo los cupos numerados de terceros (ARSITRANS 1, POLAR 2, etc.), ya
  // ordenados por transportadora y número. Puede venir vacío (por ejemplo,
  // recién regenerado el mes y todavía no hizo falta ningún cupo) — las
  // filas de "+ Añadir viaje" (transpExt) se pintan aparte, siempre, sin
  // depender de que exista ya algún cupo numerado.
  public vehiculosCupoOrdenados(): any[] {
    return this.vehiculosOrdenados().filter(v => this.clasificarCupo(v).esCupo);
  }

  // Los cupos numerados de UNA sola transportadora (ej. solo "ARSITRANS"),
  // para poder pintar el encabezado de color de esa transportadora justo
  // antes de su propio grupo de filas, en vez de un único separador
  // genérico para las dos.
  public vehiculosCupoDeTransportadora(nombre: string): any[] {
    return this.vehiculosCupoOrdenados().filter(v => this.clasificarCupo(v).prefijo === nombre);
  }

  // --- SOLUCIÓN AL ERROR NG0100 (Evita colisiones de renderizado) ---
  public setDebugStatus(msg: string) {
    if (this.debugStatus !== msg) {
      Promise.resolve().then(() => {
        this.debugStatus = msg;
        this.cdr.detectChanges();
      });
    }
  }

  public setDebugError(err: string) {
    if (this.debugError !== err) {
      Promise.resolve().then(() => {
        this.debugError = err;
        this.cdr.detectChanges();
      });
    }
  }

  public safeHtml(htmlContent: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(htmlContent || '');
  }

  // --- BLINDAJE ANTI-NaN: Valida y formatea números para evitar datos corruptos ---
  private parseNumSafe(val1: any, val2: any, fallback: number): number {
    let num = Number(val1 !== undefined ? val1 : val2);
    return isNaN(num) || num <= 0 ? fallback : num;
  }

  // --- ID ESTABLE POR VIAJE ---
  // Antes el id era un contador de posición (idCounter++), así que el
  // mismo viaje real recibía un número distinto cada vez que se
  // reimportaba el Excel o se resincronizaba con el servidor. Eso
  // provocaba que verDetalle() abriera el viaje equivocado (el id ya
  // le pertenecía a otro) y que agruparViajes() no reconociera dos
  // copias del mismo viaje como duplicadas (ids distintos = "diferentes").
  // Este hash se calcula SOLO a partir de placa+ruta+día, que no cambian
  // entre importaciones, así el mismo viaje real siempre da el mismo id.
  private idEstableViaje(placa: string, ruta: string, dia: number): number {
    const str = `${String(placa || '').toUpperCase().trim()}|${String(ruta || '').toUpperCase().trim()}|${dia}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0; // 32-bit, determinístico
    }
    return hash;
  }

  // --- MANTENIMIENTO CON RANGO DE FECHAS (inicio y fin) ---
  public isModalMantenimientoOpen: boolean = false;
  public vehiculoMantenimientoActivo: any = null;
  // Fechas completas ("2026-08-03"), no números de día — así no se confunde
  // entre meses distintos, sin importar qué mes esté viendo el Rutograma.
  public mantForm: { inicio: string | null; fin: string | null } = { inicio: null, fin: null };

  private aISOLocal(d: Date): string {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  // Al hacer clic en el punto ●: si el vehículo ya está en mantenimiento,
  // abre el formulario con sus fechas actuales (para ajustarlas o quitarlo);
  // si no, lo abre con hoy como inicio sugerido.
  public abrirMantenimiento(vehiculo: any): void {
    if (!vehiculo) return;
    this.vehiculoMantenimientoActivo = vehiculo;
    if (vehiculo.estado === 'Mantenimiento') {
      this.mantForm = { inicio: vehiculo.mantInicio || this.aISOLocal(new Date()), fin: vehiculo.mantFin || null };
    } else {
      this.mantForm = { inicio: this.aISOLocal(new Date()), fin: null };
    }
    this.isModalMantenimientoOpen = true;
  }

  public cerrarMantenimiento(): void {
    this.isModalMantenimientoOpen = false;
    this.vehiculoMantenimientoActivo = null;
  }

  // Cancela cualquier viaje de este vehículo cuya fecha caiga dentro del
  // rango de mantenimiento — el mantenimiento gana: si el vehículo no va a
  // estar disponible, el viaje que tenía agendado ahí no se puede hacer.
  private async cancelarViajesEnRango(placa: string, fechaInicio: string, fechaFin: string): Promise<void> {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    const afectados = (this.ds.S.viajes || []).filter((v: any) => {
      const pViaje = String(v.p || v.placa || '').toUpperCase().trim();
      if (pViaje !== placaLimpia) return false;
      if (v.estado === 'Cancelado') return false;
      const fechaViaje = v.fecha || '';
      if (!fechaViaje) return false;
      return fechaViaje >= fechaInicio && fechaViaje <= fechaFin;
    });

    for (const v of afectados) {
      v.estado = 'Cancelado';
      await this.ds.guardarViaje({ ...v });
    }
  }

  // Misma traba que en vehiculos.ts: sin esto, un segundo clic (o Enter)
  // mientras un confirm()/alert() seguía abierto disparaba la función
  // otra vez en paralelo, repitiendo la misma pregunta.
  public procesandoMantenimiento: boolean = false;

  public async guardarMantenimiento(): Promise<void> {
    if (this.procesandoMantenimiento) return;
    this.procesandoMantenimiento = true;
    try {
      await this.guardarMantenimientoInterno();
    } finally {
      this.procesandoMantenimiento = false;
    }
  }

  private async guardarMantenimientoInterno(): Promise<void> {
    const vehiculo = this.vehiculoMantenimientoActivo;
    if (!vehiculo) return;

    if (!this.mantForm.inicio || !this.mantForm.fin) {
      this.ui.mostrarToast('Selecciona la fecha de inicio y la fecha de fin del mantenimiento.', 'err');
      return;
    }
    if (this.mantForm.fin < this.mantForm.inicio) {
      this.ui.mostrarToast('La fecha de fin no puede ser antes de la fecha de inicio.', 'err');
      return;
    }

    const index = this.ds.S.vehiculos.findIndex((v: any) => v.p === vehiculo.p);
    if (index === -1) return;

    // Mismo motivo que en vehiculos.ts: Vehículos guarda el estado en
    // "est", Rutograma en "estado" — dos campos para lo mismo. Se
    // escriben ambos siempre, juntos, para que nunca queden
    // desincronizados sin importar desde qué pantalla se edite (si solo
    // se limpia uno al quitar el mantenimiento, el otro se queda
    // diciendo "Mantenimiento" sin fechas, y eso termina bloqueando
    // TODOS los días del vehículo en vez de ninguno).
    this.ds.S.vehiculos[index].estado = 'Mantenimiento';
    this.ds.S.vehiculos[index].est = 'Mantenimiento';
    this.ds.S.vehiculos[index].mantInicio = this.mantForm.inicio;
    this.ds.S.vehiculos[index].mantFin = this.mantForm.fin;

    await this.cancelarViajesEnRango(vehiculo.p, this.mantForm.inicio, this.mantForm.fin);

    // Mismo comportamiento que ya tiene vehiculos.ts: el viaje que ya
    // estuviera agendado DESPUÉS del mantenimiento se acomoda justo al
    // día siguiente de que termine, para que el vehículo vuelva a estar
    // en ruta apenas sale del taller. Si no había nada propio para
    // acomodar ahí, se revisa si algún tercero (Arsitrans/Polar) tiene
    // ese mismo día un viaje de ruta corta (1 o 2 días de tránsito) —de
    // ser así, se le puede "quitar" y dárselo a este vehículo, con
    // confirmación previa (y con selección si hay más de un candidato).
    const v = this.ds.S.vehiculos[index];
    const finMant = new Date(this.mantForm.fin + 'T00:00:00');
    if (finMant.getFullYear() === Number(this.ds.S.anio) && finMant.getMonth() === Number(this.ds.S.mes)) {
      const diaSiguiente = finMant.getDate() + 1;
      const totalDiasMes = new Date(Number(this.ds.S.anio), Number(this.ds.S.mes) + 1, 0).getDate();

      if (diaSiguiente <= totalDiasMes) {
        const cambiados = reprogramarViajesDesde(v.p, diaSiguiente, this.ds.S);
        for (const vj of cambiados) {
          vj.tipo = 'extra';
          await this.ds.guardarViaje({ ...vj });
        }

        const sePudoAcomodar = cambiados.some((vj: any) => Number(vj.dia) === diaSiguiente);

        if (!sePudoAcomodar) {
          const candidatos = buscarViajesTercerosRobables(diaSiguiente, this.ds.S);
          let elegido: any = null;

          if (candidatos.length === 1) {
            elegido = candidatos[0];
          } else if (candidatos.length > 1) {
            const opciones = candidatos.map((c: any) => ({
              etiqueta: `${c.tr || c.transportadora} — ${c.ruta || c.codigo} (${c.cli || c.cliente || 'sin cliente'})`,
              valor: c
            }));
            elegido = await this.mostrarSeleccionPersonalizada(
              `${v.p} queda libre el día ${diaSiguiente} y hay varios viajes de terceros ese mismo día — ¿cuál le damos?`,
              opciones
            );
          }

          if (elegido) {
            const confirmarRobo = await this.mostrarConfirmPersonalizado(
              `${v.p} queda libre el día ${diaSiguiente} pero no tiene ningún viaje propio agendado ahí.\n\n` +
              `El viaje "${elegido.ruta || elegido.codigo}" de ${elegido.tr || elegido.transportadora} cae ese mismo día.`,
              `Quitárselo y dárselo a ${v.p}`,
              `Dejarlo donde está`
            );

            if (confirmarRobo) {
              tomarViajeTerceroParaVehiculo(elegido, v.p, this.ds.S);
              await this.ds.guardarViaje({ ...elegido });

              const diaIniRobo = Number(elegido.salida ?? elegido.dia);
              const diaFinRobo = Number(elegido.retorno);
              const conflictivosRobo = obtenerViajesEnConflicto(v.p, diaIniRobo, diaFinRobo, this.ds.S, elegido.id);
              const idsYaReacomodadosRobo: any[] = [elegido.id];
              for (const viejo of conflictivosRobo) {
                const nuevaFecha = reprogramarViajeConflictivo(viejo, this.ds.S);
                if (nuevaFecha) {
                  const fechaObj = new Date(this.ds.S.anio, this.ds.S.mes, nuevaFecha.dia);
                  viejo.dia = nuevaFecha.dia;
                  viejo.salida = nuevaFecha.dia;
                  viejo.retorno = nuevaFecha.fin;
                  viejo.fecha = `${fechaObj.getFullYear()}-${String(fechaObj.getMonth() + 1).padStart(2, '0')}-${String(fechaObj.getDate()).padStart(2, '0')}`;
                  await this.ds.guardarViaje({ ...viejo });
                  idsYaReacomodadosRobo.push(viejo.id);
                }
              }
              const cambiadosPorRobo = reprogramarViajesDesde(v.p, diaFinRobo, this.ds.S, idsYaReacomodadosRobo);
              for (const vj of cambiadosPorRobo) {
                vj.tipo = 'extra';
                await this.ds.guardarViaje({ ...vj });
              }
            }
          } else {
            this.ui.mostrarToast(
              `${v.p} queda libre el día ${diaSiguiente}, pero ninguna de sus rutas agendadas corre ese día, y no hay viaje de terceros para tomar.<br>Agrégalo a mano con "+ Viaje Extra" si hace falta.`,
              'err'
            );
          }
        }
      }
    }

    this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
    this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
    this.cdr.detectChanges();

    await this.ds.guardarVehiculo(this.ds.S.vehiculos[index], index);
    this.cerrarMantenimiento();
  }

  public async quitarMantenimiento(): Promise<void> {
    if (this.procesandoMantenimiento) return;
    this.procesandoMantenimiento = true;
    try {
      await this.quitarMantenimientoInterno();
    } finally {
      this.procesandoMantenimiento = false;
    }
  }

  private async quitarMantenimientoInterno(): Promise<void> {
    const vehiculo = this.vehiculoMantenimientoActivo;
    if (!vehiculo) return;

    const index = this.ds.S.vehiculos.findIndex((v: any) => v.p === vehiculo.p);
    if (index === -1) return;

    this.ds.S.vehiculos[index].estado = 'Disponible';
    this.ds.S.vehiculos[index].est = 'Disponible'; // Mismo motivo que en guardarMantenimiento() — mantener ambos campos sincronizados
    this.ds.S.vehiculos[index].mantInicio = null;
    this.ds.S.vehiculos[index].mantFin = null;

    this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
    this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
    this.cdr.detectChanges();

    await this.ds.guardarVehiculo(this.ds.S.vehiculos[index], index);
    this.cerrarMantenimiento();
  }

  public esDiaMantenimiento(vehiculo: any, dia: number): boolean {
    // Vehículos guarda el estado en "est"; Rutograma (el punto ●) lo
    // guarda en "estado" — dos pantallas, dos nombres de campo distintos
    // para lo mismo. Antes esto solo revisaba "estado", así que si ponías
    // el mantenimiento desde Vehículos (que es de donde realmente lo usas),
    // el Rutograma nunca se enteraba y no mostraba la tarjeta.
    const estadoVehiculo = String(vehiculo?.est || vehiculo?.estado || '').toLowerCase().trim();
    if (!vehiculo || estadoVehiculo !== 'mantenimiento') return false;

    // Reconstruimos la fecha REAL de esta celda (con el mes/año que se está
    // viendo) y la comparamos contra las fechas guardadas — así nunca se
    // confunde un "día 3" de un mes con el "día 3" de otro.
    const fechaCelda = this.aISOLocal(new Date(this.ds.S.anio, this.ds.S.mes, dia));

    const fechaInicio = vehiculo.mantInicio || fechaCelda; // sin fecha guardada: asumimos que ya empezó
    if (fechaCelda < fechaInicio) return false;

    // Si tiene fecha de fin, el mantenimiento no bloquea después de ese día.
    // Si no tiene (dato viejo, de antes de este arreglo), se mantiene
    // abierto como antes, hasta que alguien lo quite manualmente.
    if (vehiculo.mantFin && fechaCelda > vehiculo.mantFin) return false;

    // Si ya pasó por completo la fecha de fin (aunque nadie le haya dado
    // "Quitar mantenimiento" todavía), ya no se pinta como mantenimiento
    // ACTIVO — esos días pasan a verse en rojo como "estuvo en
    // mantenimiento" (ver estuvoEnMantenimiento), no en gris.
    const hoyISO = this.aISOLocal(new Date());
    if (vehiculo.mantFin && hoyISO > vehiculo.mantFin) return false;

    // El mantenimiento manda siempre dentro de su rango de fechas — no
    // importa si ya había un viaje programado o si el vehículo estaba "en
    // tránsito" ese día (por ejemplo, un viaje largo que arrancó antes de
    // que empezara el mantenimiento). Antes, esta función se rendía en
    // ese caso y dejaba que se seguiera viendo el viaje/tránsito en vez
    // de la tarjeta de mantenimiento.
    return true;
  }

  // Un día se pinta en rojo como "estuvo en mantenimiento" cuando cae
  // dentro de un rango de mantenimiento que YA TERMINÓ — ya sea porque
  // pasó la fecha de fin sola, o porque alguien le dio "Quitar
  // mantenimiento" (ese rango queda archivado en historialMantenimiento).
  // Nunca se solapa con la tarjeta gris de mantenimiento ACTIVO.
  // Cuando un viaje se transfiere por mantenimiento (ver
  // cancelarViajesEnRango en vehiculos.ts), el viaje queda marcado con
  // "placaOriginal" = la placa que entró al taller. Esto busca ese
  // viaje para mostrar en la tarjeta de Mantenimiento a qué placa se
  // movió, en vez de solo decir "estuvo en el taller" sin más detalle.
  public viajeMovidoPorMantenimiento(placaOriginal: string, dia: number): any {
    const fechaCelda = this.aISOLocal(new Date(this.ds.S.anio, this.ds.S.mes, dia));
    const placaLimpia = String(placaOriginal || '').toUpperCase().trim();
    return (this.ds.S.viajes || []).find((v: any) =>
      String(v.placaOriginal || '').toUpperCase().trim() === placaLimpia &&
      v.fecha === fechaCelda
    ) || null;
  }

  public estuvoEnMantenimiento(vehiculo: any, dia: number): boolean {
    if (!vehiculo) return false;
    const fechaCelda = this.aISOLocal(new Date(this.ds.S.anio, this.ds.S.mes, dia));
    const hoyISO = this.aISOLocal(new Date());

    // Caso 1: el mantenimiento actual (mantInicio/mantFin) ya concluyó
    // por fecha, pero nadie lo ha quitado todavía.
    if (vehiculo.mantInicio && vehiculo.mantFin && hoyISO > vehiculo.mantFin) {
      if (fechaCelda >= vehiculo.mantInicio && fechaCelda <= vehiculo.mantFin) return true;
    }

    // Caso 2: mantenimientos ya quitados a mano, archivados en el historial.
    const historial = Array.isArray(vehiculo.historialMantenimiento) ? vehiculo.historialMantenimiento : [];
    return historial.some((h: any) => h?.inicio && h?.fin && fechaCelda >= h.inicio && fechaCelda <= h.fin);
  }

  public getViajeVisual(vj: Viaje): Viaje {
    if (!this.ds?.S?.mantenimientos) return vj;
    const placa = String(vj.p || vj.veh || '').toUpperCase().trim();
    
    const mant = this.ds.S.mantenimientos.find((m: any) => 
      String(m.placa || '').toUpperCase().trim() === placa &&
      vj.dia >= m.inicio && vj.dia <= m.fin
    );

    if (mant) {
      return {
        ...vj,
        estado: 'Mantenimiento',
        cond: 'EN MANTENIMIENTO',
        hora: '--:--',
        cssClass: 'bg-mantenimiento'
      };
    }
    return vj;
  }

  // agruparViajes() arma las celdas SOLO por número de día (1 a 31), sin
  // fijarse en el mes/año — como el servidor manda TODOS los viajes juntos
  // (julio, agosto, el mes que sea, todos en el mismo arreglo), un viaje
  // real de otro mes con el mismo número de día se colaba en la columna
  // equivocada (ej. un viaje del 31 de agosto aparecía en la columna "31"
  // mientras ves julio). Este filtro se queda SOLO con los viajes del
  // mes/año que el Rutograma está mostrando ahora mismo.
  private viajesDelMesActual(): any[] {
    if (!this.ds?.S?.viajes) return [];
    const mesTexto = this.meses[this.ds.S.mes];
    const anioActual = Number(this.ds.S.anio);
    return this.ds.S.viajes.filter((v: any) => {
      // Un viaje cancelado (por ejemplo, porque el vehículo entró en
      // mantenimiento esos días) ya se muestra con su propia tarjeta roja
      // en agruparViajes — aquí ya no se esconde del todo.
      // Si el viaje no trae mes/año (dato viejo, de antes de este arreglo),
      // lo dejamos pasar para no hacer desaparecer nada de golpe.
      if (v.mes === undefined && v.anio === undefined) return true;
      return v.mes === mesTexto && Number(v.anio) === anioActual;
    });
  }

  public iniciarCarga() {
    if (!this.ds) {
      this.setDebugStatus('CRÍTICO: DataService no existe.');
      return;
    }
    if (!this.ds.S) { this.ds.S = {}; }
    
    const anioAct = this.ds.S.anio || new Date().getFullYear();
    const mesAct = this.ds.S.mes ?? new Date().getMonth();
    this.ds.S.anio = anioAct;
    this.ds.S.mes = mesAct;

    try {
      const date = new Date(anioAct, mesAct + 1, 0);
      this.diasMes = Array.from({ length: date.getDate() }, (_, i) => i + 1);
    } catch (e: any) {
      console.error("❌ Error generando días del mes:", e);
    }

    try {
      this.rutasMap = this.ds.S.rutas?.reduce((acc: any, r: any) => ({ ...acc, [r.cod]: r.dest }), {}) || {};
      this.transpMap = this.ds.S.transportadoras?.reduce((acc: any, t: any) => ({ ...acc, [t.clave]: t.nombre.split(' ')[0] }), {}) || {};
      
      this.conductoresMap = {};
      if (this.ds.S.conductores) {
        this.ds.S.conductores.forEach((c: any) => {
          const placaKey = String(c.veh || c.placa || c.p || '').toUpperCase().trim();
          if (placaKey) this.conductoresMap[placaKey] = c.nom || c.conductor;
        });
      }

      const vehiculosMaestroMap: any = {};
      if (this.ds.S.vehiculos) {
        this.ds.S.vehiculos.forEach((v: any) => {
          const placaKey = String(v.p || v.placa || v.veh || '').toUpperCase().trim();
          if (placaKey) {
            v.p = placaKey;
            v.tipo = v.tipo || v.t || 'Furgon refrigerado';
            v.cajas = this.parseNumSafe(v.cajas, v.capacidad || v.cap, 660);
            v.kg = this.parseNumSafe(v.kg, v.peso, 8000);
            v.m3 = this.parseNumSafe(v.m3, v.volumen, 32);
            v.conductor = v.conductor || v.cond || v.nom || 'Sin asignar';
            v.estado = v.estado || v.est || 'Disponible';
            
            vehiculosMaestroMap[placaKey] = v.conductor;
          }
        });
      }

      const rutasDuracionMap = this.ds.S.rutas?.reduce((acc: any, r: any) => {
        acc[r.cod?.toUpperCase().trim()] = Number(r.diasTrans || 1) + Number(r.diasDesc || 0);
        return acc;
      }, {}) || {};

      if (this.ds.S.viajes) {
        const hoyReal = new Date();
        hoyReal.setHours(0, 0, 0, 0);

        this.ds.S.viajes.forEach((vj: any) => {
          vj.cajas = this.parseNumSafe(vj.cajas, undefined, 660);

          if (vj.salida === undefined || vj.salida === '') vj.salida = vj.dia;

          // Antes esto solo recalculaba "retorno" si el viaje NO TENÍA
          // ningún valor puesto — así que si corregías "Días en
          // tránsito"/"Días de retorno" de una ruta, los viajes YA
          // EXISTENTES de esa ruta (que ya traían un retorno, aunque
          // fuera el viejo y mal calculado) se quedaban pegados con el
          // número de antes para siempre, sin importar cuántas veces
          // sincronizara — por eso la corrección "no se veía" sin
          // recargar la página a mano. Ahora se recalcula SIEMPRE, con
          // los valores actuales de la ruta, cada vez que se cargan los
          // datos (cada sincronización, cada 20 segundos) — EXCEPTO si
          // el viaje tiene `retornoManual: true`, marca que se pone al
          // editar el Retorno a mano desde "Editar viaje" — así una
          // corrección puntual que el usuario hizo a propósito no se
          // pisa sola en la siguiente sincronización.
          //
          // OJO — bug real encontrado y corregido aquí mismo: esta
          // fórmula (diasTrans+diasDesc de la ruta) es SOLO para
          // Makand. Arsitrans/Polar NUNCA tienen días de tránsito —
          // siempre están libres al día siguiente de CUALQUIER viaje,
          // sin importar qué ruta manejen ese día en particular. Antes
          // esto se aplicaba a TODOS los viajes por igual, así que a un
          // tercero que manejara una ruta Larga (diasTrans=2, por
          // ejemplo) se le inflaba el retorno de más — y como el rango
          // de búsqueda de conflictos usa ese retorno, el día SIGUIENTE
          // (uno completamente normal para un tercero) se terminaba
          // marcando en rojo por error.
          const esTerceroViaje = (() => {
            const t = String(vj.tr || vj.transportadora || '').toLowerCase().trim();
            return t.includes('arsitran') || t.includes('polar');
          })();

          if (!vj.retornoManual) {
            if (esTerceroViaje) {
              vj.retorno = Number(vj.salida) + 1;
            } else {
              const codRutaParaRetorno = vj.ruta?.toUpperCase().trim();
              const diasDeViaje = rutasDuracionMap[codRutaParaRetorno as keyof typeof rutasDuracionMap] || 1;
              vj.retorno = Number(vj.salida) + diasDeViaje;
            }
          }

          // Estado según la fecha REAL (no solo el número del día, para no
          // confundir un mes con otro) — "En ruta" se mantiene durante
          // TODO el tránsito (desde que sale hasta el día antes de
          // regresar), no solo el día exacto de la salida. Antes, un
          // viaje de varios días se marcaba "Entregado" al día siguiente
          // de salir, aunque el vehículo todavía estuviera viajando.
          if (vj.estado === 'Cancelado') {
            // Una cancelación (manual o por mantenimiento) manda siempre
            // — no se le pisa con el cálculo automático de fechas.
          } else if (vj.fecha) {
            const fechaSalida = new Date(vj.fecha + 'T00:00:00');
            const diasTransito = Number(vj.retorno) - Number(vj.salida);
            const fechaRetorno = new Date(fechaSalida);
            fechaRetorno.setDate(fechaRetorno.getDate() + (isNaN(diasTransito) ? 1 : diasTransito));

            if (fechaSalida.getTime() > hoyReal.getTime()) {
              vj.estado = 'Programado';
            } else if (fechaRetorno.getTime() > hoyReal.getTime()) {
              vj.estado = 'En ruta';
            } else {
              vj.estado = 'Entregado';
            }
          } else if (!vj.estado) {
            vj.estado = 'Programado';
          }

          const codRuta = vj.ruta?.toUpperCase().trim();

          const placaLimpia = String(vj.p || vj.veh || vj.placa || '').toUpperCase().trim();
          vj.p = placaLimpia; 
          
          const infoRutaMapeo = (this.ds.S.rutas || []).find((r: any) => 
            String(r.cod || r.codigo || '').toUpperCase().trim() === codRuta
          ) || {};

          const condOriginalMapeo = vj.cond?.trim();
          const esCondRealMapeo = condOriginalMapeo && 
                                  condOriginalMapeo !== 'Asignado' && 
                                  condOriginalMapeo !== 'SIN ASIGNAR' && 
                                  condOriginalMapeo !== 'Sin asignar' && 
                                  condOriginalMapeo !== '';

          vj.cond = esCondRealMapeo ? condOriginalMapeo : (this.conductoresMap[placaLimpia] || vehiculosMaestroMap[placaLimpia] || 'Sin asignar');
          vj.hora = vj.hora || infoRutaMapeo.hora || infoRutaMapeo.horaEntrega || infoRutaMapeo.horaSalida || '--:--';
        });

        this.detectarConflictosDisponibilidad();
      }

      this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
      this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
      this.rutasEnriquecidas = prepararRutasEnriquecidas(this.ds.S.rutas || []);
      
      if (!this.ds.S.vehiculos) this.ds.S.vehiculos = [];
      this.setDebugStatus('¡Carga completada con éxito!');
    } catch (e: any) {
      this.setDebugStatus('Cargado con errores');
      this.setDebugError(`Error en Mapeos/Utils: ${e.message}`);
    }

    this.cdr.detectChanges();
  }

  // --- Selector de mes propio (portado de dashboard.ts, mismo
  // comportamiento) — reemplaza el <select> nativo del navegador por un
  // mini-calendario de meses que se puede estilizar igual que el resto
  // del tema oscuro de Rutograma. ---
  public readonly nombresMesCalendario = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  public calendarioMesAbierto: boolean = false;
  public calendarioMesAnioMostrado: number = new Date().getFullYear();
  public calendarioMesX = 0;
  public calendarioMesY = 0;

  // Cualquier clic que llegue hasta aquí ya no fue "adentro" del
  // calendario (los clics de adentro paran la propagación con
  // $event.stopPropagation() en el HTML) — así que si está abierto, lo
  // cerramos.
  @HostListener('document:click')
  onClickFueraDeCalendarioMes(): void {
    if (this.calendarioMesAbierto) {
      this.calendarioMesAbierto = false;
    }
  }

  // El calendario se posiciona con "fixed" y coordenadas reales de
  // pantalla (tomadas del botón que lo abre), igual que el tooltip de
  // viaje — así queda totalmente fuera de la tabla (que tiene encabezados
  // "sticky" con su propio z-index) y nunca vuelve a mezclarse
  // visualmente con las celdas de abajo.
  public toggleCalendarioMes(event: Event): void {
    this.calendarioMesAbierto = !this.calendarioMesAbierto;
    if (this.calendarioMesAbierto) {
      this.calendarioMesAnioMostrado = this.ds.S.anio;
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const z = zoomPagina();
      this.calendarioMesX = rect.left / z;
      this.calendarioMesY = rect.bottom / z + 8;
    }
  }

  public cambiarAnioCalendarioMes(delta: number): void {
    this.calendarioMesAnioMostrado += delta;
  }

  // ============================================================
  // ATAJOS DEL RUTOGRAMA (lista completa con "?", services/atajos.service.ts):
  // Shift+← / Shift+→ mes anterior/siguiente, H el mes de hoy, Esc cierra
  // el viaje abierto (si no se está editando: no se pierde lo escrito).
  // ============================================================
  @HostListener('document:keydown', ['$event'])
  public atajosRutograma(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented || AtajosService.escribiendo()) return;
    if (e.key === 'Escape') {
      if (this.calendarioMesAbierto) { this.calendarioMesAbierto = false; return; }
      if (this.isModalDetalleOpen && !this.editandoViaje && !this.confirmDialogAbierto) { this.cerrarDetalle(); this.cdr.detectChanges(); }
      return;
    }
    if (AtajosService.ventanaAbierta()) return;
    if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      this.irAMes(e.key === 'ArrowLeft' ? -1 : 1);
    } else if (!e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      const hoy = new Date();
      this.irAMes((hoy.getFullYear() - Number(this.ds.S.anio)) * 12 + hoy.getMonth() - Number(this.ds.S.mes));
    }
  }

  private irAMes(salto: number): void {
    if (!salto || !this.ds?.S) return;
    const d = new Date(Number(this.ds.S.anio), Number(this.ds.S.mes) + salto, 1);
    this.calendarioMesAnioMostrado = d.getFullYear();
    this.seleccionarMesCalendario(d.getMonth());
    this.ui.mostrarToast(`${this.nombresMesCalendario[d.getMonth()]} ${d.getFullYear()}`, 'info');
    this.cdr.detectChanges();
  }

  public seleccionarMesCalendario(mesIndex: number): void {
    this.deslizarMes((this.calendarioMesAnioMostrado * 12 + mesIndex) - (Number(this.ds.S.anio) * 12 + Number(this.ds.S.mes)));
    this.ds.S.anio = this.calendarioMesAnioMostrado;
    this.ds.S.mes = mesIndex;
    this.ds.syncFechas();
    this.ds.autoSave();
    this.iniciarCarga();
    this.calendarioMesAbierto = false;
  }

  private detectarConflictosDisponibilidad() {
    if (!this.ds?.S?.viajes) return;

    const conductoresPorPlaca: Record<string, string> = {};
    if (this.ds.S.conductores) {
      this.ds.S.conductores.forEach((c: any) => {
        const placa = String(c.veh || c.placa || c.p || '').toUpperCase().trim();
        if (placa) conductoresPorPlaca[placa] = c.nom || c.conductor;
      });
    }

    const rutasMap: Record<string, any> = {};
    if (this.ds.S.rutas) {
      this.ds.S.rutas.forEach((r: any) => {
        const cod = String(r.cod || r.codigo || '').toUpperCase().trim();
        rutasMap[cod] = r;
      });
    }

    const hoyReal = new Date();
    const esMesActualReal = Number(this.ds.S.anio) === hoyReal.getFullYear() && Number(this.ds.S.mes) === hoyReal.getMonth();
    const diaActualReal = hoyReal.getDate();

    this.ds.S.viajes.forEach((vj: any) => {
      const placaLimpia = String(vj.p || vj.veh || '').toUpperCase().trim();
      const codRuta = String(vj.ruta || '').toUpperCase().trim();

      const condActual = vj.cond?.trim();
      const esGenerico = !condActual || ['ASIGNADO', 'SIN ASIGNAR', 'SIN CONDUCTOR', ''].includes(condActual.toUpperCase());
      if (esGenerico && conductoresPorPlaca[placaLimpia]) {
        vj.cond = conductoresPorPlaca[placaLimpia];
      }

      if (!vj.hora || vj.hora === '--:--') {
        const rutaMaestra = rutasMap[codRuta];
        const fechaViaje = new Date(this.ds.S.anio, this.ds.S.mes, vj.dia);
        const mapaDiasClave = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
        const claveDia = mapaDiasClave[fechaViaje.getDay()];
        const cfgDia = rutaMaestra?.dias && typeof rutaMaestra.dias === 'object' ? rutaMaestra.dias[claveDia] : null;

        if (cfgDia && cfgDia.hora) {
          vj.hora = cfgDia.hora;
        } else if (rutaMaestra && rutaMaestra.horaBase) {
          const diaSemana = fechaViaje.getDay();
          const diasMap = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
          const prefijo = diasMap[diaSemana];

          const regex = new RegExp(`${prefijo}\\s*(\\d{1,2}:\\d{2})`);
          const match = rutaMaestra.horaBase.match(regex);

          vj.hora = match ? match[1] : '--:--';
        } else {
          vj.hora = '--:--';
        }
      }

      // Solo se marca en rojo si el choque es entre DOS viajes normales —
      // si CUALQUIERA de los dos lados es "extra" (agregado a mano con
      // "+ Viaje Extra"), ninguno de los dos se pinta rojo. Antes se usaba
      // hayConflicto() (solo true/false); ahora se usa
      // obtenerViajesEnConflicto() para poder revisar el tipo de cada
      // viaje con el que choca.
      // Los viajes REALES (importados del Excel de operación) tampoco se
      // pintan en rojo: ya pasaron así. Si un viaje generado choca con uno
      // real, el que se marca es el generado.
      const conflictivosReales = (vj.tipo === 'extra' || vj.tipo === 'real')
        ? []
        : obtenerViajesEnConflicto(placaLimpia, vj.salida, vj.retorno, this.ds.S, vj).filter((otro: any) => otro.tipo !== 'extra');
      const existeConflicto = conflictivosReales.length > 0;
      const esHoy = esMesActualReal && Number(vj.dia) === diaActualReal;
      const trNormalizado = (() => {
        const t = String(vj.tr || 'makand').toLowerCase().trim();
        return t === 'arsi' ? 'arsitrans' : t;
      })();

      // Prioridad: conflicto > entregado (o día ya pasado) > extra > hoy > transportadora
      // Los viajes "extra" (agregados a mano) nunca toman el color rojo de
      // conflicto, aunque de verdad choquen con otro — se quedan con su
      // color normal de "extra". El dato conflictoLogico se sigue
      // guardando igual, solo se cambia el color que se ve en pantalla.
      if (existeConflicto && vj.tipo !== 'extra' && vj.tipo !== 'real') {
        vj.cssClass = 'bg-conflicto';
      } else if (vj.estado === 'Entregado') {
        vj.cssClass = 'bg-entregado';
      } else if (vj.tipo === 'extra') {
        vj.cssClass = 'bg-extra';
      } else if (esHoy) {
        vj.cssClass = 'bg-en-ruta';
      } else {
        vj.cssClass = `bg-${trNormalizado}`;
      }
      vj['conflictoLogico'] = existeConflicto;
    });
  }

  public obtenerViajeInicioDia(placa: string, dia: number): Viaje | null {
    if (!this.ds?.S?.viajes) return null;
    const placaLimpia = placa.toUpperCase().trim();
    return this.ds.S.viajes.find((v: Viaje) => 
      String(v.p || v.veh || '').toUpperCase().trim() === placaLimpia && Number(v.salida) === dia && v.estado !== 'Cancelado'
    ) || null;
  }

  public esDiaTransitoRetorno(placa: string, dia: number): boolean {
    if (!this.ds?.S?.viajes) return false;
    const placaLimpia = placa.toUpperCase().trim();
    return this.ds.S.viajes.some((v: Viaje) => {
      const pViaje = String(v.p || v.veh || '').toUpperCase().trim();
      if (v.estado === 'Cancelado') return false;
      return pViaje === placaLimpia && dia > Number(v.salida) && dia <= Number(v.retorno);
    });
  }

  public sincronizarConServidor() {
    this.setDebugStatus('Conectando con el servidor logístico...');
    
    const copiaEstadosManuales = new Map<string, string>();
    if (this.ds?.S?.vehiculos) {
      this.ds.S.vehiculos.forEach((v: any) => {
        const placaKey = String(v.p || v.placa || v.veh || '').toUpperCase().trim();
        if (placaKey && v.estado) copiaEstadosManuales.set(placaKey, v.estado);
      });
    }

    // Misma dirección dinámica que usa el resto de la app — antes tenía
    // "localhost" fijo, que no funciona desde otro dispositivo (el celular
    // entendería "localhost" como él mismo, no como este computador).
    const apiUrlSync = API;
    this.auth.fetchAutenticado(`${apiUrlSync}/dashboard-data`)
      .then(res => res.json())
      .then(res => {
        if (res.ok && res.data) {
          this.zone.run(() => {
            const rutasDuracionMap = res.data.rutas?.reduce((acc: any, r: any) => {
              acc[r.cod?.toUpperCase().trim()] = Number(r.diasTrans || 1) + Number(r.diasDesc || 0);
              return acc;
            }, {}) || {};
            if (res.data.viajes && Array.isArray(res.data.viajes)) {
              res.data.viajes = res.data.viajes.map((vj: any, index: number) => {
                if (!vj.id) vj.id = index + 1;
                if (vj.fecha && !vj.dia) {
                  const partes = vj.fecha.split('-');
                  if (partes.length === 3) vj.dia = parseInt(partes[2], 10);
                }
                // Mismo formato capitalizado que usa el resto de la app
                // ("Makand"/"Polar"/"Arsitrans") — antes esto ponía
                // minúsculas ("makand"/"polar"/"arsi"), que no coincidían
                // con ningún filtro/comparación del resto del código,
                // dejando esos viajes "perdidos" para Makand y colándose
                // mal en los conteos de Polar/Arsitrans.
                if (vj.transportadora && !vj.tr) {
                  const tLower = vj.transportadora.toLowerCase();
                  vj.tr = tLower.includes('arsi') ? 'Arsitrans' : (tLower.includes('polar') ? 'Polar' : 'Makand');
                }
                if (!vj.ruta) vj.ruta = vj.codigo || vj.cod || '';
                if (!vj.p) vj.p = String(vj.placa || vj.veh || '').toUpperCase().trim();
                if (vj.salida === undefined || vj.salida === '') vj.salida = vj.dia;
                // Misma corrección que en iniciarCarga(): Arsitrans/Polar
                // SIEMPRE están libres al día siguiente de cualquier
                // viaje, sin importar qué ruta manejen — nunca deben
                // usar el diasTrans/diasDesc de la ruta (eso es solo
                // para Makand).
                const trLower = String(vj.tr || '').toLowerCase().trim();
                const esTerceroViaje = trLower.includes('arsitran') || trLower.includes('polar');
                if (esTerceroViaje) {
                  vj.retorno = Number(vj.salida) + 1;
                } else {
                  const codRuta = vj.ruta?.toUpperCase().trim();
                  const diasDeViaje = rutasDuracionMap[codRuta] || 1;
                  vj.retorno = Number(vj.salida) + diasDeViaje;
                }
                return vj;
              });
            }
            
            this.ds.S = { ...this.ds.S, ...res.data };

            if (this.ds.S.vehiculos) {
              this.ds.S.vehiculos.forEach((v: any) => {
                const placaKey = String(v.p || v.placa || v.veh || '').toUpperCase().trim();
                if (copiaEstadosManuales.has(placaKey)) {
                  v.estado = copiaEstadosManuales.get(placaKey);
                }
              });
            }

            localStorage.setItem('rutograma_data', JSON.stringify(this.ds.S));
            this.iniciarCarga();
            this.setDebugStatus('¡Rutograma sincronizado con el servidor!');
          });
        }
      })
      .catch(err => {
        console.error("❌ Falló la conexión HTTP al backend:", err);
        this.setDebugStatus('Modo Local (Sin conexión al servidor)');
      });
  }

  // ============================================================
  // REACOMODAR CUPOS (Arsitrans / Polar) del mes que se está viendo — el
  // servidor junta sus viajes en los menos cupos posibles (un cupo solo se
  // ocupa el día de salida). Primero muestra qué cambiaría; no toca flota
  // propia, fechas, rutas ni placas reales. Se puede deshacer.
  // ============================================================
  public reacomodandoCupos = false;

  public async reacomodarCupos(tr: 'Arsitrans' | 'Polar'): Promise<void> {
    if (this.reacomodandoCupos) return;
    const apiUrl = `${API}/cupos/reacomodar`;
    const cuerpo = { tr, anio: this.ds.S.anio, mes: this.ds.S.mes };
    const nombreMes = this.meses[this.ds.S.mes];
    const pedir = async (previsualizar: boolean) => {
      const res = await this.auth.fetchAutenticado(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...cuerpo, previsualizar })
      });
      return res.json();
    };

    this.reacomodandoCupos = true;
    this.cdr.detectChanges();
    try {
      const plan = await pedir(true);
      if (!plan?.ok) {
        this.ui.mostrarToast(plan?.msg || 'No se pudo revisar los cupos.', 'err');
        return;
      }
      if (!plan.cambios.length && !plan.vehiculosSobrantes.length) {
        this.ui.mostrarToast(`Los cupos de ${tr} en ${nombreMes} ya están acomodados (${plan.cuposDespues} cupo(s)).`, 'ok');
        return;
      }
      const ejemplos = plan.cambios.slice(0, 5)
        .map((c: any) => `• Día ${Number(String(c.fecha).slice(8))}: ${c.ruta} — ${c.de} → ${c.a}`).join('\n');
      const confirmado = await this.mostrarConfirmPersonalizado(
        `Reacomodar ${tr} de ${nombreMes}:\n\n` +
        `Cupos: ${plan.cuposAntes} → ${plan.cuposDespues}\n` +
        `Viajes que cambian de cupo: ${plan.cambios.length}\n` +
        (plan.vehiculosSobrantes.length ? `Filas vacías que se quitan: ${plan.vehiculosSobrantes.join(', ')}\n` : '') +
        (ejemplos ? `\n${ejemplos}${plan.cambios.length > 5 ? '\n…' : ''}\n` : '') +
        `\nNo se tocan fechas, rutas, la flota propia ni las placas reales. Se puede deshacer.`,
        'Reacomodar',
        'Cancelar'
      );
      if (!confirmado) return;

      const r = await pedir(false);
      if (r?.pendiente) return; // cuenta que necesita aprobación: ya se avisó
      if (!r?.ok) {
        this.ui.mostrarToast(r?.msg || 'No se pudo reacomodar.', 'err');
        return;
      }
      if (r.respaldoAntes) {
        this.ds.registrarCambio({
          tipo: 'respaldo', clave: r.respaldoAntes, antes: r.respaldoAntes, despues: null,
          descripcion: `Reacomodar ${tr} de ${nombreMes}`
        });
      }
      await this.ds.inicializarApp(true);
      this.ui.mostrarToast(`${tr} reacomodado: ${r.cuposAntes} → ${r.cuposDespues} cupos, ${r.cambios.length} viaje(s) movidos.`, 'ok');
    } catch {
      this.ui.mostrarToast('No se pudo comunicar con el servidor.', 'err');
    } finally {
      this.reacomodandoCupos = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  public dispararGenerarMatriz() {
    const nombreMesActivo = this.meses[this.ds.S.mes];
    const anioActivo = this.ds.S.anio || new Date().getFullYear();
    // Misma dirección dinámica que usa el resto de la app — antes esto
    // tenía "localhost" fijo, que no funciona desde otro dispositivo.
    const apiUrl = API;
    this.auth.fetchAutenticado(`${apiUrl}/configuracion/generar-matriz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mes: nombreMesActivo, anio: anioActivo, festivos: this.ds.S.festivos || [] })
    })
    .then(res => res.json())
    .then(res => {
      if (res.ok) {
        this.ui.mostrarToast(`¡Matriz estructurada! Se programaron ${res.total} viajes.`, 'ok');
        // Reutilizamos el mecanismo bueno (el mismo que usa toda la app)
        // en vez de la sincronización vieja que recalculaba mal los datos.
        this.ds.inicializarApp(false, 'Cargando Rutograma...');
      } else { this.ui.mostrarToast(`Error del motor: ${res.msg}`, 'err'); }
    })
    .catch(err => this.ui.mostrarToast('No se pudo establecer comunicación con el backend.', 'err'));
  }

  public cargarExcel(event: any) {
    const target: DataTransfer = <DataTransfer>(event.target);
    if (!target.files || target.files.length !== 1) return;
    const reader: FileReader = new FileReader();
    
    reader.onload = (e: any) => {
      this.zone.run(() => {
        const wb: XLSX.WorkBook = XLSX.read(e.target.result, { type: 'binary', cellDates: true });
        const nombreMesActivo = this.meses[this.ds.S.mes].toUpperCase(); 
        let wsname = wb.SheetNames.find((name: string) => name.toUpperCase().includes(nombreMesActivo)) || wb.SheetNames[0];
        
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);
        if (!rows || rows.length === 0) { this.ui.mostrarToast('El archivo Excel está vacío.', 'err'); return; }

        const llavesFilaUno = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
        
        if (llavesFilaUno.includes('p') && (llavesFilaUno.includes('kg') || llavesFilaUno.includes('cap') || llavesFilaUno.includes('capacidad'))) {
          this.ds.S.vehiculos = rows.map((row: any) => {
            const placaKey = String(row.p || row.placa || row.veh || '').toUpperCase().trim();
            
            return {
              p: placaKey,
              placa: placaKey,
              veh: placaKey,
              tipo: row.t || row.tipo || 'Furgon refrigerado',
              cajas: this.parseNumSafe(row.cajas, row.cap || row.capacidad, 660),
              kg: this.parseNumSafe(row.kg, row.peso, 8000),
              m3: this.parseNumSafe(row.m3, row.volumen, 32),
              conductor: row.cond || row.conductor || row.nom || 'Sin asignar',
              estado: row.est || row.estado || 'Disponible',
              viajes: this.parseNumSafe(row.viajes, undefined, 0),
              desc: row.desc || '0/1/2 días'
            };
          }).filter(v => v.p && v.p.length >= 3 && v.p.length <= 10);

          localStorage.setItem('rutograma_data', JSON.stringify(this.ds.S));
          this.iniciarCarga();

          const apiUrlImport = API;
          this.auth.fetchAutenticado(`${apiUrlImport}/vehiculos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vehiculos: this.ds.S.vehiculos }) 
          })
          .then(res => res.json())
          .then(resBackend => {
            if (resBackend.ok) {
              this.ui.mostrarToast('¡Maestro guardado en el Servidor y sincronizado con éxito!', 'ok');
            } else {
              console.warn("El servidor no procesó el guardado automático, se mantiene en modo local.");
            }
          })
          .catch(err => console.error("❌ Error enviando datos al backend:", err));

          return;
        }

        const rowsMatriz: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { header: 1 });
        const headerRowIndex = rowsMatriz.findIndex(r => r && r.some((c: any) => ['PLACA', 'P'].includes(c?.toString().trim().toUpperCase())));
        
        if (headerRowIndex === -1) { 
          this.ui.mostrarToast('No se identificó el tipo de archivo. Revisa los encabezados de tu Excel.', 'err'); 
          return; 
        }

        const headers = rowsMatriz[headerRowIndex];
        const placaColIndex = headers.findIndex((c: any) => ['PLACA', 'P'].includes(c?.toString().trim().toUpperCase()));
        const conductorColIndex = headers.findIndex((c: any) => ['CONDUCTOR', 'COND'].includes(c?.toString().trim().toUpperCase()));
        
        const dateColIndices = headers.map((val: any, idx: number) => {
          if (!val) return -1;
          const d = new Date(val);
          return (!isNaN(d.getTime()) && idx > placaColIndex) || (idx > placaColIndex && val.toString().includes('/')) ? idx : -1;
        }).filter(idx => idx !== -1);
        
        const viajesMapeados: any[] = [];

        const rutasDuracionMap = this.ds.S.rutas?.reduce((acc: any, r: any) => {
          acc[r.cod?.toUpperCase().trim()] = Number(r.diasTrans || 1) + Number(r.diasDesc || 0);
          return acc;
        }, {}) || {};

        for (let i = headerRowIndex + 1; i < rowsMatriz.length; i++) {
          const row = rowsMatriz[i];
          if (!row || !row[placaColIndex]) continue;
          const placa = row[placaColIndex].toString().trim().toUpperCase();
          if (placa.includes('.') || placa.length < 3 || placa.length > 10 || !isNaN(Number(placa)) || ['TOTAL', 'DESCANSO', 'PLACA'].includes(placa)) continue;
          
          for (const c of dateColIndices) {
            const valorCelda = row[c]?.toString().trim();
            if (valorCelda && !['DESCANSO', '---', 'N/A', 'SIN ASIGNAR'].includes(valorCelda.toUpperCase())) {
              let transportadora = valorCelda.toLowerCase().includes('arsi') ? 'arsi' : (valorCelda.toLowerCase().includes('polar') ? 'polar' : 'makand');
              let diaReal = c - placaColIndex;
              if (headers[c]) {
                const dObj = new Date(headers[c]);
                if (!isNaN(dObj.getTime())) diaReal = dObj.getDate();
                else { const match = headers[c].toString().match(/(\d+)/); if (match) diaReal = parseInt(match[1], 10); }
              }
              const diasDeViaje = rutasDuracionMap[valorCelda.toUpperCase().trim()] || 1;
              const diaRetornoReal = diaReal + diasDeViaje;

              viajesMapeados.push({ 
                id: this.idEstableViaje(placa, valorCelda, diaReal), 
                ruta: valorCelda, 
                tr: transportadora, 
                veh: placa, 
                p: placa, 
                dia: diaReal, 
                cond: row[conductorColIndex] || 'Asignado', 
                estado: 'PROG', 
                cssClass: `bg-${transportadora === 'arsi' ? 'arsitrans' : transportadora}`,
                destino: this.rutasMap[valorCelda] || 'No definido',
                salida: diaReal,
                retorno: diaRetornoReal
              });
            }
          }
        }
        
        this.ds.S.viajes = viajesMapeados;
        localStorage.setItem('rutograma_data', JSON.stringify(this.ds.S));
        this.iniciarCarga();

        const apiUrlImportViajes = API;
        this.auth.fetchAutenticado(`${apiUrlImportViajes}/viajes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viajes: this.ds.S.viajes })
        })
        .then(res => res.json())
        .then(resBackend => {
          if (resBackend.ok) console.log(`✅ Matriz de viajes respaldada en el servidor.`);
        })
        .catch(err => console.error("❌ Error enviando viajes al backend:", err));

      });
    };
    reader.readAsBinaryString(target.files[0]);
  }

  public proximaEntrega(r: any): string {
    if (!r) return '<span style="color:var(--text3); font-size:11px;">Sin programar</span>';

    const placa = String(r.p || r.placa || '').toUpperCase().trim();
    if (!placa) return '<span style="color:var(--text3); font-size:11px;">Sin programar</span>';

    // Punto de partida: hoy, si estamos viendo el mes real actual — si es
    // un mes futuro o pasado, se busca desde el día 1 de ese mes.
    const hoyReal = new Date();
    const esMesActualReal = Number(this.ds.S.anio) === hoyReal.getFullYear() && Number(this.ds.S.mes) === hoyReal.getMonth();
    const diaMinimo = esMesActualReal ? hoyReal.getDate() : 1;

    const viajesVehiculo = (this.ds.S.viajes || [])
      .filter((vj: any) =>
        String(vj.p || vj.placa || '').toUpperCase().trim() === placa &&
        Number(vj.anio) === Number(this.ds.S.anio) &&
        vj.mes === this.meses[this.ds.S.mes] &&
        Number(vj.dia) >= diaMinimo &&
        vj.estado !== 'Cancelado'
      )
      .sort((a: any, b: any) => Number(a.dia) - Number(b.dia));

    if (!viajesVehiculo.length) {
      return '<span style="color:var(--text3); font-size:11px;">Sin programar</span>';
    }

    const proximo = viajesVehiculo[0];
    const destino = proximo.destino || proximo.ruta || 'Sin ruta';
    return `<strong style="font-size:11px;">Día ${proximo.dia}</strong><br><span style="font-size:9px; color:#94a3b8;">${destino}</span>`;
  }

  public abrirNovedad(): void { this.modalService.abrir('m-novedad'); }
  public abrirViajeExtra(): void { this.modalService.abrir('m-viaje'); }

  // ============================================================
  // RESUMEN INTERACTIVO — SEMANA POR SEMANA (rediseño v2)
  // ============================================================
  // Antes esto agrupaba TODOS los lunes del mes en una sola pestaña
  // "Lunes" — mezclaba varias semanas distintas sin que se notara.
  // Ahora se navega por semanas reales del mes (Semana 1, 2, 3...) y,
  // dentro de cada semana, por el día exacto (con su fecha real).

  public semanaActivaIndex: number = 0;
  public diaActivoNum: number | null = null;
  public buscadorResumen: string = '';

  private nombresDiaCorto = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Color por ciudad BASE (ignora la zona después de "/", ej. "Medellin/Guarne"
  // y "Medellin/La Estrella" comparten el mismo color de "Medellin").
  private ciudadesColores: { [key: string]: string } = {
    'barranquilla': '#f59e0b',
    'cali': '#8b5cf6',
    'medellin': '#3b82f6',
    'valledupar': '#ec4899',
    'cartagena': '#14b8a6',
    'ibague': '#f97316',
    'eje cafetero': '#84cc16',
    'monteria': '#ef4444',
  };

  private normalizarCiudad(destino: string): string {
    const base = String(destino || '').split('/')[0].trim();
    return base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  public colorCiudad(destino: string): string {
    return this.ciudadesColores[this.normalizarCiudad(destino)] || '#64748b';
  }

  // Para la leyenda: [etiqueta bonita, color]
  public leyendaCiudades: Array<[string, string]> = [
    ['Barranquilla', '#f59e0b'], ['Cali', '#8b5cf6'], ['Medellín (y zonas)', '#3b82f6'],
    ['Valledupar', '#ec4899'], ['Cartagena', '#14b8a6'], ['Ibagué', '#f97316'],
    ['Eje Cafetero', '#84cc16'], ['Montería', '#ef4444']
  ];

  // Parte los días del mes en semanas reales (corta en cada domingo).
  // La primera y la última semana pueden salir incompletas — eso es
  // correcto, son los días reales que le caben a ese mes en esa semana.
  public semanasDelMes(): Array<{ numero: number; etiqueta: string; dias: Array<{ dia: number; nombreDia: string }> }> {
    const dias = this.diasMes || [];
    if (!dias.length) return [];

    const semanas: Array<Array<{ dia: number; nombreDia: string }>> = [];
    let semanaActual: Array<{ dia: number; nombreDia: string }> = [];

    dias.forEach((d: number, i: number) => {
      const fecha = new Date(this.ds.S.anio, this.ds.S.mes, d);
      const jsDay = fecha.getDay(); // 0 = domingo
      semanaActual.push({ dia: d, nombreDia: this.nombresDiaCorto[jsDay] });
      const esUltimoDelMes = i === dias.length - 1;
      if (jsDay === 0 || esUltimoDelMes) {
        semanas.push(semanaActual);
        semanaActual = [];
      }
    });

    return semanas.map((diasSemana, i) => ({
      numero: i + 1,
      etiqueta: `Semana ${i + 1} (${diasSemana[0].dia}-${diasSemana[diasSemana.length - 1].dia})`,
      dias: diasSemana
    }));
  }

  // ============================================================
  // PDF DE LA SEMANA — la semana elegida en el resumen, una hoja por
  // día (horizontal), lista para imprimir o mandar por WhatsApp.
  // ============================================================
  public generandoPdfSemana = false;
  /** modo 'compartir': abre el menú de compartir del equipo con el PDF (si se puede; si no, lo descarga). */
  public async exportarSemanaPDF(modo: 'descargar' | 'compartir' = 'descargar'): Promise<void> {
    const semana = this.semanasDelMes()[this.semanaActivaIndex];
    if (!semana || this.generandoPdfSemana) return;
    this.generandoPdfSemana = true;
    try {
      const anio = Number(this.ds.S.anio), mes = Number(this.ds.S.mes);
      const nombresDia = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
      const mesNombre = this.meses[mes].toLowerCase();
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const ancho = doc.internal.pageSize.getWidth();
      const alto = doc.internal.pageSize.getHeight();
      const generado = new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
      const ordenTr = (tr: string) => (!tr || tr === 'Makand' ? 0 : tr === 'Arsitrans' ? 1 : 2);
      let total = 0;

      semana.dias.forEach((d, i) => {
        if (i > 0) doc.addPage();
        const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d.dia).padStart(2, '0')}`;
        const nombreDia = nombresDia[new Date(anio, mes, d.dia).getDay()];
        const viajes = (this.ds.S.viajes || [])
          .filter((v: any) => v.fecha === fecha)
          .sort((a: any, b: any) => ordenTr(a.tr) - ordenTr(b.tr)
            || String(a.hora || '').localeCompare(String(b.hora || ''))
            || String(a.p || a.placa || '').localeCompare(String(b.p || b.placa || '')));
        total += viajes.filter((v: any) => v.estado !== 'Cancelado').length;

        doc.setFontSize(16);
        doc.setTextColor(15, 23, 42);
        doc.text(`Viajes del ${nombreDia} ${d.dia} de ${mesNombre} de ${anio}`, 14, 16);
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        const activos = viajes.filter((v: any) => v.estado !== 'Cancelado').length;
        doc.text(`MAKAND · ${activos} viaje${activos === 1 ? '' : 's'}${viajes.length - activos ? ` · ${viajes.length - activos} cancelado(s)` : ''}`, 14, 22);

        if (!viajes.length) {
          doc.setFontSize(12);
          doc.text('Sin viajes este día.', 14, 36);
        } else {
          autoTable(doc, {
            startY: 27,
            head: [['Vehículo', 'Transp.', 'Conductor', 'Ruta', 'Destino', 'Cliente', 'Hora', 'Cajas', 'Regresa', 'Estado', 'Nota']],
            body: viajes.map((v: any) => {
              const placa = String(v.p || v.placa || '').toUpperCase();
              const cond = String(v.cond || '').trim();
              const conductor = cond && !['SIN ASIGNAR', 'ASIGNADO'].includes(cond.toUpperCase()) ? cond : (this.conductoresMap[placa] || '');
              const regresa = Number(v.retorno) > Number(v.salida || v.dia) ? `día ${v.retorno}` : '';
              return [v.placaReal ? `${placa} (${v.placaReal})` : placa, v.tr || 'Makand', conductor, v.ruta || v.codigo || '',
                v.destino || '', v.cliente || v.cli || '', this.horaDelViajeParaPdf(v), v.cajas || '', regresa,
                v.estado === 'Cancelado' ? `Cancelado${v.motivoCancelacion ? ': ' + v.motivoCancelacion : ''}` : (v.estado || 'Planificado'),
                String(v.obs || '')];
            }),
            styles: { fontSize: 9, cellPadding: 2 },
            columnStyles: { 10: { cellWidth: 45 } },
            headStyles: { fillColor: [30, 41, 59] },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            didParseCell: (data: any) => {
              if (data.section === 'body' && String(data.row.raw?.[9] || '').startsWith('Cancelado')) {
                data.cell.styles.textColor = [148, 163, 184];
              }
            }
          });
        }
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`${semana.etiqueta} de ${mesNombre} · generado ${generado}`, 14, alto - 8);
        doc.text(`Hoja ${i + 1} de ${semana.dias.length}`, ancho - 14, alto - 8, { align: 'right' });
      });

      const desde = semana.dias[0].dia, hasta = semana.dias[semana.dias.length - 1].dia;
      const nombreArchivo = `Viajes-semana-${desde}-${hasta}-${mesNombre}-${anio}.pdf`;
      if (modo === 'compartir') {
        const archivo = new File([doc.output('blob')], nombreArchivo, { type: 'application/pdf' });
        const nav = navigator as any;
        if (nav.canShare?.({ files: [archivo] })) {
          try {
            await nav.share({ files: [archivo], title: `Viajes del ${desde} al ${hasta} de ${mesNombre}`, text: `Viajes del ${desde} al ${hasta} de ${mesNombre} de ${anio} (MAKAND)` });
          } catch (e: any) {
            // Cerrar el menú sin elegir no es un error.
            if (e?.name !== 'AbortError') throw e;
          }
          return;
        }
        doc.save(nombreArchivo);
        this.ui.mostrarToast('Este navegador no deja compartir directo: el PDF quedó en Descargas. Adjúntalo en WhatsApp con 📎.', 'info');
        return;
      }
      doc.save(nombreArchivo);
      this.ui.mostrarToast(`PDF de la semana listo: ${total} viaje${total === 1 ? '' : 's'}, una hoja por día.`, 'ok');
    } catch (e) {
      console.error('Error creando el PDF de la semana:', e);
      this.ui.mostrarToast('No se pudo crear el PDF de la semana.', 'err');
    } finally {
      this.generandoPdfSemana = false;
      this.cdr.markForCheck();
    }
  }

  // ============================================================
  // HOJA DE RUTA — una hoja (A4 vertical) para entregarle al conductor
  // con todo lo del viaje: fechas, ruta, cliente, carga, vehículo, sus
  // datos, la nota y espacio para firmas de entrega.
  // ============================================================
  public generarHojaDeRuta(): void {
    const v = this.selectedViaje;
    if (!v) return;
    try {
      const S = this.ds.S;
      const placa = String(v.p || v.placa || '').toUpperCase();
      const mayus = (t: any) => String(t ?? '').toUpperCase().trim();
      const ruta = (S.rutas || []).find((r: any) => mayus(r.cod || r.codigo) === mayus(v.ruta || v.codigo)) || {};
      const vehiculo = (S.vehiculos || []).find((x: any) => mayus(x.p || x.placa) === placa) || {};
      const condAnotado = String(v.cond || '').trim();
      const nombreCond = condAnotado && !['SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'].includes(condAnotado.toUpperCase())
        ? condAnotado : (this.conductoresMap[placa] || '');
      const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
      const conductor = (S.conductores || []).find((c: any) => sinTildes(String(c.nom || c.nombre || '')) === sinTildes(nombreCond)) || {};
      const fechaLarga = (f: Date) => f.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const salida = v.fecha ? new Date(v.fecha + 'T00:00:00') : null;
      const dias = Number(v.retorno) > Number(v.salida) ? Number(v.retorno) - Number(v.salida) : 0;
      const regreso = salida && dias ? new Date(salida.getFullYear(), salida.getMonth(), salida.getDate() + dias) : null;
      const valor = (x: any) => (x === undefined || x === null || String(x).trim() === '' || x === 'No definido') ? '—' : String(x);

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const ancho = doc.internal.pageSize.getWidth();
      const alto = doc.internal.pageSize.getHeight();

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, ancho, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.text('MAKAND · Hoja de ruta', 14, 14);
      doc.setFontSize(9);
      doc.text(`Generada ${new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}`, ancho - 14, 14, { align: 'right' });

      doc.setTextColor(15, 23, 42);
      doc.setFontSize(18);
      // (La fuente del PDF no tiene la flecha "→": se usa ">".)
      doc.text(`${valor(v.ruta || v.codigo)}  >  ${valor(v.destino || ruta.dest)}`, 14, 34);
      doc.setFontSize(11);
      doc.setTextColor(71, 85, 105);
      doc.text(`${placa}${nombreCond ? ' · ' + nombreCond : ''}${salida ? ' · ' + fechaLarga(salida) : ''}`, 14, 41);

      const tabla = (titulo: string, filas: [string, string][], y: number): number => {
        autoTable(doc, {
          startY: y,
          head: [[{ content: titulo, colSpan: 4 }]],
          body: Array.from({ length: Math.ceil(filas.length / 2) }, (_, i) => [
            filas[i * 2]?.[0] || '', filas[i * 2]?.[1] || '', filas[i * 2 + 1]?.[0] || '', filas[i * 2 + 1]?.[1] || ''
          ]),
          theme: 'grid',
          styles: { fontSize: 10, cellPadding: 2.4, textColor: [15, 23, 42] },
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: 'bold' },
          // Mismas columnas en las tres tablas (ancho útil: la hoja menos 28 mm de márgenes).
          columnStyles: {
            0: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 32 },
            1: { cellWidth: (ancho - 28) / 2 - 32 },
            2: { fontStyle: 'bold', fillColor: [241, 245, 249], cellWidth: 32 },
            3: { cellWidth: (ancho - 28) / 2 - 32 }
          },
          margin: { left: 14, right: 14 }
        });
        return (doc as any).lastAutoTable.finalY + 6;
      };

      let y = tabla('Viaje', [
        ['Salida', salida ? fechaLarga(salida) : '—'],
        ['Hora', valor(this.horaDelViajeParaPdf(v))],
        ['Regreso estimado', regreso ? fechaLarga(regreso) : '—'],
        ['Estado', valor(v.estado || 'Planificado')],
        ['Ruta', valor(v.ruta || v.codigo)],
        ['Destino', valor(v.destino || ruta.dest)],
        ['Cliente', valor(v.cliente || v.cli || ruta.clientes)],
        ['Distancia', ruta.km ? `${ruta.km} km` : '—'],
        ['Cajas', valor(v.cajas)],
        ['Peso', v.peso || v.pesoKg ? `${v.peso || v.pesoKg} kg` : '—'],
        ['Volumen', v.volumen || v.volM3 ? `${v.volumen || v.volM3} m³` : '—'],
        ['Manifiesto', valor(v.manifiesto || v.manif)]
      ], 48);
      y = tabla('Vehículo', [
        ['Placa', v.placaReal ? `${placa} (real: ${v.placaReal})` : placa],
        ['Tipo', valor(vehiculo.tipo || vehiculo.t)],
        ['Transportadora', valor(v.tr || vehiculo.tr || 'Makand')],
        ['Capacidad', vehiculo.cajas || vehiculo.cap ? `${vehiculo.cajas || vehiculo.cap} cajas` : '—']
      ], y);
      y = tabla('Conductor', [
        ['Nombre', valor(nombreCond)],
        ['Cédula', valor(conductor.ced || conductor.cedula)],
        ['Celular', valor(conductor.tel || conductor.telefono)],
        ['Licencia vence', valor(conductor.licVence)]
      ], y);

      const nota = String(v.obs || '').trim();
      if (nota) {
        const lineas = doc.splitTextToSize(nota, ancho - 36);
        const altoNota = 10 + lineas.length * 5;
        doc.setFillColor(254, 249, 195);
        doc.setDrawColor(234, 179, 8);
        doc.rect(14, y, ancho - 28, altoNota, 'FD');
        doc.setFontSize(10);
        doc.setTextColor(113, 63, 18);
        doc.text('Nota para el conductor', 18, y + 6);
        doc.setTextColor(15, 23, 42);
        doc.text(lineas, 18, y + 12);
        y += altoNota + 6;
      }

      // Novedades en ruta: renglones para escribir a mano.
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42);
      doc.text('Novedades en ruta', 14, y + 2);
      doc.setDrawColor(203, 213, 225);
      for (let i = 1; i <= 4; i++) doc.line(14, y + 2 + i * 8, ancho - 14, y + 2 + i * 8);
      y += 44;

      // Firmas (al pie si cabe; si no, en una hoja nueva).
      if (y > alto - 50) { doc.addPage(); y = 30; }
      const yFirma = Math.max(y + 10, alto - 42);
      const mitad = (ancho - 28) / 2;
      doc.setDrawColor(15, 23, 42);
      doc.line(14, yFirma, 14 + mitad - 10, yFirma);
      doc.line(14 + mitad + 10, yFirma, ancho - 14, yFirma);
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text('Firma del conductor', 14, yFirma + 5);
      doc.text('Recibido por (nombre, firma, fecha y hora)', 14 + mitad + 10, yFirma + 5);

      const archivo = `Hoja-de-ruta-${placa.replace(/\s+/g, '')}-${v.fecha || ''}-${String(v.ruta || v.codigo || '').replace(/[^A-Za-z0-9-]/g, '')}.pdf`;
      doc.save(archivo);
      this.ui.mostrarToast('Hoja de ruta lista para imprimir o enviar.', 'ok');
    } catch (e) {
      console.error('Error creando la hoja de ruta:', e);
      this.ui.mostrarToast('No se pudo crear la hoja de ruta.', 'err');
    }
  }

  /** Hora del viaje; si no la tiene, la de su ruta para ese día de la semana. */
  private horaDelViajeParaPdf(v: any): string {
    if (/^\d{1,2}:\d{2}$/.test(String(v.hora || '').trim())) return String(v.hora).trim();
    const ruta = (this.ds.S.rutas || []).find((r: any) => String(r.cod || r.codigo || '').toUpperCase() === String(v.ruta || v.codigo || '').toUpperCase());
    if (!ruta || !v.fecha) return '';
    let dias = ruta.dias;
    if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = null; } }
    const [a, m, d] = String(v.fecha).split('-').map(Number);
    const hora = String(dias?.[['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'][new Date(a, m - 1, d).getDay()]]?.hora || '').trim();
    return /^\d{1,2}:\d{2}$/.test(hora) ? hora : '';
  }

  public diasDeSemanaActiva(): Array<{ dia: number; nombreDia: string }> {
    return this.semanasDelMes()[this.semanaActivaIndex]?.dias || [];
  }

  public seleccionarSemana(idx: number): void {
    this.semanaActivaIndex = idx;
    const dias = this.semanasDelMes()[idx]?.dias || [];
    // Si el día que tenías activo no pertenece a la nueva semana, saltamos
    // al primer día de esa semana.
    if (!dias.some(d => d.dia === this.diaActivoNum)) {
      this.diaActivoNum = dias[0]?.dia ?? null;
    }
  }

  public seleccionarDiaResumen(dia: number): void {
    this.diaActivoNum = dia;
  }

  // La primera vez que hay días disponibles (o si cambia el mes/año),
  // nos aseguramos de que haya una semana/día válido seleccionado.
  private asegurarSemanaValida(): void {
    const semanas = this.semanasDelMes();
    if (!semanas.length) { this.diaActivoNum = null; return; }

    if (this.semanaActivaIndex >= semanas.length) this.semanaActivaIndex = 0;

    const diasSemana = semanas[this.semanaActivaIndex].dias;
    if (this.diaActivoNum === null || !diasSemana.some(d => d.dia === this.diaActivoNum)) {
      // Preferimos el día real de hoy si cae en el mes/semana que se está viendo.
      const hoy = new Date();
      const esMesActualReal = Number(this.ds.S.anio) === hoy.getFullYear() && Number(this.ds.S.mes) === hoy.getMonth();
      const diaHoy = esMesActualReal ? hoy.getDate() : null;

      const semanaConHoy = diaHoy !== null ? semanas.findIndex(s => s.dias.some(d => d.dia === diaHoy)) : -1;
      if (semanaConHoy !== -1) {
        this.semanaActivaIndex = semanaConHoy;
        this.diaActivoNum = diaHoy;
      } else {
        this.diaActivoNum = diasSemana[0].dia;
      }
    }
  }

  // Vehículos con sus paradas del día EXACTO activo (fecha real, no acumulado).
  // Casi siempre una parada por vehículo — puede haber más de una si ese
  // vehículo tiene doble entrega el mismo día.
  // Toma exactamente lo que YA se ve en la tabla principal del Rutograma
  // (this.viajesAgrupados) para un día específico — si un viaje no aparece
  // ahí (porque el vehículo sigue ocupado con otro), tampoco aparece aquí.
  // Así el resumen siempre coincide con lo que se ve arriba, sin importar
  // cuántos viajes existan de más en los datos guardados.
  private viajesVisiblesDelDia(dia: number): any[] {
    const resultado: any[] = [];
    Object.keys(this.viajesAgrupados || {}).forEach(key => {
      const ultimoGuion = key.lastIndexOf('-');
      if (ultimoGuion === -1) return;
      const diaDeLaClave = Number(key.substring(ultimoGuion + 1));
      if (diaDeLaClave !== dia) return;
      (this.viajesAgrupados[key] || []).forEach((vj: any) => {
        if (vj.isStart) resultado.push(vj);
      });
    });
    return resultado;
  }

  public vehiculosDelDiaActivo(): Array<{ placa: string; tr: string; paradas: any[] }> {
    this.asegurarSemanaValida();
    if (this.diaActivoNum === null) return [];

    const viajesDelDia = this.viajesVisiblesDelDia(this.diaActivoNum);

    const porPlaca: { [placa: string]: { placa: string; tr: string; paradas: any[] } } = {};
    viajesDelDia.forEach((v: any) => {
      const placa = String(v.p || v.placa || 'SIN PLACA');
      if (!porPlaca[placa]) porPlaca[placa] = { placa, tr: v.tr || 'Makand', paradas: [] };
      porPlaca[placa].paradas.push(v);
    });

    let grupos = Object.values(porPlaca).sort((a, b) => a.placa.localeCompare(b.placa));

    const q = this.buscadorResumen.trim().toLowerCase();
    if (q) {
      grupos = grupos.filter(g => {
        if (g.placa.toLowerCase().includes(q)) return true;
        return g.paradas.some((p: any) =>
          String(p.destinoReal || '').toLowerCase().includes(q) ||
          String(p.destino || '').toLowerCase().includes(q) ||
          String(p.ruta || '').toLowerCase().includes(q)
        );
      });
    }
    return grupos;
  }

  // Contador de un día específico exacto (para el número en cada pestaña de día)
  public contadorDia(dia: number | null): { vehiculos: number; paradas: number } {
    if (dia === null) return { vehiculos: 0, paradas: 0 };
    const viajesDelDia = this.viajesVisiblesDelDia(dia);
    const placas = new Set(viajesDelDia.map((v: any) => String(v.p || v.placa || '')));
    return { vehiculos: placas.size, paradas: viajesDelDia.length };
  }

  // Contadores de la SEMANA activa completa (todos sus días juntos)
  public contadorSemanaActiva(): { vehiculos: number; viajes: number } {
    const dias = this.diasDeSemanaActiva().map(d => d.dia);
    const viajesSemana = dias.flatMap(d => this.viajesVisiblesDelDia(d));
    const placas = new Set(viajesSemana.map((v: any) => String(v.p || v.placa || '')));
    return { vehiculos: placas.size, viajes: viajesSemana.length };
  }

  // Punto 3: cuántos viajes hará cada vehículo en total este mes.
  // Antes esto era una función llamada directo en el *ngFor del HTML —
  // recalculaba un array NUEVO en cada repintado, y en modo desarrollo
  // Angular repinta dos veces seguidas para verificar que nada cambió
  // entre medio; como el array era una referencia distinta cada vez,
  // a veces disparaba NG0100 (ExpressionChangedAfterItHasBeenChecked).
  // Ahora es una propiedad cacheada que solo se recalcula cuando de
  // verdad cambian los datos (junto con viajesAgrupados).
  public resumenPorVehiculoMesCache: Array<{ placa: string; tr: string; total: number }> = [];

  public resumenViajesPorVehiculoMes(): Array<{ placa: string; tr: string; total: number }> {
    return this.resumenPorVehiculoMesCache;
  }

  // Mismo chequeo que ya usa Conductores (diaEnMantenimiento) — excluye
  // viajes cuya placa ESTÉ ACTUALMENTE en mantenimiento ese día. Si el
  // viaje ya se transfirió a otro vehículo (ver cancelarViajesEnRango en
  // vehiculos.ts), su placa ya no es la del vehículo en mantenimiento,
  // así que esto no lo afecta — es un respaldo para casos donde, por lo
  // que sea, la transferencia no se dio.
  private viajeEnMantenimientoActivo(vj: any): boolean {
    const placaLimpia = String(vj.p || vj.placa || vj.veh || '').toUpperCase().trim();
    const vehiculo = (this.ds.S.vehiculos || []).find((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia
    );
    if (!vehiculo || !vehiculo.mantInicio || !vehiculo.mantFin) return false;

    const mesIdxActual = this.ds.S.mes;
    const anioActivo = Number(this.ds.S.anio);
    const fInicio = new Date(vehiculo.mantInicio + 'T00:00:00');
    const fFin = new Date(vehiculo.mantFin + 'T00:00:00');
    const mismoMesInicio = fInicio.getMonth() === mesIdxActual && fInicio.getFullYear() === anioActivo;
    const mismoMesFin = fFin.getMonth() === mesIdxActual && fFin.getFullYear() === anioActivo;
    if (!mismoMesInicio && !mismoMesFin) return false;

    const diaMantInicio = mismoMesInicio ? fInicio.getDate() : 1;
    const diaMantFin = mismoMesFin ? fFin.getDate() : 31;
    const diaViaje = Number(vj.dia ?? vj.salida);
    return diaViaje >= diaMantInicio && diaViaje <= diaMantFin;
  }

  private recalcularResumenPorVehiculoMes(): void {
    const datos: { [placa: string]: { placa: string; tr: string; total: number } } = {};
    // Excluye Cancelados y viajes en mantenimiento activo aquí — mismo
    // criterio que ya usa Conductores, para que ambos números coincidan.
    // OJO: viajesDelMesActual() SIGUE igual (sin excluir nada), porque
    // esa misma función también alimenta la matriz principal, donde SÍ
    // deben seguir apareciendo las tarjetas rojas de "Cancelado".
    this.viajesDelMesActual()
      .filter((v: any) => v.estado !== 'Cancelado' && !this.viajeEnMantenimientoActivo(v))
      .forEach((v: any) => {
      const placa = String(v.p || v.placa || 'SIN PLACA');
      if (!datos[placa]) datos[placa] = { placa, tr: v.tr || 'Makand', total: 0 };
      datos[placa].total++;
    });
    this.resumenPorVehiculoMesCache = Object.values(datos).sort((a, b) => b.total - a.total);
  }

  // Suma de todos los vehículos — el total general de viajes del mes.
  // Mismo criterio: excluye Cancelados y mantenimiento activo, igual que Conductores.
  public totalViajesMes(): number {
    return this.viajesDelMesActual().filter((v: any) => v.estado !== 'Cancelado' && !this.viajeEnMantenimientoActivo(v)).length;
  }

  // Pulido visual: desglose Makand vs Terceros (Polar + Arsitrans) del
  // mes activo, con porcentajes — para detectar de un vistazo si algo
  // se desbalanceó (por ejemplo, si Makand cae a 0%) sin tener que
  // contar viajes a mano ni abrir la consola.
  public resumenTransportadoraMes(): { makand: number; polar: number; arsitrans: number; terceros: number; total: number; pctMakand: number; pctPolar: number; pctArsitrans: number; pctTerceros: number } {
    // Excluye Cancelados y viajes en mantenimiento activo — mismo
    // criterio que Conductores y el resumen por vehículo, para que los
    // números coincidan entre pantallas.
    const viajes = this.viajesDelMesActual().filter((v: any) => v.estado !== 'Cancelado' && !this.viajeEnMantenimientoActivo(v));
    const total = viajes.length;
    const polar = viajes.filter((v: any) => String(v.tr || v.transportadora || '').toLowerCase().includes('polar')).length;
    const arsitrans = viajes.filter((v: any) => String(v.tr || v.transportadora || '').toLowerCase().includes('arsitran')).length;
    const terceros = polar + arsitrans;
    const makand = total - terceros;
    const pctMakand = total > 0 ? Math.round((makand / total) * 100) : 0;
    const pctPolar = total > 0 ? Math.round((polar / total) * 100) : 0;
    const pctArsitrans = total > 0 ? Math.round((arsitrans / total) * 100) : 0;
    const pctTerceros = total > 0 ? Math.round((terceros / total) * 100) : 0;
    return { makand, polar, arsitrans, terceros, total, pctMakand, pctPolar, pctArsitrans, pctTerceros };
  }

  public trackByPlaca(index: number, veh: any): any {
    return veh?.placa ?? index;
  }

  public viajesCupoDelDia(te: any, d: number): any[] {
    return this.viajesDelMesActual().filter((vj: any) =>
      Number(vj.dia) === d &&
      vj.tipo === 'cupo' &&
      String(vj.tr || '').toLowerCase().trim() === te.nombre.toLowerCase().trim()
    );
  }

  // Ahora viven en rutograma_utils.js (compartidas con navbar.ts) — estos
  // wrappers solo pasan this.ds.S, para no tener que cambiar cada llamada
  // que ya existía en este archivo.
  private buscarCupoLibre(nombreTr: string, diaIni: number, diaFin: number, viajeExcluidoId: any): string | null {
    return buscarCupoLibreCompartido(nombreTr, diaIni, diaFin, viajeExcluidoId, this.ds.S);
  }

  private siguienteNumeroCupo(nombreTr: string): number {
    return siguienteNumeroCupoCompartido(nombreTr, this.ds.S);
  }

  // Si esa placa todavía no existe como vehículo, la creamos con datos por
  // defecto tomados de otro vehículo de la misma transportadora — sin
  // esto, el viaje queda "huérfano": existe el dato, pero no aparece como
  // su propia fila en la tabla. Se usa tanto para los cupos numerados que
  // se crean solos (ARSITRANS N / POLAR N) como para una placa real que
  // alguien escriba a mano.
  private async asegurarVehiculoParaPlaca(placa: string, nombreTr: string): Promise<void> {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    if (!placaLimpia) return;

    const yaExiste = (this.ds.S.vehiculos || []).some((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia
    );
    if (yaExiste) return;

    const plantilla = (this.ds.S.vehiculos || []).find((v: any) =>
      String(v.tr || v.transportadora || '').toLowerCase().trim() === nombreTr.toLowerCase().trim()
    );
    const nuevoVehiculo = {
      p: placaLimpia,
      placa: placaLimpia,
      veh: placaLimpia,
      tipo: plantilla?.tipo || plantilla?.t || 'Furgon refrigerado',
      t: plantilla?.tipo || plantilla?.t || 'Furgon refrigerado',
      cajas: plantilla?.cajas || plantilla?.cap || 600,
      cap: plantilla?.cajas || plantilla?.cap || 600,
      kg: plantilla?.kg || 12000,
      m3: plantilla?.m3 || 45,
      conductor: 'Sin asignar',
      cond: 'Sin asignar',
      transportadora: nombreTr,
      tr: nombreTr,
      estado: 'Disponible',
      est: 'Disponible',
      viajes: 0,
      desc: '0/1/2 días',
      dc: 0, dm: 1, dl: 2,
      mantInicio: null,
      um: ''
    };
    if (!this.ds.S.vehiculos) this.ds.S.vehiculos = [];
    this.ds.S.vehiculos.push(nuevoVehiculo);
    await this.ds.guardarVehiculo(nuevoVehiculo, this.ds.S.vehiculos.length - 1);
  }

  public abrirCupo(tr: string) {
    this.zone.run(() => {
      this.selectedTr = tr;
      this.nuevoCupo = { rutaSeleccionada: null, cajas: 660, dia: this.diasMes.includes(new Date().getDate()) ? new Date().getDate() : this.diasMes[0] };
      this.cupoError = '';
      this.isModalCupoOpen = true;
    });
  }

  public cerrarCupo(): void {
    this.isModalCupoOpen = false;
  }

  public async guardarCupo(): Promise<void> {
    if (!this.nuevoCupo.rutaSeleccionada) {
      this.cupoError = 'Selecciona una ruta.';
      return;
    }
    if (!this.nuevoCupo.dia) {
      this.cupoError = 'Selecciona un día.';
      return;
    }

    const ruta = this.nuevoCupo.rutaSeleccionada;
    const nombreTr = this.selectedTr === 'arsi' ? 'Arsitrans' : 'Polar';
    // Se reutiliza un cupo que esté libre ESE día (tenga o no viajes el día
    // antes o después); solo si todos están ocupados ese día se crea uno nuevo.
    const diaCupo = Number(this.nuevoCupo.dia);
    const placaCupo = this.buscarCupoLibre(nombreTr, diaCupo, diaCupo + 1, null)
      || `${nombreTr.toUpperCase()} ${this.siguienteNumeroCupo(nombreTr)}`;

    // Si esa placa numerada todavía no existe como vehículo, la creamos —
    // sin esto, el viaje quedaba "huérfano": existía el dato, pero no
    // aparecía como su propia fila en la tabla de vehículos.
    await this.asegurarVehiculoParaPlaca(placaCupo, nombreTr);

    const dia = Number(this.nuevoCupo.dia);
    const anio = this.ds.S.anio;
    const mes = this.ds.S.mes; // 0-indexado
    const fechaObj = new Date(anio, mes, dia);
    const fechaString = `${fechaObj.getFullYear()}-${String(fechaObj.getMonth() + 1).padStart(2, '0')}-${String(fechaObj.getDate()).padStart(2, '0')}`;

    // OJO — bug real: este cupo es SIEMPRE de tercero (Arsitrans/Polar,
    // nunca Makand) — su retorno siempre es día+1, sin importar la
    // ruta. Usar "Días en tránsito"/"Días de retorno" de la ruta aquí
    // le inflaba el retorno de más, provocando conflictos en rojo
    // falsos con el día siguiente.

    let tarifaFinal = Number(ruta.tarifa || 0);
    if (this.selectedTr === 'arsi') tarifaFinal = Number(ruta.tarifaArsitrans || ruta.tarifaArsitran || tarifaFinal);
    if (this.selectedTr === 'polar') tarifaFinal = Number(ruta.tarifaPolar || tarifaFinal);

    const nuevoViaje = {
      id: `${placaCupo}-${fechaString}-${ruta.cod || ruta.codigo || ''}`,
      codigo: ruta.cod || ruta.codigo || '',
      ruta: ruta.cod || ruta.codigo || '',
      destino: ruta.dest || ruta.destino || '',
      cliente: String(ruta.clientes || '').split(',')[0].trim() || 'Sin Cliente',
      placa: placaCupo,
      p: placaCupo,
      transportadora: nombreTr,
      tr: nombreTr,
      fecha: fechaString,
      dia: dia,
      salida: dia,
      // Arsitrans/Polar: siempre libre al día siguiente, sin importar
      // la ruta.
      retorno: dia + 1,
      cajas: Number(this.nuevoCupo.cajas || ruta.cajasMin || 660),
      mes: this.meses[mes],
      anio: anio,
      tarifa: tarifaFinal,
      costo: tarifaFinal,
      estado: 'Planificado',
      // Marca para distinguir esto de un viaje que "Generar Matriz" le
      // asigne automáticamente a ARSI-?/POLAR-? como si fueran un vehículo
      // normal — sin esto, esos viajes automáticos se colaban en la fila
      // especial de Arsitrans/Polar, que solo debe mostrar lo que se
      // agrega a mano con este botón.
      tipo: 'cupo'
    };

    const ok = await this.ds.guardarViaje(nuevoViaje);
    if (!ok) return;

    Promise.resolve().then(() => {
      this.zone.run(() => {
        this.cerrarCupo();
        this.iniciarCarga();
        this.cdr.detectChanges();
      });
    });
  }

  // ============================================================
  // HISTORIAL DE CAMBIOS DEL VIAJE (detalle del viaje)
  // ============================================================
  public historialViaje: { abierto: boolean; cargando: boolean; items: any[]; pendientes: any[]; id: any } =
    { abierto: false, cargando: false, items: [], pendientes: [], id: null };

  public async alternarHistorialViaje(): Promise<void> {
    if (this.historialViaje.abierto) { this.historialViaje.abierto = false; return; }
    const id = this.selectedViaje?.id;
    this.historialViaje = { abierto: true, cargando: true, items: [], pendientes: [], id };
    this.cdr.detectChanges();
    try {
      const base = API;
      const res = await this.auth.fetchAutenticado(`${base}/viajes/historial?id=${encodeURIComponent(String(id))}`);
      const data = await res.json();
      if (this.historialViaje.id !== id) return; // se abrió otro viaje mientras cargaba
      this.historialViaje.items = data?.historial || [];
      this.historialViaje.pendientes = data?.pendientes || [];
    } catch {
      this.ui.mostrarToast('No se pudo cargar el historial del viaje.', 'err');
    }
    this.historialViaje.cargando = false;
    this.cdr.detectChanges();
  }

  /** Viaje pedido desde la búsqueda rápida, esperando a que lleguen los datos. */
  private viajePedido: string | null = null;

  private abrirViajePedido(): void {
    if (!this.viajePedido) return;
    const vj = (this.ds.S?.viajes || []).find((v: any) => String(v.id) === this.viajePedido);
    if (!vj) return;
    this.viajePedido = null;
    // Destello al buscar (efecto de Apariencia): baja suave hasta el viaje,
    // la tarjeta destella y luego se abre su detalle.
    setTimeout(() => {
      const tarjeta = document.querySelector(`[data-viaje="${CSS.escape(String(vj.id))}"]`) as HTMLElement | null;
      if (!tarjeta || !this.theme.efectoActivo('destello')) { this.verDetalle(vj.id); return; }
      tarjeta.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      tarjeta.classList.remove('ap-destello'); void tarjeta.offsetWidth; tarjeta.classList.add('ap-destello');
      setTimeout(() => { tarjeta.classList.remove('ap-destello'); this.verDetalle(vj.id); this.cdr.detectChanges(); }, 1300);
    }, 50);
  }

  // ============================================================
  // CAMBIOS EN VIVO (efecto de Apariencia): si otra persona cambia un viaje
  // mientras se ve el Rutograma, su tarjeta brilla un momento. Se compara
  // lo que trae cada sincronización con lo que había; lo que cambió uno
  // mismo no brilla.
  // ============================================================
  public cambiadosVivo = new Set<any>();
  private firmasViajes: Map<any, string> | null = null;
  private detectarCambiosEnVivo(): void {
    const yo = String(this.auth.currentUser?.email || '').toLowerCase();
    const firma = (v: any) => [v.p, v.cond, v.ruta, v.fecha, v.salida, v.retorno, v.estado, v.hora, v.cajas, v.cliente, v.version, v.salidaReal, v.llegadaReal].join('|');
    const nuevas = new Map<any, string>();
    for (const v of this.ds.S?.viajes || []) if (v?.id != null) nuevas.set(v.id, firma(v));
    const antes = this.firmasViajes;
    this.firmasViajes = nuevas;
    if (!antes || !this.theme.efectoActivo('vivo')) return;
    const cambiados: any[] = [];
    for (const v of this.ds.S?.viajes || []) {
      const previa = antes.get(v.id);
      if (previa === undefined || previa === nuevas.get(v.id)) continue;
      if (String(v.editadoPor || '').toLowerCase() === yo) continue;
      cambiados.push(v.id);
    }
    if (!cambiados.length || cambiados.length > 30) return;   // muchos a la vez = otro mes o una recarga: no
    cambiados.forEach(id => this.cambiadosVivo.add(id));
    setTimeout(() => { cambiados.forEach(id => this.cambiadosVivo.delete(id)); this.cdr.detectChanges(); }, 4200);
  }

  // DESLIZAR AL CAMBIAR DE MES (efecto de Apariencia).
  private deslizarMes(salto: number): void {
    if (!salto || !this.theme.efectoActivo('mes')) return;
    const tabla = document.querySelector('.ruto-table-responsive') as HTMLElement | null;
    if (!tabla) return;
    tabla.classList.remove('ap-mes-sig', 'ap-mes-ant'); void tabla.offsetWidth;
    tabla.classList.add(salto > 0 ? 'ap-mes-sig' : 'ap-mes-ant');
    setTimeout(() => tabla.classList.remove('ap-mes-sig', 'ap-mes-ant'), 600);
  }

  public verDetalle(id: number) { 
    this.historialViaje = { abierto: false, cargando: false, items: [], pendientes: [], id: null };
    this.zone.run(() => { 
      const viajeOriginal = this.ds.S.viajes?.find((v: any) => v.id === id);
      if (!viajeOriginal) return;

      const codRuta = String(viajeOriginal.ruta || '').toUpperCase().trim();
      const placaViaje = String(viajeOriginal.p || viajeOriginal.veh || '').toUpperCase().trim();

      const infoRuta = (this.ds.S.rutas || []).find((r: any) => 
        String(r.cod || r.codigo || '').toUpperCase().trim() === codRuta
      ) || {};

      const infoVehiculo = (this.ds.S.vehiculos || []).find((v: any) => 
        String(v.p || v.placa || v.veh || '').toUpperCase().trim() === placaViaje
      ) || {};

      const tr = viajeOriginal.tr || 'Makand';
      const keyTarifa = `tarifa${tr.charAt(0).toUpperCase() + tr.slice(1).toLowerCase()}`;
      const costoCalculado = infoRuta[keyTarifa] || infoRuta.tarifa || 0;

      const condOriginal = viajeOriginal.cond?.trim();
      const esCondReal = condOriginal && condOriginal !== 'Asignado' && condOriginal !== 'SIN ASIGNAR' && condOriginal !== 'Sin asignar' && condOriginal !== '';

      this.selectedViaje = { 
        ...viajeOriginal,
        veh: placaViaje || '---',
        p: placaViaje,
        destino: viajeOriginal.destino || infoRuta.dest || 'No definido',
        cliente: viajeOriginal.cliente || infoRuta.clientes || 'No definido',
        cajas: viajeOriginal.cajas || infoRuta.cajasMin || infoVehiculo.cajas || 0,
        peso: viajeOriginal.peso || infoVehiculo.kg || 0,
        volumen: viajeOriginal.volumen || infoVehiculo.m3 || 0,
        costo: viajeOriginal.costo || costoCalculado,
        
        cond: esCondReal ? condOriginal : (this.conductoresMap[placaViaje] || infoVehiculo.conductor || 'Sin asignar'),
        hora: viajeOriginal.hora || infoRuta.hora || infoRuta.horaEntrega || infoRuta.horaSalida || '--:--'
      };

      this.viajeOriginalEdicion = { ...viajeOriginal };
      this.vistaInicialEdicion = { ...this.selectedViaje };
      this.placaOriginalEdicion = placaViaje;
      this.trOriginalEdicion = tr;
      this.retornoOriginalEdicion = Number(viajeOriginal.retorno);

      this.editandoViaje = false;
      this.isModalDetalleOpen = true; 
      document.body.style.overflow = 'hidden'; 
      this.latirPresencia();
    }); 
  }

  public cerrarDetalle() {
    this.isModalDetalleOpen = false;
    this.editandoViaje = false;
    document.body.style.overflow = 'auto'; 
    this.latirPresencia();
  }

  // ============================================================
  // QUIÉN MÁS TIENE ABIERTO ESTE VIAJE (services/presencia.service.ts):
  // se avisa qué viaje se está viendo o editando; los demás lo ven en
  // "En línea" y aquí sale "Carlos está editando este viaje".
  // ============================================================
  private presencia = inject(PresenciaService);
  private theme = inject(ThemeService);

  private latirPresencia(): void {
    const v = this.selectedViaje;
    if (!this.isModalDetalleOpen || v?.id == null) { this.presencia.limpiar(); return; }
    const fecha = v.fecha ? new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
    const que = `el viaje ${v.ruta || v.codigo || ''} de ${v.p || v.placa || ''}${fecha ? ' (' + fecha + ')' : ''}`.replace(/\s+/g, ' ');
    this.presencia.establecer(`${this.editandoViaje ? 'editando' : 'viendo'} ${que}`, `viaje:${v.id}`, this.editandoViaje);
  }


  // ============================================================
  // VEHÍCULO VARADO — el vehículo de este viaje se averió a mitad de
  // camino (o cualquier día antes de terminar su recorrido) y otro
  // vehículo, de cualquier transportadora, termina de llevar el
  // producto. El día exacto de la avería queda marcado con "Varado" y
  // el motivo, en la placa ORIGINAL — independiente de si esa placa
  // entra en mantenimiento días después (ese marcador no se borra).
  // ============================================================
  public isModalVaradoOpen: boolean = false;
  public varadoRazon: string = '';
  public varadoCandidatos: any[] = [];
  public procesandoVarado: boolean = false;
  private viajeVaradoOriginal: any = null;

  // ============================================================
  // Modal de confirmación PROPIO — reemplaza el confirm() nativo del
  // navegador (que solo dice "Aceptar/Cancelar", sin contexto de qué
  // decisión es cada uno) por uno con botones que dicen exactamente la
  // acción, ej. "Reasignar a Polar" / "Dejarlo donde está".
  // ============================================================
  public confirmDialogAbierto: boolean = false;
  public confirmDialogMensaje: string = '';
  public confirmDialogBtnAceptar: string = 'Aceptar';
  public confirmDialogBtnCancelar: string = 'Cancelar';
  private confirmDialogResolve: ((valor: boolean) => void) | null = null;

  private mostrarConfirmPersonalizado(mensaje: string, btnAceptar: string, btnCancelar: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.confirmDialogMensaje = mensaje;
      this.confirmDialogBtnAceptar = btnAceptar;
      this.confirmDialogBtnCancelar = btnCancelar;
      this.confirmDialogResolve = resolve;
      this.confirmDialogAbierto = true;
      this.cdr.detectChanges();
    });
  }

  public confirmDialogElegir(valor: boolean): void {
    this.confirmDialogAbierto = false;
    const resolver = this.confirmDialogResolve;
    this.confirmDialogResolve = null;
    resolver?.(valor);
  }

  // ============================================================
  // Modal de SELECCIÓN propio — reemplaza los prompt() nativos del
  // navegador que pedían "escribe el número de la opción que quieres"
  // de una lista. En vez de escribir un número a ciegas, se ven las
  // opciones como botones — se hace clic en la que se quiera, o se
  // cancela sin elegir ninguna.
  // ============================================================
  public isModalSeleccionOpen: boolean = false;
  public seleccionMensaje: string = '';
  public seleccionOpciones: { etiqueta: string; valor: any }[] = [];
  private seleccionResolve: ((valor: any) => void) | null = null;

  private mostrarSeleccionPersonalizada(mensaje: string, opciones: { etiqueta: string; valor: any }[]): Promise<any> {
    return new Promise((resolve) => {
      this.seleccionMensaje = mensaje;
      this.seleccionOpciones = opciones;
      this.seleccionResolve = resolve;
      this.isModalSeleccionOpen = true;
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public seleccionElegir(valor: any): void {
    this.isModalSeleccionOpen = false;
    const resolver = this.seleccionResolve;
    this.seleccionResolve = null;
    this.seleccionOpciones = [];
    resolver?.(valor); // null si se cancela sin elegir ninguna
  }

  // ============================================================
  // Modal de TEXTO LIBRE propio — reemplaza el prompt() nativo que
  // pedía escribir texto libre (no una lista de opciones, ver
  // mostrarSeleccionPersonalizada arriba para ese caso).
  // ============================================================
  public isModalTextoLibreOpen: boolean = false;
  public textoLibreMensaje: string = '';
  public textoLibreValor: string = '';
  private textoLibreResolve: ((valor: string | null) => void) | null = null;

  private mostrarTextoLibrePersonalizado(mensaje: string): Promise<string | null> {
    return new Promise((resolve) => {
      this.textoLibreMensaje = mensaje;
      this.textoLibreValor = '';
      this.textoLibreResolve = resolve;
      this.isModalTextoLibreOpen = true;
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public textoLibreConfirmar(): void {
    this.isModalTextoLibreOpen = false;
    const resolver = this.textoLibreResolve;
    this.textoLibreResolve = null;
    const valor = this.textoLibreValor.trim();
    this.textoLibreValor = '';
    resolver?.(valor || null);
  }

  public textoLibreCancelar(): void {
    this.isModalTextoLibreOpen = false;
    const resolver = this.textoLibreResolve;
    this.textoLibreResolve = null;
    this.textoLibreValor = '';
    resolver?.(null);
  }

  // ============================================================
  // Eliminar viaje — 3 opciones explícitas en vez de 2 (antes el
  // reacomodo de los siguientes viajes pasaba SIEMPRE automático, sin
  // preguntar; ahora es una elección aparte).
  // ============================================================
  public isModalEliminarViajeOpen: boolean = false;
  private eliminarViajeResolve: ((accion: 'acomodar' | 'sin_acomodar' | 'cancelar') => void) | null = null;

  private mostrarOpcionesEliminarViaje(): Promise<'acomodar' | 'sin_acomodar' | 'cancelar'> {
    return new Promise((resolve) => {
      this.eliminarViajeResolve = resolve;
      this.isModalEliminarViajeOpen = true;
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public elegirOpcionEliminarViaje(accion: 'acomodar' | 'sin_acomodar' | 'cancelar'): void {
    this.isModalEliminarViajeOpen = false;
    const resolver = this.eliminarViajeResolve;
    this.eliminarViajeResolve = null;
    resolver?.(accion);
  }

  public abrirVarado(): void {
    if (!this.selectedViaje) return;
    this.viajeVaradoOriginal = this.ds.S.viajes.find((v: any) => v.id === this.selectedViaje.id);
    if (!this.viajeVaradoOriginal) return;

    this.varadoRazon = '';
    const dia = Number(this.viajeVaradoOriginal.salida ?? this.viajeVaradoOriginal.dia);
    const placaOriginal = String(this.viajeVaradoOriginal.p || this.viajeVaradoOriginal.placa || '').toUpperCase().trim();
    const mesTexto = this.meses[this.ds.S.mes];
    this.varadoCandidatos = buscarVehiculosDisponiblesParaVarado(dia, this.ds.S, placaOriginal, mesTexto, Number(this.ds.S.anio));

    this.isModalVaradoOpen = true;
  }

  public cerrarVarado(): void {
    this.isModalVaradoOpen = false;
    this.varadoRazon = '';
    this.varadoCandidatos = [];
    this.viajeVaradoOriginal = null;
  }

  public async elegirVehiculoVarado(candidato: any): Promise<void> {
    if (this.procesandoVarado) return;
    if (!this.varadoRazon?.trim()) {
      this.ui.mostrarToast('Escribe la razón de la avería antes de elegir un vehículo.', 'err');
      return;
    }
    // Un vehículo marcado "Varado" ese mismo día (el suyo propio, o
    // porque ya está cumpliendo el viaje de otro) no tiene ningún viaje
    // que choque ahí — se lo quitamos al transferirlo — pero tampoco está
    // realmente disponible. Se bloquea explícitamente en vez de dejarlo
    // pasar sin aviso.
    if (candidato.varadoEseDia) {
      this.ui.mostrarToast(`${candidato.placa} ya está marcado "Varado" ese mismo día (${candidato.varadoEseDia.razon}) — elige otro vehículo.`, 'err');
      return;
    }
    this.procesandoVarado = true;
    // Mismo motivo que en "+Viaje Extra"/robo de terceros: mientras dura
    // todo este guardado en cadena (vehículo averiado + viaje transferido
    // + posibles reacomodos), se pausa la sincronización automática de
    // 20s — sin esto, podía caer justo a la mitad y traer de vuelta una
    // copia del servidor de ANTES de terminar de guardar, deshaciendo el
    // cambio en silencio (así se veía como si "no hiciera nada").
    this.ds.guardandoEnCurso = true;
    try {
      await this.elegirVehiculoVaradoInterno(candidato);
    } finally {
      this.procesandoVarado = false;
      this.ds.guardandoEnCurso = false;
    }
  }

  private async elegirVehiculoVaradoInterno(candidato: any): Promise<void> {
    const viaje = this.viajeVaradoOriginal;
    if (!viaje) return;

    const S = this.ds.S;
    const placaOriginal = String(viaje.p || viaje.placa || '').toUpperCase().trim();
    const diaAveriaOriginal = Number(viaje.salida ?? viaje.dia);

    // Si el candidato elegido ya tiene su propio viaje ese mismo día, NO
    // se toca ni se mueve ese viaje, y el trasbordo TAMPOCO se retrasa —
    // se asigna igual al día que se solicitó (el día en que se averió el
    // vehículo original). Ambos viajes quedan tal cual, uno al lado del
    // otro en esa placa ese día — el usuario decide qué hacer con eso si
    // hace falta, la app no reprograma ni pregunta nada en este caso.

    // Marca la avería en la placa ORIGINAL — un registro por día, que no
    // se borra ni se tapa si esa placa entra en mantenimiento después.
    // OJO: se usa el mes/año ACTIVO (ds.S.mes/anio) — el mismo contra el
    // que se compara al pintar la celda en infoVaradoDelDia() — y no
    // viaje.mes/viaje.anio, que podían no coincidir exactamente si ese
    // campo del viaje venía vacío o en un formato distinto.
    const vehiculoOriginal = (S.vehiculos || []).find((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaOriginal
    );
    if (vehiculoOriginal) {
      if (!vehiculoOriginal.historialAverias) vehiculoOriginal.historialAverias = [];
      vehiculoOriginal.historialAverias.push({
        dia: diaAveriaOriginal,
        mes: this.meses[this.ds.S.mes],
        anio: Number(this.ds.S.anio),
        razon: this.varadoRazon.trim(),
        placaFinal: candidato.placa
      });
      const idxVehOriginal = S.vehiculos.indexOf(vehiculoOriginal);
      await this.ds.guardarVehiculo(vehiculoOriginal, idxVehOriginal);
    }

    // Transfiere el viaje al vehículo elegido (recalcula el retorno según
    // la fórmula de SU transportadora, sea Makand o tercero). Se anota de
    // qué placa venía, para poder mostrar "cumple el viaje de X" en su
    // propia tarjeta.
    (viaje as any).viajeVaradoDe = placaOriginal;
    transferirViajeAOtroVehiculo(viaje, candidato.placa, candidato.tr, S);
    await this.ds.guardarViaje({ ...viaje });

    // Igual que en "+Viaje Extra" y el robo de mantenimiento: los viajes
    // siguientes de la placa que ACABA de recibir este viaje se
    // reacomodan (conflictos directos primero, luego huecos, sin
    // deshacer lo que este mismo paso ya movió).
    const diaIniNuevo = Number(viaje.salida ?? viaje.dia);

    // El vehículo puede quedar ocupado por DOS viajes que ahora conviven
    // ese día (el trasbordo + el que ya tenía el candidato, si tenía
    // uno) — para saber hasta cuándo queda realmente ocupado antes de
    // reacomodar lo que sigue, se usa el MAYOR de los dos retornos, no
    // solo el del trasbordo (que podía terminar antes que el otro viaje
    // y dejar "libre" en el cálculo un vehículo que en realidad seguía
    // ocupado con su viaje propio).
    let diaFinNuevo = Math.max(
      Number(viaje.retorno),
      candidato.viajeConflicto ? Number(candidato.viajeConflicto.retorno) : 0
    );

    // Blindaje extra: además de obtenerViajesEnConflicto (que calcula
    // fechas reales a partir del campo "fecha" de cada viaje), se revisa
    // también por número de día puro — por si algún viaje quedó con el
    // campo "fecha" desalineado de su "dia"/"salida" real (dato viejo de
    // una generación anterior), lo que haría que el cálculo por fecha no
    // detectara un choque que sí existe según el día.
    const conflictivosPorFecha = obtenerViajesEnConflicto(candidato.placa, diaIniNuevo, diaFinNuevo, S, viaje.id)
      // El viaje que el candidato YA tenía ese día (candidato.viajeConflicto)
      // nunca se toca ni se reprograma — se excluye aunque el cálculo de
      // choque lo encuentre dentro del rango.
      .filter((vj: any) => !candidato.viajeConflicto || vj.id !== candidato.viajeConflicto.id);
    const mesTextoActivo = this.meses[this.ds.S.mes];
    const anioActivo = Number(this.ds.S.anio);
    const conflictivosPorDia = (S.viajes || []).filter((vj: any) => {
      if (vj === viaje || vj.id === viaje.id) return false;
      if (candidato.viajeConflicto && vj.id === candidato.viajeConflicto.id) return false;
      if (String(vj.p || vj.placa || '').toUpperCase().trim() !== candidato.placa) return false;
      if (vj.estado === 'Cancelado') return false;
      // Sin este filtro, un viaje de OTRO mes (ya entregado hace semanas)
      // que casualmente cae en el mismo número de día se contaba como
      // choque real — exactamente el mismo tipo de bug que ya tuvimos con
      // "Makand vacío" (mirar el día sin mirar el mes/año).
      if (vj.mes !== mesTextoActivo || Number(vj.anio) !== anioActivo) return false;
      const diaVj = Number(vj.dia ?? vj.salida);
      return diaVj >= diaIniNuevo && diaVj < diaFinNuevo;
    });
    // Deduplicado por CONTENIDO (placa+día+ruta), no solo por id — si hay
    // dos registros de viaje con id distinto pero que representan el
    // mismo viaje real (un dato viejo duplicado), esto también los junta
    // en uno solo, evitando procesarlo dos veces y mostrar el mismo
    // confirm()/alert() repetido.
    const clavesVistas = new Set<string>();
    const conflictivosNuevo: any[] = [];
    for (const vj of [...conflictivosPorFecha, ...conflictivosPorDia]) {
      const clave = `${String(vj.p || vj.placa || '').toUpperCase().trim()}-${Number(vj.dia ?? vj.salida)}-${vj.ruta || vj.codigo}`;
      if (clavesVistas.has(clave)) continue;
      clavesVistas.add(clave);
      conflictivosNuevo.push(vj);
    }

    const idsYaReacomodadosNuevo: any[] = [viaje.id];
    for (const viejo of conflictivosNuevo) {
      const nuevaFecha = reprogramarViajeConflictivo(viejo, S);
      if (nuevaFecha) {
        const fechaObj = new Date(S.anio, S.mes, nuevaFecha.dia);
        viejo.dia = nuevaFecha.dia;
        viejo.salida = nuevaFecha.dia;
        viejo.retorno = nuevaFecha.fin;
        viejo.fecha = `${fechaObj.getFullYear()}-${String(fechaObj.getMonth() + 1).padStart(2, '0')}-${String(fechaObj.getDate()).padStart(2, '0')}`;
        await this.ds.guardarViaje({ ...viejo });
        idsYaReacomodadosNuevo.push(viejo.id);
        continue;
      }

      // OJO: antes, si no se encontraba ningún día libre este mes, el
      // viaje se quedaba tal cual sin avisar nada — parecía que "no
      // pasaba nada". Ahora, igual que en "+Viaje Extra", se pregunta si
      // reasignarlo a un tercero (Arsitrans/Polar) en vez de dejarlo
      // chocando en silencio.
      const clienteViejo = String(viejo.cliente || viejo.cli || '').toLowerCase();
      const nombreTrFallback = clienteViejo.includes('ara') ? 'Arsitrans' : 'Polar';

      const reasignar = await this.mostrarConfirmPersonalizado(
        `El viaje de ${viejo.p || viejo.placa} (${viejo.ruta}, día ${viejo.dia}) choca con el viaje recién asignado por la avería, y no tiene ningún día libre este mes en su propia placa.`,
        `Reasignar a ${nombreTrFallback}`,
        `Dejarlo donde está`
      );

      if (!reasignar) {
        // El usuario decidió dejar este viaje tal cual — pero ahora SU
        // fecha de retorno pasa a ser el nuevo punto de referencia para
        // reacomodar lo que sigue (en vez de simplemente ignorarlo). Se
        // excluye también de que algo más lo mueva más adelante.
        diaFinNuevo = Math.max(diaFinNuevo, Number(viejo.retorno));
        idsYaReacomodadosNuevo.push(viejo.id);
        continue;
      }

      let placaCupo = this.buscarCupoLibre(nombreTrFallback, viejo.salida, viejo.retorno, viejo.id);
      if (!placaCupo) {
        const numeroCupo = this.siguienteNumeroCupo(nombreTrFallback);
        placaCupo = `${nombreTrFallback.toUpperCase()} ${numeroCupo}`;
        await this.asegurarVehiculoParaPlaca(placaCupo, nombreTrFallback);
      }

      viejo.p = placaCupo;
      viejo.veh = placaCupo;
      viejo.placa = placaCupo;
      viejo.tr = nombreTrFallback;
      viejo.transportadora = nombreTrFallback;
      // Tercero: solo ocupa el día de salida.
      viejo.retorno = Number(viejo.salida) + 1;

      await this.ds.guardarViaje({ ...viejo });
    }
    const cambiadosPorHuecoNuevo = reprogramarViajesDesde(candidato.placa, diaFinNuevo, S, idsYaReacomodadosNuevo);
    for (const vj of cambiadosPorHuecoNuevo) {
      vj.tipo = 'extra';
      await this.ds.guardarViaje({ ...vj });
    }

    this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
    this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
    Promise.resolve().then(() => {
      this.zone.run(() => {
        this.cerrarVarado();
        this.cerrarDetalle();
        this.cdr.detectChanges();
      });
    });
  }

  // Para mostrar el marcador "Varado" en una celda de la matriz —
  // consulta el historial de averías del vehículo para ese día exacto.
  public infoVaradoDelDia(vehiculo: any, dia: number): any {
    const mesTexto = this.meses[this.ds.S.mes];
    return esDiaVarado(vehiculo, dia, mesTexto, Number(this.ds.S.anio));
  }

  // ============================================================
  // DESCANSO DE CONDUCTOR — el conductor titular de una placa puede tener
  // días de descanso fijos (campo "desc" en Conductores, ej: "20,21,22").
  // El VEHÍCULO sigue saliendo esos días con normalidad — solo se avisa
  // que el titular no está disponible y se ofrece asignar uno de
  // respaldo, ÚNICAMENTE para ese viaje puntual (no cambia la asignación
  // permanente del conductor a esa placa).
  // ============================================================

  // Devuelve el conductor asignado a esta placa (objeto completo, no
  // solo el nombre) — para poder revisar sus días de descanso.
  private conductorAsignadoDePlaca(placa: string): any {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    return (this.ds.S.conductores || []).find((c: any) =>
      String(c.veh || c.placa || '').toUpperCase().trim() === placaLimpia
    ) || null;
  }

  private parsearDiasDescanso(desc: string): number[] {
    return String(desc || '')
      .split(',')
      .map((d: string) => parseInt(d.trim(), 10))
      .filter((d: number) => !isNaN(d));
  }

  // Los días de descanso son ESPECÍFICOS del mes que se esté viendo en
  // Rutograma — un conductor puede descansar días distintos en agosto
  // que en septiembre. Se guardan en `conductor.descansosPorMes`, un
  // objeto con clave "Agosto-2026" → "20,21,22".
  private diasDescansoDelMesActivo(conductor: any): number[] {
    if (!conductor?.descansosPorMes) return [];
    const mesTexto = this.meses[this.ds.S.mes];
    const anioActivo = Number(this.ds.S.anio);
    const clave = `${mesTexto}-${anioActivo}`;
    return this.parsearDiasDescanso(conductor.descansosPorMes[clave]);
  }

  // Para pintar el aviso en la tarjeta del viaje — si el conductor
  // TITULAR de esa placa (no el que ya quedó escrito en el viaje, que
  // podría ya ser un respaldo) descansa ese día exacto, en el mes que
  // se está viendo ahora mismo.
  public conductorEnDescanso(placa: string, dia: number): any {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    return this.mapaDescansoPorPlacaDia[`${placaLimpia}-${dia}`] || null;
  }

  public isModalDescansoOpen: boolean = false;
  public candidatosRespaldoConductor: any[] = [];
  private viajeDescansoActivo: any = null;
  private conductorTitularDescanso: any = null;

  // Se abre desde la tarjeta del viaje (icono de aviso) — arma la lista
  // de conductores disponibles ese día (ni el titular que descansa, ni
  // otro que TAMBIÉN esté de descanso ese mismo día, en el mes activo).
  public abrirAsignarRespaldo(vj: any, placa: string, dia: number): void {
    const titular = this.conductorEnDescanso(placa, dia);
    if (!titular) return;

    this.viajeDescansoActivo = vj;
    this.conductorTitularDescanso = titular;

    const nombreTitular = String(titular.nom || titular.nombre || '').toLowerCase().trim();
    this.candidatosRespaldoConductor = (this.ds.S.conductores || []).filter((c: any) => {
      const nombreC = String(c.nom || c.nombre || '').toLowerCase().trim();
      if (nombreC === nombreTitular) return false; // no te vas a "respaldar" a ti mismo
      if (c.est && c.est !== 'activo') return false; // de vacaciones/incapacidad tampoco sirve
      const diasDescansoC = this.diasDescansoDelMesActivo(c);
      return !diasDescansoC.includes(Number(dia)); // que no esté TAMBIÉN de descanso ese día
    });

    this.isModalDescansoOpen = true;
  }

  public cerrarAsignarRespaldo(): void {
    this.isModalDescansoOpen = false;
    this.candidatosRespaldoConductor = [];
    this.viajeDescansoActivo = null;
    this.conductorTitularDescanso = null;
  }

  // Asigna el respaldo SOLO a este viaje puntual — no toca la
  // asignación permanente del conductor titular a la placa.
  public async elegirRespaldoConductor(candidato: any): Promise<void> {
    const viaje = this.viajeDescansoActivo;
    if (!viaje) return;

    const nombreRespaldo = candidato.nom || candidato.nombre || '';
    viaje.cond = nombreRespaldo;
    viaje.condTemporal = nombreRespaldo;

    const ok = await this.ds.guardarViaje({ ...viaje });
    if (ok) {
      this.ui.mostrarToast(`${nombreRespaldo} asignado como respaldo para este viaje.`, 'ok');
    } else {
      this.ui.mostrarToast('No se pudo guardar el respaldo. Intenta de nuevo.', 'err');
    }

    this.cerrarAsignarRespaldo();
    this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
    this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
    this.zone.run(() => this.cdr.detectChanges());
  }

  public editandoViaje: boolean = false;
  private placaOriginalEdicion: string = '';

  // Dos "fotos" del viaje al abrir el detalle — se usan solo si otra
  // persona lo modifica mientras se edita, para mostrar qué cambió cada
  // quién (ver guardarViaje en data.ts): cómo estaba GUARDADO, y cómo se
  // le MOSTRABA a esta persona (con los valores de relleno de la pantalla).
  private viajeOriginalEdicion: any = null;
  private vistaInicialEdicion: any = null;

  /**
   * El viaje abierto ya terminó (día cerrado) y esta cuenta no tiene el
   * permiso para cambiarlo: solo se anota el estado y lo que pasó después.
   * El servidor es el que lo hace cumplir (ver backend/dias-cerrados.js).
   */
  public get viajeSeleccionadoBloqueado(): boolean {
    return !!this.viajeOriginalEdicion && viajeCerrado(this.viajeOriginalEdicion) && !this.auth.puede('editarDiasPasados');
  }
  private trOriginalEdicion: string = '';
  private retornoOriginalEdicion: number = 0;

  /**
   * Al editar Salida o Retorno: no se puede poner un día anterior a hoy a
   * un viaje que todavía no ha pasado (no sería un dato real), ni un
   * retorno antes de la salida. Mismo criterio que el servidor
   * (backend/dias-cerrados.js, motivoFechaAnterior). '' = todo bien.
   */
  public get avisoFechasEdicion(): string {
    const original = this.viajeOriginalEdicion;
    if (!this.editandoViaje || !original || !this.selectedViaje) return '';
    const salida = Number(this.selectedViaje.salida);
    const retornoVisto = Number(this.selectedViaje.retorno) - 1;
    if (!Number.isFinite(salida) || salida < 1) return 'Escribe un día de salida válido.';
    if (Number.isFinite(retornoVisto) && retornoVisto < salida && Number(this.selectedViaje.retorno) !== Number(original.retorno)) {
      return `El retorno (día ${retornoVisto}) no puede ser antes de la salida (día ${salida}).`;
    }
    return motivoFechaAnterior(original, this.viajeConFechasEditadas());
  }

  /** El viaje con la fecha de acuerdo a la Salida escrita (la Salida es un número de día del mes del viaje). */
  private viajeConFechasEditadas(): any {
    const original = this.viajeOriginalEdicion || {};
    const salida = Number(this.selectedViaje.salida);
    const cambioSalida = salida !== Number(original.salida ?? original.dia);
    return {
      ...this.selectedViaje,
      fecha: cambioSalida && original.fecha ? fechaDelDia(original.fecha, salida) : (this.selectedViaje.fecha || original.fecha)
    };
  }

  /** Aviso apenas se cambia la Salida o el Retorno a un día que no se puede. */
  public revisarFechasEdicion(): void {
    const aviso = this.avisoFechasEdicion;
    if (aviso) this.ui.mostrarToast(`<i class="bi bi-calendar-x"></i> ${aviso}`, 'err');
  }

  // Caché de "qué placas Makand hay y cuáles están libres" — se calcula
  // UNA SOLA VEZ al abrir la edición (abrirEdicion), NUNCA directo desde
  // la plantilla. Antes la plantilla llamaba a la función que arma esta
  // lista DOS VECES cada vez que Angular repinta (y eso pasa muchas
  // veces por segundo mientras el modal está abierto) — cada llamada
  // revisaba choques contra TODOS los viajes por CADA vehículo Makand,
  // lo que se sentía como que la pantalla se quedaba pegada.
  public vehiculosMakandCache: { vehiculo: any; libre: boolean }[] = [];

  public abrirEdicion(): void {
    if (!this.selectedViaje) return;
    this.editandoViaje = true;
    this.latirPresencia();
    this.vehiculosMakandCache = this.calcularVehiculosMakandParaEdicion();
  }

  // Cuando al editar un viaje (típicamente al cambiarle la transportadora
  // y/o la placa) resulta que esa placa YA tiene otro viaje asignado ese
  // rango de días, se pausa el guardado y se muestra una ventana con dos
  // opciones: reemplazar el viaje ya asignado por este, o dejar las cosas
  // como estaban. `viajesConflicto` son los viajes que chocan; `original`
  // guarda una copia del viaje antes de la edición, por si el usuario
  // decide no reemplazar y hay que restaurar lo que se veía.
  public conflictoEdicionViaje: { viajesConflicto: any[] } | null = null;

  public async guardarCambiosViaje(): Promise<void> {
    if (!this.selectedViaje) return;

    const avisoFechas = this.avisoFechasEdicion;
    if (avisoFechas) {
      this.ui.mostrarToast(`<i class="bi bi-calendar-x"></i> ${avisoFechas}`, 'err');
      return;
    }
    // Si cambió la Salida, la fecha del viaje se mueve con ella (antes solo
    // cambiaba el número: en la grilla se veía en el día nuevo, pero la
    // fecha guardada seguía siendo la vieja).
    const conFechas = this.viajeConFechasEditadas();
    if (conFechas.fecha && conFechas.fecha !== this.selectedViaje.fecha) {
      this.selectedViaje.fecha = conFechas.fecha;
      this.selectedViaje.dia = Number(this.selectedViaje.salida);
    }

    if (this.selectedViaje.estado === 'Cancelado' && !String(this.selectedViaje.motivoCancelacion || '').trim()) {
      this.ui.mostrarToast('Escribe el motivo de la cancelación antes de guardar.', 'err');
      return;
    }
    // Si el viaje deja de estar cancelado, no tiene sentido conservar un
    // motivo viejo colgado.
    if (this.selectedViaje.estado !== 'Cancelado') {
      this.selectedViaje.motivoCancelacion = '';
    }

    // Si se editó la placa (solo pasa con terceros), sincronizamos los
    // otros campos que la app también usa para mostrarla — para que no
    // quede una placa en un lado y otra distinta en otro.
    if (this.selectedViaje.p) {
      this.selectedViaje.veh = this.selectedViaje.p;
      this.selectedViaje.placa = this.selectedViaje.p;
    }

    // ¿Cambió la transportadora? Si es así, el viaje tiene que quedar
    // asociado a una placa que en verdad pertenezca a esa transportadora —
    // si no, se queda visualmente en la fila del vehículo original en vez
    // de bajar a la sección de Arsitrans/Polar.
    const trNuevo = String(this.selectedViaje.tr || 'Makand').trim();
    const trCambio = trNuevo.toLowerCase() !== String(this.trOriginalEdicion || 'Makand').toLowerCase();
    const placaCambio = String(this.selectedViaje.p || '').toUpperCase().trim() !== String(this.placaOriginalEdicion || '').toUpperCase().trim();

    if (trCambio && (trNuevo === 'Arsitrans' || trNuevo === 'Polar')) {
      const placaSinCambiar = !placaCambio;

      if (placaSinCambiar) {
        // Cambió la transportadora pero no escribió una placa nueva —
        // primero buscamos si algún cupo YA EXISTENTE de esa
        // transportadora está libre ese rango de días (los cupos se
        // reutilizan, no se crea uno nuevo si ya hay uno disponible); solo
        // si ninguno está libre se crea uno numerado nuevo.
        let placaCupo = this.buscarCupoLibre(trNuevo, this.selectedViaje.salida, this.selectedViaje.retorno, this.selectedViaje.id);
        if (!placaCupo) {
          const numeroCupo = this.siguienteNumeroCupo(trNuevo);
          placaCupo = `${trNuevo.toUpperCase()} ${numeroCupo}`;
          await this.asegurarVehiculoParaPlaca(placaCupo, trNuevo);
        }
        this.selectedViaje.p = placaCupo;
        this.selectedViaje.veh = placaCupo;
        this.selectedViaje.placa = placaCupo;
        // Tercero: solo ocupa el día de salida.
        this.selectedViaje.retorno = Number(this.selectedViaje.salida) + 1;
      } else {
        // Sí escribió una placa nueva (real, confirmada por la
        // transportadora) — nos aseguramos de que exista como vehículo
        // bajo esa transportadora, para que aparezca como su propia fila.
        await this.asegurarVehiculoParaPlaca(this.selectedViaje.p, trNuevo);
      }

      // El día que el viaje ocupaba en la placa ORIGINAL queda libre —
      // pero no se toca ningún otro viaje de esa placa a menos que
      // alguien de verdad agregue un viaje nuevo ahí (eso ya lo maneja el
      // flujo normal de "agregar viaje extra"/"+Confirmar cupo").
    } else if (!trCambio && placaCambio && (trNuevo === 'Arsitrans' || trNuevo === 'Polar')) {
      // Nota: con el campo "Placa real" separado (ver HTML), esta rama ya
      // no debería dispararse desde la UI normal — la placa de
      // agrupación de un tercero ya no se puede editar directamente. Se
      // deja como blindaje, por si algo más internamente llegara a
      // cambiar selectedViaje.p de un tercero sin pasar por aquí.
      await this.asegurarVehiculoParaPlaca(this.selectedViaje.p, trNuevo);
    }

    // ¿La placa/transportadora a la que se está cambiando este viaje ya
    // tiene otro viaje asignado ese rango de días? En vez de moverlo en
    // silencio a otro día (como se hacía antes), se pregunta primero.
    const conflictivos = obtenerViajesEnConflicto(this.selectedViaje.p, this.selectedViaje.salida, this.selectedViaje.retorno, this.ds.S, this.selectedViaje.id);

    if (conflictivos.length) {
      this.conflictoEdicionViaje = { viajesConflicto: conflictivos };
      return; // pausa aquí — el usuario decide en la ventana de confirmación
    }

    await this.persistirCambiosViaje();
  }

  // El usuario eligió "Reemplazar": el/los viaje(s) que ya estaban
  // asignados ese día se cancelan (con un motivo explicando por qué), y
  // se guarda el cambio de transportadora que se estaba editando.
  public async confirmarReemplazoConflicto(): Promise<void> {
    if (!this.conflictoEdicionViaje || !this.selectedViaje) return;

    const trNuevo = this.selectedViaje.tr || 'Makand';
    for (const viejo of this.conflictoEdicionViaje.viajesConflicto) {
      viejo.estado = 'Cancelado';
      viejo.motivoCancelacion = `Reemplazado: la placa ${this.selectedViaje.p} se reasignó a ${trNuevo} (ruta ${this.selectedViaje.ruta}) este mismo día.`;
      const ok = await this.ds.guardarViaje({ ...viejo });
      if (!ok) {
        this.ui.mostrarToast(`No se pudo cancelar el viaje anterior de ${viejo.p} (${viejo.ruta}). Intenta de nuevo.`, 'err');
        return;
      }
    }

    this.conflictoEdicionViaje = null;
    await this.persistirCambiosViaje();
  }

  // El usuario eligió dejar el viaje ya asignado tal como está — se
  // descarta el cambio de transportadora/placa que se estaba editando.
  public cancelarCambioTransportadora(): void {
    this.conflictoEdicionViaje = null;
  }

  private async persistirCambiosViaje(): Promise<void> {
    if (!this.selectedViaje) return;

    if (this.selectedViaje.estado === 'Entregado') {
      this.selectedViaje.cssClass = 'bg-entregado';
    } else {
      let trGuardar = String(this.selectedViaje.tr || 'makand').toLowerCase().trim();
      if (trGuardar === 'arsi') trGuardar = 'arsitrans';
      this.selectedViaje.cssClass = `bg-${trGuardar}`;
    }

    // Primero al servidor/Excel — solo si sale bien, tocamos la memoria
    // local y volvemos a agrupar. Así nunca queda un cambio "fantasma"
    // que se pierda en la próxima sincronización automática.
    // Este es el único guardado que pide protección contra choques: aquí
    // pasa mucho rato entre abrir el formulario y guardarlo, y otra persona
    // pudo cambiar el mismo viaje en medio.
    const ok = await this.ds.guardarViaje({ ...this.selectedViaje }, false, {
      protegerDeChoques: true,
      revisarChoquesAgenda: true,
      baseOriginal: this.viajeOriginalEdicion,
      baseVista: this.vistaInicialEdicion
    });
    if (!ok) {
      // Si el choque se resolvió descartando lo propio, el viaje local ya
      // quedó con la versión actual: se recarga el detalle con ella (y se
      // sale del modo edición) en vez de dejar abierto un formulario con
      // datos que ya se descartaron.
      if (this.ds.ultimoChoqueDescartado?.tipo === 'viaje' && this.ds.ultimoChoqueDescartado?.clave === String(this.selectedViaje.id)) {
        const idDescartado = this.selectedViaje.id;
        this.ds.ultimoChoqueDescartado = null;
        this.zone.run(() => {
          this.verDetalle(idDescartado);
          this.iniciarCarga();
          this.cdr.detectChanges();
        });
      }
      return;
    }

    // Si se editó el "Retorno" de este viaje (se corrigió su duración) y
    // la placa sigue siendo la misma (no es un cambio de transportadora,
    // eso ya se maneja aparte), los viajes SIGUIENTES de esa placa se
    // acomodan solos usando el hueco real que quedó — cada uno ocupa el
    // día más cercano disponible según su propia duración, igual que ya
    // pasa al eliminar un viaje.
    const placaActual = String(this.selectedViaje.p || '').toUpperCase().trim();
    const retornoActual = Number(this.selectedViaje.retorno);
    const placaSinCambiar = placaActual === String(this.placaOriginalEdicion || '').toUpperCase().trim();

    if (placaSinCambiar && retornoActual !== this.retornoOriginalEdicion && !isNaN(retornoActual)) {
      const cambiados = reprogramarViajesDesde(placaActual, retornoActual, this.ds.S);
      for (const vj of cambiados) {
        const okCambio = await this.ds.guardarViaje({ ...vj });
        if (!okCambio) {
          this.ui.mostrarToast(`El cambio se guardó, pero no se pudo acomodar automáticamente el viaje de ${vj.p || vj.placa} (${vj.ruta}). Revísalo manualmente.`, 'err');
        }
      }
    }

    Promise.resolve().then(() => {
      this.zone.run(() => {
        this.editandoViaje = false;
        this.cerrarDetalle();
        this.iniciarCarga();
        this.cdr.detectChanges();
      });
    });
  }

  public cambiarZoom(valor: number) { 
    this.zoomPorcentaje = Math.max(50, Math.min(200, this.zoomPorcentaje + valor)); 
    const el = document.getElementById('rtbl'); 
    if (el) el.style.transform = `scale(${this.zoomPorcentaje / 100})`; 
  }
  
  public esHoy(d: number) { return d === new Date().getDate() && this.ds.S?.mes === new Date().getMonth(); }
  public esFestivo(d: number) { return this.ds.S?.festivos?.includes(d) || false; }
  public getDiaSem(d: number) { try { return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(this.ds.S.anio, this.ds.S.mes, d).getDay()]; } catch(e) { return '?'; } }
  
  public async eliminarViaje(): Promise<void> {
    if (!this.selectedViaje) return;
    const accion = await this.mostrarOpcionesEliminarViaje();
    if (accion === 'cancelar') return;

    const placaAfectada = this.selectedViaje.p;
    const diaViajeEliminado = Number(this.selectedViaje.dia);

    // Antes esto solo borraba en memoria y escribía directo a
    // localStorage — nunca llegaba al backend/Excel, así que el viaje
    // "eliminado" volvía a aparecer al recargar. Ahora sí borra en el
    // servidor primero, y solo si eso sale bien, actualiza la UI.
    const ok = await this.ds.eliminarViaje(this.selectedViaje.id);
    if (ok) {
      if (accion === 'acomodar') {
        // Los viajes siguientes de este mismo vehículo se corren hacia el
        // hueco que quedó libre, uno tras otro.
        const cambiados = reprogramarSiguientesTrasEliminar(placaAfectada, this.ds.S);
        for (const vj of cambiados) {
          await this.ds.guardarViaje({ ...vj });
        }
      }
      // Si el usuario eligió "sin acomodar nada", no se toca ningún otro
      // viaje — el hueco se queda tal cual, sin correr nada.

      await new Promise<void>(resolve => {
        Promise.resolve().then(() => {
          this.zone.run(() => {
            this.cerrarDetalle();
            this.iniciarCarga();
            this.cdr.detectChanges();
            resolve();
          });
        });
      });

      // El resto (ofrecer mover un viaje de terceros a la placa que
      // quedó libre) solo tiene sentido si de verdad se acomodó — si el
      // usuario pidió explícitamente "sin acomodar nada", tampoco se le
      // ofrece esto.
      if (accion !== 'acomodar') return;

      // Si Arsitrans o Polar YA TIENEN algún viaje agendado ese mismo
      // día (en cualquiera de sus placas), se ofrece mover uno de esos
      // viajes existentes a la placa Makand que acaba de quedar libre
      // — no se crea nada nuevo, se traslada uno que ya estaba.
      const candidatos = (this.ds.S.viajes || []).filter((v: any) =>
        Number(v.dia) === diaViajeEliminado &&
        v.mes === this.meses[this.ds.S.mes] &&
        Number(v.anio) === Number(this.ds.S.anio) &&
        (String(v.tr || '').toLowerCase() === 'arsitrans' || String(v.tr || '').toLowerCase() === 'polar')
      );

      if (!candidatos.length) return;

      let elegido: any;
      if (candidatos.length === 1) {
        elegido = candidatos[0];
        const mover = await this.mostrarConfirmPersonalizado(
          `El día ${diaViajeEliminado}, ${elegido.tr} tiene el viaje "${elegido.ruta}" (placa ${elegido.p}).`,
          `Moverlo a ${placaAfectada} (Makand)`,
          `Dejarlo donde está`
        );
        if (!mover) return;
      } else {
        const opciones = candidatos.map((v: any) => ({
          etiqueta: `${v.tr} — ${v.ruta} (placa ${v.p})`,
          valor: v
        }));
        elegido = await this.mostrarSeleccionPersonalizada(
          `El día ${diaViajeEliminado} hay varios viajes de terceros — ¿cuál quieres mover a ${placaAfectada} (Makand)?`,
          opciones
        );
        if (!elegido) return;
      }

      // Arsitrans/Polar no tienen días de tránsito (su retorno es
      // siempre día+1) — al pasar el viaje a Makand hay que recalcular
      // el retorno con la fórmula real de Makand (salida+diasTrans+diasDesc),
      // usando los campos de la propia ruta.
      const rutaDef = (this.ds.S?.rutas || []).find((r: any) =>
        String(r.cod || r.codigo || '') === String(elegido.ruta)
      );
      const diasTrans = Number(rutaDef?.diasTrans || 1);
      const diasRetornoExtra = Number(rutaDef?.diasDesc || 0);
      const nuevoRetorno = diaViajeEliminado + diasTrans + diasRetornoExtra;

      elegido.p = placaAfectada;
      elegido.veh = placaAfectada;
      elegido.placa = placaAfectada;
      elegido.tr = 'Makand';
      elegido.transportadora = 'Makand';
      elegido.retorno = nuevoRetorno;
      // Se marca igual que un viaje "extra" — es una reasignación hecha
      // a propósito por el usuario, así que hereda las mismas
      // protecciones: nunca se esconde de la matriz, nunca se marca en
      // rojo, aunque choque con otro viaje ya agendado en esa placa.
      elegido.tipo = 'extra';

      const okMovido = await this.ds.guardarViaje({ ...elegido });
      if (okMovido) {
        Promise.resolve().then(() => {
          this.zone.run(() => {
            this.iniciarCarga();
            this.cdr.detectChanges();
          });
        });
      } else {
        this.ui.mostrarToast('No se pudo mover el viaje. Intenta de nuevo.', 'err');
      }
    }
  }

  // ============================================================
  // CONDUCTOR AL EDITAR UN VIAJE — lista de todos los conductores. Si se
  // elige uno distinto al titular de la placa, queda como conductor de
  // ESTE viaje (condTemporal): cambiar después el conductor de la placa
  // no lo pisa.
  // ============================================================
  public get opcionesConductorViaje(): Array<{ nombre: string; etiqueta: string }> {
    const titular = this.conductoresMap[String(this.selectedViaje?.p || '').toUpperCase().trim()] || '';
    const lista = (this.ds.S.conductores || [])
      .map((c: any) => ({ nombre: String(c.nom || c.nombre || '').trim(), placa: String(c.veh || c.placa || '').toUpperCase().trim(), est: c.est }))
      .filter((c: any) => c.nombre)
      .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((c: any) => ({
        nombre: c.nombre,
        etiqueta: `${c.nombre}${c.placa ? ' — ' + c.placa : ' — sin placa'}${c.nombre === titular ? ' (titular)' : ''}${c.est && c.est !== 'activo' ? ' · ' + c.est : ''}`
      }));
    const actual = String(this.selectedViaje?.cond || '').trim();
    const opciones = [{ nombre: 'Sin asignar', etiqueta: 'Sin asignar' }, ...lista];
    if (actual && !opciones.some(o => o.nombre === actual)) opciones.splice(1, 0, { nombre: actual, etiqueta: `${actual} (no está en Conductores)` });
    return opciones;
  }

  public trackConductorOpcion = (_: number, c: { nombre: string }) => c.nombre;

  public elegirConductorViaje(nombre: string): void {
    if (!this.selectedViaje) return;
    const titular = this.conductoresMap[String(this.selectedViaje.p || '').toUpperCase().trim()] || '';
    this.selectedViaje.cond = nombre;
    this.selectedViaje.condTemporal = (nombre && nombre !== 'Sin asignar' && nombre !== titular) ? nombre : '';
  }

  aplicarConductorTemporal(): void {
    if (!this.selectedViaje) return;
    if (this.selectedViaje.condTemporal && this.selectedViaje.condTemporal.trim() !== '') {
      this.selectedViaje.cond = this.selectedViaje.condTemporal;
    }
  }

  verificarEstadosExpirados(): void {
    const hoyReal = new Date();
    hoyReal.setHours(0, 0, 0, 0);

    if (this.ds?.S?.viajes && Array.isArray(this.ds.S.viajes)) {
      let huboCambios = false;
      this.ds.S.viajes = (this.ds.S.viajes as Viaje[]).map((vj: Viaje) => {
        if (!vj.fecha) return vj;
        if (vj.estado === 'Cancelado') return vj; // una cancelación manda siempre, no se recalcula

        // Igual que en iniciarCarga(): comparamos fechas reales (no solo
        // el número del día, para no confundir un mes con otro), y "En
        // ruta" se mantiene durante TODO el tránsito — no solo el día de
        // salida — hasta el día antes de que el vehículo regrese.
        const fechaSalida = new Date(vj.fecha + 'T00:00:00');
        const diasTransito = Number(vj.retorno) - Number(vj.salida);
        const fechaRetorno = new Date(fechaSalida);
        fechaRetorno.setDate(fechaRetorno.getDate() + (isNaN(diasTransito) ? 1 : diasTransito));

        let nuevoEstado: string;
        if (fechaSalida.getTime() > hoyReal.getTime()) {
          nuevoEstado = 'Programado';
        } else if (fechaRetorno.getTime() > hoyReal.getTime()) {
          nuevoEstado = 'En ruta';
        } else {
          nuevoEstado = 'Entregado';
        }

        if (vj.estado !== nuevoEstado) {
          vj.estado = nuevoEstado;
          if (nuevoEstado === 'Entregado') {
            vj.cssClass = 'bg-entregado';
          } else if (nuevoEstado === 'En ruta') {
            vj.cssClass = vj.tipo === 'extra' ? 'bg-extra' : 'bg-en-ruta';
          }
          huboCambios = true;
        }
        return vj;
      });
      if (huboCambios) {
        localStorage.setItem('rutograma_data', JSON.stringify(this.ds.S));
        this.viajesAgrupados = agruparViajes(this.viajesDelMesActual(), this.ds.S);
        this.recalcularMapaDescansoPorPlacaDia();
    this.recalcularResumenPorVehiculoMes();
        this.cdr.detectChanges();
      }
    }
  }

  registrarNovedad(): void {
    if (!this.selectedViaje) return;
    this.cerrarDetalle();
    try {
      this.modalService.abrir('m-novedad'); 
    } catch (e: any) {
      this.setDebugError(`Error al abrir modal m-novedad: ${e.message}`);
    }
    this.cdr.detectChanges();
  }

  public async noveltyDeDetalle(): Promise<void> { 
    if (!this.selectedViaje) return; 
    const texto = await this.mostrarTextoLibrePersonalizado('Introduce la novedad:');
    if (texto) { 
      if (!this.selectedViaje.novedades) this.selectedViaje.novedades = []; 
      this.selectedViaje.novedades.push({ texto, fecha: new Date().toISOString() }); 
      localStorage.setItem('rutograma_data', JSON.stringify(this.ds.S)); 
      this.zone.run(() => this.cdr.detectChanges());
    } 
  }
  
  public async descargarRutograma(): Promise<void> {
    try {
      const apiUrl = API;
      const mesTexto = this.meses[this.ds.S.mes];
      const anio = this.ds.S.anio;

      const response = await this.auth.fetchAutenticado(`${apiUrl}/exportar-rutograma?mes=${encodeURIComponent(mesTexto)}&anio=${anio}`);
      if (!response.ok) {
        this.ui.mostrarToast('No se pudo generar el archivo. Intenta de nuevo.', 'err');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Rutograma_${mesTexto}_${anio}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error descargando el Rutograma:', e);
      this.ui.mostrarToast('No se pudo generar el archivo. Intenta de nuevo.', 'err');
    }
  }

  // ============================================================
  // "FOTO DEL MES" — captura una imagen (PNG) de la matriz REAL de
  // Rutograma tal cual se ve en pantalla (mismos colores, tarjetas,
  // todo), filtrada por transportadora. SIEMPRE trabaja sobre una
  // COPIA clonada de la tabla (nunca la tabla real en pantalla) — se
  // arma fuera de la vista, se captura, y se descarta, sin tocar ni
  // arriesgar nada de lo que el usuario esté viendo/trabajando.
  // ============================================================
  public isModalFotoOpen: boolean = false;
  public fotoTransportadora: string = 'Makand';
  public fotoOrientacion: 'horizontal' | 'vertical' = 'horizontal';
  public fotoTamano: 'A1' | 'A2' | 'A3' | 'A4' = 'A2';
  public generandoFoto: boolean = false;
  public generandoPDF: boolean = false;
  public generandoPreviewFoto: boolean = false;
  public fotoPreviewUrl: string | null = null;

  // Tamaño de papel → factor de resolución para la captura final (no
  // fuerza una proporción de página — eso distorsionaría la matriz
  // real — solo decide qué tan nítida sale la imagen para un papel más
  // grande o más chico).
  private readonly ESCALA_POR_TAMANO: { [k: string]: number } = {
    A1: 4,
    A2: 3,
    A3: 2,
    A4: 1.5
  };

  public abrirFotoMes(): void {
    this.isModalFotoOpen = true;
    this.actualizarPreviewFoto();
  }

  public cerrarFotoMes(): void {
    this.isModalFotoOpen = false;
  }

  // Clona la tabla REAL (#rtbl) y, si se eligió una transportadora
  // específica (no "Todas"), quita del CLON las filas que no sean de
  // esa transportadora — usando el atributo data-transportadora que ya
  // trae cada fila. La tabla real en pantalla nunca se toca.
  private clonarTablaFiltrada(): HTMLElement | null {
    const original = document.getElementById('rtbl');
    if (!original) return null;

    const clone = original.cloneNode(true) as HTMLElement;

    if (this.fotoTransportadora !== 'Todas') {
      const filas = Array.from(clone.querySelectorAll('tr[data-transportadora]'));
      filas.forEach((fila: any) => {
        const trFila = String(fila.getAttribute('data-transportadora') || '').toLowerCase().trim();
        if (trFila !== this.fotoTransportadora.toLowerCase().trim()) {
          fila.remove();
        }
      });
    }

    return clone;
  }

  // Monta el clon FUERA de la pantalla (nunca visible al usuario), lo
  // captura con html2canvas, y lo desmonta — deja todo tal cual estaba.
  private async capturarClon(escala: number): Promise<HTMLCanvasElement | null> {
    const clone = this.clonarTablaFiltrada();
    if (!clone) return null;

    const contenedor = document.createElement('div');
    contenedor.style.position = 'fixed';
    contenedor.style.left = '-99999px';
    contenedor.style.top = '0';
    contenedor.appendChild(clone);
    document.body.appendChild(contenedor);

    // Columnas como "Vehículo"/"Próx. Entrega" usan position:sticky en
    // la tabla real (para quedarse fijas mientras te desplazas por los
    // días) — html2canvas NO renderiza bien ese tipo de posición: sale
    // como una barra sólida tapando el contenido de al lado (los
    // últimos días). Se le quita esa propiedad SOLO a esta copia (nunca
    // a la tabla real en pantalla) justo antes de capturar — se hace
    // AQUÍ (con el clon ya insertado en la página) porque el cálculo de
    // estilos de un elemento todavía no insertado no es confiable.
    clone.querySelectorAll('*').forEach((el: any) => {
      const posicion = window.getComputedStyle(el).position;
      if (posicion === 'sticky' || posicion === '-webkit-sticky' || posicion === 'fixed') {
        el.style.position = 'static';
        el.style.left = 'auto';
        el.style.top = 'auto';
      }
    });

    try {
      const canvas = await html2canvas(clone, {
        scale: escala,
        backgroundColor: '#0f172a',
        useCORS: true
      });
      return canvas;
    } finally {
      document.body.removeChild(contenedor);
    }
  }

  // Vista previa rápida (resolución baja, para que sea instantánea) —
  // se actualiza sola al abrir el modal y cada vez que cambian las
  // opciones.
  public async actualizarPreviewFoto(): Promise<void> {
    if (this.generandoPreviewFoto) return;
    this.generandoPreviewFoto = true;
    this.cdr.detectChanges();

    try {
      const canvas = await this.capturarClon(0.5);
      this.fotoPreviewUrl = canvas ? canvas.toDataURL('image/png') : null;
    } catch (err) {
      console.error('Error generando la vista previa:', err);
    } finally {
      this.generandoPreviewFoto = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Captura en alta resolución y descarga como PNG. Si se eligió
  // orientación vertical, se rota la imagen final 90° (la matriz es
  // naturalmente ancha — así se aprovecha mejor una hoja vertical).
  public async generarFoto(): Promise<void> {
    if (this.generandoFoto) return;
    this.generandoFoto = true;
    this.cdr.detectChanges();

    try {
      const escala = this.ESCALA_POR_TAMANO[this.fotoTamano] || 2;
      let canvas = await this.capturarClon(escala);
      if (!canvas) {
        this.ui.mostrarToast('No se encontró la matriz para capturar.', 'err');
        return;
      }

      if (this.fotoOrientacion === 'vertical') {
        const rotado = document.createElement('canvas');
        rotado.width = canvas.height;
        rotado.height = canvas.width;
        const ctx = rotado.getContext('2d');
        if (ctx) {
          ctx.translate(rotado.width / 2, rotado.height / 2);
          ctx.rotate(Math.PI / 2);
          ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
          canvas = rotado;
        }
      }

      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `Rutograma_${this.fotoTransportadora}_${this.meses[this.ds.S.mes]}_${this.ds.S.anio}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      this.ui.mostrarToast('Imagen descargada correctamente.', 'ok');
    } catch (err) {
      console.error('Error generando la imagen:', err);
      this.ui.mostrarToast('No se pudo generar la imagen. Intenta de nuevo.', 'err');
    } finally {
      this.generandoFoto = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Mismo motor de captura que generarFoto() (capturarClon: mismo clon
  // sin columnas sticky, mismo filtro por transportadora) — la única
  // diferencia es que en vez de descargar el PNG directo, lo mete en
  // una página de PDF (apaisada, porque la matriz siempre es más ancha
  // que alta) escalada para que quepa completa en una sola página.
  public async generarPDF(): Promise<void> {
    if (this.generandoPDF) return;
    this.generandoPDF = true;
    this.cdr.detectChanges();

    try {
      const escala = this.ESCALA_POR_TAMANO[this.fotoTamano] || 2;
      const canvas = await this.capturarClon(escala);
      if (!canvas) {
        this.ui.mostrarToast('No se encontró la matriz para capturar.', 'err');
        return;
      }

      // Página apaisada, tamaño ajustado a la proporción real de la
      // imagen capturada (en vez de un A4 fijo) — así nunca queda con
      // bordes en blanco enormes ni recortada.
      const anchoPagina = 1200;
      const altoPagina = (canvas.height / canvas.width) * anchoPagina;

      const doc = new jsPDF({
        orientation: altoPagina > anchoPagina ? 'portrait' : 'landscape',
        unit: 'px',
        format: [anchoPagina, altoPagina]
      });

      const dataUrl = canvas.toDataURL('image/png');
      doc.addImage(dataUrl, 'PNG', 0, 0, anchoPagina, altoPagina);
      doc.save(`Rutograma_${this.fotoTransportadora}_${this.meses[this.ds.S.mes]}_${this.ds.S.anio}.pdf`);

      this.ui.mostrarToast('PDF descargado correctamente.', 'ok');
    } catch (err) {
      console.error('Error generando el PDF:', err);
      this.ui.mostrarToast('No se pudo generar el PDF. Intenta de nuevo.', 'err');
    } finally {
      this.generandoPDF = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }
}