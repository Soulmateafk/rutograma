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
      { el: '.nav-search', titulo: 'Buscador (Ctrl + K)', texto: 'Escribe un viaje ("PRZ 065 12", "cali d1"), una placa, un conductor, una ruta, una pantalla o una acción ("viaje extra", "novedad", "diario") y salta directo. Con las flechas te mueves y con Enter abres.' },
      { el: 'nav-en-linea', titulo: 'En línea', texto: 'Quién más está usando la app ahora mismo, en qué página y qué está haciendo. También salen tus otras ventanas o equipos abiertos con tu cuenta, como "Tú". No queda en ningún historial.' },
      { el: 'nav-deshacer', titulo: 'Deshacer y Rehacer', texto: 'Revierte tus últimos cambios (hasta 30). Pasa el mouse por encima para ver qué cambio se va a deshacer.' },
      { el: 'button[title="Descargar Diario"]', titulo: 'Descargar Diario', texto: 'Descarga un archivo con los viajes de hoy, listo para abrir en Excel.' },
      { el: 'button[title="Viaje Extra"]', titulo: 'Viaje Extra', texto: 'Agrega un viaje que no estaba en la matriz. Si el vehículo está ocupado, la app te ofrece cómo resolverlo.' },
      { el: 'button[title="Novedad"]', titulo: 'Novedad', texto: 'Registra un aviso: un vehículo varado, un retraso, un cambio de última hora...' },
      { el: 'nav-apariencia', titulo: 'Apariencia y atajos', texto: 'Modo claro u oscuro y letra más grande, solo para tu cuenta (las demás no cambian). Desde aquí también instalas la app y ves los atajos de teclado (tecla ?).' },
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
      { el: 'pizarra', titulo: 'Pizarra', texto: 'Anuncios para todo el equipo (ej. "mañana cierre en la vía al Llano"). Quedan fijos hasta que se quitan o hasta su fecha. Los "para oficina y conductores" también los ven los conductores en Mis viajes.' },
      { el: 'dash-capacidad', titulo: 'Capacidad de la semana', texto: 'Para cada uno de los próximos 7 días: cuántos viajes hay frente a los vehículos propios operativos. Si dice "faltan 2", esos viajes van en terceros o hay que conseguir cupo con tiempo.' },
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
      { el: 'ruto-novedades-conductores', titulo: 'Novedades de conductores', texto: 'Lo que reportan los conductores desde el celular (varado, retraso, accidente) sale aquí hasta que alguien lo marque como resuelto.' },
      { el: 'ruto-revision', titulo: 'Viajes por revisar', texto: 'Viajes de aquí en adelante con el SOAT, la tecnomecánica o la licencia vencidos en las fechas del viaje, o que se cruzan con otro viaje del mismo vehículo o conductor. Sale minimizado: toca "Ver" para desplegar la lista, y "Abrir" para ir a cada viaje. Al guardar un viaje con documentos vencidos, la app no lo deja.' },
      { el: 'ruto-aprobaciones', titulo: 'Cambios por aprobar', texto: 'Si alguien pidió cambios que esperan tu aprobación, aquí lo ves. Los viajes afectados llevan la marca "Cambio por aprobar".' },
      { el: '.ruto-mes-selector', titulo: 'Mes', texto: 'Elige qué mes ver en la matriz.' },
      { el: 'ruto-semanas', titulo: 'Semanas cerradas', texto: 'Cuando la programación de una semana está lista, el jefe la cierra con un clic (candado). Desde ahí, cambiar su plan —vehículo, conductor, ruta, cliente, cajas, fechas, cancelar o eliminar— pide un motivo, y queda en "Ver cambios después del cierre" con quién, cuándo y por qué. Marcar Entregado o escribir observaciones sigue igual. Los días de una semana cerrada llevan un candado en la cabecera.' },
      { el: '.ruto-table-responsive', titulo: 'La matriz', texto: 'Cada fila es un vehículo y cada columna un día. Haz clic en un viaje para ver o editar sus detalles; un día vacío dice si el vehículo está disponible o su conductor descansa.' },
      { el: '.ruto-buscar-vehiculo', titulo: 'Resaltar placa', texto: 'Escribe una placa para encontrar su fila rápido.' },
      { el: '.ruto-legend', titulo: 'Colores', texto: 'Qué significa cada color. Haz clic en Makand, Arsitrans o Polar para ver solo esa transportadora.' },
      { el: '.btn-import', titulo: 'Importar Operación', texto: 'Carga la operación desde un archivo de Excel.' },
      { el: '.btn-export', titulo: 'Exportar y Foto del mes', texto: 'Descarga el Rutograma en Excel, o saca una imagen del mes para compartir.' },
      { el: 'ruto-pdf-semana', titulo: 'PDF de la semana', texto: 'Descarga la semana elegida en PDF: una hoja por día con vehículo, conductor, ruta, cliente y hora. Listo para imprimir o mandar por WhatsApp.' },
      { el: 'ruto-compartir-semana', titulo: 'Compartir por WhatsApp', texto: 'Crea el mismo PDF y abre el menú de compartir del equipo: eliges WhatsApp y el chat o grupo, sin buscar el archivo en Descargas. Si el navegador no lo permite, el PDF se descarga.' },
      { el: '.btn-zoom', titulo: 'Zoom', texto: 'Acerca o aleja la matriz para ver más días o más detalle.' },
      { el: 'ruto-queja', titulo: 'Queja del cliente', texto: 'Dentro del detalle de un viaje, "Queja" registra una queja del cliente sobre ese viaje (devolución, carga rechazada, reclamo...), con cliente, vehículo y conductor ya puestos.' },
      { el: 'ruto-hoja-ruta', titulo: 'Hoja de ruta', texto: 'Dentro del detalle de un viaje, "Hoja de ruta" crea un PDF para entregarle al conductor: salida, hora, regreso, ruta, cliente, carga, vehículo, sus datos, la nota y espacio para firmas de entrega.' },
      { el: '.ruto-card-viaje', titulo: 'Detalle, notas e historial', texto: 'Al abrir un viaje ves sus datos; en "Editar viaje" le puedes poner una nota para el conductor (la ve en su celular). Con "Ver historial de cambios" ves quién lo cambió, qué y cuándo.' },
      { el: '.ruto-tr-cupo-header', titulo: 'Arsitrans y Polar', texto: 'Los cupos de terceros. "+ Confirmar cupo" agrega uno; "Reacomodar" junta los viajes del mes en los menos cupos posibles, sin tocar nada más.' }
    ]
  },

  vehiculos: {
    titulo: 'Vehículos',
    pasos: [
      { el: 'input[placeholder^="Buscar por placa"]', titulo: 'Buscar', texto: 'Filtra por placa, conductor o transportadora.' },
      { el: '.header-actions', titulo: 'Histórico y nuevo vehículo', texto: '"Ver histórico" muestra cómo estaba la flota en meses anteriores. "+ Nuevo Vehículo" registra uno.' },
      { el: 'veh-tabla', titulo: 'La flota', texto: 'Cada vehículo con su conductor, estado, documentos y viajes del mes. "Editar" cambia sus datos; "Mant." lo manda a mantenimiento.' },
      { el: 'veh-hoja', titulo: 'Hoja de vida', texto: 'Todo lo de un vehículo en una pantalla: viajes por mes, conductores que lo han manejado, mantenimientos, veces que se ha varado, documentos y novedades. Se puede imprimir.' },
      { el: 'veh-viajes', titulo: 'Viajes por vehículo', texto: 'Los viajes de cada vehículo de Makand en el mes.' },
      { el: 'veh-ocupacion', titulo: 'Qué tan lleno va cada camión', texto: 'Promedio de cajas por viaje frente a la capacidad de cada vehículo en el mes. En rojo los que van a menos de la mitad: se podría juntar carga o usar uno más pequeño.' }
    ]
  },

  mapa: {
    titulo: 'Mapa de destinos',
    pasos: [
      { el: 'mp-mapa', titulo: 'El mapa', texto: 'Líneas desde Bogotá a cada destino del mes: más gruesas mientras más viajes. Toca un círculo para ver cuántos viajes, de qué clientes y en qué vehículos. El mapa de fondo necesita internet.' },
      { el: 'mp-lista', titulo: 'Los destinos', texto: 'De más a menos viajes. Toca uno para ir a él. Si alguno sale en amarillo ("Ubicar"), no se conoce: tócalo y haz clic en el mapa donde queda; queda guardado para todos.' }
    ]
  },

  quejas: {
    titulo: 'Quejas de clientes',
    pasos: [
      { el: 'qj-nueva', titulo: 'Registrar', texto: 'Anota cada devolución, carga rechazada, reclamo o demora: cliente, tipo y qué pasó. Desde el detalle de un viaje en el Rutograma ("Queja") llega con el viaje ya puesto.' },
      { el: 'qj-ranking', titulo: 'Quiénes dan más problemas', texto: 'Los clientes con más quejas en los últimos 90 días y de qué tipo.' },
      { el: 'qj-lista', titulo: 'La lista', texto: 'Las abiertas primero. "Cerrar" cuando se resuelva, con cómo se resolvió.' }
    ]
  },

  comparendos: {
    titulo: 'Comparendos',
    pasos: [
      { el: 'cp-nuevo', titulo: 'Registrar', texto: 'Anota cada comparendo: fecha, vehículo, conductor (se propone el titular), motivo y valor.' },
      { el: 'cp-lista', titulo: 'La lista', texto: 'Los sin pagar en rojo. "Marcar pagado" cuando se pague. También salen en la hoja de vida del vehículo y en el detalle del conductor.' }
    ]
  },

  reglas: {
    titulo: 'Reglas de asignación',
    pasos: [
      { el: 'rg-reglas', titulo: 'Por cliente o ruta', texto: 'Ej. "D1 solo en furgón refrigerado" o "BOG-MON mínimo 600 cajas". Si alguien asigna un vehículo que no cumple, la app avisa al guardar.' },
      { el: 'rg-pico', titulo: 'Pico y placa', texto: 'Días, últimos dígitos de placa y horario en que no pueden circular. Se compara con la hora de salida del viaje.' }
    ]
  },

  'hoja-de-vida': {
    titulo: 'Hoja de vida',
    pasos: [
      { el: 'hv-cabecera', titulo: 'El vehículo', texto: 'Sus datos de hoy: estado, conductor, capacidad y último mantenimiento.' },
      { el: '.hv-kpis', titulo: 'En números', texto: 'Viajes hechos, de este mes y próximos, días en taller, veces que se ha varado y viajes cancelados.' },
      { el: '.hv-grid', titulo: 'El detalle', texto: 'Documentos (en rojo los vencidos), conductores que lo han manejado, viajes por mes, destinos, mantenimientos, averías y sus viajes.' },
      { el: '.hv-btn', titulo: 'Imprimir', texto: 'Imprime la hoja o guárdala como PDF.' }
    ]
  },

  agenda: {
    titulo: 'Agenda del conductor',
    pasos: [
      { el: 'ag-cabecera', titulo: 'El conductor y el mes', texto: 'Con las flechas cambias de mes; arriba eliges otro conductor.' },
      { el: '.ag-kpis', titulo: 'En números', texto: 'Viajes del mes, días en ruta, descansos y días libres.' },
      { el: 'ag-calendario', titulo: 'El calendario', texto: 'Azul: el día que sale a un viaje (ruta, destino, vehículo y hora) y los días que sigue en ruta. Morado: descanso. Si un descanso tiene viaje, el día se marca en naranja.' }
    ]
  },

  rutas: {
    titulo: 'Rutas',
    pasos: [
      { el: 'input[placeholder^="Buscar por código"]', titulo: 'Buscar', texto: 'Filtra por código o destino.' },
      { el: 'rutas-acciones', titulo: 'Acciones', texto: 'Ver el histórico, crear una ruta nueva o confirmar un cupo externo.' },
      { el: '.tabla-rutas', titulo: 'Las rutas', texto: 'Cada ruta con sus días de salida, horas, tiempos y tarifas. Generar Matriz usa esta información para armar el mes.' },
      { el: '.ruta-check-card', titulo: 'Check de rutas', texto: 'Qué rutas salen y se entregan cada día, para revisarlas de un vistazo.' },
      { el: 'rutas-prioridades', titulo: 'Prioridades de horario', texto: 'El orden en que se asignan las rutas de Makand cada día de la semana.' },
      { el: 'rutas-duracion', titulo: 'Duración real', texto: 'Con el "Ya salí" y "Ya llegué" de los conductores: cuánto tarda de verdad cada ruta frente a los días en tránsito programados. Sirve para ajustar los días de la ruta.' }
    ]
  },

  conductores: {
    titulo: 'Conductores',
    pasos: [
      { el: '.metrics-grid', titulo: 'Resumen', texto: 'Cuántos conductores hay activos, en descanso, incapacitados o de vacaciones.' },
      { el: 'cond-acciones', titulo: 'Histórico y nuevo conductor', texto: '"Ver histórico" muestra meses anteriores; "Nuevo Conductor" registra uno.' },
      { el: 'input[placeholder^="Buscar por nombre"]', titulo: 'Buscar', texto: 'Filtra por nombre, cédula o vehículo.' },
      { el: '.actions-group', titulo: 'Acciones de cada conductor', texto: 'Ver detalles, editar (aquí se ponen la placa y los días de descanso), cambiar estado o eliminar. Al asignarle una placa, los viajes de esa placa desde mañana pasan a su nombre.' },
      { el: 'cond-agenda', titulo: 'Agenda del conductor', texto: 'Su mes en un calendario: qué día sale a cada viaje (ruta, destino, vehículo y hora), los días en ruta, sus descansos y los días libres. Se puede imprimir.' },
      { el: 'cond-whatsapp', titulo: 'Avisar por WhatsApp', texto: 'Abre el chat de WhatsApp del conductor con sus viajes de los próximos 7 días ya escritos (fecha, vehículo, ruta, hora y nota). Solo revisas y tocas Enviar. Necesita su celular guardado.' },
      { el: 'cond-carga', titulo: 'Carga de trabajo', texto: 'Quién lleva más y menos viajes en el mes, cuántos días en ruta, kilómetros, descansos y cuántos días seguidos ha manejado sin descansar. Rojo: sobrecargado; amarillo: poca carga.' },
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

  cumplimiento: {
    titulo: 'Cumplimiento',
    pasos: [
      { el: 'cu-mes', titulo: 'Mes', texto: 'Elige qué mes ver. Se calcula con lo que marcan los conductores en su celular ("Ya salí" / "Ya llegué").' },
      { el: 'cu-kpis', titulo: 'Cómo va el mes', texto: 'Cuántos viajes se marcan, cuántos salen a tiempo (hasta 30 minutos después de la hora), el retraso promedio y cuánto tardan hasta el destino.' },
      { el: 'cu-tabla', titulo: 'El detalle', texto: 'Lo mismo por conductor, por ruta o por transportadora. Verde va bien; amarillo y rojo, hay que revisar.' }
    ]
  },

  comparativo: {
    titulo: 'Comparativo',
    pasos: [
      { el: '.comp-header', titulo: 'Comparar meses', texto: 'Elige entre comparar 2 meses o ver los últimos 6, y exporta el resultado.' },
      { el: '.comp-ritmo', titulo: 'Ritmo del mes', texto: 'Si el mes va por encima o por debajo del anterior a esta misma fecha.' },
      { el: 'comp-analizar', titulo: 'Analizar en detalle', texto: 'Con los dos meses elegidos, este botón desglosa qué cambió: viajes, cajas, cancelados, extras, terceros; qué rutas, clientes, vehículos y conductores subieron o bajaron, cuáles son nuevos y cuáles dejaron de aparecer; cancelaciones por motivo, quejas, comparendos y los cargues de Despachos. Arriba salen las conclusiones en palabras. Solo se calcula cuando lo oprimes.' },
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
      { el: 'mv-calendario', titulo: 'Tu calendario', texto: 'Descarga tus viajes de hoy en adelante para agregarlos al calendario del celular. Si te cambian un viaje, vuelve a descargarlo y se actualiza.' },
      { el: 'mv-reportar', titulo: 'Reportar novedad', texto: 'Si quedas varado, te retrasas o pasa algo, avísale a la oficina desde aquí. Puedes adjuntar una foto (llanta, golpe, carga). Si es urgente, llama también.' },
      { el: 'mv-avisos', titulo: 'Cambios en tus viajes', texto: 'Si te agregan, cambian o quitan un viaje, aquí te avisa y el viaje sale marcado. Toca "Entendido" cuando lo hayas visto.' },
      { el: '.mv-acciones-viaje', titulo: 'Ya salí / Ya llegué', texto: 'Cuando arranques, toca "Ya salí"; al llegar al destino, "Ya llegué". La oficina lo ve al instante. Si tocaste por error, tienes 15 minutos para deshacerlo.' },
      { el: 'mv-dias', titulo: 'Tus viajes por día', texto: 'Hoy y los próximos días, con destino, hora, vehículo y cuándo regresas. Los días de descanso salen marcados. Se actualiza sola cada minuto.' },
      { el: 'mv-apariencia', titulo: 'Apariencia', texto: 'Modo claro (mejor de día, al sol) u oscuro y letra más grande. Si es tu propia cuenta, se guarda en ella; en la cuenta compartida queda solo en este celular.' },
      { el: '', titulo: 'Instálala en el celular', texto: 'En el mismo botón de Apariencia está "Instalar": queda el ícono de MAKAND en el celular y se abre como una aplicación, sin escribir la dirección. Si no aparece, en el menú del navegador toca "Instalar aplicación" o "Agregar a inicio".' },
      PASO_AYUDA
    ]
  },

  papelera: {
    titulo: 'Papelera',
    pasos: [
      { el: 'pp-filtros', titulo: 'Qué se eliminó', texto: 'Viajes, vehículos, rutas, conductores, novedades y despachos eliminados en los últimos 30 días. Filtra por tipo.' },
      { el: 'pp-lista', titulo: 'Recuperar', texto: 'Con "Recuperar" vuelve tal como estaba. Si después se creó otro igual (misma placa, mismo viaje), no se pisa: avisa. A los 30 días se borra para siempre.' }
    ]
  },

  despachos: {
    titulo: 'Despachos',
    pasos: [
      { el: 'dp-despachador', titulo: 'Quién despacha', texto: 'Escribe tu nombre. Este equipo lo recuerda para la próxima vez; si despacha otra persona, cámbialo.' },
      { el: 'dp-llegada', titulo: 'Fecha y hora programada', texto: 'La fecha del despacho. La hora programada se llena sola al escoger el viaje, y la puedes cambiar.' },
      { el: 'dp-vehiculo', titulo: 'Placa', texto: 'Escribe la placa; la app te sugiere las de la flota y muestra el conductor.' },
      { el: 'dp-viaje', titulo: 'A qué viaje va', texto: 'Escoge el viaje programado y la ruta y el lugar se llenan solos. Si va a otra parte, escoge "Otro lugar" y escríbelos.' },
      { el: 'dp-horas', titulo: 'Las horas', texto: 'Llegada, inicio de cargue, fin de cargue y salida. "Ahora" pone la hora de este momento. Las que todavía no pasan, déjalas vacías.' },
      { el: 'dp-carga', titulo: 'Qué se carga', texto: 'Abre la lista y marca uno o varios tipos (Makand x25, Ifco x13, estibas...). Por cada uno sale una casilla para la cantidad: solo acepta números. Si marcaste uno por error, quítalo con la ✕ o desmárcalo.' },
      { el: 'dp-sugerida', titulo: 'Carga de la última vez', texto: 'Al escoger el viaje, la app busca la carga de la última vez para esa ruta (primero el mismo día de la semana). Con "Usar esta carga" se llena sola; corrige lo que cambió.' },
      { el: 'dp-total', titulo: 'Total', texto: 'La suma de las cajas escogidas (las estibas se cuentan aparte), comparada con las que tenía programadas el viaje. Si a algún tipo le falta la cantidad, no deja guardar y lo marca en rojo.' },
      { el: 'dp-en-cargue', titulo: 'En el cargue', texto: 'Los vehículos que siguen en el cargue. El botón cambia según el paso: "Empezó a cargar", "Terminó de cargar" y "Salió", y pone la hora de ese momento.' },
      { el: 'dp-limite', titulo: 'Cargue demorado', texto: 'Si un cargue pasa de este límite, sale en rojo como "Demorado" y la oficina ve el aviso. Para terminarlo hay que escoger el motivo de la demora (si es "Otro", escribir cuál).' },
      { el: 'dp-periodos', titulo: 'Registro', texto: 'Lo anotado por día, semana o mes, con las flechas para ir atrás. "Histórico" lleva a cada mes guardado.' },
      { el: 'dp-excel', titulo: 'Excel', texto: 'Descarga en Excel el día, la semana o el mes que estás viendo: horas, tiempo de cargue, cantidad por tipo y total de cajas.' },
      { el: '', titulo: 'Sin señal', texto: 'Si se cae el internet, sigue anotando: lo anotado queda guardado en este celular (sale un aviso amarillo) y se envía solo cuando vuelve la señal. No cierres la página mientras tanto.' },
      { el: 'dp-apariencia', titulo: 'Apariencia', texto: 'Modo claro u oscuro, letra más grande e instalar la app en este celular. Como es una cuenta compartida, lo que escojas queda solo en este equipo.' },
      { el: 'dp-tabla', titulo: 'Corregir o borrar', texto: 'Con el lápiz corriges un registro y con la caneca lo borras. La cuenta de despachos puede hacerlo con lo de hoy y ayer; lo anterior, la oficina. Todo queda en la auditoría.' },
      PASO_AYUDA
    ]
  },

  admin: {
    titulo: 'Administración',
    pasos: [
      { el: '.admin-tabs', titulo: 'Secciones', texto: 'Cuentas, Auditoría (quién cambió qué y cuándo), y según tus permisos, Correo y Dispositivos.' },
      { el: '.cuenta-conductores', titulo: 'Cuenta de conductores', texto: 'Una cuenta compartida para todos los conductores: cada uno escribe su nombre y placa para ver sus viajes.' },
      { el: '.cuenta-despachos', titulo: 'Cuenta de despachos', texto: 'Una cuenta para quien está en el cargue: solo ve la pantalla Despachos, donde anota llegada y fin de cargue de cada vehículo.' },
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

export type RequisitoTarea = 'editar' | 'aprobar' | 'noAprobar' | 'todos';

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
      { el: 've-sugerencias', titulo: 'Sugeridos', texto: 'Con la ruta y la fecha elegidas, la app propone hasta 3 vehículos propios: libres esos días, con documentos al día, que cumplen las reglas (cliente, ruta, pico y placa) y con capacidad; primero los que menos viajes llevan en el mes. Toca uno para elegirlo.' },
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
    clave: 'apariencia',
    titulo: 'Poner modo claro o la letra más grande',
    requiere: 'todos',
    cerrar: ['.ap-cerrar'],
    pasos: [
      { el: '', titulo: 'Apariencia de tu cuenta', texto: 'El modo claro u oscuro y el tamaño de letra son solo de tu cuenta: si los cambias, los ves igual en cualquier equipo donde entres, y las demás cuentas siguen como estaban.' },
      { el: 'nav-apariencia', tocar: true, titulo: 'Abre Apariencia', texto: 'Toca el botón iluminado (la paleta). También se abre con la tecla A.' },
      { el: 'ap-tema', titulo: 'Modo', texto: 'Oscuro (el de siempre) o Claro, mejor con mucha luz. Atajo: tecla T.' },
      { el: 'ap-letra', titulo: 'Tamaño de letra', texto: 'Normal, Grande o Muy grande: agranda toda la app, no solo el texto. Atajos: + y -.' },
      { el: '', titulo: '¡Listo!', texto: 'Se guarda solo apenas lo escoges. Al terminar la guía se cierra el panel.' }
    ]
  },
  {
    clave: 'atajos',
    titulo: 'Usar los atajos de teclado',
    requiere: 'todos',
    cerrar: ['.ap-cerrar'],
    pasos: [
      { el: '', titulo: 'Atajos de teclado', texto: 'Para trabajar sin el mouse. Los más útiles: Ctrl+K busca cualquier cosa; G y luego una letra va a una página (G R = Rutograma, G D = Dashboard, G V = Vehículos…); N = nuevo viaje extra; en el Rutograma, Shift+← y Shift+→ cambian de mes y H vuelve al mes de hoy. No funcionan mientras escribes en un campo.' },
      { el: 'nav-apariencia', tocar: true, titulo: 'Abre Apariencia', texto: 'Toca el botón iluminado.' },
      { el: 'ap-ver-atajos', tocar: true, titulo: 'Ver atajos', texto: 'Toca "Ver atajos de teclado". En cualquier pantalla también se abre con la tecla ?.' },
      { el: '.ap-atajos-grid', titulo: 'La lista', texto: 'Todos los atajos que puede usar tu cuenta. "G luego R" quiere decir: oprime G, suéltala y oprime R. Al oprimir G sale abajo un recordatorio con las letras.' },
      { el: '', titulo: '¡Listo!', texto: 'Esc cierra la lista, el panel o el viaje abierto. Al terminar la guía se cierra la lista.' }
    ]
  },
  {
    clave: 'instalar',
    titulo: 'Instalar la app en el celular o el computador',
    requiere: 'todos',
    cerrar: ['.ap-cerrar'],
    pasos: [
      { el: '', titulo: 'Instalar como aplicación', texto: 'Queda el ícono de MAKAND en el celular o en el escritorio y se abre en su propia ventana, sin barra del navegador ni escribir la dirección. Hace falta entrar por la dirección segura (https://….ts.net:5000) que activa la oficina con "activar-https.bat".' },
      { el: 'nav-apariencia', tocar: true, titulo: 'Abre Apariencia', texto: 'Toca el botón iluminado.' },
      { el: 'ap-instalar', titulo: 'Instalar', texto: 'Si el navegador lo permite, sale el botón "Instalar MAKAND": tócalo y acepta. En Android también: menú ⋮ → "Instalar aplicación". En iPhone: en Safari, Compartir → "Agregar a inicio". En el computador (Chrome o Edge): el ícono de instalar en la barra de direcciones.' },
      { el: '', titulo: '¡Listo!', texto: 'La app instalada se actualiza sola con cada actualización de la oficina. Si no hay señal, muestra "Sin conexión" y un botón para reintentar.' }
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
