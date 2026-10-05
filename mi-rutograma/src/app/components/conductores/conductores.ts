import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { errorConductor, normalizarPlaca } from '../../services/validaciones';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { RouterLink, ActivatedRoute } from '@angular/router';

// @ts-ignore
import * as _conductoresUtils from './conductores.utils.js';

// Aseguramos la importación por si Angular guarda las funciones dentro de '.default'
const ConductoresUtils: any = (_conductoresUtils as any).default || _conductoresUtils;

@Component({
  selector: 'app-conductores',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './conductores.html',
  styleUrls: ['./conductores.css']
})
export class ConductoresComponent implements OnInit, OnDestroy {
  public dataService = inject(DataService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private route = inject(ActivatedRoute);

  // Modal de confirmación propio — reemplaza el confirm() nativo del
  // navegador (feo/genérico) por uno con el mismo estilo del resto de
  // la app. Mismo patrón ya usado en rutograma.ts/vehiculos.ts/navbar.ts.
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
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  
  public filtro: string = '';
  public conductorSeleccionado: any = null; 
  public indexEdicion: number | null = null; 
  private conductorOriginalEdicion: any = null;
  public nuevoConductor: any = {}; 

  // ============================================================
  // DÍAS DE DESCANSO — ESPECÍFICOS DE CADA MES. Antes era un solo campo
  // de texto genérico (ej. "20,21,22") que se repetía en TODOS los
  // meses sin distinción — ahora cada conductor guarda un conjunto de
  // días DISTINTO por cada mes/año (agosto tiene los suyos,
  // septiembre los suyos, etc.), en `nuevoConductor.descansosPorMes`:
  // un objeto { "Agosto-2026": "20,21,22", "Septiembre-2026": "5,6" }.
  // ============================================================
  public descansoMesForm: string = '';
  public descansoAnioForm: number = new Date().getFullYear();
  public descansoDiasForm: string = '';

  public agregarDescansoMes(): void {
    if (!this.descansoDiasForm.trim()) return;
    if (!this.nuevoConductor.descansosPorMes) this.nuevoConductor.descansosPorMes = {};
    const clave = `${this.descansoMesForm}-${this.descansoAnioForm}`;
    this.nuevoConductor.descansosPorMes[clave] = this.descansoDiasForm.trim();
    this.descansoDiasForm = '';
  }

  public quitarDescansoMes(clave: string): void {
    if (this.nuevoConductor.descansosPorMes) {
      delete this.nuevoConductor.descansosPorMes[clave];
    }
  }

  public clavesDescansoOrdenadas(): string[] {
    if (!this.nuevoConductor.descansosPorMes) return [];
    return Object.keys(this.nuevoConductor.descansosPorMes).sort();
  }

  // Para el modal "Ver detalles" — arma un texto legible con los
  // descansos configurados de CUALQUIER conductor (no solo el que se
  // está editando), ej. "Agosto-2026: 20,21,22 · Septiembre-2026: 5,6".
  public descansoResumenTexto(conductor: any): string {
    if (!conductor?.descansosPorMes) return 'Ninguno';
    const claves = Object.keys(conductor.descansosPorMes).sort();
    if (!claves.length) return 'Ninguno';
    return claves.map(c => `${c}: ${conductor.descansosPorMes[c]}`).join(' · ');
  }

  public meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // --- Apartado de histórico: foto guardada de los conductores de un mes ---
  public mostrarHistorial: boolean = false;
  public historialMes: string = this.meses[new Date().getMonth()];
  public historialAnio: number = new Date().getFullYear();
  public conductoresHistorial: any[] | null = null;
  public cargandoHistorial: boolean = false;

  public async verHistorialMes(): Promise<void> {
    this.cargandoHistorial = true;
    this.cdr.detectChanges();
    this.conductoresHistorial = await this.dataService.obtenerHistorialConductores(this.historialMes, this.historialAnio);
    this.cargandoHistorial = false;
    this.cdr.detectChanges();
  }

  public cerrarHistorial(): void {
    this.mostrarHistorial = false;
    this.conductoresHistorial = null;
  }

  ngOnInit() {
    if (ConductoresUtils && typeof ConductoresUtils.obtenerMoldeVacioJS === 'function') {
      this.nuevoConductor = ConductoresUtils.obtenerMoldeVacioJS();
    }

    this.descansoMesForm = this.meses[new Date().getMonth()];
    this.recalcularConductoresConViajesCache();

    // Mismo motivo que ya tiene rutograma.ts: en conexiones más lentas,
    // esta página puede terminar de cargar ANTES de que la respuesta
    // real del servidor haya llegado — sin esto, "Viajes por
    // conductor" podía quedarse pegado con datos vacíos/incompletos del
    // primer instante. Con esta suscripción, se repinta apenas los
    // datos reales lleguen, sin importar cuánto tarden.
    this.subDataChanged = this.dataService.dataChanged.subscribe(() => {
      // "Viajes por conductor" antes se calculaba DIRECTO desde la
      // plantilla (revisando TODOS los viajes por CADA conductor, y
      // además si cada uno estaba en mantenimiento) — Angular repinta
      // muy seguido, así que esto se recalculaba muchísimas veces por
      // segundo sin necesidad, sintiéndose como que la pantalla se
      // quedaba pegada. Ahora solo se recalcula aquí, cuando de verdad
      // cambian los datos.
      this.recalcularConductoresConViajesCache();
      this.zone.run(() => this.cdr.detectChanges());
    });

    // Deep-link desde la búsqueda global del navbar (?buscarCedula=XXX)
    // — abre ese conductor específico directo ("Ver detalles"), en vez
    // de solo caer en esta pantalla y tener que buscarlo de nuevo.
    this.route.queryParams.subscribe(params => {
      if (params['buscarCedula']) this.abrirConductorPorCedula(params['buscarCedula']);
    });
  }

  private abrirConductorPorCedula(cedula: string, intento: number = 0): void {
    const conductor = (this.dataService.S?.conductores || []).find((c: any) =>
      String(c.ced || c.cedula || c.cc || '').trim() === String(cedula).trim()
    );
    if (conductor) {
      this.filtro = ''; // por si un filtro activo lo tapaba
      this.verDetalles(conductor);
    } else if (intento < 4) {
      setTimeout(() => this.abrirConductorPorCedula(cedula, intento + 1), 400);
    }
  }

  private subDataChanged?: Subscription;

  ngOnDestroy(): void {
    this.subDataChanged?.unsubscribe();
  }

  public get conductoresFiltrados(): any[] {
    if (!ConductoresUtils?.filtrarConductoresJS) return [];
    return ConductoresUtils.filtrarConductoresJS(this.dataService.S.conductores, this.filtro);
  }

  public contarPorEstado(estado: string): number {
    if (!this.dataService?.S?.conductores) return 0;
    return this.dataService.S.conductores.filter((c: any) => c.est === estado).length;
  }

  // Un viaje cuyo día cae DENTRO del rango de mantenimiento del vehículo
  // que lo hizo (mantInicio-mantFin) no debe contar — el vehículo no
  // estaba realmente disponible/operando esos días, aunque el registro
  // del viaje siga existiendo. Mismo criterio que ya se usa en
  // Vehículos para "Viajes por vehículo Makand".
  private diaEnMantenimiento(vj: any): boolean {
    const placaLimpia = String(vj.p || vj.placa || vj.veh || '').toUpperCase().trim();
    const vehiculo = (this.dataService.S.vehiculos || []).find((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia
    );
    if (!vehiculo || !vehiculo.mantInicio || !vehiculo.mantFin) return false;

    const mesIdxActual = this.dataService.S.mes;
    const anioActivo = Number(this.dataService.S.anio);
    const fInicio = new Date(vehiculo.mantInicio + 'T00:00:00');
    const fFin = new Date(vehiculo.mantFin + 'T00:00:00');
    const mismoMesInicio = fInicio.getMonth() === mesIdxActual && fInicio.getFullYear() === anioActivo;
    const mismoMesFin = fFin.getMonth() === mesIdxActual && fFin.getFullYear() === anioActivo;
    if (!mismoMesInicio && !mismoMesFin) return false;

    let diaMantInicio = mismoMesInicio ? fInicio.getDate() : 1;
    let diaMantFin = mismoMesFin ? fFin.getDate() : 31;

    const diaViaje = Number(vj.dia ?? vj.salida);
    return diaViaje >= diaMantInicio && diaViaje <= diaMantFin;
  }

  // Cuántos viajes hace este conductor en el mes activo — se cuenta por
  // QUIÉN MANEJÓ cada viaje de verdad (el campo "cond" de cada viaje,
  // no la placa que el conductor tiene asignada ahora mismo). Así, si
  // cambió de vehículo a mitad de mes, o si un respaldo cubrió un
  // viaje de otro, el conteo sigue siendo el correcto para cada quien.
  public viajesDelMesConductor(c: any): number {
    const nombre = String(c.nom || c.nombre || '').trim();
    if (!nombre) return 0;
    // Reusa la misma caché de conductoresConViajesCache — evita
    // recalcular lo mismo dos veces (antes esta función hacía su
    // propio recorrido completo de TODOS los viajes, por cada
    // conductor, cada vez que se pintaba la pantalla).
    const entrada = this.conductoresConViajesCache.find((x: any) => x.nombre === nombre);
    return entrada ? entrada.viajes.length : 0;
  }

  // Para la sección de abajo: cada conductor con la lista completa de
  // sus viajes del mes activo (día, ruta, destino) — mismo patrón que
  // ya usa Vehículos para "Viajes por vehículo Makand", pero contando
  // por QUIÉN MANEJÓ cada viaje (cond), no por la placa asignada ahora.
  public conductoresConViajesCache: { nombre: string; viajes: any[] }[] = [];

  // Para la plantilla — solo LEE la caché, nunca recalcula.
  public conductoresConViajes(): { nombre: string; viajes: any[] }[] {
    return this.conductoresConViajesCache;
  }

  // Suma de TODOS los viajes de TODOS los conductores del mes activo —
  // para la tarjeta "Viajes Totales" en la parte de arriba.
  public get viajesTotalesDelMes(): number {
    return this.conductoresConViajesCache.reduce((suma, c) => suma + c.viajes.length, 0);
  }

  // Lista de viajes (día, código, destino) del conductor que se está
  // viendo en el modal de detalle ("Ver detalles") — busca por nombre
  // en la misma caché, sin recalcular nada aparte.
  public viajesDelConductorSeleccionado(): any[] {
    if (!this.conductorSeleccionado) return [];
    const nombre = String(this.conductorSeleccionado.nom || this.conductorSeleccionado.nombre || '').trim();
    const entrada = this.conductoresConViajesCache.find((x) => x.nombre === nombre);
    return entrada ? entrada.viajes : [];
  }

  private recalcularConductoresConViajesCache(): void {
    if (!this.dataService?.S?.conductores) { this.conductoresConViajesCache = []; return; }

    const mesTexto = this.meses[this.dataService.S.mes];
    const anioActivo = Number(this.dataService.S.anio);

    this.conductoresConViajesCache = this.dataService.S.conductores
      .map((c: any) => {
        const nombre = String(c.nom || c.nombre || '').trim();
        const placaAsignada = String(c.veh || c.placa || '').toUpperCase().trim();

        const coincidenPorNombre = (vj: any) => {
          const condViaje = String(vj.cond || '').trim();
          return !!nombre && condViaje.toLowerCase() === nombre.toLowerCase();
        };

        // RESPALDO: si el viaje no tiene un "cond" que coincida con este
        // conductor (ej. quedó vacío, o con un nombre de prueba de un
        // respaldo viejo — caso real encontrado), se empareja por la
        // PLACA que el conductor tiene asignada AHORA. No es tan preciso
        // como el nombre (no sabe quién manejó ESE día en particular si
        // el conductor de esa placa cambió), pero es mucho mejor que
        // mostrar "0 viajes" cuando en realidad la placa sí salió.
        const coincidenPorPlaca = (vj: any) => {
          if (!placaAsignada) return false;
          const placaViaje = String(vj.p || vj.placa || '').toUpperCase().trim();
          return placaViaje === placaAsignada;
        };

        const viajesDelConductor = (this.dataService.S.viajes || [])
          .filter((vj: any) => {
            if (!coincidenPorNombre(vj) && !coincidenPorPlaca(vj)) return false;
            if (String(vj.estado || '').toLowerCase() === 'cancelado') return false;
            if (vj.mes !== undefined && vj.mes !== mesTexto) return false;
            if (vj.anio !== undefined && Number(vj.anio) !== anioActivo) return false;
            if (this.diaEnMantenimiento(vj)) return false;

            return true;
          })
          .sort((a: any, b: any) => {
            return Number(a.dia ?? a.salida ?? 0) - Number(b.dia ?? b.salida ?? 0);
          })
          .map((vj: any) => ({
            dia: vj.dia ?? vj.salida ?? '—',
            codigo: vj.codigo || vj.ruta || 'Sin código',
            destino: vj.destino || vj.dest || 'Sin destino'
          }));

        return {
          nombre: c.nom || c.nombre || 'Sin nombre',
          viajes: viajesDelConductor
        };
      })
      .sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));
  }

