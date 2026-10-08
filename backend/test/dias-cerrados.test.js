const test = require('node:test');
const assert = require('node:assert');
const { finDeViaje, viajeCerrado, motivoBloqueoGuardar, motivoBloqueoEliminar, motivoFechaAnterior, ultimoDiaDeViaje, viajeEnRuta, motivoExtraEnElPasado, textoEnRuta } = require('../dias-cerrados');

const HOY = '2026-10-05';
const viaje = (extra) => ({ id: 'v1', fecha: '2026-10-01', salida: 1, retorno: 3, p: 'ABC123', ruta: 'BOG-CAL', cond: 'Pedro Pérez', estado: 'En ruta', ...extra });

test('fin del viaje = día de regreso', () => {
    assert.strictEqual(finDeViaje(viaje()), '2026-10-03');
    assert.strictEqual(finDeViaje(viaje({ retorno: 0 })), '2026-10-01');
    assert.strictEqual(finDeViaje({ fecha: '2026-09-30', salida: 30, retorno: 32 }), '2026-10-02');
    assert.strictEqual(finDeViaje({}), '');
});

test('cerrado solo si ya regresó antes de hoy', () => {
    assert.strictEqual(viajeCerrado(viaje(), HOY), true);
    // Salió el 3 y regresa el 5 (hoy): todavía va en camino.
    assert.strictEqual(viajeCerrado(viaje({ fecha: '2026-10-03', salida: 3, retorno: 5 }), HOY), false);
    assert.strictEqual(viajeCerrado(viaje({ fecha: '2026-10-07', salida: 7, retorno: 9 }), HOY), false);
    assert.strictEqual(viajeCerrado({ fecha: '' }, HOY), false);
});

test('en un día cerrado se puede anotar el estado y lo que pasó después', () => {
    const previo = viaje();
    assert.strictEqual(motivoBloqueoGuardar(previo, { ...previo, estado: 'Entregado', placaReal: 'XYZ 987', obs: 'llegó tarde', cssClass: 'x' }, HOY), '');
    assert.strictEqual(motivoBloqueoGuardar(previo, { ...previo, estado: 'Cancelado', motivoCancelacion: 'lluvia' }, HOY), '');
    // Mismo dato con otro nombre o formato: no es un cambio.
    assert.strictEqual(motivoBloqueoGuardar(previo, { id: 'v1', placa: 'abc123', salida: '1', retorno: '3', estado: 'Entregado' }, HOY), '');
    assert.strictEqual(motivoBloqueoGuardar({ ...previo, cond: '' }, { ...previo, cond: 'Sin asignar', prioridad: 'Normal', estado: 'Entregado' }, HOY), '');
    // Lo que la pantalla rellena al mostrar el viaje (vacío antes) no bloquea.
    assert.strictEqual(motivoBloqueoGuardar({ ...previo, destino: '', hora: '', costo: 0 }, { ...previo, destino: 'No definido', hora: '--:--', costo: 850000, estado: 'Entregado' }, HOY), '');
    // Borrar un dato que sí tenía, en cambio, es cambiarlo.
    assert.match(motivoBloqueoGuardar({ ...previo, destino: 'Cali' }, { ...previo, destino: '' }, HOY), /destino/);
});

test('en un día cerrado no se cambia lo que define el viaje', () => {
    const previo = viaje();
    const m = motivoBloqueoGuardar(previo, { ...previo, p: 'DEF456', cond: 'Otro' }, HOY);
    assert.match(m, /vehículo/);
    assert.match(m, /conductor/);
    assert.match(motivoBloqueoGuardar(previo, { ...previo, fecha: '2026-10-08', salida: 8, retorno: 10 }, HOY), /fecha/);
});

test('no se crean viajes en el pasado ni se mueven al pasado', () => {
    assert.match(motivoBloqueoGuardar(null, viaje(), HOY), /no se permite añadir viajes en días ya cerrados/i);
    assert.strictEqual(motivoBloqueoGuardar(null, viaje({ fecha: HOY, salida: 5, retorno: 6 }), HOY), '');
    const abierto = viaje({ fecha: '2026-10-08', salida: 8, retorno: 9 });
    assert.match(motivoBloqueoGuardar(abierto, { ...abierto, fecha: '2026-10-02', salida: 2, retorno: 3 }, HOY), /ya pasó/);
    assert.strictEqual(motivoBloqueoGuardar(abierto, { ...abierto, cond: 'Otro' }, HOY), '');
});

