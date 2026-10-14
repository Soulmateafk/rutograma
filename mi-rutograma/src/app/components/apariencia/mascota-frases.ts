/**
 * Todo lo que dice el furgoncito (components/apariencia/mascota.ts):
 * consejos de la app, consejos según la pantalla, datos curiosos de la vía y
 * del transporte refrigerado, datos sacados del propio Rutograma (se calculan
 * en el momento) y curiosidades de cada festividad.
 */

export const al = <T>(l: T[]): T => l[Math.floor(Math.random() * l.length)];

// ---------- Consejos de la app (en cualquier pantalla) ----------
export const CONSEJOS = [
  'Con Ctrl+K buscas cualquier viaje, placa o conductor.',
  'En el buscador puedes escribir como hablas: "viajes de Orlando a Cali la otra semana".',
  'Prueba buscar "qué vehículos están libres mañana" en el buscador. 🔎',
  'Arrastra un viaje a otro día en el Rutograma para moverlo.',
  'Clic derecho sobre un viaje: editar, duplicar, WhatsApp y más.',
  'La tecla F deja solo el Rutograma a pantalla completa.',
  'Con la tecla B abres tus notas personales. 📝',
  'Ctrl+Z deshace el último cambio.',
  'La tecla T cambia entre modo claro y oscuro. 🌗',
  'Con + y - agrandas o achicas la letra de toda la app.',
  'La tecla A abre la Apariencia: temas, colores, fondos y más. 🎨',
  'La tecla N abre un Viaje Extra; Shift+N, una Novedad.',
  'En Apariencia hay 24 temas listos de un clic.',
  'Deja el mouse quieto sobre un viaje y verás su detalle.',
  '¿Un descanso? En Apariencia puedes jugar un ratico. 🎮',
  'El alfiler junto a la placa deja ese vehículo de primero.',
  'La tecla ? muestra todos los atajos de teclado.',
  '"G" y luego "R" te lleva al Rutograma. "G" y "D", al Dashboard.',
  '"G" y luego "C" te lleva a Conductores; "G" y "V", a Vehículos.',
  '"G" y luego "M" abre el Mapa de destinos. 🗺️',
  'En el Dashboard, "Personalizar" te deja mover y ocultar los cuadros.',
  'El botón "?" de abajo a la derecha tiene guías paso a paso.',
  '¿Lluvia de fondo mientras trabajas? Apariencia → Sonidos → Ambiente. 🌧️',
  'Con "Hoja de ruta" le das al conductor un PDF con todo su viaje.',
  'Desde la ficha del conductor le mandas sus viajes por WhatsApp.',
  'El Calendario de fiestas te dice cuánto falta para cada una. 📅',
  'La Pizarra es para avisos de todo el equipo. 📌',
  'Si cambias un viaje de una semana cerrada, la app te pide el motivo.',
  'En "Hoja de vida" ves todo lo que le ha pasado a un vehículo.',
  'La Papelera guarda lo eliminado 30 días, por si acaso. 🗑️',
  'En Tareas puedes asignarle algo a un compañero con fecha límite. ✅',
  'El número rojo en el botón de Tareas quiere decir que algo vence hoy.',
  'Toca el nombre de un conductor para ver su perfil: rutas que conoce, clientes, viajes…',
  '¿Un vehículo varado? En las alertas del Dashboard está el botón "Plan B".',
  'Plan B te propone a quién pasarle los viajes de un vehículo que se dañó. 🔧',
  'El "Cierre de semana" te arma el resumen de lunes a domingo para enviarlo por correo.',
  'Con "Presentación" muestras los números por semanas o meses, como diapositivas. 📊',
  'En Presentación puedes comparar dos semanas o dos meses lado a lado.',
  'En el Comparativo, "Analizar en detalle" tiene gráficos de torta, barras y líneas.',
  'La "Foto" del Rutograma se puede sacar del día, la semana o el mes, con vista previa. 📸',
  'Cumplimiento te muestra qué tan a tiempo salen y llegan los viajes.',
  'En Comparendos llevas el control de las multas de cada conductor.',
  'En Quejas anotas los reclamos de cada cliente para no repetir errores.',
  'El Mapa muestra a dónde vamos más seguido.',
  'En Reglas configuras qué vehículo sirve para cada cliente y el pico y placa.',
  'La app avisa si a un vehículo le va a tocar pico y placa en los próximos días.',
  'La app no te deja asignar un vehículo con el SOAT o la tecnomecánica vencidos. 🛡️',
  'Si un conductor queda en dos viajes a la vez, la app te avisa del choque.',
  'Los auxiliares pueden hacer cambios: se aplican cuando un jefe los aprueba.',
  'En Aprobaciones, "Ver detalle" te muestra el cambio explicado, no en código.',
  'El Resumen del día sale una vez al día; también está en el menú "Más".',
  'En Apariencia → "Pantalla al entrar" eliges qué ver apenas inicias sesión.',
  'Si la conexión se cae, lo que edites se guarda aquí y se envía solo al volver.',
  'Los conductores pueden ver su ruta en el celular aunque no tengan señal. 📴',
  'El modo prueba es solo para ti: el resto del equipo sigue en lo real. 🧪',
  'Puedes instalar MAKAND como aplicación en el celular o el computador.',
  'En "Sesiones" ves en qué equipos está abierta tu cuenta y puedes cerrarlas.',
  'El modo daltonismo cambia los colores para que todo se distinga mejor.',
  'En Apariencia puedes ponerle tu propia foto o un avatar a tu cuenta.',
  'El círculo verde en la barra de arriba cuenta quién más está conectado ahora.',
  'Si alguien está editando el mismo viaje que tú, la app te avisa.',
  'Despachos registra a qué hora llega y termina de cargar cada vehículo. ⏱️',
  'Con el "Historial de cambios" de un viaje sabes quién lo cambió y cuándo.',
  'Exportar la semana en PDF es perfecto para imprimir o compartir.',
  'Los conductores pueden agregar sus viajes al calendario del celular. 📆',
  'En Histórico encuentras cómo quedó cada mes, aunque ya haya pasado.',
  'Puedes quitarme en Apariencia → "La mascota"… pero me pondría triste. 🥺'
];

