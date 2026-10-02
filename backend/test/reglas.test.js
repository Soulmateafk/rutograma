// Pruebas de las reglas del negocio (reglas.js).
// Correr con:  npm test   (dentro de la carpeta backend)
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    sumarDiasFecha,
    rangosMantenimiento,
    diasOcupadoViaje,
    mantenimientoQueChoca,
    agregarSesionConTope
} = require('../reglas');

// ------------------------------------------------------------
// Mantenimiento vs viajes
// ------------------------------------------------------------
const mant17a19 = [{ inicio: '2026-09-17', fin: '2026-09-19' }];
const mantMes = [{ inicio: '2026-09-01', fin: '2026-09-30' }];

test('bloquea un viaje que sale antes y regresa dentro del mantenimiento (caso PRZ 064)', () => {
    assert.ok(mantenimientoQueChoca(mant17a19, '2026-09-16', 2));
});

test('bloquea un viaje que sale durante el mantenimiento', () => {
    assert.ok(mantenimientoQueChoca(mant17a19, '2026-09-18', 1));
    assert.ok(mantenimientoQueChoca(mantMes, '2026-09-17', 1));
});

test('permite salir el último día del mantenimiento', () => {
    assert.equal(mantenimientoQueChoca(mant17a19, '2026-09-19', 2), null);
    assert.equal(mantenimientoQueChoca(mantMes, '2026-09-30', 4), null);
});

test('permite un viaje que regresa justo el día en que empieza el mantenimiento', () => {
    assert.equal(mantenimientoQueChoca(mant17a19, '2026-09-15', 2), null);
});

test('bloquea un viaje del mes anterior que se mete en el mantenimiento', () => {
    assert.ok(mantenimientoQueChoca(mantMes, '2026-08-28', 5));
});

test('sin mantenimientos no bloquea nada', () => {
    assert.equal(mantenimientoQueChoca([], '2026-09-17', 3), null);
    assert.equal(mantenimientoQueChoca(mant17a19, '', 3), null);
});

test('rangosMantenimiento junta el activo y el historial (en texto o en lista)', () => {
    const v = {
        mantInicio: '2026-10-01', mantFin: '2026-10-03',
        historialMantenimiento: JSON.stringify([{ inicio: '2026-09-17', fin: '2026-09-19' }])
    };
    assert.deepEqual(rangosMantenimiento(v), [
        { inicio: '2026-10-01', fin: '2026-10-03' },
        { inicio: '2026-09-17', fin: '2026-09-19' }
    ]);
    assert.deepEqual(rangosMantenimiento({ historialMantenimiento: 'no es json' }), []);
    assert.deepEqual(rangosMantenimiento(null), []);
});

test('diasOcupadoViaje usa salida y retorno, y 1 día si no hay retorno', () => {
    assert.equal(diasOcupadoViaje({ salida: 16, retorno: 18 }), 2);
    assert.equal(diasOcupadoViaje({ dia: 3 }), 1);
    assert.equal(diasOcupadoViaje({ salida: 30, retorno: 34 }), 4);
});

test('sumarDiasFecha cruza meses y años', () => {
    assert.equal(sumarDiasFecha('2026-09-30', 1), '2026-10-01');
    assert.equal(sumarDiasFecha('2026-12-31', 1), '2027-01-01');
});

// ------------------------------------------------------------
// Tope de sesiones por cuenta
// ------------------------------------------------------------
const sesion = (id, email, dispositivoId, ultima) => ({ id, email, dispositivoId, creada: ultima, ultima });

test('no pasa de 5 sesiones y cierra la que lleva más tiempo sin usarse', () => {
    let lista = [];
    for (let i = 1; i <= 5; i++) {
        lista = agregarSesionConTope(lista, sesion('s' + i, 'a@x.com', 'd' + i, `2026-09-0${i}T00:00:00Z`), 5).sesiones;
    }
    // s1 es la más vieja, pero se usó hace poco: la menos usada pasa a ser s2
    lista.find(s => s.id === 's1').ultima = '2026-09-20T00:00:00Z';
    const r = agregarSesionConTope(lista, sesion('s6', 'a@x.com', 'd6', '2026-09-21T00:00:00Z'), 5);
    assert.equal(r.cerradasPorTope, 1);
    assert.equal(r.sesiones.length, 5);
    assert.ok(!r.sesiones.some(s => s.id === 's2'));
    assert.ok(r.sesiones.some(s => s.id === 's1'));
    assert.ok(r.sesiones.some(s => s.id === 's6'));
});

test('volver a entrar desde el mismo dispositivo no gasta cupo', () => {
    let lista = [];
    for (let i = 1; i <= 5; i++) {
        lista = agregarSesionConTope(lista, sesion('s' + i, 'a@x.com', 'd' + i, `2026-09-0${i}T00:00:00Z`), 5).sesiones;
    }
    const r = agregarSesionConTope(lista, sesion('s3b', 'a@x.com', 'd3', '2026-09-10T00:00:00Z'), 5);
    assert.equal(r.cerradasPorTope, 0);
    assert.equal(r.sesiones.length, 5);
    assert.ok(!r.sesiones.some(s => s.id === 's3'));
});

test('el tope es por cuenta: las sesiones de otras cuentas no cuentan', () => {
    let lista = [];
    for (let i = 1; i <= 5; i++) {
        lista = agregarSesionConTope(lista, sesion('b' + i, 'b@x.com', 'e' + i, `2026-09-0${i}T00:00:00Z`), 5).sesiones;
    }
    const r = agregarSesionConTope(lista, sesion('a1', 'a@x.com', 'd1', '2026-09-10T00:00:00Z'), 5);
    assert.equal(r.cerradasPorTope, 0);
    assert.equal(r.sesiones.length, 6);
});

