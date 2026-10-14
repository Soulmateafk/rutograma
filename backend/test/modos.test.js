const test = require('node:test');
const assert = require('node:assert');
const { modoDeCuenta, ponerModo, limpiarMapa } = require('../modos');

test('por defecto cada cuenta está en real', () => {
    assert.strictEqual(modoDeCuenta({}, 'aux@x.com'), 'real');
    assert.strictEqual(modoDeCuenta(null, 'aux@x.com'), 'real');
});

test('pasar a prueba solo afecta a esa cuenta', () => {
    const m = ponerModo({}, 'Aux@X.com', 'pruebas');
    assert.strictEqual(modoDeCuenta(m, 'aux@x.com'), 'pruebas');
    assert.strictEqual(modoDeCuenta(m, 'jefa@x.com'), 'real');
});

test('volver a real la quita del mapa', () => {
    const m = ponerModo(ponerModo({}, 'aux@x.com', 'pruebas'), 'aux@x.com', 'real');
    assert.deepStrictEqual(m, {});
});

test('rechaza modos inválidos o sin cuenta', () => {
    assert.throws(() => ponerModo({}, 'aux@x.com', 'otro'));
    assert.throws(() => ponerModo({}, '', 'pruebas'));
});

test('limpiarMapa descarta lo que no sirve', () => {
    assert.deepStrictEqual(limpiarMapa({ 'A@x.com': 'pruebas', 'b@x.com': 'real', c: 3 }), { 'a@x.com': 'pruebas' });
    assert.deepStrictEqual(limpiarMapa([1, 2]), {});
    assert.deepStrictEqual(limpiarMapa(null), {});
});
