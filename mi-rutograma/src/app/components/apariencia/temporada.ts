import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { SonidoService } from '../../services/sonido.service';
import { Temporada, temporadaVisible, diasParaElDia } from '../../services/temporadas';

interface Fuego { x: number; y: number; delay: number; sombra: string; color: string; }
interface Particula { tipo: string; texto: string; color: string; left: number; delay: number; dur: number; tam: number; deriva: number; giro: number; opacidad: number; }

/**
 * DECORACIÓN DE TEMPORADA (services/temporadas.ts): cosas que caen despacio
 * (pocas, solo con movimiento: no cargan el equipo), un emoji junto al logo
 * y detalles propios de algunas fechas (telarañas, murciélagos y fantasma en
 * Halloween; luces en la barra en Navidad). No se pueden tocar ni tapan
 * nada. Cada cuenta la deja automática, la quita o escoge una para verla.
 * Con "Quitar animaciones" no cae nada (queda solo lo quieto).
 */
@Component({
  selector: 'app-temporada',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="temporada() as t">
      <!-- Detrás del contenido: brillo de colores en los bordes y lo que cae (pasa por detrás de las tarjetas). -->
      <div class="tp-brillo" aria-hidden="true"></div>
      <div class="tp-capa tp-fondo" [class.tp-sube]="t.sube" aria-hidden="true">
        <span *ngFor="let p of particulas()" class="tp-p" [ngClass]="'tp-' + p.tipo"
              [style.left.%]="p.left" [style.animation-delay.s]="p.delay" [style.animation-duration.s]="p.dur"
              [style.font-size.px]="p.tam" [style.--tam]="p.tam + 'px'" [style.--c]="p.color || null" [style.--op]="p.opacidad"
              [style.--deriva]="p.deriva + 'px'" [style.--giro]="p.giro + 'deg'">{{ p.texto }}</span>
      </div>
      <!-- Fuegos artificiales (Año Nuevo, 20 de Julio). -->
      <div class="tp-capa tp-fondo" *ngIf="fuegos().length" aria-hidden="true">
        <span *ngFor="let f of fuegos()" class="tp-fuego" [style.left.%]="f.x" [style.top.%]="f.y" [style.animation-delay.s]="f.delay"
              [style.box-shadow]="f.sombra" [style.color]="f.color"></span>
      </div>
      <!-- Adornos en las esquinas de abajo. -->
      <div class="tp-suelo tp-suelo-izq" *ngIf="t.suelo" aria-hidden="true"><span *ngFor="let e of t.suelo; let i = index" [style.animation-delay.s]="i * 0.4">{{ e }}</span></div>
      <div class="tp-suelo tp-suelo-der" *ngIf="t.suelo" aria-hidden="true"><span *ngFor="let e of t.suelo.slice().reverse(); let i = index" [style.animation-delay.s]="0.2 + i * 0.4">{{ e }}</span></div>
      <!-- Lo que cruza la pantalla de vez en cuando (encima, sin tapar: no se puede tocar). -->
      <div class="tp-capa" *ngIf="t.cruza" aria-hidden="true"><span class="tp-cruza" [ngClass]="t.cruza.clase">{{ t.cruza.emoji }}</span></div>

      <ng-container *ngIf="t.clave === 'halloween'">
        <svg class="tp-telarana tp-izq" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20"/>
          <path d="M0 22 Q11 18 22 0 M0 44 Q24 38 44 0 M0 66 Q36 58 66 0 M0 88 Q48 78 88 0"/></g></svg>
        <svg class="tp-telarana tp-der" viewBox="0 0 100 100" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2">
          <path d="M0 0 L100 100 M0 0 L50 100 M0 0 L100 50 M0 0 L20 100 M0 0 L100 20"/>
          <path d="M0 22 Q11 18 22 0 M0 44 Q24 38 44 0 M0 66 Q36 58 66 0 M0 88 Q48 78 88 0"/></g></svg>
        <div class="tp-luna" aria-hidden="true"></div>
        <div class="tp-relampago" aria-hidden="true"></div>
        <div class="tp-ojos tp-ojos-izq" aria-hidden="true"><i></i><i></i></div>
        <div class="tp-ojos tp-ojos-der" aria-hidden="true"><i></i><i></i></div>
        <div class="tp-arana" aria-hidden="true"><span class="tp-hilo"></span><span class="tp-arana-cuerpo">🕷️</span></div>
        <div class="tp-niebla" aria-hidden="true"></div>
        <div class="tp-capa" aria-hidden="true">
          <span class="tp-murcielago" style="top: 18%; animation-delay: 2s;">🦇</span>
          <span class="tp-murcielago tp-m2" style="top: 32%; animation-delay: 11s;">🦇</span>
          <span class="tp-murcielago tp-m3" style="top: 12%; animation-delay: 19s;">🦇</span>
          <span class="tp-fantasma">👻</span>
        </div>
      </ng-container>
      <div class="tp-nieve-suelo" *ngIf="t.clave === 'navidad'" aria-hidden="true"></div>
      <div class="tp-escarcha" *ngIf="t.clave === 'navidad'" aria-hidden="true"></div>

      <!-- Cuenta regresiva de la temporada (una vez por sesión, se va sola o con la ×). -->
      <div class="tp-anuncio" *ngIf="anuncio() as an" animate.leave="ap-ocultar" role="status">
        <span class="tp-anuncio-emoji">{{ t.emoji }}</span>
        <span class="tp-anuncio-texto"><strong>{{ an.titulo }}</strong><small>{{ an.detalle }}</small></span>
        <button class="tp-anuncio-x" (click)="anuncio.set(null)" aria-label="Cerrar">×</button>
      </div>
      <!-- El día grande: estallido de papelitos y fuegos, una vez por día. -->
      <div class="tp-estallido" *ngIf="estallido().length" aria-hidden="true">
        <span *ngFor="let e of estallido()" [class.tp-papel]="!e.texto" [style.background]="e.texto ? null : e.color"
              [style.--dx]="e.dx + 'px'" [style.--dy]="e.dy + 'px'" [style.--giro]="e.giro + 'deg'" [style.animation-delay.s]="e.delay">{{ e.texto }}</span>
      </div>
    </ng-container>
  `
})
export class TemporadaComponent {
  private theme = inject(ThemeService);
  private sonido = inject(SonidoService);
  private hoy = signal(new Date());
  public temporada = computed<Temporada | null>(() => temporadaVisible(this.theme.temporadaPreferida(), this.hoy()));
  public particulas = computed<Particula[]>(() => {
    const t = this.temporada();
    if (!t) return [];
    const celular = typeof window !== 'undefined' && window.innerWidth < 600;
    const n = Math.round(t.cuantas * (celular ? 0.5 : 1));
    return Array.from({ length: n }, (_, i) => {
      const elemento = t.particulas[i % t.particulas.length];
      // "tipo:#color" = figura dibujada; "#color" = papelito; lo demás = emoji.
      const [tipo, color] = elemento.includes(':') ? elemento.split(':') : elemento.startsWith('#') ? ['papel', elemento] : ['emoji', ''];
      const tamBase: Record<string, number> = { nieve: 6, bokeh: 34, petalo: 16, corazon: 16, estrella: 14, papel: 10, emoji: 20 };
      const lento = tipo === 'bokeh' ? 1.8 : tipo === 'nieve' ? 1.1 : 1;
      return {
        tipo, texto: tipo === 'emoji' ? elemento : '', color: color || '',
        left: Math.round(((i + 0.5) / n) * 100 + (Math.random() * 6 - 3)),
        delay: -Math.round(Math.random() * 24 * 10) / 10,            // ya van cayendo al abrir
        dur: Math.round((11 + Math.random() * 12) * lento),
        tam: Math.round(tamBase[tipo] * (0.7 + Math.random() * 0.9)),
        deriva: Math.round(Math.random() * 90 - 45),
        giro: Math.round(Math.random() * 720 - 360),
        opacidad: tipo === 'bokeh' ? 0.35 + Math.random() * 0.3 : tipo === 'nieve' ? 0.55 + Math.random() * 0.45 : 0.85
      };
    });
  });

  /** Fuegos artificiales: cada uno es un punto con 16 chispas (sombras) alrededor. */
  public fuegos = computed<Fuego[]>(() => {
    const t = this.temporada();
    if (!t?.fuegos) return [];
    return Array.from({ length: 6 }, (_, i) => {
      const color = t.fuegos![i % t.fuegos!.length];
      const r = 46 + Math.round(Math.random() * 30);
      const sombra = Array.from({ length: 16 }, (_, k) => {
        const a = (k / 16) * Math.PI * 2;
        return `${Math.round(Math.cos(a) * r)}px ${Math.round(Math.sin(a) * r)}px 0 1px ${k % 2 ? color : '#fff'}`;
      }).join(', ');
      return { x: 10 + Math.round(Math.random() * 80), y: 12 + Math.round(Math.random() * 45), delay: Math.round(i * 1.1 * 10) / 10, sombra, color };
    });
  });

  public anuncio = signal<{ titulo: string; detalle: string } | null>(null);
  public estallido = signal<Array<{ texto: string; color: string; dx: number; dy: number; giro: number; delay: number }>>([]);
  private anunciadoPara = '';

  /** Cuenta regresiva y celebración: una vez por sesión (y el estallido, una vez por día). */
  private anunciar(t: Temporada | null): void {
    if (!t || typeof window === 'undefined' || this.anunciadoPara === t.clave) return;
    this.anunciadoPara = t.clave;
    const hoy = new Date();
    const fecha = `${hoy.getFullYear()}-${hoy.getMonth() + 1}-${hoy.getDate()}`;
    const leer = (k: string) => { try { return sessionStorage.getItem(k) || localStorage.getItem(k); } catch { return null; } };
    const n = diasParaElDia(t, hoy);
    if (!leer('rutograma_anuncio_tp:' + t.clave + ':' + fecha)) {
      try { sessionStorage.setItem('rutograma_anuncio_tp:' + t.clave + ':' + fecha, '1'); } catch { /* nada */ }
      const titulo = n === 0 ? `¡Hoy es ${t.nombreDia}!` : n === 1 ? `¡Mañana es ${t.nombreDia}!` : n > 1 ? `Faltan ${n} días para ${t.nombreDia}` : t.saludo;
      setTimeout(() => {
        this.anuncio.set({ titulo, detalle: n >= 0 ? t.saludo + ' Que tengas un buen día de trabajo.' : 'Seguimos celebrando. Que tengas un buen día de trabajo.' });
        setTimeout(() => this.anuncio.set(null), 11000);
      }, 4200);    // después del saludo
    }
    // El día grande: estallido una vez por día en este equipo (si la cuenta no quitó las animaciones).
    const claveDia = 'rutograma_estallido:' + t.clave + ':' + fecha;
    if (n === 0 && !leer(claveDia) && !document.documentElement.classList.contains('sin-animaciones')) {
      try { localStorage.setItem(claveDia, '1'); } catch { /* nada */ }
      const colores = t.fuegos || [t.colores[0], t.colores[1], '#facc15', '#ffffff'];
      setTimeout(() => {
        this.estallido.set(Array.from({ length: 70 }, (_, i) => {
          const a = Math.random() * Math.PI * 2, r = 160 + Math.random() * 380;
          const emoji = i % 4 === 0 && !t.particulas[0].startsWith('#') ? t.particulas[i % t.particulas.length] : '';
          return { texto: emoji, color: colores[i % colores.length], dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r - 120), giro: Math.round(Math.random() * 720 - 360), delay: Math.round(Math.random() * 25) / 100 };
        }));
        this.sonido.tocar('celebrar');
        setTimeout(() => this.estallido.set([]), 4200);
      }, 1200);
    }
  }

  constructor() {
    // La temporada cambia sola al pasar la medianoche (se revisa cada hora).
    if (typeof window !== 'undefined') setInterval(() => this.hoy.set(new Date()), 3600000);
    effect(() => {
      const t = this.temporada();
      if (typeof document === 'undefined') return;
      const html = document.documentElement;
      if (t) {
        this.anunciar(t);
        html.setAttribute('data-temporada', t.clave);
        html.style.setProperty('--temporada-emoji', `"${t.emoji}"`);
        html.style.setProperty('--tp-c1', t.colores[0]);
        html.style.setProperty('--tp-c2', t.colores[1]);
        html.style.setProperty('--tp-cinta', t.cinta);
      } else {
        html.removeAttribute('data-temporada');
        ['--temporada-emoji', '--tp-c1', '--tp-c2', '--tp-cinta'].forEach(v => html.style.removeProperty(v));
      }
    });
  }
}
