// ============================================================
// REGLAS DEL NEGOCIO — funciones puras (sin Express, sin base de
// datos) que usa server.js. Están aparte para poder probarlas solas:
// ver test/reglas.test.js ("npm test" dentro de backend).
// ============================================================

// ------------------------------------------------------------
// MANTENIMIENTO vs VIAJES — una sola regla para todo el servidor
// (Generar Matriz, guardar un viaje y la cancelación automática):
// un vehículo en mantenimiento NO puede tener ningún viaje que lo
// ocupe en esos días. La única excepción es un viaje que SALGA el
// último día del mantenimiento (ese día ya vuelve del taller).
// Antes solo se revisaba el día de SALIDA: un viaje que salía el 16
// y volvía el 18 quedaba encima de un mantenimiento del 17 al 19.
// ------------------------------------------------------------
function sumarDiasFecha(fecha, dias) {
    const d = new Date(fecha + 'T00:00:00');
    d.setDate(d.getDate() + dias);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Mantenimiento activo + los ya cerrados (historialMantenimiento).
function rangosMantenimiento(vehiculo) {
    const rangos = [];
    if (!vehiculo) return rangos;
    if (vehiculo.mantInicio && vehiculo.mantFin) rangos.push({ inicio: vehiculo.mantInicio, fin: vehiculo.mantFin });
    let historial = vehiculo.historialMantenimiento;
    if (typeof historial === 'string') {
        try { historial = JSON.parse(historial); } catch { historial = []; }
    }
    if (Array.isArray(historial)) {
        historial.forEach(m => { if (m && m.inicio && m.fin) rangos.push({ inicio: m.inicio, fin: m.fin }); });
    }
    return rangos;
}

// Días que el vehículo queda ocupado por un viaje (de la salida hasta
// el día en que ya está libre otra vez, "retorno").
function diasOcupadoViaje(viaje) {
    const salida = Number(viaje.salida || viaje.dia || 0);
    const retorno = Number(viaje.retorno || 0);
    return retorno > salida ? retorno - salida : 1;
}

// Devuelve el mantenimiento con el que choca el viaje, o null.
// fechaSalida: 'YYYY-MM-DD'; dias: días que el vehículo queda ocupado.
function mantenimientoQueChoca(rangos, fechaSalida, dias) {
    if (!fechaSalida) return null;
    const fechaLibre = sumarDiasFecha(fechaSalida, Math.max(1, dias));
    return rangos.find(r => fechaSalida < r.fin && fechaLibre > r.inicio) || null;
}

// ------------------------------------------------------------
// TOPE DE SESIONES POR CUENTA
// Agrega "nueva" a la lista de sesiones activas:
//  - Si ya había una sesión de la misma cuenta en el MISMO dispositivo,
//    la reemplaza (volver a entrar desde el mismo equipo no gasta cupo).
//  - Si la cuenta queda con más de "max" sesiones, cierra las que
//    llevan más tiempo sin usarse — nunca la que acaba de entrar.
// Devuelve la lista nueva y cuántas se cerraron por el tope.
// ------------------------------------------------------------
function agregarSesionConTope(sesiones, nueva, max) {
    let lista = sesiones;
    if (nueva.dispositivoId) {
        lista = lista.filter(x => !(x.email === nueva.email && x.dispositivoId === nueva.dispositivoId));
    }
    lista = [...lista, nueva];
    const deLaCuenta = lista
        .filter(x => x.email === nueva.email && x.id !== nueva.id)
        .sort((a, b) => Date.parse(a.ultima || a.creada) - Date.parse(b.ultima || b.creada));
    const sobranCuantas = deLaCuenta.length + 1 - max;
    if (sobranCuantas <= 0) return { sesiones: lista, cerradasPorTope: 0 };
    const sobran = new Set(deLaCuenta.slice(0, sobranCuantas).map(x => x.id));
    return { sesiones: lista.filter(x => !sobran.has(x.id)), cerradasPorTope: sobran.size };
}

// ------------------------------------------------------------
// VARIEDAD DE RUTAS EN GENERAR MATRIZ
// Entre los vehículos libres para una ruta, se prefiere (en orden):
//  1. uno cuyo ÚLTIMO viaje no fue a este mismo destino (no repetir seguido),
//  2. el que menos veces ha ido a este destino en el mes,
//  3. el que quedó libre primero,
//  4. el que lleva menos viajes.
// Los vehículos con rutina fija (restringidos, como LUN 428) no entran en
// la regla de variedad: para ellos solo cuentan 3 y 4, como antes.
// "historial" es { [placa]: { ultimo: destino, conteo: { [destino]: n } } }.
// ------------------------------------------------------------
function compararParaVariedad(a, b, destino, historial) {
    const puntaje = (c) => {
        if (c.restringido) return [0, 0];
        const h = historial[c.placa];
        if (!h) return [0, 0];
        return [h.ultimo === destino ? 1 : 0, h.conteo[destino] || 0];
    };
    const [repiteA, vecesA] = puntaje(a);
    const [repiteB, vecesB] = puntaje(b);
    if (repiteA !== repiteB) return repiteA - repiteB;
    if (vecesA !== vecesB) return vecesA - vecesB;
    if (a.libreDesde !== b.libreDesde) return a.libreDesde - b.libreDesde;
    return (a.viajes || 0) - (b.viajes || 0);
}

function anotarDestino(historial, placa, destino) {
    const h = historial[placa] || (historial[placa] = { ultimo: null, conteo: {} });
    h.ultimo = destino;
    h.conteo[destino] = (h.conteo[destino] || 0) + 1;
}

module.exports = {
    compararParaVariedad,
    anotarDestino,
    sumarDiasFecha,
    rangosMantenimiento,
    diasOcupadoViaje,
    mantenimientoQueChoca,
    agregarSesionConTope
};
