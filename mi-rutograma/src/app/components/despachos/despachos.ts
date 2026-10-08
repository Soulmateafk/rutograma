import { ChangeDetectorRef, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

type Periodo = 'dia' | 'semana' | 'mes';

/** Tipos de carga (igual que backend/despachos.js; el servidor manda la lista). Las estibas no son cajas. */
const TIPOS_CARGA = [
  'Makand x25', 'Makand x13', 'Cajas de espinaca', 'Cajas cargadas Olímpica', 'Cajas cargadas Gabriel',
  'Alkosto', 'Mario', 'Azul Makand', 'Rojas Makand', 'Ifco x25', 'Ifco x18', 'Ifco x13',
  'Cajas cartón tomate', 'Cajones', 'Estibas'
];
const NO_SON_CAJAS = ['Estibas'];
const CLAVE_DESPACHADOR = 'despachos-nombre';
// Sin señal: lo anotado espera en este celular (localStorage) y se envía
// solo cuando vuelve la conexión. También se guarda lo último que llegó
// del servidor (vehículos, viajes, límite) para poder llenar el formulario.
const CLAVE_PENDIENTES = 'despachos-pendientes-v1';
const CLAVE_OPCIONES = 'despachos-opciones-v1';
const CLAVE_CONFIG = 'despachos-config-v1';
const MOTIVOS_DEMORA = [
  'Esperando producto', 'Producto en alistamiento o calidad', 'Falta de personal', 'Montacargas o equipo dañado',
  'El vehículo llegó tarde o sin turno', 'Documentos o facturación', 'Problema con el vehículo', 'Clima', 'Otro'
];

/** Algo anotado sin conexión, esperando a enviarse. */
interface Pendiente { clave: string; ruta: string; cuerpo: any; descripcion: string; creadoEn: string; }

const leerLocal = (clave: string, porDefecto: any): any => {
  try { const t = localStorage.getItem(clave); return t ? JSON.parse(t) : porDefecto; } catch { return porDefecto; }
};
const guardarLocal = (clave: string, valor: any): void => {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* sin almacenamiento */ }
};
const nuevoId = (): string => {
  try { if (typeof crypto !== 'undefined' && (crypto as any).randomUUID) return (crypto as any).randomUUID(); } catch { /* nada */ }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

/** Minutos desde una fecha y hora (AAAA-MM-DD, HH:MM) hasta ahora. */
const minutosDesde = (fecha: string, hora: string, ahora = Date.now()): number | null => {
  const [a, m, d] = String(fecha).split('-').map(Number);
  const [hh, mm] = String(hora || '').split(':').map(Number);
  if (!a || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return Math.round((ahora - new Date(a, m - 1, d, hh, mm).getTime()) / 60000);
};
const minutosEntre = (desde: string, hasta: string): number | null => {
  if (!/^\d{2}:\d{2}$/.test(desde || '') || !/^\d{2}:\d{2}$/.test(hasta || '')) return null;
  const [a, b] = desde.split(':').map(Number), [c, e] = hasta.split(':').map(Number);
  let m = (c * 60 + e) - (a * 60 + b);
  if (m < 0) m += 24 * 60;
  return m;
};

interface Carga { tipo: string; cantidad: string; }

interface Formulario {
  id: number | null;
  fecha: string;
  despachador: string;
  horaProgramada: string;
  horaLlegada: string;
  horaInicioCargue: string;
  horaSalida: string;
  ruta: string;
  cargas: Carga[];
  placa: string;
  viajeId: string;          // '' = sin escoger, 'otro' = otro lugar
  destino: string;
  horaFinCargue: string;
  observacion: string;
  motivoDemora: string;
  motivoDemoraDetalle: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const hoyTexto = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const horaAhora = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const pegada = (p: any) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * DESPACHOS — a qué hora llega cada vehículo a cargar, a qué viaje (o
 * lugar) va y a qué hora terminó de cargar. La usa la cuenta compartida de
 * despachos (solo ve esta pantalla, sin menú) y la oficina. Abajo, el
 * registro por día, semana o mes, con su Excel. Ver backend/despachos.js.
 */
@Component({
  selector: 'app-despachos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './despachos.html',
  styleUrls: ['./despachos.css']
})
export class DespachosComponent implements OnInit, OnDestroy {
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  // Formulario
  form: Formulario = this.formVacio();
  guardando = false;
  tiposCarga: string[] = TIPOS_CARGA;
  listaCargaAbierta = false;
  /** Se intentó guardar: se marcan en rojo las cantidades que faltan. */
  intentoGuardar = false;
  vehiculos: Array<{ placa: string; conductor: string }> = [];
  viajes: any[] = [];
  private fechaOpciones = '';

  // Registro
  periodo: Periodo = 'dia';
  fechaVer = hoyTexto();
  registros: any[] = [];
  resumen: any = { total: 0, enCargue: 0, terminados: 0, promedioMin: null, maximoMin: null };
  meses: Array<{ mes: string; total: number }> = [];
  desde = '';
  hasta = '';
  hoy = hoyTexto();
  cargando = true;
  descargando: Periodo | null = null;
  enCargue: any[] = [];
  terminandoId: number | null = null;
  aBorrar: any = null;

  private reloj: ReturnType<typeof setInterval> | null = null;

  // Cargue demorado: límite (minutos) y motivos. Los manda el servidor.
  limiteMin = 90;
  motivosDemora: string[] = MOTIVOS_DEMORA;
  puedeCambiarLimite = false;
  limiteEditando: number | null = null;
  /** Ventana "¿Por qué se demoró?" al tocar "Terminó de cargar" pasado el límite. */
  demora: { r: any; minutos: number; motivo: string; detalle: string; intento: boolean } | null = null;

  // Sin conexión
  enLinea = typeof navigator === 'undefined' ? true : navigator.onLine;
  pendientes: Pendiente[] = [];
  rechazados: Array<{ descripcion: string; msg: string }> = [];
  private enviandoCola = false;
  private alCambiarConexion = () => {
    this.enLinea = navigator.onLine;
    if (this.enLinea) this.procesarCola();
    this.cdr.markForCheck();
  };

  get esCuentaDespachos(): boolean { return this.auth.esDespachos; }
  /** La cuenta de despachos anota con fecha de hoy o de ayer (la oficina, cualquiera). */
  get fechaMinima(): string {
    if (!this.esCuentaDespachos) return '';
    const d = new Date(); d.setDate(d.getDate() - 1);
    return hoyTexto(d);
  }

  ngOnInit(): void {
    if (!this.esNavegador) return;
    this.form.despachador = this.nombreRecordado();
    this.pendientes = leerLocal(CLAVE_PENDIENTES, []);
    const config = leerLocal(CLAVE_CONFIG, null);
    if (config?.limiteMin) this.limiteMin = config.limiteMin;
    if (Array.isArray(config?.motivosDemora) && config.motivosDemora.length) this.motivosDemora = config.motivosDemora;
    window.addEventListener('online', this.alCambiarConexion);
    window.addEventListener('offline', this.alCambiarConexion);
    this.cargarOpciones();
    this.cargarRegistro();
    this.procesarCola();
    // Se refresca solo (otro equipo pudo anotar algo). Si hay un formulario
    // a medio llenar, no se toca: solo cambian las listas.
    this.reloj = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.procesarCola();
      this.cargarRegistro(true);
      if (hoyTexto() !== this.hoy) this.cargarOpciones();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.alCambiarConexion);
      window.removeEventListener('offline', this.alCambiarConexion);
    }
  }

  // ---------- Sin conexión: cola de envíos ----------

  private guardarCola(): void {
    guardarLocal(CLAVE_PENDIENTES, this.pendientes);
  }

  /**
   * Envía; si no hay señal (el pedido ni siquiera llega al servidor), lo
   * deja en la cola de este celular. Una corrección del mismo registro
   * reemplaza la que ya esperaba (queda la última).
   */
  private async enviarOEncolar(ruta: string, cuerpo: any, descripcion: string): Promise<{ data?: any; encolado?: boolean }> {
    try {
      return { data: await this.enviar(ruta, cuerpo) };
    } catch {
      const clave = cuerpo.id ? `id:${cuerpo.id}` : `nuevo:${cuerpo.clienteId}`;
      this.pendientes = [...this.pendientes.filter(p => p.clave !== clave), { clave, ruta, cuerpo, descripcion, creadoEn: new Date().toISOString() }];
      this.guardarCola();
      this.enLinea = false;
      return { encolado: true };
    }
  }

  /** Manda lo que quedó sin enviar, en el orden en que se anotó. */
  async procesarCola(): Promise<void> {
    if (this.enviandoCola || !this.pendientes.length) return;
    this.enviandoCola = true;
    let enviados = 0;
    while (this.pendientes.length) {
      const p = this.pendientes[0];
      let data: any;
      try {
        data = await this.enviar(p.ruta, p.cuerpo);
      } catch {
        break; // sigue sin señal: se intenta en el próximo aviso
      }
      this.pendientes = this.pendientes.slice(1);
      if (data?.ok) enviados++;
      else this.rechazados = [...this.rechazados, { descripcion: p.descripcion, msg: data?.msg || 'El servidor no lo aceptó.' }];
      this.guardarCola();
    }
    this.enviandoCola = false;
    if (enviados) {
      this.enLinea = true;
      this.ui.mostrarToast(`<i class="bi bi-cloud-check"></i> Volvió la conexión: se ${enviados === 1 ? 'envió 1 despacho' : `enviaron ${enviados} despachos`} que estaban en este celular.`, 'ok');
      await this.cargarRegistro(true);
    }
    this.cdr.markForCheck();
  }

  descartarRechazados(): void {
    this.rechazados = [];
  }

  /** "En el cargue" con lo que espera en la cola (registros nuevos y correcciones sin enviar). */
  get enCargueVista(): any[] {
    const porId = new Map(this.pendientes.filter(p => p.cuerpo.id).map(p => [p.cuerpo.id, p.cuerpo]));
    const delServidor = this.enCargue.map(r => porId.has(r.id) ? { ...r, ...porId.get(r.id), pendiente: true } : r);
    const nuevos = this.pendientes.filter(p => !p.cuerpo.id && p.ruta === '').map(p => ({ ...p.cuerpo, pendiente: true, puedeCorregir: true }));
    return [...delServidor, ...nuevos].filter(r => !r.horaFinCargue || !r.horaSalida);
  }

  // ---------- Cargue demorado ----------

  /** Minutos que lleva cargando (desde el inicio de cargue o la llegada); null si ya terminó. */
  minutosEnCargue(r: any): number | null {
    if (r.horaFinCargue) return null;
    return minutosDesde(r.fecha, r.horaInicioCargue || r.horaLlegada);
  }

  estaDemorado(r: any): boolean {
    const m = this.minutosEnCargue(r);
    return m !== null && m > this.limiteMin;
  }

  /** Minutos de cargue del formulario (inicio o llegada hasta fin). */
  get minutosForm(): number | null {
    return minutosEntre(this.form.horaInicioCargue || this.form.horaLlegada, this.form.horaFinCargue);
  }

  /** El cargue del formulario pasó del límite: hay que decir por qué. */
  get pideMotivo(): boolean {
    const m = this.minutosForm;
    return m !== null && m > this.limiteMin;
  }

  async guardarLimite(): Promise<void> {
    const minutos = Number(this.limiteEditando);
    if (!(minutos >= 10 && minutos <= 600)) { this.ui.mostrarToast('Escribe un límite entre 10 y 600 minutos.', 'err'); return; }
    try {
      const data = await this.enviar('/limite', { minutos });
      if (data?.ok) {
        this.limiteMin = data.limiteMin;
        this.limiteEditando = null;
        guardarLocal(CLAVE_CONFIG, { limiteMin: this.limiteMin, motivosDemora: this.motivosDemora });
        this.ui.mostrarToast(`Listo: se pide motivo cuando el cargue pasa de ${this.textoMinutos(this.limiteMin)}.`, 'ok');
      } else this.ui.mostrarToast(data?.msg || 'No se pudo cambiar el límite.', 'err');
    } catch {
      this.ui.mostrarToast('Sin conexión: no se cambió el límite.', 'err');
    }
    this.cdr.markForCheck();
  }

  private formVacio(): Formulario {
    return {
      id: null, fecha: hoyTexto(), despachador: this.nombreRecordado(), horaProgramada: '', horaLlegada: horaAhora(), horaInicioCargue: '',
      horaSalida: '', ruta: '', cargas: [], placa: '', viajeId: '', destino: '', horaFinCargue: '', observacion: '',
      motivoDemora: '', motivoDemoraDetalle: ''
    };
  }

  /** El nombre de quien despacha se recuerda en este equipo (no hay que escribirlo cada vez). */
  private nombreRecordado(): string {
    try { return localStorage.getItem(CLAVE_DESPACHADOR) || ''; } catch { return ''; }
  }

  // ---------- Carga: varios tipos, cada uno con su cantidad ----------

  estaEscogido(tipo: string): boolean {
    return this.form.cargas.some(c => c.tipo === tipo);
  }

  /** Marcar o desmarcar un tipo en la lista (desmarcar = "me equivoqué"). */
  alternarTipo(tipo: string): void {
    if (this.estaEscogido(tipo)) this.quitarTipo(tipo);
    else this.form.cargas = [...this.form.cargas, { tipo, cantidad: '' }];
  }

  quitarTipo(tipo: string): void {
    this.form.cargas = this.form.cargas.filter(c => c.tipo !== tipo);
  }

  /** Solo números: se borra al instante cualquier otra cosa. */
  soloNumeros(c: Carga, valor: string, input: HTMLInputElement): void {
    const limpio = String(valor || '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 6);
    c.cantidad = limpio;
    if (input.value !== limpio) input.value = limpio;
  }

  /** Bloquea letras y signos al teclear (también "e", "+", "-", "." que un campo numérico sí deja). */
  teclaNumerica(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.key.length > 1) return; // flechas, borrar, tab, pegar...
    if (!/^\d$/.test(ev.key)) ev.preventDefault();
  }

  faltaCantidad(c: Carga): boolean {
    return !(Number(c.cantidad) > 0);
  }

  get cargasSinCantidad(): Carga[] {
    return this.form.cargas.filter(c => this.faltaCantidad(c));
  }

  get totalCajas(): number {
    return this.form.cargas.filter(c => !NO_SON_CAJAS.includes(c.tipo)).reduce((s, c) => s + (Number(c.cantidad) || 0), 0);
  }

  get totalEstibas(): number {
    return this.form.cargas.filter(c => NO_SON_CAJAS.includes(c.tipo)).reduce((s, c) => s + (Number(c.cantidad) || 0), 0);
  }

  textoCarga(r: any): string {
    return (r.cargas || []).map((c: any) => `${c.tipo}: ${c.cantidad}`).join(' · ');
  }

  // ---------- Opciones: vehículos y viajes ----------

  async cargarOpciones(): Promise<void> {
    const fecha = this.form.fecha || hoyTexto();
    this.fechaOpciones = fecha;
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/despachos/opciones?fecha=${fecha}`);
      const data = await res.json();
      if (data?.ok && this.fechaOpciones === fecha) {
        this.vehiculos = data.vehiculos || [];
        this.viajes = data.viajes || [];
        if (Array.isArray(data.tiposCarga) && data.tiposCarga.length) this.tiposCarga = data.tiposCarga;
        guardarLocal(CLAVE_OPCIONES, { fecha, vehiculos: this.vehiculos, viajes: this.viajes, tiposCarga: this.tiposCarga });
      }
    } catch {
      // Sin conexión: lo último que llegó (las placas y los viajes de esos días).
      const guardadas = leerLocal(CLAVE_OPCIONES, null);
      if (guardadas && !this.vehiculos.length) {
        this.vehiculos = guardadas.vehiculos || [];
        this.viajes = guardadas.viajes || [];
        if (guardadas.tiposCarga?.length) this.tiposCarga = guardadas.tiposCarga;
      }
    }
    this.cdr.markForCheck();
  }

  cambioFecha(): void {
    if (this.form.fecha !== this.fechaOpciones) this.cargarOpciones();
  }

  /** Viajes para escoger: los del vehículo escrito; si no hay vehículo, los de ese día y el siguiente. */
  get viajesParaEscoger(): any[] {
    const placa = pegada(this.form.placa);
    if (placa) {
      const suyos = this.viajes.filter(v => pegada(v.placa) === placa);
      if (suyos.length) return suyos;
    }
    const fecha = this.form.fecha;
    const siguiente = (() => { const [a, m, d] = fecha.split('-').map(Number); return hoyTexto(new Date(a, m - 1, d + 1)); })();
    return this.viajes.filter(v => v.fecha === fecha || v.fecha === siguiente);
  }

  get vehiculoSinViajes(): boolean {
    const placa = pegada(this.form.placa);
    return !!placa && !this.viajes.some(v => pegada(v.placa) === placa);
  }

  etiquetaViaje(v: any): string {
    const [a, m, d] = String(v.fecha).split('-').map(Number);
    const f = new Date(a, m - 1, d);
    const destino = v.destino ? ` → ${v.destino}` : '';
    return `${DIAS[f.getDay()]} ${d} · ${v.ruta || 'Viaje'}${destino}${v.hora && v.hora !== '--:--' ? ' · ' + v.hora : ''} · ${v.placa}${v.cliente ? ' · ' + v.cliente : ''}`;
  }

  /** Al escoger un viaje: el lugar es su destino y el vehículo, el del viaje. */
  escogioViaje(): void {
    if (this.form.viajeId === 'otro' || !this.form.viajeId) {
      if (this.form.viajeId === 'otro') { this.form.destino = ''; this.form.ruta = ''; }
      this.sugerida = null;
      return;
    }
    const v = this.viajes.find(x => String(x.id) === this.form.viajeId);
    if (!v) return;
    this.form.destino = v.destino || v.ruta || '';
    this.form.ruta = v.ruta || '';
    // La hora programada del viaje (se puede cambiar).
    if (v.hora && v.hora !== '--:--') this.form.horaProgramada = v.hora;
    if (pegada(v.placa) !== pegada(this.form.placa)) this.form.placa = v.placa;
    this.buscarCargaSugerida();
  }

  // ---------- Carga sugerida (la de la última vez para ese viaje) ----------

  sugerida: any = null;

  /** Busca la carga de la última vez para la ruta/destino del viaje escogido (ver backend cargaSugerida). */
  async buscarCargaSugerida(): Promise<void> {
    this.sugerida = null;
    const ruta = this.form.ruta, destino = this.form.destino, fecha = this.form.fecha;
    if (!ruta && !destino) return;
    try {
      const q = new URLSearchParams({ ruta, destino, fecha, ...(this.form.id ? { excluir: String(this.form.id) } : {}) });
      const res = await this.auth.fetchAutenticado(`${API_URL}/despachos/carga-sugerida?${q}`);
      const data = await res.json();
      // Si mientras tanto se escogió otro viaje, esta respuesta ya no aplica.
      if (data?.ok && this.form.ruta === ruta && this.form.destino === destino) this.sugerida = data.sugerida;
    } catch { /* sin conexión: se escribe la carga a mano */ }
    this.cdr.markForCheck();
  }

  /** Pone la carga sugerida en el formulario (se puede corregir antes de guardar). */
  usarSugerida(): void {
    if (!this.sugerida) return;
    this.form.cargas = this.sugerida.cargas.map((c: any) => ({ tipo: c.tipo, cantidad: String(c.cantidad) }));
    this.listaCargaAbierta = false;
    this.ui.mostrarToast('Listo: revisa las cantidades y corrige lo que cambió.', 'ok');
  }

  textoCriterio(s: any): string {
    return s.criterio === 'mismo día' ? `misma ruta, el ${String(s.dia).toLowerCase()} anterior`
      : s.criterio === 'misma ruta' ? 'misma ruta' : 'mismo destino';
  }

  /** Cajas que tenía programadas el viaje escogido. */
  get cajasProgramadas(): number | null {
    const v = this.viajes.find(x => String(x.id) === this.form.viajeId);
    return v?.cajas ? Number(v.cajas) : null;
  }

  /** Si cambia el vehículo y el viaje escogido era de otro, se suelta. */
  cambioPlaca(): void {
    this.form.placa = this.form.placa.toUpperCase();
    const v = this.viajes.find(x => String(x.id) === this.form.viajeId);
    if (v && pegada(v.placa) !== pegada(this.form.placa)) { this.form.viajeId = ''; this.form.destino = ''; this.form.ruta = ''; }
  }

  conductorDe(placa: string): string {
    return this.vehiculos.find(v => pegada(v.placa) === pegada(placa))?.conductor || '';
  }

  ahora(campo: 'horaLlegada' | 'horaInicioCargue' | 'horaFinCargue' | 'horaSalida' | 'horaProgramada'): void {
    this.form[campo] = horaAhora();
  }

  // ---------- Guardar ----------

  async guardar(): Promise<void> {
    if (this.guardando) return;
    const f = this.form;
    this.intentoGuardar = true;
    const faltan = [
      !f.despachador.trim() && 'el nombre de quien despacha', !f.horaLlegada && 'la hora de llegada',
      !f.placa.trim() && 'el vehículo', !f.destino.trim() && 'a qué lugar se dirige'
    ].filter(Boolean);
    // Cada tipo de carga escogido tiene que llevar su cantidad: si no, no se envía.
    const sinCantidad = this.cargasSinCantidad.map(c => c.tipo);
    if (sinCantidad.length) faltan.push(`la cantidad de ${sinCantidad.join(', ')}`);
    // Cargue que pasó del límite: el motivo es obligatorio.
    if (this.pideMotivo && !f.motivoDemora) faltan.push(`el motivo de la demora (el cargue tardó ${this.textoMinutos(this.minutosForm)}, más de ${this.textoMinutos(this.limiteMin)})`);
    else if (this.pideMotivo && f.motivoDemora === 'Otro' && !f.motivoDemoraDetalle.trim()) faltan.push('cuál fue el motivo de la demora');
    if (faltan.length) {
      this.ui.mostrarToast(`Falta ${faltan.join('; ')}.${sinCantidad.length ? ' Si escogiste un tipo por error, quítalo con la ✕.' : ''}`, 'err');
      return;
    }
    const viaje = this.viajes.find(x => String(x.id) === f.viajeId);
    const cuerpo = {
      id: f.id, fecha: f.fecha, placa: f.placa.trim(), destino: f.destino.trim(),
      despachador: f.despachador.trim(), horaProgramada: f.horaProgramada, horaInicioCargue: f.horaInicioCargue, horaSalida: f.horaSalida,
      cargas: f.cargas.map(c => ({ tipo: c.tipo, cantidad: c.cantidad })),
      horaLlegada: f.horaLlegada, horaFinCargue: f.horaFinCargue, observacion: f.observacion,
      motivoDemora: this.pideMotivo ? f.motivoDemora : '', motivoDemoraDetalle: this.pideMotivo ? f.motivoDemoraDetalle.trim() : '',
      // Identificador del celular: si se reenvía (sin señal), no se duplica.
      clienteId: f.id ? undefined : nuevoId(),
      viajeId: viaje ? viaje.id : null,
      ruta: viaje?.ruta || f.ruta.trim(), conductor: viaje?.conductor || this.conductorDe(f.placa)
    };
    try { localStorage.setItem(CLAVE_DESPACHADOR, cuerpo.despachador); } catch { /* sin almacenamiento: se escribe cada vez */ }
    this.guardando = true;
    try {
      const { data, encolado } = await this.enviarOEncolar('', cuerpo, `${cuerpo.placa} hacia ${cuerpo.destino} (llegó ${cuerpo.horaLlegada})`);
      if (encolado) {
        this.ui.mostrarToast(`<i class="bi bi-wifi-off"></i> Sin conexión: ${cuerpo.placa} quedó guardado en este celular y se enviará solo cuando vuelva la señal.`, 'info');
        const fecha = f.fecha;
        this.intentoGuardar = false;
        this.listaCargaAbierta = false;
        this.form = this.formVacio();
        this.form.fecha = fecha;
      } else if (data?.ok) {
        const r = data.registro;
        this.ui.mostrarToast((f.id ? `Corregido: ${r.placa}.`
          : r.horaFinCargue ? `Anotado: ${r.placa} hacia ${r.destino}, cargó en ${this.textoMinutos(r.minutos)}.`
            : `Anotado: ${r.placa} llegó a las ${r.horaLlegada}. Cuando termine de cargar, toca "Terminó de cargar".`)
          + (data.viajeEnRuta ? ' El viaje quedó "En ruta" en el Rutograma.' : ''), 'ok');
        this.sugerida = null;
        const fecha = f.fecha;
        this.intentoGuardar = false;
        this.listaCargaAbierta = false;
        this.form = this.formVacio();
        this.form.fecha = fecha;
        if (fecha !== this.fechaOpciones) this.cargarOpciones();
        await this.cargarRegistro(true);
      } else {
        this.ui.mostrarToast(data?.msg || 'No se pudo guardar.', 'err');
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se guardó. Inténtalo de nuevo.', 'err');
    }
    this.guardando = false;
    this.cdr.markForCheck();
  }

  private async enviar(ruta: string, cuerpo: any): Promise<any> {
    const res = await this.auth.fetchAutenticado(`${API_URL}/despachos${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    });
    return res.json();
  }

  /** Ese vehículo se está guardando (los anotados sin señal no tienen id todavía). */
  guardandoPaso(r: any): boolean {
    return this.terminandoId !== null && !!r.id && this.terminandoId === r.id;
  }

  /** Siguiente paso de un vehículo en el cargue: empezó a cargar, terminó o salió. */
  siguientePaso(r: any): { campo: 'horaInicioCargue' | 'horaFinCargue' | 'horaSalida'; texto: string } {
    if (!r.horaInicioCargue && !r.horaFinCargue) return { campo: 'horaInicioCargue', texto: 'Empezó a cargar' };
    if (!r.horaFinCargue) return { campo: 'horaFinCargue', texto: 'Terminó de cargar' };
    return { campo: 'horaSalida', texto: 'Salió' };
  }

  /**
   * Botón rápido: pone la hora de ahora en el siguiente paso del vehículo.
   * Si termina de cargar pasado el límite, primero pide el motivo.
   */
  async terminarCargue(r: any): Promise<void> {
    if (this.terminandoId) return;
    const paso = this.siguientePaso(r);
    if (paso.campo === 'horaFinCargue') {
      const minutos = minutosEntre(r.horaInicioCargue || r.horaLlegada, horaAhora());
      if (minutos !== null && minutos > this.limiteMin) {
        this.demora = { r, minutos, motivo: '', detalle: '', intento: false };
        return;
      }
    }
    await this.aplicarPaso(r, {});
  }

  async confirmarDemora(): Promise<void> {
    const d = this.demora;
    if (!d) return;
    d.intento = true;
    if (!d.motivo || (d.motivo === 'Otro' && !d.detalle.trim())) return;
    this.demora = null;
    await this.aplicarPaso(d.r, { motivoDemora: d.motivo, motivoDemoraDetalle: d.detalle.trim() });
  }

  private async aplicarPaso(r: any, extra: any): Promise<void> {
    const paso = this.siguientePaso(r);
    const ahora = horaAhora();
    // Anotado sin señal y todavía sin enviar: se completa en la cola.
    if (r.pendiente && !r.id) {
      const p = this.pendientes.find(x => x.cuerpo.clienteId === r.clienteId);
      if (p) { p.cuerpo = { ...p.cuerpo, [paso.campo]: ahora, ...extra }; this.guardarCola(); }
      this.ui.mostrarToast(`<i class="bi bi-wifi-off"></i> ${r.placa}: guardado en este celular (${paso.texto.toLowerCase()} ${ahora}). Se enviará cuando vuelva la señal.`, 'info');
      this.cdr.markForCheck();
      return;
    }
    this.terminandoId = r.id;
    try {
      const { pendiente, puedeCorregir, puedeEliminar, minutos, totalCajas, totalEstibas, creadoPorNombre, editadoPorNombre, ...limpio } = r;
      const { data, encolado } = await this.enviarOEncolar('', { ...limpio, [paso.campo]: ahora, ...extra }, `${r.placa}: ${paso.texto.toLowerCase()} ${ahora}`);
      if (encolado) {
        this.ui.mostrarToast(`<i class="bi bi-wifi-off"></i> Sin conexión: ${r.placa} (${paso.texto.toLowerCase()} ${ahora}) quedó en este celular y se enviará solo.`, 'info');
      } else if (data?.ok) {
        const g = data.registro;
        this.ui.mostrarToast(paso.campo === 'horaInicioCargue' ? `${r.placa} empezó a cargar a las ${g.horaInicioCargue}.`
          : paso.campo === 'horaFinCargue' ? `${r.placa} terminó de cargar a las ${g.horaFinCargue} (${this.textoMinutos(g.minutos)}).`
            : `${r.placa} salió a las ${g.horaSalida}.${data.viajeEnRuta ? ' El viaje quedó "En ruta" en el Rutograma.' : ''}`, 'ok');
        await this.cargarRegistro(true);
      } else {
        this.ui.mostrarToast(data?.msg || 'No se pudo guardar.', 'err');
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se guardó. Inténtalo de nuevo.', 'err');
    }
    this.terminandoId = null;
    this.cdr.markForCheck();
  }

  corregir(r: any): void {
    this.intentoGuardar = false;
    this.form = {
      motivoDemora: r.motivoDemora || '', motivoDemoraDetalle: r.motivoDemoraDetalle || '',
      id: r.id, fecha: r.fecha, horaLlegada: r.horaLlegada, placa: r.placa,
      despachador: r.despachador || this.nombreRecordado(), horaProgramada: r.horaProgramada || '', horaInicioCargue: r.horaInicioCargue || '',
      horaSalida: r.horaSalida || '', ruta: r.ruta || '', cargas: (r.cargas || []).map((c: any) => ({ tipo: c.tipo, cantidad: String(c.cantidad) })),
      viajeId: r.viajeId ? String(r.viajeId) : 'otro', destino: r.destino,
      horaFinCargue: r.horaFinCargue || '', observacion: r.observacion || ''
    };
    this.cargarOpciones();
    this.buscarCargaSugerida();
    document.querySelector('.dp-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  cancelarCorreccion(): void {
    this.intentoGuardar = false;
    this.sugerida = null;
    this.form = this.formVacio();
    this.cargarOpciones();
  }

  async borrar(): Promise<void> {
    const r = this.aBorrar;
    this.aBorrar = null;
    if (!r) return;
    try {
      const data = await this.enviar('/eliminar', { id: r.id });
      this.ui.mostrarToast(data?.ok ? `Se borró el despacho de ${r.placa}.` : (data?.msg || 'No se pudo borrar.'), data?.ok ? 'ok' : 'err');
      if (data?.ok) {
        if (this.form.id === r.id) this.form = this.formVacio();
        await this.cargarRegistro(true);
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se borró.', 'err');
    }
    this.cdr.markForCheck();
  }

  // ---------- Registro ----------

  async cargarRegistro(silencioso = false): Promise<void> {
    if (!silencioso) { this.cargando = true; this.cdr.markForCheck(); }
    try {
      const [res, resHoy] = await Promise.all([
        this.auth.fetchAutenticado(`${API_URL}/despachos?periodo=${this.periodo}&fecha=${this.fechaVer}`),
        // "Cargando ahora": de ayer y hoy, sin importar qué periodo se esté mirando.
        this.auth.fetchAutenticado(`${API_URL}/despachos?desde=${this.ayer()}&hasta=${hoyTexto()}`)
      ]);
      const [data, dataHoy] = await Promise.all([res.json(), resHoy.json()]);
      if (data?.ok) {
        this.registros = data.registros || [];
        this.resumen = data.resumen;
        this.meses = data.meses || [];
        this.desde = data.desde;
        this.hasta = data.hasta;
        this.hoy = data.hoy || hoyTexto();
        if (data.limiteMin) this.limiteMin = data.limiteMin;
        if (Array.isArray(data.motivosDemora) && data.motivosDemora.length) this.motivosDemora = data.motivosDemora;
        this.puedeCambiarLimite = !!data.puedeCambiarLimite;
        guardarLocal(CLAVE_CONFIG, { limiteMin: this.limiteMin, motivosDemora: this.motivosDemora });
      } else if (!silencioso) {
        this.ui.mostrarToast(data?.msg || 'No se pudo cargar el registro.', 'err');
      }
      if (dataHoy?.ok) {
        // Siguen en el cargue: sin terminar de cargar, o cargados y sin salir.
        this.enCargue = (dataHoy.registros || []).filter((r: any) => !r.horaFinCargue || !r.horaSalida)
          .sort((a: any, b: any) => (a.fecha + a.horaLlegada).localeCompare(b.fecha + b.horaLlegada));
      }
    } catch {
      if (!silencioso) this.ui.mostrarToast('Sin conexión con el servidor.', 'err');
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  private ayer(): string {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return hoyTexto(d);
  }

  verPeriodo(p: Periodo): void {
    this.periodo = p;
    this.cargarRegistro();
  }

  verMes(mes: string): void {
    this.periodo = 'mes';
    this.fechaVer = `${mes}-01`;
    this.cargarRegistro();
  }

  moverPeriodo(paso: number): void {
    const [a, m, d] = this.fechaVer.split('-').map(Number);
    const f = this.periodo === 'mes' ? new Date(a, m - 1 + paso, 1)
      : new Date(a, m - 1, d + (this.periodo === 'semana' ? 7 : 1) * paso);
    this.fechaVer = hoyTexto(f);
    this.cargarRegistro();
  }

  irAHoy(): void {
    this.fechaVer = hoyTexto();
    this.cargarRegistro();
  }

  get tituloPeriodo(): string {
    if (!this.desde) return '';
    if (this.periodo === 'mes') { const [a, m] = this.desde.split('-').map(Number); return `${MESES[m - 1]} ${a}`; }
    if (this.periodo === 'semana') return `Semana del ${this.fechaCorta(this.desde)} al ${this.fechaCorta(this.hasta)}`;
    return this.desde === this.hoy ? `Hoy, ${this.fechaCorta(this.desde)}` : this.fechaCorta(this.desde, true);
  }

  nombreMes(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    return `${MESES[m - 1].slice(0, 3)} ${a}`;
  }

  fechaCorta(fecha: string, conDia = false): string {
    const [a, m, d] = String(fecha).split('-').map(Number);
    if (!d) return fecha;
    const f = new Date(a, m - 1, d);
    return `${conDia ? DIAS[f.getDay()] + ' ' : ''}${pad(d)}/${pad(m)}/${a}`;
  }

  textoMinutos(m: number | null | undefined): string {
    if (m === null || m === undefined || !isFinite(m)) return '';
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    if (!h) return `${r} min`;
    return r ? `${h} h ${r} min` : `${h} h`;
  }

  /** Cuánto lleva cargando un vehículo que todavía no termina (desde el inicio de cargue o la llegada). */
  llevaCargando(r: any): string {
    const min = this.minutosEnCargue(r);
    return min !== null && min >= 0 ? this.textoMinutos(min) : '';
  }

  /** Pasó la medianoche: terminó "antes" de la hora de llegada. */
  pasoMedianoche(r: any): boolean {
    return !!r.horaFinCargue && r.horaFinCargue < r.horaLlegada;
  }

  // ---------- Excel ----------

  async descargarExcel(periodo: Periodo): Promise<void> {
    if (this.descargando) return;
    this.descargando = periodo;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/despachos/excel?periodo=${periodo}&fecha=${this.fechaVer}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const nombre = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || `Despachos_${periodo}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
      this.ui.mostrarToast('No se pudo descargar el Excel.', 'err');
    }
    this.descargando = null;
    this.cdr.markForCheck();
  }

  async salir(): Promise<void> {
    await this.auth.cerrarSesion();
  }

  trackId = (_: number, r: any) => r.id ?? r.clienteId;
}
