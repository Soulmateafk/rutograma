import { Injectable, inject, afterNextRender, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LocalStorageService } from './local-storage.service';
import { AuthService } from './auth.service';
import { UiService } from './ui.service';
import { firstValueFrom } from 'rxjs';
import { AccountService } from './account.service';
import { Subject } from 'rxjs';
import { API } from '../api-base';

@Injectable({ providedIn: 'root' })
export class DataService {

  private http = inject(HttpClient);
  private storage = inject(LocalStorageService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private cuenta = inject(AccountService);

  /**
   * Cabecera con tu correo, para que el backend sepa quién hizo cada
   * cambio (queda en el registro de auditoría). Se arma al vuelo con lo
   * que ya guarda AuthService al iniciar sesión.
   */
  private headersAuditoria() {
    return { headers: { 'x-user-email': this.auth.currentUser?.email || '' } };
  }

  // ============================================================
  // COLA DE CAMBIOS PENDIENTES (sin conexión)
  // ============================================================
  // Cuando el POST de un guardado falla porque el navegador NI SIQUIERA
  // pudo contactar al servidor (status 0 — de verdad sin conexión, no un
  // error de validación ni un 500), el cambio se aplica igual del lado
  // del navegador (para que la persona pueda seguir trabajando) y se
  // encola aquí — se reintenta solo, en orden, apenas la conexión vuelva
  // (ver procesarColaPendiente(), llamado desde inicializarApp()).
  private readonly CLAVE_COLA_PENDIENTE = 'rutograma_cola_pendiente';

  private leerColaPendiente(): any[] {
    try {
      const raw = localStorage.getItem(this.CLAVE_COLA_PENDIENTE);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  private guardarColaPendiente(cola: any[]): void {
    try { localStorage.setItem(this.CLAVE_COLA_PENDIENTE, JSON.stringify(cola)); } catch { /* ignore */ }
    this._pendientes.set(cola.length);
  }

  // Conteo como signal, por la misma razón que sinConexion (la barra roja
  // vive en el componente raíz). Se vuelve a leer del almacenamiento en
  // cada sincronización, porque otros servicios (account.service.ts)
  // también escriben en esta misma cola sin pasar por aquí.
  private _pendientes = signal(0);
  private refrescarPendientes(): void { this._pendientes.set(this.leerColaPendiente().length); }

  /** Cuántos cambios están esperando a sincronizarse — para mostrar en
   *  la barra de "sin conexión" si se quiere, o en cualquier pantalla. */
  public get cantidadCambiosPendientes(): number {
    return this._pendientes();
  }

  private encolarCambioPendiente(url: string, body: any, descripcion: string): void {
    const cola = this.leerColaPendiente();

    // Varias ediciones sin conexión del MISMO viaje se funden en una sola
    // (queda la última) — pero conservando la versión base de la primera,
    // que es la que el servidor conocía. Si no, la segunda edición llegaría
    // con una versión que la primera ya dejó atrás, y se "chocaría" con
    // los propios cambios de la misma persona.
    if (url.endsWith('/viajes') && body && body.id !== undefined) {
      const i = cola.findIndex((x: any) => x.url === url && x.body && x.body.id === body.id);
      if (i !== -1) {
        cola[i] = { ...cola[i], body: { ...body, version: cola[i].body.version }, descripcion, fecha: new Date().toISOString() };
        this.guardarColaPendiente(cola);
        return;
      }
    }

    cola.push({ url, body, descripcion, fecha: new Date().toISOString() });
    this.guardarColaPendiente(cola);
  }

  // Evita que dos sincronizaciones que se crucen reenvíen los mismos
  // cambios dos veces (una novedad o un cierre de mes se duplicarían).
  private procesandoCola = false;

  /** Reintenta, en orden, los cambios que quedaron pendientes mientras no
   *  había conexión. Devuelve cuántos se sincronizaron.
   *  - Los que fallen por RED o por un error del servidor (5xx) se quedan
   *    en la cola para el siguiente intento — no se pierden.
   *  - Los que el servidor RECHACE de verdad (4xx: sin permiso, datos
   *    inválidos, ya no existe...) se descartan: reintentarlos nunca va a
   *    funcionar y se quedarían dando vueltas para siempre. */
  public async procesarColaPendiente(): Promise<number> {
    if (this.procesandoCola) return 0;
    const cola = this.leerColaPendiente();
    if (!cola.length) return 0;

    this.procesandoCola = true;
    try {
      let exitosos = 0;
      const restantes: any[] = [];
      const rechazados: any[] = [];
      const conflictos: any[] = [];

      for (const item of cola) {
        try {
          await firstValueFrom(this.http.post(item.url, item.body, this.headersAuditoria()));
          exitosos++;
        } catch (e: any) {
          // 401 = la sesión no sirve (venció, o cambiaron la contraseña) — los
          // cambios se CONSERVAN en la cola y se reenvían apenas la persona
          // vuelva a iniciar sesión, en vez de perderse como si el servidor
          // los hubiera rechazado.
          if (e?.status === 0 || e?.status >= 500 || e?.status === 401) {
            restantes.push(item);
          } else if (e?.status === 409 && e?.error?.conflicto) {
            // Otra persona modificó ese viaje mientras no había conexión:
            // no se pisa su cambio, y no tiene sentido reintentar.
            conflictos.push({ item, actual: e.error.actual });
          } else {
            console.error('Cambio pendiente rechazado por el servidor, se descarta:', item, e);
            rechazados.push(item);
          }
        }
      }

      // Mientras se reenviaba, pudo encolarse algo nuevo al final — se
      // conserva (solo se quitan los que ya se procesaron, que son los
      // primeros cola.length).
      const actual = this.leerColaPendiente();
      this.guardarColaPendiente([...restantes, ...actual.slice(cola.length)]);

      if (exitosos > 0) {
        this.ui.mostrarToast(`<i class="bi bi-cloud-check-fill"></i> ${exitosos} cambio(s) que habían quedado pendientes ya se sincronizaron.`, 'ok');
      }
      if (conflictos.length > 0) {
        const c = conflictos[0];
        const quien = this.nombreDe(c.actual?.editadoPor) || 'otra persona';
        this.ui.mostrarToast(`<i class="bi bi-people-fill"></i> ${conflictos.length} cambio(s) hechos sin conexión no se aplicaron porque ${quien} modificó ese viaje mientras tanto (por ejemplo: ${c.item.descripcion}). Quedó la versión más reciente.`, 'err');
      }
      if (rechazados.length > 0) {
        this.ui.mostrarToast(`<i class="bi bi-exclamation-triangle-fill"></i> El servidor rechazó ${rechazados.length} cambio(s) hechos sin conexión (por ejemplo: ${rechazados[0].descripcion}). Revisa que sigan como los dejaste.`, 'err');
      }
      if (restantes.length > 0) {
        this.ui.mostrarToast(`<i class="bi bi-exclamation-triangle-fill"></i> ${restantes.length} cambio(s) todavía no se pudieron sincronizar — se reintentará más tarde.`, 'err');
      }
      return exitosos;
    } finally {
      this.procesandoCola = false;
    }
  }

  private _HOY_REAL = new Date();
  public S: any;
  public cargado: boolean = false;

  // Se activa cuando el servidor deja de responder — la app sigue
  // funcionando con la última copia guardada en el navegador, pero sin
  // esto nadie se enteraba de que los datos podían estar desactualizados
  // (o de que cualquier intento de guardar iba a fallar).
  // Es un signal por dentro (aunque se usa igual que una propiedad normal:
  // "this.sinConexion = true"): el componente raíz (app.html) muestra la
  // barra roja leyendo esto, y en modo zoneless un cambio hecho desde un
  // callback de fondo (la sincronización de cada 20 s) NO repinta una
  // propiedad normal por sí solo — con un signal sí.
  private _sinConexion = signal(false);
  public get sinConexion(): boolean { return this._sinConexion(); }
  public set sinConexion(v: boolean) { this._sinConexion.set(v); }
  public ultimoSyncExitoso: Date | null = null;
  public seccionActual: string = 'configuracion';
  public dataChanged = new Subject<void>();

  // ============================================================
  // DESHACER / REHACER — historial LOCAL de esta computadora (nunca se
  // comparte con otras, cada una tiene el suyo propio, guardado en
  // localStorage). Guarda los últimos MAX_DESHACER cambios (viajes, rutas,
  // vehículos, conductores) con su estado ANTES y DESPUÉS, para poder
  // revertir o reaplicar cada uno individualmente sin afectar nada más
  // que haya pasado — no es un "deshacer todo el Excel", es por cambio
  // específico.
  // ============================================================
  // Antes eran solo 3 — se quedaba corto. Aplica igual a Deshacer y a Rehacer.
  public readonly MAX_DESHACER = 30;
  public pilaDeshacer: { tipo: string; clave: string; antes: any | null; despues?: any | null; descripcion: string; timestamp: number }[] = [];
  public pilaRehacer: { tipo: string; clave: string; antes: any | null; despues?: any | null; descripcion: string; timestamp: number }[] = [];

  // El historial de Deshacer/Rehacer NO debe mezclarse entre Modo Real y
  // Modo Prueba — un cambio hecho en Prueba no tiene sentido "deshacerlo"
  // estando en Real (y viceversa: se aplicaría sobre el Excel equivocado).
  // Por eso las claves de localStorage incluyen el modo actual.
  public modoActual: 'real' | 'pruebas' = 'real';

  public async actualizarModoActual(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this.http.get(`${this.API_URL}/modo`));
      this.modoActual = (res?.modo === 'pruebas') ? 'pruebas' : 'real';
    } catch {
      // Si falla la consulta, se asume "real" por seguridad.
      this.modoActual = 'real';
    }
    // Siempre se carga el historial correspondiente al modo confirmado —
    // tanto al arrancar la app como al detectar un cambio de modo — para
    // no mezclarlo nunca con el del otro modo.
    this.cargarPilaDeshacerLocal();
  }

  /** Para que otras pantallas (Administrador, Configuración...) agreguen
   *  sus cambios al mismo historial de Deshacer/Rehacer. */
  public registrarCambio(entry: { tipo: string; clave: string; antes: any | null; despues?: any | null; descripcion: string }): void {
    this.registrarUndo(entry);
  }

  /** Avisa qué tipo de cambio se acaba de deshacer o rehacer — así una
   *  pantalla abierta (ej. Administrador) puede recargar su lista. */
  public cambioRevertido = new Subject<string>();

  private async postApi(ruta: string, body: any): Promise<any> {
    return firstValueFrom(this.http.post(`${this.API_URL}${ruta}`, body, this.headersAuditoria()));
  }

  /**
   * Tipos de cambio que no son viaje/ruta/vehículo/conductor. Devuelve
   * true si lo manejó. "sentido" = 'deshacer' (volver a "antes") o
   * 'rehacer' (volver a "despues").
   */
  private async aplicarCambioExtendido(entry: any, sentido: 'deshacer' | 'rehacer'): Promise<boolean> {
    const deshacer = sentido === 'deshacer';
    switch (entry.tipo) {
      case 'eliminar-ruta': {
        if (deshacer) {
          await this.guardarRuta({ ...entry.antes }, undefined, true);
        } else {
          const idx = (this.S.rutas || []).findIndex((r: any) => String(r.cod || r.codigo || '') === entry.clave);
          if (idx !== -1) await this.eliminarRuta(idx, true);
        }
        return true;
      }
      case 'eliminar-vehiculo': {
        if (deshacer) {
          await this.guardarVehiculo({ ...entry.antes }, -1, true);
        } else {
          await firstValueFrom(this.eliminarVehiculoBD(entry.clave));
          this.S.vehiculos = (this.S.vehiculos || []).filter((v: any) => String(v.p || v.placa || '') !== entry.clave);
          await this.autoSave();
        }
        return true;
      }
      case 'eliminar-conductor': {
        if (deshacer) {
          await this.guardarConductorValidado({ ...entry.antes }, -1, true);
        } else {
          const idx = (this.S.conductores || []).findIndex((c: any) => String(c.ced || c.cedula || c.cc || '') === entry.clave);
          if (idx !== -1) await this.eliminarConductor(idx, true);
        }
        return true;
      }
      case 'novedad': {
        if (deshacer) {
          await this.postApi('/novedades/eliminar', { id: entry.despues.id });
          this.S.novedades = (this.S.novedades || []).filter((n: any) => String(n.id) !== String(entry.despues.id));
        } else {
          await this.postApi('/novedades', entry.despues);
          if (!this.S.novedades) this.S.novedades = [];
          this.S.novedades.push({ ...entry.despues });
        }
        await this.autoSave();
        return true;
      }
      case 'novedad-resuelta': {
        await this.postApi('/novedades/resolver', { id: entry.antes.id, resuelta: !deshacer });
        const nov = (this.S.novedades || []).find((n: any) => String(n.id) === String(entry.antes.id));
        if (nov) nov.resuelta = !deshacer;
        await this.autoSave();
        return true;
      }
      case 'usuario-rol': {
        // antes/despues: { rol, permisos } (o solo el rol, en entradas viejas).
        const valor = deshacer ? entry.antes : entry.despues;
        const { rol, permisos, conductorCed } = typeof valor === 'string' ? { rol: valor, permisos: null, conductorCed: null } : valor;
        await this.postApi('/auth/rol', { email: entry.clave, rol, permisos: permisos || null, conductorCed: conductorCed || null });
        return true;
      }
      case 'usuario-estado': {
        const estado = deshacer ? entry.antes : entry.despues;
        await this.postApi('/auth/decidir', { email: entry.clave, accion: estado.estado, motivo: estado.motivo || '' });
        return true;
      }
      case 'dispositivo-desbloqueado': {
        await this.postApi(deshacer ? '/dispositivos/bloquear' : '/dispositivos/desbloquear', entry.antes);
        return true;
      }
      case 'config': {
        // Configuración guardada en este equipo (transportadoras, cupos...).
        this.S[entry.clave] = JSON.parse(JSON.stringify(deshacer ? entry.antes : entry.despues));
        await this.autoSave();
        if (DataService.CLAVES_CONFIG_COMPARTIDA.includes(entry.clave)) await this.guardarConfigCompartida(entry.clave);
        return true;
      }
      case 'respaldo': {
        // Acción masiva (Generar Matriz, Importar, Restaurar): se vuelve al
        // respaldo tomado justo antes; al deshacer, el servidor respalda el
        // estado actual y ese es el que usa Rehacer.
        const nombre = deshacer ? entry.antes : entry.despues;
        if (!nombre) throw new Error('No hay respaldo para este cambio.');
        const res: any = await this.postApi('/respaldos/restaurar', { nombre });
        if (deshacer && res?.respaldoAntes) entry.despues = res.respaldoAntes;
        await this.inicializarApp(true);
        return true;
      }
    }
    return false;
  }

  private registrarUndo(entry: { tipo: string; clave: string; antes: any | null; despues?: any | null; descripcion: string }): void {
    // Los cambios de un auxiliar no se aplican hasta que un jefe los
    // apruebe — no hay nada que deshacer todavía.
    if (this.cuenta.permisos.editar && !this.cuenta.permisos.sinAprobacion) return;
    this.pilaDeshacer.push({ ...entry, timestamp: Date.now() });
    if (this.pilaDeshacer.length > this.MAX_DESHACER) this.pilaDeshacer.shift();
    // Cualquier cambio NUEVO borra lo que se pudiera "rehacer" — una vez
    // avanzas de nuevo, ya no tiene sentido "rehacer" algo que quedó
    // atrás de este cambio.
    this.pilaRehacer = [];
    this.guardarPilaDeshacerLocal();
  }

  private guardarPilaDeshacerLocal(): void {
    // Si el navegador se queda sin espacio (cambios muy grandes), se van
    // descartando los más viejos hasta que quepa, en vez de perder todo.
    for (let intento = 0; intento < 6; intento++) {
      try {
        localStorage.setItem(`rutograma_pila_deshacer_${this.modoActual}`, JSON.stringify(this.pilaDeshacer));
        localStorage.setItem(`rutograma_pila_rehacer_${this.modoActual}`, JSON.stringify(this.pilaRehacer));
        return;
      } catch {
        if (this.pilaDeshacer.length <= 1 && this.pilaRehacer.length <= 1) return;
        this.pilaDeshacer = this.pilaDeshacer.slice(Math.ceil(this.pilaDeshacer.length / 2));
        this.pilaRehacer = this.pilaRehacer.slice(Math.ceil(this.pilaRehacer.length / 2));
      }
    }
  }

  public cargarPilaDeshacerLocal(): void {
    try {
      const rawDeshacer = localStorage.getItem(`rutograma_pila_deshacer_${this.modoActual}`);
      this.pilaDeshacer = rawDeshacer ? JSON.parse(rawDeshacer) : [];
      const rawRehacer = localStorage.getItem(`rutograma_pila_rehacer_${this.modoActual}`);
      this.pilaRehacer = rawRehacer ? JSON.parse(rawRehacer) : [];
      this.pilaDeshacer = this.pilaDeshacer.slice(-this.MAX_DESHACER);
      this.pilaRehacer = this.pilaRehacer.slice(-this.MAX_DESHACER);
    } catch {
      // Se queda vacía si el dato guardado está corrupto.
      this.pilaDeshacer = [];
      this.pilaRehacer = [];
    }
  }

  /** Texto legible de qué se deshace si se aprieta el botón ahora — null si no hay nada. */
  public get descripcionProximoDeshacer(): string | null {
    if (!this.pilaDeshacer.length) return null;
    return this.pilaDeshacer[this.pilaDeshacer.length - 1].descripcion;
  }

  /** Texto legible de qué se rehace si se aprieta el botón ahora — null si no hay nada. */
  public get descripcionProximoRehacer(): string | null {
    if (!this.pilaRehacer.length) return null;
    return this.pilaRehacer[this.pilaRehacer.length - 1].descripcion;
  }

  public async deshacerUltimoCambio(): Promise<{ ok: boolean; mensaje: string }> {
    const entry = this.pilaDeshacer.pop();
    this.guardarPilaDeshacerLocal();
    if (!entry) return { ok: false, mensaje: 'No hay ningún cambio reciente para deshacer.' };

    try {
      if (entry.tipo === 'viaje') {
        if (entry.antes === null) {
          // Era un viaje NUEVO — deshacer = eliminarlo.
          await this.eliminarViaje(entry.clave, true);
        } else {
          await this.guardarViaje({ ...entry.antes }, true);
        }
      } else if (entry.tipo === 'eliminar-viaje') {
        // El cambio original fue ELIMINAR un viaje — deshacer = volver a crearlo tal cual estaba.
        await this.guardarViaje({ ...entry.antes }, true);
      } else if (entry.tipo === 'ruta') {
        if (entry.antes === null) {
          // Ruta nueva — deshacer = quitarla (no hay endpoint de eliminar
          // ruta dedicado; se quita directo del arreglo y se sincroniza).
          this.S.rutas = (this.S.rutas || []).filter((r: any) => String(r.cod || r.codigo || '') !== entry.clave);
          await this.autoSave();
        } else {
          await this.guardarRuta({ ...entry.antes }, entry.antes.cod || entry.antes.codigo, true);
        }
      } else if (entry.tipo === 'vehiculo') {
        const idx = (this.S.vehiculos || []).findIndex((v: any) => String(v.p || v.placa || '') === entry.clave);
        if (entry.antes === null) {
          // BUG REAL encontrado y corregido: era un vehículo NUEVO —
          // deshacer debe ELIMINARLO (mismo patrón que ya usan viaje y
          // ruta). Antes esto llamaba a guardarVehiculo con un objeto
          // vacío ({...null} = {}), dejando un vehículo roto (sin
          // placa) en la base en vez de quitarlo de verdad.
          await firstValueFrom(this.eliminarVehiculoBD(entry.clave));
          this.S.vehiculos = (this.S.vehiculos || []).filter((v: any) => String(v.p || v.placa || '') !== entry.clave);
          await this.autoSave();
        } else {
          await this.guardarVehiculo({ ...entry.antes }, idx, true);
        }
      } else if (entry.tipo === 'conductor') {
        const idx = (this.S.conductores || []).findIndex((c: any) => String(c.ced || c.cedula || c.cc || '') === entry.clave);
        if (entry.antes === null) {
          // Mismo bug, mismo arreglo, para conductores nuevos.
          if (idx !== -1) await this.eliminarConductor(idx);
        } else {
          await this.guardarConductorValidado({ ...entry.antes }, idx, true);
        }
      } else {
        await this.aplicarCambioExtendido(entry, 'deshacer');
      }
      this.cambioRevertido.next(entry.tipo);

      // Lo que se acaba de deshacer pasa a la pila de "rehacer" — así se
      // puede volver a avanzar sin perder el cambio que se revirtió.
      this.pilaRehacer.push(entry);
      if (this.pilaRehacer.length > this.MAX_DESHACER) this.pilaRehacer.shift();
      this.guardarPilaDeshacerLocal();

      return { ok: true, mensaje: `Se deshizo: ${entry.descripcion}` };
    } catch (e) {
      console.error('Error al deshacer:', e);
      // Si algo falla al aplicar, regresamos la entrada a la pila para no perderla.
      this.pilaDeshacer.push(entry);
      this.guardarPilaDeshacerLocal();
      return { ok: false, mensaje: `No se pudo deshacer el cambio: ${this.ui.mensajeErrorHttp(e, 'deshacer el cambio')}` };
    }
  }

  public async rehacerUltimoCambio(): Promise<{ ok: boolean; mensaje: string }> {
    const entry = this.pilaRehacer.pop();
    this.guardarPilaDeshacerLocal();
    if (!entry) return { ok: false, mensaje: 'No hay ningún cambio para rehacer.' };

    try {
      if (entry.tipo === 'viaje') {
        if (entry.despues === undefined || entry.despues === null) {
          await this.eliminarViaje(entry.clave, true);
        } else {
          await this.guardarViaje({ ...entry.despues }, true);
        }
      } else if (entry.tipo === 'eliminar-viaje') {
        // El cambio original fue ELIMINAR un viaje — rehacerlo = eliminarlo otra vez.
        await this.eliminarViaje(entry.clave, true);
      } else if (entry.tipo === 'ruta') {
        if (entry.despues === undefined || entry.despues === null) {
          this.S.rutas = (this.S.rutas || []).filter((r: any) => String(r.cod || r.codigo || '') !== entry.clave);
          await this.autoSave();
        } else {
          await this.guardarRuta({ ...entry.despues }, entry.antes?.cod || entry.antes?.codigo, true);
        }
      } else if (entry.tipo === 'vehiculo') {
        const idx = (this.S.vehiculos || []).findIndex((v: any) => String(v.p || v.placa || '') === entry.clave);
        await this.guardarVehiculo({ ...entry.despues }, idx, true);
      } else if (entry.tipo === 'conductor') {
        const idx = (this.S.conductores || []).findIndex((c: any) => String(c.ced || c.cedula || c.cc || '') === entry.clave);
        await this.guardarConductorValidado({ ...entry.despues }, idx, true);
      } else {
        await this.aplicarCambioExtendido(entry, 'rehacer');
      }
      this.cambioRevertido.next(entry.tipo);

      // Lo que se acaba de rehacer vuelve a la pila de "deshacer" — para
      // poder revertirlo de nuevo si hace falta.
      this.pilaDeshacer.push(entry);
      if (this.pilaDeshacer.length > this.MAX_DESHACER) this.pilaDeshacer.shift();
      this.guardarPilaDeshacerLocal();

      return { ok: true, mensaje: `Se rehizo: ${entry.descripcion}` };
    } catch (e) {
      console.error('Error al rehacer:', e);
      this.pilaRehacer.push(entry);
      this.guardarPilaDeshacerLocal();
      return { ok: false, mensaje: `No se pudo rehacer el cambio: ${this.ui.mensajeErrorHttp(e, 'rehacer el cambio')}` };
    }
  }


  public async autoSave(): Promise<void> {
  this.storage.guardarEstado(this.S);
  this.dataChanged.next(); 
}
  
  // Antes era una dirección fija ('http://localhost:5000/api'), que solo
  // funcionaba en el computador donde corriera el backend. Ahora se arma
  // usando la MISMA dirección con la que entraste a la app (sea localhost,
  // la IP de la oficina, o un nombre de Tailscale) — así funciona igual
  // desde cualquier computador, sin tener que tocar código nunca más.
  private API_URL = API;

  // ============================================================
  // CAMBIOS PENDIENTES DE APROBACIÓN (cuenta auxiliar)
  // El servidor no aplicó el cambio (lo dejó pendiente), pero la pantalla
  // ya lo había mostrado como hecho: se avisa y se vuelve a traer lo que
  // de verdad hay en el servidor. Se agrupan los avisos que llegan juntos
  // (un solo guardado puede mandar varios cambios).
  // ============================================================
  private avisosPendientes: string[] = [];
  private temporizadorPendientes: any = null;

  private alCambioPendiente(mensaje: string): void {
    this.avisosPendientes.push(mensaje);
    clearTimeout(this.temporizadorPendientes);
    this.temporizadorPendientes = setTimeout(async () => {
      const avisos = this.avisosPendientes;
      this.avisosPendientes = [];
      const texto = avisos.length === 1
        ? avisos[0]
        : `${avisos.length} cambios enviados para aprobación del jefe.`;
      await this.inicializarApp(true);
      this.ui.mostrarToast(`<i class="bi bi-hourglass-split"></i> ${texto} Se aplicarán cuando un jefe los apruebe.`, 'ok');
    }, 400);
  }

  constructor() {
    this.cuenta.alCambioPendiente.subscribe(msg => this.alCambioPendiente(msg));
    this.S = {
      mes: new Date().getMonth(),
      anio: new Date().getFullYear(),
      festivos: [],
      vehiculos: [],
      rutas: [],
      conductores: [],
      transportadoras: [
        { clave: 'makand', nombre: 'Makand SAS' },
        { clave: 'arsi', nombre: 'Arsitrans' },
        { clave: 'polar', nombre: 'Polar' },
        { clave: 'tercero', nombre: 'Tercero' }
      ],
      viajes: [],
      novedades: [],
      cuposExt: [],
      viajeDetId: null
    };

    // Carga INSTANTÁNEA (síncrona) del caché local, antes de esperar al
    // backend. Así CUALQUIER página (Dashboard incluido) arranca con
    // datos desde el primer instante, en vez de quedar vacía hasta que
    // termine la carga asíncrona (o hasta entrar a otra página que sí
    // hiciera esta misma lectura por su cuenta, como pasaba antes).
    this.cargarEstadoLocal();

    // afterNextRender() garantiza que esto corra UNA VEZ, solo en el
    // navegador — sin importar si tu app usa "hydration" (reutiliza lo
    // que ya renderizó el servidor) o arranca desde cero en el cliente.
    // Antes, llamar inicializarApp() directo aquí en el constructor podía
    // intentar hacer la petición de red DURANTE el renderizado en el
    // servidor (donde no existe una dirección real que usar), y si el
    // navegador luego reutilizaba esa misma instancia (hydration), nunca
    // se volvía a intentar — la app se quedaba pegada sin datos para
    // siempre, tanto en el servidor como en el navegador.
    afterNextRender(() => {
      this.actualizarModoActual().then(() => {
        this.inicializarApp();
        this.iniciarSincronizacionAutomatica();
      });
    });
  }

  /**
   * Mientras esto es 'true', la sincronización automática de 20 segundos
   * se salta ese ciclo — sin esto, si la sincronización periódica caía
   * justo mientras se estaba guardando algo (ej. "+ Viaje Extra"), podía
   * sobrescribir S.viajes con una copia del servidor tomada ANTES de que
   * ese guardado terminara, deshaciendo en silencio el cambio que se
   * acababa de hacer localmente. Cualquier flujo de guardado debe ponerla
   * en `true` al empezar y en `false` (siempre, incluso si falla) al
   * terminar.
   */
  public guardandoEnCurso: boolean = false;

  /** Huella de los últimos datos completos que llegaron del servidor (ver inicializarApp). */
  private versionDatos = '';
  private ultimaCargaCompleta = 0;

  /**
   * Cada 20 segundos, en silencio (sin mostrar el spinner de carga),
   * vuelve a preguntarle al servidor si hay datos nuevos. Sin esto, si
   * agregas algo desde un dispositivo, los demás se quedan viendo su
   * propia "foto" de cuando abrieron la app, sin enterarse de nada
   * nuevo hasta que recarguen la página a mano (F5).
   */
  private iniciarSincronizacionAutomatica(): void {
    setInterval(() => {
      if (this.guardandoEnCurso) return; // hay un guardado en curso — se salta este ciclo, no pisa nada
      this.inicializarApp(true);
    }, 20000);
  }

  public irA(seccion: string): void {
    this.seccionActual = seccion;
  }

  /**
   * 🔄 CARGA INICIAL DESDE TU BACKEND
   */
  /**
   * @param silencioso Si es true, NO muestra el spinner de "Cargando..."
   * (se usa para la actualización automática de fondo, para no interrumpir
   * al usuario cada vez que sincroniza con el servidor).
   * @param mensaje Texto del spinner cuando SÍ se muestra — cada página
   * puede poner algo más específico ("Cargando Rutograma...") en vez del
   * genérico "Cargando datos..." por defecto.
   */
  public async inicializarApp(silencioso: boolean = false, mensaje: string = 'Cargando datos...'): Promise<void> {
    // Durante SSR (renderizado en el servidor) no existe "window" — y ahí
    // no tiene sentido intentar llamar al backend: no sabemos con certeza
    // qué dirección usar, y un intento fallido puede colgar la respuesta
    // del propio servidor (esto era la causa del "Headers Timeout Error").
    // Dejamos que sea el NAVEGADOR, ya cargado, quien haga la llamada real.
    if (typeof window === 'undefined') {
      this.cargado = true;
      return;
    }

    // Las cuentas de conductor y de despachos no reciben los datos generales
    // (solo "Mis viajes" o "Despachos", que se piden aparte): no se intenta cargarlos.
    if (this.cuenta.rol === 'conductor' || this.cuenta.rol === 'despachos') {
      this.cargado = true;
      return;
    }

    // Otros servicios (account.service.ts) también encolan cambios sin pasar por
    // aquí — se vuelve a leer la cola real para que la barra roja cuente bien.
    this.refrescarPendientes();

    if (!silencioso) this.ui.mostrarSpinner(mensaje);

    // Nada cambió en el servidor: no se avisa a las pantallas (cada una
    // recalcularía todo para nada).
    let sinCambios = false;
    try {
      // El "?_=" con la hora actual evita que el navegador (o cualquier
      // capa intermedia) sirva una respuesta de red guardada en caché en
      // vez de ir de verdad al servidor — sin esto, una vez que el
      // navegador cachea la primera respuesta de esta misma URL, podía
      // seguir devolviendo esa misma foto vieja en cada sincronización,
      // aunque el servidor ya tuviera datos distintos.
      // En la sincronización de cada 20 s se manda la huella de lo que ya
      // se tiene: si nada cambió, el servidor responde "sin cambios" y no
      // se reprocesa nada (antes se reprocesaba más de 1 MB cada 20 s y en
      // computadores lentos la página se trababa). Cada 2 minutos, o si hay
      // cambios sin conexión por enviar, se pide todo igual.
      const pedirTodo = !silencioso || !this.versionDatos || Date.now() - this.ultimaCargaCompleta > 120000
        || this.leerColaPendiente().length > 0;
      const cabeceras: Record<string, string> = { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' };
      if (!pedirTodo) cabeceras['x-version-previa'] = this.versionDatos;
      const res: any = await firstValueFrom(this.http.get(`${this.API_URL}/dashboard-data?_=${Date.now()}`, { headers: cabeceras }));
      if (res?.ok && res.sinCambios) {
        if (this.sinConexion) this.ui.mostrarToast('<i class="bi bi-wifi"></i> Conexión con el servidor recuperada.', 'ok');
        this.sinConexion = false;
        this.ultimoSyncExitoso = new Date();
        sinCambios = true;
        return;
      }
      if (res?.ok && res.data && !this.guardandoEnCurso) {
        this.versionDatos = String(res.version || '');
        this.ultimaCargaCompleta = Date.now();
      }
      // Chequeo AQUÍ (justo antes de aplicar), no solo al arrancar la
      // sincronización — si esta petición ya estaba en camino desde antes
      // de que empezara un guardado, igual habría llegado y sobrescrito
      // S con una copia vieja del servidor. Revisar la bandera en este
      // punto exacto cierra ese hueco.
      if (this.guardandoEnCurso) {
        console.log('⏸️ Sincronización descartada: hay un guardado en curso.');
      } else if (res && res.ok && res.data) {
        let datosServidor = res.data;

        // Si veníamos de estar sin conexión, avisamos que ya volvió —
        // pero solo en ese caso real de recuperación, no en cada carga
        // normal de la app (eso sería ruido, no información útil).
        if (this.sinConexion) {
          this.ui.mostrarToast('<i class="bi bi-wifi"></i> Conexión con el servidor recuperada.', 'ok');
        }
        this.sinConexion = false;
        this.ultimoSyncExitoso = new Date();

        // Los cambios hechos sin conexión se reenvían ANTES de aplicar lo
        // que trajo el servidor: esa respuesta es de antes de que existieran
        // allá, y aplicarla tal cual haría que tus ediciones parecieran
        // "deshechas" hasta la siguiente sincronización (20 s después). Si
        // se reenvió algo, se vuelve a pedir el estado ya actualizado.
        if (this.leerColaPendiente().length > 0) {
          const reenviados = await this.procesarColaPendiente();
          if (reenviados > 0) {
            try {
              const fresco: any = await firstValueFrom(this.http.get(`${this.API_URL}/dashboard-data?_=${Date.now()}`, {
                headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
              }));
              if (fresco && fresco.ok && fresco.data) datosServidor = fresco.data;
            } catch { /* si falla, se aplica lo que ya teníamos; la próxima sincronización lo corrige */ }
          }
        }

        // Configuración que este equipo tenía guardada solo en su navegador
        // y que el servidor todavía no tiene (primera vez con esta versión):
        // se sube, para que el resto de equipos la vea.
        const sinSubir = DataService.CLAVES_CONFIG_COMPARTIDA.filter(c =>
          datosServidor[c] === undefined && Array.isArray(this.S[c]) && this.S[c].length > 0);

        Object.assign(this.S, datosServidor);
        await this.autoSave();
        for (const clave of sinSubir) await this.guardarConfigCompartida(clave);

        this.ui.syncFechas();
        this.ui.renderDash();
        
        console.log("✅ Datos frescos del servidor aplicados.");
      } else if (!silencioso) {
        this.cargarEstadoLocal();
      }
    } catch (err: any) {
      console.error("❌ Error inicializando app:", err);
      if (!silencioso) this.cargarEstadoLocal();
      // Un 401/403 significa que el servidor SÍ respondió pero la sesión no
      // sirve (vencida, cuenta sin aprobar...) — no es un problema de
      // conexión. De eso ya se encarga el interceptor (avisa y manda al
      // login); aquí no se debe mostrar la barra roja de "sin conexión".
      if (err?.status === 401 || err?.status === 403) {
        return;
      }
      // Solo avisamos en la TRANSICIÓN hacia sin conexión — la
      // sincronización reintenta cada 20s, y si avisáramos en cada
      // intento fallido sería un toast nuevo cada 20 segundos.
      if (!this.sinConexion) {
        this.ui.mostrarToast('<i class="bi bi-wifi-off"></i> Sin conexión con el servidor — mostrando los últimos datos guardados.', 'err');
      }
      this.sinConexion = true;
    } finally {
      this.cargado = true;
      if (!silencioso) this.ui.ocultarSpinner();
      // Avisamos SIEMPRE, sin importar si los datos vinieron del backend
      // o del respaldo local — así cualquier componente ya suscrito a
      // dataChanged sabe que ya puede recalcular con lo que haya en S.
      if (!sinCambios) this.dataChanged.next();
    }
  }



  /**
   * ✅ MÉTODO: GUARDAR VEHÍCULO (Ajustado para sincronía y estructura de Excel)
   */
  public async guardarVehiculo(
    vehiculo: any,
    index: number,
    sinRegistrar: boolean = false,
    opciones: { protegerDeChoques?: boolean; baseOriginal?: any; baseVista?: any } = {}
  ): Promise<boolean> {
    console.log("--- [DEBUG ANGULAR] Intentando enviar al servidor:", vehiculo);

    // Se captura el estado ANTES de aplicar el cambio — para poder
    // deshacerlo después. Si es un vehículo nuevo (index -1), "antes" queda null.
    const antes = (index !== -1 && this.S.vehiculos?.[index]) ? { ...this.S.vehiculos[index] } : null;

    // Normalizamos los datos para que coincidan 100% con las columnas de tu Excel
    const dataAEnviar = {
      p: vehiculo.p,
      t: vehiculo.t || 'Furgon refrigerado',
      cap: vehiculo.cap || 660,
      kg: vehiculo.kg || 8000,
      m3: vehiculo.m3 || 32,
      cond: vehiculo.cond || 'Sin asignar',
      tr: vehiculo.tr || 'Makand',
      // Urbano / Viajero / Tercero — el Rutograma solo usa Viajero y
      // Tercero (ignora Urbano por completo). Los vehículos de antes de
      // este campo no lo traen guardado; se infiere en el punto de
      // lectura (vehiculos.ts/server.js), no aquí.
      categoria: vehiculo.categoria || 'Viajero',
      est: vehiculo.est || vehiculo.estado || 'Disponible', // 👈 Garantiza que se envíe la clave correcta
      // "estado" también se manda — el servidor ya lo guardaba así, pero
      // en memoria (sin recargar la página) algunas partes de la pantalla
      // (como el punto de color junto a la placa) solo miran "estado", no
      // "est" — sin este campo, quedaban desactualizadas hasta recargar.
      estado: vehiculo.est || vehiculo.estado || 'Disponible',
      dc: vehiculo.dc || 0,
      dm: vehiculo.dm || 1,
      dl: vehiculo.dl || 2,
      // Fechas completas (ej. "2026-08-03"), no solo el número del día — así
      // no se confunde entre meses distintos, sin importar en qué mes esté
      // el Rutograma cuando se consulte esto.
      mantInicio: vehiculo.mantInicio || null,
      mantFin: vehiculo.mantFin || null,
      historialMantenimiento: vehiculo.historialMantenimiento || [],
      // Registro de averías puntuales ("Vehículo varado") — un registro
      // por día, independiente de mantInicio/mantFin. Faltaba en esta
      // lista blanca de campos, así que se perdía apenas se llamaba a
      // guardarVehiculo() (esta misma función reemplaza todo el objeto
      // en memoria por "dataAEnviar", así que cualquier campo que no
      // esté aquí desaparece incluso antes de tocar el servidor).
      historialAverias: vehiculo.historialAverias || [],
      // BUG REAL encontrado y corregido: estos 3 campos venían bien
      // armados desde vehiculos.ts, pero esta "lista blanca" los
      // descartaba antes de mandarlos al servidor — "um" alimenta la
      // alerta de mantenimiento preventivo cada 90 días, y
      // soatVence/tecnoVence las alertas de documentos vencidos.
      // Ninguna de las tres se actualizaba jamás al editar un vehículo.
      um: vehiculo.um || null,
      soatVence: vehiculo.soatVence || null,
      tecnoVence: vehiculo.tecnoVence || null
    };
    if (opciones.protegerDeChoques) (dataAEnviar as any).version = vehiculo.version;

    const url = `${this.API_URL}/vehiculos`;

    const aplicarLocalYRegistrar = async (guardado: any, mensajeExito: string, tipoToast: string) => {
      if (index === -1) {
        this.S.vehiculos.push(guardado);
      } else {
        this.S.vehiculos[index] = guardado;
      }
      if (!sinRegistrar) {
        this.registrarUndo({
          tipo: 'vehiculo',
          clave: String(guardado.p),
          antes,
          despues: { ...guardado },
          descripcion: `Vehículo ${guardado.p}`
        });
      }
      await this.autoSave();
      this.ui.mostrarToast(mensajeExito, tipoToast);
    };

    try {
      // 1. Esperamos confirmación estricta del backend
      // "Nuevo vehículo": el servidor rechaza si esa placa ya existe (en vez de sobrescribirla).
      const res: any = await firstValueFrom(this.http.post(url, vehiculo.esNuevo ? { ...dataAEnviar, esNuevo: true } : dataAEnviar, this.headersAuditoria()));

      console.log("✅ [DEBUG ANGULAR] Servidor respondió OK");
      const guardado = (res && res.version !== undefined)
        ? { ...dataAEnviar, version: res.version, editadoPor: res.editadoPor, editadoEn: res.editadoEn }
        : { ...dataAEnviar };
      await aplicarLocalYRegistrar(guardado, 'Vehículo guardado correctamente', 'ok');
      return true;
    } catch (e: any) {
      if (e?.status === 409 && e?.error?.conflicto && opciones.protegerDeChoques) {
        const actual = e.error.actual;
        const decision = await this.pedirDecisionConflictoGenerico(
          'vehiculo', 'Este', 'vehículo', String(actual?.p || vehiculo.p || '?'),
          DataService.CAMPOS_CHOQUE_VEHICULO, vehiculo, actual,
          { original: opciones.baseOriginal, vista: opciones.baseVista }
        );

        if (this.S.vehiculos) {
          const idx = this.S.vehiculos.findIndex((v: any) => String(v.p || v.placa || '').toUpperCase().trim() === String(actual.p || '').toUpperCase().trim());
          if (idx !== -1) this.S.vehiculos[idx] = { ...actual }; else this.S.vehiculos.push({ ...actual });
          await this.autoSave();
        }

        if (decision === 'sobrescribir') {
          return this.guardarVehiculo({ ...vehiculo, version: actual.version }, index, sinRegistrar, opciones);
        }
        this.ultimoChoqueDescartado = { tipo: 'vehiculo', clave: String(actual.p) };
        this.ui.mostrarToast(`Se descartó tu cambio: quedó la versión de ${this.nombreDe(actual.editadoPor) || 'la otra persona'}.`, 'ok');
        return false;
      }
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, dataAEnviar, `Vehículo ${dataAEnviar.p}`);
        await aplicarLocalYRegistrar({ ...dataAEnviar }, '<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return true;
      }
      // Mensajes viejos de cuando esto guardaba en Excel (podía chocar
      // si alguien tenía el archivo abierto) — ya no aplica desde la
      // migración a SQLite. Ahora se usa el helper compartido, que sí
      // distingue sin-conexión / sin-permiso / error real del servidor.
      console.error("❌ [DEBUG ANGULAR] Error en la petición HTTP:", e);
      this.ui.mostrarErrorHttp(e, 'guardar el vehículo');
      return false;
    }
  }

  public eliminarVehiculoBD(placa: string) {
    return this.http.post(`${this.API_URL}/vehiculos/eliminar`, { p: placa }, this.headersAuditoria());
  }

  /**
   * Elimina un viaje (cualquiera, no solo los "extra") por su id: primero
   * en el backend/Excel, y solo si eso sale bien, lo quita también de la
   * memoria local (S.viajes) para que desaparezca al toque del Rutograma.
   */
  /**
   * Guarda (crea o actualiza) un viaje: primero en el backend/Excel, y solo
   * si eso sale bien, refleja el cambio en memoria local (S.viajes) para
   * que el Rutograma se vuelva a pintar con el dato correcto.
   */
  // --- HISTÓRICO MENSUAL: consulta la foto de vehículos/rutas de un mes ---
  public async obtenerHistorialVehiculos(mes: string, anio: number): Promise<any[]> {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.API_URL}/historial-vehiculos`, { params: { mes, anio: String(anio) } })
      );
      return res?.vehiculos || [];
    } catch (e) {
      console.error('Error consultando historial de vehículos:', e);
      return [];
    }
  }

  public async obtenerHistorialRutas(mes: string, anio: number): Promise<any[]> {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.API_URL}/historial-rutas`, { params: { mes, anio: String(anio) } })
      );
      return res?.rutas || [];
    } catch (e) {
      console.error('Error consultando historial de rutas:', e);
      return [];
    }
  }

  public async obtenerHistorialConductores(mes: string, anio: number): Promise<any[]> {
    try {
      const res: any = await firstValueFrom(
        this.http.get(`${this.API_URL}/historial-conductores`, { params: { mes, anio: String(anio) } })
      );
      return res?.conductores || [];
    } catch (e) {
      console.error('Error consultando historial de conductores:', e);
      return [];
    }
  }

  // ============================================================
  // CONDUCTOR DE UNA PLACA — quién maneja una placa vive en dos lugares
  // (la placa del conductor en Conductores y el "conductor principal" del
  // vehículo). Al asignar desde cualquiera de las dos pantallas se dejan
  // ambos de acuerdo, y los viajes de esa placa desde MAÑANA pasan al
  // conductor nuevo (los de hoy y los ya hechos quedan con quien los hizo).
  // ============================================================
  private static mismaPlaca(a: any, b: any): boolean {
    return String(a || '').toUpperCase().trim() === String(b || '').toUpperCase().trim() && String(a || '').trim() !== '';
  }

  private static mismoNombre(a: any, b: any): boolean {
    return String(a || '').trim().toUpperCase() === String(b || '').trim().toUpperCase();
  }

  /** Conductor (de la lista de Conductores) que tiene asignada esta placa, distinto de `excepto`. */
  public conductorConPlaca(placa: string, excepto: string = ''): any | null {
    return (this.S.conductores || []).find((c: any) =>
      DataService.mismaPlaca(c.veh || c.placa || c.p, placa) && !DataService.mismoNombre(c.nom || c.nombre, excepto)
    ) || null;
  }

  /**
   * Deja a `nombre` como conductor de `placa` en Conductores y Vehículos y
   * pasa los viajes desde mañana. `origen` es la pantalla donde ya se
   * guardó el cambio (esa parte no se vuelve a guardar).
   * Devuelve cuántos viajes cambiaron de conductor.
   */
  public async asignarConductorAPlaca(
    placa: string,
    nombre: string,
    origen: 'conductor' | 'vehiculo',
    antes: { nombre?: string; placaDelNuevo?: string } = {}
  ): Promise<number> {
    const placaL = String(placa || '').toUpperCase().trim();
    const nombreL = String(nombre || '').trim();
    if (!placaL || !nombreL) return 0;
    let nombreAnterior = String(antes.nombre || '').trim();

    // 1. Lista de Conductores: quien tenía la placa la suelta y el nuevo la toma.
    if (origen === 'vehiculo') {
      const anterior = this.conductorConPlaca(placaL, nombreL);
      // El que tenía la placa en Conductores es el que se veía en el Rutograma.
      if (anterior) nombreAnterior = String(anterior.nom || anterior.nombre || '').trim();
      if (anterior) {
        const i = this.S.conductores.indexOf(anterior);
        await this.guardarConductorValidado({ ...anterior, veh: '', placa: '', p: '' }, i, true);
      }
      const nuevo = (this.S.conductores || []).find((c: any) => DataService.mismoNombre(c.nom || c.nombre, nombreL));
      if (nuevo && !DataService.mismaPlaca(nuevo.veh || nuevo.placa, placaL)) {
        const i = this.S.conductores.indexOf(nuevo);
        await this.guardarConductorValidado({ ...nuevo, veh: placaL, placa: placaL, p: placaL }, i, true);
      }
    }

    // 2. Vehículos: el conductor principal de la placa es el nuevo, y la
    // placa que traía antes ese conductor queda sin conductor principal.
    // Se guarda SIEMPRE: la pantalla de Conductores ya cambió el vehículo en
    // memoria (sincronizarVehiculosJS) sin guardarlo en el servidor.
    if (origen === 'conductor') {
      const vehiculos = this.S.vehiculos || [];
      for (let i = 0; i < vehiculos.length; i++) {
        const v = vehiculos[i];
        if (DataService.mismaPlaca(v.p || v.placa, placaL)) {
          await this.guardarVehiculo({ ...v, cond: nombreL, conductor: nombreL }, i, true);
        } else if (antes.placaDelNuevo && DataService.mismaPlaca(v.p || v.placa, antes.placaDelNuevo)) {
          await this.guardarVehiculo({ ...v, cond: '', conductor: '' }, i, true);
        }
      }
    }

    // 3. Viajes: desde mañana el nuevo; los anteriores sin conductor
    // guardado quedan con el que los hizo (si no, se verían con el nuevo).
    const anteriorEsGenerico = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'].includes(nombreAnterior.toUpperCase());
    if (!anteriorEsGenerico && !DataService.mismoNombre(nombreAnterior, nombreL)) {
      await this.fijarConductorEnViajesAnteriores(placaL, nombreAnterior);
    }
    return this.actualizarConductorDesdeManana(placaL, nombreL);
  }

  /** Viajes de la placa ANTES de mañana (este mes y el anterior) que no
   *  tienen conductor guardado: se les guarda el que tenía la placa. */
  private async fijarConductorEnViajesAnteriores(placa: string, nombre: string): Promise<void> {
    const hoy = new Date();
    const mananaISO = this.fechaISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1));
    const desdeISO = this.fechaISO(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1));
    const genericos = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
    const viajes = (this.S.viajes || []).filter((vj: any) =>
      DataService.mismaPlaca(vj.p || vj.placa, placa) &&
      vj.fecha && vj.fecha >= desdeISO && vj.fecha < mananaISO &&
      genericos.includes(String(vj.cond || '').trim().toUpperCase())
    );
    for (const vj of viajes) {
      vj.cond = nombre;
      await this.guardarViaje({ ...vj });
    }
  }

  private fechaISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // Los viajes que salen desde MAÑANA (fecha real del calendario, no el mes
  // que se esté viendo) toman el conductor nuevo. Los de hoy y los pasados
  // quedan con quien los hizo. No se tocan los que tienen un conductor de
  // respaldo puesto a propósito ese día (condTemporal), los cancelados, ni
  // los que ya tienen ese mismo nombre.
  public async actualizarConductorDesdeManana(placa: string, nuevoConductor: string): Promise<number> {
    const placaLimpia = String(placa || '').toUpperCase().trim();
    if (!placaLimpia || !this.S?.viajes) return 0;

    const manana = new Date();
    manana.setHours(0, 0, 0, 0);
    manana.setDate(manana.getDate() + 1);
    const mananaISO = `${manana.getFullYear()}-${String(manana.getMonth() + 1).padStart(2, '0')}-${String(manana.getDate()).padStart(2, '0')}`;
    const mesesTexto = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const afectados = this.S.viajes.filter((vj: any) => {
      if (!DataService.mismaPlaca(vj.p || vj.placa, placaLimpia)) return false;
      if (vj.estado === 'Cancelado') return false;
      if (DataService.mismoNombre(vj.cond, nuevoConductor)) return false;
      if (vj.condTemporal && String(vj.condTemporal).trim() === String(vj.cond || '').trim() && String(vj.condTemporal).trim() !== '') {
        return false;
      }
      if (vj.fecha) return vj.fecha >= mananaISO;

      // Viajes viejos sin fecha: se arma con mes/año/día del viaje.
      const idxMes = mesesTexto.indexOf(vj.mes);
      const anioViaje = Number(vj.anio);
      if (idxMes === -1 || isNaN(anioViaje)) return false;
      const d = new Date(anioViaje, idxMes, Number(vj.dia ?? vj.salida) || 1);
      return d.getTime() >= manana.getTime();
    });

    for (const vj of afectados) {
      vj.cond = nuevoConductor;
      await this.guardarViaje({ ...vj });
    }
    if (afectados.length) this.dataChanged.next();
    return afectados.length;
  }

  // ============================================================
  // CHOQUES DE EDICIÓN DE VIAJES (dos personas editando lo mismo)
  // ============================================================
  // Solo el modal de edición del Rutograma pide protección
  // (opciones.protegerDeChoques): manda la versión del viaje sobre la que
  // se basó la edición, y si el servidor ya tiene otra más nueva, en vez de
  // pisar el cambio de la otra persona se le pregunta a quien edita. Los
  // guardados rápidos/automáticos (mover, reprogramar, deshacer...) siguen
  // como siempre. Los hechos sin conexión también quedan protegidos: llevan
  // la versión base y se comparan al reenviarse (ver procesarColaPendiente).
  // Genérico — lo usan guardarViaje/guardarVehiculo/guardarRuta/
  // guardarConductorValidado por igual: un solo aviso, con "tipo" para
  // que el modal en app.html arme la frase con el artículo/sustantivo
  // correcto ("Este vehículo...", "Esta ruta...").
  // Primer nombre de cada cuenta (GET /api/usuarios/nombres), para mostrar
  // "Carlos" en vez de "carlos.bocanegra@makand.com". Se pide una vez,
  // la primera vez que hace falta; mientras llega se muestra el correo.
  private _nombres = signal<Record<string, string>>({});
  private pidiendoNombres = false;
  private nombresPedidosEn = 0;

  public nombreDe(email: any): string {
    const e = String(email || '').trim().toLowerCase();
    if (!e) return '';
    const nombre = this._nombres()[e];
    if (!nombre && !this.pidiendoNombres && Date.now() - this.nombresPedidosEn > 60000) this.cargarNombres();
    return nombre || e;
  }

  private async cargarNombres(): Promise<void> {
    this.pidiendoNombres = true;
    this.nombresPedidosEn = Date.now();
    try {
      const r: any = await firstValueFrom(this.http.get(`${this.API_URL}/usuarios/nombres`, this.headersAuditoria()));
      if (r?.ok) this._nombres.set(r.nombres || {});
    } catch { /* sin nombres: se sigue mostrando el correo */ }
    this.pidiendoNombres = false;
  }

  private _conflictoEdicion = signal<any>(null);
  public get conflictoEdicion(): any { return this._conflictoEdicion(); }

  /** Se llena cuando un choque se resolvió DESCARTANDO lo propio; quien
   *  llamó a guardar*() lo usa para recargar su pantalla con la versión
   *  actual en vez de dejar abierto un formulario con datos descartados. */
  public ultimoChoqueDescartado: { tipo: string; clave: string } | null = null;

  // Choque de agenda (ver backend/revision-viajes.js): el mismo vehículo
  // o conductor ya tiene otro viaje esos días. Se pregunta en app.html.
  private _choqueAgenda = signal<{ choques: string[]; resolver: (seguir: boolean) => void } | null>(null);
  public get choqueAgenda() { return this._choqueAgenda(); }

  public resolverChoqueAgenda(seguir: boolean): void {
    const c = this._choqueAgenda();
    this._choqueAgenda.set(null);
    if (c) c.resolver(seguir);
  }

  // ============================================================
  // SEMANA CERRADA (backend/semana-bloqueada.js): cambiar el plan de una
  // semana que el jefe cerró pide un motivo. Se pregunta en app.html. El
  // motivo se recuerda 20 segundos: un mismo cambio puede mover varios
  // viajes seguidos (reacomodar) y no se pregunta por cada uno.
  // ============================================================
  private _semanaCerrada = signal<{ semana: string; msg: string; resolver: (motivo: string | null) => void } | null>(null);
  public get semanaCerrada() { return this._semanaCerrada(); }
  private motivoReciente: { texto: string; hasta: number } | null = null;
  public readonly motivosSemana = ['El cliente canceló', 'El cliente pidió cambio', 'Vehículo varado o en taller', 'Falta de producto', 'Conductor ausente', 'Error en la programación'];

  public resolverSemanaCerrada(motivo: string | null): void {
    const s = this._semanaCerrada();
    this._semanaCerrada.set(null);
    const texto = String(motivo || '').trim();
    if (texto) this.motivoReciente = { texto, hasta: Date.now() + 20000 };
    if (s) s.resolver(texto || null);
  }

  // Trae enseguida la lista "cambios después del cierre" (el servidor la
  // anota al guardar), sin esperar la sincronización de 20 segundos.
  private async trasCambioConMotivo(guardado: Promise<boolean>): Promise<boolean> {
    const ok = await guardado;
    if (ok) setTimeout(() => this.inicializarApp(true), 800);
    return ok;
  }

  private pedirMotivoSemana(error: any): Promise<string | null> {
    if (this.motivoReciente && Date.now() < this.motivoReciente.hasta) return Promise.resolve(this.motivoReciente.texto);
    this.resolverSemanaCerrada(null);
    return new Promise(resolver => this._semanaCerrada.set({ semana: error?.semana || '', msg: error?.msg || '', resolver }));
  }

  private preguntarChoqueAgenda(choques: string[]): Promise<boolean> {
    this.resolverChoqueAgenda(false);
    return new Promise(resolver => this._choqueAgenda.set({ choques, resolver }));
  }

  public resolverConflictoEdicion(decision: 'sobrescribir' | 'descartar'): void {
    const c = this._conflictoEdicion();
    this._conflictoEdicion.set(null);
    if (c) c.resolver(decision);
  }

  // Campos comparables por tipo de entidad — solo para armar el aviso de
  // choque (qué campo cambió, de qué valor a cuál); no afecta qué se guarda.
  private static readonly CAMPOS_CHOQUE_VIAJE = [
    { clave: 'estado', etiqueta: 'Estado' }, { clave: 'p', etiqueta: 'Placa' },
    { clave: 'ruta', etiqueta: 'Ruta' }, { clave: 'destino', etiqueta: 'Destino' },
    { clave: 'fecha', etiqueta: 'Fecha' }, { clave: 'salida', etiqueta: 'Día de salida' },
    { clave: 'retorno', etiqueta: 'Día de retorno' }, { clave: 'cajas', etiqueta: 'Cajas' },
    { clave: 'cond', etiqueta: 'Conductor' }, { clave: 'hora', etiqueta: 'Hora' },
    { clave: 'tr', etiqueta: 'Transportadora' }, { clave: 'cliente', etiqueta: 'Cliente' },
    { clave: 'cli2', etiqueta: '2do cliente' }, { clave: 'dest2', etiqueta: '2do destino' },
    { clave: 'prioridad', etiqueta: 'Prioridad' }, { clave: 'manifiesto', etiqueta: 'Manifiesto' },
    { clave: 'prod', etiqueta: 'Producto' }, { clave: 'peso', etiqueta: 'Peso' },
    { clave: 'volumen', etiqueta: 'Volumen' }, { clave: 'costo', etiqueta: 'Costo' },
    { clave: 'motivoCancelacion', etiqueta: 'Motivo de cancelación' }, { clave: 'obs', etiqueta: 'Observaciones' }
  ];
  // OJO: las claves son las que de verdad trae el objeto que arma
  // vehiculos.ts (vehiculoEstructurado) — t/cap/cond/tr/est, no los
  // nombres largos — porque ese es el "mio" que se compara. El objeto
  // "actual" que manda el servidor trae ambos alias, así que igual
  // encuentra el valor.
  private static readonly CAMPOS_CHOQUE_VEHICULO = [
    { clave: 'p', etiqueta: 'Placa' }, { clave: 't', etiqueta: 'Tipo' },
    { clave: 'cap', etiqueta: 'Capacidad (cajas)' }, { clave: 'cond', etiqueta: 'Conductor' },
    { clave: 'tr', etiqueta: 'Transportadora' }, { clave: 'est', etiqueta: 'Estado' },
    { clave: 'categoria', etiqueta: 'Categoría' }, { clave: 'soatVence', etiqueta: 'SOAT vence' },
    { clave: 'tecnoVence', etiqueta: 'Tecno vence' }, { clave: 'mantInicio', etiqueta: 'Mant. inicio' },
    { clave: 'mantFin', etiqueta: 'Mant. fin' }
  ];
  // OJO: son exactamente los campos que rutas.ts pone en "datosRuta"
  // (el formulario) — ese modal no toca las tarifas, así que no van
  // aquí (mostrarían como "borradas" sin que nadie las haya tocado).
  private static readonly CAMPOS_CHOQUE_RUTA = [
    { clave: 'cod', etiqueta: 'Código' }, { clave: 'dest', etiqueta: 'Destino' },
    { clave: 'dest2', etiqueta: '2do destino' },
    { clave: 'diasTrans', etiqueta: 'Días tránsito' }, { clave: 'diasDesc', etiqueta: 'Días descanso' },
    { clave: 'km', etiqueta: 'Km' }, { clave: 'tipo', etiqueta: 'Tipo' },
    { clave: 'cajasMin', etiqueta: 'Cajas mínimas' }, { clave: 'clientes', etiqueta: 'Clientes' },
    { clave: 'vigenteDesde', etiqueta: 'Vigente desde' }, { clave: 'activa', etiqueta: 'Activa' }
  ];
  private static readonly CAMPOS_CHOQUE_CONDUCTOR = [
    { clave: 'nom', etiqueta: 'Nombre' }, { clave: 'ced', etiqueta: 'Cédula' },
    { clave: 'tel', etiqueta: 'Teléfono' }, { clave: 'veh', etiqueta: 'Vehículo asignado' },
    { clave: 'est', etiqueta: 'Estado' }, { clave: 'licVence', etiqueta: 'Licencia vence' },
    { clave: 'obs', etiqueta: 'Observaciones' }
  ];

  private calcularDiferenciasChoque(
    campos: { clave: string; etiqueta: string }[],
    baseOriginal: any, baseVista: any, mio: any, actual: any
  ): { tuyas: any[]; suyas: any[] } {
    const valor = (v: any, clave: string): string => {
      const x = clave === 'p' ? (v?.p ?? v?.placa) : v?.[clave];
      return x === undefined || x === null ? '' : String(x).trim();
    };
    const dif = (a: any, b: any) => campos
      .map(c => ({ etiqueta: c.etiqueta, de: valor(a, c.clave), a: valor(b, c.clave) }))
      .filter(x => x.de !== x.a)
      .map(x => ({ etiqueta: x.etiqueta, de: x.de || '(vacío)', a: x.a || '(vacío)' }));

    // "Lo tuyo" se compara contra lo que TÚ veías al abrir el formulario
    // (ya con los valores de relleno que muestra la pantalla), y "lo suyo"
    // contra el registro tal como estaba guardado — así no aparecen como
    // cambios cosas que nadie tocó.
    return {
      tuyas: dif(baseVista || actual, mio),
      suyas: baseOriginal ? dif(baseOriginal, actual) : []
    };
  }

  /** Arma y muestra el aviso de choque — lo usan por igual guardarViaje,
   *  guardarVehiculo, guardarRuta y guardarConductorValidado. */
  private pedirDecisionConflictoGenerico(
    tipo: string, el: string, sustantivo: string, titulo: string,
    campos: { clave: string; etiqueta: string }[],
    mio: any, actual: any, bases: any
  ): Promise<'sobrescribir' | 'descartar'> {
    const { tuyas, suyas } = this.calcularDiferenciasChoque(campos, bases?.original, bases?.vista, mio, actual);
    const quien = this.nombreDe(actual?.editadoPor) || 'otra persona';
    const cuando = actual?.editadoEn
      ? `a las ${new Date(actual.editadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`
      : 'hace un momento';

    // Si por algún motivo ya había un aviso abierto, ese se cierra
    // descartando (nunca sobrescribiendo por accidente).
    this.resolverConflictoEdicion('descartar');

    return new Promise(resolver => {
      this._conflictoEdicion.set({ tipo, el, sustantivo, titulo, quien, cuando, tuyas, suyas, resolver });
    });
  }

  private pedirDecisionConflictoViaje(mio: any, actual: any, bases: any): Promise<'sobrescribir' | 'descartar'> {
    const titulo = `${actual?.ruta || mio?.ruta || 'sin ruta'} (placa ${actual?.p || actual?.placa || mio?.p || '?'})`;
    return this.pedirDecisionConflictoGenerico('viaje', 'Este', 'viaje', titulo, DataService.CAMPOS_CHOQUE_VIAJE, mio, actual, bases);
  }

  private async aplicarViajeActualDelServidor(actual: any): Promise<void> {
    if (!this.S.viajes) return;
    const idx = this.S.viajes.findIndex((v: any) => v.id === actual.id);
    if (idx !== -1) this.S.viajes[idx] = { ...actual };
    else this.S.viajes.push({ ...actual });
    await this.autoSave();
  }

  public async guardarViaje(
    viaje: any,
    sinRegistrar: boolean = false,
    opciones: { protegerDeChoques?: boolean; baseOriginal?: any; baseVista?: any; revisarChoquesAgenda?: boolean; motivoCambio?: string } = {}
  ): Promise<boolean> {
    this.ultimoChoqueDescartado = null;

    // Se captura el estado ANTES de aplicar el cambio — para poder
    // deshacerlo después. Si no existía (viaje nuevo), "antes" queda null.
    const existente = (this.S.viajes || []).find((v: any) => v.id === viaje.id);
    const antes = existente ? { ...existente } : null;
    const url = `${this.API_URL}/viajes`;

    // La versión solo se manda cuando se pidió protección; en el resto
    // de guardados se omite y el servidor guarda como siempre.
    const cuerpo: any = { ...viaje };
    if (!opciones.protegerDeChoques) delete cuerpo.version;
    // El aviso de choque de agenda solo se pide donde la persona asigna a
    // mano (editar o crear un viaje). Los movimientos de varios pasos
    // (arrastrar, intercambiar, deshacer) pasan por estados intermedios
    // que chocarían un momento: esos lo saltan.
    if (!opciones.revisarChoquesAgenda) cuerpo.confirmarChoque = true;
    // Semana cerrada: el motivo va solo en este envío (nunca queda guardado en el viaje).
    delete cuerpo.motivoCambio;
    if (opciones.motivoCambio) cuerpo.motivoCambio = opciones.motivoCambio;

    const aplicarLocalYRegistrar = async (guardado: any, mensajeExito: string, tipoToast: string) => {
      if (this.S.viajes) {
        const idx = this.S.viajes.findIndex((v: any) => v.id === guardado.id);
        if (idx !== -1) this.S.viajes[idx] = { ...guardado };
        else this.S.viajes.push({ ...guardado });
      }
      await this.autoSave();

      if (!sinRegistrar) {
        this.registrarUndo({
          tipo: 'viaje',
          clave: String(guardado.id),
          antes,
          despues: { ...guardado },
          descripcion: `Viaje ${guardado.ruta || guardado.codigo || 'sin ruta'} (placa ${guardado.p || guardado.placa || '?'})`
        });
      }
      this.ui.mostrarToast(mensajeExito, tipoToast);
    };

    try {
      const res: any = await firstValueFrom(this.http.post(url, cuerpo, this.headersAuditoria()));
      // El servidor devuelve la versión nueva (y quién/cuándo) — se anota
      // en la copia local para que la siguiente edición parta de ahí.
      const guardado = (res && res.version !== undefined)
        ? { ...viaje, version: res.version, editadoPor: res.editadoPor, editadoEn: res.editadoEn }
        : { ...viaje };
      await aplicarLocalYRegistrar(guardado, 'Viaje actualizado', 'ok');
      return true;
    } catch (e: any) {
      if (e?.status === 409 && e?.error?.conflicto && opciones.protegerDeChoques) {
        const actual = e.error.actual;
        const decision = await this.pedirDecisionConflictoViaje(viaje, actual, { original: opciones.baseOriginal, vista: opciones.baseVista });

        // Se aplica primero la versión actual del servidor: si se decide
        // sobrescribir, "antes" (para deshacer) pasa a ser lo que se está
        // pisando de verdad; si se decide descartar, así queda la pantalla.
        await this.aplicarViajeActualDelServidor(actual);

        if (decision === 'sobrescribir') {
          return this.guardarViaje({ ...viaje, version: actual.version }, sinRegistrar, opciones);
        }
        this.ultimoChoqueDescartado = { tipo: 'viaje', clave: String(viaje.id) };
        this.ui.mostrarToast(`Se descartó tu cambio: quedó la versión de ${this.nombreDe(actual.editadoPor) || 'la otra persona'}.`, 'ok');
        return false;
      }
      if (e?.status === 409 && e?.error?.codigo === 'semana_bloqueada') {
        const motivo = await this.pedirMotivoSemana(e.error);
        if (motivo) return this.trasCambioConMotivo(this.guardarViaje(viaje, sinRegistrar, { ...opciones, motivoCambio: motivo }));
        this.ui.mostrarToast('No se guardó: la semana está cerrada y hace falta el motivo del cambio.', 'info');
        return false;
      }
      if (e?.status === 409 && e?.error?.codigo === 'choque_agenda') {
        const seguir = await this.preguntarChoqueAgenda(e.error.choques || [e.error.msg]);
        if (seguir) return this.guardarViaje(viaje, sinRegistrar, { ...opciones, revisarChoquesAgenda: false });
        this.ui.mostrarToast('No se guardó el viaje: cambia el vehículo, el conductor, las fechas o la hora.', 'info');
        return false;
      }
      if (e?.status === 0) {
        // Sin conexión de verdad (el navegador no logró ni contactar al
        // servidor) — se guarda en este dispositivo y se encola para
        // reintentar solo cuando vuelva la conexión, en vez de perder
        // el cambio o solo mostrar un error. Se encola CON la versión
        // base, para que al reenviarse se detecte si otra persona lo
        // modificó mientras tanto.
        this.encolarCambioPendiente(url, { ...viaje, confirmarChoque: true }, `Viaje ${viaje.ruta || viaje.codigo || 'sin ruta'} (placa ${viaje.p || viaje.placa || '?'})`);
        await aplicarLocalYRegistrar({ ...viaje }, '<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return true;
      }
      console.error('Error guardando viaje en BD:', e);
      this.ui.mostrarErrorHttp(e, 'guardar el viaje');
      return false;
    }
  }

  public async eliminarViaje(id: any, sinRegistrar: boolean = false, motivoCambio: string = ''): Promise<boolean> {
    const existente = (this.S.viajes || []).find((v: any) => v.id === id);
    const antes = existente ? { ...existente } : null;
    const url = `${this.API_URL}/viajes/eliminar`;
    const body: any = motivoCambio ? { id, motivoCambio } : { id };

    const aplicarLocalYRegistrar = async (mensajeExito: string, tipoToast: string) => {
      if (this.S.viajes) {
        this.S.viajes = this.S.viajes.filter((v: any) => v.id !== id);
      }
      await this.autoSave();
      if (!sinRegistrar && antes) {
        this.registrarUndo({
          tipo: 'eliminar-viaje',
          clave: String(id),
          antes,
          despues: null,
          descripcion: `Eliminación de viaje ${antes.ruta || antes.codigo || 'sin ruta'} (placa ${antes.p || antes.placa || '?'})`
        });
      }
      this.ui.mostrarToast(mensajeExito, tipoToast);
    };

    try {
      await firstValueFrom(this.http.post(url, body, this.headersAuditoria()));
      await aplicarLocalYRegistrar('Viaje eliminado. Si fue un error, lo puedes recuperar en Más → Papelera durante 30 días.', 'ok');
      return true;
    } catch (e: any) {
      if (e?.status === 409 && e?.error?.codigo === 'semana_bloqueada') {
        const motivo = await this.pedirMotivoSemana(e.error);
        if (motivo) return this.trasCambioConMotivo(this.eliminarViaje(id, sinRegistrar, motivo));
        this.ui.mostrarToast('No se eliminó: la semana está cerrada y hace falta el motivo.', 'info');
        return false;
      }
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, body, `Eliminación de viaje ${antes?.ruta || antes?.codigo || 'sin ruta'}`);
        await aplicarLocalYRegistrar('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — eliminado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return true;
      }
      console.error('Error eliminando viaje en BD:', e);
      this.ui.mostrarErrorHttp(e, 'eliminar el viaje');
      return false;
    }
  }

  public async eliminarConductor(index: number, sinRegistrar: boolean = false): Promise<void> {
    const conductorEliminado = this.S.conductores[index];
    if (!conductorEliminado) return;

    // La confirmación ya la hace el componente que llama a esta función
    // (ver conductores.ts) — un servicio no debería abrir sus propias
    // ventanas, y antes esto preguntaba DOS VECES (una en el componente,
    // otra aquí con el confirm() nativo del navegador).
    const idConductor = conductorEliminado.id || conductorEliminado.cedula || conductorEliminado.cc;
    const url = `${this.API_URL}/conductores/eliminar`;
    const body = { id: idConductor };
    const nombreDesc = conductorEliminado.nom || conductorEliminado.nombre || 'sin nombre';

    try {
      const res: any = await firstValueFrom(this.http.post(url, body, this.headersAuditoria()));
      if (res && res.ok) {
        this.S.conductores.splice(index, 1);
        if (!sinRegistrar) {
          this.registrarUndo({
            tipo: 'eliminar-conductor',
            clave: String(conductorEliminado.ced || conductorEliminado.cedula || conductorEliminado.cc || ''),
            antes: { ...conductorEliminado },
            despues: null,
            descripcion: `Eliminación del conductor ${nombreDesc}`
          });
        }
        this.ui.mostrarToast('Conductor eliminado. Si fue un error, lo puedes recuperar en Más → Papelera durante 30 días.', 'ok');
        await this.autoSave();
      }
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, body, `Eliminación de conductor ${nombreDesc}`);
        this.S.conductores.splice(index, 1);
        await this.autoSave();
        this.ui.mostrarToast('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — eliminado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return;
      }
      console.error('Error eliminando conductor en BD:', e);
      this.ui.mostrarErrorHttp(e, 'eliminar el conductor');
    }
  }

  public async eliminarRuta(index: number, sinRegistrar: boolean = false): Promise<void> {
    const rutaEliminada = this.S.rutas[index];
    if (!rutaEliminada) return;

    // Mismo motivo que en eliminarConductor() — la confirmación debe
    // hacerla quien llame a esta función, no el servicio.
    const url = `${this.API_URL}/rutas/eliminar`;
    const body = { cod: rutaEliminada.cod };

    try {
      const res: any = await firstValueFrom(this.http.post(url, body, this.headersAuditoria()));
      if (res && res.ok) {
        this.S.rutas.splice(index, 1);
        if (!sinRegistrar) {
          this.registrarUndo({
            tipo: 'eliminar-ruta',
            clave: String(rutaEliminada.cod || rutaEliminada.codigo || ''),
            antes: JSON.parse(JSON.stringify(rutaEliminada)),
            despues: null,
            descripcion: `Eliminación de la ruta ${rutaEliminada.cod || 'sin código'}`
          });
        }
        this.ui.mostrarToast('Ruta eliminada. Si fue un error, la puedes recuperar en Más → Papelera durante 30 días.', 'ok');
        await this.autoSave();
      }
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, body, `Eliminación de ruta ${rutaEliminada.cod || 'sin código'}`);
        this.S.rutas.splice(index, 1);
        await this.autoSave();
        this.ui.mostrarToast('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — eliminado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return;
      }
      console.error('Error eliminando ruta en BD:', e);
      this.ui.mostrarErrorHttp(e, 'eliminar la ruta');
    }
  }

  // ============================================================
  // CONFIGURACIÓN COMPARTIDA — transportadoras, cupos de Configuración y
  // festivos. Antes vivían solo en el navegador de cada equipo (lo que se
  // cambiaba en otro computador nunca llegaba al principal). Ahora se
  // guardan en el servidor y llegan a todos con la sincronización.
  // ============================================================
  public static readonly CLAVES_CONFIG_COMPARTIDA = ['transportadoras', 'cuposExt', 'festivos', 'reglasAsignacion', 'picoPlaca', 'anuncios', 'comparendos', 'quejas', 'ubicaciones'];

  public async guardarConfigCompartida(clave: string): Promise<void> {
    const url = `${this.API_URL}/configuracion/compartida`;
    const body = { clave, valor: this.S[clave] || [] };
    try {
      await firstValueFrom(this.http.post(url, body, this.headersAuditoria()));
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, body, `Configuración: ${clave}`);
        return;
      }
      console.error(`Error guardando ${clave} en el servidor:`, e);
      this.ui.mostrarErrorHttp(e, 'guardar la configuración');
    }
  }

  public guardarTransportadora(data: any): string | null {
    if (this.S.transportadoras.find((t: any) => t.clave === data.clave)) return 'Ya existe esa clave.';
    const antes = JSON.parse(JSON.stringify(this.S.transportadoras));
    this.S.transportadoras.push(data);
    this.registrarUndo({
      tipo: 'config', clave: 'transportadoras', antes,
      despues: JSON.parse(JSON.stringify(this.S.transportadoras)),
      descripcion: `Nueva transportadora ${data.nombre || data.clave}`
    });
    this.autoSave();
    this.guardarConfigCompartida('transportadoras');
    return null;
  }

  public diaSem(dia: number, mes: number, anio: number): string {
    const fecha = new Date(anio, mes, dia);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return dias[fecha.getDay()];
  }

  public cargarEstadoLocal(): boolean {
    const data = this.storage.cargarEstado();
    if (!data) return false;
    Object.assign(this.S, data);
    return true;
  }

  public getDIA(): number {
    return (this.S.mes === this._HOY_REAL.getMonth() && this.S.anio === this._HOY_REAL.getFullYear()) ? this._HOY_REAL.getDate() : 1;
  }

  public async novedad(tipo: string, titulo: string, desc: string): Promise<void> {
    const nuevaNovedad = {
      id: Date.now(),
      tipo,
      titulo,
      desc,
      fecha: new Date().toLocaleString('es-CO'),
      resuelta: false
    };
    const url = `${this.API_URL}/novedades`;

    try {
      await firstValueFrom(this.http.post(url, nuevaNovedad, this.headersAuditoria()));
      if (!this.S.novedades) this.S.novedades = [];
      this.S.novedades.push(nuevaNovedad);
      this.registrarUndo({
        tipo: 'novedad', clave: String(nuevaNovedad.id), antes: null,
        despues: { ...nuevaNovedad }, descripcion: `Novedad "${titulo}"`
      });
      console.log('Novedad respaldada en BD.');
      await this.autoSave();
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, nuevaNovedad, `Novedad: ${titulo}`);
        if (!this.S.novedades) this.S.novedades = [];
        this.S.novedades.push(nuevaNovedad);
        await this.autoSave();
        this.ui.mostrarToast('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardada en este dispositivo, se sincronizará sola cuando vuelva la conexión.', 'err');
        return;
      }
      console.error('Error guardando novedad en BD:', e);
      this.ui.mostrarErrorHttp(e, 'guardar la novedad');
    }
  }

  /** Marca una novedad como resuelta, en el backend y en la memoria local. */
  public async resolverNovedad(id: any): Promise<void> {
    const url = `${this.API_URL}/novedades/resolver`;
    const body = { id };

    try {
      await firstValueFrom(this.http.post(url, body, this.headersAuditoria()));
      const nov = (this.S.novedades || []).find((n: any) => n.id === id);
      if (nov) nov.resuelta = true;
      this.registrarUndo({
        tipo: 'novedad-resuelta', clave: String(id), antes: { id }, despues: { id },
        descripcion: `Novedad resuelta "${nov?.titulo || ''}"`
      });
      await this.autoSave();
      this.ui.mostrarToast('Novedad marcada como resuelta', 'ok');
    } catch (e: any) {
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, body, 'Marcar novedad como resuelta');
        const nov = (this.S.novedades || []).find((n: any) => n.id === id);
        if (nov) nov.resuelta = true;
        await this.autoSave();
        this.ui.mostrarToast('<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return;
      }
      console.error('Error marcando novedad como resuelta:', e);
      this.ui.mostrarErrorHttp(e, 'actualizar la novedad');
    }
  }

  public tarifa(vj: any): number {
    const r = this.S.rutas.find((x: any) => x.cod === vj.ruta);
    if (!r) return 0;

    const tr = String(vj.tr || '').toLowerCase();
    if (tr === 'arsi' || tr === 'arsitrans') return Number(r.tarifaArsitrans ?? r.tarifaMakand ?? 0);
    if (tr === 'polar') return Number(r.tarifaPolar ?? r.tarifaArsitrans ?? r.tarifaMakand ?? 0);
    return Number(r.tarifaMakand ?? 0); // Makand (flota propia) por defecto
  }

  public tNom(c: string): string {
    const t = this.S.transportadoras.find((x: any) => x.clave === c);
    return t ? t.nombre.split(' ')[0] : c;
  }

  public infoConductor(v: any): any { 
    return this.S.conductores.find((c: any) => c.veh === v.p) || null; 
  }
  
  public syncFechas(): void { 
    this.ui.syncFechas(); 
  }

  public async motorReasignar(nv: any, confirmarChoque = false, motivoCambio = ''): Promise<{ ok: boolean, msg: string }> {
    const r = this.S.rutas.find((x: any) => x.cod === nv.ruta);
    if (!r) return { ok: false, msg: 'Ruta no encontrada' };

    try {
      const cuerpo: any = { ...nv };
      if (confirmarChoque) cuerpo.confirmarChoque = true;
      if (motivoCambio) cuerpo.motivoCambio = motivoCambio;
      await firstValueFrom(this.http.post(`${this.API_URL}/viajes`, cuerpo, this.headersAuditoria()));

      // Antes esto no pasaba: se guardaba en el backend pero la memoria
      // local (S.viajes) no se enteraba, así que no se veía reflejado en
      // el Rutograma/Dashboard hasta recargar la página.
      if (!this.S.viajes) this.S.viajes = [];
      this.S.viajes.push(nv);
      await this.autoSave();

      this.ui.mostrarToast('<i class="bi bi-check-circle-fill"></i> Viaje guardado en BD', 'ok');
      return { ok: true, msg: 'Asignado' };
    } catch (err: any) {
      // Choque de agenda (backend/revision-viajes.js). Que el MISMO
      // vehículo ya tenga un viaje esos días es justo lo que el Viaje
      // Extra resuelve: guarda el nuevo y corre los siguientes de esa placa
      // (ej. sale el 6 y vuelve el 6, extra el 7 que se cruza con el del
      // 8: el del 8 se corre). Antes este aviso lo frenaba y "no dejaba"
      // poner el extra. Solo se pregunta por lo demás (conductor ocupado,
      // pico y placa, reglas de la oficina), que correr viajes no arregla.
      if (err?.status === 409 && err?.error?.codigo === 'semana_bloqueada' && !motivoCambio) {
        const motivo = await this.pedirMotivoSemana(err.error);
        if (motivo) { const r = await this.motorReasignar(nv, confirmarChoque, motivo); if (r.ok) this.trasCambioConMotivo(Promise.resolve(true)); return r; }
        return { ok: false, msg: 'La semana está cerrada y hace falta el motivo del cambio.' };
      }
      if (!confirmarChoque && err?.status === 409 && err?.error?.codigo === 'choque_agenda') {
        const delVehiculo: string[] = err.error.choquesVehiculo || [];
        const otros = (err.error.choques || []).filter((c: string) => !delVehiculo.includes(c));
        const seguir = !otros.length || await this.preguntarChoqueAgenda(otros);
        if (seguir) return this.motorReasignar(nv, true, motivoCambio);
        return { ok: false, msg: 'No se guardó el viaje extra: cambia el vehículo, el conductor, la fecha o la hora.' };
      }
      console.error('No se pudo guardar el viaje en la BD:', err);
      // Se pasa el motivo real (por ejemplo, "está en mantenimiento...")
      // en vez de un "Error de servidor" genérico.
      return { ok: false, msg: this.ui.mensajeErrorHttp(err, 'guardar el viaje') };
    }
  }

  public async guardarRuta(
    nuevaRuta: any,
    codOriginal?: string,
    sinRegistrar: boolean = false,
    opciones: { protegerDeChoques?: boolean; baseOriginal?: any; baseVista?: any } = {}
  ): Promise<boolean> {
    try {
      // Esta validación ANTES vivía DESPUÉS de mandar el guardado al
      // servidor — para una ruta nueva, si ya existía una con ese mismo
      // código, el servidor YA había guardado el duplicado en el Excel
      // antes de que este código se enterara y lanzara el error. Ahora
      // se valida primero, sin gastar ni un guardado real si de entrada
      // no tiene sentido.
      if (!codOriginal && this.S.rutas.find((r: any) => r.cod === nuevaRuta.cod)) {
        this.ui.mostrarToast('Ya existe una ruta con ese código.', 'err');
        return false;
      }

      // Se captura el estado ANTES de aplicar el cambio — para poder
      // deshacerlo después. Si no existía (ruta nueva), "antes" queda null.
      const existente = codOriginal ? this.S.rutas.find((r: any) => r.cod === codOriginal) : null;
      const antes = existente ? { ...existente } : null;

      // Le mandamos "codOriginal" al servidor solo si de verdad cambió el
      // código — así sabe que es un renombre (actualizar la ruta que ya
      // existía) y no una ruta nueva sin relación con la anterior.
      const payload: any = (codOriginal && codOriginal !== nuevaRuta.cod)
        ? { ...nuevaRuta, codOriginal }
        : { ...nuevaRuta };
      if (!opciones.protegerDeChoques) delete payload.version;
      const url = `${this.API_URL}/rutas`;

      const aplicarLocalYRegistrar = async (guardada: any, mensajeExito: string, tipoToast: string) => {
        if (codOriginal) {
          const i = this.S.rutas.findIndex((r: any) => r.cod === codOriginal);
          if (i >= 0) this.S.rutas[i] = { ...guardada };

          if (codOriginal !== guardada.cod) {
            (this.S.viajes || []).forEach((v: any) => {
              if (String(v.ruta || v.codigo || '').toUpperCase().trim() === String(codOriginal).toUpperCase().trim()) {
                v.ruta = guardada.cod;
                v.codigo = guardada.cod;
              }
            });
          }
        } else {
          this.S.rutas.push({ ...guardada });
        }

        if (!sinRegistrar) {
          this.registrarUndo({
            tipo: 'ruta',
            clave: String(codOriginal || guardada.cod),
            antes,
            despues: { ...guardada },
            descripcion: `Ruta ${guardada.cod || guardada.codigo || 'sin código'}`
          });
        }
        await this.autoSave();
        this.ui.mostrarToast(mensajeExito, tipoToast);
      };

      try {
        const res: any = await firstValueFrom(this.http.post(url, payload, this.headersAuditoria()));
        const guardada = (res && res.version !== undefined)
          ? { ...nuevaRuta, version: res.version, editadoPor: res.editadoPor, editadoEn: res.editadoEn }
          : { ...nuevaRuta };
        await aplicarLocalYRegistrar(guardada, 'Ruta sincronizada en BD', 'ok');
        return true;
      } catch (e: any) {
        if (e?.status === 409 && e?.error?.conflicto && opciones.protegerDeChoques) {
          const actual = e.error.actual;
          const decision = await this.pedirDecisionConflictoGenerico(
            'ruta', 'Esta', 'ruta', String(actual?.cod || nuevaRuta.cod || '?'),
            DataService.CAMPOS_CHOQUE_RUTA, nuevaRuta, actual,
            { original: opciones.baseOriginal, vista: opciones.baseVista }
          );

          const i = this.S.rutas.findIndex((r: any) => r.cod === (codOriginal || nuevaRuta.cod));
          if (i >= 0) this.S.rutas[i] = { ...actual }; else this.S.rutas.push({ ...actual });
          await this.autoSave();

          if (decision === 'sobrescribir') {
            return this.guardarRuta({ ...nuevaRuta, version: actual.version }, codOriginal, sinRegistrar, opciones);
          }
          this.ultimoChoqueDescartado = { tipo: 'ruta', clave: String(actual.cod) };
          this.ui.mostrarToast(`Se descartó tu cambio: quedó la versión de ${this.nombreDe(actual.editadoPor) || 'la otra persona'}.`, 'ok');
          return false;
        }
        if (e?.status === 0) {
          this.encolarCambioPendiente(url, payload, `Ruta ${nuevaRuta.cod || nuevaRuta.codigo || 'sin código'}`);
          await aplicarLocalYRegistrar({ ...nuevaRuta }, '<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
          return true;
        }
        console.error('Error guardando ruta en BD:', e);
        // Antes esto solo se registraba en la consola — quien llamaba a
        // guardarRuta() nunca se enteraba de que había fallado, y seguía
        // como si el guardado hubiera funcionado (cerraba el formulario,
        // no avisaba nada). Ahora devuelve false para que sí se sepa, y
        // usa el helper compartido para decir la causa real.
        this.ui.mostrarErrorHttp(e, 'guardar la ruta');
        return false;
      }
    } catch (e: any) {
      console.error('Error inesperado guardando ruta:', e);
      this.ui.mostrarErrorHttp(e, 'guardar la ruta');
      return false;
    }
  }

  public async guardarConductorValidado(
    dataConductor: any,
    index: number,
    sinRegistrar: boolean = false,
    opciones: { protegerDeChoques?: boolean; baseOriginal?: any; baseVista?: any } = {}
  ): Promise<string | null> {
    const newVeh = dataConductor.veh;
    if (newVeh) {
      const conflictIdx = this.S.conductores.findIndex((cn: any, i: number) => cn.veh === newVeh && i !== index);
      if (conflictIdx >= 0) return 'El vehículo ya está asignado.';
    }

    // Se captura el estado ANTES de aplicar el cambio — para poder
    // deshacerlo después. Si es un conductor nuevo, "antes" queda null.
    const antes = (index >= 0 && this.S.conductores?.[index]) ? { ...this.S.conductores[index] } : null;

    const url = `${this.API_URL}/conductores`;
    const cuerpo: any = { ...dataConductor };
    // "esNuevo" solo viaja al servidor (rechaza la cédula repetida); no se guarda.
    delete dataConductor.esNuevo;
    if (!opciones.protegerDeChoques) delete cuerpo.version;

    const aplicarLocalYRegistrar = async (guardado: any, mensajeExito: string, tipoToast: string) => {
      if (index >= 0 && index < this.S.conductores.length) {
        this.S.conductores[index] = { ...guardado };
      } else {
        this.S.conductores.push({ ...guardado });
      }
      if (!sinRegistrar) {
        this.registrarUndo({
          tipo: 'conductor',
          clave: String(guardado.ced || guardado.cedula || guardado.cc || ''),
          antes,
          despues: { ...guardado },
          descripcion: `Conductor ${guardado.nom || guardado.nombre || 'sin nombre'}`
        });
      }
      await this.autoSave();
      this.ui.mostrarToast(mensajeExito, tipoToast);
    };

    try {
      const res: any = await firstValueFrom(this.http.post(url, cuerpo, this.headersAuditoria()));
      const guardado = (res && res.version !== undefined)
        ? { ...dataConductor, version: res.version, editadoPor: res.editadoPor, editadoEn: res.editadoEn }
        : { ...dataConductor };
      await aplicarLocalYRegistrar(guardado, 'Conductor guardado en BD', 'ok');
      return null;
    } catch (e: any) {
      if (e?.status === 409 && e?.error?.conflicto && opciones.protegerDeChoques) {
        const actual = e.error.actual;
        const decision = await this.pedirDecisionConflictoGenerico(
          'conductor', 'Este', 'conductor', String(actual?.nom || dataConductor.nom || '?'),
          DataService.CAMPOS_CHOQUE_CONDUCTOR, dataConductor, actual,
          { original: opciones.baseOriginal, vista: opciones.baseVista }
        );

        const cedulaActual = String(actual.ced || actual.cedula || actual.cc || '');
        const i = this.S.conductores.findIndex((c: any) => String(c.ced || c.cedula || c.cc || '') === cedulaActual);
        if (i >= 0) this.S.conductores[i] = { ...actual }; else this.S.conductores.push({ ...actual });
        await this.autoSave();

        if (decision === 'sobrescribir') {
          return this.guardarConductorValidado({ ...dataConductor, version: actual.version }, index, sinRegistrar, opciones);
        }
        this.ultimoChoqueDescartado = { tipo: 'conductor', clave: cedulaActual };
        this.ui.mostrarToast(`Se descartó tu cambio: quedó la versión de ${this.nombreDe(actual.editadoPor) || 'la otra persona'}.`, 'ok');
        return null;
      }
      if (e?.status === 0) {
        this.encolarCambioPendiente(url, cuerpo, `Conductor ${dataConductor.nom || dataConductor.nombre || 'sin nombre'}`);
        await aplicarLocalYRegistrar({ ...dataConductor }, '<i class="bi bi-cloud-arrow-up-fill"></i> Sin conexión — guardado en este dispositivo, se sincronizará solo cuando vuelva la conexión.', 'err');
        return null;
      }
      console.error('Error guardando conductor en BD:', e);
      return this.ui.mensajeErrorHttp(e, 'guardar el conductor');
    }
  }

  /** Viajes del mes que se está viendo en la app (S.mes / S.anio). */
  public viajesDelMesVisible(): any[] {
    const prefijo = `${this.S.anio}-${String(this.S.mes + 1).padStart(2, '0')}`;
    return (this.S.viajes || []).filter((v: any) => v.fecha
      ? String(v.fecha).startsWith(prefijo)
      : Number(v.mes) === this.S.mes && Number(v.anio) === this.S.anio);
  }

  /** Trae del servidor los meses cerrados (pantalla Histórico). */
  public async cargarHistorico(): Promise<void> {
    try {
      const res: any = await firstValueFrom(this.http.get(`${this.API_URL}/historico?_=${Date.now()}`));
      if (res?.ok) {
        this.S.historial = res.meses || [];
        this.dataChanged.next();
      }
    } catch (e) {
      console.error('Error trayendo el histórico:', e);
    }
  }

  /**
   * 📦 CERRAR MES — guarda en el servidor una foto del mes que se está
   * viendo (totales, por transportadora y sus viajes). No borra viajes.
   * Cerrar otra vez el mismo mes reemplaza la foto anterior.
   */
  public async cerrarMesActual(): Promise<{ ok: boolean; msg: string }> {
    const viajes = this.viajesDelMesVisible().filter((v: any) => v.estado !== 'Cancelado');
    if (!viajes.length) return { ok: false, msg: 'No hay viajes en este mes para cerrar.' };

    // Costo de los viajes que no lo traen calculado (ej. los de la matriz automática).
    const conCosto = viajes.map((v: any) => ({ ...v, costo: v.costo || this.tarifa(v) || 0 }));
    const suma = (campo: string) => conCosto.reduce((acc: number, v: any) => acc + (Number(v[campo]) || 0), 0);

    const porTr = conCosto.reduce((acc: any, v: any) => {
      const tr = v.tr || 'sin transportadora';
      if (!acc[tr]) acc[tr] = { n: 0, cajas: 0, kg: 0, costo: 0 };
      acc[tr].n += 1;
      acc[tr].cajas += (v.cajas || 0);
      acc[tr].kg += (v.pesoKg || 0);
      acc[tr].costo += (v.costo || 0);
      return acc;
    }, {});

    const enEsteMes = (fecha: any) => {
      const d = new Date(fecha);
      return !isNaN(d.getTime()) && d.getMonth() === this.S.mes && d.getFullYear() === this.S.anio;
    };

    const mesCerrado = {
      fecha: new Date().toLocaleDateString(),
      totalViajes: conCosto.length,
      totalCajas: suma('cajas'),
      totalKg: suma('pesoKg'),
      totalM3: suma('volM3'),
      costo: suma('costo'),
      viajesExtra: conCosto.filter((v: any) => v.tipo === 'extra').length,
      porTr,
      viajes: conCosto,
      novedades: (this.S.novedades || []).filter((n: any) => enEsteMes(n.fecha)),
      mes: this.S.mes,
      anio: this.S.anio
    };

    try {
      const res: any = await firstValueFrom(this.http.post(`${this.API_URL}/cerrar-mes`, mesCerrado, this.headersAuditoria()));
      if (res?.pendiente) return { ok: true, msg: '' }; // lo avisa el aviso de "enviado para aprobación"
      await this.cargarHistorico();
      return {
        ok: true,
        msg: res?.reemplazo
          ? `${res.label}: se actualizó el cierre que ya existía.`
          : `${res?.label || 'Mes'} guardado en el histórico.`
      };
    } catch (e: any) {
      console.error('Error cerrando el mes:', e);
      return { ok: false, msg: e?.error?.msg || (e?.status === 0 ? 'Sin conexión con el servidor. Inténtalo cuando vuelva.' : 'No se pudo cerrar el mes.') };
    }
  }

  /** 🗑️ LIMPIAR HISTÓRICO (el servidor deja un respaldo antes de borrar). */
  public async limpiarHistorial(): Promise<{ ok: boolean; msg: string }> {
    try {
      const res: any = await firstValueFrom(this.http.post(`${this.API_URL}/limpiar-historial`, {}, this.headersAuditoria()));
      if (res?.pendiente) return { ok: true, msg: '' };
      if (res?.respaldoAntes) {
        this.registrarCambio({
          tipo: 'respaldo', clave: res.respaldoAntes, antes: res.respaldoAntes, despues: null,
          descripcion: 'Limpiar el histórico'
        });
      }
      await this.cargarHistorico();
      return { ok: true, msg: `Histórico borrado (${res?.borrados || 0} meses). Se puede deshacer.` };
    } catch (e: any) {
      console.error('Error limpiando histórico:', e);
      return { ok: false, msg: e?.error?.msg || 'No se pudo limpiar el histórico.' };
    }
  }

  /**
   * Descarga un CSV (se abre bien en Excel) con los viajes del día de hoy
   * (o del día 1 si estás viendo un mes distinto al actual — mismo
   * criterio que getDIA()).
   */
  public descargarDiario(): void {
    if (typeof document === 'undefined') return; // por si corre fuera del navegador

    const hoy = this.getDIA();
    const viajesHoy = (this.S.viajes || []).filter((v: any) => {
      if (v.fecha) {
        const f = new Date(v.fecha + 'T00:00:00');
        return f.getDate() === hoy && f.getMonth() === this.S.mes && f.getFullYear() === this.S.anio;
      }
      return Number(v.dia) === hoy;
    });

    if (viajesHoy.length === 0) {
      this.ui.mostrarToast('No hay viajes registrados para hoy', 'err');
      return;
    }

    const encabezados = ['Placa', 'Ruta', 'Destino', 'Cliente', 'Transportadora', 'Estado', 'Cajas', 'Fecha', 'Hora'];
    const filas = viajesHoy.map((v: any) => [
      v.placa || v.p || '',
      v.ruta || '',
      v.destino || '',
      v.cli || v.cliente || '',
      v.tr || '',
      v.estado || '',
      v.cajas || '',
      v.fecha || '',
      v.hora || v.horaDespacho || ''
    ]);

    const filasCsv = [encabezados, ...filas]
      .map(fila => fila.map((campo: any) => `"${String(campo).replace(/"/g, '""')}"`).join(','))
      .join('\r\n');

    // El BOM (\uFEFF) evita que Excel muestre mal las tildes/ñ
    const blob = new Blob(['\uFEFF' + filasCsv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    const fechaArchivo = `${this.S.anio}-${String(this.S.mes + 1).padStart(2, '0')}-${String(hoy).padStart(2, '0')}`;
    enlace.href = url;
    enlace.download = `diario-${fechaArchivo}.csv`;
    document.body.appendChild(enlace);
    enlace.click();
    document.body.removeChild(enlace);
    URL.revokeObjectURL(url);

    this.ui.mostrarToast(`Diario descargado (${viajesHoy.length} viajes)`, 'ok');
  }

  public guardarLocalmente(): void {
    localStorage.setItem('cached_rutograma', JSON.stringify(this.S));
  }

  // BUG REAL encontrado y corregido: esto borraba "cached_rutograma",
  // una llave que en realidad NUNCA se escribe en ningún lado
  // (guardarLocalmente(), la única función que la llenaría, no la
  // llama nadie) — así que el botón "Borrar caché" no borraba nada de
  // verdad. La llave que sí se usa activamente para el caché local es
  // "rutograma_data" (la misma que maneja LocalStorageService).
  public borrarCache(): void {
    localStorage.removeItem('rutograma_data');
    localStorage.removeItem('cached_rutograma'); // por si acaso, aunque hoy no se use
    location.reload();
  }
}