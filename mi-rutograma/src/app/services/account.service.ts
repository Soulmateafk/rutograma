import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UiService } from './ui.service';

export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_FOUND';

export interface CuentaUsuario {
  email: string;
  nombre: string;
  estado: UserStatus;
  departamento?: string;
  rol?: 'admin' | 'editor' | 'lector';
  solicitadoEn?: string;
  actualizadoPor?: string;
  actualizadoEn?: string;
}

/**
 * Habla con los endpoints /api/auth/* del backend Express (server.js).
 * Las cuentas viven en la hoja "Usuarios" del Excel compartido, así que
 * la aprobación la ven todos los computadores, no solo el navegador local.
 */
@Injectable({ providedIn: 'root' })
export class AccountService {
  private http = inject(HttpClient);
  private ui = inject(UiService);
  // Misma idea que en data.ts: se arma con la dirección que usaste para
  // entrar a la app, en vez de estar fija a 'localhost'.
  private API_URL = (typeof window !== 'undefined')
    ? `${window.location.protocol}//${window.location.hostname}:5000/api`
    : 'http://localhost:5000/api';

  // Llave donde guardamos el correo activo. Lo persistimos en localStorage
  // porque el AccountService puede recrearse al navegar/recargar, y si el
  // correo solo viviera en memoria, se perdería y el backend respondería
  // 403 (cabecera x-user-email vacía).
  private CLAVE_EMAIL = 'rutograma_admin_email';
  public esAdmin = false;
  /** 'admin' | 'editor' (acceso completo) | 'lector' (solo lectura) */
  public rol: 'admin' | 'editor' | 'lector' = 'lector';
  /** Motivo que escribió el admin al rechazar la cuenta — solo tiene
   *  valor cuando el último login/verificación devolvió estado REJECTED. */
  public motivoRechazo: string = '';

  private get emailActivo(): string {
    try {
      return localStorage.getItem(this.CLAVE_EMAIL) || '';
    } catch {
      return '';
    }
  }
  private set emailActivo(v: string) {
    try {
      localStorage.setItem(this.CLAVE_EMAIL, v || '');
    } catch { /* ignore */ }
  }

  /**
   * Correo de la sesión activa — público, para que archivos que hacen
   * sus propias llamadas con fetch() (en vez de usar los métodos de
   * este servicio) puedan mandarlo en la cabecera x-user-email. Sin
   * esto, esas peticiones quedaban registradas como "desconocido" en
   * la auditoría, aunque el usuario sí tuviera sesión iniciada.
   */
  public get correoSesionActiva(): string {
    return this.emailActivo;
  }

  // El "pase" que entrega el servidor al iniciar sesión (ver server.js,
  // sección "SESIONES CON PASE"). Es lo que de verdad prueba quién eres:
  // el servidor lo verifica en cada petición, y el correo por sí solo ya no
  // basta. Vive en localStorage para que sobreviva a recargar la página.
  private CLAVE_TOKEN = 'rutograma_token';

  // Identificador propio de ESTE navegador — no de la cuenta ni de la
  // sesión. Se genera una sola vez y se queda guardado para siempre (no se
  // borra ni al cerrar sesión), para que el servidor pueda reconocer "este
  // mismo computador" en logins futuros. Es lo que permite que "Sacar" una
  // sesión bloquee de verdad ese dispositivo (ver server.js), en vez de que
  // baste con volver a escribir la contraseña para entrar otra vez ahí.
  private CLAVE_DISPOSITIVO = 'rutograma_dispositivo_id';

  public get dispositivoId(): string {
    try {
      let id = localStorage.getItem(this.CLAVE_DISPOSITIVO);
      if (!id) {
        id = crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        localStorage.setItem(this.CLAVE_DISPOSITIVO, id);
      }
      return id;
    } catch {
      // Sin localStorage disponible (raro, pero posible) — se genera uno
      // por esta sola carga de página; simplemente no persistirá.
      return `sin-storage-${Date.now()}`;
    }
  }

  public get token(): string {
    try {
      return localStorage.getItem(this.CLAVE_TOKEN) || '';
    } catch {
      return '';
    }
  }

  private guardarToken(v: string): void {
    try {
      if (v) localStorage.setItem(this.CLAVE_TOKEN, v);
      else localStorage.removeItem(this.CLAVE_TOKEN);
    } catch { /* ignore */ }
  }

  /** Lo asigna AuthService: qué hacer cuando el servidor dice que la
   *  sesión ya no es válida (avisar y mandar al login). Se hace así, con
   *  una función que se registra, porque este servicio no puede inyectar a
   *  AuthService (AuthService ya lo inyecta a él). */
  public alExpirarSesion: (() => void) | null = null;