  /**
   * Días que faltan para que venza la licencia (negativo si ya venció).
   * Devuelve null si el conductor no tiene fecha de vencimiento cargada.
   */
  public diasParaVencerLicencia(conductor: any): number | null {
    if (!conductor?.licVence) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const vence = new Date(conductor.licVence + 'T00:00:00');
    if (isNaN(vence.getTime())) return null;
    const msPorDia = 1000 * 60 * 60 * 24;
    return Math.round((vence.getTime() - hoy.getTime()) / msPorDia);
  }

  /** 'venc-ok' | 'venc-pronto' (≤30 días) | 'venc-vencida' (ya venció) | '' (sin fecha) */
  public claseVencimientoLicencia(conductor: any): string {
    const dias = this.diasParaVencerLicencia(conductor);
    if (dias === null) return '';
    if (dias < 0) return 'venc-vencida';
    if (dias <= 30) return 'venc-pronto';
    return 'venc-ok';
  }

  public textoVencimientoLicencia(conductor: any): string {
    const dias = this.diasParaVencerLicencia(conductor);
    if (dias === null) return 'Sin fecha';
    if (dias < 0) return `Venció hace ${Math.abs(dias)} días`;
    if (dias === 0) return 'Vence hoy';
    return `Vence en ${dias} días`;
  }

