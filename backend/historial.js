// ============================================================
// HISTORIAL DE UN VIAJE — convierte los eventos de auditoría de un viaje
// (cada uno trae la "foto" completa del viaje guardado) en una lista
// legible: quién, cuándo y qué cambió respecto a la foto anterior.
// Funciones puras. Pruebas: test/historial.test.js
// ============================================================

const CAMPOS = [
    { clave: ['p', 'placa'], nombre: 'Vehículo' },
    { clave: ['fecha'], nombre: 'Fecha' },
    { clave: ['ruta', 'codigo'], nombre: 'Ruta' },
    { clave: ['cond'], nombre: 'Conductor' },
    { clave: ['estado'], nombre: 'Estado' },
    { clave: ['tr', 'transportadora'], nombre: 'Transportadora' },
    { clave: ['hora'], nombre: 'Hora' },
    { clave: ['cajas'], nombre: 'Cajas' },
    { clave: ['retorno'], nombre: 'Día de retorno' },
    { clave: ['prioridad'], nombre: 'Prioridad' },
    { clave: ['cliente'], nombre: 'Cliente' },
    { clave: ['obs'], nombre: 'Observaciones' }
];

const valor = (foto, claves) => {
    for (const c of claves) {
        const v = foto?.[c];
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return '';
};

/**
 * @param {Array<{fecha, usuario, ruta, resumen}>} eventos del más viejo al más nuevo
 * @returns {Array<{fecha, usuario, accion, cambios: Array<{campo, de, a}>, aprobadoPor?}>} del más nuevo al más viejo
 */
function armarHistorialViaje(eventos) {
    const salida = [];
    let anterior = null;
    for (const e of eventos || []) {
        const r = e.resumen || {};
        if (e.ruta === '/api/viajes/eliminar') {
            salida.push({ fecha: e.fecha, usuario: e.usuario, accion: 'Eliminó el viaje', cambios: [], aprobadoPor: r.aprobadoPor });
            anterior = null;
            continue;
        }
        if (r.aprobacion === 'PENDIENTE') {
            salida.push({ fecha: e.fecha, usuario: e.usuario, accion: 'Pidió un cambio (esperando aprobación)', cambios: [] });
            continue;
        }
        const cambios = [];
        if (anterior) {
            CAMPOS.forEach(c => {
                const de = valor(anterior, c.clave), a = valor(r, c.clave);
                if (de !== a) cambios.push({ campo: c.nombre, de: de || '—', a: a || '—' });
            });
        }
        // Un guardado sin cambios visibles (ej. se volvió a guardar igual) no se lista.
        if (anterior && !cambios.length && !r.aprobadoPor) { anterior = r; continue; }
        salida.push({
            fecha: e.fecha,
            usuario: e.usuario,
            accion: anterior ? 'Cambió el viaje' : 'Guardó el viaje',
            cambios,
            aprobadoPor: r.aprobadoPor || undefined
        });
        anterior = r;
    }
    return salida.reverse();
}

module.exports = { armarHistorialViaje };
