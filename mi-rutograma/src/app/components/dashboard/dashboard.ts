import { VacioComponent } from '../comunes/vacio';
import { EsqueletoComponent } from '../comunes/esqueleto';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, HostListener } from '@angular/core';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Configuracion } from '../../components/configuracion/configuracion';
import { FotoNovedadComponent } from '../foto-novedad/foto-novedad';
import { agruparViajes, obtenerDiasViaje } from '../../components/rutograma/rutograma.utils.js';
import { AuthService } from '../../services/auth.service';

import { CapacidadSemanaComponent } from '../analisis/analisis';
import { ContarDirective } from '../../directivas/contar';
import { ThemeService } from '../../services/theme.service';
import { SonidoService } from '../../services/sonido.service';
import { inject } from '@angular/core';
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [VacioComponent, EsqueletoComponent, CommonModule, FormsModule, ContarDirective, Configuracion, FotoNovedadComponent, CapacidadSemanaComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class Dashboard implements OnInit, OnDestroy {
  // ============================================================
  // DASHBOARD ARMABLE: cada cuenta escoge qué cuadros ve y en qué orden
  // (se guarda en su Apariencia, en el servidor).
  // ============================================================
  private theme = inject(ThemeService);
  private sonido = inject(SonidoService);
  public static readonly BLOQUES = ['kpis', 'alertas', 'capacidad', 'semanal', 'salidas'];
  public armando = false;
  public bloqueMoviendo = '';
  public bloqueSobre = '';
  private get orden(): string[] {
    const guardado = this.theme.ap.tablero.orden.filter(b => Dashboard.BLOQUES.includes(b));
    return [...guardado, ...Dashboard.BLOQUES.filter(b => !guardado.includes(b))];
  }
  public ordenDe(b: string): number { return this.orden.indexOf(b); }
  public oculto(b: string): boolean { return this.theme.ap.tablero.ocultos.includes(b); }
  public alternarArmado(): void { this.armando = !this.armando; this.sonido.tocar(this.armando ? 'abrir' : 'ok'); }
  private guardarTablero(orden: string[], ocultos: string[]): void { this.theme.ponerTablero(orden, ocultos); this.cdr.detectChanges(); }
  public moverBloque(b: string, paso: number): void {
    const o = this.orden, i = o.indexOf(b), j = i + paso;
    if (j < 0 || j >= o.length) return;
    [o[i], o[j]] = [o[j], o[i]];
    this.guardarTablero(o, this.theme.ap.tablero.ocultos);
    this.sonido.tocar('soltar');
  }
  public alternarBloque(b: string): void {
    const ocultos = this.oculto(b) ? this.theme.ap.tablero.ocultos.filter(x => x !== b) : [...this.theme.ap.tablero.ocultos, b];
    this.guardarTablero(this.orden, ocultos);
    this.sonido.tocar('clic');
  }
  public restablecerTablero(): void { this.guardarTablero([], []); this.sonido.tocar('deshacer'); }
  public empezarMover(e: DragEvent, b: string): void {
    if (!this.armando) { e.preventDefault(); return; }
    this.bloqueMoviendo = b;
    e.dataTransfer?.setData('text/plain', b);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }
  public pasarSobre(e: DragEvent, b: string): void {
    if (!this.armando || !this.bloqueMoviendo) return;
    e.preventDefault();
    this.bloqueSobre = b;
  }
  public soltarSobre(e: DragEvent, b: string): void {
    e.preventDefault();
    const desde = this.bloqueMoviendo;
    this.bloqueMoviendo = ''; this.bloqueSobre = '';
    if (!desde || desde === b) return;
    const o = this.orden.filter(x => x !== desde);
    o.splice(o.indexOf(b) + (this.ordenDe(desde) < this.ordenDe(b) ? 1 : 0), 0, desde);
    this.guardarTablero(o, this.theme.ap.tablero.ocultos);
    this.sonido.tocar('soltar');
  }

  public S: any;
  public DIA: number = 0;
  viajes: any[] = [];
  isModalCondOpen: boolean = false;
  idxConductor: number = -1;
  datosConductor: any = { nom: '' };
  viajesMap: any = {};
  listaViajes: any[] = [];

  datosVehiculo: any = { placa: '', cap: 0, kg: 0, m3: 0, cond: '', dc: 0, dm: 1, dl: 2 };
  idxVehiculo: number = -1;
  tituloModalVehiculo: string = '';
  public clientesTexto: string = '';

  isModalVehOpen: boolean = false;
  nuevoViaje: any = {
    ruta: '', placa: '', tr: '', cond: '',
    cajas: 0, pesoKg: 0, volM3: 0, prod: 'frescos',
    cli: '', cli2: '', tipo: '', prioridad: 'normal',
    estado: 'programado', horaDespacho: '', manif: '', obs: '',
    cajas2: 0, split: false, splitRazon: '',
    fecha: ''
  };

  datosNovedad: any = { tipo: '', placa: '', nuevo: '', desc: '', fecha: '' };

  private sumarDias(fecha: any, dias: number): Date {
    const d = new Date(fecha);
    d.setDate(d.getDate() + dias);
    return d;
  }

  // --- VARIABLES DE ESTADO PARA MODALES ---
  isModalViajeOpen: boolean = false;
  isModalNovedadOpen: boolean = false;
  rutaSeleccionada: string = '';
  fechaViaje: string = '';
  fechaNovedad: string = '';
  public seccionActual: string = 'dashboard';
  public isRutogramaOpen: boolean = false;

  // --- KPIs PRINCIPALES DEL DASHBOARD ---
  kDisp: number = 0;
  kAct: number = 0;
  kRuta: number = 0;
  kMant: number = 0;
  kViaj: number = 0;
  kViajMes: number = 0;
  kViajMesAnterior: number = 0;
  kViajMesTendencia: 'up' | 'down' | 'igual' = 'igual';
  kViajMesComparativoTexto: string = '';
  kViajMesComparativoDetalle: string = '';
  kTransportadoraTop: string = '';
  kTransportadoraDesglose: string = '';
  kTransportadoraDetalle: string = '';
  kMantMes: number = 0;
  kMantMesPlacas: string = '';
  kUrg: number = 0;
  kAlm: number = 0;
  kDoble: number = 0;
  kSplit: number = 0;
  kTotalesActivos: number = 0;
  kEntregados: number = 0;
  kExt: string = '0 extras';
  kAlmSub: string = '';
  kAlmacenesTotal: number = 0;
  kAlmacenesEntregados: number = 0;
  kAlmacenesEnRuta: number = 0;
  kAlmacenesDobles: number = 0;
  kDobleEntrega: number = 0;
  kSplitCapacidad: number = 0;

  // --- MONITORES Y CONTADORES DE TRANSPORTADORAS HOY ---
  cuposArsi: number = 0;
  cuposPolar: number = 0;
  statsContratados = {
    arsiHoy: 0, arsiTotal: 10,
    polarHoy: 0, polarTotal: 2
  };

  kpiConductores: any[] = [];
  listaConductores: any[] = [];
  alertas: any[] = [];
  alertasCriticasCount: number = 0;
  novedadesRecientes: any[] = [];
  disponibles: any[] = [];
  diasCalendario: number[] = [];
  filasVehiculos: any[] = [];
  listaUrgentes: any[] = [];
  proximosViajes: any[] = [];
  // Filtro de "Próximas salidas" — vacíos, muestra la semana actual (de
  // hoy en adelante) como siempre.
  filtroFechaEspecifica: string = '';
  filtroTransportadora: string = '';

  // --- Calendario propio para el campo de fecha (reemplaza el
  // selector nativo del navegador, que no se puede estilizar) ---
  public calendarioAbierto: 'especifica' | null = null;
  public calendarioMes: number = new Date().getMonth();
  public calendarioAnio: number = new Date().getFullYear();
  public readonly nombresDiaCalendario = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
  public readonly nombresMesCalendario = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  public valorCampoCalendario(campo: 'especifica'): string {
    return this.filtroFechaEspecifica;
  }

  public etiquetaCampoCalendario(campo: 'especifica'): string {
    const valor = this.valorCampoCalendario(campo);
    if (!valor) return 'dd/mm/aaaa';
    const f = new Date(valor + 'T00:00:00');
    return `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
  }

  // Cualquier clic que llegue hasta aquí ya no fue "adentro" del
  // calendario (los clics de adentro paran la propagación) — así que si
  // hay uno abierto, lo cerramos.
  @HostListener('document:click')
  onClickFueraDeCalendario(): void {
    if (this.calendarioAbierto !== null) {
      this.calendarioAbierto = null;
    }
    if (this.calendarioMesAbierto) {
      this.calendarioMesAbierto = false;
    }
  }

  public toggleCalendario(campo: 'especifica'): void {
    if (this.calendarioAbierto === campo) {
      this.calendarioAbierto = null;
      return;
    }
    this.calendarioAbierto = campo;
    const valorActual = this.valorCampoCalendario(campo);
    const fechaBase = valorActual ? new Date(valorActual + 'T00:00:00') : new Date();
    this.calendarioMes = fechaBase.getMonth();
    this.calendarioAnio = fechaBase.getFullYear();
  }

  public cerrarCalendario(): void {
    this.calendarioAbierto = null;
  }

  public cambiarMesCalendario(delta: number): void {
    let m = this.calendarioMes + delta;
    let a = this.calendarioAnio;
    if (m < 0) { m = 11; a--; }
    if (m > 11) { m = 0; a++; }
    this.calendarioMes = m;
    this.calendarioAnio = a;
  }

  // Cuadrícula de 6 semanas (como cualquier calendario normal), incluye
  // los días del mes anterior/siguiente para rellenar, marcados como
  // "esOtroMes" para pintarlos más tenues.
  public diasDelCalendario(): Array<{ dia: number; fechaISO: string; esOtroMes: boolean; esHoy: boolean; esSeleccionado: boolean }> {
    const primerDiaSemana = new Date(this.calendarioAnio, this.calendarioMes, 1).getDay();
    const totalDiasMes = new Date(this.calendarioAnio, this.calendarioMes + 1, 0).getDate();
    const totalDiasMesAnterior = new Date(this.calendarioAnio, this.calendarioMes, 0).getDate();
    const hoyISO = this.aISO(new Date());
    const valorSeleccionado = this.calendarioAbierto ? this.valorCampoCalendario(this.calendarioAbierto) : '';

    const celdas: Array<{ dia: number; fechaISO: string; esOtroMes: boolean; esHoy: boolean; esSeleccionado: boolean }> = [];

    // Días del mes anterior, para rellenar antes del día 1
    for (let i = primerDiaSemana - 1; i >= 0; i--) {
      const dia = totalDiasMesAnterior - i;
      let mesAnt = this.calendarioMes - 1, anioAnt = this.calendarioAnio;
      if (mesAnt < 0) { mesAnt = 11; anioAnt--; }
      const fechaISO = this.aISO(new Date(anioAnt, mesAnt, dia));
      celdas.push({ dia, fechaISO, esOtroMes: true, esHoy: fechaISO === hoyISO, esSeleccionado: fechaISO === valorSeleccionado });
    }

    // Días del mes actual
    for (let dia = 1; dia <= totalDiasMes; dia++) {
      const fechaISO = this.aISO(new Date(this.calendarioAnio, this.calendarioMes, dia));
      celdas.push({ dia, fechaISO, esOtroMes: false, esHoy: fechaISO === hoyISO, esSeleccionado: fechaISO === valorSeleccionado });
    }

    // Completar hasta múltiplo de 7 con el mes siguiente
    let diaSig = 1;
    let mesSig = this.calendarioMes + 1, anioSig = this.calendarioAnio;
    if (mesSig > 11) { mesSig = 0; anioSig++; }
    while (celdas.length % 7 !== 0) {
      const fechaISO = this.aISO(new Date(anioSig, mesSig, diaSig));
      celdas.push({ dia: diaSig, fechaISO, esOtroMes: true, esHoy: fechaISO === hoyISO, esSeleccionado: fechaISO === valorSeleccionado });
      diaSig++;
    }

    return celdas;
  }

  public seleccionarDiaCalendario(fechaISO: string): void {
    this.filtroFechaEspecifica = fechaISO;
    this.onFechaEspecificaChange();
    this.calendarioAbierto = null;
  }

  public hoyCalendario(): void {
    this.seleccionarDiaCalendario(this.aISO(new Date()));
  }

  public borrarCampoCalendario(): void {
    this.filtroFechaEspecifica = '';
    this.onFechaEspecificaChange();
    this.calendarioAbierto = null;
  }
  isModalRutaOpen: boolean = false;
  tituloModalRuta: string = '';
  idxRuta: number = -1;
  datosRuta: any = {
    cod: '', dest: '', dest2: '', km: 0, tm: 0, ta: 0, tp: 0,
    dias: 1, desc: 1, min: 100, tipo: 'media', clientes: '',
    dc: [false, false, false, false, false, false, false]
  };

  // --- NUEVAS VARIABLES RUTOGRAMA SEMANAL ---
  diasRutogramaSemana: any[] = [];
  vehiculosActivos: any[] = [];

  private subDataChanged?: Subscription;

  constructor(public ds: DataService, private router: Router, private cdr: ChangeDetectorRef, private auth: AuthService) {}

  async cerrarSesion(): Promise<void> {
    await this.auth.cerrarSesion();
  }

  async resolverNovedad(id: any): Promise<void> {
    await this.ds.resolverNovedad(id);
    this.actualizarDashboard();
  }

  ngOnInit() {
    this.generarSemanaActual(); // Inicializa los días del rutograma
    this.actualizarDashboard(); // Primer cálculo (puede salir vacío si los datos aún no llegan del backend)

    // Cuando los datos REALES lleguen (o cambien por cualquier otra
    // acción), recalculamos. Antes esto solo se calculaba una vez al
    // entrar, por eso quedaba vacío hasta cambiar de página.
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.generarSemanaActual();
      this.actualizarDashboard();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy() {
    this.subDataChanged?.unsubscribe();
  }

  // --- LÓGICA RUTOGRAMA SEMANAL DINÁMICO ---
  // "Hoy" en esta app significa: el día real SOLO si estás viendo el mes
  // actual en el selector; si estás viendo otro mes, es el día 1 de ese
  // mes (exactamente como ya hace ds.getDIA() y esHoy() del Rutograma).
  // Si esto no se respeta, la semana calculada aquí no coincide con el
  // mes/año que realmente tienes seleccionado y aparecen viajes de más.
  generarSemanaActual() {
    const anioReal = new Date().getFullYear();
    const mesReal = new Date().getMonth();
    const esMesReal = this.ds.S.anio === anioReal && this.ds.S.mes === mesReal;

    const diaReferencia = new Date(this.ds.S.anio, this.ds.S.mes, this.ds.getDIA());

    // En JavaScript el domingo es 0. Lo ajustamos para que la semana empiece en Lunes (1)
    const diaSemana = diaReferencia.getDay() === 0 ? 7 : diaReferencia.getDay();

    // Calculamos la fecha del lunes de la semana que contiene a "hoy"
    const lunes = new Date(diaReferencia);
    lunes.setDate(diaReferencia.getDate() - diaSemana + 1);

    const nombresDias = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do'];

    // Generamos un arreglo con los 7 días
    this.diasRutogramaSemana = Array.from({ length: 7 }).map((_, i) => {
      const fecha = new Date(lunes);
      fecha.setDate(lunes.getDate() + i);
      return {
        nombre: nombresDias[i],
        numero: fecha.getDate(),
        fechaCompleta: this.aISO(fecha), // antes: fecha.toISOString().split('T')[0] — corría la fecha por zona horaria
        // Solo se marca la columna azul de "hoy" si de verdad estás en el mes real
        esHoy: esMesReal && fecha.toDateString() === new Date().toDateString()
      };
    });
  }

  public nuevoVehiculo() {
    this.idxVehiculo = -1;
    this.tituloModalVehiculo = 'Nuevo Vehículo';
    this.datosVehiculo = { placa: '', cap: 0, kg: 0, m3: 0, cond: '', dc: 0, dm: 1, dl: 2 };
    this.isModalVehOpen = true;
  }

  // --- GESTIÓN DE MODALES ---
  public abrirModal(id: string) {
    if (id === 'm-viaje') {
      this.nuevoViaje = {
        ruta: '', placa: '', tr: '', cond: '', cajas: 0, pesoKg: 0, volM3: 0, prod: 'frescos',
        cli: '', cli2: '', tipo: '', prioridad: 'normal', estado: 'programado',
        horaDespacho: '', manif: '', obs: '', cajas2: 0, split: false, splitRazon: '',
        fecha: this.aISO(new Date())
      };
      this.isModalViajeOpen = true;
      this.fechaViaje = this.aISO(new Date());
    } else if (id === 'm-novedad') {
      this.isModalNovedadOpen = true;
      this.fechaNovedad = this.aISO(new Date());
    } else if (id === 'm-cond') {
      this.isModalCondOpen = true;
    }
  }

  public cerrarModal(id: string) {
    if (id === 'm-viaje') this.isModalViajeOpen = false;
    if (id === 'm-novedad') this.isModalNovedadOpen = false;
    if (id === 'm-cond') this.isModalCondOpen = false;
  }

  // --- GETTERS Y LÓGICA ---
  get vehiculosDisponibles() {
    return this.ds.S.vehiculos.filter((v: any) => v.est !== 'mantenimiento');
  }

  diasNombres = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // --- Selector de mes propio para "Periodo de gestión" ---
  public calendarioMesAbierto: boolean = false;
  public calendarioMesAnioMostrado: number = new Date().getFullYear();

  public toggleCalendarioMes(): void {
    this.calendarioMesAbierto = !this.calendarioMesAbierto;
    if (this.calendarioMesAbierto) this.calendarioMesAnioMostrado = this.ds.S.anio;
  }

  public cambiarAnioCalendarioMes(delta: number): void {
    this.calendarioMesAnioMostrado += delta;
  }

  public seleccionarMesCalendario(mesIndex: number): void {
    this.cambiarFecha(`${this.calendarioMesAnioMostrado}-${String(mesIndex + 1).padStart(2, '0')}`);
    this.calendarioMesAbierto = false;
  }

  public getFechaFormateada(): string {
    const mm = String(this.ds.S.mes + 1).padStart(2, '0');
    return `${this.ds.S.anio}-${mm}`;
  }

  public cambiarFecha(valor: string) {
    const [anio, mes] = valor.split('-').map(Number);
    this.ds.S.anio = anio;
    this.ds.S.mes = mes - 1;
    this.ds.syncFechas();
    this.ds.autoSave();
    this.actualizarDashboard();
    if (this.isRutogramaOpen) this.renderRuto();
  }

  public renderRuto() {
    console.log("Renderizando rutograma...");
  }

  public irA(ruta: string) {
    this.router.navigate(['/' + ruta]);
  }

  public toggleDia(dia: number) {
    const idx = this.datosRuta.diasSem.indexOf(dia);
    if (idx > -1) {
      this.datosRuta.diasSem.splice(idx, 1);
    } else {
      this.datosRuta.diasSem.push(dia);
    }
  }

  // --- GESTIÓN DE RUTAS Y CONDUCTORES ---
  public eliminarRuta(cod: string) {
    const nv = this.ds.S.viajes.filter((vj: any) => vj.ruta === cod).length;
    const msg = nv > 0 ? `Eliminar la ruta "${cod}"? Tiene ${nv} viaje(s).` : `Eliminar la ruta "${cod}"?`;
    if (confirm(msg)) {
      this.ds.S.rutas = this.ds.S.rutas.filter((r: any) => r.cod !== cod);
      this.actualizarDashboard();
    }
  }

  public editarVehiculo(i: number) {
    const v = this.ds.S.vehiculos[i];
    this.idxVehiculo = i;
    this.tituloModalVehiculo = 'Editar Vehículo — ' + v.p;
    this.datosVehiculo = {
      placa: v.p, tipo: v.t, cap: v.cap, kg: v.kg || '', m3: v.m3 || '',
      cond: v.cond, transp: v.tr, est: v.est, mantDias: v.mantDias || '',
      dc: (v.dc && v.dc.c !== undefined) ? v.dc.c : 0,
      dm: (v.dc && v.dc.m !== undefined) ? v.dc.m : 1,
      dl: (v.dc && v.dc.l !== undefined) ? v.dc.l : 2
    };
    this.isModalVehOpen = true;
  }

  public editarRuta(cod: string) {
    const r = this.ds.S.rutas.find((x: any) => x.cod === cod);
    if (!r) { console.error('Ruta no encontrada'); return; }
    this.idxRuta = this.ds.S.rutas.indexOf(r);
    this.tituloModalRuta = 'Editar Ruta — ' + cod;
    this.datosRuta = { ...r };
    this.clientesTexto = (this.datosRuta.clientes && this.datosRuta.clientes.length) ? this.datosRuta.clientes.join('\n') : '';
    if (!this.datosRuta.diasSem) this.datosRuta.diasSem = [];
    if (!this.datosRuta.horasXDia) this.datosRuta.horasXDia = {};
    this.isModalRutaOpen = true;
  }

  public editarCond(i: number) {
    this.idxConductor = i;
    this.datosConductor = { ...this.ds.S.conductores[i] };
    this.isModalCondOpen = true;
  }

  public async eliminarCond(i: number): Promise<void> {
    if (confirm('¿Estás seguro de eliminar este conductor?')) {
      await this.ds.eliminarConductor(i);
      this.actualizarDashboard();
    }
  }

  public async guardarCond(): Promise<void> {
    const error = await this.ds.guardarConductorValidado(this.datosConductor, this.idxConductor);
    if (error) { alert(error); return; }
    this.isModalCondOpen = false;
    this.actualizarDashboard();
  }

  public async guardarNovedad(): Promise<void> {
    const { tipo, placa, nuevo, desc, fecha } = this.datosNovedad;
    const idx = this.ds.S.vehiculos.findIndex((v: any) => v.p === placa);
    
    if (idx >= 0) {
      if (tipo === 'cambio_conductor') {
        this.ds.S.vehiculos[idx].cond = nuevo || this.ds.S.vehiculos[idx].cond;
      }
      if (tipo === 'mantenimiento') {
        this.ds.S.vehiculos[idx].est = 'mantenimiento';
      }
      if (tipo === 'confirmar_placa' && nuevo) {
        const diaConf = fecha ? parseInt(fecha.split('-')[2]) : this.ds.getDIA();
        this.ds.S.viajes.filter((v: any) => v.placa === placa && v.dia === diaConf)
          .forEach((v: any) => { v.placa = nuevo.toUpperCase(); });
        this.ds.S.vehiculos[idx].p = nuevo.toUpperCase();
      }
      if (tipo === 'cambio_transportadora') {
        const val = nuevo.toLowerCase();
        const nt = val.includes('arsi') ? 'arsi' : (val.includes('polar') ? 'polar' : 'makand');
        this.ds.S.vehiculos[idx].tr = nt;
        this.ds.S.viajes.filter((v: any) => v.placa === placa && v.dia >= this.ds.getDIA())
          .forEach((v: any) => { v.tr = nt; });
      }
    }
    await this.ds.novedad(tipo, tipo.replace(/_/g, ' ') + ': ' + placa, desc || nuevo);
    this.cerrarModal('m-novedad');
    this.actualizarDashboard();
  }

  public async guardarVehiculo(): Promise<void> {
    const v = this.datosVehiculo;
    const placa = v.placa ? v.placa.trim().toUpperCase() : '';
    if (!placa) { alert('La placa es obligatoria'); return; }

    const vehiculoData: any = {
      p: placa, t: v.tipo, cap: v.cap || 480, kg: v.kg || 8000, m3: v.m3 || 32,
      cond: v.cond, tr: v.transp, est: v.est, mantDias: v.mantDias || 0,
      dc: { c: v.dc !== undefined ? v.dc : 0, m: v.dm !== undefined ? v.dm : 1, l: v.dl !== undefined ? v.dl : 2 }
    };
    if (this.idxVehiculo !== -1 && this.ds.S.vehiculos[this.idxVehiculo]?.sinPlaca) {
      vehiculoData.sinPlaca = true;
    }
    await this.ds.guardarVehiculo(vehiculoData, this.idxVehiculo);
    this.isModalVehOpen = false;
    this.actualizarDashboard();
  }

  public async guardarViaje(): Promise<void> {
    const r = this.ds.S.rutas.find((x: any) => x.cod === this.nuevoViaje.ruta);
    if (!r) { alert('Selecciona una ruta válida'); return; }

    const fechaVal = this.nuevoViaje.fecha;
    const dia = fechaVal ? parseInt(fechaVal.split('-')[2]) : this.ds.getDIA();
    const nv = {
      ...this.nuevoViaje, id: Date.now(), dia: dia, retorno: dia + (r.dias || 1),
      cajas: +this.nuevoViaje.cboxes || r.min, manif: this.nuevoViaje.manif || ('MF-' + Date.now())
    };

    const res = await this.ds.motorReasignar(nv);
    if (!res.ok) { alert(res.msg); return; }

    this.ds.S.viajes.push(nv);
    await this.ds.novedad(nv.tipo === 'extra' ? 'extra' : 'programado', 'Nuevo viaje: ' + nv.placa + ' > ' + r.dest + ' dia ' + nv.dia, res.msg);
    await this.ds.autoSave();
    this.cerrarModal('m-viaje');
    this.actualizarDashboard();
  }

  // --- HELPERS DE FECHAS: para saber si un viaje cae en la semana actual ---
  // Preferimos "fecha" (fecha real, ISO "AAAA-MM-DD") si el viaje la trae.
  // Si es un viaje viejo que solo tiene "dia" (número del mes seleccionado),
  // lo reconstruimos con el mes/año activos como respaldo.
  private obtenerFechaViaje(vj: any): Date | null {
    if (vj?.fecha) {
      const f = new Date(vj.fecha + 'T00:00:00');
      if (!isNaN(f.getTime())) return f;
    }
    if (vj?.dia && this.ds?.S) {
      const f = new Date(this.ds.S.anio, this.ds.S.mes, Number(vj.dia));
      if (!isNaN(f.getTime())) return f;
    }
    return null;
  }

  private aISO(d: Date): string {
    // OJO: antes esto usaba d.toISOString(), que convierte a UTC — si tu
    // zona horaria no es exactamente UTC+0, la fecha se podía correr un
    // día hacia atrás o hacia adelante, haciendo que "miércoles" buscara
    // internamente los viajes de otro día. Aquí se arma el texto de la
    // fecha con los componentes LOCALES (año/mes/día), sin pasar por UTC.
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
  }

  // El mismo viaje queda guardado bajo 2-3 llaves distintas en viajesMap
  // (por día simple, día con cero, y fecha completa) para que buscarViaje()
  // lo encuentre sin importar el formato. Por eso, cualquier código que
  // recorra "todos los viajes" con Object.values(viajesMap) DEBE pasar por
  // aquí primero, o cuenta el mismo viaje 2-3 veces.
  private viajesUnicos(): any[] {
    return Array.from(new Set(Object.values(this.viajesMap)));
  }

  // Ya no generamos viajes inventados. El Rutograma real solo LEE de
  // S.viajes y los agrupa con agruparViajes() (de rutograma.utils.js).
  // El dashboard hace exactamente lo mismo, para mostrar lo mismo.
  public rutasSinCubrir: { fecha: string; nombre: string; ruta: string }[] = [];

  /**
   * Lee los viajes REALES de S.viajes, los agrupa igual que el Rutograma
   * principal (mismo agruparViajes), y devuelve solo los que caen en la
   * semana actual (lunes a domingo). Se usa la misma función a propósito
   * para que el Dashboard muestre exactamente lo mismo que el Rutograma
   * — si el Rutograma cambia algún día, esto cambia junto con él.
   */
  private obtenerViajesSemana(): any[] {
    this.rutasSinCubrir = [];
    const todos = this.ds.S?.viajes || [];
    if (!todos.length) return [];

    // Filtramos por semana ANTES de agrupar, no después. Si le pasamos
    // TODOS los meses juntos a agruparViajes(), su control de ocupación
    // (que solo mira el número del día, 1 al 31, sin fijarse en el mes)
    // puede confundir un viaje de otro mes con uno de esta semana. Filtrando
    // primero por fecha real, agruparViajes() solo ve viajes de esta semana.
    const lunes = this.diasRutogramaSemana[0]?.fechaCompleta;
    const domingo = this.diasRutogramaSemana[6]?.fechaCompleta;
    const soloEstaSemana = todos.filter((vj: any) => {
      if (!lunes || !domingo) return false;
      const f = this.obtenerFechaViaje(vj);
      if (!f) return false;
      const iso = this.aISO(f);
      return iso >= lunes && iso <= domingo;
    });
    if (!soloEstaSemana.length) return [];

    // agruparViajes marca isStart/type y coloca cada viaje en sus días.
    // Nos quedamos solo con el día de inicio (isStart) de cada viaje real,
    // que es el que representa "un viaje" (los demás días son tránsito).
    const agrupados = agruparViajes(soloEstaSemana, this.ds.S);
    const vistos = new Set<any>();
    const inicios: any[] = [];

    Object.values(agrupados).forEach((celda: any) => {
      (celda || []).forEach((vj: any) => {
        if (vj.isStart && !vistos.has(vj)) {
          vistos.add(vj);
          // agruparViajes conserva "placa" pero no siempre "p"; el HTML
          // del dashboard lee vj.p, así que lo normalizamos.
          if (!vj.p && vj.placa) vj.p = vj.placa;
          inicios.push(vj);
        }
      });
    });

    // Filtramos a la semana actual (blindaje extra, por si algún viaje que
    // empieza fuera de la semana se coló al agrupar por rangos de días).
    return inicios.filter((vj) => this.estaEnSemanaActual(vj));
  }

  /**
   * Placas que HOY tienen un viaje activo o están en tránsito.
   *
   * BUG REAL encontrado y corregido: la versión anterior de esta función
   * usaba las claves "PLACA-DIA" que arma agruparViajes() (rutograma.utils.js)
   * para saber qué celda corresponde a hoy. El problema es que esa función
   * arma esas claves con aritmética simple de día (`diaSalida + offset`),
   * SIN ajustar el mes — un viaje que sale el día 31 de un mes y tiene
   * transito+retorno de 6 días genera claves como "PLACA-32", "PLACA-33"...
   * "PLACA-37", que NUNCA calzan con "PLACA-3" (el día 3 real del MES
   * SIGUIENTE). Como resultado, un vehículo que en la práctica seguía en
   * tránsito (arrastrado del mes anterior) aparecía como "Disponible" en el
   * Dashboard, aunque el Rutograma real sí lo bloqueaba correctamente para
   * asignaciones nuevas (ese chequeo SÍ usa fechas reales).
   *
   * Ahora esta función usa fechas de calendario reales (objetos Date) para
   * cada viaje, igual que el chequeo de conflictos del Rutograma — así
   * cruzar de mes (o hasta de año) nunca rompe la comparación.
   */
  private placasOcupadasHoy(): Set<string> {
    const ocupadas = new Set<string>();
    const todos = this.ds.S?.viajes || [];
    if (!todos.length) return ocupadas;

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    // Ventana de viajes a revisar: desde 10 días antes de hoy (más que
    // suficiente para cualquier ruta real, incluyendo transito+retorno de
    // las más largas) hasta hoy mismo — un viaje que sale DESPUÉS de hoy
    // no puede estar ocupando el vehículo todavía.
    const limiteInferior = new Date(hoy);
    limiteInferior.setDate(limiteInferior.getDate() - 10);

    todos.forEach((vj: any) => {
      if (String(vj.estado || '').toLowerCase() === 'cancelado') return;

      const fechaSalida = this.obtenerFechaViajeReal(vj);
      if (!fechaSalida) return;
      fechaSalida.setHours(0, 0, 0, 0);
      if (fechaSalida < limiteInferior || fechaSalida > hoy) return;

      // Terceros (Arsitrans/Polar) SIEMPRE están libres al día siguiente,
      // sin importar la ruta — solo ocupan el día exacto de salida (mismo
      // criterio ya establecido en chocaConViajeExistente/rutograma.utils.js).
      const tr = String(vj.tr || vj.transportadora || '').toLowerCase().trim();
      const esTercero = tr.includes('arsitran') || tr.includes('polar');
      const diasOcupados = esTercero ? 1 : Math.max(obtenerDiasViaje(vj, this.ds.S) - 1, 1);

      const fechaFin = new Date(fechaSalida);
      fechaFin.setDate(fechaFin.getDate() + diasOcupados - 1);

      if (hoy >= fechaSalida && hoy <= fechaFin) {
        const placa = String(vj.p || vj.placa || '').toUpperCase().trim();
        if (placa) ocupadas.add(placa);
      }
    });

    return ocupadas;
  }

  /**
   * Fecha REAL de calendario de un viaje — usa vj.fecha (string ISO,
   * "YYYY-MM-DD") cuando existe, que es independiente del mes/año que esté
   * activo en el Rutograma ahora mismo. Solo si un viaje viejo no trae ese
   * campo, se cae al método anterior (día + mes/año ACTUALES del Rutograma,
   * que puede ser incorrecto para viajes de otro mes — por eso se prioriza
   * siempre "fecha" primero).
   */
  private obtenerFechaViajeReal(vj: any): Date | null {
    if (vj?.fecha) {
      const f = new Date(vj.fecha + 'T00:00:00');
      if (!isNaN(f.getTime())) return f;
    }
    if (vj?.dia && this.ds?.S) {
      const f = new Date(this.ds.S.anio, this.ds.S.mes, Number(vj.dia));
      if (!isNaN(f.getTime())) return f;
    }
    return null;
  }

  private estaEnSemanaActual(vj: any): boolean {
    const f = this.obtenerFechaViaje(vj);
    if (!f) return false;
    const iso = this.aISO(f);
    const lunes = this.diasRutogramaSemana[0]?.fechaCompleta;
    const domingo = this.diasRutogramaSemana[6]?.fechaCompleta;
    if (!lunes || !domingo) return false;
    return iso >= lunes && iso <= domingo;
  }

  // Recalcula "Próximas salidas" — si hay fechas en el filtro, se usan
  // esas; si no, se muestra la semana actual (de hoy en adelante), como
  // siempre. Se puede llamar sola (cuando cambias el filtro) sin tener
  // que rehacer todo el resto del dashboard.
  public actualizarProximosViajes(): void {
    const hoyISO = this.aISO(new Date());

    // La fecha específica manda si está puesta — busca solo ese día. Sin
    // ella, se ve la semana actual (de hoy en adelante) como siempre.
    const desde = this.filtroFechaEspecifica || hoyISO;
    const hasta = this.filtroFechaEspecifica || null;

    this.proximosViajes = this.viajesUnicos()
      .filter((v: any) => {
        const f = this.obtenerFechaViaje(v);
        if (!f) return false;
        const iso = this.aISO(f);
        if (iso < desde) return false;
        if (hasta && iso > hasta) return false;
        if (this.filtroTransportadora && String(v.tr || 'Makand') !== this.filtroTransportadora) return false;
        return true;
      })
      .map((v: any) => this.completarConductorViaje(v))
      .sort((a: any, b: any) => {
        const fa = this.obtenerFechaViaje(a);
        const fb = this.obtenerFechaViaje(b);
        const diffFecha = (fa?.getTime() || 0) - (fb?.getTime() || 0);
        if (diffFecha !== 0) return diffFecha;

        // Mismo día: desempata por hora (formato "HH:MM", se puede
        // comparar como texto porque siempre viene con ceros a la
        // izquierda). Sin hora, se manda al final del día.
        const horaA = a.hora || a.horaDespacho || '99:99';
        const horaB = b.hora || b.horaDespacho || '99:99';
        return horaA.localeCompare(horaB);
      });
  }

  public limpiarFiltroSalidas(): void {
    this.filtroFechaEspecifica = '';
    this.filtroTransportadora = '';
    this.actualizarProximosViajes();
  }

  public onFechaEspecificaChange(): void {
    this.actualizarProximosViajes();
  }

  // --- LÓGICA PRINCIPAL: DASHBOARD ESCOPADO A LA SEMANA ACTUAL (LUN-DOM) ---
  actualizarDashboard() {
    const S = this.ds.S;
    if (!S) return;
    const vehiculos = S.vehiculos || [];
    const rutas = S.rutas || [];
    const cuposExt = S.cuposExt || [];
    const urgsTodos = S.urgs || [];

    // La semana siempre es la de HOY, sin importar qué mes tengas
    // seleccionado en el navegador de mes/año.
    this.generarSemanaActual();

    // Mismo orden que usa el Rutograma real (vehiculosOrdenados() en
    // rutograma.ts): vehículos propios primero, en orden alfabético/numérico
    // por placa; después los cupos ARSITRANS/POLAR, agrupados por
    // transportadora y número. Antes esto no ordenaba nada — se quedaba en
    // el orden crudo del Excel, distinto al que se ve en el Rutograma.
    this.vehiculosActivos = [...vehiculos].sort((a: any, b: any) => {
      const clasificar = (v: any) => {
        const tr = String(v.tr || v.transportadora || '').toLowerCase().trim();
        const esCupo = tr.includes('arsitran') || tr.includes('polar');
        if (!esCupo) return { esCupo: false, prefijo: '', numero: 0 };
        const placa = String(v.p || v.placa || '').trim();
        const m = placa.match(/(\d+)\s*$/);
        return { esCupo: true, prefijo: tr.includes('arsitran') ? 'ARSITRANS' : 'POLAR', numero: m ? Number(m[1]) : 0 };
      };
      const ca = clasificar(a);
      const cb = clasificar(b);

      if (!ca.esCupo && !cb.esCupo) {
        const placaA = String(a.p || a.placa || '');
        const placaB = String(b.p || b.placa || '');
        return placaA.localeCompare(placaB, 'es', { numeric: true, sensitivity: 'base' });
      }
      if (!ca.esCupo) return -1;
      if (!cb.esCupo) return 1;

      if (ca.prefijo !== cb.prefijo) return ca.prefijo.localeCompare(cb.prefijo);
      return ca.numero - cb.numero;
    });

    // A partir de aquí, "this.viajes" son SOLO los de la semana actual
    // La semana se arma leyendo S.viajes reales y agrupándolos igual que
    // el Rutograma (no se inventa nada).
    this.viajes = this.obtenerViajesSemana();
    this.procesarViajes();

    const hoy = new Date(this.ds.S.anio, this.ds.S.mes, this.ds.getDIA());
    const hoyISO = this.aISO(hoy);

    // DETECCIÓN DE VEHÍCULOS EN MANTENIMIENTO HOY
    const placasEnMantenimiento = new Set<string>();
    vehiculos.forEach((v: any) => {
      if (!String(v.est || '').toLowerCase().trim().includes('mant')) return;

      // BUG encontrado y corregido: esto solo miraba el campo "Estado"
      // del vehículo, sin revisar las fechas reales. Si a alguien se le
      // olvidaba darle "Quitar mantenimiento" después de la fecha de
      // fin, el vehículo se quedaba marcado "en mantenimiento" PARA
      // SIEMPRE — generando alertas críticas falsas apenas se le
      // asignaba un viaje normal semanas después. Ahora, cuando el
      // vehículo tiene fechas registradas, solo cuenta si HOY cae
      // dentro de ese rango. Sin fechas (dato viejo/incompleto), se
      // mantiene el comportamiento de antes — no hay forma de saber si
      // ya pasó.
      if (v.mantInicio && v.mantFin) {
        if (hoyISO >= v.mantInicio && hoyISO <= v.mantFin) {
          placasEnMantenimiento.add((v.p || '').toString().trim().toUpperCase());
        }
      } else {
        placasEnMantenimiento.add((v.p || '').toString().trim().toUpperCase());
      }
    });
    this.viajes.forEach((vj: any) => {
      const f = this.obtenerFechaViaje(vj);
      const esHoy = f !== null && this.aISO(f) === hoyISO;
      const estViaje = (vj.estado || '').toLowerCase().trim();
      if (esHoy && estViaje.includes('mant') && vj.placa) {
        placasEnMantenimiento.add(vj.placa.toString().trim().toUpperCase());
      }
    });
    placasEnMantenimiento.delete('');

    // Separación analítica de flotas excluyendo las unidades inactivas.
    // "Disponibles" = ni en mantenimiento, ni con un viaje activo o en
    // tránsito hoy (ver placasOcupadasHoy(), usa el mismo cálculo que el
    // Rutograma real).
    const placasOcupadas = this.placasOcupadasHoy();
    const disp = vehiculos.filter((v: any) => {
      const placa = (v.p || '').toString().trim().toUpperCase();
      return !placasEnMantenimiento.has(placa) && !placasOcupadas.has(placa);
    });
    const enMant = vehiculos.filter((v: any) => placasEnMantenimiento.has((v.p || '').toString().trim().toUpperCase()));
    const sinCond = vehiculos.filter((v: any) => !v.cond && !placasEnMantenimiento.has((v.p || '').toString().trim().toUpperCase()));

    // 1. VEHÍCULOS DISPONIBLES HOY — un vehículo sale una sola vez en la
    // lista; "sinCond" solo marca (no duplica) los que no tienen conductor
    // asignado, para que la tarjeta lo muestre distinto si hace falta.
    this.disponibles = disp.map((v: any) => ({ ...v, sinCond: !v.cond }));
    this.statsContratados.arsiHoy = disp.filter((v: any) => v.tr === 'arsi').length;
    this.statsContratados.polarHoy = disp.filter((v: any) => v.tr === 'polar').length;

    // 2. PRÓXIMOS VIAJES DE LA SEMANA (de hoy en adelante, hasta el domingo)
    this.actualizarProximosViajes();

    // 3. VIAJES CRÍTICOS / URGENTES DE LA SEMANA (de hoy en adelante)
    this.listaUrgentes = this.viajes
      .filter((v: any) => {
        if (v.prioridad !== 'urgente' && v.prioridad !== 'alta') return false;
        const f = this.obtenerFechaViaje(v);
        return f !== null && this.aISO(f) >= hoyISO;
      })
      .sort((a: any, b: any) => {
        const fa = this.obtenerFechaViaje(a);
        const fb = this.obtenerFechaViaje(b);
        return (fa?.getTime() || 0) - (fb?.getTime() || 0);
      });

    const urgsSemana = urgsTodos.filter((vj: any) => this.estaEnSemanaActual(vj));
    if (urgsSemana.length > 0) {
      this.listaUrgentes = [...this.listaUrgentes, ...urgsSemana];
    }

    // 4. KPIs — TODOS ESCOPADOS A LA SEMANA ACTUAL (lunes a domingo)
    this.kTotalesActivos = vehiculos.length;
    this.kDisp = disp.length;
    this.kMant = placasEnMantenimiento.size;
    const viajesValidosSemana = this.viajesUnicos();
    this.kViaj = viajesValidosSemana.length; // viajes REALES de ESTA semana (ya filtrados por descanso)

    // Total de viajes del MES activo (no solo la semana) — cuenta directo
    // sobre S.viajes en vez de reusar viajesUnicos() (que está limitado a
    // la semana), excluyendo Cancelados igual que el resto de la app.
    const mesTextoActivo = this.nombresMesCalendario[this.ds.S?.mes ?? new Date().getMonth()];
    const anioActivo = this.ds.S?.anio ?? new Date().getFullYear();
    const viajesMesActivo = (this.ds.S?.viajes || []).filter((v: any) =>
      v.mes === mesTextoActivo && Number(v.anio) === Number(anioActivo) && v.estado !== 'Cancelado'
    );
    this.kViajMes = viajesMesActivo.length;

    // --- Comparativo mes vs. mes anterior (viajes) ---
    // Retrocedemos un mes desde el activo, cuidando el cruce de año
    // (Enero -> Diciembre del año anterior). Mismo criterio de conteo que
    // kViajMes (excluye Cancelado) para que ambos números sean
    // comparables entre sí.
    const mesIndexActivo = this.ds.S?.mes ?? new Date().getMonth();
    let mesIndexAnterior = mesIndexActivo - 1;
    let anioAnteriorComp = anioActivo;
    if (mesIndexAnterior < 0) { mesIndexAnterior = 11; anioAnteriorComp = anioActivo - 1; }
    const mesTextoAnterior = this.nombresMesCalendario[mesIndexAnterior];

    this.kViajMesAnterior = (this.ds.S?.viajes || []).filter((v: any) =>
      v.mes === mesTextoAnterior && Number(v.anio) === Number(anioAnteriorComp) && v.estado !== 'Cancelado'
    ).length;

    const diffViajes = this.kViajMes - this.kViajMesAnterior;
    if (this.kViajMesAnterior === 0) {
      if (this.kViajMes === 0) {
        this.kViajMesTendencia = 'igual';
        this.kViajMesComparativoTexto = 'Sin viajes aún';
      } else {
        this.kViajMesTendencia = 'up';
        this.kViajMesComparativoTexto = `+${diffViajes} vs ${mesTextoAnterior} (sin datos)`;
      }
    } else {
      const pct = Math.round((diffViajes / this.kViajMesAnterior) * 100);
      this.kViajMesTendencia = diffViajes > 0 ? 'up' : diffViajes < 0 ? 'down' : 'igual';
      const signo = diffViajes > 0 ? '+' : '';
      this.kViajMesComparativoTexto = `${signo}${pct}% vs ${mesTextoAnterior}`;
    }
    this.kViajMesComparativoDetalle = `${mesTextoActivo} ${anioActivo}: ${this.kViajMes} viajes · ${mesTextoAnterior} ${anioAnteriorComp}: ${this.kViajMesAnterior} viajes`;

    // --- Comparativo entre transportadoras (viajes del mes) ---
    // Mismo array que kViajMes (ya excluye Cancelado), así los
    // porcentajes siempre suman el mismo total que se ve en esa tarjeta.
    const conteoPorTransportadora = new Map<string, number>();
    viajesMesActivo.forEach((v: any) => {
      const tr = String(v.tr || v.transportadora || '').trim() || 'Sin asignar';
      conteoPorTransportadora.set(tr, (conteoPorTransportadora.get(tr) || 0) + 1);
    });
    const desgloseTransportadoras = Array.from(conteoPorTransportadora.entries())
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        pct: this.kViajMes > 0 ? Math.round((cantidad / this.kViajMes) * 100) : 0
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    this.kTransportadoraTop = desgloseTransportadoras[0]?.nombre || '—';
    this.kTransportadoraDesglose = desgloseTransportadoras.length
      ? desgloseTransportadoras.map(t => `${t.nombre} ${t.pct}%`).join(' · ')
      : 'Sin viajes este mes';
    this.kTransportadoraDetalle = desgloseTransportadoras
      .map(t => `${t.nombre}: ${t.cantidad} viajes`)
      .join(' · ');

    // Mantenimientos del mes activo — cuenta CADA mantenimiento como un
    // evento separado (si un mismo vehículo tuvo 2 este mes, suma 2), no
    // vehículos únicos. Cuenta tanto los que ya se archivaron en
    // historialMantenimiento (al quitarlos) como cualquiera que siga
    // ACTIVO ahora mismo (mantInicio/mantFin puestos pero todavía sin
    // quitar). Se identifica el mes por el "inicio" del mantenimiento,
    // comparado en formato ISO (YYYY-MM).
    const prefijoMesActivo = `${anioActivo}-${String((this.ds.S?.mes ?? 0) + 1).padStart(2, '0')}`;
    const conteoPorPlaca = new Map<string, number>();
    for (const veh of (this.ds.S?.vehiculos || [])) {
      const placa = veh.p || veh.placa;
      const historial = veh.historialMantenimiento || [];
      let eventosEsteVehiculo = historial.filter((h: any) => String(h.inicio || '').startsWith(prefijoMesActivo)).length;
      if (veh.mantInicio && String(veh.mantInicio).startsWith(prefijoMesActivo)) {
        eventosEsteVehiculo += 1;
      }
      if (eventosEsteVehiculo > 0) {
        conteoPorPlaca.set(placa, eventosEsteVehiculo);
      }
    }
    this.kMantMes = Array.from(conteoPorPlaca.values()).reduce((suma, n) => suma + n, 0);
    this.kMantMesPlacas = Array.from(conteoPorPlaca.entries())
      .map(([placa, n]) => n > 1 ? `${placa} (x${n})` : placa)
      .join(', ') || 'Ninguno';
    this.kUrg = this.listaUrgentes.length;
    this.kAct = this.obtenerTotalEnRutaAhora(); // en ruta AHORA MISMO (hoy), no toda la semana
    this.kRuta = viajesValidosSemana.filter((v: any) => v.tipo === 'ruta').length;
    this.kEntregados = viajesValidosSemana.filter((v: any) => v.estado === 'Entregado').length;
    this.kDoble = viajesValidosSemana.filter((v: any) => v.cli2).length;
    this.kSplit = viajesValidosSemana.filter((v: any) => v.split).length;
    this.kAlm = this.kEntregados + this.kAct + this.kDoble;

    let cuposHoy: any = { arsi: 0, polar: 0 };
    cuposExt.forEach((cp: any) => {
      const f = this.obtenerFechaViaje(cp);
      if (f !== null && this.aISO(f) === hoyISO && cuposHoy.hasOwnProperty(cp.tr)) {
        cuposHoy[cp.tr]++;
      }
    });
    this.cuposArsi = cuposHoy.arsi;
    this.cuposPolar = cuposHoy.polar;

    // 5. ALERTAS — solo con datos de la semana actual
    this.alertas = [];
    const alertasEmitidas = new Set<string>();

    enMant.forEach((v: any) => {
      const pComp = (v.p || '').toString().trim().toUpperCase();
      alertasEmitidas.add(pComp);
      const tieneViaje = viajesValidosSemana.some((vj: any) => vj.placa === v.p);
      if (tieneViaje) {
        this.alertas.push({ t: 'r', ic: '<i class="bi bi-exclamation-triangle-fill"></i>', tt: `CRÍTICA: ${v.p} en mantenimiento tiene viajes asignados esta semana`, d: 'Reasignar unidad urgente' });
      } else {
        this.alertas.push({ t: 'a', ic: '<i class="bi bi-tools"></i>', tt: `${v.p} en mantenimiento`, d: 'Unidad inmovilizada en taller' });
      }
    });

    this.viajes.forEach((vj: any) => {
      const f = this.obtenerFechaViaje(vj);
      const esHoy = f !== null && this.aISO(f) === hoyISO;
      const estViaje = (vj.estado || '').toLowerCase().trim();
      if (esHoy && estViaje === 'mantenimiento' && vj.placa) {
        const pComp = vj.placa.toString().trim().toUpperCase();
        if (!alertasEmitidas.has(pComp)) {
          alertasEmitidas.add(pComp);
          this.alertas.push({ t: 'a', ic: '<i class="bi bi-tools"></i>', tt: `${pComp} en mantenimiento`, d: 'Unidad inmovilizada en taller (desde Planificación)' });
        }
      }
    });

    sinCond.forEach((v: any) => {
      const cn = this.ds.infoConductor ? this.ds.infoConductor(v) : null;
      this.alertas.push({ t: 'r', ic: '<i class="bi bi-person-x-fill"></i>', tt: `${v.p} sin conductor asignado`, d: cn ? cn.nom + ' — ' + cn.est : 'Sin conductor activo en el sistema' });
    });

    // Novedades reportadas y aún sin resolver — la más reciente primero.
    const novedadesActivas = (this.ds.S?.novedades || []).filter((n: any) => !n.resuelta);
    novedadesActivas.forEach((n: any) => {
      const tipoTexto = String(n.tipo || '').toLowerCase();
      const esCritica = tipoTexto === 'incidente' || tipoTexto === 'avería' || tipoTexto === 'averia';
      this.alertas.push({
        t: esCritica ? 'r' : 'a',
        ic: '<i class="bi bi-lightning-charge-fill"></i>',
        tt: `${n.tipo || 'Novedad'}: ${n.titulo}`,
        d: n.desc || ''
      });
    });

    // Mantenimiento preventivo vencido o próximo (cada 90 días desde "um").
    // Igual que con licencias: usamos la fecha REAL de hoy, no el "hoy"
    // contextual del mes que estés navegando.
    const INTERVALO_MANT_DIAS = 90;
    vehiculos.forEach((v: any) => {
      if (!v.um) return;
      const ultimo = new Date(v.um + 'T00:00:00');
      if (isNaN(ultimo.getTime())) return;

      const proximo = new Date(ultimo);
      proximo.setDate(proximo.getDate() + INTERVALO_MANT_DIAS);

      const hoyReal = new Date();
      hoyReal.setHours(0, 0, 0, 0);
      const dias = Math.round((proximo.getTime() - hoyReal.getTime()) / (1000 * 60 * 60 * 24));

      if (dias < 0) {
        this.alertas.push({ t: 'r', ic: '<i class="bi bi-tools"></i>', tt: `Mantenimiento VENCIDO: ${v.p}`, d: `Debió hacerse hace ${Math.abs(dias)} días` });
      } else if (dias <= 15) {
        this.alertas.push({ t: 'a', ic: '<i class="bi bi-tools"></i>', tt: `Mantenimiento próximo: ${v.p}`, d: `En ${dias} días` });
      }
    });

    // Licencias de conducción vencidas o por vencer (≤30 días).
    // OJO: aquí usamos la fecha REAL de hoy (no el "hoy" que depende del
    // mes que estés navegando) — una licencia vence en la vida real, sin
    // importar qué mes tengas abierto en el Rutograma.
    (this.ds.S?.conductores || []).forEach((c: any) => {
      if (!c.licVence) return;
      const vence = new Date(c.licVence + 'T00:00:00');
      if (isNaN(vence.getTime())) return;

      const hoyReal = new Date();
      hoyReal.setHours(0, 0, 0, 0);
      const dias = Math.round((vence.getTime() - hoyReal.getTime()) / (1000 * 60 * 60 * 24));
      const nombreCond = c.nom || c.nombre || c.p || c.veh || 'Conductor';

      if (dias < 0) {
        this.alertas.push({ t: 'r', ic: '<i class="bi bi-person-vcard-fill"></i>', tt: `Licencia VENCIDA: ${nombreCond}`, d: `Venció hace ${Math.abs(dias)} días — no debería seguir en ruta` });
      } else if (dias <= 30) {
        this.alertas.push({ t: 'a', ic: '<i class="bi bi-person-vcard-fill"></i>', tt: `Licencia por vencer: ${nombreCond}`, d: `Vence en ${dias} días` });
      }
    });

    // SOAT y tecnomecánica vencidos o por vencer (≤15 días) — mismo
    // patrón exacto que licencias/mantenimiento, fecha REAL de hoy.
    vehiculos.forEach((v: any) => {
      const hoyReal = new Date();
      hoyReal.setHours(0, 0, 0, 0);

      if (v.soatVence) {
        const vence = new Date(v.soatVence + 'T00:00:00');
        if (!isNaN(vence.getTime())) {
          const dias = Math.round((vence.getTime() - hoyReal.getTime()) / (1000 * 60 * 60 * 24));
          if (dias < 0) {
            this.alertas.push({ t: 'r', ic: '<i class="bi bi-file-earmark-text-fill"></i>', tt: `SOAT VENCIDO: ${v.p}`, d: `Venció hace ${Math.abs(dias)} días` });
          } else if (dias <= 15) {
            this.alertas.push({ t: 'a', ic: '<i class="bi bi-file-earmark-text-fill"></i>', tt: `SOAT por vencer: ${v.p}`, d: `Vence en ${dias} días` });
          }
        }
      }

      if (v.tecnoVence) {
        const vence = new Date(v.tecnoVence + 'T00:00:00');
        if (!isNaN(vence.getTime())) {
          const dias = Math.round((vence.getTime() - hoyReal.getTime()) / (1000 * 60 * 60 * 24));
          if (dias < 0) {
            this.alertas.push({ t: 'r', ic: '<i class="bi bi-file-earmark-text-fill"></i>', tt: `Tecnomecánica VENCIDA: ${v.p}`, d: `Venció hace ${Math.abs(dias)} días` });
          } else if (dias <= 15) {
            this.alertas.push({ t: 'a', ic: '<i class="bi bi-file-earmark-text-fill"></i>', tt: `Tecnomecánica por vencer: ${v.p}`, d: `Vence en ${dias} días` });
          }
        }
      }
    });

    // Conflictos: mismo vehículo con más de un viaje el mismo día de la semana
    vehiculos.forEach((v: any) => {
      this.diasRutogramaSemana.forEach((diaSem: any) => {
        const n = this.viajesUnicos().filter((vj: any) => {
          const f = this.obtenerFechaViaje(vj);
          return vj.placa === v.p && f !== null && this.aISO(f) === diaSem.fechaCompleta;
        }).length;
        if (n > 1) {
          this.alertas.push({ t: 'r', ic: '<i class="bi bi-lightning-charge-fill"></i>', tt: `CONFLICTO: ${v.p} registra ${n} viajes el ${diaSem.nombre} ${diaSem.numero}`, d: 'Cruces detectados. Corregir itinerario' });
        }
      });
    });

    viajesValidosSemana.filter((vj: any) => vj.cli2).forEach((vj: any) => {
      this.alertas.push({ t: 'b', ic: '<i class="bi bi-pin-map-fill"></i>', tt: 'DOBLE ENTREGA: ' + vj.cli + ' + ' + vj.cli2, d: vj.placa + ' — Planificar tiempos extras de descarga' });
    });

    viajesValidosSemana.filter((vj: any) => vj.split).forEach((vj: any) => {
      this.alertas.push({ t: 'a', ic: '<i class="bi bi-truck"></i>', tt: 'SPLIT ACTIVO: ' + vj.placa + ' — ' + vj.cli, d: vj.splitRazon || 'Capacidad excedida. Requiere soporte' });
    });

    urgsSemana.forEach((vj: any) => {
      const r = rutas.find((x: any) => x.cod === vj.ruta);
      this.alertas.push({ t: 'r', ic: '<i class="bi bi-exclamation-octagon-fill"></i>', tt: 'URGENTE: ' + vj.placa + ' > ' + (r ? r.dest : vj.ruta), d: vj.cli });
    });

    this.alertasCriticasCount = this.alertas.filter(a => a.t === 'r').length;

    // Últimas 15 novedades, la más reciente primero (el id es Date.now(),
    // así que ordenar por id nos da el orden cronológico real).
    this.novedadesRecientes = [...(this.ds.S?.novedades || [])]
      .sort((a: any, b: any) => (b.id || 0) - (a.id || 0))
      .slice(0, 15);
    if (this.alertas.length === 0) {
      this.alertas.push({ t: 'g', ic: '<i class="bi bi-check-circle-fill"></i>', tt: 'Sin conflictos activos esta semana', d: 'Operación en orden' });
    }
  }

  // --- HELPERS TRADICIONALES DE SOPORTE ---
  public obtenerColor(tr: string): string {
    const cols: any = { makand: '#1d4ed8', arsi: '#064e3b', polar: '#064e3b', tercero: '#4c1d95' };
    return cols[tr] || '#374151';
  }

  public tNom(tr: string): string {
    const nombres: any = { makand: 'Makand', arsi: 'Arsi', polar: 'Polar', tercero: 'Tercero' };
    return nombres[tr] || tr;
  }

  public esProtegida(clave: string): boolean {
    const protegidas = ['makand', 'arsi', 'polar'];
    return protegidas.includes(clave);
  }

  public eliminarTransp(clave: string) {
    if (this.esProtegida(clave)) {
      alert('No se puede eliminar una transportadora base.');
      return;
    }
    if (confirm('Eliminar la transportadora "' + clave + '"?')) {
      this.ds.S.transportadoras = this.ds.S.transportadoras.filter((t: any) => t.clave !== clave);
      this.ds.autoSave();
      this.ds.guardarConfigCompartida('transportadoras');
      this.actualizarDashboard();
    }
  }

  public actualizarFestivos(event: Event) {
    const input = event.target as HTMLInputElement;
    const valor = input.value;
    this.ds.S.festivos = valor.split(',').map((f: string) => f.trim()).filter((f: string) => f !== "");
    this.ds.autoSave();
    this.ds.guardarConfigCompartida('festivos');
    this.actualizarDashboard();
  }

  public nuevaRuta() {
    this.idxRuta = -1;
    this.tituloModalRuta = 'Nueva Ruta';
    this.datosRuta = {
      cod: '', dest: '', dest2: '', km: 0, tm: 0, ta: 0, tp: 0,
      dias: 1, desc: 1, min: 100, tipo: 'media', clientes: '',
      dc: [false, false, false, false, false, false, false]
    };
    this.isModalRutaOpen = true;
  }

  public async guardarRuta(): Promise<void> {
    const r = this.datosRuta;
    if (!r.cod || !r.dest) {
      alert('El código y el destino son obligatorios');
      return;
    }
    r.clientes = this.clientesTexto ? this.clientesTexto.split('\n').map(c => c.trim()).filter(c => c !== '') : [];
    r.diasSem = r.diasSem || [];
    r.horasXDia = r.horasXDia || {};

    if (r.horasXDia && Object.keys(r.horasXDia).length > 0) {
      const primerasHoras = Object.values(r.horasXDia);
      r.horaBase = primerasHoras[0] || '';
    }

    const codOrig = (this.idxRuta !== -1) ? this.ds.S.rutas[this.idxRuta].cod : null;
    if (codOrig && codOrig !== r.cod) {
      this.ds.S.viajes.filter((v: any) => v.ruta === codOrig).forEach((v: any) => {
        v.ruta = r.cod;
      });
    }

    await this.ds.guardarRuta(r, codOrig || undefined);
    this.actualizarDashboard();
    this.isModalRutaOpen = false;
    this.idxRuta = -1;
    this.datosRuta = {};
    this.clientesTexto = '';
  }

  public getDiasTexto(dias: number[]): string {
    if (!dias || dias.length === 0) return '';
    return dias.map(d => this.diasNombres[d]).join(', ');
  }

  get infoRutaSeleccionada() {
    if (!this.rutaSeleccionada) return null;
    return this.ds.S.rutas.find((x: any) => x.cod === this.rutaSeleccionada);
  }

  public selectedViaje: any = null;
  public isModalDetalleOpen: boolean = false;
  public nuevoConductor: string = '';
  public viajeOriginal: any = null;

  public async actualizarEstadoViaje(): Promise<void> {
    if (!this.selectedViaje || !this.viajeOriginal) return;

    const cambios = [];
    if (this.selectedViaje.estado !== this.viajeOriginal.estado) cambios.push('Estado: ' + this.viajeOriginal.estado + ' > ' + this.selectedViaje.estado);
    if (this.selectedViaje.horaReal !== this.viajeOriginal.horaDespacho) cambios.push('Hora real: ' + this.selectedViaje.horaReal + ' (prog: ' + (this.viajeOriginal.horaDespacho || '—') + ')');
    if (this.selectedViaje.fechaEntrega !== this.viajeOriginal.fechaEntrega) cambios.push('Fecha entrega: ' + this.selectedViaje.fechaEntrega);

    if (cambios.length > 0) {
      await this.ds.novedad('auto', 'Actualizacion viaje ' + this.selectedViaje.placa + ' dia ' + this.selectedViaje.dia, cambios.join(' · '));
    }

    const index = this.ds.S.viajes.findIndex((v: any) => v.id === this.selectedViaje.id);
    if (index !== -1) {
      this.ds.S.viajes[index] = this.selectedViaje;
    }

    await this.ds.autoSave();
    this.isModalDetalleOpen = false;
  }

  public async cambiarConductorViaje(): Promise<void> {
    if (!this.selectedViaje || !this.nuevoConductor) return;
    const anterior = this.selectedViaje.cond;
    this.selectedViaje.cond = this.nuevoConductor.trim();

    await this.ds.novedad('cambio_conductor', 'Conductor cambiado en viaje — ' + this.selectedViaje.placa + ' dia ' + this.selectedViaje.dia, 'Anterior: ' + anterior + ' > Nuevo: ' + this.selectedViaje.cond);
    await this.ds.autoSave();

    this.nuevoConductor = '';
    this.isModalDetalleOpen = false;
  }

  public estadoBadge(estado: string) { return '...'; }
  public tarifa(vj: any) { return 0; }

  private conductorActivo(v: any): boolean {
    return v.cond !== undefined && v.cond !== null && v.cond !== '';
  }

  public verDetalle(id: any) {
    const vj = this.ds.S.viajes.find((v: any) => v.id === id);
    if (!vj) return;
    this.selectedViaje = JSON.parse(JSON.stringify(vj));
    this.viajeOriginal = JSON.parse(JSON.stringify(vj));
    this.isModalDetalleOpen = true;
  }

  public async eliminarViaje(): Promise<void> {
    if (!confirm('¿Eliminar este viaje?')) return;
    if (!this.selectedViaje) return;
    this.ds.S.viajes = this.ds.S.viajes.filter((v: any) => v.id !== this.selectedViaje.id);
    await this.ds.autoSave();
    this.isModalDetalleOpen = false;
  }

  public novedadDeDetalle() {
    this.isModalDetalleOpen = false;
    this.isModalNovedadOpen = true;
  }

  public async descargarDiario(): Promise<void> {
    const ahora = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const fs = ahora.getFullYear() + '' + pad(ahora.getMonth() + 1) + '' + pad(ahora.getDate());
    const hs = pad(ahora.getHours()) + '' + pad(ahora.getMinutes());
    const hoy = this.ds.S.dia;

    const mL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const activos = this.ds.S.vehiculos.filter((v: any) => v.est !== 'mantenimiento');
    const enRuta = activos.filter((v: any) => this.ds.S.viajes.some((vj: any) => vj.placa === v.p && vj.dia <= hoy && (vj.retorno || vj.dia) >= hoy));
    const disp = activos.filter((v: any) => !enRuta.find((x: any) => x.p === v.p) && this.conductorActivo(v));
    const vHoy = this.ds.S.viajes.filter((v: any) => v.dia === hoy);

    const q = (v: any) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = [
      [q('REPORTE DIARIO — RUTOGRAMA VEHICULAR MAKAND SAS')],
      [q('Fecha:'), q(ahora.toLocaleDateString('es-CO')), q(ahora.toLocaleTimeString('es-CO')), q('Mes:'), q(mL[this.ds.S.mes] + ' ' + this.ds.S.anio)],
      [],
      [q('RESUMEN DEL DIA')],
      [q('Activos'), q(activos.length), q('En ruta'), q(enRuta.length), q('Disponibles'), q(disp.length), q('Mantenimiento'), q(this.ds.S.vehiculos.filter((v: any) => v.est === 'mantenimiento').length)],
      [q('Viajes hoy'), q(vHoy.length), q('Urgentes'), q(this.ds.S.viajes.filter((v: any) => v.prioridad === 'urgente' && v.dia >= hoy && v.dia <= hoy + 2).length), q('Total mes'), q(this.ds.S.viajes.length), q('Costo mes'), q('$' + (this.ds.S.viajes.reduce((a: any, vj: any) => a + this.ds.tarifa(vj), 0) / 1e6).toFixed(0) + 'M')],
      [],
      [q('DISPONIBLES HOY')],
      [q('Placa'), q('Tipo'), q('Cajas'), q('Kg'), q('m3'), q('Conductor'), q('Transportadora')]
    ];

    disp.forEach((v: any) => {
      rows.push([q(v.p), q(v.t), q(v.cap), q(v.kg || ''), q(v.m3 || ''), q(v.cond), q(this.ds.tNom(v.tr))]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'Rutograma_Diario_' + fs + '_' + hs + '.csv';
    a.click();

    await this.ds.novedad('auto', 'Reporte diario descargado', ahora.toLocaleString('es-CO') + ' · ' + vHoy.length + ' viajes hoy');
  }

  public descargarRutograma(): void {
    const q = (v: any) => '"' + String(v || '').replace(/"/g, '""') + '"';
    const rows = [
      [q('RUTOGRAMA MES COMPLETO — MAKAND SAS')],
      [],
      [q('Placa'), q('Dia'), q('Ruta'), q('Destino'), q('Transportadora'), q('Cajas'), q('Kg'), q('m3'), q('Cliente'), q('Tipo'), q('Estado'), q('Costo')]
    ];

    const viajesOrdenados = [...this.ds.S.viajes].sort((a: any, b: any) => a.dia - b.dia);
    viajesOrdenados.forEach((vj: any) => {
      const r = this.ds.S.rutas.find((x: any) => x.cod === vj.ruta);
      rows.push([
        q(vj.placa), q(vj.dia), q(vj.ruta), q(r ? r.dest : ''), q(this.ds.tNom(vj.tr)),
        q(vj.cajas), q(vj.pesoKg || 0), q(vj.volM3 || 0), q(vj.cli), q(vj.tipo), q(vj.estado), q(this.ds.tarifa(vj))
      ]);
    });

    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
    a.download = `Rutograma_Mes_${this.ds.S.mes + 1}_${this.ds.S.anio}.csv`;
    a.click();
  }

  public zoomFontSize: number = 12;
  public cambiarZoom(delta: number): void {
    this.zoomFontSize = Math.max(7, Math.min(16, this.zoomFontSize + delta * 0.1));
  }
  public get zoomPorcentaje(): number {
    return Math.round((this.zoomFontSize / 12) * 100);
  }

  // --- LÓGICA DE ARMADO DEL MAPA DE VIAJES (sin filtrar por disponibilidad) ---
  procesarViajes() {
    this.viajesMap = {}; // Limpiar mapa anterior
    
    if (!this.viajes || this.viajes.length === 0) return;

    // 1. Clonar y asegurar orden cronológico real
    const viajesOrdenados = [...this.viajes].sort((a: any, b: any) => {
      const diaA = a.fecha ? parseInt(a.fecha.split('-')[2], 10) : parseInt(a.dia, 10);
      const diaB = b.fecha ? parseInt(b.fecha.split('-')[2], 10) : parseInt(b.dia, 10);
      return (diaA || 0) - (diaB || 0);
    });

    viajesOrdenados.forEach((v: any) => {
      const placa = String(v.placa || '').toUpperCase().trim();
      if (!placa) return;

      // Extracción segura del número de día para evitar NaN
      let diaViaje = 0;
      if (v.fecha && v.fecha.includes('-')) {
        diaViaje = parseInt(v.fecha.split('-')[2], 10);
      } else if (v.dia) {
        diaViaje = parseInt(v.dia, 10);
      }

      if (isNaN(diaViaje) || diaViaje <= 0) return; // Saltar registros corruptos

      // El descanso ya NO bloquea nada aquí — misma regla que ya se aplicó
      // en el resto de la app (agruparViajes, hayConflicto, el generador
      // del servidor): "Generar Matriz" nunca deja ese hueco al agendar, así
      // que exigirlo aquí escondía viajes reales que sí existen, causando
      // que el conteo del Dashboard ("viajes de la semana") saliera más
      // bajo que el del Rutograma para la misma semana.
      //
      // ANTES, aunque este comentario ya decía que el descanso no debía
      // bloquear nada, el código de abajo SÍ seguía condicionando que el
      // viaje se agregara al mapa (con la fórmula vieja "diaViaje +
      // diasTransReal", sin el +1 que se corrigió en rutograma_utils.js y
      // server.js) — así que varios viajes reales de la semana quedaban
      // descartados en silencio y nunca aparecían en "Próximas salidas".
      // Ahora se agrega SIEMPRE, sin ninguna condición de disponibilidad.

      // ESTRATEGIA MULTI-LLAVE: Guardamos el viaje de 3 formas para blindar el HTML
      const keySimple = `${placa}_${diaViaje}`;
      const keyPad = `${placa}_${String(diaViaje).padStart(2, '0')}`;

      this.viajesMap[keySimple] = v;
      this.viajesMap[keyPad] = v;

      if (v.fecha) {
        const keyFechaFull = `${placa}_${String(v.fecha).trim()}`;
        this.viajesMap[keyFechaFull] = v;
      }
    });
  }

  obtenerViajesRutograma() {
    // Esta función ya no procesa lógica pesada; se la dejamos al procesarViajes() de arriba.
    // Retornamos directamente los viajes filtrados.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    
    return this.viajesUnicos().filter((v: any) => {
        let fechaV;
        if (v.fecha && v.fecha.includes('-')) {
            fechaV = new Date(v.fecha + 'T00:00:00');
        } else {
            fechaV = new Date(this.ds.S.anio, this.ds.S.mes, v.dia);
        }
        return fechaV >= hoy;
    });
  }

  esViajeActivoHoy(v: any): boolean {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const fechaViaje = new Date(v.fecha);
    fechaViaje.setHours(0, 0, 0, 0);
    const estadoExcel = (v.estado || '').toLowerCase().trim();
    const esHoy = fechaViaje.getTime() === hoy.getTime();
    return (esHoy && estadoExcel !== 'entregado') || estadoExcel === 'en ruta';
  }

  obtenerTotalEnRutaAhora(): number {
    if (!this.viajes || this.viajes.length === 0) {
      return 0;
    }
    const anio = this.ds.S.anio;
    const mes = String(this.ds.S.mes + 1).padStart(2, '0');
    const dia = String(this.ds.getDIA()).padStart(2, '0');
    const hoyTexto = `${anio}-${mes}-${dia}`;
    const placasEnRuta = new Set<string>();

    this.viajes.forEach((v: any) => {
      const fechaViaje = (v.fecha || '').trim();
      const estadoExcel = (v.estado || '').toLowerCase().trim();
      const esDeHoy = fechaViaje === hoyTexto;
      const esEstadoValido = estadoExcel === 'planificado' || estadoExcel === 'en ruta';
      if (esDeHoy && esEstadoValido && v.placa) {
        placasEnRuta.add(v.placa.toString().trim().toUpperCase());
      }
    });
    return placasEnRuta.size;
  }

  private completarConductorViaje(viaje: any): any {
  if (!viaje) return viaje;

  // --- HORA: mismo cálculo que usa Rutograma (detectarConflictosDisponibilidad),
  // pero hecho aquí también para que el Dashboard no dependa de que esa
  // pantalla ya se haya visitado en la sesión (si nunca se calculó, vj.hora
  // no existe y esta tabla mostraba "--:--" aunque la ruta sí tuviera hora).
  if (!viaje.hora || viaje.hora === '--:--') {
    const codRuta = String(viaje.ruta || viaje.codigo || '').toUpperCase().trim();
    const rutaMaestra = (this.ds.S?.rutas || []).find((r: any) =>
      String(r.cod || r.codigo || '').toUpperCase().trim() === codRuta
    );
    const fechaViaje = this.obtenerFechaViaje(viaje);
    if (rutaMaestra && fechaViaje) {
      // Formato ACTUAL: rutaMaestra.dias es un objeto { lun: {checked, hora}, ... }
      // — el mismo que usa generar-matriz para decidir qué ruta corre cada día.
      const mapaDiasClave = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
      const claveDia = mapaDiasClave[fechaViaje.getDay()];
      const cfgDia = rutaMaestra.dias && typeof rutaMaestra.dias === 'object' ? rutaMaestra.dias[claveDia] : null;

      if (cfgDia && cfgDia.hora) {
        viaje.hora = cfgDia.hora;
      } else if (rutaMaestra.horaBase) {
        // Respaldo para rutas viejas que aún guardan el texto "Lu 08:00, Ma 09:00..."
        const diasMap = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
        const prefijo = diasMap[fechaViaje.getDay()];
        const regex = new RegExp(`${prefijo}\\s*(\\d{1,2}:\\d{2})`);
        const match = String(rutaMaestra.horaBase).match(regex);
        if (match) viaje.hora = match[1];
      }
    }
  }

  // Si el viaje ya tiene conductor, lo respetamos
  if (viaje.cond && String(viaje.cond).trim() !== '') {
    return viaje;
  }

  // Buscar el vehículo asociado al viaje
  const placaViaje = String(viaje.placa || viaje.p || '')
    .trim()
    .toUpperCase();

  if (!placaViaje) {
    return viaje;
  }

  const vehiculo = (this.ds.S?.vehiculos || []).find((v: any) => {
    const placaVehiculo = String(v.p || '')
      .trim()
      .toUpperCase();

    return placaVehiculo === placaViaje;
  });

  // Si el vehículo tiene conductor asignado
  if (vehiculo?.cond && String(vehiculo.cond).trim() !== '') {
    viaje.cond = vehiculo.cond;
  }

  return viaje;
}

  // --- LA FUNCIÓN CORREGIDA Y ULTRARRÁPIDA ---
  buscarViaje(placa: string, fechaISO: any): any {
    const p = String(placa || '').toUpperCase().trim();
    const f = String(fechaISO || '').trim();
    // this.viajes ya son los viajes reales de la semana (agrupados por el
    // mismo agruparViajes del Rutograma). Buscamos por placa y fecha.
    return this.viajes.find((vj: any) => {
      const vp = String(vj.p || vj.placa || '').toUpperCase().trim();
      const vf = vj.fecha || this.aISO(new Date(this.ds.S.anio, this.ds.S.mes, Number(vj.dia)));
      return vp === p && vf === f;
    });
  }

}