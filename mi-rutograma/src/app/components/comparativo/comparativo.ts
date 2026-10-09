import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { analizarMeses, viajesDelMes, AnalisisMeses, FilaCambio, IndicadorMes } from '../../services/comparar-meses';

interface DesgloseTransportadora {
  nombre: string;
  cantidad: number;
  pct: number;
}

interface ResumenMes {
  mesIndex: number;
  anio: number;
  etiqueta: string; // "Septiembre 2026"
  total: number;
  porTransportadora: DesgloseTransportadora[];
  logrados: number;   // viajes con estado 'Entregado' — lo que de verdad se cumplió
  pctCumplido: number; // logrados / total, redondeado
  hastaDia: number | null; // si se contó solo hasta cierto día del mes (null = mes completo)
  enCurso: boolean;        // true si es el mes real en el que estamos hoy
}

// "Ritmo del mes": cómo va el mes en curso frente a lo que se esperaba a
// esta fecha. Se mide sobre los viajes DESTINADOS a Makand con salida hasta
// hoy, que se reparten en tres: los que siguen con Makand, los cancelados,
// y los que se pasaron a un tercero (Arsitrans/Polar).
interface RitmoMes {
  mesIndex: number;
  anio: number;
  etiqueta: string;         // "Septiembre 2026"
  diaHoy: number;
  diasDelMes: number;
  previstosHoy: number;     // cumplidosAuto + canceladas + pasadasATerceros
  cumplidosAuto: number;    // salieron (o salen hoy) con Makand y no se cancelaron
  canceladas: number;
  pasadasATerceros: number;
  faltantes: number;        // viajes de Makand que todavía están por delante este mes
}

@Component({
  selector: 'app-comparativo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './comparativo.html',
  styleUrls: ['./comparativo.css']
})
export class Comparativo implements OnInit, OnDestroy {
  public readonly nombresMes = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  public aniosDisponibles: number[] = [];

  public modoVista: 'dos' | 'seis' = 'dos';

  // --- Modo "comparar 2 meses" ---
  public mesIndexA: number = 0;
  public anioA: number = new Date().getFullYear();
  public mesIndexB: number = 0;
  public anioB: number = new Date().getFullYear();
  public resumenA: ResumenMes | null = null;
  public resumenB: ResumenMes | null = null;

  // --- Modo "últimos 6 meses" ---
  public resumenesSeisMeses: ResumenMes[] = [];
  public totalMaximoSeisMeses: number = 1;

  // Cumplimiento manual — el usuario escribe cuántos viajes se
  // cumplieron de verdad ese mes (no se calcula solo de los viajes,
  // porque no se está usando lo de marcar cada uno como "Entregado").
  // Es solo un apartado visual: vive en memoria/localStorage, no se
  // manda al servidor ni afecta ningún otro número de la app.
  public cumplidosManual: { [clave: string]: number | null } = {};

  // --- Comparar "a la fecha" (mes en curso contra el anterior, hasta el mismo día) ---
  public soloHastaHoy: boolean = true;

  // --- Ritmo del mes en curso ---
  public ritmo: RitmoMes | null = null;
  // Corrección manual de los cumplidos de HOY. Vale solo por el día en que
  // se escribe (la clave incluye el día): al día siguiente vuelve al cálculo
  // automático, en vez de quedarse con un número viejo.
  public ritmoManual: { [clave: string]: number | null } = {};
  private static readonly CLAVE_STORAGE_RITMO = 'rutograma_ritmo_manual';
  // 33% para abajo: mal. 34-65%: regular. 66% para arriba: bien.
  private static readonly UMBRAL_RITMO_BIEN = 66;
  private static readonly UMBRAL_RITMO_JUSTO = 34;

  private subDataChanged?: Subscription;

  constructor(public ds: DataService, private cdr: ChangeDetectorRef, private auth: AuthService) {}

  // ============================================================
  // ANÁLISIS EN DETALLE (services/comparar-meses.ts) — solo se calcula
  // al oprimir el botón. Si después se cambian los meses o el corte, se
  // avisa que hay que volver a oprimirlo (no se recalcula solo).
  // ============================================================
  public analisis: AnalisisMeses | null = null;
  public analizando = false;
  private claveAnalisis = '';
  public gruposCompletos = new Set<string>();

