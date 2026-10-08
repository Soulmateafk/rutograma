import { Component, inject, NgZone, ChangeDetectorRef, HostListener, ViewChild, ElementRef, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';
import { AccountService } from '../../services/account.service';
// Reutilizamos la MISMA lógica de conflictos que ya usa el Rutograma —
// nada de reinventar la regla de disponibilidad en un segundo lugar.
// @ts-ignore
import { mantenimientoQueChoca, rangosMantenimiento } from '../../services/mantenimiento';
import { obtenerDiasViaje, obtenerViajesEnConflicto, reprogramarViajeConflictivo, siguienteNumeroCupo, buscarCupoLibre, reprogramarViajesDesde } from '../rutograma/rutograma.utils.js';
import { fechaLocal, viajeEnRuta, textoEnRuta } from '../../services/dias-cerrados';
import { choquesDeAgenda } from '../../services/revision-viajes';
import { Sugerencia, sugerirVehiculos } from '../../services/sugerencias';

import { EnLineaComponent } from '../en-linea/en-linea';

interface ResultadoBusqueda { tipo: string; etiqueta: string; subtitulo: string; ruta: string; queryParams?: any; actual?: boolean; hacer?: () => void; }

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, EnLineaComponent],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent implements AfterViewInit, OnDestroy {

  public authService = inject(AuthService);
  public dataService = inject(DataService);
  private router = inject(Router);
  private cuenta = inject(AccountService);

  // El Rutograma (y por lo tanto "+ Viaje Extra") solo usa placas Viajero
  // y Tercero — las Urbano (entregas locales) no deben poder elegirse
  // aquí.
  /** Sin permiso para días cerrados, el viaje extra no puede ser de un día que ya pasó. */
  /** Un Viaje Extra nunca va en un día que ya pasó, para ninguna cuenta (no sería un dato real). */
  public get fechaMinimaViajeExtra(): string {
    return fechaLocal();
  }

  /** La fecha escogida ya pasó y la cuenta no puede cargar viajes en días cerrados. */
  public get fechaViajeExtraCerrada(): boolean {
    const f = String(this.nuevoViaje?.fecha || '');
    return !!f && !!this.fechaMinimaViajeExtra && f < this.fechaMinimaViajeExtra;
  }

  private avisarDiaCerrado(): void {
    this.ui.mostrarToast('<i class="bi bi-calendar-x"></i> No se permite añadir viajes en días ya cerrados: ese día ya pasó. Escoge hoy o un día siguiente.', 'err');
  }

  /** Aviso apenas se escoge un día que ya pasó (antes el calendario solo lo apagaba, sin decir por qué). */
  public cambioFechaViajeExtra(): void {
    if (this.fechaViajeExtraCerrada) this.avisarDiaCerrado();
  }

  // ============================================================
  // SUGERENCIA DE VEHÍCULO (services/sugerencias.ts): con la ruta y la
  // fecha elegidas, los 3 mejores vehículos propios. Se recalcula solo
  // cuando cambia lo que importa (ruta, fecha, cajas, cliente, hora).
  // ============================================================
  private cacheSugerencias: { clave: string; lista: Sugerencia[] } = { clave: '', lista: [] };

  public sugerenciasViajeExtra(): Sugerencia[] {
    const n = this.nuevoViaje || {};
    if (!n.ruta || !n.fecha) return [];
    const S = this.dataService.S;
    const clave = [n.ruta, n.fecha, n.cajas, n.cliente, n.hora, (S?.viajes || []).length, (S?.vehiculos || []).length].join('|');
    if (clave === this.cacheSugerencias.clave) return this.cacheSugerencias.lista;
    let lista: Sugerencia[] = [];
    try {
      const dia = Number(String(n.fecha).slice(8));
      const rutaObj = (S?.rutas || []).find((r: any) => String(r.cod || r.codigo || '') === String(n.ruta));
      // Mismo cálculo de días que usa guardarViajeExtraInterno para un vehículo propio.
      const dias = obtenerDiasViaje({ ruta: n.ruta, salida: dia }, S) - 2 + Number(rutaObj?.diasDesc || 0);
      lista = sugerirVehiculos(S, { fecha: n.fecha, dias, ruta: n.ruta, cliente: n.cliente, hora: n.hora, cajas: Number(n.cajas) || 0 });
    } catch (e) {
      console.error('Error sugiriendo vehículos:', e);
    }
    this.cacheSugerencias = { clave, lista };
    return lista;
  }

  public elegirSugerencia(s: Sugerencia): void {
    this.nuevoViaje.placa = s.placa;
  }

  public vehiculosParaViajeExtra(): any[] {
    return (this.dataService.S?.vehiculos || []).filter((v: any) =>
      String(v.categoria || 'Viajero').trim() !== 'Urbano'
    );
  }
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);
  private ui = inject(UiService);

  // ============================================================
  // DESHACER / REHACER — botones visibles en la barra de navegación
  // (compartida en toda la app). El historial vive en DataService,
  // guardado localmente en ESTA computadora (no se comparte con otras).
  // ============================================================
  // Deshacer/rehacer una acción masiva (Generar Matriz, Importar,
  // Restaurar) devuelve TODA la base a un respaldo: también se pierde lo
  // que cualquiera haya cambiado después. Por eso se pide confirmación.
  private async confirmarSiEsMasivo(entrada: any, verbo: string): Promise<boolean> {
    if (!entrada || entrada.tipo !== 'respaldo') return true;
    return this.mostrarConfirmPersonalizado(
      `${verbo} "${entrada.descripcion}" devuelve toda la información al momento en que se hizo.\n\n` +
      `También se perderán los cambios que cualquier persona haya hecho después.`,
      verbo,
      'Cancelar'
    );
  }

  public async deshacerUltimoCambio(): Promise<void> {
    const pila = this.dataService.pilaDeshacer;
    if (!(await this.confirmarSiEsMasivo(pila[pila.length - 1], 'Deshacer'))) return;
    const resultado = await this.dataService.deshacerUltimoCambio();
    this.ui.mostrarToast(resultado.mensaje, resultado.ok ? 'ok' : 'err');
    this.zone.run(() => this.cdr.detectChanges());
  }

  public async rehacerUltimoCambio(): Promise<void> {
    const pila = this.dataService.pilaRehacer;
    if (!(await this.confirmarSiEsMasivo(pila[pila.length - 1], 'Rehacer'))) return;
    const resultado = await this.dataService.rehacerUltimoCambio();
    this.ui.mostrarToast(resultado.mensaje, resultado.ok ? 'ok' : 'err');
    this.zone.run(() => this.cdr.detectChanges());
  }

  // ============================================================
  // Modal de confirmación PROPIO — reemplaza el confirm() nativo del
  // navegador (que se ve feo/genérico) por uno con el mismo estilo del
  // resto de la app. Mismo patrón ya usado en rutograma.ts.
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

  // --- Fecha de hoy, para el cuadro gris del navbar ---
  // (antes era un <span id="bdg-mes"> vacío, sin ningún enlace real de Angular)
  get fechaHoy(): string {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const hoy = new Date();
    return `${dias[hoy.getDay()]} ${hoy.getDate()} ${meses[hoy.getMonth()]}`;
  }

  // --- Estado de los modales ---
  public isModalViajeOpen = false;
  public isModalNovedadOpen = false;

  // --- Formulario: Viaje Extra ---
  public nuevoViaje: any = {
    placa: '',
    ruta: '',
    fecha: '',
    cliente: '',
    cajas: null,
    hora: ''
  };

  // --- Formulario: Novedad ---
  public nuevaNovedad: any = {
    tipo: 'Incidente',
    titulo: '',
    desc: ''
  };

  // ============================================================
  // DESCARGAR DIARIO
  // ============================================================
  descargarDiario() {
    this.dataService.descargarDiario();
  }

  // ============================================================
  // ABRIR / CERRAR MODALES
  // ============================================================
  abrirModal(modalId: string) {
    if (modalId === 'm-viaje') {
      this.resetFormularioViaje();
      this.isModalViajeOpen = true;
    } else if (modalId === 'm-novedad') {
      this.resetFormularioNovedad();
      this.isModalNovedadOpen = true;
    }
  }

  cerrarModalViaje() {
    this.isModalViajeOpen = false;
  }

  cerrarModalNovedad() {
    this.isModalNovedadOpen = false;
  }

  private resetFormularioViaje() {
    const S = this.dataService.S;
    // Por defecto, la fecha de hoy (o día 1 si estás viendo otro mes)
    const dia = String(this.dataService.getDIA()).padStart(2, '0');
    const mes = String((S?.mes ?? 0) + 1).padStart(2, '0');
    const anio = S?.anio ?? new Date().getFullYear();
    this.nuevoViaje = {
      placa: '',
      ruta: '',
      fecha: `${anio}-${mes}-${dia}`,
      cliente: '',
      cajas: null,
      hora: ''
    };
  }

  private resetFormularioNovedad() {
    this.nuevaNovedad = { tipo: 'Incidente', titulo: '', desc: '' };
  }

  // ============================================================
  // Cuando cambia la ruta seleccionada, autocompletar cliente/cajas
  // ============================================================
  onRutaExtraChange() {
    const S = this.dataService.S;
    const ruta = S?.rutas?.find((r: any) => r.cod === this.nuevoViaje.ruta);
    if (!ruta) return;

    if (!this.nuevoViaje.cliente) {
      this.nuevoViaje.cliente = Array.isArray(ruta.clientes) ? ruta.clientes[0] : (ruta.clientes || '');
    }
    if (!this.nuevoViaje.cajas) {
      this.nuevoViaje.cajas = ruta.cajasMin || 660;
    }
    if (!this.nuevoViaje.hora && ruta.horaBase) {
      this.nuevoViaje.hora = ruta.horaBase;
    }
  }

  // ============================================================
  // GUARDAR VIAJE EXTRA (validando conflictos primero)
  // ============================================================
  // Misma traba que en vehiculos.ts/rutograma.ts: sin esto, un segundo
  // clic (o Enter) mientras un confirm()/alert() seguía abierto disparaba
  // la función otra vez en paralelo, repitiendo la misma pregunta.
  public procesandoViajeExtra: boolean = false;

  async guardarViajeExtra() {
    if (this.procesandoViajeExtra) return;
    this.procesandoViajeExtra = true;
    try {
      await this.guardarViajeExtraInterno();
    } finally {
      this.procesandoViajeExtra = false;
    }
  }

  private async guardarViajeExtraInterno() {
    const S = this.dataService.S;

    if (!this.nuevoViaje.placa || !this.nuevoViaje.ruta || !this.nuevoViaje.fecha) {
      this.ui.mostrarToast('Completa vehículo, ruta y fecha.', 'err');
      return;
    }
    if (this.fechaViajeExtraCerrada) {
      this.avisarDiaCerrado();
      return;
    }

    const ruta = S?.rutas?.find((r: any) => r.cod === this.nuevoViaje.ruta);
    if (!ruta) {
      this.ui.mostrarToast('Esa ruta no existe.', 'err');
      return;
    }

    const vehiculo = S?.vehiculos?.find((v: any) => v.p === this.nuevoViaje.placa);

    const diaIni = new Date(this.nuevoViaje.fecha + 'T00:00:00').getDate();

    // OJO — bug real: esta placa puede ser de un tercero (Arsitrans/
    // Polar) tanto como de Makand — la transportadora se toma del
    // vehículo elegido (ver "tr: vehiculo?.tr" más abajo). Arsitrans/
    // Polar SIEMPRE están libres al día siguiente de cualquier viaje,
    // sin importar la ruta — usarles "Días en tránsito"/"Días de
    // retorno" (pensados para Makand) les inflaba el retorno de más,
    // provocando conflictos en rojo falsos con el día siguiente.
    const trVehiculo = String(vehiculo?.tr || 'Makand').toLowerCase().trim();
    const esTerceroVehiculo = trVehiculo.includes('arsitran') || trVehiculo.includes('polar');

    let diaFin: number;
    if (esTerceroVehiculo) {
      diaFin = diaIni + 1;
    } else {
      const diasViaje = obtenerDiasViaje({ ruta: this.nuevoViaje.ruta, salida: diaIni }, S);
      // "Días de retorno" (diasDesc) es un campo APARTE que se suma
      // encima de "Días en tránsito" — para rutas donde el vehículo
      // entrega la carga un día, pero tarda días adicionales en volver
      // de verdad antes de poder tomar otra ruta. Si diasDesc es 0 (o
      // no está puesto), no cambia nada de lo que ya funciona.
      const rutaObj = (S?.rutas || []).find((r: any) => String(r.cod || r.codigo || '') === String(this.nuevoViaje.ruta));
      const diasRetornoExtra = Number(rutaObj?.diasDesc || 0);
      // "diaFin" debe ser el RETORNO (salida + diasTrans + diasDesc) —
      // el vehículo YA está viajando de nuevo el ÚLTIMO día de tránsito
      // + retorno (mismo cambio de regla aplicado en server.js/
      // rutas.ts/rutograma.ts). Como "diasViaje" ya incluye +2 sobre
      // diasTrans (ver obtenerDiasViaje), el ajuste correcto es "- 2"
      // en vez de "- 1".
      diaFin = diaIni + diasViaje - 2 + diasRetornoExtra;
    }

    // Mantenimiento: se revisan TODOS los días que el viaje ocupa al
    // vehículo (de la salida al retorno), no solo el de salida — la
    // misma regla que aplica el servidor. Solo se permite salir el
    // último día del mantenimiento.
    // Marcado "Mantenimiento" pero sin fechas guardadas (dato viejo): no
    // hay forma de saber cuándo sale, así que se bloquea por seguridad.
    const enMantSinFechas = !!vehiculo && String(vehiculo.est || vehiculo.estado || '').toLowerCase().includes('mant') && !(vehiculo.mantInicio && vehiculo.mantFin);
    if (enMantSinFechas) {
      this.ui.mostrarToast(`${this.nuevoViaje.placa} está en mantenimiento sin fechas registradas — ponle las fechas en Vehículos antes de asignarle viajes.`, 'err');
      return;
    }
    // El vehículo va en ruta esos días (su viaje ya arrancó): no se le pone
    // otro encima ni se le corre ese viaje. Antes se aceptaba y se
    // intentaba mover el viaje que ya iba en camino.
    const enRuta = choquesDeAgenda(
      { p: this.nuevoViaje.placa, placa: this.nuevoViaje.placa, fecha: this.nuevoViaje.fecha, salida: diaIni, dia: diaIni, retorno: diaFin, estado: 'Programado' },
      S?.viajes || [], S?.conductores || []
    ).filter(c => c.por === 'vehículo' && viajeEnRuta(c.viaje));
    if (enRuta.length) {
      this.ui.mostrarToast(`<i class="bi bi-truck"></i> No se puede asignar: ${textoEnRuta(enRuta[0].viaje)}. Escoge otro vehículo o un día después de su regreso.`, 'err');
      return;
    }

    const choqueMant = mantenimientoQueChoca(rangosMantenimiento(vehiculo), this.nuevoViaje.fecha, diaFin - diaIni);
    if (choqueMant) {
      this.ui.mostrarToast(`${this.nuevoViaje.placa} está en mantenimiento del ${choqueMant.inicio} al ${choqueMant.fin}, y este viaje lo ocuparía esos días. Solo puede salir desde el ${choqueMant.fin}.`, 'err');
      return;
    }

    // Confirmación antes de crear el viaje — no importa si ese vehículo ya
    // está en ruta ese día: el viaje nuevo se agrega igual, y si hace
    // falta, los viajes SIGUIENTES de ese vehículo se acomodan solos.
    const fechaLegible = new Date(this.nuevoViaje.fecha + 'T00:00:00').toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });
    const confirmado = await this.mostrarConfirmPersonalizado(
      `Vehículo: ${this.nuevoViaje.placa}\n` +
      `Ruta: ${this.nuevoViaje.ruta}\n` +
      `Fecha: ${fechaLegible}\n\n` +
      `Si ese vehículo tenía otros viajes agendados después de esta fecha, se acomodarán automáticamente si hace falta.`,
      'Agregar viaje',
      'Cancelar'
    );
    if (!confirmado) return;

    const mesesTexto = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesTexto = mesesTexto[S.mes];

    const nv = {
      id: `${this.nuevoViaje.placa}-${this.nuevoViaje.fecha}-${this.nuevoViaje.ruta}`,
      placa: this.nuevoViaje.placa,
      p: this.nuevoViaje.placa,
      ruta: this.nuevoViaje.ruta,
      codigo: this.nuevoViaje.ruta,
      destino: ruta.dest || ruta.destino,
      tr: vehiculo?.tr || 'Makand',
      transportadora: vehiculo?.tr || 'Makand',
      fecha: this.nuevoViaje.fecha,
      dia: diaIni,
      salida: diaIni,
      retorno: diaFin,
      cliente: this.nuevoViaje.cliente,
      cli: this.nuevoViaje.cliente,
      cajas: this.nuevoViaje.cajas,
      hora: this.nuevoViaje.hora,
      horaDespacho: this.nuevoViaje.hora,
      estado: 'Programado',
      tipo: 'extra',
      // Antes faltaban mes/anio — el resto de la app SIEMPRE los trae en
      // cada viaje, así que agregarlos aquí lo deja consistente con todo
      // lo demás (aunque el filtro por mes ya lo dejaba pasar igual).
      mes: mesTexto,
      anio: S.anio,
      costo: this.dataService.tarifa({ tr: vehiculo?.tr || 'Makand', ruta: this.nuevoViaje.ruta })
    };

    // Mientras dura todo este guardado (el viaje nuevo + acomodar los que
    // chocan), la sincronización automática de 20s se pausa — sin esto,
    // podía caer justo a la mitad y sobrescribir S.viajes con una copia
    // del servidor de ANTES de este guardado, deshaciendo el cambio en
    // silencio (esa era la causa real de "no pasó nada").
    this.dataService.guardandoEnCurso = true;
    try {
      const resultado = await this.dataService.motorReasignar(nv);
      if (resultado.ok) {
        // El viaje nuevo ya quedó guardado en su día exacto — ahora, solo
        // los viajes de ESE MISMO vehículo que de verdad chocan con él se
        // mueven hacia ADELANTE (nunca hacia atrás) al día más cercano
        // donde su ruta corre y el vehículo está libre. Si alguno no
        // encuentra día disponible este mes, se deja tal como está — nunca
        // se bloquea ni se esconde el viaje nuevo por esto.
        const conflictivos = obtenerViajesEnConflicto(this.nuevoViaje.placa, diaIni, diaFin, S, nv.id);
        // Ids de los viajes que este mismo paso ya reacomodó, para no
        // dejar que el siguiente paso (reprogramarViajesDesde) los vuelva
        // a tocar — ese día ya fue elegido a propósito para no chocar con
        // el viaje nuevo, y el otro algoritmo no lo sabe (solo mira si la
        // ruta corre ese día de la semana, no si el día ya fue elegido
        // así para evitar un choque puntual).
        const idsYaReacomodados: any[] = [];
        for (const viejo of conflictivos) {
          const nuevaFecha = reprogramarViajeConflictivo(viejo, S);

          if (nuevaFecha) {
            const fechaObj = new Date(S.anio, S.mes, nuevaFecha.dia);
            const fechaString = `${fechaObj.getFullYear()}-${String(fechaObj.getMonth() + 1).padStart(2, '0')}-${String(fechaObj.getDate()).padStart(2, '0')}`;

            viejo.dia = nuevaFecha.dia;
            viejo.salida = nuevaFecha.dia;
            viejo.retorno = nuevaFecha.fin;
            viejo.fecha = fechaString;

            const okMovido = await this.dataService.guardarViaje({ ...viejo });
            if (!okMovido) {
              this.ui.mostrarToast(`El viaje extra se guardó, pero no se pudo acomodar automáticamente el viaje de ${viejo.p || viejo.placa} (${viejo.ruta}). Revísalo manualmente.`, 'err');
            }
            idsYaReacomodados.push(viejo.id);
            continue;
          }

          // No quedó ningún día libre este mes para esa misma placa — se
          // le pregunta al usuario qué hacer, en vez de decidirlo solo.
          const clienteViejo = String(viejo.cliente || viejo.cli || '').toLowerCase();
          const nombreTrFallback = clienteViejo.includes('ara') ? 'Arsitrans' : 'Polar';

          const reasignar = await this.mostrarConfirmPersonalizado(
            `El viaje de ${viejo.p || viejo.placa} (${viejo.ruta}, día ${viejo.dia}) no tiene ningún día libre este mes en su propia placa.`,
            `Reasignar a ${nombreTrFallback}`,
            `Dejarlo donde está`
          );

          if (!reasignar) continue; // se deja tal como está, sin tocar nada más

          let placaCupo = buscarCupoLibre(nombreTrFallback, viejo.salida, viejo.retorno, viejo.id, S);
          if (!placaCupo) {
            const numeroCupo = siguienteNumeroCupo(nombreTrFallback, S);
            placaCupo = `${nombreTrFallback.toUpperCase()} ${numeroCupo}`;
            await this.asegurarVehiculoParaPlacaCupo(placaCupo, nombreTrFallback);
          }

          viejo.p = placaCupo;
          viejo.veh = placaCupo;
          viejo.placa = placaCupo;
          viejo.tr = nombreTrFallback;
          viejo.transportadora = nombreTrFallback;
          // Tercero: solo ocupa el día de salida.
          viejo.retorno = Number(viejo.salida) + 1;

          const okReasignado = await this.dataService.guardarViaje({ ...viejo });
          if (!okReasignado) {
            this.ui.mostrarToast(`El viaje extra se guardó, pero no se pudo reasignar a ${nombreTrFallback} el viaje de ${viejo.ruta} que no cabía. Revísalo manualmente.`, 'err');
          }
          // Este sí cambió de placa (ya no es de esta placa), así que no
          // hace falta excluirlo — reprogramarViajesDesde solo mira los
          // viajes que siguen siendo de la placa original.
        }

        // Además de resolver los choques directos, el vehículo queda
        // libre desde el retorno de este viaje nuevo — los viajes
        // SIGUIENTES de esa misma placa (aunque no chocaran de verdad con
        // el nuevo) se adelantan para llenar cualquier hueco que haya
        // quedado libre, igual que ya pasa al eliminar un viaje. Se
        // excluyen los que el paso anterior ya reacomodó, para no
        // deshacer ese arreglo.
        const cambiadosPorHueco = reprogramarViajesDesde(this.nuevoViaje.placa, diaFin, S, idsYaReacomodados);
        for (const vj of cambiadosPorHueco) {
          const okAdelantado = await this.dataService.guardarViaje({ ...vj });
          if (!okAdelantado) {
            this.ui.mostrarToast(`El viaje extra se guardó, pero no se pudo adelantar el viaje de ${vj.p || vj.placa} (${vj.ruta}) para llenar el hueco. Revísalo manualmente.`, 'err');
          }
        }
        Promise.resolve().then(() => {
          this.zone.run(() => {
            this.isModalViajeOpen = false;
            this.cdr.detectChanges();
          });
        });
      } else {
        this.ui.mostrarToast(`No se pudo guardar el viaje extra: ${resultado.msg || 'error desconocido'}`, 'err');
      }
    } finally {
      this.dataService.guardandoEnCurso = false;
    }
  }

  // ============================================================
  // GUARDAR NOVEDAD
  // ============================================================
  async guardarNovedad() {
    if (!this.nuevaNovedad.titulo || !this.nuevaNovedad.desc) {
      this.ui.mostrarToast('Completa el título y la descripción.', 'err');
      return;
    }
    await this.dataService.novedad(this.nuevaNovedad.tipo, this.nuevaNovedad.titulo, this.nuevaNovedad.desc);
    this.isModalNovedadOpen = false;
  }

  // Si esa placa de cupo todavía no existe como vehículo, la creamos —
  // mismo patrón que ya usa rutograma.ts (asegurarVehiculoParaPlaca), acá
  // duplicado solo porque necesita el HTTP save propio de este componente.
  private async asegurarVehiculoParaPlacaCupo(placa: string, nombreTr: string): Promise<void> {
    const S = this.dataService.S;
    const placaLimpia = String(placa || '').toUpperCase().trim();
    if (!placaLimpia) return;

    const yaExiste = (S.vehiculos || []).some((v: any) =>
      String(v.p || v.placa || '').toUpperCase().trim() === placaLimpia
    );
    if (yaExiste) return;

    const plantilla = (S.vehiculos || []).find((v: any) =>
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
    if (!S.vehiculos) S.vehiculos = [];
    S.vehiculos.push(nuevoVehiculo);
    await this.dataService.guardarVehiculo(nuevoVehiculo, S.vehiculos.length - 1);
  }

  // ============================================================
  // BÚSQUEDA GLOBAL — encuentra una placa, un conductor o un código de
  // ruta desde cualquier pantalla, y te lleva directo a donde vive.
  // ============================================================
  public busquedaGlobal: string = '';
  public resultadosBusqueda: ResultadoBusqueda[] = [];
  public mostrandoResultadosBusqueda: boolean = false;

  // Pantallas de la app que se pueden encontrar escribiendo su nombre
  // en el buscador — así "config" o "hist" saltan directo, sin tener
  // que ir al menú a buscarlas.
  private readonly paginasBuscables: Array<{ nombre: string; ruta: string }> = [
    { nombre: 'Dashboard', ruta: '/dashboard' },
    { nombre: 'Rutograma', ruta: '/rutograma' },
    { nombre: 'Vehículos', ruta: '/vehiculos' },
    { nombre: 'Rutas', ruta: '/rutas' },
    { nombre: 'Conductores', ruta: '/conductores' },
    { nombre: 'Configuración', ruta: '/configuracion' },
    { nombre: 'Histórico', ruta: '/historico' },
    { nombre: 'Comparativo', ruta: '/comparativo' },
    { nombre: 'Cumplimiento', ruta: '/cumplimiento' },
    { nombre: 'Reglas', ruta: '/reglas' },
    { nombre: 'Comparendos', ruta: '/comparendos' },
    { nombre: 'Quejas', ruta: '/quejas' },
    { nombre: 'Mapa', ruta: '/mapa' },
    { nombre: 'Despachos', ruta: '/despachos' },
    { nombre: 'Papelera', ruta: '/papelera' },
    { nombre: 'Sesiones', ruta: '/sesiones' },
    { nombre: 'Aprobaciones', ruta: '/aprobaciones' },
    { nombre: 'Administrador', ruta: '/admin' }
  ];

  // Referencia al <input> real, para poder enfocarlo con el atajo de
  // teclado sin importar en qué parte de la pantalla esté el usuario.
  @ViewChild('inputBusquedaGlobal') inputBusquedaGlobal?: ElementRef<HTMLInputElement>;

  // ============================================================
  // MENÚ "MÁS" — para que el navbar quepa en UNA fila. Se MIDE cuánto
  // cabe (no hay anchos fijos: la letra cambia entre Windows, Mac y el
  // zoom del navegador) y las pestañas que no caben pasan a "Más",
  // empezando por la última de esta lista. En celular no aplica: ahí
  // las pestañas se deslizan de lado (styles.css).
  // ============================================================
  private readonly todasPaginasMenuMas: Array<{ nombre: string; ruta: string }> = [
    { nombre: 'Conductores', ruta: '/conductores' },
    { nombre: 'Configuración', ruta: '/configuracion' },
    { nombre: 'Histórico', ruta: '/historico' },
    { nombre: 'Comparativo', ruta: '/comparativo' },
    { nombre: 'Cumplimiento', ruta: '/cumplimiento' },
    { nombre: 'Reglas', ruta: '/reglas' },
    { nombre: 'Comparendos', ruta: '/comparendos' },
    { nombre: 'Quejas', ruta: '/quejas' },
    { nombre: 'Mapa', ruta: '/mapa' },
    { nombre: 'Despachos', ruta: '/despachos' },
    { nombre: 'Papelera', ruta: '/papelera' },
    { nombre: 'Sesiones', ruta: '/sesiones' },
    { nombre: 'Aprobaciones', ruta: '/aprobaciones' },
    { nombre: 'Administrador', ruta: '/admin' }
  ];
  private cachePaginas: { clave: string; lista: Array<{ nombre: string; ruta: string }> } = { clave: '', lista: [] };

  /** ¿La cuenta actual puede abrir esta pantalla? (según sus permisos). */
  private paginaPermitida(ruta: string): boolean {
    if (ruta === '/admin') return this.authService.puedeVerAdministracion;
    if (ruta === '/aprobaciones') return this.authService.puedeAprobar || this.authService.necesitaAprobacion;
    if (ruta === '/papelera') return this.authService.puede('eliminar');
    return true;
  }

  /** Pestañas de la derecha según el rol (misma lista mientras el rol no cambie). */
  public get paginasMenuMas(): Array<{ nombre: string; ruta: string }> {
    const clave = `${this.authService.puedeVerAdministracion}-${this.authService.puedeAprobar}-${this.authService.necesitaAprobacion}-${this.authService.puede('eliminar')}`;
    if (this.cachePaginas.clave !== clave) {
      this.cachePaginas = { clave, lista: this.todasPaginasMenuMas.filter(p => this.paginaPermitida(p.ruta)) };
      this.programarAjuste();
    }
    return this.cachePaginas.lista;
  }

  // Cambios de auxiliares esperando aprobación (número en la pestaña).
  public pendientesAprobacion = 0;
  private intervaloPendientes: ReturnType<typeof setInterval> | null = null;

  private async contarPendientesAprobacion(): Promise<void> {
    if (!this.authService.puedeAprobar && !this.authService.necesitaAprobacion) {
      if (this.pendientesAprobacion) { this.pendientesAprobacion = 0; this.cdr.markForCheck(); }
      return;
    }
    try {
      const base = `${window.location.protocol}//${window.location.hostname}:5000/api`;
      const res = await this.authService.fetchAutenticado(`${base}/aprobaciones`);
      const data = await res.json();
      const n = data?.ok ? Number(data.pendientes) || 0 : 0;
      if (n !== this.pendientesAprobacion) {
        this.pendientesAprobacion = n;
        this.cdr.markForCheck();
        this.programarAjuste();
      }
    } catch { /* sin conexión: se reintenta en el siguiente ciclo */ }
  }
  public rutasEnMenuMas = new Set<string>();
  public ocultarFecha = false;
  public menuMasAbierto = false;

  @ViewChild('contenedorPestanas') contenedorPestanas?: ElementRef<HTMLElement>;
  @ViewChild('accionesNav') accionesNav?: ElementRef<HTMLElement>;
  private observadorTamano?: ResizeObserver;
  private ajustePendiente = 0;

  ngAfterViewInit(): void {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
    // Se vuelve a medir si cambia el ancho de la ventana/zoom o el de los
    // botones de la derecha (por ejemplo, al cambiar la fecha o el rol).
    this.observadorTamano = new ResizeObserver(() => this.programarAjuste());
    const nav = this.contenedorPestanas?.nativeElement.parentElement;
    if (nav) this.observadorTamano.observe(nav);
    if (this.accionesNav) this.observadorTamano.observe(this.accionesNav.nativeElement);
    (document as any).fonts?.ready?.then(() => this.programarAjuste());
    this.programarAjuste();

    this.contarPendientesAprobacion();
    this.intervaloPendientes = setInterval(() => {
      if (document.visibilityState === 'visible') this.contarPendientesAprobacion();
    }, 20000);
    this.cuenta.alCambioPendiente.subscribe(() => setTimeout(() => this.contarPendientesAprobacion(), 500));
  }

  ngOnDestroy(): void {
    if (this.intervaloPendientes) clearInterval(this.intervaloPendientes);
    this.observadorTamano?.disconnect();
    if (this.ajustePendiente) cancelAnimationFrame(this.ajustePendiente);
  }

  private programarAjuste(): void {
    if (this.ajustePendiente) return;
    this.ajustePendiente = requestAnimationFrame(() => {
      this.ajustePendiente = 0;
      this.ajustarPestanas();
    });
  }

  /** Mueve a "Más" (de la última hacia atrás) las pestañas que no caben. */
  private ajustarPestanas(): void {
    const cont = this.contenedorPestanas?.nativeElement;
    if (!cont) return;
    const antes = [...this.rutasEnMenuMas].join() + this.ocultarFecha;

    const pestanas = Array.from(cont.querySelectorAll<HTMLElement>('.tab')).slice(-this.paginasMenuMas.length);
    const fecha = this.accionesNav?.nativeElement.querySelector<HTMLElement>('.fecha-nav');
    pestanas.forEach(t => t.classList.remove('oculta'));
    fecha?.classList.remove('oculta');
    const ocultas = new Set<string>();

    if (window.innerWidth > 900) {
      // Espacio que tendrían las pestañas SIN el botón "Más" (si ya se
      // está mostrando, se suma lo que ocupa), y lo que ocupa "Más".
      const nav = cont.parentElement as HTMLElement;
      const separacion = parseFloat(getComputedStyle(nav).columnGap) || 0;
      const botonMas = nav.querySelector<HTMLElement>('.tab-mas');
      const anchoMas = (botonMas ? botonMas.getBoundingClientRect().width : 64) + separacion;
      const libre = () => cont.clientWidth + (botonMas ? anchoMas : 0) - (ocultas.size > 0 ? anchoMas : 0);
      const sobra = () => cont.scrollWidth > libre() + 1;

      for (let i = pestanas.length - 1; i >= 0 && sobra(); i--) {
        pestanas[i].classList.add('oculta');
        ocultas.add(this.paginasMenuMas[i].ruta);
      }
      // Si aun con todas en "Más" no cabe, se esconde la fecha.
      if (fecha && sobra()) fecha.classList.add('oculta');
    }

    // Si "Más" aparece o desaparece ahora, su ancho real recién se conoce
    // cuando Angular lo dibuje: se vuelve a medir en el siguiente cuadro.
    const habiaMas = !!cont.parentElement?.querySelector('.tab-mas');
    this.rutasEnMenuMas = ocultas;
    this.ocultarFecha = !!fecha?.classList.contains('oculta');
    if (!ocultas.size) this.menuMasAbierto = false;
    if (antes !== [...ocultas].join() + this.ocultarFecha) this.cdr.markForCheck();
    if (habiaMas !== ocultas.size > 0) this.programarAjuste();
  }

  public alternarMenuMas(): void {
    this.menuMasAbierto = !this.menuMasAbierto;
  }

  /** "Más" se marca activo si la página actual está escondida dentro de él. */
  public masActivo(): boolean {
    const ruta = this.router.url.split(/[?#]/)[0];
    return [...this.rutasEnMenuMas].some(r => ruta === r || ruta.startsWith(r + '/'));
  }

  // Cierra el menú al hacer clic en cualquier otra parte.
  @HostListener('document:click', ['$event'])
  public cerrarMenuMasAfuera(evento: MouseEvent): void {
    if (!this.menuMasAbierto) return;
    const dentro = (evento.target as HTMLElement | null)?.closest?.('.tab-mas');
    if (!dentro) this.menuMasAbierto = false;
  }

  @HostListener('window:keydown', ['$event'])
  public atajoBusquedaGlobal(evento: KeyboardEvent): void {
    // Ctrl+K en Windows/Linux, Cmd+K en Mac.
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
      evento.preventDefault(); // algunos navegadores usan Ctrl+K para su propia barra de direcciones
      this.inputBusquedaGlobal?.nativeElement.focus();
      this.inputBusquedaGlobal?.nativeElement.select();
      return;
    }

    // Atajo "/" — lleva al Rutograma y enfoca su buscador de placas
    // (el de "Resaltar placa"), sin importar en qué pantalla estés.
    // Se ignora si ya estás escribiendo en cualquier campo de texto —
    // si no, sería imposible escribir una "/" dentro de un formulario.
    if (evento.key === '/') {
      const elementoActivo = document.activeElement;
      const yaEscribiendo = elementoActivo && (
        elementoActivo.tagName === 'INPUT' ||
        elementoActivo.tagName === 'TEXTAREA' ||
        elementoActivo.tagName === 'SELECT' ||
        (elementoActivo as HTMLElement).isContentEditable
      );
      if (yaEscribiendo) return;

      evento.preventDefault(); // en Firefox, "/" abre su propia búsqueda rápida
      // Date.now() como valor único — así, si ya estás en el Rutograma
      // y le das "/" otra vez, el query param SÍ cambia y el buscador
      // se vuelve a enfocar (si fuera el mismo valor de antes, Angular
      // no dispara de nuevo la suscripción en rutograma.ts).
      this.router.navigate(['/rutograma'], { queryParams: { enfocarBusqueda: Date.now() } });
    }
  }

  // ============================================================
  // BÚSQUEDA RÁPIDA (Ctrl+K) — viajes, vehículos, conductores, rutas,
  // novedades, pantallas y acciones ("viaje extra", "novedad", "diario",
  // "despacho"). Varias palabras se buscan juntas ("prz 065 12", "cali
  // d1"), sin importar tildes ni mayúsculas. Con el teclado: flechas para
  // moverse, Enter para abrir, Esc para cerrar.
  // ============================================================
  public resultadoActivo = 0;

  private readonly accionesBuscables: Array<{ nombre: string; claves: string; subtitulo: string; permitido: () => boolean; hacer: () => void }> = [
    { nombre: 'Agregar viaje extra', claves: 'viaje extra agregar nuevo crear', subtitulo: 'Abre el formulario de Viaje Extra',
      permitido: () => this.authService.puedeEditar, hacer: () => this.abrirModal('m-viaje') },
    { nombre: 'Reportar novedad', claves: 'novedad reportar aviso varado retraso', subtitulo: 'Abre el formulario de Novedad',
      permitido: () => this.authService.puedeEditar, hacer: () => this.abrirModal('m-novedad') },
    { nombre: 'Descargar diario', claves: 'diario descargar excel hoy viajes de hoy', subtitulo: 'Excel con los viajes de hoy',
      permitido: () => true, hacer: () => this.descargarDiario() },
    { nombre: 'Anotar un despacho', claves: 'despacho despachos cargue anotar llegada', subtitulo: 'Pantalla Despachos',
      permitido: () => true, hacer: () => this.router.navigate(['/despachos']) }
  ];

  public buscarGlobal(): void {
    const sinTildes = (t: any) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const q = sinTildes(this.busquedaGlobal.trim());
    this.resultadoActivo = 0;
    if (!q) {
      this.resultadosBusqueda = [];
      this.mostrandoResultadosBusqueda = false;
      return;
    }
    // Todas las palabras tienen que estar (en cualquier orden).
    const palabras = q.split(/\s+/).filter(Boolean);
    const coincide = (...campos: any[]) => { const texto = sinTildes(campos.join(' ')); return palabras.every(p => texto.includes(p)); };

    const S = this.dataService.S;
    const resultados: ResultadoBusqueda[] = [];
    const pad = (n: number) => String(n).padStart(2, '0');

    // Acciones
    this.accionesBuscables.filter(a => a.permitido() && coincide(a.nombre, a.claves)).forEach(a =>
      resultados.push({ tipo: 'Acción', etiqueta: a.nombre, subtitulo: a.subtitulo, ruta: '', hacer: a.hacer }));

    // Viajes: de hace una semana a dentro de tres, los más cercanos a hoy primero.
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const aFecha = (f: string) => { const [a, m, d] = String(f).split('-').map(Number); return new Date(a, m - 1, d); };
    const dias = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    const viajes = (S.viajes || [])
      .filter((v: any) => /^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || '')) && v.estado !== 'Cancelado')
      .map((v: any) => ({ v, f: aFecha(v.fecha) }))
      .filter((x: any) => { const d = (x.f.getTime() - hoy.getTime()) / 86400000; return d >= -7 && d <= 21; })
      .filter(({ v, f }: any) => coincide(v.p || v.placa, v.ruta || v.codigo, v.destino, v.cliente || v.cli, v.cond,
        `${f.getDate()} ${pad(f.getDate())}/${pad(f.getMonth() + 1)} ${dias[f.getDay()]}`))
      .sort((a: any, b: any) => Math.abs(a.f.getTime() - hoy.getTime()) - Math.abs(b.f.getTime() - hoy.getTime()))
      .slice(0, 4);
    viajes.forEach(({ v, f }: any) => resultados.push({
      tipo: 'Viaje',
      etiqueta: `${String(v.p || v.placa || '').toUpperCase()} · ${v.ruta || v.codigo || 'Viaje'}${v.destino && v.destino !== 'No definido' ? ' → ' + v.destino : ''}`,
      subtitulo: `${dias[f.getDay()]} ${pad(f.getDate())}/${pad(f.getMonth() + 1)}${v.cliente ? ' · ' + v.cliente : ''}${v.estado ? ' · ' + v.estado : ''}`,
      ruta: '/rutograma', queryParams: { verViaje: v.id }
    }));

    (S.vehiculos || []).forEach((v: any) => {
      const placa = String(v.p || v.placa || '');
      const conductor = String(v.cond || v.conductor || '');
      if (coincide(placa, conductor)) {
        resultados.push({ tipo: 'Vehículo', etiqueta: placa, subtitulo: conductor || 'Sin asignar', ruta: '/vehiculos', queryParams: { buscarPlaca: placa } });
        resultados.push({ tipo: 'Hoja de vida', etiqueta: `Hoja de vida de ${placa}`, subtitulo: 'Viajes, mantenimientos y documentos', ruta: `/hoja-de-vida/${placa}` });
      }
    });

    (S.conductores || []).forEach((c: any) => {
      const nombre = String(c.nom || c.nombre || '');
      const cedula = String(c.ced || c.cedula || '');
      if (coincide(nombre, cedula)) {
        resultados.push({ tipo: 'Conductor', etiqueta: nombre, subtitulo: c.veh || c.placa || 'Sin vehículo', ruta: '/conductores', queryParams: { buscarCedula: cedula } });
        resultados.push({ tipo: 'Agenda', etiqueta: `Agenda de ${nombre}`, subtitulo: 'Sus viajes y descansos', ruta: `/agenda/${nombre}` });
      }
    });

    (S.rutas || []).forEach((r: any) => {
      const cod = String(r.cod || r.codigo || '');
      const destino = String(r.dest || r.destino || '');
      const clientes = String(r.clientes || '');
      if (coincide(cod, destino, clientes)) {
        resultados.push({ tipo: 'Ruta', etiqueta: cod, subtitulo: clientes ? `${destino} — ${clientes}` : destino, ruta: '/rutas', queryParams: { buscarCod: cod } });
      }
    });

    (S.novedades || []).forEach((n: any) => {
      const titulo = String(n.titulo || '');
      if (coincide(titulo, n.desc || n.descripcion)) {
        resultados.push({ tipo: 'Novedad', etiqueta: titulo || 'Sin título', subtitulo: n.tipo || (n.resuelta ? 'Resuelta' : 'Pendiente'), ruta: '/dashboard' });
      }
    });

    // Pantallas de la app (ej. "config" encuentra Configuración). Si ya
    // estás en esa pantalla, dice "Ya estás aquí".
    const rutaActual = this.router.url.split(/[?#]/)[0];
    this.paginasBuscables
      .filter(p => this.paginaPermitida(p.ruta))
      .filter(p => coincide(p.nombre))
      .forEach(p => {
        const actual = rutaActual === p.ruta || rutaActual.startsWith(p.ruta + '/');
        resultados.push({ tipo: 'Página', etiqueta: p.nombre, subtitulo: actual ? 'Ya estás aquí' : 'Ir a la pantalla', ruta: p.ruta, actual });
      });

    // Máximo 10: más que eso deja de ser un vistazo rápido.
    this.resultadosBusqueda = resultados.slice(0, 10);
    this.mostrandoResultadosBusqueda = true;
  }

  /** Flechas, Enter y Esc dentro del buscador. */
  public teclaBusqueda(evento: KeyboardEvent): void {
    const n = this.resultadosBusqueda.length;
    if (evento.key === 'ArrowDown' && n) { evento.preventDefault(); this.resultadoActivo = (this.resultadoActivo + 1) % n; }
    else if (evento.key === 'ArrowUp' && n) { evento.preventDefault(); this.resultadoActivo = (this.resultadoActivo - 1 + n) % n; }
    else if (evento.key === 'Enter' && n) { evento.preventDefault(); this.irAResultadoBusqueda(this.resultadosBusqueda[Math.min(this.resultadoActivo, n - 1)]); }
    else if (evento.key === 'Escape') {
      this.busquedaGlobal = '';
      this.resultadosBusqueda = [];
      this.mostrandoResultadosBusqueda = false;
      this.inputBusquedaGlobal?.nativeElement.blur();
    }
  }

  public irAResultadoBusqueda(resultado: ResultadoBusqueda): void {
    if (resultado.hacer) resultado.hacer();
    // Ya estás en esa pantalla: solo se cierra el buscador.
    else if (!resultado.actual) {
      this.router.navigate([resultado.ruta], resultado.queryParams ? { queryParams: resultado.queryParams } : {});
    }
    this.busquedaGlobal = '';
    this.resultadosBusqueda = [];
    this.mostrandoResultadosBusqueda = false;
    this.inputBusquedaGlobal?.nativeElement.blur();
  }

  public cerrarResultadosBusqueda(): void {
    // Pequeño retraso — si no, el click en un resultado nunca llega a
    // dispararse (el blur del input cierra la lista ANTES de que el
    // click en el resultado se registre).
    setTimeout(() => { this.mostrandoResultadosBusqueda = false; }, 200);
  }
}