import { Component, ElementRef, EventEmitter, HostListener, NgZone, OnDestroy, Output, ViewChild, AfterViewInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SonidoService } from '../../services/sonido.service';
import { AuthService } from '../../services/auth.service';

/**
 * MINI JUEGO DE TEMPORADA (Apariencia → "Jugar"): un camioncito atrapa lo
 * que cae (regalos en Navidad, calabazas en Halloween, corazones en San
 * Valentín...) y esquiva lo malo (conos, piedras). 45 segundos y 3 vidas.
 * El mejor puntaje queda guardado en este equipo para la cuenta.
 * Se mueve con el mouse, el dedo o las flechas ← →.
 */
interface Cosa { x: number; y: number; v: number; emoji: string; bueno: boolean; puntos: number; giro: number; }

const COSAS: Record<string, { buenas: string[]; malas: string[]; fondo: [string, string] }> = {
  navidad: { buenas: ['🎁', '🎁', '⭐', '🍪', '🔔'], malas: ['🪨', '🧊'], fondo: ['#0b2a1a', '#3f0d12'] },
  velitas: { buenas: ['🕯️', '🏮', '⭐'], malas: ['💧', '🌧️'], fondo: ['#1c1206', '#3b2405'] },
  halloween: { buenas: ['🎃', '🍬', '🍭', '🎃'], malas: ['🕷️', '💀'], fondo: ['#1a0b2e', '#3b1d0a'] },
  'ano-nuevo': { buenas: ['🥂', '🍾', '⭐', '🎉'], malas: ['🧨'], fondo: ['#0f0a2e', '#2e1065'] },
  'san-valentin': { buenas: ['💖', '💝', '🌹', '💌'], malas: ['💔'], fondo: ['#2a0a1a', '#4c0519'] },
  'amor-amistad': { buenas: ['💛', '🎁', '🍫', '💌'], malas: ['💔'], fondo: ['#2a200a', '#4c0519'] },
  madre: { buenas: ['🌷', '🌹', '💐', '💖'], malas: ['🐝'], fondo: ['#2a0a1f', '#14532d'] },
  mujer: { buenas: ['💐', '🌸', '🌷'], malas: ['🐝'], fondo: ['#2e1065', '#4a044e'] },
  padre: { buenas: ['🏆', '👔', '⭐', '☕'], malas: ['🪨'], fondo: ['#0c1a3a', '#172554'] },
  'semana-santa': { buenas: ['🥚', '🐣', '🌷', '🥚'], malas: ['🪨'], fondo: ['#14321f', '#3f3a0a'] },
  independencia: { buenas: ['⭐', '🎉', '☕', '🌽'], malas: ['🧨'], fondo: ['#0c1a3a', '#3f0a0a'] },
  boyaca: { buenas: ['⭐', '🏅', '🌽'], malas: ['🪨'], fondo: ['#0c1a3a', '#3f3a0a'] },
  trabajo: { buenas: ['📦', '🔧', '⚙️', '📦'], malas: ['🚧'], fondo: ['#1f1a0a', '#111827'] },
  conductor: { buenas: ['⭐', '⛽', '📦', '🏁'], malas: ['🚧', '🕳️'], fondo: ['#0c2a3a', '#111827'] },
  aniversario: { buenas: ['🎂', '🎈', '⭐', '🎁'], malas: ['🪨'], fondo: ['#0c1a3a', '#3b1d0a'] },
  normal: { buenas: ['📦', '📦', '⭐', '⛽'], malas: ['🚧', '🕳️'], fondo: ['#0b1120', '#1e293b'] }
};

