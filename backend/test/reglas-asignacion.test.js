const test = require('node:test');
const assert = require('node:assert');
const { reglasIncumplidas, horaDelViaje } = require('../reglas-asignacion');

const data = {
    vehiculos: [
        { p: 'LUN 428', tipo: 'Furgon refrigerado', cajas: 660 },
        { p: 'NOW 033', tipo: 'Furgón seco', cajas: 400 }
    ],
    rutas: [{ cod: 'BOG-MON', clientes: 'D1', dias: { lun: { checked: true, hora: '05:30' } } }],
    reglasAsignacion: [
        { id: 'r1', aplicaA: 'cliente', valor: 'd1', tipoVehiculo: 'refrigerado', nota: 'cadena de frío' },
        { id: 'r2', aplicaA: 'ruta', valor: 'BOG-MON', cajasMin: 600 }
    ],
    picoPlaca: [{ id: 'p1', dias: ['lun', 'mar'], digitos: '3, 4', desde: '06:00', hasta: '20:00' }]
};
// 2026-10-05 es lunes.
const viaje = (p, extra = {}) => ({ p, fecha: '2026-10-05', ruta: 'BOG-CAL', estado: 'Planificado', ...extra });

test('cliente pide un tipo de vehículo (sin tildes ni mayúsculas)', () => {
    assert.deepStrictEqual(reglasIncumplidas(viaje('LUN 428', { cliente: 'D1 Bogotá' }), data), []);
    const a = reglasIncumplidas(viaje('NOW 033', { cliente: 'Tiendas D1', hora: '21:00' }), data);
    assert.deepStrictEqual(a, ['el cliente d1 pide vehículo "refrigerado" y NOW 033 es "Furgón seco" (cadena de frío)']);
});

test('la ruta pide mínimo de cajas; el cliente se toma de la ruta si el viaje no lo tiene', () => {
    const a = reglasIncumplidas(viaje('NOW 033', { ruta: 'BOG-MON' }), data);
    assert.strictEqual(a.length, 2);
    assert.match(a[0], /refrigerado/);
    assert.match(a[1], /la ruta BOG-MON pide mínimo 600 cajas y NOW 033 lleva 400/);
});

test('pico y placa: día, último dígito y horario', () => {
    assert.deepStrictEqual(reglasIncumplidas(viaje('NOW 033', { hora: '14:00' }), { ...data, reglasAsignacion: [] }),
        ['NOW 033 (termina en 3) tiene pico y placa el lunes de 06:00 a 20:00 y sale a las 14:00']);
    assert.deepStrictEqual(reglasIncumplidas(viaje('NOW 033', { hora: '05:00' }), { ...data, reglasAsignacion: [] }), []);
    assert.deepStrictEqual(reglasIncumplidas(viaje('NOW 033', { hora: '20:00' }), { ...data, reglasAsignacion: [] }), []);
    assert.deepStrictEqual(reglasIncumplidas(viaje('LUN 428', { hora: '14:00' }), { ...data, reglasAsignacion: [] }), []);
    // Sin hora conocida no se puede saber: no avisa.
    assert.deepStrictEqual(reglasIncumplidas(viaje('NOW 033'), { ...data, reglasAsignacion: [] }), []);
    // La hora de la ruta para ese día cuenta.
    assert.strictEqual(horaDelViaje(viaje('X', { ruta: 'bog-mon' }), data.rutas), '05:30');
});

test('cupos de terceros y viajes cancelados no se revisan', () => {
    assert.deepStrictEqual(reglasIncumplidas(viaje('ARSITRANS 3', { cliente: 'D1', hora: '14:00' }), data), []);
    assert.deepStrictEqual(reglasIncumplidas(viaje('NOW 033', { cliente: 'D1', hora: '14:00', estado: 'Cancelado' }), data), []);
});
