import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API } from '../api-base';
import { AuthService } from './auth.service';

export interface Tarea {
  id: string; titulo: string; detalle: string; para: string; de: string; vence: string; prioridad: 'normal' | 'alta';
  sobre: { tipo: string; valor: string } | null; creada: string; hecha: boolean; hechaEn: string; hechaPor: string;
  comentarios: Array<{ de: string; nombre: string; texto: string; en: string }>;
}
export interface Persona { email: string; nombre: string; }

const hoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/**
 * TAREAS DEL EQUIPO: la lista vive en el servidor (backend/tareas.js). Se
 * consulta cada minuto para el contador de la barra (las que te tocan y no
 * has hecho) y el aviso del Dashboard (vencidas o para hoy).
 */
@Injectable({ providedIn: 'root' })
export class TareasService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  public tareas = signal<Tarea[]>([]);
  public personas = signal<Persona[]>([]);
  public yo = signal('');
  public esJefe = signal(false);
  public disponible = signal(false);
  private reloj: any = null;

  public mias = computed(() => this.tareas().filter(t => !t.hecha && t.para === this.yo()));
  public urgentesMias = computed(() => { const h = hoyISO(); return this.mias().filter(t => t.vence && t.vence <= h); });

  private get cab() { return { headers: { 'x-user-email': this.auth.currentUser?.email || '' } }; }

  public empezar(): void {
    if (this.reloj || typeof window === 'undefined') return;
    this.cargar();
    this.reloj = setInterval(() => { if (!document.hidden) this.cargar(); }, 60000);
  }

  public async cargar(): Promise<void> {
    try {
      const r: any = await firstValueFrom(this.http.get(`${API}/tareas`, this.cab));
      if (!r?.ok) return;
      this.tareas.set(r.tareas || []); this.personas.set(r.personas || []); this.yo.set(r.yo || ''); this.esJefe.set(!!r.esJefe);
      this.disponible.set(true);
    } catch { this.disponible.set(false); }
  }

  private reemplazar(t: Tarea): void {
    const lista = this.tareas();
    this.tareas.set(lista.some(x => x.id === t.id) ? lista.map(x => x.id === t.id ? t : x) : [t, ...lista]);
  }
  public async guardar(datos: Partial<Tarea>): Promise<string> {
    try { const r: any = await firstValueFrom(this.http.post(`${API}/tareas`, datos, this.cab)); this.reemplazar(r.tarea); return ''; }
    catch (e: any) { return e?.error?.msg || 'No se pudo guardar la tarea.'; }
  }
  public async marcar(t: Tarea, hecha: boolean): Promise<string> {
    this.reemplazar({ ...t, hecha });   // se ve al instante
    try { const r: any = await firstValueFrom(this.http.post(`${API}/tareas/estado`, { id: t.id, hecha }, this.cab)); this.reemplazar(r.tarea); return ''; }
    catch (e: any) { this.reemplazar(t); return e?.error?.msg || 'No se pudo marcar la tarea.'; }
  }
  public async comentar(t: Tarea, texto: string): Promise<string> {
    try { const r: any = await firstValueFrom(this.http.post(`${API}/tareas/comentar`, { id: t.id, texto }, this.cab)); this.reemplazar(r.tarea); return ''; }
    catch (e: any) { return e?.error?.msg || 'No se pudo comentar.'; }
  }
  public async borrar(t: Tarea): Promise<string> {
    try { await firstValueFrom(this.http.post(`${API}/tareas/borrar`, { id: t.id }, this.cab)); this.tareas.set(this.tareas().filter(x => x.id !== t.id)); return ''; }
    catch (e: any) { return e?.error?.msg || 'No se pudo borrar.'; }
  }
  public nombre(email: string): string { return this.personas().find(p => p.email === email)?.nombre || email; }
}
