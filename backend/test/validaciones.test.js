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
