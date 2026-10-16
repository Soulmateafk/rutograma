// Pruebas del pronóstico de un mes (pronostico.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { armarPronostico } = require('../pronostico');

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
// Un viaje por cada lunes del mes (+ uno de POLAR los lunes) para el cliente A.
function mesDeLunes(anio, mes, extra = {}) {
    const out = [];
    const dias = new Date(anio, mes + 1, 0).getDate();
    for (let d = 1; d <= dias; d++) {
        if (new Date(anio, mes, d).getDay() !== 1) continue;
        const fecha = `${anio}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        out.push({ id: `p${mes}${d}`, p: 'NOW 031', tr: 'Makand', cliente: 'A', destino: 'Cali', fecha, salida: d, mes: MESES[mes], anio, cajas: 100, ...extra });
        out.push({ id: `t${mes}${d}`, p: 'POLAR 1', tr: 'Polar', cliente: 'A', destino: 'Cali', fecha, salida: d, mes: MESES[mes], anio, cajas: 100 });
    }
    return out;
}

test('pronostica por día de la semana: noviembre 2026 tiene 5 lunes', () => {
    const viajes = [...mesDeLunes(2026, 7), ...mesDeLunes(2026, 8), ...mesDeLunes(2026, 9),
        { id: 'c', p: 'NOW 031', estado: 'Cancelado', fecha: '2026-10-06', salida: 6, mes: 'Octubre', anio: 2026 }];
    const r = armarPronostico({ viajes }, { anio: 2026, mes: 10 });
    assert.equal(r.hayDatos, true);
    assert.deepEqual(r.base.map(b => b.mes), [9, 8, 7]);
    assert.equal(r.total, 10); // 5 lunes × 2 viajes
    const polar = r.terceros.find(t => t.nombre === 'Polar');
    assert.equal(polar.viajesMes, 5);
    assert.equal(polar.picoDia, 1);
    assert.equal(polar.diaMasCargado, 'Lunes');
    assert.equal(r.porCliente[0].nombre, 'A');
    assert.equal(r.porCliente[0].pronostico, 10);
    assert.equal(r.porDiaSemana.find(d => d.nombre === 'Lunes').dias, 5);
});

test('un festivo en lunes no cuenta como lunes', () => {
    const viajes = [...mesDeLunes(2026, 9)];
    const r = armarPronostico({ viajes, festivos: ['2026-11-02', '2026-11-16'] }, { anio: 2026, mes: 10 });
    assert.equal(r.total, 6); // 3 lunes normales; los festivos se toman como domingo (0 viajes)
    assert.equal(r.festivosMes, 2);
});

test('sin meses anteriores no inventa nada', () => {
    const r = armarPronostico({ viajes: mesDeLunes(2026, 10) }, { anio: 2026, mes: 10 });
    assert.equal(r.hayDatos, false);
    assert.equal(r.yaProgramados, 10);
});
