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
// Rendimiento: el Rutograma revisa el mes entero (cientos de viajes contra
// más de mil). Por eso cada viaje se "prepara" UNA vez (fechas, placa,
// conductor) y solo se comparan los viajes de la misma placa o del mismo
// conductor — antes se comparaba todo contra todo y tardaba ~0,5 s.
// Espejo en el front: mi-rutograma/src/app/services/revision-viajes.ts
// Pruebas: test/revision-viajes.test.js
// ============================================================

const { sumarDiasFecha, diasOcupadoViaje } = require('./reglas');
const { reglasIncumplidas } = require('./reglas-asignacion');

const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
const ESTADOS_SIN_VIAJE = ['Cancelado', 'Mantenimiento'];
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const limpiar = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
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

/** Conductores por nombre y por placa, para no buscarlos uno por uno. */
function indiceConductores(conductores) {
    const porNombre = new Map(), porPlaca = new Map();
    (conductores || []).forEach(c => {
        const nombre = limpiar(c.nom ?? c.nombre);
        if (nombre && !porNombre.has(nombre)) porNombre.set(nombre, c);
        const placa = pegada(c.veh ?? c.placa);
        if (placa && !porPlaca.has(placa)) porPlaca.set(placa, c);
    });
    return { porNombre, porPlaca };
}

function quienHace(v, indice) {
    const anotado = limpiar(v.cond ?? v.conductor);
    if (!SIN_CONDUCTOR.includes(anotado)) {
        const c = indice.porNombre.get(anotado);
        return { clave: anotado, nombre: String(c?.nom ?? c?.nombre ?? v.cond ?? v.conductor).trim(), titular: false };
    }
    const placa = pegada(placaDe(v));
    const titular = placa ? indice.porPlaca.get(placa) : null;
    return titular ? { clave: limpiar(titular.nom ?? titular.nombre), nombre: String(titular.nom ?? titular.nombre).trim(), titular: true } : null;
}

/** Quién hace el viaje: clave para comparar, nombre para mostrar y si es por ser titular de la placa. */
function conductorDelViaje(v, conductores) {
    return quienHace(v, indiceConductores(conductores));
}

const fechaBonita = (f) => { const [a, m, d] = f.split('-'); return `${d}/${m}/${a}`; };

/**
 * Documentos vencidos en algún día del viaje. Devuelve una lista de textos
 * (vacía = todo al día). data: { vehiculos, conductores }.
 */
function documentosVencidos(v, data, indice = indiceConductores(data.conductores)) {
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
    const quien = quienHace(v, indice);
    if (quien) {
        const conductor = indice.porNombre.get(quien.clave);
        const vence = String(conductor?.licVence || '').trim();
        if (conductor && FECHA.test(vence) && vence < ultimoDia) {
            faltas.push(`${String(conductor.nom ?? conductor.nombre).trim()}: la licencia venció o vence el ${fechaBonita(vence)}`);
        }
    }
    return faltas;
}

/** Lo que hace falta de cada viaje para compararlo (se calcula una vez). */
function preparar(v, indice) {
    if (!cuenta(v)) return null;
    const placa = placaDe(v);
    return { v, rango: rangoViaje(v), placa, clavePlaca: esPlacaCupo(placa) ? '' : pegada(placa), quien: quienHace(v, indice) };
}

function choquesEntre(a, candidatos) {
    const choques = [];
    const vistos = new Set();
    candidatos.forEach(b => {
        if (!b || b === a || vistos.has(b)) return;
        vistos.add(b);
        const o = b.v;
        if (a.v.id !== undefined && a.v.id !== null && o.id === a.v.id) return;
        if (!seCruzan(a.rango, b.rango)) return;
        const nombreRuta = `${o.ruta || o.codigo || ''} del ${fechaBonita(o.fecha)}`.trim();
        if (a.clavePlaca && b.clavePlaca === a.clavePlaca) {
            choques.push({ viaje: o, por: 'vehículo', texto: `${a.placa} ya tiene el viaje ${nombreRuta}` });
            return;
        }
        const quien = a.quien, otro = b.quien;
        if (!quien || !otro || otro.clave !== quien.clave) return;
        const texto = quien.titular
            ? `${a.placa} no tiene conductor anotado y su titular, ${quien.nombre}, va en ${b.placa} (viaje ${nombreRuta})`
            : otro.titular
                ? `${quien.nombre} es el titular de ${b.placa}, que tiene el viaje ${nombreRuta} sin conductor anotado`
                : `${quien.nombre} ya tiene el viaje ${nombreRuta} (en ${b.placa})`;
        choques.push({ viaje: o, por: 'conductor', texto });
    });
    return choques;
}

