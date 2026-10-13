import { Component, Input, OnChanges, ChangeDetectionStrategy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AnalisisMeses, diaDelViaje } from '../../services/comparar-meses';

/**
 * GRÁFICOS DEL "ANALIZAR EN DETALLE" (Comparativo):
 *  - Pastel: cómo se reparten los viajes de un mes (por transportadora,
 *    cliente, ruta, vehículo, conductor, día de la semana o estado).
 *  - Barras: el mismo reparto, mes contra mes.
 *  - Línea: viajes de cada día del mes, los dos meses encima.
 * Al tocar una tajada, una barra o una fila de la leyenda se abre el
 * DESGLOSE de esa cosa: sus números y con quién / dónde / cuándo se hizo.
 * Todo se dibuja con SVG propio (sin librerías) y solo al analizar.
 */
type Dimension = 'tr' | 'cliente' | 'ruta' | 'vehiculo' | 'conductor' | 'dia' | 'estado';
interface Porcion { nombre: string; a: number; b: number; color: string; }

const DIMENSIONES: Array<{ clave: Dimension; nombre: string; icono: string }> = [
  { clave: 'tr', nombre: 'Transportadora', icono: 'bi-truck' },
  { clave: 'cliente', nombre: 'Cliente', icono: 'bi-shop' },
  { clave: 'ruta', nombre: 'Ruta', icono: 'bi-signpost-split' },
  { clave: 'vehiculo', nombre: 'Vehículo', icono: 'bi-truck-front' },
  { clave: 'conductor', nombre: 'Conductor', icono: 'bi-person' },
  { clave: 'dia', nombre: 'Día de la semana', icono: 'bi-calendar-week' },
  { clave: 'estado', nombre: 'Estado', icono: 'bi-flag' }
];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
// Colores por posición fija (paleta validada para daltonismo); el 8.º es "Otros".
const SERIES = 7;
const t = (v: any) => String(v ?? '').trim();

export function claveDe(dim: Dimension, v: any): string {
  switch (dim) {
    case 'tr': return t(v.tr || v.transportadora) || 'Sin transportadora';
    case 'cliente': return t(v.cliente || v.cli) || 'Sin cliente';
    case 'ruta': return t(v.ruta || v.codigo).toUpperCase() || 'Sin ruta';
    case 'vehiculo': return t(v.p || v.placa || v.veh).toUpperCase() || 'Sin vehículo';
    case 'conductor': return t(v.cond) || 'Sin conductor';
    case 'estado': return t(v.estado) || 'Programado';
    case 'dia': {
      const f = t(v.fecha);
      if (!/^\d{4}-\d{2}-\d{2}/.test(f)) return 'Sin fecha';
      const [y, m, d] = f.slice(0, 10).split('-').map(Number);
      return DIAS[new Date(y, m - 1, d).getDay()];
    }
  }
}

@Component({
  selector: 'app-graficos-analisis',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './graficos-analisis.html',
  styleUrl: './graficos-analisis.css'
})
export class GraficosAnalisisComponent implements OnChanges {
  @Input({ required: true }) analisis!: AnalisisMeses;

  public readonly dimensiones = DIMENSIONES;
  public dim = signal<Dimension>('tr');
  public mesPastel = signal<'a' | 'b'>('b');
  public elegido = signal<string | null>(null);
  public tip = signal<{ x: number; y: number; titulo: string; lineas: string[] } | null>(null);
  private datos = signal<AnalisisMeses | null>(null);

  ngOnChanges(): void { this.datos.set(this.analisis); this.elegido.set(null); }

  // Cancelados solo cuentan en "Estado"; en lo demás, como el resto del análisis.
  private lista(cual: 'a' | 'b', dim: Dimension = this.dim()): any[] {
    const an = this.datos(); if (!an) return [];
    const l = cual === 'a' ? an.viajesA : an.viajesB;
    return dim === 'estado' ? l : l.filter(v => v.estado !== 'Cancelado');
  }
  private contar(lista: any[], dim: Dimension): Map<string, number> {
    const m = new Map<string, number>();
    for (const v of lista) { const k = claveDe(dim, v); m.set(k, (m.get(k) || 0) + 1); }
    return m;
  }

  /** Todas las cosas de la dimensión con su cuenta en cada mes y su color fijo. */
  public porciones = computed<Porcion[]>(() => {
    const dim = this.dim();
    const ma = this.contar(this.lista('a'), dim), mb = this.contar(this.lista('b'), dim);
    const nombres = [...new Set([...ma.keys(), ...mb.keys()])];
    // Días en su orden; lo demás de mayor a menor (en el mes del pastel) para que el color siga a la cosa.
    if (dim === 'dia') nombres.sort((x, y) => ((DIAS.indexOf(x) + 6) % 7) - ((DIAS.indexOf(y) + 6) % 7));
    else nombres.sort((x, y) => ((mb.get(y) || 0) + (ma.get(y) || 0)) - ((mb.get(x) || 0) + (ma.get(x) || 0)) || x.localeCompare(y));
    return nombres.map((nombre, i) => ({ nombre, a: ma.get(nombre) || 0, b: mb.get(nombre) || 0, color: i < SERIES ? `var(--gs-${i + 1})` : 'var(--gs-otros)' }));
  });

