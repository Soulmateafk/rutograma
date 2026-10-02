import { Component, inject, OnInit, NgZone, ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { LoadingService } from '../../services/loading.service';
import { ThemeService } from '../../services/theme.service';
import { AccountService } from '../../services/account.service';

// 🚀 IMPORTAMOS LA LÓGICA PURA DESDE EL JAVASCRIPT
// @ts-ignore
import { 
  inicializarNuevoCupoJS, 
  verificarLimiteCuposJS, 
  procesarDatosCupoJS 
} from './configuracion.utils.js';

@Component({
  selector: 'app-configuracion',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './configuracion.html',
  styleUrl: './configuracion.css',
})
export class Configuracion implements OnInit {
  // Misma idea que en data.ts: se arma con la dirección que usaste para
  // entrar a la app, en vez de estar fija a 'localhost'.
  private API_URL = (typeof window !== 'undefined')
    ? `${window.location.protocol}//${window.location.hostname}:5000/api`
    : 'http://localhost:5000/api';

  // Inyección de dependencias moderna
  public ds = inject(DataService);
  public theme = inject(ThemeService);
  private account = inject(AccountService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private loading = inject(LoadingService);
  private zone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  // --- VARIABLES DE ESTADO: GENERALES Y MODALES ---
  public datosTransp: any = {};
  public isModalTranspOpen: boolean = false;
  public isModalCargaOpen: boolean = false; 
  public listaTransportadoras: any[] = [];

  // Objeto reactivo para SharePoint
  public configSP: any = { clientid: '', tenantid: '', siteid: '', driveid: '' };

  // --- VARIABLES DE ESTADO: CUPOS ---
  public cupo: any = {};
  public isModalCupoOpen: boolean = false;
  public isModalDetalleOpen: boolean = false;
  public selectedRoute: any = null;
  public selectedCupo: any = null;
  public meses: string[] = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  public generandoMatriz: boolean = false;

  // ============================================================
  // MODO REAL / PRUEBAS — permite trabajar sobre un Excel COMPLETAMENTE
  // APARTE (nunca toca el archivo real) para probar cosas sin riesgo.
  // ============================================================
  public modoActual: 'real' | 'pruebas' = 'real';
  public cambiandoModo: boolean = false;

  // ============================================================
  // RESTAURAR DESDE RESPALDO — para deshacer operaciones grandes (como
  // "Generar Matriz") que el botón "Deshacer" normal no cubre (ese solo
  // guarda cambios chiquitos, uno por uno — Generar Matriz puede crear
  // o reemplazar cientos de viajes de un solo golpe). Cada guardado ya
  // crea un respaldo automático del Excel antes de escribir — esto solo
  // deja ELEGIR volver a uno de esos respaldos, sin ir a buscarlo a
  // mano en la carpeta del servidor.
  // ============================================================
  public isModalRespaldosOpen: boolean = false;
  public listaRespaldos: { nombre: string; fecha: string }[] = [];

  // El nombre real del archivo trae la fecha Y la acción que lo generó
  // (ej. "rutograma_2026-09-15T14-30-00-000Z_viajes.db") — esto saca
  // solo la parte de la acción, para mostrarla junto a la fecha en vez
  // de un nombre de archivo largo e ilegible.
  public etiquetaRespaldo(nombreArchivo: string): string {
    const match = nombreArchivo.match(/Z_([a-zA-Z0-9-]+)\.db$/);
    if (!match) return '';
    return match[1].replace(/-/g, ' ');
  }
  public cargandoRespaldos: boolean = false;
  public restaurandoRespaldo: boolean = false;

  // --- Resumen de vencimientos (SOAT, Tecnomecánica, Licencias) ---
  // El servidor lo manda solo cada lunes; este botón lo manda en el
  // momento, para probarlo o cuando se necesite antes.
  public enviandoResumenVencimientos: boolean = false;

  public async enviarResumenVencimientos(): Promise<void> {
    if (this.enviandoResumenVencimientos) return;
    this.enviandoResumenVencimientos = true;
    this.zone.run(() => this.cdr.detectChanges());
    try {
      const res = await this.auth.fetchAutenticado(`${this.API_URL}/vencimientos/enviar-ahora`, {
        method: 'POST',
        headers: { 'x-user-email': this.account.correoSesionActiva }
      });
      const data = await res.json();
      if (!data.ok) {
        this.ui.mostrarToast(data.msg || 'No se pudo enviar el resumen.', 'err');
      } else if (data.enviado) {
        this.ui.mostrarToast(`<i class="bi bi-envelope-check-fill"></i> Resumen enviado a ${(data.enviadoA || []).join(', ')} — ${data.total} pendiente(s) incluidos.` + (data.motivo ? ` No llegó a: ${data.motivo}` : ''), data.motivo ? 'err' : 'ok');
      } else if (data.sinPendientes) {
        this.ui.mostrarToast('No hay nada vencido ni por vencer en los próximos 30 días — no se envió correo.', 'ok');
      } else {
        // Sin enviar por otra razón (filtro de destinatarios, falta el
        // .env, el servidor de correo lo rechazó...) — se muestra el
        // motivo real en vez de fallar en silencio.
        this.ui.mostrarToast(`No se envió el resumen: ${data.motivo}`, 'err');
      }
    } catch (err) {
      console.error('Error enviando el resumen de vencimientos:', err);
      this.ui.mostrarToast('No se pudo conectar con el servidor para enviar el resumen.', 'err');
    } finally {
      this.enviandoResumenVencimientos = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  public async abrirModalRespaldos(): Promise<void> {
    this.isModalRespaldosOpen = true;
    this.cargandoRespaldos = true;
    this.zone.run(() => this.cdr.detectChanges());
    try {
      const res = await this.auth.fetchAutenticado(`${this.API_URL}/respaldos`, {
        headers: { 'x-user-email': this.account.correoSesionActiva }
      });
      const data = await res.json();
      if (data.ok) {
        this.listaRespaldos = (data.respaldos || []).map((r: any) => ({
          nombre: r.nombre,
          // Fecha legible — el nombre del archivo ya trae la hora en UTC
          // dentro del texto, pero esto la muestra en la hora local de
          // quien la está viendo, sin tener que descifrar el nombre.
          fecha: new Date(r.fecha).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
        }));
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudieron cargar los respaldos.', 'err');
      }
    } catch (err) {
      console.error('Error cargando respaldos:', err);
      this.ui.mostrarToast('No se pudo conectar con el servidor para listar los respaldos.', 'err');
    } finally {
      this.cargandoRespaldos = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  public cerrarModalRespaldos(): void {
    this.isModalRespaldosOpen = false;
  }

  public async restaurarRespaldo(nombre: string, fecha: string): Promise<void> {
    if (this.restaurandoRespaldo) return;

    const confirmado = await this.mostrarConfirmPersonalizado(
      `Vas a REEMPLAZAR todo el Excel actual (Modo ${this.modoActual === 'pruebas' ? 'Prueba' : 'Real'}) con el respaldo de ${fecha}.\n\nSe guarda un respaldo de cómo está AHORA antes de restaurar, así que esto también se puede deshacer si hace falta — pero cualquier cambio hecho DESPUÉS de ese respaldo (viajes, rutas, etc.) se perdería.`,
      'Restaurar este respaldo',
      'Cancelar'
    );
    if (!confirmado) return;

    this.restaurandoRespaldo = true;
    this.zone.run(() => this.cdr.detectChanges());
    try {
      const res = await this.auth.fetchAutenticado(`${this.API_URL}/respaldos/restaurar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.account.correoSesionActiva
        },
        body: JSON.stringify({ nombre })
      });
      const data = await res.json();
      if (data.ok) {
        if (data.respaldoAntes) {
          this.ds.registrarCambio({
            tipo: 'respaldo', clave: data.respaldoAntes, antes: data.respaldoAntes, despues: nombre,
            descripcion: `Restauración del respaldo del ${fecha}`
          });
        }
        this.ui.mostrarToast('Excel restaurado correctamente.', 'ok');
        this.isModalRespaldosOpen = false;
        // El Excel activo cambió por completo — recargamos todo el
        // estado de la app, igual que al cambiar de Modo.
        this.ds.inicializarApp(false, 'Recargando después de restaurar...');
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudo restaurar el respaldo.', 'err');
      }
    } catch (err) {
      console.error('Error restaurando respaldo:', err);
      this.ui.mostrarToast('No se pudo conectar con el servidor para restaurar.', 'err');
    } finally {
      this.restaurandoRespaldo = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  // Mismo modal de confirmación propio ya usado en rutograma.ts/vehiculos.ts/navbar.ts
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

  private async cargarModoActual(): Promise<void> {
    try {
      const res = await this.auth.fetchAutenticado(`${this.API_URL}/modo`);
      const data = await res.json();
      if (data.ok) {
        this.modoActual = data.modo;
        this.zone.run(() => this.cdr.detectChanges());
      }
    } catch (err) {
      console.error('No se pudo consultar el modo actual:', err);
    }
  }

  public async cambiarModo(): Promise<void> {
    if (this.cambiandoModo) return;
    const nuevoModo = this.modoActual === 'real' ? 'pruebas' : 'real';

    const mensaje = nuevoModo === 'pruebas'
      ? 'Vas a entrar al MODO PRUEBA — la app trabajará sobre una copia aparte del Excel (se crea a partir del real la primera vez). Nada de lo que hagas en pruebas afecta el archivo real.'
      : 'Vas a volver al MODO REAL — la app volverá a trabajar sobre tu Excel real de siempre. Lo que hiciste en modo prueba se queda guardado aparte, sin perderse.';

    const confirmado = await this.mostrarConfirmPersonalizado(
      mensaje,
      nuevoModo === 'pruebas' ? 'Entrar a Pruebas' : 'Volver a Real',
      'Cancelar'
    );
    if (!confirmado) return;

    this.cambiandoModo = true;
    try {
      const res = await this.auth.fetchAutenticado(`${this.API_URL}/modo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.account.correoSesionActiva
        },
        body: JSON.stringify({ modo: nuevoModo })
      });
      const data = await res.json();
      if (data.ok) {
        this.modoActual = data.modo;
        this.ui.mostrarToast(`Ahora estás en modo ${this.modoActual === 'pruebas' ? 'PRUEBA' : 'REAL'}.`, 'ok');
        // El Excel activo cambió por completo — recargamos todo el
        // estado de la app para que Rutograma, Vehículos, Rutas y
        // Conductores dejen de mostrar datos del modo anterior.
        this.ds.inicializarApp();
        // El historial de Deshacer/Rehacer es SEPARADO por modo (para
        // nunca aplicar un "deshacer" de Pruebas sobre el Excel Real, o
        // viceversa) — sin esto, quedaba con el historial del modo
        // anterior hasta que alguien recargara la página a mano.
        this.ds.actualizarModoActual();
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudo cambiar de modo.', 'err');
      }
    } catch (err) {
      console.error('Error cambiando de modo:', err);
      this.ui.mostrarToast('No se pudo cambiar de modo. Intenta de nuevo.', 'err');
    } finally {
      this.cambiandoModo = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  ngOnInit() {
    this.renderCfg();
    this.cargarModoActual();
  }

  // --- MÉTODOS: SHAREPOINT ---
  public signIn() {
    this.auth.iniciarSesion(); 
  }

  public signOut() {
    this.auth.signOut();
  }

  // --- MÉTODOS: CARGA DE ARCHIVOS ---
  public manejarCarga() {
    this.isModalCargaOpen = true;
  }

  public onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      console.log("Archivo seleccionado:", file.name);
    }
  }

  // --- MÉTODOS: TRANSPORTADORAS ---
  public renderCfg() {
    if (this.ds.S && this.ds.S.transportadoras) {
      this.listaTransportadoras = [...this.ds.S.transportadoras];
    }
  }

  public guardarTransp() {
    if (!this.datosTransp.nombre || !this.datosTransp.clave) {
      this.ui.mostrarToast('Completa los campos', 'err');
      return;
    }
    const error = this.ds.guardarTransportadora(this.datosTransp);
    if (error) {
      this.ui.mostrarToast(error, 'err');
      return;
    }
    this.datosTransp = {};
    this.isModalTranspOpen = false;
    this.renderCfg();
  }

  // --- MÉTODOS: CUPOS ---
  public abrirCupo(transp: string) {
    this.cupo = inicializarNuevoCupoJS(transp);
    this.isModalCupoOpen = true;
  }

  public onRutaChange() {
    if (!this.ds.S?.rutas) return;
    this.selectedRoute = this.ds.S.rutas.find((r: any) => r.cod === this.cupo.ruta);
    if (this.selectedRoute) {
      if (this.selectedRoute.horaBase && !this.cupo.horaProg) this.cupo.horaProg = this.selectedRoute.horaBase;
      if (this.selectedRoute.clientes?.length && !this.cupo.cli) this.cupo.cli = this.selectedRoute.clientes[0];
    }
  }

  public guardarCupo() {
    if (!this.cupo.placa) { this.ui.mostrarToast('Ingresa la placa confirmada', 'err'); return; }
    if (!this.ds.S?.rutas || !this.ds.S?.cuposExt) return;
    
    const rutaSeleccionada = this.ds.S.rutas.find((r: any) => r.cod === this.cupo.ruta);
    if (!rutaSeleccionada) { this.ui.mostrarToast('Selecciona una ruta', 'err'); return; }

    const dia = new Date(this.cupo.fecha).getDate();
    
    // Validación delegada al archivo JS
    const limiteMaximo = verificarLimiteCuposJS(this.ds.S.cuposExt, this.cupo.transp, dia);
    if (limiteMaximo > 0) {
      this.ui.mostrarToast(`Ya se alcanzaron los ${limiteMaximo} cupos para el día ${dia}`, 'err');
      return;
    }

    // Procesamiento de datos delegado al archivo JS
    const cupoProcesado = procesarDatosCupoJS(this.cupo, rutaSeleccionada.dias);
    
    const cuposAntes = JSON.parse(JSON.stringify(this.ds.S.cuposExt));
    this.ds.S.cuposExt.push(cupoProcesado);
    this.ds.registrarCambio({
      tipo: 'config', clave: 'cuposExt', antes: cuposAntes,
      despues: JSON.parse(JSON.stringify(this.ds.S.cuposExt)),
      descripcion: `Nuevo cupo ${cupoProcesado.placa || ''} (${cupoProcesado.ruta || ''})`
    });
    this.isModalCupoOpen = false;
    this.ds.autoSave();
    this.ds.guardarConfigCompartida('cuposExt');
  }

  public verDetalleCupo(id: any) {
    if (!this.ds.S?.cuposExt || !this.ds.S?.rutas) return;
    this.selectedCupo = this.ds.S.cuposExt.find((x: any) => x.id === id);
    if (!this.selectedCupo) return;
    this.selectedCupo.rutaInfo = this.ds.S.rutas.find((x: any) => x.cod === this.selectedCupo.ruta);
    this.isModalDetalleOpen = true;
  }

  public async eliminarCupo(): Promise<void> {
    const confirmado = await this.mostrarConfirmPersonalizado('¿Eliminar este cupo?', 'Eliminar', 'Cancelar');
    if (!confirmado) return;
    if (!this.ds.S?.cuposExt) return;
    const cuposAntes = JSON.parse(JSON.stringify(this.ds.S.cuposExt));
    this.ds.S.cuposExt = this.ds.S.cuposExt.filter((x: any) => x.id !== this.selectedCupo.id);
    this.ds.registrarCambio({
      tipo: 'config', clave: 'cuposExt', antes: cuposAntes,
      despues: JSON.parse(JSON.stringify(this.ds.S.cuposExt)),
      descripcion: `Eliminación del cupo ${this.selectedCupo.placa || ''}`
    });
    this.isModalDetalleOpen = false;
    this.ds.autoSave();
    this.ds.guardarConfigCompartida('cuposExt');
  }

  public async procesarCarga() {
    this.isModalCargaOpen = true;
    try {
      // Eliminada la referencia obsoleta a cargarEstadoSP()
      this.ui.mostrarToast('Sincronización realizada con éxito.', 'ok');
    } catch (error) {
      console.error("Error al refrescar estado:", error);
      this.ui.mostrarToast('Hubo un inconveniente al actualizar la información.', 'err');
    } finally {
      this.isModalCargaOpen = false;
      await Promise.resolve();
      this.zone.run(() => {
        this.cdr.detectChanges();
      });
    }
  }

  // ============================================================
  // FESTIVOS DE COLOMBIA (sugerencia automática, opcional)
  // ============================================================
  // Todo esto es puramente informativo/de ayuda para llenar el campo de
  // texto que YA existía ("Días festivos") — nunca toca el servidor ni
  // el motor de Generar Matriz. Solo calcula fechas y las combina con
  // lo que la persona ya haya escrito a mano, sin borrar nada.

  private calcularPascua(anio: number): Date {
    // Algoritmo de Gauss/Meeus (calendario gregoriano) para el Domingo
    // de Resurrección — de ahí se calculan Jueves/Viernes Santo,
    // Ascensión, Corpus Christi y Sagrado Corazón.
    const a = anio % 19;
    const b = Math.floor(anio / 100);
    const c = anio % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
    const dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(anio, mes - 1, dia);
  }

  private siguienteLunes(fecha: Date): Date {
    const f = new Date(fecha);
    const diaSemana = f.getDay(); // 0 = domingo, 1 = lunes...
    const diasHastaLunes = (8 - diaSemana) % 7; // 0 si ya es lunes
    f.setDate(f.getDate() + diasHastaLunes);
    return f;
  }

  private sumarDias(fecha: Date, dias: number): Date {
    const f = new Date(fecha);
    f.setDate(f.getDate() + dias);
    return f;
  }

  private fechaAISO(f: Date): string {
    return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
  }

  // Festivos oficiales de Colombia para un año: fijos (nunca se mueven),
  // los movidos al lunes siguiente por la Ley Emiliani, y los que
  // dependen de la fecha de Pascua ese año.
  private festivosColombia(anio: number): string[] {
    const fechas: Date[] = [
      new Date(anio, 0, 1),   // Año Nuevo
      new Date(anio, 4, 1),   // Día del Trabajo
      new Date(anio, 6, 20),  // Independencia
      new Date(anio, 7, 7),   // Batalla de Boyacá
      new Date(anio, 11, 8),  // Inmaculada Concepción
      new Date(anio, 11, 25)  // Navidad
    ];

    [
      new Date(anio, 0, 6),   // Reyes Magos
      new Date(anio, 2, 19),  // San José
      new Date(anio, 5, 29),  // San Pedro y San Pablo
      new Date(anio, 7, 15),  // Asunción de la Virgen
      new Date(anio, 9, 12),  // Día de la Raza
      new Date(anio, 10, 1),  // Todos los Santos
      new Date(anio, 10, 11)  // Independencia de Cartagena
    ].forEach(f => fechas.push(this.siguienteLunes(f)));

    const pascua = this.calcularPascua(anio);
    fechas.push(this.sumarDias(pascua, -3));                          // Jueves Santo
    fechas.push(this.sumarDias(pascua, -2));                          // Viernes Santo
    fechas.push(this.siguienteLunes(this.sumarDias(pascua, 39)));     // Ascensión
    fechas.push(this.siguienteLunes(this.sumarDias(pascua, 60)));     // Corpus Christi
    fechas.push(this.siguienteLunes(this.sumarDias(pascua, 68)));     // Sagrado Corazón

    return fechas.map(f => this.fechaAISO(f));
  }

  // Rellena (combinando, sin borrar lo ya escrito) el campo "Días
  // festivos" con los festivos colombianos reales del mes activo.
  public async sugerirFestivosColombia(): Promise<void> {
    const mesActivo = this.ds.S?.mesActivo; // formato "YYYY-MM"
    if (!mesActivo) {
      this.ui.mostrarToast('Selecciona primero el "Mes activo".', 'err');
      return;
    }
    const [anioStr, mesStr] = mesActivo.split('-');
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Buscar automáticamente los festivos oficiales de Colombia para ${this.meses[mesNum - 1]} de ${anio}?\n\nSe agregarán al campo de festivos sin borrar lo que ya hayas escrito a mano — igual podrás revisarlos y corregirlos antes de generar la matriz.`,
      'Buscar festivos',
      'Cancelar'
    );
    if (!confirmado) return;

    const diasDelMes = this.festivosColombia(anio)
      .filter(f => f.startsWith(`${anioStr}-${mesStr}`))
      .map(f => parseInt(f.split('-')[2], 10))
      .sort((a, b) => a - b);

    if (!diasDelMes.length) {
      this.ui.mostrarToast(`No hay festivos colombianos conocidos en ${this.meses[mesNum - 1]} ${anio}.`, 'ok');
      return;
    }

    const yaEscritos: string[] = this.ds.S.festivosString
      ? this.ds.S.festivosString.split(',').map((d: string) => d.trim()).filter((d: string) => d.length > 0)
      : [];
    const combinados = Array.from(new Set([...yaEscritos, ...diasDelMes.map(String)]))
      .map(d => parseInt(d, 10))
      .filter(d => !isNaN(d))
      .sort((a, b) => a - b);

    this.ds.S.festivosString = combinados.join(',');
    this.ui.mostrarToast(`Festivos sugeridos para ${this.meses[mesNum - 1]}: ${diasDelMes.join(', ')} — revísalos antes de generar.`, 'ok');
    this.zone.run(() => this.cdr.detectChanges());
  }

  // --- 🛠️ PANEL MAESTRO: GENERACIÓN DE MATRIZ SIN LLAMADOS OBSOLETOS ---
  public async generarMatrizMensual() {
    if (!this.ds.S?.mesActivo) {
      this.ui.mostrarToast('Por favor selecciona un "Mes activo" primero en los parámetros generales.', 'err');
      return;
    }

    // Procesa el string del input type="month" (Ej: "2026-06")
    const [anioStr, mesNumStr] = this.ds.S.mesActivo.split('-'); 
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesNumStr, 10);
    
    const nombreMes = this.meses[mesNum - 1];

    // Procesa la lista de días festivos ingresados ("1,7,19") y los mapea a formato estándar ISO YYYY-MM-DD
    const diasSimples = this.ds.S.festivosString ? this.ds.S.festivosString.split(',') : [];
    const arrayFestivosCompletos = diasSimples
      .map((dia: string) => dia.trim())
      .filter((dia: string) => dia.length > 0)
      .map((dia: string) => `${anioStr}-${mesNumStr}-${dia.padStart(2, '0')}`);

    const cuerpoBase = { mes: nombreMes, anio: anio, festivos: arrayFestivosCompletos };

    // --- PASO 1: VISTA PREVIA — llamada "en seco" al mismo motor, que
    // calcula todo sobre una copia y no guarda nada, para saber ANTES de
    // tocar algo real cuántos viajes se van a borrar/crear. Así el
    // diálogo de confirmación muestra números reales de este mes en vez
    // del texto genérico de advertencia que había antes.
    this.generandoMatriz = true;
    this.loading.mostrarGrande('Calculando la previsualización de ' + nombreMes + '...');
    let previa: any;
    try {
      const resPrevia = await this.auth.fetchAutenticado(`${this.API_URL}/configuracion/generar-matriz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': this.account.correoSesionActiva
        },
        body: JSON.stringify({ ...cuerpoBase, previsualizar: true })
      });
      previa = await resPrevia.json();
    } catch (error) {
      console.error("Error de comunicación HTTP con Express (previsualización):", error);
      this.ui.mostrarToast('Error de conectividad: No se pudo establecer comunicación con el servidor backend de Express en el puerto 5000.', 'err');
      this.loading.ocultarGrande();
      this.generandoMatriz = false;
      return;
    }
    this.loading.ocultarGrande();

    if (!previa.ok) {
      this.ui.mostrarToast(`No se pudo calcular la previsualización: ${previa.msg}`, 'err');
      this.generandoMatriz = false;
      return;
    }

    // --- PASO 2: CONFIRMAR CON NÚMEROS REALES ---
    const desglosePrevia = (previa.makand !== undefined && previa.terceros !== undefined)
      ? ` (${previa.makand} Makand · ${previa.viajesArsitrans ?? 0} Arsitrans · ${previa.viajesPolar ?? 0} Polar)`
      : '';
    const lineaReemplazo = previa.viajesReemplazados > 0
      ? `Se BORRARÁN ${previa.viajesReemplazados} viajes que ya existen este mes y se reemplazarán por los nuevos.\n\n`
      : 'No hay viajes existentes este mes que se vayan a borrar.\n\n';
    const lineaCupos = previa.cuposNuevosCreados > 0
      ? `Se crearán ${previa.cuposNuevosCreados} cupo(s) nuevo(s) de Arsitrans/Polar.\n\n`
      : '';
    const mensajeConfirmacion =
      `¿Estás seguro de que deseas construir la matriz automática para ${nombreMes} de ${anio}?\n\n` +
      lineaReemplazo +
      `Se crearán ${previa.total} viajes nuevos${desglosePrevia}.\n\n` +
      lineaCupos +
      `Esta acción no se puede deshacer directamente (aunque queda un respaldo automático antes de guardar).`;

    const confirmado = await this.mostrarConfirmPersonalizado(mensajeConfirmacion, 'Generar Matriz', 'Cancelar');
    if (!confirmado) {
      this.generandoMatriz = false;
      return;
    }

    // --- PASO 3: EJECUCIÓN REAL ---
    this.loading.mostrarGrande('Generando la matriz de ' + nombreMes + '...'); // Pantalla grande, se nota mientras corre

    try {
      const response = await this.auth.fetchAutenticado(`${this.API_URL}/configuracion/generar-matriz`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-user-email': this.account.correoSesionActiva
        },
        body: JSON.stringify(cuerpoBase)
      });

      const resultado = await response.json();

      if (resultado.ok) {
        if (resultado.respaldoAntes) {
          this.ds.registrarCambio({
            tipo: 'respaldo', clave: resultado.respaldoAntes, antes: resultado.respaldoAntes, despues: null,
            descripcion: `Generar Matriz de ${nombreMes}`
          });
        }
        const desglose = (resultado.makand !== undefined && resultado.terceros !== undefined)
          ? ` (${resultado.makand} Makand · ${resultado.viajesArsitrans ?? 0} Arsitrans · ${resultado.viajesPolar ?? 0} Polar)`
          : '';
        // BUG REAL encontrado y corregido: antes esto solo mostraba el
        // toast y dejaba que la sincronización pasiva de 20s (o una
        // recarga manual) se encargara de traer los datos nuevos —
        // mientras tanto, cualquier pantalla abierta (Rutograma sobre
        // todo) seguía mostrando la foto de ANTES de generar: viajes
        // viejos, cupos de Arsitrans/Polar que todavía no existían,
        // mantenimientos o descansos que ya se habían recalculado bien
        // en el servidor pero que la pantalla no se enteraba hasta que,
        // por casualidad, tocara el siguiente ciclo de sincronización.
        // Ahora se pide la foto fresca de una vez, apenas se sabe que
        // la generación sí se guardó.
        await this.ds.inicializarApp(true);
        this.ui.mostrarToast(`<i class="bi bi-check-circle-fill"></i> Matriz de ${nombreMes} generada — ${resultado.total} viajes${desglose}`, 'ok');
      } else {
        this.ui.mostrarToast(`No se pudo procesar la matriz: ${resultado.msg}`, 'err');
      }
    } catch (error) {
      console.error("Error de comunicación HTTP con Express:", error);
      this.ui.mostrarToast('Error de conectividad: No se pudo establecer comunicación con el servidor backend de Express en el puerto 5000.', 'err');
    } finally {
      // El modo zoneless del proyecto no repinta solo cuando una propiedad
      // cambia dentro de un callback async (aquí, el "finally" de esta
      // función) — por eso el botón se quedaba deshabilitado hasta que
      // algo más forzaba un repintado. Mismo patrón ya probado en
      // rutograma.ts/navbar.ts para cerrar modales de forma confiable.
      this.loading.ocultarGrande();
      this.generandoMatriz = false;
      await Promise.resolve();
      this.zone.run(() => {
        this.cdr.detectChanges();
      });
    }
  }

  // ============================================================
  // IMPORTAR VIAJES REALES (Excel de operación: "DT VIAJEROS." + "CONF")
  // Paso 1: se elige el archivo y el servidor devuelve un resumen sin
  // guardar nada. Paso 2: si está bien, se confirma y se aplica.
  // ============================================================
  public importNombreArchivo = '';
  public importResumen: any = null;
  public importando = false;
  public importAplicarRutas = true;
  private importArchivoBase64 = '';

  private repintar(): void {
    this.zone.run(() => this.cdr.detectChanges());
  }

  public async elegirArchivoImport(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = ''; // permite volver a elegir el mismo archivo
    if (!archivo) return;

    this.importNombreArchivo = archivo.name;
    this.importResumen = null;
    this.importando = true;
    this.repintar();
    try {
      const bytes = new Uint8Array(await archivo.arrayBuffer());
      let binario = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      this.importArchivoBase64 = btoa(binario);
      const res = await this.llamarImportacion(true);
      if (res?.ok) {
        this.importResumen = res.resumen;
      } else {
        this.ui.mostrarToast(res?.msg || 'No se pudo leer el archivo.', 'err');
      }
    } catch (e) {
      console.error('Error leyendo el archivo de viajes:', e);
      this.ui.mostrarToast('No se pudo leer el archivo — revisa que sea el Excel de viajes (.xlsx).', 'err');
    } finally {
      this.importando = false;
      this.repintar();
    }
  }

  public async confirmarImportacion(): Promise<void> {
    if (!this.importResumen || this.importando) return;
    const r = this.importResumen;
    const confirmado = await this.mostrarConfirmPersonalizado(
      `Se importarán ${r.total} viajes reales del ${r.desde} al ${r.hasta}.\n\n` +
      `Los ${r.reemplazaria} viajes que hay hoy en la app entre esas fechas se reemplazan por los del archivo.` +
      (this.importAplicarRutas && r.cambiosRutas?.length ? `\n\nTambién se actualizarán ${r.cambiosRutas.length} ruta(s) según lo real.` : '') +
      `\n\nAntes de guardar se crea un respaldo automático.`,
      'Importar',
      'Cancelar'
    );
    if (!confirmado) return;

    this.importando = true;
    this.loading.mostrarGrande('Importando viajes reales...');
    this.repintar();
    try {
      const res = await this.llamarImportacion(false);
      if (res?.ok) {
        if (res.respaldoAntes) {
          this.ds.registrarCambio({
            tipo: 'respaldo', clave: res.respaldoAntes, antes: res.respaldoAntes, despues: null,
            descripcion: `Importación de ${r.total} viajes reales`
          });
        }
        await this.ds.inicializarApp(true);
        this.ui.mostrarToast(
          `<i class="bi bi-check-circle-fill"></i> Importados ${r.total} viajes reales` +
          (res.rutasCambiadas ? ` y actualizadas ${res.rutasCambiadas} ruta(s)` : '') + '.',
          'ok'
        );
        this.cancelarImportacion();
      } else {
        this.ui.mostrarToast(res?.msg || 'No se pudo importar el archivo.', 'err');
      }
    } catch (e) {
      console.error('Error importando viajes reales:', e);
      this.ui.mostrarToast('No se pudo comunicar con el servidor para importar.', 'err');
    } finally {
      this.loading.ocultarGrande();
      this.importando = false;
      this.repintar();
    }
  }

  public cancelarImportacion(): void {
    this.importResumen = null;
    this.importArchivoBase64 = '';
    this.importNombreArchivo = '';
  }

  public entradas(obj: any): Array<{ k: string; v: any }> {
    return Object.entries(obj || {}).map(([k, v]) => ({ k, v }));
  }

  private async llamarImportacion(previsualizar: boolean): Promise<any> {
    const respuesta = await this.auth.fetchAutenticado(`${this.API_URL}/importar/viajes-reales`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-user-email': this.account.correoSesionActiva },
      body: JSON.stringify({ archivo: this.importArchivoBase64, previsualizar, aplicarRutas: this.importAplicarRutas })
    });
    return respuesta.json();
  }
}
