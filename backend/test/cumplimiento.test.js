const test = require('node:test');
const assert = require('node:assert');
const { armarCumplimiento, horaDelViaje } = require('../cumplimiento');

// Horas locales -> ISO, como las guarda el servidor.
const iso = (fecha, hora) => new Date(`${fecha}T${hora}:00`).toISOString();
const AHORA = new Date('2026-10-05T23:00:00');

const data = {
    conductores: [{ nom: 'Javier Torres', veh: 'LUN 428' }],
    viajes: [
        // A tiempo (10 min tarde) y llegó en 6 h.
        { id: 1, p: 'LUN 428', fecha: '2026-10-01', hora: '08:00', ruta: 'BOG-CAL', cond: '', salidaReal: iso('2026-10-01', '08:10'), llegadaReal: iso('2026-10-01', '14:10') },
        // Tarde: 90 min.
        { id: 2, p: 'LUN 428', fecha: '2026-10-02', hora: '08:00', ruta: 'BOG-CAL', cond: 'Javier Torres', salidaReal: iso('2026-10-02', '09:30') },
        // Sin marcar.
        { id: 3, p: 'NOW 033', fecha: '2026-10-03', hora: '07:00', ruta: 'BOG-MED', cond: 'Pedro Pérez', tr: 'Makand' },
        // Marcado pero sin hora programada: cuenta como marcado, no para puntualidad.
        { id: 4, p: 'NOW 033', fecha: '2026-10-04', hora: '--:--', ruta: 'BOG-MED', cond: 'Pedro Pérez', salidaReal: iso('2026-10-04', '06:00') },
        // No cuentan: cancelado, futuro y de otro mes.
        { id: 5, p: 'LUN 428', fecha: '2026-10-03', hora: '08:00', estado: 'Cancelado' },
        { id: 6, p: 'LUN 428', fecha: '2026-10-20', hora: '08:00' },
        { id: 7, p: 'LUN 428', fecha: '2026-09-30', hora: '08:00', salidaReal: iso('2026-09-30', '08:00') }
    ]
};

test('totales del mes', () => {
    const c = armarCumplimiento(data, { anio: 2026, mes: 9 }, AHORA);
    assert.strictEqual(c.total.viajes, 4);
    assert.strictEqual(c.total.marcados, 3);
    assert.strictEqual(c.total.pctMarcados, 75);
    assert.strictEqual(c.total.aTiempo, 1);
    assert.strictEqual(c.total.tarde, 1);
    assert.strictEqual(c.total.pctATiempo, 50);
    assert.strictEqual(c.total.retrasoPromedioMin, 50);
    assert.strictEqual(c.total.duracionPromedioHoras, 6);
});

test('por conductor (sin conductor anotado = el titular de la placa) y lista de tardes', () => {
    const c = armarCumplimiento(data, { anio: 2026, mes: 9 }, AHORA);
    const javier = c.porConductor.find(x => x.nombre === 'Javier Torres');
    assert.deepStrictEqual([javier.viajes, javier.marcados, javier.aTiempo, javier.tarde], [2, 2, 1, 1]);
    const pedro = c.porConductor.find(x => x.nombre === 'Pedro Pérez');
    assert.deepStrictEqual([pedro.viajes, pedro.marcados, pedro.pctATiempo], [2, 1, null]);
    assert.deepStrictEqual(c.masTarde.map(t => [t.id, t.retrasoMin]), [[2, 90]]);
    assert.strictEqual(c.porRuta.find(r => r.nombre === 'BOG-CAL').pctATiempo, 50);
});

test('sin hora en el viaje se usa la de su ruta para ese día', () => {
    const rutas = [{ cod: 'BOG-CAL', dias: JSON.stringify({ jue: { checked: true, hora: '13:00' }, lun: { checked: true, hora: '14:00' } }) }];
    assert.strictEqual(horaDelViaje({ ruta: 'bog-cal', fecha: '2026-10-01' }, rutas), '13:00'); // jueves
    assert.strictEqual(horaDelViaje({ ruta: 'BOG-CAL', fecha: '2026-10-05' }, rutas), '14:00'); // lunes
    assert.strictEqual(horaDelViaje({ ruta: 'BOG-CAL', fecha: '2026-10-05', hora: '06:30' }, rutas), '06:30');
    assert.strictEqual(horaDelViaje({ ruta: 'OTRA', fecha: '2026-10-05' }, rutas), '');
    const c = armarCumplimiento({ rutas, viajes: [{ id: 1, p: 'A', ruta: 'BOG-CAL', fecha: '2026-10-05', cond: 'X Y', salidaReal: iso('2026-10-05', '15:00') }] }, { anio: 2026, mes: 9 }, AHORA);
    assert.deepStrictEqual([c.total.tarde, c.total.retrasoPromedioMin], [1, 60]);
});
