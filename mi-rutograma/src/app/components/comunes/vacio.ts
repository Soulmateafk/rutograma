import { Component, Input, booleanAttribute } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * PANTALLA VACÍA ILUSTRADA: cuando no hay nada que mostrar (sin quejas,
 * papelera vacía, sin cambios por aprobar…) sale un dibujito simpático con
 * un mensaje, en vez de un espacio en blanco. Los dibujos son SVG
 * sencillos con el color de la cuenta y se mueven suave (sin animaciones
 * si la cuenta las quitó).
 */
export type Dibujo = 'todo-bien' | 'buscar' | 'papelera' | 'camion' | 'calendario' | 'carpeta';

@Component({
  selector: 'app-vacio',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="vc" [class.vc-chico]="chico">
      <svg class="vc-dibujo" viewBox="0 0 160 120" aria-hidden="true" [ngSwitch]="dibujo">
        <ellipse class="vc-sombra" cx="80" cy="108" rx="46" ry="6"/>
        <g *ngSwitchCase="'todo-bien'" class="vc-flota">
          <circle cx="80" cy="56" r="38" class="vc-relleno"/>
          <path d="M62 57 L75 70 L99 44" class="vc-trazo vc-dibujar" stroke-width="7"/>
          <circle cx="122" cy="22" r="4" class="vc-chispa"/><circle cx="36" cy="30" r="3" class="vc-chispa d2"/><circle cx="128" cy="78" r="2.5" class="vc-chispa d3"/>
        </g>
        <g *ngSwitchCase="'buscar'" class="vc-flota">
          <rect x="38" y="24" width="64" height="76" rx="8" class="vc-hoja"/>
          <path d="M50 42h40M50 54h32M50 66h36" class="vc-linea"/>
          <g class="vc-lupa"><circle cx="104" cy="70" r="18" class="vc-trazo" stroke-width="6" fill="none"/><path d="M117 83 L132 98" class="vc-trazo" stroke-width="8"/></g>
        </g>
        <g *ngSwitchCase="'papelera'" class="vc-flota">
          <path d="M52 40h56l-6 62a6 6 0 0 1-6 5H64a6 6 0 0 1-6-5z" class="vc-relleno"/>
          <rect x="46" y="30" width="68" height="10" rx="5" class="vc-tapa"/>
          <path d="M70 52v40M80 52v40M90 52v40" class="vc-linea-blanca"/>
          <circle cx="118" cy="24" r="3.5" class="vc-chispa"/><circle cx="40" cy="22" r="2.5" class="vc-chispa d2"/>
        </g>
        <g *ngSwitchCase="'camion'">
          <g class="vc-andar">
            <path d="M26 82V46a4 4 0 0 1 4-4h56v40" class="vc-relleno"/>
            <path d="M86 56h20l14 14v12H86z" class="vc-cabina"/>
            <circle cx="48" cy="86" r="9" class="vc-rueda"/><circle cx="104" cy="86" r="9" class="vc-rueda"/>
            <path d="M94 60h10l8 8H94z" class="vc-vidrio"/>
          </g>
          <path d="M8 98h144" class="vc-linea vc-camino" stroke-dasharray="10 8"/>
        </g>
        <g *ngSwitchCase="'calendario'" class="vc-flota">
          <rect x="34" y="26" width="92" height="76" rx="10" class="vc-hoja"/>
          <rect x="34" y="26" width="92" height="20" rx="10" class="vc-relleno"/>
          <path d="M54 18v16M106 18v16" class="vc-trazo" stroke-width="6"/>
          <g class="vc-cuadros"><rect x="48" y="56" width="14" height="12" rx="3"/><rect x="73" y="56" width="14" height="12" rx="3"/><rect x="98" y="56" width="14" height="12" rx="3"/><rect x="48" y="78" width="14" height="12" rx="3"/><rect x="73" y="78" width="14" height="12" rx="3" class="vc-cuadro-on"/></g>
        </g>
        <g *ngSwitchDefault class="vc-flota">
          <path d="M30 40a6 6 0 0 1 6-6h28l8 8h52a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H36a6 6 0 0 1-6-6z" class="vc-relleno"/>
          <path d="M30 54h100" class="vc-linea-blanca"/>
          <circle cx="120" cy="22" r="3.5" class="vc-chispa"/><circle cx="42" cy="22" r="2.5" class="vc-chispa d2"/>
        </g>
      </svg>
      <div class="vc-titulo">{{ titulo }}</div>
      <div class="vc-texto" *ngIf="texto">{{ texto }}</div>
      <ng-content></ng-content>
    </div>
  `,
  styles: [`
    .vc { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 26px 16px; gap: 4px; }
    .vc-dibujo { width: 150px; height: 112px; margin-bottom: 6px; overflow: visible; }
    .vc-chico .vc-dibujo { width: 96px; height: 72px; }
    .vc-chico { padding: 14px 10px; }
    .vc-titulo { font-weight: 700; font-size: 15px; color: var(--text, #f9fafb); }
    .vc-chico .vc-titulo { font-size: 13px; }
    .vc-texto { font-size: 12.5px; color: var(--text2, #9ca3af); max-width: 340px; line-height: 1.45; }
    .vc-sombra { fill: rgba(0, 0, 0, 0.25); }
    .vc-relleno { fill: color-mix(in srgb, var(--acento, #2563eb) 85%, #ffffff); }
    .vc-cabina { fill: var(--acento, #2563eb); }
    .vc-tapa { fill: var(--acento, #2563eb); }
    .vc-hoja { fill: var(--bg3, #1f2937); stroke: var(--border2, #374151); stroke-width: 2; }
    .vc-linea { stroke: var(--border2, #4b5563); stroke-width: 5; stroke-linecap: round; fill: none; }
    .vc-linea-blanca { stroke: rgba(255, 255, 255, 0.55); stroke-width: 4; stroke-linecap: round; fill: none; }
    .vc-trazo { stroke: var(--acento-texto, #60a5fa); stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .vc-relleno + .vc-trazo, .vc-flota > .vc-dibujar { stroke: #ffffff; }
    .vc-rueda { fill: #1f2937; stroke: #94a3b8; stroke-width: 3; }
    .vc-vidrio { fill: rgba(255, 255, 255, 0.6); }
    .vc-chispa { fill: #facc15; }
    .vc-cuadros rect { fill: var(--border2, #374151); }
    .vc-cuadros .vc-cuadro-on { fill: var(--acento, #2563eb); }
    :host-context(html:not(.sin-animaciones)) .vc-flota { animation: vc-flotar 3.2s ease-in-out infinite; }
    :host-context(html:not(.sin-animaciones)) .vc-andar { animation: vc-andar 1.4s ease-in-out infinite; }
    :host-context(html:not(.sin-animaciones)) .vc-chispa { animation: vc-chispa 2s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
    :host-context(html:not(.sin-animaciones)) .vc-chispa.d2 { animation-delay: .6s; }
    :host-context(html:not(.sin-animaciones)) .vc-chispa.d3 { animation-delay: 1.2s; }
    :host-context(html:not(.sin-animaciones)) .vc-dibujar { stroke-dasharray: 60; stroke-dashoffset: 60; animation: vc-dibujar .9s .2s ease-out forwards; }
    :host-context(html:not(.sin-animaciones)) .vc-lupa { animation: vc-lupa 2.6s ease-in-out infinite; transform-origin: 104px 70px; }
    :host-context(html:not(.sin-animaciones)) .vc-camino { animation: vc-camino .8s linear infinite; }
    @keyframes vc-camino { to { stroke-dashoffset: -18; } }
    @keyframes vc-flotar { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
    @keyframes vc-andar { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
    @keyframes vc-chispa { 0%, 100% { opacity: .2; transform: scale(.6); } 50% { opacity: 1; transform: scale(1.3); } }
    @keyframes vc-dibujar { to { stroke-dashoffset: 0; } }
    @keyframes vc-lupa { 0%, 100% { transform: translate(0, 0) rotate(0); } 25% { transform: translate(-14px, -10px) rotate(-8deg); } 50% { transform: translate(-30px, 0) rotate(0); } 75% { transform: translate(-12px, 8px) rotate(6deg); } }
  `]
})
export class VacioComponent {
  @Input() dibujo: Dibujo = 'carpeta';
  @Input() titulo = '';
  @Input() texto = '';
  @Input({ transform: booleanAttribute }) chico = false;
}
