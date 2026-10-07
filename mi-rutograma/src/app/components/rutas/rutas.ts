import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { ModalService } from '../../services/modal';
import { UiService } from '../../services/ui.service';
import { AuthService } from '../../services/auth.service';
import { FormsModule } from '@angular/forms';

// @ts-ignore
import * as _rutasUtils from './rutas.utils.js';

const RutasUtils: any = (_rutasUtils as any).default || _rutasUtils;

import { DuracionRutasComponent } from '../analisis/analisis';
@Component({
  selector: 'app-rutas',
  templateUrl: './rutas.html',
  standalone: true,
  imports: [CommonModule, CurrencyPipe, FormsModule, DuracionRutasComponent]
})
export class RutasComponent implements OnInit, OnDestroy {
  public modal = inject(ModalService);
  public ds = inject(DataService);
  public auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private ui = inject(UiService);

  // Modal de confirmación propio — reemplaza el confirm() nativo del
  // navegador, mismo patrón ya usado en el resto de la app.
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

  // --- Tabla "Prioridades de transporte" (abajo de la página) ---
  public diasSemanaOrden = [
    { clave: 'lun', label: 'Lunes' },
    { clave: 'mar', label: 'Martes' },
    { clave: 'mie', label: 'Miércoles' },
    { clave: 'jue', label: 'Jueves' },
    { clave: 'vie', label: 'Viernes' },
    { clave: 'sab', label: 'Sábado' },
    { clave: 'dom', label: 'Domingo' }
  ];

  // Rutas que corren un día de la semana específico, con su hora de
  // salida DE ESE DÍA (una ruta puede tener horas distintas cada día),
  // ordenadas por hora — para la tabla de "Prioridades de transporte".
  public rutasPorDia(clave: string): any[] {
    return this.getRutas()
      .filter((r: any) => r.dias && r.dias[clave] && r.dias[clave].checked)
      .map((r: any) => ({
        cod: r.cod || r.codigo,
        dest: r.dest || r.destino,
        hora: r.dias[clave].hora || '--:--'
      }))
      .sort((a: any, b: any) => String(a.hora).localeCompare(String(b.hora)));
  }

  // Misma tabla, pero por día de ENTREGA en vez de día de salida — una
  // ruta que sale un día X con "diasTrans" días de tránsito se entrega el
  // día X + diasTrans (ej: sale martes, dura 1 día → entrega miércoles;
  // dura 2 días → entrega jueves). Se calcula desplazando el índice del
  // día de la semana, no fechas de calendario — es un horario genérico
  // semanal, igual que la tabla de salidas.
  // Día/hora de entrega EFECTIVOS para un día de salida dado — si la
  // ruta tiene una corrección manual activa para ESE día de salida
  // (`ruta.entregaManual[claveSalida]`), se usa esa; si no, se calcula
  // automático como siempre (salida + diasTrans). Así el cálculo
  // automático sigue funcionando igual para todo lo que no se haya
  // corregido a mano.
  private entregaEfectivaParaSalida(r: any, claveSalida: string, idxSalida: number, diasTrans: number): { claveEntrega: string; horaMostrar: string } {
    const manual = r.entregaManual && r.entregaManual[claveSalida];
    if (manual && manual.activo && manual.diaEntrega) {
      return { claveEntrega: manual.diaEntrega, horaMostrar: manual.hora || (r.dias?.[claveSalida]?.hora || '--:--') };
    }
    const idxEntrega = (idxSalida + diasTrans) % 7;
    return { claveEntrega: this.diasSemanaOrden[idxEntrega].clave, horaMostrar: r.dias?.[claveSalida]?.hora || '--:--' };
  }

  public rutasPorDiaEntrega(claveEntrega: string): any[] {
    const resultado: any[] = [];
    this.getRutas().forEach((r: any) => {
      const diasTrans = Number(r.diasTrans) > 0 ? Number(r.diasTrans) : 1;
      this.diasSemanaOrden.forEach((diaSalida: any, idxSalida: number) => {
        if (!(r.dias && r.dias[diaSalida.clave] && r.dias[diaSalida.clave].checked)) return;
        const efectiva = this.entregaEfectivaParaSalida(r, diaSalida.clave, idxSalida, diasTrans);
        if (efectiva.claveEntrega !== claveEntrega) return;
        resultado.push({
          cod: r.cod || r.codigo,
          dest: r.dest || r.destino,
          horaSalida: r.dias[diaSalida.clave].hora || '--:--',
          diaSalidaLabel: diaSalida.label
        });
      });
    });

    return resultado.sort((a: any, b: any) => String(a.horaSalida).localeCompare(String(b.horaSalida)));
  }

  public datosRuta: any = {};
  public idxRuta: number = -1;
  private rutaOriginalEdicion: any = null;
  
  public rutaSeleccionadaInfo: any = null;

  public cupo: any = { transp: 'arsi', fecha: '', placa: '', cond: '', ruta: '', cajas: 1, cli: '', cli2: '', prior: 'normal', manif: '' };
  public meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // --- Apartado de histórico: foto guardada de las rutas de un mes ---
  public mostrarHistorial: boolean = false;
  public historialMes: string = this.meses[new Date().getMonth()];
  public historialAnio: number = new Date().getFullYear();
  public rutasHistorial: any[] | null = null;
  public cargandoHistorial: boolean = false;

