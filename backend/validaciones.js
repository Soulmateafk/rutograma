// ============================================================
// VALIDACIONES DE CUENTAS — contraseña segura, nombre, correo y
// departamento. Se usan al registrarse, al restablecer una contraseña y
// al crear la cuenta compartida de conductores. La app tiene una copia
// de estas mismas reglas (mi-rutograma/src/app/services/validaciones.ts)
// para mostrarlas mientras se escribe; si cambias una, cambia la otra.
// ============================================================

const DEPARTAMENTOS = ['Logística', 'Transporte', 'Recursos Humanos', 'Contabilidad', 'Conductor'];

const REQUISITOS_CLAVE = [
    { clave: 'largo', texto: 'Mínimo 8 caracteres', cumple: (c) => c.length >= 8 },
    { clave: 'mayuscula', texto: 'Una letra mayúscula', cumple: (c) => /\p{Lu}/u.test(c) },
    { clave: 'minuscula', texto: 'Una letra minúscula', cumple: (c) => /\p{Ll}/u.test(c) },
    { clave: 'numero', texto: 'Un número', cumple: (c) => /\d/.test(c) },
    { clave: 'especial', texto: 'Un carácter especial (ej. ! @ # $ % * . -)', cumple: (c) => /[^\p{L}\p{N}\s]/u.test(c) },
    { clave: 'espacios', texto: 'Sin espacios', cumple: (c) => c.length > 0 && !/\s/.test(c) },
    // bcrypt solo usa los primeros 72 bytes: más largo daría una falsa sensación de seguridad.
    { clave: 'maximo', texto: 'Máximo 64 caracteres', cumple: (c) => c.length <= 64 }
];

const sinTildes = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Lo que le falta a la contraseña (lista vacía = es segura). Si se pasan el
 * correo o el nombre, la contraseña no puede contenerlos.
 */
function faltasDeClave(clave, { email = '', nombre = '' } = {}) {
    const c = String(clave || '');
    const faltas = REQUISITOS_CLAVE.filter(r => !r.cumple(c)).map(r => r.texto);
    const baja = sinTildes(c);
    const usuario = sinTildes(String(email).split('@')[0]).replace(/[^a-z0-9]/g, '');
    if (usuario.length >= 4 && baja.replace(/[^a-z0-9]/g, '').includes(usuario)) faltas.push('Que no contenga tu correo');
    const palabras = sinTildes(nombre).split(/[^a-z]+/).filter(p => p.length >= 4);
    if (palabras.some(p => baja.includes(p))) faltas.push('Que no contenga tu nombre');
    return faltas;
}

function mensajeClave(faltas) {
    return faltas.length ? `La contraseña no es segura. Le falta: ${faltas.join(', ').toLowerCase()}.` : '';
}

/** Nombre y apellido: solo letras (con tildes), espacios, punto, guion o apóstrofo. */
function errorNombre(nombre) {
    const n = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (!n) return 'Escribe tu nombre completo.';
    if (!/^[\p{L}][\p{L} .'-]*$/u.test(n)) return 'El nombre solo puede tener letras y espacios.';
    if (n.split(' ').filter(p => /\p{L}{2,}/u.test(p)).length < 2) return 'Escribe nombre y apellido.';
    if (n.length < 5 || n.length > 80) return 'El nombre debe tener entre 5 y 80 caracteres.';
    return '';
}

function errorEmail(email) {
    const e = String(email || '').trim();
    if (!e) return 'Escribe tu correo.';
    if (e.length > 120) return 'El correo es demasiado largo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e) || e.includes('..')) return 'El correo no es válido (ej. nombre@makand.com).';
    return '';
}

function errorDepartamento(departamento) {
    const d = sinTildes(String(departamento || '').trim());
    return DEPARTAMENTOS.some(x => sinTildes(x) === d) ? '' : 'Elige un departamento de la lista.';
}

/** Nombre limpio para guardar (espacios de más fuera). */
const nombreLimpio = (n) => String(n || '').trim().replace(/\s+/g, ' ');

module.exports = { DEPARTAMENTOS, REQUISITOS_CLAVE, faltasDeClave, mensajeClave, errorNombre, errorEmail, errorDepartamento, nombreLimpio };
