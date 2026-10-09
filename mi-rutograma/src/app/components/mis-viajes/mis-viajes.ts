import { VacioComponent } from '../comunes/vacio';
import { EsqueletoComponent } from '../comunes/esqueleto';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { CambiarClaveComponent } from '../cambiar-clave/cambiar-clave';

const API_URL = API;

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

interface DiaConViajes { fecha: string; titulo: string; esHoy: boolean; descanso: boolean; viajes: any[]; }

/**
 * MIS VIAJES — la pantalla de una cuenta de rol "conductor": sus viajes de
 * ayer a dentro de dos semanas, agrupados por día, pensada para el celular.
 * Se actualiza sola cada minuto.
 *
 * Cuenta COMPARTIDA (rol conductor sin enlazar, una para todos): primero
 * se pide nombre y placa, se muestra lo encontrado para confirmar, y luego
 * los viajes de esa placa (o, si no tiene, los del conductor por nombre).
 */
import { armarIcs } from '../../services/calendario-ics';
import { API } from '../../api-base';
import { ThemeService } from '../../services/theme.service';
@Component({
  selector: 'app-mis-viajes',
  standalone: true,
  imports: [VacioComponent, EsqueletoComponent, CommonModule, RouterLink, FormsModule, CambiarClaveComponent],
  templateUrl: './mis-viajes.html',
  styleUrls: ['./mis-viajes.css']
})
export class MisViajesComponent implements OnInit, OnDestroy {
  public theme = inject(ThemeService);
  public auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private esNavegador = isPlatformBrowser(inject(PLATFORM_ID));

  cargando = true;
  error = '';
  enlazado = true;

