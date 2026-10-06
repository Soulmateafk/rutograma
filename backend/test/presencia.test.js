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
    p.latido('a', { email: 'carlos@x.com', nombre: 'Carlos Bocanegra', dispositivo: 'Chrome en Windows', pagina: 'Rutograma', accion: 'viendo el viaje BOG-CAL de PRZ 065' }, 1000);
    p.latido('b', { email: 'carla@x.com', nombre: 'Carla Díaz', dispositivo: 'Edge en Windows', pagina: 'Vehículos', accion: 'editando LUN 428', editando: true }, 4000);
    assert.deepStrictEqual(p.enLinea('carlos@x.com', 'a', 5000), [{ nombre: 'Carla', esYo: false, dispositivo: 'Edge en Windows', pagina: 'Vehículos', accion: 'editando LUN 428', editando: true, oculta: false, haceSeg: 1 }]);
    assert.deepStrictEqual(p.enLinea('nadie@x.com', 'z', 5000).map(x => x.nombre), ['Carla', 'Carlos']);
});

test('la misma cuenta en otro equipo sale como "Tú"; la ventana que pregunta no', () => {
    const p = crearPresencia(30000);
    p.latido('pc', { email: 'jefa@x.com', nombre: 'Carla', dispositivo: 'Chrome en Windows', pagina: 'Rutograma' }, 0);
    p.latido('laptop', { email: 'jefa@x.com', nombre: 'Carla', dispositivo: 'Edge en Windows', pagina: 'Dashboard' }, 0);
    const desdeLaptop = p.enLinea('jefa@x.com', 'laptop', 1);
    assert.deepStrictEqual(desdeLaptop.map(x => [x.nombre, x.esYo, x.pagina, x.dispositivo]), [['Tú', true, 'Rutograma', 'Chrome en Windows']]);
    assert.deepStrictEqual(p.enLinea('jefa@x.com', 'pc', 1).map(x => x.pagina), ['Dashboard']);
});

test('"desde" solo se reinicia si cambia lo que hace', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', accion: '' }, 0);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', accion: '' }, 8000);
    assert.strictEqual(p.enLinea('x', 'z', 10000)[0].haceSeg, 10);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Conductores', accion: '' }, 12000);
    assert.strictEqual(p.enLinea('x', 'z', 12000)[0].haceSeg, 0);
});

test('mismo viaje abierto: se ven entre ellos, y la misma cuenta en otro equipo', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'carlos@x.com', nombre: 'Carlos', clave: 'viaje:1' }, 0);
    p.latido('b', { email: 'ana@x.com', nombre: 'Ana', clave: 'viaje:1', editando: true }, 0);
    p.latido('c', { email: 'luis@x.com', nombre: 'Luis', clave: 'viaje:2' }, 0);
    assert.deepStrictEqual(p.otros('viaje:1', 'carlos@x.com', 'a', 1), [{ nombre: 'Ana', editando: true, esYo: false }]);
    assert.deepStrictEqual(p.otros('viaje:1', 'ana@x.com', 'b', 1), [{ nombre: 'Carlos', editando: false, esYo: false }]);
    p.latido('a2', { email: 'carlos@x.com', nombre: 'Carlos', clave: 'viaje:1', editando: true }, 0);
    assert.deepStrictEqual(p.otros('viaje:1', 'carlos@x.com', 'a', 1), [{ nombre: 'Ana', editando: true, esYo: false }, { nombre: 'Tú', editando: true, esYo: true }]);
    assert.deepStrictEqual(p.otros('', 'ana@x.com', 'b', 1), []);
});

test('otra persona en dos pestañas cuenta una vez (la que edita)', () => {
    const p = crearPresencia(30000);
    p.latido('a1', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Dashboard', clave: 'viaje:1' }, 0);
    p.latido('a2', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', clave: 'viaje:1', editando: true }, 0);
    assert.deepStrictEqual(p.otros('viaje:1', 'otro@x.com', 'z', 1), [{ nombre: 'Ana', editando: true, esYo: false }]);
    assert.strictEqual(p.enLinea('otro@x.com', 'z', 1)[0].pagina, 'Rutograma');
});

test('al salir o dejar de avisar, desaparece', () => {
    const p = crearPresencia(30000);
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana' }, 0);
    p.latido('b', { email: 'luis@x.com', nombre: 'Luis' }, 0);
    p.latido('a', { salir: true }, 1);
    assert.deepStrictEqual(p.enLinea('x@x.com', 'z', 2).map(x => x.nombre), ['Luis']);
    assert.deepStrictEqual(p.enLinea('x@x.com', 'z', 40000), []);
});

test('una ventana minimizada sigue en la lista (y se marca)', () => {
    const p = crearPresencia();
    p.latido('a', { email: 'ana@x.com', nombre: 'Ana', pagina: 'Rutograma', oculta: true }, 0);
    const [ana] = p.enLinea('x@x.com', 'z', 60000);
    assert.strictEqual(ana.nombre, 'Ana');
    assert.strictEqual(ana.oculta, true);
    assert.deepStrictEqual(p.enLinea('x@x.com', 'z', 95000), []);
});
