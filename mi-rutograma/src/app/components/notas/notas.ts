import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, NotaPersonal } from '../../services/theme.service';
import { AccountService } from '../../services/account.service';

/**
 * NOTAS RÁPIDAS PERSONALES (botón de la libreta en la barra, o tecla B):
 * papelitos de colores para apuntar cosas ("llamar a Polar a las 3").
 * Solo los ve la cuenta que los escribe, en cualquier equipo donde entre
 * (en las cuentas compartidas quedan en ese equipo). Se guardan solos.
 */
const COLORES: Array<{ clave: string; fondo: string; borde: string }> = [
  { clave: 'amarillo', fondo: '#fef08a', borde: '#eab308' }, { clave: 'rosa', fondo: '#fbcfe8', borde: '#ec4899' },
  { clave: 'verde', fondo: '#bbf7d0', borde: '#22c55e' }, { clave: 'azul', fondo: '#bfdbfe', borde: '#3b82f6' },
  { clave: 'morado', fondo: '#e9d5ff', borde: '#a855f7' }, { clave: 'naranja', fondo: '#fed7aa', borde: '#f97316' }
];

@Component({
  selector: 'app-notas',
  standalone: true,
  imports: [CommonModule],
  template: `
    <aside class="nt-panel" *ngIf="theme.notasAbiertas()" animate.leave="ap-ocultar" role="dialog" aria-label="Mis notas">
      <div class="nt-cab">
        <strong><i class="bi bi-sticky-fill"></i> Mis notas</strong>
        <span class="nt-cuenta">{{ pendientes }} por hacer</span>
        <button class="nt-x" (click)="theme.notasAbiertas.set(false)" title="Cerrar (B)" aria-label="Cerrar"><i class="bi bi-x-lg"></i></button>
      </div>
      <p class="nt-ayuda">{{ compartida ? 'Cuenta compartida: tus notas quedan solo en este equipo.' : 'Solo las ves tú, en cualquier equipo donde entres. Se guardan solas.' }}</p>
      <button class="nt-nueva" (click)="nueva()" [disabled]="theme.ap.notas.length >= 30"><i class="bi bi-plus-lg"></i> Nueva nota</button>
      <div class="nt-lista">
        <div *ngFor="let n of theme.ap.notas; trackBy: porId" class="nt-nota" [class.hecha]="n.hecha" [style.background]="color(n).fondo" [style.border-color]="color(n).borde">
          <div class="nt-barra">
            <label class="nt-check" title="Marcar como hecha"><input type="checkbox" [checked]="n.hecha" (change)="cambiar(n, { hecha: !n.hecha })"><i class="bi" [ngClass]="n.hecha ? 'bi-check-circle-fill' : 'bi-circle'"></i></label>
            <span class="nt-colores">
              <button *ngFor="let c of colores" class="nt-color" [style.background]="c.fondo" [style.border-color]="c.borde" [class.on]="n.color === c.clave" (click)="cambiar(n, { color: c.clave })" [attr.aria-label]="'Color ' + c.clave"></button>
            </span>
            <button class="nt-borrar" (click)="borrar(n)" title="Borrar nota" aria-label="Borrar nota"><i class="bi bi-trash3"></i></button>
          </div>
          <textarea rows="3" maxlength="1000" [value]="n.texto" placeholder="Escribe aquí…" (input)="cambiar(n, { texto: $any($event.target).value })"></textarea>
          <small class="nt-fecha">{{ n.en }}</small>
        </div>
        <div class="nt-vacio" *ngIf="!theme.ap.notas.length">📝 Aún no tienes notas. Crea una para apuntar algo rápido.</div>
      </div>
    </aside>
  `,
  styles: [`
    .nt-panel { position: fixed; top: 70px; right: 16px; width: min(330px, calc(100vw - 32px)); max-height: calc(100vh - 100px); z-index: 10045; display: flex; flex-direction: column;
      background: var(--color-fondo-tarjeta, #111827); color: var(--color-texto-principal, #f9fafb); border: 1px solid var(--color-borde, #374151); border-radius: 14px; padding: 12px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, .45); animation: nt-entrar .35s cubic-bezier(.2, .9, .3, 1.2); }
    :host-context(html.con-fondo) .nt-panel { background: #111827; }
    :host-context(body.tema-claro) .nt-panel { background: #ffffff; }
    @keyframes nt-entrar { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: none; } }
    .nt-cab { display: flex; align-items: center; gap: 8px; }
    .nt-cab i { color: #eab308; }
    .nt-cuenta { margin-left: auto; font-size: 11px; color: var(--color-texto-apagado, #94a3b8); }
    .nt-x { background: none; border: 1px solid var(--color-borde, #374151); color: inherit; border-radius: 7px; padding: 2px 7px; cursor: pointer; }
    .nt-ayuda { font-size: 11.5px; color: var(--color-texto-apagado, #94a3b8); margin: 6px 0 8px; }
    .nt-nueva { background: var(--acento, #2563eb); color: #fff; border: none; border-radius: 9px; padding: 8px; font-weight: 700; cursor: pointer; font-family: inherit; margin-bottom: 10px; }
    .nt-lista { overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 2px; }
    .nt-nota { border-radius: 4px 12px 12px 12px; border: 1px solid; border-left-width: 5px; padding: 6px 8px 4px; color: #1f2937; box-shadow: 0 4px 10px rgba(0, 0, 0, .2); transform: rotate(-.4deg); transition: transform .15s; }
    .nt-nota:nth-child(even) { transform: rotate(.4deg); }
    .nt-nota:hover { transform: none; }
    .nt-nota.hecha textarea { text-decoration: line-through; opacity: .55; }
    .nt-barra { display: flex; align-items: center; gap: 6px; }
    .nt-check input { display: none; }
    .nt-check i { font-size: 16px; cursor: pointer; color: #374151; }
    .nt-colores { display: flex; gap: 3px; margin-left: 4px; }
    .nt-color { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid; padding: 0; cursor: pointer; }
    .nt-color.on { box-shadow: 0 0 0 2px #1f2937; }
    .nt-borrar { margin-left: auto; background: none; border: none; color: #6b7280; cursor: pointer; font-size: 14px; }
    .nt-borrar:hover { color: #dc2626; }
    textarea { width: 100%; box-sizing: border-box; border: none; background: transparent; color: #1f2937; font-family: inherit; font-size: 13.5px; resize: vertical; outline: none; margin-top: 4px; line-height: 1.4; }
    .nt-fecha { display: block; text-align: right; font-size: 10px; color: #6b7280; }
    .nt-vacio { text-align: center; font-size: 13px; color: var(--color-texto-apagado, #94a3b8); padding: 20px 6px; }
  `]
})
export class NotasComponent {
  public theme = inject(ThemeService);
  private account = inject(AccountService);
  public readonly colores = COLORES;
  public get compartida(): boolean { return this.account.cuentaCompartida; }
  public get pendientes(): number { return this.theme.ap.notas.filter(n => !n.hecha && n.texto.trim()).length; }
  public porId = (_: number, n: NotaPersonal) => n.id;
  public color(n: NotaPersonal) { return COLORES.find(c => c.clave === n.color) || COLORES[0]; }
  private ahora(): string { return new Date().toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); }

  public nueva(): void {
    const color = COLORES[this.theme.ap.notas.length % COLORES.length].clave;
    this.theme.ponerNotas([{ id: Math.random().toString(36).slice(2, 10), texto: '', color, hecha: false, en: this.ahora() }, ...this.theme.ap.notas], true);
    setTimeout(() => (document.querySelector('.nt-nota textarea') as HTMLTextAreaElement | null)?.focus());
  }
  public cambiar(n: NotaPersonal, cambios: Partial<NotaPersonal>): void {
    this.theme.ponerNotas(this.theme.ap.notas.map(x => x.id === n.id ? { ...x, ...cambios, en: cambios.texto !== undefined ? this.ahora() : x.en } : x), cambios.texto === undefined);
  }
  public borrar(n: NotaPersonal): void {
    this.theme.ponerNotas(this.theme.ap.notas.filter(x => x.id !== n.id), true);
  }
}
