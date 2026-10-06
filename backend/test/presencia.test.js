const test = require('node:test');
const assert = require('node:assert');
const { crearPresencia, primerNombre } = require('../presencia');

test('primer nombre, no el correo', () => {
    assert.strictEqual(primerNombre('Carlos Bocanegra', 'carlos@makand.com'), 'Carlos');
    assert.strictEqual(primerNombre('  ana maría  ruiz'), 'Ana');
    assert.strictEqual(primerNombre('', 'aux.logistica@makand.com'), 'aux.logistica');
});

test('en línea: cada uno ve a los demás con su página y lo que hace', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'carlos@x.com', nombre: 'Carlos Bocanegra', pagina: 'Rutograma', accion: 'viendo el viaje BOG-CAL de PRZ 065' }, 1000);
    p.latido('b', { email: 'carla@x.com', nombre: 'Carla Díaz', pagina: 'Vehículos', accion: 'editando LUN 428', editando: true }, 4000);
    assert.deepStrictEqual(p.enLinea('carlos@x.com', 5000), [{ nombre: 'Carla', pagina: 'Vehículos', accion: 'editando LUN 428', editando: true, haceSeg: 1 }]);
    assert.deepStrictEqual(p.enLinea('nadie@x.com', 5000).map(x => x.nombre), ['Carla', 'Carlos']);
});

test('"desde" solo se reinicia si cambia lo que hace', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', accion: '' }, 0);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', accion: '' }, 8000);
    assert.strictEqual(p.enLinea('x', 10000)[0].haceSeg, 10);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Conductores', accion: '' }, 12000);
    assert.strictEqual(p.enLinea('x', 12000)[0].haceSeg, 0);
});

test('mismo viaje abierto: se ven entre ellos, no a sí mismos', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'carlos@x.com', nombre: 'Carlos', clave: 'viaje:1' }, 0);
    p.latido('b', { email: 'ana@x.com', nombre: 'Ana', clave: 'viaje:1', editando: true }, 0);
    p.latido('c', { email: 'luis@x.com', nombre: 'Luis', clave: 'viaje:2' }, 0);
    assert.deepStrictEqual(p.otros('viaje:1', 'carlos@x.com', 1), [{ nombre: 'Ana', editando: true }]);
    assert.deepStrictEqual(p.otros('viaje:1', 'ana@x.com', 1), [{ nombre: 'Carlos', editando: false }]);
    assert.deepStrictEqual(p.otros('', 'ana@x.com', 1), []);
});

test('la misma persona en dos pestañas cuenta una vez (la que edita)', () => {
    const p = crearPresencia(30000);
    p.latido('a1', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Dashboard', clave: 'viaje:1' }, 0);
    p.latido('a2', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', clave: 'viaje:1', editando: true }, 0);
    assert.deepStrictEqual(p.otros('viaje:1', 'otro@x.com', 1), [{ nombre: 'Ana', editando: true }]);
    assert.strictEqual(p.enLinea('otro@x.com', 1)[0].pagina, 'Rutograma');
});

test('al salir o dejar de avisar, desaparece', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana' }, 0);
    p.latido('b', { email: 'luis@x.com', nombre: 'Luis' }, 0);
    p.latido('a', { salir: true }, 1);
    assert.deepStrictEqual(p.enLinea('x@x.com', 2).map(x => x.nombre), ['Luis']);
    assert.deepStrictEqual(p.enLinea('x@x.com', 40000), []);
});