// ------------------------------------------------------------
// Variedad de rutas en Generar Matriz
// ------------------------------------------------------------
const { compararParaVariedad, anotarDestino } = require('../reglas');
const ordenar = (candidatos, destino, historial) =>
    [...candidatos].sort((a, b) => compararParaVariedad(a, b, destino, historial)).map(c => c.placa);

test('no repite el mismo destino seguido si hay otro vehículo libre', () => {
    const historial = {};
    anotarDestino(historial, 'AAA', 'cali');
    const candidatos = [
        { placa: 'AAA', libreDesde: 1, viajes: 1 },   // libre primero, pero viene de Cali
        { placa: 'BBB', libreDesde: 5, viajes: 1 }
    ];
    assert.deepEqual(ordenar(candidatos, 'cali', historial), ['BBB', 'AAA']);
});

test('prefiere al que menos veces ha ido a ese destino en el mes', () => {
    const historial = {};
    anotarDestino(historial, 'AAA', 'cali');
    anotarDestino(historial, 'AAA', 'medellin');
    anotarDestino(historial, 'BBB', 'tunja');
    const candidatos = [
        { placa: 'AAA', libreDesde: 1, viajes: 2 },
        { placa: 'BBB', libreDesde: 9, viajes: 1 }
    ];
    assert.deepEqual(ordenar(candidatos, 'cali', historial), ['BBB', 'AAA']);
});

test('si empatan en variedad, manda el que quedó libre primero y luego el de menos viajes', () => {
    const candidatos = [
        { placa: 'AAA', libreDesde: 5, viajes: 1 },
        { placa: 'BBB', libreDesde: 2, viajes: 3 },
        { placa: 'CCC', libreDesde: 2, viajes: 1 }
    ];
    assert.deepEqual(ordenar(candidatos, 'cali', {}), ['CCC', 'BBB', 'AAA']);
});

test('un vehículo de rutina fija (LUN 428) no se castiga por repetir destino', () => {
    const historial = {};
    anotarDestino(historial, 'LUN 428', 'barranquilla');
    anotarDestino(historial, 'LUN 428', 'barranquilla');
    const candidatos = [
        { placa: 'LUN 428', libreDesde: 1, viajes: 2, restringido: true },
        { placa: 'BBB', libreDesde: 3, viajes: 1 }
    ];
    assert.deepEqual(ordenar(candidatos, 'barranquilla', historial), ['LUN 428', 'BBB']);
});

// ------------------------------------------------------------
// Mismo equipo por IP + navegador (dispositivoId distinto)
// ------------------------------------------------------------
const { colapsarSesionesDuplicadas } = require('../reglas');
const sesionEquipo = (id, dispositivoId, ip, dispositivo, ultima, email = 'a@x.com') =>
    ({ id, email, dispositivoId, ip, dispositivo, creada: ultima, ultima });

test('la misma laptop entrando por otra dirección no abre otra sesión', () => {
    let lista = [sesionEquipo('s1', 'idA', '192.168.100.10', 'Chrome en Windows', '2026-10-01T13:16:00Z')];
    const r = agregarSesionConTope(lista, sesionEquipo('s2', 'idB', '192.168.100.10', 'Chrome en Windows', '2026-10-01T23:43:00Z'), 5);
    assert.deepEqual(r.sesiones.map(s => s.id), ['s2']);
});

test('otro equipo u otro navegador sí cuentan como sesión aparte', () => {
    const lista = [sesionEquipo('s1', 'idA', '192.168.100.10', 'Chrome en Windows', '2026-10-01T13:16:00Z')];
    const otroEquipo = agregarSesionConTope(lista, sesionEquipo('s2', 'idB', '192.168.100.60', 'Chrome en Windows', '2026-10-01T14:00:00Z'), 5);
    assert.equal(otroEquipo.sesiones.length, 2);
    const otroNavegador = agregarSesionConTope(lista, sesionEquipo('s3', 'idC', '192.168.100.10', 'Edge en Windows', '2026-10-01T14:00:00Z'), 5);
    assert.equal(otroNavegador.sesiones.length, 2);
    const otraCuenta = agregarSesionConTope(lista, sesionEquipo('s4', 'idD', '192.168.100.10', 'Chrome en Windows', '2026-10-01T14:00:00Z', 'b@x.com'), 5);
    assert.equal(otraCuenta.sesiones.length, 2);
});

test('al arrancar se juntan los duplicados y queda la usada más reciente', () => {
    const lista = [
        sesionEquipo('actual', 'idZ', '192.168.100.60', 'Chrome en Windows', '2026-10-02T09:38:00Z'),
        sesionEquipo('lap1', 'id1', '192.168.100.10', 'Chrome en Windows', '2026-10-02T09:38:00Z'),
        sesionEquipo('lap2', 'id2', '192.168.100.10', 'Chrome en Windows', '2026-10-01T23:19:00Z'),
        sesionEquipo('lap3', 'id3', '192.168.100.10', 'Chrome en Windows', '2026-10-01T13:16:00Z'),
        sesionEquipo('lap4', 'id4', '192.168.100.10', 'Chrome en Windows', '2026-10-01T13:16:00Z')
    ];
    assert.deepEqual(colapsarSesionesDuplicadas(lista).map(s => s.id), ['actual', 'lap1']);
});
