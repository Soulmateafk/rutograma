import { Component, OnInit, OnDestroy, NgZone, ChangeDetectorRef, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { CommonModule } from '@angular/common'; // Necesario para el *ngFor
import { FormsModule } from '@angular/forms'; // Necesario para los [(ngModel)] de los filtros de auditoría
import { AccountService, CuentaUsuario } from '../../services/account.service';
import { UiService } from '../../services/ui.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule], // ¡Muy importante para poder usar *ngFor, *ngIf y ngModel!
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin implements OnInit, OnDestroy {
  // Admin: todo. Jefe: entra solo a mirar (cuentas y auditoría), no
  // aprueba cuentas ni cambia roles. El servidor aplica lo mismo.
  public auth = inject(AuthService);

  public readonly rolesDisponibles: Array<{ valor: 'editor' | 'lector' | 'jefe' | 'auxiliar'; nombre: string }> = [
    { valor: 'editor', nombre: 'Editor' },
    { valor: 'lector', nombre: 'Solo lectura' },
    { valor: 'jefe', nombre: 'Jefe' },
    { valor: 'auxiliar', nombre: 'Auxiliar' }
  ];

  public nombreRol(rol?: string): string {
    return this.rolesDisponibles.find(r => r.valor === (rol || 'editor'))?.nombre || 'Editor';
  }

  usuarios: CuentaUsuario[] = [];
  cargando: boolean = false;

  // --- Auditoría ---
  pestaniaActiva: 'cuentas' | 'auditoria' | 'dispositivos' = 'cuentas';
  eventos: any[] = [];
  cargandoAuditoria: boolean = false;

  // --- Dispositivos bloqueados (ver "Sacar" en Sesiones activas) ---
  dispositivosBloqueados: any[] = [];
  cargandoDispositivos: boolean = false;

  // --- Filtros de la pestaña Auditoría — se aplican sobre lo que YA se
  // cargó (los últimos 200 eventos), sin volver a pedirle nada al
  // servidor. Las listas de opciones se arman una sola vez al cargar
  // los eventos (ver cargarAuditoria), no en cada repintado.
  public filtroUsuario: string = '';
  public filtroAccion: string = '';
  public filtroFechaDesde: string = '';
  public filtroFechaHasta: string = '';
  public usuariosDisponibles: string[] = [];
  public accionesDisponibles: string[] = [];

  public get eventosFiltrados(): any[] {
    return this.eventos.filter(e => {
      if (this.filtroUsuario && (e.usuario || 'desconocido') !== this.filtroUsuario) return false;
      if (this.filtroAccion && e.ruta !== this.filtroAccion) return false;
      const fechaEvento = String(e.fecha || '').slice(0, 10); // "YYYY-MM-DD"
      if (this.filtroFechaDesde && fechaEvento < this.filtroFechaDesde) return false;
      if (this.filtroFechaHasta && fechaEvento > this.filtroFechaHasta) return false;
      return true;
    });
  }

  public get hayFiltrosAuditoriaActivos(): boolean {
    return !!(this.filtroUsuario || this.filtroAccion || this.filtroFechaDesde || this.filtroFechaHasta);
  }

  public limpiarFiltrosAuditoria(): void {
    this.filtroUsuario = '';
    this.filtroAccion = '';
    this.filtroFechaDesde = '';
    this.filtroFechaHasta = '';
  }

  // Ahora usamos AccountService (que habla con el backend compartido)
  // en vez de DataService (que tenía usuarios falsos en memoria).
  constructor(
    private account: AccountService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private ui: UiService,
    private ds: DataService
  ) {}

  private subCambios?: Subscription;

  // Modal de confirmación propio — reemplaza el confirm() nativo del
  // navegador. Mismo patrón ya usado en rutograma.ts/rutas.ts/
  // vehiculos.ts/navbar.ts/configuracion.ts/conductores.ts.
  public confirmDialogAbierto: boolean = false;
  public confirmDialogMensaje: string = '';
  public confirmDialogBtnAceptar: string = 'Aceptar';
  public confirmDialogBtnCancelar: string = 'Cancelar';
  private confirmDialogResolve: ((valor: boolean) => void) | null = null;

  private mostrarConfirmPersonalizado(mensaje: string, btnAceptar: string, btnCancelar: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.confirmDialogMensaje = mensaje;
      this.confirmDialogBtnAceptar = btnAceptar;
      this.confirmDialogBtnCancelar = btnCancelar;
      this.confirmDialogResolve = resolve;
      this.confirmDialogAbierto = true;
      this.zone.run(() => this.cdr.detectChanges());
    });
  }

  public confirmDialogElegir(valor: boolean): void {
    this.confirmDialogAbierto = false;
    const resolver = this.confirmDialogResolve;
    this.confirmDialogResolve = null;
    resolver?.(valor);
  }

  async ngOnInit() {
    this.cargarUsuarios();
    // Si se deshace/rehace un cambio de cuentas o dispositivos desde la
    // barra de arriba, se recargan las listas para verlo al instante.
    this.subCambios = this.ds.cambioRevertido.subscribe(tipo => {
      if (tipo === 'usuario-rol' || tipo === 'usuario-estado') this.cargarUsuarios();
      if (tipo === 'dispositivo-desbloqueado') this.cargarDispositivosBloqueados();
    });
  }

  ngOnDestroy() {
    this.subCambios?.unsubscribe();
  }

  cambiarPestania(p: 'cuentas' | 'auditoria' | 'dispositivos') {
    if (p === 'dispositivos' && !this.auth.isAdmin) return;
    this.pestaniaActiva = p;
    if (p === 'auditoria' && this.eventos.length === 0) {
      this.cargarAuditoria();
    }
    if (p === 'dispositivos') {
      this.cargarDispositivosBloqueados();
    }
  }

  async cargarDispositivosBloqueados() {
    this.cargandoDispositivos = true;
    try {
      this.dispositivosBloqueados = await this.account.listarDispositivosBloqueados();
    } catch (error) {
      console.error('Error al cargar dispositivos bloqueados:', error);
      this.dispositivosBloqueados = [];
    } finally {
      this.cargandoDispositivos = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  async desbloquear(d: any) {
    try {
      await this.account.desbloquearDispositivo(d.email, d.dispositivoId);
      this.ds.registrarCambio({
        tipo: 'dispositivo-desbloqueado', clave: `${d.email}|${d.dispositivoId}`,
        antes: { email: d.email, dispositivoId: d.dispositivoId, dispositivo: d.dispositivo, ip: d.ip },
        despues: null,
        descripcion: `Desbloqueo del dispositivo ${d.dispositivo || ''} de ${d.email}`
      });
      this.ui.mostrarToast(`Dispositivo de ${d.email} desbloqueado.`, 'ok');
      this.dispositivosBloqueados = this.dispositivosBloqueados.filter(x => x !== d);
      this.zone.run(() => this.cdr.detectChanges());
    } catch (error) {
      console.error('Error al desbloquear dispositivo:', error);
      this.ui.mostrarToast('No se pudo desbloquear el dispositivo.', 'err');
    }
  }

  async cargarAuditoria() {
    this.cargandoAuditoria = true;
    try {
      this.eventos = await this.account.listarAuditoria(200);

      // Opciones de los filtros — se arman UNA vez aquí (no en cada
      // repintado desde el HTML) a partir de lo que de verdad llegó.
      const usuariosSet = new Set<string>();
      const accionesSet = new Set<string>();
      this.eventos.forEach(e => {
        usuariosSet.add(e.usuario || 'desconocido');
        if (e.ruta) accionesSet.add(e.ruta);
      });
      this.usuariosDisponibles = Array.from(usuariosSet).sort();
      this.accionesDisponibles = Array.from(accionesSet).sort();
    } catch (error) {
      console.error("Error al cargar auditoría:", error);
      this.eventos = [];
    } finally {
      this.cargandoAuditoria = false;
      // La app es "zoneless" — cambiar esta variable dentro de un
      // callback async (la respuesta del servidor) NO repinta la
      // pantalla sola. Sin esto, "Cargando auditoría..." se quedaba
      // pegado para siempre, aunque el dato ya hubiera llegado bien.
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  /**
   * Traduce un registro crudo de auditoría (método + ruta + el cuerpo de
   * la petición, que el servidor YA guarda) a una frase legible de qué
   * cambió de verdad — en vez de solo mostrar "POST /api/viajes", que no
   * dice nada útil por sí solo. El servidor no manda nada nuevo para
   * esto — todo lo necesario (resumen) ya viaja en cada evento.
   */
  public descripcionEvento(e: any): string {
    const r = e?.resumen || {};
    // Aprobaciones de auxiliares: quién pidió, quién aprobó o rechazó.
    if (e?.ruta === '/api/aprobaciones/decidir') {
      const verbo = r.accion === 'APROBAR' ? 'Aprobó' : 'Rechazó';
      const quien = r.solicitante ? ` de ${r.solicitante}` : '';
      return `${verbo} el cambio${quien}: ${r.descripcion || 'sin descripción'}${r.motivo ? ` — motivo: "${r.motivo}"` : ''}`;
    }
    if (r.aprobacion === 'PENDIENTE') {
      return `Pidió aprobación: ${r.descripcion || this.descripcionBase(e)}`;
    }
    const base = this.descripcionBase(e);
    return r.aprobadoPor ? `${base} — aprobado por ${r.aprobadoPor}` : base;
  }

  private descripcionBase(e: any): string {
    const r = e?.resumen || {};
    const ruta = String(e?.ruta || '');

    switch (ruta) {
      case '/api/viajes': {
        const placa = r.p || r.placa || 'sin placa';
        const codigo = r.ruta || r.codigo || 'sin ruta';
        const destino = r.destino ? ` hacia ${r.destino}` : '';
        return `Guardó el viaje ${codigo}${destino} (placa ${placa})${r.estado ? ' — estado: ' + r.estado : ''}`;
      }
      case '/api/viajes/eliminar': {
        const placa = r.placa || r.p;
        const codigo = r.ruta || r.codigo;
        if (placa || codigo) {
          const destino = r.destino ? ` hacia ${r.destino}` : '';
          const fecha = r.fecha ? ` (${r.fecha})` : '';
          return `Eliminó el viaje ${codigo || 'sin ruta'}${destino}${placa ? ' — placa ' + placa : ''}${fecha}`;
        }
        // Eventos guardados ANTES de este cambio no tienen placa/ruta —
        // se quedan con el id, que es lo único que había en ese momento.
        return `Eliminó un viaje (id: ${r.id || 'desconocido'})`;
      }

      case '/api/rutas': {
        const codigo = r.cod || r.codigo || 'sin código';
        const destino = r.dest || r.destino ? ` — ${r.dest || r.destino}` : '';
        return r.codOriginal && r.codOriginal !== codigo
          ? `Renombró la ruta ${r.codOriginal} a ${codigo}${destino}`
          : `Guardó la ruta ${codigo}${destino}`;
      }
      case '/api/rutas/eliminar':
        return `Eliminó la ruta ${r.cod || 'sin código'}`;

      case '/api/vehiculos': {
        const placa = r.p || r.placa || 'sin placa';
        return `Guardó el vehículo ${placa}${r.est || r.estado ? ' — estado: ' + (r.est || r.estado) : ''}`;
      }
      case '/api/vehiculos/eliminar':
        return `Eliminó el vehículo ${r.p || r.placa || 'sin placa'}`;

      case '/api/conductores': {
        const nombre = r.nom || r.nombre || 'sin nombre';
        return `Guardó al conductor ${nombre}${r.veh || r.placa ? ' (placa ' + (r.veh || r.placa) + ')' : ''}`;
      }
      case '/api/conductores/eliminar': {
        const nombre = r.nombre || r.nom;
        return nombre
          ? `Eliminó al conductor ${nombre}${r.placa ? ' (placa ' + r.placa + ')' : ''}`
          : `Eliminó un conductor (id: ${r.id || r.ced || 'desconocido'})`;
      }

      case '/api/novedades':
        return `Reportó una novedad: "${r.titulo || 'sin título'}"`;
      case '/api/novedades/resolver':
        return r.titulo ? `Marcó como resuelta la novedad "${r.titulo}"` : `Marcó una novedad como resuelta`;

      case '/api/modo':
        return `Cambió al modo ${r.modo === 'pruebas' ? 'PRUEBA' : 'REAL'}`;

      case '/api/configuracion/generar-matriz':
        return `Generó la matriz de ${r.mes || ''} ${r.anio || ''}`.trim();

      case '/api/respaldos/restaurar':
        return `Restauró el respaldo "${r.nombre || 'desconocido'}"`;

      case '/api/auth/login':
        return `Inició sesión`;
      case '/api/auth/register':
        return `Solicitó una cuenta nueva (${r.nombre || r.email || ''})`;
      case '/api/auth/check':
        return `Verificó su cuenta al iniciar sesión`;
      case '/api/auth/decidir':
        return `${r.accion === 'APPROVED' ? 'Aprobó' : 'Rechazó'} la cuenta de ${r.email || 'desconocido'}`;
      case '/api/auth/rol':
        return `Cambió el rol de ${r.email || 'desconocido'} a "${r.rol || ''}"`;

      case '/api/cache/refrescar':
        return `Forzó una actualización de datos`;

      case '/api/auth/resetear-clave':
        return `Restableció la contraseña de ${r.email || 'una cuenta'}`;

      case '/api/vencimientos/enviar-ahora':
        return 'Envió el resumen de vencimientos por correo';

      default:
        // Cualquier endpoint nuevo que se agregue después y no esté en
        // esta lista todavía sigue mostrando algo, en vez de nada.
        return `${e?.metodo || ''} ${ruta}`;
    }
  }

  async cargarUsuarios() {
    this.cargando = true;
    try {
      // Trae TODAS las cuentas reales desde el servidor (con su estado).
      this.usuarios = await this.account.listarTodas();
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
      this.usuarios = [];
    } finally {
      this.cargando = false;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }

  async aprobarUsuario(usuario: CuentaUsuario) {
    const confirmado = await this.mostrarConfirmPersonalizado(
      `¿Estás seguro de aprobar a ${usuario.email}?`,
      'Aprobar',
      'Cancelar'
    );
    if (confirmado) {
      try {
        const estadoAntes = { estado: usuario.estado, motivo: (usuario as any).motivoRechazo || '' };
        await this.account.aprobar(usuario.email);
        this.ds.registrarCambio({
          tipo: 'usuario-estado', clave: usuario.email,
          antes: estadoAntes, despues: { estado: 'APPROVED', motivo: '' },
          descripcion: `Aprobación de ${usuario.email}`
        });
        await this.cargarUsuarios(); // Recargamos para ver el cambio real
      } catch (error) {
        console.error("Error al aprobar:", error);
        this.ui.mostrarToast('Hubo un error al guardar los cambios.', 'err');
      }
    }
  }

  // Motivo de rechazo — pantalla propia (no el confirm simple de texto),
  // porque necesita un campo de texto para escribir el motivo, que
  // luego ve la persona rechazada en la pantalla Pending.
  public isModalMotivoRechazoOpen: boolean = false;
  public motivoRechazoTexto: string = '';
  private usuarioARechazar: CuentaUsuario | null = null;

  rechazarUsuario(usuario: CuentaUsuario) {
    this.usuarioARechazar = usuario;
    this.motivoRechazoTexto = '';
    this.isModalMotivoRechazoOpen = true;
    this.zone.run(() => this.cdr.detectChanges());
  }

  public cancelarRechazo(): void {
    this.isModalMotivoRechazoOpen = false;
    this.usuarioARechazar = null;
  }

  public async confirmarRechazoConMotivo(): Promise<void> {
    if (!this.usuarioARechazar) return;
    const usuario = this.usuarioARechazar;
    this.isModalMotivoRechazoOpen = false;
    try {
      const estadoAntes = { estado: usuario.estado, motivo: (usuario as any).motivoRechazo || '' };
      const motivo = this.motivoRechazoTexto.trim();
      await this.account.rechazar(usuario.email, motivo);
      this.ds.registrarCambio({
        tipo: 'usuario-estado', clave: usuario.email,
        antes: estadoAntes, despues: { estado: 'REJECTED', motivo },
        descripcion: `Rechazo de ${usuario.email}`
      });
      await this.cargarUsuarios();
    } catch (error) {
      console.error("Error al rechazar:", error);
      this.ui.mostrarToast('Hubo un error al guardar los cambios.', 'err');
    } finally {
      this.usuarioARechazar = null;
    }
  }

  async cambiarRol(usuario: any, rol: 'editor' | 'lector' | 'jefe' | 'auxiliar') {
    try {
      const rolAntes = usuario.rol || 'editor';
      await this.account.cambiarRol(usuario.email, rol);
      if (rolAntes !== rol) {
        this.ds.registrarCambio({
          tipo: 'usuario-rol', clave: usuario.email, antes: rolAntes, despues: rol,
          descripcion: `Rol de ${usuario.email}: ${rolAntes} → ${rol}`
        });
      }
      usuario.rol = rol; // actualización inmediata en la tabla, sin esperar recarga
      this.zone.run(() => this.cdr.detectChanges());
    } catch (error) {
      console.error("Error al cambiar el rol:", error);
      this.ui.mostrarToast('No se pudo cambiar el rol.', 'err');
    }
  }

  // --- Restablecer contraseña (para cuando alguien la olvida) ---
  public isModalResetClaveOpen: boolean = false;
  public nuevaClaveTexto: string = '';
  public usuarioAResetear: CuentaUsuario | null = null;

  abrirResetClave(usuario: CuentaUsuario): void {
    this.usuarioAResetear = usuario;
    this.nuevaClaveTexto = '';
    this.isModalResetClaveOpen = true;
    this.zone.run(() => this.cdr.detectChanges());
  }

  public cancelarResetClave(): void {
    this.isModalResetClaveOpen = false;
    this.usuarioAResetear = null;
  }

  // Genera una clave al azar (10 caracteres, sin 0/O/1/l/I para evitar
  // confusiones al leerla en voz alta o escribirla a mano) — para no
  // depender de que el admin invente una buena contraseña a las carreras.
  public generarClaveAleatoria(): void {
    const caracteres = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let clave = '';
    for (let i = 0; i < 10; i++) {
      clave += caracteres[Math.floor(Math.random() * caracteres.length)];
    }
    this.nuevaClaveTexto = clave;
  }

  public async confirmarResetClave(): Promise<void> {
    if (!this.usuarioAResetear) return;
    if (this.nuevaClaveTexto.trim().length < 6) {
      this.ui.mostrarToast('La contraseña debe tener al menos 6 caracteres.', 'err');
      return;
    }

    const usuario = this.usuarioAResetear;
    try {
      await this.account.resetearClave(usuario.email, this.nuevaClaveTexto.trim());
      this.isModalResetClaveOpen = false;
      this.ui.mostrarToast(`Contraseña restablecida para ${usuario.email} — ya le puedes compartir la nueva.`, 'ok');
    } catch (error: any) {
      this.ui.mostrarErrorHttp(error, 'restablecer la contraseña');
    } finally {
      this.usuarioAResetear = null;
      this.zone.run(() => this.cdr.detectChanges());
    }
  }
}