  public async verHistorialMes(): Promise<void> {
    this.cargandoHistorial = true;
    this.cdr.detectChanges();
    this.rutasHistorial = await this.ds.obtenerHistorialRutas(this.historialMes, this.historialAnio);
    this.cargandoHistorial = false;
    this.cdr.detectChanges();
  }

  public cerrarHistorial(): void {
    this.mostrarHistorial = false;
    this.rutasHistorial = null;
  }

  // Igual que obtenerDiasActivos(), pero para una ruta del histórico (que
  // puede traer "dias" ya parseado o, si algo falla, como texto JSON).
  public obtenerDiasActivosHistorial(r: any): Array<{ label: string; hora: string; esFestivo: boolean }> {
    if (!r) return [];
    let dias = r.dias;
    if (typeof dias === 'string') {
      try { dias = JSON.parse(dias); } catch { dias = null; }
    }
    return this.obtenerDiasActivos({ ...r, dias });
  }

  private subDataChanged?: Subscription;

  ngOnInit() {
    if (!this.ds.S) (this.ds as any).cargarEstadoSP();

    // Sin esto, esta pantalla se queda mostrando los datos de cuando se
    // abrió para siempre, sin enterarse de la sincronización automática
    // de cada 20s (mismo bug ya encontrado y corregido en Rutograma).
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.zone.run(() => this.cdr.detectChanges());
    });

    // Deep-link desde la búsqueda global del navbar (?buscarCod=XXX) —
    // abre esa ruta específica directo, en vez de solo caer en esta
    // pantalla y tener que buscarla de nuevo a mano.
    this.route.queryParams.subscribe(params => {
      if (params['buscarCod']) this.abrirRutaPorCodigo(params['buscarCod']);
    });
  }

  private abrirRutaPorCodigo(cod: string, intento: number = 0): void {
    const idx = this.getRutas().findIndex((r: any) =>
      String(r.cod || r.codigo || '').toUpperCase().trim() === String(cod).toUpperCase().trim()
    );
    if (idx !== -1) {
      this.busquedaRutas = ''; // por si un filtro activo lo tapaba
      this.abrirModalRuta(idx);
    } else if (intento < 4) {
      setTimeout(() => this.abrirRutaPorCodigo(cod, intento + 1), 400);
    }
  }

  ngOnDestroy() {
    this.subDataChanged?.unsubscribe();
  }

  public infoCupoRuta() {
    if (RutasUtils?.buscarRutaPorCodigoJS) {
      this.rutaSeleccionadaInfo = RutasUtils.buscarRutaPorCodigoJS(this.ds.S?.rutas, this.cupo.ruta);
    }
  }

  public cupoError: string = '';

  public async guardarCupo(): Promise<void> {
    this.cupoError = '';

    if (!this.cupo.fecha) { this.cupoError = 'Selecciona el día del viaje.'; return; }
    if (!this.cupo.placa?.trim()) { this.cupoError = 'Ingresa la placa confirmada.'; return; }
    if (!this.cupo.ruta) { this.cupoError = 'Selecciona una ruta.'; return; }
    if (!this.cupo.cajas || Number(this.cupo.cajas) <= 0) { this.cupoError = 'Ingresa la cantidad de cajas.'; return; }

    const ruta = (this.ds.S?.rutas || []).find((r: any) =>
      String(r.cod || r.codigo || '') === String(this.cupo.ruta)
    );
    if (!ruta) { this.cupoError = 'No se encontró la ruta seleccionada.'; return; }

    const nombreTr = this.cupo.transp === 'arsi' ? 'Arsitrans' : 'Polar';
    const placaLimpia = String(this.cupo.placa).toUpperCase().trim();

    // El día del viaje viene de un <input type="date"> ("2026-08-15"), no
    // del mes activo del Rutograma — este formulario puede confirmar un
    // cupo para cualquier fecha, no solo el mes que se está viendo ahora.
    const fechaObj = new Date(this.cupo.fecha + 'T00:00:00');
    if (isNaN(fechaObj.getTime())) { this.cupoError = 'La fecha no es válida.'; return; }
    const dia = fechaObj.getDate();
    const mesIdx = fechaObj.getMonth(); // 0-indexado
    const anio = fechaObj.getFullYear();

    // Si esa placa todavía no existe como vehículo, la creamos — igual que
    // hace el Rutograma con sus cupos numerados — para que aparezca como
    // su propia fila y no quede un viaje "huérfano" sin vehículo visible.
    const yaExiste = (this.ds.S.vehiculos || []).some((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia
    );
    if (!yaExiste) {
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
        conductor: this.cupo.cond || 'Sin asignar',
        cond: this.cupo.cond || 'Sin asignar',
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

    // OJO — bug real: este formulario es EXCLUSIVAMENTE para terceros
    // (Arsitrans/Polar, no hay opción Makand aquí) — Arsitrans/Polar
    // SIEMPRE están libres al día siguiente de cualquier viaje, sin
    // importar qué ruta manejen. Usar "Días en tránsito"/"Días de
    // retorno" de la ruta (que son valores pensados para Makand) aquí
    // le inflaba el retorno de más a un tercero, provocando conflictos
    // en rojo falsos con el día siguiente (que para un tercero es
    // completamente normal).

    let tarifaFinal = Number(ruta.tarifa || 0);
    if (this.cupo.transp === 'arsi') tarifaFinal = Number(ruta.tarifaArsitrans || ruta.tarifaArsitran || tarifaFinal);
    if (this.cupo.transp === 'polar') tarifaFinal = Number(ruta.tarifaPolar || tarifaFinal);

    const nuevoViaje = {
      id: `${placaLimpia}-${this.cupo.fecha}-${ruta.cod || ruta.codigo || ''}`,
      codigo: ruta.cod || ruta.codigo || '',
      ruta: ruta.cod || ruta.codigo || '',
      destino: ruta.dest || ruta.destino || '',
      cliente: this.cupo.cli || String(ruta.clientes || '').split(',')[0].trim() || 'Sin Cliente',
      cliente2: this.cupo.cli2 || '',
      manifiesto: this.cupo.manif || '',
      cond: this.cupo.cond || 'Sin asignar',
      placa: placaLimpia,
      p: placaLimpia,
      transportadora: nombreTr,
      tr: nombreTr,
      fecha: this.cupo.fecha,
      dia: dia,
      salida: dia,
      // Arsitrans/Polar: siempre libre al día siguiente, sin importar
      // la ruta.
      retorno: dia + 1,
      cajas: Number(this.cupo.cajas),
      mes: this.meses[mesIdx],
      anio: anio,
      tarifa: tarifaFinal,
      costo: tarifaFinal,
      estado: 'Planificado',
      prioridad: this.cupo.prior || 'normal',
      // Misma marca que usa el Rutograma para sus cupos: distingue esto de
      // un viaje que "Generar Matriz" asigna automáticamente.
      tipo: 'cupo'
    };

    const ok = await this.ds.guardarViaje(nuevoViaje);
    if (!ok) { this.cupoError = 'No se pudo guardar el viaje.'; return; }

    if ((this.ds as any).autoSave) (this.ds as any).autoSave();

    // Limpiar el formulario para la próxima confirmación.
    this.cupo = { transp: 'arsi', fecha: '', placa: '', cond: '', ruta: '', cajas: 1, cli: '', cli2: '', prior: 'normal', manif: '' };
    this.rutaSeleccionadaInfo = null;
    this.cerrarModal('m-cupo');
  }

  public abrirModalRuta(indexFiltrado: number = -1): void {
    if (indexFiltrado > -1) {
      const rutaAEditar = this.getRutas()[indexFiltrado];
      
      if (this.ds.S?.rutas && rutaAEditar) {
        this.idxRuta = this.ds.S.rutas.findIndex((r: any) => 
          r.cod === rutaAEditar.cod || r.codigo === rutaAEditar.cod
        );
      } else {
        this.idxRuta = indexFiltrado;
      }

      if (RutasUtils?.clonarOResetearRutaJS) {
        this.datosRuta = RutasUtils.clonarOResetearRutaJS(this.ds.S?.rutas, this.idxRuta);
      } else {
        this.datosRuta = JSON.parse(JSON.stringify(rutaAEditar));
      }

      // "Foto" de la ruta tal como estaba guardada al abrir el modal — se
      // usa solo si otra persona la modifica mientras se edita (protección
      // contra choques, ver guardarRuta en data.ts).
      this.rutaOriginalEdicion = { ...this.datosRuta };

      this.datosRuta.cod = this.datosRuta.cod || this.datosRuta.codigo || '';
      this.datosRuta.dest = this.datosRuta.dest || this.datosRuta.destino || '';
      this.datosRuta.dest2 = this.datosRuta.dest2 || '';
      this.datosRuta.tipo = this.datosRuta.tipo || 'Media';
      this.datosRuta.km = this.datosRuta.km || '';
      this.datosRuta.diasTrans = this.datosRuta.diasTrans || 1;
      // OJO: "|| 1" trataría un 0 puesto a propósito como si estuviera
      // vacío y lo cambiaría a 1 — con "Días de retorno" ahora afectando
      // el cálculo real, eso borraría en silencio el ajuste manual de
      // cualquier ruta que ya tenga 0 puesto. Se usa un chequeo que
      // respeta el 0 explícito, solo pone el valor por defecto (0) si el
      // campo de verdad no existe todavía (rutas viejas antes de este
      // cambio).
      this.datosRuta.diasDesc = (this.datosRuta.diasDesc === undefined || this.datosRuta.diasDesc === null || this.datosRuta.diasDesc === '') ? 0 : this.datosRuta.diasDesc;
      this.datosRuta.cajasMin = this.datosRuta.cajasMin || 100;
      // "undefined" (rutas guardadas antes de que existiera este campo)
      // se trata como activa — solo se ve como cancelada si de verdad
      // se guardó así.
      this.datosRuta.activa = this.datosRuta.activa !== false;
      this.datosRuta.vigenteDesde = this.datosRuta.vigenteDesde || '';
      
    } else {
      this.idxRuta = -1;
      if (RutasUtils?.clonarOResetearRutaJS) {
        this.datosRuta = RutasUtils.clonarOResetearRutaJS(this.ds.S?.rutas, -1);
      } else {
        this.datosRuta = {};
      }

      this.datosRuta.cod = '';
      this.datosRuta.dest = '';
      this.datosRuta.dest2 = '';
      this.datosRuta.tipo = 'Media';
      this.datosRuta.diasTrans = 1;
      this.datosRuta.diasDesc = 0;
      this.datosRuta.cajasMin = 100;
      this.datosRuta.clientes = ''; 
      this.datosRuta.activa = true;
      this.datosRuta.vigenteDesde = '';
    }

    this.datosRuta.dias = this.desglosarDiasParaForm(this.datosRuta.dias);
    this.datosRuta.entregaManual = this.desglosarEntregaManualParaForm(this.datosRuta.entregaManual);
    this.modal.abrir('m-ruta');
  }

  // Arma la estructura de corrección manual de entrega para el
  // formulario — un renglón por cada día real de la semana (sin
  // "fes", que no tiene un día de entrega calculable de la misma
  // forma). Si la ruta no tenía nada guardado todavía, todos quedan
  // "activo:false" (o sea, se sigue calculando automático).
  private desglosarEntregaManualParaForm(entregaExistente: any): any {
    const base: any = {};
    this.diasSemanaOrden.forEach((d: any) => {
      base[d.clave] = { activo: false, diaEntrega: '', hora: '' };
    });
    if (!entregaExistente) return base;
    for (const clave of Object.keys(base)) {
      if (entregaExistente[clave]) {
        base[clave].activo = !!entregaExistente[clave].activo;
        base[clave].diaEntrega = entregaExistente[clave].diaEntrega || '';
        base[clave].hora = entregaExistente[clave].hora || '';
      }
    }
    return base;
  }

  // Para mostrar en el formulario cuál sería el día/hora de entrega SI
  // no se corrige nada (referencia, no editable) — mismo cálculo que
  // ya usan rutasPorDiaEntrega()/tablaRutasPorDiaSemanaEntrega().
  public entregaCalculadaParaSalida(claveSalida: string): { label: string; hora: string } {
    const idxSalida = this.diasSemanaOrden.findIndex((d: any) => d.clave === claveSalida);
    if (idxSalida === -1) return { label: '—', hora: '--:--' };
    const diasTrans = Number(this.datosRuta.diasTrans) > 0 ? Number(this.datosRuta.diasTrans) : 1;
    const idxEntrega = (idxSalida + diasTrans) % 7;
    return {
      label: this.diasSemanaOrden[idxEntrega].label,
      hora: this.datosRuta.dias?.[claveSalida]?.hora || '--:--'
    };
  }

  private desglosarDiasParaForm(diasExistentes: any): any {
    const baseForm: any = {
      dom: { checked: false, hora: '' },
      lun: { checked: false, hora: '' },
      mar: { checked: false, hora: '' },
      mie: { checked: false, hora: '' },
      jue: { checked: false, hora: '' },
      vie: { checked: false, hora: '' },
      sab: { checked: false, hora: '' },
      fes: { checked: false, hora: '' }
    };

    if (!diasExistentes) return baseForm;

    for (const dia of Object.keys(baseForm)) {
      if (diasExistentes[dia]) {
        if (typeof diasExistentes[dia] === 'object') {
          baseForm[dia].checked = diasExistentes[dia].checked ?? !!diasExistentes[dia].hora;
          baseForm[dia].hora = diasExistentes[dia].hora || '';
        } else if (typeof diasExistentes[dia] === 'string' && diasExistentes[dia].trim() !== '') {
          baseForm[dia].checked = true;
          baseForm[dia].hora = diasExistentes[dia];
        }
      }
    }
    return baseForm;
  }

  public obtenerDiasActivos(r: any): Array<{ label: string; hora: string; esFestivo: boolean }> {
    if (!r || !r.dias) return [];
    
    const resultado: any[] = [];
    const diccionarioDias: any = {
      dom: { label: 'Do', esFestivo: false },
      lun: { label: 'Lu', esFestivo: false },
      mar: { label: 'Ma', esFestivo: false },
      mie: { label: 'Mi', esFestivo: false },
      jue: { label: 'Ju', esFestivo: false },
      vie: { label: 'Vi', esFestivo: false },
      sab: { label: 'Sa', esFestivo: false },
      fes: { label: 'Fe', esFestivo: true }
    };

    for (const key of Object.keys(diccionarioDias)) {
      const dataDia = r.dias[key];
      if (dataDia) {
        if (typeof dataDia === 'object' && dataDia.checked && dataDia.hora) {
          resultado.push({
            label: diccionarioDias[key].label,
            hora: dataDia.hora,
            esFestivo: diccionarioDias[key].esFestivo
          });
        } else if (typeof dataDia === 'string' && dataDia.trim() !== '') {
          resultado.push({
            label: diccionarioDias[key].label,
            hora: dataDia,
            esFestivo: diccionarioDias[key].esFestivo
          });
        }
      }
    }
    return resultado;
  }

  // 🔥 NUEVA FUNCIÓN: Calcula la fecha de entrega más cercana basándose en los días activos configurados
  public calcularProximaEntrega(r: any): string {
    if (!r || !r.dias) return 'Programada';

    // Mapeo de claves a índices nativos de Date.getDay() (0 = Domingo, 1 = Lunes, etc.)
    const mapaDiasNativos: { [key: string]: number } = {
      dom: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6
    };

    const hoy = new Date();
    const diaActualSemana = hoy.getDay(); // 0 a 6

    let diasDiferenciaMinima = Infinity;
    let fechaMasCercana: Date | null = null;

    // Iteramos por las llaves de días estándar configuradas en el objeto
    for (const key of Object.keys(mapaDiasNativos)) {
      const dataDia = r.dias[key];
      let activo = false;

      if (dataDia) {
        if (typeof dataDia === 'object' && dataDia.checked) activo = true;
        else if (typeof dataDia === 'string' && dataDia.trim() !== '') activo = true;
      }

      if (activo) {
        const objetivoJS = mapaDiasNativos[key];
        // Calculamos cuántos días faltan para llegar a ese día objetivo
        let diferencia = objetivoJS - diaActualSemana;
        
        // Si la diferencia es menor que 0, significa que el día ya pasó esta semana, se programa para la otra
        if (diferencia < 0) {
          diferencia += 7;
        } else if (diferencia === 0) {
          // Si es hoy, validamos opcionalmente la hora si se requiere, o asumimos que es el ciclo más cercano.
          // Para evitar confusiones si el camión ya salió, se puede dejar para hoy mismo.
          diferencia = 0;
        }

        if (diferencia < diasDiferenciaMinima) {
          diasDiferenciaMinima = diferencia;
        }
      }
    }

    // Tratamiento especial si la ruta cuenta con Festivos habilitados (se asume comportamiento el próximo lunes por defecto)
    if (r.dias.fes?.checked || (typeof r.dias.fes === 'string' && r.dias.fes.trim() !== '')) {
      let difFestivo = 1 - diaActualSemana; // Lunes
      if (difFestivo <= 0) difFestivo += 7;
      if (difFestivo < diasDiferenciaMinima) {
        diasDiferenciaMinima = difFestivo;
      }
    }

    // Si no encontramos ningún día seleccionado, se mantiene en estado "Variable/Programada"
    if (diasDiferenciaMinima === Infinity) {
      return 'Programada';
    }

    // Construimos el objeto fecha definitivo sumando los días calculados
    fechaMasCercana = new Date(hoy);
    fechaMasCercana.setDate(hoy.getDate() + diasDiferenciaMinima);

    // Evaluaciones rápidas relativas para "Hoy" o "Mañana"
    if (diasDiferenciaMinima === 0) return 'Hoy';
    if (diasDiferenciaMinima === 1) return 'Mañana';

    // Formateador final para etiquetas complejas después de 2 días (ej: "Vie 12 Jun")
    const diasTextoCorto = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const mesesTextoCorto = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    const nombreDia = diasTextoCorto[fechaMasCercana.getDay()];
    const numeroDia = fechaMasCercana.getDate();
    const nombreMes = mesesTextoCorto[fechaMasCercana.getMonth()];

    return `${nombreDia} ${numeroDia} ${nombreMes}`;
  }

  public cerrarModal(id: string): void {
    this.modal.cerrar(id);
    this.datosRuta = {};
    this.idxRuta = -1;
    this.rutaSeleccionadaInfo = null; 
  }

  public async guardarRuta(): Promise<void> {
    try {
      if (!this.ds.S) throw new Error("No hay conexión con los datos.");
      
      this.datosRuta.codigo = this.datosRuta.cod;
      this.datosRuta.destino = this.datosRuta.dest;

      if (!this.datosRuta.cod?.trim()) {
        this.ui.mostrarToast('Por favor, ingresa el código de la ruta.', 'err');
        return;
      }

      const codOriginal = (this.idxRuta > -1 && this.ds.S.rutas[this.idxRuta]) 
        ? this.ds.S.rutas[this.idxRuta].cod || this.ds.S.rutas[this.idxRuta].codigo
        : undefined;

      // Si el código venía de la ruta original, se manda esa misma
      // versión (protección contra choques) — para una ruta nueva no hay
      // versión previa que mandar.
      if (codOriginal) this.datosRuta.version = this.rutaOriginalEdicion?.version;

      this.ds.guardandoEnCurso = true;
      let seGuardo = false;
      try {
        seGuardo = await this.ds.guardarRuta(this.datosRuta, codOriginal, false, {
          protegerDeChoques: true,
          baseOriginal: this.rutaOriginalEdicion,
          baseVista: this.rutaOriginalEdicion
        });

        if (seGuardo && (this.ds as any).autoSave) {
          await (this.ds as any).autoSave();
        }
      } finally {
        this.ds.guardandoEnCurso = false;
      }

      // Si el choque se resolvió descartando lo propio, la ruta local ya
      // quedó con la versión actual — se reabre el modal con ella en vez
      // de dejar la pantalla como si el guardado hubiera funcionado.
      if (!seGuardo && this.ds.ultimoChoqueDescartado?.tipo === 'ruta'
          && this.ds.ultimoChoqueDescartado?.clave === (codOriginal || this.datosRuta.cod)) {
        this.ds.ultimoChoqueDescartado = null;
        const idxTrasChoque = this.getRutas().findIndex((r: any) => (r.cod || r.codigo) === this.datosRuta.cod);
        this.zone.run(() => {
          if (idxTrasChoque !== -1) this.abrirModalRuta(idxTrasChoque);
          this.cdr.detectChanges();
        });
        return;
      }

      // Si no se guardó de verdad (ya existe el código, o falló la
      // conexión), el formulario se queda abierto — antes se cerraba
      // igual, dando la impresión de que sí había funcionado.
      if (!seGuardo) return;

      // Cambiar la hora de una ruta directamente desde este formulario
      // (sin arrastrar nada en "Prioridades de Horario") antes NO
      // recalculaba las demás rutas de ese día — se quedaban con la
      // hora vieja, como si nada hubiera pasado. Ahora, para cada día
      // que esta ruta tenga marcado, se recalcula la cadena completa
      // (mismo criterio que el arrastre: la primera conserva su propia
      // hora, las demás +30min, +2h justo después de BOG-BAQ-EX) —
      // igual que si se hubiera "soltado" en su misma posición actual.
      for (const d of this.diasSemanaCedis) {
        if (this.datosRuta.dias?.[d.clave]?.checked) {
          await this.recalcularYGuardarHorarios(d.clave, this.listaRutasPorDiaPrioridad(d.clave));
        }
      }

      this.cerrarModal('m-ruta');
      this.zone.run(() => this.cdr.detectChanges());
    } catch (error: any) { 
      this.ui.mostrarToast(error.message, 'err'); 
    }
  }

  // Activar/cancelar una ruta sin abrir el formulario completo — una
  // ruta cancelada deja de generar viajes en "Generar Matriz" (ver
  // filtro en server.js), pero conserva toda su configuración: se puede
  // reactivar en cualquier momento sin volver a escribir nada.
  public async alternarEstadoRuta(indexFiltrado: number): Promise<void> {
    const rutaFiltrada = this.getRutas()[indexFiltrado];
    if (!rutaFiltrada || !this.ds.S?.rutas) return;

    const rutaReal = this.ds.S.rutas.find((r: any) =>
      (r.cod || r.codigo) === (rutaFiltrada.cod || rutaFiltrada.codigo)
    );
    if (!rutaReal) return;

    const estaActiva = rutaReal.activa !== false;
    const accion = estaActiva ? 'cancelar' : 'reactivar';
    const confirmado = await this.mostrarConfirmPersonalizado(
      estaActiva
        ? `¿Cancelar la ruta ${rutaReal.cod || rutaReal.codigo}? Dejará de generar viajes nuevos en "Generar Matriz" hasta que la reactives — no se borra nada de su configuración.`
        : `¿Reactivar la ruta ${rutaReal.cod || rutaReal.codigo}? Volverá a generar viajes normalmente.`,
      estaActiva ? 'Cancelar ruta' : 'Reactivar ruta',
      'Volver'
    );
    if (!confirmado) return;

    rutaReal.activa = !estaActiva;
    this.ds.guardandoEnCurso = true;
    try {
      const ok = await this.ds.guardarRuta(rutaReal, rutaReal.cod || rutaReal.codigo);
      if (!ok) {
        rutaReal.activa = estaActiva; // revertir si no se pudo guardar
        this.ui.mostrarToast(`No se pudo ${accion} la ruta.`, 'err');
      } else if ((this.ds as any).autoSave) {
        await (this.ds as any).autoSave();
      }
    } finally {
      this.ds.guardandoEnCurso = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  public async eliminarRuta(indexFiltrado: number): Promise<void> {
    const rutaAEliminar = this.getRutas()[indexFiltrado];
    if (!rutaAEliminar) return;

    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Estás seguro de que deseas eliminar la ruta ${rutaAEliminar.cod}?`,
      'Eliminar',
      'Cancelar'
    );
    if (confirmado) {
      if (this.ds.S?.rutas) {
        const idxReal = this.ds.S.rutas.findIndex((r: any) => r.cod === rutaAEliminar.cod);
        if (idxReal > -1) {
          this.ds.S.rutas.splice(idxReal, 1);
          if ((this.ds as any).autoSave) (this.ds as any).autoSave();
        }
      }
    }
  }

  public formatearMillon(valor: any): string {
    if (!valor || isNaN(Number(valor))) return '$0';
    const num = Number(valor);
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(1)}M`;
    }
    return `$${num.toLocaleString('es-CO')}`;
  }
  
  public getRutas() {
    return this.ds?.S?.rutas || [];
  }

  // Buscador rápido de la tabla — filtra por código o destino mientras
  // escribes. Cada ruta lleva su índice ORIGINAL embebido (_idx) para
  // que "Editar"/"Eliminar" sigan apuntando a la ruta real de
  // ds.S.rutas, sin importar el orden que quede tras filtrar.
  public busquedaRutas: string = '';

  public getRutasFiltradas(): any[] {
    const todas = this.getRutas().map((r: any, idx: number) => ({ ...r, _idx: idx }));
    const q = this.busquedaRutas.trim().toLowerCase();
    if (!q) return todas;
    return todas.filter((r: any) =>
      String(r.cod || r.codigo || '').toLowerCase().includes(q) ||
      String(r.dest || r.destino || '').toLowerCase().includes(q)
    );
  }

  // "corto" es lo que se muestra en celular (ver .dia-corto en rutas.css),
  // donde los nombres completos no caben y se montaban unos sobre otros.
  public readonly diasSemanaCedis: { clave: string; label: string; corto: string }[] = [
    { clave: 'lun', label: 'Lunes', corto: 'L' },
    { clave: 'mar', label: 'Martes', corto: 'M' },
    { clave: 'mie', label: 'Miércoles', corto: 'Mi' },
    { clave: 'jue', label: 'Jueves', corto: 'J' },
    { clave: 'vie', label: 'Viernes', corto: 'V' },
    { clave: 'sab', label: 'Sábado', corto: 'S' },
    { clave: 'dom', label: 'Domingo', corto: 'D' }
  ];

  public tablaRutasPorDiaSemana(): { cod: string; destino: string; dias: { [clave: string]: boolean } }[] {
    return this.getRutas()
      .map((r: any) => {
        const diasMarcados: { [clave: string]: boolean } = {};
        this.diasSemanaCedis.forEach(d => {
          diasMarcados[d.clave] = !!(r.dias && r.dias[d.clave] && r.dias[d.clave].checked);
        });
        return {
          cod: r.cod || r.codigo || 'Sin código',
          destino: r.dest || r.destino || '',
          dias: diasMarcados
        };
      })
      .sort((a: any, b: any) => a.cod.localeCompare(b.cod));
  }

  public tablaRutasPorDiaSemanaEntrega(): { cod: string; destino: string; dias: { [clave: string]: string | false } }[] {
    const ordenClaves = this.diasSemanaCedis.map(d => d.clave);
    const ordenLabels = this.diasSemanaCedis.map(d => d.label.slice(0, 3));

    return this.getRutas()
      .map((r: any) => {
        const diasTrans = Number(r.diasTrans) > 0 ? Number(r.diasTrans) : 1;
        const diasMarcados: { [clave: string]: string | false } = {};
        ordenClaves.forEach(c => diasMarcados[c] = false);

        ordenClaves.forEach((claveSalida, idxSalida) => {
          const sale = !!(r.dias && r.dias[claveSalida] && r.dias[claveSalida].checked);
          if (!sale) return;
          const efectiva = this.entregaEfectivaParaSalida(r, claveSalida, idxSalida, diasTrans);
          diasMarcados[efectiva.claveEntrega] = ordenLabels[idxSalida];
        });

        return {
          cod: r.cod || r.codigo || 'Sin código',
          destino: r.dest || r.destino || '',
          dias: diasMarcados
        };
      })
      .sort((a: any, b: any) => a.cod.localeCompare(b.cod));
  }

  // ============================================================
  // PRIORIDADES DE HORARIO POR DÍA DE LA SEMANA (Makand)
  // ============================================================
  public readonly INTERVALO_MINUTOS_PRIORIDAD = 30;

  private horaAMinutosPrioridad(hora: string): number {
    if (!hora) return 0;
    const [h, m] = hora.split(':').map((n: string) => Number(n));
    return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
  }

  private minutosAHoraPrioridad(mins: number): string {
    const total = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  public listaRutasPorDiaPrioridad(claveDia: string): any[] {
    return this.getRutas()
      .filter((r: any) => r.dias && r.dias[claveDia] && r.dias[claveDia].checked)
      .map((r: any) => ({
        cod: r.cod || r.codigo || 'Sin código',
        destino: r.dest || r.destino || '',
        hora: r.dias[claveDia].hora || '00:00'
      }))
      .sort((a: any, b: any) => this.horaAMinutosPrioridad(a.hora) - this.horaAMinutosPrioridad(b.hora));
  }

  private operacionesPrioridadEnCurso: number = 0;

  public draggedCodPrioridad: string | null = null;
  public draggedDiaPrioridad: string | null = null;
  public dragOverCodPrioridad: string | null = null;

  // Los 4 manejadores de arrastre NO fuerzan detectChanges() manual —
  // están ligados con (evento)="..." en la plantilla de Angular, que ya
  // dispara su propio repintado tras cada evento. Forzarlo A MANO encima
  // (sobre todo en "dragover", que se dispara MUCHÍSIMAS veces por
  // segundo mientras arrastras) resultó CONTRAPRODUCENTE — llegó a
  // romper el arrastre nativo del navegador en vez de arreglarlo. Se
  // revirtió tras confirmar que empeoraba las cosas.
  public onDragStartPrioridad(cod: string, claveDia: string): void {
    this.draggedCodPrioridad = cod;
    this.draggedDiaPrioridad = claveDia;
  }

  public onDragOverPrioridad(event: DragEvent, cod: string, claveDia: string): void {
    // El arrastre solo tiene sentido DENTRO del mismo día — cada día
    // tiene su propio horario independiente.
    if (this.draggedDiaPrioridad !== claveDia) return;
    event.preventDefault();
    this.dragOverCodPrioridad = cod;
  }

  public onDragLeavePrioridad(): void {
    this.dragOverCodPrioridad = null;
    this.zone.run(() => this.cdr.detectChanges());
  }

  public onDropPrioridad(codDestino: string, claveDia: string): void {
    this.dragOverCodPrioridad = null;
    const codOrigen = this.draggedCodPrioridad;
    const diaOrigen = this.draggedDiaPrioridad;
    this.draggedCodPrioridad = null;
    this.draggedDiaPrioridad = null;

    if (!codOrigen || diaOrigen !== claveDia || codOrigen === codDestino) {
      // Si no hay nada que mover (soltaste en el mismo lugar, o algo no
      // cuadra), el flujo termina AQUÍ MISMO sin pasar por
      // encolarMovimientoPrioridad() — que es el único lugar de este
      // archivo que sí fuerza un repintado. Sin este aviso, la tarjeta
      // se quedaba viéndose "agarrada"/con el borde azul aunque el dato
      // ya estuviera limpio (confirmado con el usuario: los 3 valores
      // salían en null, pero la pantalla no se había actualizado).
      this.zone.run(() => this.cdr.detectChanges());
      return;
    }

    this.encolarMovimientoPrioridad(claveDia, codOrigen, codDestino);
  }

  public onDragEndPrioridad(): void {
    this.draggedCodPrioridad = null;
    this.draggedDiaPrioridad = null;
    this.dragOverCodPrioridad = null;
    // "dragend" se dispara UNA sola vez al terminar el gesto (a
    // diferencia de "dragover", que se dispara muchas veces por
    // segundo) — forzar el repintado aquí es seguro y necesario para
    // que la tarjeta no se quede viéndose "agarrada".
    this.zone.run(() => this.cdr.detectChanges());
  }

  public moverRutaPrioridadArriba(claveDia: string, index: number): void {
    const lista = this.listaRutasPorDiaPrioridad(claveDia);
    if (index <= 0 || index >= lista.length) return;
    this.encolarMovimientoPrioridad(claveDia, lista[index].cod, lista[index - 1].cod);
  }

  public moverRutaPrioridadAbajo(claveDia: string, index: number): void {
    const lista = this.listaRutasPorDiaPrioridad(claveDia);
    if (index < 0 || index >= lista.length - 1) return;
    this.encolarMovimientoPrioridad(claveDia, lista[index].cod, lista[index + 1].cod);
  }

  private colaGuardadoPrioridadPorDia: { [clave: string]: Promise<any> } = {};

  private encolarMovimientoPrioridad(claveDia: string, codOrigen: string, codDestino: string): void {
    if (codOrigen === codDestino) return;

    const listaOriginal = this.listaRutasPorDiaPrioridad(claveDia);
    const indiceOrigen = listaOriginal.findIndex((r: any) => r.cod === codOrigen);
    const indiceDestino = listaOriginal.findIndex((r: any) => r.cod === codDestino);
    if (indiceOrigen === -1 || indiceDestino === -1 || indiceOrigen === indiceDestino) return;

    const lista = [...listaOriginal];
    const [movida] = lista.splice(indiceOrigen, 1);
    lista.splice(indiceDestino, 0, movida);

    this.recalcularYGuardarHorarios(claveDia, lista);
  }

  // Recalcula (la primera conserva SU PROPIA hora, las demás +30min
  // normal, EXCEPTO justo después de "BOG-BAQ-EX" que queda a +2h) y
  // guarda — reusado tanto al arrastrar/mover en Prioridades de Horario
  // como al guardar una ruta directamente desde el formulario (ver
  // guardarRuta), para que un cambio de hora ahí TAMBIÉN recalcule en
  // cadena las demás rutas de ese día, igual que si se hubiera
  // arrastrado.
  private async recalcularYGuardarHorarios(claveDia: string, listaYaOrdenada: any[]): Promise<void> {
    if (!listaYaOrdenada.length) return;
    const lista = [...listaYaOrdenada];

    // La primera ruta del día conserva EXACTAMENTE la hora que se le
    // ponga (antes se forzaba entre la 1:00 y las 2:00 p.m. — ya no).
    let anclaMinutos = this.horaAMinutosPrioridad(lista[0].hora);

    lista[0].hora = this.minutosAHoraPrioridad(anclaMinutos);
    let minutosAcumulados = anclaMinutos;
    for (let i = 1; i < lista.length; i++) {
      const codAnterior = String(lista[i - 1].cod || '').toUpperCase().trim();
      const brecha = codAnterior === 'BOG-BAQ-EX' ? 120 : this.INTERVALO_MINUTOS_PRIORIDAD;
      minutosAcumulados += brecha;
      lista[i].hora = this.minutosAHoraPrioridad(minutosAcumulados);
    }

    const rutasAfectadas: any[] = [];
    for (const item of lista) {
      const rutaReal = this.getRutas().find((r: any) => (r.cod || r.codigo) === item.cod);
      if (!rutaReal || !rutaReal.dias || !rutaReal.dias[claveDia]) continue;

      // BUG REAL encontrado con un log del servidor: antes se guardaban
      // TODAS las rutas de ese día, aunque su hora no cambiara para
      // nada — al editar UNA ruta que corre varios días, eso disparaba
      // guardados de docenas de rutas que en realidad seguían
      // exactamente igual, sintiéndose como que la app se congelaba.
      // Ahora solo se guarda una ruta si su hora de verdad es distinta
      // a la que ya tenía.
      const horaVieja = rutaReal.dias[claveDia].hora;
      if (horaVieja === item.hora) continue;

      rutaReal.dias[claveDia].hora = item.hora;
      rutasAfectadas.push(rutaReal);
    }

    // Envuelto en NgZone.run() — en modo zoneless, cambiar un dato dentro
    // de una función async (como esta) no siempre dispara el repintado
    // solo con detectChanges(); este es el mismo arreglo ya confirmado
    // para este exacto problema en Rutograma. El "await Promise.resolve()"
    // de aquí abajo es el mismo microtask-flush que ya se usó en
    // configuracion.ts (Generar Matriz) para este mismo síntoma exacto:
    // sin él, el cambio quedaba bien guardado pero la tabla de
    // Prioridades de Horario se veía como si nada hubiera pasado hasta
    // el siguiente repintado por cualquier otro motivo.
    await Promise.resolve();
    this.zone.run(() => this.cdr.detectChanges());

    this.encolarGuardadoPrioridad(claveDia, rutasAfectadas);
  }

  private encolarGuardadoPrioridad(claveDia: string, rutasAfectadas: any[]): void {
    this.operacionesPrioridadEnCurso++;
    this.ds.guardandoEnCurso = true;

    const guardar = () => Promise.all(
      rutasAfectadas.map((rutaReal) => this.ds.guardarRuta(rutaReal, rutaReal.cod || rutaReal.codigo))
    );

    const anterior = this.colaGuardadoPrioridadPorDia[claveDia] || Promise.resolve();
    const actual = anterior.then(guardar, guardar).finally(() => {
      this.operacionesPrioridadEnCurso--;
      if (this.operacionesPrioridadEnCurso <= 0) {
        this.operacionesPrioridadEnCurso = 0;
        this.ds.guardandoEnCurso = false;
      }
      this.cdr.detectChanges();
    });
    this.colaGuardadoPrioridadPorDia[claveDia] = actual;
  }
}