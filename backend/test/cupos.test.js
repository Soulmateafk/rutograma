// Pruebas del reacomodo de cupos de terceros (cupos.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { planReacomodoCupos } = require('../cupos');

const v = (id, placa, fecha, extra = {}) => {
    const dia = Number(fecha.slice(8));
    return { id, p: placa, placa, tr: 'Arsitrans', fecha, dia, salida: dia, retorno: dia + 1, estado: 'Planificado', ...extra };
};

test('compacta cupos: cada día usa ARSITRANS 1..n y deja quietos los que ya están bien', () => {
    const viajes = [
        v('a', 'ARSITRANS 1', '2026-10-01'),
        v('b', 'ARSITRANS 4', '2026-10-02'),                 // día con 1 viaje -> pasa al 1
        v('c', 'ARSITRANS 2', '2026-10-03'),                 // se queda (2 viajes ese día)
        v('d', 'ARSITRANS 6', '2026-10-03'),                 // -> 1
        v('e', 'ARSITRANS 1', '2026-10-05', { retorno: 9 }), // mal retorno (como camión propio) -> 6
        v('f', 'ARSITRANS 3', '2026-10-06', { estado: 'Cancelado' }), // cancelado: no se toca
        v('g', 'LIK 440', '2026-10-06'),                     // placa real escrita a mano: no se toca
        v('h', 'POLAR 1', '2026-10-06', { tr: 'Polar' }),    // otra transportadora
        v('i', 'ARSITRANS 5', '2026-09-30'),                 // otro mes
        { id: 'm', p: 'NOW 031', tr: 'Makand', fecha: '2026-10-02', salida: 2, retorno: 5 }
    ];
    const vehiculos = ['ARSITRANS 1', 'ARSITRANS 2', 'ARSITRANS 4', 'ARSITRANS 5', 'ARSITRANS 6', 'LIK 440', 'POLAR 3'].map(p => ({ p }));
    const r = planReacomodoCupos(viajes, vehiculos, { tr: 'Arsitrans', anio: 2026, mes: 9 });

    assert.equal(r.viajesDelMes, 5);
    assert.equal(r.cuposAntes, 4);
    assert.equal(r.cuposDespues, 2);
    const porId = Object.fromEntries(r.cambios.map(c => [c.id, c]));
    assert.deepEqual(Object.keys(porId).sort(), ['b', 'd', 'e']);
    assert.equal(porId.b.a, 'ARSITRANS 1');
    assert.equal(porId.d.a, 'ARSITRANS 1');
    assert.equal(porId.e.a, 'ARSITRANS 1');
    assert.equal(porId.e.retorno, 6);
    // 5 sigue (tiene un viaje en septiembre); 4 y 6 quedan vacías. Placas
    // reales y otras transportadoras no se tocan.
    assert.deepEqual(r.vehiculosSobrantes.sort(), ['ARSITRANS 4', 'ARSITRANS 6']);
});

test('dos viajes en el mismo cupo el mismo día se separan', () => {
    const viajes = [v('a', 'ARSITRANS 1', '2026-10-01'), v('b', 'ARSITRANS 1', '2026-10-01')];
    const r = planReacomodoCupos(viajes, [], { tr: 'Arsitrans', anio: 2026, mes: 9 });
    assert.equal(r.cambios.length, 1);
    assert.equal(r.cambios[0].a, 'ARSITRANS 2');
});