/** Agrupa los viajes preparados por placa y por conductor. */
function agrupar(preparados) {
    const porPlaca = new Map(), porConductor = new Map();
    const meter = (mapa, clave, p) => { if (!clave) return; const l = mapa.get(clave); if (l) l.push(p); else mapa.set(clave, [p]); };
    preparados.forEach(p => { if (!p) return; meter(porPlaca, p.clavePlaca, p); meter(porConductor, p.quien?.clave, p); });
    return { porPlaca, porConductor };
}

const candidatosDe = (a, grupos) => [...(grupos.porPlaca.get(a.clavePlaca) || []), ...(a.quien ? grupos.porConductor.get(a.quien.clave) || [] : [])];

/**
 * Otros viajes que se cruzan con este: mismo vehículo o mismo conductor.
 * Devuelve [{ viaje, por: 'vehículo' | 'conductor', texto }].
 */
function choquesDeAgenda(v, viajes, conductores) {
    const indice = indiceConductores(conductores);
    const a = preparar(v, indice);
    if (!a) return [];
    const otros = (viajes || []).filter(o => o !== v).map(o => preparar(o, indice));
    return choquesEntre(a, candidatosDe(a, agrupar(otros)));
}

/**
 * Todos los problemas de los viajes de un mes ('AAAA-MM'), para el aviso
 * del Rutograma: [{ viaje, vencidos: [...], choques: [...], reglas: [...] }]
 * (reglas: las de cliente/ruta y pico y placa, ver reglas-asignacion.js).
 */
function revisarMes(data, prefijoMes) {
    const indice = indiceConductores(data.conductores);
    const preparados = (data.viajes || []).map(v => preparar(v, indice));
    const grupos = agrupar(preparados);
    return preparados
        .filter(p => p && String(p.v.fecha).startsWith(prefijoMes))
        .map(p => ({ viaje: p.v, vencidos: documentosVencidos(p.v, data, indice), choques: choquesEntre(p, candidatosDe(p, grupos)), reglas: reglasIncumplidas(p.v, data) }))
        .filter(x => x.vencidos.length || x.choques.length || x.reglas.length)
        .sort((a, b) => String(a.viaje.fecha).localeCompare(String(b.viaje.fecha)));
}

/** Un dato que ya tenía valor y cambió. Llenar uno que estaba vacío no cuenta:
 * la pantalla de edición rellena sola la hora o el cliente de la ruta. */
const VACIOS = ['', '--:--', 'NO DEFINIDO'];
const cambioDeDato = (antes, despues) => {
    const a = limpiar(antes), d = limpiar(despues);
    return !VACIOS.includes(a) && a !== d;
};

/**
 * ¿Cambió algo que obliga a revisar? (nuevo, o cambió vehículo, conductor,
 * fechas, ruta, hora o cliente — estos tres por las reglas de la oficina). Así marcar Entregado o cancelar un viaje viejo nunca se frena.
 */
function cambioLoQueSeRevisa(previo, nuevo) {
    if (!previo) return true;
    return pegada(placaDe(previo)) !== pegada(placaDe(nuevo))
        || limpiar(previo.cond) !== limpiar(nuevo.cond)
        || previo.fecha !== nuevo.fecha
        || Number(previo.salida || 0) !== Number(nuevo.salida || 0)
        || Number(previo.retorno || 0) !== Number(nuevo.retorno || 0)
        || limpiar(previo.ruta || previo.codigo) !== limpiar(nuevo.ruta || nuevo.codigo)
        || cambioDeDato(previo.hora, nuevo.hora)
        || cambioDeDato(previo.cliente || previo.cli, nuevo.cliente || nuevo.cli)
        || (ESTADOS_SIN_VIAJE.includes(previo.estado) && !ESTADOS_SIN_VIAJE.includes(nuevo.estado));
}

module.exports = { rangoViaje, conductorDelViaje, documentosVencidos, choquesDeAgenda, revisarMes, cambioLoQueSeRevisa, esPlacaCupo };
