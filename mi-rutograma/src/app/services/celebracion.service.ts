import { Injectable, inject } from '@angular/core';
import { SonidoService } from './sonido.service';

/**
 * CELEBRACIONES: una lluvia de confeti con un mensaje (ej. "¡Mes completo!
 * Todos los viajes de octubre quedaron entregados"). Se dibuja directo en la
 * página y se quita sola; con "Quitar animaciones" no cae nada.
 */
@Injectable({ providedIn: 'root' })
export class CelebracionService {
  private sonido = inject(SonidoService);

  public confeti(titulo: string, detalle = ''): void {
    if (typeof document === 'undefined') return;
    const html = document.documentElement;
    if (html.classList.contains('sin-animaciones') || html.classList.contains('sin-confeti')) return;
    const capa = document.createElement('div');
    capa.className = 'cel-capa';
    capa.setAttribute('aria-hidden', 'true');
    const colores = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15', '#14b8a6', getComputedStyle(html).getPropertyValue('--acento').trim() || '#2563eb'];
    const n = window.innerWidth < 600 ? 60 : 120;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      const forma = i % 3;
      p.className = 'cel-p' + (forma === 1 ? ' cel-tira' : forma === 2 ? ' cel-redondo' : '');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colores[i % colores.length];
      p.style.setProperty('--x', (Math.random() * 240 - 120).toFixed(0) + 'px');
      p.style.setProperty('--r', (Math.random() * 1080 - 540).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * 0.9).toFixed(2) + 's';
      p.style.animationDuration = (2.6 + Math.random() * 1.8).toFixed(2) + 's';
      capa.appendChild(p);
    }
    const aviso = document.createElement('div');
    aviso.className = 'cel-aviso';
    const t = document.createElement('strong'); t.textContent = titulo; aviso.appendChild(t);
    if (detalle) { const d = document.createElement('span'); d.textContent = detalle; aviso.appendChild(d); }
    capa.appendChild(aviso);
    document.body.appendChild(capa);
    this.sonido.tocar('celebrar');
    setTimeout(() => capa.classList.add('cel-salir'), 5200);
    setTimeout(() => capa.remove(), 5800);
  }
}
