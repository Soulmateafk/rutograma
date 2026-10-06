import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { errorVehiculo, normalizarPlaca } from '../../services/validaciones';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data';
import { ModalService } from '../../services/modal';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { viajesEnMantenimiento, ViajeEnMantenimiento } from '../../services/mantenimiento';
import { reprogramarViajesDesde, buscarViajesTercerosRobables, tomarViajeTerceroParaVehiculo, obtenerViajesEnConflicto, reprogramarViajeConflictivo, buscarVehiculosDisponiblesParaVarado, transferirViajeAOtroVehiculo } from '../rutograma/rutograma.utils.js';

import { PresenciaService } from '../../services/presencia.service';
import { OtrosAquiComponent } from '../en-linea/otros-aqui';
@Component({
  selector: 'app-vehiculos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, OtrosAquiComponent],
  templateUrl: './vehiculos.html',
  styleUrls: ['./vehiculos.css']
})
export class VehiculosComponent implements OnInit, OnDestroy {

  public ds = inject(DataService);
  public modal = inject(ModalService);
  private presencia = inject(PresenciaService);
  public auth = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);

  // ============================================================
  // Modal de confirmación PROPIO — reemplaza el confirm() nativo del
  // navegador (feo/genérico) por uno con el mismo estilo del resto de
  // la app. Mismo patrón ya usado en rutograma.ts y navbar.ts.
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
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public confirmDialogElegir(valor: boolean): void {
    this.confirmDialogAbierto = false;
    const resolver = this.confirmDialogResolve;
    this.confirmDialogResolve = null;
    resolver?.(valor);
  }

  // Modal de SELECCIÓN propio — reemplaza el prompt() nativo que pedía
  // "escribe el número de la opción que quieres" de una lista. Mismo
  // patrón ya usado en rutograma.ts.
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

  public meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // --- Apartado de histórico: foto guardada de los vehículos de un mes ---
  public mostrarHistorial: boolean = false;
  public historialMes: string = this.meses[new Date().getMonth()];
  public historialAnio: number = new Date().getFullYear();
  public vehiculosHistorial: any[] | null = null;
  public cargandoHistorial: boolean = false;

  public async verHistorialMes(): Promise<void> {
    this.cargandoHistorial = true;
    this.cdr.detectChanges();
    this.vehiculosHistorial = await this.ds.obtenerHistorialVehiculos(this.historialMes, this.historialAnio);
    this.cargandoHistorial = false;
    this.cdr.detectChanges();
  }

  public cerrarHistorial(): void {
    this.mostrarHistorial = false;
    this.vehiculosHistorial = null;
  }
  
  // --- Datos para la tabla ---
  public vehiculosEnriquecidos: any[] = [];

  // Buscador rápido de la tabla — filtra por placa, conductor o
  // transportadora mientras escribes, sin tocar el arreglo original
  // (los índices de "Editar"/"Mant."/"X" siguen apuntando al vehículo
  // real gracias a "v.index", que ya venía guardado en cada fila).
  public busquedaVehiculos: string = '';

  // ============================================================
  // VIAJES ENCIMA DE UN MANTENIMIENTO — los que ya existían antes de
  // que se aplicara la regla (o de registrar el mantenimiento). Se
  // muestran para que alguien decida qué hacer; los nuevos ya no se
  // pueden crear así (lo bloquea el servidor).
  // ============================================================
  private get todosEnMantenimiento(): ViajeEnMantenimiento[] {
    return viajesEnMantenimiento(this.ds.S?.vehiculos || [], this.ds.S?.viajes || []);
  }
  /** Los que todavía se pueden cancelar. */
  public get viajesEnMantenimiento(): ViajeEnMantenimiento[] {
    return this.todosEnMantenimiento.filter(x => x.viaje.estado !== 'Entregado');
  }
  /** Ya entregados: solo se informan (el mantenimiento se registró después). */
  public get entregadosEnMantenimiento(): number {
    return this.todosEnMantenimiento.filter(x => x.viaje.estado === 'Entregado').length;
  }

  public cancelandoViajeId: any = null;

  public async cancelarViajeEnMantenimiento(item: ViajeEnMantenimiento): Promise<void> {
    if (this.cancelandoViajeId !== null) return;
    const vj = item.viaje;
    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Cancelar el viaje ${vj.ruta || vj.codigo || ''} de ${item.placa} del ${vj.fecha}?\n\n` +
      `Ese vehículo está en mantenimiento del ${item.mantenimiento.inicio} al ${item.mantenimiento.fin}.`,
      'Cancelar viaje',
      'Volver'
    );
    if (!confirmado) return;
    this.cancelandoViajeId = vj.id;
    try {
      await this.ds.guardarViaje({
        ...vj,
        estado: 'Cancelado',
        motivoCancelacion: `Vehículo en mantenimiento (${item.mantenimiento.inicio} a ${item.mantenimiento.fin})`
      });
    } finally {
      this.cancelandoViajeId = null;
      this.cdr.detectChanges();
    }
  }

  public get vehiculosFiltrados(): any[] {
    const q = this.busquedaVehiculos.trim().toLowerCase();
    if (!q) return this.vehiculosEnriquecidos;
    return this.vehiculosEnriquecidos.filter(v =>
      String(v.placa || '').toLowerCase().includes(q) ||
      String(v.conductorPrincipal || '').toLowerCase().includes(q) ||
      String(v.transportadora || '').toLowerCase().includes(q)
    );
  }
  private vehiculosMap: any = {}; 

  // --- Variables de UI ---
  public isModalVehiculoOpen: boolean = false;
  public vhIdx: number = -1; 

  public datosVehiculo: any = {
    placa: '',
    tipo: 'Furgon refrigerado',
    capCajas: null,
    maxKg: null,
    maxM3: null,
    conductorPrincipal: '',
    transportadora: 'Makand',
    estado: 'Disponible',
    descansoCorta: 0,
    descansoMedia: 1,
    descansoLarga: 2,
    ultimoMantenimiento: '',
    soatVence: '',
    tecnoVence: ''
  };

  private subDataChanged?: Subscription;

  ngOnInit() {
    if (this.ds.cargado) {
      this.prepararDatos();
    } else {
      setTimeout(() => {
        this.prepararDatos();
      }, 500); 
    }

    // Sin esto, esta pantalla se queda mostrando los datos de cuando se
    // abrió para siempre, sin enterarse de la sincronización automática
    // de cada 20s (mismo bug ya encontrado y corregido en Rutograma).
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.zone.run(() => {
        this.prepararDatos();
        this.cdr.detectChanges();
      });
    });

    // Deep-link desde la búsqueda global del navbar (?buscarPlaca=XXX)
    // — abre ese vehículo específico directo, en vez de solo caer en
    // esta pantalla y tener que buscarlo de nuevo a mano.
    this.route.queryParams.subscribe(params => {
      if (params['buscarPlaca']) this.abrirVehiculoPorPlaca(params['buscarPlaca']);
    });
  }

  private abrirVehiculoPorPlaca(placa: string, intento: number = 0): void {
    const idx = (this.ds.S?.vehiculos || []).findIndex((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === String(placa).toUpperCase().trim()
    );
    if (idx !== -1) {
      this.busquedaVehiculos = ''; // por si un filtro activo lo tapaba
      this.editarVehiculo(idx);
    } else if (intento < 4) {
      // Los datos reales pueden no haber llegado todavía si se entra
      // aquí justo después de iniciar sesión — reintenta un par de
      // veces con margen, en vez de rendirse de una.
      setTimeout(() => this.abrirVehiculoPorPlaca(placa, intento + 1), 400);
    }
  }

  ngOnDestroy() {
    this.subDataChanged?.unsubscribe();
  }

  // --- Lógica Principal de Datos ---
  public prepararDatos() {
    if (!this.ds.S || !this.ds.S.vehiculos) return;

    const { vehiculos = [], viajes = [], conductores = [] } = this.ds.S;

    // "Viajes" cuenta lo mismo que muestra el Rutograma: los del mes que se
    // está viendo, sin cancelados (antes sumaba todos los meses). El total
    // de todos los meses se usa solo para avisar al eliminar un vehículo.
    const prefijoMes = `${this.ds.S.anio}-${String(Number(this.ds.S.mes) + 1).padStart(2, '0')}`;
    const mesTextoVisible = this.meses[this.ds.S.mes];
    const esDelMesVisible = (vj: any) => vj.fecha
      ? String(vj.fecha).startsWith(prefijoMes)
      : vj.mes === mesTextoVisible && Number(vj.anio) === Number(this.ds.S.anio);
    const placaDeViaje = (vj: any) => String(vj.p || vj.placa || '').toUpperCase().trim();
    const viajesCount: Record<string, number> = {};
    const viajesTotal: Record<string, number> = {};
    viajes.forEach((vj: any) => {
      const placa = placaDeViaje(vj);
      viajesTotal[placa] = (viajesTotal[placa] || 0) + 1;
      if (vj.estado !== 'Cancelado' && esDelMesVisible(vj)) viajesCount[placa] = (viajesCount[placa] || 0) + 1;
    });

    const conductoresPorVeh = conductores.reduce((acc: any, c: any) => {
      if (!acc[c.veh]) acc[c.veh] = [];
      acc[c.veh].push(c);
      return acc;
    }, {});

    this.vehiculosMap = {};
    
    this.vehiculosEnriquecidos = vehiculos.map((v: any, i: number) => {
      const estadoOriginal = v.est || 'Disponible';
      const estadoMinusc = estadoOriginal.toLowerCase().trim();
      const placaLimpia = v.p ? v.p.toUpperCase().trim() : '';

      const vEn = {
        ...v,
        index: i,
        placa: placaLimpia,
        tipo: v.t !== undefined && v.t !== null ? v.t : 'Furgon refrigerado',
        capCajas: v.cap !== undefined && v.cap !== null ? v.cap : '---',
        maxKg: v.kg !== undefined && v.kg !== null ? v.kg : '---',
        maxM3: v.m3 !== undefined && v.m3 !== null ? v.m3 : '---',
        conductorPrincipal: v.cond !== undefined && v.cond !== null ? v.cond : 'Sin asignar',
        transportadora: v.tr !== undefined && v.tr !== null ? v.tr : 'Makand',
        categoria: v.categoria || (this.esTransportadoraTerceroNombre(v.tr) ? 'Tercero' : 'Viajero'),
        estado: estadoOriginal,
        descansoCorta: v.dc !== undefined ? v.dc : 0,
        descansoMedia: v.dm !== undefined ? v.dm : 1,
        descansoLarga: v.dl !== undefined ? v.dl : 2,
        
        viajesCount: viajesCount[placaLimpia] || 0,
        viajesTotal: viajesTotal[placaLimpia] || 0,
        conductores: conductoresPorVeh[placaLimpia] || [],
        isMantenimiento: estadoMinusc === 'mantenimiento',
        dotClass: estadoMinusc === 'mantenimiento' ? 'r' : (estadoMinusc === 'disponible' ? 'g' : 'a'),
        ultimoMantenimiento: v.um || ''
      };
      
      this.vehiculosMap[placaLimpia] = vEn;
      return vEn;
    });
  }

  // Mantenimiento preventivo: cada 90 días desde el último registrado.
  private readonly INTERVALO_MANTENIMIENTO_DIAS = 90;

  /**
   * Días que faltan para el próximo mantenimiento (negativo si ya se pasó).
   * Devuelve null si el vehículo nunca ha registrado un mantenimiento.
   */
  public diasParaMantenimiento(v: any): number | null {
    if (!v?.ultimoMantenimiento) return null;
    const ultimo = new Date(v.ultimoMantenimiento + 'T00:00:00');
    if (isNaN(ultimo.getTime())) return null;

    const proximo = new Date(ultimo);
    proximo.setDate(proximo.getDate() + this.INTERVALO_MANTENIMIENTO_DIAS);

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    return Math.round((proximo.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
  }

  /** 'mant-ok' | 'mant-pronto' (≤15 días) | 'mant-vencido' | '' (sin registro) */
  public claseMantenimiento(v: any): string {
    const dias = this.diasParaMantenimiento(v);
    if (dias === null) return '';
    if (dias < 0) return 'mant-vencido';
    if (dias <= 15) return 'mant-pronto';
    return 'mant-ok';
  }

  public textoMantenimiento(v: any): string {
    const dias = this.diasParaMantenimiento(v);
    if (dias === null) return 'Sin registro';
    if (dias < 0) return `Vencido hace ${Math.abs(dias)} días`;
    if (dias === 0) return 'Toca hoy';
    return `Próximo en ${dias} días`;
  }

  // "Mantenimiento actual" — a diferencia de textoMantenimiento() (que
  // habla de un PRÓXIMO mantenimiento preventivo programado por días),
  // esto muestra el mantenimiento REGISTRADO ahora mismo (mantInicio/
  // mantFin), con el rango completo de fechas — pedido explícito del
  // usuario en vez de solo decir "sin registro".
  private formatearFechaCorta(iso: string): string {
    if (!iso) return '';
    const [anio, mes, dia] = iso.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  public textoMantenimientoActual(v: any): string {
    if (!v.mantInicio || !v.mantFin) return 'Sin mantenimiento activo';
    return `${this.formatearFechaCorta(v.mantInicio)} al ${this.formatearFechaCorta(v.mantFin)}`;
  }

  public claseMantenimientoActual(v: any): string {
    return (v.mantInicio && v.mantFin) ? 'mant-vencido' : '';
  }

  // Vencimientos de SOAT/Tecnomecánica — mismo criterio de "días
  // restantes" que ya usa el mantenimiento preventivo: rojo si ya
  // venció, ámbar si vence pronto (15 días o menos), verde si está bien.
  private diasParaFecha(fecha: string | null): number | null {
    if (!fecha) return null;
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const objetivo = new Date(fecha + 'T00:00:00');
    return Math.round((objetivo.getTime() - hoy.getTime()) / 86400000);
  }

  public textoDocumento(fecha: string | null): string {
    const dias = this.diasParaFecha(fecha);
    if (dias === null) return 'Sin registro';
    if (dias < 0) return `Venció hace ${Math.abs(dias)}d`;
    if (dias === 0) return 'Vence hoy';
    return `Vence en ${dias}d`;
  }

  public claseDocumento(fecha: string | null): string {
    const dias = this.diasParaFecha(fecha);
    if (dias === null) return '';
    if (dias < 0) return 'mant-vencido';
    if (dias <= 15) return 'mant-pronto';
    return 'mant-ok';
  }

  // --- MANTENIMIENTO CON RANGO DE FECHAS (inicio y fin) ---
  public isModalMantOpen: boolean = false;
  public vehMantIdx: number = -1; // índice real en ds.S.vehiculos (no el visual)
  public vehMantPlaca: string = '';
  // Fechas completas ("2026-08-03"), no números de día — así no se confunde
  // entre meses distintos.
  public mantForm: { inicio: string | null; fin: string | null } = { inicio: null, fin: null };

  private aISOLocal(d: Date): string {
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  // Al hacer clic en "Mant.": si el vehículo ya está en mantenimiento, abre
  // el formulario con sus fechas actuales (para ajustarlas o quitarlo); si
  // no, lo abre con hoy como inicio sugerido.
  public abrirMantenimiento(index: number) {
    const vehiculoEnriquecido = this.vehiculosEnriquecidos[index];
    const originalIndex = vehiculoEnriquecido.index;
    const v = this.ds.S.vehiculos[originalIndex];
    if (!v) return;

    this.vehMantIdx = originalIndex;
    this.vehMantPlaca = vehiculoEnriquecido.placa;
    this.presencia.establecer(`registrando mantenimiento de ${vehiculoEnriquecido.placa}`, `vehiculo:${vehiculoEnriquecido.placa}`, true);

    const estaEnMantenimiento = (v.est || 'Disponible').toLowerCase().trim() === 'mantenimiento';
    if (estaEnMantenimiento) {
      this.mantForm = { inicio: v.mantInicio || this.aISOLocal(new Date()), fin: v.mantFin || null };
    } else {
      this.mantForm = { inicio: this.aISOLocal(new Date()), fin: null };
    }
    this.isModalMantOpen = true;
  }

  public cerrarModalMant() {
    this.isModalMantOpen = false;
    this.presencia.limpiar();
    this.vehMantIdx = -1;
  }

  // Reutilizado tanto al eliminar el mantenimiento activo como una
  // entrada del historial. Solo revierte los viajes que quedaron
  // "Cancelado" de verdad — los que en su momento se TRASLADARON a
  // otro vehículo o a un tercero (lo más común, ver
  // cancelarViajesEnRango) no se tocan solos, porque devolverlos
  // automáticamente tiene más riesgo de dejar algo inconsistente; se
  // listan aparte para que la persona decida.
  private async restaurarViajesCancelados(placa: string, inicio: string, fin: string): Promise<{ restaurados: number; trasladados: any[] }> {
    const placaLimpia = String(placa || '').toUpperCase().trim();

    const cancelados = (this.ds.S.viajes || []).filter((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia &&
      v.estado === 'Cancelado' &&
      v.fecha && v.fecha >= inicio && v.fecha <= fin
    );

    let restaurados = 0;
    for (const v of cancelados) {
      v.estado = 'Planificado';
      delete v.motivoCancelacion;
      await this.ds.guardarViaje({ ...v });
      restaurados++;
    }

    const trasladados = (this.ds.S.viajes || []).filter((v: any) =>
      String(v.placaOriginal || '').toUpperCase().trim() === placaLimpia &&
      v.fecha && v.fecha >= inicio && v.fecha <= fin
    );

    return { restaurados, trasladados };
  }

  private mensajeResultadoEliminarMant(v: any, restaurados: number, trasladados: any[]): string {
    let mensaje = 'Mantenimiento eliminado.';
    if (restaurados > 0) mensaje += ` ${restaurados} viaje(s) de ${v.p || v.placa} volvieron a "Planificado".`;
    if (trasladados.length > 0) {
      mensaje += ` <i class="bi bi-exclamation-triangle-fill"></i> ${trasladados.length} viaje(s) de ese rango se habían trasladado a otro vehículo/tercero — revísalos a mano si quieres devolverlos: ` +
        trasladados.map((t: any) => `${t.ruta || t.codigo || ''} (${t.fecha})`).join(', ');
    }
    return mensaje;
  }

  // Elimina el mantenimiento ACTIVO por completo, SIN archivarlo en el
  // historial — para cuando se registró por error. "Quitar
  // mantenimiento" (arriba) sigue siendo lo normal cuando el
  // mantenimiento de verdad terminó.
  public async eliminarMantenimientoActivo(): Promise<void> {
    if (this.procesandoMantenimiento || this.vehMantIdx === -1) return;
    const v = this.ds.S.vehiculos[this.vehMantIdx];
    if (!v || !v.mantInicio || !v.mantFin) return;

    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Eliminar este mantenimiento de ${v.p || v.placa} por completo (${v.mantInicio} a ${v.mantFin})? A diferencia de "Quitar mantenimiento", esto NO lo deja en el historial — úsalo solo si se registró por error.`,
      'Eliminar', 'Cancelar'
    );
    if (!confirmado) return;

    this.procesandoMantenimiento = true;
    this.ds.guardandoEnCurso = true;
    try {
      const { restaurados, trasladados } = await this.restaurarViajesCancelados(v.p || v.placa, v.mantInicio, v.mantFin);

      v.est = 'Disponible';
      v.estado = 'Disponible';
      v.mantInicio = null;
      v.mantFin = null;

      await this.ds.guardarVehiculo(v, this.vehMantIdx);
      await this.ds.autoSave();
      this.cerrarModalMant();
      this.ui.mostrarToast(this.mensajeResultadoEliminarMant(v, restaurados, trasladados), 'ok');
    } finally {
      this.procesandoMantenimiento = false;
      this.ds.guardandoEnCurso = false;
      await Promise.resolve();
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Elimina UNA entrada específica del historial de mantenimientos
  // cerrados — mismo criterio de restauración que arriba.
  public async eliminarEntradaHistorialMant(idx: number): Promise<void> {
    if (this.procesandoMantenimiento || this.vehMantIdx === -1) return;
    const v = this.ds.S.vehiculos[this.vehMantIdx];
    if (!v || !Array.isArray(v.historialMantenimiento)) return;
    const entrada = v.historialMantenimiento[idx];
    if (!entrada) return;

    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Eliminar este mantenimiento del historial de ${v.p || v.placa} (${entrada.inicio} a ${entrada.fin})?`,
      'Eliminar', 'Cancelar'
    );
    if (!confirmado) return;

    this.procesandoMantenimiento = true;
    this.ds.guardandoEnCurso = true;
    try {
      const { restaurados, trasladados } = await this.restaurarViajesCancelados(v.p || v.placa, entrada.inicio, entrada.fin);
      v.historialMantenimiento.splice(idx, 1);

      await this.ds.guardarVehiculo(v, this.vehMantIdx);
      await this.ds.autoSave();
      this.ui.mostrarToast(this.mensajeResultadoEliminarMant(v, restaurados, trasladados), 'ok');
    } finally {
      this.procesandoMantenimiento = false;
      this.ds.guardandoEnCurso = false;
      await Promise.resolve();
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Guarda ediciones de fecha hechas a mano sobre entradas YA
  // existentes del historial (los inputs de fecha están enlazados
  // directo al arreglo — esto solo persiste lo que haya cambiado).
  public async guardarEdicionHistorialMant(): Promise<void> {
    if (this.procesandoMantenimiento || this.vehMantIdx === -1) return;
    const v = this.ds.S.vehiculos[this.vehMantIdx];
    if (!v) return;

    this.procesandoMantenimiento = true;
    this.ds.guardandoEnCurso = true;
    try {
      await this.ds.guardarVehiculo(v, this.vehMantIdx);
      await this.ds.autoSave();
      this.ui.mostrarToast('Historial de mantenimiento actualizado.', 'ok');
    } finally {
      this.procesandoMantenimiento = false;
      this.ds.guardandoEnCurso = false;
      await Promise.resolve();
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Un viaje que YA estaba en tránsito cuando empieza el mantenimiento
  // (arrancó antes o justo el mismo día) se deja terminar normal — se
  // marca como Entregado, no se toca más, como si el vehículo completara
  // ese viaje y de ahí sí entrara al taller.
  //
  // Los viajes que arrancarían DURANTE el mantenimiento (todavía no
  // habían salido) YA NO se cancelan sin más — se intentan transferir a
  // otro vehículo disponible ese mismo día (mismo criterio que
  // "Vehículo Varado"): primero otro Makand libre (reacomodando sus
  // viajes siguientes para hacerle campo), si no hay ninguno a un cupo
  // de tercero existente, y si de plano no hay nada libre, se crea un
  // cupo nuevo de tercero (Arsitrans si el cliente es "Ara", si no
  // Polar) — solo como último recurso quedaría sin cubrir.
  private async cancelarViajesEnRango(placa: string, fechaInicio: string, fechaFin: string): Promise<void> {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    const afectados = (this.ds.S.viajes || []).filter((v: any) => {
      const pViaje = String(v.p || v.placa || '').toUpperCase().trim();
      if (pViaje !== placaLimpia) return false;
      if (v.estado === 'Cancelado') return false;
      const fechaViajeInicio = v.fecha || '';
      if (!fechaViajeInicio) return false;

      // Hasta qué fecha real ocupa este viaje (día de regreso incluido) —
      // así detectamos también los viajes que arrancaron ANTES del
      // mantenimiento pero todavía seguían "en tránsito" cuando empezó.
      // Antes esto solo miraba si el viaje ARRANCABA dentro del rango,
      // dejando pasar sin cancelar justo estos casos.
      const diasTransito = Number(v.retorno) - Number(v.salida);
      const fechaFinObj = new Date(fechaViajeInicio + 'T00:00:00');
      fechaFinObj.setDate(fechaFinObj.getDate() + (isNaN(diasTransito) ? 0 : diasTransito));
      const fechaViajeFin = `${fechaFinObj.getFullYear()}-${String(fechaFinObj.getMonth() + 1).padStart(2, '0')}-${String(fechaFinObj.getDate()).padStart(2, '0')}`;

      // Se afecta (cancela o marca entregado) si los dos rangos de fechas
      // se cruzan en algún punto.
      return fechaViajeInicio <= fechaFin && fechaViajeFin >= fechaInicio;
    });

    for (const v of afectados) {
      const fechaViajeInicio = v.fecha || '';
      const yaEstabaEnTransito = fechaViajeInicio <= fechaInicio;

      if (yaEstabaEnTransito) {
        // El vehículo ya había salido antes de que empezara el
        // mantenimiento — se deja terminar ese viaje, se marca como
        // entregado en vez de cancelarlo.
        v.estado = 'Entregado';
        await this.ds.guardarViaje({ ...v });
        continue;
      }

      // Todavía no había salido — en vez de cancelarlo sin más, se
      // intenta pasarlo a otro vehículo disponible ese mismo día (mismo
      // criterio que "Vehículo Varado"): primero otro Makand libre: si
      // no hay ninguno, a un cupo de tercero (Arsitrans/Polar) — y solo
      // si de plano no hay NADA disponible, ahí sí se cancela.
      const diaObjetivo = Number(v.salida ?? v.dia);
      const candidatos = buscarVehiculosDisponiblesParaVarado(diaObjetivo, this.ds.S, placaLimpia, v.mes, v.anio);

      // "libre" en buscarVehiculosDisponiblesParaVarado solo revisa el
      // DÍA DE SALIDA — insuficiente aquí, porque el viaje que se mueve
      // dura VARIOS días (hasta su retorno). Sin este chequeo extra, un
      // vehículo con algo agendado 1-2 días después de la salida se
      // marcaba "libre" igual, y el viaje transferido terminaba
      // chocando con eso apenas arrancaba.
      const elegido = candidatos.find((c: any) => {
        if (!c.libre) return false;
        const esTerceroDestino = String(c.tr || '').toLowerCase().includes('polar') || String(c.tr || '').toLowerCase().includes('arsitran');
        let retornoProyectado: number;
        if (esTerceroDestino) {
          retornoProyectado = diaObjetivo + 1;
        } else {
          const rutaViaje = (this.ds.S.rutas || []).find((r: any) => (r.cod || r.codigo) === (v.ruta || v.codigo));
          const diasTrans = rutaViaje && !isNaN(Number(rutaViaje.diasTrans)) ? Number(rutaViaje.diasTrans) : 1;
          retornoProyectado = diaObjetivo + diasTrans + 1;
        }
        return obtenerViajesEnConflicto(c.placa, diaObjetivo, retornoProyectado + 1, this.ds.S).length === 0;
      });

      if (elegido) {
        const eraMakand = String(elegido.tr || '').toLowerCase().includes('makand');
        v.placaOriginal = placaLimpia;
        transferirViajeAOtroVehiculo(v, elegido.placa, elegido.tr, this.ds.S);
        await this.ds.guardarViaje({ ...v });
        this.ui.mostrarToast(
          `Viaje ${v.ruta || v.codigo || ''} (${placaLimpia}) reasignado a ${elegido.placa} (${elegido.tr}) por mantenimiento.`,
          'ok'
        );

        // Si quedó en OTRO vehículo Makand, sus viajes siguientes se
        // recorren hacia adelante para hacerle campo — mismo
        // comportamiento ya establecido para Vehículo Varado.
        if (eraMakand) {
          reprogramarViajesDesde(elegido.placa, diaObjetivo + 1, this.ds.S, [v.id]);
        }
        continue;
      }

      // Nadie disponible — se crea un cupo nuevo de tercero (mismo
      // criterio de siempre: cliente "Ara" -> Arsitrans, cualquier otro
      // -> Polar), en vez de dejar el viaje sin cubrir.
      const cliente = String(v.cliente || '').toLowerCase();
      const nombreTr = cliente.includes('ara') ? 'Arsitrans' : 'Polar';
      const numeroCupo = (this.ds.S.vehiculos || [])
        .filter((veh: any) => String(veh.tr || '').toLowerCase() === nombreTr.toLowerCase())
        .length + 1;
      const placaCupo = `${nombreTr.toUpperCase()} ${numeroCupo}`;

      if (!this.ds.S.vehiculos.find((veh: any) => (veh.p || veh.placa) === placaCupo)) {
        // guardarVehiculo(-1) YA hace el POST al servidor y agrega el
        // resultado a memoria por sí solo — empujarlo manualmente aquí
        // ANTES hubiera creado un cupo duplicado (uno en memoria sin
        // guardar, y otro real al llamar guardarVehiculo).
        await this.ds.guardarVehiculo({
          p: placaCupo, tr: nombreTr, categoria: 'Tercero', est: 'Disponible'
        }, -1, true);
      }

      v.placaOriginal = placaLimpia;
      transferirViajeAOtroVehiculo(v, placaCupo, nombreTr, this.ds.S);
      await this.ds.guardarViaje({ ...v });
      this.ui.mostrarToast(
        `Viaje ${v.ruta || v.codigo || ''} (${placaLimpia}) reasignado a ${placaCupo} (${nombreTr}) por mantenimiento.`,
        'ok'
      );
    }
  }

  // Ningún botón de "Guardar" en esta app se deshabilitaba mientras
  // corría — como confirm()/alert() PAUSAN la ejecución pero el botón
  // sigue siendo clickeable, un segundo clic (o Enter) mientras el
  // primer diálogo seguía abierto disparaba la función OTRA VEZ en
  // paralelo, mostrando la misma pregunta repetida justo después de
  // responder la primera. Esta traba evita que corra dos veces a la vez.
  public procesandoMantenimiento: boolean = false;

  public async guardarMantenimiento() {
    if (this.procesandoMantenimiento) return;
    this.procesandoMantenimiento = true;
    try {
      await this.guardarMantenimientoInterno();
    } finally {
      this.procesandoMantenimiento = false;
      // Toda la función de arriba corre dentro de callbacks async (el
      // guardado del vehículo, de cada viaje transferido, etc.) — en
      // modo zoneless eso NUNCA repinta solo. Sin esto, el modal
      // quedaba "cerrado" en los datos (isModalMantOpen ya en false)
      // pero seguía viéndose en pantalla hasta cambiar de página o
      // recargar.
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  private async guardarMantenimientoInterno() {
    if (this.vehMantIdx === -1) return;
    if (!this.mantForm.inicio || !this.mantForm.fin) {
      this.ui.mostrarToast('Selecciona la fecha de inicio y la fecha de fin del mantenimiento.', 'err');
      return;
    }
    if (this.mantForm.fin < this.mantForm.inicio) {
      this.ui.mostrarToast('La fecha de fin no puede ser antes de la fecha de inicio.', 'err');
      return;
    }

    const v = this.ds.S.vehiculos[this.vehMantIdx];
    if (!v) return;

    // Mientras dura todo este guardado (cancelar/marcar viajes + guardar
    // el vehículo), la sincronización automática de 20s se pausa — sin
    // esto, podía caer justo en medio y sobrescribir los cambios locales
    // con una copia del servidor de ANTES de que este guardado terminara
    // (mismo bug que ya se encontró y corrigió en "+ Viaje Extra").
    this.ds.guardandoEnCurso = true;
    try {
      // Vehículos guarda el estado en "est"; Rutograma (el punto ● en la
      // matriz) tiene su PROPIA copia de este mismo formulario y lo
      // guarda en "estado" — dos pantallas, dos nombres de campo para lo
      // mismo. Si solo se actualiza uno de los dos, el otro se queda
      // desincronizado, y "quitar mantenimiento" desde la pantalla
      // contraria puede limpiar las fechas sin darse cuenta de que este
      // campo seguía diciendo "Mantenimiento" — lo cual, sin fechas
      // guardadas, termina bloqueando TODOS los días del vehículo en vez
      // de ninguno. Se escriben ambos campos siempre, juntos, para que
      // nunca queden desincronizados sin importar desde qué pantalla se
      // edite.
      v.est = 'Mantenimiento';
      v.estado = 'Mantenimiento';
      v.mantInicio = this.mantForm.inicio;
      v.mantFin = this.mantForm.fin;

      await this.cancelarViajesEnRango(v.p, this.mantForm.inicio, this.mantForm.fin);

      // El viaje que ya estuviera agendado DESPUÉS del mantenimiento se
      // acomoda justo al día siguiente de que termine — para que el
      // vehículo vuelva a estar en ruta apenas sale del taller, en vez de
      // quedarse parado hasta su próximo viaje ya agendado más adelante.
      // reprogramarViajesDesde() SOLO mueve un viaje a un día donde su
      // propia ruta de verdad corre (respeta el horario semanal) — nunca
      // "presta" el viaje de otro día distinto solo para llenar el hueco.
      const finMant = new Date(this.mantForm.fin + 'T00:00:00');
      let sePudoAcomodarDiaSiguiente = true;
      if (finMant.getFullYear() === Number(this.ds.S.anio) && finMant.getMonth() === Number(this.ds.S.mes)) {
        const diaSiguiente = finMant.getDate() + 1;
        const cambiados = reprogramarViajesDesde(v.p, diaSiguiente, this.ds.S);
        for (const vj of cambiados) {
          // Se marca igual que un viaje "extra" — es un reacomodo hecho por
          // el sistema (no la asignación original del usuario), así que
          // hereda la misma protección: nunca se marca en rojo aunque su
          // nuevo día caiga cerca de otro viaje ya agendado.
          vj.tipo = 'extra';
          await this.ds.guardarViaje({ ...vj });
        }

        // ¿Alguno de los viajes que se acomodaron quedó de verdad en el día
        // siguiente al mantenimiento? Si no, es porque ninguna de las
        // rutas de este vehículo corre ese día de la semana — no hay nada
        // que "prestar" ahí, hay que avisar para que se agregue a mano.
        const totalDiasMes = new Date(Number(this.ds.S.anio), Number(this.ds.S.mes) + 1, 0).getDate();
        if (diaSiguiente <= totalDiasMes) {
          sePudoAcomodarDiaSiguiente = cambiados.some((vj: any) => Number(vj.dia) === diaSiguiente);

          // Ese día quedó libre, pero el vehículo no tenía nada propio
          // agendado ahí — antes de rendirse, revisamos si algún tercero
          // (Arsitrans/Polar) SÍ tiene un viaje justo ese día con una ruta
          // corta (1 o 2 días de tránsito). Si es así, se le puede quitar
          // y dárselo a este vehículo que recién sale del taller, en vez
          // de dejarlo parado.
          if (!sePudoAcomodarDiaSiguiente) {
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

                // Igual que al agregar un "+ Viaje Extra": los viajes de
                // esta misma placa que choquen directo con el que se
                // acaba de tomar se reacomodan hacia adelante, y el resto
                // se revisa por si hay más hueco que llenar (excluyendo
                // los que este mismo paso ya movió, para no deshacerlo).
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

                sePudoAcomodarDiaSiguiente = true; // ya no hace falta el aviso de "agrégalo a mano"
              }
            }
          }
        }
      }

      await this.ds.guardarVehiculo(v, this.vehMantIdx);
      await this.ds.autoSave();
      this.cerrarModalMant();
      this.prepararDatos();

      if (!sePudoAcomodarDiaSiguiente) {
        this.ui.mostrarToast(
          `${v.p} queda libre al terminar el mantenimiento, pero ninguna de sus rutas corre ese día — no hay nada que adelantar.<br>Agrégalo a mano con "+ Viaje Extra" si hace falta.`,
          'err'
        );
      }
    } finally {
      this.ds.guardandoEnCurso = false;
    }
  }

  public async quitarMantenimiento() {
    if (this.procesandoMantenimiento) return;
    this.procesandoMantenimiento = true;
    try {
      await this.quitarMantenimientoInterno();
    } finally {
      this.procesandoMantenimiento = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  private async quitarMantenimientoInterno() {
    if (this.vehMantIdx === -1) return;
    const v = this.ds.S.vehiculos[this.vehMantIdx];
    if (!v) return;

    this.ds.guardandoEnCurso = true;
    try {
      // Guardamos el rango que tenía antes de borrarlo, para poder pintar
      // esos días en rojo más adelante como "estuvo en mantenimiento" —
      // sin esto, el rango se perdía por completo al quitarlo.
      if (v.mantInicio && v.mantFin) {
        if (!Array.isArray(v.historialMantenimiento)) v.historialMantenimiento = [];
        v.historialMantenimiento.push({ inicio: v.mantInicio, fin: v.mantFin });
      }

      v.est = 'Disponible';
      v.estado = 'Disponible'; // Mismo motivo que en guardarMantenimiento() — mantener ambos campos sincronizados
      v.mantInicio = null;
      v.mantFin = null;
      // Asumimos que el mantenimiento se hizo hoy y reiniciamos la cuenta de 90 días.
      v.um = this.aISOLocal(new Date());

      await this.ds.guardarVehiculo(v, this.vehMantIdx);
      await this.ds.autoSave();
      this.cerrarModalMant();
      this.prepararDatos();
    } finally {
      this.ds.guardandoEnCurso = false;
    }
  }

  public async eliminarVehiculo(index: number): Promise<void> {
    const v = this.vehiculosEnriquecidos[index];
    if (!v) return;

    const msg = v.viajesTotal > 0
      ? `¿Eliminar "${v.placa}"? Tiene ${v.viajesTotal} viaje(s) asignado(s) en total.` 
      : `¿Eliminar el vehículo "${v.placa}"?`;

    const confirmado = await this.mostrarConfirmPersonalizado(msg, 'Eliminar', 'Cancelar');
    if (!confirmado) return;

    this.ds.eliminarVehiculoBD(v.placa).subscribe({
      next: (res: any) => {
        if (res.ok) {
          const eliminado = this.ds.S.vehiculos[v.index];
          if (eliminado) {
            this.ds.registrarCambio({
              tipo: 'eliminar-vehiculo', clave: String(eliminado.p || eliminado.placa || ''),
              antes: JSON.parse(JSON.stringify(eliminado)), despues: null,
              descripcion: `Eliminación del vehículo ${v.placa}`
            });
          }
          this.ds.S.vehiculos.splice(v.index, 1);
          this.ds.autoSave();
          this.prepararDatos();
          this.ui.mostrarToast('Vehículo eliminado correctamente.', 'ok');
        }
      },
      error: (err: any) => {
        console.error("❌ Error eliminando vehículo:", err);
        this.ui.mostrarToast('No se pudo eliminar el vehículo.', 'err');
      }
    });
  }

  public editarVehiculo(i: number) { 
    const vVisual = this.vehiculosEnriquecidos[i];
    this.vhIdx = vVisual.index; 
    
    const v = this.ds.S.vehiculos[this.vhIdx];
    // "Foto" del vehículo tal como estaba guardado al abrir el modal — se
    // usa solo si otra persona lo modifica mientras se edita (protección
    // contra choques, ver guardarVehiculo en data.ts).
    this.vehiculoOriginalEdicion = { ...v };

    this.datosVehiculo = {
      placa: v.p, 
      tipo: v.t !== undefined && v.t !== null ? v.t : vVisual.tipo, 
      capCajas: v.cap !== undefined && v.cap !== null ? v.cap : (vVisual.capCajas === '---' ? null : vVisual.capCajas), 
      maxKg: v.kg !== undefined && v.kg !== null ? v.kg : (vVisual.maxKg === '---' ? null : vVisual.maxKg), 
      maxM3: v.m3 !== undefined && v.m3 !== null ? v.m3 : (vVisual.maxM3 === '---' ? null : vVisual.maxM3),
      conductorPrincipal: v.cond !== undefined && v.cond !== null ? v.cond : (vVisual.conductorPrincipal === 'Sin asignar' ? '' : vVisual.conductorPrincipal), 
      transportadora: v.tr !== undefined && v.tr !== null ? v.tr : vVisual.transportadora,
      // Vehículos de antes de este campo (categoria) no lo tienen guardado
      // todavía — se infiere a partir de la transportadora: si ya es
      // Polar/Arsitrans, es "Tercero"; si no, "Viajero" (todos los que ya
      // existían son viajeros, según lo confirmado — ninguno "Urbano"
      // todavía, eso se marca a mano de aquí en adelante).
      categoria: v.categoria || (this.esTransportadoraTerceroNombre(v.tr) ? 'Tercero' : 'Viajero'),
      estado: v.est || 'Disponible', 
      descansoCorta: v.dc || 0,
      descansoMedia: v.dm || 1, 
      descansoLarga: v.dl || 2,
      ultimoMantenimiento: v.um || '',
      soatVence: v.soatVence || '',
      tecnoVence: v.tecnoVence || ''
    };
    this.isModalVehiculoOpen = true;
    this.modal.abrir('m-veh');
    this.presencia.establecer(`editando el vehículo ${v.p}`, `vehiculo:${v.p}`, true);
  }

  // "Tercero" (Arsitrans/Polar u otro que se agregue) vs flota propia
  // (Urbano/Viajero, siempre Makand). Al cambiar la categoría, se ajusta
  // la transportadora para que no quede desincronizada.
  private esTransportadoraTerceroNombre(tr: any): boolean {
    const t = String(tr || '').toLowerCase().trim();
    return t !== '' && t !== 'makand';
  }

  public onCategoriaVehiculoChange(): void {
    if (this.datosVehiculo.categoria === 'Tercero') {
      if (!this.datosVehiculo.transportadora || this.datosVehiculo.transportadora === 'Makand') {
        this.datosVehiculo.transportadora = this.transportadorasTercerosExistentes()[0] || '';
      }
    } else {
      this.datosVehiculo.transportadora = 'Makand';
    }
  }

  // Lista de nombres de transportadora ya usados por vehículos "Tercero"
  // existentes (para el datalist del formulario) — así no hay que
  // escribirlos de memoria cada vez, pero tampoco se limita solo a
  // Polar/Arsitrans si en el futuro se agrega otro.
  public transportadorasTercerosExistentes(): string[] {
    const nombres = new Set<string>();
    (this.ds.S.vehiculos || []).forEach((v: any) => {
      if (this.esTransportadoraTerceroNombre(v.tr || v.transportadora)) {
        nombres.add(String(v.tr || v.transportadora).trim());
      }
    });
    return Array.from(nombres).sort();
  }

  private vehiculoOriginalEdicion: any = null;

  public guardarVehiculo() {
    if (!this.datosVehiculo.placa?.trim()) { this.ui.mostrarToast('Escribe la placa.', 'err'); return; }
    // Placa escrita como en la flota ('lun428' -> 'LUN 428') y datos revisados
    // antes de tocar nada (el servidor revisa lo mismo).
    if (this.vhIdx === -1) this.datosVehiculo.placa = normalizarPlaca(this.datosVehiculo.placa);
    const errorDato = errorVehiculo({
      p: this.datosVehiculo.placa, cajas: this.datosVehiculo.capCajas, kg: this.datosVehiculo.maxKg, m3: this.datosVehiculo.maxM3,
      cond: this.datosVehiculo.conductorPrincipal, soatVence: this.datosVehiculo.soatVence, tecnoVence: this.datosVehiculo.tecnoVence
    }, this.vhIdx !== -1 ? this.vehiculoOriginalEdicion : null, this.vhIdx !== -1 ? [] : (this.ds.S.vehiculos || []));
    if (errorDato) { this.ui.mostrarToast(errorDato, 'err'); return; }
    
    const vOriginal = this.vhIdx !== -1 ? this.ds.S.vehiculos[this.vhIdx] : {};

    const vehiculoEstructurado = {
      ...vOriginal,
      p: this.datosVehiculo.placa.toUpperCase().trim(),
      t: this.datosVehiculo.tipo,
      cap: this.datosVehiculo.capCajas,
      kg: this.datosVehiculo.maxKg,
      m3: this.datosVehiculo.maxM3,
      cond: this.datosVehiculo.conductorPrincipal.trim(),
      tr: this.datosVehiculo.transportadora,
      categoria: this.datosVehiculo.categoria || 'Viajero',
      est: this.datosVehiculo.estado,
      dc: this.datosVehiculo.descansoCorta,
      dm: this.datosVehiculo.descansoMedia,
      dl: this.datosVehiculo.descansoLarga,
      um: this.datosVehiculo.ultimoMantenimiento || vOriginal.um || '',
      soatVence: this.datosVehiculo.soatVence || null,
      tecnoVence: this.datosVehiculo.tecnoVence || null
    };
    
    if (this.vhIdx === -1) {
      this.ds.S.vehiculos.push(vehiculoEstructurado);
    } else {
      this.ds.S.vehiculos[this.vhIdx] = vehiculoEstructurado;
    }
    
    // Único guardado de Vehículos que pide protección: aquí puede pasar
    // rato entre abrir el modal y guardarlo, y otra persona pudo cambiar
    // el mismo vehículo en medio.
    this.ds.guardarVehiculo(this.vhIdx === -1 ? { ...vehiculoEstructurado, esNuevo: true } : vehiculoEstructurado, this.vhIdx, false, {
      protegerDeChoques: true,
      baseOriginal: this.vehiculoOriginalEdicion,
      baseVista: this.vehiculoOriginalEdicion
    }).then(ok => {
      // Si el choque se resolvió descartando lo propio, el vehículo local
      // ya quedó con la versión actual — se reabre el modal con ella en
      // vez de dejarlo cerrado como si el guardado hubiera funcionado.
      if (!ok && this.ds.ultimoChoqueDescartado?.tipo === 'vehiculo'
          && this.ds.ultimoChoqueDescartado?.clave === vehiculoEstructurado.p) {
        this.ds.ultimoChoqueDescartado = null;
        this.zone.run(() => {
          this.editarVehiculo(this.vhIdx);
          this.cdr.detectChanges();
        });
      }
    });

    // La lista de Conductores queda de acuerdo (quien tenía la placa la
    // suelta) y los viajes de esta placa desde mañana pasan al conductor
    // nuevo (ver asignarConductorAPlaca en data.ts).
    const conductorAsignado = String(vehiculoEstructurado.cond || '').trim();
    if (conductorAsignado) {
      this.ds.asignarConductorAPlaca(vehiculoEstructurado.p, conductorAsignado, 'vehiculo', {
        nombre: String(this.vehiculoOriginalEdicion?.cond || this.vehiculoOriginalEdicion?.conductor || '')
      }).then(n => {
        if (n) this.ui.mostrarToast(`${n} viaje(s) de ${vehiculoEstructurado.p} desde mañana quedaron con ${conductorAsignado}.`, 'ok');
      });
    }

    this.ds.autoSave();
    this.cerrarModal('m-veh');
    
    // Recalculamos la vista inmediatamente
    this.prepararDatos();
  }

  public abrirModalVehiculo() {
    this.vhIdx = -1;
    this.datosVehiculo = { 
      placa: '', 
      tipo: 'Furgon refrigerado', 
      capCajas: null, 
      maxKg: null, 
      maxM3: null, 
      conductorPrincipal: '', 
      transportadora: 'Makand', 
      categoria: 'Viajero',
      estado: 'Disponible', 
      descansoCorta: 0, 
      descansoMedia: 1, 
      descansoLarga: 2,
      ultimoMantenimiento: '',
      soatVence: '',
      tecnoVence: ''
    };
    this.isModalVehiculoOpen = true;
    this.modal.abrir('m-veh');
    this.presencia.establecer('registrando un vehículo nuevo', '', true);
  }
  
  public cerrarModal(id: string) {
    this.isModalVehiculoOpen = false;
    this.modal.cerrar(id);
    this.presencia.limpiar();
  }

  // --- Nueva sección al final de la página: placas Makand, cuántos
  // viajes tiene cada una y cuáles son, en el mes activo (el mismo que
  // usa Rutograma — ds.S.mes/ds.S.anio). Se recalcula cada vez que se
  // llama, siempre a partir del dato real de ds.S.viajes.
  public vehiculosMakandConViajes(): { placa: string; viajes: any[] }[] {
    if (!this.ds.S?.vehiculos) return [];

    const mesTexto = this.meses[this.ds.S.mes];
    const anioActual = Number(this.ds.S.anio);

    const vehiculosMakand = this.ds.S.vehiculos.filter((v: any) =>
      String(v.tr || v.transportadora || '').toLowerCase().trim() === 'makand'
    );

    const mesIdxActual = this.ds.S.mes; // índice 0-11 del mes que se está viendo

    return vehiculosMakand
      .map((v: any) => {
        const placaLimpia = String(v.p || v.placa || '').toUpperCase().trim();

        // Un viaje cuyo día cae DENTRO del rango de mantenimiento del
        // vehículo (mantInicio-mantFin) no debe sumar al conteo — el
        // vehículo no estaba realmente disponible/operando esos días,
        // aunque el registro del viaje siga existiendo. Se valida
        // también que el mantenimiento sea del MISMO mes/año que se
        // está viendo — comparar solo el número de día sería un error
        // si el mantenimiento fue en otro mes distinto.
        let diaMantInicio: number | null = null;
        let diaMantFin: number | null = null;
        if (v.mantInicio && v.mantFin) {
          const fInicio = new Date(v.mantInicio + 'T00:00:00');
          const fFin = new Date(v.mantFin + 'T00:00:00');
          const mismoMesInicio = fInicio.getMonth() === mesIdxActual && fInicio.getFullYear() === anioActual;
          const mismoMesFin = fFin.getMonth() === mesIdxActual && fFin.getFullYear() === anioActual;
          if (mismoMesInicio) diaMantInicio = fInicio.getDate();
          if (mismoMesFin) diaMantFin = fFin.getDate();
          // Si el mantenimiento empezó en un mes anterior pero termina
          // en el mes que se está viendo, se bloquea desde el día 1.
          if (!mismoMesInicio && mismoMesFin) diaMantInicio = 1;
          // Si empezó en el mes que se está viendo pero termina después,
          // se bloquea hasta el último día del mes.
          if (mismoMesInicio && !mismoMesFin && fFin > fInicio) diaMantFin = 31;
        }

        const viajesDelVehiculo = (this.ds.S.viajes || [])
          .filter((vj: any) => {
            if (String(vj.p || vj.placa || '').toUpperCase().trim() !== placaLimpia) return false;
            if (vj.mes !== mesTexto || Number(vj.anio) !== anioActual) return false;
            if (vj.estado === 'Cancelado') return false;
            const diaViaje = Number(vj.dia ?? vj.salida);
            if (diaMantInicio !== null && diaMantFin !== null && diaViaje >= diaMantInicio && diaViaje <= diaMantFin) return false;
            return true;
          })
          .sort((a: any, b: any) => Number(a.dia ?? a.salida) - Number(b.dia ?? b.salida))
          .map((vj: any) => ({
            dia: vj.dia ?? vj.salida,
            ruta: vj.ruta || vj.codigo,
            destino: vj.destino || vj.dest
          }));

        return { placa: placaLimpia, viajes: viajesDelVehiculo };
      })
      .sort((a: any, b: any) => a.placa.localeCompare(b.placa));
  }
}