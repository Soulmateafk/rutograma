const test = require('node:test');
const assert = require('node:assert');
const { horaReal, notaSinSenal } = require('../sin-senal');

const ahora = new Date('2026-10-13T15:00:00Z');

test('sin hora o con hora inválida se usa la del servidor', () => {
    assert.strictEqual(horaReal(undefined, ahora), null);
    assert.strictEqual(horaReal('', ahora), null);
    assert.strictEqual(horaReal('ayer', ahora), null);
});

test('una hora de hace un rato se acepta tal cual', () => {
    const r = horaReal('2026-10-13T12:30:00Z', ahora);
    assert.strictEqual(r.toISOString(), '2026-10-13T12:30:00.000Z');
});

test('no se aceptan horas del futuro ni de hace más de 3 días', () => {
    assert.strictEqual(horaReal('2026-10-13T16:00:00Z', ahora), null);
    assert.strictEqual(horaReal('2026-10-09T15:00:00Z', ahora), null);
});

test('un reloj apenas adelantado se toma como "ahora"', () => {
    assert.strictEqual(horaReal('2026-10-13T15:02:00Z', ahora).getTime(), ahora.getTime());
});

test('la nota solo aparece si se envió con atraso', () => {
    assert.strictEqual(notaSinSenal(null, ahora), '');
    assert.strictEqual(notaSinSenal(new Date('2026-10-13T14:59:30Z'), ahora), '');
    assert.match(notaSinSenal(new Date('2026-10-13T12:30:00Z'), ahora), /sin señal/);
});