// ---------- Consejos según la pantalla abierta ----------
export const CONSEJOS_POR_PAGINA: Record<string, string[]> = {
  '/rutograma': [
    'Arrastra un viaje con el mouse para pasarlo a otro día o a otro vehículo.',
    'Escribe una placa en "Resaltar placa" para encontrarla de un vistazo.',
    'Los colores de cada transportadora se cambian en Apariencia.',
    'Las semanas con candado están cerradas: cambiarlas pide un motivo. 🔒',
    'Con la lupa (+ y -) acercas o alejas el Rutograma.',
    'Clic derecho sobre un viaje para duplicarlo o mandarlo por WhatsApp.',
    'Los viajes "por revisar" tienen algo pendiente: documentos, choques o reglas.'
  ],
  '/dashboard': [
    'Los números del Dashboard se actualizan solos cada pocos segundos.',
    'Con "Personalizar" pones primero lo que más miras.',
    'Las alertas de arriba son lo urgente del día: empieza por ahí. 🚨',
    '"Capacidad próximos 7 días" te dice si van a faltar vehículos.'
  ],
  '/vehiculos': [
    'Revisa aquí el SOAT y la tecnomecánica: la app avisa antes de que venzan.',
    'Toca "Hoja de vida" para ver el historial completo de un vehículo.',
    'Si un vehículo entra a taller, márcalo en mantenimiento con fechas.'
  ],
  '/conductores': [
    'Toca el nombre del conductor para ver su perfil completo.',
    'Revisa que cada licencia esté vigente: la app avisa antes de que venza.',
    'Desde aquí le puedes mandar a cada conductor sus viajes por WhatsApp. 📲'
  ],
  '/rutas': [
    'Si una ruta cambia de destino, edítala aquí y se ve en todo lado.'
  ],
  '/tareas': [
    'Pon fecha límite a las tareas: las vencidas suben de primeras.',
    'Al marcar una tarea como hecha, le llega un correo a quien la creó. 📧',
    'Puedes enlazar una tarea con un vehículo, conductor, ruta o cliente.'
  ],
  '/comparativo': [
    '"Analizar en detalle" te deja desglosar cada cosa con gráficos.',
    'Compara meses para ver si estamos moviendo más o menos que antes. 📈'
  ],
  '/configuracion': [
    'El modo prueba es tuyo: practica sin miedo, los demás siguen en lo real.',
    'Aquí se descargan y restauran los respaldos de la información.'
  ],
  '/despachos': [
    'Anota la hora de llegada y la de salida de cada vehículo para medir el cargue.',
    'La app avisa cuando un vehículo lleva demasiado tiempo cargando. ⏰'
  ],
  '/mapa': ['El Mapa muestra cuántos viajes van a cada destino.', 'Cambia el mes del Mapa para ver cómo se mueven los destinos.'],
  '/aprobaciones': ['Puedes aprobar varios cambios a la vez marcándolos. ✔️', 'Si rechazas un cambio, escribe el motivo: le llega al auxiliar.']
};