  /** Para el pastel y las barras: las 7 primeras y el resto junto en "Otros". */
  public principales = computed<Porcion[]>(() => {
    const p = this.porciones();
    if (p.length <= SERIES + 1) return p;
    const resto = p.slice(SERIES);
    return [...p.slice(0, SERIES), { nombre: `Otros (${resto.length})`, a: resto.reduce((s, x) => s + x.a, 0), b: resto.reduce((s, x) => s + x.b, 0), color: 'var(--gs-otros)' }];
  });

  public totalA = computed(() => this.porciones().reduce((s, p) => s + p.a, 0));
  public totalB = computed(() => this.porciones().reduce((s, p) => s + p.b, 0));
  public totalPastel = computed(() => this.mesPastel() === 'a' ? this.totalA() : this.totalB());

  /** Tajadas del pastel (dona) como caminos SVG. */
  public tajadas = computed(() => {
    const cual = this.mesPastel(), total = this.totalPastel();
    if (!total) return [];
    const R = 80, r = 50, cx = 100, cy = 100;
    let ang = -Math.PI / 2;
    return this.principales().filter(p => p[cual] > 0).map(p => {
      const val = p[cual], frac = val / total;
      const a0 = ang, a1 = ang + frac * Math.PI * 2; ang = a1;
      const largo = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad: number, a: number) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
      const d = frac >= 0.9999
        ? `M ${cx} ${cy - R} A ${R} ${R} 0 1 1 ${cx - 0.01} ${cy - R} L ${cx - 0.01} ${cy - r} A ${r} ${r} 0 1 0 ${cx} ${cy - r} Z`
        : `M ${pt(R, a0)} A ${R} ${R} 0 ${largo} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${largo} 0 ${pt(r, a0)} Z`;
      const medio = (a0 + a1) / 2;
      return { ...p, d, val, pct: Math.round(frac * 1000) / 10, dx: Math.cos(medio) * 6, dy: Math.sin(medio) * 6 };
    });
  });

  /** Barras mes contra mes (máximo 10 filas). */
  public barras = computed(() => {
    const filas = this.principales().slice(0, 10);
    const max = Math.max(1, ...filas.map(f => Math.max(f.a, f.b)));
    return filas.map(f => ({ ...f, wa: (f.a / max) * 100, wb: (f.b / max) * 100, dif: f.b - f.a }));
  });

  /** Línea: viajes por día del mes de los dos meses (o solo de lo elegido). */
  public linea = computed(() => {
    const el = this.elegido(), dim = this.dim();
    const filtro = (l: any[]) => el === null || el.startsWith('Otros (') ? l : l.filter(v => claveDe(dim, v) === el);
    const serie = (l: any[]) => { const s = new Array(31).fill(0); for (const v of l) { const d = diaDelViaje(v); if (d >= 1 && d <= 31) s[d - 1]++; } return s; };
    const sa = serie(filtro(this.lista('a', 'tr'))), sb = serie(filtro(this.lista('b', 'tr')));
    let dias = 31; while (dias > 1 && !sa[dias - 1] && !sb[dias - 1]) dias--;
    const hasta = this.datos()?.hastaDia || dias;
    const n = Math.max(hasta, 2);
    const max = Math.max(1, ...sa.slice(0, n), ...sb.slice(0, n));
    const W = 1000, H = 230, iz = 34, de = 14, ar = 12, ab = 26;
    const x = (i: number) => iz + (i / (n - 1)) * (W - iz - de);
    const y = (val: number) => ar + (1 - val / max) * (H - ar - ab);
    const camino = (s: number[]) => s.slice(0, n).map((val, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');
    const marcas = [0, Math.round(max / 2), max].filter((v, i, arr) => arr.indexOf(v) === i);
    return {
      W, H, iz, de, ar, ab, n, sa, sb, max,
      pa: camino(sa), pb: camino(sb),
      area: `${camino(sb)} L ${x(n - 1).toFixed(1)} ${y(0)} L ${x(0).toFixed(1)} ${y(0)} Z`,
      ejeY: marcas.map(v => ({ v, y: y(v) })),
      ejeX: Array.from({ length: n }, (_, i) => i).filter(i => i === 0 || (i + 1) % 5 === 0 || i === n - 1).map(i => ({ d: i + 1, x: x(i) })),
      puntos: Array.from({ length: n }, (_, i) => ({ i, x: x(i), ya: y(sa[i]), yb: y(sb[i]) })),
      ancho: (W - iz - de) / (n - 1)
    };
  });
  public diaHover = signal<number | null>(null);

  /** Desglose de lo elegido: números y con qué otras cosas se hizo. */
  public desglose = computed(() => {
    const el = this.elegido(); if (el === null) return null;
    const dim = this.dim();
    const p = this.porciones().find(x => x.nombre === el);
    const otros = el.startsWith('Otros (');
    const nombresOtros = new Set(this.porciones().slice(SERIES).map(x => x.nombre));
    const es = (v: any) => otros ? nombresOtros.has(claveDe(dim, v)) : claveDe(dim, v) === el;
    const la = this.lista('a').filter(es), lb = this.lista('b').filter(es);
    const a = p ? p.a : la.length, b = p ? p.b : lb.length;
    const color = (otros ? 'var(--gs-otros)' : p?.color) || 'var(--gs-1)';
    const cortes = DIMENSIONES.filter(d => d.clave !== dim && !(dim === 'vehiculo' && d.clave === 'tr')).map(d => {
      const mb = this.contar(lb.filter(v => d.clave === 'estado' || v.estado !== 'Cancelado'), d.clave);
      const ma = this.contar(la.filter(v => d.clave === 'estado' || v.estado !== 'Cancelado'), d.clave);
      const filas = [...new Set([...mb.keys(), ...ma.keys()])].map(n => ({ nombre: n, b: mb.get(n) || 0, a: ma.get(n) || 0 }))
        .sort((x, y) => y.b - x.b || y.a - x.a).slice(0, 6);
      const max = Math.max(1, ...filas.map(f => Math.max(f.a, f.b)));
      return { ...d, filas: filas.map(f => ({ ...f, w: (f.b / max) * 100, wa: (f.a / max) * 100 })), total: mb.size };
    }).filter(c => c.filas.length && !(c.total === 1 && c.filas[0].nombre.startsWith('Sin ')));
    const tot = this.totalB();
    return {
      nombre: el, color, a, b, dif: b - a, pct: a ? Math.round(((b - a) / a) * 100) : null,
      parte: tot ? Math.round((b / tot) * 1000) / 10 : 0,
      dimNombre: DIMENSIONES.find(d => d.clave === dim)!.nombre, cortes
    };
  });

  public cambiarDim(d: Dimension): void { this.dim.set(d); this.elegido.set(null); this.tip.set(null); }
  public elegir(nombre: string): void {
    this.elegido.set(this.elegido() === nombre ? null : nombre);
    if (this.elegido()) setTimeout(() => document.getElementById('ga-desglose')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  }
  public corta(et: string): string { const [m, a] = String(et || '').split(' '); return m ? `${m.slice(0, 3)}${a ? ' ' + a : ''}` : et; }
  public conSigno(n: number): string { return n > 0 ? `+${n}` : String(n); }

  public mostrarTip(ev: MouseEvent, titulo: string, lineas: string[]): void {
    const caja = (ev.currentTarget as Element).closest('.ga')?.getBoundingClientRect();
    if (!caja) return;
    const x = ev.clientX - caja.left;
    this.tip.set({ x: x > caja.width - 230 ? x - 224 : x + 14, y: ev.clientY - caja.top + 14, titulo, lineas });
  }
  public tipTajada(ev: MouseEvent, s: any): void {
    const an = this.datos()!; const otro = this.mesPastel() === 'a' ? s.b : s.a;
    this.mostrarTip(ev, s.nombre, [`${s.val} viajes · ${s.pct}% de ${this.mesPastel() === 'a' ? an.etiquetaA : an.etiquetaB}`,
      `${this.mesPastel() === 'a' ? an.etiquetaB : an.etiquetaA}: ${otro}`, 'Toca para ver el desglose']);
  }
  public tipBarra(ev: MouseEvent, f: any): void {
    const an = this.datos()!;
    this.mostrarTip(ev, f.nombre, [`${an.etiquetaA}: ${f.a}`, `${an.etiquetaB}: ${f.b} (${this.conSigno(f.dif)})`, 'Toca para ver el desglose']);
  }
  public tipDia(ev: MouseEvent, i: number): void {
    const an = this.datos()!, l = this.linea();
    this.diaHover.set(i);
    this.mostrarTip(ev, `Día ${i + 1}`, [`${an.etiquetaA}: ${l.sa[i]} viajes`, `${an.etiquetaB}: ${l.sb[i]} viajes`]);
  }
  public salir(): void { this.tip.set(null); this.diaHover.set(null); }
}
