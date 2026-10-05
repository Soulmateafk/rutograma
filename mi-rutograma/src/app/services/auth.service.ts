import { Injectable, Inject, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { UiService } from './ui.service';
import { AccountService, UserStatus as CuentaStatus } from './account.service';

// Definimos los posibles estados de cuenta
export type UserStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_FOUND';

@Injectable({ providedIn: 'root' })
export class AuthService {
  public SP: any = {
    clientId: '',
    tenantId: '',
    siteId: '',
    driveId: '',
    fileName: 'rutagrama_datos.json',
    configured: false,
    token: undefined,
    tokenExp: 0,
    msalApp: null,
    _nombreUsuario: ''
    
  };
  public currentUser: any = null;
  public currentUserStatus: UserStatus | null = null;

  // Código del último error de login por correo/contraseña — para poder
  // mostrar un mensaje específico en vez de un genérico "usuario no
  // encontrado" cuando en realidad fue, por ejemplo, un problema de red.
  // 'credenciales' = correo o contraseña incorrectos (401 del backend).
  // 'red' = el navegador no pudo ni siquiera contactar al servidor.
  // 'servidor' = el servidor respondió pero con un error propio (500, etc).
  // 'bloqueado' = demasiados intentos fallidos seguidos (429 del backend).
  public ultimoErrorLoginCodigo: 'credenciales' | 'red' | 'servidor' | 'bloqueado' | null = null;
  // Mensaje que mandó el servidor con el último error de login (por ejemplo,
  // cuántos minutos falta para poder volver a intentar).
  public ultimoMensajeLogin: string = '';

  private account = inject(AccountService);

  constructor(
    private storage: LocalStorageService,
    private ui: UiService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router
  ) {
    this.cargarConfigSP();

    // Si el servidor dice que la sesión ya no es válida (pase vencido,
    // contraseña cambiada por el administrador, cuenta eliminada...), se
    // avisa y se manda al login. AccountService no puede hacerlo solo porque
    // no puede inyectar a este servicio (este ya lo inyecta a él).
    this.account.alExpirarSesion = (mensaje?: string) => {
      this.currentUser = null;
      this.currentUserStatus = null;
      this.ui.mostrarToast(mensaje || 'Tu sesión expiró. Inicia sesión de nuevo.', 'err');
      this.router.navigate(['/login']);
    };
  }

  /**
   * fetch() que lleva la sesión activa. Para los archivos que hacen sus
   * propias llamadas al servidor con fetch() en vez de usar HttpClient —
   * las de HttpClient ya llevan la sesión por el interceptor.
   */
  /** Ver AccountService.sesionesCerradasAlEntrar / maxSesiones. */
  public get sesionesCerradasAlEntrar(): number { return this.account.sesionesCerradasAlEntrar; }
  public get maxSesiones(): number { return this.account.maxSesiones; }

  public fetchAutenticado(url: string, init?: RequestInit): Promise<Response> {
    return this.account.fetchAutenticado(url, init);
  }

  // --- 1. CONFIGURACIÓN SHAREPOINT ---
  public cargarConfigSP(): void {
    const cfg = this.storage.cargarConfigSP();
    if (!cfg) return;
    this.SP = { ...this.SP, ...cfg, configured: true };
  }

  public guardarConfiguracion(cfg: { clientid: string, tenantid: string, siteid: string, driveid: string }): void {
    if (!cfg.clientid || !cfg.tenantid) {
      this.ui.mostrarToast('Client ID y Tenant ID son obligatorios', 'err');
      return;
    }
    this.SP.clientId = cfg.clientid;
    this.SP.tenantId = cfg.tenantid;
    this.SP.siteId = cfg.siteid;
    this.SP.driveId = cfg.driveid;
    this.SP.configured = true;
    this.SP.msalApp = null; 

    this.storage.guardarConfigSP({ 
      clientId: cfg.clientid, 
      tenantId: cfg.tenantid, 
      siteId: cfg.siteid, 
      driveId: cfg.driveid 
    });
    this.ui.mostrarToast('Configuración guardada.', 'ok');
  }

  // --- 2. MÉTODO PUENTE (SOLUCIONA EL ERROR DE COMPILACIÓN) ---
  public async iniciarSesion(): Promise<boolean> {
    return await this.iniciarSesionMicrosoft();
  }

  // Registro de una nueva solicitud de cuenta (correo + contraseña).
  // Queda pendiente hasta que el admin la apruebe.
  public async registrarSolicitud(datos: { nombre: string; email: string; pass: string; departamento: string }): Promise<void> {
    await this.account.registrar(datos);
  }

  // --- 3. LÓGICA DE AUTENTICACIÓN TRADICIONAL (Email/Pass + Status) ---
  public async iniciarSesionEmail(email: string, pass: string): Promise<UserStatus> {
    // Valida la contraseña REAL contra el backend. Si es incorrecta, el
    // backend responde 401 y aquí lo tomamos como 'NOT_FOUND'.
    this.ultimoErrorLoginCodigo = null;
    this.ultimoMensajeLogin = '';
    try {
      const res = await this.account.login(email, pass);
      this.currentUser = { email: (email || '').toLowerCase().trim() };
      this.currentUserStatus = res.estado;
      return res.estado as UserStatus;
    } catch (e: any) {
      console.error('Error de login:', e);
      // status === 0 → el navegador no logró ni contactar al servidor
      // (sin internet, servidor caído, URL mal configurada). status ===
      // 401 → el backend sí respondió: correo o contraseña incorrectos.
      // Cualquier otro código → el servidor tuvo un error propio.
      if (e?.status === 0) {
        this.ultimoErrorLoginCodigo = 'red';
      } else if (e?.status === 429) {
        this.ultimoErrorLoginCodigo = 'bloqueado';
        this.ultimoMensajeLogin = e?.error?.msg || '';
      } else if (e?.status === 401) {
        this.ultimoErrorLoginCodigo = 'credenciales';
      } else {
        this.ultimoErrorLoginCodigo = 'servidor';
      }
      this.currentUserStatus = null;
      return 'NOT_FOUND';
    }
  }

  // --- 4. LÓGICA DE AUTENTICACIÓN MSAL (SharePoint) ---
  public async iniciarSesionMicrosoft(): Promise<boolean> {
    if (!this.initMSAL()) { 
      this.ui.mostrarToast('Configura primero el Client ID y Tenant ID', 'err');
      return false; 
    }
    const token = await this.getToken();
    if (!token) return false;

    // Ya autenticado con Microsoft: ahora verificamos la aprobación en el
    // backend compartido (hoja "Usuarios" del Excel). El correo/nombre
    // vienen de la cuenta de Microsoft.
    const email = (this.SP._nombreUsuario || '').toLowerCase().trim();
    try {
      const res = await this.account.verificarCuenta(email, this.SP._nombreUsuario || email);
      this.currentUser = { email };
      this.currentUserStatus = res.estado;
      return true;
    } catch (e) {
      console.error('No se pudo verificar la cuenta en el servidor:', e);
      this.ui.mostrarToast('No se pudo verificar tu cuenta con el servidor', 'err');
      return false;
    }
  }

  public async signOut(): Promise<void> {
    if (this.SP.msalApp) {
      try {
        await this.SP.msalApp.logoutPopup();
      } catch (e) { console.warn('Error durante el logout MSAL:', e); }
    }
    this.SP.token = undefined; 
    this.SP.tokenExp = 0;
    this.actualizarBadgeConexion(false, '');
  }

  public initMSAL(): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    if (!this.SP.clientId || !this.SP.tenantId) return false;
    try {
      this.SP.msalApp = new (window as any).msal.PublicClientApplication({
        auth: {
          clientId: this.SP.clientId,
          authority: 'https://login.microsoftonline.com/' + this.SP.tenantId,
          redirectUri: window.location.href.split('?')[0]
        },
        cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: true }
      });
      return true;
    } catch (e) {
      console.error('MSAL init error:', e);
      return false;
    }
  }

  public async getToken(): Promise<string | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    if (!this.SP.msalApp && !this.initMSAL()) return null;
    
    const now = Date.now();
    if (this.SP.token && (this.SP.tokenExp || 0) > now + 60000) return this.SP.token;
    
    const scopes = ['https://graph.microsoft.com/Files.ReadWrite', 'https://graph.microsoft.com/Sites.ReadWrite.All'];
    try {
      const accounts = this.SP.msalApp.getAllAccounts();
      const req = { scopes: scopes, account: accounts[0] || undefined };
      const res: any = accounts.length > 0
        ? await this.SP.msalApp.acquireTokenSilent(req)
        : await this.SP.msalApp.acquireTokenPopup(req);

      this.SP.token = res.accessToken;
      this.SP.tokenExp = now + (res.expiresOn ? (res.expiresOn.getTime() - now) : 3500000);
      this.SP._nombreUsuario = res.account ? (res.account.name || res.account.username) : '';

      this.actualizarBadgeConexion(true, this.SP._nombreUsuario);
      return this.SP.token || null;
    } catch (e) {
      console.warn('Token error:', e);
      this.actualizarBadgeConexion(false, '');
      return null;
    }
  }

  // --- 5. HELPERS Y CIERRE DE SESIÓN GENERAL ---
