// ============================================================
// CUMPLIMIENTO — con lo que marcan los conductores ("Ya salí" / "Ya
// llegué"): cuántos viajes se marcan, cuántos salen a tiempo (hasta
// TOLERANCIA minutos después de la hora programada), cuánto se demoran en
// salir y cuánto tardan hasta el destino. Por conductor, ruta y
// transportadora. Función pura. Pruebas: test/cumplimiento.test.js
// ============================================================

const TOLERANCIA_MIN = 30;
const SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'ASIGNADO', 'SIN CONDUCTOR'];
const pegada = (p) => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

/** Hora del viaje; si no la tiene, la de su ruta para ese día de la semana. */
function horaDelViaje(v, rutas = []) {
    const propia = String(v.hora || '').trim();
    if (/^\d{1,2}:\d{2}$/.test(propia)) return propia;
    const ruta = rutas.find(r => String(r.cod || r.codigo || '').toUpperCase() === String(v.ruta || v.codigo || '').toUpperCase());
    if (!ruta || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || ''))) return '';
    let dias = ruta.dias;
    if (typeof dias === 'string') { try { dias = JSON.parse(dias); } catch { dias = null; } }
    const [a, m, d] = v.fecha.split('-').map(Number);
    const hora = String(dias?.[DIAS[new Date(a, m - 1, d).getDay()]]?.hora || ruta.horaSalida || ruta.hora || '').trim();
    return /^\d{1,2}:\d{2}$/.test(hora) ? hora : '';
}

/** Hora programada de salida como fecha local, o null si no tiene hora. */
function salidaProgramada(v, rutas = []) {
    const hora = horaDelViaje(v, rutas);
    if (!/^\d{1,2}:\d{2}$/.test(hora) || !/^\d{4}-\d{2}-\d{2}$/.test(String(v.fecha || ''))) return null;
    const [h, m] = hora.split(':').map(Number);
    const [a, mes, d] = v.fecha.split('-').map(Number);
    return new Date(a, mes - 1, d, h, m);
}

function nuevoGrupo(nombre) {
    return { nombre, viajes: 0, marcados: 0, conHora: 0, aTiempo: 0, tarde: 0, sumaRetraso: 0, conLlegada: 0, sumaDuracion: 0 };
}

function sumar(g, f) {
    g.viajes++;
    if (!f.salio) return;
    g.marcados++;
    if (f.retraso !== null) {
        g.conHora++;
        if (f.retraso <= TOLERANCIA_MIN) g.aTiempo++; else g.tarde++;
        g.sumaRetraso += Math.max(0, f.retraso);
    }
    if (f.duracion !== null) { g.conLlegada++; g.sumaDuracion += f.duracion; }
}

function cerrar(g) {
    const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
    return {
        nombre: g.nombre, viajes: g.viajes, marcados: g.marcados,
        pctMarcados: pct(g.marcados, g.viajes),
        aTiempo: g.aTiempo, tarde: g.tarde,
        pctATiempo: pct(g.aTiempo, g.conHora),
        retrasoPromedioMin: g.conHora ? Math.round(g.sumaRetraso / g.conHora) : null,
        duracionPromedioHoras: g.conLlegada ? Math.round((g.sumaDuracion / g.conLlegada) * 10) / 10 : null
    };
}

/**
 * anio, mes (0-11). ahora: Date (para no contar viajes que aún no salen).
 */
function armarCumplimiento(data, { anio, mes }, ahora = new Date()) {
    const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
    const titular = new Map((data.conductores || [])
        .filter(c => c.veh || c.placa)
        .map(c => [pegada(c.veh || c.placa), c.nom || c.nombre || '']));

    const viajes = (data.viajes || []).filter(v =>
        String(v.fecha || '').startsWith(prefijo) && v.fecha <= hoy && v.estado !== 'Cancelado');

    const total = nuevoGrupo('Total');
    const porConductor = new Map(), porRuta = new Map(), porTr = new Map();
    const tardes = [];
    const grupo = (mapa, clave) => { if (!mapa.has(clave)) mapa.set(clave, nuevoGrupo(clave)); return mapa.get(clave); };

    viajes.forEach(v => {
        const placa = String(v.p || v.placa || '').toUpperCase().trim();
        const cond = String(v.cond || v.conductor || '').trim();
        const conductor = SIN_CONDUCTOR.includes(cond.toUpperCase()) ? (titular.get(pegada(placa)) || 'Sin conductor') : cond;
        const salio = !!v.salidaReal;
        const prog = salidaProgramada(v, data.rutas || []);
        const retraso = salio && prog ? Math.round((new Date(v.salidaReal) - prog) / 60000) : null;
        const duracion = salio && v.llegadaReal ? (new Date(v.llegadaReal) - new Date(v.salidaReal)) / 3600000 : null;
        const f = { salio, retraso, duracion: duracion !== null && duracion >= 0 ? duracion : null };
        sumar(total, f);
        sumar(grupo(porConductor, conductor), f);
        sumar(grupo(porRuta, String(v.ruta || v.codigo || 'Sin ruta')), f);
        sumar(grupo(porTr, String(v.tr || v.transportadora || 'Makand')), f);
        if (retraso !== null && retraso > TOLERANCIA_MIN) {
            tardes.push({ id: v.id, fecha: v.fecha, placa, conductor, ruta: v.ruta || '', destino: v.destino || '', hora: horaDelViaje(v, data.rutas || []), salidaReal: v.salidaReal, retrasoMin: retraso });
        }
    });

    const ordenar = (mapa) => [...mapa.values()].map(cerrar)
        .sort((a, b) => (b.marcados - a.marcados) || (b.viajes - a.viajes) || a.nombre.localeCompare(b.nombre));
    return {
        mes: prefijo,
        toleranciaMin: TOLERANCIA_MIN,
        total: cerrar(total),
        porConductor: ordenar(porConductor),
        porRuta: ordenar(porRuta),
        porTransportadora: ordenar(porTr),
        masTarde: tardes.sort((a, b) => b.retrasoMin - a.retrasoMin).slice(0, 10)
    };
}

module.exports = { armarCumplimiento, salidaProgramada, horaDelViaje, TOLERANCIA_MIN };
