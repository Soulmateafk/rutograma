const test = require('node:test');
const assert = require('node:assert');
const { compararConVisto, armarVisto } = require('../avisos-conductor');

const HOY = '2026-10-05';
const v1 = { id: 'a', fecha: '2026-10-06', hora: '14:00', placa: 'LUN 428', ruta: 'BOG-CAL', destino: 'Cali', estado: 'Planificado' };
const v2 = { id: 'b', fecha: '2026-10-08', hora: '13:00', placa: 'LUN 428', ruta: 'BOG-MED', destino: 'Medellín', estado: 'Planificado' };

test('la primera vez no se marca nada', () => {
    const r = compararConVisto([v1, v2], null, HOY);
    assert.strictEqual(r.hayAvisos, false);
    assert.ok(r.viajes.every(v => v.aviso === null));
});

test('sin cambios desde "Entendido": nada', () => {
    const r = compararConVisto([v1, v2], armarVisto([v1, v2]), HOY);
    assert.strictEqual(r.hayAvisos, false);
});

test('nuevo, cambio de hora, cancelado y quitado', () => {
    const visto = armarVisto([v1, v2, { id: 'c', fecha: '2026-10-09', placa: 'LUN 428', ruta: 'BOG-IBA', destino: 'Ibagué' }, { id: 'viejo', fecha: '2026-10-01', placa: 'LUN 428' }]);
    const nuevo = { id: 'd', fecha: '2026-10-10', hora: '07:00', placa: 'LUN 428', ruta: 'BOG-PAS', destino: 'Pasto' };
    const r = compararConVisto([{ ...v1, hora: '15:00' }, { ...v2, estado: 'Cancelado' }, nuevo], visto, HOY);
    assert.strictEqual(r.hayAvisos, true);
    assert.deepStrictEqual(r.viajes[0].aviso, { tipo: 'cambio', cambios: [{ campo: 'Hora', de: '14:00', a: '15:00' }] });
    assert.strictEqual(r.viajes[1].aviso.tipo, 'cancelado');
    assert.strictEqual(r.viajes[2].aviso.tipo, 'nuevo');
    // El que ya pasó y desapareció de la lista no se avisa.
    assert.deepStrictEqual(r.quitados.map(q => q.id), ['c']);
});

test('una nota nueva o cambiada se avisa', () => {
    const visto = armarVisto([v1]);
    const r = compararConVisto([{ ...v1, nota: 'Llamar antes' }], visto, HOY);
    assert.deepStrictEqual(r.viajes[0].aviso.cambios, [{ campo: 'Nota', de: '—', a: 'Llamar antes' }]);
});
