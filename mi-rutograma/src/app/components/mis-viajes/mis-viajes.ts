import { ChangeDetectorRef, Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import html2canvas from 'html2canvas';
import { AuthService } from '../../services/auth.service';

const API_URL = (typeof window !== 'undefined')
  ? `${window.location.protocol}//${window.location.hostname}:5000/api`
  : 'http://localhost:5000/api';

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
@Component({
  selector: 'app-mis-viajes',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './mis-viajes.html',
  styleUrls: ['./mis-viajes.css']
})
export class MisViajesComponent implements OnInit, OnDestroy {
  public auth = inject(AuthService);
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

  // ---------- Foto de los viajes ----------

  async descargarFoto(): Promise<void> {
    const zona = document.getElementById('mv-captura');
    if (!zona || this.descargando) return;
    this.descargando = true;
    this.cdr.markForCheck();
    try {
      const canvas = await html2canvas(zona, { backgroundColor: '#0b1222', scale: 2, useCORS: true });
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
