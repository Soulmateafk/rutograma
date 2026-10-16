import { Component, OnInit, signal, inject, effect } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, RouterOutlet, RouterLink } from '@angular/router'; 
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common'; 
import { DataService } from './services/data';
import { AuthService } from './services/auth.service';
import { PresenciaService } from './services/presencia.service';
import { VivoService } from './services/vivo.service';
import { MarcadorVivoComponent } from './components/en-vivo/marcador';
import { EditandoAhoraComponent } from './components/en-vivo/editando-ahora';
import { ModalService } from './services/modal';
import { LoadingService } from './services/loading.service';
import { ThemeService } from './services/theme.service';
import { AtajosService } from './services/atajos.service';
import { InstalarService } from './services/instalar.service';
import { CierreAnimadoService } from './services/cierre-animado.service';
import { BusquedaHabladaComponent } from './components/busqueda-hablada/busqueda-hablada';
import { UiService } from './services/ui.service';
import { ConexionService } from './services/conexion.service';
import { EfectosService } from './services/efectos.service';
import { AparienciaComponent } from './components/apariencia/apariencia';
import { NavbarComponent } from './components/navbar/navbar'; 
import { GuiaComponent } from './components/guia/guia';
import { GuiaService } from './services/guia.service';
import { AvisoInactividadComponent } from './components/aviso-inactividad/aviso-inactividad';
import { PizarraComponent } from './components/pizarra/pizarra';
import { AvisoCargueComponent } from './components/aviso-cargue/aviso-cargue';
import { AvisoDeshacerComponent } from './components/aviso-deshacer/aviso-deshacer';
import { NotasComponent } from './components/notas/notas';
import { SonidoService } from './services/sonido.service';
import { computed } from '@angular/core';
import { temporadaVisible } from './services/temporadas';

@Component({
  selector: 'app-root',
  standalone: true, 
  imports: [RouterOutlet, RouterLink, NavbarComponent, CommonModule, GuiaComponent, AvisoInactividadComponent, PizarraComponent, AvisoCargueComponent, AparienciaComponent, AvisoDeshacerComponent, NotasComponent, BusquedaHabladaComponent, MarcadorVivoComponent, EditandoAhoraComponent], 
  templateUrl: './app.html'
})
export class App implements OnInit {
  private relojCascada: any = null;
  // Signals en vez de propiedades normales: se actualizan solos en la
  // pantalla sin depender de que Angular "se entere" del cambio a través
  // de zone.js — evita el problema de que algo cambie en un setTimeout
  // pero la vista nunca se repinte sola.
  mostrarNavbar = signal(true);

  /** La pantalla de carga se viste de la fiesta (con la temporada que tenga la cuenta). */
  temporadaCarga = computed(() => this.theme.temporadaPreferida() === 'no' ? null : temporadaVisible(this.theme.temporadaPreferida()));
  disfrazCarga = computed(() => {
    const DISFRACES: Record<string, { emoji: string; clase: string }> = {
      navidad: { emoji: '', clase: 'gorro' }, halloween: { emoji: '🎃', clase: 'emoji' }, 'ano-nuevo': { emoji: '🎉', clase: 'emoji' },
      'san-valentin': { emoji: '💝', clase: 'emoji' }, 'amor-amistad': { emoji: '🎁', clase: 'emoji' }, madre: { emoji: '🌷', clase: 'emoji' },
      padre: { emoji: '👔', clase: 'emoji' }, mujer: { emoji: '💐', clase: 'emoji' }, 'semana-santa': { emoji: '🐣', clase: 'emoji' },
      independencia: { emoji: '', clase: 'bandera' }, boyaca: { emoji: '', clase: 'bandera' }, trabajo: { emoji: '🔧', clase: 'emoji' },
      conductor: { emoji: '⭐', clase: 'emoji' }, velitas: { emoji: '🕯️', clase: 'emoji' }, aniversario: { emoji: '🎈', clase: 'emoji' }
    };
    const t = this.temporadaCarga();
    return t ? DISFRACES[t.clave] || null : null;
  });
  rutaActual = signal('');

  // Pantalla de carga que se ve un momento ANTES de mostrar el login (o
  // cualquier otra página) — puramente visual, no depende de que termine
  // ninguna petición real, solo dura un tiempo fijo corto.
  cargandoInicial = signal(true);
  /** Pantallas sin sesión (login, registro, pendiente): ahí no va la franja de MODO PRUEBA. */
  sinSesion = computed(() => ['/login', '/register', '/pending'].some(r => this.rutaActual().startsWith(r)));