  private syncConductores() {
    if (ConductoresUtils?.sincronizarVehiculosJS) {
      ConductoresUtils.sincronizarVehiculosJS(this.dataService.S.vehiculos, this.dataService.S.conductores);
    }
  }

  async guardarCond() {
    // TRADUCTOR BIDIRECCIONAL: Asegura compatibilidad entre propiedades cortas (HTML) y largas
    if (this.nuevoConductor.nom) {
      this.nuevoConductor.nombre = this.nuevoConductor.nom;
      this.nuevoConductor.n = this.nuevoConductor.nom;
    } else if (this.nuevoConductor.nombre) {
      this.nuevoConductor.nom = this.nuevoConductor.nombre;
    }

    if (this.nuevoConductor.ced) {
      this.nuevoConductor.cedula = this.nuevoConductor.ced;
      this.nuevoConductor.cc = this.nuevoConductor.ced;
    } else if (this.nuevoConductor.cedula) {
      this.nuevoConductor.ced = this.nuevoConductor.cedula;
    }

    if (this.nuevoConductor.veh) {
      this.nuevoConductor.placa = this.nuevoConductor.veh;
      this.nuevoConductor.p = this.nuevoConductor.veh;
    } else if (this.nuevoConductor.placa) {
      this.nuevoConductor.veh = this.nuevoConductor.placa;
    }

    const nombreValidable = this.nuevoConductor.nom?.trim() || this.nuevoConductor.nombre?.trim();

    if (!nombreValidable) {
      this.ui.mostrarToast('Por favor, ingresa el nombre del conductor.', 'err');
      return;
    }

    // Datos limpios y revisados (el servidor revisa lo mismo): cédula sin
    // puntos, placa escrita igual que en la flota ('lun428' -> 'LUN 428').
    const esNuevo = this.indexEdicion === null;
    if (esNuevo) {
      const ced = String(this.nuevoConductor.ced || '').replace(/[.\s]/g, '');
      this.nuevoConductor.ced = this.nuevoConductor.cedula = this.nuevoConductor.cc = ced;
    }
    if (this.nuevoConductor.veh) {
      const escrita = normalizarPlaca(this.nuevoConductor.veh);
      const enFlota = (this.dataService.S.vehiculos || []).find((v: any) => normalizarPlaca(v.p || v.placa) === escrita);
      this.nuevoConductor.veh = this.nuevoConductor.placa = this.nuevoConductor.p = enFlota ? (enFlota.p || enFlota.placa) : escrita;
    }
    const errorDato = errorConductor(this.nuevoConductor, esNuevo ? null : this.conductorOriginalEdicion, this.dataService.S.vehiculos || []);
    if (errorDato) {
      this.ui.mostrarToast(errorDato, 'err');
      return;
    }
    if (esNuevo) {
      const repetido = (this.dataService.S.conductores || []).find((c: any) => String(c.ced || c.cedula || c.cc || '').replace(/[.\s]/g, '') === this.nuevoConductor.ced);
      if (repetido) {
        this.ui.mostrarToast(`Ya existe un conductor con la cédula ${this.nuevoConductor.ced} (${repetido.nom || repetido.nombre}).`, 'err');
        return;
      }
    }

    // ¿La placa ya la tiene otro conductor? Se ofrece pasársela a este
    // (antes solo salía "El vehículo ya está asignado").
    const placaPedida = String(this.nuevoConductor.veh || '').trim();
    // Para que los viajes anteriores conserven a quien los hizo y la placa
    // que traía este conductor quede libre.
    const placaQueTraia = String(this.conductorOriginalEdicion?.veh || this.conductorOriginalEdicion?.placa || '').trim();
    let nombreQueTeniaLaPlaca = '';
    if (placaPedida) {
      const otro = this.dataService.conductorConPlaca(placaPedida, nombreValidable);
      if (otro) {
        const pasar = await this.mostrarConfirmPersonalizado(
          `La placa ${placaPedida.toUpperCase()} la tiene ${otro.nom || otro.nombre}.\n\n` +
          `¿Pasársela a ${nombreValidable}? ${otro.nom || otro.nombre} queda sin placa, y los viajes de ${placaPedida.toUpperCase()} desde mañana pasan a ${nombreValidable}.`,
          'Pasar la placa',
          'Cancelar'
        );
        if (!pasar) return;
        const iOtro = this.dataService.S.conductores.indexOf(otro);
        await this.dataService.guardarConductorValidado({ ...otro, veh: '', placa: '', p: '' }, iOtro, true);
        nombreQueTeniaLaPlaca = String(otro.nom || otro.nombre || '');
      }
    }

    if (ConductoresUtils?.clonarConductorJS) {
      const conductorAEnviar = ConductoresUtils.clonarConductorJS(this.nuevoConductor);
      // Solo se manda la versión cuando se está editando uno que ya existía
      // (protección contra choques) — un conductor nuevo no tiene versión previa.
      if (this.indexEdicion !== null) conductorAEnviar.version = this.conductorOriginalEdicion?.version;
      else conductorAEnviar.esNuevo = true;

      const errorMsg = await this.dataService.guardarConductorValidado(
        conductorAEnviar,
        this.indexEdicion ?? -1,
        false,
        {
          protegerDeChoques: true,
          baseOriginal: this.conductorOriginalEdicion,
          baseVista: this.conductorOriginalEdicion
        }
      );

      if (errorMsg) {
        this.ui.mostrarToast(errorMsg, 'err');
        return;
      }

      // Si el choque se resolvió descartando lo propio, el conductor local
      // ya quedó con la versión actual — se reabre el modal con ella en
      // vez de dejar la pantalla como si el guardado hubiera funcionado.
      const cedulaEnviada = String(conductorAEnviar.ced || conductorAEnviar.cedula || conductorAEnviar.cc || '');
      if (this.dataService.ultimoChoqueDescartado?.tipo === 'conductor'
          && this.dataService.ultimoChoqueDescartado?.clave === cedulaEnviada) {
        this.dataService.ultimoChoqueDescartado = null;
        const idxFiltradoTrasChoque = this.conductoresFiltrados.findIndex((c: any) =>
          String(c.ced || c.cedula || c.cc || '') === cedulaEnviada
        );
        this.zone.run(() => {
          if (idxFiltradoTrasChoque !== -1) this.abrirModal('m-cond', idxFiltradoTrasChoque);
          this.cdr.detectChanges();
        });
        return;
      }

      this.syncConductores();

      // El vehículo queda con este conductor principal y los viajes de esa
      // placa desde mañana pasan a su nombre (ver asignarConductorAPlaca).
      const placaAsignada = String(this.nuevoConductor.veh || this.nuevoConductor.placa || '').trim();
      if (placaAsignada) {
        const placaDelNuevo = placaQueTraia.toUpperCase() !== placaAsignada.toUpperCase() ? placaQueTraia : '';
        this.dataService.asignarConductorAPlaca(placaAsignada, nombreValidable, 'conductor', { nombre: nombreQueTeniaLaPlaca, placaDelNuevo }).then(n => {
          if (n) this.ui.mostrarToast(`${n} viaje(s) de ${placaAsignada.toUpperCase()} desde mañana quedaron con ${nombreValidable}.`, 'ok');
        });
      }

      if (this.dataService.autoSave) {
        this.dataService.autoSave();
      }

      this.cerrarModal('m-cond');
      this.ui.mostrarToast('¡Cambios guardados correctamente!', 'ok');
    }
  }

