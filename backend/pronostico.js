// ============================================================
// PRONÓSTICO DE UN MES — con los meses anteriores (hasta 3, el más
// reciente pesa más) calcula cuántos viajes vienen, por cliente, destino
// y transportadora, y cuántos cupos de terceros harán falta el día más
// cargado. Se calcula por día de la semana (un mes con 5 lunes trae más
// viajes que uno con 4) y los festivos aparte. Solo lee; no cambia nada.
// Función pura. Pruebas: test/pronostico.test.js
// ============================================================

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const PESOS = [3, 2, 1];

const pad = (n) => String(n).padStart(2, '0');
const claveMes = (anio, mes) => anio * 12 + mes;
const redondeo1 = (n) => Math.round(n * 10) / 10;

/** Mes (0-11) y año de un viaje: manda su mes/año, como en el Rutograma; si no, la fecha. */
function mesDeViaje(v) {
    const nombre = String(v.mes ?? '').toLowerCase().trim();
    const i = MESES.indexOf(nombre);
    if (i !== -1 && Number(v.anio)) return { anio: Number(v.anio), mes: i };
    const f = String(v.fecha || '');
    if (/^\d{4}-\d{2}/.test(f)) return { anio: Number(f.slice(0, 4)), mes: Number(f.slice(5, 7)) - 1 };
    return null;
}

const diaDeViaje = (v) => Number(v.salida ?? v.dia) || Number(String(v.fecha || '').slice(8, 10)) || 0;

function tipoTr(v) {
    const t = String(v.tr || v.transportadora || '').toLowerCase();
    const p = String(v.p || v.placa || '').toUpperCase();
    if (t.includes('arsitran') || /^ARSITRANS\s+\d+$/.test(p)) return 'Arsitrans';
    if (t.includes('polar') || /^POLAR\s+\d+$/.test(p)) return 'Polar';
    return 'Propia';
}

const textoLimpio = (s, porDefecto) => String(s || '').trim() || porDefecto;

/**
 * @param {{ viajes: object[], festivos?: any[] }} data
 * @param {{ anio: number, mes: number }} objetivo  mes 0-11
 */
