import { Component, inject, OnInit, PLATFORM_ID } from '@angular/core';
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
export class SesionesComponent implements OnInit {
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private platformId = inject(PLATFORM_ID);

  sesiones: Sesion[] = [];
  cargando = true;
  esAdmin = false;
  maxSesiones = 5;
  verTodas = false;

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) this.cargar();
  }

  async cargar() {
    this.cargando = true;
    try {
      const res = await this.auth.fetchAutenticado(
        `${API_URL}/api/sesiones${this.verTodas ? '?todas=1' : ''}`
      );
      const data = await res.json();
      if (data.ok) {
        this.sesiones = data.sesiones;
        this.esAdmin = !!data.esAdmin;
        if (Number(data.maxSesiones) > 0) this.maxSesiones = Number(data.maxSesiones);
      } else {
        this.ui.mostrarToast(data.msg || 'No se pudieron cargar las sesiones.', 'err');
      }
    } catch {
      this.ui.mostrarToast('No se pudieron cargar las sesiones.', 'err');
    }
    this.cargando = false;
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
        this.ui.mostrarToast('Sesión cerrada.', 'ok');
        this.cargar();
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
        this.ui.mostrarToast(`Se cerraron ${data.cerradas} sesión(es).`, 'ok');
        this.cargar();
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