public get isConfigured(): boolean { return true;
  //console.log("DEBUG: Verificando configuración SP:", this.SP); // Esto nos dirá qué falta
  //return !!(this.SP.clientId && this.SP.tenantId && this.SP.configured);//
}

  public actualizarBadgeConexion(ok: boolean, nombre?: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    const badge = document.getElementById('sp-badge');
    if (!badge) return;
    
    if (ok) {
      badge.innerHTML = `<span style="color:#22c55e">&#9679;</span> ${nombre || 'Conectado'}`;
      badge.style.borderColor = '#166534';
    } else {
      badge.innerHTML = '<span style="color:#ef4444">&#9679;</span> Sin conexion SharePoint';
      badge.style.borderColor = '#7f1d1d';
    }
  }

  public get spFileUrl(): string {
    if (this.SP.siteId && this.SP.driveId) {
      return `https://graph.microsoft.com/v1.0/sites/${this.SP.siteId}/drives/${this.SP.driveId}/root:/${this.SP.fileName}:/content`;
    }
    return `https://graph.microsoft.com/v1.0/me/drive/root:/Makand/${this.SP.fileName}:/content`;
  }

  public async cerrarSesion() {
    // 1. Cerrar sesión de Microsoft si existe
    await this.signOut();
    // 2. Limpiar SOLO lo de la sesión (correo activo) — antes esto era
    // localStorage.clear(), que borraba TODO lo guardado en el
    // navegador sin distinción: el tema Claro/Oscuro, los valores de
    // Cumplimiento en Comparativo, etc. — cosas que no tienen nada que
    // ver con la sesión y no deberían perderse al cerrarla.
    this.account.limpiarSesionLocal();
    // 3. Resetear el estado en memoria (sin esto, "sin sesión" podría
    //    confundirse con el último estado que tenía antes de salir)
    this.currentUser = null;
    this.currentUserStatus = null;
    if (isPlatformBrowser(this.platformId)) {
      localStorage.removeItem('recordarSesion');
      sessionStorage.removeItem('sesionActiva');
    }
    // 4. Redirigir al Login
    this.router.navigate(['/login']);
  }
  /**
   * Se llama desde el guardián de rutas cuando se recarga la página
   * (F5) y currentUser quedó en null en memoria — intenta recuperar la
   * sesión usando el correo que ya está guardado en el navegador, sin
   * pedir la contraseña de nuevo. Si no hay nada que recuperar,
   * devuelve false y el guardián manda a Login como siempre.
   */
  public async intentarRestaurarSesion(): Promise<boolean> {
    if (isPlatformBrowser(this.platformId)) {
      const noRecordar = localStorage.getItem('recordarSesion') === '0';
      if (noRecordar && !sessionStorage.getItem('sesionActiva')) return false;
    }
    const resultado = await this.account.restaurarSesion();
    if (!resultado) return false;

    this.currentUser = { email: this.account.correoSesionActiva };
    this.currentUserStatus = resultado.estado;
    return true;
  }

  public get rolActual(): string {
    return this.account.rol;
  }

  public marcarSesion(recordar: boolean): void {
    if (!isPlatformBrowser(this.platformId)) return;
    localStorage.setItem('recordarSesion', recordar ? '1' : '0');
    sessionStorage.setItem('sesionActiva', '1');
  }

  public get isAdmin(): boolean {
    // El backend decide quién es admin (según ADMIN_EMAIL en server.js).
    // Guardamos ese resultado en el AccountService al verificar la cuenta.
    return this.account.esAdmin;
  }

  /** Motivo que escribió el admin al rechazar la cuenta — vacío si no
   *  aplica (cuenta pendiente o aprobada). Lo usa la pantalla Pending. */
  public get motivoRechazo(): string {
    return this.account.motivoRechazo || '';
  }

  /**
   * true si el usuario puede crear/editar/eliminar cosas (admin o editor).
   * false si es "lector" (solo puede ver, exportar, descargar).
   * Úsalo en los *ngIf de botones de agregar/editar/eliminar en toda la app.
   */
  public get puedeEditar(): boolean {
    return this.account.permisos.editar;
  }

  /** Jefe: edita todo y aprueba los cambios de los auxiliares. */
  public get esJefe(): boolean {
    return this.account.rol === 'jefe';
  }

  /** Rol auxiliar (para la bienvenida). Lo que puede hacer lo dicen los permisos. */
  public get esAuxiliar(): boolean {
    return this.account.rol === 'auxiliar';
  }

  /** Sus cambios quedan pendientes hasta que alguien los apruebe. */
  public get necesitaAprobacion(): boolean {
    return this.account.permisos.editar && !this.account.permisos.sinAprobacion;
  }

  /** Aprueba o rechaza los cambios pendientes de otros. */
  public get puedeAprobar(): boolean {
    return this.account.permisos.aprobarCambios;
  }

  /** Entra a Administración (sin ser admin, solo a mirar). */
  public get puedeVerAdministracion(): boolean {
    return this.account.permisos.verAdministracion;
  }

  /** Acepta o rechaza cuentas nuevas. */
  public get puedeGestionarCuentas(): boolean {
    return this.account.permisos.gestionarCuentas;
  }

  /** ¿La cuenta tiene este permiso? (ver PERMISOS_INFO en account.service.ts) */
  public puede(clave: string): boolean {
    return !!(this.account.permisos as any)[clave];
  }

  public get puedeEditarHistorico(): boolean {
    return this.account.permisos.editarHistorico;
  }
}