@Component({
  selector: 'app-juego',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="jg-fondo" (click)="cerrar.emit()">
      <div class="jg-caja" (click)="$event.stopPropagation()">
        <div class="jg-cab">
          <strong>🎮 Atrapa {{ nombreCosa }}</strong>
          <span class="jg-marcador">⭐ {{ puntos() }} · {{ vidasTxt() }} · ⏱ {{ tiempo() }}s</span>
          <button class="jg-x" (click)="cerrar.emit()" aria-label="Cerrar">×</button>
        </div>
        <div class="jg-lienzo">
          <canvas #lienzo width="560" height="380"></canvas>
          <div class="jg-capa" *ngIf="estado() !== 'jugando'">
            <ng-container *ngIf="estado() === 'inicio'">
              <div class="jg-titulo">{{ emojiTema }} ¡A jugar!</div>
              <p>Mueve el camioncito con el mouse, el dedo o las flechas ← →.<br>Atrapa {{ buenasTxt }} y esquiva {{ malasTxt }}.</p>
            </ng-container>
            <ng-container *ngIf="estado() === 'fin'">
              <div class="jg-titulo">{{ record() ? '🏆 ¡Nuevo récord!' : '¡Se acabó!' }}</div>
              <p>Hiciste <strong>{{ puntos() }}</strong> puntos. Tu mejor puntaje: <strong>{{ mejor() }}</strong>.</p>
            </ng-container>
            <button class="jg-btn" (click)="empezar()">{{ estado() === 'fin' ? 'Otra vez' : 'Empezar' }}</button>
          </div>
        </div>
        <p class="jg-pie">Mejor puntaje en este equipo: {{ mejor() }} · Solo es un descanso: no cambia nada de la operación.</p>
      </div>
    </div>
  `,
  styles: [`
    .jg-fondo { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 10060; display: flex; align-items: center; justify-content: center; padding: 12px; }
    .jg-caja { background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 1px solid var(--color-borde, #374151); border-radius: 16px; padding: 12px; width: 100%; max-width: 600px; box-shadow: 0 20px 50px rgba(0,0,0,.5); }
    .jg-cab { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .jg-marcador { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--acento-texto); }
    .jg-x { background: none; border: 1px solid var(--color-borde, #374151); color: inherit; border-radius: 8px; width: 30px; height: 30px; cursor: pointer; font-size: 18px; }
    .jg-lienzo { position: relative; border-radius: 12px; overflow: hidden; touch-action: none; }
    canvas { display: block; width: 100%; height: auto; cursor: none; }
    .jg-capa { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 20px; background: rgba(0,0,0,.45); color: #fff; }
    .jg-titulo { font-size: 26px; font-weight: 800; margin-bottom: 6px; }
    .jg-capa p { margin: 0 0 14px; font-size: 14px; line-height: 1.5; }
    .jg-btn { background: var(--acento, #2563eb); color: #fff; border: none; border-radius: 10px; padding: 10px 22px; font-weight: 800; font-size: 15px; cursor: pointer; font-family: inherit; }
    .jg-pie { margin: 8px 2px 0; font-size: 11px; color: var(--color-texto-apagado, #94a3b8); }
  `]
})
export class JuegoComponent implements AfterViewInit, OnDestroy {
  @Output() cerrar = new EventEmitter<void>();
  @ViewChild('lienzo') lienzo!: ElementRef<HTMLCanvasElement>;
  private zone = inject(NgZone);
  private sonido = inject(SonidoService);
  private auth = inject(AuthService);

  public estado = signal<'inicio' | 'jugando' | 'fin'>('inicio');
  public puntos = signal(0);
  public vidas = signal(3);
  public tiempo = signal(45);
  public mejor = signal(0);
  public record = signal(false);
  public vidasTxt = () => '❤️'.repeat(this.vidas()) + '🤍'.repeat(3 - this.vidas());

  private tema = document.documentElement.getAttribute('data-temporada') || 'normal';
  private set = COSAS[this.tema] || COSAS['normal'];
  public emojiTema = this.set.buenas[0];
  public nombreCosa = this.tema === 'normal' ? 'las cajas' : 'lo de la temporada';
  public buenasTxt = Array.from(new Set(this.set.buenas)).join(' ');
  public malasTxt = this.set.malas.join(' ');

  private cosas: Cosa[] = [];
  private camionX = 280;
  private teclas = { izq: false, der: false };
  private anim = 0;
  private ultimo = 0;
  private aparecer = 0;
  private reloj: any = null;
  private destellos: Array<{ x: number; y: number; t: number; txt: string; color: string }> = [];
  private clave = 'rutograma_juego:' + String(this.auth.currentUser?.email || '').toLowerCase() + ':' + this.tema;

  ngAfterViewInit(): void {
    try { this.mejor.set(Number(localStorage.getItem(this.clave) || 0)); } catch { /* sin almacenamiento */ }
    const c = this.lienzo.nativeElement;
    const mover = (clientX: number) => { const r = c.getBoundingClientRect(); this.camionX = Math.max(30, Math.min(530, (clientX - r.left) / r.width * 560)); };
    c.addEventListener('pointermove', e => mover(e.clientX));
    c.addEventListener('pointerdown', e => mover(e.clientX));
    this.dibujar(0);
  }

  @HostListener('document:keydown', ['$event']) tecla(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') { this.teclas.izq = true; e.preventDefault(); }
    if (e.key === 'ArrowRight') { this.teclas.der = true; e.preventDefault(); }
    if (e.key === 'Escape') this.cerrar.emit();
    if ((e.key === ' ' || e.key === 'Enter') && this.estado() !== 'jugando') { e.preventDefault(); this.empezar(); }
  }
  @HostListener('document:keyup', ['$event']) soltar(e: KeyboardEvent): void {
    if (e.key === 'ArrowLeft') this.teclas.izq = false;
    if (e.key === 'ArrowRight') this.teclas.der = false;
  }

  public empezar(): void {
    this.cosas = []; this.destellos = [];
    this.puntos.set(0); this.vidas.set(3); this.tiempo.set(45); this.record.set(false);
    this.estado.set('jugando');
    this.sonido.tocar('abrir', { forzar: true });
    clearInterval(this.reloj);
    this.reloj = setInterval(() => { this.tiempo.update(t => t - 1); if (this.tiempo() <= 0) this.terminar(); }, 1000);
    cancelAnimationFrame(this.anim);
    this.ultimo = performance.now();
    this.zone.runOutsideAngular(() => { this.anim = requestAnimationFrame(t => this.paso(t)); });
  }

  private terminar(): void {
    clearInterval(this.reloj);
    cancelAnimationFrame(this.anim);
    if (this.puntos() > this.mejor()) {
      this.mejor.set(this.puntos()); this.record.set(true);
      try { localStorage.setItem(this.clave, String(this.puntos())); } catch { /* nada */ }
      this.sonido.tocar('celebrar', { forzar: true });
    } else this.sonido.tocar('cerrar', { forzar: true });
    this.estado.set('fin');
    this.dibujar(performance.now());
  }

  private paso(ahora: number): void {
    const dt = Math.min(50, ahora - this.ultimo) / 1000;
    this.ultimo = ahora;
    if (this.teclas.izq) this.camionX = Math.max(30, this.camionX - 420 * dt);
    if (this.teclas.der) this.camionX = Math.min(530, this.camionX + 420 * dt);
    // Más rápido a medida que pasa el tiempo.
    const nivel = 1 + (45 - this.tiempo()) / 30;
    this.aparecer -= dt;
    if (this.aparecer <= 0) {
      this.aparecer = Math.max(0.28, 0.75 / nivel);
      const bueno = Math.random() > 0.22;
      const lista = bueno ? this.set.buenas : this.set.malas;
      this.cosas.push({ x: 25 + Math.random() * 510, y: -20, v: (110 + Math.random() * 90) * nivel, emoji: lista[Math.floor(Math.random() * lista.length)], bueno, puntos: bueno && Math.random() < 0.15 ? 3 : 1, giro: Math.random() * 6 });
    }
    for (const c of this.cosas) { c.y += c.v * dt; c.giro += dt * 2; }
    // ¿Atrapada?
    const atrapadas = this.cosas.filter(c => c.y > 318 && c.y < 352 && Math.abs(c.x - this.camionX) < 44);
    for (const c of atrapadas) {
      this.cosas.splice(this.cosas.indexOf(c), 1);
      if (c.bueno) {
        this.zone.run(() => this.puntos.update(p => p + c.puntos));
        this.destellos.push({ x: c.x, y: 320, t: 0.8, txt: '+' + c.puntos, color: c.puntos > 1 ? '#facc15' : '#4ade80' });
        this.sonido.tocar(c.puntos > 1 ? 'aprobar' : 'clic', { forzar: true });
      } else {
        this.zone.run(() => this.vidas.update(v => v - 1));
        this.destellos.push({ x: c.x, y: 320, t: 0.8, txt: '💥', color: '#f87171' });
        this.sonido.tocar('error', { forzar: true });
        if (this.vidas() <= 0) { this.zone.run(() => this.terminar()); return; }
      }
    }
    this.cosas = this.cosas.filter(c => c.y < 400);
    this.destellos.forEach(d => { d.t -= dt; d.y -= 40 * dt; });
    this.destellos = this.destellos.filter(d => d.t > 0);
    this.dibujar(ahora);
    if (this.estado() === 'jugando') this.anim = requestAnimationFrame(t => this.paso(t));
  }

  private dibujar(ahora: number): void {
    const ctx = this.lienzo?.nativeElement.getContext('2d');
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 0, 380);
    g.addColorStop(0, this.set.fondo[0]); g.addColorStop(1, this.set.fondo[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 560, 380);
    // carretera
    ctx.fillStyle = '#1f2937'; ctx.fillRect(0, 352, 560, 28);
    ctx.fillStyle = '#facc15';
    for (let x = (-(ahora / 8) % 40); x < 560; x += 40) ctx.fillRect(x, 365, 20, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const c of this.cosas) {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(Math.sin(c.giro) * 0.3);
      ctx.font = (c.puntos > 1 ? 34 : 28) + 'px serif';
      ctx.fillText(c.emoji, 0, 0); ctx.restore();
    }
    // camioncito
    ctx.save(); ctx.translate(this.camionX, 334); ctx.scale(-1, 1); ctx.font = '46px serif'; ctx.fillText('🚚', 0, 0); ctx.restore();
    for (const d of this.destellos) { ctx.globalAlpha = Math.max(0, d.t); ctx.fillStyle = d.color; ctx.font = 'bold 20px sans-serif'; ctx.fillText(d.txt, d.x, d.y); }
    ctx.globalAlpha = 1;
  }

  ngOnDestroy(): void { clearInterval(this.reloj); cancelAnimationFrame(this.anim); }
}