// ---------- Datos curiosos ----------
export const DATOS = [
  'Dato: un furgón refrigerado mantiene la carga entre 2 y 8 °C. ❄️',
  'Dato: los congelados viajan a -18 °C o menos. 🧊',
  'Dato: cada vez que se abre la puerta del furgón se escapa el frío. ¡Mejor abrir poco!',
  'Dato: la "cadena de frío" no se puede romper ni un ratico: el producto se daña.',
  'Dato: el hielo seco es gas carbónico congelado a casi -79 °C.',
  'Dato: Colombia tiene más de 200.000 km de carreteras.',
  'Dato: Colombia tiene tres cordilleras: Occidental, Central y Oriental. ⛰️',
  'Dato: el túnel de La Línea mide más de 8 km y se abrió en 2020.',
  'Dato: la vía Bogotá–Villavicencio cruza el túnel de Chirajara y muchos más.',
  'Dato: el río Magdalena recorre más de 1.500 km de sur a norte.',
  'Dato: Colombia tiene frontera con 5 países: Venezuela, Brasil, Perú, Ecuador y Panamá.',
  'Dato: Buenaventura es el puerto más importante de Colombia sobre el Pacífico. ⚓',
  'Dato: el Paisaje Cultural Cafetero es Patrimonio de la Humanidad. ☕',
  '¿Sabías? El Carnaval de Barranquilla es Patrimonio de la Humanidad. 🎭',
  '¿Sabías? A Cali le dicen la capital mundial de la salsa. 💃',
  '¿Sabías? Bogotá está a 2.600 metros sobre el nivel del mar.',
  'Dato: revisar la presión de las llantas ahorra combustible. 🛞',
  'Dato: la presión de las llantas se mide en frío, antes de arrancar.',
  'Dato: un conductor descansado es un conductor seguro. 😴➡️🚚',
  'Dato: se recomienda parar a descansar cada dos horas de manejo.',
  'Dato: deja al menos 3 segundos de distancia con el carro de adelante… y más si llueve.',
  'Dato: los camiones tienen puntos ciegos grandes: si no ves los espejos, el conductor no te ve.',
  'Dato: frenar suave y sin afanes cuida la carga y el bolsillo.',
  'Dato: antes de un viaje largo, revisa luces, aceite y llantas.',
  'Dato: con niebla se usan luces bajas; las altas rebotan y encandilan. 🌫️',
  '¿Sabías? El primer camión se fabricó en 1896.',
  '¿Sabías? En la Costa se dice "carro" y en el interior "camión" para casi lo mismo. 😄',
  '¿Sabías? La carretera Panamericana va de Alaska a la Patagonia… menos el tapón del Darién.',
  'Dato: tomar agua en el viaje ayuda a no cansarse. 💧',
  'Dato: cargar bien distribuido el furgón hace el viaje más seguro.'
];

