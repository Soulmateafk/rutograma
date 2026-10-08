// ============================================================
// PAPELERA — lo que se elimina (viajes, vehículos, rutas, conductores,
// novedades y despachos) queda 30 días en la papelera y se puede
// recuperar con un clic. Pasados los 30 días se borra de verdad.
// Funciones puras; server.js guarda la papelera en la base (tabla
// papelera) y la llena justo antes de cada eliminación.
// Pruebas: test/papelera.test.js
// ============================================================

const DIAS_EN_PAPELERA = 30;

const TIPOS = {
    viaje: 'Viaje', vehiculo: 'Vehículo', ruta: 'Ruta', conductor: 'Conductor', novedad: 'Novedad', despacho: 'Despacho'
};

const may = (t) => String(t ?? '').toUpperCase().trim();
const txt = (t) => String(t ?? '').trim();
const fechaBonita = (f) => { const [a, m, d] = String(f || '').slice(0, 10).split('-'); return d ? `${d}/${m}/${a}` : ''; };

/** Texto corto para mostrar en la papelera. */
function etiqueta(tipo, o) {
    if (!o) return '';
    switch (tipo) {
        case 'viaje': return `${may(o.p || o.placa)} · ${o.ruta || o.codigo || 'sin ruta'}${o.destino && o.destino !== 'No definido' ? ' → ' + o.destino : ''}${o.fecha ? ' (' + fechaBonita(o.fecha) + ')' : ''}`;
        case 'vehiculo': return `${may(o.p || o.placa)}${o.tr ? ' · ' + o.tr : ''}`;
        case 'ruta': return `${o.cod || o.codigo}${o.dest || o.destino ? ' → ' + (o.dest || o.destino) : ''}`;
        case 'conductor': return `${txt(o.nom || o.nombre)}${o.ced ? ' (CC ' + o.ced + ')' : ''}`;
        case 'novedad': return txt(o.titulo) || 'Novedad';
        case 'despacho': return `${may(o.placa)} → ${o.destino || ''} (${fechaBonita(o.fecha)}, llegó ${o.horaLlegada || ''})`;
        default: return '';
    }
}

/** Cómo encontrar cada cosa en los datos (la "clave" que la identifica). */
const BUSCAR = {
    viaje: { lista: 'viajes', clave: (o) => o.id, igual: (o, c) => o.id === c || String(o.id) === String(c) },
    vehiculo: { lista: 'vehiculos', clave: (o) => may(o.p || o.placa), igual: (o, c) => may(o.p || o.placa) === may(c) },
    ruta: { lista: 'rutas', clave: (o) => may(o.cod || o.codigo), igual: (o, c) => may(o.cod || o.codigo) === may(c) },
    conductor: { lista: 'conductores', clave: (o) => txt(o.ced || o.cedula), igual: (o, c) => txt(o.ced || o.cedula) === txt(c) },
    novedad: { lista: 'novedades', clave: (o) => o.id, igual: (o, c) => String(o.id) === String(c) }
};

/**
 * Lo que una petición va a eliminar, leído ANTES de que se elimine:
 * { tipo, clave, etiqueta, datos } o null si no es una eliminación (o no
 * existe). leerDespacho(id) trae un despacho de su tabla.
 */
function queSeElimina(metodo, ruta, cuerpo, data, leerDespacho) {
    const b = cuerpo || {};
    let tipo = null, clave = null;
    if (metodo === 'POST' && ruta === '/api/viajes/eliminar') { tipo = 'viaje'; clave = b.id; }
    else if (metodo === 'POST' && ruta === '/api/vehiculos/eliminar') { tipo = 'vehiculo'; clave = b.p || b.placa; }
    else if (metodo === 'DELETE' && ruta.startsWith('/api/vehiculos/')) { tipo = 'vehiculo'; clave = decodeURIComponent(ruta.split('/').pop()); }
    else if (metodo === 'POST' && ruta === '/api/rutas/eliminar') { tipo = 'ruta'; clave = b.cod; }
    else if (metodo === 'POST' && ruta === '/api/conductores/eliminar') { tipo = 'conductor'; clave = b.id || b.ced; }
    else if (metodo === 'POST' && ruta === '/api/novedades/eliminar') { tipo = 'novedad'; clave = b.id; }
    else if (metodo === 'POST' && ruta === '/api/despachos/eliminar') {
        const d = leerDespacho ? leerDespacho(Number(b.id)) : null;
        return d ? { tipo: 'despacho', clave: String(d.id), etiqueta: etiqueta('despacho', d), datos: d } : null;
    }
    if (!tipo || clave === undefined || clave === null || clave === '') return null;
    const buscar = BUSCAR[tipo];
    const o = (data?.[buscar.lista] || []).find(x => buscar.igual(x, clave));
    return o ? { tipo, clave: String(buscar.clave(o)), etiqueta: etiqueta(tipo, o), datos: JSON.parse(JSON.stringify(o)) } : null;
}

/**
 * Devuelve el elemento a los datos (no los despachos, que van en su
 * tabla). { ok, msg }. No pisa nada: si ya existe otro con la misma
 * clave (se volvió a crear después de borrarlo), no se recupera.
 */
function restaurarEn(data, item) {
    const buscar = BUSCAR[item?.tipo];
    if (!buscar) return { ok: false, msg: 'No se puede recuperar este elemento.' };
    if (!Array.isArray(data[buscar.lista])) data[buscar.lista] = [];
    const ya = data[buscar.lista].find(x => buscar.igual(x, item.clave));
    if (ya) {
        return { ok: false, msg: `Ya existe ${TIPOS[item.tipo].toLowerCase() === 'ruta' ? 'una ruta' : 'un ' + TIPOS[item.tipo].toLowerCase()} con esos datos (${etiqueta(item.tipo, ya)}): se creó de nuevo después de borrarlo. Si quieres el de la papelera, borra primero el actual.` };
    }
    data[buscar.lista].push(JSON.parse(JSON.stringify(item.datos)));
    return { ok: true, msg: `Se recuperó: ${item.etiqueta}.` };
}

/** Fecha (ISO) en que se borra de verdad. */
function venceEl(eliminadoEn, dias = DIAS_EN_PAPELERA) {
    const d = new Date(eliminadoEn);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + dias);
    return d.toISOString();
}

module.exports = { DIAS_EN_PAPELERA, TIPOS, etiqueta, queSeElimina, restaurarEn, venceEl };
