const test = require('node:test');
const assert = require('node:assert');
const { lunesDe, textoSemana, semanaAfectada, describirCambio, cambiosDelPlan } = require('../semana-bloqueada');

const bloqueadas = [{ lunes: '2026-10-12', por: 'jefa@x.com' }];
const v = { id: 1, p: 'PRZ 065', fecha: '2026-10-14', salida: 14, retorno: 16, ruta: 'BOG-CAL', cond: 'Orlando', cliente: 'D1', cajas: 600, hora: '06:00', estado: 'Programado' };

test('semana: lunes y texto', () => {
    assert.strictEqual(lunesDe('2026-10-14'), '2026-10-12');
    assert.strictEqual(lunesDe('2026-10-18'), '2026-10-12');   // domingo
    assert.strictEqual(lunesDe('2026-10-19'), '2026-10-19');
    assert.strictEqual(lunesDe('nada'), '');
    assert.strictEqual(textoSemana('2026-10-12'), '12/10 al 18/10');
});

test('en semana cerrada, cambiar el plan pide motivo; lo que pasó después no', () => {
    assert.strictEqual(semanaAfectada(v, { ...v, p: 'NOW 033' }, bloqueadas), '2026-10-12');
    assert.strictEqual(semanaAfectada(v, { ...v, cajas: 500 }, bloqueadas), '2026-10-12');
    assert.strictEqual(semanaAfectada(v, { ...v, estado: 'Cancelado' }, bloqueadas), '2026-10-12');
    // Entregado, observaciones, placa real: no.
    assert.strictEqual(semanaAfectada(v, { ...v, estado: 'Entregado', obs: 'ok', placaReal: 'X' }, bloqueadas), '');
    // Llenar un dato vacío (el formulario pone conductor y hora): no; borrarlo sí.
    const sinCond = { ...v, cond: null, hora: null };
    assert.strictEqual(semanaAfectada(sinCond, { ...sinCond, cond: 'Pedro', hora: '13:30' }, bloqueadas), '');
    assert.strictEqual(semanaAfectada(v, { ...v, cond: '' }, bloqueadas), '2026-10-12');
    // Mismo valor escrito distinto: no cuenta como cambio.
    assert.strictEqual(semanaAfectada(v, { ...v, p: 'prz 065 ', cajas: '600' }, bloqueadas), '');
    // Sacarlo de la semana cerrada o meterlo en ella.
    assert.strictEqual(semanaAfectada(v, { ...v, fecha: '2026-10-20', salida: 20, retorno: 22 }, bloqueadas), '2026-10-12');
    const otra = { ...v, fecha: '2026-10-21', salida: 21, retorno: 23 };
    assert.strictEqual(semanaAfectada(otra, { ...otra, fecha: '2026-10-13', salida: 13, retorno: 15 }, bloqueadas), '2026-10-12');
    // Nuevo y eliminar.
    assert.strictEqual(semanaAfectada(null, v, bloqueadas), '2026-10-12');
    assert.strictEqual(semanaAfectada(v, null, bloqueadas, 'eliminar'), '2026-10-12');
    // Semana abierta, o ninguna bloqueada.
    assert.strictEqual(semanaAfectada(otra, { ...otra, p: 'NOW 033' }, bloqueadas), '');
    assert.strictEqual(semanaAfectada(v, { ...v, p: 'NOW 033' }, []), '');
});

test('descripción del cambio', () => {
    assert.strictEqual(describirCambio(v, { ...v, p: 'NOW 033', cond: 'Pedro' }, 'guardar'), 'Cambió vehículo, conductor de NOW 033 · BOG-CAL (14/10)');
    assert.strictEqual(describirCambio(v, { ...v, estado: 'Cancelado' }, 'guardar'), 'Canceló PRZ 065 · BOG-CAL (14/10)');
    assert.strictEqual(describirCambio(null, v, 'guardar'), 'Agregó PRZ 065 · BOG-CAL (14/10)');
    assert.strictEqual(describirCambio(v, null, 'eliminar'), 'Eliminó PRZ 065 · BOG-CAL (14/10)');
    assert.deepStrictEqual(cambiosDelPlan(v, { ...v, salida: 15, dia: 15 }), ['salida']);
});