// ---------- Tonterías (para sacar una sonrisa) ----------
export const TONTERIAS = [
  'Cuentan que hay un viaje que nunca se marca como entregado… y todavía sigue rodando. 👻',
  'Dicen que si dices "Rutograma" tres veces frente al espejo, aparece un viaje extra. 😱',
  'Cuentan que una vez un furgón llegó antes de tiempo. Nadie le creyó. 🤫',
  'Leyenda de la oficina: existe un SOAT que se renovó solo. Nadie lo ha vuelto a ver.',
  'Dicen que en la madrugada se escucha un pito en el parqueadero… soy yo practicando. 📯',
  'Mi sueño: una vía sin huecos, sin trancón y con tintico gratis cada 50 km. ☕',
  'Yo no tengo gasolina: funciono a puro cariño y a los clics que me das. ❤️',
  'Me dicen "el refri con ruedas" y no me ofende. ❄️🚚',
  'Una vez intenté hacer reversa y me salió un Ctrl+Z. 🤷',
  'Si ves que me muevo solo, es el viento… o un fantasma de Halloween. 🌬️',
  'Mi pariente lejano es el carrito del supermercado. No hablamos mucho. 🛒',
  'Estoy a dieta: solo como kilómetros. 😋',
  'No le tengo miedo a nada… bueno, a los reductores de velocidad sí. 😰',
  'Mi placa es secreta. Si te la digo, me toca pico y placa. 🤐',
  'Cuentan que en la Papelera hay viajes que todavía esperan a que alguien los rescate. 🗑️',
  'Dicen que el café de la oficina hace que los viajes salgan más rápido. No está comprobado. ☕',
  'Si alguna vez no respondo, es que me fui a lavar al lavadero. 🧽',
  '¿Por qué el camión fue al psicólogo? Porque llevaba mucha carga emocional. 😂',
  '¿Qué le dijo una llanta a la otra? "¡Qué presión tengo hoy!" 🛞',
  '¿Qué le dijo el semáforo al furgón? "No me mires que me estoy cambiando." 🚦',
  '¿Por qué el GPS nunca discute? Porque siempre está recalculando. 🧭',
  '¿Cuál es el colmo de un conductor? Tener una vida llena de curvas. 😄',
  '¿Cuál es el colmo de un furgón refrigerado? Que lo dejen frío en una conversación. ❄️',
  'Si las rutas fueran novelas, la vía al Llano sería la de más capítulos. 📺',
  'Mi deporte favorito: el parqueo en paralelo. Llevo años practicando. 🅿️',
  'Dicen que el que más madruga… igual se encuentra un trancón. 🚗🚗🚗',
  'Cuando nadie me ve, me pongo a contar las cajas. Llevo 3.482. Creo. 📦',
  'Prometo no pitar en las reuniones. Bueno, casi nunca. 📯'
];

// ---------- Reacciones ----------
export const AL_GUARDAR = ['¡Guardado! 👌', '¡Listo, quedó!', '¡Eso! Uno menos. ✅', '¡Bien hecho! 🚚💨', '¡Anotado!', '¡Perfecto!', '¡Así se hace!',
  '¡Quedó de una!', '¡Ya está en el sistema! 💾', '¡Excelente trabajo!', '¡Listo el pollo! 🐔', '¡Cuadrado!', '¡Va pa\' esa! 👍', '¡Eso es todo! 🙌'];
