// ============================================================
// AVISOS AL CONDUCTOR — qué cambió en sus viajes desde la última vez que
// tocó "Entendido" en Mis viajes: viajes nuevos, cambios (fecha, hora,
// vehículo, ruta, destino, cancelado) y viajes que ya no tiene. Lo "visto"
// se guarda por conductor (cédula). Funciones puras.
// Pruebas: test/avisos-conductor.test.js
// ============================================================

const CAMPOS = [
    { clave: 'fecha', nombre: 'Fecha' },
    { clave: 'hora', nombre: 'Hora' },
    { clave: 'placa', nombre: 'Vehículo' },
    { clave: 'ruta', nombre: 'Ruta' },
    { clave: 'destino', nombre: 'Destino' },
    { clave: 'cancelado', nombre: 'Estado' },
    { clave: 'nota', nombre: 'Nota' }
];

/** Lo que le importa al conductor de un viaje (para comparar). */
function firmaViaje(v) {
    return {
        fecha: String(v.fecha || ''),
        hora: String(v.hora || ''),
        placa: String(v.placa || '').toUpperCase().trim(),
        ruta: String(v.ruta || '').toUpperCase().trim(),
        destino: String(v.destino || '').trim(),
        cancelado: v.estado === 'Cancelado' ? 'Cancelado' : '',
        nota: String(v.nota || '').trim()
    };
}

/**
 * viajes: los de Mis viajes. visto: { [id]: firma } guardado, o null si el
 * conductor nunca ha confirmado (la primera vez no se marca nada).
 * hoy: 'AAAA-MM-DD' (los viajes ya pasados que desaparecen no se avisan).
 */
function compararConVisto(viajes, visto, hoy) {
    if (!visto) return { viajes: viajes.map(v => ({ ...v, aviso: null })), quitados: [], hayAvisos: false };
    const ids = new Set();
    const conAviso = viajes.map(v => {
        ids.add(String(v.id));
        const antes = visto[String(v.id)];
        const ahora = firmaViaje(v);
        if (!antes) return { ...v, aviso: { tipo: 'nuevo', cambios: [] } };
        const cambios = CAMPOS
            .filter(c => String(antes[c.clave] || '') !== ahora[c.clave])
            .map(c => ({ campo: c.nombre, de: c.clave === 'cancelado' ? (antes.cancelado || 'Activo') : antes[c.clave] || '—', a: c.clave === 'cancelado' ? (ahora.cancelado || 'Activo') : ahora[c.clave] || '—' }));
        return { ...v, aviso: cambios.length ? { tipo: ahora.cancelado && !antes.cancelado ? 'cancelado' : 'cambio', cambios } : null };
    });
    const quitados = Object.entries(visto)
        .filter(([id, f]) => !ids.has(id) && f.fecha >= hoy)
        .map(([id, f]) => ({ id, ...f }))
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { viajes: conAviso, quitados, hayAvisos: quitados.length > 0 || conAviso.some(v => v.aviso) };
}

/** Lo que se guarda al tocar "Entendido". */
function armarVisto(viajes) {
    const visto = {};
    viajes.forEach(v => { visto[String(v.id)] = firmaViaje(v); });
    return visto;
}

module.exports = { firmaViaje, compararConVisto, armarVisto };
