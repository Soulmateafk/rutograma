import { Component, NgZone, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../services/theme.service';
import { UiService } from '../../services/ui.service';
import { AccountService } from '../../services/account.service';
import { AuthService } from '../../services/auth.service';
import { temporadaVisible, delDia } from '../../services/temporadas';

/**
 * LA MASCOTA DE MAKAND: un camioncito con carita en la esquina de abajo.
 *  - Saluda al entrar y mira hacia donde va el mouse.
 *  - Celebra cuando algo se guarda y se pone triste un momento si hay un error.
 *  - Se duerme si nadie usa la app un rato ("Zzz") y despierta al volver.
 *  - Se disfraza en cada fiesta (gorro de Papá Noel, sombrero de bruja,
 *    casco el Día del Trabajo, orejas de conejo en Pascua...).
 *  - Al tocarlo dice algo: la frase del día de la temporada o un consejo.
 * Cada cuenta lo quita en Apariencia → "La mascota".
 */
type Estado = 'normal' | 'feliz' | 'triste' | 'dormido';

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
  'El alfiler junto a la placa deja ese vehículo de primero.'
];

@Component({
  selector: 'app-mascota',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ms" *ngIf="visible()" [ngClass]="'ms-' + estado()" (click)="tocar()" title="¡Hola! Tócame">
      <div class="ms-globo" *ngIf="globo() as g" animate.leave="ms-globo-sale">{{ g }}</div>
      <span class="ms-zzz" *ngIf="estado() === 'dormido'">z<b>z</b><i>Z</i></span>
      <svg class="ms-cuerpo" viewBox="0 0 96 80" aria-hidden="true">
        <ellipse cx="48" cy="76" rx="34" ry="3.5" class="ms-sombra"/>
        <!-- caja de carga -->
        <rect x="6" y="20" width="52" height="40" rx="7" class="ms-caja"/>
        <rect x="12" y="27" width="40" height="5" rx="2.5" fill="#fff" fill-opacity=".35"/>
        <text x="32" y="51" text-anchor="middle" class="ms-letras">MKD</text>
        <!-- cabina -->
        <path d="M58 30 h16 a6 6 0 0 1 5 3 l9 14 a6 6 0 0 1 1 3 v10 a4 4 0 0 1 -4 4 h-27 z" class="ms-cabina"/>
        <!-- vidrio con ojos -->
        <path d="M61 34 h12 a3 3 0 0 1 2.6 1.5 l6 10 h-20.6 z" fill="#e0f2fe"/>
        <g class="ms-ojos" [attr.transform]="'translate(' + mirada().x + ' ' + mirada().y + ')'">
          <ng-container *ngIf="estado() !== 'dormido' && estado() !== 'feliz'">
            <circle cx="66.5" cy="40.5" r="2.6" fill="#0f172a"/><circle cx="74.5" cy="40.5" r="2.6" fill="#0f172a"/>
            <circle cx="67.3" cy="39.6" r=".9" fill="#fff"/><circle cx="75.3" cy="39.6" r=".9" fill="#fff"/>
          </ng-container>
        </g>
        <g *ngIf="estado() === 'feliz'" fill="none" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"><path d="M64 41.5 q2.5 -3 5 0"/><path d="M72 41.5 q2.5 -3 5 0"/></g>
        <g *ngIf="estado() === 'dormido'" fill="none" stroke="#0f172a" stroke-width="1.6" stroke-linecap="round"><path d="M64 41 q2.5 2 5 0"/><path d="M72 41 q2.5 2 5 0"/></g>
        <g class="ms-parpado" *ngIf="estado() === 'normal'"><rect x="63" y="37" width="7" height="0" fill="#e0f2fe"/><rect x="71" y="37" width="7" height="0" fill="#e0f2fe"/></g>
        <!-- cachetes y boca en el parachoques -->
        <circle cx="64" cy="47" r="1.8" fill="#fb7185" fill-opacity=".6"/><circle cx="80" cy="47" r="1.8" fill="#fb7185" fill-opacity=".6"/>
        <path *ngIf="estado() !== 'triste'" d="M78 54 q4 4 8 0" fill="none" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/>
        <path *ngIf="estado() === 'triste'" d="M78 57 q4 -3.5 8 0" fill="none" stroke="#0f172a" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="86" cy="51" r="2.2" fill="#fde047"/>
        <!-- ruedas -->
        <g class="ms-rueda"><circle cx="22" cy="64" r="8" fill="#1f2937"/><circle cx="22" cy="64" r="3.2" fill="#94a3b8"/></g>
        <g class="ms-rueda"><circle cx="72" cy="64" r="8" fill="#1f2937"/><circle cx="72" cy="64" r="3.2" fill="#94a3b8"/></g>
        <!-- disfraz de temporada -->
        <g [ngSwitch]="disfraz()">
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
    .ms { position: fixed; left: 14px; bottom: 12px; width: 112px; height: 94px; z-index: 9990; cursor: pointer; user-select: none; }
    .ms-cuerpo { width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 6px 10px rgba(0,0,0,.35)); animation: ms-respira 3s ease-in-out infinite; transform-origin: 50% 100%; }
    .ms-sombra { fill: rgba(0,0,0,.25); }
    .ms-caja { fill: var(--acento, #2563eb); }
    .ms-cabina { fill: color-mix(in srgb, var(--acento, #2563eb) 70%, #0f172a); }
    .ms-letras { font: 900 11px system-ui, sans-serif; fill: #fff; letter-spacing: .5px; opacity: .9; }
    .ms-ojos { transition: transform .15s ease-out; }
    .ms-parpado rect { animation: ms-parpadeo 5s infinite; }
    @keyframes ms-parpadeo { 0%, 94%, 100% { height: 0; } 96% { height: 7px; } }
    @keyframes ms-respira { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, .98); } }
    .ms-feliz .ms-cuerpo { animation: ms-salta .5s ease-in-out 3; }
    @keyframes ms-salta { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-14px) rotate(-4deg); } 70% { transform: translateY(0) scale(1.06, .94); } }
    .ms-triste .ms-cuerpo { animation: ms-tiembla .25s ease-in-out 4; }
    @keyframes ms-tiembla { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-3px); } 75% { transform: translateX(3px); } }
    .ms-dormido .ms-cuerpo { animation: ms-ronca 3.2s ease-in-out infinite; }
    @keyframes ms-ronca { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04, .96); } }
    .ms-rueda { transform-box: fill-box; transform-origin: center; }
    .ms-feliz .ms-rueda { animation: ms-gira .4s linear 4; }
    @keyframes ms-gira { to { transform: rotate(360deg); } }
    .ms-latido { transform-box: fill-box; transform-origin: center; animation: ms-latir 1s ease-in-out infinite; }
    @keyframes ms-latir { 50% { transform: scale(1.2); } }
    .ms-llama { transform-box: fill-box; transform-origin: 50% 100%; animation: ms-llama 1s ease-in-out infinite alternate; }
    @keyframes ms-llama { to { transform: scale(.85, 1.15) rotate(5deg); } }
    .ms-zzz { position: absolute; right: -6px; top: -8px; font: 800 13px system-ui; color: var(--acento-texto, #60a5fa); }
    .ms-zzz b, .ms-zzz i { font-style: normal; display: inline-block; animation: ms-z 2.4s ease-in-out infinite; }
    .ms-zzz b { font-size: 16px; animation-delay: .4s; } .ms-zzz i { font-size: 19px; animation-delay: .8s; }
    @keyframes ms-z { 0% { opacity: 0; transform: translateY(6px); } 50% { opacity: 1; } 100% { opacity: 0; transform: translateY(-10px); } }
    .ms-globo { position: absolute; left: 84px; bottom: 86px; width: max-content; max-width: 240px; padding: 8px 12px; border-radius: 14px 14px 14px 4px; font-size: 12.5px; line-height: 1.35; white-space: normal;
      background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 2px solid var(--acento, #2563eb); box-shadow: 0 10px 24px rgba(0,0,0,.35); animation: ms-globo .35s cubic-bezier(.2,.9,.3,1.4); }
    :host-context(html.con-fondo) .ms-globo { background: #111827; }
    :host-context(body.tema-claro) .ms-globo { background: #fff; }
    @keyframes ms-globo { from { opacity: 0; transform: translateY(8px) scale(.8); transform-origin: 0 100%; } to { opacity: 1; transform: none; } }
    .ms-globo-sale { animation: ms-globo-sale .25s ease-in forwards !important; }
    @keyframes ms-globo-sale { to { opacity: 0; transform: translateY(6px) scale(.9); } }
    :host-context(html.modo-enfoque) .ms { display: none; }
    :host-context(html.sin-animaciones) .ms * { animation: none !important; }
    @media (max-width: 600px) { .ms { width: 64px; height: 54px; left: 8px; bottom: 8px; } .ms-globo { left: 50px; bottom: 50px; max-width: 200px; } }
  `]
})
export class MascotaComponent implements OnDestroy {
  private theme = inject(ThemeService);
  private ui = inject(UiService);
  private account = inject(AccountService);
  private auth = inject(AuthService);
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
  private subAvisos = this.ui.avisos.subscribe(a => {
    if (a.tipo === 'ok') this.ponerEstado('feliz', 1800);
    else if (a.tipo === 'err') { this.ponerEstado('triste', 1600); this.decir('¡Uy! Algo no salió. Revisa el aviso. 😟', 3500); }
  });
  private alMover = (e: PointerEvent) => {
    this.despertar();
    // Los ojos miran hacia el mouse (poquito, para que no se vea raro).
    const dx = e.clientX - 75, dy = e.clientY - (window.innerHeight - 50);
    const d = Math.hypot(dx, dy) || 1;
    const x = Math.round(dx / d * 2 * 10) / 10, y = Math.round(dy / d * 1.5 * 10) / 10;
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
    // Con la mascota, lo de la esquina izquierda de abajo se corre un poco.
    effect(() => document.documentElement.classList.toggle('con-mascota', this.visible()));
    // Saluda al entrar.
    effect(() => {
      const s = this.theme.saludo();
      if (s && this.visible()) setTimeout(() => this.decir(`${s.texto}! Soy el camioncito de MAKAND. ${s.icono}`, 5000), 900);
    });
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
    if (this.estado() === 'dormido') this.zone.run(() => { this.estado.set('normal'); this.decir('¡Ah! Ya desperté. 😄', 2200); });
    clearTimeout(this.relojSueno);
    this.relojSueno = setTimeout(() => this.zone.run(() => { this.estado.set('dormido'); this.globo.set(null); }), 3 * 60000);
  }

  public tocar(): void {
    this.despertar();
    const t = temporadaVisible(this.theme.temporadaPreferida());
    const frase = t && Math.random() < 0.6 ? delDia(t.frases) : '';
    const nombre = this.account.cuentaCompartida ? '' : String(this.account.nombre || '').trim().split(/\s+/)[0];
    const opciones = [frase, CONSEJOS[Math.floor(Math.random() * CONSEJOS.length)], nombre ? `¡Hola, ${nombre}! ¿Cómo vamos hoy? 🚚` : '¡Hola! ¿Cómo vamos hoy? 🚚'].filter(Boolean) as string[];
    this.decir(opciones[Math.floor(Math.random() * opciones.length)], 5500);
    this.ponerEstado('feliz', 1500);
  }

  ngOnDestroy(): void {
    this.subAvisos.unsubscribe();
    clearTimeout(this.relojEstado); clearTimeout(this.relojGlobo); clearTimeout(this.relojSueno);
    document.removeEventListener('keydown', this.alTeclear);
  }
}