export const AL_ELIMINAR = ['¡Chao! 👋 Quedó en la papelera.', 'Eliminado. Si fue sin querer, Ctrl+Z.', 'Se fue a la papelera. Ahí está 30 días por si acaso.', 'Borrado. ¡Más espacio! 🧹'];
export const AL_ERROR = ['¡Uy! Algo no salió. Revisa el aviso. 😟', 'Ups… mira el mensaje rojo.', 'Hmm, eso no se pudo. Intenta otra vez.', '¡Ay! Algo falta o no cuadra.',
  'Se me pinchó una llanta… mira el aviso. 🛞', 'Tranquilo, se arregla. Lee el mensaje. 🙂', 'Eso no pasó. ¿Faltó algún dato?'];
export const COSQUILLAS = ['¡Jaja, me haces cosquillas! 😆', '¡Piii piii! 📯', '¡Ey, que estoy trabajando! 😄', '¡Ya, ya, ya! Me mareo. 😵‍💫',
  '¡Cuidado con la pintura! 😝', '¡Que me desalineas! 🛞', '¡Jajaja, para, para!', '¡Pa\' que me pitas si ya me moví! 😂'];
export const AL_DESPERTAR = ['¡Ah! Ya desperté. 😄', '¿Eh? ¡Aquí estoy! 🚚', 'Me quedé dormido en el parqueadero… 😅', '¡Uy! Me cogió el sueño. ¿Seguimos?',
  'Estaba soñando con una vía sin huecos… 😴', '¡Motor encendido otra vez! 🔑'];
export const HOLA = ['¡Hola! ¿Cómo vamos hoy? 🚚', '¿Qué hay de nuevo? 😄', 'Aquí estoy, listo para rodar.', '¿Te ayudo con algo? Tócame cuando quieras.',
  'Con el tanque lleno y listo. ⛽', '¡Rodando juntos! 🛣️'];

export const HORA: Array<{ hasta: number; frases: string[] }> = [
  { hasta: 6, frases: ['¿Tan temprano? Los conductores ya van saliendo. 🌄', 'Madrugada de trabajo… ¡ánimo!', 'El que madruga encuentra la vía despejada. 🛣️'] },
  { hasta: 10, frases: ['¡Buenos días! ¿Ya tomaste tintico? ☕', 'Arrancamos el día. ¡Con toda! 💪', 'Buen día: revisa qué viajes salen hoy.', 'A esta hora la mayoría de los viajes ya va en camino.', '¿Desayunaste? Con hambre no se programa bien. 🍳'] },
  { hasta: 12, frases: ['Media mañana: buen momento para revisar los viajes por aprobar.', '¿Ya revisaste la Pizarra hoy?', 'Un tinto de media mañana y seguimos. ☕', 'Buen momento para mirar los documentos que vencen pronto.'] },
  { hasta: 14, frases: ['¿Ya almorzaste? 🍲', 'Hora del almuerzo… los conductores también paran a comer.', 'Un corrientazo y seguimos. 🍛', 'Después del almuerzo, a revisar lo de mañana.'] },
  { hasta: 18, frases: ['La tarde va rápido. ¿Cómo vamos con las entregas?', '¿Una aromática? 🍵 Ya casi cerramos el día.', 'Buen momento para dejar lista la programación de mañana.', 'Las onces: pan y chocolate, ¿o qué? 🍫'] },
  { hasta: 21, frases: ['Ya es de noche. Revisa lo de mañana y a descansar. 🌙', 'Buen trabajo hoy. 👏', '¿Todavía por aquí? ¡Qué compromiso!'] },
  { hasta: 24, frases: ['Es tarde… no te quedes mucho. 😴', 'Los furgones también descansan de noche. 🌙', 'Mañana será otro gran día. Ve a dormir. 💤'] }
];

