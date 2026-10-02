// Pruebas de las reglas de aprobación (aprobaciones.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { rolDeCuenta, puedeAprobar, requiereAprobacion, describirCambio, solicitudPublica } = require('../aprobaciones');

test('rol efectivo de cada cuenta', () => {
    assert.equal(rolDeCuenta({ rol: 'jefe' }, false), 'jefe');
    assert.equal(rolDeCuenta({ rol: 'AUXILIAR' }, false), 'auxiliar');
    assert.equal(rolDeCuenta({}, false), 'editor');
    assert.equal(rolDeCuenta({ rol: 'cualquiera' }, false), 'editor');
    assert.equal(rolDeCuenta({ rol: 'auxiliar' }, true), 'admin');
});

test('solo jefe y admin aprueban', () => {
    assert.ok(puedeAprobar('jefe'));
    assert.ok(puedeAprobar('admin'));
    assert.ok(!puedeAprobar('editor'));
    assert.ok(!puedeAprobar('auxiliar'));
});

test('qué cambios del auxiliar quedan pendientes', () => {
    assert.ok(requiereAprobacion('POST', '/api/viajes', { id: 1 }));
    assert.ok(requiereAprobacion('DELETE', '/api/vehiculos/ABC123', {}));
    assert.ok(requiereAprobacion('POST', '/api/configuracion/generar-matriz', { mes: 'Octubre' }));
    assert.ok(!requiereAprobacion('POST', '/api/configuracion/generar-matriz', { previsualizar: true }));
    assert.ok(!requiereAprobacion('GET', '/api/viajes', {}));
    assert.ok(!requiereAprobacion('POST', '/api/auth/login', {}));
    assert.ok(!requiereAprobacion('POST', '/api/sesiones/cerrar', {}));
});

test('describe cada cambio en palabras', () => {
    assert.equal(describirCambio('POST', '/api/viajes', { ruta: 'BOG-CAL-D1', placa: 'PRZ 064', fecha: '2026-10-05', estado: 'Programado' }),
        'Guardar viaje BOG-CAL-D1 · PRZ 064 · 2026-10-05 (Programado)');
    assert.equal(describirCambio('POST', '/api/rutas/eliminar', { cod: 'BOG-TUN-D1' }), 'Eliminar la ruta BOG-TUN-D1');
    assert.equal(describirCambio('DELETE', '/api/vehiculos/LUN%20428', {}), 'Eliminar el vehículo LUN 428');
    assert.equal(describirCambio('POST', '/api/configuracion/generar-matriz', { mes: 'Octubre', anio: 2026 }), 'Generar Matriz de Octubre 2026');
});

test('al mostrar una solicitud no se manda el Excel de una importación', () => {
    const s = solicitudPublica({ id: 'x', cuerpo: { archivo: 'UEsDB...', aplicarRutas: true } });
    assert.deepEqual(s.cuerpo, { aplicarRutas: true });
});
