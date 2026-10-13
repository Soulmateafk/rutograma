import { Component, HostListener, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DataService } from '../../services/data';
import { ContarDirective } from '../../directivas/contar';
import { Metricas, Periodo, conclusiones, metricas, periodosDisponibles } from '../../services/presentacion';

type Diapositiva =
  | { tipo: 'portada' }
  | { tipo: 'kpis' | 'serie' | 'reparto' | 'equipo' | 'calidad'; m: Metricas }
  | { tipo: 'comparaKpis' | 'comparaSerie' | 'comparaClientes' | 'conclusiones' }
  | { tipo: 'cierre' };

/**
 * MODO PRESENTACIÓN: escoges semanas, meses o ambos (uno o varios) y la
 * app arma diapositivas con los números de cada período y, si hay más de
 * uno, la comparación y las conclusiones. Pantalla completa, flechas del
 * teclado y se puede imprimir o guardar en PDF (una diapositiva por hoja).
 */
@Component({
  selector: 'app-presentacion',
  standalone: true,
  imports: [CommonModule, FormsModule, ContarDirective],
  templateUrl: './presentacion.html',
  styleUrl: './presentacion.css'
})
export class PresentacionComponent implements OnInit, OnDestroy {
  public ds = inject(DataService);

  public modo = signal<'semana' | 'mes' | 'ambos'>('mes');
  public elegidos = signal<Periodo[]>([]);
  public detalle = signal(true);
  public viendo = signal(false);
  public actual = signal(0);
  public direccion = signal<1 | -1>(1);
  public imprimiendo = signal(false);
  private sub: any;
  private version = signal(0);

  public disponibles = computed(() => { this.version(); return periodosDisponibles(this.ds.S); });
  public listaSemanas = computed(() => this.disponibles().semanas);
  public listaMeses = computed(() => this.disponibles().meses);
  public metricasElegidas = computed<Metricas[]>(() => { this.version(); return [...this.elegidos()].sort((a, b) => a.desde.localeCompare(b.desde)).map(p => metricas(this.ds.S, p)); });
  public frases = computed(() => conclusiones(this.metricasElegidas()));

  public diapositivas = computed<Diapositiva[]>(() => {
    const ms = this.metricasElegidas();
    const lista: Diapositiva[] = [{ tipo: 'portada' }];
    const conDetalle = this.detalle() || ms.length === 1;
    if (conDetalle) ms.forEach(m => lista.push({ tipo: 'kpis', m }, { tipo: 'serie', m }, { tipo: 'reparto', m }, { tipo: 'equipo', m }, { tipo: 'calidad', m }));
    if (ms.length >= 2) lista.push({ tipo: 'comparaKpis' }, { tipo: 'comparaSerie' }, { tipo: 'comparaClientes' }, { tipo: 'conclusiones' });
    lista.push({ tipo: 'cierre' });
    return lista;
  });

  ngOnInit(): void {
    this.sub = this.ds.dataChanged?.subscribe?.(() => this.version.update(v => v + 1));
    if (!(this.ds.S?.viajes || []).length) this.ds.inicializarApp(true);
    setTimeout(() => this.rapido('mesVsPasado'), 0);
  }
  ngOnDestroy(): void { this.sub?.unsubscribe?.(); this.salirPantallaCompleta(); }

  // ---- Selección ----
  public estaElegido(p: Periodo): boolean { return this.elegidos().some(x => x.desde === p.desde && x.tipo === p.tipo); }
  public alternar(p: Periodo): void {
    const ya = this.estaElegido(p);
    if (!ya && this.elegidos().length >= 6) return;
    this.elegidos.set(ya ? this.elegidos().filter(x => !(x.desde === p.desde && x.tipo === p.tipo)) : [...this.elegidos(), p]);
  }
  public rapido(cual: 'mes' | 'mesVsPasado' | '3meses' | 'semana' | 'semanaVsPasada' | '4semanas'): void {
    const s = this.listaSemanas(), m = this.listaMeses();
    const sel = { mes: m.slice(0, 1), mesVsPasado: m.slice(0, 2), '3meses': m.slice(0, 3), semana: s.slice(0, 1), semanaVsPasada: s.slice(0, 2), '4semanas': s.slice(0, 4) }[cual];
    if (cual.includes('emana')) { if (this.modo() === 'mes') this.modo.set('semana'); } else if (this.modo() === 'semana') this.modo.set('mes');
    this.elegidos.set(sel);
  }
  public limpiar(): void { this.elegidos.set([]); }

  // ---- Visor ----
  public empezar(): void {
    if (!this.elegidos().length) return;
    this.actual.set(0); this.viendo.set(true);
    document.documentElement.requestFullscreen?.().catch(() => { /* sin pantalla completa: igual se ve */ });
  }
  public salir(): void { this.viendo.set(false); this.salirPantallaCompleta(); }
  private salirPantallaCompleta(): void { if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }
  public ir(n: number): void {
    const total = this.diapositivas().length;
    const destino = Math.max(0, Math.min(total - 1, n));
    if (destino === this.actual()) return;
    this.direccion.set(destino > this.actual() ? 1 : -1);
    this.actual.set(destino);
  }
  public tocar(ev: MouseEvent): void {
    if ((ev.target as HTMLElement).closest('button, a, input, select')) return;
    this.ir(this.actual() + (ev.clientX > window.innerWidth / 3 ? 1 : -1));
  }
  @HostListener('document:keydown', ['$event'])
  teclas(e: KeyboardEvent): void {
    if (!this.viendo()) return;
    if (['ArrowRight', 'PageDown', ' ', 'Enter'].includes(e.key)) { e.preventDefault(); this.ir(this.actual() + 1); }
    else if (['ArrowLeft', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); this.ir(this.actual() - 1); }
    else if (e.key === 'Home') this.ir(0);
    else if (e.key === 'End') this.ir(this.diapositivas().length - 1);
    else if (e.key === 'Escape') this.salir();
  }

