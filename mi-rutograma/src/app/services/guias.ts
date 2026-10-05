// ============================================================
// GUÍAS DE PRIMERA VEZ — el texto de cada página.
// Cada paso señala un elemento ("el": selector CSS o una marca
// data-guia="..." puesta en el HTML) y lo explica en un cuadro. Si el
// elemento no está en pantalla (por ejemplo, porque la cuenta no tiene
// permiso para ese botón), el paso se salta solo.
// ============================================================

export interface PasoGuia {
  /** Selector CSS, o el nombre de una marca data-guia. */
  el: string;
  titulo: string;
  texto: string;
}

export interface Guia {
  titulo: string;
  pasos: PasoGuia[];
}

/** Botón "?" de ayuda (está en todas las páginas). */
const PASO_AYUDA: PasoGuia = {
  el: '.guia-ayuda-btn',
  titulo: '¿Quieres repasar?',
  texto: 'Con este botón vuelves a ver la guía de la página donde estés, cuando quieras.'
};

export const GUIAS: Record<string, Guia> = {
  // Barra de arriba: se explica una sola vez, en la primera página que la tenga.
  navegacion: {
    titulo: 'La barra de navegación',
    pasos: [
      { el: '.tabs', titulo: 'Pestañas', texto: 'Cada pestaña es una pantalla de la app. Si alguna no cabe, queda dentro de "Más".' },
      { el: '.nav-search', titulo: 'Buscador', texto: 'Escribe una placa, un conductor, una ruta o el nombre de una pantalla y salta directo. Atajo: tecla "/".' },
      { el: 'nav-deshacer', titulo: 'Deshacer y Rehacer', texto: 'Revierte tus últimos cambios (hasta 30). Pasa el mouse por encima para ver qué cambio se va a deshacer.' },
      { el: 'button[title="Descargar Diario"]', titulo: 'Descargar Diario', texto: 'Descarga un archivo con los viajes de hoy, listo para abrir en Excel.' },
      { el: 'button[title="Viaje Extra"]', titulo: 'Viaje Extra', texto: 'Agrega un viaje que no estaba en la matriz. Si el vehículo está ocupado, la app te ofrece cómo resolverlo.' },
      { el: 'button[title="Novedad"]', titulo: 'Novedad', texto: 'Registra un aviso: un vehículo varado, un retraso, un cambio de última hora...' },
      PASO_AYUDA
    ]
  },

  resumen: {
    titulo: 'Resumen del día',
    pasos: [
      { el: '.resumen-grid', titulo: 'Tu día de un vistazo', texto: 'Viajes de hoy, vehículos disponibles, mantenimientos, novedades y documentos por vencer. Lo que sale resaltado necesita atención.' },
      { el: '.resumen-btn', titulo: 'Ir al Dashboard', texto: 'Abre el panel completo con todos los detalles.' },
      PASO_AYUDA
    ]
  },

  dashboard: {
    titulo: 'Dashboard',
    pasos: [
      { el: '.gestion-periodo', titulo: 'Mes que estás viendo', texto: 'Cambia el mes aquí. El Rutograma, los conteos y los reportes de toda la app usan este mes.' },
      { el: '.kgrid', titulo: 'Indicadores', texto: 'Vehículos disponibles hoy, en ruta, en mantenimiento, y los viajes de la semana y del mes.' },
      { el: 'dash-alertas', titulo: 'Alertas activas', texto: 'Lo que hay que revisar ya: documentos vencidos, conflictos, vehículos en taller...' },
      { el: 'dash-disponibles', titulo: 'Disponibles hoy', texto: 'Vehículos libres hoy para asignarles un viaje.' },
      { el: 'dash-semanal', titulo: 'Resumen semanal', texto: 'Cómo va la semana: viajes por día y por transportadora.' },
      { el: 'dash-urgentes', titulo: 'Viajes urgentes', texto: 'Viajes marcados como prioridad que conviene vigilar.' },
      { el: '.card-tabla', titulo: 'Próximas salidas', texto: 'Los viajes que salen esta semana, con vehículo, ruta y hora.' },
      { el: '.card-novedades', titulo: 'Historial de novedades', texto: 'Los avisos registrados. Puedes marcarlos como resueltos.' },
      { el: '.btn-cerrar-sesion', titulo: 'Cerrar sesión', texto: 'Sale de tu cuenta en este computador.' }
    ]
  },

  rutograma: {
    titulo: 'Rutograma',
    pasos: [
      { el: '.ruto-mes-selector', titulo: 'Mes', texto: 'Elige qué mes ver en la matriz.' },
      { el: '.ruto-table-responsive', titulo: 'La matriz', texto: 'Cada fila es un vehículo y cada columna un día. Haz clic en un viaje para ver o editar sus detalles; un día vacío dice si el vehículo está disponible o su conductor descansa.' },
      { el: '.ruto-buscar-vehiculo', titulo: 'Resaltar placa', texto: 'Escribe una placa para encontrar su fila rápido.' },
      { el: '.ruto-legend', titulo: 'Colores', texto: 'Qué significa cada color. Haz clic en Makand, Arsitrans o Polar para ver solo esa transportadora.' },
      { el: '.btn-import', titulo: 'Importar Operación', texto: 'Carga la operación desde un archivo de Excel.' },
      { el: '.btn-export', titulo: 'Exportar y Foto del mes', texto: 'Descarga el Rutograma en Excel, o saca una imagen del mes para compartir.' },
      { el: '.btn-zoom', titulo: 'Zoom', texto: 'Acerca o aleja la matriz para ver más días o más detalle.' },
      { el: '.ruto-tr-cupo-header', titulo: 'Arsitrans y Polar', texto: 'Los cupos de terceros. "+ Confirmar cupo" agrega uno; "Reacomodar" junta los viajes del mes en los menos cupos posibles, sin tocar nada más.' }
    ]
  },

  vehiculos: {
    titulo: 'Vehículos',
    pasos: [
      { el: 'input[placeholder^="Buscar por placa"]', titulo: 'Buscar', texto: 'Filtra por placa, conductor o transportadora.' },
      { el: '.header-actions', titulo: 'Histórico y nuevo vehículo', texto: '"Ver histórico" muestra cómo estaba la flota en meses anteriores. "+ Nuevo Vehículo" registra uno.' },
      { el: 'veh-tabla', titulo: 'La flota', texto: 'Cada vehículo con su conductor, estado, documentos y viajes del mes. "Editar" cambia sus datos; "Mant." lo manda a mantenimiento.' },
      { el: 'veh-viajes', titulo: 'Viajes por vehículo', texto: 'Los viajes de cada vehículo de Makand en el mes.' }
    ]
  },

  rutas: {
    titulo: 'Rutas',
    pasos: [
      { el: 'input[placeholder^="Buscar por código"]', titulo: 'Buscar', texto: 'Filtra por código o destino.' },
      { el: 'rutas-acciones', titulo: 'Acciones', texto: 'Ver el histórico, crear una ruta nueva o confirmar un cupo externo.' },
      { el: '.tabla-rutas', titulo: 'Las rutas', texto: 'Cada ruta con sus días de salida, horas, tiempos y tarifas. Generar Matriz usa esta información para armar el mes.' },
      { el: '.ruta-check-card', titulo: 'Check de rutas', texto: 'Qué rutas salen y se entregan cada día, para revisarlas de un vistazo.' },
      { el: 'rutas-prioridades', titulo: 'Prioridades de horario', texto: 'El orden en que se asignan las rutas de Makand cada día de la semana.' }
    ]
  },

  conductores: {
    titulo: 'Conductores',
    pasos: [
      { el: '.metrics-grid', titulo: 'Resumen', texto: 'Cuántos conductores hay activos, en descanso, incapacitados o de vacaciones.' },
      { el: 'cond-acciones', titulo: 'Histórico y nuevo conductor', texto: '"Ver histórico" muestra meses anteriores; "Nuevo Conductor" registra uno.' },
      { el: 'input[placeholder^="Buscar por nombre"]', titulo: 'Buscar', texto: 'Filtra por nombre, cédula o vehículo.' },
      { el: '.actions-group', titulo: 'Acciones de cada conductor', texto: 'Ver detalles, editar (aquí se ponen la placa y los días de descanso), cambiar estado o eliminar. Al asignarle una placa, los viajes de esa placa desde mañana pasan a su nombre.' },
      { el: 'cond-viajes', titulo: 'Viajes por conductor', texto: 'Los viajes de cada conductor en el mes.' }
    ]
  },

  configuracion: {
    titulo: 'Configuración',
    pasos: [
      { el: 'conf-parametros', titulo: 'Parámetros generales', texto: 'El mes activo y los festivos para generar la matriz.' },
      { el: 'conf-generar', titulo: 'Generar Matriz del Mes', texto: 'Arma todos los viajes del mes a partir de las rutas y la flota. Antes de aplicar te muestra cuántos viajes va a crear, y se puede deshacer.' },
      { el: 'conf-transportadoras', titulo: 'Transportadoras', texto: 'Las empresas con las que se trabaja.' },
      { el: 'conf-motor', titulo: 'Motor de reasignación', texto: 'Cómo se reacomodan los viajes cuando un vehículo queda ocupado.' },
      { el: 'conf-modo', titulo: 'Modo de trabajo', texto: 'Modo Prueba trabaja sobre una copia: lo que hagas ahí no toca la operación real.' },
      { el: 'conf-apariencia', titulo: 'Apariencia', texto: 'Cambia entre modo claro y oscuro.' },
      { el: 'conf-respaldos', titulo: 'Respaldos', texto: 'Cada cambio guarda un respaldo automático. Desde aquí se puede volver a un momento anterior.' },
      { el: 'conf-importar', titulo: 'Importar viajes reales', texto: 'Sube el Excel de operación. Antes de guardar ves qué entra y qué se corrigió.' },
      { el: 'conf-vencimientos', titulo: 'Resumen de vencimientos', texto: 'Envía ahora por correo el resumen de SOAT, tecnomecánicas y licencias por vencer.' }
    ]
  },

  historico: {
    titulo: 'Histórico',
    pasos: [
      { el: '.button-group', titulo: 'Acciones', texto: '"Cerrar mes" guarda una foto del mes que estás viendo (no borra viajes). También puedes exportar todo a Excel.' },
      { el: '.tendencia-card', titulo: 'Tendencia', texto: 'Cómo han cambiado el costo y los viajes mes a mes.' },
      { el: '.historico-item', titulo: 'Meses guardados', texto: 'Cada mes cerrado con sus totales. Haz clic para ver el detalle.' }
    ]
  },

  comparativo: {
    titulo: 'Comparativo',
    pasos: [
      { el: '.comp-header', titulo: 'Comparar meses', texto: 'Elige entre comparar 2 meses o ver los últimos 6, y exporta el resultado.' },
      { el: '.comp-ritmo', titulo: 'Ritmo del mes', texto: 'Si el mes va por encima o por debajo del anterior a esta misma fecha.' },
      { el: '.comp-cumplimiento', titulo: 'Cumplimiento', texto: 'Qué tanto se cumplió lo programado.' }
    ]
  },

  sesiones: {
    titulo: 'Sesiones',
    pasos: [
      { el: '.ses-cupo', titulo: 'Sesiones usadas', texto: 'Cuántos equipos tienen abierta tu cuenta, y el máximo permitido.' },
      { el: '.ses-list', titulo: 'Tus equipos', texto: 'Cada computador o celular donde entraste. "Sacar" cierra la sesión de ese equipo y lo bloquea hasta que el administrador lo desbloquee.' },
      { el: '.ses-actions', titulo: 'Más acciones', texto: 'Cerrar todas las demás sesiones de una vez.' }
    ]
  },

  aprobaciones: {
    titulo: 'Aprobaciones',
    pasos: [
      { el: '.apr-vistas', titulo: 'Pendientes e historial', texto: 'Los cambios que esperan aprobación, y los que ya se aprobaron o rechazaron.' },
      { el: '.apr-lista', titulo: 'Solicitudes', texto: 'Cada cambio con quién lo pidió. Quien puede aprobar ve "Aprobar" (se aplica tal cual) o "Rechazar" (con un motivo que la persona verá).' }
    ]
  },

  admin: {
    titulo: 'Administración',
    pasos: [
      { el: '.admin-tabs', titulo: 'Secciones', texto: 'Cuentas, Auditoría (quién cambió qué y cuándo), y según tus permisos, Correo y Dispositivos.' },
      { el: '.user-table', titulo: 'Cuentas', texto: 'Las solicitudes más recientes arriba. Aquí se aprueban, rechazan o eliminan, y el administrador elige el rol y los permisos de cada una.' }
    ]
  }
};

/** Página de la app a partir de la URL ("/rutograma?x=1" -> "rutograma"). */
export function paginaDeUrl(url: string): string {
  return String(url || '').split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0];
}

/** Páginas sin la barra de navegación (no se explica la barra ahí). */
export const PAGINAS_SIN_NAVBAR = ['login', 'register', 'pending', 'resumen'];
