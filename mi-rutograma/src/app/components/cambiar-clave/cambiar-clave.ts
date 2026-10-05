import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AccountService } from '../../services/account.service';
import { UiService } from '../../services/ui.service';
import { REQUISITOS_CLAVE, faltasDeClave } from '../../services/validaciones';

/**
 * Formulario "Cambiar mi contraseña": la actual, la nueva (con los
 * requisitos marcados en vivo) y su confirmación. El servidor revisa todo
 * otra vez y cierra las demás sesiones de la cuenta.
 */
@Component({
  selector: 'app-cambiar-clave',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cambiar-clave.html',
  styleUrls: ['./cambiar-clave.css']
})
export class CambiarClaveComponent {
  private account = inject(AccountService);
  private ui = inject(UiService);

  /** Para no dejar que la nueva contenga el correo o el nombre. */
  @Input() email = '';
  @Input() nombre = '';
  @Output() listo = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  actual = '';
  nueva = '';
  confirmar = '';
  ver = false;
  guardando = false;
  error = '';

  get faltas(): string[] {
    return faltasDeClave(this.nueva, { email: this.email, nombre: this.nombre });
  }

  get requisitos(): Array<{ texto: string; ok: boolean }> {
    const faltas = this.faltas;
    const lista = REQUISITOS_CLAVE.filter(r => r.clave !== 'maximo' || this.nueva.length > 64)
      .map(r => ({ texto: r.texto, ok: !faltas.includes(r.texto) }));
    for (const extra of ['Que no contenga tu correo', 'Que no contenga tu nombre']) {
      if (faltas.includes(extra)) lista.push({ texto: extra, ok: false });
    }
    return lista;
  }

  get coinciden(): boolean {
    return !!this.confirmar && this.nueva === this.confirmar;
  }

  get puedeGuardar(): boolean {
    return !!this.actual && !this.faltas.length && this.coinciden && this.actual !== this.nueva && !this.guardando;
  }

  async guardar(): Promise<void> {
    this.error = '';
    if (!this.actual) { this.error = 'Escribe tu contraseña actual.'; return; }
    if (this.faltas.length) { this.error = 'La nueva contraseña todavía no es segura: revisa los requisitos en rojo.'; return; }
    if (!this.coinciden) { this.error = 'La confirmación no coincide con la nueva contraseña.'; return; }
    if (this.actual === this.nueva) { this.error = 'La nueva contraseña debe ser distinta de la actual.'; return; }
    this.guardando = true;
    const r = await this.account.cambiarMiClave(this.actual, this.nueva);
    this.guardando = false;
    if (!r.ok) { this.error = r.msg || 'No se pudo cambiar la contraseña.'; return; }
    const extra = r.sesionesCerradas ? ` Se cerró tu sesión en ${r.sesionesCerradas === 1 ? 'otro equipo' : r.sesionesCerradas + ' equipos más'}.` : '';
    this.ui.mostrarToast('Contraseña cambiada.' + extra, 'ok');
    this.actual = this.nueva = this.confirmar = '';
    this.listo.emit();
  }
}
