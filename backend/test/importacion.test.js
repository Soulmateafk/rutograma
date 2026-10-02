// Pruebas de la importación de viajes reales (importacion.js).
// Correr con:  npm test   (dentro de la carpeta backend)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    normalizarPlaca,
    normalizarAlmacen,
    normalizarSucursal,
    parsearFecha,
    buscarRuta,
    armarImportacion,
    aplicarImportacion
} = require('../importacion');

test('placas: espacios y formato de la app', () => {
    assert.equal(normalizarPlaca(' poz798'), 'POZ 798');
    assert.equal(normalizarPlaca('PRZ065'), 'PRZ 065');
    assert.equal(normalizarPlaca('PRZ 065'), 'PRZ 065');
    assert.equal(normalizarPlaca('ARSITRANS  1'), 'ARSITRANS 1');
});

test('almacenes y sucursales mal escritas', () => {
    assert.equal(normalizarAlmacen('ÉXITO'), 'Exito');
    assert.equal(normalizarAlmacen('d1'), 'D1');
    assert.deepEqual(normalizarSucursal('GUARNE - LA ESTRELLA').partes, ['GUARNE', 'LA ESTRELLA']);
    assert.equal(normalizarSucursal('GUARNE /ESTRELLA').texto, 'GUARNE / LA ESTRELLA');
    assert.equal(normalizarSucursal('GIRARRDOTA').texto, 'GIRARDOTA');
    assert.equal(normalizarSucursal('D1 GUARNE').texto, 'GUARNE');
    assert.equal(normalizarSucursal('Mellellin').texto, 'MEDELLIN');
});

test('fechas: número de Excel 1904 y 1900, y texto día/mes o mes/día según el MES', () => {
    assert.equal(parsearFecha(44562, { fecha1904: true }), '2026-01-02');
    assert.equal(parsearFecha(46024, { fecha1904: false }), '2026-01-02');
    assert.equal(parsearFecha('1/2/26', { mes: 'ENERO' }), '2026-01-02');
    assert.equal(parsearFecha('01/10/2026', { mes: 'OCTUBRE' }), '2026-10-01');
    assert.equal(parsearFecha('', {}), null);
    assert.equal(parsearFecha('mañana', {}), null);
});

const RUTAS = [
    { cod: 'BOG-CAL-D1', dest: 'Cali', clientes: 'D1, Cali', diasTrans: 1, diasDesc: 1, tarifaMakand: 3000000, tarifaArsitrans: 2800000, dias: { lun: { checked: true, hora: '14:00' } } },
    { cod: 'BOG-CAL-EX', dest: 'Cali', clientes: 'Exito, Cali.', diasTrans: 1, diasDesc: 1, dias: {} },
    { cod: 'BOG-GUA-D1', dest: 'Medellin/Guarne', clientes: 'D1, Guarne.', diasTrans: 1, diasDesc: 1, dias: {} },
    { cod: 'BOG-EST-D1', dest: 'Medellin/La Estrella', clientes: 'D1, La Estrella.', diasTrans: 1, diasDesc: 1, dias: {} },
    { cod: 'BOG-BAQ-D1', dest: 'Barranquilla', clientes: 'D1, Barranquilla.', diasTrans: 2, diasDesc: 2, dias: {} }
];

test('busca la ruta de la app por sucursal + almacén', () => {
    assert.equal(buscarRuta(RUTAS, 'CALI', 'D1').cod, 'BOG-CAL-D1');
    assert.equal(buscarRuta(RUTAS, 'CALI', 'Exito').cod, 'BOG-CAL-EX');
    assert.equal(buscarRuta(RUTAS, 'GUARNE', 'D1').cod, 'BOG-GUA-D1');
    assert.equal(buscarRuta(RUTAS, 'MEDELLIN', 'D1'), null);
});

const fila = (extra) => ({
    'FECHA DE CARGUE': '3/9/26', 'MES': 'SEPTIEMBRE', 'TRANSPORTE': 'MAKAND', 'PLACA': 'PRZ064',
    'SUCURSAL': 'CALI', 'ALMACEN': 'D1', 'CONDUCTOR': 'JUAN PEREZ', 'TOTAL CAJAS': 600,
    'FECHA DE RETORNO A PLANTA': null, 'CUMPLIMIENTO ENTREGA MAKAND': 'CUMPLE', ...extra
});

