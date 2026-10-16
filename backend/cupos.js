// ============================================================
// REACOMODAR CUPOS DE TERCEROS (Arsitrans / Polar) — sin tocar nada más
// del Rutograma. Un cupo de tercero solo se ocupa el DÍA DE SALIDA, así
// que cada día basta con tantos cupos como viajes haya ese día:
// ARSITRANS 1, 2, 3... Los viajes que ya están en un número válido se
// quedan donde están; solo se mueven los que sobran.
// Funciones puras; server.js guarda. Pruebas: test/cupos.test.js
// ============================================================

const placaDe = (v) => String(v?.p || v?.placa || '').toUpperCase().trim();
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Patrón de la fila de cupo numerada ("ARSITRANS 3"). */
const patronCupo = (nombreTr) => new RegExp(`^${String(nombreTr).toUpperCase()}\\s+(\\d+)$`);

/**
 * Calcula el reacomodo de un mes. No modifica nada.
 * @param {object[]} viajes   todos los viajes
 * @param {object[]} vehiculos todos los vehículos
 * @param {{ tr: string, anio: number, mes: number }} opciones  mes 0-11
 */
function planReacomodoCupos(viajes, vehiculos, { tr, anio, mes, desde = '' }) {
    const patron = patronCupo(tr);
    const prefijo = `${anio}-${String(mes + 1).padStart(2, '0')}`;

    // El día que cuenta es el que se pinta en el Rutograma (salida): al
    // mover un viaje a mano o por mantenimiento la "fecha" guardada puede
    // quedarse con el día viejo, y la transportadora puede seguir siendo la
    // del camión original. Por eso basta con que la placa sea un cupo
    // numerado de esta transportadora (ARSITRANS 5) y que caiga en el mes.
    const nombreMes = MESES[mes];
    // Igual que el Rutograma: manda el mes/año del viaje; la fecha solo si no los trae.
    const enMes = (v) => (v.mes !== undefined && v.mes !== null && v.mes !== '')
        ? String(v.mes).toLowerCase() === nombreMes && Number(v.anio) === Number(anio)
        : String(v.fecha || '').startsWith(prefijo);
    const diaDe = (v) => Number(v.salida ?? v.dia) || Number(String(v.fecha || '').slice(8, 10)) || 0;
    const fechaDe = (v) => `${prefijo}-${String(diaDe(v)).padStart(2, '0')}`;

    const delMes = (viajes || []).filter(v =>
        String(v.estado || '') !== 'Cancelado' &&
        patron.test(placaDe(v)) &&
        enMes(v) && diaDe(v) >= 1 && diaDe(v) <= 31 &&
        fechaDe(v) >= desde
    );

    const porDia = new Map();
    delMes.forEach(v => {
        const fecha = fechaDe(v);
        if (!porDia.has(fecha)) porDia.set(fecha, []);
        porDia.get(fecha).push(v);
    });

    const cambios = [];
    let cuposDespues = 0;
    [...porDia.keys()].sort().forEach(fecha => {
        const delDia = porDia.get(fecha)
            .map(v => ({ v, n: Number(placaDe(v).match(patron)[1]) }))
            .sort((a, b) => a.n - b.n || String(a.v.id).localeCompare(String(b.v.id)));
        const total = delDia.length;
        cuposDespues = Math.max(cuposDespues, total);

        // Se quedan los que ya tienen un número válido (1..total) y no repetido.
        const usados = new Set();
        const porMover = [];
        delDia.forEach(x => {
            if (x.n >= 1 && x.n <= total && !usados.has(x.n)) usados.add(x.n);
            else porMover.push(x);
        });
        const libres = [];
        for (let n = 1; n <= total; n++) if (!usados.has(n)) libres.push(n);

        const asignacion = new Map(delDia.filter(x => !porMover.includes(x)).map(x => [x.v, x.n]));
        porMover.forEach((x, i) => asignacion.set(x.v, libres[i]));

        asignacion.forEach((n, v) => {
            const placaNueva = `${String(tr).toUpperCase()} ${n}`;
            const salida = Number(v.salida || v.dia || 0);
            const retornoNuevo = salida ? salida + 1 : v.retorno;
            if (placaNueva !== placaDe(v) || Number(v.retorno) !== Number(retornoNuevo)) {
                cambios.push({ id: v.id, fecha, ruta: v.ruta || v.codigo || '', de: placaDe(v), a: placaNueva, retorno: retornoNuevo });
            }
        });
    });

    // Filas de cupo numeradas que quedan sin ningún viaje en NINGÚN mes (se
    // quitan). Mismo criterio que /api/limpiar-cupos-huerfanos: las filas
    // viejas no traen la marca origenAuto, así que no se exige.
    const destinoPorId = new Map(cambios.map(c => [c.id, c.a]));
    const placasConViajes = new Set((viajes || []).map(v => destinoPorId.get(v.id) || placaDe(v)));
    const vehiculosSobrantes = (vehiculos || [])
        .filter(v => patron.test(placaDe(v)) && !placasConViajes.has(placaDe(v)))
        .map(placaDe);

    return {
        tr,
        viajesDelMes: delMes.length,
        cuposAntes: new Set(delMes.map(placaDe)).size,
        cuposDespues,
        cambios,
        vehiculosSobrantes
    };
}

module.exports = { planReacomodoCupos, patronCupo };
