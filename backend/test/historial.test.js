const test = require('node:test');
const assert = require('node:assert/strict');
const { armarHistorialViaje } = require('../historial');

test('historial de un viaje: qué cambió, quién y si se aprobó', () => {
    const foto = (extra) => ({ id: 'V1', p: 'NOW 031', fecha: '2026-10-05', ruta: 'BOG-CAL-D1', cond: 'Juan', estado: 'Planificado', ...extra });
    const h = armarHistorialViaje([
        { fecha: '2026-10-01T10:00:00Z', usuario: 'a@x.com', ruta: '/api/viajes', resumen: foto({}) },
        { fecha: '2026-10-01T11:00:00Z', usuario: 'a@x.com', ruta: '/api/viajes', resumen: foto({}) },                       // igual: no se lista
        { fecha: '2026-10-02T09:00:00Z', usuario: 'aux@x.com', ruta: '/api/viajes', resumen: { aprobacion: 'PENDIENTE', ...foto({ cond: 'Pedro' }) } },
        { fecha: '2026-10-02T10:00:00Z', usuario: 'aux@x.com', ruta: '/api/viajes', resumen: foto({ cond: 'Pedro', aprobadoPor: 'jefe@x.com' }) },
        { fecha: '2026-10-03T08:00:00Z', usuario: 'b@x.com', ruta: '/api/viajes', resumen: foto({ cond: 'Pedro', estado: 'En ruta', p: 'NOW 033' }) }
    ]);
    assert.equal(h.length, 4);
    assert.equal(h[0].usuario, 'b@x.com');
    assert.deepEqual(h[0].cambios.map(c => c.campo), ['Vehículo', 'Estado']);
    assert.equal(h[1].aprobadoPor, 'jefe@x.com');
    assert.deepEqual(h[1].cambios, [{ campo: 'Conductor', de: 'Juan', a: 'Pedro' }]);
    assert.match(h[2].accion, /esperando aprobación/);
    assert.equal(h[3].accion, 'Guardó el viaje');
});
