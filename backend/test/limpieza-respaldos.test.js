const test = require('node:test');
const assert = require('node:assert');
const { respaldosParaBorrar, esAntesDeAccion } = require('../limpieza-respaldos');

const AHORA = Date.parse('2026-10-06T12:00:00Z');
const MIN = 60000, HORA = 60 * MIN, DIA = 24 * HORA;
const r = (msAtras, etiqueta = 'viajes') => ({ nombre: `rutograma_${new Date(AHORA - msAtras).toISOString().replace(/[:.]/g, '-')}_${etiqueta}.db`, ms: AHORA - msAtras });

test('reconoce los respaldos "antes de" una acción', () => {
    assert.ok(esAntesDeAccion('rutograma_2026-10-01T17-48-27-168Z_antes-generar-matriz.db'));
    assert.ok(!esAntesDeAccion('rutograma_2026-10-01T17-48-27-168Z_configuracion-generar-matriz.db'));
});

test('pocos respaldos: no se borra nada', () => {
    const lista = Array.from({ length: 10 }, (_, i) => r(i * MIN));
    assert.deepStrictEqual(respaldosParaBorrar(lista, AHORA), []);
});

test('300 guardados en una mañana: quedan 30 recientes + uno por hora', () => {
    // 300 respaldos, uno por minuto durante 5 horas.
    const lista = Array.from({ length: 300 }, (_, i) => r(i * MIN));
    const borrar = new Set(respaldosParaBorrar(lista, AHORA));
    const quedan = lista.filter(a => !borrar.has(a.nombre));
    // 30 recientes + el más reciente de cada una de las horas restantes.
    assert.ok(quedan.length >= 30 && quedan.length <= 36, `quedan ${quedan.length}`);
    const horaMasVieja = new Date(AHORA - 299 * MIN).toISOString().slice(0, 13);
    assert.ok(quedan.some(a => new Date(a.ms).toISOString().slice(0, 13) === horaMasVieja), 'queda uno de la hora más vieja');
});

test('respaldos viejos: uno por día hasta 60 días, nada más viejo', () => {
    const lista = [];
    for (let d = 4; d <= 90; d++) for (let h = 0; h < 5; h++) lista.push(r(d * DIA + h * HORA));
    const borrar = new Set(respaldosParaBorrar(lista, AHORA));
    const quedan = lista.filter(a => !borrar.has(a.nombre));
    // 30 más recientes + 1 por día del resto (hasta el día 60).
    assert.ok(quedan.every(a => AHORA - a.ms <= 60 * DIA + DIA));
    const dias = new Set(quedan.map(a => new Date(a.ms).toISOString().slice(0, 10)));
    assert.ok(dias.size >= 56, `días con respaldo: ${dias.size}`);
});

test('"antes de" una acción: se guardan aparte los 20 más recientes', () => {
    const lista = Array.from({ length: 40 }, (_, i) => r(i * HORA, 'antes-generar-matriz'));
    const quedan = lista.length - respaldosParaBorrar(lista, AHORA).length;
    assert.strictEqual(quedan, 20);
});