  /** Cierra la sesión local por una respuesta del servidor (pase vencido,
   *  contraseña cambiada, cuenta eliminada...) y avisa una sola vez. */
  public sesionExpirada(): void {
    // Sin nada que cerrar, no se repite el aviso ni la redirección
    // (por ejemplo: varias llamadas fallan a la vez, o en la pantalla de login).
    if (!this.token && !this.emailActivo) return;
    this.limpiarSesionLocal();
    this.alExpirarSesion?.();
  }

  /** Cabeceras con la sesión activa, para llamadas hechas con fetch(). */
  public get cabecerasSesion(): Record<string, string> {
    const cabeceras: Record<string, string> = {};
    if (this.token) cabeceras['Authorization'] = `Bearer ${this.token}`;
    if (this.emailActivo) cabeceras['x-user-email'] = this.emailActivo;
    return cabeceras;
  }

  /**
   * fetch() que lleva la sesión activa (el pase) y reacciona igual que el
   * interceptor si el servidor dice que la sesión ya no es válida. Es lo que
   * deben usar los archivos que hacen sus propias llamadas con fetch().
   */
  public async fetchAutenticado(url: string, init: RequestInit = {}): Promise<Response> {
    const cabeceras = new Headers(init.headers || {});
    Object.entries(this.cabecerasSesion).forEach(([k, v]) => cabeceras.set(k, v));

    const respuesta = await fetch(url, { ...init, headers: cabeceras });

    if (respuesta.status === 401) {
      try {
        const cuerpo = await respuesta.clone().json();
        if (cuerpo?.codigo === 'pase_invalido' || cuerpo?.codigo === 'sin_pase') this.sesionExpirada();
      } catch { /* la respuesta no era JSON: no es un aviso de sesión */ }
    }
    return respuesta;
  }

  /**
   * Limpia SOLO lo que le pertenece a este servicio (el correo de la
   * sesión activa y el estado en memoria) — para que cerrarSesion() en
   * auth.service.ts no tenga que hacer localStorage.clear() (que borra
   * TODO en el navegador: preferencias de tema, valores guardados de
   * otras pantallas, etc., no solo la sesión).
   */
  public limpiarSesionLocal(): void {
    this.emailActivo = '';
    this.guardarToken('');
    this.esAdmin = false;
    this.rol = 'lector';
    this.motivoRechazo = '';
  }

