// ============================================================
// DÍAS CERRADOS — un viaje que ya terminó (su día de regreso es anterior
// a hoy) queda cerrado: sin el permiso "editarDiasPasados" no se puede
// mover, reasignar ni borrar, y no se pueden crear viajes en días
// pasados. Así el histórico no cambia por error.
// Lo que se sabe DESPUÉS del viaje sí se puede seguir anotando: el estado
// (Entregado, Cancelado...), el motivo, la placa real, la hora real, etc.
// Un viaje que todavía va en camino NO está cerrado (se puede reportar
// varado a mitad de ruta). Funciones puras. Pruebas: test/dias-cerrados.test.js
// ============================================================

/** Fecha local 'YYYY-MM-DD' (la del computador donde corre el servidor). */
function fechaLocal(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumarDias(fecha, dias) {
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + dias);
    return fechaLocal(d);
}

/** Día en que el viaje regresa (o el de salida si no tiene regreso). */
function finDeViaje(viaje) {
    const fecha = String(viaje?.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return '';
    const salida = Number(viaje.salida || viaje.dia || 0);
    const retorno = Number(viaje.retorno || 0);
    return sumarDias(fecha, retorno > salida ? retorno - salida : 0);
}

/** ¿El viaje ya terminó antes de hoy? (sin fecha válida = no se bloquea) */
function viajeCerrado(viaje, hoy = fechaLocal()) {
    const fin = finDeViaje(viaje);
    return !!fin && fin < hoy;
}

// Lo que define el viaje (no se toca en un día cerrado). Cada grupo son
// nombres distintos del mismo dato, según de dónde venga el viaje.
const CAMPOS_PROTEGIDOS = [
    { nombre: 'fecha', claves: ['fecha'] },
    { nombre: 'día de salida', claves: ['salida', 'dia'] },
    { nombre: 'día de regreso', claves: ['retorno'] },
    { nombre: 'vehículo', claves: ['p', 'placa'] },
    { nombre: 'ruta', claves: ['ruta', 'codigo'] },
    { nombre: 'destino', claves: ['destino'] },
    { nombre: 'cliente', claves: ['cliente', 'cli'] },
    { nombre: 'transportadora', claves: ['tr', 'transportadora'] },
    { nombre: 'conductor', claves: ['cond', 'conductor'] },
    { nombre: 'cajas', claves: ['cajas'] },
    { nombre: 'hora', claves: ['hora'] },
    { nombre: 'tarifa', claves: ['tarifa'] },
    { nombre: 'costo', claves: ['costo'] },
    { nombre: '2do cliente', claves: ['cli2'] },
    { nombre: '2do destino', claves: ['dest2'] },
    { nombre: 'cajas del 2do cliente', claves: ['cajas2'] },
    { nombre: 'prioridad', claves: ['prioridad'] }
];

// Valores que la app usa para "no hay dato" (o rellena al mostrar el viaje).
const VALORES_VACIOS = ['SIN ASIGNAR', 'SIN CONDUCTOR', 'NORMAL', 'NO DEFINIDO', '--:--', '---', '0'];

function valorDe(viaje, claves) {
    for (const c of claves) {
        const v = viaje?.[c];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            const t = String(v).trim();
            if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t) === 0 ? '' : String(Number(t));
            // Valores "vacíos" que la app escribe de distintas formas.
            return VALORES_VACIOS.includes(t.toUpperCase()) ? '' : t.toUpperCase();
        }
    }
    return '';
}

/**
 * Nombres de los datos protegidos que cambian entre dos versiones del viaje.
 * Llenar un dato que estaba vacío no cuenta (la pantalla rellena al mostrar
 * el viaje, ej. el costo de la ruta); cambiarlo o borrarlo, sí.
 */
function camposProtegidosCambiados(antes, despues) {
    return CAMPOS_PROTEGIDOS
        // Un dato que no viene en lo que se manda no se está cambiando.
        .filter(g => g.claves.some(c => despues && c in despues))
        .filter(g => {
            const a = valorDe(antes, g.claves);
            return a !== '' && a !== valorDe(despues, g.claves);
        })
        .map(g => g.nombre);
}

/**
 * ¿Este guardado toca un día cerrado? Devuelve el motivo para mostrar, o ''.
 * previo: el viaje como está guardado (null si es nuevo).
 */
function motivoBloqueoGuardar(previo, nuevo, hoy = fechaLocal()) {
    if (!previo) {
        return viajeCerrado(nuevo, hoy)
            ? 'No se permite añadir viajes en días ya cerrados (ese día ya pasó). Escoge hoy o un día siguiente; para cargar un viaje de un día pasado hace falta el permiso "Cambiar o borrar viajes de días ya cerrados".'
            : '';
    }
    if (viajeCerrado(previo, hoy)) {
        const cambiados = camposProtegidosCambiados(previo, nuevo);
        return cambiados.length
            ? `Este viaje es de un día cerrado: solo se puede cambiar el estado y lo que pasó después (placa real, hora real, observaciones). No se puede cambiar: ${cambiados.join(', ')}.`
            : '';
    }
    // Un viaje abierto no se puede mandar a un día que ya pasó.
    return viajeCerrado({ ...previo, ...nuevo }, hoy)
        ? 'No se puede mover un viaje a un día que ya pasó.'
        : '';
}

function motivoBloqueoEliminar(previo, hoy = fechaLocal()) {
    return previo && viajeCerrado(previo, hoy)
        ? 'Este viaje es de un día cerrado: no se puede eliminar. Si no se hizo, márcalo como Cancelado.'
        : '';
}

module.exports = { fechaLocal, finDeViaje, viajeCerrado, camposProtegidosCambiados, motivoBloqueoGuardar, motivoBloqueoEliminar };