test('arma viajes reales: retorno, cupos de terceros y estado', () => {
    const r = armarImportacion({
        filas: [
            fila({}),
            fila({ 'PLACA': ' LIK440', 'TRANSPORTE': 'ARSITRANS' }),
            fila({ 'PLACA': 'ESS370', 'TRANSPORTE': 'ARSITRANS', 'SUCURSAL': 'GUARNE - LA ESTRELLA' }),
            fila({ 'PLACA': 'NOW031', 'SUCURSAL': 'BARRANQUILLA', 'FECHA DE RETORNO A PLANTA': '9/9/26' }),
            fila({ 'PLACA': 'NUX580', 'FECHA DE CARGUE': '9/30/26', 'CUMPLIMIENTO ENTREGA MAKAND': 'SIN LLEGAR' }),
            fila({ 'FECHA DE CARGUE': '', 'FECHA SALIDA': '' })
        ],
        tiempos: { 'CALI': 2 },
        rutas: RUTAS,
        vehiculos: [{ p: 'PRZ 064' }, { p: 'NOW 031' }, { p: 'NUX 580' }, { p: 'ARSITRANS 1' }],
        hoy: '2026-10-01'
    });
    const [makand, ars1, ars2, baq, enRuta] = r.viajes;
    assert.equal(r.viajes.length, 5);
    assert.equal(r.resumen.errores.length, 1);

    assert.equal(makand.placa, 'PRZ 064');
    assert.equal(makand.ruta, 'BOG-CAL-D1');
    assert.equal(makand.tipo, 'real');
    assert.equal(makand.retorno - makand.salida, 2);          // hoja CONF: Cali = 2
    assert.equal(baq.retorno - baq.salida, 6);                // fecha real de retorno: 3 -> 9

    assert.equal(ars1.placa, 'ARSITRANS 1');
    assert.equal(ars1.placaReal, 'LIK 440');
    assert.equal(ars1.retorno - ars1.salida, 1);
    assert.equal(ars2.placa, 'ARSITRANS 2');
    assert.equal(ars2.ruta, 'BOG-GUA-D1');
    assert.equal(ars2.dest2, 'Medellin/La Estrella');
    assert.deepEqual(r.resumen.cuposNuevos, ['ARSITRANS 2']); // ARSITRANS 1 ya existe

    assert.equal(makand.costo, 3000000);                      // tarifa Makand de la ruta
    assert.equal(ars1.costo, 2800000);                        // tarifa Arsitrans de la misma ruta
    assert.equal(makand.estado, 'Entregado');
    assert.equal(enRuta.estado, 'En ruta');
    assert.equal(r.resumen.correcciones.placas, 1);           // " LIK440"
});

test('sugiere días de salida según lo real y días ocupado según CONF', () => {
    // BOG-CAL-D1 salió todos los martes de 8 semanas, nunca los lunes.
    const filas = [];
    for (let s = 0; s < 8; s++) {
        const d = new Date(2026, 7, 4 + s * 7); // martes desde el 4 de agosto
        filas.push(fila({ 'FECHA DE CARGUE': `${d.getMonth() + 1}/${d.getDate()}/26`, 'MES': ['AGOSTO', 'SEPTIEMBRE'][d.getMonth() - 7] }));
    }
    const r = armarImportacion({ filas, tiempos: { 'CALI': 3 }, rutas: RUTAS, vehiculos: [{ p: 'PRZ 064' }], hoy: '2026-10-01' });
    const cambio = r.cambiosRutas.find(c => c.cod === 'BOG-CAL-D1');
    assert.ok(cambio);
    assert.equal(cambio.dias.mar.checked, true);
    assert.equal(cambio.dias.lun.checked, false);
    assert.equal(cambio.dias.lun.hora, '14:00');              // la hora se conserva
    assert.equal(cambio.diasTrans + cambio.diasDesc, 3);
});

test('aplicar: reemplaza solo los viajes dentro del rango del archivo', () => {
    const r = armarImportacion({ filas: [fila({}), fila({ 'FECHA DE CARGUE': '9/5/26' })], tiempos: {}, rutas: RUTAS, vehiculos: [{ p: 'PRZ 064' }], hoy: '2026-10-01' });
    const data = {
        viajes: [
            { id: 'viejo-dentro', fecha: '2026-09-04' },
            { id: 'antes', fecha: '2026-09-02' },
            { id: 'despues', fecha: '2026-09-06' }
        ],
        vehiculos: [{ p: 'PRZ 064' }],
        rutas: JSON.parse(JSON.stringify(RUTAS))
    };
    const res = aplicarImportacion(data, r, { aplicarRutas: false });
    assert.equal(res.reemplazados, 1);
    assert.deepEqual(data.viajes.map(v => v.id).sort(), ['REAL-2026-09-03-PRZ064', 'REAL-2026-09-05-PRZ064', 'antes', 'despues'].sort());
});

test('un viaje real no ocupa al vehículo más allá de su siguiente salida real', () => {
    const r = armarImportacion({
        filas: [
            // sale el 13 y el archivo dice que "retorna" el 17...
            fila({ 'PLACA': 'NOW033', 'FECHA DE CARGUE': '9/13/26', 'FECHA DE RETORNO A PLANTA': '9/17/26' }),
            // ...pero ya volvió a salir el 14
            fila({ 'PLACA': 'NOW033', 'FECHA DE CARGUE': '9/14/26' })
        ],
        tiempos: { 'CALI': 2 }, rutas: RUTAS, vehiculos: [{ p: 'NOW 033' }], hoy: '2026-10-01'
    });
    const [primero, segundo] = r.viajes;
    assert.equal(primero.retorno, 14);
    assert.equal(segundo.retorno - segundo.salida, 2);
});
