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
    this.cargarOpciones();
    this.cargarRegistro();
    // Se refresca solo (otro equipo pudo anotar algo). Si hay un formulario
    // a medio llenar, no se toca: solo cambian las listas.
    this.reloj = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      this.cargarRegistro(true);
      if (hoyTexto() !== this.hoy) this.cargarOpciones();
    }, 30000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  private formVacio(): Formulario {
    return {
      id: null, fecha: hoyTexto(), despachador: this.nombreRecordado(), horaProgramada: '', horaLlegada: horaAhora(), horaInicioCargue: '',
      horaSalida: '', ruta: '', cargas: [], placa: '', viajeId: '', destino: '', horaFinCargue: '', observacion: ''
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
      }
    } catch { /* sin conexión: se escribe a mano */ }
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
      return;
    }
    const v = this.viajes.find(x => String(x.id) === this.form.viajeId);
    if (!v) return;
    this.form.destino = v.destino || v.ruta || '';
    this.form.ruta = v.ruta || '';
    // La hora programada del viaje (se puede cambiar).
    if (v.hora && v.hora !== '--:--') this.form.horaProgramada = v.hora;
    if (pegada(v.placa) !== pegada(this.form.placa)) this.form.placa = v.placa;
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
      viajeId: viaje ? viaje.id : null,
      ruta: viaje?.ruta || f.ruta.trim(), conductor: viaje?.conductor || this.conductorDe(f.placa)
    };
    try { localStorage.setItem(CLAVE_DESPACHADOR, cuerpo.despachador); } catch { /* sin almacenamiento: se escribe cada vez */ }
    this.guardando = true;
    try {
      const data = await this.enviar('', cuerpo);
      if (data?.ok) {
        const r = data.registro;
        this.ui.mostrarToast(f.id ? `Corregido: ${r.placa}.`
          : r.horaFinCargue ? `Anotado: ${r.placa} hacia ${r.destino}, cargó en ${this.textoMinutos(r.minutos)}.`
            : `Anotado: ${r.placa} llegó a las ${r.horaLlegada}. Cuando termine de cargar, toca "Terminó de cargar".`, 'ok');
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

  /** Siguiente paso de un vehículo en el cargue: empezó a cargar, terminó o salió. */
  siguientePaso(r: any): { campo: 'horaInicioCargue' | 'horaFinCargue' | 'horaSalida'; texto: string } {
    if (!r.horaInicioCargue && !r.horaFinCargue) return { campo: 'horaInicioCargue', texto: 'Empezó a cargar' };
    if (!r.horaFinCargue) return { campo: 'horaFinCargue', texto: 'Terminó de cargar' };
    return { campo: 'horaSalida', texto: 'Salió' };
  }

  /** Botón rápido: pone la hora de ahora en el siguiente paso del vehículo. */
  async terminarCargue(r: any): Promise<void> {
    if (this.terminandoId) return;
    this.terminandoId = r.id;
    const paso = this.siguientePaso(r);
    try {
      const data = await this.enviar('', { ...r, [paso.campo]: horaAhora() });
      if (data?.ok) {
        const g = data.registro;
        this.ui.mostrarToast(paso.campo === 'horaInicioCargue' ? `${r.placa} empezó a cargar a las ${g.horaInicioCargue}.`
          : paso.campo === 'horaFinCargue' ? `${r.placa} terminó de cargar a las ${g.horaFinCargue} (${this.textoMinutos(g.minutos)}).`
            : `${r.placa} salió a las ${g.horaSalida}.`, 'ok');
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
      id: r.id, fecha: r.fecha, horaLlegada: r.horaLlegada, placa: r.placa,
      despachador: r.despachador || this.nombreRecordado(), horaProgramada: r.horaProgramada || '', horaInicioCargue: r.horaInicioCargue || '',
      horaSalida: r.horaSalida || '', ruta: r.ruta || '', cargas: (r.cargas || []).map((c: any) => ({ tipo: c.tipo, cantidad: String(c.cantidad) })),
      viajeId: r.viajeId ? String(r.viajeId) : 'otro', destino: r.destino,
      horaFinCargue: r.horaFinCargue || '', observacion: r.observacion || ''
    };
    this.cargarOpciones();
    document.querySelector('.dp-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  cancelarCorreccion(): void {
    this.intentoGuardar = false;
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

  /** Cuánto lleva cargando un vehículo que todavía no termina. */
  llevaCargando(r: any): string {
    const [a, m, d] = String(r.fecha).split('-').map(Number);
    const [hh, mm] = String(r.horaLlegada).split(':').map(Number);
    const min = Math.round((Date.now() - new Date(a, m - 1, d, hh, mm).getTime()) / 60000);
    return min >= 0 ? this.textoMinutos(min) : '';
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

  trackId = (_: number, r: any) => r.id;
}
