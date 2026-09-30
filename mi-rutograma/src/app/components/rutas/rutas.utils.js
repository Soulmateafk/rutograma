/**
 * Busca una ruta específica dentro del listado por su código.
 */
export function buscarRutaPorCodigoJS(rutas, codigoRuta) {
  if (!rutas || !codigoRuta) return null;
  return rutas.find(r => r.cod === codigoRuta) || null;
}

/**
 * Devuelve un clon limpio de una ruta o un objeto vacío si es nueva.
 */
export function clonarOResetearRutaJS(rutas, index) {
  if (index > -1 && rutas && rutas[index]) {
    return { ...rutas[index] };
  }
  return { cod: '', dest: '', tarifa: 0, km: 0, dias: 1, horaBase: '' };
}

const MATRIZ_RUTAS = [
  { cod: "CUN-PLAT", dest: "PLATAFORMA", tipo: "corta", diasSem: [1,2,3,4,5,6,0,7], horas: {1:"12:00", 2:"12:00", 3:"12:00", 4:"12:00", 5:"12:00", 6:"12:00", 0:"12:00", 7:"12:00"} },
  { cod: "CAL-EXITO", dest: "ÉXITO CALI", tipo: "media", diasSem: [1,5], horas: {1:"14:00", 5:"14:00"} },
  { cod: "CAL-D1", dest: "D1 CALI", tipo: "media", diasSem: [1,2,3,4,5,0,7], horas: {1:"14:00", 2:"14:30", 3:"14:00", 4:"14:30", 5:"14:30", 0:"16:00", 7:"14:00"} },
  { cod: "EJE-D1", dest: "D1 EJE CAFETERO", tipo: "media", diasSem: [1,2,3,4,5,6,7], horas: {1:"16:00", 2:"15:30", 3:"16:00", 4:"16:00", 5:"16:00", 6:"15:00", 7:"16:00"} },
  { cod: "MED-EXITO", dest: "ÉXITO MEDELLÍN", tipo: "media", diasSem: [1,3,5,6], horas: {1:"16:30", 3:"16:30", 5:"16:30", 6:"15:30"} },
  { cod: "MED-D1G", dest: "D1 GIRARDOTA", tipo: "media", diasSem: [1,2,3,4,5,6,7], horas: {1:"14:30", 2:"15:00", 3:"14:30", 4:"15:30", 5:"15:00", 6:"14:30", 7:"14:30"} },
  { cod: "MED-D1GU", dest: "D1 GUARNE", tipo: "media", diasSem: [1,3,4,5,6,7], horas: {1:"14:30", 3:"14:30", 4:"15:00", 5:"15:00", 6:"15:00", 7:"14:30"} },
  { cod: "MED-D1E", dest: "D1 LA ESTRELLA", tipo: "media", diasSem: [1,2,3,4,5,6,7], horas: {1:"15:00", 2:"15:00", 3:"15:00", 4:"15:00", 5:"15:30", 6:"15:30", 7:"15:00"} },
  { cod: "BAR-ARA", dest: "ARA BARRANQUILLA", tipo: "larga", diasSem: [1,4,7], horas: {1:"18:00", 4:"17:00", 7:"18:00"} },
  { cod: "BAR-D1", dest: "D1 BARRANQUILLA", tipo: "larga", diasSem: [1,2,4,5,7], horas: {1:"19:00", 2:"17:30", 4:"17:30", 5:"17:00", 7:"19:00"} },
  { cod: "BAR-EXITO", dest: "ÉXITO BARRANQUILLA", tipo: "larga", diasSem: [1,5,7], horas: {1:"20:00", 5:"19:00", 7:"20:00"} },
  { cod: "MON-ARA", dest: "ARA MONTERÍA", tipo: "larga", diasSem: [2,6], horas: {2:"17:00", 6:"16:30"} },
  { cod: "MON-D1", dest: "D1 MONTERÍA", tipo: "larga", diasSem: [2], horas: {2:"17:30"} },
  { cod: "VAL-ARA", dest: "ARA VALLEDUPAR", tipo: "larga", diasSem: [2,5], horas: {2:"19:00", 5:"19:00"} },
  { cod: "VAL-D1", dest: "D1 VALLEDUPAR", tipo: "larga", diasSem: [1,4,7], horas: {1:"19:00", 4:"18:00", 7:"19:00"} },
  { cod: "IBA-D1", dest: "D1 IBAGUÉ", tipo: "media", diasSem: [1,2,3,4,5,0,7], horas: {1:"17:00", 2:"16:00", 3:"17:00", 4:"17:00", 5:"17:00", 0:"19:00", 7:"17:00"} },
  { cod: "CAR-ARA", dest: "ARA CARTAGENA", tipo: "larga", diasSem: [1,6,7], horas: {1:"17:30", 6:"16:00", 7:"17:30"} },
  { cod: "APA-D1", dest: "D1 APARTADO", tipo: "larga", diasSem: [1,0], horas: {1:"19:30", 0:"23:00"} },
  { cod: "TUN-D1", dest: "D1 TUNJA", tipo: "media", diasSem: [1,4,0], horas: {1:"23:00", 4:"23:00", 0:"23:00"} },
  { cod: "BOG-D1", dest: "D1 BOGOTA", tipo: "corta", diasSem: [1,2,3,4,5,6,0,7], horas: {1:"14:00", 2:"13:00", 3:"11:00", 4:"12:00", 5:"9:00", 6:"12:00", 0:"5:00", 7:"14:00"} },
  { cod: "BOG-EXITO", dest: "ÉXITO TIENDAS", tipo: "corta", diasSem: [1,2,3,4,5,6,0,7], horas: {1:"15:00", 2:"14:00", 3:"12:00", 4:"13:00", 5:"10:00", 6:"12:00", 0:"6:00", 7:"15:00"} },
  { cod: "BOG-CEN", dest: "CENCOSUD TIENDAS", tipo: "corta", diasSem: [1,2,3,4,5,6,0,7], horas: {1:"16:00", 2:"15:00", 3:"13:00", 4:"14:00", 5:"11:00", 6:"13:00", 0:"7:00", 7:"16:00"} },
  { cod: "BOG-ALK", dest: "ALKOSTO", tipo: "corta", diasSem: [1,2,3,4,5,0], horas: {1:"16:00", 2:"16:00", 3:"15:00", 4:"15:00", 5:"14:00", 0:"8:00"} },
  { cod: "BOG-OLI", dest: "OLIMPICA", tipo: "corta", diasSem: [1,2,3,4,5,6,0,7], horas: {1:"17:00", 2:"17:00", 3:"14:00", 4:"16:00", 5:"12:00", 6:"15:00", 0:"8:00", 7:"17:00"} }
];

