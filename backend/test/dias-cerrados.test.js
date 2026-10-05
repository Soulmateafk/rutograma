const test = require('node:test');
const assert = require('node:assert');
const { finDeViaje, viajeCerrado, motivoBloqueoGuardar, motivoBloqueoEliminar } = require('../dias-cerrados');

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
    assert.match(motivoBloqueoGuardar(null, viaje(), HOY), /días que ya pasaron/);
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
