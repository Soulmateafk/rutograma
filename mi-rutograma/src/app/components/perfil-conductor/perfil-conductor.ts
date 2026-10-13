import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DataService } from '../../services/data';
import { perfilConductor, PerfilConductor } from '../../services/perfil-conductor';
import { ContarDirective } from '../../directivas/contar';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** PERFIL DEL CONDUCTOR (/conductor/:nombre) — ver services/perfil-conductor.ts. */
@Component({
  selector: 'app-perfil-conductor',
  standalone: true,
  imports: [CommonModule, RouterLink, ContarDirective],
  templateUrl: './perfil-conductor.html',
  styleUrl: './perfil-conductor.css'
})
export class PerfilConductorComponent implements OnInit, OnDestroy {
  private ds = inject(DataService);
  private ruta = inject(ActivatedRoute);
  public router = inject(Router);
  private nombre = signal('');
  private version = signal(0);
  private subs: any[] = [];

  public p = computed<PerfilConductor>(() => { this.version(); return perfilConductor(this.ds.S, this.nombre()); });

  ngOnInit(): void {
    this.subs.push(this.ruta.paramMap.subscribe(m => this.nombre.set(m.get('nombre') || '')));
    this.subs.push(this.ds.dataChanged.subscribe(() => this.version.update(v => v + 1)));
    if (!(this.ds.S?.viajes || []).length) this.ds.inicializarApp(true);
  }
  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe?.()); }

  public fecha(f: string, conAnio = false): string {
    if (!f) return '—';
    const [a, m, d] = f.slice(0, 10).split('-').map(Number); const x = new Date(a, m - 1, d);
    return `${DIAS[x.getDay()]} ${d} ${MESES[m - 1]}${conAnio ? ' ' + a : ''}`;
  }
  public desde(f: string): string {
    if (!f) return 'sin viajes registrados';
    const [a, m] = f.split('-').map(Number); return `${MESES[m - 1]} ${a}`;
  }
  public max(l: Array<{ n: number }>): number { return Math.max(1, ...l.map(x => x.n)); }
  public ancho(n: number, max: number): number { return Math.round((n / Math.max(1, max)) * 100); }
  public telefono(): string { return String(this.p().conductor?.tel || this.p().conductor?.telefono || '').replace(/\D/g, ''); }
  public whatsapp(): string { const t = this.telefono(); return t ? `https://wa.me/${t.length === 10 ? '57' + t : t}` : ''; }
  public licencia(): { texto: string; clase: string } {
    const f = String(this.p().conductor?.licVence || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return { texto: 'Sin fecha de licencia', clase: 'gris' };
    const dias = Math.round((new Date(f + 'T00:00:00').getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
    if (dias < 0) return { texto: `Licencia vencida hace ${-dias} días`, clase: 'rojo' };
    if (dias <= 30) return { texto: `Licencia vence en ${dias} días`, clase: 'ambar' };
    return { texto: `Licencia al día (vence ${this.fecha(f, true)})`, clase: 'verde' };
  }
  public iniciales(): string { return this.p().nombre.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase(); }
  public abrirViaje(v: any): void { this.router.navigate(['/rutograma'], { queryParams: { verViaje: v.id } }); }
}
