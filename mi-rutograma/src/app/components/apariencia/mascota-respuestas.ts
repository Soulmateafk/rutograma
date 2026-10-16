/**
 * "Pregúntale al furgoncito" (components/apariencia/mascota.ts): entiende
 * preguntas escritas como se habla y responde con algo útil.
 *
 *  - De un viaje: "¿qué pasa con el viaje BOG-BAQ-EX de la LUN 428?" →
 *    cuándo es, quién lo maneja, si ya salió o llegó, novedades… (usa el
 *    mismo intérprete del buscador hablado, services/buscar-hablado.ts).
 *  - De viajes en general: "¿cuántos viajes salen mañana?" → cuántos hay y
 *    un botón para ver la lista.
 *  - De cómo hacer algo o dónde está: "¿cómo pongo un viaje extra?",
 *    "¿dónde veo los comparendos?" → lleva a la pantalla o abre la guía.
 *  - Lo que no entiende lo pregunta ("¿te refieres a…?") y APRENDE la
 *    respuesta que la persona escoja: la próxima vez ya lo sabe.
 */
import { interpretar, filtrarViajes, conductorDelViaje, titularesPorPlaca, sinTildes } from '../../services/buscar-hablado';
import { TAREAS } from '../../services/guias';
import { responderDatos, Extra, EJEMPLOS_DATOS } from './mascota-datos';
import { responderConsulta } from './mascota-consulta';
import { placasDichas, conContexto } from './mascota-contexto';

export type TipoAccion = 'ruta' | 'viaje' | 'buscar' | 'tarea' | 'apariencia' | 'viaje-extra' | 'novedad' | 'enlace';
export interface Accion { texto: string; tipo: TipoAccion; valor?: string; }
export interface Tema { clave: string; texto: string; palabras: string[]; accion: Accion; }
/** Datos que no están en la app abierta y hay que pedir al servidor (los despachos). */
export interface Pedido { tipo: 'despachos'; desde: string; hasta: string; cuando: string; placa?: string; que: 'resumen' | 'cargando' | 'demoras' | 'placa'; }
export interface Respuesta {
  texto: string; acciones: Accion[]; entendio: boolean; opciones: Tema[];
  /** La pregunta completa que se respondió ("¿y mañana?" → "que carros salen mañana"). */
  entendida?: string;
  pedir?: Pedido;
}