export const DIA_SEMANA = [
  ['¡Domingo! Ojalá estés descansando. 😄', 'Domingo de trabajo… ¡gracias por estar! 🙏'],
  ['Lunes: arrancamos semana. ¡Con toda! 💪', 'Lunes: revisa cómo quedó programada la semana.', 'Nuevo lunes, nuevas rutas. 🛣️'],
  ['Martes: la semana ya va andando.', 'Martes: ni te cases ni te embarques… ¡pero los furgones sí salen! 😄'],
  ['Miércoles: mitad de semana. ¡Vamos bien!', 'Miércoles: ombligo de la semana. 😄'],
  ['Jueves: ya casi es viernes. 😉', 'Jueves: buen día para ir preparando el cierre de semana.'],
  ['¡Viernes! A cerrar bien la semana. 🎉', 'Viernes: no olvides el cierre de semana. 📊', 'Viernes: revisa quién viaja el fin de semana.'],
  ['Sábado de trabajo… ¡gracias por estar! 🙌', 'Sábado: medio día y a descansar. 😎']
];

// ---------- Curiosidades de cada festividad (claves de services/temporadas.ts) ----------
export const FIESTAS: Record<string, string[]> = {
  halloween: [
    '¿Sabías? Halloween viene de una fiesta celta llamada Samhain, de hace más de 2.000 años. 🎃',
    '¿Sabías? En Irlanda las primeras "calabazas" eran nabos tallados. 😱',
    'En Colombia los niños salen a pedir dulces con "¡Triqui triqui Halloween, quiero dulces para mí!" 🍬',
    'Halloween es la noche antes del Día de Todos los Santos (1 de noviembre).',
    '"Jack-o\'-lantern" es el nombre de la calabaza tallada con vela adentro.',
    'Si ves un murciélago en la app, tranquilo: no muerde. 🦇',
    'Este mes los documentos vencidos dan más miedo que los fantasmas. 👻',
    'Mi disfraz de bruja me queda bien, ¿no? 🧙‍♀️',
    'Cuidado al manejar el 31: hay muchos niños disfrazados en la calle. 🚸',
    'Dicen que a medianoche los viajes cancelados vuelven a aparecer en el Rutograma… 👻',
    'Cuentan que un conductor dejó la ruta sin marcar y desde entonces su furgón pita solo. 📯😱',
    'No mires debajo del Rutograma después de las 6 p. m. Solo te digo eso. 🕷️',
    'El fantasma de la oficina solo come una cosa: documentos vencidos. 📄👻',
    'Este año me disfracé de furgón. Nadie lo notó. 🎃'
  ],
  navidad: [
    'La Novena de Aguinaldos se reza del 16 al 24 de diciembre. 🎄',
    'Natilla y buñuelos: lo más navideño de Colombia. 😋',
    'Los aguinaldos de antes: "pajita en boca", "tres pies", "dar y no recibir"…',
    'Los alumbrados de Medellín son de los más famosos del mundo. ✨',
    'En diciembre hay más tráfico en las salidas de las ciudades: programa con tiempo.',
    'Papá Noel también tiene ruta fija: una sola noche, todo el mundo. 🎅',
    'El 24 a medianoche se abren los regalos en casi todo el país. 🎁',
    'Diciembre es mes de mucha carga: ¡qué bien que estemos listos!',
    'Mi gorro de Papá Noel es de verdad. Bueno… casi. 😄',
    'Los renos de Papá Noel no tienen pico y placa. ¡Qué envidia! 🦌',
    'Papá Noel me pidió prestado el furgón refrigerado para los helados de los duendes. 🍦',
    'Dicen que el 24 en la noche un trineo pasa más rápido que cualquier Viaje Extra. 🛷'
  ],
  'ano-nuevo': [
    'Tradición: comer 12 uvas a medianoche, una por cada mes. 🍇',
    'Dicen que dar la vuelta a la manzana con una maleta trae viajes. 🧳 ¡Nosotros ya los tenemos!',
    'Tradición: quemar el "año viejo" a medianoche. 🔥',
    'Lentejas en el bolsillo para que no falte la plata. 💰',
    'Ropa interior amarilla para la buena suerte. 💛',
    'Año nuevo: buen momento para revisar SOAT y tecnomecánicas del año.'
  ],
  velitas: [
    'El 7 de diciembre en la noche se prenden velas y faroles en todo el país. 🕯️',
    'La noche de velitas abre oficialmente la Navidad en Colombia.',
    'En Quimbaya (Quindío) hacen un festival de faroles hermosísimo. 🏮',
    'Las velitas se prenden en honor a la Inmaculada Concepción (8 de diciembre).',
    'Cuidado con las velas cerca de cortinas y niños. 🔥'
  ],
  'amor-amistad': [
    'En Colombia, Amor y Amistad se celebra el tercer sábado de septiembre. 💛',
    'El "amigo secreto" es el plan de oficina más clásico del mes. 🎁',
    'Hoy es buen día para darle las gracias a ese compañero que siempre ayuda.',
    'El mejor regalo para un conductor: una ruta sin trancón. 😄'
  ],
  'san-valentin': [
    'San Valentín es el 14 de febrero; en Colombia lo grande es en septiembre. 💘',
    'Un detalle no tiene que ser caro: un "gracias" también vale. 💌'
  ],
  mujer: [
    'El 8 de marzo es el Día Internacional de la Mujer. 💐',
    'Gracias a todas las mujeres que mueven MAKAND cada día.',
    'Cada vez hay más mujeres conductoras de carga en Colombia. 🚚'
  ],
  madre: [
    'En Colombia el Día de la Madre es el segundo domingo de mayo. 🌷',
    'Ese fin de semana hay mucho movimiento en las carreteras: ojo con los tiempos.',
    'Un saludo a todas las mamás del equipo. 💐'
  ],
  padre: [
    'El Día del Padre en Colombia es el tercer domingo de junio. 👔',
    'Un saludo a los papás que manejan lejos de casa. 🚚❤️'
  ],
  trabajo: [
    'El 1 de mayo se celebra el Día del Trabajo en casi todo el mundo. 🛠️',
    'El Día del Trabajo recuerda las luchas por la jornada de 8 horas.',
    'Gracias por todo el trabajo que hacen posible cada entrega.'
  ],
  'semana-santa': [
    'En Semana Santa hay plan retorno: las vías se llenan el domingo. 🚗🚗🚗',
    'Las procesiones de Popayán son Patrimonio de la Humanidad.',
    'Los huevos de Pascua representan la vida nueva. 🐣',
    'Ojo: en puentes y Semana Santa puede haber restricción para vehículos de carga.'
  ],
  conductor: [
    'En Colombia el Día del Conductor es el 16 de julio, día de la Virgen del Carmen. 🚚',
    'La Virgen del Carmen es la patrona de los conductores.',
    'Sin conductores no hay entregas: ¡gracias a todos! 🙌',
    'Hoy es buen día para llamar a un conductor y darle las gracias.'
  ],
  independencia: [
    'El 20 de julio de 1810 empezó el camino hacia la independencia de Colombia. ⭐',
    'La historia del "florero de Llorente" fue la chispa del 20 de julio.',
    'Amarillo, azul y rojo: ¡qué bonita la bandera! 🇨🇴'
  ],
  boyaca: [
    'El 7 de agosto de 1819 se ganó la Batalla de Boyacá. ⚔️',
    'La batalla fue en el Puente de Boyacá, cerca de Tunja.',
    'El 6 de agosto también es el cumpleaños de Bogotá (fundada en 1538). 🎂'
  ],
  aniversario: [
    '¡Feliz aniversario, MAKAND! Cada viaje cuenta esta historia. 🎂',
    'Un año más moviendo lo que importa, con la mejor gente.'
  ]
};

