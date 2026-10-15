import { ChangeDetectorRef, Component, NgZone, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ThemeService } from '../../services/theme.service';
import { UiService } from '../../services/ui.service';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { ClimaService } from '../../services/clima.service';
import { SonidoService } from '../../services/sonido.service';
import { Router } from '@angular/router';
import { GuiaService } from '../../services/guia.service';
import { AtajosService } from '../../services/atajos.service';
import { CelebracionService } from '../../services/celebracion.service';
import { TAREAS } from '../../services/guias';
import { TareasService } from '../../services/tareas.service';
import { responder, normalizarPregunta, EJEMPLOS, Accion, Tema, Pedido } from './mascota-respuestas';
import { textoDespachos } from './mascota-despachos';
import { API } from '../../api-base';
import { zoomPagina } from '../../zoom';
import { temporadaVisible, diasParaElDia } from '../../services/temporadas';
import { al, CONSEJOS, CONSEJOS_POR_PAGINA, DATOS, AL_GUARDAR, AL_ELIMINAR, AL_ERROR, COSQUILLAS, AL_DESPERTAR, TONTERIAS, HOLA, HORA, DIA_SEMANA, FIESTAS, datosDelRutograma } from './mascota-frases';

/**
 * LA MASCOTA DE MAKAND: un furgón refrigerado con carita en la esquina de abajo.
 *  - Saluda al entrar y mira hacia donde va el mouse.
 *  - Celebra cuando algo se guarda y se pone triste un momento si hay un error.
 *  - Se duerme si nadie usa la app un rato ("Zzz") y despierta al volver.
 *  - Se disfraza en cada fiesta (gorro de Papá Noel, sombrero de bruja,
 *    casco el Día del Trabajo, orejas de conejo en Pascua...).
 *  - Se le pueden hacer preguntas (mascota-respuestas.ts): de un viaje, de
 *    cuántos viajes hay, de cómo hacer algo… y aprende lo que no entiende.
 *  - Reacciona a lo que pasa: todos los viajes de hoy entregados, un varado,
 *    cambios aprobados o por aprobar. Los viernes a las 5 cuenta un chiste.
 *  - Habla: al tocarlo, y de vez en cuando solo, dice un consejo (también de
 *    la pantalla abierta), un dato curioso, un dato del propio Rutograma,
 *    algo de la festividad, según la hora, el día, el clima o la operación
 *    de hoy. Todas las frases están en mascota-frases.ts.
 * Cada cuenta lo quita en Apariencia → "La mascota".
 */
type Estado = 'normal' | 'feliz' | 'triste' | 'dormido';