/** Lo que el furgoncito sabe explicar: pantallas, acciones y las guías "¿Cómo hago…?". */
const TEMAS_BASE: Tema[] = [
  { clave: 'p:rutograma', texto: 'El Rutograma es el calendario de todos los viajes del mes.', palabras: ['rutograma', 'calendario', 'programacion'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:dashboard', texto: 'En el Dashboard ves el día de un vistazo: alertas, viajes de hoy y capacidad.', palabras: ['dashboard', 'inicio', 'alertas', 'capacidad', 'resumen general'], accion: { texto: 'Ir al Dashboard', tipo: 'ruta', valor: '/dashboard' } },
  { clave: 'p:resumen', texto: 'El Resumen del día te muestra los números de hoy.', palabras: ['resumen del dia', 'resumen de hoy', 'bienvenida'], accion: { texto: 'Ver el Resumen', tipo: 'ruta', valor: '/resumen' } },
  { clave: 'p:vehiculos', texto: 'En Vehículos están la flota, el SOAT, la tecnomecánica y el mantenimiento.', palabras: ['vehiculo', 'vehiculos', 'flota', 'soat', 'tecnomecanica', 'camion', 'furgon', 'placa'], accion: { texto: 'Ir a Vehículos', tipo: 'ruta', valor: '/vehiculos' } },
  { clave: 'p:conductores', texto: 'En Conductores están los datos, licencias, descansos y los viajes de cada uno.', palabras: ['conductor', 'conductores', 'licencia', 'chofer', 'descanso', 'descansos'], accion: { texto: 'Ir a Conductores', tipo: 'ruta', valor: '/conductores' } },
  { clave: 'p:rutas', texto: 'En Rutas están todas las rutas con su destino y duración.', palabras: ['ruta', 'rutas', 'destinos', 'codigo de ruta'], accion: { texto: 'Ir a Rutas', tipo: 'ruta', valor: '/rutas' } },
  { clave: 'p:tareas', texto: 'En Tareas asignas pendientes al equipo con fecha límite.', palabras: ['tarea', 'tareas', 'pendiente', 'pendientes', 'asignar algo', 'recordatorio'], accion: { texto: 'Ir a Tareas', tipo: 'ruta', valor: '/tareas' } },
  { clave: 'p:comparendos', texto: 'En Comparendos llevas las multas de cada conductor.', palabras: ['comparendo', 'comparendos', 'multa', 'multas', 'fotomulta'], accion: { texto: 'Ir a Comparendos', tipo: 'ruta', valor: '/comparendos' } },
  { clave: 'p:quejas', texto: 'En Quejas anotas los reclamos de los clientes.', palabras: ['queja', 'quejas', 'reclamo', 'reclamos'], accion: { texto: 'Ir a Quejas', tipo: 'ruta', valor: '/quejas' } },
  { clave: 'p:mapa', texto: 'El Mapa muestra a qué destinos vamos.', palabras: ['mapa', 'donde vamos', 'ciudades'], accion: { texto: 'Abrir el Mapa', tipo: 'ruta', valor: '/mapa' } },
  { clave: 'p:comparativo', texto: 'El Comparativo compara meses, con gráficos en "Analizar en detalle".', palabras: ['comparativo', 'comparar', 'grafico', 'graficos', 'estadisticas'], accion: { texto: 'Ir al Comparativo', tipo: 'ruta', valor: '/comparativo' } },
  { clave: 'p:presentacion', texto: 'El Modo presentación muestra los números como diapositivas, por semanas o meses.', palabras: ['presentacion', 'diapositivas', 'reunion', 'mostrar numeros'], accion: { texto: 'Abrir la Presentación', tipo: 'ruta', valor: '/presentacion' } },
  { clave: 'p:historico', texto: 'En el Histórico ves cómo quedó cada mes.', palabras: ['historico', 'historial', 'meses pasados', 'mes pasado'], accion: { texto: 'Ir al Histórico', tipo: 'ruta', valor: '/historico' } },
  { clave: 'p:varios-viajes', texto: 'En el Rutograma mantén Ctrl (Cmd en Mac) y haz clic en los viajes: abajo sale una barra para ponerles el mismo conductor, correrlos unos días o cancelarlos juntos. Esc quita la selección.', palabras: ['varios viajes', 'varios a la vez', 'muchos viajes', 'seleccionar viajes', 'cambiar varios', 'mover varios', 'cancelar varios', 'en lote', 'todos juntos'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:nota-dia', texto: 'Doble clic en la casilla del vehículo y el día (o clic derecho en un viaje → "Nota en este día"). Queda una notita amarilla que ve todo el equipo, sin crear viaje.', palabras: ['nota en un dia', 'nota en el dia', 'nota del dia', 'nota en la casilla', 'poner una nota', 'dejar una nota', 'notita', 'recordatorio en el rutograma'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:semana-ruto', texto: 'En el Rutograma toca "Semana" para ver solo 7 días con las tarjetas grandes, y "Hoy" (o la tecla H) para ir directo a la columna de hoy.', palabras: ['ver una semana', 'vista semanal', 'solo la semana', 'ir a hoy', 'boton hoy', 'columna de hoy', 'plegar', 'esconder arsitrans', 'esconder polar', 'ocultar grupo', 'filtro guardado', 'filtros guardados', 'guardar filtro', 'guardar un filtro', 'guardo un filtro', 'filtrar viajes', 'mis cambios de hoy', 'deshacer uno'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:resaltar-conductor', texto: 'En el Rutograma pon el mouse sobre el nombre del conductor en cualquier viaje: se iluminan todos sus viajes del mes. Los días que ya pasaron salen apagados con candado; el botón del candado los vuelve a pintar normal.', palabras: ['resaltar conductor', 'viajes de un conductor', 'todos los viajes del conductor', 'iluminar conductor', 'dias pasados', 'dias en gris', 'candado', 'dias grises', 'dia bloqueado'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'p:pronostico', texto: 'En Pronóstico ves cuántos viajes se esperan el próximo mes, por cliente y destino, y cuántos cupos de Arsitrans y Polar harán falta.', palabras: ['pronostico', 'pronóstico', 'proximo mes', 'próximo mes', 'mes que viene', 'cuantos viajes vienen', 'cuántos viajes vienen', 'cuantos cupos necesito', 'cuántos cupos necesito', 'proyeccion', 'proyección', 'prevision', 'previsión'], accion: { texto: 'Ir a Pronóstico', tipo: 'ruta', valor: '/pronostico' } },
  { clave: 'p:cumplimiento', texto: 'Cumplimiento te dice qué tan a tiempo salen y llegan los viajes.', palabras: ['cumplimiento', 'a tiempo', 'puntualidad', 'retrasos'], accion: { texto: 'Ir a Cumplimiento', tipo: 'ruta', valor: '/cumplimiento' } },
  { clave: 'p:reglas', texto: 'En Reglas configuras qué vehículo sirve para cada cliente y el pico y placa.', palabras: ['reglas', 'pico y placa', 'pico', 'restriccion'], accion: { texto: 'Ir a Reglas', tipo: 'ruta', valor: '/reglas' } },
  { clave: 'p:despachos', texto: 'En Despachos se anota a qué hora llega y termina de cargar cada vehículo.', palabras: ['despacho', 'despachos', 'cargue', 'cargar', 'bodega'], accion: { texto: 'Ir a Despachos', tipo: 'ruta', valor: '/despachos' } },
  { clave: 'p:aprobaciones', texto: 'En Aprobaciones están los cambios que esperan el visto bueno del jefe.', palabras: ['aprobacion', 'aprobaciones', 'aprobar', 'aprobaron', 'rechazar', 'pendiente de aprobar'], accion: { texto: 'Ir a Aprobaciones', tipo: 'ruta', valor: '/aprobaciones' } },
  { clave: 'p:papelera', texto: 'En la Papelera está lo eliminado de los últimos 30 días.', palabras: ['papelera', 'restauro', 'restaurar', 'viaje borrado', 'viaje eliminado', 'borre', 'borro', 'eliminado', 'elimine', 'recuperar', 'recupero', 'borrado', 'deshacer'], accion: { texto: 'Ir a la Papelera', tipo: 'ruta', valor: '/papelera' } },
  { clave: 'p:configuracion', texto: 'En Configuración están los respaldos, el modo prueba y los ajustes generales.', palabras: ['configuracion', 'respaldo', 'respaldos', 'modo prueba', 'ajustes', 'backup'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'p:sesiones', texto: 'En Sesiones ves dónde está abierta tu cuenta.', palabras: ['sesion', 'sesiones', 'cerrar sesion', 'equipos conectados'], accion: { texto: 'Ir a Sesiones', tipo: 'ruta', valor: '/sesiones' } },
  { clave: 'a:apariencia', texto: 'En Apariencia cambias el tema, los colores, la letra, el fondo y más.', palabras: ['apariencia', 'tema', 'color', 'colores', 'letra', 'fondo', 'oscuro', 'claro', 'mascota'], accion: { texto: 'Abrir Apariencia', tipo: 'apariencia' } },
  { clave: 'a:viaje-extra', texto: 'Con "+ Viaje Extra" (o la tecla N) agregas un viaje que no estaba programado.', palabras: ['viaje extra', 'extra', 'nuevo viaje', 'agregar viaje', 'crear viaje'], accion: { texto: 'Abrir Viaje Extra', tipo: 'viaje-extra' } },
  // Cómo se hace cada cosa, con el paso a paso corto.
  { clave: 'c:exportar', texto: 'En el Rutograma, arriba, el botón «Exportar» descarga el mes en Excel. 📥', palabras: ['exportar', 'excel', 'exporto', 'descargar el mes', 'descargar el rutograma', 'bajar el rutograma', 'descargo'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:pdf-semana', texto: 'En el Rutograma, abajo en el resumen de la semana: «PDF» la descarga lista para imprimir y «Compartir» la manda por WhatsApp. 🖨️', palabras: ['pdf', 'pdf de la semana', 'imprimir la semana', 'imprimir', 'imprimo', 'semana en pdf', 'compartir la semana', 'mandar la semana', 'programacion de la semana'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:hoja-ruta', texto: 'Clic derecho sobre el viaje en el Rutograma → «Hoja de ruta (PDF)». También está en el detalle del viaje.', palabras: ['hoja de ruta', 'pdf del viaje', 'imprimir un viaje', 'imprimir el viaje', 'papel del viaje'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:whatsapp', texto: 'En Conductores, el botón de WhatsApp de cada uno le manda sus viajes de los próximos 7 días. O en el Rutograma: clic derecho sobre un viaje → «Avisar al conductor por WhatsApp». 📲', palabras: ['whatsapp', 'avisar al conductor', 'avisarle', 'aviso', 'avisar', 'mandarle los viajes', 'mandar los viajes', 'notificar'], accion: { texto: 'Ir a Conductores', tipo: 'ruta', valor: '/conductores' } },
  { clave: 'c:cierre', texto: 'En el Dashboard, el botón «Cierre de semana» arma el resumen de lunes a domingo (cumplido, cancelado y pendiente) listo para enviar. 📊', palabras: ['cierre de semana', 'cerrar la semana', 'cierro la semana', 'cierre semanal', 'resumen de la semana', 'cierre'], accion: { texto: 'Ir al Dashboard', tipo: 'ruta', valor: '/dashboard' } },
  { clave: 'c:clave', texto: 'En Configuración, botón «Cambiar contraseña». 🔑', palabras: ['contrasena', 'clave', 'cambiar mi contrasena', 'cambiar la clave', 'password', 'olvide la clave'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'c:matriz', texto: 'En Configuración, «Generar Matriz del Mes» arma todos los viajes del mes según las rutas. Antes se guarda un respaldo por si acaso.', palabras: ['generar matriz', 'matriz', 'genero', 'generar el mes', 'programar el mes', 'armar el mes', 'armo el mes'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'c:importar', texto: 'En Configuración, «Importar viajes reales»: subes el Excel de operación y antes de guardar ves qué entra. También está «Importar Operación» en el Rutograma.', palabras: ['importar', 'importo', 'subir el excel', 'cargar el excel', 'subo el excel', 'importar viajes'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'c:cancelar', texto: 'Abre el viaje en el Rutograma → «Editar viaje» → en Estado escoge «Cancelado» y escribe el motivo → «Guardar cambios». ❌', palabras: ['cancelar', 'cancelo', 'cancelar un viaje', 'anular', 'anulo', 'cancelacion'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:eliminar', texto: 'Abre el viaje en el Rutograma → «Eliminar viaje». Queda 30 días en la Papelera por si acaso. 🗑️', palabras: ['eliminar', 'elimino', 'borrar', 'borro', 'quitar un viaje', 'quito un viaje'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:editar', texto: 'Toca el viaje en el Rutograma → «Editar viaje», cambia lo que necesites y «Guardar cambios». ✏️', palabras: ['editar', 'edito', 'modificar', 'modifico', 'corregir', 'corrijo', 'cambiar un viaje', 'cambiar los datos', 'cambiar la hora', 'cambiar el cliente', 'cambiar las cajas'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:placa-viaje', texto: 'Dos formas: arrastra el viaje a la fila del otro vehículo en el Rutograma (te pide confirmar), o ábrelo → «Editar viaje» y cambia la placa.', palabras: ['cambiar la placa', 'cambio la placa', 'otro vehiculo', 'otro carro', 'cambiar el vehiculo', 'cambiar de carro', 'cambiar de vehiculo', 'pasar a otro carro'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:duplicar', texto: 'Clic derecho sobre el viaje en el Rutograma → «Duplicar (justo después)».', palabras: ['duplicar', 'duplico', 'copiar un viaje', 'repetir un viaje', 'copio'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:historial-viaje', texto: 'Clic derecho sobre el viaje → «Historial de cambios»: quién lo cambió y cuándo. 🕵️', palabras: ['historial de un viaje', 'historial del viaje', 'quien cambio', 'quien modifico', 'quien movio', 'quien borro', 'cambios de un viaje', 'quien edito'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:nuevo-vehiculo', texto: 'En Vehículos, botón «+ Nuevo Vehículo».', palabras: ['nuevo vehiculo', 'agregar un carro', 'agregar un vehiculo', 'agrego un carro', 'agrego un vehiculo', 'crear vehiculo', 'registrar un vehiculo', 'meter un carro', 'anadir vehiculo', 'carro nuevo'], accion: { texto: 'Ir a Vehículos', tipo: 'ruta', valor: '/vehiculos' } },
  { clave: 'c:nuevo-conductor', texto: 'En Conductores, botón «Nuevo Conductor».', palabras: ['nuevo conductor', 'agregar un conductor', 'agrego un conductor', 'crear conductor', 'registrar un conductor', 'anadir conductor', 'conductor nuevo', 'contratar'], accion: { texto: 'Ir a Conductores', tipo: 'ruta', valor: '/conductores' } },
  { clave: 'c:buscar', texto: 'Con Ctrl+K (o la lupa de arriba) buscas lo que sea escrito como hablas: "viajes de Orlando a Cali la otra semana". O pregúntame a mí. 🔎', palabras: ['buscar', 'buscador', 'busco', 'encontrar un viaje', 'lupa'], accion: { texto: 'Abrir el buscador', tipo: 'buscar', valor: '' } },
  { clave: 'c:deshacer', texto: 'Ctrl+Z deshace el último cambio. Y lo que se elimina queda 30 días en la Papelera.', palabras: ['deshacer', 'me equivoque', 'devolver el cambio', 'ctrl z', 'reversar'], accion: { texto: 'Ir a la Papelera', tipo: 'ruta', valor: '/papelera' } },
  { clave: 'c:foto', texto: 'En el Rutograma, el botón «Foto» saca una imagen del mes para compartir. 📸', palabras: ['foto del mes', 'foto', 'captura', 'imagen del mes', 'pantallazo'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:usuarios', texto: 'En Administrador se manejan las cuentas, sus roles y permisos (solo quien administra).', palabras: ['usuarios', 'usuario', 'permisos', 'permiso', 'dar permiso', 'crear usuario', 'cuentas', 'roles', 'acceso', 'administrador'], accion: { texto: 'Ir a Administrador', tipo: 'ruta', valor: '/admin' } },
  { clave: 'c:reportes', texto: 'Para reportes: el Comparativo (meses y gráficos), Cumplimiento (puntualidad), el Histórico y el Modo presentación. 📈', palabras: ['reportes', 'reporte de', 'informes', 'informe', 'indicadores', 'kpi'], accion: { texto: 'Ir al Comparativo', tipo: 'ruta', valor: '/comparativo' } },
  { clave: 'c:comparendo', texto: 'En Comparendos, «Registrar comparendo»: fecha, conductor, número, motivo y valor.', palabras: ['registrar un comparendo', 'registrar comparendo', 'nuevo comparendo', 'anotar una multa', 'registrar una multa', 'poner un comparendo'], accion: { texto: 'Ir a Comparendos', tipo: 'ruta', valor: '/comparendos' } },
  { clave: 'c:queja', texto: 'En Quejas, «Registrar queja». También desde el detalle del viaje con el botón «Queja».', palabras: ['registrar una queja', 'registrar queja', 'nueva queja', 'anotar una queja', 'poner una queja', 'anoto una queja'], accion: { texto: 'Ir a Quejas', tipo: 'ruta', valor: '/quejas' } },
  { clave: 'c:pico-config', texto: 'En Reglas configuras el pico y placa: días, últimos dígitos y horario. 🚫', palabras: ['configurar pico y placa', 'configuro el pico', 'configuro el pico y placa', 'poner pico y placa', 'cambiar el pico y placa', 'reglas de pico'], accion: { texto: 'Ir a Reglas', tipo: 'ruta', valor: '/reglas' } },
  { clave: 'c:ya-sali', texto: 'El conductor marca «Ya salí» y «Ya llegué» en Mis viajes desde su celular; aquí se ve en vivo. 📱', palabras: ['ya sali', 'ya llegue', 'marcar salida', 'marcar llegada', 'marca la salida', 'mis viajes'], accion: { texto: 'Ir al Rutograma', tipo: 'ruta', valor: '/rutograma' } },
  { clave: 'c:plan-b', texto: 'Si un vehículo se vara o entra al taller, en Vehículos aparece «Plan B» para pasar sus viajes a otro. También desde el viaje → «Vehículo varado».', palabras: ['plan b', 'reasignar', 'reasigno', 'pasar los viajes', 'vehiculo varado', 'se varo un carro'], accion: { texto: 'Ir a Vehículos', tipo: 'ruta', valor: '/vehiculos' } },
  { clave: 'c:agenda', texto: 'La Agenda de cada conductor está en su ficha (Conductores) o con clic derecho sobre un viaje → «Agenda del conductor». 📅', palabras: ['agenda', 'agenda del conductor', 'calendario del conductor'], accion: { texto: 'Ir a Conductores', tipo: 'ruta', valor: '/conductores' } },
  { clave: 'c:respaldo', texto: 'En Configuración están los respaldos: cada guardado crea uno y puedes volver atrás. 💾', palabras: ['respaldo', 'copia de seguridad', 'restaurar respaldo', 'volver atras'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'c:modo-prueba', texto: 'En Configuración activas el modo prueba: practicas con una copia sin tocar los datos reales. 🧪', palabras: ['modo prueba', 'modo de prueba', 'practicar', 'probar sin danar'], accion: { texto: 'Ir a Configuración', tipo: 'ruta', valor: '/configuracion' } },
  { clave: 'a:novedad', texto: 'Con "Novedad" (o Shift+N) registras algo que pasó: varado, retraso, accidente…', palabras: ['novedad', 'novedades', 'varado', 'varo', 'se varo', 'accidente', 'reportar', 'reporto', 'reporte', 'pinchazo', 'se daño', 'retraso', 'choque'], accion: { texto: 'Abrir Novedad', tipo: 'novedad' } }
];

/** Palabras clave extra para las guías "¿Cómo hago…?" (además de su título). */
const PALABRAS_TAREA: Record<string, string[]> = {
  'viaje-extra': ['viaje extra', 'agregar viaje', 'crear viaje', 'agregar un viaje', 'agrego un viaje', 'nuevo viaje', 'crear un viaje', 'creo un viaje', 'meter un viaje', 'anadir un viaje', 'anado un viaje', 'programar un viaje', 'programo un viaje', 'montar un viaje', 'poner un viaje', 'pongo un viaje'],
  'cambiar-conductor': ['cambiar conductor', 'otro conductor', 'cambiar el conductor', 'cambia el conductor', 'cambio el conductor', 'cambio de conductor', 'poner otro conductor', 'asignar conductor', 'asigno un conductor', 'asignar un conductor al viaje'],
  'descanso': ['descanso', 'descansos', 'dia libre'],
  'asignar-vehiculo': ['asignar vehiculo', 'conductor a un vehiculo', 'titular'],
  'mantenimiento': ['mantenimiento', 'taller'],
  'novedad': ['registrar novedad'],
  'mover-viaje': ['mover viaje', 'arrastrar', 'arrastro', 'cambiar de dia', 'muevo', 'mover', 'mueve', 'se mueve', 'mover un viaje', 'otro dia', 'cambiar de fecha', 'cambiar la fecha', 'pasar a otro dia', 'correr un viaje'],
  'atajos': ['atajos', 'teclado'],
  'instalar': ['instalar', 'aplicacion', 'celular'],
  'mis-notas': ['notas', 'apuntar'],
  'aprobar': ['aprobar', 'apruebo', 'aprueba', 'aprobar cambios', 'rechazar cambios', 'rechazo'],
  'mis-solicitudes': ['me aprobaron', 'mis cambios'],
  'en-linea': ['en linea', 'quien esta conectado', 'quien esta en la app', 'ausente', 'ausentes', 'punto amarillo', 'punto rojo', 'quien esta editando', 'cabecitas', 'cabecita', 'monitorear', 'ver al equipo'],
  'ver-personas': ['ocultar a los demas', 'no ver a los demas', 'quitar las cabecitas', 'ver a las demas personas', 'apagar las cabecitas', 'quitar los colores'],
  'preguntar-mascota': ['mover el camioncito', 'mover la mascota', 'muevo el camioncito', 'hablarle', 'microfono', 'preguntarle', 'camioncito']
};

/** Todos los temas: los de arriba más una guía paso a paso por cada "¿Cómo hago…?". */
export const TEMAS: Tema[] = [
  ...TEMAS_BASE,
  ...TAREAS.map(t => ({
    clave: 't:' + t.clave,
    texto: `Te muestro paso a paso: "${t.titulo}".`,
    palabras: [sinTildes(t.titulo), ...(PALABRAS_TAREA[t.clave] || [])],
    accion: { texto: 'Mostrarme cómo', tipo: 'tarea' as TipoAccion, valor: t.clave }
  }))
];

const VACIAS = new Set(['el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'en', 'y', 'a', 'al', 'con', 'por', 'para', 'me', 'mi', 'se', 'como', 'donde',
  'cual', 'cuales', 'hago', 'hacer', 'algo', 'cosa', 'app', 'aplicacion', 'puedo', 'veo', 'ver', 'esta', 'estan', 'es', 'hay', 'quiero', 'necesito', 'favor', 'porfa', 'porfavor', 'lo', 'le', 'su', 'sus', 'o', 'tu', 'te']);

/** Pregunta en minúsculas, sin tildes ni signos (para comparar y para lo aprendido). */
export const normalizarPregunta = (t: string): string => sinTildes(t).replace(/[¿?¡!.,;:"']/g, ' ').replace(/\s+/g, ' ').trim();
const palabrasDe = (t: string) => normalizarPregunta(t).split(' ').filter(p => p.length > 1 && !VACIAS.has(p));

/** "elimina" ~ "eliminar", "borrado" ~ "borrar" (pero "comparendos" no es "comparativo"): comparten casi toda la palabra. */
function mismaRaiz(a: string, b: string): boolean {
  let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k >= Math.max(5, Math.min(a.length, b.length) - 2);
}

/** Qué tanto se parece la pregunta a un tema (frases completas valen más que palabras sueltas). */
function puntaje(pregunta: string, tema: Tema): number {
  const q = ` ${normalizarPregunta(pregunta)} `;
  let p = 0;
  for (const clave of tema.palabras) {
    const c = sinTildes(clave);
    if (c.includes(' ') ? q.includes(` ${c} `) || q.includes(c) : q.includes(` ${c} `)) p += c.includes(' ') ? 3 : 2;
  }
  // La misma palabra con otra terminación ("elimina" ~ "eliminar", "cambio" ~ "cambiar").
  const qs = palabrasDe(pregunta);
  const exactas = new Set(tema.palabras.map(c => sinTildes(c)).filter(c => !c.includes(' ') && q.includes(` ${c} `)));
  for (const clave of tema.palabras) {
    const c = sinTildes(clave);
    if (c.includes(' ') || c.length < 6 || exactas.has(c)) continue;
    if (qs.some(w => w.length >= 6 && w !== c && !exactas.has(w) && mismaRaiz(w, c) && ![...exactas].some(e => mismaRaiz(e, w)))) p += 2;
  }
  // Palabras sueltas del título o de las claves (para "¿dónde quedan las multas?").
  const sueltas = new Set(tema.palabras.flatMap(c => sinTildes(c).split(' ')).filter(w => w.length > 3 && !VACIAS.has(w)));
  for (const w of palabrasDe(pregunta)) if (sueltas.has(w)) p += 1;
  return p;
}

/** Parecido entre dos preguntas (palabras en común), de 0 a 1. */
function parecido(a: string, b: string): number {
  const A = new Set(palabrasDe(a)), B = new Set(palabrasDe(b));
  if (!A.size || !B.size) return 0;
  let comun = 0; A.forEach(w => { if (B.has(w)) comun++; });
  return comun / Math.max(A.size, B.size);
}

const fechaLarga = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00');
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
};
const horaDe = (iso: string) => new Date(iso).toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
const isoHoy = (h: Date) => `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, '0')}-${String(h.getDate()).padStart(2, '0')}`;

/** "El viaje BOG-BAQ-EX de LUN 428 es el jueves 16 de octubre…": todo lo que se sabe de un viaje. */
export function contarViaje(v: any, S: any, hoy = new Date()): string {
  const ruta = v.codigo || v.ruta || 'sin ruta';
  const placa = v.p || v.placa || 'sin placa';
  const cond = conductorDelViaje(v, titularesPorPlaca(S));
  const hoyIso = isoHoy(hoy);
  const fecha = String(v.fecha || '').slice(0, 10);
  const cuando = fecha === hoyIso ? 'es hoy' : fecha < hoyIso ? `fue el ${fechaLarga(fecha)}` : `es el ${fechaLarga(fecha)}`;
  const partes = [`El viaje ${ruta} de ${placa} ${cuando}${v.hora && v.hora !== '--:--' ? `, a las ${v.hora}` : ''}`];
  if (v.destino) partes[0] += ` hacia ${v.destino}`;
  partes[0] += '.';
  partes.push(cond ? `Lo maneja ${cond}.` : 'Todavía no tiene conductor. ⚠️');
  if (v.cliente) partes.push(`Cliente: ${v.cliente}${v.cajas ? `, ${v.cajas} cajas` : ''}.`);
  if (v.estado === 'Cancelado') partes.push(`Está CANCELADO${v.motivoCancelacion ? ` (${v.motivoCancelacion})` : ''}. ❌`);
  else if (v.llegadaReal) partes.push(`Ya llegó: salió a las ${horaDe(v.salidaReal)} y llegó a las ${horaDe(v.llegadaReal)}. ✅`);
  else if (v.salidaReal) partes.push(`Va en camino: salió a las ${horaDe(v.salidaReal)}. 🚚`);
  else if (v.estado) partes.push(`Estado: ${v.estado}.`);
  const nov = Array.isArray(v.novedades) ? v.novedades.length : 0;
  if (nov) partes.push(`Tiene ${nov} novedad${nov === 1 ? '' : 'es'}. 📝`);
  return partes.join(' ');
}

/** Lo que se escribe rápido o se dicta: "q carros salen", "kien", "ai viajes", "pa Cali". */
const ATAJOS: Record<string, string> = {
  q: 'que', k: 'que', ke: 'que', qe: 'que', xq: 'porque', pq: 'porque', kien: 'quien', kienes: 'quienes', qien: 'quien', ai: 'hay', ahy: 'hay',
  pa: 'para', pal: 'para el', x: 'por', d: 'de', dl: 'del', tmb: 'tambien', tb: 'tambien', ola: 'hola', grax: 'gracias', grs: 'gracias',
  cuanto: 'cuanto', cuantoz: 'cuantos', carroz: 'carros', biajes: 'viajes', biaje: 'viaje', vaje: 'viaje', vajes: 'viajes', viages: 'viajes', viage: 'viaje',
  mañan: 'mañana', manan: 'manana', ahorita: 'hoy', aorita: 'hoy', orita: 'hoy', ahora: 'hoy', okis: 'ok', porfa: '', porfavor: '', plis: '', please: ''
};
export function corregirEscritura(t: string): string {
  return String(t || '').split(/\s+/).map(w => {
    const limpio = sinTildes(w).replace(/[¿?¡!.,;:]/g, '');
    return limpio in ATAJOS ? ATAJOS[limpio] : w;
  }).join(' ')
    // "ahi libres", "ahi viajes" (quisieron decir "hay").
    .replace(/\bah[ií] (libres?|viajes?|carros?|algo|novedad)/gi, 'hay $1')
    // Placas pegadas: "lun428" → "LUN 428".
    .replace(/\b([a-zA-Z]{3})(\d{3})\b/g, (_m, a, b) => `${a.toUpperCase()} ${b}`)
    .replace(/\s+/g, ' ').trim();
}

/** ¿La pregunta nombra una placa o un código de ruta? ("¿cómo va la LUN 428?") */
const nombraAlgo = (q: string) => /\b[a-z]{3}\s?-?\d{3}\b|\b[a-z]{3}\s*-\s*[a-z]{3}\b|\b(polar|arsitrans)\s*\d+\b/.test(q);

/**
 * Responde una pregunta. `aprendido` son las preguntas que la persona ya le
 * enseñó (pregunta normalizada → clave del tema).
 */
export function responder(pregunta: string, S: any, aprendido: Record<string, string> = {}, hoy = new Date(), extra: Extra = {}): Respuesta {
  pregunta = placasDichas(corregirEscritura(pregunta), S);
  // "¿Y mañana?", "¿y la PRZ 065?": se arma con la pregunta anterior.
  if (extra.anterior) {
    const completa = conContexto(pregunta, placasDichas(corregirEscritura(extra.anterior), S), S);
    if (completa) return { ...responder(completa, S, aprendido, hoy, { ...extra, anterior: undefined }), entendida: completa };
  }
  const q = normalizarPregunta(pregunta);
  if (!q) return { texto: 'Escríbeme una pregunta y te ayudo. 🙂', acciones: [], entendio: false, opciones: [] };

  // 1. Algo que ya le enseñaron (igual o muy parecido).
  const ya = aprendido[q] || Object.entries(aprendido).find(([k]) => parecido(k, q) >= 0.8)?.[1];
  const temaAprendido = ya ? TEMAS.find(t => t.clave === ya) : null;
  if (temaAprendido) return { texto: `${temaAprendido.texto} (Esto me lo enseñaste tú. 😉)`, acciones: [temaAprendido.accion], entendio: true, opciones: [] };

  // Qué tan bien encaja con cada tema (pantallas, acciones, guías).
  const puntuados = TEMAS.map(t => ({ t, p: puntaje(pregunta, t) })).filter(x => x.p > 0);
  // Si pregunta "cómo", la guía paso a paso gana sobre la pantalla.
  const quiereComo = /\bcomo\b|\bpaso a paso\b|\bensena/.test(q);
  if (quiereComo || /^donde\b/.test(q)) puntuados.forEach(x => { if (x.t.accion.tipo === 'tarea' && x.p >= 2) x.p += 3; else if (x.t.clave.startsWith('c:') && x.p >= 2) x.p += 1; });
  puntuados.sort((a, b) => b.p - a.p);
  const temaClaro = puntuados.length && puntuados[0].p >= 3 && (puntuados.length === 1 || puntuados[0].p > puntuados[1].p) ? puntuados[0] : null;
  const respuestaTema = (elegido = temaClaro!): Respuesta => {
    const t = elegido.t;
    // Un segundo botón si hay otro tema casi igual de bueno (ej. la guía y la pantalla).
    const seg = puntuados.find(x => x !== elegido);
    const otro = seg && seg.p >= 3 && seg.p >= elegido.p - 3 && seg.t.accion.tipo !== t.accion.tipo ? seg.t.accion : null;
    return { texto: t.texto, acciones: otro ? [t.accion, otro] : [t.accion], entendio: true, opciones: [] };
  };

  // 1b. "¿Cómo hago…?", "¿dónde veo…?", "llévame a…": la guía o la pantalla (nunca una búsqueda de viajes).
  const comoHago = (/^(y )?(como|de que forma|que hago para|que tengo que hacer para|que debo hacer para|paso a paso|ensename|explicame|donde (veo|encuentro|queda|quedan|configuro|cambio|pongo|hago|registro|busco|miro|reviso|activo|se ve|se pone|se hace|se cambia|se configura|esta la opcion|esta el boton|estan las opciones))\b/.test(q)
    || /\b(como (hago|puedo|se hace|se pone|se cambia|agrego|anado|cambio|pongo|saco|genero|exporto|cancelo|anulo|elimino|borro|registro|creo|muevo|paso|apruebo|rechazo|cierro|restauro|recupero|imprimo|mando|envio|aviso|configuro|activo|desactivo|importo|subo|busco|asigno|duplico|copio|edito|modifico|corrijo|instalo|veo|descargo|comparto|marco|quito|anoto|reporto|reasigno|arrastro|abro|uso|programo|armo))\b/.test(q))
    && !/^como (va|van|esta|estan|vamos|anda|andan|fue|le fue|le va|vas|estas|estamos|andamos|viene|nos fue|nos va|me fue|les fue|quedo|quedamos|termino|cerro|cerramos|salio|salieron|llamo|contacto|se llama)\b/.test(q);
  const irA = /^(abre|abrir|abreme|abrime|llevame|ir a|ve a|vamos a|muestrame la pantalla|quiero ir|pasame a|mandame a)\b/.test(q);
  if ((comoHago || irA) && puntuados.length && puntuados[0].p >= 2) return respuestaTema(puntuados[0]);
  const comoSinTema = comoHago && !nombraAlgo(q);
  // "¿Dónde está la papelera?" (una pantalla, no un vehículo).
  if (/^donde (esta|estan|queda|quedan)\b/.test(q) && puntuados.length && puntuados[0].p >= 2 && !nombraAlgo(q)) return respuestaTema(puntuados[0]);

  // 1b'. Despachos (el registro de cargue vive en el servidor: se pide aparte).
  if (!comoHago && !irA && /\b(despach\w*|cargue|cargando|cargaron|termin\w* de cargar|llego a cargar|llegaron a cargar|en bodega|en el muelle|(a que hora|cuando|cuanto) (se )?(cargo|cargaron|demoro (en )?cargar|tardo (en )?cargar))\b/.test(q) && !/\bcajas\b/.test(q)) {
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mas = (k: number) => isoD(new Date(h.getFullYear(), h.getMonth(), h.getDate() + k));
    let desde = isoD(h), hasta = isoD(h), cuando = 'hoy';
    if (/\bayer\b/.test(q)) { desde = hasta = mas(-1); cuando = 'ayer'; }
    else if (/semana pasada/.test(q)) { const l = -((h.getDay() + 6) % 7) - 7; desde = mas(l); hasta = mas(l + 6); cuando = 'la semana pasada'; }
    else if (/semana/.test(q)) { const l = -((h.getDay() + 6) % 7); desde = mas(l); hasta = isoD(h); cuando = 'esta semana'; }
    else if (/\bmes\b/.test(q)) { desde = isoD(new Date(h.getFullYear(), h.getMonth(), 1)); hasta = isoD(h); cuando = 'este mes'; }
    const placa = (pregunta.match(/\b([A-Z]{3} \d{3}|(?:POLAR|ARSITRANS) \d+)\b/i) || [])[1]?.toUpperCase();
    const que: Pedido['que'] = placa ? 'placa' : /cargando|en cargue|siguen|todavia|aun\b|esperando/.test(q) ? 'cargando' : /demor|tard|lent|motivo/.test(q) ? 'demoras' : 'resumen';
    return { texto: 'Déjame mirar los despachos… ⏳', acciones: [{ texto: 'Ir a Despachos', tipo: 'ruta', valor: '/despachos' }], entendio: true, opciones: [], pedir: { tipo: 'despachos', desde, hasta, cuando, placa, que } };
  }

  // 1c. Datos directos de la app: vehículos, conductores, pico y placa, tareas… (mascota-datos.ts)
  const directa = responderDatos(pregunta, S, extra, hoy);
  if (directa) return directa;

  if (comoSinTema) {
    const opciones = (puntuados.length ? puntuados.map(x => x.t) : TEMAS.filter(t => t.clave.startsWith('t:'))).slice(0, 3);
    return { texto: 'Esa todavía no me la sé paso a paso. 🤔 ¿Es alguna de estas? Si escoges una, me la aprendo.', acciones: [], entendio: false, opciones };
  }

  // 1d. Preguntas libres de la operación: qué carros salen, quién regresa, cuántas cajas… (mascota-consulta.ts)
  const consulta = responderConsulta(pregunta, S, hoy);
  if (consulta) return consulta;

  // "¿Cómo agrego un viaje extra?" es de cómo hacer algo, no una búsqueda de viajes
  // (salvo que nombre una ruta o una placa: "¿cómo va el viaje BOG-CAL-D1?").
  const nombraViaje = /\b[a-z]{3}\s*-\s*[a-z]{3}\b|\b[a-z]{3}\s?-?\d{3}\b|\b(polar|arsi|makand)\s*\d+\b/i.test(q);
  const esComoODonde = /\b(como|donde|que es|para que|sirve|ensena|explica)\b/.test(q) && !/\bcomo va\b|\bdonde esta\b|\bdonde va\b/.test(q);
  if (temaClaro && (esComoODonde || !nombraViaje)) {
    if (esComoODonde || temaClaro.p >= 4) return respuestaTema();
  }

  // 2. Un viaje o viajes (ruta, placa, conductor, fechas…). Las palabras de la
  // pregunta ("qué pasa con", "cómo va") no son filtros.
  const limpia = normalizarPregunta(pregunta).replace(/\b(que pasa con|como va|como van|donde esta|donde va|quien maneja|quien lleva|cuentame de|informacion de|el viaje|la placa|el vehiculo|del vehiculo|de la placa|que paso con|estado de)\b/g, ' ');
  const pideViaje = /\bviajes?\b|\bpasa\b|\bva\b|\bsalio\b|\bllego\b|\bsale\b|\bsalen\b|\bentreg|\bmaneja\b|\besta\b/.test(q);
  const interp = interpretar(limpia, S, hoy);
  const f = interp.filtros;
  const especifico = f.rutas.length > 0 || f.placas.length > 0 || (f.conductores.length > 0 && nombraViaje);
  if (interp.algo && (especifico || pideViaje || f.conductores.length > 0)) {
    const buscar = (filtros: any) => filtrarViajes({ ...filtros, soloFuturos: false, libres: especifico ? [] : filtros.libres }, S, (v: any) => v.hora || '', hoy);
    let encontrados = buscar(f);
    let sinFecha = false;
    // "¿Cómo va el viaje de la LUN 429 hoy?" y hoy no tiene: el más cercano.
    if (!encontrados.length && especifico && (f.desde || f.hasta)) { encontrados = buscar({ ...f, desde: null, hasta: null, diasSemana: [] }); sinFecha = encontrados.length > 0; }
    const hoyIso = isoHoy(hoy);
    // El más cercano a hoy primero (hoy, luego lo que viene, luego lo pasado).
    const orden = (v: any) => { const d = String(v.fecha || '').slice(0, 10); return d >= hoyIso ? `0${d}` : `1${9e7 - Number(d.replace(/-/g, ''))}`; };
    const lista = [...encontrados].sort((a, b) => orden(a).localeCompare(orden(b)));
    const entendi = interp.entendidos.map(e => e.texto).join(', ');
    if (!lista.length) {
      return { texto: `Busqué ${entendi ? `(${entendi}) ` : ''}y no encontré viajes. 🤔 Revisa la ruta o la placa.`, acciones: [{ texto: 'Buscar en todos los viajes', tipo: 'buscar', valor: pregunta }], entendio: true, opciones: [] };
    }
    if (especifico) {
      const otros = lista.length - 1;
      return {
        texto: (sinFecha ? 'Ese día no tiene viaje; el más cercano: e' + contarViaje(lista[0], S, hoy).slice(1) : contarViaje(lista[0], S, hoy))
          + (otros ? ` Tiene ${otros} viaje${otros === 1 ? '' : 's'} más con esos datos.` : ''),
        acciones: [{ texto: 'Ver el viaje', tipo: 'viaje', valor: String(lista[0].id) }, ...(otros ? [{ texto: `Ver los ${lista.length}`, tipo: 'buscar' as TipoAccion, valor: pregunta }] : [])],
        entendio: true, opciones: []
      };
    }
    return {
      texto: `${interp.pregunta === 'contar' ? 'Hay' : 'Encontré'} ${lista.length} viaje${lista.length === 1 ? '' : 's'}${entendi ? ` (${entendi})` : ''}. 🚚`,
      acciones: [{ texto: 'Ver la lista', tipo: 'buscar', valor: pregunta }], entendio: true, opciones: []
    };
  }

  // 3. Cómo hacer algo / dónde está algo.
  if (temaClaro) return respuestaTema();

  // 4. No está claro: pregunta "¿te refieres a…?" (lo que escoja, lo aprende).
  const opciones = (puntuados.length ? puntuados.map(x => x.t) : TEMAS.filter(t => t.clave.startsWith('t:'))).slice(0, 3);
  return {
    texto: puntuados.length ? '¿Te refieres a alguna de estas? Si escoges una, me la aprendo. 🧠' : 'Uy, esa no me la sé todavía. 🤔 ¿Es alguna de estas? Si escoges una, me la aprendo.',
    acciones: [{ texto: 'Buscarlo en los viajes', tipo: 'buscar', valor: pregunta }], entendio: false, opciones
  };
}

/** Preguntas de ejemplo para quien no sabe qué preguntar. */
export const EJEMPLOS = [
  '¿Cuántos viajes salen mañana?',
  '¿Cómo agrego un viaje extra?',
  '¿Dónde veo los comparendos?',
  '¿Qué viajes tiene Polar esta semana?',
  ...EJEMPLOS_DATOS
];
