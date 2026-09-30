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

module.exports = {
    sumarDiasFecha,
    rangosMantenimiento,
    diasOcupadoViaje,
    mantenimientoQueChoca,
    agregarSesionConTope
};
