import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API } from '../api-base';

export interface Clima { tipo: 'despejado' | 'nublado' | 'lluvia' | 'tormenta' | 'niebla' | 'nieve'; temperatura: number; esDeDia: boolean; ciudad: string; }

/**
 * CLIMA QUE SE VE: pregunta al servidor (que a su vez le pregunta a
 * Open-Meteo) cómo está el clima de la oficina cada 15 minutos. Lo usan la
 * capa de clima (components/apariencia/clima.ts) y la barra (temperatura).
 */
@Injectable({ providedIn: 'root' })
export class ClimaService {
  private http = inject(HttpClient);
  public clima = signal<Clima | null>(null);
  private reloj: any = null;

  public iniciar(): void {
    if (this.reloj || typeof window === 'undefined') return;
    this.consultar();
    this.reloj = setInterval(() => this.consultar(), 15 * 60000);
  }

  private async consultar(): Promise<void> {
    try {
      const r: any = await firstValueFrom(this.http.get(`${API}/clima`));
      if (r?.tipo) this.clima.set({ tipo: r.tipo, temperatura: r.temperatura, esDeDia: r.esDeDia !== false, ciudad: r.ciudad || '' });
    } catch { /* sin servidor o sin internet: no se muestra */ }
  }

  public emoji(c: Clima | null): string {
    if (!c) return '';
    return { despejado: c.esDeDia ? '☀️' : '🌙', nublado: '☁️', lluvia: '🌧️', tormenta: '⛈️', niebla: '🌫️', nieve: '🌨️' }[c.tipo];
  }
  public nombre(c: Clima | null): string {
    if (!c) return '';
    return { despejado: 'Despejado', nublado: 'Nublado', lluvia: 'Lloviendo', tormenta: 'Tormenta', niebla: 'Niebla', nieve: 'Nevando' }[c.tipo];
  }
}
