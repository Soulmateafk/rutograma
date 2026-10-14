// ============================================================
// MODO REAL / PRUEBA POR PERSONA.
// Antes el modo era uno solo para todo el servidor: si alguien pasaba a
// "Prueba", TODOS quedaban en prueba sin saberlo y lo que programaban se
// guardaba en la copia de pruebas. Ahora cada cuenta tiene su modo; cada
// petición usa el de quien la hace (server.js lo pone con AsyncLocalStorage).
// Lo que corre solo (correos, cierres automáticos) usa siempre el real.
// ============================================================
const MODOS = ['real', 'pruebas'];

const normalizar = (email) => String(email || '').trim().toLowerCase();

/** Modo de una cuenta (por defecto, real). */
function modoDeCuenta(mapa, email) {
    return mapa?.[normalizar(email)] === 'pruebas' ? 'pruebas' : 'real';
}

/** Devuelve un mapa nuevo con el modo de esa cuenta (solo se guardan las que están en prueba). */
function ponerModo(mapa, email, modo) {
    if (!MODOS.includes(modo)) throw new Error('El modo debe ser "real" o "pruebas".');
    const correo = normalizar(email);
    if (!correo) throw new Error('Falta la cuenta.');
    const nuevo = { ...(mapa || {}) };
    if (modo === 'pruebas') nuevo[correo] = 'pruebas';
    else delete nuevo[correo];
    return nuevo;
}

/** Lee el mapa guardado, descartando cualquier valor raro. */
function limpiarMapa(crudo) {
    const mapa = {};
    if (crudo && typeof crudo === 'object' && !Array.isArray(crudo)) {
        for (const [k, v] of Object.entries(crudo)) if (v === 'pruebas' && normalizar(k)) mapa[normalizar(k)] = 'pruebas';
    }
    return mapa;
}

module.exports = { MODOS, modoDeCuenta, ponerModo, limpiarMapa };
