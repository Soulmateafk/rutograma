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
  texto: 'Aquí vuelves a ver la guía de la página donde estés, o aprendes paso a paso cómo hacer una tarea ("¿Cómo hago…?").'
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
      { el: 'ruto-aprobaciones', titulo: 'Cambios por aprobar', texto: 'Si alguien pidió cambios que esperan tu aprobación, aquí lo ves. Los viajes afectados llevan la marca "Cambio por aprobar".' },
      { el: '.ruto-mes-selector', titulo: 'Mes', texto: 'Elige qué mes ver en la matriz.' },
      { el: '.ruto-table-responsive', titulo: 'La matriz', texto: 'Cada fila es un vehículo y cada columna un día. Haz clic en un viaje para ver o editar sus detalles; un día vacío dice si el vehículo está disponible o su conductor descansa.' },
      { el: '.ruto-buscar-vehiculo', titulo: 'Resaltar placa', texto: 'Escribe una placa para encontrar su fila rápido.' },
      { el: '.ruto-legend', titulo: 'Colores', texto: 'Qué significa cada color. Haz clic en Makand, Arsitrans o Polar para ver solo esa transportadora.' },
      { el: '.btn-import', titulo: 'Importar Operación', texto: 'Carga la operación desde un archivo de Excel.' },
      { el: '.btn-export', titulo: 'Exportar y Foto del mes', texto: 'Descarga el Rutograma en Excel, o saca una imagen del mes para compartir.' },
      { el: '.btn-zoom', titulo: 'Zoom', texto: 'Acerca o aleja la matriz para ver más días o más detalle.' },
      { el: '.ruto-card-viaje', titulo: 'Detalle e historial', texto: 'Al abrir un viaje ves sus datos y, con "Ver historial de cambios", quién lo cambió, qué y cuándo.' },
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
      { el: 'conf-mi-cuenta', titulo: 'Mi cuenta', texto: 'Cambia tu contraseña cuando quieras (necesitas la actual). Al cambiarla, tu sesión se cierra en los demás equipos.' },
      { el: 'conf-guias', titulo: 'Guías', texto: 'Desde aquí vuelves a ver todas las guías de la app.' },
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

  'mis-viajes': {
    titulo: 'Mis viajes',
    pasos: [
      { el: 'mv-identificar', titulo: 'Identifícate', texto: 'Escribe tu nombre y la placa del vehículo. Luego confirmas que la información sea correcta.' },
      { el: 'mv-cabecera', titulo: 'Tu cuenta', texto: 'Tu nombre y tu vehículo. Con los botones actualizas o cierras sesión.' },
      { el: 'mv-foto', titulo: 'Foto de tus viajes', texto: 'Descarga una imagen con tus viajes para tenerla a mano o compartirla.' },
      { el: 'mv-dias', titulo: 'Tus viajes por día', texto: 'Hoy y los próximos días, con destino, hora, vehículo y cuándo regresas. Los días de descanso salen marcados. Se actualiza sola cada minuto.' },
      PASO_AYUDA
    ]
  },

  admin: {
    titulo: 'Administración',
    pasos: [
      { el: '.admin-tabs', titulo: 'Secciones', texto: 'Cuentas, Auditoría (quién cambió qué y cuándo), y según tus permisos, Correo y Dispositivos.' },
      { el: '.cuenta-conductores', titulo: 'Cuenta de conductores', texto: 'Una cuenta compartida para todos los conductores: cada uno escribe su nombre y placa para ver sus viajes.' },
      { el: '.user-table', titulo: 'Cuentas', texto: 'Las solicitudes más recientes arriba. Aquí se aprueban, rechazan o eliminan, y el administrador elige el rol y los permisos de cada una.' }
    ]
  }
};

// ============================================================
// TAREAS "¿CÓMO HAGO…?" — guías paso a paso que se abren desde el
// botón "?". Solo SEÑALAN: abren el formulario real (la persona toca el
// botón iluminado), explican cada campo y al terminar lo cierran SIN
// GUARDAR. Mientras la guía está abierta no se puede escribir ni guardar
// nada, así que nunca queda información de prueba ni a medias.
// ============================================================

export interface PasoTarea extends PasoGuia {
  /** La persona debe tocar el elemento iluminado para seguir (abre algo, nunca guarda). */
  tocar?: boolean;
}

export type RequisitoTarea = 'editar' | 'aprobar' | 'noAprobar';

export interface Tarea {
  clave: string;
  titulo: string;
  /** Página donde se hace (si no se indica, sirve cualquiera con la barra de arriba). */
  pagina?: string;
  requiere: RequisitoTarea;
  pasos: PasoTarea[];
  /** Botones "Cancelar/Cerrar" que se tocan al terminar, para no dejar nada abierto. */
  cerrar?: string[];
}