@Component({
  selector: 'app-mascota',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="ms-volver" *ngIf="arrastrando() && pos()">Suéltalo aquí para volver a su lugar</div>
    <div class="ms" *ngIf="visible()" [ngClass]="'ms-' + estado()" (click)="tocar()" (pointerdown)="empezarArrastre($event)"
         [class.ms-movido]="!!pos()" [class.ms-der]="pos()?.der" [class.ms-arriba]="pos()?.arriba" [class.ms-arrastrando]="arrastrando()"
         [style.left.px]="pos()?.x" [style.top.px]="pos()?.y" title="¡Hola! Tócame · arrástrame para moverme">
      <div class="ms-globo" *ngIf="!panel() && globo() as g" animate.leave="ms-globo-sale">{{ g }}</div>
      <!-- Pregúntale al furgoncito -->
      <div class="ms-panel" *ngIf="panel()" animate.leave="ms-globo-sale" (click)="$event.stopPropagation()">
        <button class="ms-cerrar" (click)="cerrarPanel()" title="Cerrar" aria-label="Cerrar">×</button>
        <div class="ms-respuesta">{{ respuesta() }}</div>
        <div class="ms-botones" *ngIf="acciones().length">
          <button *ngFor="let a of acciones()" class="ms-accion" (click)="hacer(a)">{{ a.texto }} →</button>
        </div>
        <div class="ms-opciones" *ngIf="opciones().length">
          <button *ngFor="let o of opciones()" class="ms-opcion" (click)="aprender(o)">{{ nombreTema(o) }}</button>
        </div>
        <form class="ms-pregunta" (ngSubmit)="preguntar()">
          <input #cajaPregunta name="pregunta" [(ngModel)]="pregunta" [placeholder]="oyendo() ? 'Te escucho… 👂' : (puedeHablar ? 'Pregúntame algo o toca 🎤' : 'Pregúntame algo…')" autocomplete="off" maxlength="200" (keydown.escape)="cerrarPanel()">
          <button type="button" *ngIf="puedeHablar" class="ms-mic" [class.oyendo]="oyendo()" (click)="hablar()"
                  [attr.aria-label]="oyendo() ? 'Dejar de escuchar' : 'Preguntar hablando'" [title]="oyendo() ? 'Te escucho… toca para parar' : 'Pregúntame hablando'">🎤</button>
          <button type="submit" [disabled]="!pregunta.trim()" aria-label="Preguntar">➤</button>
        </form>
        <div class="ms-sugerencias">
          <button *ngFor="let s of sugerencias()" (click)="pregunta = s; preguntar()">{{ s }}</button>
        </div>
      </div>
      <span class="ms-zzz" *ngIf="estado() === 'dormido'">z<b>z</b><i>Z</i></span>
      <span class="ms-humo" *ngIf="estado() === 'feliz'"><i></i><i></i><i></i></span>
      <svg class="ms-cuerpo" viewBox="0 0 160 100" aria-hidden="true">
        <defs>
          <linearGradient id="msCaja" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e2e8f0"/><stop offset="1" stop-color="#cbd5e1"/></linearGradient>
          <linearGradient id="msCabina" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--acento, #2563eb)"/><stop offset="1" stop-color="color-mix(in srgb, var(--acento, #2563eb) 65%, #0f172a)"/></linearGradient>
          <linearGradient id="msVidrio" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0f2fe"/><stop offset="1" stop-color="#7dd3fc"/></linearGradient>
        </defs>
        <ellipse cx="80" cy="95" rx="70" ry="4" class="ms-sombra"/>
        <!-- chasis -->
        <rect x="8" y="72" width="140" height="5" rx="1.5" fill="#1f2937"/>
        <!-- furgón -->
        <rect x="6" y="14" width="96" height="58" rx="3" fill="url(#msCaja)" stroke="#94a3b8" stroke-width=".8"/>
        <g stroke="#94a3b8" stroke-opacity=".35" stroke-width=".6"><path d="M18 16 v54 M30 16 v54 M42 16 v54 M54 16 v54 M66 16 v54 M78 16 v54 M90 16 v54"/></g>
        <path d="M9 17 v52" stroke="#64748b" stroke-width="1.2"/><rect x="10" y="40" width="2.2" height="9" rx="1" fill="#64748b"/>
        <rect x="6" y="56" width="96" height="7" fill="var(--acento, #2563eb)"/>
        <text x="52" y="44" text-anchor="middle" class="ms-marca">MAKAND</text>
        <text x="52" y="52" text-anchor="middle" class="ms-sub">logística refrigerada</text>
        <!-- unidad de frío -->
        <rect x="92" y="17" width="12" height="20" rx="2" fill="#475569"/>
        <g stroke="#94a3b8" stroke-width=".8"><path d="M94 21 h8 M94 24 h8 M94 27 h8 M94 30 h8 M94 33 h8"/></g>
        <!-- tubo de escape -->
        <rect x="104" y="10" width="2.6" height="26" rx="1.2" fill="#9ca3af"/>
        <!-- cabina -->
        <path d="M106 30 h24 a4 4 0 0 1 3.2 1.6 l12 16.4 a5 5 0 0 1 1 3 v19 a3 3 0 0 1 -3 3 h-37.2 z" fill="url(#msCabina)"/>
        <path d="M131 33.5 l11.5 15.5 h-14 a1.5 1.5 0 0 1 -1.5 -1.5 v-12.5 a1.5 1.5 0 0 1 1.5 -1.5 z" fill="url(#msVidrio)"/>
        <path d="M132 36 l3 4" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>
        <rect x="109" y="34" width="15" height="13" rx="2" fill="url(#msVidrio)"/>
        <path d="M108 51 h18 M125.5 34 v35" stroke="#0f172a" stroke-opacity=".35" stroke-width=".9"/>
        <rect x="118" y="53" width="5" height="1.6" rx=".8" fill="#e2e8f0"/>
        <rect x="104.5" y="36" width="3.5" height="9" rx="1" fill="#1f2937"/>
        <!-- ojos en el parabrisas -->
        <g class="ms-ojos" [attr.transform]="'translate(' + mirada().x + ' ' + mirada().y + ')'">
          <ng-container *ngIf="estado() !== 'dormido' && estado() !== 'feliz'">
            <ellipse cx="133.5" cy="42" rx="2.4" ry="2.8" fill="#0f172a"/><ellipse cx="139.5" cy="44.5" rx="2.2" ry="2.6" fill="#0f172a"/>
            <circle cx="134.2" cy="41" r=".8" fill="#fff"/><circle cx="140.1" cy="43.6" r=".7" fill="#fff"/>
          </ng-container>
        </g>
        <g *ngIf="estado() === 'feliz'" fill="none" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round"><path d="M131 43 q2.5 -3 5 0"/><path d="M137.5 45.5 q2.2 -2.6 4.4 0"/></g>
        <g *ngIf="estado() === 'dormido'" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"><path d="M131 42.5 q2.5 2 5 0"/><path d="M137.5 45 q2.2 1.8 4.4 0"/></g>
        <!-- frente: farola, parrilla, boca y parachoques -->
        <rect x="141" y="54" width="6" height="4.5" rx="1.5" class="ms-farola"/>
        <g stroke="#0f172a" stroke-opacity=".45" stroke-width=".9"><path d="M139 60 h7 M139 62.5 h7 M139 65 h7"/></g>
        <path *ngIf="estado() !== 'triste'" d="M131 58 q4 3.5 8 0" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
        <path *ngIf="estado() === 'triste'" d="M131 60 q4 -3 8 0" fill="none" stroke="#0f172a" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="129" cy="54.5" r="1.6" fill="#fb7185" fill-opacity=".55"/>
        <rect x="128" y="68" width="21" height="5" rx="1.5" fill="#94a3b8"/>
        <!-- guardafangos y ruedas -->
        <path d="M18 72 a12 12 0 0 1 24 0 M42 72 a12 12 0 0 1 24 0 M114 72 a12 12 0 0 1 24 0" fill="#1f2937"/>
        <g class="ms-rueda" *ngFor="let x of [30, 54, 126]"><circle [attr.cx]="x" cy="78" r="10" fill="#111827"/><circle [attr.cx]="x" cy="78" r="5.5" fill="#9ca3af"/><circle [attr.cx]="x" cy="78" r="2" fill="#4b5563"/>
          <circle [attr.cx]="x" [attr.cy]="74" r=".8" fill="#4b5563"/><circle [attr.cx]="x + 4" cy="78" r=".8" fill="#4b5563"/><circle [attr.cx]="x" cy="82" r=".8" fill="#4b5563"/><circle [attr.cx]="x - 4" cy="78" r=".8" fill="#4b5563"/></g>
        <!-- disfraz de temporada (sobre el techo de la cabina) -->
        <g [ngSwitch]="disfraz()" transform="translate(48 0)">
          <g *ngSwitchCase="'gorro'"><path d="M60 31 L70 12 L82 30 Z" fill="#dc2626"/><rect x="57" y="28" width="27" height="5" rx="2.5" fill="#fff"/><circle cx="70" cy="11" r="3.5" fill="#fff"/></g>
          <g *ngSwitchCase="'bruja'"><path d="M58 31 L71 6 L80 29 Z" fill="#4c1d95"/><rect x="54" y="28" width="32" height="4.5" rx="2" fill="#4c1d95"/><rect x="62" y="25" width="18" height="3" fill="#f97316"/></g>
          <g *ngSwitchCase="'fiesta'"><path d="M62 31 L70 10 L78 31 Z" fill="#a855f7"/><path d="M64.5 25 L75.5 25 M66.5 19 L73.5 19" stroke="#facc15" stroke-width="2"/><circle cx="70" cy="9" r="3" fill="#facc15"/></g>
          <g *ngSwitchCase="'casco'"><path d="M59 31 a12 10 0 0 1 24 0 Z" fill="#facc15"/><rect x="57" y="29" width="28" height="3.5" rx="1.5" fill="#eab308"/></g>
          <g *ngSwitchCase="'orejas'"><ellipse cx="65" cy="18" rx="3.5" ry="11" fill="#fff" stroke="#f9a8d4" stroke-width="1.5"/><ellipse cx="76" cy="18" rx="3.5" ry="11" fill="#fff" stroke="#f9a8d4" stroke-width="1.5"/></g>
          <g *ngSwitchCase="'gorra'"><path d="M60 31 a10 8 0 0 1 20 0 Z" fill="#1d4ed8"/><path d="M78 30 h9 a2 2 0 0 1 0 3 h-9 z" fill="#1e3a8a"/><path d="M70 22 l1.2 2.6 2.8 .3 -2.1 1.9 .6 2.8 -2.5 -1.4 -2.5 1.4 .6 -2.8 -2.1 -1.9 2.8 -.3 z" fill="#facc15"/></g>
          <g *ngSwitchCase="'bandera'"><rect x="83" y="4" width="1.5" height="28" fill="#cbd5e1"/><rect x="84.5" y="5" width="14" height="5" fill="#fcd116"/><rect x="84.5" y="10" width="14" height="2.5" fill="#003893"/><rect x="84.5" y="12.5" width="14" height="2.5" fill="#ce1126"/></g>
          <g *ngSwitchCase="'corazon'" class="ms-latido"><path d="M70 28 c-6 -5 -9 -9 -6 -12 c2 -2 5 -1 6 1 c1 -2 4 -3 6 -1 c3 3 0 7 -6 12z" fill="#ec4899"/></g>
          <g *ngSwitchCase="'flor'"><circle cx="64" cy="27" r="3" fill="#f472b6"/><circle cx="68" cy="25" r="3" fill="#f472b6"/><circle cx="66" cy="22" r="3" fill="#f472b6"/><circle cx="62" cy="23" r="3" fill="#f472b6"/><circle cx="65" cy="24.5" r="2" fill="#facc15"/></g>
          <g *ngSwitchCase="'vela'"><rect x="68" y="16" width="5" height="14" rx="1" fill="#fde68a"/><path d="M70.5 9 q3 4 0 7 q-3 -3 0 -7z" fill="#f97316" class="ms-llama"/></g>
          <g *ngSwitchCase="'calabaza'"><ellipse cx="70.5" cy="25" rx="8" ry="6" fill="#f97316"/><rect x="69.5" y="17" width="2" height="3" fill="#15803d"/><path d="M66 24 l2 -2 l2 2z M72 24 l2 -2 l2 2z" fill="#1c1917"/></g>
        </g>
      </svg>
    </div>
  `,
  styles: [`
    .ms { position: fixed; left: 12px; bottom: 10px; width: 150px; height: 94px; z-index: 9990; cursor: pointer; user-select: none; }
    .ms-cuerpo { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 6px 10px rgba(0,0,0,.35)); animation: ms-respira 3s ease-in-out infinite; transform-origin: 50% 100%; }
    .ms-sombra { fill: rgba(0,0,0,.25); }
    .ms-marca { font: 900 13px system-ui, sans-serif; fill: var(--acento, #2563eb); letter-spacing: 1px; }
    .ms-sub { font: 600 5.5px system-ui, sans-serif; fill: #64748b; letter-spacing: .4px; }
    .ms-farola { fill: #fef9c3; filter: drop-shadow(0 0 3px #fde047); }
    .ms-ojos { transition: transform .15s ease-out; }
    @keyframes ms-respira { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.01, .985); } }
    .ms-feliz .ms-cuerpo { animation: ms-salta .5s ease-in-out 3; }
    @keyframes ms-salta { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-10px) rotate(-2deg); } 70% { transform: translateY(0) scale(1.03, .97); } }
    .ms-triste .ms-cuerpo { animation: ms-tiembla .25s ease-in-out 4; }
    @keyframes ms-tiembla { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
    .ms-dormido .ms-cuerpo { animation: ms-ronca 3.2s ease-in-out infinite; }
    .ms-dormido .ms-farola { fill: #94a3b8; filter: none; }
    @keyframes ms-ronca { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.02, .97); } }
    .ms-rueda { transform-box: fill-box; transform-origin: center; }
    .ms-feliz .ms-rueda { animation: ms-gira .4s linear 4; }
    @keyframes ms-gira { to { transform: rotate(360deg); } }
    .ms-latido { transform-box: fill-box; transform-origin: center; animation: ms-latir 1s ease-in-out infinite; }
    @keyframes ms-latir { 50% { transform: scale(1.2); } }
    .ms-llama { transform-box: fill-box; transform-origin: 50% 100%; animation: ms-llama 1s ease-in-out infinite alternate; }
    @keyframes ms-llama { to { transform: scale(.85, 1.15) rotate(5deg); } }
    .ms-humo { position: absolute; left: 66%; top: -4px; }
    .ms-humo i { position: absolute; width: 10px; height: 10px; border-radius: 50%; background: rgba(148, 163, 184, .55); animation: ms-humo 1.2s ease-out infinite; }
    .ms-humo i:nth-child(2) { animation-delay: .35s; } .ms-humo i:nth-child(3) { animation-delay: .7s; }
    @keyframes ms-humo { from { opacity: .8; transform: translate(0, 0) scale(.5); } to { opacity: 0; transform: translate(-14px, -22px) scale(1.6); } }
    .ms-zzz { position: absolute; right: 4px; top: -8px; font: 800 13px system-ui; color: var(--acento-texto, #60a5fa); }
    .ms-zzz b, .ms-zzz i { font-style: normal; display: inline-block; animation: ms-z 2.4s ease-in-out infinite; }
    .ms-zzz b { font-size: 16px; animation-delay: .4s; } .ms-zzz i { font-size: 19px; animation-delay: .8s; }
    @keyframes ms-z { 0% { opacity: 0; transform: translateY(6px); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
    .ms-globo { position: absolute; left: 112px; bottom: 80px; width: max-content; max-width: 260px; padding: 8px 12px; border-radius: 14px 14px 14px 4px; font-size: 12.5px; line-height: 1.35; white-space: normal;
      background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 2px solid var(--acento, #2563eb); box-shadow: 0 10px 24px rgba(0,0,0,.35); animation: ms-globo .35s cubic-bezier(.2,.9,.3,1.4); }
    :host-context(html.con-fondo) .ms-globo { background: #111827; }
    :host-context(body.tema-claro) .ms-globo { background: #fff; }
    @keyframes ms-globo { from { opacity: 0; transform: translateY(8px) scale(.8); transform-origin: 0 100%; } to { opacity: 1; transform: none; } }
    .ms-globo-sale { animation: ms-globo-sale .25s ease-in forwards !important; }
    @keyframes ms-globo-sale { to { opacity: 0; transform: translateY(6px) scale(.9); } }
    .ms-panel { position: absolute; left: 112px; bottom: 80px; width: 330px; max-width: calc(100vw - 140px); padding: 12px; border-radius: 16px 16px 16px 4px; font-size: 13px; line-height: 1.4; cursor: default;
      background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 2px solid var(--acento, #2563eb); box-shadow: 0 14px 32px rgba(0,0,0,.4); animation: ms-globo .35s cubic-bezier(.2,.9,.3,1.4); }
    :host-context(html.con-fondo) .ms-panel { background: #111827; }
    :host-context(body.tema-claro) .ms-panel { background: #fff; }
    .ms-cerrar { position: absolute; top: 4px; right: 8px; background: none; border: 0; font-size: 18px; line-height: 1; color: var(--color-texto-apagado, #94a3b8); cursor: pointer; }
    .ms-respuesta { padding-right: 16px; white-space: pre-line; }
    .ms-botones, .ms-opciones, .ms-sugerencias { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .ms-accion { background: var(--acento, #2563eb); color: #fff; border: 0; border-radius: 8px; padding: 5px 10px; font-size: 12px; font-weight: 700; cursor: pointer; }
    .ms-opcion { background: color-mix(in srgb, var(--acento, #2563eb) 15%, transparent); color: inherit; border: 1px solid var(--acento, #2563eb); border-radius: 8px; padding: 4px 9px; font-size: 12px; cursor: pointer; text-align: left; }
    .ms-pregunta { display: flex; gap: 6px; margin-top: 10px; }
    .ms-pregunta input { flex: 1; min-width: 0; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--color-borde, #334155); background: var(--color-fondo-input, #1e293b); color: inherit; font-size: 13px; }
    .ms-pregunta button { border: 0; border-radius: 8px; padding: 0 12px; background: var(--acento, #2563eb); color: #fff; font-size: 14px; cursor: pointer; }
    .ms-pregunta button:disabled { opacity: .45; cursor: default; }
    .ms-pregunta .ms-mic { background: var(--color-fondo-input, #1e293b); border: 1px solid var(--color-borde, #334155); padding: 0 9px; font-size: 15px; }
    .ms-pregunta .ms-mic.oyendo { background: #dc2626; border-color: #dc2626; animation: ms-oyendo 1.1s ease-in-out infinite; }
    @keyframes ms-oyendo { 0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, .55); } 50% { box-shadow: 0 0 0 7px rgba(220, 38, 38, 0); } }
    @media (prefers-reduced-motion: reduce) { .ms-pregunta .ms-mic.oyendo { animation: none; } }
    .ms-sugerencias button { background: none; border: 1px dashed var(--color-borde, #475569); color: var(--color-texto-secundario, #cbd5e1); border-radius: 12px; padding: 3px 9px; font-size: 11px; cursor: pointer; }
    :host-context(html.modo-enfoque) .ms { display: none; }
    :host-context(html.sin-animaciones) .ms * { animation: none !important; }
    /* Movido por la persona (se guarda por cuenta): el globo y el panel se abren hacia donde haya espacio. */
    .ms.ms-movido { bottom: auto; }
    .ms.ms-arrastrando { cursor: grabbing; transition: none; filter: drop-shadow(0 8px 14px rgba(0, 0, 0, .45)); }
    .ms.ms-der .ms-globo, .ms.ms-der .ms-panel { left: auto; right: 112px; border-radius: 14px 14px 4px 14px; }
    .ms.ms-arriba .ms-globo, .ms.ms-arriba .ms-panel { bottom: auto; top: 70px; }
    .ms-volver { position: fixed; left: 12px; bottom: 10px; width: 150px; height: 94px; border: 2px dashed rgba(148, 163, 184, .6); border-radius: 18px; z-index: 9989; pointer-events: none; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #cbd5e1; text-align: center; }
    @media (max-width: 600px) { .ms { width: 96px; height: 60px; left: 6px; bottom: 6px; } .ms-globo { left: 70px; bottom: 54px; max-width: 200px; } .ms-panel { left: 4px; bottom: 64px; width: calc(100vw - 20px); max-width: none; } }
  `]
})
export class MascotaComponent implements OnDestroy {
  private theme = inject(ThemeService);
  private ui = inject(UiService);
  private account = inject(AccountService);
  private auth = inject(AuthService);
  private ds = inject(DataService);
  private climaSrv = inject(ClimaService);
  private sonido = inject(SonidoService);
  private zone = inject(NgZone);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private guia = inject(GuiaService);
  private atajos = inject(AtajosService);
  private celebracion = inject(CelebracionService);
  private tareasSrv = inject(TareasService);

  public estado = signal<Estado>('normal');
  public globo = signal<string | null>(null);
  public mirada = signal({ x: 0, y: 0 });
  public visible = computed(() => { this.theme.cambio(); return this.theme.ap.mascota && !!this.auth.currentUser; });
  public disfraz = computed(() => {
    const t = temporadaVisible(this.theme.temporadaPreferida());
    const m: Record<string, string> = {
      navidad: 'gorro', halloween: 'bruja', 'ano-nuevo': 'fiesta', aniversario: 'fiesta', trabajo: 'casco', 'semana-santa': 'orejas',
      conductor: 'gorra', padre: 'gorra', independencia: 'bandera', boyaca: 'bandera', 'san-valentin': 'corazon', 'amor-amistad': 'corazon',
      madre: 'flor', mujer: 'flor', velitas: 'vela'
    };
    return t ? (t.clave === 'halloween' && new Date().getDate() % 2 ? 'calabaza' : m[t.clave] || '') : '';
  });

  private relojEstado: any = null;
  private relojGlobo: any = null;
  private relojSueno: any = null;
  private relojCharla: any = null;
  private toques: number[] = [];
  private subAvisos = this.ui.avisos.subscribe(a => {
    if (a.tipo === 'ok') {
      this.ponerEstado('feliz', 1800);
      if (/aprobad/i.test(a.texto)) { this.decir('👏👏 ¡Aprobado! Así da gusto.', 3000); return; }
      if (Math.random() < 0.35) this.decir(/elimin|borr/i.test(a.texto) ? al(AL_ELIMINAR) : al(AL_GUARDAR), 2500);
    } else if (a.tipo === 'err') { this.ponerEstado('triste', 1600); this.decir(al(AL_ERROR), 3500); }
  });
  private alMover = (e: PointerEvent) => {
    this.despertar();
    // Los ojos miran hacia el mouse (poquito, para que no se vea raro).
    const dx = e.clientX - 140, dy = e.clientY - (window.innerHeight - 55);
    const d = Math.hypot(dx, dy) || 1;
    const x = Math.round(dx / d * 1.4 * 10) / 10, y = Math.round(dy / d * 1.2 * 10) / 10;
    const m = this.mirada();
    if (m.x !== x || m.y !== y) this.zone.run(() => this.mirada.set({ x, y }));
  };
  private alTeclear = () => this.despertar();
  private subDatos: any = null;
  private relojViernes: any = null;
  private alClicFuera = (e: Event) => { if (this.panel() && !(e.target as HTMLElement)?.closest?.('.ms')) this.zone.run(() => this.cerrarPanel()); };

  constructor() {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      let ultimo = 0;
      document.addEventListener('pointermove', e => { const t = performance.now(); if (t - ultimo > 80) { ultimo = t; this.alMover(e); } }, { passive: true });
      document.addEventListener('keydown', this.alTeclear, { passive: true });
    });
    // Donde la dejó esta cuenta (al entrar o cambiar de cuenta), y que no quede fuera al achicar la ventana.
    effect(() => { if (this.visible()) this.posGuardada(); });
    window.addEventListener('resize', () => { const p = this.pos(); if (p) { this.pos.set(this.posDesde(p.x, p.y)); this.cdr.detectChanges(); } });
    this.despertar();
    this.programarCharla();
    this.subDatos = this.ds.dataChanged.subscribe(() => this.revisarOperacion());
    this.relojViernes = setInterval(() => this.revisarViernes(), 60000);
    // Cambios por aprobar: al jefe le avisa los nuevos; al auxiliar, cuando le revisan los suyos.
    effect(() => {
      const n = this.ui.pendientesAprobacion();
      const antes = this.pendientesAntes;
      this.pendientesAntes = n;
      if (n === null || antes === null || !this.visible()) return;
      if (this.auth.puedeAprobar && n > antes) { this.ponerEstado('feliz', 1500); this.decir(`Llegó ${n - antes === 1 ? 'un cambio' : `${n - antes} cambios`} para aprobar. 📥`, 6000); }
      else if (this.auth.necesitaAprobacion && !this.auth.puedeAprobar && n < antes) { this.ponerEstado('feliz', 2500); this.decir('¡El jefe revisó tus cambios! 👏 Míralo en Aprobaciones.', 7000); }
    });
    // Cerrar el panel de preguntas al tocar fuera de él.
    document.addEventListener('click', this.alClicFuera, true);
    // Con la mascota, lo de la esquina izquierda de abajo se corre un poco.
    effect(() => document.documentElement.classList.toggle('con-mascota', this.visible()));
    // Saluda al entrar, y a los segundos cuenta cómo va el día.
    effect(() => {
      const s = this.theme.saludo();
      if (!s || !this.visible()) return;
      setTimeout(() => this.decir(`${s.texto}! Soy el furgoncito de MAKAND. ${s.icono}`, 5000), 900);
      setTimeout(() => { const o = this.fraseOperacion(); if (o) this.decir(o, 6000); }, 7500);
    });
  }

  // ---------- Pregúntale al furgoncito ----------
  public panel = signal(false);
  public respuesta = signal('');
  public acciones = signal<Accion[]>([]);
  public opciones = signal<Tema[]>([]);
  public pregunta = '';
  private ultimaPregunta = '';
  // ---------- Moverlo de lugar (arrastrando) ----------
  /** Dónde lo dejó la persona (null = su lugar de siempre, abajo a la izquierda). */
  public pos = signal<{ x: number; y: number; der: boolean; arriba: boolean } | null>(null);
  public arrastrando = signal(false);
  private recienMovido = 0;

  private posGuardada(): void {
    const g = this.leer<{ fx: number; fy: number } | null>('mascota-pos', null);
    this.pos.set(g ? this.posDesde(g.fx * window.innerWidth / zoomPagina(), g.fy * window.innerHeight / zoomPagina()) : null);
  }
  /** Dentro de la pantalla siempre, y hacia dónde abrir el globo. */
  private posDesde(x: number, y: number): { x: number; y: number; der: boolean; arriba: boolean } {
    const z = zoomPagina(), ancho = window.innerWidth / z, alto = window.innerHeight / z;
    const cx = Math.min(Math.max(4, x), ancho - 154), cy = Math.min(Math.max(56, y), alto - 98);
    return { x: cx, y: cy, der: cx > ancho / 2, arriba: cy < alto / 2 };
  }

  public empezarArrastre(e: PointerEvent): void {
    if (e.button !== 0 || (e.target as Element).closest('.ms-panel, .ms-globo')) return;
    const z = zoomPagina();
    const caja = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - caja.left, dy = e.clientY - caja.top;
    const x0 = e.clientX, y0 = e.clientY;
    let moviendo = false;
    const mover = (ev: PointerEvent) => {
      if (!moviendo && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
      if (!moviendo) { moviendo = true; this.arrastrando.set(true); this.panel.set(false); }
      this.pos.set(this.posDesde((ev.clientX - dx) / z, (ev.clientY - dy) / z));
      this.cdr.detectChanges();
    };
    const soltar = () => {
      document.removeEventListener('pointermove', mover); document.removeEventListener('pointerup', soltar);
      if (!moviendo) return;
      this.arrastrando.set(false);
      this.recienMovido = Date.now();
      const p = this.pos();
      // Si lo deja cerca de su lugar de siempre, vuelve ahí.
      const alto = window.innerHeight / zoomPagina();
      if (p && p.x < 70 && p.y > alto - 160) { this.pos.set(null); this.guardar('mascota-pos', null); }
      else if (p) this.guardar('mascota-pos', { fx: p.x * zoomPagina() / window.innerWidth, fy: p.y * zoomPagina() / window.innerHeight });
      this.cdr.detectChanges();
    };
    document.addEventListener('pointermove', mover);
    document.addEventListener('pointerup', soltar);
  }

  private get correo(): string { return String(this.auth.currentUser?.email || '').toLowerCase(); }

  private leer<T>(clave: string, porDefecto: T): T { try { return JSON.parse(localStorage.getItem(`${clave}:${this.correo}`) || 'null') ?? porDefecto; } catch { return porDefecto; } }
  private guardar(clave: string, valor: any): void { try { localStorage.setItem(`${clave}:${this.correo}`, JSON.stringify(valor)); } catch { /* sin espacio */ } }

  /** Lo que más pregunta esta persona; si aún no pregunta nada, ejemplos. */
  public sugerencias = computed(() => {
    this.respuesta();
    const veces = this.leer<Record<string, number>>('mascota-preguntas', {});
    const mias = Object.entries(veces).sort((a, b) => b[1] - a[1]).map(([p]) => p).slice(0, 3);
    // Ejemplos al azar (se cambian con cada respuesta) para descubrir qué se le puede preguntar.
    const ejemplos = [...EJEMPLOS].sort(() => Math.random() - 0.5).filter(e => !mias.includes(e));
    return mias.length >= 3 ? mias : [...mias, ...ejemplos].slice(0, 3);
  });

  public abrirPanel(texto: string): void {
    this.respuesta.set(texto);
    this.acciones.set([]);
    this.opciones.set([]);
    this.panel.set(true);
    this.globo.set(null);
    setTimeout(() => (document.querySelector('.ms-pregunta input') as HTMLInputElement | null)?.focus(), 60);
  }

  public cerrarPanel(): void { this.panel.set(false); try { this.reconocedor?.abort(); } catch { /* nada */ } }

  /** Preguntar hablando: el micrófono del navegador (Chrome y Edge lo tienen) escribe la pregunta. */
  public readonly puedeHablar = typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  public oyendo = signal(false);
  private reconocedor: any = null;

  public hablar(): void {
    if (this.oyendo()) { this.reconocedor?.stop(); return; }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    let dicho = '';
    try {
      const r = new SR();
      r.lang = 'es-CO'; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      r.onresult = (e: any) => {
        dicho = Array.from(e.results as ArrayLike<any>).map((x: any) => x[0]?.transcript || '').join(' ').trim();
        this.pregunta = dicho;
        this.cdr.detectChanges();
      };
      r.onerror = (e: any) => {
        const err = String(e?.error || '');
        this.respuesta.set(err === 'not-allowed' || err === 'service-not-allowed' ? 'No me dejaron usar el micrófono. 🎤 Revisa el permiso del navegador (en algunas conexiones no se puede); mientras tanto escríbeme.'
          : err === 'no-speech' ? 'No te escuché. 🎤 Toca el micrófono y habla cerca.'
            : err === 'network' ? 'Para entenderte hablando necesito internet. Escríbeme mientras tanto.'
              : err === 'aborted' ? this.respuesta() : 'No pude escucharte. Escríbeme la pregunta.');
        this.acciones.set([]); this.opciones.set([]);
        dicho = '';
        this.cdr.detectChanges();
      };
      r.onend = () => {
        this.oyendo.set(false);
        this.reconocedor = null;
        if (dicho) { this.pregunta = dicho; this.preguntar(); }
        this.cdr.detectChanges();
      };
      this.reconocedor = r;
      r.start();
      this.oyendo.set(true);
      this.ponerEstado('feliz', 1200);
    } catch {
      this.oyendo.set(false);
      this.respuesta.set('No pude usar el micrófono aquí. Escríbeme la pregunta. 🙂');
    }
  }

  private preguntaAnterior = '';

  /** Lo que no está en la app abierta (los despachos) se pide al servidor y se contesta al llegar. */
  private async pedirAlServidor(p: Pedido): Promise<void> {
    try {
      const res = await this.auth.fetchAutenticado(`${API}/despachos?desde=${p.desde}&hasta=${p.hasta}`);
      if (res.status === 403) { this.respuesta.set('Tu cuenta no tiene acceso a Despachos. 🔒'); this.cdr.detectChanges(); return; }
      const data = await res.json();
      const r = data?.ok ? textoDespachos(data, p) : { texto: data?.msg || 'No pude leer los despachos ahora.', acciones: [] as Accion[] };
      this.respuesta.set(r.texto);
      this.acciones.set(r.acciones);
    } catch {
      this.respuesta.set('No pude conectarme para ver los despachos. Intenta de nuevo en un momento.');
    }
    this.cdr.detectChanges();
  }

  public preguntar(): void {
    const p = this.pregunta.trim();
    if (!p) return;
    this.ultimaPregunta = p;
    this.pregunta = '';
    const veces = this.leer<Record<string, number>>('mascota-preguntas', {});
    veces[p] = (veces[p] || 0) + 1;
    // Solo se recuerdan las 30 más usadas.
    this.guardar('mascota-preguntas', Object.fromEntries(Object.entries(veces).sort((a, b) => b[1] - a[1]).slice(0, 30)));
    const r = responder(p, this.ds.S, this.leer<Record<string, string>>('mascota-aprendido', {}), new Date(), {
      tareas: this.tareasSrv.tareas(), yo: this.tareasSrv.yo() || this.correo,
      pendientesAprobacion: this.ui.pendientesAprobacion(), puedeAprobar: this.auth.puedeAprobar,
      chistes: TONTERIAS.filter(t => t.startsWith('¿')),
      anterior: this.preguntaAnterior
    });
    // Para "¿y mañana?": se recuerda la pregunta completa que se entendió.
    if (r.entendio) this.preguntaAnterior = r.entendida || p;
    if (r.pedir) this.pedirAlServidor(r.pedir);
    this.respuesta.set(r.texto);
    this.acciones.set(r.acciones);
    this.opciones.set(r.opciones);
    this.ponerEstado(r.entendio ? 'feliz' : 'triste', 1200);
  }

  /** Escogió lo que quería decir: se aprende para la próxima. */
  public aprender(t: Tema): void {
    if (this.ultimaPregunta) {
      const aprendido = this.leer<Record<string, string>>('mascota-aprendido', {});
      aprendido[normalizarPregunta(this.ultimaPregunta)] = t.clave;
      this.guardar('mascota-aprendido', aprendido);
    }
    this.respuesta.set(`¡Listo, ya me lo aprendí! 🧠 ${t.texto}`);
    this.acciones.set([t.accion]);
    this.opciones.set([]);
    this.ponerEstado('feliz', 1500);
  }

  public nombreTema(t: Tema): string { return t.accion.tipo === 'tarea' ? (TAREAS.find(x => x.clave === t.accion.valor)?.titulo || t.accion.texto) : t.accion.texto; }

  public hacer(a: Accion): void {
    this.cerrarPanel();
    switch (a.tipo) {
      case 'ruta': this.router.navigateByUrl(a.valor || '/'); break;
      case 'viaje': this.router.navigate(['/rutograma'], { queryParams: { verViaje: a.valor } }); break;
      case 'buscar': this.ui.busquedaHablada.set(a.valor || ''); break;
      case 'tarea': { const t = TAREAS.find(x => x.clave === a.valor); if (t) this.guia.iniciarTarea(t); break; }
      case 'apariencia': this.theme.panelAbierto.set(true); break;
      case 'viaje-extra': this.atajos.acciones.next('viaje-extra'); break;
      case 'novedad': this.atajos.acciones.next('novedad'); break;
    }
  }

  // ---------- Reacciona a lo que pasa ----------
  private novedadesVistas: Set<string> | null = null;
  private celebradoHoy = '';
  private pendientesAntes: number | null = null;

  private revisarOperacion(): void {
    if (!this.visible()) return;
    const S = this.ds.S || {};
    // Novedades graves nuevas (varado, accidente…). La primera vez solo se anotan.
    const novedades = (S.novedades || []) as any[];
    const ids = new Set(novedades.map(n => String(n.id)));
    if (this.novedadesVistas) {
      const grave = novedades.find(n => !this.novedadesVistas!.has(String(n.id)) && !n.resuelta && /varad|accident|choque|robo|da[ñn]o|averi/i.test(`${n.tipo} ${n.titulo}`));
      if (grave) this.zone.run(() => { this.ponerEstado('triste', 2500); this.decir(`¡Ay no! 😟 ${grave.titulo || grave.tipo}. Revisa la novedad.`, 8000); });
    }
    this.novedadesVistas = ids;
    // Todos los viajes de hoy entregados: confeti (una vez al día).
    const h = new Date(), hoy = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    if (this.celebradoHoy === hoy || this.leer<string>('mascota-celebrado', '') === hoy) return;
    const deHoy = ((S.viajes || []) as any[]).filter(v => String(v.fecha || '').slice(0, 10) === hoy && v.estado !== 'Cancelado');
    if (deHoy.length && deHoy.every(v => v.estado === 'Entregado')) {
      this.celebradoHoy = hoy;
      this.guardar('mascota-celebrado', hoy);
      this.zone.run(() => {
        this.ponerEstado('feliz', 4000);
        this.decir(`¡Todos los ${deHoy.length} viajes de hoy entregados! 🎉 ¡Qué equipo!`, 8000);
        this.celebracion.confeti('¡Todos los viajes de hoy entregados!', `${deHoy.length} de ${deHoy.length} 🚚`);
      });
    }
  }

  /** Los viernes de 5 a 6 de la tarde cuenta un chiste (una vez). */
  private revisarViernes(): void {
    const h = new Date();
    if (h.getDay() !== 5 || h.getHours() !== 17 || !this.visible() || document.hidden || this.panel()) return;
    const dia = h.toDateString();
    if (this.leer<string>('mascota-chiste', '') === dia) return;
    this.guardar('mascota-chiste', dia);
    const chistes = TONTERIAS.filter(t => t.startsWith('¿'));
    this.zone.run(() => { this.ponerEstado('feliz', 2500); this.decir(`¡Viernes a las 5! Chiste para cerrar la semana: ${al(chistes)}`, 12000); });
  }

  // ---------- qué dice ----------
  private fraseHora(): string {
    const h = new Date().getHours();
    return al((HORA.find(x => h < x.hasta) || HORA[HORA.length - 1]).frases);
  }

  private fraseDia(): string {
    return al(DIA_SEMANA[new Date().getDay()]);
  }

  /** Curiosidad o frase de la festividad que se está viendo, o cuánto falta para su día. */
  private fraseFiesta(): string {
    const t = temporadaVisible(this.theme.temporadaPreferida());
    if (!t) return '';
    const faltan = diasParaElDia(t);
    const opciones = [...(FIESTAS[t.clave] || []), ...(t.frases || [])];
    if (faltan > 1) opciones.push(`Faltan ${faltan} días para ${t.nombreDia || t.nombre}. ${t.emoji}`);
    else if (faltan === 1) opciones.push(`¡Mañana es ${t.nombreDia || t.nombre}! ${t.emoji}`);
    else if (faltan === 0) opciones.push(`${t.saludo} ${t.emoji}`);
    return opciones.length ? al(opciones) : '';
  }

  /** Consejo de la pantalla que está abierta (Rutograma, Tareas…). */
  private consejoDePagina(): string {
    const ruta = this.router.url.split(/[?#]/)[0];
    const lista = CONSEJOS_POR_PAGINA[ruta];
    return lista ? al(lista) : '';
  }

  private fraseClima(): string {
    const c = this.climaSrv.clima();
    if (!c) return '';
    if (c.tipo === 'lluvia' || c.tipo === 'tormenta') return `Está lloviendo en ${c.ciudad} (${c.temperatura}°). Que los conductores vayan con cuidado. 🌧️`;
    if (c.tipo === 'niebla') return 'Hay niebla: luces encendidas y despacio en la vía. 🌫️';
    if (c.tipo === 'despejado' && c.esDeDia) return `Hace sol en ${c.ciudad}: ${c.temperatura}°. ☀️`;
    return `En ${c.ciudad} hay ${c.temperatura}°.`;
  }

  /** Cuántos viajes hay hoy, cuántos van en ruta y cuántos se entregaron. */
  private fraseOperacion(): string {
    const viajes = (this.ds.S?.viajes || []) as any[];
    if (!viajes.length) return '';
    const h = new Date(), hoy = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;
    const deHoy = viajes.filter(v => String(v.fecha || '').slice(0, 10) === hoy && v.estado !== 'Cancelado');
    if (!deHoy.length) return 'Hoy no hay viajes que salgan. ¡Día tranquilo! 😌';
    const entregados = deHoy.filter(v => v.estado === 'Entregado').length;
    const enRuta = deHoy.filter(v => v.salidaReal && !v.llegadaReal).length;
    if (entregados === deHoy.length) return `¡Los ${deHoy.length} viajes de hoy ya están entregados! 🎉`;
    return `Hoy salen ${deHoy.length} viaje${deHoy.length === 1 ? '' : 's'}` + (enRuta ? `, ${enRuta} ya van en ruta` : '') + (entregados ? ` y ${entregados} entregado${entregados === 1 ? '' : 's'}` : '') + '. 🚚';
  }

  private algoQueDecir(): string {
    const nombre = this.account.cuentaCompartida ? '' : String(this.account.nombre || '').trim().split(/\s+/)[0];
    // Cada tipo de frase tiene su peso: repetir una opción la hace salir más.
    const opciones: string[] = [
      al(CONSEJOS), al(CONSEJOS), al(DATOS), al(DATOS), al(TONTERIAS), al(TONTERIAS), al(TONTERIAS), this.fraseHora(), this.fraseDia(),
      nombre ? `¡Hola, ${nombre}! ${al(HOLA)}` : al(HOLA)
    ];
    const pagina = this.consejoDePagina(); if (pagina) opciones.push(pagina, pagina);
    const fiesta = this.fraseFiesta(); if (fiesta) opciones.push(fiesta, fiesta, fiesta);
    const datos = datosDelRutograma(this.ds.S); if (datos.length) opciones.push(al(datos), al(datos));
    const clima = this.fraseClima(); if (clima) opciones.push(clima);
    const op = this.fraseOperacion(); if (op) opciones.push(op, op);
    // No repetir lo último que dijo.
    const sinRepetir = opciones.filter(o => o && o !== this.ultimaFrase);
    const frase = al(sinRepetir.length ? sinRepetir : opciones);
    this.ultimaFrase = frase;
    return frase;
  }
  private ultimaFrase = '';

  /** De vez en cuando dice algo solo (cada 8 a 15 minutos, si la app está a la vista y no está dormido). */
  private programarCharla(): void {
    this.relojCharla = setTimeout(() => {
      if (this.visible() && this.estado() === 'normal' && !document.hidden && !this.globo()) this.zone.run(() => this.decir(this.algoQueDecir(), 6000));
      this.programarCharla();
    }, (8 + Math.random() * 7) * 60000);
  }

  private ponerEstado(e: Estado, ms: number): void {
    if (!this.visible()) return;
    this.estado.set(e);
    clearTimeout(this.relojEstado);
    this.relojEstado = setTimeout(() => this.estado.set('normal'), ms);
  }

  private decir(texto: string, ms = 4500): void {
    this.globo.set(texto);
    clearTimeout(this.relojGlobo);
    this.relojGlobo = setTimeout(() => this.globo.set(null), ms);
  }

  /** Se duerme a los 3 minutos sin usar la app; despierta al mover el mouse o teclear. */
  private despertar(): void {
    if (this.estado() === 'dormido') this.zone.run(() => { this.estado.set('normal'); this.decir(al(AL_DESPERTAR), 2500); });
    clearTimeout(this.relojSueno);
    this.relojSueno = setTimeout(() => this.zone.run(() => { this.estado.set('dormido'); this.globo.set(null); }), 3 * 60000);
  }

  public tocar(): void {
    // Soltarlo después de arrastrar no cuenta como toque.
    if (Date.now() - this.recienMovido < 300) return;
    this.despertar();
    // Varios toques seguidos: cosquillas y un pito.
    const ahora = Date.now();
    this.toques = [...this.toques.filter(t => ahora - t < 1500), ahora];
    if (this.toques.length >= 3) {
      this.toques = [];
      this.decir(al(COSQUILLAS), 2500);
      this.sonido.tocar('soltar', { temporada: 'conductor' });
      this.ponerEstado('feliz', 1500);
      return;
    }
    // Un toque: dice algo y deja preguntarle.
    this.abrirPanel(this.panel() ? this.algoQueDecir() : `${this.algoQueDecir()}\n\n¿Necesitas algo? Pregúntame. 👇`);
    this.ponerEstado('feliz', 1500);
  }

  ngOnDestroy(): void {
    try { this.reconocedor?.abort(); } catch { /* nada */ }
    this.subAvisos.unsubscribe();
    this.subDatos?.unsubscribe();
    clearInterval(this.relojViernes);
    document.removeEventListener('click', this.alClicFuera, true);
    clearTimeout(this.relojEstado); clearTimeout(this.relojGlobo); clearTimeout(this.relojSueno); clearTimeout(this.relojCharla);
    document.removeEventListener('keydown', this.alTeclear);
  }
}
