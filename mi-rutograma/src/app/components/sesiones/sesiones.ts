import { ChangeDetectorRef, Component, inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';

// Misma dirección que usan AccountService y DataService: el servidor en
// el puerto 5000 del MISMO equipo con el que se abrió la app. Antes era
// 'http://localhost:5000' fijo — en el celular "localhost" es el propio
// celular, así que la lista de sesiones nunca cargaba desde ahí.
const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : 'http://localhost:5000';

interface Sesion {
  id: string;
  email: string;
  ip: string;
  dispositivo: string;
  creada: string;
  ultima: string;
  actual: boolean;
}

@Component({
  selector: 'app-sesiones',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sesiones.html',
  styleUrls: ['./sesiones.css']
})
export class SesionesComponent implements OnInit, OnDestroy {
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private platformId = inject(PLATFORM_ID);
  // La app no usa zone.js: sin avisarle, la pantalla no se redibujaba
  // al llegar la lista nueva (había que recargar para ver el cambio).
  private cdr = inject(ChangeDetectorRef);
  private intervaloRefresco: ReturnType<typeof setInterval> | null = null;

  sesiones: Sesion[] = [];
  cargando = true;
  esAdmin = false;
  maxSesiones = 15;
  verTodas = false;

  ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) return;
    this.cargar();
    // Mientras la pantalla está abierta, la lista se actualiza sola —
    // así también se ven las sesiones que se cierran desde otro equipo.
    this.intervaloRefresco = setInterval(() => {
      if (document.visibilityState === 'visible') this.cargar(true);
    }, 15000);
  }

  ngOnDestroy() {
    if (this.intervaloRefresco) clearInterval(this.intervaloRefresco);
  }

  /** silencioso: sin "Cargando…" ni avisos de error (refresco automático). */
  async cargar(silencioso = false) {
    if (!silencioso) {
      this.cargando = true;
      this.cdr.markForCheck();
    }
    try {
      const res = await this.auth.fetchAutenticado(
        `${API_URL}/api/sesiones${this.verTodas ? '?todas=1' : ''}`
      );
      const data = await res.json();
      if (data.ok) {
        this.sesiones = data.sesiones;
        this.esAdmin = !!data.esAdmin;
        if (Number(data.maxSesiones) > 0) this.maxSesiones = Number(data.maxSesiones);
      } else if (!silencioso) {
        this.ui.mostrarToast(data.msg || 'No se pudieron cargar las sesiones.', 'err');
      }
    } catch {
      if (!silencioso) this.ui.mostrarToast('No se pudieron cargar las sesiones.', 'err');
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  alternarTodas() {
    this.verTodas = !this.verTodas;
    this.cargar();
  }

  async cerrar(s: Sesion) {
    if (s.actual) {
      await this.auth.cerrarSesion();
      return;
    }
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/api/sesiones/cerrar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: s.id })
      });
      const data = await res.json();
      if (data.ok) {
        // Se quita de la lista al instante; luego se confirma con el servidor.
        this.sesiones = this.sesiones.filter(x => x.id !== s.id);
        this.cdr.markForCheck();
        this.ui.mostrarToast('Sesión cerrada.', 'ok');
        this.cargar(true);
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudo cerrar la sesión.', 'err');
      }
    } catch {
      this.ui.mostrarToast('No se pudo cerrar la sesión.', 'err');
    }
  }

  async cerrarOtras() {
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/api/sesiones/cerrar-otras`, { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        this.sesiones = this.sesiones.filter(x => x.actual);
        this.cdr.markForCheck();
        this.ui.mostrarToast(`Se cerraron ${data.cerradas} sesión(es).`, 'ok');
        this.cargar(true);
      }
    } catch {
      this.ui.mostrarToast('No se pudieron cerrar las sesiones.', 'err');
    }
  }

  get hayOtras(): boolean {
    return this.sesiones.some(s => !s.actual);
  }

  fecha(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  }
}
