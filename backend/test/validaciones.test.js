const test = require('node:test');
const assert = require('node:assert');
const { faltasDeClave, errorNombre, errorEmail, errorDepartamento } = require('../validaciones');

test('contraseña segura: cumple todo', () => {
    assert.deepStrictEqual(faltasDeClave('Rutas2026!'), []);
    assert.deepStrictEqual(faltasDeClave('Ñandú#2026x'), []);
});

test('contraseña: dice exactamente lo que falta', () => {
    assert.deepStrictEqual(faltasDeClave('secreta123'), ['Una letra mayúscula', 'Un carácter especial (ej. ! @ # $ % * . -)']);
    assert.ok(faltasDeClave('Ab1!').includes('Mínimo 8 caracteres'));
    assert.ok(faltasDeClave('Abcdefg!').includes('Un número'));
    assert.ok(faltasDeClave('ABCDEF1!').includes('Una letra minúscula'));
    assert.ok(faltasDeClave('Abc 123!x').includes('Sin espacios'));
    assert.ok(faltasDeClave('A1!' + 'a'.repeat(70)).includes('Máximo 64 caracteres'));
    assert.ok(faltasDeClave('').length >= 5);
});

test('contraseña: no puede contener el correo ni el nombre', () => {
    assert.ok(faltasDeClave('Orlando#2026', { email: 'orlando@makand.com' }).includes('Que no contenga tu correo'));
    assert.ok(faltasDeClave('Moya#2026xx', { nombre: 'Orlando Moya' }).includes('Que no contenga tu nombre'));
    assert.deepStrictEqual(faltasDeClave('Rutas#2026', { email: 'orlando@makand.com', nombre: 'Orlando Moya' }), []);
});

test('nombre, correo y departamento', () => {
    assert.strictEqual(errorNombre('Orlando Moya'), '');
    assert.strictEqual(errorNombre('José Ñúñez-Peña'), '');
    assert.ok(errorNombre('Juan'));
    assert.ok(errorNombre('Juan 123'));
    assert.ok(errorNombre('<script>'));
    assert.strictEqual(errorEmail('a.b@makand.com'), '');
    assert.ok(errorEmail('a@b'));
    assert.ok(errorEmail('a b@makand.com'));
    assert.ok(errorEmail('a@@makand.com'));
    assert.strictEqual(errorDepartamento('logistica'), '');
    assert.ok(errorDepartamento('Gerencia'));
});

const { normalizarPlaca, errorPlaca, errorCedula, errorTelefono, errorFecha, errorConductor, errorVehiculo } = require('../validaciones');

test('placas: se escriben como en la flota y se revisa el formato', () => {
    assert.strictEqual(normalizarPlaca('lun428'), 'LUN 428');
    assert.strictEqual(normalizarPlaca(' abc-12d '), 'ABC 12D');
    assert.strictEqual(normalizarPlaca('Polar 3'), 'POLAR 3');
    assert.strictEqual(errorPlaca('LUN 428'), '');
    assert.strictEqual(errorPlaca('ARSITRANS 1'), '');
    assert.ok(errorPlaca('AB 12'));
    assert.ok(errorPlaca(''));
});

test('cédula, teléfono y fechas', () => {
    assert.strictEqual(errorCedula('80452107'), '');
    assert.strictEqual(errorCedula('80.452.107'), '');
    assert.ok(errorCedula('12345'));
    assert.ok(errorCedula('8045A107'));
    assert.strictEqual(errorTelefono(''), '');
    assert.strictEqual(errorTelefono('321 944 8085'), '');
    assert.strictEqual(errorTelefono('+57 321 944 8085'), '');
    assert.strictEqual(errorTelefono('6012345678'), '');
    assert.ok(errorTelefono('12345'));
    assert.ok(errorTelefono('9219448085'));
    assert.strictEqual(errorFecha('2026-02-28'), '');
    assert.ok(errorFecha('2026-02-30'));
    assert.ok(errorFecha('30/02/2026'));
});

test('conductor: solo se revisa lo nuevo o lo que cambia', () => {
    const flota = [{ p: 'LUN 428' }];
    assert.strictEqual(errorConductor({ nom: 'Pedro Pérez', ced: '1234567', tel: '3001234567', veh: 'lun428' }, null, flota), '');
    assert.match(errorConductor({ nom: 'Pedro Pérez', ced: '1234567', veh: 'ZZZ 999' }, null, flota), /No hay ningún vehículo/);
    assert.match(errorConductor({ nom: 'P3dro', ced: '1234567' }, null, flota), /letras/);
    // Teléfono viejo mal escrito: si no lo cambian, no bloquea el guardado.
    const previo = { nom: 'Pedro Pérez', ced: '1234567', tel: '123' };
    assert.strictEqual(errorConductor({ ...previo, est: 'descanso' }, previo, flota), '');
    assert.match(errorConductor({ ...previo, tel: '999' }, previo, flota), /teléfono/);
});

test('vehículo: placa nueva, números, fechas y mantenimiento', () => {
    const flota = [{ p: 'LUN 428' }];
    assert.strictEqual(errorVehiculo({ p: 'ABC 123', cajas: 660, kg: 8000, m3: 32 }, null, flota), '');
    assert.match(errorVehiculo({ p: 'lun428' }, null, flota), /Ya existe/);
    assert.match(errorVehiculo({ p: 'ABC 123', cajas: 0 }, null, flota), /Cajas/);
    assert.match(errorVehiculo({ p: 'ABC 123', soatVence: '2026-13-01' }, null, flota), /SOAT/);
    const previo = { p: 'LUN 428', cajas: 660 };
    assert.match(errorVehiculo({ ...previo, mantInicio: '2026-10-10', mantFin: '2026-10-01' }, previo, []), /antes del inicio/);
    assert.strictEqual(errorVehiculo({ p: 'ARSITRANS 1', soatVence: 'mal' }, { p: 'ARSITRANS 1', soatVence: 'mal' }, []), '');
});
