// ============================================================
// VALIDACIONES DE CUENTAS — copia de backend/validaciones.js para
// mostrar los requisitos mientras se escribe. El servidor vuelve a
// revisar todo; si cambias una regla, cámbiala en los dos archivos.
// ============================================================

export const DEPARTAMENTOS: string[] = ['Logística', 'Transporte', 'Recursos Humanos', 'Contabilidad', 'Conductor'];

export const REQUISITOS_CLAVE: Array<{ clave: string; texto: string; cumple: (c: string) => boolean }> = [
    { clave: 'largo', texto: 'Mínimo 8 caracteres', cumple: (c: string) => c.length >= 8 },
    { clave: 'mayuscula', texto: 'Una letra mayúscula', cumple: (c: string) => /\p{Lu}/u.test(c) },
    { clave: 'minuscula', texto: 'Una letra minúscula', cumple: (c: string) => /\p{Ll}/u.test(c) },
    { clave: 'numero', texto: 'Un número', cumple: (c: string) => /\d/.test(c) },
    { clave: 'especial', texto: 'Un carácter especial (ej. ! @ # $ % * . -)', cumple: (c: string) => /[^\p{L}\p{N}\s]/u.test(c) },
    { clave: 'espacios', texto: 'Sin espacios', cumple: (c: string) => c.length > 0 && !/\s/.test(c) },
    // bcrypt solo usa los primeros 72 bytes: más largo daría una falsa sensación de seguridad.
    { clave: 'maximo', texto: 'Máximo 64 caracteres', cumple: (c: string) => c.length <= 64 }
];

const sinTildes = (t: unknown): string => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Lo que le falta a la contraseña (lista vacía = es segura). Si se pasan el
 * correo o el nombre, la contraseña no puede contenerlos.
 */
export function faltasDeClave(clave: string, { email = '', nombre = '' }: { email?: string; nombre?: string } = {}): string[] {
    const c = String(clave || '');
    const faltas = REQUISITOS_CLAVE.filter(r => !r.cumple(c)).map(r => r.texto);
    const baja = sinTildes(c);
    const usuario = sinTildes(String(email).split('@')[0]).replace(/[^a-z0-9]/g, '');
    if (usuario.length >= 4 && baja.replace(/[^a-z0-9]/g, '').includes(usuario)) faltas.push('Que no contenga tu correo');
    const palabras = sinTildes(nombre).split(/[^a-z]+/).filter(p => p.length >= 4);
    if (palabras.some(p => baja.includes(p))) faltas.push('Que no contenga tu nombre');
    return faltas;
}

export function mensajeClave(faltas: string[]): string {
    return faltas.length ? `La contraseña no es segura. Le falta: ${faltas.join(', ').toLowerCase()}.` : '';
}