// ---------- Datos del propio Rutograma (se calculan con lo que hay hoy) ----------
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase());

/** El que más se repite (y cuántas veces). */
function elQueMas(lista: string[]): [string, number] | null {
  const c = new Map<string, number>();
  lista.forEach(x => { if (x) c.set(x, (c.get(x) || 0) + 1); });
  let mejor: [string, number] | null = null;
  c.forEach((n, k) => { if (!mejor || n > mejor[1]) mejor = [k, n]; });
  return mejor;
}

/** Frases con números reales del Rutograma (del mes y de los próximos días). */
export function datosDelRutograma(S: any, hoy = new Date()): string[] {
  const viajes = ((S?.viajes || []) as any[]).filter(v => v && v.estado !== 'Cancelado' && v.fecha);
  if (!viajes.length) return [];
  const mes = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  const delMes = viajes.filter(v => String(v.fecha).startsWith(mes));
  const nombreMes = MESES[hoy.getMonth()];
  const frases: string[] = [];

  if (delMes.length) {
    frases.push(`En ${nombreMes} llevamos ${delMes.length} viajes programados. 🚚`);
    const destino = elQueMas(delMes.map(v => titulo(String(v.destino || '').trim())));
    if (destino && destino[1] > 1) frases.push(`El destino estrella de ${nombreMes}: ${destino[0]}, con ${destino[1]} viajes. 📍`);
    const cliente = elQueMas(delMes.map(v => String(v.cliente || '').trim()));
    if (cliente && cliente[1] > 1) frases.push(`El cliente con más viajes este mes es ${cliente[0]} (${cliente[1]}). 🏪`);
    const placa = elQueMas(delMes.map(v => String(v.p || v.placa || '').toUpperCase().trim()));
    if (placa && placa[1] > 1) frases.push(`El vehículo más rodado de ${nombreMes}: ${placa[0]}, con ${placa[1]} viajes. 🏆`);
    const cond = elQueMas(delMes.map(v => String(v.cond || '').trim()).filter(c => c.length > 3 && !/sin conductor|por asignar/i.test(c)));
    if (cond && cond[1] > 1) frases.push(`${titulo(cond[0])} es quien más viaja este mes: ${cond[1]} viajes. 👏`);
    const cajas = delMes.reduce((s, v) => s + (Number(v.cajas) || 0), 0);
    if (cajas > 0) frases.push(`Este mes movemos ${cajas.toLocaleString('es-CO')} cajas en total. 📦`);
    const entregados = delMes.filter(v => v.estado === 'Entregado').length;
    if (entregados) frases.push(`Ya van ${entregados} viajes entregados en ${nombreMes}. ✅`);
    const destinos = new Set(delMes.map(v => titulo(String(v.destino || '').trim())).filter(Boolean)).size;
    if (destinos > 1) frases.push(`Este mes llegamos a ${destinos} destinos distintos. 🗺️`);
    const extras = delMes.filter(v => v.tipo === 'extra').length;
    if (extras) frases.push(`${extras} de los viajes de ${nombreMes} son extras. ⚡`);
  }

  const manana = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 1));
  const deManana = viajes.filter(v => String(v.fecha).slice(0, 10) === manana).length;
  frases.push(deManana ? `Mañana salen ${deManana} viaje${deManana === 1 ? '' : 's'}. ¿Ya está todo listo? 📋` : 'Mañana no hay viajes programados todavía.');

  const desde = iso(hoy), hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + 6));
  const semana = viajes.filter(v => { const f = String(v.fecha).slice(0, 10); return f >= desde && f <= hasta; }).length;
  if (semana) frases.push(`En los próximos 7 días hay ${semana} viajes. 🗓️`);

  const finDeMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate() - hoy.getDate();
  if (finDeMes > 0 && finDeMes <= 5) frases.push(`Faltan ${finDeMes} día${finDeMes === 1 ? '' : 's'} para cerrar ${nombreMes}. 📆`);

  const vehiculos = (S?.vehiculos || []) as any[];
  if (vehiculos.length) frases.push(`La flota tiene ${vehiculos.length} vehículos. 🚛`);
  const conductores = (S?.conductores || []) as any[];
  if (conductores.length) frases.push(`Somos ${conductores.length} conductores en el equipo. 👷`);
  return frases;
}