  public imprimir(): void {
    this.imprimiendo.set(true);
    document.documentElement.classList.add('imprimiendo-presentacion');
    setTimeout(() => {
      window.print();
      document.documentElement.classList.remove('imprimiendo-presentacion');
      this.imprimiendo.set(false);
    }, 400);
  }

  // ---- Ayudas para las gráficas ----
  public max(lista: Array<{ n: number }>): number { return Math.max(1, ...lista.map(x => x.n)); }
  public alto(n: number, max: number): number { return Math.round((n / Math.max(1, max)) * 100); }
  public colorSerie(i: number): string { return `var(--pr-s${(i % 6) + 1})`; }
  public dona(lista: Array<{ nombre: string; n: number }>): Array<{ nombre: string; n: number; d: string; color: string; pct: number }> {
    const total = lista.reduce((s, x) => s + x.n, 0); if (!total) return [];
    const top = lista.length > 6 ? [...lista.slice(0, 5), { nombre: 'Otros', n: lista.slice(5).reduce((s, x) => s + x.n, 0) }] : lista;
    let ang = -Math.PI / 2; const R = 80, r = 52, c = 100;
    const pt = (rad: number, a: number) => `${(c + rad * Math.cos(a)).toFixed(2)} ${(c + rad * Math.sin(a)).toFixed(2)}`;
    return top.map((x, i) => {
      const f = x.n / total, a0 = ang, a1 = ang + f * Math.PI * 2; ang = a1;
      const l = a1 - a0 > Math.PI ? 1 : 0;
      const d = f >= 0.9999 ? `M ${c} ${c - R} A ${R} ${R} 0 1 1 ${c - 0.01} ${c - R} L ${c - 0.01} ${c - r} A ${r} ${r} 0 1 0 ${c} ${c - r} Z`
        : `M ${pt(R, a0)} A ${R} ${R} 0 ${l} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${l} 0 ${pt(r, a0)} Z`;
      return { ...x, d, color: x.nombre === 'Otros' ? 'var(--pr-otros)' : this.colorSerie(i), pct: Math.round(f * 100) };
    });
  }
  /** Clientes de todos los períodos (los 6 con más viajes), para comparar. */
  public clientesComparados = computed(() => {
    const ms = this.metricasElegidas(); const total = new Map<string, number>();
    ms.forEach(m => m.porCliente.forEach(c => total.set(c.nombre, (total.get(c.nombre) || 0) + c.n)));
    const nombres = [...total.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n]) => n);
    const max = Math.max(1, ...ms.flatMap(m => m.porCliente.filter(c => nombres.includes(c.nombre)).map(c => c.n)));
    return { nombres, max, valor: (m: Metricas, nombre: string) => m.porCliente.find(c => c.nombre === nombre)?.n || 0 };
  });
  public maxTotal = computed(() => Math.max(1, ...this.metricasElegidas().map(m => this.mezcla() ? m.promedioDia : m.total)));
  public mezcla = computed(() => new Set(this.elegidos().map(p => p.tipo)).size > 1);
  public valorComparable(m: Metricas): number { return this.mezcla() ? m.promedioDia : m.total; }
  public dif(a: number | null, b: number | null): string { if (a === null || b === null) return ''; const d = b - a; return d === 0 ? '=' : (d > 0 ? '▲ ' : '▼ ') + Math.abs(Math.round(d * 10) / 10); }
  public tonoDif(a: number | null, b: number | null, mejorSiSube = true): string { if (a === null || b === null || a === b) return ''; return (b > a) === mejorSiSube ? 'pr-bien' : 'pr-mal'; }
  public filasComparacion: Array<{ nombre: string; valor: (m: Metricas) => number | null; mejor: boolean; sufijo?: string }> = [
    { nombre: 'Viajes', valor: m => m.total, mejor: true },
    { nombre: 'Viajes por día', valor: m => m.promedioDia, mejor: true },
    { nombre: 'Cumplimiento', valor: m => m.cumplimiento, mejor: true, sufijo: '%' },
    { nombre: 'Entregados', valor: m => m.entregados, mejor: true },
    { nombre: 'Cancelados', valor: m => m.cancelados, mejor: false },
    { nombre: 'Flota propia', valor: m => m.partePropia, mejor: true, sufijo: '%' },
    { nombre: 'Terceros', valor: m => m.terceros, mejor: false },
    { nombre: 'Viajes por vehículo', valor: m => m.viajesPorVehiculo, mejor: true },
    { nombre: 'Extras', valor: m => m.extras, mejor: false },
    { nombre: 'Cajas', valor: m => m.cajas, mejor: true },
    { nombre: 'Quejas', valor: m => m.quejas, mejor: false },
    { nombre: 'Comparendos', valor: m => m.comparendos, mejor: false }
  ];
  public hoyTexto(): string { return new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }); }
}
