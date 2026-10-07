import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DataService } from '../../services/data';
import { AuthService } from '../../services/auth.service';
import { UiService } from '../../services/ui.service';
import { ORIGEN, ResumenDestino, limpiarLugar, resumenDestinos } from '../../services/mapa-destinos';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const escapar = (t: any): string => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/**
 * MAPA DE DESTINOS — líneas desde Bogotá a cada destino del mes, más
 * gruesas con más viajes, y un círculo por destino (viajes, clientes,
 * vehículos). El mapa de fondo es OpenStreetMap (libre, sin claves; necesita
 * internet en el equipo que lo abre). La librería (Leaflet) se carga solo
 * al entrar a esta página. Los destinos que no están en la tabla de
 * ciudades se ubican con un clic (services/mapa-destinos.ts).
 */
@Component({
  selector: 'app-mapa',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mapa.html',
  styleUrls: ['./mapa.css']
})
export class MapaComponent implements AfterViewInit, OnDestroy {
  @ViewChild('contenedor') contenedor?: ElementRef<HTMLDivElement>;
  private ds = inject(DataService);
  private auth = inject(AuthService);
  private ui = inject(UiService);
  private cdr = inject(ChangeDetectorRef);
  private zone = inject(NgZone);
  private sub?: Subscription;
  private L: any = null;
  private mapa: any = null;
  private capa: any = null;

  anio = Number(this.ds.S?.anio) || new Date().getFullYear();
  mes = Number.isInteger(Number(this.ds.S?.mes)) ? Number(this.ds.S?.mes) : new Date().getMonth();
  destinos: ResumenDestino[] = [];
  ubicando: ResumenDestino | null = null;
  errorMapa = '';
  sinFondo = false;
  cargando = true;

  get titulo(): string { return `${MESES[this.mes]} ${this.anio}`; }
  get sinUbicar(): ResumenDestino[] { return this.destinos.filter(d => !d.punto); }
  get totalViajes(): number { return this.destinos.reduce((s, d) => s + d.viajes, 0); }
  get puedeEditar(): boolean { return this.auth.puedeEditar; }

  async ngAfterViewInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const mod: any = await import('leaflet');
      this.L = mod.default || mod;
      this.zone.runOutsideAngular(() => {
        this.mapa = this.L.map(this.contenedor!.nativeElement, { zoomControl: true, attributionControl: true }).setView([6.5, -74.5], 6);
        const fondo = this.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 18,
          // OpenStreetMap rechaza ("not following the tile usage policy") los
          // pedidos que llegan sin "Referer", y el servidor le dice al
          // navegador que no lo mande nunca (Referrer-Policy: no-referrer, en
          // server.js). Solo para estas imágenes se manda el origen
          // (http://equipo:5000), sin la ruta ni datos de la página.
          referrerPolicy: 'strict-origin-when-cross-origin',
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
        }).addTo(this.mapa);
        // Sin internet el fondo no carga, pero las líneas y los destinos sí.
        fondo.once('tileerror', () => this.zone.run(() => {
          this.sinFondo = true;
          this.cdr.detectChanges();
        }));
        this.capa = this.L.layerGroup().addTo(this.mapa);
        this.mapa.on('click', (e: any) => this.zone.run(() => this.alHacerClic(e.latlng)));
      });
    } catch (e) {
      console.error('No se pudo cargar el mapa:', e);
      this.errorMapa = 'No se pudo cargar el mapa.';
    }
    this.cargando = false;
    this.recalcular();
    this.sub = this.ds.dataChanged.subscribe(() => this.recalcular());
    if (!(this.ds.S?.viajes || []).length) this.ds.inicializarApp(true);
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.mapa?.remove();
  }

  cambiarMes(delta: number): void {
    const f = new Date(this.anio, this.mes + delta, 1);
    this.anio = f.getFullYear();
    this.mes = f.getMonth();
    this.recalcular();
  }

  recalcular(): void {
    this.destinos = resumenDestinos(this.ds.S, this.anio, this.mes);
    this.dibujar();
    this.cdr.detectChanges();
  }

  private dibujar(): void {
    if (!this.mapa || !this.L) return;
    const L = this.L;
    this.capa.clearLayers();
    const max = Math.max(1, ...this.destinos.map(d => d.viajes));
    const puntos: any[] = [[ORIGEN.lat, ORIGEN.lng]];
    this.destinos.filter(d => d.punto).forEach(d => {
      const p = [d.punto!.lat, d.punto!.lng];
      puntos.push(p);
      const fuerza = d.viajes / max;
      L.polyline([[ORIGEN.lat, ORIGEN.lng], p], { color: '#2563eb', weight: 2 + 8 * fuerza, opacity: 0.35 + 0.45 * fuerza }).addTo(this.capa);
      const popup = `<b>${escapar(d.destino)}</b><br>${d.viajes} viaje${d.viajes === 1 ? '' : 's'} en ${escapar(this.titulo)}`
        + (d.clientes.length ? `<br><small>Clientes: ${escapar(d.clientes.slice(0, 4).join(', '))}${d.clientes.length > 4 ? '…' : ''}</small>` : '')
        + `<br><small>${d.placas.length} vehículo${d.placas.length === 1 ? '' : 's'}: ${escapar(d.placas.slice(0, 6).join(', '))}${d.placas.length > 6 ? '…' : ''}</small>`;
      L.circleMarker(p, { radius: 6 + 14 * Math.sqrt(fuerza), color: '#1d4ed8', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.75 })
        .bindPopup(popup).bindTooltip(`${d.destino}: ${d.viajes}`, { direction: 'top' }).addTo(this.capa);
    });
    L.circleMarker([ORIGEN.lat, ORIGEN.lng], { radius: 8, color: '#b45309', weight: 3, fillColor: '#f59e0b', fillOpacity: 1 })
      .bindTooltip(`${ORIGEN.nombre} (base)`, { permanent: false }).addTo(this.capa);
    if (puntos.length > 1) this.mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: 8 });
  }

  /** Centra el mapa en un destino de la lista. */
  ver(d: ResumenDestino): void {
    if (d.punto && this.mapa) this.mapa.setView([d.punto.lat, d.punto.lng], 9);
  }

  empezarUbicar(d: ResumenDestino): void {
    this.ubicando = d;
    this.ui.mostrarToast(`Haz clic en el mapa donde queda "${d.destino}".`, 'info');
  }

  private async alHacerClic(latlng: { lat: number; lng: number }): Promise<void> {
    const d = this.ubicando;
    if (!d) return;
    this.ubicando = null;
    const clave = limpiarLugar(d.destino);
    const lista = (this.ds.S?.ubicaciones || []).filter((u: any) => limpiarLugar(u.nombre) !== clave);
    lista.push({ nombre: d.destino, lat: Math.round(latlng.lat * 10000) / 10000, lng: Math.round(latlng.lng * 10000) / 10000 });
    this.ds.S.ubicaciones = lista;
    await this.ds.guardarConfigCompartida('ubicaciones');
    await this.ds.autoSave();
    this.ui.mostrarToast(`"${d.destino}" quedó ubicado. Lo verán todos.`, 'ok');
    this.recalcular();
  }
}
