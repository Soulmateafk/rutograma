import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API } from '../../api-base';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const lunesDe = (d: Date) => { const f = new Date(d.getFullYear(), d.getMonth(), d.getDate()); f.setDate(f.getDate() - ((f.getDay() + 6) % 7)); return f; };

/**
 * CIERRE DE SEMANA (Dashboard): el resumen de lunes a domingo que el
 * servidor manda solo cada viernes en la tarde (backend/cierre-semana.js).
 * Aquí se ve cualquier semana, se copia para WhatsApp o se manda por
 * correo cuando se quiera.
 */
@Component({
  selector: 'app-cierre-semana',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cierre-semana.html',
  styleUrl: './cierre-semana.css'
})
export class CierreSemanaComponent implements OnInit {
  @Output() cerrar = new EventEmitter<void>();
  private http = inject(HttpClient);
  public auth = inject(AuthService);
  private ui = inject(UiService);

  public lunes = signal(iso(lunesDe(new Date())));
  public datos = signal<any>(null);
  public cargando = signal(false);
  public enviando = signal(false);
  public correoPuntual = '';

  ngOnInit(): void {
    // Lunes a miércoles se abre con la semana que ya terminó; de jueves en adelante, con la actual.
    const hoy = new Date();
    if ([1, 2, 3].includes(hoy.getDay())) this.mover(-1); else this.cargar();
  }

  private get cabeceras() { return { headers: { 'x-user-email': this.auth.currentUser?.email || '' } }; }

  public async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const r: any = await firstValueFrom(this.http.get(`${API}/cierre-semana`, { params: { lunes: this.lunes() } }));
      this.datos.set(r?.ok ? r : null);
    } catch { this.datos.set(null); this.ui.mostrarToast('No se pudo armar el cierre de semana.', 'err'); }
    finally { this.cargando.set(false); }
  }

  public mover(semanas: number): void {
    const [a, m, d] = this.lunes().split('-').map(Number);
    this.lunes.set(iso(new Date(a, m - 1, d + semanas * 7)));
    this.cargar();
  }
  public get esEstaSemana(): boolean { return this.lunes() === iso(lunesDe(new Date())); }

  public async copiar(): Promise<void> {
    const t = this.datos()?.whatsapp || '';
    try { await navigator.clipboard.writeText(t); this.ui.mostrarToast('Cierre copiado: pégalo en WhatsApp.', 'ok'); }
    catch { this.ui.mostrarToast('No se pudo copiar. Usa el botón de WhatsApp.', 'err'); }
  }
  public whatsapp(): void { window.open(`https://wa.me/?text=${encodeURIComponent(this.datos()?.whatsapp || '')}`, '_blank'); }

  public async enviar(): Promise<void> {
    if (this.enviando()) return;
    this.enviando.set(true);
    try {
      const r: any = await firstValueFrom(this.http.post(`${API}/cierre-semana/enviar`, { lunes: this.lunes(), para: this.correoPuntual }, this.cabeceras));
      this.ui.mostrarToast(r?.msg || 'Cierre enviado.', 'ok');
      this.cargar();
    } catch (e: any) { this.ui.mostrarToast(e?.error?.msg || 'No se pudo enviar el correo.', 'err'); }
    finally { this.enviando.set(false); }
  }

  public imprimir(): void {
    const html = document.documentElement;
    html.classList.add('imprimiendo-cierre');
    setTimeout(() => { window.print(); html.classList.remove('imprimiendo-cierre'); }, 50);
  }
  public ancho(n: number, max: number): number { return max ? Math.max(4, Math.round((n / max) * 100)) : 0; }
  public maxDia(): number { return Math.max(1, ...(this.datos()?.resumen?.porDia || []).map((d: any) => d.viajes)); }
  public fechaCorta(f: string): string { const [, m, d] = String(f).split('-'); return `${Number(d)}/${Number(m)}`; }
}
