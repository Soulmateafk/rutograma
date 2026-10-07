const test = require('node:test');
const assert = require('node:assert');
const { normalizarHora, minutosDeCargue, textoMinutos, rangoPeriodo, validarDespacho, resumenDespachos, filasExcel, nombreArchivo } = require('../despachos');

test('horas: se aceptan formas comunes y se rechaza lo que no es hora', () => {
    assert.strictEqual(normalizarHora('7:05'), '07:05');
    assert.strictEqual(normalizarHora('0705'), '07:05');
    assert.strictEqual(normalizarHora('14.30'), '14:30');
    assert.strictEqual(normalizarHora('24:00'), '');
    assert.strictEqual(normalizarHora('abc'), '');
    assert.strictEqual(normalizarHora(''), '');
});

test('tiempo de cargue, también pasando la medianoche', () => {
    assert.strictEqual(minutosDeCargue('06:10', '07:45'), 95);
    assert.strictEqual(minutosDeCargue('23:00', '01:30'), 150);
    assert.strictEqual(minutosDeCargue('06:10', ''), null);
    assert.strictEqual(textoMinutos(95), '1 h 35 min');
    assert.strictEqual(textoMinutos(40), '40 min');
    assert.strictEqual(textoMinutos(120), '2 h');
});

test('periodos: día, semana de lunes a domingo y mes', () => {
    assert.deepStrictEqual(rangoPeriodo('dia', '2026-10-07'), { desde: '2026-10-07', hasta: '2026-10-07' });
    // 7 de octubre de 2026 es miércoles.
    assert.deepStrictEqual(rangoPeriodo('semana', '2026-10-07'), { desde: '2026-10-05', hasta: '2026-10-11' });
    assert.deepStrictEqual(rangoPeriodo('semana', '2026-10-11'), { desde: '2026-10-05', hasta: '2026-10-11' });
    assert.deepStrictEqual(rangoPeriodo('mes', '2026-02-15'), { desde: '2026-02-01', hasta: '2026-02-28' });
    assert.strictEqual(rangoPeriodo('mes', 'ayer'), null);
    assert.strictEqual(nombreArchivo('mes', rangoPeriodo('mes', '2026-10-07')), 'Despachos_mes_2026-10.xlsx');
});

test('formulario: obligatorios y fin de cargue opcional', () => {
    const { errores } = validarDespacho({});
    assert.deepStrictEqual(errores, ['la fecha', 'el vehículo', 'a qué lugar se dirige', 'la hora de llegada']);
    const ok = validarDespacho({ fecha: '2026-10-07', placa: ' prz 065 ', destino: 'Cali', horaLlegada: '6:10', viajeId: 12 });
    assert.deepStrictEqual(ok.errores, []);
    assert.strictEqual(ok.registro.placa, 'PRZ 065');
    assert.strictEqual(ok.registro.horaLlegada, '06:10');
    assert.strictEqual(ok.registro.horaFinCargue, '');
    assert.strictEqual(ok.registro.viajeId, '12');
    assert.deepStrictEqual(validarDespacho({ fecha: '2026-10-07', placa: 'X', destino: 'Cali', horaLlegada: '06:10', horaFinCargue: '99' }).errores,
        ['una hora válida de fin de cargue (ej. 14:30)']);
});

test('resumen y Excel', () => {
    const regs = [
        { fecha: '2026-10-07', placa: 'LUN 428', destino: 'Cali', horaLlegada: '08:00', horaFinCargue: '09:00', creadoPor: 'despachos@x.com' },
        { fecha: '2026-10-07', placa: 'PRZ 065', destino: 'Medellín', horaLlegada: '06:00', horaFinCargue: '08:00' },
        { fecha: '2026-10-07', placa: 'NOW 033', destino: 'Tunja', horaLlegada: '10:00', horaFinCargue: '' }
    ];
    assert.deepStrictEqual(resumenDespachos(regs), { total: 3, enCargue: 1, terminados: 2, promedioMin: 90, maximoMin: 120 });
    const filas = filasExcel(regs);
    assert.deepStrictEqual(filas.map(f => f['Vehículo']), ['PRZ 065', 'LUN 428', 'NOW 033']);
    assert.strictEqual(filas[0]['Día'], 'Miércoles');
    assert.strictEqual(filas[0]['Tiempo de cargue'], '2 h');
    assert.strictEqual(filas[2]['Terminó de cargar'], 'Cargando');
});