  private get claveSeleccion(): string {
    return `${this.mesIndexA}-${this.anioA}|${this.mesIndexB}-${this.anioB}|${this.diaCorteComparacion ?? ''}`;
  }
  public get analisisDesactualizado(): boolean {
    return !!this.analisis && this.claveAnalisis !== this.claveSeleccion;
  }

  private delMes<T = any>(lista: any[], mesIndex: number, anio: number): T[] {
    const prefijo = `${anio}-${String(Number(mesIndex) + 1).padStart(2, '0')}`;
    return (lista || []).filter(x => String(x?.fecha || '').startsWith(prefijo));
  }

  private async despachosDelMes(mesIndex: number, anio: number, hastaDia: number | null): Promise<{ resumen: any; registros: any[] } | null> {
    try {
      const mes = `${anio}-${String(Number(mesIndex) + 1).padStart(2, '0')}`;
      const ultimo = hastaDia ?? new Date(Number(anio), Number(mesIndex) + 1, 0).getDate();
      const base = `${window.location.protocol}//${window.location.hostname}:5000/api`;
      const res = await this.auth.fetchAutenticado(`${base}/despachos?desde=${mes}-01&hasta=${mes}-${String(ultimo).padStart(2, '0')}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.ok && data.registros?.length ? { resumen: data.resumen, registros: data.registros } : null;
    } catch { return null; }
  }

  public async analizarDetalle(): Promise<void> {
    if (this.analizando) return;
    this.analizando = true;
    this.cdr.detectChanges();
    try {
      const S = this.ds.S || {};
      const mA = Number(this.mesIndexA), aA = Number(this.anioA), mB = Number(this.mesIndexB), aB = Number(this.anioB);
      // Un mes viejo puede estar solo en el Histórico.
      if (!S.historial && (!viajesDelMes(S.viajes, [], mA, aA).length || !viajesDelMes(S.viajes, [], mB, aB).length)) await this.ds.cargarHistorico();
      const corte = this.diaCorteComparacion;
      const [dA, dB] = await Promise.all([this.despachosDelMes(mA, aA, corte), this.despachosDelMes(mB, aB, corte)]);
      const mes = (m: number, a: number, desp: any) => ({
        etiqueta: `${this.nombresMes[m]} ${a}`,
        viajes: viajesDelMes(S.viajes, this.ds.S?.historial, m, a),
        quejas: this.delMes(S.quejas, m, a),
        comparendos: this.delMes(S.comparendos, m, a),
        despachos: desp
      });
      this.analisis = analizarMeses(mes(mA, aA, dA), mes(mB, aB, dB), corte);
      this.claveAnalisis = this.claveSeleccion;
      this.gruposCompletos.clear();
      setTimeout(() => document.getElementById('comp-analisis')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } finally {
      this.analizando = false;
      this.cdr.detectChanges();
    }
  }

  public cerrarAnalisis(): void { this.analisis = null; this.claveAnalisis = ''; }

  public filasVisibles(clave: string, filas: FilaCambio[]): FilaCambio[] {
    return this.gruposCompletos.has(clave) ? filas : filas.slice(0, 8);
  }
  public alternarGrupo(clave: string): void {
    if (this.gruposCompletos.has(clave)) this.gruposCompletos.delete(clave); else this.gruposCompletos.add(clave);
  }

  public valorIndicador(i: IndicadorMes, v: number | null): string {
    if (v === null || v === undefined) return '—';
    if (i.formato === 'dinero') return '$' + Math.round(v).toLocaleString('es-CO');
    if (i.formato === 'min') return `${v} min`;
    return Number(v).toLocaleString('es-CO');
  }
  public difIndicador(i: IndicadorMes): string {
    if (i.a === null || i.b === null || i.a === undefined || i.b === undefined) return '';
    const d = Math.round((i.b - i.a) * 10) / 10;
    if (!d) return '=';
    const pct = i.a ? ` (${d > 0 ? '+' : ''}${Math.round((d / i.a) * 100)}%)` : '';
    return `${d > 0 ? '+' : ''}${i.formato === 'dinero' ? '$' + Math.round(d).toLocaleString('es-CO') : d.toLocaleString('es-CO')}${pct}`;
  }
  /** 'bien' | 'mal' | '' para el color del cambio. */
  public tonoIndicador(i: IndicadorMes): string {
    if (i.mejorSiSube === null || i.mejorSiSube === undefined || i.a === null || i.b === null || i.a === i.b) return '';
    return (i.b > i.a) === i.mejorSiSube ? 'bien' : 'mal';
  }
  /** "Septiembre 2026" -> "Sep 26" (encabezados de las tablas). */
  public corta(etiqueta: string): string {
    const [mes, anio] = String(etiqueta).split(' ');
    return `${mes.slice(0, 3)} ${String(anio || '').slice(-2)}`;
  }
  public textoDif(f: FilaCambio): string {
    return `${f.dif > 0 ? '+' : ''}${f.dif}${f.pct !== null ? ` (${f.pct > 0 ? '+' : ''}${f.pct}%)` : ''}`;
  }

  ngOnInit(): void {
    this.cargarCumplidosManual();
    this.cargarRitmoManual();
    this.inicializarSelectoresPorDefecto();
    this.recalcularTodo();

    // Igual que en el Dashboard: si los datos cambian mientras estás
    // viendo esta pantalla (llega la sincronización, generas una
    // matriz nueva, etc.), se recalcula solo.
    this.subDataChanged = this.ds.dataChanged.subscribe(() => {
      this.recalcularTodo();
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.subDataChanged?.unsubscribe();
  }

  private inicializarSelectoresPorDefecto(): void {
    const hoy = new Date();
    const mesActivo = this.ds.S?.mes ?? hoy.getMonth();
    const anioActivo = this.ds.S?.anio ?? hoy.getFullYear();

    this.aniosDisponibles = [anioActivo - 1, anioActivo, anioActivo + 1];

    // Por defecto: mes activo vs. el anterior — mismo punto de partida
    // que ya usa el comparativo del Dashboard, para que esta pantalla
    // no abra vacía la primera vez.
    this.mesIndexB = mesActivo;
    this.anioB = anioActivo;

    let mesIndexAnterior = mesActivo - 1;
    let anioAnterior = anioActivo;
    if (mesIndexAnterior < 0) { mesIndexAnterior = 11; anioAnterior = anioActivo - 1; }
    this.mesIndexA = mesIndexAnterior;
    this.anioA = anioAnterior;
  }

  public cambiarModo(modo: 'dos' | 'seis'): void {
    this.modoVista = modo;
  }

  public recalcularTodo(): void {
    this.recalcularDosMeses();
    this.recalcularSeisMeses();
    this.recalcularRitmo();
  }

  // Mismo criterio de conteo que usa el Dashboard, pero esta pantalla es
  // exclusivamente de Makand: excluye Cancelado y cualquier viaje que no
  // sea de la flota propia (Arsitrans/Polar/terceros quedan fuera).
  //
  // "hastaDia": si viene (ej. 20), solo cuenta los viajes con salida hasta
  // ese día del mes — así el mes en curso se puede comparar contra el
  // anterior "igual contra igual" (del 1 al 20 de cada uno), en vez de
  // contra el mes anterior completo.
  private calcularResumenMes(mesIndex: number, anio: number, hastaDia: number | null = null): ResumenMes {
    const mesTexto = this.nombresMes[mesIndex];
    const viajesDelMes = (this.ds.S?.viajes || []).filter((v: any) => {
      const esMakand = String(v.tr || v.transportadora || '').trim().toLowerCase() === 'makand';
      // El mes guardado en el viaje; si no lo tiene (algunos extra), el de su fecha.
      const delMes = v.mes ? v.mes === mesTexto && Number(v.anio) === Number(anio)
        : String(v.fecha || '').startsWith(`${anio}-${String(Number(mesIndex) + 1).padStart(2, '0')}`);
      return delMes && v.estado !== 'Cancelado' && esMakand
        && (hastaDia === null || this.diaDelViaje(v) <= hastaDia);
    });

    const conteo = new Map<string, number>();
    viajesDelMes.forEach((v: any) => {
      const tr = String(v.tr || v.transportadora || '').trim() || 'Sin asignar';
      conteo.set(tr, (conteo.get(tr) || 0) + 1);
    });

    const total = viajesDelMes.length;
    const porTransportadora = Array.from(conteo.entries())
      .map(([nombre, cantidad]) => ({
        nombre,
        cantidad,
        pct: total > 0 ? Math.round((cantidad / total) * 100) : 0
      }))
      .sort((a, b) => b.cantidad - a.cantidad);

    // Cumplimiento: cuántos de los viajes "del plan" (el total de
    // arriba, ya sin Cancelados) de verdad quedaron en 'Entregado' —
    // ese es el estado real que usa el Rutograma cuando un viaje se
    // completa (no 'entregado' en minúscula, que es un valor que
    // ningún viaje real tiene guardado).
    const logrados = viajesDelMes.filter((v: any) => v.estado === 'Entregado').length;
    const pctCumplido = total > 0 ? Math.round((logrados / total) * 100) : 0;

    const hoy = new Date();
    const enCurso = Number(mesIndex) === hoy.getMonth() && Number(anio) === hoy.getFullYear();

    return { mesIndex, anio, etiqueta: `${mesTexto} ${anio}`, total, porTransportadora, logrados, pctCumplido, hastaDia, enCurso };
  }

  // Día del mes en que sale un viaje. Se toma de "fecha" (AAAA-MM-DD) y,
  // si no la tiene, del número de día guardado; sin ninguno de los dos
  // devuelve 0 (no se descarta el viaje por no saber su día).
  private diaDelViaje(v: any): number {
    const f = String(v?.fecha || '');
    if (/^\d{4}-\d{2}-\d{2}/.test(f)) return Number(f.slice(8, 10));
    const d = Number(v?.salida ?? v?.dia);
    return Number.isFinite(d) ? d : 0;
  }

  public get diaHoy(): number {
    return new Date().getDate();
  }

  // ¿Alguno de los dos meses elegidos es el mes real en el que estamos?
  // (Number(): los <select> devuelven el mes/año como texto.)
  public get mesActualEnSelectores(): boolean {
    const hoy = new Date();
    const esActual = (m: any, a: any) => Number(m) === hoy.getMonth() && Number(a) === hoy.getFullYear();
    return esActual(this.mesIndexA, this.anioA) || esActual(this.mesIndexB, this.anioB);
  }

  /** Hasta qué día se cuenta en la comparación de 2 meses (null = mes completo). */
  public get diaCorteComparacion(): number | null {
    return (this.soloHastaHoy && this.mesActualEnSelectores) ? new Date().getDate() : null;
  }

  public recalcularDosMeses(): void {
    const corte = this.diaCorteComparacion;
    this.resumenA = this.calcularResumenMes(this.mesIndexA, this.anioA, corte);
    this.resumenB = this.calcularResumenMes(this.mesIndexB, this.anioB, corte);
  }

  public recalcularSeisMeses(): void {
    const hoy = new Date();
    const mesActivo = this.ds.S?.mes ?? hoy.getMonth();
    const anioActivo = this.ds.S?.anio ?? hoy.getFullYear();

    const resumenes: ResumenMes[] = [];
    for (let i = 5; i >= 0; i--) {
      let mIdx = mesActivo - i;
      let a = anioActivo;
      while (mIdx < 0) { mIdx += 12; a -= 1; }
      resumenes.push(this.calcularResumenMes(mIdx, a));
    }
    this.resumenesSeisMeses = resumenes;
    this.totalMaximoSeisMeses = Math.max(1, ...resumenes.map(r => r.total));
  }

  // ============================================================
  // RITMO DEL MES EN CURSO
  // ============================================================
  // Cómo va el mes frente a lo que se esperaba a esta fecha. OJO: el estado
  // "Entregado" del Rutograma se pone SOLO por fecha (cuando pasa el día de
  // retorno), sin importar si el viaje realmente se hizo — por eso no sirve
  // para medir cumplimiento. Lo que sí queda registrado de forma confiable
  // es qué viajes de Makand terminaron CANCELADOS o PASADOS A UN TERCERO
  // (el traslado por mantenimiento/varado guarda la placa original), y eso
  // es lo que se descuenta de lo previsto.
  public recalcularRitmo(): void {
    this.ritmo = this.calcularRitmoMesActual();
  }

  private esMakandNombre(tr: any): boolean {
    return String(tr || '').trim().toLowerCase() === 'makand';
  }

  private normalizarPlaca(p: any): string {
    return String(p || '').toUpperCase().replace(/\s+/g, '');
  }

  private calcularRitmoMesActual(): RitmoMes | null {
    const hoy = new Date();
    const mesIndex = hoy.getMonth();
    const anio = hoy.getFullYear();
    const diaHoy = hoy.getDate();
    const mesTexto = this.nombresMes[mesIndex];
    const diasDelMes = new Date(anio, mesIndex + 1, 0).getDate();

    // Placas de la flota propia: solo un viaje que ahora está con un tercero
    // Y cuya placa original es de Makand cuenta como "pasado a un tercero"
    // (uno que desde el principio fue de un tercero nunca fue de Makand).
    const placasMakand = new Set<string>(
      (this.ds.S?.vehiculos || [])
        .filter((veh: any) => this.esMakandNombre(veh.tr || veh.transportadora))
        .map((veh: any) => this.normalizarPlaca(veh.p || veh.placa))
    );

    let cumplidosAuto = 0, canceladas = 0, pasadasATerceros = 0, faltantes = 0;
    let hayViajes = false;

    (this.ds.S?.viajes || []).forEach((v: any) => {
      if (v.mes !== mesTexto || Number(v.anio) !== anio) return;

      const estado = String(v.estado || '').toLowerCase().trim();
      if (estado === 'mantenimiento') return; // no es un viaje real

      const conMakandAhora = this.esMakandNombre(v.tr || v.transportadora);
      const pasadoATercero = !conMakandAhora && placasMakand.has(this.normalizarPlaca(v.placaOriginal));
      if (!conMakandAhora && !pasadoATercero) return; // era de un tercero desde el principio

      hayViajes = true;
      const cancelado = estado === 'cancelado';

      if (this.diaDelViaje(v) > diaHoy) {
        if (!cancelado && !pasadoATercero) faltantes++;
        return;
      }
      if (cancelado) canceladas++;
      else if (pasadoATercero) pasadasATerceros++;
      else cumplidosAuto++;
    });

    if (!hayViajes) return null;

    return {
      mesIndex, anio, etiqueta: `${mesTexto} ${anio}`, diaHoy, diasDelMes,
      previstosHoy: cumplidosAuto + canceladas + pasadasATerceros,
      cumplidosAuto, canceladas, pasadasATerceros, faltantes
    };
  }

  private claveRitmo(r: RitmoMes): string {
    return `${r.anio}-${r.mesIndex}-${r.diaHoy}`;
  }

  private cargarRitmoManual(): void {
    try {
      const guardado = localStorage.getItem(Comparativo.CLAVE_STORAGE_RITMO);
      this.ritmoManual = guardado ? JSON.parse(guardado) : {};
    } catch {
      this.ritmoManual = {};
    }
  }

  private guardarRitmoManual(): void {
    try {
      localStorage.setItem(Comparativo.CLAVE_STORAGE_RITMO, JSON.stringify(this.ritmoManual));
    } catch { /* si el navegador bloquea localStorage, el dato queda solo en memoria */ }
  }

  /** ¿La persona corrigió a mano los cumplidos de hoy? */
  public ritmoEsManual(r: RitmoMes): boolean {
    const v = this.ritmoManual[this.claveRitmo(r)];
    return v !== null && v !== undefined;
  }

  /** Cumplidos de hoy: lo corregido a mano si lo hay, si no el cálculo
   *  automático — y nunca más de lo previsto (pasaría del 100%). */
  public cumplidosRitmo(r: RitmoMes): number {
    const manual = this.ritmoManual[this.claveRitmo(r)];
    const valor = (manual === null || manual === undefined) ? r.cumplidosAuto : Number(manual);
    return Math.max(0, Math.min(valor, r.previstosHoy));
  }

  public pctRitmo(r: RitmoMes): number | null {
    return r.previstosHoy > 0 ? Math.round((this.cumplidosRitmo(r) / r.previstosHoy) * 100) : null;
  }

  public actualizarRitmoManual(r: RitmoMes, valor: number | null): void {
    // Se conserva SOLO la corrección de hoy: las de días anteriores ya no
    // valen y no tiene sentido que se acumulen.
    const invalido = valor === null || valor === undefined || isNaN(valor as any);
    this.ritmoManual = invalido ? {} : { [this.claveRitmo(r)]: Number(valor) };
    this.guardarRitmoManual();
  }

  public restablecerRitmoAutomatico(r: RitmoMes): void {
    this.actualizarRitmoManual(r, null);
  }

  public estadoRitmo(pct: number | null): 'bien' | 'justo' | 'mal' | 'sin-datos' {
    if (pct === null) return 'sin-datos';
    if (pct >= Comparativo.UMBRAL_RITMO_BIEN) return 'bien';
    if (pct >= Comparativo.UMBRAL_RITMO_JUSTO) return 'justo';
    return 'mal';
  }

  public textoEstadoRitmo(pct: number | null): string {
    return { 'bien': 'Va bien', 'justo': 'Va regular', 'mal': 'Va mal', 'sin-datos': 'Sin datos todavía' }[this.estadoRitmo(pct)];
  }

  public colorEstadoRitmo(pct: number | null): string {
    return { 'bien': '#16a34a', 'justo': '#d97706', 'mal': '#dc2626', 'sin-datos': '#64748b' }[this.estadoRitmo(pct)];
  }

  public iconoEstadoRitmo(pct: number | null): string {
    return { 'bien': 'bi-check-circle-fill', 'justo': 'bi-exclamation-triangle-fill', 'mal': 'bi-x-octagon-fill', 'sin-datos': 'bi-dash-circle' }[this.estadoRitmo(pct)];
  }

  // --- Helpers para la plantilla ---

  public diferenciaTexto(valorAntes: number, valorDespues: number): string {
    if (valorAntes === 0) return valorDespues > 0 ? `+${valorDespues}` : 'Sin cambio';
    const diff = Math.round(((valorDespues - valorAntes) / valorAntes) * 100);
    const signo = diff >= 0 ? '+' : '';
    return `${signo}${diff}%`;
  }

  public claseDiferencia(valorAntes: number, valorDespues: number): string {
    if (valorDespues > valorAntes) return 'dif-up';
    if (valorDespues < valorAntes) return 'dif-down';
    return 'dif-igual';
  }

  public colorTransportadora(nombre: string): string {
    const n = (nombre || '').toLowerCase();
    if (n.includes('makand')) return '#7c3aed';
    if (n.includes('arsitrans')) return '#16a34a';
    if (n.includes('polar')) return '#2563eb';
    return '#64748b';
  }

  public anchoBarraSeisMeses(cantidad: number): string {
    return `${Math.round((cantidad / this.totalMaximoSeisMeses) * 100)}%`;
  }

  // Cantidad de una transportadora específica dentro de un resumen —
  // para pintar la barra apilada en el modo de 6 meses sin repetir el
  // .find() directo en la plantilla.
  public cantidadDe(resumen: ResumenMes, nombreTransportadora: string): number {
    return resumen.porTransportadora.find(t => t.nombre === nombreTransportadora)?.cantidad || 0;
  }

  // --- Exportar a Excel (CSV) — mismo patrón que ya usa Histórico ---
  private escaparCSV(valor: any): string {
    return '"' + String(valor ?? '').replace(/"/g, '""') + '"';
  }

  public exportarComparativoCSV(): void {
    const q = (v: any) => this.escaparCSV(v);
    const filas: string[][] = [];

    filas.push([q('COMPARATIVO DE MESES — RUTOGRAMA MAKAND SAS')]);
    filas.push([q('Generado:'), q(new Date().toLocaleString())]);
    filas.push([]);

    // --- Sección "Comparar 2 meses" (lo que esté elegido ahora mismo) ---
    filas.push([q('COMPARAR 2 MESES')]);
    if (this.resumenA?.hastaDia) {
      filas.push([q(`Conteo hasta el día ${this.resumenA.hastaDia} de cada mes (igual contra igual)`)]);
    }
    if (this.resumenA && this.resumenB) {
      filas.push([q(''), q(this.resumenA.etiqueta), q(this.resumenB.etiqueta), q('Diferencia')]);
      filas.push([
        q('Total viajes'), q(this.resumenA.total), q(this.resumenB.total),
        q(this.diferenciaTexto(this.resumenA.total, this.resumenB.total))
      ]);
      const nombresTr2 = Array.from(new Set([
        ...this.resumenA.porTransportadora.map(t => t.nombre),
        ...this.resumenB.porTransportadora.map(t => t.nombre)
      ]));
      nombresTr2.forEach(nombre => {
        const cA = this.cantidadDe(this.resumenA!, nombre);
        const cB = this.cantidadDe(this.resumenB!, nombre);
        filas.push([q(nombre), q(cA), q(cB), q(this.diferenciaTexto(cA, cB))]);
      });
    }
    filas.push([]);

    // --- Sección "Ritmo del mes" ---
    if (this.ritmo) {
      const r = this.ritmo;
      const pct = this.pctRitmo(r);
      filas.push([q(`RITMO DEL MES — ${r.etiqueta} (día ${r.diaHoy} de ${r.diasDelMes})`)]);
      filas.push([q('Previstos hasta hoy'), q(r.previstosHoy)]);
      filas.push([q('  Salieron con Makand'), q(r.cumplidosAuto)]);
      filas.push([q('  Cancelados'), q(r.canceladas)]);
      filas.push([q('  Pasados a terceros'), q(r.pasadasATerceros)]);
      filas.push([q('Cumplidos' + (this.ritmoEsManual(r) ? ' (corregido a mano)' : '')), q(this.cumplidosRitmo(r))]);
      filas.push([q('Cumplimiento a hoy'), q(pct !== null ? pct + '%' : ''), q(this.textoEstadoRitmo(pct))]);
      filas.push([q('Viajes por delante este mes'), q(r.faltantes)]);
      filas.push([]);
    }

    // --- Sección "Últimos 6 meses" ---
    const nombresTr6 = Array.from(new Set(this.resumenesSeisMeses.flatMap(r => r.porTransportadora.map(t => t.nombre))));
    filas.push([q('ÚLTIMOS 6 MESES')]);
    filas.push([q('Mes'), q('Total'), ...nombresTr6.map(n => q(n)), q('Cumplidos (Makand, manual)'), q('% Cumplido')]);
    this.resumenesSeisMeses.forEach(r => {
      const cumplidos = this.valorCumplidoManual(r);
      filas.push([
        q(r.etiqueta),
        q(r.total),
        ...nombresTr6.map(n => q(this.cantidadDe(r, n))),
        q(cumplidos ?? ''),
        q(cumplidos !== null ? this.pctCumplidoManual(r) + '%' : '')
      ]);
    });

    const csv = filas.map(f => f.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const nombreArchivo = `Comparativo_Rutograma_${new Date().toISOString().slice(0, 10)}.csv`;

    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo;
    a.click();
  }

  // Semáforo simple para la barra de cumplimiento — nada de librerías,
  // solo tres colores sólidos según qué tan cerca está del 100%.
  public colorCumplimiento(pct: number): string {
    if (pct >= 70) return '#16a34a';
    if (pct >= 40) return '#d97706';
    return '#dc2626';
  }

  public tituloCumplimiento(r: ResumenMes): string {
    return `${r.logrados} de ${r.total} viajes entregados (${r.pctCumplido}%)`;
  }

  // --- Cumplimiento manual (lo que el usuario escribe a mano) ---
  private static readonly CLAVE_STORAGE = 'rutograma_cumplimiento_manual';

  public claveMes(r: ResumenMes): string {
    return `${r.mesIndex}-${r.anio}`;
  }

  private cargarCumplidosManual(): void {
    try {
      const guardado = localStorage.getItem(Comparativo.CLAVE_STORAGE);
      this.cumplidosManual = guardado ? JSON.parse(guardado) : {};
    } catch {
      this.cumplidosManual = {};
    }
  }

  private guardarCumplidosManual(): void {
    try {
      localStorage.setItem(Comparativo.CLAVE_STORAGE, JSON.stringify(this.cumplidosManual));
    } catch {
      // Si el navegador bloquea localStorage, no pasa nada grave — el
      // dato solo se queda en memoria por el resto de la sesión.
    }
  }

  public actualizarCumplidoManual(r: ResumenMes, valor: number | null): void {
    this.cumplidosManual[this.claveMes(r)] = (valor === null || isNaN(valor as any)) ? null : Number(valor);
    this.guardarCumplidosManual();
  }

  public valorCumplidoManual(r: ResumenMes): number | null {
    const v = this.cumplidosManual[this.claveMes(r)];
    return (v === undefined) ? null : v;
  }

  public pctCumplidoManual(r: ResumenMes): number {
    const v = this.valorCumplidoManual(r);
    if (v === null || r.total === 0) return 0;
    return Math.min(100, Math.round((v / r.total) * 100));
  }
}