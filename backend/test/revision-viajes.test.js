const test = require('node:test');
const assert = require('node:assert');
const { documentosVencidos, choquesDeAgenda, revisarMes, cambioLoQueSeRevisa } = require('../revision-viajes');

const data = {
    vehiculos: [
        { p: 'LUN 428', soatVence: '2026-10-10', tecnoVence: '2027-01-01' },
        { p: 'NOW 033', soatVence: '2027-01-01', tecnoVence: '2026-09-30' }
    ],
    conductores: [
        { nom: 'Javier Torres', veh: 'LUN 428', licVence: '2027-05-01' },
        { nom: 'Pedro Pérez', veh: 'NOW 033', licVence: '2026-10-05' }
    ]
};
// salida/retorno: el vehículo queda libre el día "retorno".
const viaje = (id, p, fecha, salida, retorno, extra = {}) => ({ id, p, fecha, salida, retorno, ruta: 'BOG-CAL', estado: 'Planificado', ...extra });

test('documentos: SOAT que vence durante el viaje, tecnomecánica y licencia vencidas', () => {
    assert.deepStrictEqual(documentosVencidos(viaje(1, 'LUN 428', '2026-10-08', 8, 10), data), []);
    assert.match(documentosVencidos(viaje(1, 'LUN 428', '2026-10-10', 10, 12), data)[0], /LUN 428: el SOAT .* 10\/10\/2026/);
    const faltas = documentosVencidos(viaje(2, 'NOW 033', '2026-10-06', 6, 7), data);
    assert.strictEqual(faltas.length, 2);
    assert.match(faltas[0], /tecnomecánica/);
    assert.match(faltas[1], /Pedro Pérez: la licencia/);
});

test('documentos: cuenta el conductor anotado, no el titular; los cupos y cancelados no se revisan', () => {
    assert.deepStrictEqual(documentosVencidos(viaje(1, 'NOW 033', '2026-09-01', 1, 2, { cond: 'Javier Torres' }), data), []);
    assert.match(documentosVencidos(viaje(1, 'LUN 428', '2026-10-06', 6, 7, { cond: 'pedro perez' }), data)[0], /licencia/);
    assert.deepStrictEqual(documentosVencidos(viaje(1, 'ARSITRANS 1', '2027-10-06', 6, 7), data), []);
    assert.deepStrictEqual(documentosVencidos(viaje(1, 'NOW 033', '2026-10-06', 6, 7, { estado: 'Cancelado' }), data), []);
});

test('choques: mismo vehículo cruzado; salir el día del retorno no choca', () => {
    const a = viaje(1, 'LUN 428', '2026-10-05', 5, 8);
    const viajes = [a, viaje(2, 'LUN 428', '2026-10-08', 8, 9), viaje(3, 'LUN 428', '2026-10-07', 7, 8), viaje(4, 'NOW 033', '2026-10-06', 6, 7)];
    const c = choquesDeAgenda(a, viajes, data.conductores);
    assert.deepStrictEqual(c.map(x => [x.viaje.id, x.por]), [[3, 'vehículo']]);
    // Mismo día, viaje de un solo día: choca.
    assert.strictEqual(choquesDeAgenda(viaje(9, 'NOW 033', '2026-10-06', 6, 0), viajes, data.conductores).length, 1);
});

test('choques: el mismo conductor en dos vehículos a la vez', () => {
    const viajes = [viaje(1, 'LUN 428', '2026-10-05', 5, 7), viaje(2, 'NOW 033', '2026-10-06', 6, 7, { cond: 'Javier Torres' })];
    const c = choquesDeAgenda(viajes[1], viajes, data.conductores);
    assert.deepStrictEqual(c.map(x => x.por), ['conductor']);
    assert.match(c[0].texto, /Javier Torres es el titular de LUN 428, que tiene el viaje BOG-CAL del 05\/10\/2026 sin conductor anotado/);
    // Visto desde el otro viaje: la placa no tiene conductor anotado y su titular va en otra.
    assert.match(choquesDeAgenda(viajes[0], viajes, data.conductores)[0].texto, /LUN 428 no tiene conductor anotado y su titular, Javier Torres, va en NOW 033/);
    // Los dos anotados: el mismo conductor en dos viajes.
    const ambos = [{ ...viajes[0], cond: 'javier torres' }, viajes[1]];
    assert.match(choquesDeAgenda(ambos[1], ambos, data.conductores)[0].texto, /^Javier Torres ya tiene el viaje BOG-CAL del 05\/10\/2026 \(en LUN 428\)$/);
    // Cancelado no cuenta.
    assert.deepStrictEqual(choquesDeAgenda(viajes[1], [{ ...viajes[0], estado: 'Cancelado' }, viajes[1]], data.conductores), []);
});

test('revisarMes junta los problemas del mes', () => {
    const r = revisarMes({ ...data, viajes: [viaje(1, 'LUN 428', '2026-10-05', 5, 7), viaje(2, 'LUN 428', '2026-10-06', 6, 7), viaje(3, 'LUN 428', '2026-11-20', 20, 21)] }, '2026-10');
    assert.deepStrictEqual(r.map(x => x.viaje.id), [1, 2]);
});

test('solo se revisa si cambió vehículo, conductor o fechas', () => {
    const previo = viaje(1, 'LUN 428', '2026-10-05', 5, 7);
    assert.strictEqual(cambioLoQueSeRevisa(previo, { ...previo, estado: 'Entregado', obs: 'ok' }), false);
    assert.strictEqual(cambioLoQueSeRevisa(previo, { ...previo, p: 'NOW 033' }), true);
    assert.strictEqual(cambioLoQueSeRevisa(previo, { ...previo, cond: 'Pedro Pérez' }), true);
    assert.strictEqual(cambioLoQueSeRevisa(previo, { ...previo, retorno: 8 }), true);
    assert.strictEqual(cambioLoQueSeRevisa(null, previo), true);
});