/** Lo que se dice al empezar toda tarea que abre un formulario. */
const AVISO_SIN_GUARDAR = 'Esta guía solo te muestra dónde está cada cosa: no escribe ni guarda nada. Al terminar, el formulario se cierra sin guardar.';
const AVISO_APROBACION = ' Si tu cuenta necesita aprobación, lo que guardes queda pendiente hasta que el jefe lo apruebe.';

export const TAREAS: Tarea[] = [
  {
    clave: 'viaje-extra',
    titulo: 'Agregar un viaje extra',
    requiere: 'editar',
    cerrar: ['ve-cerrar'],
    pasos: [
      { el: '', titulo: 'Agregar un viaje extra', texto: AVISO_SIN_GUARDAR },
      { el: 'button[title="Viaje Extra"]', tocar: true, titulo: 'Abre el formulario', texto: 'Toca el botón iluminado "+ Viaje Extra".' },
      { el: 've-vehiculo', titulo: 'Vehículo', texto: 'Elige qué vehículo hace el viaje (los urbanos no salen en esta lista).' },
      { el: 've-ruta', titulo: 'Ruta', texto: 'Elige la ruta. Con ella se calculan el destino y los días que dura el viaje.' },
      { el: 've-fecha', titulo: 'Fecha', texto: 'El día en que sale el viaje.' },
      { el: 've-cliente', titulo: 'Cliente', texto: 'Para quién es el viaje. Se llena solo al elegir la ruta; cámbialo si es otro.' },
      { el: 've-cajas', titulo: 'Cajas', texto: 'Cuántas cajas lleva. También se llena con las de la ruta; cámbialo si lleva otra cantidad.' },
      { el: 've-hora', titulo: 'Hora', texto: 'A qué hora sale.' },
      { el: 've-guardar', titulo: 'Guardar viaje', texto: 'Cuando lo hagas de verdad, aquí lo guardas. Si el vehículo ya tiene un viaje ese día, la app te ofrece cómo resolverlo.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Ya sabes cómo agregar un viaje extra. Al terminar, este formulario se cierra sin guardar nada.' }
    ]
  },
  {
    clave: 'cambiar-conductor',
    titulo: 'Cambiar el conductor de un viaje',
    pagina: 'rutograma',
    requiere: 'editar',
    cerrar: ['ruto-cerrar'],
    pasos: [
      { el: '', titulo: 'Cambiar el conductor de un viaje', texto: AVISO_SIN_GUARDAR },
      { el: 'ruto-viaje', tocar: true, titulo: 'Abre un viaje', texto: 'Toca el viaje iluminado (o cualquiera: se abre igual para todos). Solo vas a ver su detalle.' },
      { el: 'ruto-editar', tocar: true, titulo: 'Editar viaje', texto: 'Toca "Editar viaje" para ver los campos que se pueden cambiar. No se guarda nada todavía.' },
      { el: 'ruto-conductor', titulo: 'Conductor', texto: 'Aquí eliges el nuevo conductor de la lista. Cada uno sale con su placa, y si no está activo (descanso, vacaciones…) también se indica.' },
      { el: 'ruto-guardar', titulo: 'Guardar cambios', texto: 'Cuando lo hagas de verdad, aquí guardas el cambio. Queda en el historial del viaje.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Al terminar, el viaje se cierra tal como estaba, sin cambios.' }
    ]
  },
  {
    clave: 'descanso',
    titulo: 'Poner días de descanso a un conductor',
    pagina: 'conductores',
    requiere: 'editar',
    cerrar: ['cond-cancelar'],
    pasos: [
      { el: '', titulo: 'Días de descanso', texto: AVISO_SIN_GUARDAR },
      { el: 'cond-editar', tocar: true, titulo: 'Abre el conductor', texto: 'Toca el lápiz del conductor (aquí el primero de la lista, pero es igual para todos).' },
      { el: 'cond-descanso', titulo: 'Días de descanso del mes', texto: 'Eliges el mes y el año, escribes los días separados por coma (ej: 20,21,22) y tocas "+ Agregar". Esos días salen como DESCANSANDO en el Rutograma.' },
      { el: 'cond-guardar', titulo: 'Guardar Cambios', texto: 'Cuando lo hagas de verdad, aquí guardas.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Al terminar, el formulario se cierra sin guardar nada.' }
    ]
  },
  {
    clave: 'asignar-vehiculo',
    titulo: 'Asignar un conductor a un vehículo',
    pagina: 'conductores',
    requiere: 'editar',
    cerrar: ['cond-cancelar'],
    pasos: [
      { el: '', titulo: 'Asignar conductor a un vehículo', texto: AVISO_SIN_GUARDAR },
      { el: 'cond-editar', tocar: true, titulo: 'Abre el conductor', texto: 'Toca el lápiz del conductor (aquí el primero de la lista, pero es igual para todos).' },
      { el: 'cond-vehiculo', titulo: 'Vehículo asignado', texto: 'Escribe la placa. Al guardar, los viajes de esa placa desde mañana pasan a nombre de este conductor; los de días pasados no se tocan.' },
      { el: 'cond-guardar', titulo: 'Guardar Cambios', texto: 'Cuando lo hagas de verdad, aquí guardas.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Al terminar, el formulario se cierra sin guardar nada.' }
    ]
  },
  {
    clave: 'mantenimiento',
    titulo: 'Mandar un vehículo a mantenimiento',
    pagina: 'vehiculos',
    requiere: 'editar',
    cerrar: ['veh-mant-cancelar'],
    pasos: [
      { el: '', titulo: 'Mantenimiento', texto: AVISO_SIN_GUARDAR },
      { el: 'veh-mant', tocar: true, titulo: 'Abre el mantenimiento', texto: 'Toca "Mant." del vehículo (aquí el primero de la lista, pero es igual para todos).' },
      { el: 'veh-mant-fechas', titulo: 'Fechas', texto: 'Desde y hasta cuándo estará en el taller. Esos días el vehículo sale en rojo en el Rutograma y no se le asignan viajes.' },
      { el: 'veh-mant-guardar', titulo: 'Guardar', texto: 'Cuando lo hagas de verdad, aquí guardas. Los viajes que tenía esos días se cancelan, y el siguiente viaje se acomoda para el día en que sale del taller.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Al terminar, el formulario se cierra sin guardar nada.' }
    ]
  },
  {
    clave: 'novedad',
    titulo: 'Registrar una novedad',
    requiere: 'editar',
    cerrar: ['nov-cerrar'],
    pasos: [
      { el: '', titulo: 'Registrar una novedad', texto: AVISO_SIN_GUARDAR },
      { el: 'button[title="Novedad"]', tocar: true, titulo: 'Abre el formulario', texto: 'Toca el botón iluminado "Novedad".' },
      { el: 'nov-tipo', titulo: 'Tipo', texto: 'Incidente, retraso, avería o aviso general.' },
      { el: 'nov-titulo', titulo: 'Título', texto: 'Un resumen corto, ej: "ABC123 varado en Ibagué".' },
      { el: 'nov-desc', titulo: 'Descripción', texto: 'Los detalles: qué pasó, dónde y qué se hizo.' },
      { el: 'nov-guardar', titulo: 'Guardar novedad', texto: 'Cuando lo hagas de verdad, aquí la guardas. Sale en el Dashboard, donde luego se marca como resuelta.' + AVISO_APROBACION },
      { el: '', titulo: '¡Listo!', texto: 'Al terminar, el formulario se cierra sin guardar nada.' }
    ]
  },
  {
    clave: 'aprobar',
    titulo: 'Aprobar o rechazar cambios',
    pagina: 'aprobaciones',
    requiere: 'aprobar',
    pasos: [
      { el: '', titulo: 'Aprobar o rechazar cambios', texto: 'Esta guía solo te muestra los botones: no aprueba ni rechaza nada.' },
      { el: '.apr-vistas', titulo: 'Pendientes', texto: 'Aquí están los cambios que esperan tu respuesta. En el Rutograma también te sale un aviso cuando hay pendientes.' },
      { el: '.apr-item', titulo: 'Cada cambio', texto: 'Qué se quiere cambiar, quién lo pidió y cuándo.' },
      { el: '.apr-acciones', titulo: 'Ver detalle, Aprobar o Rechazar', texto: '"Ver detalle" muestra exactamente qué cambia. "Aprobar" lo aplica tal cual; "Rechazar" te pide un motivo, que la persona verá.' },
      { el: '.apr-barra', titulo: 'Varios a la vez', texto: 'Si hay varios, márcalos y apruébalos o recházalos juntos.' },
      { el: '', titulo: '¡Listo!', texto: 'Si no hay pendientes ahora, algunos pasos no se muestran. Lo que apruebes queda en el historial del viaje.' }
    ]
  },
  {
    clave: 'mis-solicitudes',
    titulo: 'Ver si me aprobaron un cambio',
    pagina: 'aprobaciones',
    requiere: 'noAprobar',
    pasos: [
      { el: '.apr-vistas', titulo: 'Tus solicitudes', texto: '"Pendientes" son los cambios que esperan al jefe; "Historial", los que ya se aprobaron o rechazaron.' },
      { el: '.apr-item', titulo: 'Cada cambio', texto: 'Qué pediste y en qué estado va. Si lo rechazaron, aquí ves el motivo.' },
      { el: '', titulo: '¡Listo!', texto: 'Mientras un cambio está pendiente, en el Rutograma el viaje lleva la marca "Cambio por aprobar".' }
    ]
  }
];

/** Página de la app a partir de la URL ("/rutograma?x=1" -> "rutograma"). */
export function paginaDeUrl(url: string): string {
  return String(url || '').split(/[?#]/)[0].replace(/^\/+/, '').split('/')[0];
}

/** Páginas sin la barra de navegación (no se explica la barra ahí). */
export const PAGINAS_SIN_NAVBAR = ['login', 'register', 'pending', 'resumen', 'mis-viajes'];
