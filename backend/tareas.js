// ============================================================
// TAREAS DEL EQUIPO — pendientes que una cuenta le asigna a otra (o a sí
// misma): "renovar SOAT de LUN 428 antes del viernes". Con fecha límite,
// prioridad, de qué trata (vehículo, conductor, viaje) y comentarios.
// Funciones puras: server.js guarda la lista en data/tareas.json.
// Pruebas: test/tareas.test.js
// ============================================================

const crypto = require('crypto');
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const txt = (v, max) => String(v ?? '').trim().slice(0, max);

/** Limpia lo que llega del navegador. Devuelve { tarea } o { error }. */
function validarTarea(cuerpo, anterior = null) {
    const titulo = txt(cuerpo.titulo, 140);
    if (!titulo) return { error: 'Escribe qué hay que hacer.' };
    const para = txt(cuerpo.para, 120).toLowerCase();
    if (!para) return { error: 'Escoge a quién se le asigna.' };
    const vence = txt(cuerpo.vence, 10);
    if (vence && !FECHA.test(vence)) return { error: 'La fecha límite no es válida.' };
    const sobreTipo = ['vehiculo', 'conductor', 'viaje', 'ruta', 'cliente'].includes(cuerpo.sobre?.tipo) ? cuerpo.sobre.tipo : '';
    return {
        tarea: {
            ...(anterior || {}),
            titulo, detalle: txt(cuerpo.detalle, 1000), para, vence,
            prioridad: cuerpo.prioridad === 'alta' ? 'alta' : 'normal',
            sobre: sobreTipo ? { tipo: sobreTipo, valor: txt(cuerpo.sobre.valor, 120) } : null
        }
    };
}

function nuevaTarea(datos, deEmail, ahora = new Date()) {
    return { id: crypto.randomBytes(6).toString('hex'), ...datos, de: deEmail, creada: ahora.toISOString(), hecha: false, hechaEn: '', hechaPor: '', comentarios: [] };
}

/** ¿Puede cambiarla? Quien la creó, a quien se le asignó o quien aprueba cambios (jefe/admin). */
function puedeTocar(tarea, email, esJefe) {
    return !!tarea && (esJefe || tarea.de === email || tarea.para === email);
}

/** Orden: sin hacer primero; vencidas y de prioridad alta arriba; luego por fecha límite. */
function ordenar(lista, hoy) {
    const peso = (t) => t.hecha ? 3 : (t.vence && t.vence < hoy ? 0 : (t.prioridad === 'alta' ? 1 : 2));
    return [...lista].sort((a, b) => peso(a) - peso(b)
        || (a.hecha ? String(b.hechaEn).localeCompare(String(a.hechaEn)) : String(a.vence || '9999').localeCompare(String(b.vence || '9999')))
        || String(b.creada).localeCompare(String(a.creada)));
}

module.exports = { validarTarea, nuevaTarea, puedeTocar, ordenar };
