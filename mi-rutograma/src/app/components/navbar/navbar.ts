import { Component, inject, NgZone, ChangeDetectorRef, HostListener, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { UiService } from '../../services/ui.service';
// Reutilizamos la MISMA lógica de conflictos que ya usa el Rutograma —
// nada de reinventar la regla de disponibilidad en un segundo lugar.
// @ts-ignore
import { obtenerDiasViaje, obtenerViajesEnConflicto, reprogramarViajeConflictivo, siguienteNumeroCupo, buscarCupoLibre, reprogramarViajesDesde } from '../rutograma/rutograma.utils.js';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent {

  public authService = inject(AuthService);
  public dataService = inject(DataService);
  private router = inject(Router);

  // El Rutograma (y por lo tanto "+ Viaje Extra") solo usa placas Viajero
  // y Tercero — las Urbano (entregas locales) no deben poder elegirse
  // aquí.
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
  public async deshacerUltimoCambio(): Promise<void> {
    const resultado = await this.dataService.deshacerUltimoCambio();
    this.ui.mostrarToast(resultado.mensaje, resultado.ok ? 'ok' : 'err');
    this.zone.run(() => this.cdr.detectChanges());
  }

  public async rehacerUltimoCambio(): Promise<void> {
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

    const ruta = S?.rutas?.find((r: any) => r.cod === this.nuevoViaje.ruta);
    if (!ruta) {
      this.ui.mostrarToast('Esa ruta no existe.', 'err');
      return;
    }

    const vehiculo = S?.vehiculos?.find((v: any) => v.p === this.nuevoViaje.placa);
    if (vehiculo && String(vehiculo.est || vehiculo.estado || '').toLowerCase().includes('mant')) {
      // No basta con que el vehículo esté marcado "Mantenimiento" — hay
      // que revisar si la fecha del viaje que se está agregando cae
      // DENTRO del rango real (mantInicio/mantFin). Si el viaje es para
      // después de que termine el mantenimiento, sí se puede agregar.
      // El ÚLTIMO día (mantFin) también se permite a propósito — el
      // vehículo vuelve a operar ese mismo día, así que no tiene sentido
      // bloquearlo justo cuando ya está saliendo del taller.
      const fechaViajeStr = this.nuevoViaje.fecha; // "YYYY-MM-DD"
      const dentroDelRango =
        vehiculo.mantInicio && vehiculo.mantFin &&
        fechaViajeStr >= vehiculo.mantInicio && fechaViajeStr < vehiculo.mantFin;

      // Si no hay mantInicio/mantFin guardados (dato viejo), se mantiene
      // el bloqueo por seguridad — no hay forma de saber si esa fecha cae
      // dentro o fuera del rango.
      if (dentroDelRango || !vehiculo.mantInicio || !vehiculo.mantFin) {
        this.ui.mostrarToast(`${this.nuevoViaje.placa} todavía no vuelve de mantenimiento (sale el ${vehiculo.mantFin || '?'}) — no se le puede asignar este viaje hasta esa fecha.`, 'err');
        return;
      }
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
  public resultadosBusqueda: Array<{ tipo: string; etiqueta: string; subtitulo: string; ruta: string; queryParams?: any; actual?: boolean }> = [];
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
    { nombre: 'Sesiones', ruta: '/sesiones' },
    { nombre: 'Administrador', ruta: '/admin' }
  ];

  // Referencia al <input> real, para poder enfocarlo con el atajo de
  // teclado sin importar en qué parte de la pantalla esté el usuario.
  @ViewChild('inputBusquedaGlobal') inputBusquedaGlobal?: ElementRef<HTMLInputElement>;

  @HostListener('window:keydown', ['$event'])
  public atajoBusquedaGlobal(evento: KeyboardEvent): void {
    // Ctrl+K en Windows/Linux, Cmd+K en Mac.
    if ((evento.ctrlKey || evento.metaKey) && evento.key.toLowerCase() === 'k') {
      evento.preventDefault(); // algunos navegadores usan Ctrl+K para su propia barra de direcciones
      this.inputBusquedaGlobal?.nativeElement.focus();
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

  public buscarGlobal(): void {
    const q = this.busquedaGlobal.trim().toLowerCase();
    if (!q) {
      this.resultadosBusqueda = [];
      this.mostrandoResultadosBusqueda = false;
      return;
    }

    const S = this.dataService.S;
    const resultados: Array<{ tipo: string; etiqueta: string; subtitulo: string; ruta: string; queryParams?: any; actual?: boolean }> = [];

    (S.vehiculos || []).forEach((v: any) => {
      const placa = String(v.p || v.placa || '');
      const conductor = String(v.cond || v.conductor || '');
      if (placa.toLowerCase().includes(q) || conductor.toLowerCase().includes(q)) {
        resultados.push({
          tipo: 'Vehículo',
          etiqueta: placa,
          subtitulo: conductor || 'Sin asignar',
          ruta: '/vehiculos',
          queryParams: { buscarPlaca: placa }
        });
      }
    });

    (S.conductores || []).forEach((c: any) => {
      const nombre = String(c.nom || c.nombre || '');
      const cedula = String(c.ced || c.cedula || '');
      if (nombre.toLowerCase().includes(q) || cedula.includes(q)) {
        resultados.push({
          tipo: 'Conductor',
          etiqueta: nombre,
          subtitulo: c.veh || c.placa || 'Sin vehículo',
          ruta: '/conductores',
          queryParams: { buscarCedula: cedula }
        });
      }
    });

    (S.rutas || []).forEach((r: any) => {
      const cod = String(r.cod || r.codigo || '');
      const destino = String(r.dest || r.destino || '');
      const clientes = String(r.clientes || '');
      if (cod.toLowerCase().includes(q) || destino.toLowerCase().includes(q) || clientes.toLowerCase().includes(q)) {
        resultados.push({
          tipo: 'Ruta',
          etiqueta: cod,
          subtitulo: clientes ? `${destino} — ${clientes}` : destino,
          ruta: '/rutas',
          queryParams: { buscarCod: cod }
        });
      }
    });

    (S.novedades || []).forEach((n: any) => {
      const titulo = String(n.titulo || '');
      const desc = String(n.desc || n.descripcion || '');
      if (titulo.toLowerCase().includes(q) || desc.toLowerCase().includes(q)) {
        resultados.push({
          tipo: 'Novedad',
          etiqueta: titulo || 'Sin título',
          subtitulo: n.tipo || (n.resuelta ? 'Resuelta' : 'Pendiente'),
          ruta: '/dashboard'
        });
      }
    });

    // Páginas de la app — para saltar directo escribiendo el nombre de
    // la pantalla (ej. "config" encuentra Configuración).
    // Sin tildes, para que "vehiculos" también encuentre "Vehículos".
    // Si ya estás en esa pantalla, se muestra "Ya estás aquí" en vez de
    // ofrecer ir a donde ya estás.
    const sinTildes = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const qSinTildes = sinTildes(q);
    const rutaActual = this.router.url.split(/[?#]/)[0];
    this.paginasBuscables
      .filter(p => sinTildes(p.nombre).includes(qSinTildes))
      .forEach(p => {
        const actual = rutaActual === p.ruta || rutaActual.startsWith(p.ruta + '/');
        resultados.push({
          tipo: 'Página',
          etiqueta: p.nombre,
          subtitulo: actual ? 'Ya estás aquí' : 'Ir a la pantalla',
          ruta: p.ruta,
          actual
        });
      });

    // Máximo 8 resultados — una lista más larga que eso deja de ser
    // "un vistazo rápido" y empieza a estorbar.
    this.resultadosBusqueda = resultados.slice(0, 8);
    this.mostrandoResultadosBusqueda = true;
  }

  public irAResultadoBusqueda(resultado: { ruta: string; queryParams?: any; actual?: boolean }): void {
    // Ya estás en esa pantalla: solo se cierra el buscador.
    if (!resultado.actual) {
      this.router.navigate([resultado.ruta], resultado.queryParams ? { queryParams: resultado.queryParams } : {});
    }
    this.busquedaGlobal = '';
    this.resultadosBusqueda = [];
    this.mostrandoResultadosBusqueda = false;
  }

  public cerrarResultadosBusqueda(): void {
    // Pequeño retraso — si no, el click en un resultado nunca llega a
    // dispararse (el blur del input cierra la lista ANTES de que el
    // click en el resultado se registre).
    setTimeout(() => { this.mostrandoResultadosBusqueda = false; }, 200);
  }
}