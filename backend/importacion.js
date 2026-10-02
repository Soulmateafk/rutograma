// ============================================================
// IMPORTAR VIAJES REALES desde el Excel de operación
// (hoja "DT VIAJEROS." + hoja "CONF"). Funciones puras: reciben el
// archivo/los datos y devuelven qué se importaría, sin guardar nada.
// server.js decide si solo mostrar el resumen o aplicarlo.
// Pruebas: test/importacion.test.js
// ============================================================
const XLSX = require('xlsx');

const MESES_APP = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_MAYUS = MESES_APP.map(m => m.toUpperCase());
const CLAVES_DIA = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

const sinTildes = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (t) => sinTildes(t).toUpperCase().replace(/\s+/g, ' ').trim();
const titulo = (t) => String(t || '').toLowerCase().replace(/(^|[\s/])(\S)/g, (m, a, b) => a + b.toUpperCase());

const isoDe = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
function sumarDias(iso, n) {
    const d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return isoDe(d.getFullYear(), d.getMonth() + 1, d.getDate());
}
function diasEntre(desde, hasta) {
    return Math.round((new Date(hasta + 'T00:00:00') - new Date(desde + 'T00:00:00')) / 86400000);
}

// ------------------------------------------------------------
// Limpieza de cada campo
// ------------------------------------------------------------

