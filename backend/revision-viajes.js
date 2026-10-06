// ============================================================
// REVISIÓN DE VIAJES — dos cosas que se revisan al asignar un viaje:
//  1. Documentos vencidos: el vehículo no puede salir con el SOAT o la
//     tecnomecánica vencidos, ni el conductor con la licencia vencida,
//     en algún día del viaje (de la salida al último día ocupado).
//  2. Choques de agenda: el mismo vehículo o el mismo conductor en dos
//     viajes que se cruzan (un viaje que sale el día en que el otro ya
//     regresó, "retorno", NO choca).
// Las filas de cupo (ARSITRANS 1, POLAR 2...) no son vehículos reales y
// no se revisan. Un viaje es del conductor anotado; si no tiene, del
// titular de la placa. Funciones puras.
// Espejo en el front: mi-rutograma/src/app/services/revision-viajes.ts
// Pruebas: test/revision-viajes.test.js
// ============================================================

const { sumarDiasFecha, diasOcupadoViaje } = require('./reglas');

const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
const ESTADOS_SIN_VIAJE = ['Cancelado', 'Mantenimiento'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const limpiar = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
const pegada = (p) => String(p ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const esPlacaCupo = (p) => /^(ARSITRANS|POLAR)\s*\d+$/i.test(String(p || '').trim());
const placaDe = (v) => String(v.p ?? v.placa ?? '').toUpperCase().trim();

/** Días que ocupa el viaje: { desde, hasta } ('hasta' = día en que ya está libre). */
function rangoViaje(v) {
    if (!FECHA.test(String(v.fecha || ''))) return null;
    return { desde: v.fecha, hasta: sumarDiasFecha(v.fecha, Math.max(1, diasOcupadoViaje(v))) };
}

const seCruzan = (a, b) => a.desde < b.hasta && b.desde < a.hasta;

/** ¿Este viaje cuenta? (no cancelado, con fecha, no es mantenimiento) */
const cuenta = (v) => v && !ESTADOS_SIN_VIAJE.includes(v.estado) && !!rangoViaje(v);

/** Quién hace el viaje: clave para comparar, nombre para mostrar y si es por ser titular de la placa. */
function conductorDelViaje(v, conductores) {
    const anotado = limpiar(v.cond ?? v.conductor);
    if (!SIN_CONDUCTOR.includes(anotado)) {
        const c = (conductores || []).find(x => limpiar(x.nom ?? x.nombre) === anotado);
        return { clave: anotado, nombre: String(c?.nom ?? c?.nombre ?? v.cond ?? v.conductor).trim(), titular: false };
    }
    const placa = pegada(placaDe(v));
    if (!placa) return null;
    const titular = (conductores || []).find(c => pegada(c.veh ?? c.placa) === placa);
    return titular ? { clave: limpiar(titular.nom ?? titular.nombre), nombre: String(titular.nom ?? titular.nombre).trim(), titular: true } : null;
}

const fechaBonita = (f) => { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; };

/**
 * Documentos vencidos en algún día del viaje. Devuelve una lista de textos
 * (vacía = todo al día). data: { vehiculos, conductores }.
 */
function documentosVencidos(v, data) {
    const rango = rangoViaje(v);
    if (!rango || ESTADOS_SIN_VIAJE.includes(v.estado)) return [];
    const ultimoDia = sumarDiasFecha(rango.hasta, -1);
    const faltas = [];
    const placa = placaDe(v);
    if (placa && !esPlacaCupo(placa)) {
        const vehiculo = (data.vehiculos || []).find(x => pegada(x.p ?? x.placa) === pegada(placa));
        if (vehiculo) {
            [['soatVence', 'el SOAT'], ['tecnoVence', 'la tecnomecánica']].forEach(([campo, nombre]) => {
                const vence = String(vehiculo[campo] || '').trim();
                if (FECHA.test(vence) && vence < ultimoDia) faltas.push(`${placa}: ${nombre} venció o vence el ${fechaBonita(vence)}`);
            });
        }
    }
    const quien = conductorDelViaje(v, data.conductores);
    if (quien) {
        const conductor = (data.conductores || []).find(c => limpiar(c.nom ?? c.nombre) === quien.clave);
        const vence = String(conductor?.licVence || '').trim();
        if (conductor && FECHA.test(vence) && vence < ultimoDia) {
            faltas.push(`${String(conductor.nom ?? conductor.nombre).trim()}: la licencia venció o vence el ${fechaBonita(vence)}`);
        }
    }
    return faltas;
}

/**
 * Otros viajes que se cruzan con este: mismo vehículo o mismo conductor.
 * Devuelve [{ viaje, por: 'vehículo' | 'conductor', texto }].
 */
function choquesDeAgenda(v, viajes, conductores) {
    if (!cuenta(v)) return [];
    const rango = rangoViaje(v);
    const placa = pegada(placaDe(v));
    const revisarPlaca = placa && !esPlacaCupo(placaDe(v));
    const quien = conductorDelViaje(v, conductores);
    const choques = [];
    (viajes || []).forEach(o => {
        if (o === v || (v.id !== undefined && v.id !== null && o.id === v.id) || !cuenta(o)) return;
        const r = rangoViaje(o);
        if (!r || !seCruzan(rango, r)) return;
        const nombreRuta = `${o.ruta || o.codigo || ''} del ${fechaBonita(o.fecha)}`.trim();
        if (revisarPlaca && pegada(placaDe(o)) === placa) {
            choques.push({ viaje: o, por: 'vehículo', texto: `${placaDe(v)} ya tiene el viaje ${nombreRuta}` });
            return;
        }
        const otro = quien ? conductorDelViaje(o, conductores) : null;
        if (!quien || !otro || otro.clave !== quien.clave) return;
        const texto = quien.titular
            ? `${placaDe(v)} no tiene conductor anotado y su titular, ${quien.nombre}, va en ${placaDe(o)} (viaje ${nombreRuta})`
            : otro.titular
                ? `${quien.nombre} es el titular de ${placaDe(o)}, que tiene el viaje ${nombreRuta} sin conductor anotado`
                : `${quien.nombre} ya tiene el viaje ${nombreRuta} (en ${placaDe(o)})`;
        choques.push({ viaje: o, por: 'conductor', texto });
    });
    return choques;
}

/**
 * Todos los problemas de los viajes de un mes ('AAAA-MM'), para el aviso
 * del Rutograma: [{ viaje, vencidos: [...], choques: [...] }].
 */
function revisarMes(data, prefijoMes) {
    const viajes = data.viajes || [];
    return viajes
        .filter(v => cuenta(v) && String(v.fecha).startsWith(prefijoMes))
        .map(v => ({ viaje: v, vencidos: documentosVencidos(v, data), choques: choquesDeAgenda(v, viajes, data.conductores) }))
        .filter(x => x.vencidos.length || x.choques.length)
        .sort((a, b) => String(a.viaje.fecha).localeCompare(String(b.viaje.fecha)));
}

/**
 * ¿Cambió algo que obliga a revisar? (nuevo, o cambió vehículo, conductor
 * o fechas). Así marcar Entregado o cancelar un viaje viejo nunca se frena.
 */
function cambioLoQueSeRevisa(previo, nuevo) {
    if (!previo) return true;
    return pegada(placaDe(previo)) !== pegada(placaDe(nuevo))
        || limpiar(previo.cond) !== limpiar(nuevo.cond)
        || previo.fecha !== nuevo.fecha
        || Number(previo.salida || 0) !== Number(nuevo.salida || 0)
        || Number(previo.retorno || 0) !== Number(nuevo.retorno || 0)
        || (ESTADOS_SIN_VIAJE.includes(previo.estado) && !ESTADOS_SIN_VIAJE.includes(nuevo.estado));
}

module.exports = { rangoViaje, conductorDelViaje, documentosVencidos, choquesDeAgenda, revisarMes, cambioLoQueSeRevisa, esPlacaCupo };
