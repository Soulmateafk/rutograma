const test = require('node:test');
const assert = require('node:assert');
const { resumenSemana, textoWhatsApp, htmlCorreo, lunesDe, fechaDeTexto } = require('../cierre-semana');

const data = {
    vehiculos: [{ p: 'LUN 428', tr: 'Makand' }, { p: 'POLAR 2', tr: 'Polar' }],
    conductores: [{ nom: 'Torres Huerfano Javier', veh: 'LUN 428' }],
    viajes: [
        { id: 1, fecha: '2026-10-12', p: 'LUN 428', ruta: 'BOG-CAL-D1', cliente: 'D1', destino: 'Cali', tr: 'Makand', estado: 'Entregado', cajas: 500 },
        { id: 2, fecha: '2026-10-13', p: 'LUN 428', ruta: 'BOG-BAQ-ARA', cliente: 'Ara', destino: 'Barranquilla', tr: 'Makand', estado: 'Planificado', cajas: 300 },
        { id: 3, fecha: '2026-10-14', p: 'POLAR 2', ruta: 'BOG-CAL-D1', cliente: 'D1', destino: 'Cali', tr: 'Polar', estado: 'En ruta', tipo: 'extra', cajas: 200 },
        { id: 4, fecha: '2026-10-16', p: 'LUN 428', ruta: 'BOG-MED-EX', cliente: 'Exito', destino: 'Medellin', tr: 'Makand', estado: 'Planificado', cajas: 100 },
        { id: 5, fecha: '2026-10-15', p: 'LUN 428', ruta: 'BOG-MED-EX', cliente: 'Exito', estado: 'Cancelado', motivoCancelacion: 'Cliente canceló' },
        { id: 6, fecha: '2026-10-20', p: 'LUN 428', ruta: 'BOG-CAL-D1', cliente: 'D1', tr: 'Makand', estado: 'Planificado' },
        { id: 7, fecha: '2026-10-05', p: 'LUN 428', ruta: 'BOG-CAL-D1', cliente: 'D1', tr: 'Makand', estado: 'Entregado' }
    ],
    novedades: [{ tipo: 'Avería', titulo: 'Varado · LUN 428', fecha: '13/10/2026, 7:06:25 p. m.', resuelta: false }],
    quejas: [{ fecha: '2026-10-14' }], comparendos: [{ fecha: '2026-10-01', valor: 500000 }]
};

test('lunesDe y fechas de novedades', () => {
    assert.strictEqual(lunesDe('2026-10-16'), '2026-10-12');
    assert.strictEqual(lunesDe('2026-10-18'), '2026-10-12');
    assert.strictEqual(fechaDeTexto('13/10/2026, 7:06:25 p. m.'), '2026-10-13');
});

test('resumen de la semana: cumplido, cancelado, pendientes y próxima semana', () => {
    const r = resumenSemana(data, '2026-10-14', '2026-10-15');
    assert.strictEqual(r.desde, '2026-10-12');
    assert.strictEqual(r.hasta, '2026-10-18');
    assert.strictEqual(r.total, 4);
    assert.strictEqual(r.entregados, 1);
    assert.strictEqual(r.enRuta, 1);
    assert.strictEqual(r.cancelados, 1);
    assert.deepStrictEqual(r.motivosCancelacion, [{ nombre: 'Cliente canceló', n: 1 }]);
    // Hasta el 15: debían salir 1, 2 y 3; salieron 1 y 3 -> 67 %. El 2 quedó pendiente; el 4 aún no toca.
    assert.strictEqual(r.cumplimiento, 67);
    assert.strictEqual(r.totalPendientes, 1);
    assert.strictEqual(r.pendientes[0].id, 2);
    assert.strictEqual(r.pendientes[0].conductor, 'Torres Huerfano Javier');
    assert.strictEqual(r.extras, 1);
    assert.strictEqual(r.cajas, 1100);
    assert.strictEqual(r.novedades.length, 1);
    assert.strictEqual(r.quejas, 1);
    assert.strictEqual(r.comparendos, 0);
    assert.strictEqual(r.proxima.viajes, 1);
});

test('texto de WhatsApp y correo', () => {
    const r = resumenSemana(data, '2026-10-12', '2026-10-15');
    const t = textoWhatsApp(r);
    assert.match(t, /\*Cierre de semana · MAKAND\*/);
    assert.match(t, /\*4\* viajes · \*67%\* cumplido/);
    assert.match(t, /Quedaron 1 sin salir/);
    const h = htmlCorreo(r);
    assert.match(h, /Cierre de semana/);
    assert.match(h, /Cliente canceló/);
});