/** " poz798" -> "POZ 798" (mismo formato que las placas de la app). */
function normalizarPlaca(valor) {
    const limpio = String(valor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const m = limpio.match(/^([A-Z]{3})(\d{3})$/);
    if (m) return `${m[1]} ${m[2]}`;
    // Otras placas (cupos "ARSITRANS 1"): solo se ordenan los espacios.
    return String(valor ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

const ALMACENES = { 'EXITO': 'Exito', 'D1': 'D1', 'ARA': 'Ara', 'OLIMPICA': 'Olimpica' };
/** "ÉXITO" / "exito" -> "Exito". */
function normalizarAlmacen(valor) {
    const k = clave(valor);
    return ALMACENES[k] || titulo(k);
}

// Errores de escritura vistos en el archivo real.
const CORRECCIONES_SUCURSAL = {
    'GIRARRDOTA': 'GIRARDOTA',
    'ESTRELLA': 'LA ESTRELLA',
    'GUANE': 'GUARNE',
    'MELLELLIN': 'MEDELLIN'
};
/**
 * "GUARNE - LA ESTRELLA", "GUARNE /LA ESTRELLA", "GUARNE / ESTRELLA"
 *   -> { texto: "GUARNE / LA ESTRELLA", partes: ["GUARNE", "LA ESTRELLA"] }
 */
function normalizarSucursal(valor) {
    const partes = clave(valor)
        .split(/\s*[\/-]\s*/)
        .map(p => p.trim())
        .filter(Boolean)
        // "D1 GUARNE" -> "GUARNE" (el almacén va en su propia columna).
        .map(p => p.replace(/^(D1|ARA|EXITO|OLIMPICA)\s+/, ''))
        .map(p => CORRECCIONES_SUCURSAL[p] || p);
    return { texto: partes.join(' / '), partes };
}

const TRANSPORTADORAS = { 'MAKAND': 'Makand', 'ARSITRANS': 'Arsitrans', 'POLAR': 'Polar' };

/**
 * Fecha de una celda: número de Excel (sistema 1900 o 1904) o texto
 * "1/2/26" / "01/10/2026". Con texto, "mes" (ENERO..DICIEMBRE) decide si
 * es día/mes o mes/día. Devuelve 'YYYY-MM-DD' o null.
 */
function parsearFecha(valor, { fecha1904 = false, mes = null } = {}) {
    if (valor === null || valor === undefined || valor === '') return null;
    if (typeof valor === 'number' && isFinite(valor)) {
        const p = XLSX.SSF.parse_date_code(valor, { date1904: fecha1904 });
        return p && p.y ? isoDe(p.y, p.m, p.d) : null;
    }
    const texto = String(valor).trim();
    const m = texto.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (!m) return null;
    let [a, b, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (y < 100) y += 2000;
    const mesEsperado = mes ? MESES_MAYUS.indexOf(clave(mes)) + 1 : 0;
    const valida = (mm, dd) => mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31;
    if (mesEsperado && b === mesEsperado && valida(b, a)) return isoDe(y, b, a); // día/mes
    if (mesEsperado && a === mesEsperado && valida(a, b)) return isoDe(y, a, b); // mes/día
    if (valida(b, a)) return isoDe(y, b, a);
    if (valida(a, b)) return isoDe(y, a, b);
    return null;
}

// ------------------------------------------------------------
// Lectura del libro
// ------------------------------------------------------------
function leerLibroViajeros(buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const fecha1904 = !!(wb.Workbook && wb.Workbook.WBProps && wb.Workbook.WBProps.date1904);

    const nombreHoja = wb.SheetNames.find(n => /VIAJEROS/i.test(n)) ||
        wb.SheetNames.find(n => {
            const enc = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, range: 0 })[0] || [];
            return enc.some(c => clave(c) === 'PLACA');
        });
    if (!nombreHoja) {
        throw new Error('El archivo no tiene la hoja de viajes ("DT VIAJEROS.") ni ninguna hoja con la columna PLACA.');
    }

    // Encabezados sin tildes/espacios de más: "FECHA CITA " -> "FECHA CITA".
    const crudas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { defval: null, raw: true });
    const filas = crudas.map(f => {
        const limpia = {};
        Object.keys(f).forEach(k => { limpia[clave(k)] = f[k]; });
        return limpia;
    });

    // CONF: columna A = ciudad, B = días que el vehículo queda ocupado.
    const tiempos = {};
    const hojaConf = wb.SheetNames.find(n => clave(n) === 'CONF');
    if (hojaConf) {
        XLSX.utils.sheet_to_json(wb.Sheets[hojaConf], { header: 1, defval: null, raw: true })
            .slice(1)
            .forEach(r => {
                const ciudad = r[0] ? claveCiudad(r[0]) : '';
                const dias = Number(r[1]);
                if (ciudad && dias > 0) tiempos[ciudad] = dias;
            });
    }
    return { filas, tiempos, fecha1904, hoja: nombreHoja };
}

/** "Medellin/La Estrella", "MEDELLIN LA ESTRELLA" -> "MEDELLIN LA ESTRELLA". */
function claveCiudad(t) {
    return clave(t).replace(/[\/-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------
// Rutas de la app
// ------------------------------------------------------------
const SUFIJO_CLIENTE = { 'D1': 'D1', 'Exito': 'EX', 'Ara': 'ARA', 'Olimpica': 'OLI' };

/** Ruta de la app para una sucursal + almacén del archivo (o null). */
function buscarRuta(rutas, sucursal, almacen) {
    const objetivo = clave(sucursal);
    const sufijo = SUFIJO_CLIENTE[almacen];
    const delCliente = (rutas || []).filter(r => {
        const cod = clave(r.cod || r.codigo);
        const clientes = clave(r.clientes);
        return (sufijo && cod.endsWith('-' + sufijo)) || clientes.split(/[\s,.]+/).includes(clave(almacen));
    });
    const partesDestino = r => clave(r.dest || r.destino).split(/\s*\/\s*/);
    const exacta = delCliente.filter(r => clave(r.dest || r.destino) === objetivo);
    const porParte = delCliente.filter(r => partesDestino(r).slice(-1)[0] === objetivo);
    const candidatas = exacta.length ? exacta : porParte;
    return candidatas.find(r => r.activa !== false) || candidatas[0] || null;
}

// ------------------------------------------------------------
// Armar la importación
// ------------------------------------------------------------
/**
 * @param filas      filas de leerLibroViajeros
 * @param tiempos    { CIUDAD: días ocupado } de la hoja CONF
 * @param rutas      data.rutas
 * @param vehiculos  data.vehiculos
 * @param fecha1904  sistema de fechas del libro
 * @param hoy        'YYYY-MM-DD' (para decidir "En ruta" vs "Entregado")
 * @returns { viajes, cuposNuevos, cambiosRutas, resumen }
 */
function armarImportacion({ filas, tiempos = {}, rutas = [], vehiculos = [], fecha1904 = false, hoy }) {
    const errores = [];
    const correcciones = { placas: 0, fechas: 0, sucursales: {}, almacenes: {} };
    const sinRuta = {};
    const placasMakandDesconocidas = new Set();
    const viajes = [];
    const contadorCupo = {};   // "2026-09-03|Arsitrans" -> n
    const contadorId = {};
    const maxCupo = { Arsitrans: 0, Polar: 0 };

    const placasApp = new Set((vehiculos || []).map(v => normalizarPlaca(v.p || v.placa)));
    const sumarCorreccion = (mapa, de, a) => {
        const k = `${de} → ${a}`;
        mapa[k] = (mapa[k] || 0) + 1;
    };

    filas.forEach((f, i) => {
        const filaExcel = i + 2;
        const placaCruda = f['PLACA'];
        const fechaCruda = f['FECHA DE CARGUE'] ?? f['FECHA SALIDA'];
        if ((placaCruda === null || String(placaCruda).trim() === '') &&
            (fechaCruda === null || String(fechaCruda).trim() === '')) return; // fila vacía

        const fecha = parsearFecha(fechaCruda, { fecha1904, mes: f['MES'] }) ||
            parsearFecha(f['FECHA SALIDA'], { fecha1904, mes: f['MES'] });
        if (!fecha) { errores.push({ fila: filaExcel, motivo: `Fecha de cargue no válida ("${String(fechaCruda ?? '').trim()}")` }); return; }
        if (typeof fechaCruda !== 'number') correcciones.fechas++;

        const tr = TRANSPORTADORAS[clave(f['TRANSPORTE'])];
        if (!tr) { errores.push({ fila: filaExcel, motivo: `Transportadora desconocida ("${f['TRANSPORTE'] ?? ''}")` }); return; }

        const placaReal = normalizarPlaca(placaCruda);
        if (!placaReal) { errores.push({ fila: filaExcel, motivo: 'Sin placa' }); return; }
        // Espacios sobrantes o caracteres raros (" POZ798"); pasar de
        // "PRZ065" a "PRZ 065" es solo el formato de la app, no se cuenta.
        if (/[^A-Z0-9]/.test(String(placaCruda).toUpperCase())) correcciones.placas++;

        const suc = normalizarSucursal(f['SUCURSAL']);
        if (!suc.partes.length) { errores.push({ fila: filaExcel, motivo: 'Sin sucursal' }); return; }
        if (suc.texto !== clave(f['SUCURSAL'])) sumarCorreccion(correcciones.sucursales, clave(f['SUCURSAL']), suc.texto);
        const almacen = normalizarAlmacen(f['ALMACEN']);
        const almacenCrudo = String(f['ALMACEN'] ?? '').trim();
        if (almacenCrudo.toUpperCase() !== clave(almacen)) sumarCorreccion(correcciones.almacenes, almacenCrudo, almacen);

        const ruta = buscarRuta(rutas, suc.partes[0], almacen);
        if (!ruta) {
            const k = `${titulo(suc.partes[0])} — ${almacen}`;
            sinRuta[k] = (sinRuta[k] || 0) + 1;
        }
        const ruta2 = suc.partes[1] ? buscarRuta(rutas, suc.partes[1], almacen) : null;

        // Días que el vehículo queda ocupado (salida -> ya libre otra vez).
        let dias;
        if (tr !== 'Makand') {
            dias = 1; // terceros: libres al día siguiente (misma regla de la app)
        } else {
            const retornoReal = parsearFecha(f['FECHA DE RETORNO A PLANTA'], { fecha1904 });
            const delta = retornoReal ? diasEntre(fecha, retornoReal) : NaN;
            const ciudad = ruta ? claveCiudad(ruta.dest || ruta.destino) : claveCiudad(suc.texto);
            const deConf = tiempos[ciudad] || tiempos[claveCiudad('MEDELLIN ' + suc.texto)];
            const deRuta = ruta ? Number(ruta.diasTrans || 1) + Number(ruta.diasDesc || 0) : 0;
            dias = (delta >= 1 && delta <= 15) ? delta : (deConf || deRuta || 2);
            if (!placasApp.has(placaReal)) placasMakandDesconocidas.add(placaReal);
        }

        // Terceros: van en las filas de cupo del Rutograma ("ARSITRANS 1"...)
        // con su placa real aparte, igual que los que crea Generar Matriz.
        let placa = placaReal;
        if (tr !== 'Makand') {
            const k = `${fecha}|${tr}`;
            contadorCupo[k] = (contadorCupo[k] || 0) + 1;
            maxCupo[tr] = Math.max(maxCupo[tr], contadorCupo[k]);
            placa = `${tr.toUpperCase()} ${contadorCupo[k]}`;
        }

        const [y, m, d] = fecha.split('-').map(Number);
        const llegada = clave(f['CUMPLIMIENTO ENTREGA MAKAND']);
        const estado = llegada === 'SIN LLEGAR' && sumarDias(fecha, dias) >= sumarDias(hoy, -3) ? 'En ruta' : 'Entregado';

        // Tarifa de la ruta según quién hizo el viaje (misma regla que Generar Matriz).
        let tarifa = 0;
        if (ruta) {
            tarifa = Number(ruta.tarifa || 0);
            if (tr === 'Makand') tarifa = Number(ruta.tarifaMakand || tarifa);
            if (tr === 'Arsitrans') tarifa = Number(ruta.tarifaArsitran || ruta.tarifaArsitrans || tarifa);
            if (tr === 'Polar') tarifa = Number(ruta.tarifaPolar || tarifa);
        }

        const idBase = `REAL-${fecha}-${placa.replace(/\s/g, '')}`;
        contadorId[idBase] = (contadorId[idBase] || 0) + 1;
        const codRuta = ruta ? (ruta.cod || ruta.codigo) : `${clave(suc.partes[0]).slice(0, 3)}-${clave(almacen)}`;

        viajes.push({
            id: contadorId[idBase] > 1 ? `${idBase}-${contadorId[idBase]}` : idBase,
            tipo: 'real',
            placa, p: placa,
            placaReal: tr !== 'Makand' ? placaReal : undefined,
            transportadora: tr, tr,
            fecha, dia: d, salida: d, retorno: d + dias,
            mes: MESES_APP[m - 1], anio: y,
            ruta: codRuta, codigo: codRuta,
            destino: ruta ? (ruta.dest || ruta.destino) : titulo(suc.partes[0]),
            dest2: suc.partes[1] ? (ruta2 ? (ruta2.dest || ruta2.destino) : titulo(suc.partes[1])) : undefined,
            cliente: almacen, cli: almacen,
            conductor: titulo(String(f['CONDUCTOR'] ?? '').trim()) || undefined,
            cond: titulo(String(f['CONDUCTOR'] ?? '').trim()) || undefined,
            cajas: Number(f['TOTAL CAJAS']) || 0,
            tarifa, costo: tarifa,
            fechaEntrega: parsearFecha(f['FECHA DE ENTREGA A MAKAND'], { fecha1904 }) || undefined,
            obs: f['NOVEDAD'] ? String(f['NOVEDAD']).trim() : undefined,
            estado
        });
    });

    // Un vehículo de Makand no puede seguir ocupado por un viaje cuando ya
    // salió al siguiente: en el archivo, "FECHA DE RETORNO A PLANTA" a veces
    // va más allá (parece ser la vuelta de las cajas, no del vehículo), y
    // eso dejaba viajes reales encimados. Se recorta al día de la siguiente
    // salida real de esa placa.
    const porPlaca = {};
    viajes.filter(v => v.tr === 'Makand').forEach(v => (porPlaca[v.placa] || (porPlaca[v.placa] = [])).push(v));
    Object.values(porPlaca).forEach(lista => {
        lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
        for (let i = 0; i < lista.length - 1; i++) {
            const actual = lista[i];
            const hastaSiguiente = diasEntre(actual.fecha, lista[i + 1].fecha);
            if (hastaSiguiente >= 1 && actual.retorno - actual.salida > hastaSiguiente) {
                actual.retorno = actual.salida + hastaSiguiente;
            }
        }
    });

    // Filas de cupo que todavía no existen en Vehículos.
    const cuposNuevos = [];
    ['Arsitrans', 'Polar'].forEach(tr => {
        for (let n = 1; n <= maxCupo[tr]; n++) {
            const placa = `${tr.toUpperCase()} ${n}`;
            if (!placasApp.has(placa)) cuposNuevos.push({ placa, transportadora: tr });
        }
    });

    const cambiosRutas = sugerirCambiosRutas({ viajes, rutas, tiempos });

    // Resumen
    const fechas = viajes.map(v => v.fecha).sort();
    const contar = (fn) => viajes.reduce((acc, v) => { const k = fn(v); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const aLista = (obj) => Object.entries(obj).map(([texto, veces]) => ({ texto, veces })).sort((a, b) => b.veces - a.veces);

    return {
        viajes,
        cuposNuevos,
        cambiosRutas,
        resumen: {
            desde: fechas[0] || null,
            hasta: fechas[fechas.length - 1] || null,
            total: viajes.length,
            porTransportadora: contar(v => v.tr),
            porMes: contar(v => `${v.mes} ${v.anio}`),
            enRuta: viajes.filter(v => v.estado === 'En ruta').length,
            correcciones: {
                placas: correcciones.placas,
                fechas: correcciones.fechas,
                sucursales: aLista(correcciones.sucursales),
                almacenes: aLista(correcciones.almacenes)
            },
            errores,
            sinRuta: aLista(sinRuta),
            placasMakandDesconocidas: [...placasMakandDesconocidas].sort(),
            cuposNuevos: cuposNuevos.map(c => c.placa),
            cambiosRutas: cambiosRutas.map(c => ({ cod: c.cod, cambios: c.cambios }))
        }
    };
}

// ------------------------------------------------------------
// Rutas según lo real
// ------------------------------------------------------------
/**
 * Para cada ruta de la app con viajes importados:
 *  - Días de salida: se marca un día de la semana si la ruta salió ese
 *    día en al menos la mitad de las últimas 8 semanas del archivo.
 *  - Días ocupado (tránsito + retorno): el de la hoja CONF para su ciudad.
 * Solo devuelve las rutas donde algo cambiaría.
 */
function sugerirCambiosRutas({ viajes, rutas, tiempos, semanas = 8 }) {
    if (!viajes.length) return [];
    const hasta = viajes.map(v => v.fecha).sort().slice(-1)[0];
    const desde = sumarDias(hasta, -semanas * 7 + 1);

    const semanasPorRutaDia = {}; // cod -> diaSemana -> Set(semana)
    viajes.forEach(v => {
        if (v.fecha < desde) return;
        const semana = Math.floor(diasEntre(desde, v.fecha) / 7);
        const diaSemana = CLAVES_DIA[new Date(v.fecha + 'T00:00:00').getDay()];
        const porDia = semanasPorRutaDia[v.ruta] || (semanasPorRutaDia[v.ruta] = {});
        (porDia[diaSemana] || (porDia[diaSemana] = new Set())).add(semana);
    });

    const nombres = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' };
    const resultado = [];
    (rutas || []).forEach(r => {
        const cod = r.cod || r.codigo;
        const porDia = semanasPorRutaDia[cod];
        if (!porDia) return;
        const cambios = [];
        const diasNuevos = JSON.parse(JSON.stringify(r.dias || {}));
        CLAVES_DIA.forEach(k => {
            const sale = (porDia[k]?.size || 0) >= semanas / 2;
            const antes = !!(r.dias && r.dias[k] && r.dias[k].checked);
            if (sale !== antes) {
                diasNuevos[k] = { ...(diasNuevos[k] || { hora: '' }), checked: sale };
                cambios.push(`${sale ? 'Sale' : 'Ya no sale'} los ${nombres[k]} (en lo real: ${porDia[k]?.size || 0} de ${semanas} semanas)`);
            }
        });

        let diasTrans = Number(r.diasTrans || 1);
        let diasDesc = Number(r.diasDesc || 0);
        const deConf = tiempos[claveCiudad(r.dest || r.destino)];
        if (deConf && deConf !== diasTrans + diasDesc) {
            const antes = diasTrans + diasDesc;
            diasTrans = Math.max(1, deConf - diasDesc);
            diasDesc = deConf - diasTrans;
            cambios.push(`Días ocupado: ${antes} → ${deConf} (hoja CONF)`);
        }
        if (cambios.length) resultado.push({ cod, cambios, dias: diasNuevos, diasTrans, diasDesc });
    });
    return resultado;
}

// ------------------------------------------------------------
// Aplicar (modifica "data")
// ------------------------------------------------------------
/**
 * Los viajes importados REEMPLAZAN a todos los que había entre la
 * primera y la última fecha del archivo (lo real manda en esas fechas).
 * Fuera de ese rango no se toca nada.
 */
function aplicarImportacion(data, importacion, { aplicarRutas = false } = {}) {
    const { desde, hasta } = importacion.resumen;
    if (!desde) return { reemplazados: 0 };
    const antes = (data.viajes || []).length;
    data.viajes = (data.viajes || []).filter(v => !(v.fecha && v.fecha >= desde && v.fecha <= hasta));
    const reemplazados = antes - data.viajes.length;
    data.viajes.push(...importacion.viajes.map(v => JSON.parse(JSON.stringify(v))));

    if (!data.vehiculos) data.vehiculos = [];
    importacion.cuposNuevos.forEach(c => {
        if (data.vehiculos.some(v => normalizarPlaca(v.p || v.placa) === c.placa)) return;
        data.vehiculos.push({
            p: c.placa, placa: c.placa, veh: c.placa,
            t: 'Furgon refrigerado', tipo: 'Furgon refrigerado',
            cap: 600, kg: 12000, m3: 45,
            cond: 'Sin asignar', conductor: 'Sin asignar',
            tr: c.transportadora, transportadora: c.transportadora,
            est: 'Disponible', estado: 'Disponible',
            viajes: 0, dc: 0, dm: 1, dl: 2,
            mantInicio: null, mantFin: null, um: '',
            origenAuto: false
        });
    });

    let rutasCambiadas = 0;
    if (aplicarRutas) {
        importacion.cambiosRutas.forEach(c => {
            const r = (data.rutas || []).find(x => (x.cod || x.codigo) === c.cod);
            if (!r) return;
            r.dias = c.dias;
            r.diasTrans = c.diasTrans;
            r.diasDesc = c.diasDesc;
            rutasCambiadas++;
        });
    }
    return { reemplazados, rutasCambiadas };
}

module.exports = {
    normalizarPlaca,
    normalizarAlmacen,
    normalizarSucursal,
    parsearFecha,
    leerLibroViajeros,
    buscarRuta,
    armarImportacion,
    sugerirCambiosRutas,
    aplicarImportacion
};
