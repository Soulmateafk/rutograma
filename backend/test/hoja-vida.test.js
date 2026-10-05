const test = require('node:test');
const assert = require('node:assert');
const { armarHojaDeVida, estadoDocumento } = require('../hoja-vida');

const HOY = '2026-10-05';
const data = {
    vehiculos: [{
        p: 'LUN 428', t: 'Furgon', cap: 660, est: 'Disponible', soatVence: '2026-10-20', tecnoVence: '2026-09-01',
        historialMantenimiento: [{ inicio: '2026-09-01', fin: '2026-09-03' }],
        historialAverias: [{ dia: 12, mes: 'Septiembre', anio: 2026, razon: 'Llanta', placaFinal: 'NOW 033' }]
    }, { p: 'NOW 033' }],
    conductores: [{ nom: 'Torres Huerfano Javier', ced: '80657176', veh: 'LUN 428', licVence: '2027-01-01' }],
    viajes: [
        { id: 1, p: 'LUN 428', fecha: '2026-09-10', destino: 'Cali', cond: 'Pedro Pérez', estado: 'Entregado' },
        { id: 2, p: 'LUN 428', fecha: '2026-10-02', destino: 'Cali', cond: 'Torres Huerfano Javier', estado: 'Entregado' },
        { id: 3, p: 'LUN 428', fecha: '2026-10-03', destino: 'Medellín', cond: 'Torres Huerfano Javier', estado: 'Cancelado' },
        { id: 4, p: 'LUN 428', fecha: '2026-10-08', destino: 'Cali', cond: 'Torres Huerfano Javier', estado: 'Planificado' },
        { id: 5, p: 'ARSITRANS 1', placaReal: 'lun428', fecha: '2026-10-04', destino: 'Pasto', cond: 'Sin asignar', estado: 'Entregado' },
        { id: 6, p: 'NOW 033', fecha: '2026-10-04', destino: 'Cali' }
    ],
    novedades: [
        { id: 'n1', titulo: 'LUN428 varado', desc: 'en Ibagué', fecha: '2026-09-12', tipo: 'Avería' },
        { id: 'n2', titulo: 'Otra cosa', desc: 'NOW 033', fecha: '2026-09-13' }
    ]
};

test('la placa se encuentra escrita de cualquier forma', () => {
    assert.strictEqual(armarHojaDeVida(data, 'lun-428', HOY).vehiculo.placa, 'LUN 428');
    assert.strictEqual(armarHojaDeVida(data, 'ZZZ 999', HOY), null);
});

test('viajes, resumen y conductores', () => {
    const h = armarHojaDeVida(data, 'LUN 428', HOY);
    assert.deepStrictEqual(h.ultimosViajes.map(v => v.id), [5, 3, 2, 1]);
    assert.deepStrictEqual(h.proximosViajes.map(v => v.id), [4]);
    assert.strictEqual(h.resumen.viajesHechos, 3);
    assert.strictEqual(h.resumen.viajesEsteMes, 3);
    assert.strictEqual(h.resumen.cancelados, 1);
    assert.strictEqual(h.resumen.proximos, 1);
    assert.deepStrictEqual(h.conductores.map(c => [c.nombre, c.viajes]), [['Torres Huerfano Javier', 1], ['Pedro Pérez', 1]]);
    assert.strictEqual(h.destinos[0].destino, 'Cali');
    assert.strictEqual(h.vehiculo.conductorActual, 'Torres Huerfano Javier');
    assert.strictEqual(h.porMes[0].mes, '2026-10');
});

test('documentos, mantenimientos, averías y novedades', () => {
    const h = armarHojaDeVida(data, 'LUN 428', HOY);
    assert.deepStrictEqual(h.documentos.map(d => d.estado), ['por vencer', 'vencido', 'al día']);
    assert.strictEqual(h.mantenimientos[0].dias, 3);
    assert.strictEqual(h.resumen.diasEnTaller, 3);
    assert.deepStrictEqual(h.averias[0], { fecha: '2026-09-12', razon: 'Llanta', terminoElViaje: 'NOW 033' });
    assert.deepStrictEqual(h.novedades.map(n => n.id), ['n1']);
    assert.strictEqual(estadoDocumento('X', '', HOY).estado, 'sin dato');
});

test('cuenta los viajes sin conductor anotado', () => {
    assert.strictEqual(armarHojaDeVida(data, 'LUN 428', HOY).resumen.sinConductor, 1);
});
