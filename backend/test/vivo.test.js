const test = require('node:test');
const assert = require('node:assert');
const { crearVivo } = require('../vivo');

const resFalsa = () => { const r = { escrito: [], write(t) { r.escrito.push(t); }, end() {} }; return r; };
const eventos = (r) => r.escrito.filter(t => t.startsWith('data:')).map(t => JSON.parse(t.slice(5)));

test('el cursor llega a los demás (no a la misma persona) y con su color', () => {
    const v = crearVivo();
    const ana = resFalsa(), beto = resFalsa(), ana2 = resFalsa();
    v.conectar('a1', { email: 'ana@x.com', nombre: 'Ana', color: '#db2777' }, ana);
    v.conectar('a2', { email: 'ana@x.com', nombre: 'Ana' }, ana2);
    v.conectar('b', { email: 'beto@x.com', nombre: 'Beto' }, beto);
    v.cursor('a1', { pagina: 'Rutograma', placa: 'LUN 428', dia: 15, fx: 0.5, fy: 2 });
    const llego = eventos(beto).filter(e => e.tipo === 'cursor');
    assert.strictEqual(llego.length, 1);
    assert.deepStrictEqual([llego[0].nombre, llego[0].color, llego[0].placa, llego[0].dia, llego[0].fy], ['Ana', '#db2777', 'LUN 428', 15, 1]);
    assert.strictEqual(eventos(ana2).filter(e => e.tipo === 'cursor').length, 0);
});

test('modo prueba y modo real no se mezclan; al salir se avisa', () => {
    const v = crearVivo();
    const real = resFalsa(), prueba = resFalsa();
    v.conectar('r', { email: 'r@x.com', nombre: 'R', modo: 'real' }, real);
    v.conectar('p', { email: 'p@x.com', nombre: 'P', modo: 'pruebas' }, prueba);
    v.conectar('a', { email: 'a@x.com', nombre: 'A', modo: 'real' }, resFalsa());
    v.cursor('a', { placa: 'LUN 428', dia: 1 });
    assert.strictEqual(eventos(prueba).filter(e => e.tipo === 'cursor').length, 0);
    v.desconectar('a');
    assert.ok(eventos(real).some(e => e.tipo === 'cursor' && e.salir));
});

test('un cambio avisa a los demás con el nombre y color de quien lo hizo', () => {
    const v = crearVivo();
    const ana = resFalsa(), beto = resFalsa();
    v.conectar('a', { email: 'ana@x.com', nombre: 'Ana', color: '#16a34a' }, ana);
    v.conectar('b', { email: 'beto@x.com', nombre: 'Beto' }, beto);
    v.cambio('ana@x.com', 'real');
    const c = eventos(beto).find(e => e.tipo === 'cambio');
    assert.deepStrictEqual([c.nombre, c.color], ['Ana', '#16a34a']);
    assert.strictEqual(eventos(ana).filter(e => e.tipo === 'cambio').length, 0);
});