  // Carga breve al cambiar de página (Dashboard→Rutograma, etc.) — el
  // estado real ahora vive en LoadingService (para que otras pantallas,
  // como Configuración, puedan mostrar la misma pantalla del camión para
  // sus propias operaciones largas). Estos getters mantienen exactamente
  // la misma sintaxis de siempre en app.html (`cargandoRuta()`).
  get cargandoRuta() { return this.loading.cargandoRuta; }
  get ocultandoRuta() { return this.loading.ocultandoRuta; }
  get cargandoGrande() { return this.loading.cargandoGrande; }
  get mensajeGrande() { return this.loading.mensajeGrande; }

  // Título de la pestaña del navegador, según la página en la que estés
  // — antes siempre decía la URL/nombre técnico del proyecto. La ruta
  // principal ("/rutograma") pidió el nombre "RutogramaMak"; el resto
  // usa un nombre simple y consistente. La que no encuentre coincidencia
  // se queda con "Makand" a secas.
  private titulosPorRuta: { prefijo: string; titulo: string }[] = [
    { prefijo: '/rutograma', titulo: 'RutogramaMak' },
    { prefijo: '/dashboard', titulo: 'Dashboard · Makand' },
    { prefijo: '/configuracion', titulo: 'Configuración · Makand' },
    { prefijo: '/vehiculos', titulo: 'Vehículos · Makand' },
    { prefijo: '/hoja-de-vida', titulo: 'Hoja de vida · Makand' },
    { prefijo: '/rutas', titulo: 'Rutas · Makand' },
    { prefijo: '/conductores', titulo: 'Conductores · Makand' },
    { prefijo: '/login', titulo: 'Ingresar · Makand' },
    { prefijo: '/register', titulo: 'Registro · Makand' },
    { prefijo: '/pending', titulo: 'Cuenta pendiente · Makand' },
    { prefijo: '/historico', titulo: 'Histórico · Makand' },
    { prefijo: '/comparativo', titulo: 'Comparativo · Makand' },
    { prefijo: '/presentacion', titulo: 'Presentación · Makand' },
    { prefijo: '/tareas', titulo: 'Tareas · Makand' },
    { prefijo: '/conductor/', titulo: 'Perfil del conductor · Makand' },
    { prefijo: '/cumplimiento', titulo: 'Cumplimiento · Makand' },
    { prefijo: '/resumen', titulo: 'Bienvenido · Makand' },
    { prefijo: '/admin', titulo: 'Administrador · Makand' },
    { prefijo: '/despachos', titulo: 'Despachos · Makand' },
    { prefijo: '/papelera', titulo: 'Papelera · Makand' },
  ];

  private actualizarTitulo(url: string): void {
    const coincidencia = this.titulosPorRuta.find(r => url.startsWith(r.prefijo));
    this.titleService.setTitle(coincidencia ? coincidencia.titulo : 'Makand');
  }

  public ui = inject(UiService);