  /**
   * Se llama tras el login de Microsoft. Registra la cuenta (queda PENDING
   * la primera vez) o devuelve su estado ya guardado.
   */
  async verificarCuenta(email: string, nombre: string): Promise<{ estado: UserStatus; esAdmin: boolean }> {
    this.emailActivo = (email || '').toLowerCase().trim();
    const res: any = await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/check`, { email: this.emailActivo, nombre })
    );
    this.esAdmin = !!res.esAdmin;
    this.motivoRechazo = res.motivoRechazo || '';
    return { estado: res.estado, esAdmin: !!res.esAdmin };
  }

  /** Lista las cuentas pendientes (solo admin). */
  async listarPendientes(): Promise<CuentaUsuario[]> {
    const res: any = await firstValueFrom(
      this.http.get(`${this.API_URL}/auth/pendientes`, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
    return res.pendientes || [];
  }

  /**
   * Registra una cuenta nueva con correo + contraseña. Queda PENDING
   * hasta que el admin la apruebe. La contraseña viaja al backend y allá
   * se guarda hasheada (nunca en texto plano).
   */
  async registrar(datos: { nombre: string; email: string; pass: string; departamento: string }): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/register`, {
        nombre: datos.nombre,
        email: (datos.email || '').toLowerCase().trim(),
        pass: datos.pass,
        departamento: datos.departamento
      })
    );
  }

  /**
   * Login real: valida la contraseña contra el backend. Solo si la
   * contraseña es correcta devuelve el estado; si es incorrecta, lanza
   * error (el backend responde 401).
   */
  /** Sesiones viejas que el servidor cerró al entrar por el tope por cuenta. */
  public sesionesCerradasAlEntrar = 0;
  public maxSesiones = 5;

  async login(email: string, pass: string): Promise<{ estado: UserStatus; esAdmin: boolean; rol: string }> {
    const correo = (email || '').toLowerCase().trim();
    const res: any = await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/login`, { email: correo, pass, dispositivoId: this.dispositivoId })
    );
    // Guardamos el correo y el pase solo si el login fue correcto
    this.emailActivo = correo;
    this.guardarToken(res.token || '');
    this.esAdmin = !!res.esAdmin;
    this.rol = res.esAdmin ? 'admin' : (res.rol === 'lector' ? 'lector' : 'editor');
    this.motivoRechazo = res.motivoRechazo || '';
    this.sesionesCerradasAlEntrar = Number(res.sesionesCerradas) || 0;
    if (Number(res.maxSesiones) > 0) this.maxSesiones = Number(res.maxSesiones);
    return { estado: res.estado, esAdmin: !!res.esAdmin, rol: this.rol };
  }

  /**
   * Restaura la sesión al recargar la página, sin pedir contraseña de
   * nuevo — usa el correo que ya quedó guardado en el navegador. Si no
   * hay correo guardado, o la cuenta ya no existe, devuelve null (el
   * guardián de rutas manda a Login como siempre en ese caso).
   */
  async restaurarSesion(): Promise<{ estado: UserStatus; esAdmin: boolean; rol: string } | null> {
    const correo = this.emailActivo;
    if (!correo) return null;

    // Una sesión abierta ANTES de que existieran los pases solo tiene el
    // correo guardado, y el correo ya no prueba quién eres: no se restaura,
    // hay que iniciar sesión una vez más para recibir el pase.
    if (!this.token) {
      this.limpiarSesionLocal();
      return null;
    }

    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.API_URL}/auth/estado?email=${encodeURIComponent(correo)}`)
      );
      this.esAdmin = !!res.esAdmin;
      this.rol = res.esAdmin ? 'admin' : (res.rol === 'lector' ? 'lector' : 'editor');
      this.motivoRechazo = res.motivoRechazo || '';
      return { estado: res.estado, esAdmin: !!res.esAdmin, rol: this.rol };
    } catch {
      // Cuenta borrada, servidor caído, etc. — no hay sesión que
      // restaurar, y no es un error que la persona necesite ver.
      return null;
    }
  }

  // Misma llave y misma forma que usa la cola de DataService — así,
  // aunque este servicio no puede inyectar DataService (crearía una
  // dependencia circular: DataService -> AuthService -> AccountService),
  // lo que se encole aquí se reintenta solo con el resto de cambios
  // pendientes en cuanto vuelva la conexión.
  private encolarCambioPendienteLocal(url: string, body: any, descripcion: string): void {
    try {
      const raw = localStorage.getItem('rutograma_cola_pendiente');
      const cola = raw ? JSON.parse(raw) : [];
      cola.push({ url, body, descripcion, fecha: new Date().toISOString() });
      localStorage.setItem('rutograma_cola_pendiente', JSON.stringify(cola));
    } catch { /* ignore */ }
  }

  /** Cambia el rol de una cuenta ('editor' = acceso completo, 'lector' = solo lectura). Solo admin. */
  async cambiarRol(email: string, rol: 'editor' | 'lector'): Promise<void> {
    const url = `${this.API_URL}/auth/rol`;
    const body = { email, rol };
    try {
      await firstValueFrom(
        this.http.post(url, body, { headers: { 'x-user-email': this.emailActivo } })
      );
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendienteLocal(url, body, `Cambiar rol de ${email} a ${rol}`);
        this.ui.mostrarToast('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — el cambio de rol se sincronizará solo cuando vuelva la conexión.', 'err');
        return; // se trata como éxito local — la pantalla sigue con su actualización optimista
      }
      throw e;
    }
  }

  /** Lista todas las cuentas con su estado (solo admin). */
  async listarTodas(): Promise<CuentaUsuario[]> {
    if (!this.emailActivo) {
      throw new Error('No hay correo activo. Inicia sesión primero.');
    }
    const res: any = await firstValueFrom(
      this.http.get(`${this.API_URL}/auth/usuarios`, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
    return res.usuarios || [];
  }

  /** Lista los dispositivos bloqueados (solo admin) — ver "Sacar" en sesiones.ts. */
  async listarDispositivosBloqueados(): Promise<any[]> {
    const res: any = await firstValueFrom(
      this.http.get(`${this.API_URL}/dispositivos-bloqueados`, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
    return res.dispositivos || [];
  }

  /** Desbloquea un dispositivo para que esa cuenta pueda volver a entrar desde ahí (solo admin). */
  async desbloquearDispositivo(email: string, dispositivoId: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API_URL}/dispositivos/desbloquear`, { email, dispositivoId }, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
  }

  /** Lista los últimos eventos del registro de auditoría (solo admin). */
  async listarAuditoria(limite: number = 200): Promise<any[]> {
    const res: any = await firstValueFrom(
      this.http.get(`${this.API_URL}/auditoria?limite=${limite}`, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
    return res.eventos || [];
  }

  async aprobar(email: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/decidir`, { email, accion: 'APPROVED' }, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
  }

  async rechazar(email: string, motivo: string = ''): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/decidir`, { email, accion: 'REJECTED', motivo }, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
  }

  /** Restablece la contraseña de una cuenta (solo admin) — para cuando
   *  alguien la olvida, sin necesitar un flujo de correo automático. */
  async resetearClave(email: string, nuevaClave: string): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.API_URL}/auth/resetear-clave`, { email, nuevaClave }, {
        headers: { 'x-user-email': this.emailActivo }
      })
    );
  }
}