function cargarRutasDesdeMatriz() {
  S.rutas = MATRIZ_RUTAS.map(r => ({
    codigo: r.cod,
    destino: r.dest,
    tipo: r.tipo,
    diasSem: r.diasSem,
    horasXDia: r.horas,
    tarifaMakand: 0, // Definir aquí tus valores
    clientes: [r.dest]
  }));
  console.log("Rutas cargadas desde matriz:", S.rutas);
}

/**
 * Inicializador principal: Asegura que si no hay rutas cargadas, 
 * se utilicen las de la Matriz Maestra.
 */
export function inicializarSistemaJS() {
  // Verificamos si S.rutas ya tiene contenido; si no, cargamos la matriz
  if (!S || !S.rutas || S.rutas.length === 0) {
    cargarRutasDesdeMatriz();
  }
  
  // Si tienes una función para guardar el estado en tu app, llámala aquí. 
  // Ejemplo: guardarDatos();
  
  console.log("Sistema Makand SAS: Rutas y estado inicializados.");
}

/**
 * Función auxiliar para obtener la hora de despacho de hoy 
 * para cualquier ruta, ideal para mostrar en el Dashboard.
 */
export function obtenerHoraDespachoHoyJS(ruta) {
  const hoy = new Date().getDay(); // 0 = Domingo, 1 = Lunes...
  if (ruta.horasXDia && ruta.horasXDia[hoy]) {
    return ruta.horasXDia[hoy];
  }
  return '—';
}