  constructor(
    public dataService: DataService,
    public authService: AuthService,
    public modalService: ModalService,
    private loading: LoadingService,
    // Solo con inyectarlo aquí (aunque no se use directo en este
    // archivo) ya se dispara su constructor, que aplica el tema
    // guardado (claro/oscuro) al <body> lo antes posible — antes de que
    // se vea cualquier pantalla, para no mostrar un parpadeo del tema
    // equivocado por una fracción de segundo.
    private theme: ThemeService,
    // Atajos de teclado y el aviso de "se puede instalar": desde el arranque.
    private atajos: AtajosService,
    private instalar: InstalarService,
    private cierreAnimado: CierreAnimadoService,
    private conexion: ConexionService,
    private efectos: EfectosService,
    private titleService: Title,
    private presencia: PresenciaService,
    private vivo: VivoService,
    private router: Router,
    // Igual: se crea desde el arranque para no perderse la primera página
    // (las guías de primera vez se deciden al navegar).
    private guias: GuiaService,
    private sonido: SonidoService
  ) {
    // Franja de MODO PRUEBA: la barra de arriba baja 30 px. Antes era una regla
    // "body:has(.franja-prueba)" que hacía al navegador revisar toda la página
    // cada vez que aparecía o se iba algo (por ejemplo la vista previa de un viaje).
    effect(() => {
      const hay = this.dataService.modo() === 'pruebas' && !this.cargandoInicial() && !this.sinSesion();
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('con-franja-prueba', hay);
    });
    // Escuchamos los cambios de ruta
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        // Deslizar entre páginas: la nueva entra desde el lado hacia donde se va (orden de la barra).
        const ORDEN = ['/dashboard', '/rutograma', '/vehiculos', '/rutas', '/conductores', '/despachos', '/comparativo', '/presentacion', '/tareas', '/historico', '/cumplimiento',
          '/quejas', '/comparendos', '/mapa', '/aprobaciones', '/papelera', '/reglas', '/configuracion', '/sesiones', '/admin'];
        const pos = (u: string) => ORDEN.findIndex(r => u.startsWith(r));
        const desde = pos(this.router.url), hacia = pos(event.url);
        if (typeof document !== 'undefined') {
          if (desde !== -1 && hacia !== -1 && desde !== hacia) document.documentElement.setAttribute('data-dir', hacia > desde ? 'adelante' : 'atras');
          else document.documentElement.removeAttribute('data-dir');
        }
        // No mostrarla en la primera carga de la app — ahí ya está la
        // pantalla de carga inicial (más larga) haciendo su trabajo.
        if (this.cargandoInicial()) return;

        this.loading.mostrar();
      }

      if (event instanceof NavigationEnd) {
        // Definimos las rutas donde NO queremos que aparezca el Navbar
        // He añadido '/pending' a esta lista
        // Y '/resumen' — se diseñó como tarjeta centrada, tipo Login,
        // no como una pantalla más de trabajo con menú arriba.
        const rutasSinNavbar = ['/login', '/register', '/pending', '/resumen', '/mis-viajes'];
        
        // Si la URL actual está en nuestra lista, ocultamos el navbar (false)
        // La cuenta de despachos tiene una sola pantalla: sin menú arriba.
        this.mostrarNavbar.set(!rutasSinNavbar.includes(event.urlAfterRedirects.split(/[?#]/)[0]) && !this.authService.esDespachos);
        this.rutaActual.set(event.urlAfterRedirects);

        // "En línea": se avisa desde cualquier pantalla con sesión (también
        // Resumen, que no tiene barra arriba) — antes lo arrancaba la barra
        // y quien estaba en Resumen no le aparecía a nadie.
        const sinSesion = ['/login', '/register', '/pending'].some(r => event.urlAfterRedirects.startsWith(r));
        if (sinSesion) { this.presencia.detener(); this.vivo.detener(); }
        else { this.presencia.iniciar(); this.vivo.iniciar(); }

        this.actualizarTitulo(event.url);
        if (!this.cargandoInicial()) this.sonido.tocar('pagina');

        // Filas en cascada (styles.css, "body.cascada"): solo un momento al
        // entrar a cada pantalla, no cuando los datos se refrescan solos.
        if (typeof document !== 'undefined' && !document.documentElement.classList.contains('sin-cascada')) {
          document.body.classList.add('cascada');
          clearTimeout(this.relojCascada);
          this.relojCascada = setTimeout(() => document.body.classList.remove('cascada'), 1800);
        }

        if (this.cargandoRuta()) {
          this.loading.ocultarConFade();
        }
      }
    });
  }

  ngOnInit(): void {
    setTimeout(() => {
      this.cargandoInicial.set(false);
    }, 1500);
    // Reflejo del "ND" del logo (styles.css, "Detalles que brillan"): en vez
    // de una animación que corre sin parar, se enciende un momento cada 3,5 s
    // (logos del login) y cada 7 s (logo de la barra). Con la pestaña oculta no hace nada.
    if (typeof document !== 'undefined') {
      let vuelta = 0;
      setInterval(() => {
        if (document.hidden) return;
        const html = document.documentElement;
        vuelta++;
        const clases = vuelta % 2 === 0 ? ['nd-reflejo', 'nd-reflejo-corto'] : ['nd-reflejo-corto'];
        html.classList.remove(...clases);
        void html.offsetWidth;
        html.classList.add(...clases);
        setTimeout(() => html.classList.remove(...clases), 1200);
      }, 3500);
    }
  }
}