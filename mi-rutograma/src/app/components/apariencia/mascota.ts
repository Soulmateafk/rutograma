import { Component, NgZone, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { UiService } from '../../services/ui.service';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { DataService } from '../../services/data';
import { ClimaService } from '../../services/clima.service';
import { SonidoService } from '../../services/sonido.service';
import { temporadaVisible, delDia } from '../../services/temporadas';

/**
 * LA MASCOTA DE MAKAND: un furgón refrigerado con carita en la esquina de abajo.
 *  - Saluda al entrar y mira hacia donde va el mouse.
 *  - Celebra cuando algo se guarda y se pone triste un momento si hay un error.
 *  - Se duerme si nadie usa la app un rato ("Zzz") y despierta al volver.
 *  - Se disfraza en cada fiesta (gorro de Papá Noel, sombrero de bruja,
 *    casco el Día del Trabajo, orejas de conejo en Pascua...).
 *  - Habla: al tocarlo, y de vez en cuando solo, dice un consejo, un dato
 *    curioso, algo según la hora, el día, el clima o la operación de hoy.
 * Cada cuenta lo quita en Apariencia → "La mascota".
 */
type Estado = 'normal' | 'feliz' | 'triste' | 'dormido';

const al = <T>(l: T[]) => l[Math.floor(Math.random() * l.length)];

const CONSEJOS = [
  'Con Ctrl+K buscas cualquier viaje, placa o conductor.',
  'Arrastra un viaje a otro día en el Rutograma para moverlo.',
  'Clic derecho sobre un viaje: editar, duplicar, WhatsApp y más.',
  'La tecla F deja solo el Rutograma a pantalla completa.',
  'Con la tecla B abres tus notas.',
  'Ctrl+Z deshace el último cambio.',
  'En Apariencia hay 24 temas listos de un clic.',
  'Deja el mouse quieto sobre un viaje y verás su detalle.',
  '¿Un descanso? En Apariencia puedes jugar un ratico. 🎮',
  'El alfiler junto a la placa deja ese vehículo de primero.',
  'La tecla ? muestra todos los atajos de teclado.',
  '"G" y luego "R" te lleva al Rutograma. "G" y "D", al Dashboard.',
  'En el Dashboard, "Personalizar" te deja mover y ocultar los cuadros.',
  'El botón "?" de abajo a la derecha tiene guías paso a paso.',
  '¿Lluvia de fondo mientras trabajas? Apariencia → Sonidos → Ambiente. 🌧️',
  'Con "Hoja de ruta" le das al conductor un PDF con todo su viaje.',
  'Desde la ficha del conductor le mandas sus viajes por WhatsApp.',
  'El Calendario de fiestas te dice cuánto falta para cada una. 📅',
  'La Pizarra es para avisos de todo el equipo.',
  'Si cambias un viaje de una semana cerrada, la app te pide el motivo.',
  'En "Hoja de vida" ves todo lo que le ha pasado a un vehículo.',
  'La Papelera guarda lo eliminado 30 días, por si acaso.'
];

const DATOS = [
  'Dato: un furgón refrigerado mantiene la carga entre 2 y 8 °C. ❄️',
  'Dato: Colombia tiene más de 200.000 km de carreteras.',
  'Dato: la vía Bogotá–Villavicencio cruza el túnel de Chirajara y muchos más.',
  'Dato: revisar la presión de las llantas ahorra combustible. 🛞',
  'Dato: el Alto de La Línea tiene un túnel de más de 8 km.',
  'Dato: el pico y placa cambia según la ciudad y el día. Revisa las Reglas.',
  'Dato: un conductor descansado es un conductor seguro. 😴➡️🚚',
  '¿Sabías? El primer camión se fabricó en 1896.',
  '¿Sabías? En la Costa se dice "carro" y en el interior "camión" para casi lo mismo. 😄',
  'Dato: frenar suave y sin afanes cuida la carga y el bolsillo.',
  'Dato: antes de un viaje largo, revisa luces, aceite y llantas.',
  '¿Sabías? Bogotá está a 2.600 metros sobre el nivel del mar. ⛰️'
];

const AL_GUARDAR = ['¡Guardado! 👌', '¡Listo, quedó!', '¡Eso! Uno menos. ✅', '¡Bien hecho! 🚚💨', '¡Anotado!', '¡Perfecto!', '¡Así se hace!'];
const AL_ERROR = ['¡Uy! Algo no salió. Revisa el aviso. 😟', 'Ups… mira el mensaje rojo.', 'Hmm, eso no se pudo. Intenta otra vez.', '¡Ay! Algo falta o no cuadra.'];
const COSQUILLAS = ['¡Jaja, me haces cosquillas! 😆', '¡Piii piii! 📯', '¡Ey, que estoy trabajando! 😄', '¡Ya, ya, ya! Me mareo. 😵‍💫'];

@Component({
  selector: 'app-mascota',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ms" *ngIf="visible()" [ngClass]="'ms-' + estado()" (click)="tocar()" title="¡Hola! Tócame">
      <div class="ms-globo" *ngIf="globo() as g" animate.leave="ms-globo-sale">{{ g }}</div>
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
    :host-context(html.modo-enfoque) .ms { display: none; }
    :host-context(html.sin-animaciones) .ms * { animation: none !important; }
    @media (max-width: 600px) { .ms { width: 96px; height: 60px; left: 6px; bottom: 6px; } .ms-globo { left: 70px; bottom: 54px; max-width: 200px; } }
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
      if (Math.random() < 0.35) this.decir(/elimin|borr/i.test(a.texto) ? al(['¡Chao! 👋 Quedó en la papelera.', 'Eliminado. Si fue sin querer, Ctrl+Z.']) : al(AL_GUARDAR), 2500);
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

  constructor() {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      let ultimo = 0;
      document.addEventListener('pointermove', e => { const t = performance.now(); if (t - ultimo > 80) { ultimo = t; this.alMover(e); } }, { passive: true });
      document.addEventListener('keydown', this.alTeclear, { passive: true });
    });
    this.despertar();
    this.programarCharla();
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

  // ---------- qué dice ----------
  private fraseHora(): string {
    const h = new Date().getHours();
    if (h < 6) return al(['¿Tan temprano? Los conductores ya van saliendo. 🌄', 'Madrugada de trabajo… ¡ánimo!']);
    if (h < 10) return al(['¡Buenos días! ¿Ya tomaste tintico? ☕', 'Arrancamos el día. ¡Con toda! 💪', 'Buen día: revisa qué viajes salen hoy.']);
    if (h < 12) return al(['Media mañana: buen momento para revisar los viajes por aprobar.', '¿Ya revisaste la Pizarra hoy?']);
    if (h < 14) return al(['¿Ya almorzaste? 🍲', 'Hora del almuerzo… los conductores también paran a comer.']);
    if (h < 18) return al(['La tarde va rápido. ¿Cómo vamos con las entregas?', '¿Una aromática? 🍵 Ya casi cerramos el día.']);
    if (h < 21) return al(['Ya es de noche. Revisa lo de mañana y a descansar. 🌙', 'Buen trabajo hoy. 👏']);
    return al(['Es tarde… no te quedes mucho. 😴', 'Los furgones también descansan de noche. 🌙']);
  }

  private fraseDia(): string {
    const d = new Date().getDay();
    return [
      '¡Domingo! Ojalá estés descansando. 😄',
      'Lunes: arrancamos semana. ¡Con toda! 💪',
      'Martes: la semana ya va andando.',
      'Miércoles: mitad de semana. ¡Vamos bien!',
      'Jueves: ya casi es viernes. 😉',
      '¡Viernes! A cerrar bien la semana. 🎉',
      'Sábado de trabajo… ¡gracias por estar! 🙌'
    ][d];
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
    const t = temporadaVisible(this.theme.temporadaPreferida());
    const nombre = this.account.cuentaCompartida ? '' : String(this.account.nombre || '').trim().split(/\s+/)[0];
    const opciones: string[] = [
      al(CONSEJOS), al(CONSEJOS), al(DATOS), this.fraseHora(), this.fraseDia(),
      nombre ? `¡Hola, ${nombre}! ¿Cómo vamos hoy? 🚚` : '¡Hola! ¿Cómo vamos hoy? 🚚'
    ];
    const frase = t ? delDia(t.frases) : '';
    if (frase) opciones.push(frase, frase);
    const clima = this.fraseClima(); if (clima) opciones.push(clima);
    const op = this.fraseOperacion(); if (op) opciones.push(op, op);
    return al(opciones);
  }

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
    if (this.estado() === 'dormido') this.zone.run(() => { this.estado.set('normal'); this.decir(al(['¡Ah! Ya desperté. 😄', '¿Eh? ¡Aquí estoy! 🚚', 'Me quedé dormido en el parqueadero… 😅']), 2500); });
    clearTimeout(this.relojSueno);
    this.relojSueno = setTimeout(() => this.zone.run(() => { this.estado.set('dormido'); this.globo.set(null); }), 3 * 60000);
  }

  public tocar(): void {
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
    this.decir(this.algoQueDecir(), 6000);
    this.ponerEstado('feliz', 1500);
  }

  ngOnDestroy(): void {
    this.subAvisos.unsubscribe();
    clearTimeout(this.relojEstado); clearTimeout(this.relojGlobo); clearTimeout(this.relojSueno); clearTimeout(this.relojCharla);
    document.removeEventListener('keydown', this.alTeclear);
  }
}
