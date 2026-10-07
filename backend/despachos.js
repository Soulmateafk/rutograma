// ============================================================
// DESPACHOS — a qué hora llega cada vehículo a cargar, a dónde va (el
// viaje que se escoge, u otro lugar) y a qué hora terminó de cargar.
// Lo anota la cuenta compartida "despachos" (o la oficina) en la
// pantalla Despachos. Se guarda en la base (tabla despachos), se
// consulta mes a mes y se descarga en Excel por día, semana o mes.
// Funciones puras. Pruebas: test/despachos.test.js
// ============================================================

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** '7:5' / '07:05' / '0705' -> '07:05'; algo que no es hora -> ''. */
function normalizarHora(h) {
    const t = String(h ?? '').trim();
    const m = t.match(/^(\d{1,2})[:.h]?(\d{2})$/);
    if (!m) return '';
    const hh = Number(m[1]), mm = Number(m[2]);
    if (hh > 23 || mm > 59) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

const aMinutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

/**
 * Minutos que tardó el cargue. Si terminó "antes" de llegar, es que pasó
 * la medianoche (llegó 23:00, terminó 01:30 = 150 min). null si falta algo.
 */
function minutosDeCargue(llegada, fin) {
    const a = normalizarHora(llegada), b = normalizarHora(fin);
    if (!a || !b) return null;
    let m = aMinutos(b) - aMinutos(a);
    if (m < 0) m += 24 * 60;
    return m;
}

/** 95 -> '1 h 35 min'. */
function textoMinutos(m) {
    if (m === null || m === undefined || !isFinite(m)) return '';
    const h = Math.floor(m / 60), r = Math.round(m % 60);
    if (!h) return `${r} min`;
    return r ? `${h} h ${r} min` : `${h} h`;
}

const aTexto = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fechaLocal = (f) => { const [a, m, d] = f.split('-').map(Number); return new Date(a, m - 1, d); };

/**
 * Días que abarca un periodo que contiene `fecha`: el día, la semana
 * (lunes a domingo) o el mes. { desde, hasta } inclusivos.
 */
function rangoPeriodo(periodo, fecha) {
    if (!FECHA.test(String(fecha || ''))) return null;
    const d = fechaLocal(fecha);
    if (periodo === 'semana') {
        const lunes = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
        const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
        return { desde: aTexto(lunes), hasta: aTexto(domingo) };
    }
    if (periodo === 'mes') {
        return { desde: aTexto(new Date(d.getFullYear(), d.getMonth(), 1)), hasta: aTexto(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    }
    return { desde: fecha, hasta: fecha };
}

const corto = (t, max) => String(t ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

/**
 * Lo que se carga: se escogen uno o varios tipos y a cada uno se le pone
 * la cantidad. Las estibas no son cajas: se cuentan aparte del total.
 */
const TIPOS_CARGA = [
    'Makand x25', 'Makand x13', 'Cajas de espinaca', 'Cajas cargadas Olímpica', 'Cajas cargadas Gabriel',
    'Alkosto', 'Mario', 'Azul Makand', 'Rojas Makand', 'Ifco x25', 'Ifco x18', 'Ifco x13',
    'Cajas cartón tomate', 'Cajones', 'Estibas'
];
const NO_SON_CAJAS = ['Estibas'];

/** Total de cajas (sin estibas) y estibas de una lista [{ tipo, cantidad }]. */
function totalesCarga(cargas) {
    let cajas = 0, estibas = 0;
    (cargas || []).forEach(c => {
        const n = Number(c.cantidad) || 0;
        if (NO_SON_CAJAS.includes(c.tipo)) estibas += n; else cajas += n;
    });
    return { cajas, estibas };
}

/** Revisa la carga: tipos conocidos, sin repetir, y cada uno con su cantidad (entero mayor que 0). */
function validarCargas(entrada) {
    const errores = [];
    const cargas = [];
    if (entrada !== undefined && entrada !== null && !Array.isArray(entrada)) return { errores: ['la carga en un formato válido'], cargas };
    (entrada || []).forEach(c => {
        const tipo = TIPOS_CARGA.find(t => t === String(c?.tipo || '').trim());
        if (!tipo) { errores.push(`un tipo de carga válido ("${corto(c?.tipo, 40)}" no está en la lista)`); return; }
        if (cargas.some(x => x.tipo === tipo)) { errores.push(`${tipo} una sola vez`); return; }
        const texto = String(c?.cantidad ?? '').trim();
        const n = /^\d{1,6}$/.test(texto) ? Number(texto) : NaN;
        if (!(n > 0)) { errores.push(`la cantidad de ${tipo} (solo números, mayor que 0)`); return; }
        cargas.push({ tipo, cantidad: n });
    });
    return { errores, cargas };
}

/**
 * Revisa lo que llega del formulario. Devuelve { errores: [...], registro }.
 * Obligatorio: fecha, nombre de quien despacha, vehículo, lugar (o viaje) y
 * hora de llegada. Hora programada, inicio y fin de cargue y salida pueden
 * ir vacías (se llenan a medida que pasa). Cada tipo de carga escogido
 * tiene que llevar su cantidad.
 */
function validarDespacho(cuerpo) {
    const b = cuerpo || {};
    const errores = [];
    const fecha = String(b.fecha || '').trim();
    const placa = corto(b.placa, 20).toUpperCase();
    const destino = corto(b.destino, 80);
    const horaLlegada = normalizarHora(b.horaLlegada);
    const horaFinCargue = normalizarHora(b.horaFinCargue);
    if (!FECHA.test(fecha)) errores.push('la fecha');
    if (!placa) errores.push('el vehículo');
    if (!destino) errores.push('a qué lugar se dirige');
    if (!horaLlegada) errores.push('la hora de llegada');
    const despachador = corto(b.despachador, 60);
    // Los registros anotados antes de existir este dato se pueden terminar sin él.
    if (!despachador && !(Number(b.id) > 0)) errores.push('el nombre de quien despacha');
    const horas = {};
    [['horaProgramada', 'hora programada'], ['horaInicioCargue', 'inicio de cargue'], ['horaFinCargue', 'fin de cargue'], ['horaSalida', 'salida']].forEach(([campo, nombre]) => {
        horas[campo] = normalizarHora(b[campo]);
        if (String(b[campo] || '').trim() && !horas[campo]) errores.push(`una hora válida de ${nombre} (ej. 14:30)`);
    });
    const carga = validarCargas(b.cargas);
    errores.push(...carga.errores);
    const viajeId = b.viajeId === undefined || b.viajeId === null || b.viajeId === '' ? null : String(b.viajeId);
    const id = Number(b.id) > 0 ? Number(b.id) : null;
    return {
        errores,
        registro: {
            id, fecha, placa, destino, horaLlegada, horaFinCargue,
            horaProgramada: horas.horaProgramada, horaInicioCargue: horas.horaInicioCargue, horaSalida: horas.horaSalida,
            despachador, cargas: carga.cargas,
            viajeId,
            ruta: corto(b.ruta, 40),
            conductor: corto(b.conductor, 80),
            observacion: corto(b.observacion, 300)
        }
    };
}

/** Tiempo de cargue de un registro: desde el inicio de cargue (o, si no se anotó, desde la llegada) hasta el fin. */
const minutosDelRegistro = (r) => minutosDeCargue(r.horaInicioCargue || r.horaLlegada, r.horaFinCargue);

/** Totales para la pantalla: cuántos, cuántos siguen cargando, el promedio y las cajas. */
function resumenDespachos(registros) {
    const lista = registros || [];
    const tiempos = lista.map(minutosDelRegistro).filter(m => m !== null);
    const carga = totalesCarga(lista.flatMap(r => r.cargas || []));
    return {
        total: lista.length,
        totalCajas: carga.cajas,
        totalEstibas: carga.estibas,
        enCargue: lista.filter(r => !r.horaFinCargue).length,
        terminados: tiempos.length,
        promedioMin: tiempos.length ? Math.round(tiempos.reduce((a, b) => a + b, 0) / tiempos.length) : null,
        maximoMin: tiempos.length ? Math.max(...tiempos) : null
    };
}

/** '2026-10-07T19:08:59Z' -> '07/10/2026 14:08' en la hora del computador (Colombia). */
const fechaHoraLocal = (iso) => {
    const d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const fechaBonita = (f) => { const [a, m, d] = String(f).split('-'); return d ? `${d}/${m}/${a}` : String(f || ''); };
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/** Filas del Excel, en orden de fecha y hora de llegada. */
function filasExcel(registros) {
    return [...(registros || [])]
        .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)) || String(a.horaLlegada).localeCompare(String(b.horaLlegada)))
        .map(r => {
            const min = minutosDelRegistro(r);
            const t = totalesCarga(r.cargas);
            const fila = {
                'Fecha': fechaBonita(r.fecha),
                'Día': FECHA.test(String(r.fecha)) ? DIAS[fechaLocal(r.fecha).getDay()] : '',
                'Despachó': r.despachador || '',
                'Vehículo': r.placa,
                'Conductor': r.conductor || '',
                'Ruta': r.ruta || '',
                'Lugar al que se dirige': r.destino,
                'Hora programada': r.horaProgramada || '',
                'Hora de llegada': r.horaLlegada,
                'Inicio de cargue': r.horaInicioCargue || '',
                'Terminó de cargar': r.horaFinCargue || 'Cargando',
                'Hora de salida': r.horaSalida || '',
                'Tiempo de cargue (min)': min === null ? '' : min,
                'Tiempo de cargue': textoMinutos(min),
                'Carga': (r.cargas || []).map(c => `${c.tipo}: ${c.cantidad}`).join('; '),
                'Total cajas': t.cajas,
                'Estibas': t.estibas
            };
            // Una columna por tipo (todas, para que se puedan sumar en Excel).
            TIPOS_CARGA.forEach(tipo => { fila[tipo] = (r.cargas || []).find(c => c.tipo === tipo)?.cantidad || ''; });
            return {
                ...fila,
                'Observación': r.observacion || '',
                'Anotado por': r.creadoPor || '',
                'Anotado el': fechaHoraLocal(r.creadoEn),
                'Última corrección': r.editadoPor ? `${r.editadoPor} (${fechaHoraLocal(r.editadoEn)})` : ''
            };
        });
}

/** Nombre del archivo: Despachos_dia_2026-10-07.xlsx, Despachos_semana_..., Despachos_mes_2026-10.xlsx */
function nombreArchivo(periodo, rango) {
    if (periodo === 'mes') return `Despachos_mes_${rango.desde.slice(0, 7)}.xlsx`;
    if (periodo === 'semana') return `Despachos_semana_${rango.desde}_a_${rango.hasta}.xlsx`;
    return `Despachos_dia_${rango.desde}.xlsx`;
}

module.exports = { TIPOS_CARGA, totalesCarga, validarCargas, minutosDelRegistro, normalizarHora, minutosDeCargue, textoMinutos, rangoPeriodo, validarDespacho, resumenDespachos, filasExcel, nombreArchivo, fechaBonita };