  verDetalles(conductor: any) {
    this.conductorSeleccionado = conductor;
    this.abrirModal('m-vista');
  }

  async cambiarEstado(conductor: any) {
    const nombre = conductor.nom || conductor.nombre || 'este conductor';
    const nuevoEstado = conductor.est === 'activo' ? 'Inactivo' : 'Activo';
    const estadoActualTexto = conductor.est
      ? conductor.est.charAt(0).toUpperCase() + conductor.est.slice(1)
      : 'sin estado';

    // Antes esto cambiaba el estado de una vez, sin avisar — si alguien
    // le daba clic a este botón mientras el conductor estaba en
    // Vacaciones/Incapacidad/Descanso, lo mandaba derecho a "Activo"
    // sin que nadie se enterara. Ahora siempre pide confirmar, y el
    // mensaje deja claro cuál es el estado actual y a cuál va a pasar.
    const confirmado = await this.mostrarConfirmPersonalizado(
      `${nombre} está actualmente en "${estadoActualTexto}".\n\n¿Cambiarlo a "${nuevoEstado}"?`,
      'Cambiar estado',
      'Cancelar'
    );
    if (!confirmado) return;

    conductor.est = conductor.est === 'activo' ? 'inactivo' : 'activo';
    this.syncConductores();
    this.dataService.autoSave();
  }