/** Nombre y apellido: solo letras (con tildes), espacios, punto, guion o apóstrofo. */
export function errorNombre(nombre: string): string {
    const n = String(nombre || '').trim().replace(/\s+/g, ' ');
    if (!n) return 'Escribe tu nombre completo.';
    if (!/^[\p{L}][\p{L} .'-]*$/u.test(n)) return 'El nombre solo puede tener letras y espacios.';
    if (n.split(' ').filter(p => /\p{L}{2,}/u.test(p)).length < 2) return 'Escribe nombre y apellido.';
    if (n.length < 5 || n.length > 80) return 'El nombre debe tener entre 5 y 80 caracteres.';
    return '';
}

export function errorEmail(email: string): string {
    const e = String(email || '').trim();
    if (!e) return 'Escribe tu correo.';
    if (e.length > 120) return 'El correo es demasiado largo.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e) || e.includes('..')) return 'El correo no es válido (ej. nombre@makand.com).';
    return '';
}

export function errorDepartamento(departamento: string): string {
    const d = sinTildes(String(departamento || '').trim());
    return DEPARTAMENTOS.some(x => sinTildes(x) === d) ? '' : 'Elige un departamento de la lista.';
}

/** Nombre limpio para guardar (espacios de más fuera). */
export const nombreLimpio = (n: string): string => String(n || '').trim().replace(/\s+/g, ' ');

// ============================================================
// CONDUCTORES Y VEHÍCULOS — solo se revisan los datos NUEVOS o que
// CAMBIAN (un dato viejo mal escrito no impide, por ejemplo, mandar el
// vehículo a mantenimiento). Las filas de cupo (ARSITRANS 1, POLAR 2...)
// no son placas reales y no se revisan.
// ============================================================

export const esPlacaCupo = (p: any): boolean => /^(ARSITRANS|POLAR)\s+\d+$/i.test(String(p || '').trim());

/** 'lun428' / 'LUN-428' -> 'LUN 428' (como están guardadas). Si no parece placa, la deja en mayúsculas. */
export function normalizarPlaca(p: any): string {
    const t = String(p || '').toUpperCase().trim().replace(/\s+/g, ' ');
    if (esPlacaCupo(t)) return t;
    const pegada = t.replace(/[^A-Z0-9]/g, '');
    const m = pegada.match(/^([A-Z]{3})(\d{3}|\d{2}[A-Z])$/);
    return m ? `${m[1]} ${m[2]}` : t;
}

export function errorPlaca(p: any): string {
    const t = String(p || '').trim();
    if (!t) return 'Escribe la placa.';
    if (esPlacaCupo(t)) return '';
    return /^[A-Z]{3} (\d{3}|\d{2}[A-Z])$/.test(normalizarPlaca(t))
        ? '' : 'La placa debe tener 3 letras y 3 números (ej. ABC 123), o 3 letras, 2 números y 1 letra si es moto.';
}

const soloDigitos = (t: any): string => String(t || '').replace(/\D/g, '');

export function errorCedula(c: any): string {
    const t = String(c || '').trim();
    if (!t) return 'Escribe la cédula.';
    if (!/^[\d.\s]+$/.test(t)) return 'La cédula solo puede tener números.';
    const d = soloDigitos(t);
    return d.length >= 6 && d.length <= 10 ? '' : 'La cédula debe tener entre 6 y 10 números.';
}

/** Teléfono opcional: celular de 10 números (o fijo de 7), con o sin +57. */
export function errorTelefono(t: any): string {
    const s = String(t || '').trim();
    if (!s) return '';
    if (!/^[\d\s()+-]+$/.test(s)) return 'El teléfono solo puede tener números.';
    let d = soloDigitos(s);
    if (d.length === 12 && d.startsWith('57')) d = d.slice(2);
    if (d.length === 10 && !d.startsWith('3') && !d.startsWith('60')) return 'El celular debe empezar por 3 (ej. 300 123 4567).';
    return d.length === 10 || d.length === 7 ? '' : 'El teléfono debe tener 10 números (celular) o 7 (fijo).';
}

/** Fecha opcional 'AAAA-MM-DD' que exista de verdad. */
export function errorFecha(f: any, nombre = 'La fecha'): string {
    const s = String(f || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return `${nombre} no es válida.`;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const existe = d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
    if (!existe) return `${nombre} no existe.`;
    return Number(m[1]) < 2000 || Number(m[1]) > 2100 ? `${nombre} tiene un año fuera de rango.` : '';
}

function errorNumero(valor: any, nombre: string, min: number, max: number): string {
    if (valor === undefined || valor === null || String(valor).trim() === '') return '';
    const n = Number(valor);
    return !Number.isFinite(n) || n < min || n > max ? `${nombre}: escribe un número entre ${min} y ${max}.` : '';
}

const VALORES_SIN_CONDUCTOR = ['', 'SIN ASIGNAR', 'SIN CONDUCTOR', 'ASIGNADO'];

/** ¿Cambió este dato respecto a lo guardado? (nuevo = siempre) */
function cambio(previo: any, nuevo: any, ...claves: string[]): boolean {
    const v = (o: any) => { for (const c of claves) { if (o && o[c] !== undefined && o[c] !== null && String(o[c]).trim() !== '') return String(o[c]).trim(); } return ''; };
    return !previo || v(previo) !== v(nuevo);
}

/**
 * Error del conductor que se va a guardar ('' = está bien).
 * vehiculos: la flota, para comprobar que la placa asignada exista.
 */
export function errorConductor(nuevo: any, previo: any, vehiculos: any[] = []): string {
    const nombre = nuevo.nom ?? nuevo.nombre ?? nuevo.n ?? '';
    if (cambio(previo, nuevo, 'nom', 'nombre', 'n')) {
        const e = errorNombre(nombre);
        if (e) return e.replace('tu nombre completo', 'el nombre completo del conductor');
    }
    if (!previo) { const e = errorCedula(nuevo.ced ?? nuevo.cedula ?? nuevo.cc); if (e) return e; }
    if (cambio(previo, nuevo, 'tel', 'telefono')) { const e = errorTelefono(nuevo.tel ?? nuevo.telefono); if (e) return e; }
    if (cambio(previo, nuevo, 'veh', 'p', 'placa')) {
        const placa = String(nuevo.veh ?? nuevo.p ?? nuevo.placa ?? '').trim();
        if (placa) {
            const e = errorPlaca(placa);
            if (e) return e;
            const existe = (vehiculos || []).some((v: any) => normalizarPlaca(v.p || v.placa) === normalizarPlaca(placa));
            if (!existe) return `No hay ningún vehículo con la placa ${normalizarPlaca(placa)}. Regístralo primero en Vehículos.`;
        }
    }
    if (cambio(previo, nuevo, 'licVence')) { const e = errorFecha(nuevo.licVence, 'El vencimiento de la licencia'); if (e) return e; }
    return '';
}

/** Error del vehículo que se va a guardar ('' = está bien). otros: el resto de la flota. */
export function errorVehiculo(nuevo: any, previo: any, otros: any[] = []): string {
    const placa = String(nuevo.p ?? nuevo.placa ?? nuevo.veh ?? '').trim();
    if (!previo) {
        const e = errorPlaca(placa);
        if (e) return e;
        const igual = (otros || []).find((v: any) => normalizarPlaca(v.p || v.placa) === normalizarPlaca(placa));
        if (igual) return `Ya existe un vehículo con la placa ${normalizarPlaca(placa)}.`;
    }
    const numeros: Array<[string, string, string, number, number]> = [['cajas', 'cap', 'Cajas máximas', 1, 5000], ['kg', 'kg', 'Peso máximo (kg)', 1, 60000], ['m3', 'm3', 'Volumen máximo (m3)', 1, 200]];
    for (const [a, b, nombre, min, max] of numeros) {
        if (cambio(previo, nuevo, a, b)) { const e = errorNumero(nuevo[a] ?? nuevo[b], nombre, min, max); if (e) return e; }
    }
    if (cambio(previo, nuevo, 'soatVence')) { const e = errorFecha(nuevo.soatVence, 'El vencimiento del SOAT'); if (e) return e; }
    if (cambio(previo, nuevo, 'tecnoVence')) { const e = errorFecha(nuevo.tecnoVence, 'El vencimiento de la tecnomecánica'); if (e) return e; }
    if (cambio(previo, nuevo, 'mantInicio') || cambio(previo, nuevo, 'mantFin')) {
        const e = errorFecha(nuevo.mantInicio, 'El inicio del mantenimiento') || errorFecha(nuevo.mantFin, 'El fin del mantenimiento');
        if (e) return e;
        if (nuevo.mantInicio && nuevo.mantFin && String(nuevo.mantFin) < String(nuevo.mantInicio)) return 'El fin del mantenimiento no puede ser antes del inicio.';
    }
    if (cambio(previo, nuevo, 'conductor', 'cond')) {
        const c = String(nuevo.conductor ?? nuevo.cond ?? '').trim();
        if (!VALORES_SIN_CONDUCTOR.includes(c.toUpperCase()) && !/^[\p{L}][\p{L} .'-]*$/u.test(c)) return 'El conductor solo puede tener letras y espacios.';
    }
    return '';
}
