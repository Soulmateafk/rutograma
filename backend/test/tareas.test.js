const test = require('node:test');
const assert = require('node:assert');
const { validarTarea, nuevaTarea, puedeTocar, ordenar } = require('../tareas');

test('validar: título, a quién y fecha', () => {
    assert.ok(validarTarea({ titulo: '', para: 'a@x.com' }).error);
    assert.ok(validarTarea({ titulo: 'Renovar SOAT', para: '' }).error);
    assert.ok(validarTarea({ titulo: 'Renovar SOAT', para: 'a@x.com', vence: '13/10' }).error);
    const { tarea } = validarTarea({ titulo: ' Renovar SOAT ', para: 'A@X.com', vence: '2026-10-16', prioridad: 'alta', sobre: { tipo: 'vehiculo', valor: 'LUN 428' } });
    assert.deepStrictEqual(tarea, { titulo: 'Renovar SOAT', detalle: '', para: 'a@x.com', vence: '2026-10-16', prioridad: 'alta', sobre: { tipo: 'vehiculo', valor: 'LUN 428' } });
});

test('quién puede tocarla', () => {
    const t = nuevaTarea({ titulo: 'x', para: 'b@x.com' }, 'a@x.com');
    assert.ok(puedeTocar(t, 'a@x.com', false));
    assert.ok(puedeTocar(t, 'b@x.com', false));
    assert.ok(!puedeTocar(t, 'c@x.com', false));
    assert.ok(puedeTocar(t, 'c@x.com', true));
});

test('orden: vencidas, alta, por fecha y hechas al final', () => {
    const l = [
        { id: 'hecha', hecha: true, vence: '2026-10-01' },
        { id: 'normal', hecha: false, vence: '2026-10-20', prioridad: 'normal' },
        { id: 'alta', hecha: false, vence: '2026-10-30', prioridad: 'alta' },
        { id: 'vencida', hecha: false, vence: '2026-10-10', prioridad: 'normal' }
    ];
    assert.deepStrictEqual(ordenar(l, '2026-10-13').map(t => t.id), ['vencida', 'alta', 'normal', 'hecha']);
});