  // Cuenta compartida: paso actual y lo que escribió / eligió.
  compartida = false;
  paso: 'identificar' | 'confirmar' | 'viajes' = 'viajes';
  nombreIngresado = '';
  placaIngresada = '';
  candidatos: any[] = [];
  placaEncontrada = '';
  placaExiste = false;
  validando = false;
  elegido: { ced: string; placa: string } | null = null;
  buscadoPor = '';
  cambiandoClave = false;
  placaBuscada = '';
  descargando = false;
  private static readonly CLAVE_ELEGIDO = 'mis-viajes-elegido';
  conductor: any = null;
  dias: DiaConViajes[] = [];
  ultimaActualizacion: Date | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    if (!this.esNavegador) return;
    try {
      const guardado = sessionStorage.getItem(MisViajesComponent.CLAVE_ELEGIDO);
      if (guardado) this.elegido = JSON.parse(guardado);
    } catch { /* sin almacenamiento: se vuelve a preguntar */ }
    this.cargar();
    this.reloj = setInterval(() => { if (document.visibilityState === 'visible') this.cargar(true); }, 60000);
  }

  ngOnDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  async cargar(silencioso = false): Promise<void> {
    if (!silencioso) { this.cargando = true; this.cdr.markForCheck(); }
    try {
      const params = this.elegido ? `?ced=${encodeURIComponent(this.elegido.ced)}&placa=${encodeURIComponent(this.elegido.placa)}` : '';
      const res = await this.auth.fetchAutenticado(`${API_URL}/mis-viajes${params}`);
      const data = await res.json();
      if (!data?.ok) {
        this.error = data?.msg || 'No se pudieron cargar tus viajes.';
      } else {
        this.error = '';
        this.compartida = !!data.compartida;
        this.enlazado = data.enlazado !== false;
        if (!this.enlazado) {
          // Cuenta compartida sin conductor elegido (o el elegido ya no existe): pedir datos.
          this.paso = 'identificar';
          this.elegido = null;
          this.olvidarElegido();
          if (data.msg) this.error = data.msg;
        } else {
          this.paso = 'viajes';
          this.conductor = data.conductor || null;
          this.buscadoPor = data.buscadoPor || '';
          this.placaBuscada = data.placaBuscada || '';
          this.dias = this.agruparPorDia(data.viajes || []);
          this.quitados = data.quitados || [];
          this.hayAvisos = !!data.hayAvisos;
          this.anuncios = data.anuncios || [];
          this.cuentaAvisos = (data.viajes || []).filter((v: any) => v.aviso).reduce((n: any, v: any) => { n[v.aviso.tipo] = (n[v.aviso.tipo] || 0) + 1; return n; }, {});
          this.ultimaActualizacion = new Date();
        }
      }
    } catch {
      if (!silencioso) this.error = 'Sin conexión con el servidor. Inténtalo de nuevo en un momento.';
    }
    this.cargando = false;
    this.cdr.markForCheck();
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** ¿El conductor descansa ese día? (días de descanso por mes, ej. "Octubre-2026": "20,21"). */
  private esDescanso(fecha: string): boolean {
    const d = new Date(fecha + 'T00:00:00');
    const lista = String(this.conductor?.descansosPorMes?.[`${MESES[d.getMonth()]}-${d.getFullYear()}`] || '');
    return lista.split(',').map(x => Number(x.trim())).includes(d.getDate());
  }

  private agruparPorDia(viajes: any[]): DiaConViajes[] {
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const hoyIso = this.iso(hoy);
    const mananaIso = this.iso(new Date(hoy.getTime() + 86400000));
    const ayerIso = this.iso(new Date(hoy.getTime() - 86400000));
    const porFecha = new Map<string, any[]>();
    // Hoy y los próximos 7 días siempre aparecen (con o sin viajes), para ver descansos.
    for (let i = 0; i <= 7; i++) porFecha.set(this.iso(new Date(hoy.getTime() + i * 86400000)), []);
    viajes.forEach(v => {
      if (!porFecha.has(v.fecha)) porFecha.set(v.fecha, []);
      porFecha.get(v.fecha)!.push(v);
    });
    return [...porFecha.keys()].sort().map(fecha => {
      const d = new Date(fecha + 'T00:00:00');
      const nombre = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
      const prefijo = fecha === hoyIso ? 'Hoy · ' : fecha === mananaIso ? 'Mañana · ' : fecha === ayerIso ? 'Ayer · ' : '';
      return {
        fecha,
        titulo: prefijo + nombre.charAt(0).toUpperCase() + nombre.slice(1),
        esHoy: fecha === hoyIso,
        descanso: this.esDescanso(fecha),
        viajes: porFecha.get(fecha)!
      };
    });
  }

  /** Día (fecha) en que vuelve, a partir del número de día de retorno del viaje. */
  vuelve(v: any): string {
    const salida = Number(v.salida || v.dia), retorno = Number(v.retorno);
    if (!retorno || !salida || retorno <= salida) return '';
    const d = new Date(v.fecha + 'T00:00:00');
    d.setDate(d.getDate() + (retorno - salida));
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' });
  }

  claseEstado(estado: string): string {
    const e = String(estado || '').toLowerCase();
    if (e.includes('cancel')) return 'cancelado';
    if (e.includes('entreg')) return 'entregado';
    if (e.includes('ruta')) return 'en-ruta';
    return 'programado';
  }

  // ---------- Cuenta compartida: identificarse y confirmar ----------

  async buscarConductor(): Promise<void> {
    this.error = '';
    if (this.nombreIngresado.trim().length < 3) { this.error = 'Escribe tu nombre (al menos 3 letras).'; return; }
    if (!this.placaIngresada.trim()) { this.error = 'Escribe la placa del vehículo.'; return; }
    this.validando = true;
    this.cdr.markForCheck();
    try {
      const q = `nombre=${encodeURIComponent(this.nombreIngresado.trim())}&placa=${encodeURIComponent(this.placaIngresada.trim())}`;
      const res = await this.auth.fetchAutenticado(`${API_URL}/mis-viajes/validar?${q}`);
      const data = await res.json();
      if (!data?.ok) {
        this.error = data?.msg || 'No se pudo buscar.';
      } else if (!data.candidatos.length) {
        this.error = 'No encontramos un conductor con ese nombre. Revisa cómo lo escribiste (puedes poner solo nombre y apellido).';
      } else {
        this.candidatos = data.candidatos;
        this.placaEncontrada = data.placa;
        this.placaExiste = !!data.placaExiste;
        this.paso = 'confirmar';
      }
    } catch {
      this.error = 'Sin conexión con el servidor. Inténtalo de nuevo.';
    }
    this.validando = false;
    this.cdr.markForCheck();
  }

  async confirmar(c: any): Promise<void> {
    this.elegido = { ced: c.ced, placa: this.placaEncontrada };
    try { sessionStorage.setItem(MisViajesComponent.CLAVE_ELEGIDO, JSON.stringify(this.elegido)); } catch { /* sin almacenamiento */ }
    await this.cargar();
  }

  corregir(): void {
    this.paso = 'identificar';
    this.candidatos = [];
    this.error = '';
  }

  /** Cuenta compartida: otro conductor va a usar este celular. */
  cambiarConductor(): void {
    this.olvidarElegido();
    this.elegido = null;
    this.conductor = null;
    this.dias = [];
    this.nombreIngresado = '';
    this.placaIngresada = '';
    this.candidatos = [];
    this.paso = 'identificar';
  }

  private olvidarElegido(): void {
    try { sessionStorage.removeItem(MisViajesComponent.CLAVE_ELEGIDO); } catch { /* nada */ }
  }

  // ---------- Pizarra y calendario ----------

  /** Anuncios de la oficina "para todos" (la pizarra). */
  anuncios: any[] = [];

  /** Descarga los viajes de hoy en adelante como .ics (services/calendario-ics.ts). */
  agregarAlCalendario(): void {
    const hoy = new Date();
    const desde = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const viajes = this.dias.flatMap(d => d.viajes).filter((v: any) => String(v.fecha || '') >= desde);
    if (!viajes.length) {
      this.ui.mostrarToast('No tienes viajes de hoy en adelante para agregar.', 'info');
      return;
    }
    const nombre = String(this.conductor?.nombre || '').trim();
    const blob = new Blob([armarIcs(viajes, nombre)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mis-viajes-makand.ics';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    this.ui.mostrarToast(`${viajes.length} viaje${viajes.length === 1 ? '' : 's'} listos: ábrelo y elige "Agregar" en tu calendario. Si te cambian un viaje, vuelve a descargarlo.`, 'ok');
  }

  // ---------- Reportar novedad ----------

  readonly tiposNovedad = [
    { valor: 'Varado', nombre: 'Varado / avería', icono: 'bi-cone-striped' },
    { valor: 'Retraso', nombre: 'Retraso', icono: 'bi-clock-history' },
    { valor: 'Accidente', nombre: 'Accidente', icono: 'bi-exclamation-octagon' },
    { valor: 'Otro', nombre: 'Otra cosa', icono: 'bi-chat-dots' }
  ];
  reporte: { tipo: string; viajeId: string; desc: string; foto?: string } | null = null;
  enviandoReporte = false;
  procesandoFoto = false;

  /** Foto opcional: se reduce aquí (máx. 1280 px, JPEG) para que suba rápido con poca señal. */
  async elegirFoto(evento: Event): Promise<void> {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0];
    input.value = '';
    if (!archivo || !this.reporte) return;
    if (!archivo.type.startsWith('image/')) {
      this.ui.mostrarToast('Eso no es una foto.', 'err');
      return;
    }
    this.procesandoFoto = true;
    this.cdr.markForCheck();
    try {
      const url = URL.createObjectURL(archivo);
      try {
        const img = await new Promise<HTMLImageElement>((ok, mal) => {
          const i = new Image();
          i.onload = () => ok(i);
          i.onerror = () => mal(new Error('no carga'));
          i.src = url;
        });
        const escala = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(img.naturalWidth * escala);
        lienzo.height = Math.round(img.naturalHeight * escala);
        lienzo.getContext('2d')!.drawImage(img, 0, 0, lienzo.width, lienzo.height);
        if (this.reporte) this.reporte.foto = lienzo.toDataURL('image/jpeg', 0.72);
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch {
      this.ui.mostrarToast('No se pudo leer la foto. Intenta con otra.', 'err');
    }
    this.procesandoFoto = false;
    this.cdr.markForCheck();
  }

  /** Los viajes de ayer a mañana (con los que más probablemente pasa algo). */
  get viajesParaReporte(): any[] {
    const todos = this.dias.flatMap(d => d.viajes).filter((v: any) => v.estado !== 'Cancelado');
    const desde = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const hasta = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const cerca = todos.filter((v: any) => v.fecha >= desde && v.fecha <= hasta);
    return cerca.length ? cerca : todos.slice(0, 5);
  }

  abrirReporte(): void {
    const enRuta = this.dias.flatMap(d => d.viajes).find((v: any) => v.salidaReal && !v.llegadaReal);
    this.reporte = { tipo: '', viajeId: enRuta?.id || '', desc: '' };
  }

  async enviarReporte(): Promise<void> {
    if (!this.reporte || this.enviandoReporte) return;
    this.enviandoReporte = true;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/mis-viajes/novedad`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo: this.reporte.tipo, desc: this.reporte.desc, viajeId: this.reporte.viajeId || undefined, foto: this.reporte.foto || undefined, ...(this.elegido || {}) })
      });
      const data = await res.json();
      if (data?.ok) {
        this.reporte = null;
        this.ui.mostrarToast('Listo, la oficina ya lo vio. Si es urgente, llama también.', 'ok');
      } else {
        this.ui.mostrarToast(data?.msg || 'No se pudo enviar. Inténtalo de nuevo.', 'err');
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se pudo enviar. Si es urgente, llama a la oficina.', 'err');
    }
    this.enviandoReporte = false;
    this.cdr.markForCheck();
  }

  // ---------- Avisos: viajes nuevos o cambiados ----------

  hayAvisos = false;
  quitados: any[] = [];
  cuentaAvisos: Record<string, number> = {};
  confirmandoAvisos = false;

  get textoAvisos(): string {
    const partes: string[] = [];
    const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
    if (this.cuentaAvisos['nuevo']) partes.push(plural(this.cuentaAvisos['nuevo'], 'viaje nuevo', 'viajes nuevos'));
    if (this.cuentaAvisos['cambio']) partes.push(plural(this.cuentaAvisos['cambio'], 'viaje cambió', 'viajes cambiaron'));
    if (this.cuentaAvisos['cancelado']) partes.push(plural(this.cuentaAvisos['cancelado'], 'viaje cancelado', 'viajes cancelados'));
    if (this.quitados.length) partes.push(plural(this.quitados.length, 'viaje ya no es tuyo', 'viajes ya no son tuyos'));
    return partes.length ? `Atención: ${partes.join(', ')}.` : 'Hay cambios en tus viajes.';
  }

  /** "Entendido": ya vio los cambios; dejan de marcarse. */
  async entendido(): Promise<void> {
    this.confirmandoAvisos = true;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/mis-viajes/visto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(this.elegido || {}) })
      });
      const data = await res.json();
      if (data?.ok) await this.cargar(true);
      else this.ui.mostrarToast(data?.msg || 'No se pudo guardar. Inténtalo de nuevo.', 'err');
    } catch {
      this.ui.mostrarToast('Sin conexión: no se pudo guardar. Inténtalo de nuevo.', 'err');
    }
    this.confirmandoAvisos = false;
    this.cdr.markForCheck();
  }

  // ---------- "Ya salí" / "Ya llegué" ----------

  marcandoId: any = null;

  private fechaLocal(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  /** De ayer a mañana, no cancelado y sin terminar (igual que el servidor). */
  puedeMarcar(v: any): boolean {
    if (v.estado === 'Cancelado' || (v.salidaReal && v.llegadaReal && !this.sePuedeDeshacer(v))) return false;
    const ayer = this.fechaLocal(new Date(Date.now() - 86400000));
    const manana = this.fechaLocal(new Date(Date.now() + 86400000));
    return !!v.salidaReal || (v.fecha >= ayer && v.fecha <= manana);
  }

  /** La última marca se puede deshacer en los primeros 15 minutos. */
  sePuedeDeshacer(v: any): boolean {
    const ultima = v.llegadaReal || v.salidaReal;
    return !!ultima && Date.now() - new Date(ultima).getTime() < 15 * 60000;
  }

  // ---------- Deslizar el dedo para marcar (celular) ----------
  public deslizando: { id: any; x0: number; y0: number; dx: number; avance: number; ancho: number; horizontal: boolean | null } | null = null;

  accionDeslizar(v: any): 'salida' | 'llegada' | null {
    if (!this.puedeMarcar(v) || this.marcandoId) return null;
    return !v.salidaReal ? 'salida' : !v.llegadaReal ? 'llegada' : null;
  }
  empezarDeslizar(e: PointerEvent, v: any): void {
    if (!this.accionDeslizar(v) || e.button !== 0 || (e.target as HTMLElement).closest('button, a')) return;
    const ancho = (e.currentTarget as HTMLElement).getBoundingClientRect().width || 300;
    this.deslizando = { id: v.id, x0: e.clientX, y0: e.clientY, dx: 0, avance: 0, ancho, horizontal: null };
  }
  moverDeslizar(e: PointerEvent): void {
    const d = this.deslizando;
    if (!d) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (d.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      d.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3;
      if (d.horizontal) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      else { this.deslizando = null; this.cdr.markForCheck(); return; }
    }
    if (!d.horizontal) return;
    d.dx = Math.max(0, Math.min(dx, d.ancho * 0.75));
    d.avance = Math.min(1, d.dx / (d.ancho * 0.45));
    this.cdr.markForCheck();
  }
  terminarDeslizar(e: PointerEvent, v: any): void {
    const d = this.deslizando;
    this.deslizando = null;
    this.cdr.markForCheck();
    if (!d || !d.horizontal) return;
    e.preventDefault();
    const accion = this.accionDeslizar(v);
    if (d.avance >= 1 && accion) {
      navigator.vibrate?.(30);
      this.marcar(v, accion);
    }
  }
  cancelarDeslizar(): void { this.deslizando = null; this.cdr.markForCheck(); }

  async marcar(v: any, accion: 'salida' | 'llegada' | 'deshacer'): Promise<void> {
    if (this.marcandoId) return;
    this.marcandoId = v.id;
    this.cdr.markForCheck();
    try {
      const res = await this.auth.fetchAutenticado(`${API_URL}/mis-viajes/marcar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id, accion, ...(this.elegido || {}) })
      });
      const data = await res.json();
      if (!data?.ok) {
        this.ui.mostrarToast(data?.msg || 'No se pudo marcar. Inténtalo de nuevo.', 'err');
      } else {
        v.salidaReal = data.salidaReal;
        v.llegadaReal = data.llegadaReal;
        v.estado = data.estado;
        this.ui.mostrarToast(accion === 'salida' ? '¡Buen viaje! Quedó marcada tu salida.'
          : accion === 'llegada' ? 'Listo, quedó marcada tu llegada.' : 'Se deshizo la última marca.', 'ok');
      }
    } catch {
      this.ui.mostrarToast('Sin conexión: no se pudo marcar. Inténtalo de nuevo.', 'err');
    }
    this.marcandoId = null;
    this.cdr.markForCheck();
  }

  // ---------- Foto de los viajes ----------

  async descargarFoto(): Promise<void> {
    const zona = document.getElementById('mv-captura');
    if (!zona || this.descargando) return;
    this.descargando = true;
    this.cdr.markForCheck();
    try {
      const canvas = await html2canvas(zona, { backgroundColor: '#0b1222', scale: 2, useCORS: true,
        ignoreElements: (el: Element) => el.classList?.contains('mv-no-foto') });
      const enlace = document.createElement('a');
      const nombre = String(this.conductor?.nombre || 'conductor').split(' ').slice(0, 2).join('-');
      enlace.download = `viajes-${nombre}-${new Date().toISOString().slice(0, 10)}.png`;
      enlace.href = canvas.toDataURL('image/png');
      enlace.click();
    } catch {
      this.error = 'No se pudo crear la foto. Inténtalo de nuevo.';
    }
    this.descargando = false;
    this.cdr.markForCheck();
  }

  async salir(): Promise<void> {
    this.olvidarElegido();
    await this.auth.cerrarSesion();
  }
}