test('eliminar', () => {
    assert.match(motivoBloqueoEliminar(viaje(), HOY), /Cancelado/);
    assert.strictEqual(motivoBloqueoEliminar(viaje({ fecha: HOY, salida: 5, retorno: 6 }), HOY), '');
    assert.strictEqual(motivoBloqueoEliminar(null, HOY), '');
});

test('editar: un viaje que no ha pasado no se manda a antes de hoy', () => {
    const hoy = '2026-10-08';
    // Sale hoy (8) y su último día es el 9 (retorno guardado 10).
    const v = { id: 'v', fecha: '2026-10-08', salida: 8, retorno: 10 };
    assert.strictEqual(ultimoDiaDeViaje(v), '2026-10-09');
    assert.match(motivoFechaAnterior(v, { ...v, fecha: '2026-10-07', salida: 7, retorno: 9 }, hoy), /salida el 07\/10\/2026: es un día anterior a hoy \(08\/10\/2026\)/);
    // Va en camino (salió el 5, último día el 9): el retorno no puede quedar el 7.
    const enRuta = { id: 'r', fecha: '2026-10-05', salida: 5, retorno: 10 };
    assert.match(motivoFechaAnterior(enRuta, { ...enRuta, retorno: 8 }, hoy), /retorno el 07\/10\/2026/);
    // Retorno hoy o después, o un día siguiente: se puede.
    assert.strictEqual(motivoFechaAnterior(enRuta, { ...enRuta, retorno: 9 }, hoy), '');
    assert.strictEqual(motivoFechaAnterior(v, { ...v, fecha: '2026-10-12', salida: 12, retorno: 14 }, hoy), '');
    // Cambiar otra cosa (estado, observación) sin tocar fechas: se puede.
    assert.strictEqual(motivoFechaAnterior(v, { ...v, estado: 'Entregado' }, hoy), '');
    // Un viaje que ya había pasado (corrección de algo real): lo decide el permiso de días cerrados.
    const viejo = { id: 'x', fecha: '2026-10-02', salida: 2, retorno: 4 };
    assert.strictEqual(motivoFechaAnterior(viejo, { ...viejo, fecha: '2026-10-01', salida: 1, retorno: 3 }, hoy), '');
    // Viaje nuevo: lo revisa la regla de días cerrados, no esta.
    assert.strictEqual(motivoFechaAnterior(null, v, hoy), '');
});

test('Viaje Extra: nunca en un día pasado; vehículo en ruta', () => {
    const hoy = '2026-10-08';
    assert.match(motivoExtraEnElPasado(null, { tipo: 'extra', fecha: '2026-10-07' }, hoy), /días ya cerrados: el 07\/10\/2026 ya pasó/);
    assert.strictEqual(motivoExtraEnElPasado(null, { tipo: 'extra', fecha: '2026-10-08' }, hoy), '');
    assert.strictEqual(motivoExtraEnElPasado({ id: 1 }, { tipo: 'extra', fecha: '2026-10-07' }, hoy), '');
    // Salió el 7 y su último día es el 9 (retorno guardado 10): va en ruta.
    const v = { p: 'PRZ 065', ruta: 'BOG-CAL', fecha: '2026-10-07', salida: 7, retorno: 10, estado: 'En ruta' };
    assert.strictEqual(viajeEnRuta(v, hoy), true);
    assert.strictEqual(textoEnRuta(v), 'PRZ 065 va en ruta (BOG-CAL, salió el 07/10/2026 y regresa el 09/10/2026)');
    assert.strictEqual(viajeEnRuta({ ...v, estado: 'Entregado' }, hoy), false);
    assert.strictEqual(viajeEnRuta({ ...v, llegadaReal: '2026-10-08T09:00' }, hoy), false);
    // Ya regresó (último día el 7): no.
    assert.strictEqual(viajeEnRuta({ ...v, retorno: 8 }, hoy), false);
    // Sale hoy sin marcar "Ya salí": todavía no va en ruta; si lo marcó, sí.
    assert.strictEqual(viajeEnRuta({ ...v, fecha: '2026-10-08', salida: 8 }, hoy), false);
    assert.strictEqual(viajeEnRuta({ ...v, fecha: '2026-10-08', salida: 8, salidaReal: '2026-10-08T06:00' }, hoy), true);
});
