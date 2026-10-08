const test = require('node:test');
const assert = require('node:assert');
const { queSeElimina, restaurarEn, venceEl, etiqueta } = require('../papelera');

const data = () => ({
    viajes: [{ id: 'PRZ 065-2026-10-08-BOG-CAL', p: 'PRZ 065', ruta: 'BOG-CAL', destino: 'Cali', fecha: '2026-10-08' }],
    vehiculos: [{ p: 'PRZ 065', tr: 'Makand' }],
    rutas: [{ cod: 'BOG-CAL', dest: 'Cali' }],
    conductores: [{ ced: '123', nom: 'Orlando Moya' }],
    novedades: [{ id: 'n-1', titulo: 'Llanta pinchada' }]
});

test('lee lo que se va a eliminar, antes de eliminarlo', () => {
    const d = data();
    const v = queSeElimina('POST', '/api/viajes/eliminar', { id: 'PRZ 065-2026-10-08-BOG-CAL' }, d);
    assert.deepStrictEqual([v.tipo, v.etiqueta], ['viaje', 'PRZ 065 · BOG-CAL → Cali (08/10/2026)']);
    assert.strictEqual(queSeElimina('POST', '/api/vehiculos/eliminar', { p: 'prz 065' }, d).clave, 'PRZ 065');
    assert.strictEqual(queSeElimina('DELETE', '/api/vehiculos/PRZ%20065', {}, d).tipo, 'vehiculo');
    assert.strictEqual(queSeElimina('POST', '/api/rutas/eliminar', { cod: 'bog-cal' }, d).etiqueta, 'BOG-CAL → Cali');
    assert.strictEqual(queSeElimina('POST', '/api/conductores/eliminar', { id: '123' }, d).etiqueta, 'Orlando Moya (CC 123)');
    assert.strictEqual(queSeElimina('POST', '/api/novedades/eliminar', { id: 'n-1' }, d).etiqueta, 'Llanta pinchada');
    const desp = queSeElimina('POST', '/api/despachos/eliminar', { id: 7 }, d, (id) => id === 7 ? { id: 7, placa: 'NOW 033', destino: 'Tunja', fecha: '2026-10-08', horaLlegada: '06:00' } : null);
    assert.strictEqual(desp.etiqueta, 'NOW 033 → Tunja (08/10/2026, llegó 06:00)');
    // No existe o no es una eliminación.
    assert.strictEqual(queSeElimina('POST', '/api/viajes/eliminar', { id: 'otro' }, d), null);
    assert.strictEqual(queSeElimina('POST', '/api/viajes', { id: 'PRZ 065-2026-10-08-BOG-CAL' }, d), null);
    // Es una copia: cambiar los datos después no cambia la papelera.
    d.viajes[0].destino = 'Otro';
    assert.strictEqual(v.datos.destino, 'Cali');
});

test('recuperar: vuelve a los datos, pero no pisa uno que se creó de nuevo', () => {
    const d = data();
    const item = queSeElimina('POST', '/api/viajes/eliminar', { id: 'PRZ 065-2026-10-08-BOG-CAL' }, d);
    d.viajes = [];
    assert.deepStrictEqual(restaurarEn(d, item), { ok: true, msg: 'Se recuperó: PRZ 065 · BOG-CAL → Cali (08/10/2026).' });
    assert.strictEqual(d.viajes.length, 1);
    const otra = restaurarEn(d, item);
    assert.strictEqual(otra.ok, false);
    assert.match(otra.msg, /Ya existe un viaje/);
    const ruta = queSeElimina('POST', '/api/rutas/eliminar', { cod: 'BOG-CAL' }, d);
    assert.match(restaurarEn(d, ruta).msg, /Ya existe una ruta/);
    assert.strictEqual(restaurarEn(d, { tipo: 'despacho' }).ok, false);
});

test('se borra de verdad a los 30 días', () => {
    assert.strictEqual(venceEl('2026-10-08T12:00:00.000Z'), '2026-11-07T12:00:00.000Z');
    assert.strictEqual(venceEl('mal'), null);
    assert.strictEqual(etiqueta('vehiculo', { p: 'lun 428', tr: 'Makand' }), 'LUN 428 · Makand');
});
