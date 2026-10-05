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

const { permisosDeCuenta, permisosDeRol, normalizarPermisos, necesitaAprobacion } = require('../aprobaciones');

test('permisos: por rol, personalizados y del admin', () => {
    assert.equal(necesitaAprobacion(permisosDeRol('auxiliar')), true);
    assert.equal(necesitaAprobacion(permisosDeRol('jefe')), false);
    assert.equal(permisosDeRol('jefe').gestionarCuentas, false);
    assert.equal(permisosDeRol('lector').editar, false);
    assert.equal(permisosDeCuenta({}, false).editar, true); // sin rol = editor

    // Auxiliar que puede cambiar sin esperar aprobación pero no acepta cuentas.
    const aux = { rol: 'auxiliar', permisos: JSON.stringify({ editar: true, sinAprobacion: true }) };
    assert.equal(necesitaAprobacion(permisosDeCuenta(aux, false)), false);
    assert.equal(permisosDeCuenta(aux, false).gestionarCuentas, false);

    assert.equal(Object.values(permisosDeCuenta({ rol: 'lector' }, true)).every(Boolean), true);

    // Combinaciones sin sentido se corrigen.
    const raro = normalizarPermisos({ sinAprobacion: true, gestionarCuentas: true, inventado: true });
    assert.equal(raro.sinAprobacion, false);
    assert.equal(raro.verAdministracion, true);
    assert.equal('inventado' in raro, false);
});

const { permisoRequerido } = require('../aprobaciones');

test('permisos puntuales: qué pide cada acción y valores de cada rol', () => {
    assert.equal(permisoRequerido('POST', '/api/viajes/eliminar', {}), 'eliminar');
    assert.equal(permisoRequerido('DELETE', '/api/vehiculos/ABC123', {}), 'eliminar');
    assert.equal(permisoRequerido('POST', '/api/configuracion/generar-matriz', {}), 'generarMatriz');
    assert.equal(permisoRequerido('POST', '/api/configuracion/generar-matriz', { previsualizar: true }), null);
    assert.equal(permisoRequerido('POST', '/api/importar/viajes-reales', {}), 'importarExcel');
    assert.equal(permisoRequerido('POST', '/api/modo', {}), 'cambiarModo');
    assert.equal(permisoRequerido('POST', '/api/viajes', {}), null);

    assert.equal(permisosDeRol('editor').importarExcel, true);
    assert.equal(permisosDeRol('editor').cambiarModo, false);
    assert.equal(permisosDeRol('auxiliar').importarExcel, false);
    assert.equal(permisosDeRol('jefe').verSesionesTodas, true);
    assert.equal(permisosDeRol('lector').eliminar, false);

    // Sin "Hacer cambios" no queda ningún permiso de cambio.
    const sinEditar = normalizarPermisos({ eliminar: true, cambiarModo: true, verSesionesTodas: true });
    assert.equal(sinEditar.eliminar, false);
    assert.equal(sinEditar.cambiarModo, false);
    assert.equal(sinEditar.verSesionesTodas, true);

    // Personalizados guardados antes de existir un permiso: toma el de su rol.
    const viejo = { rol: 'editor', permisos: JSON.stringify({ editar: true, sinAprobacion: true, editarHistorico: false }) };
    assert.equal(permisosDeCuenta(viejo, false).eliminar, true);
    assert.equal(permisosDeCuenta(viejo, false).editarHistorico, false);
    // Y si se quitó a propósito, sigue quitado.
    const sinEliminar = { rol: 'editor', permisos: { editar: true, sinAprobacion: true, eliminar: false } };
    assert.equal(permisosDeCuenta(sinEliminar, false).eliminar, false);
});