function armarPronostico(data, { anio, mes }) {
    const festivos = new Set((data.festivos || []).map(f => String(typeof f === 'string' ? f : (f?.fecha || '')).slice(0, 10)).filter(Boolean));
    const esFestivo = (a, m, d) => festivos.has(`${a}-${pad(m + 1)}-${pad(d)}`);
    const tipoDia = (a, m, d) => esFestivo(a, m, d) ? 'festivo' : new Date(a, m, d).getDay();

    // Viajes válidos agrupados por mes.
    const porMes = new Map();
    for (const v of data.viajes || []) {
        if (String(v.estado || '') === 'Cancelado') continue;
        const m = mesDeViaje(v);
        const d = diaDeViaje(v);
        if (!m || d < 1 || d > new Date(m.anio, m.mes + 1, 0).getDate()) continue;
        const k = claveMes(m.anio, m.mes);
        if (!porMes.has(k)) porMes.set(k, { ...m, viajes: [] });
        porMes.get(k).viajes.push({ v, d });
    }

    const objetivo = claveMes(anio, mes);
    const base = [...porMes.keys()].filter(k => k < objetivo).sort((a, b) => b - a).slice(0, 3).map(k => porMes.get(k));
    const diasObjetivo = new Date(anio, mes + 1, 0).getDate();
    const yaProgramados = (porMes.get(objetivo)?.viajes || []).length;

    if (!base.length) {
        return { anio, mes, nombreMes: MESES[mes], base: [], hayDatos: false, yaProgramados };
    }

    // Por cada mes base: viajes por tipo de día (lunes... domingo, festivo),
    // cuántos días de cada tipo tuvo, y por cliente/destino/transportadora.
    const resumenBase = base.map(b => {
        const dias = new Date(b.anio, b.mes + 1, 0).getDate();
        const diasPorTipo = {};
        for (let d = 1; d <= dias; d++) { const t = tipoDia(b.anio, b.mes, d); diasPorTipo[t] = (diasPorTipo[t] || 0) + 1; }
        const viajesPorTipo = {};
        const tercerosPorDia = { Arsitrans: {}, Polar: {} };
        const porCliente = {}, porDestino = {}, porTr = { Propia: 0, Arsitrans: 0, Polar: 0 };
        let cajas = 0;
        for (const { v, d } of b.viajes) {
            const t = tipoDia(b.anio, b.mes, d);
            viajesPorTipo[t] = (viajesPorTipo[t] || 0) + 1;
            const tr = tipoTr(v);
            porTr[tr]++;
            if (tr !== 'Propia') tercerosPorDia[tr][d] = (tercerosPorDia[tr][d] || 0) + 1;
            const cli = textoLimpio(v.cliente, 'Sin cliente');
            const des = textoLimpio(v.destino, 'Sin destino');
            porCliente[cli] = (porCliente[cli] || 0) + 1;
            porDestino[des] = (porDestino[des] || 0) + 1;
            cajas += Number(v.cajas) || 0;
        }
        const picoTerceros = {};
        for (const tr of ['Arsitrans', 'Polar']) picoTerceros[tr] = Math.max(0, ...Object.values(tercerosPorDia[tr]));
        return { anio: b.anio, mes: b.mes, nombreMes: MESES[b.mes], dias, total: b.viajes.length, diasPorTipo, viajesPorTipo, porCliente, porDestino, porTr, cajas, picoTerceros, tercerosPorDia };
    });

    const pesos = resumenBase.map((_, i) => PESOS[i]);
    const sumaPesos = pesos.reduce((a, b) => a + b, 0);
    const promedio = (f) => resumenBase.reduce((s, r, i) => s + f(r) * pesos[i], 0) / sumaPesos;

    // Viajes por día de cada tipo (promedio ponderado). Un festivo sin
    // historia se toma como un domingo.
    const tasa = (t) => {
        const conDias = resumenBase.map((r, i) => ({ r, w: pesos[i] })).filter(x => x.r.diasPorTipo[t]);
        if (!conDias.length) return t === 'festivo' ? tasa(0) : 0;
        const w = conDias.reduce((s, x) => s + x.w, 0);
        return conDias.reduce((s, x) => s + x.w * (x.r.viajesPorTipo[t] || 0) / x.r.diasPorTipo[t], 0) / w;
    };
    const diasObjetivoPorTipo = {};
    for (let d = 1; d <= diasObjetivo; d++) { const t = tipoDia(anio, mes, d); diasObjetivoPorTipo[t] = (diasObjetivoPorTipo[t] || 0) + 1; }
    const total = Object.entries(diasObjetivoPorTipo).reduce((s, [t, n]) => s + n * tasa(t === 'festivo' ? 'festivo' : Number(t)), 0);

    // Rango: lo que habría dado cada mes base solo, ajustado a los días del mes.
    const escalado = resumenBase.map(r => r.total / r.dias * diasObjetivo);
    const rango = { min: Math.round(Math.min(...escalado, total)), max: Math.round(Math.max(...escalado, total)) };

    // Reparto por cliente / destino / transportadora con la participación
    // ponderada de cada uno, aplicada al total pronosticado.
    const reparto = (campo, top) => {
        const nombres = new Set(resumenBase.flatMap(r => Object.keys(r[campo])));
        const filas = [...nombres].map(nombre => {
            const part = promedio(r => (r[campo][nombre] || 0) / (r.total || 1));
            const ultimo = resumenBase[0][campo][nombre] || 0;
            const previo = resumenBase[1] ? (resumenBase[1][campo][nombre] || 0) : null;
            return { nombre, pronostico: Math.round(part * total), ultimoMes: ultimo, mesAnterior: previo };
        }).filter(f => f.pronostico > 0 || f.ultimoMes > 0).sort((a, b) => b.pronostico - a.pronostico || b.ultimoMes - a.ultimoMes);
        return top ? filas.slice(0, top) : filas;
    };

    // Cupos de terceros: viajes en el mes y cuántos cupos el día más cargado
    // (un cupo de tercero solo se ocupa el día de salida).
    const terceros = ['Arsitrans', 'Polar'].map(tr => {
        const viajesMes = Math.round(promedio(r => r.porTr[tr] / (r.total || 1)) * total);
        // Por tipo de día, el promedio de viajes de ese tercero.
        const tasaTr = (t) => {
            const conDias = resumenBase.map((r, i) => ({ r, w: pesos[i] })).filter(x => x.r.diasPorTipo[t]);
            if (!conDias.length) return 0;
            const w = conDias.reduce((s, x) => s + x.w, 0);
            return conDias.reduce((s, x) => {
                let n = 0;
                for (const [d, c] of Object.entries(x.r.tercerosPorDia[tr])) if (tipoDia(x.r.anio, x.r.mes, Number(d)) === t) n += c;
                return s + x.w * n / x.r.diasPorTipo[t];
            }, 0) / w;
        };
        let diaMasCargado = null;
        for (let d = 1; d <= diasObjetivo; d++) {
            const t = tipoDia(anio, mes, d);
            const n = tasaTr(t);
            if (!diaMasCargado || n > diaMasCargado.n) diaMasCargado = { dia: d, n, nombreDia: t === 'festivo' ? 'Festivo' : DIAS[t] };
        }
        const pico = Math.ceil(diaMasCargado?.n || 0);
        return {
            nombre: tr, viajesMes, picoDia: pico,
            diaMasCargado: diaMasCargado && pico ? diaMasCargado.nombreDia : '',
            picoVisto: Math.max(0, ...resumenBase.map(r => r.picoTerceros[tr])),
            ultimoMes: resumenBase[0].porTr[tr]
        };
    });

    const ultimo = resumenBase[0];
    const tendencia = resumenBase[1] ? Math.round((ultimo.total / ultimo.dias - resumenBase[1].total / resumenBase[1].dias) / (resumenBase[1].total / resumenBase[1].dias || 1) * 100) : null;

    // Por día de la semana, para ver qué días vienen más cargados.
    const porDiaSemana = [1, 2, 3, 4, 5, 6, 0].map(t => ({ nombre: DIAS[t], porDia: redondeo1(tasa(t)), dias: diasObjetivoPorTipo[t] || 0 }));
    const festivosMes = diasObjetivoPorTipo.festivo || 0;

    return {
        anio, mes, nombreMes: MESES[mes], hayDatos: true, yaProgramados,
        total: Math.round(total), rango, tendencia,
        cajas: Math.round(promedio(r => r.cajas / (r.total || 1)) * total),
        base: resumenBase.map(r => ({ anio: r.anio, mes: r.mes, nombreMes: r.nombreMes, total: r.total, dias: r.dias })),
        propios: Math.round(promedio(r => r.porTr.Propia / (r.total || 1)) * total),
        terceros,
        porCliente: reparto('porCliente', 12),
        porDestino: reparto('porDestino', 12),
        porDiaSemana, festivosMes
    };
}

module.exports = { armarPronostico };