  async eliminarConductor(indexFiltrado: number): Promise<void> {
    const confirmado = await this.mostrarConfirmPersonalizado('¿Está seguro de eliminar este conductor?', 'Eliminar', 'Cancelar');
    if (confirmado) {
      const conductorAEliminar = this.conductoresFiltrados[indexFiltrado];
      const ccAEliminar = conductorAEliminar.ced || conductorAEliminar.cedula || conductorAEliminar.cc;
      
      // Encontramos el índice en la lista principal usando la cédula
      const indexReal = this.dataService.S.conductores.findIndex((c: any) => {
        const cc = c.ced || c.cedula || c.cc;
        return cc && String(cc) === String(ccAEliminar);
      });

      if (indexReal !== -1) {
        this.dataService.eliminarConductor(indexReal);
        this.syncConductores();
        if (this.dataService.autoSave) {
          this.dataService.autoSave();
        }
      }
    }
  }

  abrirModal(id: string, indexFiltrado: number | null = null) {
    if (id === 'm-cond' && indexFiltrado !== null) {
      // 🛠️ MODO EDICIÓN DIRECTO (Sin llamadas recursivas)
      const conductorAEditar = this.conductoresFiltrados[indexFiltrado];
      
      // Mapeamos el índice real de la lista maestra basándonos en la cédula
      const ccAEditar = conductorAEditar.ced || conductorAEditar.cedula || conductorAEditar.cc;
      this.indexEdicion = this.dataService.S.conductores.findIndex((c: any) => {
        const cc = c.ced || c.cedula || c.cc;
        return cc && String(cc) === String(ccAEditar);
      });

      if (this.indexEdicion === -1) {
        this.indexEdicion = indexFiltrado;
      }

      if (ConductoresUtils?.clonarConductorJS) {
        this.nuevoConductor = ConductoresUtils.clonarConductorJS(conductorAEditar);

        // "Foto" del conductor tal como estaba guardado al abrir el modal —
        // se usa solo si otra persona lo modifica mientras se edita
        // (protección contra choques, ver guardarConductorValidado en data.ts).
        this.conductorOriginalEdicion = { ...conductorAEditar };

        // Sincronización forzada inmediata para asegurar que el HTML renderice los valores en los inputs
        this.nuevoConductor.nom = conductorAEditar.nom || conductorAEditar.nombre || '';
        this.nuevoConductor.ced = conductorAEditar.ced || conductorAEditar.cedula || '';
        this.nuevoConductor.veh = conductorAEditar.veh || conductorAEditar.placa || '';
        this.nuevoConductor.tel = conductorAEditar.tel || '';
        this.nuevoConductor.est = conductorAEditar.est || 'activo';
        this.nuevoConductor.lic = conductorAEditar.lic || '';
        this.nuevoConductor.licVence = conductorAEditar.licVence || '';
        this.nuevoConductor.desc = conductorAEditar.desc || '';
        this.nuevoConductor.descansosPorMes = conductorAEditar.descansosPorMes ? { ...conductorAEditar.descansosPorMes } : {};
        this.nuevoConductor.obs = conductorAEditar.obs || '';
      }
    } else if (id === 'm-cond' && indexFiltrado === null) {
      // 🛠️ MODO REGISTRO NUEVO
      this.indexEdicion = null;
      if (ConductoresUtils && typeof ConductoresUtils.obtenerMoldeVacioJS === 'function') {
        this.nuevoConductor = ConductoresUtils.obtenerMoldeVacioJS(); 
      }
    }

    // Muestra el modal seleccionado de forma segura
    document.getElementById(id)?.classList.remove('hide');
  }

  cerrarModal(id: string) {
    document.getElementById(id)?.classList.add('hide');
  }
}