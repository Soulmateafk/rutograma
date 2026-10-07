import { Component, OnInit, signal } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, RouterOutlet } from '@angular/router'; 
import { Title } from '@angular/platform-browser';
import { CommonModule } from '@angular/common'; 
import { DataService } from './services/data';
import { AuthService } from './services/auth.service';
import { PresenciaService } from './services/presencia.service';
import { ModalService } from './services/modal';
import { LoadingService } from './services/loading.service';
import { ThemeService } from './services/theme.service';
import { NavbarComponent } from './components/navbar/navbar'; 
import { GuiaComponent } from './components/guia/guia';
import { GuiaService } from './services/guia.service';
import { AvisoInactividadComponent } from './components/aviso-inactividad/aviso-inactividad';
import { PizarraComponent } from './components/pizarra/pizarra';

@Component({
  selector: 'app-root',
  standalone: true, 
  imports: [RouterOutlet, NavbarComponent, CommonModule, GuiaComponent, AvisoInactividadComponent, PizarraComponent], 
  templateUrl: './app.html'
})
export class App implements OnInit {
  // Signals en vez de propiedades normales: se actualizan solos en la
  // pantalla sin depender de que Angular "se entere" del cambio a través
  // de zone.js — evita el problema de que algo cambie en un setTimeout
  // pero la vista nunca se repinte sola.
  mostrarNavbar = signal(true);
  rutaActual = signal('');

  // Pantalla de carga que se ve un momento ANTES de mostrar el login (o
  // cualquier otra página) — puramente visual, no depende de que termine
  // ninguna petición real, solo dura un tiempo fijo corto.
  cargandoInicial = signal(true);

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
    { prefijo: '/cumplimiento', titulo: 'Cumplimiento · Makand' },
    { prefijo: '/resumen', titulo: 'Bienvenido · Makand' },
    { prefijo: '/admin', titulo: 'Administrador · Makand' },
    { prefijo: '/despachos', titulo: 'Despachos · Makand' },
  ];

  private actualizarTitulo(url: string): void {
    const coincidencia = this.titulosPorRuta.find(r => url.startsWith(r.prefijo));
    this.titleService.setTitle(coincidencia ? coincidencia.titulo : 'Makand');
  }

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
    private titleService: Title,
    private presencia: PresenciaService,
    private router: Router,
    // Igual: se crea desde el arranque para no perderse la primera página
    // (las guías de primera vez se deciden al navegar).
    private guias: GuiaService
  ) {
    // Escuchamos los cambios de ruta
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
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
        this.mostrarNavbar.set(!rutasSinNavbar.includes(event.url) && !this.authService.esDespachos);
        this.rutaActual.set(event.urlAfterRedirects);

        // "En línea": se avisa desde cualquier pantalla con sesión (también
        // Resumen, que no tiene barra arriba) — antes lo arrancaba la barra
        // y quien estaba en Resumen no le aparecía a nadie.
        const sinSesion = ['/login', '/register', '/pending'].some(r => event.urlAfterRedirects.startsWith(r));
        if (sinSesion) this.presencia.detener();
        else this.presencia.iniciar();

        this.actualizarTitulo(event.url);

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
  }
}