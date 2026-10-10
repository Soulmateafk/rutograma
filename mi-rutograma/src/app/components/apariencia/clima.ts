import { Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ClimaService } from '../../services/clima.service';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';

/**
 * CAPA DE CLIMA (Apariencia → Efectos → "Clima que se ve"): gotitas si
 * llueve, rayos si hay tormenta, nubes que pasan si está nublado, un brillo
 * de sol si está despejado de día y niebla suave. No se puede tocar ni
 * tapa nada. La cuenta la quita con su interruptor o con "Quitar animaciones".
 */
@Component({
  selector: 'app-clima',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="visible() && clima.clima() as c">
      <div class="cl-capa" [ngClass]="'cl-' + c.tipo" aria-hidden="true">
        <ng-container *ngIf="c.tipo === 'lluvia' || c.tipo === 'tormenta'">
          <i *ngFor="let g of gotas" class="cl-gota" [style.left.%]="g.x" [style.animation-delay.s]="g.d" [style.animation-duration.s]="g.v" [style.height.px]="g.l"></i>
        </ng-container>
        <div class="cl-rayo" *ngIf="c.tipo === 'tormenta'"></div>
        <ng-container *ngIf="c.tipo === 'nublado' || c.tipo === 'lluvia' || c.tipo === 'tormenta'">
          <span class="cl-nube" *ngFor="let n of nubes" [style.top.px]="n.y" [style.animation-delay.s]="n.d" [style.animation-duration.s]="n.v" [style.transform]="'scale(' + n.e + ')'"></span>
        </ng-container>
        <div class="cl-sol" *ngIf="c.tipo === 'despejado' && c.esDeDia"></div>
        <div class="cl-niebla" *ngIf="c.tipo === 'niebla'"></div>
        <ng-container *ngIf="c.tipo === 'nieve'"><i *ngFor="let g of gotas" class="cl-copo" [style.left.%]="g.x" [style.animation-delay.s]="g.d * 3" [style.animation-duration.s]="g.v * 8"></i></ng-container>
      </div>
    </ng-container>
  `,
  styles: [`
    .cl-capa { position: fixed; inset: 0; pointer-events: none; z-index: 9983; overflow: hidden; }
    .cl-gota { position: absolute; top: -40px; width: 1.5px; border-radius: 1px; background: linear-gradient(transparent, rgba(186, 230, 253, .75)); animation: cl-caer linear infinite; transform: rotate(12deg); }
    @keyframes cl-caer { to { transform: translate(-12vh, 110vh) rotate(12deg); } }
    .cl-tormenta .cl-gota { background: linear-gradient(transparent, rgba(186, 230, 253, .9)); width: 2px; }
    .cl-rayo { position: absolute; inset: 0; background: rgba(224, 242, 254, .9); opacity: 0; animation: cl-rayo 14s infinite 3s; }
    @keyframes cl-rayo { 0%, 92%, 100% { opacity: 0; } 93% { opacity: .55; } 94% { opacity: .05; } 95% { opacity: .4; } 96% { opacity: 0; } }
    .cl-nube { position: absolute; left: -260px; width: 240px; height: 70px; opacity: .55; filter: blur(2px); animation: cl-nube linear infinite;
      background: radial-gradient(circle at 30% 60%, #e2e8f0 28px, transparent 29px), radial-gradient(circle at 52% 40%, #f1f5f9 38px, transparent 39px), radial-gradient(circle at 74% 60%, #e2e8f0 28px, transparent 29px), radial-gradient(ellipse at 50% 80%, #cbd5e1 100px, transparent 101px); }
    .cl-lluvia .cl-nube, .cl-tormenta .cl-nube { filter: blur(2px) brightness(.55); opacity: .7; }
    @keyframes cl-nube { to { left: calc(100vw + 40px); } }
    .cl-sol { position: absolute; top: -140px; right: -140px; width: 420px; height: 420px; border-radius: 50%; background: radial-gradient(circle, rgba(254, 240, 138, .45), rgba(253, 224, 71, .15) 40%, transparent 70%); animation: cl-sol 8s ease-in-out infinite alternate; }
    @keyframes cl-sol { from { transform: scale(1); opacity: .8; } to { transform: scale(1.1); opacity: 1; } }
    .cl-niebla { position: absolute; left: 0; right: 0; bottom: 0; height: 45%; background: linear-gradient(transparent, rgba(226, 232, 240, .28)); animation: cl-niebla 12s ease-in-out infinite alternate; }
    @keyframes cl-niebla { from { transform: translateX(-3%); } to { transform: translateX(3%); } }
    .cl-copo { position: absolute; top: -10px; width: 5px; height: 5px; border-radius: 50%; background: #fff; opacity: .8; animation: cl-caer linear infinite; }
    :host-context(html.sin-animaciones) .cl-capa, :host-context(html.modo-enfoque) .cl-capa { display: none; }
  `]
})
export class ClimaComponent {
  public clima = inject(ClimaService);
  private theme = inject(ThemeService);
  private auth = inject(AuthService);
  public visible = computed(() => { this.theme.cambio(); return !!this.theme.ap.efectos.clima; });
  public gotas = Array.from({ length: typeof window !== 'undefined' && window.innerWidth < 600 ? 45 : 90 }, () => ({ x: Math.random() * 110, d: -Math.random() * 2, v: 0.55 + Math.random() * 0.5, l: 14 + Math.random() * 18 }));
  public nubes = Array.from({ length: 5 }, (_, i) => ({ y: 20 + Math.random() * 160, d: -i * 14 - Math.random() * 10, v: 60 + Math.random() * 40, e: 0.7 + Math.random() * 0.8 }));

  constructor() {
    effect(() => { if (this.visible() && this.theme.cambio() >= 0 && this.auth.currentUser) this.clima.iniciar(); });
  }
}
