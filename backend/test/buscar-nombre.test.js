const test = require('node:test');
const assert = require('node:assert/strict');
const { nombresParecidos, escritoIgual } = require('../buscar-nombre');

const LISTA = [
    { nombre: 'Moya Carrillo Orlando' },
    { nombre: 'Martínez Martínez Brayan Andres' },
    { nombre: 'Torres Huerfano Javier' },
    { nombre: 'Baloco Chamorro Javier Manuel' },
    { nombre: 'Guillen Gomez Alejandrino' }
];

test('encuentra el nombre aunque esté mal escrito o en otro orden', () => {
    assert.equal(nombresParecidos('orlando moya', LISTA)[0].nombre, 'Moya Carrillo Orlando');
    assert.equal(nombresParecidos('Orlado Moyya', LISTA)[0].nombre, 'Moya Carrillo Orlando');
    assert.equal(nombresParecidos('brayan martines', LISTA)[0].nombre, 'Martínez Martínez Brayan Andres');
    assert.equal(nombresParecidos('Alejandrino gillen', LISTA)[0].nombre, 'Guillen Gomez Alejandrino');
    // "Javier" solo: aparecen los dos Javier.
    const javier = nombresParecidos('javier', LISTA).map(x => x.nombre);
    assert.ok(javier.includes('Torres Huerfano Javier') && javier.includes('Baloco Chamorro Javier Manuel'));
    // Algo que no se parece a nadie: nada.
    assert.equal(nombresParecidos('Pedro Ramirez', LISTA).length, 0);
});

test('sabe si lo escrito es exactamente el nombre', () => {
    assert.equal(escritoIgual('orlando moya', 'Moya Carrillo Orlando'), true);
    assert.equal(escritoIgual('orlado moya', 'Moya Carrillo Orlando'), false);
    assert.equal(escritoIgual('Martinez Brayan', 'Martínez Martínez Brayan Andres'), true);
});
