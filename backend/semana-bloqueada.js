// ============================================================
// SEMANA BLOQUEADA — el jefe "cierra" la programación de una semana
// (lunes a domingo). Desde ese momento, cualquier cambio al plan de esa
// semana (crear, mover, cambiar vehículo/conductor/ruta/cliente/cajas/hora,
// cancelar o eliminar un viaje) pide un MOTIVO y queda anotado en la lista
// "cambios después del cierre", para que nada se mueva sin que se sepa.
// Lo que pasó después (Entregado, observaciones, placa real, hora real...)
// se sigue anotando sin motivo. Funciones puras.
// Pruebas: test/semana-bloqueada.test.js
// ============================================================

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aTexto = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaLocal = (f) => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };
const fechaBonita = (f) => { const [a, m, d] = String(f).split('-'); return `${d}/${m}`; };

/** Lunes de la semana de esa fecha ('AAAA-MM-DD'), o '' si no es fecha. */
function lunesDe(fecha) {
    if (!FECHA.test(String(fecha || ''))) return '';
    const d = fechaLocal(String(fecha).slice(0, 10));
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return aTexto(d);
}

/** "12/10 al 18/10" */
function textoSemana(lunes) {
    if (!FECHA.test(String(lunes || ''))) return '';
    const d = fechaLocal(lunes); d.setDate(d.getDate() + 6);
    return `${fechaBonita(lunes)} al ${fechaBonita(aTexto(d))}`;
}

/** ¿Esa semana (por su lunes) está bloqueada? bloqueadas: [{ lunes, por, en }] */
const estaBloqueada = (lunes, bloqueadas) => !!lunes && (bloqueadas || []).some(b => b.lunes === lunes);

const txt = (v) => String(v ?? '').trim().toUpperCase();
// Lo que forma parte del plan (cambiarlo en una semana cerrada pide motivo).
const CAMPOS_DEL_PLAN = [['p', 'placa'], ['fecha'], ['salida', 'dia'], ['retorno'], ['ruta', 'codigo'], ['cond'], ['cliente', 'cli'], ['cajas'], ['hora'], ['tr', 'transportadora']];
const valor = (v, nombres) => { for (const n of nombres) if (v[n] !== undefined && v[n] !== null && v[n] !== '') return txt(v[n]); return ''; };

/**
 * Qué campos del plan cambiaron (vacío = nada del plan). Llenar un dato
 * que estaba vacío no cuenta (el formulario completa conductor y hora con
 * los del vehículo); cambiar o borrar uno que ya tenía valor, sí.
 */
function cambiosDelPlan(previo, nuevo) {
    const cambiados = CAMPOS_DEL_PLAN.filter(nombres => {
        const antes = valor(previo, nombres);
        return antes !== '' && antes !== valor({ ...previo, ...nuevo }, nombres);
    }).map(n => n[0]);
    if (previo.estado !== 'Cancelado' && nuevo.estado === 'Cancelado') cambiados.push('cancelado');
    return cambiados;
}

/**
 * ¿Este guardado toca una semana bloqueada? Devuelve el lunes de esa
 * semana o ''. accion: 'guardar' (crear o cambiar) o 'eliminar'.
 */
function semanaAfectada(previo, nuevo, bloqueadas, accion = 'guardar') {
    if (!(bloqueadas || []).length) return '';
    if (accion === 'eliminar') {
        const l = lunesDe(previo?.fecha);
        return estaBloqueada(l, bloqueadas) ? l : '';
    }
    if (!previo) {
        const l = lunesDe(nuevo?.fecha);
        return estaBloqueada(l, bloqueadas) ? l : '';
    }
    if (!cambiosDelPlan(previo, nuevo).length) return '';
    // Sale de una semana cerrada o entra a una.
    for (const l of [lunesDe(previo.fecha), lunesDe(nuevo.fecha ?? previo.fecha)]) {
        if (estaBloqueada(l, bloqueadas)) return l;
    }
    return '';
}

/** Frase corta de qué se hizo, para la lista de cambios después del cierre. */
function describirCambio(previo, nuevo, accion) {
    const v = nuevo || previo || {};
    const nombre = `${txt(v.p || v.placa)} · ${v.ruta || v.codigo || 'viaje'} (${fechaBonita(String(v.fecha || '').slice(0, 10))})`;
    if (accion === 'eliminar') return `Eliminó ${nombre}`;
    if (!previo) return `Agregó ${nombre}`;
    const c = cambiosDelPlan(previo, nuevo);
    if (c.includes('cancelado')) return `Canceló ${nombre}`;
    const nombres = { p: 'vehículo', fecha: 'fecha', salida: 'salida', retorno: 'retorno', ruta: 'ruta', cond: 'conductor', cliente: 'cliente', cajas: 'cajas', hora: 'hora', tr: 'transportadora' };
    return `Cambió ${[...new Set(c.map(x => nombres[x] || x))].join(', ')} de ${nombre}`;
}

module.exports = { lunesDe, textoSemana, estaBloqueada, cambiosDelPlan, semanaAfectada, describirCambio };
